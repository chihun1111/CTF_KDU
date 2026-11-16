FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY challenge-services/challenge-04/package.json challenge-services/challenge-04/package.json
RUN pnpm install --frozen-lockfile --filter challenge-04...

FROM deps AS build
COPY challenge-services/challenge-04 challenge-services/challenge-04
RUN pnpm --filter challenge-04 build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/challenge-services/challenge-04/dist /app/dist
EXPOSE 8080
CMD ["node", "dist/server.js"]
