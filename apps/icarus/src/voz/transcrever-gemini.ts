import { GoogleGenAI } from '@google/genai'
import { config } from '../config'

/**
 * O serviço devolve 503 "high demand" de forma intermitente — aconteceu em 1 de cada 3
 * chamadas em teste. Sem repetição, isso vira uma resposta perdida no meio da conversa.
 */
function safeJson(valor: unknown): string {
  try {
    return JSON.stringify(valor)
  } catch {
    return String(valor)
  }
}

async function comRepeticao<T>(operacao: () => Promise<T>, tentativas = 4): Promise<T> {
  let ultimoErro: unknown
  for (let i = 0; i < tentativas; i++) {
    try {
      return await operacao()
    } catch (erro) {
      ultimoErro = erro
      // o erro do SDK nem sempre traz a mensagem em `.message`; serializar o objeto
      // inteiro é o único jeito confiável de reconhecer a sobrecarga
      const texto = `${(erro as { message?: string })?.message ?? ''} ${safeJson(erro)}`
      if (!/503|UNAVAILABLE|high demand|overloaded/i.test(texto)) throw erro
      await new Promise((r) => setTimeout(r, 600 * (i + 1)))
    }
  }
  throw ultimoErro
}

/**
 * Transcreve um trecho de fala usando o Gemini em modo texto.
 *
 * Existe para o laboratório poder simular a call com Piper e Gemini TTS sem depender do
 * Whisper local estar instalado. É o mesmo papel que o Whisper faz no bot de verdade —
 * aqui vale a conveniência de não precisar de binário nenhum na máquina.
 */
export async function transcreverComGemini(pcm16kMono: Buffer): Promise<string> {
  if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEY não configurada')

  const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey })

  const resposta = await comRepeticao(() =>
    ai.models.generateContent({
    model: config.tts.modeloTexto,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'Transcreva exatamente o que foi dito neste áudio, em português do Brasil. ' +
              'Responda SOMENTE com a transcrição, sem comentário. Se não houver fala, responda vazio.',
          },
          { inlineData: { mimeType: 'audio/pcm;rate=16000', data: pcm16kMono.toString('base64') } },
        ],
      },
    ],
    }),
  )

  return (resposta.text ?? '').trim()
}

/** Gera a resposta em texto, dado o que a pessoa disse e o contexto da conversa. */
export async function responderComGemini(
  historico: { quem: 'pessoa' | 'bot'; texto: string }[],
  instrucao: string,
): Promise<string> {
  if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEY não configurada')

  const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey })

  const resposta = await comRepeticao(() =>
    ai.models.generateContent({
      model: config.tts.modeloTexto,
      config: { systemInstruction: instrucao },
      contents: historico.map((m) => ({
        role: m.quem === 'pessoa' ? 'user' : 'model',
        parts: [{ text: m.texto }],
      })),
    }),
  )

  return (resposta.text ?? '').trim()
}
