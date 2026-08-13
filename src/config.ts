import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`)
  return value
}

function int(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) throw new Error(`Variável ${name} não é um número: ${raw}`)
  return parsed
}

function list(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('CLIENT_ID'),
    guildIds: list('GUILD_IDS'),
    registerGlobal: process.env.REGISTER_GLOBAL === 'true',
  },
  database: {
    url: required('DATABASE_URL'),
    schema: process.env.DATABASE_SCHEMA || 'discord_dj',
  },
  library: {
    driveRemote: process.env.DRIVE_REMOTE || 'gdrive:discord-dj-music',
    cacheDir: process.env.MUSIC_CACHE_DIR || './music-cache',
    rcloneConfigPath: process.env.RCLONE_CONFIG_PATH || null,
    cookiesFile: process.env.COOKIES_FILE || null,
  },
  ytdlp: {
    maxDurationSec: int('MAX_DURATION_SEC', 1200),
    playerClients: process.env.PLAYER_CLIENTS || 'web,mweb,tv',
    potProviderUrl: process.env.POT_PROVIDER_URL || null,
  },
  player: {
    idleTimeoutMs: int('IDLE_TIMEOUT_MS', 120_000),
    maxQueue: int('MAX_QUEUE', 50),
    downloadCooldownMs: int('DOWNLOAD_COOLDOWN_MS', 5_000),
  },
} as const

if (config.discord.guildIds.length === 0) {
  throw new Error('GUILD_IDS está vazia — sem allowlist o bot aceitaria qualquer servidor')
}
