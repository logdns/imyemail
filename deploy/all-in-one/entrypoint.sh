#!/bin/sh
set -eu

: "${IMYEMAIL_PUBLIC_HOSTNAME:=mail.example.com}"
: "${IMYEMAIL_DATA_DIR:=/data}"
: "${IMYEMAIL_DB_PATH:=/data/imyemail.db}"
: "${IMYEMAIL_DB_SHARED_GID:=$(id -g postfix)}"
: "${IMYEMAIL_ADDR:=127.0.0.1:8080}"
: "${IMYEMAIL_SMTP_HOST:=127.0.0.1}"
: "${IMYEMAIL_SMTP_PORT:=25}"
: "${IMYEMAIL_SUBMISSION_ADDR:=}"
: "${IMYEMAIL_SUBMISSION_TLS_ADDR:=}"
: "${IMYEMAIL_SUBMISSION_MAX_MESSAGE_MB:=35}"
: "${IMYEMAIL_MAILDIR_ROOT:=/var/mail/vhosts}"
: "${IMYEMAIL_CERTIFICATE_DIR:=/data/certificates}"
: "${IMYEMAIL_TLS_CERT_FILE:=${IMYEMAIL_CERTIFICATE_DIR}/fullchain.pem}"
: "${IMYEMAIL_TLS_KEY_FILE:=${IMYEMAIL_CERTIFICATE_DIR}/privkey.pem}"

export IMYEMAIL_DATA_DIR IMYEMAIL_DB_PATH IMYEMAIL_DB_SHARED_GID IMYEMAIL_ADDR IMYEMAIL_SMTP_HOST IMYEMAIL_SMTP_PORT IMYEMAIL_SUBMISSION_ADDR IMYEMAIL_SUBMISSION_TLS_ADDR IMYEMAIL_SUBMISSION_MAX_MESSAGE_MB IMYEMAIL_MAILDIR_ROOT IMYEMAIL_CERTIFICATE_DIR IMYEMAIL_TLS_CERT_FILE IMYEMAIL_TLS_KEY_FILE

addgroup --system --gid 5000 vmail 2>/dev/null || true
adduser --system --uid 5000 --gid 5000 --home /var/mail/vhosts --no-create-home vmail 2>/dev/null || true
mkdir -p /data "$IMYEMAIL_CERTIFICATE_DIR" /var/mail/vhosts /var/lib/rspamd/dkim /run/rspamd /var/spool/postfix /var/run/dovecot
chown -R 5000:5000 /var/mail/vhosts
if id _rspamd >/dev/null 2>&1; then
  chown -R _rspamd:_rspamd /run/rspamd /var/lib/rspamd 2>/dev/null || true
elif id rspamd >/dev/null 2>&1; then
  chown -R rspamd:rspamd /run/rspamd /var/lib/rspamd 2>/dev/null || true
fi

AUTH_POLICY_NONCE_FILE="${IMYEMAIL_AUTH_POLICY_NONCE_FILE:-/data/dovecot-auth-policy-nonce}"
mkdir -p "$(dirname "$AUTH_POLICY_NONCE_FILE")"
if [ ! -s "$AUTH_POLICY_NONCE_FILE" ]; then
  od -An -tx1 -N32 /dev/urandom | tr -d ' \n' > "$AUTH_POLICY_NONCE_FILE"
fi
chmod 600 "$AUTH_POLICY_NONCE_FILE" 2>/dev/null || true
AUTH_POLICY_HASH_NONCE="$(cat "$AUTH_POLICY_NONCE_FILE")"

if [ ! -s "$IMYEMAIL_TLS_CERT_FILE" ] || [ ! -s "$IMYEMAIL_TLS_KEY_FILE" ]; then
  echo "info: generating temporary self-signed certificate; replace it from the admin ACME settings" >&2
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 30 \
    -subj "/CN=${IMYEMAIL_PUBLIC_HOSTNAME}" \
    -addext "subjectAltName=DNS:${IMYEMAIL_PUBLIC_HOSTNAME}" \
    -keyout "$IMYEMAIL_TLS_KEY_FILE" -out "$IMYEMAIL_TLS_CERT_FILE" >/dev/null 2>&1
  chmod 600 "$IMYEMAIL_TLS_KEY_FILE"
  chmod 644 "$IMYEMAIL_TLS_CERT_FILE"
fi
: "${IMYEMAIL_SUBMISSION_ADDR:=:587}"
: "${IMYEMAIL_SUBMISSION_TLS_ADDR:=:465}"
TLS_CERT="$IMYEMAIL_TLS_CERT_FILE"
TLS_KEY="$IMYEMAIL_TLS_KEY_FILE"
export IMYEMAIL_SUBMISSION_ADDR IMYEMAIL_SUBMISSION_TLS_ADDR

sed -i "s#__IMYEMAIL_TLS_CERT__#${TLS_CERT}#g; s#__IMYEMAIL_TLS_KEY__#${TLS_KEY}#g" /etc/nginx/sites-enabled/default

postconf -e "myhostname = ${IMYEMAIL_PUBLIC_HOSTNAME}"
postconf -e "myorigin = ${IMYEMAIL_PUBLIC_HOSTNAME}"
postconf -e "smtpd_tls_cert_file = ${TLS_CERT}"
postconf -e "smtpd_tls_key_file = ${TLS_KEY}"
postconf -e "virtual_transport = lmtp:inet:127.0.0.1:24"
postconf -e "milter_mail_macros = i {mail_addr} {client_addr} {client_name} {auth_authen}"
postconf -e "smtpd_milters = inet:127.0.0.1:11332"
postconf -e "non_smtpd_milters = inet:127.0.0.1:11332"
postconf -e "milter_default_action = accept"
postconf -e "milter_connect_timeout = 5s"
postconf -e "milter_command_timeout = 10s"
postconf -e "milter_content_timeout = 30s"
sed -i "s#^ssl_cert = <.*#ssl_cert = <${TLS_CERT}#" /etc/dovecot/dovecot.conf
sed -i "s#^ssl_key = <.*#ssl_key = <${TLS_KEY}#" /etc/dovecot/dovecot.conf
sed -i "s#^auth_policy_hash_nonce = .*#auth_policy_hash_nonce = ${AUTH_POLICY_HASH_NONCE}#" /etc/dovecot/dovecot.conf

# Rspamd DKIM keys are exported after API seed/migrations create the SQLite DB.
/usr/local/bin/imyemail-api >/tmp/imyemail-api-bootstrap.log 2>&1 &
bootstrap_pid=$!
for i in $(seq 1 60); do
  if [ -f "$IMYEMAIL_DB_PATH" ]; then
    users_count="$(sqlite3 "$IMYEMAIL_DB_PATH" "SELECT COALESCE(COUNT(1),0) FROM users;" 2>/dev/null || echo 0)"
    domains_count="$(sqlite3 "$IMYEMAIL_DB_PATH" "SELECT COALESCE(COUNT(1),0) FROM domains;" 2>/dev/null || echo 0)"
    if [ "${users_count:-0}" -gt 0 ] && [ "${domains_count:-0}" -gt 0 ]; then
      break
    fi
  fi
  sleep 1
done
kill "$bootstrap_pid" 2>/dev/null || true
wait "$bootstrap_pid" 2>/dev/null || true

/usr/local/bin/imyemail-rspamd-sync-dkim --once || true

postfix check
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/imyemail.conf
