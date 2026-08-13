import { describe, it, expect } from 'vitest'
import { buildPanel, PANEL_BUTTON_IDS } from './panel'
import type { PlayerState } from '../player/controller'
import type { QueueItem } from '../queue/queue'

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    trackId: 'track-1',
    youtubeId: 'dQw4w9WgXcQ',
    title: 'Uma música',
    durationSec: 200,
    addedBy: 'user-1',
    addedByName: 'Fulano',
    ...overrides,
  }
}

function makeState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    current: null,
    startedAt: null,
    items: [],
    paused: false,
    connected: false,
    ...overrides,
  }
}

function findButton(components: ReturnType<typeof buildPanel>['components'], customId: string) {
  const button = components[0].components.find(
    (component) => component.data.custom_id === customId,
  )
  if (!button) throw new Error(`botão ${customId} não encontrado`)
  return button
}

describe('buildPanel — estado vazio', () => {
  it('produz o embed de fila vazia', () => {
    const { embeds } = buildPanel(makeState())

    expect(embeds[0].data.title).toBe('Fila vazia')
    expect(embeds[0].data.description).toBe('Nada tocando no momento.')
  })

  it('desabilita os botões de skip e stop', () => {
    const { components } = buildPanel(makeState())

    expect(findButton(components, PANEL_BUTTON_IDS.skip).data.disabled).toBe(true)
    expect(findButton(components, PANEL_BUTTON_IDS.stop).data.disabled).toBe(true)
  })
})

describe('buildPanel — faixa tocando', () => {
  it('usa o título da faixa como título do embed', () => {
    const state = makeState({ current: makeItem({ title: 'Faixa Atual' }) })

    const { embeds } = buildPanel(state)

    expect(embeds[0].data.title).toBe('Faixa Atual')
  })

  it('habilita os botões de skip e stop quando há faixa tocando', () => {
    const state = makeState({ current: makeItem() })

    const { components } = buildPanel(state)

    expect(findButton(components, PANEL_BUTTON_IDS.skip).data.disabled).toBe(false)
    expect(findButton(components, PANEL_BUTTON_IDS.stop).data.disabled).toBe(false)
  })
})

describe('buildPanel — limite de tamanho do field da fila', () => {
  it('não produz field acima de 1024 caracteres mesmo com muitos títulos longos', () => {
    const items = Array.from({ length: 30 }, (_, index) =>
      makeItem({ trackId: `t-${index}`, title: 'X'.repeat(150) }),
    )
    const state = makeState({ items })

    const { embeds } = buildPanel(state)
    const field = embeds[0].data.fields?.find((candidate) => candidate.name === 'Próximas')

    expect(field).toBeDefined()
    expect(field!.value.length).toBeLessThanOrEqual(1024)
  })

  it('mostra a linha "… e mais N" quando há mais itens do que os exibidos', () => {
    const items = Array.from({ length: 15 }, (_, index) =>
      makeItem({ trackId: `t-${index}`, title: `Faixa ${index}` }),
    )
    const state = makeState({ items })

    const { embeds } = buildPanel(state)
    const field = embeds[0].data.fields?.find((candidate) => candidate.name === 'Próximas')

    expect(field!.value).toContain('… e mais 5')
  })
})
