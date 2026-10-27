# Helping Hands on z/OS (EBCDIC)

This branch packages Helping Hands to run under z/OS UNIX System Services in **IBM-1047** (EBCDIC).
Files are stored in git as plain text so they stay readable on GitHub. Git on z/OS converts them to
IBM-1047 when you check them out, using the rules in `.gitattributes`.

## Requirements

- z/OS UNIX System Services
- IBM Open Enterprise SDK for Node.js 18 or newer (`node` and `npm` on PATH)
- Git from [zopen](https://zopen.community) (z/OS Open Tools), which supports `zos-working-tree-encoding`
- Network access to the npm registry for `npm install` (installs Express only)

## Install

    git clone -b mainframe-version git@github.com:BytebleCode/HelpingHands_2026.git
    cd HelpingHands_2026
    sh ./zos-setup.sh     # tags files (chtag) and runs npm install
    ./run.sh              # or: PORT=8080 ./run.sh

Open `http://<host>:4000` and pick a demo member.

Other commands work after `. ./zos-env.sh`: `npm test`, `npm run seed`, `npm run reset`.

**Without zopen git:** download the branch elsewhere, convert each text file with
`iconv -f ISO8859-1 -t IBM-1047`, but leave the images, fonts and `.md` files unchanged. Then
transfer the folder in binary mode and run `zos-setup.sh`.

## Encoding rules

| Files | In git / on GitHub | On z/OS after checkout |
|---|---|---|
| Code, JSON, CSS, HTML, scripts | ASCII | IBM-1047, tagged |
| Markdown (`*.md`) | UTF-8 | UTF-8, tagged (not converted) |
| Images, fonts | binary | binary, tagged `-b` |

`zos-env.sh` sets `_BPXK_AUTOCVT=ON` and `FILETAG(AUTOCVT,AUTOTAG)`. Node.js then reads
IBM-1047 files through automatic conversion, and the files it writes in `server/data/runtime/` are
tagged as it writes them.

## Changes from `main`

- The React client is **prebuilt** in `client/dist`. Vite and esbuild have no z/OS build, so
  `client/src` is left out. Rebuild on `main` (`npm run build`) and re-export to change the UI.
- IBM-1047 can't hold characters like curly quotes, dashes and arrows. In code they're written as
  `\uXXXX` escapes (HTML entities in HTML), so the app shows the same text.
