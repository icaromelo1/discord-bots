import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'tracks' })
export class Track {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'youtube_id', type: 'text', unique: true })
  youtubeId!: string

  @Column({ name: 'title', type: 'text' })
  title!: string

  @Column({ name: 'duration_sec', type: 'int' })
  durationSec!: number

  @Column({ name: 'drive_file', type: 'text' })
  driveFile!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date
}
