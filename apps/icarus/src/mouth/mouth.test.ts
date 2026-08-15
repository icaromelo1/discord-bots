import { describe, expect, it } from 'vitest'
import { paraPcm48kEstereo } from './mouth'

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
