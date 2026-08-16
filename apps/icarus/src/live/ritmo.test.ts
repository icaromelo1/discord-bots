import { describe, expect, it } from 'vitest'
import { RitmoDaConversa } from './ritmo'

function conversa(intervalos: number[]): RitmoDaConversa {
  const r = new RitmoDaConversa()
  let t = 0
  r.registrarFala(t)
  for (const i of intervalos) {
    t += i
    r.registrarFala(t)
  }
  return r
}

describe('RitmoDaConversa', () => {
  it('usa o mínimo enquanto não tem amostra suficiente', () => {
    expect(new RitmoDaConversa().janelaMs()).toBe(6_000)
    expect(conversa([1_000]).janelaMs()).toBe(6_000)
  })

  it('grupo que emenda as frases ganha janela curta', () => {
    // falas a cada ~1s: 3x isso seria 3s, mas o piso protege de cortar cedo demais
    expect(conversa([1_000, 900, 1_100, 1_000]).janelaMs()).toBe(6_000)
  })

  it('conversa pausada estica a janela', () => {
    // ~5s entre falas -> janela de 15s, bem acima do piso
    expect(conversa([5_000, 5_000, 5_000, 5_000]).janelaMs()).toBe(15_000)
  })

  it('respeita o teto mesmo com conversa muito arrastada', () => {
    expect(conversa([20_000, 22_000, 21_000, 20_000]).janelaMs()).toBe(25_000)
  })

  it('uma pausa longa isolada não estica a janela — mediana, não média', () => {
    const comOutlier = conversa([1_000, 1_000, 24_000, 1_000, 1_000])
    const semOutlier = conversa([1_000, 1_000, 1_000, 1_000, 1_000])
    expect(comOutlier.janelaMs()).toBe(semOutlier.janelaMs())
  })

  it('ignora intervalo acima do teto — é retorno, não ritmo', () => {
    const r = new RitmoDaConversa()
    r.registrarFala(0)
    r.registrarFala(120_000)
    expect(r.amostras()).toBe(0)
  })

  it('limpar zera o aprendizado entre sessões', () => {
    const r = conversa([5_000, 5_000, 5_000, 5_000])
    r.limpar()
    expect(r.janelaMs()).toBe(6_000)
  })
})
