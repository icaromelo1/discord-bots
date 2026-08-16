import { config } from '../config'
import { pcmParaWav } from './gemini-tts'

const BASE = 'https://api.groq.com/openai/v1'

function chave(): string {
  if (!config.groq.apiKey) {
    throw new Error('GROQ_API_KEY não configurada — crie uma chave grátis em console.groq.com')
  }
  return config.groq.apiKey
}

/**
 * Transcreve com Whisper hospedado no Groq.
 *
 * O free tier são 2.000 requisições por dia, contra 20 do Gemini em texto — é o que
 * torna o caminho em cascata viável sem pagar. E aqui o idioma é NOSSO: `language=pt`
 * elimina a confusão de português com francês que a detecção automática produzia.
 */
export async function transcreverComGroq(pcm16kMono: Buffer): Promise<string> {
  const wav = pcmParaWav(pcm16kMono, 16_000, 1)

  const formulario = new FormData()
  formulario.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'fala.wav')
  formulario.append('model', config.groq.modeloAudio)
  formulario.append('language', 'pt')
  formulario.append('response_format', 'json')
  // temperatura zero: transcrição não deve inventar quando o áudio está ruim
  formulario.append('temperature', '0')

  const resposta = await fetch(`${BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${chave()}` },
    body: formulario,
    signal: AbortSignal.timeout(30_000),
  })

  if (!resposta.ok) {
    throw new Error(`Groq (transcrição) devolveu ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`)
  }

  const dados = (await resposta.json()) as { text?: string }
  return (dados.text ?? '').trim()
}

export async function responderComGroq(
  historico: { quem: 'pessoa' | 'bot'; texto: string }[],
  instrucao: string,
): Promise<string> {
  const resposta = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${chave()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.groq.modeloTexto,
      messages: [
        { role: 'system', content: instrucao },
        ...historico.map((m) => ({ role: m.quem === 'pessoa' ? 'user' : 'assistant', content: m.texto })),
      ],
      // resposta curta de propósito: é conversa por voz, ninguém quer ouvir parágrafo
      max_tokens: 200,
      temperature: 0.8,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!resposta.ok) {
    throw new Error(`Groq (texto) devolveu ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`)
  }

  const dados = (await resposta.json()) as { choices?: { message?: { content?: string } }[] }
  return (dados.choices?.[0]?.message?.content ?? '').trim()
}

export function groqDisponivel(): boolean {
  return Boolean(config.groq.apiKey)
}
