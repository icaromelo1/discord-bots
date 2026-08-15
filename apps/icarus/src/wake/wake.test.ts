import { describe, expect, it, vi } from 'vitest'
import { encontrarAtivacao, encontrarPalavra, WakeDetector } from './wake'
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
  function detector(texto: string): WakeDetector {
    const transcritor: Transcritor = { disponivel: () => true, transcrever: async () => texto }
    return new WakeDetector(transcritor, 'icaro')
  }

  it('devolve o texto E a detecção quando a palavra aparece', async () => {
    const r = await detector('Ícaro, toca um som').examinar('user-1', Buffer.alloc(0))
    expect(r.deteccao).toEqual({
      userId: 'user-1',
      texto: 'Ícaro, toca um som',
      textoAposNome: 'toca um som',
    })
  })

  // devolver o texto mesmo sem casar é o que alimenta o painel: transcrever de novo
  // só para exibir dobraria o custo de CPU em toda fala que não é para o bot
  it('devolve o texto mesmo quando a palavra não aparece', async () => {
    const r = await detector('só falando aqui').examinar('user-1', Buffer.alloc(0))
    expect(r.deteccao).toBeNull()
    expect(r.texto).toBe('só falando aqui')
  })

  it('devolve texto vazio e detecção nula quando a transcrição vem vazia', async () => {
    const r = await detector('').examinar('user-1', Buffer.alloc(0))
    expect(r).toEqual({ texto: '', deteccao: null })
  })
})

describe('encontrarAtivacao — o gatilho antigo "Icarus" foi abandonado', () => {
  // O Whisper transcreveu "Icarus" como "E que os", "Carlos" e "Canva-se" em três
  // testes reais na Bayuka. Em vez de perseguir cada erro, o gatilho virou "Ícaro",
  // que existe em português. Estes testes registram que NÃO dependemos mais daquelas
  // formas — se alguém as reintroduzir, é sinal de que voltou a tapar buraco.
  it('não casa mais nas transcrições erradas do nome antigo', () => {
    expect(encontrarAtivacao('E que os coloca pra tocar', 'icaro').achou).toBe(false)
    expect(encontrarAtivacao('E aí, Carlos. Canva-se.', 'icaro').achou).toBe(false)
  })

  it('não dispara em conversa comum sem o nome', () => {
    expect(encontrarAtivacao('então acho que pode ser da academia', 'icaro').achou).toBe(false)
    expect(encontrarAtivacao('mas o Eduardo pega 500kg no legpress', 'icaro').achou).toBe(false)
  })

  it('palavra de ativação customizada não usa as variantes internas', () => {
    expect(encontrarAtivacao('Ícaro, toca um som', 'jarvis').achou).toBe(false)
  })
})

describe('gatilho trocado para "Ícaro" — o Whisper mangava "Icarus" em português', () => {
  it('reconhece com e sem acento', () => {
    expect(encontrarAtivacao('Ícaro, quem é você?', 'icaro').achou).toBe(true)
    expect(encontrarAtivacao('Icaro, quem é você?', 'icaro').achou).toBe(true)
    expect(encontrarAtivacao('ICARO, tá aí?', 'icaro').achou).toBe(true)
  })

  it('continua aceitando quem falar Icarus', () => {
    expect(encontrarAtivacao('Icarus, toca um som', 'icaro').achou).toBe(true)
  })

  it('extrai o pedido depois do nome', () => {
    const r = encontrarAtivacao('Ícaro, coloca Rap da Akatsuki pra tocar', 'icaro')
    expect(r.resto).toBe('coloca Rap da Akatsuki pra tocar')
  })

  it('não dispara em palavra que apenas contém o nome', () => {
    expect(encontrarAtivacao('icarozinho não conta', 'icaro').achou).toBe(false)
  })

  it('não dispara em conversa comum', () => {
    expect(encontrarAtivacao('acho que foi da academia mesmo', 'icaro').achou).toBe(false)
  })
})
