import { StreamType, VoiceManager } from '@bots/shared'
import { PassThrough } from 'node:stream'

interface GuildMouthState {
  stream: PassThrough
  fimTimer: NodeJS.Timeout | null
}

/** Silêncio que marca o fim de uma resposta. Curto o bastante para a próxima fala não
 *  esperar, longo o bastante para não cortar no meio de uma pausa do próprio modelo. */
const FIM_DA_FALA_MS = 700

// Discord/@discordjs/voice em StreamType.Raw exige PCM16 48kHz estéreo. O Gemini manda
// PCM16 24kHz mono, então cada amostra é duplicada (24k -> 48k) e duplicada de novo nos
// dois canais (mono -> estéreo) em vez de subir um processo ffmpeg por fala — é uma
// conversão inteira, barata, sem depender de processo externo.
export function paraPcm48kEstereo(pcm24kMono: Buffer): Buffer {
  const totalAmostras = Math.floor(pcm24kMono.length / 2)
  const saida = Buffer.alloc(totalAmostras * 2 * 4)

  for (let i = 0; i < totalAmostras; i++) {
    const amostra = pcm24kMono.readInt16LE(i * 2)
    const offset = i * 8
    saida.writeInt16LE(amostra, offset)
    saida.writeInt16LE(amostra, offset + 2)
    saida.writeInt16LE(amostra, offset + 4)
    saida.writeInt16LE(amostra, offset + 6)
  }

  return saida
}

export class Mouth {
  private readonly states = new Map<string, GuildMouthState>()
  private comecouAFalarHandler: ((guildId: string) => void) | null = null
  private parouDeFalarHandler: ((guildId: string) => void) | null = null

  constructor(private readonly voice: VoiceManager) {}

  falar(guildId: string, pcm: Buffer): void {
    let state = this.states.get(guildId)
    if (!state) {
      const stream = new PassThrough()
      state = { stream, fimTimer: null }
      this.states.set(guildId, state)
      this.voice.play(guildId, stream, { tipo: StreamType.Raw })
      this.comecouAFalarHandler?.(guildId)
    }

    state.stream.write(paraPcm48kEstereo(pcm))

    // Uma resposta = um stream. Sem fechar ao fim de cada fala, o recurso de áudio da
    // primeira era consumido e descartado, e as respostas seguintes eram escritas num
    // cano morto: o texto aparecia, o som não saía. O fim é detectado por inatividade
    // porque é o único sinal que não depende de como o modelo fatia o turno.
    if (state.fimTimer) clearTimeout(state.fimTimer)
    state.fimTimer = setTimeout(() => this.finalizar(guildId), FIM_DA_FALA_MS)
  }

  /** Encerra o stream da resposta atual sem cortar o que já foi escrito. */
  private finalizar(guildId: string): void {
    const state = this.states.get(guildId)
    if (!state) return

    if (state.fimTimer) clearTimeout(state.fimTimer)
    // end() e não stop(): o player termina de tocar o que está no buffer. Parar aqui
    // cortaria a última sílaba de toda resposta.
    state.stream.end()
    this.states.delete(guildId)
    this.parouDeFalarHandler?.(guildId)
  }

  calar(guildId: string): void {
    const state = this.states.get(guildId)
    if (!state) return

    if (state.fimTimer) clearTimeout(state.fimTimer)
    state.stream.end()
    this.voice.stop(guildId)
    this.states.delete(guildId)
    this.parouDeFalarHandler?.(guildId)
  }

  estaFalando(guildId: string): boolean {
    return this.states.has(guildId)
  }

  onComecouAFalar(handler: (guildId: string) => void): void {
    this.comecouAFalarHandler = handler
  }

  onParouDeFalar(handler: (guildId: string) => void): void {
    this.parouDeFalarHandler = handler
  }
}
