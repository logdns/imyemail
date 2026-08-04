#!/bin/sh
set -eu

: "${IMYEMAIL_DB_PATH:=/data/imyemail.db}"
: "${IMYEMAIL_RSPAMD_DKIM_DIR:=/var/lib/rspamd/dkim}"
: "${IMYEMAIL_RSPAMD_DKIM_SYNC_SECONDS:=60}"

chown_dkim_dir() {
  if id _rspamd >/dev/null 2>&1; then
    chown -R _rspamd:_rspamd "$IMYEMAIL_RSPAMD_DKIM_DIR" 2>/dev/null || true
  elif id rspamd >/dev/null 2>&1; then
    chown -R rspamd:rspamd "$IMYEMAIL_RSPAMD_DKIM_DIR" 2>/dev/null || true
  fi
}

sync_keys() {
  mkdir -p "$IMYEMAIL_RSPAMD_DKIM_DIR"
  if [ ! -f "$IMYEMAIL_DB_PATH" ]; then
    chown_dkim_dir
    return 0
  fi

  sqlite3 -separator '|' "$IMYEMAIL_DB_PATH" "SELECT name, dkim_selector, dkim_private_key FROM domains WHERE status='active';" 2>/dev/null | while IFS='|' read -r domain selector private_key; do
    [ -n "$domain" ] || continue
    [ -n "$selector" ] || selector="imyemail"
    keyfile="$IMYEMAIL_RSPAMD_DKIM_DIR/${domain}.${selector}.key"
    tmpfile="${keyfile}.tmp"
    printf '%s' "$private_key" | base64 -d > "$tmpfile"
    chmod 0640 "$tmpfile"
    mv "$tmpfile" "$keyfile"
  done

  chown_dkim_dir
}

if [ "${1:-}" = "--once" ]; then
  sync_keys
  exit 0
fi

while true; do
  sync_keys || true
  sleep "$IMYEMAIL_RSPAMD_DKIM_SYNC_SECONDS"
done
