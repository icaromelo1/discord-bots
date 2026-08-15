export { configureShared, getSharedConfig, resetSharedConfig, logPrefix, type SharedConfig } from './config'

export { getDataSource, setDataSource, resetDataSource } from './db/data-source-ref'
export { Track } from './db/track.entity'
export { GuildTrack } from './db/guild-track.entity'

export { QueueManager, QueueFullError, type QueueItem, type GuildQueueSnapshot } from './queue/queue'
export { VoiceManager } from './voice/voice'
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
