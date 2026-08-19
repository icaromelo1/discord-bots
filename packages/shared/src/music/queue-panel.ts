import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js'
import type { PlayerState } from '../player/controller'
import type { QueueItem } from '../queue/queue'
import { formatDuration } from './search-menu'

export const QUEUE_IDS = {
  select: 'dj:q:sel',
  playNext: 'dj:q:next',
  up: 'dj:q:up',
  down: 'dj:q:down',
  remove: 'dj:q:rm',
} as const

const EMBED_COLOR = 0x5865f2
const FIELD_BUDGET = 900
const LABEL_MAX = 100
const MAX_SELECT_OPTIONS = 25

function truncate(texto: string, max: number): string {
  if (texto.length <= max) return texto
  return `${texto.slice(0, max - 1)}…`
}

function formatQueueLine(item: QueueItem, index: number): string {
  return `${index + 1}. **${item.title}** (${formatDuration(item.durationSec)}) — ${item.addedByName}`
}

// Campo de embed do Discord estoura em 1024 caracteres e a mensagem inteira falha —
// o corte é por tamanho acumulado, não só por quantidade de itens.
function buildQueueField(items: QueueItem[]): string {
  if (items.length === 0) return 'Fila vazia.'

  const lines: string[] = []
  let used = 0
  let shown = 0

  for (const item of items) {
    const line = formatQueueLine(item, shown)
    if (used + line.length + 1 > FIELD_BUDGET) break
    lines.push(line)
    used += line.length + 1
    shown++
  }

  const remaining = items.length - shown
  if (remaining > 0) lines.push(`… e mais ${remaining}`)

  return lines.join('\n')
}

function buildTitle(count: number): string {
  return `Fila — ${count} faixa${count === 1 ? '' : 's'}`
}

export function buildQueuePanel(
  state: PlayerState,
  selecionado: string | null,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle(buildTitle(state.items.length))

  // a faixa atual NÃO está em items — ela sai da fila ao começar a tocar. Checar só
  // items.length aqui fazia o painel dizer "Fila vazia" com música no ar, que foi
  // exatamente o que aconteceu ao tocar uma playlist de uma faixa só.
  const linhas: string[] = []
  if (state.current) {
    linhas.push(`▶ Tocando: **${state.current.title}** — pedido por ${state.current.addedByName}`)
  }
  if (state.items.length === 0) {
    linhas.push(state.current ? 'Nada mais na fila.' : 'Fila vazia.')
  }
  if (linhas.length > 0) embed.setDescription(linhas.join('\n'))

  if (state.items.length > 0) {
    embed.addFields({ name: 'Próximas', value: buildQueueField(state.items) })
  }

  const isEmpty = state.items.length === 0

  const menu = new StringSelectMenuBuilder()
    .setCustomId(QUEUE_IDS.select)
    .setPlaceholder('Escolher faixa...')
    .setDisabled(isEmpty)

  if (isEmpty) {
    menu.addOptions(new StringSelectMenuOptionBuilder().setLabel('—').setValue('placeholder'))
  } else {
    menu.addOptions(
      state.items.slice(0, MAX_SELECT_OPTIONS).map((item, index) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(item.title, LABEL_MAX))
          .setValue(item.youtubeId)
          .setDescription(`${index + 1} · ${formatDuration(item.durationSec)}`)
          .setDefault(item.youtubeId === selecionado),
      ),
    )
  }

  const semAlvo = isEmpty || selecionado === null

  const playNextButton = new ButtonBuilder()
    .setCustomId(QUEUE_IDS.playNext)
    .setStyle(ButtonStyle.Primary)
    .setLabel('⤒ Tocar em seguida')
    .setDisabled(semAlvo)

  const upButton = new ButtonBuilder()
    .setCustomId(QUEUE_IDS.up)
    .setStyle(ButtonStyle.Secondary)
    .setLabel('↑')
    .setDisabled(semAlvo)

  const downButton = new ButtonBuilder()
    .setCustomId(QUEUE_IDS.down)
    .setStyle(ButtonStyle.Secondary)
    .setLabel('↓')
    .setDisabled(semAlvo)

  const removeButton = new ButtonBuilder()
    .setCustomId(QUEUE_IDS.remove)
    .setStyle(ButtonStyle.Danger)
    .setLabel('✕')
    .setDisabled(semAlvo)

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    playNextButton,
    upButton,
    downButton,
    removeButton,
  )

  return { embeds: [embed], components: [selectRow, buttonRow] }
}

// Seleção guarda o youtubeId, não o índice: entre a pessoa escolher e clicar num
// botão a fila pode ter andado, e um índice guardado apontaria pra música errada.
export class SelecaoFila {
  private readonly selecoes = new Map<string, string>()

  private key(guildId: string, userId: string): string {
    return `${guildId}:${userId}`
  }

  get(guildId: string, userId: string): string | null {
    return this.selecoes.get(this.key(guildId, userId)) ?? null
  }

  set(guildId: string, userId: string, youtubeId: string): void {
    this.selecoes.set(this.key(guildId, userId), youtubeId)
  }

  clear(guildId: string, userId: string): void {
    this.selecoes.delete(this.key(guildId, userId))
  }
}
