import type { ChatInputCommandInteraction, VoiceBasedChannel } from 'discord.js'
import { config } from '../config'
import { listPlaylist, YtDlpError } from '../library/ytdlp'
import type { PlayerController } from '../player/controller'
import type { QueueItem } from '../queue/queue'

export interface PlaylistResultado {
  ok: boolean
  mensagem: string
}

export async function handlePlaylist(
  interaction: ChatInputCommandInteraction,
  channel: VoiceBasedChannel,
  url: string,
  controller: PlayerController,
): Promise<PlaylistResultado> {
  const userId = interaction.user.id
  const userName = interaction.user.username

  try {
    const { titulo, entradas } = await listPlaylist(url)

    if (entradas.length === 0) {
      return { ok: false, mensagem: 'Não achei nenhuma faixa tocável nessa playlist.' }
    }

    const itens: QueueItem[] = entradas.map((entrada) => ({
      youtubeId: entrada.youtubeId,
      title: entrada.title,
      durationSec: entrada.durationSec,
      addedBy: userId,
      addedByName: userName,
      trackId: null,
      driveFile: null,
    }))

    const { adicionadas, cortadas } = await controller.enqueueMany(channel, itens)

    if (adicionadas === 0) {
      return { ok: false, mensagem: 'A fila já está cheia — não coube nenhuma faixa dessa playlist.' }
    }

    const prefixo = titulo ? `Playlist **${titulo}**` : 'Playlist'
    if (cortadas === 0) {
      return { ok: true, mensagem: `${prefixo} — ${adicionadas} faixas na fila.` }
    }

    return {
      ok: true,
      mensagem: `${prefixo} — ${adicionadas} faixas na fila. Outras ${cortadas} não couberam (a fila tem limite de ${config.player.maxQueue}).`,
    }
  } catch (error) {
    if (error instanceof YtDlpError) {
      return { ok: false, mensagem: error.message }
    }
    console.error('[discord-dj] erro inesperado ao carregar playlist:', error)
    return { ok: false, mensagem: 'Não consegui carregar essa playlist agora — tenta de novo daqui a pouco.' }
  }
}
