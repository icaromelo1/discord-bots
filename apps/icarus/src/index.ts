import 'reflect-metadata'
import { Events, type Interaction, type TextBasedChannel } from 'discord.js'
import {
  configureShared,
  createClient,
  createMusicContext,
  handleMusicInteraction,
  installEmptyChannelWatch,
  installGuildGuard,
  musicCommandData,
  PanelManager,
  PlayerController,
  QueueManager,
  registerCommands,
  setDataSource,
  VoiceManager,
} from '@bots/shared'
import { buildSharedConfig, config } from './config'
import { AppDataSource } from './db/data-source'
import { Conversa } from './conversa'
import { Ears } from './ears/ears'
import { Mouth } from './mouth/mouth'
import { Ducking } from './mouth/ducking'
import { WakeDetector } from './wake/wake'
import { FilaDeTranscricao } from './memory/fila'
import { TranscritorDesligado, WhisperCppTranscritor } from './memory/transcritor'
import { esquecerUsuario, resumoDoQueSabe } from './memory/repositorio'
import { handleIcarusCommand, icarusCommandData, type IcarusCommandContext } from './discord/comandos'

async function main(): Promise<void> {
  const shared = buildSharedConfig()
  configureShared(shared)

  await AppDataSource.initialize()
  setDataSource(AppDataSource)
  console.log('[icarus] banco conectado')

  // música e comandos próprios registrados juntos: são o mesmo bot
  await registerCommands([...musicCommandData, ...icarusCommandData])

  const voice = new VoiceManager()
  const controller = new PlayerController(voice, new QueueManager())
  const panelManager = new PanelManager(controller)
  const musicCtx = createMusicContext(controller, panelManager)

  const client = createClient()

  // dois transcritores porque as exigências são opostas: o da palavra de ativação
  // precisa responder em ~1s (tiny), o da memória pode atrasar minutos e prefere
  // precisão (base). Medido nesta VM: tiny faz 3s de áudio em 0,96s; base em 1,93s.
  const transcritorWake = config.memoria.whisperBin
    ? new WhisperCppTranscritor(config.memoria.whisperBin, config.memoria.whisperModelWake, config.voz.wakeWord)
    : new TranscritorDesligado()
  const transcritorMemoria = config.memoria.whisperBin
    ? new WhisperCppTranscritor(config.memoria.whisperBin, config.memoria.whisperModelMemoria, config.voz.wakeWord)
    : new TranscritorDesligado()
  if (!transcritorWake.disponivel()) {
    console.warn('[icarus] Whisper não configurado: memória de ambiente e palavra de ativação desligadas')
  }

  const fila = new FilaDeTranscricao(transcritorMemoria)
  const ears = new Ears((userId) => client.users.cache.get(userId)?.bot ?? false)
  const mouth = new Mouth(voice)
  const ducking = new Ducking(config.ducking.djUrl, config.ducking.volumeAoFalar)
  const wake = new WakeDetector(transcritorWake, config.voz.wakeWord)

  const canaisDeAviso = new Map<string, TextBasedChannel>()
  const conversa = new Conversa(voice, controller, ears, mouth, wake, fila, ducking, (guildId, texto) => {
    const canal = canaisDeAviso.get(guildId)
    if (canal?.isSendable()) void canal.send(texto).catch(() => {})
  })

  const icarusCtx: IcarusCommandContext = {
    entrar: async (channel) => {
      const nomes = new Map<string, string>()
      for (const [id, member] of channel.members) {
        if (!member.user.bot) nomes.set(id, member.displayName)
      }
      conversa.entrar(channel, nomes)
    },
    sair: (guildId) => conversa.sair(guildId),
    ondeEstou: () => conversa.onde(),
    memoriaDe: (guildId, userId) => resumoDoQueSabe(guildId, userId),
    esquecer: (guildId, userId) => esquecerUsuario(guildId, userId),
  }

  installGuildGuard(client)
  installEmptyChannelWatch(client, controller)

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.channel?.isSendable()) {
        canaisDeAviso.set(interaction.guildId ?? '', interaction.channel)
      }
      // música primeiro, comandos próprios depois: o handler compartilhado recusa o
      // que não é dele devolvendo false
      if (await handleMusicInteraction(interaction, musicCtx)) return
      await handleIcarusCommand(interaction, icarusCtx)
    } catch (error) {
      console.error('[icarus] erro ao processar interação:', error)
    }
  })

  client.once(Events.ClientReady, (ready) => {
    console.log(`[icarus] conectado como ${ready.user.tag} em ${ready.guilds.cache.size} servidor(es)`)
  })

  // a fila de ambiente roda em segundo plano, cedendo CPU: atrasar minutos é aceitável,
  // travar a conversa não é
  const rodarFila = setInterval(() => void fila.processar(), 15_000)

  await client.login(shared.discord.token)

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[icarus] recebido ${signal}, encerrando`)
    clearInterval(rodarFila)
    fila.parar()
    const onde = conversa.onde()
    if (onde) await conversa.sair(onde.guildId)
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
