import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm'

// Espelho das playlists da conta do YouTube Music, mantido pelo sync. Os itens
// guardam o youtube_id, e não uma FK para tracks: a playlist é registrada inteira
// antes de os downloads acontecerem, e uma faixa que nunca baixa (vídeo removido,
// longo demais) continua sendo parte da playlist.

@Entity({ name: 'account_playlists' })
export class AccountPlaylistRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'youtube_playlist_id', type: 'text', unique: true })
  youtubePlaylistId!: string

  @Column({ name: 'title', type: 'text' })
  title!: string

  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt!: Date
}

@Entity({ name: 'account_playlist_items' })
export class AccountPlaylistItem {
  @PrimaryColumn({ name: 'playlist_id', type: 'uuid' })
  playlistId!: string

  @ManyToOne(() => AccountPlaylistRow, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'playlist_id' })
  playlist!: AccountPlaylistRow

  @PrimaryColumn({ name: 'position', type: 'int' })
  position!: number

  @Column({ name: 'youtube_id', type: 'text' })
  youtubeId!: string

  @Column({ name: 'title', type: 'text' })
  title!: string

  @Column({ name: 'duration_sec', type: 'int' })
  durationSec!: number
}

@Entity({ name: 'sync_failures' })
export class SyncFailure {
  @PrimaryColumn({ name: 'youtube_id', type: 'text' })
  youtubeId!: string

  @Column({ name: 'kind', type: 'text' })
  kind!: string

  @Column({ name: 'message', type: 'text' })
  message!: string

  /** Falha que não muda tentando de novo (vídeo removido, longo demais): o sync pula. */
  @Column({ name: 'definitive', type: 'boolean' })
  definitive!: boolean

  @Column({ name: 'attempts', type: 'int' })
  attempts!: number

  @Column({ name: 'last_attempt_at', type: 'timestamptz' })
  lastAttemptAt!: Date
}
