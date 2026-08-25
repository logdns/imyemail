# syntax=docker/dockerfile:1.7

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
    apt-get update && apt-get install -y --no-install-recommends "rspamd=${RSPAMD_VERSION}" sqlite3 && \
    dpkg-query -W -f='${Version}\n' rspamd | grep -F "${RSPAMD_VERSION}"
COPY local.d/ /etc/rspamd/local.d/
COPY sync-dkim.sh /usr/local/bin/imyemail-rspamd-sync-dkim
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/imyemail-rspamd-sync-dkim && mkdir -p /run/rspamd /var/lib/rspamd/dkim
EXPOSE 11332 11334
CMD ["/entrypoint.sh"]
