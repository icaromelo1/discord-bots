import { Events, type ButtonInteraction, type Client, type GuildMember } from 'discord.js'
import { isGuildAllowed } from './client'
import { handleCommand, type CommandContext } from './commands'
import { PANEL_BUTTON_IDS, type PanelManager } from './panel'
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
    } catch (error) {
      console.error('[discord-dj] erro ao processar interação:', error)
    }
  })
}
