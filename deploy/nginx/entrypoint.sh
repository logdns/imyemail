#!/bin/sh
set -eu

: "${IMYEMAIL_PUBLIC_HOSTNAME:=mail.example.com}"
certificate_dir=/certificates
certificate_file="$certificate_dir/fullchain.pem"
certificate_key="$certificate_dir/privkey.pem"
mkdir -p "$certificate_dir"

if [ ! -s "$certificate_file" ] || [ ! -s "$certificate_key" ]; then
  echo "info: generating temporary self-signed certificate for $IMYEMAIL_PUBLIC_HOSTNAME" >&2
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 30 \
    -subj "/CN=${IMYEMAIL_PUBLIC_HOSTNAME}" \
    -addext "subjectAltName=DNS:${IMYEMAIL_PUBLIC_HOSTNAME}" \
    -keyout "$certificate_key" -out "$certificate_file" >/dev/null 2>&1
  chmod 600 "$certificate_key"
  chmod 644 "$certificate_file"
fi

if [ "${1:-}" = "bootstrap-only" ]; then
  exit 0
fi

watch_certificates() {
  last="$(sha256sum "$certificate_file" "$certificate_key" | sha256sum | cut -d' ' -f1)"
  while :; do
    sleep 15
    current="$(sha256sum "$certificate_file" "$certificate_key" | sha256sum | cut -d' ' -f1)"
    if [ "$current" != "$last" ]; then
      echo "certificate files changed; reloading nginx"
      nginx -t && nginx -s reload
      last="$current"
    fi
  done
}

watch_certificates &
exec "$@"
