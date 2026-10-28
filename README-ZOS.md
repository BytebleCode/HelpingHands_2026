# Helping Hands on z/OS (Apache, EBCDIC)

This branch is a **static, read-only snapshot** of Helping Hands for Apache on z/OS. There's no
Node.js server. Every API response the app needs was captured from the real server on `main` and
saved as a JSON file under `client/dist/api/`, so Apache serves the whole demo as plain files.

Files are stored in git as plain text, so they stay readable on GitHub. Git on z/OS converts
them to IBM-1047 (EBCDIC) on checkout, using the rules in `.gitattributes`.

## What works

- Signing in as any of the five demo members, plus the `/?member=HH-XXXX-XXXX` deep link
- Every page: Home, Rewards, Give, Volunteer (all radius and cause filters), Account, and Demo,
  including the model views and the FIS API explorer for every sample account
- Each member's data as it looked right after sign-in when the snapshot was taken

## What doesn't

Nothing a member does is saved. Activating an offer, giving, volunteering, linking an account,
cashing out, pay-with-points, the purchase simulator, reset, and nudge checks all show
*"This demo is a read-only snapshot, so changes can't be saved."* Dates and balances are fixed
to the day of the snapshot.

## Requirements

- Apache httpd or IBM HTTP Server on z/OS, with `mod_charset_lite` and `mod_headers`
- Git from [zopen](https://zopen.community) (z/OS Open Tools), which supports `zos-working-tree-encoding`

## Install

    git clone -b mainframe-version git@github.com:BytebleCode/HelpingHands_2026.git
    cd HelpingHands_2026
    sh ./zos-setup.sh     # tags files with chtag: IBM-1047 text, UTF-8 Markdown, binary media

Then add this to `httpd.conf` and restart Apache:

    Define HH_ROOT /u/youruser/HelpingHands_2026/client/dist
    Include /u/youruser/HelpingHands_2026/apache/helping-hands.conf

Open `http://<host>:8080` and pick a demo member. To use another port, edit `Listen` and
`<VirtualHost>` in `apache/helping-hands.conf`. The site has to be at the root of its host,
because it requests `/assets/`, `/images/` and `/api/`.

`apache/helping-hands.conf` converts text files from IBM-1047 to ISO8859-1 as Apache sends them,
and sends images and fonts unchanged. If your Apache build already converts tagged files, remove
the `CharsetSourceEnc` / `CharsetDefault` lines, or text will be converted twice.

**Without zopen git:** download the branch elsewhere, convert each text file with
`iconv -f ISO8859-1 -t IBM-1047`, but leave the images, fonts and `.md` files unchanged. Then
transfer the folder in binary mode and run `zos-setup.sh`.

## Refreshing the snapshot

On a workstation with Node.js, using a checkout of `main` (with `npm install` done) and a
checkout of this branch:

    sh tools/build.sh /path/to/main /tmp/hh-mainframe

`build.sh` builds the client with `tools/freeze/api.js`, which reads snapshots instead of calling
the server. It then runs `main`'s server in a scratch copy, captures every read with
`tools/freeze/capture.mjs`, and writes the full branch tree to the output folder. Copy that over
this checkout and commit.

| Files | In git / on GitHub | On z/OS after checkout |
|---|---|---|
| HTML, JS, CSS, JSON, scripts | ASCII | IBM-1047, tagged |
| Markdown (`*.md`) | UTF-8 | UTF-8, tagged (not converted) |
| Images, fonts | binary | binary, tagged `-b` |

Characters IBM-1047 can't hold, like curly quotes, dashes and arrows, are written as `\uXXXX`
escapes (HTML entities in HTML), so the app still shows the same text.
