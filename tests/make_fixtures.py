# Rigenera i documenti di prova in tests/fixtures: testi inventati, nessun materiale reale.
# Richiede pandoc, Google Chrome e python-pptx (uso: python3 make_fixtures.py).
import json, pathlib, subprocess, zipfile
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from PIL import Image

F = pathlib.Path(__file__).parent / "fixtures"
F.mkdir(exist_ok=True)
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

de = [
    "Die Brücke beginnt mit einer einfachen Frage nach dem Fluss und seinen Ufern. Was sich dort zeigt, ist niemals nur ein Bauwerk aus Stein. Es gehört zu einer Landschaft, die sich ständig verändert.",
    "Die Baumeister nannten diese Bewegung einen Übergang. Sie geht über das Wasser hinaus, ohne es zu berühren, und fragt nach dem Raum, in dem die Wege zusammenkommen.",
    "Im Jahr 1913 beschrieb der Ingenieur Rossi die Pfeiler als Feld der Berechnung. Seine Schüler widersprachen ihm nicht direkt, aber sie verschoben die Frage: Nicht der Stein, sondern der Fluss ist das Thema der Baukunst.",
    "Das Spiel des Wassers ist das Zeichen dieser Landschaft. In jeder Welle spiegelt sich die Bewegung des Stromes, die weder Anfang noch Ende kennt.",
    "Damit endet der erste Teil. Im zweiten Teil werden wir sehen, wie sich dieser Gedanke zur Geschichte der Stadt verhält.",
]
it = [
    "Il ponte comincia con una semplice domanda sul fiume e sulle sue rive. Ciò che lì si mostra non è mai soltanto un manufatto di pietra. Appartiene a un paesaggio che cambia di continuo.",
    "I costruttori chiamarono questo movimento un passaggio. Esso va oltre l'acqua senza toccarla, e domanda dello spazio in cui le strade si incontrano.",
    "Nel 1913 l'ingegnere Rossi descrisse i piloni come campo del calcolo. I suoi allievi non lo contraddissero direttamente, ma spostarono la domanda: non la pietra, bensì il fiume è il tema dell'arte del costruire.",
    "Il gioco dell'acqua è il segno di questo paesaggio. In ogni onda si rispecchia il movimento della corrente, che non conosce né inizio né fine.",
    "Con ciò termina la prima parte. Nella seconda parte vedremo come questo pensiero si rapporti alla storia della città.",
]

def pandoc(name, text, source="markdown"):
    src = F / (name + ".src")
    src.write_text(text, encoding="utf-8")
    subprocess.run(["pandoc", "-f", source, str(src), "-o", str(F / (name + ".docx"))], check=True)
    src.unlink()

pandoc("alternati", "## 1. Brücke und Fluss\n\n## 1. Ponte e fiume\n\n" + "\n\n".join(f"{a}\n\n{b}" for a, b in zip(de, it)))
pandoc("tabella", "<table>" + "".join(f"<tr><td>{a}</td><td>{b}</td></tr>" for a, b in zip(de, it)) + "</table>", "html")
pandoc("sequenza", "\n\n".join(de + it))
pandoc("cue", "\n\n".join(f"[Folie {i + 1}] {a}" for i, a in enumerate(de)))
pandoc("grassetto", "# Titel der Rede\n\nName der Rednerin\n\n" + "\n\n".join(f"**({i + 1})** {a}" for i, a in enumerate(de)))
pandoc("frasi", "\n\n".join(" ".join(x + " " + y for x, y in zip(a.split(". "), b.split(". "))) for a, b in zip(de, it)))
pandoc("a_capo", "\n\n".join(f"{a}\\\n{b}" for a, b in zip(de, it)))
pandoc("solo_de", "\n\n".join(de))
pandoc("solo_it", "\n\n".join(it))
(F / "testo.txt").write_text("\n\n".join(it), encoding="utf-8")
(F / "vecchio.json").write_text('{"segs":[{"o":"Hallo Welt.","t":"Ciao mondo.","p":0},{"o":"Zweiter Satz.","t":"Seconda frase.","p":1,"h":1}]}', encoding="utf-8")

css = "<style>@page{size:A4;margin:20mm}body{font:12pt Georgia;line-height:1.35}.r{display:grid;grid-template-columns:1fr 1fr;column-gap:14mm;margin-bottom:10pt}</style>"
html = F / "c.html"
html.write_text("<!doctype html><meta charset=utf-8>" + css + "".join(f"<div class=r><div>{a}</div><div>{b}</div></div>" for a, b in zip(de * 2, it * 2)), encoding="utf-8")
subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={F / 'colonne.pdf'}", "file://" + str(html)], capture_output=True)
html.write_text("<!doctype html><meta charset=utf-8><style>@page{size:A5 landscape;margin:0}section{box-sizing:border-box;height:138mm;break-after:page;font:40pt Helvetica;padding:30mm}section:last-child{break-after:auto}</style><section>Slide uno</section><section>Slide due</section><section>Slide tre</section>", encoding="utf-8")
subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={F / 'slide.pdf'}", "file://" + str(html)], capture_output=True)
html.unlink()

with zipfile.ZipFile(F / "vecchio.leggio", "w") as z:
    z.writestr("conference.json", json.dumps({"format": "leggio.conference", "version": 1, "id": "c1", "title": {"it": "Conferenza dal primo formato"}, "languages": ["it", "de"], "days": []}))
    z.writestr("media.json", "{}")
with zipfile.ZipFile(F / "vecchio.conferenza", "w") as z:
    z.writestr("conference.json", json.dumps({"format": "conferenze.conference", "version": 1, "id": "c2", "title": {"it": "Conferenza dal secondo formato"}, "languages": ["it", "de"], "days": []}))
    z.writestr("media.json", "{}")

Image.new("RGB", (640, 360), (40, 90, 140)).save(F / "immagine.png")
p = Presentation()
p.slide_width, p.slide_height = Inches(13.333), Inches(7.5)
s = p.slides.add_slide(p.slide_layouts[0]); s.shapes.title.text = "Titolo della presentazione"; s.placeholders[1].text = "Sottotitolo"
s = p.slides.add_slide(p.slide_layouts[1]); s.shapes.title.text = "Elenco puntato"; tf = s.placeholders[1].text_frame; tf.text = "Primo punto"
for t, l in [("Secondo livello", 1), ("Torna al primo", 0)]:
    q = tf.add_paragraph(); q.text = t; q.level = l
s = p.slides.add_slide(p.slide_layouts[5]); s.shapes.title.text = "Forme e immagine"
a = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1), Inches(2), Inches(3), Inches(1.5)); a.fill.solid(); a.fill.fore_color.rgb = RGBColor(200, 60, 60); a.text_frame.text = "Forma con testo"
s.shapes.add_picture(str(F / "immagine.png"), Inches(1), Inches(4.2), width=Inches(4))
g = s.shapes.add_group_shape(); g.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(7), Inches(4.5), Inches(1.5), Inches(1))
s = p.slides.add_slide(p.slide_layouts[5]); s.shapes.title.text = "Tabella"
tb = s.shapes.add_table(2, 2, Inches(1), Inches(2), Inches(10), Inches(2)).table
tb.cell(0, 0).text = "Cella"
s = p.slides.add_slide(p.slide_layouts[5]); s.shapes.title.text = "Grafico"
cd = CategoryChartData(); cd.categories = ["A", "B"]; cd.add_series("S", (1, 2))
s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(2), Inches(2), Inches(8), Inches(4), cd)
p.save(F / "slide.pptx")
