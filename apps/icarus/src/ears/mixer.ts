const AMOSTRAS_POR_MS = 16
const BYTES_POR_AMOSTRA = 2

export interface JanelaDeAudio {
  pcm: Buffer
  falantes: string[]
}

function saturar(valor: number): number {
  if (valor > 32767) return 32767
  if (valor < -32768) return -32768
  return valor
}

export class Mixer {
  private readonly amostrasPorJanela: number
  private readonly bytesPorJanela: number
  private acumulador: Int32Array
  private energiaPorFalante = new Map<string, number>()
  // sobra de PCM além do tamanho da janela: guardada aqui e somada na
  // próxima janela ao fechar, para nunca descartar áudio já recebido
  private pendentes = new Map<string, Buffer>()
  private ultimoDominante: string | null = null
  private trocaPendente: string | null = null

  constructor(janelaMs = 100) {
    this.amostrasPorJanela = janelaMs * AMOSTRAS_POR_MS
    this.bytesPorJanela = this.amostrasPorJanela * BYTES_POR_AMOSTRA
    this.acumulador = new Int32Array(this.amostrasPorJanela)
  }

  adicionar(userId: string, pcm: Buffer): void {
    this.contribuir(userId, pcm)
  }

  private contribuir(userId: string, pcm: Buffer): void {
    const amostrasDisponiveis = Math.floor(pcm.length / BYTES_POR_AMOSTRA)
    const amostrasParaSomar = Math.min(amostrasDisponiveis, this.amostrasPorJanela)
    let energia = this.energiaPorFalante.get(userId) ?? 0

    // soma com saturação, não média: com N pessoas falando, a média
    // derrubaria o volume proporcionalmente a N, o que soa errado — uma
    // mesa de som soma os canais e satura nos limites, não divide
    for (let i = 0; i < amostrasParaSomar; i++) {
      const amostra = pcm.readInt16LE(i * BYTES_POR_AMOSTRA)
      this.acumulador[i] = saturar(this.acumulador[i] + amostra)
      energia += Math.abs(amostra)
    }

    if (amostrasParaSomar > 0) this.energiaPorFalante.set(userId, energia)

    if (amostrasDisponiveis > this.amostrasPorJanela) {
      this.pendentes.set(userId, pcm.subarray(amostrasParaSomar * BYTES_POR_AMOSTRA))
    }
  }

  fechar(): JanelaDeAudio | null {
    const falantes = [...this.energiaPorFalante.keys()]

    let resultado: JanelaDeAudio | null = null
    if (falantes.length > 0) {
      const pcm = Buffer.alloc(this.bytesPorJanela)
      for (let i = 0; i < this.amostrasPorJanela; i++) {
        pcm.writeInt16LE(this.acumulador[i], i * BYTES_POR_AMOSTRA)
      }

      let dominante = falantes[0]
      let maiorEnergia = this.energiaPorFalante.get(dominante) ?? 0
      for (const falante of falantes) {
        const energia = this.energiaPorFalante.get(falante) ?? 0
        if (energia > maiorEnergia) {
          maiorEnergia = energia
          dominante = falante
        }
      }

      if (dominante !== this.ultimoDominante) {
        this.trocaPendente = dominante
        this.ultimoDominante = dominante
      }

      resultado = { pcm, falantes }
    }

    this.acumulador = new Int32Array(this.amostrasPorJanela)
    this.energiaPorFalante = new Map()

    const pendentes = this.pendentes
    this.pendentes = new Map()
    for (const [userId, buffer] of pendentes) {
      this.contribuir(userId, buffer)
    }

    return resultado
  }

  consumirTrocaDeFalante(): string | null {
    const troca = this.trocaPendente
    this.trocaPendente = null
    return troca
  }

  limpar(): void {
    this.acumulador = new Int32Array(this.amostrasPorJanela)
    this.energiaPorFalante = new Map()
    this.pendentes = new Map()
    this.ultimoDominante = null
    this.trocaPendente = null
  }
}
