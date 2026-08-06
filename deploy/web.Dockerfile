# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS build
WORKDIR /src
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --global pnpm@10.28.2
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter imyemail-web...
COPY apps/web apps/web
ARG VITE_APP_VERSION=""
ARG VITE_RELEASE_URL=""
ARG VITE_ASSET_BASE="/"
RUN pnpm --dir apps/web run build

FROM nginx:1.28-alpine
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx/web.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --output-document=/dev/null http://127.0.0.1/ || exit 1
STOPSIGNAL SIGQUIT
