import { getSharedConfig, logPrefix } from '../config'
import { Client, Events, GatewayIntentBits } from 'discord.js'


export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    // Sem makeCache customizado de propósito: diferente do bot GM, que zera
    // VoiceStateManager para economizar RAM, este bot depende de
    // member.voice.channel para achar a call do usuário — zerar quebraria isso.
  })
}

export function isGuildAllowed(guildId: string | null): boolean {
  if (!guildId) return false
  return getSharedConfig().discord.guildIds.includes(guildId)
}

export function installGuildGuard(client: Client): void {
  client.on(Events.GuildCreate, async (guild) => {
    if (isGuildAllowed(guild.id)) return
    console.log(`${logPrefix()} guild não autorizada, saindo: ${guild.name} (${guild.id})`)
    await guild.leave()
  })

  client.once(Events.ClientReady, async (readyClient) => {
    for (const guild of readyClient.guilds.cache.values()) {
      if (isGuildAllowed(guild.id)) continue
      console.log(`${logPrefix()} guild não autorizada encontrada no ready, saindo: ${guild.name} (${guild.id})`)
      await guild.leave()
    }
  })
}
