import { describe, it, expect } from 'vitest'
import { buildQueuePanel } from './queue-panel'
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
  return { current: null, startedAt: null, items: [], paused: false, connected: false, ...overrides }
}

// Regressão real: playlist de uma faixa só tocava, mas o /fila dizia "Fila vazia"
// porque a faixa atual não está em items — ela sai da fila ao começar a tocar.
describe('buildQueuePanel — última faixa tocando, nada mais na fila', () => {
  const tocando = makeState({
    current: makeItem({ title: 'Dum Dee Dum', addedByName: 'Aposentado' }),
    startedAt: Date.now(),
    items: [],
    connected: true,
  })

  it('mostra a faixa que está tocando em vez de dizer que a fila está vazia', () => {
    const { embeds } = buildQueuePanel(tocando, null)

    expect(embeds[0].data.description).toContain('▶ Tocando: **Dum Dee Dum**')
    expect(embeds[0].data.description).not.toBe('Fila vazia.')
  })

  it('deixa claro que não há próximas, sem negar o que toca agora', () => {
    const { embeds } = buildQueuePanel(tocando, null)

    expect(embeds[0].data.description).toContain('Nada mais na fila.')
  })

  it('só diz "Fila vazia." quando não há nada tocando de verdade', () => {
    const { embeds } = buildQueuePanel(makeState(), null)

    expect(embeds[0].data.description).toBe('Fila vazia.')
  })
})
