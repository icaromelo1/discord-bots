import type { Transcritor } from './transcritor'

export interface PedidoDeTranscricao {
  pcm: Buffer
  /** Quando a fala aconteceu — usado para descartar o que envelheceu. */
  em: number
}

/**
 * Transcreve com concorrência limitada, priorizando o que é recente.
 *
 * Duas decisões que vêm de uso real:
 *
 * 1. **Pilha, não fila.** O mais novo é atendido primeiro. Fala de trinta segundos atrás
 *    não acorda mais ninguém e vale pouco para a memória; atrasar a fala de agora por
 *    causa dela é trocar o que importa pelo que não importa.
 *
 * 2. **Descarte por idade.** Sob carga, o que envelheceu além do limite é jogado fora em
 *    vez de acumular. Sem isso a fila cresce para sempre numa call movimentada e o bot
 *    passa a responder ao que foi dito minutos atrás.
 */
export class TranscricaoServico {
  private readonly pendentes: { pedido: PedidoDeTranscricao; resolver: (t: string) => void }[] = []
  private ativos = 0

  constructor(
    private readonly transcritor: Transcritor,
    private readonly concorrencia = 3,
    private readonly idadeMaximaMs = 20_000,
    private readonly maxPendentes = 40,
  ) {}

  pendentesCount(): number {
    return this.pendentes.length
  }

  /** Devolve o texto, ou string vazia se o pedido foi descartado por idade/lotação. */
  transcrever(pedido: PedidoDeTranscricao): Promise<string> {
    if (!this.transcritor.disponivel()) return Promise.resolve('')

    return new Promise<string>((resolver) => {
      this.pendentes.push({ pedido, resolver })

      // lotado: descarta os MAIS ANTIGOS, que são os menos úteis
      while (this.pendentes.length > this.maxPendentes) {
        const descartado = this.pendentes.shift()
        descartado?.resolver('')
      }

      void this.bombear()
    })
  }

  private async bombear(): Promise<void> {
    while (this.ativos < this.concorrencia && this.pendentes.length > 0) {
      const item = this.pendentes.pop()
      if (!item) return

      const idade = Date.now() - item.pedido.em
      if (idade > this.idadeMaximaMs) {
        item.resolver('')
        continue
      }

      this.ativos++
      void this.transcritor
        .transcrever(item.pedido.pcm)
        .then((texto) => item.resolver(texto))
        .catch(() => item.resolver(''))
        .finally(() => {
          this.ativos--
          void this.bombear()
        })
    }
  }
}
