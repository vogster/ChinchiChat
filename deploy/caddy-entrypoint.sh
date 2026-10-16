#!/bin/sh
# Picks where files and voice live, then starts Caddy (see the Caddyfile).
# Without FILES_DOMAIN / VOICE_DOMAIN they share CHINCHI_DOMAIN under /chinchi/ and /livekit/.
set -eu

: "${CHINCHI_DOMAIN:?set CHINCHI_DOMAIN}"
dir=/etc/caddy/generated
mkdir -p "$dir"
: >"$dir/app.caddy"
: >"$dir/sites.caddy"

if [ -n "${FILES_DOMAIN:-}" ]; then
  printf '%s {\n\timport files\n}\n' "$FILES_DOMAIN" >>"$dir/sites.caddy"
  export FILES_ORIGIN="https://$FILES_DOMAIN"
else
  # The bucket's name: path-style presigned URLs start with it.
  printf 'handle /chinchi/* {\n\timport files\n}\n' >>"$dir/app.caddy"
  export FILES_ORIGIN=""
fi

if [ -n "${VOICE_DOMAIN:-}" ]; then
  printf '%s {\n\timport voice\n}\n' "$VOICE_DOMAIN" >>"$dir/sites.caddy"
  export VOICE_ORIGIN="wss://$VOICE_DOMAIN https://$VOICE_DOMAIN"
else
  # LiveKit's client appends /rtc to the URL's path: strip the prefix on the way in.
  printf 'handle_path /livekit/* {\n\timport voice\n}\n' >>"$dir/app.caddy"
  export VOICE_ORIGIN=""
fi

exec "$@"
