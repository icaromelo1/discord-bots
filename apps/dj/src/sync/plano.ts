import type { AccountPlaylist } from '@bots/shared'

/** "Músicas curtidas" do YouTube Music: não aparece em feed/playlists, entra sempre. */
export const MUSICAS_CURTIDAS: AccountPlaylist = { id: 'LM', titulo: 'Músicas curtidas' }

// WL (assistir mais tarde) e LL (vídeos curtidos) são do YouTube, não de música —
// LL mistura qualquer vídeo que recebeu like. As músicas curtidas de verdade vêm
// por LM.
const IGNORADAS_PADRAO = ['WL', 'LL']

export function playlistsParaSincronizar(daConta: AccountPlaylist[], ignorar: string[]): AccountPlaylist[] {
  const ignoradas = new Set([...IGNORADAS_PADRAO, ...ignorar])
  const vistas = new Set<string>()

  return [MUSICAS_CURTIDAS, ...daConta].filter((playlist) => {
    if (ignoradas.has(playlist.id) || vistas.has(playlist.id)) return false
    // RD... é mix/rádio salvo: lista gerada pelo YouTube que muda a cada abertura,
    // não uma seleção da pessoa
    if (playlist.id.startsWith('RD')) return false
    vistas.add(playlist.id)
    return true
  })
}

export function playlistUrl(id: string): string {
  return id === MUSICAS_CURTIDAS.id
    ? 'https://music.youtube.com/playlist?list=LM'
    : `https://www.youtube.com/playlist?list=${id}`
}

/**
 * Ids que ainda precisam ser baixados, na ordem em que aparecem nas playlists,
 * sem repetir, pulando o que já está no acervo e o que falhou de forma definitiva.
 */
export function pendentesDeDownload(
  ordemNasPlaylists: string[],
  noAcervo: Set<string>,
  falhasDefinitivas: Set<string>,
  limite: number,
): string[] {
  const pendentes: string[] = []
  const vistos = new Set<string>()

  for (const youtubeId of ordemNasPlaylists) {
    if (pendentes.length >= limite) break
    if (vistos.has(youtubeId)) continue
    vistos.add(youtubeId)
    if (noAcervo.has(youtubeId) || falhasDefinitivas.has(youtubeId)) continue
    pendentes.push(youtubeId)
  }

  return pendentes
}
