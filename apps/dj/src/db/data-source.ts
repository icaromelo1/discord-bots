import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { GuildTrack, Track } from '@bots/shared'
import { config } from '../config'
import { AccountPlaylistItem, AccountPlaylistRow, SyncFailure } from './sync.entities'

// As entidades vêm do pacote compartilhado (os dois bots usam a mesma biblioteca de
// música), mas o DataSource é do app: cada bot tem seu próprio schema no Postgres.
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: config.database.url,
  schema: config.database.schema,
  entities: [Track, GuildTrack, AccountPlaylistRow, AccountPlaylistItem, SyncFailure],
  migrations: [`${__dirname}/migrations/*.{ts,js}`],
  synchronize: false,
  logging: false,
})
