import { describe, expect, it } from 'vitest'
import { buildLibraryMenu, entradaParaItem, LIBRARY_MENU_ID } from './library-menu'
import type { LibraryEntry } from '../library/library'

function entrada(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    trackId: 'track-1',
    youtubeId: 'dQw4w9WgXcQ',
    title: 'DJ Jazzy Jeff - Summertime',
    durationSec: 264,
    lastPlayedAt: null,
    ...overrides,
  }
}

describe('buildLibraryMenu', () => {
  it('lista vazia não gera menu e avisa', () => {
    const { embeds, components } = buildLibraryMenu([], null, 0)

    expect(components).toEqual([])
    expect(embeds[0].data.description).toContain('ainda não tem')
  })

  it('cria uma opção por entrada, com o youtubeId no value', () => {
    const { components } = buildLibraryMenu(
      [entrada({ youtubeId: 'aaaaaaaaaaa' }), entrada({ youtubeId: 'bbbbbbbbbbb' }), entrada({ youtubeId: 'ccccccccccc' })],
      null,
      0,
    )
    const menu = components[0].components[0]

    expect(menu.data.custom_id).toBe(LIBRARY_MENU_ID)
    expect(menu.options.map((o) => o.data.value)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'])
  })

  it('limita a 25 opções mesmo com 40 entradas — limite do Discord', () => {
    const entradas = Array.from({ length: 40 }, (_, i) => entrada({ youtubeId: `id-${i}` }))
    const { components } = buildLibraryMenu(entradas, null, 0)

    expect(components[0].components[0].options.length).toBe(25)
  })

  it('trunca título acima de 100 caracteres', () => {
    const { components } = buildLibraryMenu([entrada({ title: 'A'.repeat(250) })], null, 0)
    const opcao = components[0].components[0].options[0]

    expect(opcao.data.label.length).toBeLessThanOrEqual(100)
    expect(opcao.data.label.endsWith('…')).toBe(true)
  })

  it('mostra a busca no título do embed quando preenchida', () => {
    const { embeds } = buildLibraryMenu([entrada()], 'summertime', 0)

    expect(embeds[0].data.title).toBe('Biblioteca — "summertime"')
  })

  it('título sem busca', () => {
    const { embeds } = buildLibraryMenu([entrada()], null, 0)

    expect(embeds[0].data.title).toBe('Biblioteca')
  })

  it('mostra contagem no singular quando adicionadas = 1', () => {
    const { embeds } = buildLibraryMenu([entrada()], null, 1)

    expect(embeds[0].data.description).toContain('✓ 1 adicionada')
    expect(embeds[0].data.description).not.toContain('adicionadas')
  })

  it('mostra contagem no plural quando adicionadas = 3', () => {
    const { embeds } = buildLibraryMenu([entrada()], null, 3)

    expect(embeds[0].data.description).toContain('✓ 3 adicionadas')
  })
})

describe('entradaParaItem', () => {
  it('devolve item resolvido com trackId e driveFile derivado do youtubeId', () => {
    const item = entradaParaItem(entrada({ trackId: 'track-42', youtubeId: 'xyz123' }), 'user-1', 'Icaro')

    expect(item.trackId).toBe('track-42')
    expect(item.trackId).not.toBeNull()
    expect(item.driveFile).toBe('xyz123.mp3')
    expect(item.addedBy).toBe('user-1')
    expect(item.addedByName).toBe('Icaro')
  })
})
