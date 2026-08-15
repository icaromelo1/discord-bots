# discord-bots

Monorepo dos bots de Discord: uma base compartilhada de voz e música, com um app
por bot.

| App | Bot | O que é |
|---|---|---|
| `apps/dj` | DJ NARUTINHO | Toca música do YouTube em vários servidores |
| `apps/icarus` | Icarus | *(a construir)* conversa por voz, memória e música |

Designs: [`docs/design/`](docs/design/)

## Estrutura

```
packages/shared/   fila, voz, biblioteca de música, painéis, client, comandos
apps/dj/           env, banco e bootstrap do DJ NARUTINHO
```

`packages/shared` não lê variável de ambiente: cada app monta um `SharedConfig` e
chama `configureShared()` no boot. O mesmo vale para o banco — o app registra seu
`DataSource` com `setDataSource()`, porque cada bot tem seu próprio schema.

## Stack

Node 22 · TypeScript 5.9 · npm workspaces · discord.js 14 · @discordjs/voice ·
TypeORM + Postgres · yt-dlp · deno · rclone (Google Drive)

## Desenvolvimento

```bash
npm install
cp apps/dj/.env.example apps/dj/.env    # preencher token, allowlist e DATABASE_URL
npm run build                            # compila shared e depois o app
npm test                                 # suíte inteira do monorepo
npm run typecheck
npm run dev:dj
```

Migrations são sempre geradas por CLI, nunca escritas à mão:

```bash
npm run migration:generate -w @bots/dj -- src/db/migrations/NomeDaMigration
npm run migration:run -w @bots/dj
```

## Deploy

Cada app tem Dockerfile e serviço próprios, então dá para subir **um bot por vez**
sem tocar nos outros:

```bash
docker compose build dj && docker compose up -d dj
```

O contexto de build é a raiz do monorepo (o Dockerfile precisa dos manifestos do
workspace e de `packages/shared`), mas cada imagem contém só o seu app.

## Requisitos de runtime

`ffmpeg`, `python3` + `yt-dlp`, `deno` e `rclone` no PATH. O `Dockerfile` instala
todos; fora do container, instalar na mão.

O **deno** não é opcional: sem um runtime JS o yt-dlp não resolve a assinatura dos
vídeos do YouTube e todo download falha com "Requested format is not available".

## Notas de versão travadas

- **TypeScript 5.9**, não 7.x — as entidades do TypeORM dependem de
  `experimentalDecorators` + `emitDecoratorMetadata`.
- **`node:22-bookworm-slim`**, não Alpine — `@discordjs/opus` e `sodium-native`
  publicam binário pré-compilado só para glibc.
