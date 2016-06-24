#!/bin/bash

set -e

DIR="$(dirname "$0")"
CONFIG="$DIR/config"
CONFIG_TEMPLATE="$CONFIG.template"
RUN="$DIR/run.sh"

cd "$(dirname "$0")"

# Install config file if needed
[ -f "$CONFIG" ] || cp "$CONFIG_TEMPLATE" "$CONFIG"

# npm install if needed
[ -d "$DIR"/node_modules ] || (cd "$DIR" && npm install)

# Halt if we need TWITTER_CONSUMER_KEY or TWITTER_CONSUMER_SECRET
if $(grep -q 'please-edit-me' "$CONFIG"); then
  echo "Please set TWITTER_CONSUMER_KEY and TWITTER_CONSUMER_SECRET in '$CONFIG'" >&2
  echo 'Then re-run this program' >&2
  echo >&2
  echo '(Ask @adamhooper for the secrets.)' >&2
  exit 1
fi

if $(grep -q 'run-to-set-these' "$CONFIG"); then
  tempfile="$(mktemp)"
  grep -v '^TWITTER_TOKEN' "$CONFIG" > "$tempfile"
  env $(cat "$CONFIG" | grep -v '^#' | xargs) "$DIR"/oauth-login.js >> "$tempfile"
  mv "$tempfile" "$CONFIG"
fi

"$DIR"/main.js "$@"
