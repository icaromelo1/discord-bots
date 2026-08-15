import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type RESTPostAPIApplicationCommandsJSONBody,
  type VoiceBasedChannel,
} from 'discord.js'
import { isGuildAllowed } from '../client'
import { extractPlaylistId, extractYoutubeId, searchYoutube, YtDlpError } from '../../library/ytdlp'
import { isKnown, listLibrary, resolveTrack } from '../../library/library'
import { QueueFullError } from '../../queue/queue'
import type { PlayerController } from '../../player/controller'
import { buildPanel, type PanelManager } from '../panel'
import { buildSearchMenu } from '../search-menu'
import { buildLibraryMenu } from '../library-menu'
import { buildQueuePanel, SelecaoFila } from '../queue-panel'
import { handlePlaylist } from '../playlist'

export interface CommandContext {
  controller: PlayerController
  panelManager: PanelManager
  selecaoFila: SelecaoFila
}


const tocarCommand = new SlashCommandBuilder()
  .setName('tocar')
  .setDescription('Toca uma música do YouTube na sua call')
  .addStringOption((option) =>
    option
      .setName('musica')
      .setDescription('Link do YouTube ou nome da música')
      .setRequired(true),
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

export interface EnfileirarResultado {
  ok: boolean
  erro?: string
}

// Compartilhado entre o /tocar com link e a escolha no menu de busca: os dois
// caminhos precisam das mesmas validações (cooldown, canal divergente) e do mesmo
// tratamento de erro. `reportar` existe porque cada caminho responde ao Discord de
// um jeito diferente — um edita a resposta deferida, o outro a mensagem efêmera.
export async function enfileirarPorId(
  guildId: string,
  youtubeId: string,
  channel: VoiceBasedChannel,
  userId: string,
  userName: string,
  ctx: CommandContext,
  reportar: (texto: string) => void,
): Promise<EnfileirarResultado> {
  const { controller } = ctx

  try {
    if (!(await isKnown(youtubeId))) {
      if (!controller.canDownload(guildId, userId)) {
        return { ok: false, erro: 'Calma — espere alguns segundos entre downloads.' }
      }
      controller.markDownload(guildId, userId)
    }

    const botChannelId = controller.channelId(guildId)
    if (botChannelId && botChannelId !== channel.id) {
      return { ok: false, erro: 'Já estou tocando em outro canal desta guild.' }
    }

    let lastLabel: string | null = null
    const onProgress = (label: string): void => {
      if (label === lastLabel) return
      lastLabel = label
      reportar(label)
    }

    const track = await resolveTrack(guildId, youtubeId, userId, userName, onProgress)
    await controller.enqueue(channel, track, userId, userName)
    return { ok: true }
  } catch (error) {
    if (error instanceof YtDlpError || error instanceof QueueFullError) {
      return { ok: false, erro: error.message }
    }
    console.error('[discord-dj] erro inesperado ao enfileirar:', error)
    return { ok: false, erro: 'Deu ruim aqui — tenta de novo daqui a pouco.' }
  }
}

async function handleTocar(interaction: ChatInputCommandInteraction, guildId: string, ctx: CommandContext): Promise<void> {
  const { controller, panelManager } = ctx

  const channel = memberVoiceChannel(interaction)
  if (!channel) {
    await interaction.reply({ content: 'Entre numa call primeiro.', ephemeral: true })
    return
  }

  const entrada = interaction.options.getString('musica', true)
  const userId = interaction.user.id
  const userName = interaction.user.username

  // playlist antes de tudo: extractYoutubeId ignora o &list= de propósito, então sem
  // esta checagem um link de playlist tocaria só o vídeo que veio junto
  if (extractPlaylistId(entrada)) {
    await interaction.deferReply()
    const resultado = await handlePlaylist(interaction, channel, entrada, controller)
    await interaction.editReply(resultado.mensagem)
    if (resultado.ok) {
      const painel = await interaction.followUp({ ...buildPanel(controller.state(guildId)), ephemeral: false })
      await panelManager.attach(guildId, painel)
    }
    return
  }

  let youtubeId: string | null = null
  try {
    youtubeId = extractYoutubeId(entrada)
  } catch {
    youtubeId = null
  }

  // Não é link: vira busca. Efêmero porque a lista é da pessoa que pediu, e some
  // assim que ela escolhe.
  if (!youtubeId) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const resultados = await searchYoutube(entrada, 5)
      if (resultados.length === 0) {
        await interaction.editReply(`Não achei nada para "${entrada}".`)
        return
      }
      await interaction.editReply(buildSearchMenu(entrada, resultados))
    } catch (error) {
      if (error instanceof YtDlpError) {
        await interaction.editReply(error.message)
        return
      }
      console.error('[discord-dj] erro inesperado na busca:', error)
      await interaction.editReply('Não consegui buscar agora — tenta de novo daqui a pouco.')
    }
    return
  }

  await interaction.deferReply()

  const resultado = await enfileirarPorId(guildId, youtubeId, channel, userId, userName, ctx, (texto) => {
    void interaction.editReply(texto).catch(() => {})
  })

  if (!resultado.ok) {
    await interaction.editReply(resultado.erro ?? 'Não deu certo.')
    return
  }

  // content vazio de propósito: sem isso a última label de progresso fica grudada
  // acima do painel para sempre
  const msg = await interaction.editReply({ content: '', ...buildPanel(controller.state(guildId)) })
  await panelManager.attach(guildId, msg)
}

async function handleFila(interaction: ChatInputCommandInteraction, guildId: string, ctx: CommandContext): Promise<void> {
  const selecionado = ctx.selecaoFila.get(guildId, interaction.user.id)
  await interaction.reply({ ...buildQueuePanel(ctx.controller.state(guildId), selecionado), ephemeral: true })
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
  const busca = interaction.options.getString('busca') ?? null
  const entries = await listLibrary(guildId, busca ?? undefined)
  await interaction.reply({ ...buildLibraryMenu(entries, busca, 0), ephemeral: true })
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
