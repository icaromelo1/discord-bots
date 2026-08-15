// A base compartilhada não lê variável de ambiente: quem consome é que sabe de onde
// a configuração vem. Cada app monta seu SharedConfig e chama configureShared() no
// boot. Sem isso, dois bots no mesmo monorepo brigariam pelo mesmo .env.

export interface SharedConfig {
  discord: {
    token: string
    clientId: string
    guildIds: string[]
    registerGlobal: boolean
  }
  library: {
    driveRemote: string
    cacheDir: string
    rcloneConfigPath: string | null
    cookiesFile: string | null
  }
  ytdlp: {
    maxDurationSec: number
    playerClients: string
    potProviderUrl: string | null
  }
  player: {
    idleTimeoutMs: number
    maxQueue: number
    downloadCooldownMs: number
  }
  /** Prefixo dos logs, para distinguir os bots numa mesma máquina. */
  logPrefix: string
}

let atual: SharedConfig | null = null

export function configureShared(config: SharedConfig): void {
  if (config.discord.guildIds.length === 0) {
    throw new Error('guildIds está vazia — sem allowlist o bot aceitaria qualquer servidor')
  }
  atual = config
}

export function getSharedConfig(): SharedConfig {
  if (!atual) {
    throw new Error(
      'configureShared() não foi chamado. O app precisa configurar a base compartilhada antes de usá-la.',
    )
  }
  return atual
}

/** Só para testes: descarta a configuração ativa. */
export function resetSharedConfig(): void {
  atual = null
}

export function logPrefix(): string {
  return atual?.logPrefix ?? '[bot]'
}
