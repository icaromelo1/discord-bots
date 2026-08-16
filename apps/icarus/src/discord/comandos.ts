import { isGuildAllowed } from '@bots/shared'
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Interaction,
  type RESTPostAPIApplicationCommandsJSONBody,
  type VoiceBasedChannel,
} from 'discord.js'

export interface IcarusCommandContext {
  /** Toca um som de teste pela mesma tubulação da fala. */
  testarAudio: (guildId: string) => Promise<boolean>
  entrar: (channel: VoiceBasedChannel) => Promise<void>
  sair: (guildId: string) => Promise<void>
  ondeEstou: () => { guildId: string; channelId: string } | null
  memoriaDe: (guildId: string, userId: string) => Promise<{ falas: number; primeira: Date | null; ultima: Date | null }>
  esquecer: (guildId: string, userId: string) => Promise<number>
}

const icarusCommand = new SlashCommandBuilder()
  .setName('icarus')
  .setDescription('Comandos do Icarus')
  .addSubcommand((sub) => sub.setName('entrar').setDescription('Chama o Icarus para a sua call'))
  .addSubcommand((sub) => sub.setName('sair').setDescription('Manda o Icarus sair da call'))
  .addSubcommand((sub) =>
    sub.setName('testar-audio').setDescription('Simula uma resposta do modelo para checar a saída de áudio'),
  )
  .addSubcommand((sub) => sub.setName('memoria').setDescription('Mostra o que o Icarus sabe sobre você'))
  .addSubcommand((sub) =>
    sub.setName('esquecer').setDescription('Apaga tudo que o Icarus sabe sobre você'),
  )

/**
 * Diagnóstico do caminho de SAÍDA de áudio, sem Gemini no meio.
 *
 * Existe porque "o bot não fala" tem duas causas possíveis e indistinguíveis de fora:
 * ou a resposta não está sendo gerada/liberada, ou a tubulação de áudio está quebrada.
 * Este comando exercita só a tubulação.
 */
export function tomDeTeste(segundos = 2, hz = 440): Buffer {
  const taxa = 24_000
  const amostras = taxa * segundos
  const pcm = Buffer.alloc(amostras * 2)
  for (let i = 0; i < amostras; i++) {
    // 440 Hz com envelope suave nas pontas, para não estalar
    const env = Math.min(1, i / 2400, (amostras - i) / 2400)
    pcm.writeInt16LE(Math.round(8000 * env * Math.sin((2 * Math.PI * hz * i) / taxa)), i * 2)
  }
  return pcm
}

export const icarusCommandData: RESTPostAPIApplicationCommandsJSONBody[] = [icarusCommand.toJSON()]

export const ICARUS_COMMAND_NAMES = new Set(icarusCommandData.map((c) => c.name))

async function guardGuild(interaction: ChatInputCommandInteraction): Promise<string | null> {
  const guildId = interaction.guildId
  if (!guildId || !isGuildAllowed(guildId)) {
    await interaction
      .reply({ content: 'Este servidor não está autorizado a usar o bot.', ephemeral: true })
      .catch(() => {})
    return null
  }
  return guildId
}

async function handleEntrar(interaction: ChatInputCommandInteraction, guildId: string, ctx: IcarusCommandContext): Promise<void> {
  const member = interaction.member as GuildMember | null
  const channel = member?.voice?.channel ?? null
  if (!channel) {
    await interaction.reply({ content: 'Entre numa call primeiro.', ephemeral: true })
    return
  }

  const ocupado = ctx.ondeEstou()
  // uma call por vez, um servidor por vez: se já está em outro lugar, não sai de lá
  if (ocupado && (ocupado.guildId !== guildId || ocupado.channelId !== channel.id)) {
    const onde =
      ocupado.guildId === guildId
        ? `outra call deste servidor`
        : `uma call de outro servidor`
    await interaction.reply({ content: `Já estou em ${onde}.`, ephemeral: true })
    return
  }

  await interaction.deferReply()
  await ctx.entrar(channel)
  await interaction.editReply({ content: 'Cheguei.' })
}

async function handleSair(interaction: ChatInputCommandInteraction, guildId: string, ctx: IcarusCommandContext): Promise<void> {
  await ctx.sair(guildId)
  await interaction.reply({ content: 'Até mais.' })
}

function formatarData(data: Date | null): string {
  return data ? data.toLocaleString('pt-BR') : '—'
}

async function handleMemoria(interaction: ChatInputCommandInteraction, guildId: string, ctx: IcarusCommandContext): Promise<void> {
  await interaction.deferReply({ ephemeral: true })
  const resumo = await ctx.memoriaDe(guildId, interaction.user.id)

  if (resumo.falas === 0) {
    await interaction.editReply({ content: 'Ainda não tenho nada guardado sobre você.' })
    return
  }

  await interaction.editReply({
    content: `Tenho ${resumo.falas} fala(s) suas guardadas, de ${formatarData(resumo.primeira)} até ${formatarData(resumo.ultima)}.`,
  })
}

async function handleEsquecer(interaction: ChatInputCommandInteraction, guildId: string, ctx: IcarusCommandContext): Promise<void> {
  await interaction.deferReply({ ephemeral: true })
  const apagadas = await ctx.esquecer(guildId, interaction.user.id)
  await interaction.editReply({ content: `Esqueci ${apagadas} fala(s) suas.` })
}

/**
 * Trata uma interação se ela pertencer aos comandos próprios do Icarus. Devolve
 * `true` quando tratou, no mesmo padrão de `handleMusicInteraction`: o app tenta
 * a música primeiro e cai aqui quando ela recusa.
 */
export async function handleIcarusCommand(interaction: Interaction, ctx: IcarusCommandContext): Promise<boolean> {
  if (!interaction.isChatInputCommand()) return false
  if (!ICARUS_COMMAND_NAMES.has(interaction.commandName)) return false

  const guildId = await guardGuild(interaction)
  if (!guildId) return true

  const subcomando = interaction.options.getSubcommand()

  switch (subcomando) {
    case 'entrar':
      await handleEntrar(interaction, guildId, ctx)
      break
    case 'sair':
      await handleSair(interaction, guildId, ctx)
      break
    case 'testar-audio': {
      await interaction.reply({ content: 'Tocando um som de teste...', ephemeral: true })
      const ok = await ctx.testarAudio(guildId)
      await interaction.editReply(
        ok
          ? 'Simulei uma resposta completa. Ouviu? Se sim, a tubulação está boa e o problema é o modelo não gerar resposta com conteúdo.'
          : 'Não estou numa call — rode /icarus entrar antes.',
      )
      break
    }
    case 'memoria':
      await handleMemoria(interaction, guildId, ctx)
      break
    case 'esquecer':
      await handleEsquecer(interaction, guildId, ctx)
      break
    default:
      break
  }

  return true
}
