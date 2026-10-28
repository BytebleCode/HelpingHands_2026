#!/bin/sh
# Rebuilds this branch from a checkout of main, on a workstation with Node.js (run `npm install`
# in main first):
#   1. builds the client for static hosting: frozen api.js (reads JSON snapshots), #/ routes and
#      relative paths, so index.html is the entrance from any folder
#   2. runs main's real server in a scratch copy and captures every read into the build
#   3. writes the branch tree to <outDir>, with everything z/OS reads in EBCDIC (IBM-1047)
# Usage: sh tools/build.sh <mainCheckout> <outDir>       (run from a checkout of this branch)
set -e
MAIN=$(cd "$1" && pwd); OUT=$2; HERE=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d); PID=
trap '[ -n "$PID" ] && kill $PID 2>/dev/null && wait $PID 2>/dev/null; rm -rf "$WORK"' EXIT
PORT=${CAPTURE_PORT:-4399}

git -C "$MAIN" archive HEAD | tar -x -C "$WORK"
ln -s "$MAIN/node_modules" "$WORK/node_modules"
for d in client server; do [ -d "$MAIN/$d/node_modules" ] && ln -s "$MAIN/$d/node_modules" "$WORK/$d/node_modules"; done
cp "$HERE/tools/freeze/api.js" "$HERE/tools/freeze/frozenPath.js" "$WORK/client/src/lib/"

# patch <file> <from> <to>: replaces every occurrence, and fails if main no longer has <from>.
patch() {
  grep -qF -- "$2" "$WORK/$1" || { echo "build.sh: '$2' not found in $1; update the patch" >&2; exit 1; }
  node -e 'const fs=require("fs"),[f,a,b]=process.argv.slice(1);fs.writeFileSync(f,fs.readFileSync(f,"utf8").split(a).join(b))' "$WORK/$1" "$2" "$3"
}
patch client/src/main.jsx BrowserRouter HashRouter
patch client/src/components/ui.jsx '`/images/' '`images/'
patch client/public/manifest.webmanifest '"start_url": "/"' '"start_url": "./index.html"'
patch client/public/manifest.webmanifest '"src": "/' '"src": "'

(cd "$WORK/client" && npx vite build --base ./ --logLevel warn)
(cd "$WORK/server" && PORT=$PORT exec node src/index.js > "$WORK/server.log" 2>&1) & PID=$!
until curl -sf "http://localhost:$PORT/api/health" > /dev/null; do sleep 1; done
node "$HERE/tools/freeze/capture.mjs" "http://localhost:$PORT" "$WORK/client/dist"

rm -rf "$OUT"
node "$HERE/tools/export.mjs" "$MAIN" "$WORK/client/dist" "$HERE" "$OUT"
