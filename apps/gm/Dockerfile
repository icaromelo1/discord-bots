# syntax=docker/dockerfile:1

# O GM só faz HTTP para o Discord e TCP para o RCON: nada de áudio, nada de módulo
# nativo. Por isso a imagem é Alpine e minúscula, ao contrário das dos outros bots.
#
# O contexto de build é a RAIZ do monorepo.

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/gm/package.json apps/gm/
RUN npm ci

COPY apps/gm apps/gm
RUN npm run build -w @bots/gm

RUN npm prune --omit=dev


FROM node:22-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/gm/package.json ./apps/gm/
COPY --from=builder /app/apps/gm/dist ./apps/gm/dist

# Sem porta exposta: o bot só faz conexões de saída.
CMD ["node", "apps/gm/dist/bot.js"]
