import { salvarFala } from './repositorio'
import type { Transcritor } from './transcritor'

export interface ItemDeTranscricao {
  guildId: string
  canalId: string
  autorId: string
  autorNome: string
  pcm: Buffer
  faladoEm: Date
}

const MAX_ITENS_PADRAO = 500
const CONCORRENCIA_PADRAO = 1

export class FilaDeTranscricao {
  private readonly itens: ItemDeTranscricao[] = []
  private readonly maxItens: number
  private readonly concorrencia: number
  private processando = false
  private parada = false

  constructor(
    private readonly transcritor: Transcritor,
    opcoes?: { maxItens?: number; concorrencia?: number },
  ) {
    this.maxItens = opcoes?.maxItens ?? MAX_ITENS_PADRAO
    // concorrência 1 por padrão: transcrição local é pesada e a máquina divide CPU
    // com outros serviços — o objetivo é usar sobra de CPU, não disputar
    this.concorrencia = opcoes?.concorrencia ?? CONCORRENCIA_PADRAO
  }

  enfileirar(item: ItemDeTranscricao): void {
    this.itens.push(item)

    if (this.itens.length > this.maxItens) {
      // descarta os mais antigos: memória de ambiente é bom-ter, travar a conversa
      // (ou consumir memória sem limite) por causa dela inverteria a prioridade
      const excesso = this.itens.length - this.maxItens
      this.itens.splice(0, excesso)
      console.warn(`[icarus] fila de transcrição cheia, descartando ${excesso} item(ns) antigo(s)`)
    }
  }

  tamanho(): number {
    return this.itens.length
  }

  async processar(): Promise<void> {
    if (this.processando) return
    this.processando = true

    try {
      const workers = Array.from({ length: this.concorrencia }, () => this.consumir())
      await Promise.all(workers)
    } finally {
      this.processando = false
    }
  }

  parar(): void {
    this.parada = true
  }

  private async consumir(): Promise<void> {
    for (;;) {
      if (this.parada) return

      const item = this.itens.shift()
      if (!item) return

      await this.processarItem(item)
    }
  }

  private async processarItem(item: ItemDeTranscricao): Promise<void> {
    if (!this.transcritor.disponivel()) return

    let texto: string
    try {
      texto = await this.transcritor.transcrever(item.pcm)
    } catch (error) {
      console.error('[icarus] falha ao transcrever item da fila, descartando:', error)
      return
    }

    if (!texto || !texto.trim()) return

    await salvarFala({
      guildId: item.guildId,
      canalId: item.canalId,
      autorId: item.autorId,
      autorNome: item.autorNome,
      texto,
      origem: 'whisper',
      faladoEm: item.faladoEm,
    })
  }
}
