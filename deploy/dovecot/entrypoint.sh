#!/bin/sh
set -eu
: "${IMYEMAIL_TLS_CERT_FILE:=}"
: "${IMYEMAIL_TLS_KEY_FILE:=}"
: "${IMYEMAIL_AUTH_POLICY_URL:=http://api:8080/auth-policy}"
addgroup --system --gid 5000 vmail 2>/dev/null || true
adduser --system --uid 5000 --gid 5000 --home /var/mail/vhosts --no-create-home vmail 2>/dev/null || true
mkdir -p /data /var/mail/vhosts
chown -R 5000:5000 /var/mail/vhosts
AUTH_POLICY_NONCE_FILE="${IMYEMAIL_AUTH_POLICY_NONCE_FILE:-/data/dovecot-auth-policy-nonce}"
mkdir -p "$(dirname "$AUTH_POLICY_NONCE_FILE")"
if [ ! -s "$AUTH_POLICY_NONCE_FILE" ]; then
  od -An -tx1 -N32 /dev/urandom | tr -d ' \n' > "$AUTH_POLICY_NONCE_FILE"
fi
chmod 600 "$AUTH_POLICY_NONCE_FILE" 2>/dev/null || true
AUTH_POLICY_HASH_NONCE="$(cat "$AUTH_POLICY_NONCE_FILE")"
TLS_CERT=/etc/ssl/certs/ssl-cert-snakeoil.pem
TLS_KEY=/etc/ssl/private/ssl-cert-snakeoil.key
if [ -n "$IMYEMAIL_TLS_CERT_FILE" ] || [ -n "$IMYEMAIL_TLS_KEY_FILE" ]; then
  if [ -f "$IMYEMAIL_TLS_CERT_FILE" ] && [ -f "$IMYEMAIL_TLS_KEY_FILE" ]; then
    TLS_CERT="$IMYEMAIL_TLS_CERT_FILE"
    TLS_KEY="$IMYEMAIL_TLS_KEY_FILE"
  else
    echo "warning: IMYEMAIL_TLS_CERT_FILE/IMYEMAIL_TLS_KEY_FILE not readable; using snakeoil localhost certificate" >&2
  fi
fi
sed -i "s#^ssl_server_cert_file = .*#ssl_server_cert_file = ${TLS_CERT}#" /etc/dovecot/dovecot.conf
sed -i "s#^ssl_server_key_file = .*#ssl_server_key_file = ${TLS_KEY}#" /etc/dovecot/dovecot.conf
sed -i "s#^auth_policy_hash_nonce = .*#auth_policy_hash_nonce = ${AUTH_POLICY_HASH_NONCE}#" /etc/dovecot/dovecot.conf
sed -i "s#^auth_policy_server_url = .*#auth_policy_server_url = ${IMYEMAIL_AUTH_POLICY_URL}#" /etc/dovecot/dovecot.conf
watch_certificates() {
  last="$(sha256sum "$TLS_CERT" "$TLS_KEY" | sha256sum | cut -d' ' -f1)"
  while :; do
    sleep 15
    current="$(sha256sum "$TLS_CERT" "$TLS_KEY" | sha256sum | cut -d' ' -f1)"
    if [ "$current" != "$last" ]; then
      echo "certificate files changed; reloading Dovecot"
      doveadm reload
      last="$current"
    fi
  done
}
watch_certificates &
exec dovecot -F
