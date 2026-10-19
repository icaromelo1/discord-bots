import 'reflect-metadata'
import { In } from 'typeorm'
import {
  configureShared,
  listAccountPlaylists,
  listPlaylist,
  musicCache,
  setDataSource,
  storeTrack,
  Track,
  YtDlpError,
} from '@bots/shared'
import { buildSharedConfig, buildSyncConfig } from './config'
import { AppDataSource } from './db/data-source'
import { AccountPlaylistItem, AccountPlaylistRow, SyncFailure } from './db/sync.entities'
import { pendentesDeDownload, playlistsParaSincronizar, playlistUrl } from './sync/plano'

// Espelha as playlists da conta do YouTube Music no acervo do DJ. Roda como processo
// avulso dentro do container (cron no host com docker exec), não dentro do bot: um
// sync de centenas de faixas não pode disputar o event loop de quem está tocando.
//
// Incremental: cada execução registra as playlists inteiras, mas baixa no máximo
// SYNC_MAX_POR_EXECUCAO faixas novas. O acervo completo chega em algumas rodadas,
// num ritmo que não dispara o anti-bot.

const FALHAS_DEFINITIVAS = new Set(['indisponivel', 'muito-longo', 'live', 'link-invalido'])

const log = (...args: unknown[]): void => console.log('[sync]', ...args)

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function espelharPlaylists(cookiesFile: string, ignorar: string[]): Promise<void> {
  const daConta = await listAccountPlaylists(cookiesFile)
  const playlists = playlistsParaSincronizar(daConta, ignorar)
  log(`${playlists.length} playlist(s) para sincronizar`)

  const sincronizadas: string[] = []
  for (const playlist of playlists) {
    let entradas
    try {
      entradas = (await listPlaylist(playlistUrl(playlist.id), undefined, cookiesFile)).entradas
    } catch (error) {
      // uma playlist que falhou mantém os itens da última leitura boa em vez de
      // aparecer vazia; as outras seguem
      log(`não consegui ler "${playlist.titulo}" (${playlist.id}):`, error instanceof Error ? error.message : error)
      sincronizadas.push(playlist.id)
      continue
    }

    await AppDataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .insert()
        .into(AccountPlaylistRow)
        .values({ youtubePlaylistId: playlist.id, title: playlist.titulo, syncedAt: new Date() })
        .orUpdate(['title', 'synced_at'], ['youtube_playlist_id'])
        .execute()
      const row = await manager.findOneByOrFail(AccountPlaylistRow, { youtubePlaylistId: playlist.id })

      await manager.delete(AccountPlaylistItem, { playlistId: row.id })
      if (entradas.length > 0) {
        await manager.insert(
          AccountPlaylistItem,
          entradas.map((entrada, position) => ({
            playlistId: row.id,
            position,
            youtubeId: entrada.youtubeId,
            title: entrada.title,
            durationSec: entrada.durationSec,
          })),
        )
      }
    })

    sincronizadas.push(playlist.id)
    log(`"${playlist.titulo}": ${entradas.length} faixa(s)`)
  }

  // playlist apagada ou deixada de seguir na conta sai do espelho; as faixas ficam
  // no acervo, que é compartilhado com o bot. Lista vazia vira NOT IN () inválido
  if (sincronizadas.length === 0) return
  const removidas = await AppDataSource.getRepository(AccountPlaylistRow)
    .createQueryBuilder()
    .delete()
    .where('youtube_playlist_id NOT IN (:...ids)', { ids: sincronizadas })
    .execute()
  if (removidas.affected) log(`${removidas.affected} playlist(s) saíram da conta e do espelho`)
}

async function baixarPendentes(maxPorExecucao: number, cooldownMs: number): Promise<void> {
  const itens = await AppDataSource.getRepository(AccountPlaylistItem)
    .createQueryBuilder('i')
    .innerJoin(AccountPlaylistRow, 'p', 'p.id = i.playlist_id')
    .select('i.youtube_id', 'youtubeId')
    .orderBy('p.synced_at', 'ASC')
    .addOrderBy('i.position', 'ASC')
    .getRawMany<{ youtubeId: string }>()
  const ordem = itens.map((item) => item.youtubeId)

  const ids = [...new Set(ordem)]
  const noAcervo = ids.length
    ? (await AppDataSource.getRepository(Track).find({ select: { youtubeId: true }, where: { youtubeId: In(ids) } }))
        .map((track) => track.youtubeId)
    : []
  const definitivas = (
    await AppDataSource.getRepository(SyncFailure).find({ select: { youtubeId: true }, where: { definitive: true } })
  ).map((falha) => falha.youtubeId)

  const pendentes = pendentesDeDownload(ordem, new Set(noAcervo), new Set(definitivas), maxPorExecucao)
  const faltam = ids.length - noAcervo.length - definitivas.filter((id) => ids.includes(id)).length
  log(`${ids.length} faixa(s) únicas, ${noAcervo.length} já no acervo, ${faltam} faltando; baixando ${pendentes.length}`)

  const falhas = AppDataSource.getRepository(SyncFailure)
  let baixadas = 0

  for (const youtubeId of pendentes) {
    try {
      const { track, nova } = await storeTrack(youtubeId)
      // o acervo mora no Drive; o bot baixa a cópia local quando alguém pede.
      // Manter aqui encheria o disco da VM com a biblioteca inteira
      if (nova) musicCache.remove(track.driveFile)
      await falhas.delete({ youtubeId })
      baixadas++
      log(`ok ${youtubeId} — ${track.title}`)
    } catch (error) {
      const kind = error instanceof YtDlpError ? error.kind : 'desconhecido'
      const message = error instanceof Error ? error.message : String(error)
      const anterior = await falhas.findOneBy({ youtubeId })
      await falhas.save({
        youtubeId,
        kind,
        message,
        definitive: FALHAS_DEFINITIVAS.has(kind),
        attempts: (anterior?.attempts ?? 0) + 1,
        lastAttemptAt: new Date(),
      })
      log(`falhou ${youtubeId} (${kind}): ${message}`)

      // insistir depois de um bloqueio só piora o bloqueio; a próxima rodada tenta
      if (kind === 'anti-bot') {
        log('YouTube bloqueou os downloads — parando esta rodada')
        break
      }
    }

    await esperar(cooldownMs)
  }

  log(`${baixadas} faixa(s) nova(s) no acervo`)
}

async function main(): Promise<void> {
  configureShared(buildSharedConfig())
  const sync = buildSyncConfig()

  await AppDataSource.initialize()
  setDataSource(AppDataSource)

  try {
    await espelharPlaylists(sync.cookiesFile, sync.ignorar)
    await baixarPendentes(sync.maxPorExecucao, sync.cooldownMs)
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((error) => {
  console.error('[sync] falhou:', error)
  process.exit(1)
})
