import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const connectMock = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAIFake(this: unknown) {
    return { live: { connect: connectMock } }
  }),
  Modality: { AUDIO: 'AUDIO' },
}))

const ENV_ORIGINAL = { ...process.env }

function limparEnvGemini(): void {
  delete process.env.GEMINI_API_KEY
  delete process.env.GEMINI_MODEL
  process.env.DATABASE_URL = 'postgres://teste-fake/db'
}

async function importarSessao() {
  vi.resetModules()
  return import('./sessao')
}

beforeEach(() => {
  connectMock.mockReset()
  process.env = { ...ENV_ORIGINAL }
  limparEnvGemini()
})

afterEach(() => {
  process.env = { ...ENV_ORIGINAL }
})

describe('SessaoLive', () => {
  it('abrir sem GEMINI_API_KEY lança erro citando a variável', async () => {
    const { SessaoLive } = await importarSessao()

    await expect(
      SessaoLive.abrir({
        guildId: 'g1',
        contextoInicial: 'contexto',
        onAudio: vi.fn(),
        onTranscricao: vi.fn(),
        onFechada: vi.fn(),
      }),
    ).rejects.toThrow(/GEMINI_API_KEY/)
  })

  it('abrir com sucesso conecta e fica no estado aberta', async () => {
    process.env.GEMINI_API_KEY = 'chave-fake'
    connectMock.mockResolvedValue({
      sendRealtimeInput: vi.fn(),
      sendClientContent: vi.fn(),
      close: vi.fn(),
    })

    const { SessaoLive } = await importarSessao()
    const sessao = await SessaoLive.abrir({
      guildId: 'g1',
      contextoInicial: 'contexto',
      onAudio: vi.fn(),
      onTranscricao: vi.fn(),
      onFechada: vi.fn(),
    })

    expect(sessao.estado()).toBe('aberta')
  })

  it('fechar chama onFechada com o motivo passado e vai para fechada', async () => {
    process.env.GEMINI_API_KEY = 'chave-fake'
    const close = vi.fn()
    connectMock.mockResolvedValue({
      sendRealtimeInput: vi.fn(),
      sendClientContent: vi.fn(),
      close,
    })

    const { SessaoLive } = await importarSessao()
    const onFechada = vi.fn()
    const sessao = await SessaoLive.abrir({
      guildId: 'g1',
      contextoInicial: 'contexto',
      onAudio: vi.fn(),
      onTranscricao: vi.fn(),
      onFechada,
    })

    await sessao.fechar('silencio')

    expect(close).toHaveBeenCalled()
    expect(onFechada).toHaveBeenCalledWith('silencio')
    expect(sessao.estado()).toBe('fechada')
  })

  it('erro de conexão (429/quota) na abertura lança CotaEstouradaError', async () => {
    process.env.GEMINI_API_KEY = 'chave-fake'
    connectMock.mockRejectedValue(new Error('429 Too Many Requests: quota exceeded'))

    const { SessaoLive, CotaEstouradaError } = await importarSessao()

    await expect(
      SessaoLive.abrir({
        guildId: 'g1',
        contextoInicial: 'contexto',
        onAudio: vi.fn(),
        onTranscricao: vi.fn(),
        onFechada: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(CotaEstouradaError)
  })

  it('erro de conexão (404/model not found) na abertura lança ModeloIndisponivelError', async () => {
    process.env.GEMINI_API_KEY = 'chave-fake'
    process.env.GEMINI_MODEL = 'modelo-que-sumiu'
    connectMock.mockRejectedValue(new Error('404 Not Found: model not found'))

    const { SessaoLive, ModeloIndisponivelError } = await importarSessao()

    await expect(
      SessaoLive.abrir({
        guildId: 'g1',
        contextoInicial: 'contexto',
        onAudio: vi.fn(),
        onTranscricao: vi.fn(),
        onFechada: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(ModeloIndisponivelError)
  })
})

describe('classificarErro', () => {
  it('429 ou mensagem de quota vira CotaEstouradaError', async () => {
    const { classificarErro, CotaEstouradaError } = await importarSessao()

    expect(classificarErro(new Error('429 RESOURCE_EXHAUSTED'))).toBeInstanceOf(CotaEstouradaError)
    expect(classificarErro(new Error('quota exceeded for this project'))).toBeInstanceOf(
      CotaEstouradaError,
    )
  })

  it('404 ou "model not found" vira ModeloIndisponivelError', async () => {
    const { classificarErro, ModeloIndisponivelError } = await importarSessao()

    expect(classificarErro(new Error('404 model not found'))).toBeInstanceOf(ModeloIndisponivelError)
    expect(classificarErro({ code: 'NOT_FOUND', message: 'model not found' })).toBeInstanceOf(
      ModeloIndisponivelError,
    )
  })

  it('outros erros viram Error genérico, sem CotaEstouradaError nem ModeloIndisponivelError', async () => {
    const { classificarErro, CotaEstouradaError, ModeloIndisponivelError } = await importarSessao()

    const erro = classificarErro(new Error('falha desconhecida de rede'))

    expect(erro).toBeInstanceOf(Error)
    expect(erro).not.toBeInstanceOf(CotaEstouradaError)
    expect(erro).not.toBeInstanceOf(ModeloIndisponivelError)
  })

  it('a mensagem traduzida não vaza o texto cru da API', async () => {
    const { classificarErro } = await importarSessao()

    const mensagemCrua = 'internal error at projects/12345/locations/us-central1, trace-id=abcxyz'
    const erro = classificarErro(new Error(mensagemCrua))

    expect(erro.message).not.toContain('trace-id')
    expect(erro.message).not.toContain('12345')
  })
})
