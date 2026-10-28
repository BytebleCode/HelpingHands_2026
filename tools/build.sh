#!/bin/sh
# Rebuilds this branch's contents from a checkout of main, on a workstation with Node.js:
#   1. builds the client with the frozen api.js (reads JSON snapshots instead of calling a server)
#   2. runs the real server from main in a scratch copy and captures every read into the build
#   3. writes the site plus this branch's files to <outDir>
# Usage: sh tools/build.sh <mainCheckout> <outDir>       (run from a checkout of this branch)
set -e
MAIN=$(cd "$1" && pwd); OUT=$2; HERE=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d); trap 'kill $PID 2>/dev/null; rm -rf "$WORK"' EXIT
PORT=${CAPTURE_PORT:-4399}

git -C "$MAIN" archive HEAD | tar -x -C "$WORK"
ln -s "$MAIN/node_modules" "$WORK/node_modules"
[ -d "$MAIN/client/node_modules" ] && ln -s "$MAIN/client/node_modules" "$WORK/client/node_modules"
[ -d "$MAIN/server/node_modules" ] && ln -s "$MAIN/server/node_modules" "$WORK/server/node_modules"
cp "$HERE/tools/freeze/api.js" "$HERE/tools/freeze/frozenPath.js" "$WORK/client/src/lib/"

(cd "$WORK/client" && npx vite build --logLevel warn)
(cd "$WORK/server" && PORT=$PORT exec node src/index.js > "$WORK/server.log" 2>&1) & PID=$!
until curl -sf "http://localhost:$PORT/api/health" > /dev/null; do sleep 1; done
node "$HERE/tools/freeze/capture.mjs" "http://localhost:$PORT" "$WORK/client/dist"

rm -rf "$OUT"
BRANCH_FILES="$WORK/branch"; mkdir "$BRANCH_FILES"
(cd "$HERE" && git ls-files | grep -vE '^(README\.md|client/dist/)' | tar -cf - -T -) | tar -x -C "$BRANCH_FILES"
node "$HERE/tools/export.mjs" "$MAIN" "$WORK/client/dist" "$BRANCH_FILES" "$OUT"
