import { VoiceManager } from '@bots/shared'
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http'

interface DuckingBody {
  guildId: string
  volume: number
}

function isDuckingBody(value: unknown): value is DuckingBody {
  if (!value || typeof value !== 'object') return false
  const body = value as Record<string, unknown>
  return typeof body.guildId === 'string' && body.guildId.length > 0 && typeof body.volume === 'number' && Number.isFinite(body.volume)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(payload)
}

async function handleDucking(req: IncomingMessage, res: ServerResponse, voice: VoiceManager): Promise<void> {
  let parsed: unknown
  try {
    const raw = await readBody(req)
    parsed = JSON.parse(raw)
  } catch {
    sendJson(res, 400, { ok: false, error: 'corpo não é um JSON válido' })
    return
  }

  if (!isDuckingBody(parsed)) {
    sendJson(res, 400, { ok: false, error: 'corpo precisa ter guildId (string) e volume (number)' })
    return
  }

  const aplicado = voice.definirVolume(parsed.guildId, parsed.volume)
  if (!aplicado) {
    sendJson(res, 404, { ok: false, error: 'guild não está tocando nada' })
    return
  }

  sendJson(res, 200, { ok: true })
}

// Sem autenticação, de propósito: essa porta só existe dentro da rede Docker interna
// `data`, nunca publicada no host (sem `ports:` no docker-compose). Se um dia alguém
// publicar essa porta pro host, isso vira um buraco aberto — precisa autenticação antes.
export function iniciarDuckingServer(voice: VoiceManager, porta: number): Server {
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && req.url === '/ducking') {
      void handleDucking(req, res, voice)
      return
    }

    sendJson(res, 404, { ok: false, error: 'rota não encontrada' })
  })

  server.listen(porta, '0.0.0.0')

  return server
}
