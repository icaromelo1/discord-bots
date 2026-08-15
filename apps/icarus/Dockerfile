# syntax=docker/dockerfile:1

# Estágio próprio para o whisper.cpp: compilar leva minutos em ARM e o resultado é
# só um binário + um modelo. Separado, o cache do Docker evita recompilar a cada
# mudança de código do bot.
FROM debian:bookworm-slim AS whisper
RUN apt-get update && apt-get install -y --no-install-recommends \
        git build-essential cmake ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt
RUN git clone --depth 1 https://github.com/ggml-org/whisper.cpp
WORKDIR /opt/whisper.cpp
# BUILD_SHARED_LIBS=OFF é obrigatório: por padrão o whisper.cpp gera libwhisper.so e
# libggml*.so, que ficariam para trás no COPY entre estágios — o binário até é copiado,
# mas morre no runtime com "error while loading shared libraries".
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON \
    && cmake --build build -j"$(nproc)" --config Release
# dois modelos, dois propósitos: tiny responde a palavra de ativação em ~1s
# (medido nesta VM), base transcreve a memória com mais precisão e pode demorar
RUN bash ./models/download-ggml-model.sh tiny && bash ./models/download-ggml-model.sh base

# node:22-bookworm-slim (glibc) — não Alpine: @discordjs/opus e sodium-native
# publicam binário pré-compilado só para glibc; em musl o npm recompila do
# zero e isso falha em arm64.
#
# O contexto de build deste Dockerfile é a RAIZ do monorepo, não apps/icarus —
# ele precisa dos manifestos do workspace e de packages/shared.

FROM node:22-bookworm-slim AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifestos primeiro, código depois: mudar código não invalida a camada do npm ci.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/icarus/package.json apps/icarus/
RUN npm ci

COPY packages/shared packages/shared
COPY apps/icarus apps/icarus
RUN npm run build -w @bots/shared && npm run build -w @bots/icarus

RUN npm prune --omit=dev


FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production

# Runtime: ffmpeg (transcodifica pra Opus), deno (runtime JS que o yt-dlp usa para
# resolver a assinatura dos vídeos), python3, yt-dlp e rclone.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        python3 \
        ca-certificates \
        curl \
        unzip \
    && curl -L -o /usr/local/bin/yt-dlp \
        https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64 \
    && chmod +x /usr/local/bin/yt-dlp \
    && curl -L -o /tmp/deno.zip https://github.com/denoland/deno/releases/latest/download/deno-aarch64-unknown-linux-gnu.zip \
    && unzip -j -q /tmp/deno.zip -d /usr/local/bin/ \
    && chmod +x /usr/local/bin/deno \
    && rm /tmp/deno.zip \
    # rclone oficial em vez do pacote do bookworm (v1.60, de 2022): a config deste
    # host é escrita por uma versão bem mais nova e o formato do token precisa bater.
    && curl -L -o /tmp/rclone.zip https://downloads.rclone.org/rclone-current-linux-arm64.zip \
    && unzip -j -q /tmp/rclone.zip '*/rclone' -d /usr/local/bin/ \
    && chmod +x /usr/local/bin/rclone \
    && rm /tmp/rclone.zip \
    && apt-get purge -y curl unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# O usuário ubuntu da VM é uid 1001, não 1000. Sem alinhar, o container não lê
# o rclone.conf (600) montado do host — e afrouxar a permissão de um credencial
# seria a correção errada.
RUN usermod -u 1001 node && groupmod -g 1001 node

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/icarus/package.json ./apps/icarus/
COPY --from=builder /app/apps/icarus/dist ./apps/icarus/dist

COPY --from=whisper /opt/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper /opt/whisper.cpp/models/ggml-tiny.bin /opt/modelos/ggml-tiny.bin
COPY --from=whisper /opt/whisper.cpp/models/ggml-base.bin /opt/modelos/ggml-base.bin

RUN mkdir -p /app/music-cache /app/cookies \
    && chown -R node:node /app

# USER não define HOME sozinho: sem isto o rclone procuraria a config em /root,
# que o usuário node não consegue nem atravessar (700, dono root).
ENV HOME=/home/node

USER node

CMD ["node", "apps/icarus/dist/index.js"]
