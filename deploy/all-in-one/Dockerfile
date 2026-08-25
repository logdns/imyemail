# syntax=docker/dockerfile:1.7

FROM golang:1.27-trixie AS api-build
WORKDIR /src/apps/api
ARG GOPROXY="https://proxy.golang.org,direct"
ENV GOPROXY=${GOPROXY}
COPY apps/api/go.mod apps/api/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download
COPY apps/api ./
ARG APP_VERSION="dev"
ARG APP_COMMIT=""
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    mkdir -p /out && \
    CGO_ENABLED=0 GOOS=linux go build -trimpath \
      -ldflags "-s -w -X imyemail-api/internal/app.BuildVersion=${APP_VERSION} -X imyemail-api/internal/app.BuildCommit=${APP_COMMIT}" \
      -o /out/imyemail-api ./cmd/server

FROM node:24-trixie-slim AS web-build
WORKDIR /src
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --global pnpm@11.24.0
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter imyemail-web...
COPY apps/web apps/web
ARG VITE_APP_VERSION=""
ARG VITE_RELEASE_URL=""
ARG VITE_ASSET_BASE="/"
RUN pnpm --dir apps/web run build

FROM debian:trixie-slim
ENV DEBIAN_FRONTEND=noninteractive
ARG RSPAMD_VERSION="4.1.5-1~9a291a4~trixie"
ARG RSPAMD_KEY_SHA256="218ef36314c2e4c8a0b05702cf7489c12e18e69916e805d806e6464d87277bec"
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
  rm -f /etc/apt/apt.conf.d/docker-clean && \
  apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && \
  curl --fail --silent --show-error --location https://rspamd.com/apt-stable/gpg.key \
    --output /usr/share/keyrings/rspamd.asc && \
  echo "${RSPAMD_KEY_SHA256}  /usr/share/keyrings/rspamd.asc" | sha256sum --check --strict - && \
  printf '%s\n' 'deb [signed-by=/usr/share/keyrings/rspamd.asc] https://rspamd.com/apt-stable/ trixie main' \
    > /etc/apt/sources.list.d/rspamd.list && \
  apt-get update && apt-get install -y --no-install-recommends \
    tzdata sqlite3 supervisor nginx openssl rsyslog \
    postfix postfix-sqlite \
    dovecot-core dovecot-imapd dovecot-pop3d dovecot-lmtpd dovecot-sqlite ssl-cert \
    "rspamd=${RSPAMD_VERSION}" && \
  dpkg-query -W -f='${Version}\n' postfix | grep -E '^3\.10\.' && \
  dpkg-query -W -f='${Version}\n' dovecot-core | grep -E '^1:2\.4\.' && \
  dpkg-query -W -f='${Version}\n' rspamd | grep -F "${RSPAMD_VERSION}"

COPY --from=api-build /out/imyemail-api /usr/local/bin/imyemail-api
COPY --from=web-build /src/apps/web/dist /usr/share/nginx/html

COPY deploy/all-in-one/supervisord.conf /etc/supervisor/conf.d/imyemail.conf
COPY deploy/all-in-one/nginx.conf /etc/nginx/sites-enabled/default
COPY deploy/all-in-one/entrypoint.sh /entrypoint.sh

COPY deploy/postfix/main.cf /etc/postfix/main.cf
COPY deploy/postfix/master.cf /etc/postfix/master.cf
COPY deploy/postfix/sqlite-*.cf /etc/postfix/
COPY deploy/dovecot/dovecot.conf /etc/dovecot/dovecot.conf
COPY deploy/dovecot/dovecot-sql.conf.ext /etc/dovecot/dovecot-sql.conf.ext
COPY deploy/rspamd/local.d/ /etc/rspamd/local.d/
COPY deploy/rspamd/sync-dkim.sh /usr/local/bin/imyemail-rspamd-sync-dkim
COPY deploy/all-in-one/reload-certificates.sh /usr/local/bin/imyemail-reload-certificates

RUN chmod +x /entrypoint.sh /usr/local/bin/imyemail-rspamd-sync-dkim /usr/local/bin/imyemail-reload-certificates && mkdir -p /run/nginx /run/rspamd /var/mail/vhosts /data /var/lib/rspamd/dkim

EXPOSE 80 443 25 465 587 993 995
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl --fail --silent --show-error http://127.0.0.1/healthz >/dev/null || exit 1
STOPSIGNAL SIGTERM
CMD ["/entrypoint.sh"]
