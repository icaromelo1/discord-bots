import { describe, expect, it } from 'vitest'
import { Mouth, paraPcm48kEstereo } from './mouth'

function pcmDe(valores: number[]): Buffer {
  const buffer = Buffer.alloc(valores.length * 2)
  valores.forEach((valor, i) => buffer.writeInt16LE(valor, i * 2))
  return buffer
}

function amostras(pcm: Buffer): number[] {
  const resultado: number[] = []
  for (let i = 0; i < pcm.length / 2; i++) resultado.push(pcm.readInt16LE(i * 2))
  return resultado
}

describe('paraPcm48kEstereo', () => {
  it('o buffer de saída tem 4x o tamanho do de entrada', () => {
    const entrada = pcmDe([100, -200, 300])
    const saida = paraPcm48kEstereo(entrada)
    expect(saida.length).toBe(entrada.length * 4)
  })

  it('cada amostra aparece duplicada (taxa) e duplicada nos dois canais', () => {
    const entrada = pcmDe([100, -200, 300])
    const saida = paraPcm48kEstereo(entrada)
    expect(amostras(saida)).toEqual([
      100, 100, 100, 100, -200, -200, -200, -200, 300, 300, 300, 300,
    ])
  })

  it('buffer vazio devolve buffer vazio', () => {
    const saida = paraPcm48kEstereo(Buffer.alloc(0))
    expect(saida.length).toBe(0)
  })
})


describe('represa o áudio até saber se a resposta é para alguém', () => {
  function vozFalsa() {
    const tocados: unknown[] = []
    return {
      tocados,
      voice: { play: (_g: string, fonte: unknown) => tocados.push(fonte), stop: () => {} } as never,
    }
  }

  it('não toca nada enquanto a decisão não vem', () => {
    const { tocados, voice } = vozFalsa()
    const mouth = new Mouth(voice)
    mouth.falar('g1', Buffer.alloc(64))
    mouth.falar('g1', Buffer.alloc(64))
    // o modelo responde a TODO turno; sem decidir, responder a conversa alheia
    // viraria som na call
    expect(tocados).toHaveLength(0)
  })

  it('libera o represado quando a resposta tem conteúdo', () => {
    const { tocados, voice } = vozFalsa()
    const mouth = new Mouth(voice)
    mouth.falar('g1', Buffer.alloc(64))
    mouth.decidir('g1', true)
    expect(tocados).toHaveLength(1)
  })

  it('descarta tudo quando a resposta não é para ninguém', () => {
    const { tocados, voice } = vozFalsa()
    const mouth = new Mouth(voice)
    mouth.falar('g1', Buffer.alloc(64))
    mouth.decidir('g1', false)
    mouth.falar('g1', Buffer.alloc(64))
    expect(tocados).toHaveLength(0)
  })

  it('cada resposta liberada ganha um recurso novo', async () => {
    const { tocados, voice } = vozFalsa()
    const mouth = new Mouth(voice)

    mouth.falar('g1', Buffer.alloc(64))
    mouth.decidir('g1', true)
    await new Promise((r) => setTimeout(r, 900))
    mouth.fimDoTurno('g1')

    mouth.falar('g1', Buffer.alloc(64))
    mouth.decidir('g1', true)
    expect(tocados).toHaveLength(2)
    expect(tocados[0]).not.toBe(tocados[1])
  })

  it('chunks seguidos da MESMA resposta reusam o stream', () => {
    const { tocados, voice } = vozFalsa()
    const mouth = new Mouth(voice)
    mouth.falar('g1', Buffer.alloc(64))
    mouth.decidir('g1', true)
    mouth.falar('g1', Buffer.alloc(64))
    mouth.falar('g1', Buffer.alloc(64))
    expect(tocados).toHaveLength(1)
  })
})
