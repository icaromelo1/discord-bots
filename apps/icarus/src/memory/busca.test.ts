import { describe, expect, it } from 'vitest'
import { ordenarPorSimilaridade } from './busca'

describe('ordenarPorSimilaridade', () => {
  it('ordena candidatos por similaridade decrescente', () => {
    const consulta = [1, 0]
    const candidatos = [
      { texto: 'longe', autores: ['a'], faladoEm: new Date(), embedding: [0, 1] },
      { texto: 'perto', autores: ['b'], faladoEm: new Date(), embedding: [1, 0] },
      { texto: 'meio', autores: ['c'], faladoEm: new Date(), embedding: [0.7, 0.7] },
    ]

    const resultado = ordenarPorSimilaridade(consulta, candidatos, 10)

    expect(resultado.map((r) => r.texto)).toEqual(['perto', 'meio', 'longe'])
    expect(resultado[0].escore).toBeGreaterThan(resultado[1].escore)
    expect(resultado[1].escore).toBeGreaterThan(resultado[2].escore)
  })

  it('respeita o limite', () => {
    const consulta = [1, 0]
    const candidatos = [
      { texto: 'a', autores: [], faladoEm: new Date(), embedding: [1, 0] },
      { texto: 'b', autores: [], faladoEm: new Date(), embedding: [0.9, 0.1] },
      { texto: 'c', autores: [], faladoEm: new Date(), embedding: [0.1, 0.9] },
    ]

    const resultado = ordenarPorSimilaridade(consulta, candidatos, 2)

    expect(resultado).toHaveLength(2)
  })

  it('candidato com embedding null recebe escore 0 e vai para o fim, sem lançar', () => {
    const consulta = [1, 0]
    const candidatos = [
      { texto: 'sem-embedding', autores: [], faladoEm: new Date(), embedding: null },
      { texto: 'com-embedding', autores: [], faladoEm: new Date(), embedding: [1, 0] },
    ]

    const resultado = ordenarPorSimilaridade(consulta, candidatos, 10)

    expect(() => ordenarPorSimilaridade(consulta, candidatos, 10)).not.toThrow()
    expect(resultado.map((r) => r.texto)).toEqual(['com-embedding', 'sem-embedding'])
    expect(resultado[1].escore).toBe(0)
  })

  it('lista vazia devolve lista vazia', () => {
    const resultado = ordenarPorSimilaridade([1, 0], [], 10)
    expect(resultado).toEqual([])
  })
})
