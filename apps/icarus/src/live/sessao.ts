import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai'
import { config } from '../config'

export type EstadoSessao = 'fechada' | 'abrindo' | 'aberta' | 'erro'

export interface SessaoOpcoes {
  guildId: string
  contextoInicial: string
  onAudio: (pcm24kMono: Buffer) => void
  onTranscricao: (quem: 'usuario' | 'bot', texto: string) => void
  onFechada: (motivo: string) => void
}

export class CotaEstouradaError extends Error {}
export class ModeloIndisponivelError extends Error {}

function textoDoErro(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

export function classificarErro(e: unknown): Error {
  const texto = textoDoErro(e).toLowerCase()

  if (texto.includes('429') || texto.includes('quota') || texto.includes('resource_exhausted')) {
    return new CotaEstouradaError(
      'A cota diária do Gemini estourou. A conversa por voz volta a funcionar amanhã.',
    )
  }

  if (texto.includes('404') || texto.includes('not found') || texto.includes('not_found')) {
    return new ModeloIndisponivelError(
      `O modelo configurado em GEMINI_MODEL (${config.gemini.model}) não está mais disponível. Ele é um modelo preview e pode sumir sem aviso — ajuste a variável.`,
    )
  }

  return new Error('Erro inesperado na sessão de voz com o Gemini.')
}

export class SessaoLive {
  private estadoAtual: EstadoSessao = 'fechada'
  private session: Session | null = null

  private constructor(private readonly opcoes: SessaoOpcoes) {}

  estado(): EstadoSessao {
    return this.estadoAtual
  }

  static async abrir(opcoes: SessaoOpcoes): Promise<SessaoLive> {
    if (!config.gemini.apiKey) {
      throw new Error(
        'Variável de ambiente obrigatória ausente: GEMINI_API_KEY — não é possível abrir sessão com o Gemini Live.',
      )
    }

    const sessao = new SessaoLive(opcoes)
    sessao.estadoAtual = 'abrindo'

    const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey })

    try {
      const session = await ai.live.connect({
        model: config.gemini.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: opcoes.contextoInicial,
          speechConfig: {
            languageCode: config.gemini.idioma,
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: config.gemini.voz,
              },
            },
          },
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            sessao.estadoAtual = 'aberta'
          },
          onmessage: (mensagem: LiveServerMessage) => {
            sessao.tratarMensagem(mensagem)
          },
          onerror: () => {
            if (sessao.estadoAtual === 'fechada' || sessao.estadoAtual === 'erro') return
            sessao.estadoAtual = 'erro'
            sessao.opcoes.onFechada('conexao-perdida')
          },
          onclose: () => {
            if (sessao.estadoAtual === 'fechada' || sessao.estadoAtual === 'erro') return
            sessao.estadoAtual = 'erro'
            sessao.opcoes.onFechada('conexao-perdida')
          },
        },
      })

      sessao.session = session
      sessao.estadoAtual = 'aberta'
      return sessao
    } catch (e) {
      sessao.estadoAtual = 'erro'
      throw classificarErro(e)
    }
  }

  private tratarMensagem(mensagem: LiveServerMessage): void {
    const conteudo = mensagem.serverContent
    if (!conteudo) return

    const partes = conteudo.modelTurn?.parts ?? []
    for (const parte of partes) {
      const dados = parte.inlineData?.data
      if (dados) this.opcoes.onAudio(Buffer.from(dados, 'base64'))
    }

    const transcricaoUsuario = conteudo.inputTranscription?.text
    if (transcricaoUsuario) this.opcoes.onTranscricao('usuario', transcricaoUsuario)

    const transcricaoBot = conteudo.outputTranscription?.text
    if (transcricaoBot) this.opcoes.onTranscricao('bot', transcricaoBot)
  }

  enviarAudio(pcm16kMono: Buffer): void {
    if (this.estadoAtual !== 'aberta' || !this.session) return

    this.session.sendRealtimeInput({
      media: {
        data: pcm16kMono.toString('base64'),
        mimeType: 'audio/pcm;rate=16000',
      },
    })
  }

  /** Marcador de quem passou a falar — é isto que permite conhecer os membros. */
  marcarFalante(nome: string): void {
    if (this.estadoAtual !== 'aberta' || !this.session) return

    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text: `[agora quem fala é ${nome}]` }] }],
      turnComplete: false,
    })
  }

  async fechar(motivo: string): Promise<void> {
    if (this.estadoAtual === 'fechada') return

    this.estadoAtual = 'fechada'
    this.session?.close()
    this.session = null
    this.opcoes.onFechada(motivo)
  }
}
