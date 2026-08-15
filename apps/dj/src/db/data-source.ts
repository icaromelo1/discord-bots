import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { GuildTrack, Track } from '@bots/shared'
import { config } from '../config'

// As entidades vêm do pacote compartilhado (os dois bots usam a mesma biblioteca de
// música), mas o DataSource é do app: cada bot tem seu próprio schema no Postgres.
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: config.database.url,
  schema: config.database.schema,
  entities: [Track, GuildTrack],
  migrations: [`${__dirname}/migrations/*.{ts,js}`],
  synchronize: false,
  logging: false,
})
