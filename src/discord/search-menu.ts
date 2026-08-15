import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js'
import type { SearchResult } from '../library/ytdlp'

export const SEARCH_MENU_ID = 'dj:pick'

const EMBED_COLOR = 0x5865f2
// limites do Discord: 100 chars no label e 100 na description de cada opção
const LABEL_MAX = 100
const DESCRIPTION_MAX = 100

function truncate(texto: string, max: number): string {
  if (texto.length <= max) return texto
  return `${texto.slice(0, max - 1)}…`
}

export function formatDuration(durationSec: number): string {
  if (durationSec <= 0) return '?:??'
  const minutes = Math.floor(durationSec / 60)
  const seconds = durationSec % 60
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function buildSearchMenu(
  termo: string,
  resultados: SearchResult[],
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<StringSelectMenuBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`Resultados para "${truncate(termo, 200)}"`)
    .setDescription('Escolha uma música no menu abaixo.')

  const menu = new StringSelectMenuBuilder()
    .setCustomId(SEARCH_MENU_ID)
    .setPlaceholder('Escolha uma música...')
    .addOptions(
      resultados.map((resultado) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(resultado.title, LABEL_MAX))
          // o id do vídeo viaja no value: assim o clique carrega tudo que precisamos
          // e não é preciso guardar a busca em memória entre as duas interações
          .setValue(resultado.youtubeId)
          .setDescription(
            truncate(
              [resultado.channel, formatDuration(resultado.durationSec)].filter(Boolean).join(' · '),
              DESCRIPTION_MAX,
            ),
          ),
      ),
    )

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  }
}
