export { configureShared, getSharedConfig, resetSharedConfig, logPrefix, type SharedConfig } from './config'

export { getDataSource, setDataSource, resetDataSource } from './db/data-source-ref'
export { Track } from './db/track.entity'
export { GuildTrack } from './db/guild-track.entity'

export { QueueManager, QueueFullError, type QueueItem, type GuildQueueSnapshot } from './queue/queue'
export { VoiceManager } from './voice/voice'
export { StreamType } from '@discordjs/voice'
export { PlayerController, type PlayerState } from './player/controller'

export { MusicCache, musicCache } from './library/cache'
export { DriveStorage, driveStorage } from './library/drive'
export {
  YtDlpError,
  extractYoutubeId,
  extractPlaylistId,
  translateError,
  searchYoutube,
  listPlaylist,
  fetchInfo,
  downloadAudio,
  type YtDlpInfo,
  type SearchResult,
  type PlaylistInfo,
} from './library/ytdlp'
export {
  resolveTrack,
  isKnown,
  listLibrary,
  ensureLocalFile,
  markPlayed,
  type ResolvedTrack,
  type LibraryEntry,
} from './library/library'

export { createClient, isGuildAllowed, installGuildGuard } from './discord/client'
export { registerCommands } from './discord/register-commands'
export { installEmptyChannelWatch } from './discord/empty-channel-watch'

export { musicCommandData, MUSIC_COMMAND_NAMES, type CommandContext } from './music/commands'
export {
  createMusicContext,
  handleMusicInteraction,
  registerMusicHandlers,
} from './music/interactions'
export { buildPanel, PanelManager, PANEL_BUTTON_IDS } from './music/panel'
