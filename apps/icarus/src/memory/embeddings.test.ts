import { describe, expect, it } from 'vitest'
import { similaridadeCosseno } from './embeddings'

describe('similaridadeCosseno', () => {
  it('dá 1 para vetores idênticos', () => {
    const v = [0.6, 0.8, 0]
    expect(similaridadeCosseno(v, v)).toBeCloseTo(1)
  })

  it('dá 0 para vetores ortogonais', () => {
    expect(similaridadeCosseno([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('dá -1 para vetores opostos', () => {
    const v = [0.6, 0.8, 0]
    const oposto = v.map((x) => -x)
    expect(similaridadeCosseno(v, oposto)).toBeCloseTo(-1)
  })

  it('lança erro se os tamanhos diferem', () => {
    expect(() => similaridadeCosseno([1, 2], [1, 2, 3])).toThrow(/tamanhos diferentes/)
  })
})
