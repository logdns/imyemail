#!/bin/sh
set -eu
: "${IMYEMAIL_PUBLIC_HOSTNAME:=mail.example.com}"
: "${IMYEMAIL_TLS_CERT_FILE:=}"
: "${IMYEMAIL_TLS_KEY_FILE:=}"
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
postconf -e "myhostname = ${IMYEMAIL_PUBLIC_HOSTNAME}"
postconf -e "myorigin = ${IMYEMAIL_PUBLIC_HOSTNAME}"
postconf -e "smtpd_tls_cert_file = ${TLS_CERT}"
postconf -e "smtpd_tls_key_file = ${TLS_KEY}"
postconf -e "milter_mail_macros = i {mail_addr} {client_addr} {client_name} {auth_authen}"
postconf -e "smtpd_milters = inet:rspamd:11332"
postconf -e "non_smtpd_milters = inet:rspamd:11332"
postconf -e "milter_default_action = accept"
postconf -e "milter_connect_timeout = 5s"
postconf -e "milter_command_timeout = 10s"
postconf -e "milter_content_timeout = 30s"
postfix check
watch_certificates() {
  last="$(sha256sum "$TLS_CERT" "$TLS_KEY" | sha256sum | cut -d' ' -f1)"
  while :; do
    sleep 15
    current="$(sha256sum "$TLS_CERT" "$TLS_KEY" | sha256sum | cut -d' ' -f1)"
    if [ "$current" != "$last" ]; then
      echo "certificate files changed; reloading Postfix"
      postfix reload
      last="$current"
    fi
  done
}
watch_certificates &
exec postfix start-fg
