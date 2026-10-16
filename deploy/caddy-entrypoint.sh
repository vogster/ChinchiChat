#!/bin/sh
# Picks where files and voice live, then starts Caddy (see the Caddyfile).
# Without FILES_DOMAIN / VOICE_DOMAIN they share CHINCHI_DOMAIN under /chinchi/ and /livekit/.
set -eu

: "${CHINCHI_DOMAIN:?set CHINCHI_DOMAIN}"
dir=/etc/caddy/generated
mkdir -p "$dir"
: >"$dir/app.caddy"
: >"$dir/sites.caddy"
: >"$dir/global.caddy"

# A proxy in front of Caddy (CDN, load balancer): only its X-Forwarded-For is believed, read
# right to left so the client cannot prepend an address of its own.
if [ -n "${TRUSTED_PROXIES:-}" ]; then
  case "$TRUSTED_PROXIES" in
    *[![:xdigit:].:/[:space:]]*) echo "TRUSTED_PROXIES must be space-separated IPs/CIDRs" >&2; exit 1 ;;
  esac
  # shellcheck disable=SC2086 -- the ranges are meant to be split on spaces
  printf '{\n\tservers {\n\t\ttrusted_proxies static %s\n\t\ttrusted_proxies_strict\n\t}\n}\n' \
    "$TRUSTED_PROXIES" >"$dir/global.caddy"
fi

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
