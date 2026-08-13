import { REST, Routes, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js'
import { config } from '../config'

export async function registerCommands(commands: RESTPostAPIApplicationCommandsJSONBody[]): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.discord.token)

  if (config.discord.registerGlobal) {
    await rest.put(Routes.applicationCommands(config.discord.clientId), { body: commands })
    console.log(`[discord-dj] ${commands.length} comando(s) registrado(s) globalmente`)
    return
  }

  for (const guildId of config.discord.guildIds) {
    await rest.put(Routes.applicationGuildCommands(config.discord.clientId, guildId), { body: commands })
  }
  console.log(`[discord-dj] ${commands.length} comando(s) registrado(s) em ${config.discord.guildIds.length} guild(s)`)
}
