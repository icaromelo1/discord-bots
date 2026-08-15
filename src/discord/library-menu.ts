import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js'
import type { LibraryEntry } from '../library/library'
import type { QueueItem } from '../queue/queue'
import { formatDuration } from './search-menu'

export const LIBRARY_MENU_ID = 'dj:lib'

const EMBED_COLOR = 0x5865f2
const LABEL_MAX = 100
const DESCRIPTION_MAX = 100
// limite do Discord: até 25 opções por select menu, senão a mensagem inteira é rejeitada
const OPTIONS_MAX = 25

function truncate(texto: string, max: number): string {
  if (texto.length <= max) return texto
  return `${texto.slice(0, max - 1)}…`
}

export function buildLibraryMenu(
  entradas: LibraryEntry[],
  busca: string | null,
  adicionadas: number,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<StringSelectMenuBuilder>[] } {
  const titulo = busca ? `Biblioteca — "${busca}"` : 'Biblioteca'

  if (entradas.length === 0) {
    const descricao = busca
      ? 'Nenhuma música da biblioteca casa com essa busca.'
      : 'Esta guild ainda não tem nenhuma música na biblioteca.'
    const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle(titulo).setDescription(descricao)
    return { embeds: [embed], components: [] }
  }

  const linhas = ['Escolha uma música para adicionar à fila.']
  if (adicionadas > 0) {
    linhas.push(`✓ ${adicionadas} ${adicionadas === 1 ? 'adicionada' : 'adicionadas'}`)
  }

  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle(titulo).setDescription(linhas.join('\n'))

  const menu = new StringSelectMenuBuilder()
    .setCustomId(LIBRARY_MENU_ID)
    .setPlaceholder('Escolha uma música...')
    .addOptions(
      entradas.slice(0, OPTIONS_MAX).map((entrada) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(entrada.title, LABEL_MAX))
          .setValue(entrada.youtubeId)
          .setDescription(truncate(formatDuration(entrada.durationSec), DESCRIPTION_MAX)),
      ),
    )

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  }
}

export function entradaParaItem(entrada: LibraryEntry, userId: string, userName: string): QueueItem {
  return {
    trackId: entrada.trackId,
    youtubeId: entrada.youtubeId,
    title: entrada.title,
    durationSec: entrada.durationSec,
    driveFile: `${entrada.youtubeId}.mp3`,
    addedBy: userId,
    addedByName: userName,
  }
}
