# syntax=docker/dockerfile:1

FROM debian:trixie-slim AS postfix-build
ARG APP_VERSION="dev"
COPY build-source.sh /build-postfix.sh
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    sh /build-postfix.sh

FROM debian:trixie-slim
ENV DEBIAN_FRONTEND=noninteractive
ARG APP_VERSION="dev"
COPY --from=postfix-build /out/ /tmp/postfix-packages/
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean && \
    apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends /tmp/postfix-packages/postfix.deb /tmp/postfix-packages/postfix-sqlite.deb ca-certificates rsyslog ssl-cert && \
    rm -rf /tmp/postfix-packages && \
    postconf -h mail_version | grep -Fx '3.11.8' && postconf -m | grep -Fx sqlite && postconf -a | grep -Fx dovecot
COPY main.cf /etc/postfix/main.cf
COPY master.cf /etc/postfix/master.cf
COPY sqlite-*.cf /etc/postfix/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 25
CMD ["/entrypoint.sh"]
