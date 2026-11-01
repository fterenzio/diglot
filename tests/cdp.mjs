// Pilota Chrome senza finestra per le prove automatiche: pagine, tastiera, caricamento di file, schermate.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9340 + Math.floor(Math.random() * 600), width = 1280, height = 800 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "diglot-test-"));
  const proc = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`, "--allow-file-access-from-files=false", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(150); }
  }
  async function open(url) {
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });
    let id = 0;
    const pending = {}, errors = [], logs = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending[m.id]) { pending[m.id](m.result || { error: m.error }); delete pending[m.id]; }
      if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("console.error: " + m.params.args.map((a) => a.value || a.description).join(" "));
      if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && !/favicon/.test(m.params.entry.url || "")) logs.push(m.params.entry.text + " " + (m.params.entry.url || ""));
    };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Runtime.enable"); await send("Page.enable"); await send("DOM.enable"); await send("Log.enable");
    const ev = async (expr) => {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result?.value;
    };
    return {
      ev, errors, logs, send, targetId: t.id,
      url: () => ev("location.href"),
      async key(key, code, vk, modifiers = 0) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, modifiers, text: key === "Enter" ? "\r" : key.length === 1 ? key : undefined });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers });
      },
      async setFiles(selector, files) {
        const doc = await send("DOM.getDocument", { depth: 0 });
        const q = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector });
        if (!q.nodeId) throw new Error("input non trovato: " + selector);
        await send("DOM.setFileInputFiles", { nodeId: q.nodeId, files });
      },
      async shot(file) { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(file, Buffer.from(r.data, "base64")); },
      async size(width, height, mobile = false) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }); },
      async dark(on) { await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: on ? "dark" : "light" }] }); },
      async click(selector) { const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:"center"});const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]})()`); if (!r) throw new Error("elemento non trovato: " + selector); for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: r[0], y: r[1], button: "left", clickCount: 1 }); },
      close() { try { ws.close(); } catch {} return fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {}); },
    };
  }
  return {
    open, sleep,
    async stop() {
      const gone = new Promise((r) => proc.once("exit", r));
      proc.kill();
      await Promise.race([gone, sleep(3000)]);
      rmSync(profile, { recursive: true, force: true });
    },
  };
}
