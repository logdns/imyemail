# syntax=docker/dockerfile:1.7

FROM debian:trixie-slim AS dovecot-compiled
ENV DEBIAN_FRONTEND=noninteractive
ARG APP_VERSION="dev"
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential pkg-config curl ca-certificates gnupg libssl-dev libsqlite3-dev \
      libicu-dev libsodium-dev libcap-dev libpcre2-dev zlib1g-dev libbz2-dev liblz4-dev libzstd-dev
COPY build-source.sh /build-source.sh
RUN sh /build-source.sh

FROM dovecot-compiled AS dovecot-build
COPY check-source.sh /check-source.sh
COPY run-test.sh /run-upstream-test.sh
RUN --network=none \
    --mount=type=bind,from=dovecot-compiled,source=/tmp,target=/compiled-tmp,ro \
    --mount=type=tmpfs,target=/tmp sh /check-source.sh

FROM debian:trixie-slim
ENV DEBIAN_FRONTEND=noninteractive
ARG APP_VERSION="dev"
COPY --from=dovecot-build /imyemail-dovecot.deb /tmp/imyemail-dovecot.deb
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean && \
    apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends /tmp/imyemail-dovecot.deb ssl-cert ca-certificates && \
    rm /tmp/imyemail-dovecot.deb && \
    addgroup --system dovecot && adduser --system --ingroup dovecot --no-create-home dovecot && \
    addgroup --system dovenull && adduser --system --ingroup dovenull --no-create-home dovenull && \
    ldconfig && dovecot --version | grep -E '^2\.4\.5([ (]|$)'
# Keep upstream license and source provenance despite Debian slim exclusions.
COPY --from=dovecot-build /out/usr/share/doc/imyemail-dovecot/ /usr/share/doc/imyemail-dovecot/
COPY dovecot.conf /etc/dovecot/dovecot.conf
COPY dovecot-sql.conf.ext /etc/dovecot/dovecot-sql.conf.ext
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 993 995 24 12345
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD doveadm service status imap-login >/dev/null || exit 1
CMD ["/entrypoint.sh"]
