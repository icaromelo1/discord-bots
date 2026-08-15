# Design — playlists, biblioteca clicável e fila interativa

> Data: 2026-08-15
> Status: aprovado no brainstorming, aguardando plano
> Projeto: discord-dj (DJ NARUTINHO)

## Objetivo

Transformar o bot de "toca uma música por vez" em algo com cara de aparelho de som:
carregar playlist inteira por link, montar fila clicando em vez de digitar, e
reordenar o que vai tocar.

## Dependência de sequenciamento

O spec [`2026-08-14-icarus.md`](2026-08-14-icarus.md) decidiu migrar este repo para
um **monorepo** (`packages/shared` + `apps/dj|icarus|gm`). Os módulos que esta
feature mexe — `queue/`, `player/`, `library/`, `discord/` — são exatamente os que
vão para `packages/shared`.

**Decisão: implementar agora, na estrutura atual (`src/…`), e migrar depois.**
Combinado com a sessão que cuida do Icarus: a migração é `git mv` de diretórios mais
ajuste de imports — reposiciona arquivos, não reescreve conteúdo. Se a feature entrar
antes, o código é movido já com ela dentro e ninguém rebaseia nada. O pior cenário
seria o inverso: a estrutura mudar no meio desta implementação.

**Ordem garantida:** feature entra → estrutura muda. Avisar a outra sessão antes do
merge.

### Restrição herdada do Icarus

`QueueManager`, `PlayerController` e `voice` vão para `packages/shared` e passarão a
ter **dois consumidores** (DJ e Icarus). Hoje `QueueManager` é puro — não importa
nada de `discord.js` — e precisa continuar assim, senão a extração fica cara.

Consequência concreta para esta feature: o estado de UI da `/fila` interativa (qual
faixa cada pessoa selecionou no menu) **não entra no `QueueManager`**. Ele vive na
camada Discord, que já é específica do bot. A fila expõe apenas operações sobre
índices — `move`, `remove`, `playNext` — sem saber que existe menu.

## Escopo

### Dentro

1. **Fila preguiçosa** com prefetch de 1 faixa — mudança de núcleo que habilita o resto.
2. **Playlist por link** — enfileira todas as faixas sem baixar todas.
3. **`/biblioteca` clicável** — menu suspenso que enfileira instantaneamente e fica aberto.
4. **`/fila` interativa** — reordenar, tocar em seguida, remover.

### Fora (explicitamente)

- **Salvar playlists próprias** no bot ("minha playlist da academia") — YAGNI por ora.
- **Arrastar e soltar** — o Discord não oferece o componente.
- **Repetir / aleatório permanente** — não foi pedido; a fila editável cobre o ajuste manual.
- **Playlists do Spotify ou outras fontes** — só YouTube, como o resto do bot.
- **Rádio automático do YouTube** (`list=RD…`) — é uma lista infinita gerada pelo
  YouTube, não uma playlist real; continua tratada como faixa única.

## Decisões tomadas

| Decisão | Escolha | Motivo |
|---|---|---|
| Quando baixar | Lookahead de 1: baixa a atual, e a próxima quando a atual começa a tocar | Playlist de 120 não pode baixar 120 arquivos antes de tocar |
| Cancelamento | `/parar`, sair da call ou limpar a fila cancela o prefetch | Ninguém quer pagar download de música que não vai tocar |
| Ordem da playlist | Original, sem embaralhar | Quem montou a playlist escolheu a ordem |
| Limite da fila | Sobe de 50 para 200 | Item na fila agora é metadado barato, não arquivo baixado |
| Quem pode reordenar | Qualquer um na mesma call | Mesma regra dos botões do painel; travar por dono geraria discussão |
| Tamanho dos menus | 25 opções | Limite do Discord, não escolha nossa |

## Arquitetura

### A mudança de núcleo: fila preguiçosa

Hoje `/tocar` resolve (baixa) **antes** de enfileirar, então todo item da fila já tem
arquivo pronto. Isso não sobrevive a playlist.

`QueueItem` passa a ter dois estados:

```ts
export interface QueueItem {
  youtubeId: string
  title: string
  durationSec: number
  addedBy: string
  addedByName: string
  // nulos enquanto não resolvido — preenchidos quando a faixa é baixada
  trackId: string | null
  driveFile: string | null
}
```

- **Não resolvido** (`trackId === null`): veio da listagem de playlist ou da busca.
  Custa uma linha em memória, nada de disco nem de rede.
- **Resolvido**: passou por `resolveTrack`, tem arquivo no cache e linha no banco.

`PlayerController.advance()` deixa de assumir que o item está pronto:

1. Puxa o próximo da fila.
2. Se não resolvido, chama `resolveTrack` agora e atualiza o item.
3. Manda tocar.
4. **Só então** dispara `prefetchNext()` em segundo plano, sem `await`.

`prefetchNext(guildId)` resolve o primeiro item não resolvido da fila e guarda a
Promise em `Map<guildId, Prefetch>`. Chamar de novo enquanto um prefetch está vivo
não faz nada — é isto que garante o lookahead de exatamente 1.

`cancelPrefetch(guildId)` é chamado em `stop()`, `leave()`, `clear()` e no
`onDisconnect`. O download em curso é abandonado; o que já baixou fica no cache —
não é desperdício, a faixa continua na biblioteca para a próxima vez.

### Fluxo de dados

```
/tocar <link de playlist>
  → listPlaylist()            yt-dlp --flat-playlist, sem baixar nada
  → queue.addMany(N itens NÃO resolvidos)
  → advance() → resolveTrack(1) → voice.play() → prefetchNext() → resolveTrack(2)
                                                                      │
                          faixa 1 acaba → advance() → item 2 JÁ pronto │
                                        → voice.play() → prefetchNext() → resolveTrack(3)
```

## Fluxos

### 1. Playlist por link

`extractYoutubeId` hoje ignora `&list=` de propósito. Passa a existir, antes dele,
uma checagem de playlist:

- URL contém `list=<id>` **e** o id não começa com `RD` (rádio automático do YouTube)
  → trata como playlist.
- Senão → caminho de faixa única de hoje, inalterado.

`listPlaylist(url)` roda `yt-dlp -J --flat-playlist --no-warnings <url>` e devolve:

```ts
export interface PlaylistInfo {
  titulo: string
  entradas: { youtubeId: string; title: string; durationSec: number }[]
}
```

Aplica os mesmos filtros da busca: descarta live e faixas acima de
`MAX_DURATION_SEC`. Corta em `MAX_QUEUE` menos o que já está na fila.

Resposta imediata, sem esperar download: *"Playlist **Rap Nerd** — 47 faixas na
fila"*. Havendo corte, dizer quantas ficaram de fora e por quê.

### 2. `/biblioteca` clicável

Vira menu suspenso com até 25 faixas da guild, ordenadas por `lastPlayedAt` desc.
`/biblioteca <busca>` filtra por título.

Como tudo ali já está resolvido, escolher enfileira **instantaneamente**: só cria o
`QueueItem` já resolvido, sem tocar em rede.

Diferente do menu de busca, **este continua aberto**: a mensagem é editada mostrando
"✓ N adicionadas" e o menu segue clicável. Efêmero, como o de busca.

### 3. `/fila` interativa

Embed com a faixa atual e as próximas, mais um menu de seleção e quatro botões:

| Componente | Ação |
|---|---|
| Menu | Escolhe a faixa alvo (até 25, pela posição na fila) |
| `⤒ Tocar em seguida` | Move a faixa para a posição 0 |
| `↑` | Sobe uma posição |
| `↓` | Desce uma posição |
| `✕` | Remove da fila |

A faixa alvo fica guardada por `guildId:userId` **na camada Discord** (`src/discord/`),
não no `QueueManager` — cada pessoa mexe na sua seleção sem atrapalhar a outra. Após
qualquer ação a mensagem é reeditada com a fila nova.

A seleção guarda o `youtubeId`, não o índice: entre selecionar e clicar, a fila pode
ter andado (a faixa atual terminou) e um índice guardado apontaria para a música
errada.

Só quem está na mesma call do bot pode agir, igual aos botões do painel.

Reordenar pode invalidar o prefetch em curso: se a faixa adiantada não é mais a
próxima, o download atual segue (o arquivo é útil de qualquer forma) e um novo
prefetch é disparado para a nova próxima.

### Novos métodos do QueueManager

```ts
addMany(guildId: string, items: QueueItem[]): { adicionadas: number; cortadas: number }
move(guildId: string, from: number, to: number): boolean
remove(guildId: string, index: number): QueueItem | null
playNext(guildId: string, index: number): boolean          // move(index, 0)
firstUnresolved(guildId: string): { item: QueueItem; index: number } | null
markResolved(guildId: string, youtubeId: string, trackId: string, driveFile: string): void
```

Todos continuam chaveados por `guildId` e sem vazamento entre guilds — já é testado, e
os testes novos estendem a mesma cobertura.

## Tratamento de erro

| Situação | Comportamento |
|---|---|
| Faixa da playlist privada ou removida | Pula para a próxima; uma faixa ruim não trava a fila |
| Playlist inteira indisponível | Erro claro, nada enfileirado |
| Prefetch falha | Silencioso no chat, logado; a faixa é tentada de novo na vez dela |
| Prefetch não terminou na transição | A troca espera o download — pode haver um segundo de silêncio, mas não pula faixa |
| `/parar` no meio | Prefetch cancelado, fila limpa |
| Índice inválido ao mover ou remover | Ignora e reedita a fila (ela pode ter andado entre o clique e a ação) |
| Fila cheia | Diz quantas entraram e quantas não couberam |

## Limites do Discord que moldam o design

- **25 opções** por menu suspenso — vale para a biblioteca e para a fila.
- **5 botões por linha, 5 linhas** por mensagem.
- **3 segundos** para responder uma interação — daí `deferReply`/`deferUpdate` antes
  de qualquer trabalho.
- **1024 caracteres** por campo de embed — a fila já corta por tamanho, e o corte
  passa a valer também para a lista da `/fila` interativa.

## Validação

1. **Automatizado:** detecção de URL de playlist (com `list=`, com `RD`, sem `list=`,
   lixo); `addMany` com corte no limite; `move`, `remove` e `playNext` incluindo
   índices inválidos e bordas (primeiro, último); isolamento entre guilds nas
   operações novas; render do menu da biblioteca e da fila com 0, 1, 25 e 60 itens.
2. **Manual, uma vez:** playlist real de 100+ faixas — conferir que só 2 arquivos
   existem no cache no início; `/parar` no meio e confirmar que parou de baixar.
3. **Só no Discord:** transição entre faixas sem silêncio perceptível, menu que
   continua aberto, reordenar com duas pessoas mexendo ao mesmo tempo.

## Riscos conhecidos

- **A transição é o ponto frágil.** Se o prefetch for mais lento que a faixa atual
  (música curta seguida de download lento), haverá silêncio. Aceito no v1; se
  incomodar, o lookahead vira configurável.
- **Playlist de 200 faixas com títulos longos** pressiona os limites de embed. O corte
  por tamanho já existe e precisa valer também nos componentes novos.
- **Duas pessoas reordenando ao mesmo tempo** podem ver a fila mudar sob o clique. Por
  isso a ação valida o índice e reedita, em vez de errar.
