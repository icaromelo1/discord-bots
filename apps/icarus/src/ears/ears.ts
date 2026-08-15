import { EndBehaviorType, VoiceConnection } from '@discordjs/voice'
import type { AudioReceiveStream } from '@discordjs/voice'
import prism from 'prism-media'

export interface TrechoDeFala {
  userId: string
  pcm: Buffer
  inicioMs: number
  fimMs: number
}

interface StreamAtivo {
  opusStream: AudioReceiveStream
  decoder: prism.opus.Decoder
  chunks: Buffer[]
  inicioMs: number
}

interface GuildEarsState {
  connection: VoiceConnection
  streams: Map<string, StreamAtivo>
  onSpeakingStart: (userId: string) => void
}

const DISCORD_SAMPLE_RATE = 48_000
const DISCORD_CHANNELS = 2
const ALVO_SAMPLE_RATE = 16_000
const FATOR_DECIMACAO = DISCORD_SAMPLE_RATE / ALVO_SAMPLE_RATE
const BYTES_POR_SAMPLE = 2

function paraPcm16kMono(opusFrameDecodado: Buffer): Buffer {
  const samplesPorCanal = opusFrameDecodado.length / (BYTES_POR_SAMPLE * DISCORD_CHANNELS)
  const samplesSaida = Math.floor(samplesPorCanal / FATOR_DECIMACAO)
  const saida = Buffer.alloc(samplesSaida * BYTES_POR_SAMPLE)

  for (let i = 0; i < samplesSaida; i++) {
    const indiceFrame = i * FATOR_DECIMACAO
    const offset = indiceFrame * BYTES_POR_SAMPLE * DISCORD_CHANNELS
    const esquerda = opusFrameDecodado.readInt16LE(offset)
    const direita = opusFrameDecodado.readInt16LE(offset + BYTES_POR_SAMPLE)
    const media = (esquerda + direita) >> 1
    saida.writeInt16LE(media, i * BYTES_POR_SAMPLE)
  }

  return saida
}

export class Ears {
  private readonly guilds = new Map<string, GuildEarsState>()
  private falaHandler: ((trecho: TrechoDeFala) => void) | null = null
  private inicioFalaHandler: ((guildId: string, userId: string) => void) | null = null
  private fimFalaHandler: ((guildId: string, userId: string) => void) | null = null

  constructor(private readonly ehBot: (userId: string) => boolean) {}

  escutar(connection: VoiceConnection, guildId: string): void {
    if (this.guilds.has(guildId)) return

    const streams = new Map<string, StreamAtivo>()

    const onSpeakingStart = (userId: string): void => {
      // streams de bot (ex: o próprio DJ NARUTINHO) nunca são decodificados —
      // é o que mantém a música fora da escuta
      if (this.ehBot(userId)) return
      if (streams.has(userId)) return

      const opusStream = connection.receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 800 },
      })
      const decoder = new prism.opus.Decoder({
        rate: DISCORD_SAMPLE_RATE,
        channels: DISCORD_CHANNELS,
        frameSize: 960,
      })

      const ativo: StreamAtivo = {
        opusStream,
        decoder,
        chunks: [],
        inicioMs: Date.now(),
      }
      streams.set(userId, ativo)

      this.inicioFalaHandler?.(guildId, userId)

      decoder.on('data', (pcmFrame: Buffer) => {
        ativo.chunks.push(paraPcm16kMono(pcmFrame))
      })

      opusStream.pipe(decoder)

      const encerrar = (): void => {
        streams.delete(userId)
        this.fimFalaHandler?.(guildId, userId)

        const pcm = Buffer.concat(ativo.chunks)
        if (pcm.length > 0) {
          this.falaHandler?.({
            userId,
            pcm,
            inicioMs: ativo.inicioMs,
            fimMs: Date.now(),
          })
        }
      }

      opusStream.once('end', encerrar)
      opusStream.once('error', encerrar)
      decoder.once('error', encerrar)
    }

    connection.receiver.speaking.on('start', onSpeakingStart)

    this.guilds.set(guildId, { connection, streams, onSpeakingStart })
  }

  parar(guildId: string): void {
    const state = this.guilds.get(guildId)
    if (!state) return

    state.connection.receiver.speaking.off('start', state.onSpeakingStart)

    for (const ativo of state.streams.values()) {
      ativo.opusStream.destroy()
      ativo.decoder.destroy()
    }
    state.streams.clear()

    this.guilds.delete(guildId)
  }

  estaEscutando(guildId: string): boolean {
    return this.guilds.has(guildId)
  }

  onFala(handler: (trecho: TrechoDeFala) => void): void {
    this.falaHandler = handler
  }

  onInicioFala(handler: (guildId: string, userId: string) => void): void {
    this.inicioFalaHandler = handler
  }

  onFimFala(handler: (guildId: string, userId: string) => void): void {
    this.fimFalaHandler = handler
  }
}
