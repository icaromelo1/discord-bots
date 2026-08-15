import { describe, expect, it } from 'vitest'
import { buildSearchMenu, formatDuration, SEARCH_MENU_ID } from './search-menu'
import type { SearchResult } from '../library/ytdlp'

function resultado(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    youtubeId: 'dQw4w9WgXcQ',
    title: 'DJ Jazzy Jeff - Summertime',
    channel: 'NERD HITS',
    durationSec: 264,
    ...overrides,
  }
}

describe('formatDuration', () => {
  it('formata minutos e segundos com zero à esquerda', () => {
    expect(formatDuration(264)).toBe('4:24')
    expect(formatDuration(65)).toBe('1:05')
  })

  it('inclui hora quando passa de 60 minutos', () => {
    expect(formatDuration(3725)).toBe('1:02:05')
  })

  it('mostra interrogação quando a duração é desconhecida', () => {
    expect(formatDuration(0)).toBe('?:??')
  })
})

describe('buildSearchMenu', () => {
  it('cria uma opção por resultado, com o id do vídeo no value', () => {
    const { components } = buildSearchMenu('summertime', [
      resultado({ youtubeId: 'aaaaaaaaaaa' }),
      resultado({ youtubeId: 'bbbbbbbbbbb' }),
    ])
    const menu = components[0].components[0]

    expect(menu.data.custom_id).toBe(SEARCH_MENU_ID)
    expect(menu.options.map((o) => o.data.value)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb'])
  })

  it('mostra canal e duração na descrição da opção', () => {
    const { components } = buildSearchMenu('summertime', [resultado()])
    const opcao = components[0].components[0].options[0]

    expect(opcao.data.description).toBe('NERD HITS · 4:24')
  })

  it('trunca título acima de 100 caracteres — o Discord rejeita o componente inteiro', () => {
    const { components } = buildSearchMenu('x', [resultado({ title: 'A'.repeat(250) })])
    const opcao = components[0].components[0].options[0]

    expect(opcao.data.label.length).toBeLessThanOrEqual(100)
    expect(opcao.data.label.endsWith('…')).toBe(true)
  })

  it('trunca descrição acima de 100 caracteres', () => {
    const { components } = buildSearchMenu('x', [resultado({ channel: 'B'.repeat(250) })])
    const opcao = components[0].components[0].options[0]

    expect(opcao.data.description!.length).toBeLessThanOrEqual(100)
  })

  it('mantém o termo buscado no título do embed', () => {
    const { embeds } = buildSearchMenu('summertime', [resultado()])

    expect(embeds[0].data.title).toBe('Resultados para "summertime"')
  })
})
