import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'

/**
 * A sessão e o "modo conversa" são coisas diferentes, e misturá-las já causou um bug
 * real: a sessão abria e fechava a cada duas falas do ambiente, porque ouvir sem
 * responder era contado como "a conversa seguiu sem ele".
 *
 * A sessão vive enquanto o bot está na call. O modo conversa liga quando chamam e
 * desliga sozinho. Este teste lê o código para garantir que a distinção não se perca.
 */
const fonte = fs.readFileSync(new URL('./conversa.ts', import.meta.url), 'utf8')

function motivosDe(chamada: string): string[] {
  return [...fonte.matchAll(new RegExp(`${chamada}\\(\\s*[\`']([^\`']+)[\`']`, 'g'))].map((m) => m[1])
}

describe('sessão x modo conversa', () => {
  it('a sessão só é encerrada por motivos de saída de verdade', () => {
    const motivos = motivosDe('this\\.encerrarSessao')
    expect(motivos.sort()).toEqual(['conexao-perdida', 'saiu-da-call'])
  })

  it('silêncio e desinteresse apenas saem do modo conversa, sem fechar a sessão', () => {
    const motivos = motivosDe('this\\.sairDoModoConversa')
    expect(motivos).toContain('conversa-seguiu-sem-ele')
    expect(motivos).toContain('modelo-encerrou')
    expect(motivos).toContain('janela-encerrada')
  })

  it('ouvir sem responder fora do modo conversa não conta como desinteresse', () => {
    // a guarda que faltava: sem ela, cada duas falas do ambiente fechavam a sessão
    expect(fonte).toMatch(/if \(!this\.emConversa\) return/)
  })
})


describe('ouvir sem falar', () => {
  it('todo trecho fecha o turno — sem isso o Gemini não transcreve nada', () => {
    const sessao = fs.readFileSync(new URL('./live/sessao.ts', import.meta.url), 'utf8')
    // o activityEnd não pode voltar a ser condicional: já causou "sessão aberta e
    // nenhum evento", porque áudio sem fim de turno não é processado
    expect(sessao).not.toMatch(/if \(opcoes\.responder\)/)
    expect(sessao).toMatch(/sendRealtimeInput\(\{ activityEnd: \{\} \}\)/)
  })

  it('o silêncio é feito descartando a resposta, não segurando o turno', () => {
    const sessao = fs.readFileSync(new URL('./live/sessao.ts', import.meta.url), 'utf8')
    expect(sessao).toMatch(/!this\.silenciado/)
    expect(fonte).toMatch(/silenciar\(false\)/)
    expect(fonte).toMatch(/silenciar\(true\)/)
  })
})
