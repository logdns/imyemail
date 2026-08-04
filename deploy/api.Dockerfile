# syntax=docker/dockerfile:1.7

FROM golang:1.25-bookworm AS build
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

FROM debian:bookworm-slim
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean && \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates curl tzdata
WORKDIR /app
COPY --from=build /out/imyemail-api /usr/local/bin/imyemail-api
EXPOSE 8080 465 587
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl --fail --silent --show-error http://127.0.0.1:8080/healthz >/dev/null || exit 1
STOPSIGNAL SIGTERM
CMD ["imyemail-api"]
