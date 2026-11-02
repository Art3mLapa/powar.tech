FROM node:24-trixie-slim AS dependencies
COPY --from=oven/bun:1.4.3 /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
WORKDIR /app
ENV DO_NOT_TRACK=1 PRISMA_DISABLE_TELEMETRY=1
COPY package.json bun.lock ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/design-tokens/package.json ./packages/design-tokens/package.json
COPY packages/game-assets/package.json ./packages/game-assets/package.json
COPY packages/render-contracts/package.json ./packages/render-contracts/package.json
COPY packages/render-pipeline/package.json ./packages/render-pipeline/package.json
RUN bun install --frozen-lockfile && rm -rf /root/.bun/install/cache

FROM dependencies AS builder
COPY apps/frontend ./apps/frontend
COPY packages/contracts ./packages/contracts
COPY packages/design-tokens ./packages/design-tokens
ARG BACKEND_ORIGIN=http://backend:3001
ENV NODE_ENV=production BACKEND_ORIGIN=$BACKEND_ORIGIN
RUN node apps/frontend/node_modules/next/dist/bin/next build apps/frontend

FROM dependencies AS backend
COPY apps/backend ./apps/backend
COPY packages/contracts ./packages/contracts
COPY packages/database ./packages/database
RUN mkdir -p /app/runtime/storage && chown -R node:node /app/runtime
ENV NODE_ENV=production STORAGE_DIR=/app/runtime/storage PORT=3001
USER node
EXPOSE 3001
CMD ["bun", "apps/backend/src/index.ts"]

FROM node:24-trixie-slim AS renderer
RUN apt-get update && apt-get install -y --no-install-recommends \
	cmake build-essential libegl-dev \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY apps/renderer ./apps/renderer
RUN cmake -S apps/renderer -B apps/renderer/build -DCMAKE_BUILD_TYPE=Release \
	&& cmake --build apps/renderer/build --parallel

FROM dependencies AS worker
RUN apt-get update && apt-get install -y --no-install-recommends \
	chromium ca-certificates libegl1 libegl-mesa0 libgl1-mesa-dri \
	&& rm -rf /var/lib/apt/lists/*
COPY apps/worker ./apps/worker
COPY packages/contracts ./packages/contracts
COPY packages/database ./packages/database
COPY packages/game-assets ./packages/game-assets
COPY packages/render-contracts ./packages/render-contracts
COPY packages/render-pipeline ./packages/render-pipeline
COPY --from=renderer /app/apps/renderer/build/renderer /app/apps/renderer/build/renderer
RUN mkdir -p /app/runtime/storage /home/node/.cache && chown -R node:node /app/runtime /home/node/.cache
ENV NODE_ENV=production STORAGE_DIR=/app/runtime/storage CHROMIUM_PATH=/usr/bin/chromium \
	RENDERER_EXECUTABLE=/app/apps/renderer/build/renderer LIBGL_ALWAYS_SOFTWARE=1 \
	EGL_PLATFORM=surfaceless
USER node
CMD ["bun", "apps/worker/src/index.ts"]

FROM node:24-trixie-slim AS frontend
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder --chown=node:node /app/apps/frontend/.next/static ./apps/frontend/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]