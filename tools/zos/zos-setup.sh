#!/bin/sh
# One-time setup after cloning or copying this branch to z/OS UNIX.
# The website files are already EBCDIC (IBM-1047); this tags them so z/OS tools know it.
# Usage: sh ./zos-setup.sh
cd "$(dirname "$0")" || exit 1

set -f
MEDIA="-name *.jpg -o -name *.jpeg -o -name *.png -o -name *.gif -o -name *.ico -o -name *.woff -o -name *.woff2 -o -name *.ttf"
READABLE="-name *.md -o -path ./tools/* -o -name .gitattributes -o -name .gitignore"
find . -type f \( $MEDIA \) ! -path './.git/*' -exec chtag -b {} +
find . -type f \( $READABLE \) ! -path './.git/*' -exec chtag -tc ISO8859-1 {} +
find . -type f ! \( $MEDIA -o $READABLE \) ! -path './.git/*' -exec chtag -tc IBM-1047 {} +
set +f

echo "Files tagged. Entrance: $(pwd)/index.html"
echo "Apache setup: see README-ZOS.md (or include apache/helping-hands.conf from httpd.conf)."
