# discord-dj

Bot de Discord que entra em call e toca música do YouTube em **vários servidores
ao mesmo tempo** — cada um com sua fila, sua call e seu catálogo.

Design completo: [`docs/design/2026-08-13-discord-dj.md`](docs/design/2026-08-13-discord-dj.md)

## Stack

Node 22 · TypeScript · discord.js 14 · @discordjs/voice · TypeORM + Postgres ·
yt-dlp · rclone (Google Drive)

## Comandos

| Comando | Efeito |
|---|---|
| `/tocar <link>` | Enfileira e responde com o painel |
| `/fila` | Lista a fila da guild |
| `/pular` | Avança para a próxima |
| `/pausar` | Pausa ou retoma |
| `/parar` | Limpa a fila e para |
| `/sair` | Desconecta da call |
| `/biblioteca [busca]` | Catálogo daquela guild |

## Desenvolvimento

```bash
npm install
cp .env.example .env     # preencher token, allowlist e DATABASE_URL
npm run migration:run
npm run dev
```

Scripts: `build`, `start`, `dev`, `typecheck`, `test`.

Migrations são sempre geradas por CLI, nunca escritas à mão:

```bash
npm run migration:generate -- src/db/migrations/NomeDaMigration
npm run migration:run
npm run migration:revert
```

## Requisitos de runtime

`ffmpeg`, `python3` + `yt-dlp` e `rclone` precisam existir no PATH. O
`Dockerfile` já os instala; para rodar fora do container, instalar na mão.

## Notas de versão travadas

- **TypeScript 5.9**, não 7.x — o projeto depende de `experimentalDecorators` +
  `emitDecoratorMetadata` para as entidades do TypeORM, e o caminho maduro para
  isso é o 5.x.
- **`node:22-bookworm-slim`**, não Alpine — `@discordjs/opus` e `sodium-native`
  publicam binário pré-compilado para glibc; em musl o npm recompila do zero e
  falha em arm64.
