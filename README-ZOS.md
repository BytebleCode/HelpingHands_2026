# Helping Hands on z/OS (Apache, EBCDIC)

This branch runs Helping Hands on Apache on z/OS as **plain static files**, with no Node.js
server. The server code from `main` is bundled into the page and runs in the browser, together with
its fake FIS core and the synthetic Jacksonville data, so the whole demo works, including the
moment simulator and the demo console.

**`index.html` is the entrance.** Pages are `index.html#/rewards`, `index.html#/give` and so on,
and every path is relative, so the site works from whatever folder Apache serves it from.

## Encoding

| Files | Encoding (in git and on z/OS) |
|---|---|
| Website: `index.html`, `assets/`, `data/` | **EBCDIC IBM-1047** |
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

## The demo

Everything in the README walkthrough on `main` works, with the same results each time:

- **Moment simulator** (Demo tab): *Likeliest moment* / *Best time here* put Maya at Greenleaf Grocer
  and pop a nudge with *Why?* reasons, *Activate offer* and *Use points*. Checking again shows no
  repeat (48-hour rule) and offers *Open it again*.
- **Demo console**: *Simulate purchase* posts a card purchase to the fake FIS core as a memo post
  and awards points when it's an essential with an active offer.
- **Rewards, giving, Neighbor Funds, volunteering, account linking and cash-out** all work. For
  example, Priya giving 1,000 points to Arlington reaches 10 households, and Maya's Home then shows
  *+100 points from the Arlington Neighbor Fund*.
- **Consistent everywhere**: every page reads from the same in-browser state, so balances,
  activity and FIS postings agree across Home, Rewards, Give, Account and Demo.

**Demo date.** The demo's "today" is fixed at **Monday, Oct 26, 2026**. On `main` the synthetic
community is regenerated to end on the real date, so incomes and neighborhood counts drift day to
day; on some days Arlington has too few lower-income households for the Neighbor Fund step. With
a fixed date, every demo shows the same data. To pick another date, rebuild with
`DEMO_DATE=YYYY-MM-DD` (see below).

**Saved per browser.** Demo activity is kept in each viewer's browser (`localStorage`), so it
survives reloads but isn't shared between people or devices. *Reset demo* in the demo console puts
everything back to the start. A private window always starts fresh.

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

The data files in `data/` work whether or not Apache converts JSON. Many setups only convert
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

## Rebuilding

On a workstation with Node.js, using a checkout of `main` (with `npm install` done) and a
checkout of this branch:

    sh tools/build.sh /path/to/main /tmp/hh-mainframe
    DEMO_DATE=2026-11-12 sh tools/build.sh /path/to/main /tmp/hh-mainframe   # another demo date

`build.sh` bundles `main`'s client and server together with the browser stand-ins in
`tools/browser/` (Express, `fs`, `url` and `crypto` shims, plus `server.js`, which loads the seed
data from `data/`). It switches the client to `#/` routes and relative paths and fixes the demo
date. Then `tools/export.mjs` writes the full branch tree to the output folder, encoded as above.
Copy that over this checkout and commit. The readable source of `zos-setup.sh` is in `tools/zos/`.
