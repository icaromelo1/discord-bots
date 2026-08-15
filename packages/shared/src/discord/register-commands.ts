import { getSharedConfig, logPrefix } from '../config'
import { REST, Routes, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js'


export async function registerCommands(commands: RESTPostAPIApplicationCommandsJSONBody[]): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(getSharedConfig().discord.token)

  if (getSharedConfig().discord.registerGlobal) {
    await rest.put(Routes.applicationCommands(getSharedConfig().discord.clientId), { body: commands })
    console.log(`${logPrefix()} ${commands.length} comando(s) registrado(s) globalmente`)
    return
  }

  // Uma guild da allowlist onde o bot ainda não foi convidado responde Missing Access.
  // Isso não pode derrubar o boot: as outras guilds continuam funcionando, e a que
  // falta passa a funcionar sozinha assim que alguém convidar o bot e reiniciar.
  let registradas = 0
  for (const guildId of getSharedConfig().discord.guildIds) {
    try {
      await rest.put(Routes.applicationGuildCommands(getSharedConfig().discord.clientId, guildId), { body: commands })
      registradas++
    } catch (error) {
      console.warn(
        `${logPrefix()} não deu pra registrar comandos na guild ${guildId} (o bot já foi convidado pra lá?):`,
        (error as Error).message,
      )
    }
  }
  console.log(
    `${logPrefix()} ${commands.length} comando(s) registrado(s) em ${registradas}/${getSharedConfig().discord.guildIds.length} guild(s)`,
  )
}
