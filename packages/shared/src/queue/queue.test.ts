import { describe, it, expect } from 'vitest'
import { QueueManager, QueueFullError, type QueueItem } from './queue'

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    youtubeId: 'dQw4w9WgXcQ',
    title: 'Uma música',
    durationSec: 200,
    addedBy: 'user-1',
    addedByName: 'Fulano',
    trackId: 'track-1',
    driveFile: 'drive-file-1',
    ...overrides,
  }
}

function makeUnresolvedItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return makeItem({ trackId: null, driveFile: null, ...overrides })
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
    const limit = 200

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

describe('QueueManager — addMany', () => {
  it('respeita o limite quando a fila está vazia', () => {
    const manager = new QueueManager()
    const items = Array.from({ length: 300 }, (_, i) => makeItem({ trackId: `t-${i}` }))

    const result = manager.addMany('guild-1', items)

    expect(result).toEqual({ adicionadas: 200, cortadas: 100 })
    expect(manager.size('guild-1')).toBe(200)
  })

  it('respeita o espaço restante quando a fila já tem itens', () => {
    const manager = new QueueManager()
    manager.addMany(
      'guild-1',
      Array.from({ length: 195 }, (_, i) => makeItem({ trackId: `t-${i}` })),
    )

    const result = manager.addMany(
      'guild-1',
      Array.from({ length: 10 }, (_, i) => makeItem({ trackId: `novo-${i}` })),
    )

    expect(result).toEqual({ adicionadas: 5, cortadas: 5 })
    expect(manager.size('guild-1')).toBe(200)
  })

  it('devolve tudo cortado quando a fila já está cheia', () => {
    const manager = new QueueManager()
    manager.addMany(
      'guild-1',
      Array.from({ length: 200 }, (_, i) => makeItem({ trackId: `t-${i}` })),
    )

    const result = manager.addMany('guild-1', [makeItem({ trackId: 'extra' })])

    expect(result).toEqual({ adicionadas: 0, cortadas: 1 })
  })
})

describe('QueueManager — move', () => {
  it('move o primeiro item para a última posição', () => {
    const manager = new QueueManager()
    const [a, b, c] = [makeItem({ trackId: 'a' }), makeItem({ trackId: 'b' }), makeItem({ trackId: 'c' })]
    manager.add('guild-1', a)
    manager.add('guild-1', b)
    manager.add('guild-1', c)

    const result = manager.move('guild-1', 0, 2)

    expect(result).toBe(true)
    expect(manager.snapshot('guild-1').items).toEqual([b, c, a])
  })

  it('move o último item para a primeira posição', () => {
    const manager = new QueueManager()
    const [a, b, c] = [makeItem({ trackId: 'a' }), makeItem({ trackId: 'b' }), makeItem({ trackId: 'c' })]
    manager.add('guild-1', a)
    manager.add('guild-1', b)
    manager.add('guild-1', c)

    const result = manager.move('guild-1', 2, 0)

    expect(result).toBe(true)
    expect(manager.snapshot('guild-1').items).toEqual([c, a, b])
  })

  it('move um item do meio para outra posição do meio', () => {
    const manager = new QueueManager()
    const [a, b, c, d] = [
      makeItem({ trackId: 'a' }),
      makeItem({ trackId: 'b' }),
      makeItem({ trackId: 'c' }),
      makeItem({ trackId: 'd' }),
    ]
    manager.add('guild-1', a)
    manager.add('guild-1', b)
    manager.add('guild-1', c)
    manager.add('guild-1', d)

    const result = manager.move('guild-1', 1, 2)

    expect(result).toBe(true)
    expect(manager.snapshot('guild-1').items).toEqual([a, c, b, d])
  })

  it('índices inválidos retornam false sem alterar a fila', () => {
    const manager = new QueueManager()
    const [a, b, c] = [makeItem({ trackId: 'a' }), makeItem({ trackId: 'b' }), makeItem({ trackId: 'c' })]
    manager.add('guild-1', a)
    manager.add('guild-1', b)
    manager.add('guild-1', c)
    const before = manager.snapshot('guild-1').items

    expect(manager.move('guild-1', -1, 0)).toBe(false)
    expect(manager.move('guild-1', 0, 3)).toBe(false)
    expect(manager.move('guild-1', 0, 4)).toBe(false)
    expect(manager.move('guild-1', 3, 0)).toBe(false)
    expect(manager.snapshot('guild-1').items).toEqual(before)
  })
})

describe('QueueManager — remove', () => {
  it('índice válido devolve o item e encurta a fila', () => {
    const manager = new QueueManager()
    const [a, b, c] = [makeItem({ trackId: 'a' }), makeItem({ trackId: 'b' }), makeItem({ trackId: 'c' })]
    manager.add('guild-1', a)
    manager.add('guild-1', b)
    manager.add('guild-1', c)

    const removed = manager.remove('guild-1', 1)

    expect(removed).toEqual(b)
    expect(manager.snapshot('guild-1').items).toEqual([a, c])
  })

  it('índice inválido devolve null', () => {
    const manager = new QueueManager()
    manager.add('guild-1', makeItem({ trackId: 'a' }))

    expect(manager.remove('guild-1', 5)).toBeNull()
    expect(manager.remove('guild-1', -1)).toBeNull()
  })
})

describe('QueueManager — playNext', () => {
  it('leva o item do meio para a posição 0 mantendo a ordem relativa dos demais', () => {
    const manager = new QueueManager()
    const [a, b, c, d] = [
      makeItem({ trackId: 'a' }),
      makeItem({ trackId: 'b' }),
      makeItem({ trackId: 'c' }),
      makeItem({ trackId: 'd' }),
    ]
    manager.add('guild-1', a)
    manager.add('guild-1', b)
    manager.add('guild-1', c)
    manager.add('guild-1', d)

    const result = manager.playNext('guild-1', 2)

    expect(result).toBe(true)
    expect(manager.snapshot('guild-1').items).toEqual([c, a, b, d])
  })

  it('índice inválido retorna false', () => {
    const manager = new QueueManager()
    manager.add('guild-1', makeItem({ trackId: 'a' }))

    expect(manager.playNext('guild-1', 9)).toBe(false)
  })
})

describe('QueueManager — firstUnresolved', () => {
  it('devolve null quando todos os itens estão resolvidos', () => {
    const manager = new QueueManager()
    manager.add('guild-1', makeItem({ trackId: 'a' }))
    manager.add('guild-1', makeItem({ trackId: 'b' }))

    expect(manager.firstUnresolved('guild-1')).toBeNull()
  })

  it('devolve o item e o índice do primeiro não resolvido', () => {
    const manager = new QueueManager()
    manager.add('guild-1', makeItem({ trackId: 'a' }))
    manager.add('guild-1', makeItem({ trackId: 'b' }))
    const unresolved = makeUnresolvedItem({ youtubeId: 'unresolved-1' })
    manager.addMany('guild-1', [unresolved])

    const result = manager.firstUnresolved('guild-1')

    expect(result).toEqual({ item: unresolved, index: 2 })
  })
})

describe('QueueManager — markResolved', () => {
  it('preenche trackId e driveFile do item certo e não toca nos outros', () => {
    const manager = new QueueManager()
    manager.addMany('guild-1', [
      makeUnresolvedItem({ youtubeId: 'video-1' }),
      makeUnresolvedItem({ youtubeId: 'video-2' }),
    ])

    manager.markResolved('guild-1', 'video-1', 'track-abc', 'drive-abc')

    const items = manager.snapshot('guild-1').items
    expect(items[0]).toEqual(makeItem({ youtubeId: 'video-1', trackId: 'track-abc', driveFile: 'drive-abc' }))
    expect(items[1]).toEqual(makeUnresolvedItem({ youtubeId: 'video-2' }))
  })

  it('preenche também o current quando o youtubeId corresponde', () => {
    const manager = new QueueManager()
    manager.add('guild-1', makeUnresolvedItem({ youtubeId: 'video-1' }))
    manager.next('guild-1')

    manager.markResolved('guild-1', 'video-1', 'track-abc', 'drive-abc')

    expect(manager.current('guild-1')).toEqual(
      makeItem({ youtubeId: 'video-1', trackId: 'track-abc', driveFile: 'drive-abc' }),
    )
  })

  it('youtubeId inexistente não quebra e não altera nada', () => {
    const manager = new QueueManager()
    manager.add('guild-1', makeUnresolvedItem({ youtubeId: 'video-1' }))
    const before = manager.snapshot('guild-1').items

    expect(() => manager.markResolved('guild-1', 'inexistente', 'x', 'y')).not.toThrow()
    expect(manager.snapshot('guild-1').items).toEqual(before)
  })

  it('preenche todos os itens quando há youtubeId duplicado', () => {
    const manager = new QueueManager()
    manager.addMany('guild-1', [
      makeUnresolvedItem({ youtubeId: 'video-dup' }),
      makeUnresolvedItem({ youtubeId: 'video-dup' }),
    ])

    manager.markResolved('guild-1', 'video-dup', 'track-x', 'drive-x')

    const items = manager.snapshot('guild-1').items
    expect(items[0].trackId).toBe('track-x')
    expect(items[1].trackId).toBe('track-x')
  })
})

describe('QueueManager — isolamento entre guilds nas operações novas', () => {
  it('addMany na guild A não altera items nem size da guild B', () => {
    const manager = new QueueManager()
    manager.add('guild-b', makeItem({ trackId: 'b-1' }))

    manager.addMany('guild-a', [makeItem({ trackId: 'a-1' }), makeItem({ trackId: 'a-2' })])

    expect(manager.size('guild-b')).toBe(1)
    expect(manager.snapshot('guild-b').items).toEqual([makeItem({ trackId: 'b-1' })])
  })

  it('move e playNext na guild A não alteram a ordem da guild B', () => {
    const manager = new QueueManager()
    const [b1, b2] = [makeItem({ trackId: 'b-1' }), makeItem({ trackId: 'b-2' })]
    manager.add('guild-b', b1)
    manager.add('guild-b', b2)
    manager.add('guild-a', makeItem({ trackId: 'a-1' }))
    manager.add('guild-a', makeItem({ trackId: 'a-2' }))
    manager.add('guild-a', makeItem({ trackId: 'a-3' }))

    manager.move('guild-a', 0, 2)
    manager.playNext('guild-a', 1)

    expect(manager.snapshot('guild-b').items).toEqual([b1, b2])
  })

  it('remove na guild A não altera size nem items da guild B', () => {
    const manager = new QueueManager()
    manager.add('guild-b', makeItem({ trackId: 'b-1' }))
    manager.add('guild-a', makeItem({ trackId: 'a-1' }))
    manager.add('guild-a', makeItem({ trackId: 'a-2' }))

    manager.remove('guild-a', 0)

    expect(manager.size('guild-b')).toBe(1)
    expect(manager.snapshot('guild-b').items).toEqual([makeItem({ trackId: 'b-1' })])
  })
})
