import { beforeEach, describe, expect, it } from 'vitest'
import { configureShared, getSharedConfig, resetSharedConfig, type SharedConfig } from './config'

function fake(overrides: Partial<SharedConfig> = {}): SharedConfig {
  return {
    discord: { token: 't', clientId: 'c', guildIds: ['1'], registerGlobal: false },
    library: { driveRemote: 'gdrive:x', cacheDir: '/tmp/x', rcloneConfigPath: null, cookiesFile: null },
    ytdlp: { maxDurationSec: 1200, playerClients: 'web', potProviderUrl: null },
    player: { idleTimeoutMs: 120_000, maxQueue: 200, downloadCooldownMs: 5_000 },
    logPrefix: '[teste]',
    ...overrides,
  }
}

describe('configuração compartilhada', () => {
  beforeEach(() => resetSharedConfig())

  it('lança ao ser lida antes de configurada — falha no boot, não no meio de uma call', () => {
    expect(() => getSharedConfig()).toThrow(/configureShared/)
  })

  it('devolve a configuração depois de configurada', () => {
    configureShared(fake())
    expect(getSharedConfig().player.maxQueue).toBe(200)
  })

  it('recusa allowlist vazia', () => {
    const semGuilds = fake()
    semGuilds.discord.guildIds = []
    expect(() => configureShared(semGuilds)).toThrow(/allowlist/)
  })

  it('permite que apps diferentes configurem valores diferentes', () => {
    configureShared(fake({ logPrefix: '[dj]' }))
    expect(getSharedConfig().logPrefix).toBe('[dj]')
    resetSharedConfig()
    configureShared(fake({ logPrefix: '[icarus]' }))
    expect(getSharedConfig().logPrefix).toBe('[icarus]')
  })
})
