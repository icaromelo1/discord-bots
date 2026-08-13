import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { config } from '../config'
import { GuildTrack } from './guild-track.entity'
import { Track } from './track.entity'

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: config.database.url,
  schema: config.database.schema,
  entities: [Track, GuildTrack],
  migrations: ['src/db/migrations/*.ts'],
  synchronize: false,
  logging: false,
})
