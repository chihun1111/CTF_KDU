FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY challenge-services/challenge-07/package.json challenge-services/challenge-07/package.json
RUN pnpm install --frozen-lockfile --filter challenge-07...

FROM deps AS build
COPY challenge-services/challenge-07 challenge-services/challenge-07
RUN pnpm --filter challenge-07 build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/state \
  && chown node:node /app/state
COPY --from=build /app/challenge-services/challenge-07/dist /app/dist
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
