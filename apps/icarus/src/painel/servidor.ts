import { createServer, type Server } from 'node:http'
import { PAGINA } from './pagina'
import { registro } from './registro'

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
