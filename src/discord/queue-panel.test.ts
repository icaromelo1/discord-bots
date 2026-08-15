import { describe, it, expect } from 'vitest'
import { buildQueuePanel, QUEUE_IDS, SelecaoFila } from './queue-panel'
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
    driveFile: null,
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

function findButton(components: ReturnType<typeof buildQueuePanel>['components'], customId: string) {
  const button = components[1].components.find(
    (component: any) => component.data.custom_id === customId,
  )
  if (!button) throw new Error(`botão ${customId} não encontrado`)
  return button
}

function selectMenu(components: ReturnType<typeof buildQueuePanel>['components']) {
  return components[0].components[0] as any
}

describe('buildQueuePanel — fila vazia', () => {
  it('produz o embed "Fila vazia."', () => {
    const { embeds } = buildQueuePanel(makeState(), null)

    expect(embeds[0].data.description).toBe('Fila vazia.')
  })

  it('desabilita o menu e os 4 botões', () => {
    const { components } = buildQueuePanel(makeState(), null)

    expect(selectMenu(components).data.disabled).toBe(true)
    expect(findButton(components, QUEUE_IDS.playNext).data.disabled).toBe(true)
    expect(findButton(components, QUEUE_IDS.up).data.disabled).toBe(true)
    expect(findButton(components, QUEUE_IDS.down).data.disabled).toBe(true)
    expect(findButton(components, QUEUE_IDS.remove).data.disabled).toBe(true)
  })
})

describe('buildQueuePanel — opções do menu', () => {
  it('com 3 itens, produz 3 opções com os youtubeIds como value', () => {
    const items = [
      makeItem({ youtubeId: 'aaa', trackId: 't-a' }),
      makeItem({ youtubeId: 'bbb', trackId: 't-b' }),
      makeItem({ youtubeId: 'ccc', trackId: 't-c' }),
    ]
    const { components } = buildQueuePanel(makeState({ items }), null)

    const options = selectMenu(components).options
    expect(options).toHaveLength(3)
    expect(options.map((option: any) => option.data.value)).toEqual(['aaa', 'bbb', 'ccc'])
  })

  it('com 40 itens, limita a exatamente 25 opções', () => {
    const items = Array.from({ length: 40 }, (_, index) =>
      makeItem({ youtubeId: `id-${index}`, trackId: `t-${index}` }),
    )
    const { components } = buildQueuePanel(makeState({ items }), null)

    expect(selectMenu(components).options).toHaveLength(25)
  })
})

describe('buildQueuePanel — limite de tamanho do field da fila', () => {
  it('não produz field acima de 1024 caracteres mesmo com muitos títulos longos', () => {
    const items = Array.from({ length: 30 }, (_, index) =>
      makeItem({ trackId: `t-${index}`, youtubeId: `id-${index}`, title: 'X'.repeat(150) }),
    )
    const { embeds } = buildQueuePanel(makeState({ items }), null)

    const field = embeds[0].data.fields?.find((candidate) => candidate.name === 'Próximas')
    expect(field).toBeDefined()
    expect(field!.value.length).toBeLessThanOrEqual(1024)
  })
})

describe('buildQueuePanel — seleção', () => {
  it('com selecionado = null, os 4 botões ficam desabilitados', () => {
    const items = [makeItem({ youtubeId: 'aaa' })]
    const { components } = buildQueuePanel(makeState({ items }), null)

    expect(findButton(components, QUEUE_IDS.playNext).data.disabled).toBe(true)
    expect(findButton(components, QUEUE_IDS.up).data.disabled).toBe(true)
    expect(findButton(components, QUEUE_IDS.down).data.disabled).toBe(true)
    expect(findButton(components, QUEUE_IDS.remove).data.disabled).toBe(true)
  })

  it('com selecionado apontando pra um item presente, os 4 botões ficam habilitados e a opção fica default', () => {
    const items = [makeItem({ youtubeId: 'aaa' }), makeItem({ youtubeId: 'bbb', trackId: 't-2' })]
    const { components } = buildQueuePanel(makeState({ items }), 'bbb')

    expect(findButton(components, QUEUE_IDS.playNext).data.disabled).toBe(false)
    expect(findButton(components, QUEUE_IDS.up).data.disabled).toBe(false)
    expect(findButton(components, QUEUE_IDS.down).data.disabled).toBe(false)
    expect(findButton(components, QUEUE_IDS.remove).data.disabled).toBe(false)

    const options = selectMenu(components).options
    const selecionada = options.find((option: any) => option.data.value === 'bbb')
    expect(selecionada.data.default).toBe(true)
    const outra = options.find((option: any) => option.data.value === 'aaa')
    expect(outra.data.default ?? false).toBe(false)
  })
})

describe('buildQueuePanel — singular/plural no título', () => {
  it('mostra "1 faixa" com apenas um item', () => {
    const { embeds } = buildQueuePanel(makeState({ items: [makeItem()] }), null)

    expect(embeds[0].data.title).toBe('Fila — 1 faixa')
  })

  it('mostra "2 faixas" com dois itens', () => {
    const items = [makeItem({ youtubeId: 'aaa' }), makeItem({ youtubeId: 'bbb', trackId: 't-2' })]
    const { embeds } = buildQueuePanel(makeState({ items }), null)

    expect(embeds[0].data.title).toBe('Fila — 2 faixas')
  })
})

describe('SelecaoFila', () => {
  it('guarda e recupera a seleção por guild e usuário', () => {
    const selecao = new SelecaoFila()
    selecao.set('guild-1', 'user-1', 'youtube-1')

    expect(selecao.get('guild-1', 'user-1')).toBe('youtube-1')
  })

  it('retorna null quando não há seleção', () => {
    const selecao = new SelecaoFila()

    expect(selecao.get('guild-1', 'user-1')).toBeNull()
  })

  it('a seleção do usuário A não afeta a do usuário B', () => {
    const selecao = new SelecaoFila()
    selecao.set('guild-1', 'user-a', 'youtube-a')
    selecao.set('guild-1', 'user-b', 'youtube-b')

    expect(selecao.get('guild-1', 'user-a')).toBe('youtube-a')
    expect(selecao.get('guild-1', 'user-b')).toBe('youtube-b')
  })

  it('a seleção na guild A não afeta a guild B', () => {
    const selecao = new SelecaoFila()
    selecao.set('guild-a', 'user-1', 'youtube-a')
    selecao.set('guild-b', 'user-1', 'youtube-b')

    expect(selecao.get('guild-a', 'user-1')).toBe('youtube-a')
    expect(selecao.get('guild-b', 'user-1')).toBe('youtube-b')
  })

  it('clear zera a seleção', () => {
    const selecao = new SelecaoFila()
    selecao.set('guild-1', 'user-1', 'youtube-1')
    selecao.clear('guild-1', 'user-1')

    expect(selecao.get('guild-1', 'user-1')).toBeNull()
  })
})
