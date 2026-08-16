import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai'
import { config } from '../config'

export interface OpcoesLive {
  voz?: string
  modelo?: string
  /** Instrução de sistema — muda o jeito de falar, não só o conteúdo. */
  instrucao?: string
}

export interface RespostaLive {
  pcm: Buffer
  taxaHz: number
  /** O que ele disse, segundo a própria transcrição de saída. */
  texto: string
  /** Do envio até o primeiro pedaço de áudio — é a latência que se sente numa call. */
  primeiroAudioMs: number
  totalMs: number
}

/**
 * Uma ida e volta pela Live API usando TEXTO como entrada.
 *
 * A sessão de voz aceita texto, não só áudio — e é isso que permite testá-la fora de uma
 * call do Discord. Com a mesma frase entrando nos três motores, dá para comparar voz e
 * latência ouvindo, em vez de discutir no abstrato.
 */
export async function sintetizarViaLive(texto: string, opcoes: OpcoesLive = {}): Promise<RespostaLive> {
  if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEY não configurada')

  const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey })
  const pedacos: Buffer[] = []
  let transcricao = ''
  let sessao: Session | null = null

  const inicio = Date.now()
  let primeiroAudioEm = 0

  try {
    return await new Promise<RespostaLive>((resolver, rejeitar) => {
      const relogio = setTimeout(() => rejeitar(new Error('a Live API não respondeu a tempo')), 45_000)

      const finalizar = (): void => {
        clearTimeout(relogio)
        resolver({
          pcm: Buffer.concat(pedacos),
          taxaHz: 24_000,
          texto: transcricao.trim(),
          primeiroAudioMs: primeiroAudioEm ? primeiroAudioEm - inicio : 0,
          totalMs: Date.now() - inicio,
        })
      }

      void ai.live
        .connect({
          model: opcoes.modelo ?? config.gemini.model,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction:
              opcoes.instrucao ??
              'Você é o Icarus. Responda em português do Brasil, de forma curta e natural.',
            speechConfig: {
              languageCode: config.gemini.idioma,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: opcoes.voz ?? config.gemini.voz } },
            },
            outputAudioTranscription: {},
          },
          callbacks: {
            onmessage: (mensagem: LiveServerMessage) => {
              const conteudo = mensagem.serverContent
              if (!conteudo) return

              for (const parte of conteudo.modelTurn?.parts ?? []) {
                const dados = parte.inlineData?.data
                if (!dados) continue
                if (!primeiroAudioEm) primeiroAudioEm = Date.now()
                pedacos.push(Buffer.from(dados, 'base64'))
              }

              const saida = conteudo.outputTranscription?.text
              if (saida) transcricao += saida

              if (conteudo.turnComplete || conteudo.generationComplete) finalizar()
            },
            onerror: (e) => {
              clearTimeout(relogio)
              rejeitar(new Error(`erro na sessão: ${String((e as { message?: string })?.message ?? e)}`))
            },
            onclose: () => {
              if (pedacos.length > 0) finalizar()
            },
          },
        })
        .then((s) => {
          sessao = s
          s.sendClientContent({ turns: [{ role: 'user', parts: [{ text: texto }] }], turnComplete: true })
        })
        .catch((e) => {
          clearTimeout(relogio)
          rejeitar(e instanceof Error ? e : new Error(String(e)))
        })
    })
  } finally {
    try {
      ;(sessao as Session | null)?.close()
    } catch {
      // sessão já fechada pelo servidor — não é erro
    }
  }
}
