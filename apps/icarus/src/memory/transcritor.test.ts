import { describe, expect, it } from 'vitest'
import { ehAlucinacao, temFala } from './transcritor'

function pcm(amostras: number, amplitude: number): Buffer {
  const b = Buffer.alloc(amostras * 2)
  for (let i = 0; i < amostras; i++) b.writeInt16LE(i % 2 === 0 ? amplitude : -amplitude, i * 2)
  return b
}

describe('ehAlucinacao — casos reais capturados na Bayuka', () => {
  it('descarta os rótulos de música que poluíram a memória', () => {
    expect(ehAlucinacao('[MÚSICA DE FUNDO]')).toBe(true)
    expect(ehAlucinacao('(MÚSICA DE FUNDO)')).toBe(true)
    expect(ehAlucinacao('[Música]')).toBe(true)
  })

  it('descarta a alucinação clássica de legenda do Whisper', () => {
    expect(ehAlucinacao('Legendas pela comunidade Amara.org')).toBe(true)
  })

  it('descarta texto vazio ou só pontuação', () => {
    expect(ehAlucinacao('')).toBe(true)
    expect(ehAlucinacao('   ')).toBe(true)
    expect(ehAlucinacao('...')).toBe(true)
    expect(ehAlucinacao('-Bye.')).toBe(true)
  })

  it('mantém fala de verdade', () => {
    expect(ehAlucinacao('Não, não, não.')).toBe(false)
    expect(ehAlucinacao('Icarus, qual a capital da França?')).toBe(false)
    expect(ehAlucinacao('Valeu pela ajuda aí')).toBe(false)
  })
})

describe('temFala', () => {
  it('recusa áudio curto demais para conter fala', () => {
    expect(temFala(pcm(1600, 5000))).toBe(false)
  })

  it('recusa áudio longo mas silencioso', () => {
    expect(temFala(pcm(16_000, 10))).toBe(false)
  })

  it('aceita áudio longo o bastante e com energia', () => {
    expect(temFala(pcm(16_000, 5000))).toBe(true)
  })

  it('recusa buffer vazio sem lançar', () => {
    expect(temFala(Buffer.alloc(0))).toBe(false)
  })
})
