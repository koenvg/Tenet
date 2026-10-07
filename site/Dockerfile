FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY site/ ./site/
COPY web/ ./web/
COPY third-party/web/ ./third-party/web/
RUN bun run site:build

FROM caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b
COPY site/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/site/dist/ /srv/site/
EXPOSE 8080
