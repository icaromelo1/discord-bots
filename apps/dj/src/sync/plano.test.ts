import { describe, expect, it } from 'vitest'
import { pendentesDeDownload, playlistsParaSincronizar, playlistUrl } from './plano'

describe('playlistsParaSincronizar', () => {
  it('inclui as músicas curtidas mesmo sem aparecer na conta', () => {
    expect(playlistsParaSincronizar([], []).map((p) => p.id)).toEqual(['LM'])
  })

  it('descarta assistir mais tarde, vídeos curtidos e mixes', () => {
    const daConta = [
      { id: 'WL', titulo: 'Watch later' },
      { id: 'LL', titulo: 'Liked videos' },
      { id: 'RDPq8lfWGPqAk', titulo: 'Mix - qualquer' },
      { id: 'PLabc', titulo: 'Pey' },
    ]
    expect(playlistsParaSincronizar(daConta, []).map((p) => p.id)).toEqual(['LM', 'PLabc'])
  })

  it('respeita a lista extra de ignoradas', () => {
    const daConta = [
      { id: 'PLabc', titulo: 'Pey' },
      { id: 'PLdef', titulo: 'Curiosidades' },
    ]
    expect(playlistsParaSincronizar(daConta, ['PLdef']).map((p) => p.id)).toEqual(['LM', 'PLabc'])
  })

  it('não repete a mesma playlist', () => {
    const daConta = [
      { id: 'LM', titulo: 'Liked Music' },
      { id: 'PLabc', titulo: 'Pey' },
      { id: 'PLabc', titulo: 'Pey' },
    ]
    expect(playlistsParaSincronizar(daConta, []).map((p) => p.id)).toEqual(['LM', 'PLabc'])
  })
})

describe('playlistUrl', () => {
  it('usa o domínio do YouTube Music para as curtidas', () => {
    expect(playlistUrl('LM')).toBe('https://music.youtube.com/playlist?list=LM')
  })

  it('usa a url comum de playlist para o resto', () => {
    expect(playlistUrl('PLabc')).toBe('https://www.youtube.com/playlist?list=PLabc')
  })
})

describe('pendentesDeDownload', () => {
  it('pula o que já está no acervo e as falhas definitivas', () => {
    const pendentes = pendentesDeDownload(['a', 'b', 'c', 'd'], new Set(['b']), new Set(['c']), 10)
    expect(pendentes).toEqual(['a', 'd'])
  })

  it('não repete faixa presente em mais de uma playlist', () => {
    expect(pendentesDeDownload(['a', 'b', 'a'], new Set(), new Set(), 10)).toEqual(['a', 'b'])
  })

  it('corta no limite por execução mantendo a ordem', () => {
    expect(pendentesDeDownload(['a', 'b', 'c'], new Set(), new Set(), 2)).toEqual(['a', 'b'])
  })
})
