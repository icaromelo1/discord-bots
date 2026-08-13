import 'reflect-metadata'
import { Events } from 'discord.js'
import { config } from './config'
import { AppDataSource } from './db/data-source'
import { createClient, installGuildGuard } from './discord/client'
import { commandData } from './discord/commands'
import { installEmptyChannelWatch } from './discord/empty-channel-watch'
import { registerInteractionHandlers } from './discord/interactions'
import { PanelManager } from './discord/panel'
import { registerCommands } from './discord/register-commands'
import { PlayerController } from './player/controller'
import { QueueManager } from './queue/queue'
import { VoiceManager } from './voice/voice'

async function main(): Promise<void> {
  await AppDataSource.initialize()
  console.log('[discord-dj] banco conectado')

  await registerCommands(commandData)

  const controller = new PlayerController(new VoiceManager(), new QueueManager())
  const panelManager = new PanelManager(controller)

  const client = createClient()
  installGuildGuard(client)
  registerInteractionHandlers(client, controller, panelManager)
  installEmptyChannelWatch(client, controller)

  client.once(Events.ClientReady, (ready) => {
    console.log(`[discord-dj] conectado como ${ready.user.tag} em ${ready.guilds.cache.size} servidor(es)`)
  })

  await client.login(config.discord.token)

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[discord-dj] recebido ${signal}, encerrando`)
    await client.destroy()
    await AppDataSource.destroy()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
  console.error('[discord-dj] falha no boot:', error)
  process.exit(1)
})
