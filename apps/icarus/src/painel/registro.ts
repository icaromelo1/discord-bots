export type TipoEvento = 'fala' | 'wake' | 'sessao' | 'ferramenta' | 'erro'

export interface Evento {
  em: number
  tipo: TipoEvento
  autor: string
  texto: string
  /** Só para `wake`: se a palavra de ativação foi reconhecida naquele trecho. */
  acordou?: boolean
  detalhe?: string
}

/**
 * Últimos eventos, em memória. Existe para o painel: sem isto, a única forma de saber
 * o que o Whisper entendeu é consultar o banco, e falas descartadas (ruído, alucinação,
 * trecho curto) nem chegam lá — que são justamente as que interessam quando a ativação
 * não funciona.
 */
export class RegistroDeEventos {
  private readonly eventos: Evento[] = []

  constructor(private readonly limite = 300) {}

  registrar(evento: Omit<Evento, 'em'>): void {
    this.eventos.push({ ...evento, em: Date.now() })
    if (this.eventos.length > this.limite) this.eventos.splice(0, this.eventos.length - this.limite)
  }

  /** Eventos mais recentes primeiro. */
  recentes(desde?: number): Evento[] {
    const lista = desde ? this.eventos.filter((e) => e.em > desde) : this.eventos
    return [...lista].reverse()
  }

  limpar(): void {
    this.eventos.length = 0
  }
}

export const registro = new RegistroDeEventos()
