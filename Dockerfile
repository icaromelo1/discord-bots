# syntax=docker/dockerfile:1

# node:22-bookworm-slim (glibc) — não Alpine: @discordjs/opus e sodium-native
# publicam binário pré-compilado só para glibc; em musl o npm recompila do
# zero e isso falha em arm64.

FROM node:22-bookworm-slim AS builder

# Toolchain de fallback: se não houver prebuild pra esta plataforma/arch,
# @discordjs/opus e sodium-native caem para compilar do zero via node-gyp.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Remove devDependencies do node_modules já resolvido (mantém os módulos
# nativos já compilados/prebuilds baixados, sem precisar reinstalar do zero
# no stage runner).
RUN npm prune --omit=dev


FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production

# Runtime: ffmpeg (transcodifica pra Opus), python3 (yt-dlp/extractors),
# rclone (biblioteca no Drive) e curl só para baixar o binário do yt-dlp
# (removido depois, não fica na imagem final).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        rclone \
        ca-certificates \
        curl \
    && curl -L -o /usr/local/bin/yt-dlp \
        https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64 \
    && chmod +x /usr/local/bin/yt-dlp \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/music-cache /app/cookies \
    && chown -R node:node /app

# USER não define HOME sozinho: sem isto o rclone procuraria a config em /root,
# que o usuário node não consegue nem atravessar (700, dono root).
ENV HOME=/home/node

USER node

CMD ["node", "dist/index.js"]
