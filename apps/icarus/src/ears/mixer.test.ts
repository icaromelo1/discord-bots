import { describe, expect, it } from 'vitest'
import { Mixer } from './mixer'

const JANELA_MS = 100
const AMOSTRAS_POR_JANELA = JANELA_MS * 16

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

describe('Mixer', () => {
  it('uma pessoa só: o PCM sai igual ao que entrou', () => {
    const mixer = new Mixer(JANELA_MS)
    const entrada = pcmDe([100, -200, 300])
    mixer.adicionar('a', entrada)

    const janela = mixer.fechar()

    expect(janela).not.toBeNull()
    expect(amostras(janela!.pcm).slice(0, 3)).toEqual([100, -200, 300])
  })

  it('duas pessoas: as amostras somam', () => {
    const mixer = new Mixer(JANELA_MS)
    mixer.adicionar('a', pcmDe([100, -200, 300]))
    mixer.adicionar('b', pcmDe([50, 50, -100]))

    const janela = mixer.fechar()

    expect(amostras(janela!.pcm).slice(0, 3)).toEqual([150, -150, 200])
  })

  it('saturação: soma que passaria de 32767 satura, não dá overflow', () => {
    const mixer = new Mixer(JANELA_MS)
    mixer.adicionar('a', pcmDe([32000]))
    mixer.adicionar('b', pcmDe([32000]))

    const janela = mixer.fechar()

    expect(amostras(janela!.pcm)[0]).toBe(32767)
  })

  it('saturação negativa: soma que passaria de -32768 satura', () => {
    const mixer = new Mixer(JANELA_MS)
    mixer.adicionar('a', pcmDe([-32000]))
    mixer.adicionar('b', pcmDe([-32000]))

    const janela = mixer.fechar()

    expect(amostras(janela!.pcm)[0]).toBe(-32768)
  })

  it('fechar() sem ninguém falando devolve null', () => {
    const mixer = new Mixer(JANELA_MS)

    expect(mixer.fechar()).toBeNull()
  })

  it('falantes lista exatamente quem contribuiu', () => {
    const mixer = new Mixer(JANELA_MS)
    mixer.adicionar('a', pcmDe([100]))
    mixer.adicionar('b', pcmDe([200]))

    const janela = mixer.fechar()

    expect(janela!.falantes.sort()).toEqual(['a', 'b'])
  })

  it('troca de falante dominante é detectada uma vez e não se repete', () => {
    const mixer = new Mixer(JANELA_MS)

    mixer.adicionar('a', pcmDe([1000]))
    mixer.fechar()
    expect(mixer.consumirTrocaDeFalante()).toBe('a')
    expect(mixer.consumirTrocaDeFalante()).toBeNull()

    mixer.adicionar('a', pcmDe([1000]))
    mixer.fechar()
    expect(mixer.consumirTrocaDeFalante()).toBeNull()

    mixer.adicionar('b', pcmDe([5000]))
    mixer.fechar()
    expect(mixer.consumirTrocaDeFalante()).toBe('b')
    expect(mixer.consumirTrocaDeFalante()).toBeNull()
  })

  it('sobra de buffer maior que a janela aparece na janela seguinte', () => {
    const mixer = new Mixer(JANELA_MS)
    const valores = new Array(AMOSTRAS_POR_JANELA + 5).fill(0).map((_, i) => (i < AMOSTRAS_POR_JANELA ? 10 : 999))
    mixer.adicionar('a', pcmDe(valores))

    const primeira = mixer.fechar()
    expect(amostras(primeira!.pcm)[0]).toBe(10)

    const segunda = mixer.fechar()
    expect(segunda).not.toBeNull()
    expect(amostras(segunda!.pcm).slice(0, 5)).toEqual([999, 999, 999, 999, 999])
    expect(segunda!.falantes).toEqual(['a'])
  })

  it('limpar() zera acumulador, energia, pendentes e estado de troca', () => {
    const mixer = new Mixer(JANELA_MS)
    mixer.adicionar('a', pcmDe(new Array(AMOSTRAS_POR_JANELA + 5).fill(50)))
    mixer.fechar()

    mixer.limpar()

    expect(mixer.consumirTrocaDeFalante()).toBeNull()
    const janela = mixer.fechar()
    expect(janela).toBeNull()
  })
})
