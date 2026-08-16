import 'dotenv/config'
import type { SharedConfig } from '@bots/shared'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`)
  return value
}

function int(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) throw new Error(`Variável ${name} não é um número: ${raw}`)
  return parsed
}

function list(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const config = {
  database: {
    url: required('DATABASE_URL'),
    schema: process.env.DATABASE_SCHEMA || 'icarus',
  },
  voz: {
    /** Palavra de ativação, minúscula e sem acento. */
    wakeWord: (process.env.WAKE_WORD || 'cubo').toLowerCase(),
    /** Janela de áudio que o detector examina, em ms. */
    wakeBufferMs: int('WAKE_BUFFER_MS', 3_000),
    /**
     * Silêncio que encerra o modo conversa DEPOIS de ele já estar falando com alguém.
     * Generoso de propósito: pausa de dez, quinze segundos é normal entre humanos, e
     * fechar antes disso faz a resposta seguinte ser gerada e descartada.
     */
    sessaoSilencioMs: int('SESSAO_SILENCIO_MS', 35_000),
  },
  conversa: {
    /** Falas seguidas sem resposta do bot antes de encerrar a sessão. */
    maxTurnosSemResposta: int('MAX_TURNOS_SEM_RESPOSTA', 2),
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || null,
    // preview: pode mudar ou sumir sem aviso, por isso vive em env
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-native-audio-latest',
    voz: process.env.GEMINI_VOICE || 'Puck',
    idioma: process.env.GEMINI_LANGUAGE || 'pt-BR',
  },
  ducking: {
    /** URL do endpoint de ducking do DJ. Vazio desliga o ducking. */
    djUrl: process.env.DJ_DUCKING_URL || null,
    volumeAoFalar: Number(process.env.DUCKING_VOLUME || '0.25'),
  },
  tts: {
    /** Binário do piper. Vazio desliga a aba local do laboratório. */
    piperBin: process.env.PIPER_BIN || null,
    piperVozesDir: process.env.PIPER_VOZES_DIR || null,
    geminiModelo: process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
  },
  painel: {
    /** Porta do painel de diagnóstico. 0 desliga. */
    porta: int('PAINEL_PORT', 8790),
  },
  memoria: {
    /** Caminho do binário do whisper.cpp; vazio desliga a transcrição de ambiente. */
    whisperBin: process.env.WHISPER_BIN || null,
    /** Modelo rápido, para a palavra de ativação: precisa responder em ~1s. */
    whisperModelWake: process.env.WHISPER_MODEL_WAKE || null,
    /** Modelo mais preciso, para a memória: pode atrasar minutos. */
    whisperModelMemoria: process.env.WHISPER_MODEL_MEMORIA || null,
    /** Threads do whisper por processo. */
    whisperThreads: int('WHISPER_THREADS', 2),
    /** Quantos trechos transcrevem ao mesmo tempo. */
    concorrencia: int('TRANSCRICAO_CONCORRENCIA', 3),
    /** Tamanho do trecho, em palavras, para gerar embedding. */
    tamanhoTrecho: int('TAMANHO_TRECHO', 150),
  },
}

export function buildSharedConfig(): SharedConfig {
  return {
    discord: {
      token: required('DISCORD_TOKEN'),
      clientId: required('CLIENT_ID'),
      guildIds: list('GUILD_IDS'),
      registerGlobal: process.env.REGISTER_GLOBAL === 'true',
    },
    library: {
      driveRemote: process.env.DRIVE_REMOTE || 'gdrive:icarus-music',
      cacheDir: process.env.MUSIC_CACHE_DIR || './music-cache',
      rcloneConfigPath: process.env.RCLONE_CONFIG_PATH || null,
      cookiesFile: process.env.COOKIES_FILE || null,
    },
    ytdlp: {
      maxDurationSec: int('MAX_DURATION_SEC', 1200),
      playerClients: process.env.PLAYER_CLIENTS || 'web,mweb,tv',
      potProviderUrl: process.env.POT_PROVIDER_URL || null,
    },
    player: {
      idleTimeoutMs: int('IDLE_TIMEOUT_MS', 120_000),
      maxQueue: int('MAX_QUEUE', 200),
      downloadCooldownMs: int('DOWNLOAD_COOLDOWN_MS', 5_000),
    },
    logPrefix: '[icarus]',
  }
}
