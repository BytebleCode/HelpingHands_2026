#!/bin/sh
# Starts the API, fake FIS core and prebuilt web app on port 4000 (override with PORT=...).
cd "$(dirname "$0")" || exit 1
. ./zos-env.sh
exec node server/src/index.js
