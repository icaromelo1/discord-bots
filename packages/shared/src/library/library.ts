import { getDataSource } from '../db/data-source-ref'
import { GuildTrack } from '../db/guild-track.entity'
import { Track } from '../db/track.entity'
import { musicCache } from './cache'
import { driveStorage } from './drive'
import { downloadAudio, fetchInfo } from './ytdlp'

export interface ResolvedTrack {
  id: string
  youtubeId: string
  title: string
  durationSec: number
  driveFile: string
}

export interface LibraryEntry {
  trackId: string
  youtubeId: string
  title: string
  durationSec: number
  lastPlayedAt: Date | null
}

function toResolved(track: Track): ResolvedTrack {
  return {
    id: track.id,
    youtubeId: track.youtubeId,
    title: track.title,
    durationSec: track.durationSec,
    driveFile: track.driveFile,
  }
}

// Downloads em andamento, chaveados por youtubeId — se duas guilds pedirem o mesmo
// link ao mesmo tempo, a segunda espera esta Promise em vez de baixar/subir de novo.
const pendingDownloads = new Map<string, Promise<Track>>()

async function ensureCached(driveFile: string): Promise<void> {
  if (musicCache.has(driveFile)) return
  await driveStorage.download(driveFile, musicCache.localPath(driveFile))
  musicCache.touch(driveFile)
}

async function upsertGuildTrack(guildId: string, trackId: string, userId: string, userName: string): Promise<void> {
  await getDataSource().getRepository(GuildTrack)
    .createQueryBuilder()
    .insert()
    .into(GuildTrack)
    .values({
      guildId,
      trackId,
      addedBy: userId,
      addedByName: userName,
      firstAddedAt: new Date(),
      lastPlayedAt: null,
    })
    .orIgnore()
    .execute()
}

async function downloadAndStore(youtubeId: string, onProgress?: (label: string) => void): Promise<Track> {
  onProgress?.('baixando áudio do YouTube...')
  const info = await fetchInfo(youtubeId)
  const localPath = await downloadAudio(youtubeId, musicCache.dirPath())
  const driveFile = `${youtubeId}.mp3`

  onProgress?.('enviando pro armazenamento...')
  await driveStorage.upload(localPath, driveFile)

  const trackRepo = getDataSource().getRepository(Track)
  // orIgnore + releitura em vez de insert direto: o dedup em memória não cobre a
  // janela entre o findOne de resolveTrack e a entrada no Map, e ali dois pedidos
  // simultâneos violariam o unique de youtube_id em vez de reaproveitar a linha.
  await trackRepo
    .createQueryBuilder()
    .insert()
    .into(Track)
    .values({ youtubeId, title: info.title, durationSec: info.durationSec, driveFile })
    .orIgnore()
    .execute()
  musicCache.touch(driveFile)

  return trackRepo.findOneOrFail({ where: { youtubeId } })
}

export async function resolveTrack(
  guildId: string,
  youtubeId: string,
  userId: string,
  userName: string,
  onProgress?: (label: string) => void,
): Promise<ResolvedTrack> {
  const trackRepo = getDataSource().getRepository(Track)
  const existing = await trackRepo.findOne({ where: { youtubeId } })

  if (existing) {
    onProgress?.('preparando...')
    await ensureCached(existing.driveFile)
    await upsertGuildTrack(guildId, existing.id, userId, userName)
    return toResolved(existing)
  }

  let downloadPromise = pendingDownloads.get(youtubeId)
  if (!downloadPromise) {
    downloadPromise = downloadAndStore(youtubeId, onProgress).finally(() => {
      pendingDownloads.delete(youtubeId)
    })
    pendingDownloads.set(youtubeId, downloadPromise)
  }

  const track = await downloadPromise
  await upsertGuildTrack(guildId, track.id, userId, userName)
  return toResolved(track)
}

export async function isKnown(youtubeId: string): Promise<boolean> {
  const count = await getDataSource().getRepository(Track).count({ where: { youtubeId } })
  return count > 0
}

export async function listLibrary(guildId: string, search?: string): Promise<LibraryEntry[]> {
  const qb = getDataSource().getRepository(GuildTrack)
    .createQueryBuilder('gt')
    .innerJoin(Track, 't', 't.id = gt.trackId')
    .select('gt.trackId', 'trackId')
    .addSelect('t.youtubeId', 'youtubeId')
    .addSelect('t.title', 'title')
    .addSelect('t.durationSec', 'durationSec')
    .addSelect('gt.lastPlayedAt', 'lastPlayedAt')
    .where('gt.guildId = :guildId', { guildId })
    .orderBy('gt.lastPlayedAt', 'DESC', 'NULLS LAST')
    .limit(100)

  if (search) {
    qb.andWhere('t.title ILIKE :search', { search: `%${search}%` })
  }

  return qb.getRawMany<LibraryEntry>()
}

export async function ensureLocalFile(track: ResolvedTrack): Promise<string> {
  if (!musicCache.has(track.driveFile)) {
    await driveStorage.download(track.driveFile, musicCache.localPath(track.driveFile))
  }
  musicCache.touch(track.driveFile)
  return musicCache.localPath(track.driveFile)
}

export async function markPlayed(guildId: string, trackId: string | null): Promise<void> {
  // item de fila ainda não resolvido chega aqui com trackId nulo; sem a guarda isso
  // vira UPDATE ... WHERE track_id = NULL, que não casa com nada e falha calado
  if (!trackId) return
  await getDataSource().getRepository(GuildTrack).update({ guildId, trackId }, { lastPlayedAt: new Date() })
}
