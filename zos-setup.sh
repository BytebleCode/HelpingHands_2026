#!/bin/sh
# One-time setup after cloning this branch with z/OS git (zopen), which converts and tags
# text files as IBM-1047 on checkout. This re-applies the tags in case the files arrived
# another way. No Node.js or npm is needed: Apache serves client/dist as static files.
cd "$(dirname "$0")" || exit 1

MEDIA="-name *.jpg -o -name *.jpeg -o -name *.png -o -name *.gif -o -name *.ico -o -name *.woff -o -name *.woff2 -o -name *.ttf"
set -f
find . -type f \( $MEDIA \) ! -path ./.git/* -exec chtag -b {} +
find . -type f -name '*.md' ! -path ./.git/* -exec chtag -tc UTF-8 {} +
find . -type f ! \( $MEDIA -o -name '*.md' \) ! -path ./.git/* -exec chtag -tc IBM-1047 {} +
set +f
chmod +x zos-setup.sh
echo "Files tagged. Point Apache at $(pwd)/client/dist using apache/helping-hands.conf"
