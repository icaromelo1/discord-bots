import { describe, expect, it, vi } from 'vitest'
import { VoiceManager } from './voice'

describe('handlers de voz aceitam mais de um inscrito', () => {
  it('não sobrescreve o handler anterior — o DJ registra o player e o Icarus os ouvidos', () => {
    const voice = new VoiceManager()
    const chamados: string[] = []

    voice.onDisconnect(() => chamados.push('primeiro'))
    voice.onDisconnect(() => chamados.push('segundo'))
    voice.onIdle(() => chamados.push('idle-1'))
    voice.onIdle(() => chamados.push('idle-2'))

    const idle = (voice as unknown as { idleHandlers: (() => void)[] }).idleHandlers
    const desconexao = (voice as unknown as { disconnectHandlers: (() => void)[] }).disconnectHandlers

    expect(idle).toHaveLength(2)
    expect(desconexao).toHaveLength(2)
  })
})

describe('manterConectado', () => {
  it('é inofensivo em guild sem conexão, em vez de lançar', () => {
    const voice = new VoiceManager()
    expect(() => voice.manterConectado('guild-inexistente', true)).not.toThrow()
  })

  it('existe na API pública — sem ele o bot de voz sai da call sozinho em 2 minutos', () => {
    const voice = new VoiceManager()
    expect(typeof voice.manterConectado).toBe('function')
  })
})
