#!/bin/sh
# Rebuilds this branch from a checkout of main, on a workstation with Node.js (run `npm install`
# in main first):
#   1. builds the client with main's server bundled in (tools/browser), so the whole app runs in
#      the browser from static files: #/ routes and relative paths make index.html the entrance
#   2. ships the seed data the server reads in data/
#   3. writes the branch tree to <outDir>, with everything z/OS reads in EBCDIC (IBM-1047)
# Usage: sh tools/build.sh <mainCheckout> <outDir>       (run from a checkout of this branch)
#        DEMO_DATE=2026-11-12 sh tools/build.sh ...       (pick another demo "today")
set -e
MAIN=$(cd "$1" && pwd); OUT=$2; HERE=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
SEEDS="catalog.json income-model.json identities.json fis-core.json intent-model.json"
# The demo's "today". main regenerates the synthetic community to end on the real date, so incomes
# and neighborhood counts drift day to day (on some days Arlington has too few lower-income
# households to receive a Neighbor Fund gift). A fixed date makes every demo show the same data;
# on 2026-10-26 the README walkthrough holds exactly (Arlington: 10 households, Maya among them).
DEMO_DATE=${DEMO_DATE:-2026-10-26}

git -C "$MAIN" archive HEAD | tar -x -C "$WORK"
ln -s "$MAIN/node_modules" "$WORK/node_modules"
for d in client server; do [ -d "$MAIN/$d/node_modules" ] && ln -s "$MAIN/$d/node_modules" "$WORK/$d/node_modules"; done
mkdir "$WORK/client/src/browser"
cp -R "$HERE/tools/browser/shims" "$HERE/tools/browser/server.js" "$HERE/tools/browser/app.js" "$HERE/tools/browser/ebcdic.js" "$WORK/client/src/browser/"
cp "$HERE/tools/browser/api.js" "$WORK/client/src/lib/api.js"
cp "$HERE/tools/browser/vite.config.js" "$WORK/client/vite.browser.config.js"

# patch <file> <from> <to>: replaces every occurrence, and fails if main no longer has <from>.
patch() {
  grep -qF -- "$2" "$WORK/$1" || { echo "build.sh: '$2' not found in $1; update the patch" >&2; exit 1; }
  node -e 'const fs=require("fs"),[f,a,b]=process.argv.slice(1);fs.writeFileSync(f,fs.readFileSync(f,"utf8").split(a).join(b))' "$WORK/$1" "$2" "$3"
}
patch client/src/main.jsx BrowserRouter HashRouter
patch client/src/components/ui.jsx '`/images/' '`images/'
# Apache on z/OS sends .webmanifest and .svg as raw EBCDIC, which browsers reject, so this build
# drops the PWA manifest (iPhone home-screen install uses the apple-touch-icon tags) and uses the
# PNG icon as the favicon.
patch client/index.html '    <link rel="manifest" href="/manifest.webmanifest" />
' ''
patch client/index.html '<link rel="icon" type="image/svg+xml" href="/icon.svg" />' '<link rel="icon" type="image/png" href="/icon-192.png" />'
patch server/src/lib/dates.js 'export function todayDay() {' 'export function todayDay() {
  if (typeof __HH_TODAY__ === "string") return toDay(__HH_TODAY__);'
# The FIS client's HTTP call goes to the in-browser FIS router (set up in browser/server.js).
patch server/src/lib/fisClient.js 'const res = await fetch(' 'const res = await (globalThis.hhFisFetch || fetch)('

export HH_TODAY=$DEMO_DATE
export HH_BUILD=$( (cd "$WORK/server/data/seed" && cat $SEEDS; echo "$DEMO_DATE") | sha1sum | cut -c1-10)
(cd "$WORK/client" && npx vite build --config vite.browser.config.js --logLevel warn)
rm "$WORK/client/dist/manifest.webmanifest" "$WORK/client/dist/icon.svg"
mkdir "$WORK/client/dist/data"
for f in $SEEDS; do cp "$WORK/server/data/seed/$f" "$WORK/client/dist/data/"; done
echo "Built for demo date $DEMO_DATE; demo state is saved under localStorage key hh.state.$HH_BUILD.*"

rm -rf "$OUT"
node "$HERE/tools/export.mjs" "$MAIN" "$WORK/client/dist" "$HERE" "$OUT"
