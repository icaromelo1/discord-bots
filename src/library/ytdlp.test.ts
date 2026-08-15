import { describe, it, expect } from 'vitest'
import { extractYoutubeId, extractPlaylistId, translateError, YtDlpError } from './ytdlp'

describe('extractYoutubeId', () => {
  it('aceita um id cru de 11 caracteres', () => {
    expect(extractYoutubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('aceita url no formato youtu.be', () => {
    expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('aceita url no formato youtube.com/watch?v=', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('aceita url no formato youtube.com/shorts/', () => {
    expect(extractYoutubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('aceita url no formato youtube.com/embed/', () => {
    expect(extractYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('aceita url youtu.be com query extra depois do id', () => {
    expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ?si=abc123')).toBe('dQw4w9WgXcQ')
  })

  it('aceita url watch?v= com parâmetro de tempo depois do id', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toBe('dQw4w9WgXcQ')
  })

  it('aceita url shorts com query extra depois do id', () => {
    expect(extractYoutubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share')).toBe('dQw4w9WgXcQ')
  })

  it('aceita url embed com query extra depois do id', () => {
    expect(extractYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ?start=10')).toBe('dQw4w9WgXcQ')
  })

  it('rejeita string vazia', () => {
    expect(() => extractYoutubeId('')).toThrow(YtDlpError)
  })

  it('rejeita url de outro site', () => {
    expect(() => extractYoutubeId('https://vimeo.com/dQw4w9WgXcQ')).toThrow(YtDlpError)
  })

  it('rejeita id com 10 caracteres', () => {
    expect(() => extractYoutubeId('dQw4w9WgXc')).toThrow(YtDlpError)
  })

  it('rejeita id com 12 caracteres', () => {
    expect(() => extractYoutubeId('dQw4w9WgXcQQ')).toThrow(YtDlpError)
  })

  it('rejeita texto solto sem relação com uma url ou id', () => {
    expect(() => extractYoutubeId('minha musica favorita')).toThrow(YtDlpError)
  })

  it('lança YtDlpError com kind link-invalido para entrada inválida', () => {
    try {
      extractYoutubeId('texto invalido')
      expect.fail('deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(YtDlpError)
      expect((error as YtDlpError).kind).toBe('link-invalido')
    }
  })
})

describe('extractPlaylistId', () => {
  it('extrai o id de uma url watch?v= com list=', () => {
    expect(extractPlaylistId('https://www.youtube.com/watch?v=abc12345678&list=PLxxxx')).toBe('PLxxxx')
  })

  it('extrai o id de uma url playlist?list=', () => {
    expect(extractPlaylistId('https://www.youtube.com/playlist?list=PLxxxx')).toBe('PLxxxx')
  })

  it('devolve null para list=RD (rádio automático do YouTube)', () => {
    expect(extractPlaylistId('https://www.youtube.com/watch?v=abc12345678&list=RDxxxx')).toBeNull()
  })

  it('devolve null quando a url não tem list=', () => {
    expect(extractPlaylistId('https://www.youtube.com/watch?v=abc12345678')).toBeNull()
  })

  it('devolve null para string vazia', () => {
    expect(extractPlaylistId('')).toBeNull()
  })

  it('devolve null para texto solto', () => {
    expect(extractPlaylistId('minha musica favorita')).toBeNull()
  })

  it('devolve null para url de outro site', () => {
    expect(extractPlaylistId('https://vimeo.com/playlist?list=PLxxxx')).toBeNull()
  })

  it('extrai o id quando list= está no meio de outros parâmetros', () => {
    expect(
      extractPlaylistId('https://www.youtube.com/watch?v=abc12345678&foo=bar&list=PLxxxx&baz=1'),
    ).toBe('PLxxxx')
  })
})

describe('translateError', () => {
  it('mapeia mensagem de bloqueio anti-bot para kind anti-bot', () => {
    const error = translateError('ERROR: Sign in to confirm you are not a bot')
    expect(error.kind).toBe('anti-bot')
  })

  it('mapeia formato indisponível para kind formato', () => {
    const error = translateError('ERROR: Requested format is not available')
    expect(error.kind).toBe('formato')
  })

  it('mapeia apenas imagens disponíveis para kind formato', () => {
    const error = translateError('ERROR: Only images are available for this video')
    expect(error.kind).toBe('formato')
  })

  it('mapeia vídeo indisponível para kind indisponivel', () => {
    const error = translateError('ERROR: Video unavailable')
    expect(error.kind).toBe('indisponivel')
  })

  it('mapeia vídeo privado para kind indisponivel', () => {
    const error = translateError('ERROR: Private video')
    expect(error.kind).toBe('indisponivel')
  })

  it('mapeia vídeo somente para membros para kind indisponivel', () => {
    const error = translateError('ERROR: This video is members-only content')
    expect(error.kind).toBe('indisponivel')
  })

  it('mapeia url não suportada para kind link-invalido', () => {
    const error = translateError('ERROR: Unsupported URL: https://example.com')
    expect(error.kind).toBe('link-invalido')
  })

  it('mapeia url inválida para kind link-invalido', () => {
    const error = translateError('ERROR: is not a valid URL')
    expect(error.kind).toBe('link-invalido')
  })

  it('cai em desconhecido para mensagem não reconhecida', () => {
    const error = translateError('ERROR: something completely unexpected happened')
    expect(error.kind).toBe('desconhecido')
  })

  it('nunca vaza o texto original do stderr na mensagem traduzida', () => {
    const stderrSamples = [
      'ERROR: Sign in to confirm you are not a bot, техническая ошибка XYZ123',
      'ERROR: Requested format is not available, code AB99',
      'ERROR: Video unavailable, reason CODE_777',
      'ERROR: is not a valid URL, raw input: ftp://weird-string',
      'ERROR: totally custom internal detail QWERTY42',
    ]

    for (const stderr of stderrSamples) {
      const error = translateError(stderr)
      expect(error.message).not.toContain(stderr)
      expect(stderr).not.toContain(error.message)
    }
  })
})

describe('extractPlaylistId — link colado sem esquema', () => {
  it('aceita URL sem https://, como o extractYoutubeId já aceita', () => {
    expect(extractPlaylistId('youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdef')).toBe('PLabcdef')
  })

  it('continua rejeitando texto solto que não é URL', () => {
    expect(extractPlaylistId('summertime list=PL123')).toBeNull()
  })
})
