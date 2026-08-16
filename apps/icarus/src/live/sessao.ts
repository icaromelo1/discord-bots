import { type FunctionResponse, GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai'
import { config } from '../config'
import { declaracoesDeFerramentas, type ExecutorDeFerramenta } from './ferramentas'

export type EstadoSessao = 'fechada' | 'abrindo' | 'aberta' | 'erro'

export interface SessaoOpcoes {
  guildId: string
  contextoInicial: string
  onAudio: (pcm24kMono: Buffer) => void
  onTranscricao: (quem: 'usuario' | 'bot', texto: string) => void
  onFechada: (motivo: string) => void
  /** Executa uma ferramenta pedida pelo modelo. Sem isto ele só conversa. */
  executarFerramenta?: ExecutorDeFerramenta
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
          // desligada porque quem marca início e fim de fala somos nós: ver enviarAudio
          realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
          inputAudioTranscription: {},
          tools: opcoes.executarFerramenta ? [{ functionDeclarations: declaracoesDeFerramentas }] : undefined,
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

  private silenciado = true
  private bufferUsuario = ''
  private bufferBot = ''

  /** Emite o que foi acumulado no turno e zera os buffers. */
  private fecharTurno(): void {
    const usuario = this.bufferUsuario.trim()
    const bot = this.bufferBot.trim()
    this.bufferUsuario = ''
    this.bufferBot = ''
    if (usuario) this.opcoes.onTranscricao('usuario', usuario)
    if (bot) this.opcoes.onTranscricao('bot', bot)
  }

  private tratarMensagem(mensagem: LiveServerMessage): void {
    if (mensagem.toolCall?.functionCalls?.length) {
      void this.tratarChamadaDeFerramenta(mensagem.toolCall.functionCalls)
      return
    }

    const conteudo = mensagem.serverContent
    if (!conteudo) return

    const partes = conteudo.modelTurn?.parts ?? []
    for (const parte of partes) {
      const dados = parte.inlineData?.data
      if (dados && !this.silenciado) this.opcoes.onAudio(Buffer.from(dados, 'base64'))
    }

    // A Live API entrega a transcrição em PEDAÇOS ("Co" / "mo é" / " que" / " você").
    // Salvar cada pedaço como uma fala transformava uma frase em onze linhas — por isso
    // acumulamos e só emitimos quando o turno fecha.
    const transcricaoUsuario = conteudo.inputTranscription?.text
    if (transcricaoUsuario) this.bufferUsuario += transcricaoUsuario

    const transcricaoBot = conteudo.outputTranscription?.text
    if (transcricaoBot) this.bufferBot += transcricaoBot

    if (conteudo.turnComplete || conteudo.generationComplete) this.fecharTurno()
  }

  private async tratarChamadaDeFerramenta(
    chamadas: { name?: string; args?: Record<string, unknown>; id?: string }[],
  ): Promise<void> {
    const executar = this.opcoes.executarFerramenta
    if (!executar || !this.session) return

    const respostas: FunctionResponse[] = []
    for (const chamada of chamadas) {
      if (!chamada.name) continue
      let resultado
      try {
        resultado = await executar(chamada.name, chamada.args ?? {})
      } catch (erro) {
        // falha de ferramenta vira resposta, não exceção: o modelo precisa saber que
        // não deu certo para poder avisar quem pediu, em vez de a sessão morrer
        console.error(`${config.gemini.model} ferramenta ${chamada.name} falhou:`, erro)
        resultado = { ok: false, resumo: 'A ação falhou por um erro interno.' }
      }
      respostas.push({
        id: chamada.id,
        name: chamada.name,
        response: { ok: resultado.ok, resumo: resultado.resumo },
      })
    }

    if (respostas.length > 0) this.session.sendToolResponse({ functionResponses: respostas })
  }

  /**
   * Envia uma fala JÁ COMPLETA, marcando início e fim explicitamente.
   *
   * A detecção automática do Gemini espera um fluxo contínuo de áudio para perceber que
   * a pessoa parou de falar. Nós não temos fluxo contínuo: os "ouvidos" entregam trechos
   * discretos (o stream do Discord fecha após o silêncio) e entre um trecho e outro não
   * mandamos nada. Sem sinalizar o fim, o modelo recebia a fala e ficava esperando mais —
   * respondia à primeira e emudecia nas seguintes.
   */
  enviarAudio(pcm16kMono: Buffer): void {
    if (this.estadoAtual !== 'aberta' || !this.session) return

    // O turno SEMPRE fecha. Tentei manter o turno aberto para ele "ouvir sem responder",
    // e o efeito foi ele não ouvir nada: sem activityEnd o modelo não processa o áudio,
    // então não vem transcrição — e sem transcrição não há como detectar o nome.
    // Quem decide se a resposta vira som é a camada de cima (ver silenciar()).
    this.session.sendRealtimeInput({ activityStart: {} })
    this.session.sendRealtimeInput({
      media: {
        data: pcm16kMono.toString('base64'),
        mimeType: 'audio/pcm;rate=16000',
      },
    })
    this.session.sendRealtimeInput({ activityEnd: {} })
  }

  /** Quando silenciado, a resposta em áudio é descartada — ele processa mas não fala. */
  silenciar(valor: boolean): void {
    this.silenciado = valor
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
    // sem isto, a última frase de um turno interrompido some
    this.fecharTurno()
    if (this.estadoAtual === 'fechada') return

    this.estadoAtual = 'fechada'
    this.session?.close()
    this.session = null
    this.opcoes.onFechada(motivo)
  }
}
