import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type RESTPostAPIApplicationCommandsJSONBody,
  type VoiceBasedChannel,
} from 'discord.js'
import { isGuildAllowed } from '../client'
import { extractYoutubeId, YtDlpError } from '../../library/ytdlp'
import { isKnown, listLibrary, resolveTrack } from '../../library/library'
import { QueueFullError } from '../../queue/queue'
import type { PlayerController } from '../../player/controller'
import { buildPanel, type PanelManager } from '../panel'

export interface CommandContext {
  controller: PlayerController
  panelManager: PanelManager
}

const EMBED_COLOR = 0x5865f2

const tocarCommand = new SlashCommandBuilder()
  .setName('tocar')
  .setDescription('Toca uma música do YouTube na sua call')
  .addStringOption((option) =>
    option.setName('link').setDescription('Link do YouTube').setRequired(true),
  )

const filaCommand = new SlashCommandBuilder().setName('fila').setDescription('Lista a fila de reprodução')

const pularCommand = new SlashCommandBuilder().setName('pular').setDescription('Pula para a próxima música')

const pausarCommand = new SlashCommandBuilder()
  .setName('pausar')
  .setDescription('Pausa ou retoma a reprodução')

const pararCommand = new SlashCommandBuilder()
  .setName('parar')
  .setDescription('Para a reprodução e limpa a fila')

const sairCommand = new SlashCommandBuilder().setName('sair').setDescription('Desconecta o bot da call')

const bibliotecaCommand = new SlashCommandBuilder()
  .setName('biblioteca')
  .setDescription('Lista o catálogo de músicas desta guild')
  .addStringOption((option) =>
    option.setName('busca').setDescription('Filtrar pelo título da música').setRequired(false),
  )

export const commandData: RESTPostAPIApplicationCommandsJSONBody[] = [
  tocarCommand,
  filaCommand,
  pularCommand,
  pausarCommand,
  pararCommand,
  sairCommand,
  bibliotecaCommand,
].map((builder) => builder.toJSON())

function formatDuration(totalSec: number): string {
  const seconds = Math.max(0, Math.floor(totalSec))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const paddedSecs = String(secs).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSecs}`
  }
  return `${minutes}:${paddedSecs}`
}

async function guardGuild(interaction: ChatInputCommandInteraction): Promise<string | null> {
  const guildId = interaction.guildId
  if (!guildId || !isGuildAllowed(guildId)) {
    await interaction.reply({ content: 'Este servidor não está autorizado a usar o bot.', ephemeral: true }).catch(() => {})
    return null
  }
  return guildId
}

function memberVoiceChannel(interaction: ChatInputCommandInteraction): VoiceBasedChannel | null {
  const member = interaction.member as GuildMember | null
  return member?.voice?.channel ?? null
}

async function requireSameCallAsBot(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  controller: PlayerController,
): Promise<boolean> {
  const channel = memberVoiceChannel(interaction)
  if (!channel) {
    await interaction.reply({ content: 'Entre numa call primeiro.', ephemeral: true })
    return false
  }

  const botChannelId = controller.channelId(guildId)
  if (!botChannelId || channel.id !== botChannelId) {
    await interaction.reply({
      content: 'Entre na mesma call que o bot para controlar a reprodução.',
      ephemeral: true,
    })
    return false
  }

  return true
}

async function handleTocar(interaction: ChatInputCommandInteraction, guildId: string, ctx: CommandContext): Promise<void> {
  const { controller, panelManager } = ctx

  const channel = memberVoiceChannel(interaction)
  if (!channel) {
    await interaction.reply({ content: 'Entre numa call primeiro.', ephemeral: true })
    return
  }

  await interaction.deferReply()

  const link = interaction.options.getString('link', true)
  const userId = interaction.user.id
  const userName = interaction.user.username

  try {
    const youtubeId = extractYoutubeId(link)

    if (!(await isKnown(youtubeId))) {
      if (!controller.canDownload(guildId, userId)) {
        await interaction.editReply('Calma — espere alguns segundos entre downloads.')
        return
      }
      controller.markDownload(guildId, userId)
    }

    const botChannelId = controller.channelId(guildId)
    if (botChannelId && botChannelId !== channel.id) {
      await interaction.editReply('Já estou tocando em outro canal desta guild.')
      return
    }

    let lastLabel: string | null = null
    const onProgress = (label: string): void => {
      if (label === lastLabel) return
      lastLabel = label
      void interaction.editReply(label).catch(() => {})
    }

    const track = await resolveTrack(guildId, youtubeId, userId, userName, onProgress)
    await controller.enqueue(channel, track, userId, userName)

    // content vazio de propósito: sem isso a última label de progresso fica grudada
    // acima do painel para sempre
    const msg = await interaction.editReply({ content: '', ...buildPanel(controller.state(guildId)) })
    await panelManager.attach(guildId, msg)
  } catch (error) {
    if (error instanceof YtDlpError) {
      await interaction.editReply(error.message)
      return
    }
    if (error instanceof QueueFullError) {
      await interaction.editReply(error.message)
      return
    }
    console.error('[discord-dj] erro inesperado em /tocar:', error)
    await interaction.editReply('Deu ruim aqui — tenta de novo daqui a pouco.')
  }
}

async function handleFila(interaction: ChatInputCommandInteraction, guildId: string, ctx: CommandContext): Promise<void> {
  const state = ctx.controller.state(guildId)
  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Fila')

  if (!state.current && state.items.length === 0) {
    embed.setDescription('Fila vazia.')
  } else {
    const lines: string[] = []
    if (state.current) {
      lines.push(`Tocando agora: **${state.current.title}** — pedido por ${state.current.addedByName}`)
    }
    state.items.forEach((item, index) => {
      lines.push(`${index + 1}. **${item.title}** (${formatDuration(item.durationSec)}) — pedido por ${item.addedByName}`)
    })
    embed.setDescription(lines.join('\n'))
  }

  await interaction.reply({ embeds: [embed] })
}

async function handlePular(interaction: ChatInputCommandInteraction, guildId: string, ctx: CommandContext): Promise<void> {
  if (!(await requireSameCallAsBot(interaction, guildId, ctx.controller))) return
  await ctx.controller.skip(guildId)
  await interaction.reply({ content: 'Pulando para a próxima.', ephemeral: true })
}

async function handlePausar(interaction: ChatInputCommandInteraction, guildId: string, ctx: CommandContext): Promise<void> {
  if (!(await requireSameCallAsBot(interaction, guildId, ctx.controller))) return

  const { controller } = ctx
  const state = controller.state(guildId)
  if (state.paused) {
    controller.resume(guildId)
    await interaction.reply({ content: 'Retomando.', ephemeral: true })
  } else {
    controller.pause(guildId)
    await interaction.reply({ content: 'Pausado.', ephemeral: true })
  }
}

async function handleParar(interaction: ChatInputCommandInteraction, guildId: string, ctx: CommandContext): Promise<void> {
  if (!(await requireSameCallAsBot(interaction, guildId, ctx.controller))) return
  ctx.controller.stop(guildId)
  await interaction.reply({ content: 'Parado e fila limpa.', ephemeral: true })
}

async function handleSair(interaction: ChatInputCommandInteraction, guildId: string, ctx: CommandContext): Promise<void> {
  if (!(await requireSameCallAsBot(interaction, guildId, ctx.controller))) return
  ctx.controller.leave(guildId)
  ctx.panelManager.forget(guildId)
  await interaction.reply({ content: 'Saindo da call.', ephemeral: true })
}

async function handleBiblioteca(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const busca = interaction.options.getString('busca') ?? undefined
  const entries = await listLibrary(guildId, busca)

  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Biblioteca')

  if (entries.length === 0) {
    embed.setDescription('Esta guild ainda não tem nada na biblioteca.')
  } else {
    embed.setDescription(entries.map((entry) => `**${entry.title}** (${formatDuration(entry.durationSec)})`).join('\n'))
  }

  await interaction.reply({ embeds: [embed] })
}

export async function handleCommand(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<void> {
  const guildId = await guardGuild(interaction)
  if (!guildId) return

  switch (interaction.commandName) {
    case 'tocar':
      await handleTocar(interaction, guildId, ctx)
      return
    case 'fila':
      await handleFila(interaction, guildId, ctx)
      return
    case 'pular':
      await handlePular(interaction, guildId, ctx)
      return
    case 'pausar':
      await handlePausar(interaction, guildId, ctx)
      return
    case 'parar':
      await handleParar(interaction, guildId, ctx)
      return
    case 'sair':
      await handleSair(interaction, guildId, ctx)
      return
    case 'biblioteca':
      await handleBiblioteca(interaction, guildId)
      return
    default:
      return
  }
}
