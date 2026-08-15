import {
  Events,
  type ButtonInteraction,
  type Client,
  type GuildMember,
  type StringSelectMenuInteraction,
} from 'discord.js'
import { isGuildAllowed } from './client'
import { enfileirarPorId, handleCommand, type CommandContext } from './commands'
import { buildPanel, PANEL_BUTTON_IDS, type PanelManager } from './panel'
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

export function registerInteractionHandlers(
  client: Client,
  controller: PlayerController,
  panelManager: PanelManager,
): void {
  const ctx: CommandContext = { controller, panelManager }

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleCommand(interaction, ctx)
        return
      }
      if (interaction.isButton()) {
        await handleButton(interaction, controller)
        return
      }
      if (interaction.isStringSelectMenu() && interaction.customId === SEARCH_MENU_ID) {
        await handleSearchPick(interaction, ctx)
        return
      }
    } catch (error) {
      console.error('[discord-dj] erro ao processar interação:', error)
    }
  })
}
