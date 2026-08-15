// Os apps leem env no carregamento do módulo (e lançam se faltar, de propósito).
// Os testes fornecem valores falsos antes de qualquer import de config de app.
process.env.DISCORD_TOKEN ||= 'token-fake'
process.env.CLIENT_ID ||= 'client-fake'
process.env.GUILD_IDS ||= '111'
process.env.DATABASE_URL ||= 'postgres://teste:teste@localhost:5432/teste'

import { configureShared } from './packages/shared/src/config'

// A base compartilhada exige configuração explícita; os testes fornecem uma fake para
// que módulos como fila, voz e biblioteca possam ser exercitados isoladamente.
configureShared({
  discord: { token: 'token-fake', clientId: 'client-fake', guildIds: ['111'], registerGlobal: false },
  library: {
    driveRemote: 'gdrive:teste',
    cacheDir: '/tmp/discord-bots-teste',
    rcloneConfigPath: null,
    cookiesFile: null,
  },
  ytdlp: { maxDurationSec: 1200, playerClients: 'web,mweb,tv', potProviderUrl: null },
  player: { idleTimeoutMs: 120_000, maxQueue: 200, downloadCooldownMs: 5_000 },
  logPrefix: '[teste]',
})
