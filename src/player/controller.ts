import type { VoiceBasedChannel } from 'discord.js'
import { ensureLocalFile, markPlayed, type ResolvedTrack } from '../library/library'
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

  constructor(
    private readonly voice: VoiceManager,
    private readonly queue: QueueManager,
  ) {
    this.voice.onIdle((guildId) => void this.advance(guildId))
    this.voice.onDisconnect((guildId) => {
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

  // puxa o próximo da fila e toca. Chamado tanto pelo enqueue (fila parada) quanto
  // pelo onIdle da camada de voz (faixa anterior terminou sozinha).
  private async advance(guildId: string): Promise<void> {
    const next = this.queue.next(guildId)
    if (!next) {
      this.emit(guildId)
      return
    }

    try {
      const filePath = await ensureLocalFile({
        id: next.trackId,
        youtubeId: next.youtubeId,
        title: next.title,
        durationSec: next.durationSec,
        driveFile: `${next.youtubeId}.mp3`,
      })
      this.voice.play(guildId, filePath)
      await markPlayed(guildId, next.trackId)
      this.emit(guildId)
    } catch (error) {
      console.error(`[discord-dj] falha ao tocar ${next.youtubeId} na guild ${guildId}:`, error)
      // uma faixa quebrada não pode travar a fila inteira
      await this.advance(guildId)
    }
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
    this.queue.clear(guildId)
    this.voice.stop(guildId)
    this.emit(guildId)
  }

  leave(guildId: string): void {
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
