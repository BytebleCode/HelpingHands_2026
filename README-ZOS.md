# Helping Hands on z/OS (Apache, EBCDIC)

This branch is a **static, read-only snapshot** of Helping Hands for Apache on z/OS. There's no
Node.js server. Every API response the app needs was captured from the real server on `main` and
saved as a JSON file under `api/`, so Apache serves the whole demo as plain files.

**`index.html` is the entrance.** Pages are `index.html#/rewards`, `index.html#/give` and so on,
and every path is relative, so the site works from whatever folder Apache serves it from.

## Encoding

| Files | Encoding (in git and on z/OS) |
|---|---|
| Website: `index.html`, `assets/`, `api/`, `manifest.webmanifest`, `icon.svg` | **EBCDIC IBM-1047** |
| `.htaccess`, `zos-setup.sh`, `apache/helping-hands.conf` | **EBCDIC IBM-1047** |
| Images and fonts | binary (unchanged) |
| `README.md`, `README-ZOS.md`, `.gitattributes`, `.gitignore`, `tools/` | readable ASCII/UTF-8 |

The EBCDIC files are committed already encoded, and `.gitattributes` marks them binary so git
never converts them. GitHub shows them as binary files. Characters IBM-1047 can't hold, like curly
quotes, dashes and arrows, are written as `\uXXXX` escapes (HTML entities in HTML), so the app
still shows the same text.

## What works

- Signing in as any of the five demo members, plus the `index.html?member=HH-XXXX-XXXX` deep link
- Every page: Home, Rewards, Give, Volunteer (all radius and cause filters), Account, and Demo,
  including the model views and the FIS API explorer for every sample account
- Each member's data as it looked right after sign-in when the snapshot was taken

## What doesn't

Nothing a member does is saved. Activating an offer, giving, volunteering, linking an account,
cashing out, pay-with-points, the purchase simulator, reset, and nudge checks all show
*"This demo is a read-only snapshot, so changes can't be saved."* Dates and balances are fixed
to the day of the snapshot.

## Install

Requires Apache httpd or IBM HTTP Server on z/OS, with `mod_charset_lite`.

1. Get the files onto z/OS: `git clone -b mainframe-version git@github.com:BytebleCode/HelpingHands_2026.git`,
   or copy the folder over in **binary** mode (sftp/scp binary, or tar). Never use ASCII/text
   transfer mode, because that would convert files that are already EBCDIC.
2. Tag the files: `sh ./zos-setup.sh`
3. Point Apache at the folder. Either:
   - **Inside an existing DocumentRoot:** load `mod_charset_lite` and allow `.htaccess` there
     (`AllowOverride FileInfo Indexes`). Then open `http://<host>/<folder>/`.
   - **Anywhere else:** add these lines to `httpd.conf`, restart Apache, and open
     `http://<host>/helping-hands/`.

         Define HH_ROOT /u/youruser/HelpingHands_2026
         Include /u/youruser/HelpingHands_2026/apache/helping-hands.conf

`.htaccess` converts text files from IBM-1047 to ISO8859-1 as Apache sends them, sends images
and fonts unchanged, and hides `tools/`, `apache/`, the READMEs and `.git`. If your Apache build
already converts tagged files on its own, remove the `CharsetSourceEnc` / `CharsetDefault` lines
from `.htaccess`, or text will be converted twice.

## Refreshing the snapshot

On a workstation with Node.js, using a checkout of `main` (with `npm install` done) and a
checkout of this branch:

    sh tools/build.sh /path/to/main /tmp/hh-mainframe

`build.sh` builds the client with `tools/freeze/api.js`, which reads snapshots instead of calling
the server, and switches it to `#/` routes and relative paths. It then runs `main`'s server in a
scratch copy and captures every read with `tools/freeze/capture.mjs`. Finally `tools/export.mjs`
writes the full branch tree, encoded as above, to the output folder. Copy that over this checkout
and commit. The readable sources of `.htaccess`, `zos-setup.sh` and the Apache config are in
`tools/zos/`.
