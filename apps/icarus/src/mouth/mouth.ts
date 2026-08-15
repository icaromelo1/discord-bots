import { StreamType, VoiceManager } from '@bots/shared'
import { PassThrough } from 'node:stream'

interface GuildMouthState {
  stream: PassThrough
}

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
      state = { stream }
      this.states.set(guildId, state)
      this.voice.play(guildId, stream, { tipo: StreamType.Raw })
      this.comecouAFalarHandler?.(guildId)
    }

    state.stream.write(paraPcm48kEstereo(pcm))
  }

  calar(guildId: string): void {
    const state = this.states.get(guildId)
    if (!state) return

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
