import { describe, expect, it, vi } from 'vitest'
import { encontrarPalavra, WakeDetector } from './wake'
import type { Transcritor } from '../memory/transcritor'

describe('encontrarPalavra', () => {
  it('casa ignorando acento e maiúscula', () => {
    expect(encontrarPalavra('Ícarus, tudo bem?', 'icarus').achou).toBe(true)
    expect(encontrarPalavra('ICARUS, tudo bem?', 'icarus').achou).toBe(true)
    expect(encontrarPalavra('icarus, tudo bem?', 'ICARUS').achou).toBe(true)
  })

  it('só casa em limite de palavra', () => {
    expect(encontrarPalavra('icaruso apareceu ali', 'icarus').achou).toBe(false)
    expect(encontrarPalavra('quem é picarus', 'icarus').achou).toBe(false)
  })

  it('resto é o texto depois da palavra, aparado', () => {
    const resultado = encontrarPalavra('icarus, qual a capital?', 'icarus')
    expect(resultado.achou).toBe(true)
    expect(resultado.resto).toBe('qual a capital?')
  })

  it('palavra no fim devolve resto vazio', () => {
    const resultado = encontrarPalavra('diga oi icarus', 'icarus')
    expect(resultado.achou).toBe(true)
    expect(resultado.resto).toBe('')
  })

  it('texto vazio devolve achou false sem lançar', () => {
    expect(() => encontrarPalavra('', 'icarus')).not.toThrow()
    expect(encontrarPalavra('', 'icarus').achou).toBe(false)
  })
})

function transcritorFalso(texto: string): Transcritor {
  return {
    disponivel: () => true,
    transcrever: vi.fn().mockResolvedValue(texto),
  }
}

describe('WakeDetector.examinar', () => {
  it('devolve a detecção quando a palavra aparece', async () => {
    const detector = new WakeDetector(transcritorFalso('icarus, que horas são?'), 'icarus')

    const deteccao = await detector.examinar('user-1', Buffer.alloc(0))

    expect(deteccao).toEqual({
      userId: 'user-1',
      texto: 'icarus, que horas são?',
      textoAposNome: 'que horas são?',
    })
  })

  it('devolve null quando a palavra não aparece', async () => {
    const detector = new WakeDetector(transcritorFalso('só falando aqui'), 'icarus')

    const deteccao = await detector.examinar('user-1', Buffer.alloc(0))

    expect(deteccao).toBeNull()
  })

  it('devolve null quando a transcrição vem vazia', async () => {
    const detector = new WakeDetector(transcritorFalso(''), 'icarus')

    const deteccao = await detector.examinar('user-1', Buffer.alloc(0))

    expect(deteccao).toBeNull()
  })
})
