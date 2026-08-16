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
import { encontrarAtivacao } from './wake/wake'
import { buscar } from './memory/busca'
import type { ResultadoFerramenta } from './live/ferramentas'
import { carregarConhecimento, carregarPersona } from './brain/persona'
import { salvarFala } from './memory/repositorio'
import { registro } from './painel/registro'
import { RitmoDaConversa } from './live/ritmo'
import type { TranscricaoServico } from './memory/transcricao-servico'

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
  private turnosSemResposta = 0
  private abrindo = false
  private ultimoNome = 'alguém'
  private readonly ritmo = new RitmoDaConversa()
  /** Verdadeiro enquanto a conversa é com ele: falas seguintes pedem resposta direto. */
  private emConversa = false
  private conversaTimer: NodeJS.Timeout | null = null
  private readonly nomes = new Map<string, string>()

  private canalDeVoz: VoiceBasedChannel | null = null

  constructor(
    private readonly voice: VoiceManager,
    private readonly controller: PlayerController,
    private readonly ears: Ears,
    private readonly mouth: Mouth,
    private readonly wake: WakeDetector,
    private readonly transcricao: TranscricaoServico,
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

  async entrar(channel: VoiceBasedChannel, nomes: Map<string, string>): Promise<void> {
    const connection = this.voice.ensure(channel)
    // sem isto ele sai da call 2 min depois de entrar: o temporizador de ociosidade da
    // camada compartilhada existe para o bot de música, e escutar não conta como tocar
    this.voice.manterConectado(channel.guildId, true)
    this.ears.escutar(connection, channel.guildId)
    this.canalDeVoz = channel
    this.atual = { guildId: channel.guildId, channelId: channel.id }
    this.nomes.clear()
    for (const [id, nome] of nomes) this.nomes.set(id, nome)

    // a sessão passa a nascer junto com a entrada na call: ele ouve tudo desde o
    // primeiro segundo, mas só fala quando for chamado
    await this.garantirSessao(channel.guildId)
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

    // com a sessão sempre aberta, quem transcreve é o Gemini — bem melhor que o Whisper
    // local, e sem custo extra porque o áudio já está indo de qualquer forma
    if (await this.garantirSessao(guildId)) {
      this.alimentarSessao(trecho, nome)
      return
    }

    // Caminho de reserva: sem sessão (cota, queda, falta de chave) volta a valer o
    // reconhecimento local, só para o gatilho.
    const texto = await this.transcricao.transcrever({ pcm: trecho.pcm, em: trecho.inicioMs })
    const deteccao = this.wake.verificar(trecho.userId, texto)

    if (texto) {
      void salvarFala({
        guildId,
        canalId: this.atual?.channelId ?? '',
        autorId: trecho.userId,
        autorNome: nome,
        texto,
        origem: 'whisper',
        faladoEm: new Date(trecho.inicioMs),
      }).catch((erro) => console.error('[icarus] falha ao guardar fala do ambiente:', erro))
    }
    // registra também o que NÃO acordou: é justamente isso que revela como o
    // reconhecedor está entendendo o nome
    registro.registrar({
      tipo: 'wake',
      autor: nome,
      texto: texto || '(sem fala reconhecida)',
      acordou: Boolean(deteccao),
    })
    if (!deteccao) return

    // reserva: acordou pelo reconhecimento local, então tenta abrir a sessão agora
    this.ultimoNome = nome
    if (await this.garantirSessao(guildId)) {
      this.entrarEmConversa()
      this.alimentarSessao(trecho, nome)
    }
  }

  private alimentarSessao(trecho: TrechoDeFala, nome: string): void {
    if (!this.sessao) return

    // marcador só quando o falante muda: repetir a cada trecho poluiria a conversa
    if (this.ultimoFalante !== trecho.userId) {
      this.sessao.marcarFalante(nome)
      this.ultimoFalante = trecho.userId
    }
    this.ultimoNome = nome

    // fora do modo conversa o áudio entra como CONTEXTO e ele não responde; a resposta
    // é destravada quando o nome aparece na transcrição que o próprio Gemini devolve
    this.sessao.enviarAudio(trecho.pcm)

    // Fora do modo conversa, ouvir sem responder é o estado NORMAL — contar isso como
    // "a conversa seguiu sem ele" fazia a sessão fechar a cada duas falas do ambiente.
    // A sessão vive enquanto ele estiver na call; o que liga e desliga é o modo conversa.
    if (!this.emConversa) return

    this.turnosSemResposta++
    this.reiniciarSilencio()

    if (this.turnosSemResposta > config.conversa.maxTurnosSemResposta) {
      this.sairDoModoConversa('conversa-seguiu-sem-ele')
    }
  }

  private sairDoModoConversa(motivo: string): void {
    if (!this.emConversa) return
    this.emConversa = false
    this.sessao?.silenciar(true)
    this.turnosSemResposta = 0
    if (this.conversaTimer) clearTimeout(this.conversaTimer)
    if (this.silencioTimer) clearTimeout(this.silencioTimer)
    this.conversaTimer = null
    this.silencioTimer = null
    registro.registrar({ tipo: 'sessao', autor: 'Icarus', texto: 'voltou a só ouvir', detalhe: motivo })
  }

  /**
   * Garante uma sessão aberta para a guild. Devolve false quando não foi possível
   * (sem chave, cota estourada, queda) — aí o caminho de reserva local assume.
   */
  private async garantirSessao(guildId: string): Promise<boolean> {
    if (this.sessao) return true
    if (this.abrindo) return false
    this.abrindo = true
    try {
      await this.abrirSessao(guildId)
      return this.sessao !== null
    } finally {
      this.abrindo = false
    }
  }

  /** Entra em modo conversa: as próximas falas pedem resposta sem repetir o nome. */
  private entrarEmConversa(): void {
    this.emConversa = true
    this.sessao?.silenciar(false)
    if (this.conversaTimer) clearTimeout(this.conversaTimer)
    // o ritmo pode esticar a janela, nunca encurtá-la: encurtar significa gerar a
    // resposta e jogar fora, que é pior do que ouvir um pouco a mais
    const janela = Math.max(config.voz.sessaoSilencioMs, this.ritmo.janelaMs())
    this.conversaTimer = setTimeout(() => this.sairDoModoConversa('janela-encerrada'), janela)
  }

  private async abrirSessao(guildId: string): Promise<void> {
    const pessoas = [...this.nomes].map(([userId, n]) => ({ userId, nome: n }))
    const contexto = await montarContexto(guildId, pessoas)
    const conhecimento = carregarConhecimento()

    const instrucao = [carregarPersona(), conhecimento, contexto.texto].filter(Boolean).join('\n\n')

    try {
      this.sessao = await SessaoLive.abrir({
        guildId,
        contextoInicial: instrucao,
        onAudio: (pcm) => this.mouth.falar(guildId, pcm),
        onTranscricao: (quem, texto) => void this.aoTranscrever(guildId, quem, texto),
        onFechada: (motivo) => {
          this.sessao = null
          this.ultimoFalante = null
          this.emConversa = false
          registro.registrar({ tipo: 'sessao', autor: 'Icarus', texto: 'sessão fechada', detalhe: motivo })
        },
        executarFerramenta: (nome, args) => this.executarFerramenta(guildId, nome, args),
      })
      registro.registrar({ tipo: 'sessao', autor: 'Icarus', texto: 'sessão aberta (só ouvindo)' })
      this.ultimoFalante = null
      this.turnosSemResposta = 0
    } catch (error) {
      this.sessao = null
      if (error instanceof CotaEstouradaError || error instanceof ModeloIndisponivelError) {
        this.avisar(guildId, error.message)
        registro.registrar({ tipo: 'erro', autor: 'Icarus', texto: error.message })
        return
      }
      registro.registrar({ tipo: 'erro', autor: 'Icarus', texto: 'falha ao abrir sessão', detalhe: String(error) })
      console.error('[icarus] falha ao abrir sessão:', error)
    }
  }

  /**
   * A transcrição do Gemini é a MELHOR que temos — e ela é quem detecta o nome agora.
   * O Whisper local só sobra para o caminho de reserva, quando não há sessão.
   */
  private async aoTranscrever(guildId: string, quem: 'usuario' | 'bot', texto: string): Promise<void> {
    if (quem === 'usuario' && !this.emConversa) {
      const achou = encontrarAtivacao(texto, config.voz.wakeWord).achou
      registro.registrar({ tipo: 'wake', autor: this.ultimoNome, texto, acordou: achou })
      if (achou) this.entrarEmConversa()
    }

    await this.guardarTranscricao(guildId, quem, texto, this.ultimoNome, this.ultimoFalante ?? 'desconhecido')
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
      case 'encerrar_conversa':
        // sai do modo conversa, mas NÃO fecha a sessão: ele continua ouvindo a call,
        // que é o ponto do desenho. O modelo é quem entende o conteúdo e sabe
        // distinguir "deixa eu pensar" de "beleza, valeu".
        this.sairDoModoConversa('modelo-encerrou')
        return { ok: true, resumo: 'Encerrado.' }
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
    // ele respondeu: a conversa ainda é com ele
    if (quem === 'bot') {
      this.turnosSemResposta = 0
      this.entrarEmConversa()
    }
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

  /**
   * A janela vem do ritmo observado na própria sessão, não de um número fixo: um grupo
   * que emenda as frases não deve esperar tanto quanto um que fala pausado. Enquanto não
   * há amostras suficientes, cai no piso configurado.
   */
  private reiniciarSilencio(): void {
    if (this.silencioTimer) clearTimeout(this.silencioTimer)
    this.ritmo.registrarFala(Date.now())
    const janela = Math.max(config.voz.sessaoSilencioMs, this.ritmo.janelaMs())
    this.silencioTimer = setTimeout(() => {
      this.sairDoModoConversa(`silencio-${Math.round(janela / 1000)}s`)
    }, janela)
  }

  private async encerrarSessao(motivo: string): Promise<void> {
    if (this.silencioTimer) {
      clearTimeout(this.silencioTimer)
      this.silencioTimer = null
    }
    const sessao = this.sessao
    this.sessao = null
    this.ultimoFalante = null
    this.turnosSemResposta = 0
    this.ritmo.limpar()
    this.mixer.limpar()
    if (sessao) await sessao.fechar(motivo)
  }
}
