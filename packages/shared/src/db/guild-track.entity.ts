import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm'
import { Track } from './track.entity'

@Entity({ name: 'guild_tracks' })
@Unique(['guildId', 'trackId'])
export class GuildTrack {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'guild_id', type: 'text' })
  guildId!: string

  @ManyToOne(() => Track, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'track_id' })
  track!: Track

  @Column({ name: 'track_id', type: 'uuid' })
  trackId!: string

  @Column({ name: 'added_by', type: 'text' })
  addedBy!: string

  @Column({ name: 'added_by_name', type: 'text' })
  addedByName!: string

  @Column({ name: 'first_added_at', type: 'timestamptz' })
  firstAddedAt!: Date

  @Column({ name: 'last_played_at', type: 'timestamptz', nullable: true })
  lastPlayedAt!: Date | null
}
