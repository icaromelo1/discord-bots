import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai'
import { config } from '../config'
import { sintetizarGemini } from '../voz/gemini-tts'
import { sintetizarPiper } from '../voz/piper'
import { responderComGemini, transcreverComGemini } from '../voz/transcrever-gemini'
import { extrairPcmDeWav, taxaDoWav } from '../voz/wav'

export type Motor = 'piper' | 'gemini' | 'stream'

interface Mensagem {
  tipo: 'iniciar' | 'audio' | 'encerrar'
  motor?: Motor
  voz?: string
  instrucao?: string
  velocidade?: number
  /** PCM16 16kHz mono em base64. */
  dados?: string
}

const INSTRUCAO_PADRAO =
  'Você é o Icarus, um membro de um servidor de Discord. ' +
  // o idioma da ENTRADA não é configurável na API (a transcrição usa detecção
  // automática e estava confundindo português com francês), então é aqui que dá para
  // dizer o que esperar de quem fala
  'TODAS as pessoas desta call falam português do Brasil — interprete o áudio sempre ' +
  'como português brasileiro, nunca como outro idioma. ' +
  'Responda em português do Brasil, curto e natural, como alguém numa call. ' +
  'Nada de listas ou formatação: é conversa por voz.'

/**
 * Simula uma call no navegador: microfone entra, resposta sai.
 *
 * Existe porque testar dentro do Discord custa uma call inteira e depende de outras
 * pessoas. Aqui os três motores rodam o mesmo caminho conceitual do bot — a diferença é
 * que a entrada vem do navegador em vez da conexão de voz.
 */
export function instalarChamada(servidor: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: servidor, path: '/ws/chamada' })

  wss.on('connection', (ws) => {
    console.log('[chamada] navegador conectou')
    const sessao = new SessaoDeChamada(ws)
    ws.on('message', (bruto) => void sessao.aoReceber(String(bruto)))
    ws.on('close', (codigo) => {
      console.log(`[chamada] navegador desconectou (${codigo})`)
      void sessao.encerrar()
    })
    ws.on('error', (erro) => {
      console.error('[chamada] erro no websocket:', erro.message)
      void sessao.encerrar()
    })
  })

  wss.on('error', (erro) => console.error('[chamada] erro no servidor websocket:', erro.message))

  return wss
}

class SessaoDeChamada {
  private motor: Motor = 'piper'
  private voz: string | undefined
  private velocidade = 1
  private instrucao = INSTRUCAO_PADRAO
  private readonly historico: { quem: 'pessoa' | 'bot'; texto: string }[] = []
  private live: Session | null = null
  private ocupado = false

  constructor(private readonly ws: WebSocket) {}

  private enviar(payload: Record<string, unknown>): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(payload))
  }

  async aoReceber(bruto: string): Promise<void> {
    let msg: Mensagem
    try {
      msg = JSON.parse(bruto) as Mensagem
    } catch {
      return
    }

    if (msg.tipo === 'iniciar') return this.iniciar(msg)
    if (msg.tipo === 'encerrar') return this.encerrar()
    if (msg.tipo === 'audio' && msg.dados) {
      const pcm = Buffer.from(msg.dados, 'base64')
      const ms = Math.round((pcm.length / 2 / 16_000) * 1000)
      console.log(`[chamada] fala recebida: ${ms}ms, ${(pcm.length / 1024).toFixed(0)}KB`)
      return this.aoFalar(pcm)
    }
  }

  private async iniciar(msg: Mensagem): Promise<void> {
    this.motor = msg.motor ?? 'piper'
    this.voz = msg.voz
    this.velocidade = msg.velocidade ?? 1
    this.instrucao = msg.instrucao?.trim() || INSTRUCAO_PADRAO
    this.historico.length = 0

    if (this.motor === 'stream') {
      try {
        await this.abrirLive()
      } catch (erro) {
        this.enviar({ tipo: 'erro', mensagem: erro instanceof Error ? erro.message : String(erro) })
        return
      }
    }

    console.log(`[chamada] iniciada com motor=${this.motor} voz=${this.voz ?? 'padrão'}`)
    this.enviar({ tipo: 'pronto', motor: this.motor })
  }

  /** No modo stream a sessão fica aberta a chamada inteira, como no bot. */
  private async abrirLive(): Promise<void> {
    if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEY não configurada')

    const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey })
    let inicioDaResposta = 0

    this.live = await ai.live.connect({
      model: config.gemini.model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: this.instrucao,
        speechConfig: {
          languageCode: config.gemini.idioma,
          voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voz ?? config.gemini.voz } },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
        // deixa o modelo ignorar o que claramente não é para ele, em vez de responder
        // "não entendi" a cada ruído captado
        proactivity: { proactiveAudio: true },
      },
      callbacks: {
        onmessage: (mensagem: LiveServerMessage) => {
          const conteudo = mensagem.serverContent
          if (!conteudo) return

          for (const parte of conteudo.modelTurn?.parts ?? []) {
            const dados = parte.inlineData?.data
            if (!dados) continue
            if (!inicioDaResposta) {
              inicioDaResposta = Date.now()
              this.enviar({ tipo: 'falando' })
            }
            this.enviar({ tipo: 'audio', dados, taxaHz: 24_000 })
          }

          const entrada = conteudo.inputTranscription?.text
          if (entrada) this.enviar({ tipo: 'transcricao', quem: 'pessoa', texto: entrada, parcial: true })

          const saida = conteudo.outputTranscription?.text
          if (saida) this.enviar({ tipo: 'transcricao', quem: 'bot', texto: saida, parcial: true })

          if (conteudo.turnComplete || conteudo.generationComplete) {
            this.enviar({ tipo: 'fim-da-fala' })
            inicioDaResposta = 0
          }
        },
        onerror: () => this.enviar({ tipo: 'erro', mensagem: 'a sessão caiu' }),
        onclose: () => this.enviar({ tipo: 'encerrada' }),
      },
    })
  }

  private async aoFalar(pcm16k: Buffer): Promise<void> {
    if (this.motor === 'stream') {
      if (!this.live) return
      this.live.sendRealtimeInput({ activityStart: {} })
      this.live.sendRealtimeInput({
        media: { data: pcm16k.toString('base64'), mimeType: 'audio/pcm;rate=16000' },
      })
      this.live.sendRealtimeInput({ activityEnd: {} })
      return
    }

    // Piper e Gemini TTS: transcrever, pensar, sintetizar. Uma fala por vez — pedidos
    // sobrepostos só produziriam respostas cruzadas.
    if (this.ocupado) return
    this.ocupado = true

    try {
      const t0 = Date.now()
      const dito = await transcreverComGemini(pcm16k)
      if (!dito) return
      const t1 = Date.now()
      this.enviar({ tipo: 'transcricao', quem: 'pessoa', texto: dito })

      this.historico.push({ quem: 'pessoa', texto: dito })
      const resposta = await responderComGemini(this.historico, this.instrucao)
      if (!resposta) return
      const t2 = Date.now()

      this.historico.push({ quem: 'bot', texto: resposta })
      this.enviar({ tipo: 'transcricao', quem: 'bot', texto: resposta })
      this.enviar({ tipo: 'falando' })

      let audio: Buffer
      let taxaHz: number
      if (this.motor === 'gemini') {
        const a = await sintetizarGemini(resposta, { voz: this.voz })
        audio = a.pcm
        taxaHz = a.taxaHz
      } else {
        const wav = await sintetizarPiper(resposta, { voz: this.voz, velocidade: this.velocidade })
        audio = extrairPcmDeWav(wav)
        // a taxa vem do próprio arquivo: ela muda conforme a voz do piper
        taxaHz = taxaDoWav(wav)
      }
      const t3 = Date.now()

      this.enviar({ tipo: 'audio', dados: audio.toString('base64'), taxaHz })
      this.enviar({
        tipo: 'fim-da-fala',
        tempos: { transcrever: t1 - t0, pensar: t2 - t1, falar: t3 - t2, total: t3 - t0 },
      })
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro)
      console.error('[chamada] falhou:', mensagem.slice(0, 200))
      this.enviar({ tipo: 'erro', mensagem })
    } finally {
      this.ocupado = false
    }
  }

  async encerrar(): Promise<void> {
    try {
      this.live?.close()
    } catch {
      // já fechada pelo servidor
    }
    this.live = null
  }
}
