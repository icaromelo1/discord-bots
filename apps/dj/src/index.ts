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
import { iniciarDuckingServer } from './ducking-server'

async function main(): Promise<void> {
  // antes de qualquer coisa que use a base compartilhada: ela lança se for usada
  // sem configuração, e é de propósito — falha no boot, não no meio de uma call
  const shared = buildSharedConfig()
  configureShared(shared)

  await AppDataSource.initialize()
  setDataSource(AppDataSource)
  console.log('[dj] banco conectado')

  await registerCommands(musicCommandData)

  const voiceManager = new VoiceManager()
  const controller = new PlayerController(voiceManager, new QueueManager())
  const panelManager = new PanelManager(controller)

  // ducking é conforto, não requisito: se a porta estiver ocupada, loga e segue sem
  // travar o boot do DJ
  const duckingPorta = Number(process.env.DUCKING_PORT || '8099')
  let duckingServer: ReturnType<typeof iniciarDuckingServer> | null = null
  try {
    duckingServer = iniciarDuckingServer(voiceManager, duckingPorta)
    duckingServer.on('error', (error) => {
      console.error('[dj] servidor de ducking falhou:', error)
      duckingServer = null
    })
  } catch (error) {
    console.error('[dj] não foi possível iniciar o servidor de ducking:', error)
  }

  const client = createClient()
  installGuildGuard(client)
  registerMusicHandlers(client, controller, panelManager)
  installEmptyChannelWatch(client, controller)

  client.once(Events.ClientReady, (ready) => {
    console.log(`[dj] conectado como ${ready.user.tag} em ${ready.guilds.cache.size} servidor(es)`)
  })

  await client.login(shared.discord.token)

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[dj] recebido ${signal}, encerrando`)
    const servidor = duckingServer
    if (servidor) await new Promise<void>((resolve) => servidor.close(() => resolve()))
    await client.destroy()
    await AppDataSource.destroy()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
  console.error('[dj] falha no boot:', error)
  process.exit(1)
})
