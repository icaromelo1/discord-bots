import { StreamType, VoiceManager } from '@bots/shared'
import { PassThrough } from 'node:stream'

type Decisao = 'pendente' | 'liberado' | 'descartado'

interface GuildMouthState {
  stream: PassThrough | null
  fimTimer: NodeJS.Timeout | null
  decisao: Decisao
  /** Áudio segurado enquanto não se sabe se a resposta é para alguém. */
  represado: Buffer[]
}

/** Teto do que se segura enquanto a decisão não vem — evita crescer sem limite. */
const REPRESA_MAX_BYTES = 48_000 * 2 * 2 * 3

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

  /**
   * Recebe áudio da resposta. Enquanto não se sabe se a resposta é para alguém, o áudio
   * fica represado — o modelo responde a cada turno, mas responder "..." a uma conversa
   * alheia não deve virar som na call. Quem decide é `decidir()`, a partir do conteúdo.
   */
  falar(guildId: string, pcm: Buffer): void {
    let state = this.states.get(guildId)
    if (!state) {
      state = { stream: null, fimTimer: null, decisao: 'pendente', represado: [] }
      this.states.set(guildId, state)
    }

    if (state.decisao === 'descartado') return

    const pcm48 = paraPcm48kEstereo(pcm)

    if (state.decisao === 'pendente') {
      const total = state.represado.reduce((n, b) => n + b.length, 0)
      if (total < REPRESA_MAX_BYTES) state.represado.push(pcm48)
      return
    }

    this.abrirStream(guildId, state)
    state.stream?.write(pcm48)

    // Uma resposta = um stream. Sem fechar ao fim de cada fala, o recurso de áudio da
    // primeira era consumido e descartado, e as respostas seguintes eram escritas num
    // cano morto: o texto aparecia, o som não saía. O fim é detectado por inatividade
    // porque é o único sinal que não depende de como o modelo fatia o turno.
    if (state.fimTimer) clearTimeout(state.fimTimer)
    state.fimTimer = setTimeout(() => this.finalizar(guildId), FIM_DA_FALA_MS)
  }

  /** Libera o que estava represado e passa a tocar ao vivo, ou descarta tudo. */
  decidir(guildId: string, tocar: boolean): void {
    const state = this.states.get(guildId)
    if (!state || state.decisao !== 'pendente') return

    if (!tocar) {
      state.decisao = 'descartado'
      state.represado = []
      return
    }

    state.decisao = 'liberado'
    this.abrirStream(guildId, state)
    for (const chunk of state.represado) state.stream?.write(chunk)
    state.represado = []

    if (state.fimTimer) clearTimeout(state.fimTimer)
    state.fimTimer = setTimeout(() => this.finalizar(guildId), FIM_DA_FALA_MS)
  }

  /** Fim do turno: o que sobrou pendente nunca foi liberado, então some. */
  fimDoTurno(guildId: string): void {
    const state = this.states.get(guildId)
    if (!state) return
    if (state.decisao === 'pendente') {
      this.states.delete(guildId)
      return
    }
    if (state.decisao === 'descartado') this.states.delete(guildId)
  }

  private abrirStream(guildId: string, state: GuildMouthState): void {
    if (state.stream) return
    state.stream = new PassThrough()
    this.voice.play(guildId, state.stream, { tipo: StreamType.Raw })
    this.comecouAFalarHandler?.(guildId)
  }

  /** Encerra o stream da resposta atual sem cortar o que já foi escrito. */
  private finalizar(guildId: string): void {
    const state = this.states.get(guildId)
    if (!state) return

    if (state.fimTimer) clearTimeout(state.fimTimer)
    // end() e não stop(): o player termina de tocar o que está no buffer. Parar aqui
    // cortaria a última sílaba de toda resposta.
    state.stream?.end()
    this.states.delete(guildId)
    this.parouDeFalarHandler?.(guildId)
  }

  calar(guildId: string): void {
    const state = this.states.get(guildId)
    if (!state) return

    if (state.fimTimer) clearTimeout(state.fimTimer)
    state.stream?.end()
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
