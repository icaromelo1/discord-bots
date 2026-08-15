import { logPrefix } from '../config'
import type { VoiceBasedChannel } from 'discord.js'
import { ensureLocalFile, markPlayed, resolveTrack, type ResolvedTrack } from '../library/library'
import { QueueManager, type QueueItem } from '../queue/queue'
import { VoiceManager } from '../voice/voice'

export interface PlayerState {
  current: QueueItem | null
  startedAt: number | null
  items: QueueItem[]
  paused: boolean
  connected: boolean
}

export class PlayerController {
  private readonly listeners: ((guildId: string) => void)[] = []
  private readonly prefetches = new Map<string, { cancelado: boolean }>()

  constructor(
    private readonly voice: VoiceManager,
    private readonly queue: QueueManager,
  ) {
    this.voice.onIdle((guildId) => void this.advance(guildId))
    this.voice.onDisconnect((guildId) => {
      this.cancelPrefetch(guildId)
      this.queue.clear(guildId)
      this.emit(guildId)
    })
  }

  onStateChange(listener: (guildId: string) => void): void {
    this.listeners.push(listener)
  }

  private emit(guildId: string): void {
    for (const listener of this.listeners) listener(guildId)
  }

  async enqueue(
    channel: VoiceBasedChannel,
    track: ResolvedTrack,
    userId: string,
    userName: string,
  ): Promise<{ started: boolean }> {
    const guildId = channel.guildId
    const item: QueueItem = {
      trackId: track.id,
      driveFile: track.driveFile,
      youtubeId: track.youtubeId,
      title: track.title,
      durationSec: track.durationSec,
      addedBy: userId,
      addedByName: userName,
    }

    this.queue.add(guildId, item)
    this.voice.ensure(channel)

    if (this.queue.current(guildId)) {
      this.emit(guildId)
      return { started: false }
    }

    await this.advance(guildId)
    return { started: true }
  }

  // Playlist: os itens entram sem arquivo baixado. Só a primeira é resolvida agora;
  // as demais vão sendo buscadas uma de cada vez pelo prefetch.
  async enqueueMany(
    channel: VoiceBasedChannel,
    itens: QueueItem[],
    ): Promise<{ adicionadas: number; cortadas: number; started: boolean }> {
    const guildId = channel.guildId
    const resultado = this.queue.addMany(guildId, itens)

    if (resultado.adicionadas === 0) {
      return { ...resultado, started: false }
    }

    this.voice.ensure(channel)

    if (this.queue.current(guildId)) {
      this.emit(guildId)
      this.prefetchNext(guildId)
      return { ...resultado, started: false }
    }

    await this.advance(guildId)
    return { ...resultado, started: true }
  }

  // puxa o próximo da fila e toca. Chamado tanto pelo enqueue (fila parada) quanto
  // pelo onIdle da camada de voz (faixa anterior terminou sozinha).
  private async advance(guildId: string): Promise<void> {
    const next = this.queue.next(guildId)
    if (!next) {
      this.emit(guildId)
      return
    }

    try {
      const filePath = await this.resolverItem(guildId, next)
      this.voice.play(guildId, filePath)
      await markPlayed(guildId, next.trackId)
      this.emit(guildId)
      // só depois de a faixa atual estar tocando é que a próxima começa a baixar:
      // é isto que mantém o lookahead em exatamente uma
      this.prefetchNext(guildId)
    } catch (error) {
      console.error(`${logPrefix()} falha ao tocar ${next.youtubeId} na guild ${guildId}:`, error)
      // uma faixa quebrada não pode travar a fila inteira
      await this.advance(guildId)
    }
  }

  // Item vindo de playlist chega sem trackId: precisa passar pelo resolveTrack agora.
  // Item já resolvido só precisa do arquivo quente no cache.
  private async resolverItem(guildId: string, item: QueueItem): Promise<string> {
    if (item.trackId && item.driveFile) {
      return ensureLocalFile({
        id: item.trackId,
        youtubeId: item.youtubeId,
        title: item.title,
        durationSec: item.durationSec,
        driveFile: item.driveFile,
      })
    }

    const track = await resolveTrack(guildId, item.youtubeId, item.addedBy, item.addedByName)
    item.trackId = track.id
    item.driveFile = track.driveFile
    this.queue.markResolved(guildId, item.youtubeId, track.id, track.driveFile)
    return ensureLocalFile(track)
  }

  prefetchNext(guildId: string): void {
    if (this.prefetches.has(guildId)) return

    const alvo = this.queue.firstUnresolved(guildId)
    if (!alvo) return

    const controle = { cancelado: false }
    this.prefetches.set(guildId, controle)

    void resolveTrack(guildId, alvo.item.youtubeId, alvo.item.addedBy, alvo.item.addedByName)
      .then((track) => {
        if (controle.cancelado) return
        this.queue.markResolved(guildId, alvo.item.youtubeId, track.id, track.driveFile)
      })
      .catch((error) => {
        // falha aqui é silenciosa pro chat: a faixa é tentada de novo na vez dela
        console.error(`${logPrefix()} prefetch de ${alvo.item.youtubeId} falhou:`, error)
      })
      .finally(() => {
        if (this.prefetches.get(guildId) === controle) this.prefetches.delete(guildId)
      })
  }

  cancelPrefetch(guildId: string): void {
    const controle = this.prefetches.get(guildId)
    if (!controle) return
    // o download em curso não é abortável, mas o resultado é descartado; o arquivo
    // que já baixou fica no cache e não é desperdício — a faixa segue na biblioteca
    controle.cancelado = true
    this.prefetches.delete(guildId)
  }

  // Reordenar pode trocar quem é a próxima faixa. O prefetch em curso não é
  // cancelado — o arquivo que ele baixa continua útil, só toca mais tarde —, mas
  // pedimos um novo assim que ele terminar, para a nova próxima chegar adiantada.
  moverNaFila(guildId: string, from: number, to: number): boolean {
    const moveu = this.queue.move(guildId, from, to)
    if (moveu) {
      this.emit(guildId)
      this.prefetchNext(guildId)
    }
    return moveu
  }

  removerDaFila(guildId: string, index: number): QueueItem | null {
    const removido = this.queue.remove(guildId, index)
    if (removido) {
      this.emit(guildId)
      this.prefetchNext(guildId)
    }
    return removido
  }

  async skip(guildId: string): Promise<void> {
    await this.advance(guildId)
  }

  pause(guildId: string): boolean {
    const paused = this.voice.pause(guildId)
    if (paused) {
      this.queue.setPaused(guildId, true)
      this.emit(guildId)
    }
    return paused
  }

  resume(guildId: string): boolean {
    const resumed = this.voice.resume(guildId)
    if (resumed) {
      this.queue.setPaused(guildId, false)
      this.emit(guildId)
    }
    return resumed
  }

  stop(guildId: string): void {
    this.cancelPrefetch(guildId)
    this.queue.clear(guildId)
    this.voice.stop(guildId)
    this.emit(guildId)
  }

  leave(guildId: string): void {
    this.cancelPrefetch(guildId)
    this.queue.clear(guildId)
    this.voice.leave(guildId)
    this.emit(guildId)
  }

  state(guildId: string): PlayerState {
    const snapshot = this.queue.snapshot(guildId)
    return {
      current: snapshot.current,
      startedAt: snapshot.startedAt,
      items: snapshot.items,
      paused: snapshot.paused,
      connected: this.voice.isConnected(guildId),
    }
  }

  channelId(guildId: string): string | null {
    return this.voice.channelId(guildId)
  }

  canDownload(guildId: string, userId: string): boolean {
    return this.queue.canDownload(guildId, userId)
  }

  markDownload(guildId: string, userId: string): void {
    this.queue.markDownload(guildId, userId)
  }
}
