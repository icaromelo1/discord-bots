import type { Transcritor } from '../memory/transcritor'

const PALAVRA_PADRAO = 'icaro'

/**
 * O Whisper erra o nome porque "Icarus" não é palavra do português. Estas são as formas
 * que ele de fato produziu em uso real na Bayuka, mais variantes próximas. O prompt
 * inicial passado ao binário reduz muito o problema, mas não elimina — as duas defesas
 * juntas é que tornam a ativação confiável.
 *
 * Cada entrada é comparada em limite de palavra, então "picarus" continua não casando.
 */
const VARIANTES = [
  'icaro',
  'icarus',
  'icaros',
  'ycaro',
  'i caro',
  'e caro',
  'hicaro',
]

export interface DeteccaoWake {
  userId: string
  texto: string
  textoAposNome: string
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * PURA e exportada: é o coração testável.
 *
 * Casa só em limite de palavra (\b) para não confundir "icaruso" ou "picarus" com
 * "icarus" — um falso positivo abre sessão e faz o bot falar sozinho no meio da
 * conversa.
 */
export function encontrarPalavra(texto: string, palavra: string): { achou: boolean; resto: string } {
  const textoNormalizado = semAcento(texto).toLowerCase()
  const palavraNormalizada = semAcento(palavra).toLowerCase()

  const regex = new RegExp(`\\b${escaparRegex(palavraNormalizada)}\\b`)
  const match = regex.exec(textoNormalizado)

  if (!match) return { achou: false, resto: '' }

  const restoBruto = texto.slice(match.index + match[0].length)
  const resto = restoBruto.replace(/^[^\p{L}\p{N}]+/u, '').trimEnd()

  return { achou: true, resto }
}

/**
 * Procura a palavra de ativação aceitando as formas que o reconhecedor costuma produzir.
 * Devolve o resto da frase a partir da variante que casar primeiro no texto.
 */
export function encontrarAtivacao(texto: string, palavra: string): { achou: boolean; resto: string } {
  const normalizada = semAcento(palavra).toLowerCase()
  const candidatas = normalizada === PALAVRA_PADRAO || normalizada === 'icarus' ? VARIANTES : [palavra]

  let melhor: { achou: boolean; resto: string; posicao: number } | null = null
  for (const candidata of candidatas) {
    const resultado = encontrarPalavra(texto, candidata)
    if (!resultado.achou) continue
    const posicao = semAcento(texto).toLowerCase().indexOf(semAcento(candidata).toLowerCase())
    if (!melhor || posicao < melhor.posicao) melhor = { ...resultado, posicao }
  }

  return melhor ? { achou: true, resto: melhor.resto } : { achou: false, resto: '' }
}

export class WakeDetector {
  constructor(
    private readonly transcritor: Transcritor,
    private readonly palavra: string = PALAVRA_PADRAO,
  ) {}

  /**
   * Transcreve o trecho e verifica se a palavra de ativação aparece.
   *
   * Devolve o texto SEMPRE, inclusive quando não acorda: transcrever de novo só para
   * mostrar no painel dobraria o custo de CPU em toda fala que não é para o bot — e
   * essas são a maioria.
   */
  async examinar(userId: string, pcm16k: Buffer): Promise<{ texto: string; deteccao: DeteccaoWake | null }> {
    const texto = await this.transcritor.transcrever(pcm16k)
    if (!texto) return { texto: '', deteccao: null }

    const { achou, resto } = encontrarAtivacao(texto, this.palavra)
    if (!achou) return { texto, deteccao: null }

    return { texto, deteccao: { userId, texto, textoAposNome: resto } }
  }
}
