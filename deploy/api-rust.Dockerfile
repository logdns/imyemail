# syntax=docker/dockerfile:1.7

FROM rust:1.85-bookworm AS build
WORKDIR /src/apps/api-rs
COPY apps/api-rs/Cargo.toml apps/api-rs/Cargo.lock ./
COPY apps/api-rs/src ./src
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/apps/api-rs/target \
    cargo build --release --locked && \
    cp target/release/imyemail-api-rs /out-imyemail-api-rs

FROM debian:bookworm-slim
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean && \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates curl tzdata
COPY --from=build /out-imyemail-api-rs /usr/local/bin/imyemail-api-rs
ENV IMYEMAIL_RUST_ADDR=0.0.0.0:8081
EXPOSE 8081
USER 65532:65532
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl --fail --silent --show-error http://127.0.0.1:8081/healthz >/dev/null || exit 1
STOPSIGNAL SIGTERM
CMD ["imyemail-api-rs"]
