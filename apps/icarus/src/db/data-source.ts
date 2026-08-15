import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { GuildTrack, Track } from '@bots/shared'
import { config } from '../config'

// Entidades de música vêm do pacote compartilhado; o DataSource é do app, porque
// cada bot tem seu próprio schema no mesmo Postgres.
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: config.database.url,
  schema: config.database.schema,
  entities: [Track, GuildTrack],
  migrations: [`${__dirname}/migrations/*.{ts,js}`],
  synchronize: false,
  logging: false,
})
