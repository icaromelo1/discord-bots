import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PlayerController } from './controller'
import { QueueManager, type QueueItem } from '../queue/queue'
import type { VoiceManager } from '../voice/voice'

// A biblioteca toca banco e disco; aqui só interessa a decisão do controller sobre
// parar ou não o áudio, então ela vira dublê.
vi.mock('../library/library', () => ({
  ensureLocalFile: vi.fn(async () => '/tmp/fake.mp3'),
  markPlayed: vi.fn(async () => undefined),
  resolveTrack: vi.fn(async () => ({
    id: 'track-1',
    youtubeId: 'dQw4w9WgXcQ',
    title: 'Uma música',
    durationSec: 200,
    driveFile: 'abc.mp3',
  })),
}))

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    trackId: 'track-1',
    driveFile: 'abc.mp3',
    youtubeId: 'dQw4w9WgXcQ',
    title: 'Uma música',
    durationSec: 200,
    addedBy: 'user-1',
    addedByName: 'Fulano',
    ...overrides,
  }
}

// Dublê mínimo da camada de voz: só precisamos observar QUAIS chamadas o controller faz.
function makeVoice() {
  return {
    onIdle: vi.fn(),
    onDisconnect: vi.fn(),
    ensure: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
    leave: vi.fn(),
    pause: vi.fn(() => true),
    resume: vi.fn(() => true),
    isConnected: vi.fn(() => true),
    channelId: vi.fn(() => 'canal-1'),
  }
}

describe('PlayerController — pular a última faixa', () => {
  let voice: ReturnType<typeof makeVoice>
  let queue: QueueManager
  let controller: PlayerController

  beforeEach(() => {
    voice = makeVoice()
    queue = new QueueManager()
    controller = new PlayerController(voice as unknown as VoiceManager, queue)
  })

  it('manda parar o áudio quando não há próxima faixa', async () => {
    // simula "tocando a última": current preenchido, nada em items
    queue.add('guild-1', makeItem())
    queue.next('guild-1')
    expect(queue.current('guild-1')).not.toBeNull()

    await controller.skip('guild-1')

    // sem isto o som continuava tocando mesmo com a fila vazia — bug do /pular
    expect(voice.stop).toHaveBeenCalledWith('guild-1')
    expect(queue.current('guild-1')).toBeNull()
  })

  it('não para o áudio quando ainda há próxima — o play substitui o recurso', async () => {
    queue.add('guild-1', makeItem({ youtubeId: 'aaaaaaaaaaa' }))
    queue.add('guild-1', makeItem({ youtubeId: 'bbbbbbbbbbb' }))
    queue.next('guild-1')

    await controller.skip('guild-1')

    expect(voice.stop).not.toHaveBeenCalled()
  })

  it('parar a última faixa de uma guild não mexe na outra', async () => {
    queue.add('guild-1', makeItem())
    queue.next('guild-1')
    queue.add('guild-2', makeItem({ youtubeId: 'ccccccccccc' }))
    queue.next('guild-2')

    await controller.skip('guild-1')

    expect(voice.stop).toHaveBeenCalledWith('guild-1')
    expect(voice.stop).not.toHaveBeenCalledWith('guild-2')
    expect(queue.current('guild-2')).not.toBeNull()
  })
})
