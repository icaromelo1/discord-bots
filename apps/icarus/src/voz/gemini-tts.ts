import { GoogleGenAI } from '@google/genai'
import { config } from '../config'

/**
 * Vozes prontas do Gemini TTS. A lista é fixa no serviço; manter aqui evita uma chamada
 * de rede só para popular um seletor.
 */
export const VOZES_GEMINI = [
  'Zephyr',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Algenib',
  'Rasalgethi',
  'Laomedeia',
  'Achernar',
  'Alnilam',
  'Schedar',
  'Gacrux',
  'Pulcherrima',
  'Achird',
  'Zubenelgenubi',
  'Vindemiatrix',
  'Sadachbia',
  'Sadaltager',
  'Sulafat',
] as const

export interface OpcoesGeminiTts {
  voz?: string
  modelo?: string
  /** Instrução de estilo, ex: "fale animado e rápido". */
  estilo?: string
}

/** PCM16 24kHz mono, que é o formato que o serviço devolve. */
export interface AudioSintetizado {
  pcm: Buffer
  taxaHz: number
}

export async function sintetizarGemini(texto: string, opcoes: OpcoesGeminiTts = {}): Promise<AudioSintetizado> {
  if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEY não configurada')

  const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey })
  const prompt = opcoes.estilo ? `${opcoes.estilo}: ${texto}` : texto

  const resposta = await ai.models.generateContent({
    model: opcoes.modelo ?? config.tts.geminiModelo,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: opcoes.voz ?? config.gemini.voz } },
      },
    },
  })

  const dados = resposta.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  if (!dados) throw new Error('O serviço não devolveu áudio — verifique cota e nome do modelo.')

  return { pcm: Buffer.from(dados, 'base64'), taxaHz: 24_000 }
}

/** Embrulha PCM cru em WAV, para o navegador conseguir tocar. */
export function pcmParaWav(pcm: Buffer, taxaHz = 24_000, canais = 1): Buffer {
  const bytesPorAmostra = 2
  const byteRate = taxaHz * canais * bytesPorAmostra
  const cabecalho = Buffer.alloc(44)

  cabecalho.write('RIFF', 0)
  cabecalho.writeUInt32LE(36 + pcm.length, 4)
  cabecalho.write('WAVE', 8)
  cabecalho.write('fmt ', 12)
  cabecalho.writeUInt32LE(16, 16)
  cabecalho.writeUInt16LE(1, 20)
  cabecalho.writeUInt16LE(canais, 22)
  cabecalho.writeUInt32LE(taxaHz, 24)
  cabecalho.writeUInt32LE(byteRate, 28)
  cabecalho.writeUInt16LE(canais * bytesPorAmostra, 32)
  cabecalho.writeUInt16LE(16, 34)
  cabecalho.write('data', 36)
  cabecalho.writeUInt32LE(pcm.length, 40)

  return Buffer.concat([cabecalho, pcm])
}
