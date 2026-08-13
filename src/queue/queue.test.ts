import { describe, it, expect } from 'vitest'
import { QueueManager, QueueFullError, type QueueItem } from './queue'

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

describe('QueueManager — caminho feliz', () => {
  it('add depois next devolve o mesmo item e vira current', () => {
    const manager = new QueueManager()
    const item = makeItem()
    manager.add('guild-1', item)

    const played = manager.next('guild-1')

    expect(played).toEqual(item)
    expect(manager.current('guild-1')).toEqual(item)
  })

  it('snapshot reflete current, items e paused corretamente', () => {
    const manager = new QueueManager()
    const first = makeItem({ trackId: 'a' })
    const second = makeItem({ trackId: 'b' })
    manager.add('guild-1', first)
    manager.add('guild-1', second)
    manager.next('guild-1')

    const snapshot = manager.snapshot('guild-1')

    expect(snapshot.current).toEqual(first)
    expect(snapshot.items).toEqual([second])
    expect(snapshot.paused).toBe(false)
  })

  it('size reflete a quantidade de itens pendentes na fila', () => {
    const manager = new QueueManager()
    manager.add('guild-1', makeItem({ trackId: 'a' }))
    manager.add('guild-1', makeItem({ trackId: 'b' }))

    expect(manager.size('guild-1')).toBe(2)
  })
})

describe('QueueManager — isolamento entre guilds', () => {
  it('add na guild A não altera items nem size da guild B', () => {
    const manager = new QueueManager()
    manager.add('guild-b', makeItem({ trackId: 'b-1' }))

    manager.add('guild-a', makeItem({ trackId: 'a-1' }))
    manager.add('guild-a', makeItem({ trackId: 'a-2' }))

    expect(manager.size('guild-b')).toBe(1)
    expect(manager.snapshot('guild-b').items).toEqual([makeItem({ trackId: 'b-1' })])
  })

  it('next e clear na guild A não afetam current nem items da guild B', () => {
    const manager = new QueueManager()
    const itemB = makeItem({ trackId: 'b-1' })
    manager.add('guild-b', itemB)
    manager.next('guild-b')

    manager.add('guild-a', makeItem({ trackId: 'a-1' }))
    manager.next('guild-a')
    manager.clear('guild-a')

    expect(manager.current('guild-b')).toEqual(itemB)
    expect(manager.snapshot('guild-b').items).toEqual([])
  })

  it('pausar a guild A não altera isPaused da guild B', () => {
    const manager = new QueueManager()

    manager.setPaused('guild-a', true)

    expect(manager.isPaused('guild-a')).toBe(true)
    expect(manager.isPaused('guild-b')).toBe(false)
  })
})

describe('QueueManager — limite da fila', () => {
  it('lança QueueFullError ao ultrapassar config.player.maxQueue', () => {
    const manager = new QueueManager()
    const limit = 50

    for (let i = 0; i < limit; i++) {
      manager.add('guild-1', makeItem({ trackId: `t-${i}` }))
    }

    expect(() => manager.add('guild-1', makeItem({ trackId: 'overflow' }))).toThrow(QueueFullError)
  })
})

describe('QueueManager — next com fila vazia', () => {
  it('retorna null e zera current e startedAt', () => {
    const manager = new QueueManager()

    const result = manager.next('guild-1')

    expect(result).toBeNull()
    expect(manager.current('guild-1')).toBeNull()
    expect(manager.snapshot('guild-1').startedAt).toBeNull()
  })
})

describe('QueueManager — snapshot devolve cópia', () => {
  it('mutar o array de items retornado não afeta o estado interno', () => {
    const manager = new QueueManager()
    manager.add('guild-1', makeItem({ trackId: 'a' }))

    const snapshot = manager.snapshot('guild-1')
    snapshot.items.push(makeItem({ trackId: 'intruso' }))
    snapshot.items.pop()
    snapshot.items.pop()

    expect(manager.size('guild-1')).toBe(1)
    expect(manager.snapshot('guild-1').items).toEqual([makeItem({ trackId: 'a' })])
  })
})

describe('QueueManager — cooldown de download', () => {
  it('permite a primeira tentativa de um usuário', () => {
    const manager = new QueueManager()

    expect(manager.canDownload('guild-1', 'user-1', 1000)).toBe(true)
  })

  it('bloqueia uma nova tentativa dentro da janela de cooldown', () => {
    const manager = new QueueManager()
    manager.markDownload('guild-1', 'user-1', 1000)

    expect(manager.canDownload('guild-1', 'user-1', 1000 + 4999)).toBe(false)
  })

  it('permite de novo depois que a janela de cooldown passa', () => {
    const manager = new QueueManager()
    manager.markDownload('guild-1', 'user-1', 1000)

    expect(manager.canDownload('guild-1', 'user-1', 1000 + 5000)).toBe(true)
  })

  it('cooldown de um usuário não bloqueia outro usuário na mesma guild', () => {
    const manager = new QueueManager()
    manager.markDownload('guild-1', 'user-1', 1000)

    expect(manager.canDownload('guild-1', 'user-2', 1000 + 100)).toBe(true)
  })

  it('cooldown da guild A não bloqueia o mesmo usuário na guild B', () => {
    const manager = new QueueManager()
    manager.markDownload('guild-a', 'user-1', 1000)

    expect(manager.canDownload('guild-b', 'user-1', 1000 + 100)).toBe(true)
  })
})
