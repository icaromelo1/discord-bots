import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FilaDeTranscricao, type ItemDeTranscricao } from './fila'
import type { Transcritor } from './transcritor'

vi.mock('./repositorio', () => ({
  salvarFala: vi.fn().mockResolvedValue('id-fake'),
}))

import { salvarFala } from './repositorio'

function criarItem(overrides?: Partial<ItemDeTranscricao>): ItemDeTranscricao {
  return {
    guildId: 'guild-1',
    canalId: 'canal-1',
    autorId: 'autor-1',
    autorNome: 'Fulano',
    pcm: Buffer.from([1, 2, 3]),
    faladoEm: new Date(),
    ...overrides,
  }
}

class TranscritorFalso implements Transcritor {
  private disp = true
  private textos: (string | Error)[] = []
  private indice = 0

  setDisponivel(valor: boolean): void {
    this.disp = valor
  }

  filaDeRespostas(textos: (string | Error)[]): void {
    this.textos = textos
  }

  disponivel(): boolean {
    return this.disp
  }

  async transcrever(): Promise<string> {
    const resposta = this.textos[this.indice] ?? 'texto transcrito'
    this.indice++
    if (resposta instanceof Error) throw resposta
    return resposta
  }
}

describe('FilaDeTranscricao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enfileirar aumenta o tamanho', () => {
    const fila = new FilaDeTranscricao(new TranscritorFalso())
    expect(fila.tamanho()).toBe(0)

    fila.enfileirar(criarItem())
    fila.enfileirar(criarItem())

    expect(fila.tamanho()).toBe(2)
  })

  it('passar do limite descarta os mais antigos e mantém o tamanho no teto', () => {
    const fila = new FilaDeTranscricao(new TranscritorFalso(), { maxItens: 3 })

    fila.enfileirar(criarItem({ autorId: 'a' }))
    fila.enfileirar(criarItem({ autorId: 'b' }))
    fila.enfileirar(criarItem({ autorId: 'c' }))
    fila.enfileirar(criarItem({ autorId: 'd' }))

    expect(fila.tamanho()).toBe(3)
  })

  it('transcritor indisponível: itens são descartados e nada é salvo', async () => {
    const transcritor = new TranscritorFalso()
    transcritor.setDisponivel(false)
    const fila = new FilaDeTranscricao(transcritor)

    fila.enfileirar(criarItem())
    fila.enfileirar(criarItem())

    await fila.processar()

    expect(fila.tamanho()).toBe(0)
    expect(salvarFala).not.toHaveBeenCalled()
  })

  it('item que lança erro não trava a fila: os seguintes ainda são processados', async () => {
    const transcritor = new TranscritorFalso()
    transcritor.filaDeRespostas([new Error('boom'), 'segunda fala transcrita'])
    const fila = new FilaDeTranscricao(transcritor)

    fila.enfileirar(criarItem({ autorId: 'quebra' }))
    fila.enfileirar(criarItem({ autorId: 'ok' }))

    await fila.processar()

    expect(fila.tamanho()).toBe(0)
    expect(salvarFala).toHaveBeenCalledTimes(1)
    expect(salvarFala).toHaveBeenCalledWith(expect.objectContaining({ autorId: 'ok', texto: 'segunda fala transcrita' }))
  })

  it('texto vazio não vira fala salva', async () => {
    const transcritor = new TranscritorFalso()
    transcritor.filaDeRespostas(['   ', ''])
    const fila = new FilaDeTranscricao(transcritor)

    fila.enfileirar(criarItem())
    fila.enfileirar(criarItem())

    await fila.processar()

    expect(salvarFala).not.toHaveBeenCalled()
  })

  it('processar() chamado duas vezes em paralelo não processa o mesmo item duas vezes', async () => {
    const transcritor = new TranscritorFalso()
    const fila = new FilaDeTranscricao(transcritor)

    fila.enfileirar(criarItem())
    fila.enfileirar(criarItem())
    fila.enfileirar(criarItem())

    await Promise.all([fila.processar(), fila.processar()])

    expect(salvarFala).toHaveBeenCalledTimes(3)
  })
})
