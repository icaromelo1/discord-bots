/**
 * Aprende o ritmo da conversa para distinguir pausa de fim.
 *
 * Uma janela fixa erra nos dois sentidos: 10s corta quem fala pausado no meio de um
 * raciocínio, e é longo demais para um grupo que emenda as frases. O intervalo típico
 * ENTRE as falas daquela sessão é a medida honesta de "quanto tempo de silêncio ainda
 * é conversa" para aquele grupo, naquele momento.
 */
export class RitmoDaConversa {
  private readonly intervalos: number[] = []
  private ultimaFalaEm: number | null = null

  constructor(
    private readonly minimoMs = 6_000,
    private readonly maximoMs = 25_000,
    private readonly fator = 3,
    private readonly amostrasMax = 12,
  ) {}

  /** Registra que alguém falou agora. */
  registrarFala(agora: number): void {
    if (this.ultimaFalaEm !== null) {
      const intervalo = agora - this.ultimaFalaEm
      // intervalo absurdo não é ritmo, é a pessoa tendo voltado depois de sumir
      if (intervalo > 0 && intervalo <= this.maximoMs) {
        this.intervalos.push(intervalo)
        if (this.intervalos.length > this.amostrasMax) this.intervalos.shift()
      }
    }
    this.ultimaFalaEm = agora
  }

  /**
   * Janela de silêncio que ainda conta como conversa em andamento.
   *
   * Usa a MEDIANA e não a média: uma única pausa longa não deve esticar a janela toda,
   * e uma rajada de falas curtas não deve encolhê-la.
   */
  janelaMs(): number {
    if (this.intervalos.length < 3) return this.minimoMs

    const ordenados = [...this.intervalos].sort((a, b) => a - b)
    const meio = Math.floor(ordenados.length / 2)
    const mediana =
      ordenados.length % 2 === 0 ? (ordenados[meio - 1] + ordenados[meio]) / 2 : ordenados[meio]

    return Math.min(this.maximoMs, Math.max(this.minimoMs, Math.round(mediana * this.fator)))
  }

  amostras(): number {
    return this.intervalos.length
  }

  limpar(): void {
    this.intervalos.length = 0
    this.ultimaFalaEm = null
  }
}
