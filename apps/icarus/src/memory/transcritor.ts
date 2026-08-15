import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'

const execFile = promisify(execFileCallback)

const EXEC_OPTIONS = {
  maxBuffer: 10 * 1024 * 1024,
  timeout: 5 * 60 * 1000,
}

const SAMPLE_RATE = 16_000
const CHANNELS = 1
const BITS_POR_SAMPLE = 16
const BYTES_POR_SAMPLE = 2


/** Duração mínima de áudio que vale transcrever, em ms. */
const DURACAO_MINIMA_MS = 400
/** Energia média mínima (RMS) para considerar que houve fala. */
const RMS_MINIMO = 180

/**
 * Porta de energia antes de chamar o Whisper. Sem ela, todo respiro e todo clique de
 * microfone vira uma chamada ao modelo — que responde com alucinação em vez de silêncio.
 */
export function temFala(pcm16k: Buffer): boolean {
  const amostras = Math.floor(pcm16k.length / 2)
  if (amostras < (DURACAO_MINIMA_MS * 16000) / 1000) return false

  let soma = 0
  for (let i = 0; i + 1 < pcm16k.length; i += 2) {
    const v = pcm16k.readInt16LE(i)
    soma += v * v
  }
  return Math.sqrt(soma / amostras) >= RMS_MINIMO
}

// O Whisper produz estes rótulos quando não há fala reconhecível. As flags do binário
// reduzem muito, mas não eliminam — então filtramos o que passar.
const ALUCINACOES = [
  /^[[(\u3010][^\])\u3011]*[\])\u3011]$/,
  /legendas?\s+(pela|por)/i,
  /amara\.org/i,
  /^[\s\-–—]*(obrigad[oa]|tchau|bye|thank you)[.!\s]*$/i,
  /^[.,!?\-\s]*$/,
]

/** Descarta transcrição que o modelo inventou a partir de ruído. */
export function ehAlucinacao(texto: string): boolean {
  const limpo = texto.trim()
  if (limpo.length === 0) return true
  return ALUCINACOES.some((padrao) => padrao.test(limpo))
}

export interface Transcritor {
  disponivel(): boolean
  transcrever(pcm16k: Buffer): Promise<string>
}

function escreverWav(pcm16k: Buffer): Buffer {
  const byteRate = SAMPLE_RATE * CHANNELS * BYTES_POR_SAMPLE
  const blockAlign = CHANNELS * BYTES_POR_SAMPLE
  const header = Buffer.alloc(44)

  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcm16k.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(CHANNELS, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(BITS_POR_SAMPLE, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm16k.length, 40)

  return Buffer.concat([header, pcm16k])
}

export class WhisperCppTranscritor implements Transcritor {
  constructor(
    private readonly binPath: string | null,
    private readonly modelPath: string | null,
  ) {}

  disponivel(): boolean {
    if (!this.binPath || !this.modelPath) return false
    return fs.existsSync(this.binPath) && fs.existsSync(this.modelPath)
  }

  async transcrever(pcm16k: Buffer): Promise<string> {
    if (!this.disponivel()) return ''
    if (!temFala(pcm16k)) return ''

    const wavPath = path.join(os.tmpdir(), `icarus-whisper-${randomUUID()}.wav`)
    fs.writeFileSync(wavPath, escreverWav(pcm16k))

    try {
      const { stdout } = await execFile(
        this.binPath as string,
        [
          '-m',
          this.modelPath as string,
          '-f',
          wavPath,
          '-nt',
          '-otxt',
          '-of',
          wavPath,
          '-l',
          'pt',
          // sem estas duas o modelo inventa rótulo de não-fala ("[MÚSICA DE FUNDO]",
          // "Legendas pela comunidade Amara.org") quando recebe ruído ou silêncio —
          // isso envenena a memória e atrapalha a palavra de ativação
          '--suppress-nst',
          '--no-speech-thold',
          '0.6',
        ],
        EXEC_OPTIONS,
      )

      const txtPath = `${wavPath}.txt`
      if (fs.existsSync(txtPath)) {
        try {
          const texto = fs.readFileSync(txtPath, 'utf-8').trim()
          return ehAlucinacao(texto) ? '' : texto
        } finally {
          fs.unlinkSync(txtPath)
        }
      }

      const saida = stdout.trim()
      return ehAlucinacao(saida) ? '' : saida
    } finally {
      fs.unlinkSync(wavPath)
    }
  }
}

/** Transcritor que não faz nada — usado quando o Whisper não está configurado. */
export class TranscritorDesligado implements Transcritor {
  disponivel(): boolean {
    return false
  }

  async transcrever(): Promise<string> {
    return ''
  }
}
