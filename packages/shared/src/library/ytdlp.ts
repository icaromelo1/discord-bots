import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getSharedConfig, logPrefix } from '../config'

const execFile = promisify(execFileCallback)

const EXEC_OPTIONS = {
  maxBuffer: 10 * 1024 * 1024,
  timeout: 5 * 60 * 1000,
}

export interface YtDlpInfo {
  title: string
  durationSec: number
}

export class YtDlpError extends Error {
  constructor(
    message: string,
    readonly kind: 'anti-bot' | 'indisponivel' | 'formato' | 'link-invalido' | 'muito-longo' | 'live' | 'desconhecido',
  ) {
    super(message)
    this.name = 'YtDlpError'
  }
}

const YOUTUBE_ID_REGEX = /^[\w-]{11}$/

const URL_PATTERNS: RegExp[] = [
  /(?:youtu\.be\/)([\w-]{11})/,
  /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
  /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  /(?:youtube\.com\/embed\/)([\w-]{11})/,
]

export function extractYoutubeId(input: string): string {
  const trimmed = input.trim()

  if (YOUTUBE_ID_REGEX.test(trimmed)) return trimmed

  for (const pattern of URL_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match) return match[1]
  }

  throw new YtDlpError('Link do YouTube inválido.', 'link-invalido')
}

export function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim()

  let url: URL
  try {
    // extractYoutubeId aceita link sem esquema (usa regex); sem isto, colar
    // "youtube.com/watch?v=x&list=PL..." cairia calado no caminho de faixa única
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname)) return null

  const listId = url.searchParams.get('list')
  if (!listId) return null

  // list=RD... é o mix/rádio automático do YouTube — uma lista infinita gerada por
  // eles, não uma playlist de verdade; o bot trata esse caso como faixa única
  if (listId.startsWith('RD')) return null

  return listId
}

function formatDuration(durationSec: number): string {
  const hours = Math.floor(durationSec / 3600)
  const minutes = Math.floor((durationSec % 3600) / 60)

  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, '0')}min`
  }
  return `${minutes}min`
}

// O yt-dlp REESCREVE o arquivo de cookies ao terminar. O arquivo de origem é
// compartilhado com outro serviço e montado read-only, então trabalhamos sobre uma
// cópia descartável: sem isso o yt-dlp aborta com "Read-only file system" depois de
// já ter baixado, e escrever no original faria dois serviços disputarem o mesmo
// credencial.
function prepareCookies(): string | null {
  const source = getSharedConfig().library.cookiesFile
  if (!source) return null

  try {
    if (fs.statSync(source).size === 0) return null
  } catch {
    return null
  }

  const runtimeCopy = path.join(getSharedConfig().library.cacheDir, '.cookies-runtime.txt')
  try {
    fs.mkdirSync(path.dirname(runtimeCopy), { recursive: true })
    fs.copyFileSync(source, runtimeCopy)
    return runtimeCopy
  } catch {
    return null
  }
}

function cookieArgs(): string[] {
  const cookiesFile = prepareCookies()
  return cookiesFile ? ['--cookies', cookiesFile] : []
}

function potArgs(): string[] {
  const potProviderUrl = getSharedConfig().ytdlp.potProviderUrl
  if (!potProviderUrl) return []

  return [
    '--extractor-args',
    `youtube:player_client=${getSharedConfig().ytdlp.playerClients}`,
    '--extractor-args',
    `youtubepot-bgutilhttp:base_url=${potProviderUrl}`,
  ]
}

export function translateError(message: string): YtDlpError {
  // o stderr bruto do yt-dlp só existe aqui; sem registrar, toda falha vira a
  // mensagem amigável e não há como diagnosticar pelo log do container
  console.error(`${logPrefix()} yt-dlp falhou:`, message.slice(0, 2000))

  if (/Sign in to confirm/i.test(message)) {
    return new YtDlpError(
      'O YouTube bloqueou o download deste servidor. Os cookies precisam ser renovados.',
      'anti-bot',
    )
  }
  if (/Requested format is not available|Only images are available/i.test(message)) {
    return new YtDlpError(
      'O YouTube não liberou o áudio deste vídeo agora. Tente de novo em alguns minutos.',
      'formato',
    )
  }
  if (/Video unavailable|Private video|members-only/i.test(message)) {
    return new YtDlpError('Esse vídeo não está disponível publicamente.', 'indisponivel')
  }
  if (/is not a valid URL|Unsupported URL/i.test(message)) {
    return new YtDlpError('Link do YouTube inválido.', 'link-invalido')
  }
  return new YtDlpError('Não deu pra baixar o áudio agora. Tente de novo em alguns minutos.', 'desconhecido')
}

export interface SearchResult {
  youtubeId: string
  title: string
  channel: string
  durationSec: number
}

export async function searchYoutube(termo: string, limite = 5): Promise<SearchResult[]> {
  const termoLimpo = termo.trim()
  if (!termoLimpo) return []

  // --flat-playlist evita resolver cada vídeo individualmente: a busca precisa ser
  // rápida porque acontece antes de a pessoa escolher, e nada é baixado ainda.
  const args = [
    '-J',
    '--flat-playlist',
    '--no-warnings',
    ...cookieArgs(),
    ...potArgs(),
    // pede a mais porque lives e vídeos longos demais são descartados abaixo;
    // sem folga uma busca comum devolveria menos de 5 opções
    `ytsearch${limite + 3}:${termoLimpo}`,
  ]

  let stdout: string
  try {
    const result = await execFile('yt-dlp', args, EXEC_OPTIONS)
    stdout = result.stdout
  } catch (error) {
    const stderr =
      error instanceof Error && 'stderr' in error ? String((error as { stderr: unknown }).stderr) : String(error)
    throw translateError(stderr)
  }

  const data = JSON.parse(stdout) as {
    entries?: { id?: string; title?: string; channel?: string; uploader?: string; duration?: number; live_status?: string }[]
  }

  return (data.entries ?? [])
    .filter((entry) => entry.id && YOUTUBE_ID_REGEX.test(entry.id) && entry.title)
    .filter((entry) => entry.live_status !== 'is_live')
    // não oferecer o que seria recusado na hora de tocar: busca por termo comum traz
    // mixes de várias horas, e escolher um deles só devolveria erro
    .filter((entry) => !entry.duration || entry.duration <= getSharedConfig().ytdlp.maxDurationSec)
    .map((entry) => ({
      youtubeId: entry.id as string,
      title: entry.title as string,
      channel: entry.channel ?? entry.uploader ?? '',
      durationSec: Math.floor(entry.duration ?? 0),
    }))
    .slice(0, limite)
}

export interface PlaylistInfo {
  titulo: string
  entradas: { youtubeId: string; title: string; durationSec: number }[]
}

export async function listPlaylist(url: string): Promise<PlaylistInfo> {
  const args = ['-J', '--flat-playlist', '--no-warnings', ...cookieArgs(), ...potArgs(), url]

  let stdout: string
  try {
    const result = await execFile('yt-dlp', args, EXEC_OPTIONS)
    stdout = result.stdout
  } catch (error) {
    const stderr =
      error instanceof Error && 'stderr' in error ? String((error as { stderr: unknown }).stderr) : String(error)
    throw translateError(stderr)
  }

  const data = JSON.parse(stdout) as {
    title?: string
    entries?: { id?: string; title?: string; duration?: number; live_status?: string }[]
  }

  const entradas = (data.entries ?? [])
    .filter((entry) => entry.id && YOUTUBE_ID_REGEX.test(entry.id) && entry.title)
    .filter((entry) => entry.live_status !== 'is_live')
    .filter((entry) => !entry.duration || entry.duration <= getSharedConfig().ytdlp.maxDurationSec)
    .map((entry) => ({
      youtubeId: entry.id as string,
      title: entry.title as string,
      durationSec: Math.floor(entry.duration ?? 0),
    }))

  return {
    titulo: data.title ?? '',
    entradas,
  }
}

export async function fetchInfo(youtubeId: string): Promise<YtDlpInfo> {
  if (!YOUTUBE_ID_REGEX.test(youtubeId)) {
    throw new YtDlpError('Link do YouTube inválido.', 'link-invalido')
  }

  const url = `https://www.youtube.com/watch?v=${youtubeId}`
  const args = ['-j', '--no-playlist', ...cookieArgs(), ...potArgs(), url]

  let stdout: string
  try {
    const result = await execFile('yt-dlp', args, EXEC_OPTIONS)
    stdout = result.stdout
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String((error as { stderr: unknown }).stderr) : String(error)
    throw translateError(stderr)
  }

  const data = JSON.parse(stdout) as { is_live?: boolean; duration?: number; title?: string }

  if (data.is_live) {
    throw new YtDlpError('Não dá pra tocar uma live.', 'live')
  }

  if (!data.duration) {
    throw new YtDlpError('Não deu pra identificar a duração deste vídeo.', 'desconhecido')
  }

  if (data.duration > getSharedConfig().ytdlp.maxDurationSec) {
    throw new YtDlpError(
      `Esse vídeo tem ${formatDuration(data.duration)} — passa do limite de ${formatDuration(getSharedConfig().ytdlp.maxDurationSec)}.`,
      'muito-longo',
    )
  }

  return {
    title: data.title || youtubeId,
    durationSec: data.duration,
  }
}

export async function downloadAudio(youtubeId: string, destDir: string): Promise<string> {
  if (!YOUTUBE_ID_REGEX.test(youtubeId)) {
    throw new YtDlpError('Link do YouTube inválido.', 'link-invalido')
  }

  const url = `https://www.youtube.com/watch?v=${youtubeId}`
  const output = path.join(destDir, `${youtubeId}.%(ext)s`)
  const args = [
    '-x',
    '--audio-format',
    'mp3',
    '--no-playlist',
    ...cookieArgs(),
    ...potArgs(),
    '-o',
    output,
    url,
  ]

  try {
    await execFile('yt-dlp', args, EXEC_OPTIONS)
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String((error as { stderr: unknown }).stderr) : String(error)
    throw translateError(stderr)
  }

  return path.join(destDir, `${youtubeId}.mp3`)
}
