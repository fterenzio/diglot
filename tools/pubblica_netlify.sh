#!/bin/sh
# Pubblica Diglot.html come pagina iniziale del sito. Richiede netlify-cli con accesso già fatto («netlify login»).
# Il sito contiene solo il programma: conferenze, testi e slide restano nel browser di chi lo usa.
SITE="${1:?indica il codice del sito Netlify}"
cd "$(dirname "$0")/.." || exit 1
node tools/build.mjs || exit 1
DIR="$(mktemp -d)"
cp Diglot.html "$DIR/index.html"
cd "$DIR" || exit 1
netlify deploy --site "$SITE" --dir . --prod --message "Diglot $(date '+%d/%m %H:%M')"
STATUS=$?
cd / && rm -rf "$DIR"
exit "$STATUS"
