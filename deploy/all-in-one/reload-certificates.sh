#!/bin/sh
set -eu

: "${IMYEMAIL_TLS_CERT_FILE:=/data/certificates/fullchain.pem}"
: "${IMYEMAIL_TLS_KEY_FILE:=/data/certificates/privkey.pem}"

last=""
while :; do
  if [ -s "$IMYEMAIL_TLS_CERT_FILE" ] && [ -s "$IMYEMAIL_TLS_KEY_FILE" ]; then
    current="$(sha256sum "$IMYEMAIL_TLS_CERT_FILE" "$IMYEMAIL_TLS_KEY_FILE" | sha256sum | cut -d' ' -f1)"
    if [ -n "$last" ] && [ "$current" != "$last" ]; then
      echo "certificate files changed; reloading nginx, Postfix, and Dovecot"
      nginx -t && nginx -s reload
      postfix reload
      doveadm reload
    fi
    last="$current"
  fi
  sleep 15
done
