FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
RUN apk add --no-cache curl
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    TERRAIN_ATLAS_PATH=/app/terrain-atlas

LABEL org.opencontainers.image.source="https://github.com/Org666777148852/web"

COPY --from=build /app/.output ./.output
COPY terrain-atlas ./terrain-atlas

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
