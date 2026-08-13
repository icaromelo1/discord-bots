# Design — discord-dj: bot de música multi-servidor

> Data: 2026-08-13
> Status: aprovado no brainstorming, aguardando plano de implementação

## Objetivo

Um bot de Discord próprio, independente do GM (bot do Minecraft) e do kairos-api,
que entra em call e toca música do YouTube. Opera em **múltiplos servidores
simultaneamente** (3 no alvo inicial), cada um com sua fila, sua call e seu
catálogo.

O bot é desenhado para crescer: conversa (chat-bot com LLM) e TTS ("falar" na
call) são objetivos futuros declarados. Este spec **não os implementa** — apenas
garante que o encaixe deles não exija reescrever nada.

## Escopo

### Dentro (MVP)

- Tocar áudio do YouTube em canal de voz, sob demanda, em várias guilds ao mesmo tempo.
- Slash commands: `/tocar`, `/fila`, `/pular`, `/pausar`, `/parar`, `/sair`, `/biblioteca`.
- Painel de controle com botões (mesma função dos comandos, segunda porta de entrada).
- Biblioteca durável: mp3 no Google Drive via rclone, cache local, metadados no Postgres.
- Allowlist de guilds; bot sai sozinho de servidor não autorizado.

### Fora (explicitamente)

- **Chat-bot / LLM** — futuro. O intent `MessageContent` fica habilitado e um
  handler vazio existe, mas nenhuma lógica de conversa é escrita agora.
- **TTS** — futuro. Cabe atrás da mesma interface de player.
- **Features de Minecraft** (RCON, watcher de log, alertas de crash) — continuam
  no GM, que segue rodando. Nada é migrado.
- **Prune / expiração automática** — decisão explícita do Icaro: a biblioteca do
  Drive é permanente, nada é apagado por idade.
- **Fila persistente** — a fila vive em memória e se perde num restart do
  container. Aceito: refazer custa três comandos.
- **Playlists, letras, integração com Spotify** — YAGNI.

## Decisões tomadas

| Decisão | Escolha | Motivo |
|---|---|---|
| Relação com o GM | Bot novo, separado; GM continua | Isolamento: crash do player de áudio não derruba os alertas de crash do Minecraft |
| Fonte do áudio | yt-dlp próprio, sem depender do kairos-api | Autonomia; kairos fora do ar não impede a música |
| Armazenamento | Cache local + Drive próprio | Sobrevive a redeploy sem rebaixar |
| Biblioteca do Kairos | **Não** reaproveitada | Construção própria; remote e schema separados |
| Cookies do YouTube | Compartilha o arquivo do kairos-api, read-only | É credencial, não código. O cron de 12h que já existe mantém fresco |
| Metadados | Postgres da VM, schema `discord_dj` | Padrão já documentado em `AGENTE-SERVIDOR.md` |
| Isolamento entre guilds | Catálogo separado, arquivo único | Cada guild só vê o que pediu; o mp3 existe uma vez só |
| Imagem base | `node:22-bookworm-slim` (não Alpine) | Módulos nativos de voz têm binário pré-compilado para glibc |
| Link colado no canal | Não enfileira | Só comando e botão; evita surpresa em conversa normal |

## Arquitetura

Projeto novo em `pessoal/discord-dj/`, repo git próprio, container próprio na
VM Oracle, token de bot próprio.

### Módulos

| Módulo | Responsabilidade | Não conhece |
|---|---|---|
| `discord/` | Client, registro de comandos, painel, allowlist, handlers | música, yt-dlp |
| `voice/` | Conexões e players por guild; tocar um arquivo | comandos, YouTube |
| `library/` | Resolver link → faixa: yt-dlp, cache, Drive, catálogo | Discord |
| `queue/` | Fila, faixa atual, avançar/pular — por guild | como o áudio toca |
| `db/` | Entidades e acesso ao Postgres | todo o resto |

Regra de dependência: `discord/ → queue/ → voice/` e `discord/ → library/ → db/`.
Nenhum módulo de baixo importa `discord/`.

### Estado por guild

Todo estado vivo é chaveado por `guildId`. Nada vaza entre servidores:

- `Map<guildId, Queue>` — fila e faixa atual
- `Map<guildId, VoiceConnection>` — conexão de voz (`@discordjs/voice` já é
  keyed por guild nativamente; um bot pode estar em N calls, uma por guild)
- `Map<guildId, AudioPlayer>` — player
- `Map<guildId, messageId>` — mensagem do painel
- `Map<"guildId:userId", timestamp>` — cooldown de download

Sair de uma call ou ser expulso limpa apenas a entrada daquela guild.

### Modelo de dados (schema `discord_dj`)

```
tracks                              -- o ARQUIVO (global, uma linha por música)
  id            uuid pk
  youtube_id    text unique
  title         text
  duration_sec  int
  drive_file    text                -- "<youtubeId>.mp3"
  created_at    timestamptz

guild_tracks                        -- o CATÁLOGO (uma linha por guild que conhece a música)
  id             uuid pk
  guild_id       text
  track_id       uuid fk → tracks
  added_by       text               -- user id do Discord
  added_by_name  text
  first_added_at timestamptz
  last_played_at timestamptz
  unique (guild_id, track_id)
```

`/biblioteca` lê `guild_tracks` filtrado pela guild, ordenado por
`last_played_at` desc. O download consulta `tracks` — se a música já existe (foi
baixada por outra guild), só cria a linha em `guild_tracks`, sem tocar no YouTube.

## Fluxos

### `/tocar <link>`

1. **Validação** (`discord/`):
   - `guildId` está na allowlist? Senão, ignora.
   - `interaction.member.voice.channel` é null? Responde "entre numa call
     primeiro" e encerra. O bot nunca escolhe um canal — sempre vai no de quem
     pediu.
   - Link parseável? Aceita `youtu.be/`, `watch?v=`, `shorts/`, `embed/` ou o id
     de 11 caracteres. Valida contra `^[\w-]{11}$`.
   - `deferReply()` imediato — download passa dos 3s de timeout do Discord.
2. **Resolução** (`library.resolve(guildId, youtubeId, user)`):
   - Existe em `tracks`? Garante o mp3 quente no cache (baixa do Drive se
     sumiu), faz upsert em `guild_tracks`, devolve. Sem bater no YouTube.
   - Nova? `yt-dlp -j` para metadados → rejeita live, sem duração, ou acima de
     `MAX_DURATION_SEC` (20min) → `yt-dlp -x --audio-format mp3` → `rclone
     copyto` para o Drive → grava `tracks` + `guild_tracks`.
   - Downloads concorrentes do mesmo `youtubeId` (qualquer guild) compartilham a
     mesma Promise, em vez de baixar duas vezes.
3. **Fila** (`queue.add`): limite de 50 por guild. Cooldown de 5s por usuário
   **apenas para download novo** — faixa já no catálogo entra livre, para não
   travar "tocar tudo".
4. **Voz** (`voice.ensure`): entra no canal de quem pediu. Se já estiver em outra
   call **na mesma guild**, avisa em vez de trocar sozinho.
5. **Play**: se nada tocando, toca; senão apenas atualiza o painel.

### Painel

Uma mensagem por guild, **editada, nunca reenviada**. Mostra faixa atual, quem
pediu, próximas da fila e botões `⏯ ⏭ ⏹ 🔉 🔊`.

- Botão e slash command chamam a mesma função. O botão valida adicionalmente que
  quem clicou está na mesma call — senão qualquer membro do servidor controla o
  áudio de uma conversa que não está ouvindo.
- Fila vazia → painel vira "fila vazia"; o bot sai da call após ~2min ocioso.

### Comandos

| Comando | Efeito |
|---|---|
| `/tocar <link>` | Enfileira e responde com o painel |
| `/fila` | Lista a fila da guild |
| `/pular` | Avança para a próxima |
| `/pausar` | Pausa/retoma |
| `/parar` | Limpa a fila e para |
| `/sair` | Desconecta da call |
| `/biblioteca [busca]` | Lista o catálogo **daquela guild**, para tocar sem colar link |

## Tratamento de erro

| Falha | Comportamento |
|---|---|
| Anti-bot do YouTube (cookie vencido) | Mensagem clara: "os cookies do servidor precisam ser renovados" — nunca um stack trace |
| Vídeo privado / indisponível / live / longo demais | Recusa antes de baixar, dizendo qual dos casos é |
| Drive indisponível | Toca do cache local mesmo assim; só o upload falha, e é logado |
| Bot expulso da call | Limpa fila e estado daquela guild |
| Container reinicia | Fila em memória se perde (aceito). Biblioteca sobrevive: Drive + Postgres |
| Guild não autorizada adiciona o bot | Bot sai sozinho |

## Segurança

- **Allowlist** `GUILD_IDS=a,b,c` validada em toda interação; sai de servidor não
  listado. Sem isso, qualquer um com link de convite usa a conta do YouTube e o
  Drive do Icaro.
- DMs ignoradas.
- Botão do painel exige que o clicador esteja na mesma call.
- `yt-dlp` e `rclone` sempre via `execFile` com array de argumentos — nunca
  string interpolada. O `youtubeId` é validado por regex antes de chegar em
  qualquer processo.
- `.env` fora do repo; `.env.example` versionado.

## Infraestrutura

### Dependências do container

`node` + `ffmpeg` (Discord só aceita Opus; o mp3 é transcodificado em tempo real)
+ `python3`/`yt-dlp` + `rclone`. Imagem ≈ 400MB — é custo de **disco**, não de
RAM (execução fica em ~60-80MB do Node + ~30-40MB por ffmpeg ativo).

Base `node:22-bookworm-slim`, não Alpine: `@discordjs/opus` e `sodium-native` são
módulos nativos cujos binários pré-compilados são para glibc. Em musl o npm cai
para compilar do zero, o que exige toolchain na imagem e tem falha conhecida em
arm64. Os 100MB a mais compram uma tarde de build.

### Intents e cache

- Intents: `Guilds`, `GuildVoiceStates`, `GuildMessages`, `MessageContent`
  (privilegiado, habilitado no Developer Portal — já pensando no chat-bot).
- **O cache de voice state fica LIGADO.** O GM usa
  `Options.cacheWithLimits({ VoiceStateManager: 0 })`; copiar isso quebra
  `member.voice.channel`, que é exatamente como este bot descobre onde a pessoa
  está.

### Registro de comandos

Por guild (`Routes.applicationGuildCommands`) em loop sobre a allowlist —
propaga instantaneamente. O código suporta também registro global
(`applicationCommands`, propagação de até 1h), ligado por env, para quando
"muitos servidores" for real.

### docker-compose

```
build:   node:22-bookworm-slim, multi-stage
redes:   data (Postgres) + saída para internet
volumes:
  ./music-cache                  → /app/music-cache        (rw)
  ~/.config/rclone               → /root/.config/rclone:ro
  ~/projects/kairos-api/cookies  → /app/cookies:ro
restart: unless-stopped
```

O cookies monta o **diretório**, não o arquivo. Bind-mount de arquivo único
quebra quando o processo de fora reescreve e troca o inode — o GM já apanhou
disso com o `latest.log`, e o cron de cookies reescreve a cada 12h.

### Variáveis de ambiente

`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_IDS`, `DATABASE_URL`,
`DRIVE_REMOTE` (`gdrive:discord-dj-music` — pasta própria, separada da do
Kairos), `COOKIES_FILE`, `MUSIC_CACHE_DIR`, `MAX_DURATION_SEC`, e
`POT_PROVIDER_URL` (opcional — provedor de PO token que o yt-dlp usa para
contornar bloqueio de IP de datacenter; só configurar se o cookie sozinho não
bastar).

### Consumo com 3 guilds simultâneas

Três ffmpeg + encoder Opus ≈ 120MB de RAM e fração de core, contra 4 vCPU / 24GB
da VM. Banda de saída é ~64kbps por call. Nenhum dos dois é gargalo.

## Validação

Três camadas, porque a maior parte disso não se testa com unit test:

1. **Automatizado:** parse de link (todas as formas + entrada inválida),
   tradução de erro do yt-dlp, lógica de fila (adicionar, pular, limite de 50,
   cooldown), isolamento entre guilds (operação em A não altera B).
2. **Manual, uma vez:** `library.resolve` contra o YouTube real — link novo, link
   repetido (não pode rebaixar), mesma música em duas guilds (um arquivo, dois
   catálogos), vídeo de 3h (recusa), live (recusa), vídeo privado (recusa).
3. **Só no Discord:** qualidade do áudio, sincronia, painel, entrar/sair de call,
   duas guilds tocando ao mesmo tempo.

Subir primeiro na guild de teste (Discord Sandbox, já existente) antes de apontar
para os servidores reais.

## Ganchos para o futuro

Declarados no design, **não implementados**:

- `voice.play(caminhoDeArquivo)` aceita qualquer arquivo de áudio. TTS entra
  depois como um segundo produtor de arquivo; o player não muda.
- Intent `MessageContent` habilitado com handler vazio. O chat-bot vira uma
  implementação desse handler, sem mexer no Developer Portal nem no deploy.
- Nenhuma decisão deste spec bloqueia os dois, e nenhuma linha de código a mais é
  escrita por causa deles agora.

## Riscos conhecidos

- **ToS do YouTube:** o Google derrubou bots públicos grandes (Groovy, Rythm) por
  streamar YouTube. Guild privada e pequena é risco baixo na prática, mas existe,
  e recai sobre a conta usada nos cookies (`ica121jogador@gmail.com`), não sobre
  a conta principal do Icaro.
- **Cota do Drive:** a biblioteca é permanente e a conta free tem 15GB
  compartilhados com Gmail e Photos, onde os backups do Minecraft já moram
  (`gdrive:oracle-backups/`). Se a biblioteca crescer muito, o primeiro sintoma é
  **backup do Minecraft falhando**, não música parando. Monitorar manualmente por
  ora; alerta automático não entra no MVP.
- **Cookie compartilhado:** se o cron do kairos-api quebrar, os dois serviços
  perdem download novo ao mesmo tempo.
