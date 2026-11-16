FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY challenge-services/challenge-03/package.json challenge-services/challenge-03/package.json
RUN pnpm install --frozen-lockfile --filter challenge-03...

FROM deps AS build
COPY challenge-services/challenge-03 challenge-services/challenge-03
RUN pnpm --filter challenge-03 build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/challenge-services/challenge-03/dist /app/dist
EXPOSE 8080
CMD ["node", "dist/server.js"]
