import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type Message } from 'discord.js'
import type { PlayerController, PlayerState } from '../player/controller'
import type { QueueItem } from '../queue/queue'

// sem botão de volume: cada pessoa ajusta o volume do bot no próprio Discord
// (botão direito no bot → Volume do Usuário), que é por ouvinte e não afeta os outros
export const PANEL_BUTTON_IDS = {
  playPause: 'dj:playpause',
  skip: 'dj:skip',
  stop: 'dj:stop',
} as const

const EMBED_COLOR = 0x5865f2
const PROGRESS_BAR_LENGTH = 10
const MAX_QUEUE_LINES = 10
const FIELD_BUDGET = 900

function formatDuration(totalSec: number): string {
  const seconds = Math.max(0, Math.floor(totalSec))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const paddedSecs = String(secs).padStart(2, '0')

  if (hours > 0) {
    const paddedMinutes = String(minutes).padStart(2, '0')
    return `${hours}:${paddedMinutes}:${paddedSecs}`
  }
  return `${minutes}:${paddedSecs}`
}

function buildProgressBar(startedAt: number, durationSec: number): string {
  const elapsedSec = Math.max(0, (Date.now() - startedAt) / 1000)
  const ratio = durationSec > 0 ? Math.min(1, elapsedSec / durationSec) : 0
  const filledSlots = Math.round(ratio * PROGRESS_BAR_LENGTH)
  const knobIndex = Math.min(filledSlots, PROGRESS_BAR_LENGTH)

  const bar = Array.from({ length: PROGRESS_BAR_LENGTH + 1 }, (_, index) =>
    index === knobIndex ? '🔘' : '▬',
  ).join('')

  return `${bar} ${formatDuration(elapsedSec)} / ${formatDuration(durationSec)}`
}

function formatQueueLine(item: QueueItem, index: number): string {
  return `${index + 1}. **${item.title}** — pedido por ${item.addedByName}`
}

// Campo de embed do Discord estoura em 1024 caracteres e a edição inteira falha —
// com títulos longos do YouTube 10 linhas passam disso, então o corte é por
// tamanho, não só por quantidade.
function buildQueueField(items: QueueItem[]): string {
  if (items.length === 0) return 'Nada na fila.'

  const lines: string[] = []
  let used = 0
  let shown = 0

  for (const item of items.slice(0, MAX_QUEUE_LINES)) {
    const line = formatQueueLine(item, shown)
    if (used + line.length + 1 > FIELD_BUDGET) break
    lines.push(line)
    used += line.length + 1
    shown++
  }

  const remaining = items.length - shown
  if (remaining > 0) lines.push(`… e mais ${remaining}`)

  return lines.length > 0 ? lines.join('\n') : `${items.length} na fila`
}

export function buildPanel(state: PlayerState): {
  embeds: EmbedBuilder[]
  components: ActionRowBuilder<ButtonBuilder>[]
} {
  const embed = new EmbedBuilder().setColor(EMBED_COLOR)

  if (!state.current) {
    embed.setTitle('Fila vazia').setDescription('Nada tocando no momento.')
  } else {
    const descriptionLines = [`Pedido por ${state.current.addedByName}`]
    if (state.startedAt !== null) {
      descriptionLines.push(buildProgressBar(state.startedAt, state.current.durationSec))
    } else {
      descriptionLines.push(formatDuration(state.current.durationSec))
    }

    embed.setTitle(state.current.title).setDescription(descriptionLines.join('\n'))
  }

  embed.addFields({ name: 'Próximas', value: buildQueueField(state.items) })

  const nothingPlaying = state.current === null

  const playPauseButton = new ButtonBuilder()
    .setCustomId(PANEL_BUTTON_IDS.playPause)
    .setStyle(ButtonStyle.Primary)
    .setEmoji('⏯')
    .setLabel(state.paused ? 'Retomar' : 'Pausar')
    .setDisabled(nothingPlaying)

  const skipButton = new ButtonBuilder()
    .setCustomId(PANEL_BUTTON_IDS.skip)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏭')
    .setLabel('Pular')
    .setDisabled(nothingPlaying)

  const stopButton = new ButtonBuilder()
    .setCustomId(PANEL_BUTTON_IDS.stop)
    .setStyle(ButtonStyle.Danger)
    .setEmoji('⏹')
    .setLabel('Parar')
    .setDisabled(nothingPlaying)

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(playPauseButton, skipButton, stopButton)

  return { embeds: [embed], components: [row] }
}

export class PanelManager {
  private readonly messages = new Map<string, Message>()

  constructor(private readonly controller: PlayerController) {
    this.controller.onStateChange((guildId) => void this.refresh(guildId))
  }

  async attach(guildId: string, message: Message): Promise<void> {
    this.messages.set(guildId, message)
  }

  async refresh(guildId: string): Promise<void> {
    const message = this.messages.get(guildId)
    if (!message) return

    const state = this.controller.state(guildId)
    try {
      await message.edit(buildPanel(state))
    } catch (error) {
      console.error(`[discord-dj] falha ao reeditar painel da guild ${guildId}:`, error)
      this.forget(guildId)
    }
  }

  forget(guildId: string): void {
    this.messages.delete(guildId)
  }
}
