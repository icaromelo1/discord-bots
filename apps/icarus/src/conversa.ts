import type { VoiceBasedChannel } from 'discord.js'
import {
  extractYoutubeId,
  resolveTrack,
  searchYoutube,
  type PlayerController,
  type VoiceManager,
} from '@bots/shared'

function ehLink(entrada: string): boolean {
  return /youtu\.?be|youtube\.com/i.test(entrada)
}
import { config } from './config'
import { Ears, type TrechoDeFala } from './ears/ears'
import { Mixer } from './ears/mixer'
import { Mouth } from './mouth/mouth'
import { Ducking } from './mouth/ducking'
import { SessaoLive, CotaEstouradaError, ModeloIndisponivelError } from './live/sessao'
import { WakeDetector } from './wake/wake'
import { montarContexto } from './brain/contexto'
import { buscar } from './memory/busca'
import type { ResultadoFerramenta } from './live/ferramentas'
import { carregarConhecimento, carregarPersona } from './brain/persona'
import { salvarFala } from './memory/repositorio'
import { registro } from './painel/registro'
import { FilaDeTranscricao } from './memory/fila'

export interface ConversaEmCurso {
  guildId: string
  channelId: string
}

/**
 * Costura tudo: ouvidos → palavra de ativação → sessão Gemini → boca, mais a fila de
 * transcrição de ambiente. É a única peça que conhece todas as outras — de propósito,
 * para que nenhuma delas precise conhecer as demais.
 *
 * Uma call por vez, um servidor por vez: requisito do design, e o que mantém o estado
 * desta classe simples o bastante para caber na cabeça.
 */
export class Conversa {
  private atual: ConversaEmCurso | null = null
  private sessao: SessaoLive | null = null
  private mixer = new Mixer()
  private silencioTimer: NodeJS.Timeout | null = null
  private ultimoFalante: string | null = null
  private readonly nomes = new Map<string, string>()

  private canalDeVoz: VoiceBasedChannel | null = null

  constructor(
    private readonly voice: VoiceManager,
    private readonly controller: PlayerController,
    private readonly ears: Ears,
    private readonly mouth: Mouth,
    private readonly wake: WakeDetector,
    private readonly fila: FilaDeTranscricao,
    private readonly ducking: Ducking,
    private readonly avisar: (guildId: string, texto: string) => void,
  ) {
    this.ears.onFala((trecho) => void this.aoOuvirFala(trecho))
    // se for expulso ou a conexão cair, os ouvidos precisam parar junto — senão fica
    // stream aberto para uma call que não existe mais
    this.voice.onDisconnect((guildId) => {
      if (this.atual?.guildId !== guildId) return
      this.ears.parar(guildId)
      this.atual = null
      void this.encerrarSessao('conexao-perdida')
    })
    this.mouth.onComecouAFalar((guildId) => void this.ducking.abaixar(guildId))
    this.mouth.onParouDeFalar((guildId) => void this.ducking.restaurar(guildId))
  }

  temSessao(): boolean {
    return this.sessao !== null
  }

  onde(): ConversaEmCurso | null {
    return this.atual
  }

  entrar(channel: VoiceBasedChannel, nomes: Map<string, string>): void {
    const connection = this.voice.ensure(channel)
    // sem isto ele sai da call 2 min depois de entrar: o temporizador de ociosidade da
    // camada compartilhada existe para o bot de música, e escutar não conta como tocar
    this.voice.manterConectado(channel.guildId, true)
    this.ears.escutar(connection, channel.guildId)
    this.canalDeVoz = channel
    this.atual = { guildId: channel.guildId, channelId: channel.id }
    this.nomes.clear()
    for (const [id, nome] of nomes) this.nomes.set(id, nome)
  }

  async sair(guildId: string): Promise<void> {
    await this.encerrarSessao('saiu-da-call')
    this.voice.manterConectado(guildId, false)
    this.ears.parar(guildId)
    this.voice.leave(guildId)
    this.atual = null
    this.canalDeVoz = null
  }

  private async aoOuvirFala(trecho: TrechoDeFala): Promise<void> {
    const guildId = this.atual?.guildId
    if (!guildId) return

    const nome = this.nomes.get(trecho.userId) ?? trecho.userId

    // Toda fala vai para a memória de ambiente, tenha sido dirigida ao bot ou não.
    // A fila é assíncrona e nunca bloqueia o caminho da conversa.
    this.fila.enfileirar({
      guildId,
      canalId: this.atual?.channelId ?? '',
      autorId: trecho.userId,
      autorNome: nome,
      pcm: trecho.pcm,
      faladoEm: new Date(trecho.inicioMs),
    })

    if (this.sessao) {
      this.alimentarSessao(trecho, nome)
      return
    }

    const { texto, deteccao } = await this.wake.examinar(trecho.userId, trecho.pcm)
    // registra também o que NÃO acordou: é justamente isso que revela como o
    // reconhecedor está entendendo o nome
    registro.registrar({
      tipo: 'wake',
      autor: nome,
      texto: texto || '(sem fala reconhecida)',
      acordou: Boolean(deteccao),
    })
    if (!deteccao) return

    await this.abrirSessao(guildId, trecho, nome, deteccao.textoAposNome)
  }

  private alimentarSessao(trecho: TrechoDeFala, nome: string): void {
    if (!this.sessao) return

    // marcador só quando o falante muda: repetir a cada trecho poluiria a conversa
    if (this.ultimoFalante !== trecho.userId) {
      this.sessao.marcarFalante(nome)
      this.ultimoFalante = trecho.userId
    }

    this.sessao.enviarAudio(trecho.pcm)
    this.reiniciarSilencio()
  }

  private async abrirSessao(
    guildId: string,
    trecho: TrechoDeFala,
    nome: string,
    pergunta: string,
  ): Promise<void> {
    const pessoas = [...this.nomes].map(([userId, n]) => ({ userId, nome: n }))
    const contexto = await montarContexto(guildId, pessoas, pergunta || undefined)
    const conhecimento = carregarConhecimento()

    const instrucao = [carregarPersona(), conhecimento, contexto.texto].filter(Boolean).join('\n\n')

    try {
      this.sessao = await SessaoLive.abrir({
        guildId,
        contextoInicial: instrucao,
        onAudio: (pcm) => this.mouth.falar(guildId, pcm),
        onTranscricao: (quem, texto) => void this.guardarTranscricao(guildId, quem, texto, nome, trecho.userId),
        onFechada: () => {
          this.sessao = null
          this.ultimoFalante = null
        },
        executarFerramenta: (nome, args) => this.executarFerramenta(guildId, nome, args),
      })
      registro.registrar({ tipo: 'sessao', autor: nome, texto: 'sessão aberta', detalhe: pergunta })
      this.ultimoFalante = trecho.userId
      this.sessao.marcarFalante(nome)
      this.sessao.enviarAudio(trecho.pcm)
      this.reiniciarSilencio()
    } catch (error) {
      this.sessao = null
      if (error instanceof CotaEstouradaError || error instanceof ModeloIndisponivelError) {
        this.avisar(guildId, error.message)
        return
      }
      registro.registrar({ tipo: 'erro', autor: nome, texto: 'falha ao abrir sessão', detalhe: String(error) })
      console.error('[icarus] falha ao abrir sessão:', error)
      this.avisar(guildId, 'Não consegui te ouvir agora — tenta de novo daqui a pouco.')
    }
  }

  /**
   * Executa o que o modelo pediu. As ações vão para a MESMA camada que o /tocar usa —
   * não existe caminho paralelo: pedir por voz e pedir por comando acabam no mesmo lugar.
   */
  private async executarFerramenta(
    guildId: string,
    nome: string,
    args: Record<string, unknown>,
  ): Promise<ResultadoFerramenta> {
    registro.registrar({ tipo: 'ferramenta', autor: 'Icarus', texto: nome, detalhe: JSON.stringify(args) })
    const canal = this.canalDeVoz
    const estado = this.controller.state(guildId)

    switch (nome) {
      case 'tocar': {
        if (!canal) return { ok: false, resumo: 'Não estou numa call.' }
        const busca = String(args.busca ?? '').trim()
        if (!busca) return { ok: false, resumo: 'Não entendi qual música.' }
        return this.tocarPorBusca(guildId, canal, busca)
      }
      case 'pular':
        if (!estado.current) return { ok: false, resumo: 'Não tem nada tocando.' }
        await this.controller.skip(guildId)
        return { ok: true, resumo: 'Pulei para a próxima.' }
      case 'pausar': {
        const pausou = estado.paused ? this.controller.resume(guildId) : this.controller.pause(guildId)
        if (!pausou) return { ok: false, resumo: 'Não tem nada tocando.' }
        return { ok: true, resumo: estado.paused ? 'Retomei.' : 'Pausei.' }
      }
      case 'parar':
        this.controller.stop(guildId)
        return { ok: true, resumo: 'Parei e limpei a fila.' }
      case 'ver_fila': {
        if (!estado.current) return { ok: true, resumo: 'A fila está vazia.' }
        const proximas = estado.items.slice(0, 5).map((item) => item.title)
        return {
          ok: true,
          resumo: `Tocando: ${estado.current.title}.` +
            (proximas.length > 0 ? ` Depois: ${proximas.join('; ')}.` : ' Nada depois.'),
        }
      }
      case 'lembrar': {
        const assunto = String(args.assunto ?? '').trim()
        const trechos = await buscar(guildId, assunto, { limite: 5 })
        if (trechos.length === 0) return { ok: true, resumo: 'Não achei nada sobre isso na memória.' }
        return {
          ok: true,
          resumo: trechos
            .map((t) => `${t.autores.join(' e ') || 'alguém'}: ${t.texto}`)
            .join(' | '),
        }
      }
      default:
        return { ok: false, resumo: 'Não conheço essa ação.' }
    }
  }

  private async tocarPorBusca(
    guildId: string,
    canal: VoiceBasedChannel,
    busca: string,
  ): Promise<ResultadoFerramenta> {
    try {
      const youtubeId = ehLink(busca) ? extractYoutubeId(busca) : (await searchYoutube(busca, 1))[0]?.youtubeId
      if (!youtubeId) return { ok: false, resumo: `Não achei nada para "${busca}".` }

      const track = await resolveTrack(guildId, youtubeId, 'icarus', 'Icarus')
      await this.controller.enqueue(canal, track, 'icarus', 'Icarus')
      return { ok: true, resumo: `Coloquei "${track.title}" para tocar.` }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Não deu certo.'
      return { ok: false, resumo: mensagem }
    }
  }

  private async guardarTranscricao(
    guildId: string,
    quem: 'usuario' | 'bot',
    texto: string,
    nomeUsuario: string,
    userIdUsuario: string,
  ): Promise<void> {
    if (!texto.trim()) return
    registro.registrar({
      tipo: 'fala',
      autor: quem === 'bot' ? 'Icarus' : nomeUsuario,
      texto,
      detalhe: 'gemini',
    })
    try {
      await salvarFala({
        guildId,
        canalId: this.atual?.channelId ?? '',
        autorId: quem === 'bot' ? 'icarus' : userIdUsuario,
        autorNome: quem === 'bot' ? 'Icarus' : nomeUsuario,
        texto,
        origem: 'gemini',
        faladoEm: new Date(),
      })
    } catch (error) {
      // memória é bom-ter: falha aqui não pode derrubar a conversa em andamento
      console.error('[icarus] falha ao guardar transcrição:', error)
    }
  }

  private reiniciarSilencio(): void {
    if (this.silencioTimer) clearTimeout(this.silencioTimer)
    this.silencioTimer = setTimeout(() => {
      void this.encerrarSessao('silencio')
    }, config.voz.sessaoSilencioMs)
  }

  private async encerrarSessao(motivo: string): Promise<void> {
    if (this.silencioTimer) {
      clearTimeout(this.silencioTimer)
      this.silencioTimer = null
    }
    const sessao = this.sessao
    this.sessao = null
    this.ultimoFalante = null
    this.mixer.limpar()
    if (sessao) await sessao.fechar(motivo)
  }
}
