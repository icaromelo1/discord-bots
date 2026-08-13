import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { config } from '../config'

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

function formatDuration(durationSec: number): string {
  const hours = Math.floor(durationSec / 3600)
  const minutes = Math.floor((durationSec % 3600) / 60)

  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, '0')}min`
  }
  return `${minutes}min`
}

function cookieArgs(): string[] {
  const cookiesFile = config.library.cookiesFile
  if (!cookiesFile) return []

  try {
    const stats = fs.statSync(cookiesFile)
    if (stats.size === 0) return []
  } catch {
    return []
  }

  return ['--cookies', cookiesFile]
}

function potArgs(): string[] {
  const potProviderUrl = config.ytdlp.potProviderUrl
  if (!potProviderUrl) return []

  return [
    '--extractor-args',
    `youtube:player_client=${config.ytdlp.playerClients}`,
    '--extractor-args',
    `youtubepot-bgutilhttp:base_url=${potProviderUrl}`,
  ]
}

export function translateError(message: string): YtDlpError {
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

  if (data.duration > config.ytdlp.maxDurationSec) {
    throw new YtDlpError(
      `Esse vídeo tem ${formatDuration(data.duration)} — passa do limite de ${formatDuration(config.ytdlp.maxDurationSec)}.`,
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
