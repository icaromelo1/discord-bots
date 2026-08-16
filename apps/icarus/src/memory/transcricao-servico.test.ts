import { describe, expect, it, vi } from 'vitest'
import { TranscricaoServico } from './transcricao-servico'
import type { Transcritor } from './transcritor'

function transcritorFake(texto: (pcm: Buffer) => string, atrasoMs = 0): Transcritor {
  return {
    disponivel: () => true,
    transcrever: async (pcm) => {
      if (atrasoMs) await new Promise((r) => setTimeout(r, atrasoMs))
      return texto(pcm)
    },
  }
}

const agora = () => Date.now()

describe('TranscricaoServico', () => {
  it('transcreve normalmente quando há folga', async () => {
    const s = new TranscricaoServico(transcritorFake(() => 'oi'), 3)
    expect(await s.transcrever({ pcm: Buffer.from([1]), em: agora() })).toBe('oi')
  })

  it('descarta o que envelheceu além do limite, em vez de responder ao passado', async () => {
    const s = new TranscricaoServico(transcritorFake(() => 'tarde demais'), 3, 5_000)
    const antigo = await s.transcrever({ pcm: Buffer.from([1]), em: Date.now() - 30_000 })
    expect(antigo).toBe('')
  })

  // pilha, não fila: sob carga o que interessa é o que acabou de ser dito
  it('atende o mais recente primeiro quando acumula', async () => {
    const ordem: string[] = []
    const s = new TranscricaoServico(
      transcritorFake((pcm) => {
        ordem.push(String(pcm[0]))
        return String(pcm[0])
      }, 5),
      1,
    )
    const t = agora()
    const p1 = s.transcrever({ pcm: Buffer.from([1]), em: t })
    const p2 = s.transcrever({ pcm: Buffer.from([2]), em: t })
    const p3 = s.transcrever({ pcm: Buffer.from([3]), em: t })
    await Promise.all([p1, p2, p3])
    expect(ordem[ordem.length - 1]).not.toBe('3')
  })

  it('lotado, descarta os mais antigos e resolve vazio em vez de travar', async () => {
    const s = new TranscricaoServico(transcritorFake(() => 'ok', 50), 1, 60_000, 3)
    const t = agora()
    const promessas = Array.from({ length: 10 }, (_, i) =>
      s.transcrever({ pcm: Buffer.from([i]), em: t }),
    )
    const r = await Promise.all(promessas)
    expect(r.filter((x) => x === '').length).toBeGreaterThan(0)
    expect(s.pendentesCount()).toBeLessThanOrEqual(3)
  })

  it('transcritor indisponível devolve vazio sem enfileirar', async () => {
    const s = new TranscricaoServico({ disponivel: () => false, transcrever: async () => 'x' })
    expect(await s.transcrever({ pcm: Buffer.from([1]), em: agora() })).toBe('')
    expect(s.pendentesCount()).toBe(0)
  })

  it('erro do transcritor não trava os seguintes', async () => {
    let n = 0
    const s = new TranscricaoServico(
      { disponivel: () => true, transcrever: async () => { if (n++ === 0) throw new Error('falhou'); return 'depois' } },
      1,
    )
    const t = agora()
    const [a, b] = await Promise.all([
      s.transcrever({ pcm: Buffer.from([1]), em: t }),
      s.transcrever({ pcm: Buffer.from([2]), em: t }),
    ])
    expect([a, b]).toContain('depois')
  })
})
