FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY challenge-services/challenge-08/package.json challenge-services/challenge-08/package.json
RUN pnpm install --frozen-lockfile=false --filter challenge-08...

FROM deps AS build
COPY challenge-services/challenge-08 challenge-services/challenge-08
RUN pnpm --filter challenge-08 build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/challenge-services/challenge-08/dist /app/dist
EXPOSE 8080
CMD ["node", "dist/server.js"]
