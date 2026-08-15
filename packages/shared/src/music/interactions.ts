import { logPrefix } from '../config'
import {
  Events,
  type ButtonInteraction,
  type Client,
  type GuildMember,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js'
import { isGuildAllowed } from '../discord/client'
import { enfileirarPorId, handleCommand, MUSIC_COMMAND_NAMES, type CommandContext } from './commands'
import { buildPanel, PANEL_BUTTON_IDS, type PanelManager } from './panel'
import { buildLibraryMenu, entradaParaItem, LIBRARY_MENU_ID } from './library-menu'
import { buildQueuePanel, QUEUE_IDS, SelecaoFila } from './queue-panel'
import { listLibrary } from '../library/library'
import { SEARCH_MENU_ID } from './search-menu'
import type { PlayerController } from '../player/controller'

async function handleButton(interaction: ButtonInteraction, controller: PlayerController): Promise<void> {
  const guildId = interaction.guildId
  if (!guildId || !isGuildAllowed(guildId)) {
    await interaction.reply({ content: 'Este servidor não está autorizado a usar o bot.', ephemeral: true })
    return
  }

  const member = interaction.member as GuildMember | null
  const memberChannelId = member?.voice?.channelId ?? null
  const botChannelId = controller.channelId(guildId)

  if (!botChannelId || memberChannelId !== botChannelId) {
    await interaction.reply({
      content: 'Entre na mesma call que o bot para controlar a reprodução.',
      ephemeral: true,
    })
    return
  }

  // ack antes da ação: pular pode levar segundos (baixar a próxima do Drive) e o
  // Discord expira a interação em 3s. O painel se reedita sozinho via onStateChange.
  await interaction.deferUpdate()

  switch (interaction.customId) {
    case PANEL_BUTTON_IDS.playPause: {
      const state = controller.state(guildId)
      if (state.paused) controller.resume(guildId)
      else controller.pause(guildId)
      break
    }
    case PANEL_BUTTON_IDS.skip:
      await controller.skip(guildId)
      break
    case PANEL_BUTTON_IDS.stop:
      controller.stop(guildId)
      break
    default:
      break
  }
}

// Biblioteca: a faixa já está baixada, então enfileira na hora — e o menu CONTINUA
// aberto, para dar pra montar a fila clicando várias vezes seguidas.
async function handleLibraryPick(interaction: StringSelectMenuInteraction, ctx: CommandContext): Promise<void> {
  const guildId = interaction.guildId
  if (!guildId || !isGuildAllowed(guildId)) return

  const member = interaction.member as GuildMember | null
  const channel = member?.voice?.channel ?? null
  if (!channel) {
    await interaction.update({ content: 'Entre numa call primeiro.', embeds: [], components: [] })
    return
  }

  const youtubeId = interaction.values[0]
  await interaction.deferUpdate()

  // a busca é recuperada do próprio título do embed: sem isso, adicionar uma faixa
  // recarregaria a biblioteca inteira e o filtro que a pessoa digitou sumiria
  const busca = extrairBusca(interaction.message.embeds[0]?.title ?? '')
  const entradas = await listLibrary(guildId, busca ?? undefined)
  const entrada = entradas.find((item) => item.youtubeId === youtubeId)
  if (!entrada) {
    await interaction.editReply({ content: 'Essa faixa não está mais na biblioteca.' })
    return
  }

  try {
    await ctx.controller.enqueueMany(channel, [
      entradaParaItem(entrada, interaction.user.id, interaction.user.username),
    ])
  } catch (error) {
    console.error(`${logPrefix()} falha ao enfileirar da biblioteca:`, error)
    await interaction.editReply({ content: 'Não deu pra adicionar essa faixa agora.' })
    return
  }

  const jaAdicionadas = contarAdicionadas(interaction.message.embeds[0]?.description ?? '') + 1
  await interaction.editReply(buildLibraryMenu(entradas, busca, jaAdicionadas))
}

// O contador vive no próprio embed em vez de num Map na memória: assim ele sobrevive
// a restart do container e não precisa ser limpo quando a mensagem some.
function contarAdicionadas(descricao: string): number {
  const match = descricao.match(/✓ (\d+) adicionad/)
  return match ? Number.parseInt(match[1], 10) : 0
}

function extrairBusca(titulo: string): string | null {
  const match = titulo.match(/^Biblioteca — "(.+)"$/)
  return match ? match[1] : null
}

async function handleQueueInteraction(
  interaction: StringSelectMenuInteraction | ButtonInteraction,
  ctx: CommandContext,
): Promise<void> {
  const guildId = interaction.guildId
  if (!guildId || !isGuildAllowed(guildId)) return

  const member = interaction.member as GuildMember | null
  const botChannelId = ctx.controller.channelId(guildId)
  // sem o !botChannelId a comparação null !== null passaria: bot fora da call e
  // pessoa fora da call dariam "mesma call"
  if (!botChannelId || member?.voice?.channelId !== botChannelId) {
    await interaction.reply({
      content: 'Entre na mesma call que o bot para mexer na fila.',
      ephemeral: true,
    })
    return
  }

  const userId = interaction.user.id

  if (interaction.isStringSelectMenu()) {
    ctx.selecaoFila.set(guildId, userId, interaction.values[0])
    await interaction.update(buildQueuePanel(ctx.controller.state(guildId), interaction.values[0]))
    return
  }

  const selecionado = ctx.selecaoFila.get(guildId, userId)
  if (!selecionado) {
    await interaction.reply({ content: 'Escolha uma faixa no menu primeiro.', ephemeral: true })
    return
  }

  // o índice é recalculado no momento do clique: a fila pode ter andado desde a
  // seleção, e um índice guardado apontaria para a música errada
  const itens = ctx.controller.state(guildId).items
  const indice = itens.findIndex((item) => item.youtubeId === selecionado)
  if (indice === -1) {
    ctx.selecaoFila.clear(guildId, userId)
    await interaction.update(buildQueuePanel(ctx.controller.state(guildId), null))
    return
  }

  switch (interaction.customId) {
    case QUEUE_IDS.playNext:
      ctx.controller.moverNaFila(guildId, indice, 0)
      break
    case QUEUE_IDS.up:
      ctx.controller.moverNaFila(guildId, indice, indice - 1)
      break
    case QUEUE_IDS.down:
      ctx.controller.moverNaFila(guildId, indice, indice + 1)
      break
    case QUEUE_IDS.remove:
      ctx.controller.removerDaFila(guildId, indice)
      ctx.selecaoFila.clear(guildId, userId)
      break
    default:
      break
  }

  const aindaSelecionado = interaction.customId === QUEUE_IDS.remove ? null : selecionado
  await interaction.update(buildQueuePanel(ctx.controller.state(guildId), aindaSelecionado))
}

async function handleSearchPick(interaction: StringSelectMenuInteraction, ctx: CommandContext): Promise<void> {
  const guildId = interaction.guildId
  if (!guildId || !isGuildAllowed(guildId)) return

  const member = interaction.member as GuildMember | null
  const channel = member?.voice?.channel ?? null
  if (!channel) {
    await interaction.update({ content: 'Entre numa call primeiro.', embeds: [], components: [] })
    return
  }

  const youtubeId = interaction.values[0]

  // update em vez de deferUpdate: troca o menu por "preparando..." na hora, senão a
  // lista fica clicável enquanto o download acontece e dá pra escolher duas vezes
  await interaction.update({ content: 'Preparando...', embeds: [], components: [] })

  const resultado = await enfileirarPorId(
    guildId,
    youtubeId,
    channel,
    interaction.user.id,
    interaction.user.username,
    ctx,
    (texto) => {
      void interaction.editReply({ content: texto }).catch(() => {})
    },
  )

  if (!resultado.ok) {
    await interaction.editReply({ content: resultado.erro ?? 'Não deu certo.' })
    return
  }

  await interaction.editReply({ content: 'Adicionado à fila.' })

  // a mensagem da busca é efêmera e ninguém mais a vê; o painel precisa ser público
  const painel = await interaction.followUp({
    ...buildPanel(ctx.controller.state(guildId)),
    ephemeral: false,
  })
  await ctx.panelManager.attach(guildId, painel)
}

export function createMusicContext(controller: PlayerController, panelManager: PanelManager): CommandContext {
  return { controller, panelManager, selecaoFila: new SelecaoFila() }
}

/**
 * Trata uma interação se ela pertencer à música. Devolve `true` quando tratou.
 *
 * Devolve booleano em vez de registrar o próprio listener porque o Icarus tem
 * interações próprias além das de música: quem compõe o roteamento é o app, que
 * tenta a música primeiro e cai no que é dele quando esta função recusa.
 */
export async function handleMusicInteraction(interaction: Interaction, ctx: CommandContext): Promise<boolean> {
  if (interaction.isChatInputCommand()) {
    if (!MUSIC_COMMAND_NAMES.has(interaction.commandName)) return false
    await handleCommand(interaction, ctx)
    return true
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('dj:q:')) {
      await handleQueueInteraction(interaction, ctx)
      return true
    }
    if (interaction.customId.startsWith('dj:')) {
      await handleButton(interaction, ctx.controller)
      return true
    }
    return false
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === SEARCH_MENU_ID) {
      await handleSearchPick(interaction, ctx)
      return true
    }
    if (interaction.customId === LIBRARY_MENU_ID) {
      await handleLibraryPick(interaction, ctx)
      return true
    }
    if (interaction.customId === QUEUE_IDS.select) {
      await handleQueueInteraction(interaction, ctx)
      return true
    }
  }

  return false
}

/** Atalho para app que só tem música: registra o listener e trata tudo. */
export function registerMusicHandlers(
  client: Client,
  controller: PlayerController,
  panelManager: PanelManager,
): CommandContext {
  const ctx = createMusicContext(controller, panelManager)

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      await handleMusicInteraction(interaction, ctx)
    } catch (error) {
      console.error(`${logPrefix()} erro ao processar interação:`, error)
    }
  })

  return ctx
}
