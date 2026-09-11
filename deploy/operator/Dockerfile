# syntax=docker/dockerfile:1.7

FROM rust:1.98-alpine3.24 AS build
WORKDIR /src
RUN apk add --no-cache musl-dev
COPY apps/manager/Cargo.toml apps/manager/Cargo.lock ./
COPY apps/manager/src ./src
COPY deploy/docker-compose.yml /deploy/docker-compose.yml
COPY deploy/.env.example /deploy/.env.example
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/src/target,sharing=locked \
    cargo build --release --locked && \
    install -m 0755 /src/target/release/imyemail /out-imyemail

FROM alpine:3.24
ARG APP_VERSION="dev"
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates docker-cli docker-cli-compose
COPY --from=build /out-imyemail /usr/local/bin/imyemail
USER root
ENTRYPOINT ["/usr/local/bin/imyemail"]
CMD ["serve-operator"]
