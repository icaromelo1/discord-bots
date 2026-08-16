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

/**
 * Converte o PCM do Discord (48 kHz estéreo) para 16 kHz mono.
 *
 * A MÉDIA DOS TRÊS QUADROS DO GRUPO É OBRIGATÓRIA, não é refinamento. Pegar uma amostra
 * a cada três e descartar as outras duas é decimação sem filtro anti-aliasing: tudo que
 * está acima de 8 kHz no original — sibilância, chiado, ruído de microfone — dobra para
 * dentro da faixa da voz como distorção, bem em cima das consoantes. Na prática o
 * reconhecedor passou a devolver "A hoís" para "Arroz".
 *
 * A média de três é um filtro passa-baixas de três derivações: rudimentar, mas atenua o
 * que seria rebatido e custa praticamente nada.
 */
export function paraPcm16kMono(opusFrameDecodado: Buffer): Buffer {
  const samplesPorCanal = Math.floor(opusFrameDecodado.length / (BYTES_POR_SAMPLE * DISCORD_CHANNELS))
  const samplesSaida = Math.floor(samplesPorCanal / FATOR_DECIMACAO)
  const saida = Buffer.alloc(samplesSaida * BYTES_POR_SAMPLE)

  for (let i = 0; i < samplesSaida; i++) {
    let soma = 0
    for (let j = 0; j < FATOR_DECIMACAO; j++) {
      const offset = (i * FATOR_DECIMACAO + j) * BYTES_POR_SAMPLE * DISCORD_CHANNELS
      const esquerda = opusFrameDecodado.readInt16LE(offset)
      const direita = opusFrameDecodado.readInt16LE(offset + BYTES_POR_SAMPLE)
      soma += (esquerda + direita) / 2
    }
    saida.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(soma / FATOR_DECIMACAO))), i * BYTES_POR_SAMPLE)
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
        // 800ms partia frase no meio de qualquer pausa para respirar: quem fala
        // "Ícaro... quem é você?" virava dois trechos, e o nome ficava sozinho num
        // pedaço curto que a porta de energia descartava
        end: { behavior: EndBehaviorType.AfterSilence, duration: 1400 },
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
