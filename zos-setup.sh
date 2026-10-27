#!/bin/sh
# One-time setup after cloning this branch with z/OS git (zopen), which converts and tags
# text files as IBM-1047 on checkout. This re-applies the tags in case the files arrived
# another way, then installs dependencies.
cd "$(dirname "$0")" || exit 1

MEDIA="-name *.jpg -o -name *.jpeg -o -name *.png -o -name *.gif -o -name *.ico -o -name *.woff -o -name *.woff2 -o -name *.ttf"
SKIP="! -path ./.git/* ! -path ./server/node_modules/* ! -path ./server/data/runtime/*"
set -f
find . -type f \( $MEDIA \) $SKIP -exec chtag -b {} +
find . -type f -name '*.md' $SKIP -exec chtag -tc UTF-8 {} +
find . -type f ! \( $MEDIA -o -name '*.md' \) $SKIP -exec chtag -tc IBM-1047 {} +
set +f
chmod +x zos-setup.sh run.sh

. ./zos-env.sh
npm install || exit 1
echo "Setup done. Start the app with ./run.sh"
