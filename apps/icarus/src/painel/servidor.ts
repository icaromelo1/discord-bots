import { createServer, type Server } from 'node:http'
import { PAGINA } from './pagina'
import { LABORATORIO } from './laboratorio'
import { registro } from './registro'
import { instalarChamada } from './chamada'
import { pcmParaWav, sintetizarGemini, VOZES_GEMINI } from '../voz/gemini-tts'
import { sintetizarPiper, vozesDisponiveis } from '../voz/piper'
import { sintetizarViaLive } from '../voz/live-tts'

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

          let wav: Buffer
          const extras: Record<string, string> = {}

          if (corpo.motor === 'gemini') {
            const audio = await sintetizarGemini(texto, opcoes)
            wav = pcmParaWav(audio.pcm, audio.taxaHz)
          } else if (corpo.motor === 'stream') {
            const resposta = await sintetizarViaLive(texto, opcoes)
            if (resposta.pcm.length === 0) throw new Error('a sessão não devolveu áudio')
            wav = pcmParaWav(resposta.pcm, resposta.taxaHz)
            // a Live API RESPONDE ao texto em vez de apenas lê-lo: o que ele disse e a
            // latência até o primeiro som vão nos cabeçalhos para o painel exibir
            extras['x-icarus-texto'] = encodeURIComponent(resposta.texto)
            extras['x-icarus-primeiro-audio-ms'] = String(resposta.primeiroAudioMs)
          } else {
            wav = await sintetizarPiper(texto, opcoes)
          }

          res.writeHead(200, {
            'content-type': 'audio/wav',
            'content-length': wav.length,
            'access-control-expose-headers': 'x-icarus-texto, x-icarus-primeiro-audio-ms',
            ...extras,
          })
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

  instalarChamada(servidor)
  servidor.listen(porta, '0.0.0.0')
  return servidor
}
