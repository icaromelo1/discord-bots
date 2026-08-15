import { logPrefix } from '../config'
import { Events, type Client } from 'discord.js'
import type { PlayerController } from '../player/controller'

// Sair quando a call esvazia. O timer de ociosidade da camada de voz cobre "ninguém
// pediu música"; este cobre "todo mundo saiu" — casos diferentes, o segundo pode
// acontecer com música tocando, e aí o bot ficaria tocando sozinho até a fila acabar.
export function installEmptyChannelWatch(client: Client, controller: PlayerController): void {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const guildId = oldState.guild.id
    const botChannelId = controller.channelId(guildId)
    if (!botChannelId) return

    // só interessa quem SAIU do canal do bot (entrar nunca esvazia nada)
    if (oldState.channelId !== botChannelId || newState.channelId === botChannelId) return

    const channel = oldState.guild.channels.cache.get(botChannelId)
    if (!channel?.isVoiceBased()) return

    const humanos = channel.members.filter((member) => !member.user.bot).size
    if (humanos > 0) return

    console.log(`${logPrefix()} call vazia na guild ${guildId}, saindo`)
    controller.leave(guildId)
  })
}
