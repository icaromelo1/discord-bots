import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from '../config'

const TIMEOUT_MS = 60_000

export interface VozPiper {
  id: string
  arquivo: string
  rotulo: string
}

/**
 * Síntese local. Medido no Mac ARM: 5,3s de fala em 0,62s (0,12x tempo real), o que
 * torna a latência de fala desprezível perto do tempo de pensar do modelo.
 */
export function vozesDisponiveis(): VozPiper[] {
  const dir = config.tts.piperVozesDir
  if (!dir || !fs.existsSync(dir)) return []

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.onnx'))
    .map((f) => ({
      id: f.replace(/\.onnx$/, ''),
      arquivo: path.join(dir, f),
      rotulo: f.replace(/\.onnx$/, '').replace(/^pt_BR-/, ''),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function piperDisponivel(): boolean {
  return Boolean(config.tts.piperBin && fs.existsSync(config.tts.piperBin) && vozesDisponiveis().length > 0)
}

export interface OpcoesPiper {
  voz?: string
  /** Fator de duração: acima de 1 fala mais devagar. */
  velocidade?: number
  /** Silêncio entre frases, em segundos. */
  pausaFrase?: number
}

/** Sintetiza e devolve um WAV. */
export async function sintetizarPiper(texto: string, opcoes: OpcoesPiper = {}): Promise<Buffer> {
  if (!config.tts.piperBin) throw new Error('PIPER_BIN não configurado')

  const vozes = vozesDisponiveis()
  if (vozes.length === 0) throw new Error('Nenhuma voz encontrada em PIPER_VOZES_DIR')

  const escolhida = vozes.find((v) => v.id === opcoes.voz) ?? vozes[0]
  const saida = path.join(os.tmpdir(), `icarus-piper-${randomUUID()}.wav`)

  const args = ['-m', escolhida.arquivo, '-f', saida]
  // length_scale acima de 1 alonga as sílabas; o piper chama isso de "length scale",
  // mas na prática é o inverso da velocidade
  if (opcoes.velocidade) args.push('--length-scale', String(1 / opcoes.velocidade))
  if (opcoes.pausaFrase !== undefined) args.push('--sentence-silence', String(opcoes.pausaFrase))

  try {
    // spawn e não execFile: a versão promisificada de execFile IGNORA a opção `input`,
    // então o piper ficava esperando um texto que nunca chegava e morria no timeout.
    await new Promise<void>((resolver, rejeitar) => {
      const processo = spawn(config.tts.piperBin as string, args, { stdio: ['pipe', 'ignore', 'pipe'] })
      let erro = ''
      const relogio = setTimeout(() => {
        processo.kill('SIGKILL')
        rejeitar(new Error('piper demorou demais'))
      }, TIMEOUT_MS)

      processo.stderr.on('data', (d: Buffer) => { erro += d.toString() })
      processo.on('error', (e) => { clearTimeout(relogio); rejeitar(e) })
      processo.on('close', (codigo) => {
        clearTimeout(relogio)
        if (codigo === 0) resolver()
        else rejeitar(new Error(`piper saiu com código ${codigo}: ${erro.slice(0, 300)}`))
      })

      processo.stdin.write(texto)
      processo.stdin.end()
    })

    return fs.readFileSync(saida)
  } finally {
    if (fs.existsSync(saida)) fs.unlinkSync(saida)
  }
}
