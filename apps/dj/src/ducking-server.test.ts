import type { VoiceManager } from '@bots/shared'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { iniciarDuckingServer } from './ducking-server'

function criarVoiceManagerFalso(): { definirVolume: ReturnType<typeof vi.fn> } {
  return { definirVolume: vi.fn() }
}

describe('ducking-server', () => {
  let voice: ReturnType<typeof criarVoiceManagerFalso>
  let server: ReturnType<typeof iniciarDuckingServer>
  let baseUrl: string

  beforeEach(async () => {
    voice = criarVoiceManagerFalso()
    server = iniciarDuckingServer(voice as unknown as VoiceManager, 0)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('POST /ducking com corpo válido chama definirVolume com guildId e volume', async () => {
    voice.definirVolume.mockReturnValue(true)

    const res = await fetch(`${baseUrl}/ducking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: 'guild-1', volume: 0.25 }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(voice.definirVolume).toHaveBeenCalledWith('guild-1', 0.25)
  })

  it('guild que não está tocando devolve 404', async () => {
    voice.definirVolume.mockReturnValue(false)

    const res = await fetch(`${baseUrl}/ducking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: 'guild-sem-musica', volume: 1 }),
    })

    expect(res.status).toBe(404)
  })

  it('corpo sem guildId devolve 400', async () => {
    const res = await fetch(`${baseUrl}/ducking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume: 0.25 }),
    })

    expect(res.status).toBe(400)
    expect(voice.definirVolume).not.toHaveBeenCalled()
  })

  it('corpo com volume não numérico devolve 400', async () => {
    const res = await fetch(`${baseUrl}/ducking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: 'guild-1', volume: 'alto' }),
    })

    expect(res.status).toBe(400)
    expect(voice.definirVolume).not.toHaveBeenCalled()
  })

  it('JSON quebrado devolve 400', async () => {
    const res = await fetch(`${baseUrl}/ducking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ guildId: ',
    })

    expect(res.status).toBe(400)
  })

  it('rota desconhecida devolve 404', async () => {
    const res = await fetch(`${baseUrl}/nao-existe`)
    expect(res.status).toBe(404)
  })

  it('GET /health devolve 200', async () => {
    const res = await fetch(`${baseUrl}/health`)
    expect(res.status).toBe(200)
  })
})
