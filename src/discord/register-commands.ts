import { REST, Routes, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js'
import { config } from '../config'

export async function registerCommands(commands: RESTPostAPIApplicationCommandsJSONBody[]): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.discord.token)

  if (config.discord.registerGlobal) {
    await rest.put(Routes.applicationCommands(config.discord.clientId), { body: commands })
    console.log(`[discord-dj] ${commands.length} comando(s) registrado(s) globalmente`)
    return
  }

  // Uma guild da allowlist onde o bot ainda não foi convidado responde Missing Access.
  // Isso não pode derrubar o boot: as outras guilds continuam funcionando, e a que
  // falta passa a funcionar sozinha assim que alguém convidar o bot e reiniciar.
  let registradas = 0
  for (const guildId of config.discord.guildIds) {
    try {
      await rest.put(Routes.applicationGuildCommands(config.discord.clientId, guildId), { body: commands })
      registradas++
    } catch (error) {
      console.warn(
        `[discord-dj] não deu pra registrar comandos na guild ${guildId} (o bot já foi convidado pra lá?):`,
        (error as Error).message,
      )
    }
  }
  console.log(
    `[discord-dj] ${commands.length} comando(s) registrado(s) em ${registradas}/${config.discord.guildIds.length} guild(s)`,
  )
}
