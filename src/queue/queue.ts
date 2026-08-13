import { config } from '../config'

export interface QueueItem {
  trackId: string
  youtubeId: string
  title: string
  durationSec: number
  addedBy: string
  addedByName: string
}

export interface GuildQueueSnapshot {
  current: QueueItem | null
  startedAt: number | null
  items: QueueItem[]
  paused: boolean
}

export class QueueFullError extends Error {
  constructor(limit: number) {
    super(`Fila cheia — o limite é de ${limit} músicas`)
    this.name = 'QueueFullError'
  }
}

interface GuildState {
  items: QueueItem[]
  current: QueueItem | null
  startedAt: number | null
  paused: boolean
}

function createGuildState(): GuildState {
  return {
    items: [],
    current: null,
    startedAt: null,
    paused: false,
  }
}

export class QueueManager {
  private readonly guilds = new Map<string, GuildState>()
  private readonly lastDownloadAt = new Map<string, number>()

  private getGuildState(guildId: string): GuildState {
    let state = this.guilds.get(guildId)
    if (!state) {
      state = createGuildState()
      this.guilds.set(guildId, state)
    }
    return state
  }

  add(guildId: string, item: QueueItem): void {
    const state = this.getGuildState(guildId)
    if (state.items.length >= config.player.maxQueue) {
      throw new QueueFullError(config.player.maxQueue)
    }
    state.items.push(item)
  }

  next(guildId: string): QueueItem | null {
    const state = this.getGuildState(guildId)
    const nextItem = state.items.shift() ?? null
    state.current = nextItem
    state.startedAt = nextItem ? Date.now() : null
    return nextItem
  }

  current(guildId: string): QueueItem | null {
    return this.getGuildState(guildId).current
  }

  snapshot(guildId: string): GuildQueueSnapshot {
    const state = this.getGuildState(guildId)
    return {
      current: state.current,
      startedAt: state.startedAt,
      items: [...state.items],
      paused: state.paused,
    }
  }

  clear(guildId: string): void {
    this.guilds.set(guildId, createGuildState())
  }

  setPaused(guildId: string, paused: boolean): void {
    this.getGuildState(guildId).paused = paused
  }

  isPaused(guildId: string): boolean {
    return this.getGuildState(guildId).paused
  }

  size(guildId: string): number {
    return this.getGuildState(guildId).items.length
  }

  canDownload(guildId: string, userId: string, now: number = Date.now()): boolean {
    const key = `${guildId}:${userId}`
    const lastAt = this.lastDownloadAt.get(key)
    if (lastAt === undefined) return true
    return now - lastAt >= config.player.downloadCooldownMs
  }

  markDownload(guildId: string, userId: string, now: number = Date.now()): void {
    const key = `${guildId}:${userId}`
    this.lastDownloadAt.set(key, now)
  }
}
