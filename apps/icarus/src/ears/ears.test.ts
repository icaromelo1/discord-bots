import { describe, expect, it } from 'vitest'
import { paraPcm16kMono } from './ears'

/** Gera PCM 48kHz estéreo com uma senoide na frequência pedida. */
function tom(hz: number, amostras: number, amplitude = 10_000): Buffer {
  const b = Buffer.alloc(amostras * 2 * 2)
  for (let i = 0; i < amostras; i++) {
    const v = Math.round(amplitude * Math.sin((2 * Math.PI * hz * i) / 48_000))
    b.writeInt16LE(v, i * 4)
    b.writeInt16LE(v, i * 4 + 2)
  }
  return b
}

function energia(pcm: Buffer): number {
  let soma = 0
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const v = pcm.readInt16LE(i)
    soma += v * v
  }
  return Math.sqrt(soma / (pcm.length / 2))
}

describe('paraPcm16kMono', () => {
  it('reduz a taxa por 3 e junta os canais', () => {
    const saida = paraPcm16kMono(tom(440, 300))
    expect(saida.length / 2).toBe(100)
  })

  it('preserva a voz: 400 Hz passa praticamente intacto', () => {
    const saida = paraPcm16kMono(tom(400, 4_800))
    expect(energia(saida)).toBeGreaterThan(6_000)
  })

  // Esta é a razão de existir do filtro. Acima de 8 kHz (Nyquist de 16 kHz) o conteúdo
  // PRECISA ser atenuado; sem filtro ele é rebatido para dentro da faixa da voz com
  // energia quase total, justo em cima das consoantes.
  it('atenua 18 kHz em vez de rebater para dentro da voz', () => {
    const grave = energia(paraPcm16kMono(tom(400, 4_800)))
    const agudo = energia(paraPcm16kMono(tom(18_000, 4_800)))
    expect(agudo).toBeLessThan(grave * 0.35)
  })

  it('atenua 16 kHz, que a decimação ingênua rebateria para 0 Hz', () => {
    const grave = energia(paraPcm16kMono(tom(400, 4_800)))
    expect(energia(paraPcm16kMono(tom(16_000, 4_800)))).toBeLessThan(grave * 0.35)
  })

  it('não estoura o inteiro de 16 bits com sinal no limite', () => {
    const saida = paraPcm16kMono(tom(400, 300, 32_767))
    for (let i = 0; i + 1 < saida.length; i += 2) {
      const v = saida.readInt16LE(i)
      expect(v).toBeGreaterThanOrEqual(-32_768)
      expect(v).toBeLessThanOrEqual(32_767)
    }
  })

  it('buffer vazio devolve buffer vazio', () => {
    expect(paraPcm16kMono(Buffer.alloc(0)).length).toBe(0)
  })
})
