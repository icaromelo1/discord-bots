import { describe, it, expect, beforeEach } from 'vitest'
import { configureShared, limiteDuracaoSec, type SharedConfig } from './config'

const DONO = '378672897822031883'
const OUTRO = '286203492673257473'

function configurar(semLimiteDuracao: string[]): void {
  const config: SharedConfig = {
    discord: { token: 'x', clientId: 'x', guildIds: ['1'], registerGlobal: false },
    library: { driveRemote: 'gdrive:x', cacheDir: '/tmp', rcloneConfigPath: null, cookiesFile: null },
    ytdlp: { maxDurationSec: 1200, semLimiteDuracao, playerClients: 'web', potProviderUrl: null },
    player: { idleTimeoutMs: 1000, maxQueue: 200, downloadCooldownMs: 5000 },
    logPrefix: '[teste]',
  }
  configureShared(config)
}

describe('limiteDuracaoSec', () => {
  beforeEach(() => configurar([DONO]))

  it('isenta quem está na lista', () => {
    expect(limiteDuracaoSec(DONO)).toBe(Number.POSITIVE_INFINITY)
  })

  it('aplica o limite normal a qualquer outra pessoa', () => {
    expect(limiteDuracaoSec(OUTRO)).toBe(1200)
  })

  it('aplica o limite quando não se sabe quem pediu', () => {
    expect(limiteDuracaoSec(undefined)).toBe(1200)
    expect(limiteDuracaoSec(null)).toBe(1200)
  })

  it('com a lista vazia ninguém é isento — nem por acidente de configuração', () => {
    configurar([])
    expect(limiteDuracaoSec(DONO)).toBe(1200)
  })

  it('não isenta por prefixo ou id parecido', () => {
    expect(limiteDuracaoSec(DONO.slice(0, -1))).toBe(1200)
    expect(limiteDuracaoSec(`${DONO}0`)).toBe(1200)
  })
})
