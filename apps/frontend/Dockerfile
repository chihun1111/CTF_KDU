FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter frontend...

FROM deps AS build
COPY apps/frontend apps/frontend
COPY packages/shared packages/shared
RUN pnpm --filter @campus-ctf/shared build
RUN pnpm --filter frontend build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["node", "apps/frontend/node_modules/next/dist/bin/next", "start", "apps/frontend", "-H", "0.0.0.0", "-p", "3000"]
