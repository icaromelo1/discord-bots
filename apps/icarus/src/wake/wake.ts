import type { Transcritor } from '../memory/transcritor'

const PALAVRA_PADRAO = 'icarus'

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

export class WakeDetector {
  constructor(
    private readonly transcritor: Transcritor,
    private readonly palavra: string = PALAVRA_PADRAO,
  ) {}

  /** Transcreve o trecho e verifica se a palavra de ativação aparece. */
  async examinar(userId: string, pcm16k: Buffer): Promise<DeteccaoWake | null> {
    const texto = await this.transcritor.transcrever(pcm16k)
    if (!texto) return null

    const { achou, resto } = encontrarPalavra(texto, this.palavra)
    if (!achou) return null

    return { userId, texto, textoAposNome: resto }
  }
}
