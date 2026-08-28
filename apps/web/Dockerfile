# syntax=docker/dockerfile:1
#
# Built from the repository root:  docker build -f apps/web/Dockerfile .

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Skip Prisma's engine download: the web build never touches the database, and
# the API workspace manifest is only present so `npm ci` matches the lockfile.
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @flowdesk/shared \
  && npm run build -w @flowdesk/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
