import { createServer, type Server } from 'node:http'
import { PAGINA } from './pagina'
import { LABORATORIO } from './laboratorio'
import { registro } from './registro'
import { pcmParaWav, sintetizarGemini, VOZES_GEMINI } from '../voz/gemini-tts'
import { sintetizarPiper, vozesDisponiveis } from '../voz/piper'

async function corpoJson(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  const partes: Buffer[] = []
  for await (const parte of req) partes.push(parte as Buffer)
  const bruto = Buffer.concat(partes).toString('utf8')
  return bruto ? (JSON.parse(bruto) as Record<string, unknown>) : {}
}

export interface EstadoDoPainel {
  naCall: boolean
  canal: string
  sessao: string
  wakeWord: string
  fila: number
}

/**
 * Painel de diagnóstico: mostra o que o bot ouviu, o que entendeu e se a palavra de
 * ativação casou.
 *
 * SEM AUTENTICAÇÃO de propósito — a porta é publicada apenas em 127.0.0.1 na VM, e o
 * acesso é por túnel SSH. Se um dia esta porta for exposta na internet, isto vira um
 * vazamento de conversa privada: o painel mostra transcrição de tudo que foi falado.
 */
export function iniciarPainel(porta: number, estado: () => EstadoDoPainel): Server {
  const servidor = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (url.pathname === '/api/eventos') {
      const desde = Number(url.searchParams.get('desde') ?? '0')
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ estado: estado(), eventos: registro.recentes(desde || undefined) }))
      return
    }

    if (url.pathname === '/laboratorio') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(LABORATORIO)
      return
    }

    if (url.pathname === '/api/voz/piper/vozes') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ vozes: vozesDisponiveis().map(({ id, rotulo }) => ({ id, rotulo })) }))
      return
    }

    if (url.pathname === '/api/voz/gemini/vozes') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ vozes: VOZES_GEMINI }))
      return
    }

    if (url.pathname === '/api/voz/sintetizar' && req.method === 'POST') {
      void (async () => {
        try {
          const corpo = await corpoJson(req)
          const texto = String(corpo.texto ?? '').trim()
          if (!texto) throw new Error('Texto vazio.')

          const opcoes = (corpo.opcoes ?? {}) as Record<string, never>
          const wav =
            corpo.motor === 'gemini'
              ? await sintetizarGemini(texto, opcoes).then((a) => pcmParaWav(a.pcm, a.taxaHz))
              : await sintetizarPiper(texto, opcoes)

          res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length })
          res.end(wav)
        } catch (erro) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ erro: erro instanceof Error ? erro.message : String(erro) }))
        }
      })()
      return
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGINA)
      return
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('não encontrado')
  })

  servidor.listen(porta, '0.0.0.0')
  return servidor
}
