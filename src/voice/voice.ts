import {
  AudioPlayer,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  PlayerSubscription,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice'
import type { VoiceBasedChannel } from 'discord.js'
import { config } from '../config'

interface GuildVoiceState {
  connection: VoiceConnection
  player: AudioPlayer
  subscription: PlayerSubscription | undefined
  idleTimer: NodeJS.Timeout | null
}

export class VoiceManager {
  private readonly states = new Map<string, GuildVoiceState>()
  private idleHandler: ((guildId: string) => void) | null = null
  private disconnectHandler: ((guildId: string) => void) | null = null

  ensure(channel: VoiceBasedChannel): VoiceConnection {
    const existing = this.states.get(channel.guildId)
    if (existing) return existing.connection

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
    })

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Disconnected é ambíguo: pode ser reconexão de voice-server (WebSocket cai e volta
        // sozinho) ou expulsão real. Signalling/Connecting são os dois destinos possíveis de
        // uma reconexão legítima — se nenhum chegar em 5s, foi expulsão.
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ])
      } catch {
        this.destroyGuildState(channel.guildId)
        this.disconnectHandler?.(channel.guildId)
      }
    })

    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    })

    const state: GuildVoiceState = {
      connection,
      player,
      subscription: connection.subscribe(player),
      idleTimer: null,
    }

    this.attachPlayerListeners(channel.guildId, state)
    this.states.set(channel.guildId, state)
    this.startIdleTimer(channel.guildId, state)

    return connection
  }

  play(guildId: string, filePath: string): void {
    const state = this.states.get(guildId)
    if (!state) return

    this.clearIdleTimer(state)

    const resource = createAudioResource(filePath)
    state.player.play(resource)
  }

  pause(guildId: string): boolean {
    const state = this.states.get(guildId)
    if (!state) return false
    return state.player.pause()
  }

  resume(guildId: string): boolean {
    const state = this.states.get(guildId)
    if (!state) return false
    return state.player.unpause()
  }

  stop(guildId: string): void {
    const state = this.states.get(guildId)
    if (!state) return
    state.player.stop()
    this.startIdleTimer(guildId, state)
  }

  leave(guildId: string): void {
    this.destroyGuildState(guildId)
  }

  isConnected(guildId: string): boolean {
    return this.states.has(guildId)
  }

  channelId(guildId: string): string | null {
    const state = this.states.get(guildId)
    if (!state) return null
    const channelId = state.connection.joinConfig.channelId
    return channelId ?? null
  }

  onIdle(handler: (guildId: string) => void): void {
    this.idleHandler = handler
  }

  onDisconnect(handler: (guildId: string) => void): void {
    this.disconnectHandler = handler
  }

  private attachPlayerListeners(guildId: string, state: GuildVoiceState): void {
    state.player.on(AudioPlayerStatus.Idle, (oldState) => {
      if (oldState.status !== AudioPlayerStatus.Playing) return
      this.idleHandler?.(guildId)
      // o handler normalmente já mandou a próxima faixa tocar; só armar a saída
      // por ociosidade se nada tiver começado, senão o bot abandona a call no
      // meio da música seguinte
      if (state.player.state.status === AudioPlayerStatus.Idle) {
        this.startIdleTimer(guildId, state)
      }
    })
  }

  private startIdleTimer(guildId: string, state: GuildVoiceState): void {
    this.clearIdleTimer(state)
    state.idleTimer = setTimeout(() => {
      this.leave(guildId)
    }, config.player.idleTimeoutMs)
  }

  private clearIdleTimer(state: GuildVoiceState): void {
    if (state.idleTimer) {
      clearTimeout(state.idleTimer)
      state.idleTimer = null
    }
  }

  private destroyGuildState(guildId: string): void {
    const state = this.states.get(guildId)
    if (!state) return

    this.clearIdleTimer(state)
    state.player.stop()
    state.subscription?.unsubscribe()

    if (state.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      state.connection.destroy()
    }

    this.states.delete(guildId)
  }
}
