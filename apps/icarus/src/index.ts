import 'reflect-metadata'
import { Events } from 'discord.js'
import {
  configureShared,
  createClient,
  installEmptyChannelWatch,
  installGuildGuard,
  musicCommandData,
  PanelManager,
  PlayerController,
  QueueManager,
  registerCommands,
  registerMusicHandlers,
  setDataSource,
  VoiceManager,
} from '@bots/shared'
import { buildSharedConfig } from './config'
import { AppDataSource } from './db/data-source'

async function main(): Promise<void> {
  const shared = buildSharedConfig()
  configureShared(shared)

  await AppDataSource.initialize()
  setDataSource(AppDataSource)
  console.log('[icarus] banco conectado')

  await registerCommands(musicCommandData)

  const controller = new PlayerController(new VoiceManager(), new QueueManager())
  const panelManager = new PanelManager(controller)

  const client = createClient()
  installGuildGuard(client)
  registerMusicHandlers(client, controller, panelManager)
  installEmptyChannelWatch(client, controller)

  client.once(Events.ClientReady, (ready) => {
    console.log(`[icarus] conectado como ${ready.user.tag} em ${ready.guilds.cache.size} servidor(es)`)
  })

  await client.login(shared.discord.token)

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[icarus] recebido ${signal}, encerrando`)
    await client.destroy()
    await AppDataSource.destroy()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
  console.error('[icarus] falha no boot:', error)
  process.exit(1)
})
