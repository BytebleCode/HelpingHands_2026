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
| `zos-setup.sh` | **EBCDIC IBM-1047** |
| Images and fonts | binary (unchanged) |
| `README.md`, `README-ZOS.md`, `.gitattributes`, `.gitignore`, `tools/` | readable ASCII/UTF-8 |

Line breaks use z/OS's EBCDIC newline (NL, `0x15`), which z/OS converts to an ASCII line feed.
Linux's `iconv` writes `0x25` instead, which z/OS turns into byte `0x85` and breaks the JavaScript,
so don't re-encode these files with `iconv` on Linux. Use `tools/build.sh`, which handles this.

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

This assumes Apache on z/OS is already set up the usual way: it serves `index.html` for a folder
and converts EBCDIC text files to ASCII for browsers, as it does for your other sites. No Apache
configuration is needed for this site.

1. Put the folder where Apache serves files, for example `<DocumentRoot>/helping-hands`:
   `git clone -b mainframe-version https://github.com/BytebleCode/HelpingHands_2026.git helping-hands`,
   or copy the folder there in **binary** mode (sftp/scp binary, or tar). Never use ASCII/text
   transfer mode, because that would convert files that are already EBCDIC.
2. Tag the files: `sh ./zos-setup.sh` (IBM-1047 text, binary images and fonts)
3. Open `http://<host>:<port>/helping-hands/` and pick a demo member. Apache serves `index.html`.

The data files in `api/` work whether or not Apache converts JSON. Many setups only convert
`text/*` types, so the app reads each file's raw bytes and decodes EBCDIC itself when needed.
HTML, CSS and JavaScript rely on Apache's normal conversion.

**If pages come up blank or garbled**, Apache isn't converting those files. With `mod_charset_lite`,
add this for the folder in `httpd.conf`. It converts `text/*` files only, so images and fonts go
out unchanged, and the `AddType` line makes sure JavaScript counts as text:

    <Directory "/path/to/helping-hands">
        CharsetSourceEnc IBM-1047
        CharsetDefault ISO8859-1
        AddType text/javascript .js
    </Directory>

## Refreshing the snapshot

On a workstation with Node.js, using a checkout of `main` (with `npm install` done) and a
checkout of this branch:

    sh tools/build.sh /path/to/main /tmp/hh-mainframe

`build.sh` builds the client with `tools/freeze/api.js`, which reads snapshots instead of calling
the server, and switches it to `#/` routes and relative paths. It then runs `main`'s server in a
scratch copy and captures every read with `tools/freeze/capture.mjs`. Finally `tools/export.mjs`
writes the full branch tree, encoded as above, to the output folder. Copy that over this checkout
and commit. The readable source of `zos-setup.sh` is in `tools/zos/`.
