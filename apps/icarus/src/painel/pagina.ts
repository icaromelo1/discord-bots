export const PAGINA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Icarus — o que ele está ouvindo</title>
<style>
  :root {
    --fundo: #16150f;
    --painel: #1e1c15;
    --linha: #322e22;
    --texto: #ece7d9;
    --fraco: #948c78;
    --ok: #7fb185;
    --nao: #c06a55;
    --acento: #d9a441;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--fundo); color: var(--texto);
    font-family: var(--mono); font-size: 14px; line-height: 1.5;
  }
  header {
    position: sticky; top: 0; background: var(--fundo);
    border-bottom: 1px solid var(--linha); padding: 14px 20px;
    display: flex; align-items: baseline; gap: 20px; flex-wrap: wrap;
  }
  h1 { margin: 0; font-size: 15px; letter-spacing: .06em; text-transform: uppercase; color: var(--acento); }
  .estado { color: var(--fraco); font-size: 12px; display: flex; gap: 16px; flex-wrap: wrap; }
  .estado b { color: var(--texto); font-weight: 600; }
  main { padding: 16px 20px 60px; display: flex; flex-direction: column; gap: 6px; }
  .ev {
    display: grid; grid-template-columns: 72px 84px 150px 1fr; gap: 12px;
    padding: 8px 12px; background: var(--painel); border-radius: 4px;
    border-left: 3px solid var(--linha); align-items: baseline;
  }
  .ev.wake-sim { border-left-color: var(--ok); }
  .ev.wake-nao { border-left-color: var(--nao); }
  .ev.sessao   { border-left-color: var(--acento); }
  .ev.ferramenta { border-left-color: #6f8fbf; }
  .ev.erro { border-left-color: #c0392b; }
  .hora, .tipo { color: var(--fraco); font-size: 12px; }
  .autor { color: var(--acento); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .texto { word-break: break-word; }
  .detalhe { color: var(--fraco); font-size: 12px; }
  .vazio { color: var(--fraco); padding: 40px 0; text-align: center; }
  @media (max-width: 720px) {
    .ev { grid-template-columns: 60px 1fr; }
    .tipo, .autor { grid-column: 2; }
  }
</style>
</head>
<body>
<header>
  <h1>Icarus · escuta ao vivo</h1>
  <div class="estado" id="estado">carregando…</div>
</header>
<main id="lista"><div class="vazio">Aguardando áudio… entre numa call e rode /icarus entrar.</div></main>
<script>
const lista = document.getElementById('lista')
const estado = document.getElementById('estado')
let ultimo = 0
let vazio = true

function hora(ms) {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour12: false })
}

function classe(ev) {
  if (ev.tipo === 'wake') return ev.acordou ? 'ev wake-sim' : 'ev wake-nao'
  if (ev.tipo === 'sessao') return 'ev sessao'
  if (ev.tipo === 'ferramenta') return 'ev ferramenta'
  if (ev.tipo === 'erro') return 'ev erro'
  return 'ev'
}

function rotulo(ev) {
  if (ev.tipo === 'wake') return ev.acordou ? 'ACORDOU' : 'ignorado'
  return ev.tipo
}

async function puxar() {
  try {
    const r = await fetch('/api/eventos?desde=' + ultimo)
    const dados = await r.json()

    estado.innerHTML =
      '<span>call: <b>' + (dados.estado.naCall ? dados.estado.canal : 'fora') + '</b></span>' +
      '<span>sessão: <b>' + dados.estado.sessao + '</b></span>' +
      '<span>gatilho: <b>' + dados.estado.wakeWord + '</b></span>' +
      '<span>fila de transcrição: <b>' + dados.estado.fila + '</b></span>'

    if (dados.eventos.length > 0) {
      if (vazio) { lista.innerHTML = ''; vazio = false }
      for (const ev of dados.eventos.slice().reverse()) {
        ultimo = Math.max(ultimo, ev.em)
        const div = document.createElement('div')
        div.className = classe(ev)
        div.innerHTML =
          '<span class="hora">' + hora(ev.em) + '</span>' +
          '<span class="tipo">' + rotulo(ev) + '</span>' +
          '<span class="autor">' + (ev.autor || '') + '</span>' +
          '<span class="texto">' + (ev.texto || '') +
            (ev.detalhe ? ' <span class="detalhe">— ' + ev.detalhe + '</span>' : '') +
          '</span>'
        lista.prepend(div)
      }
      while (lista.children.length > 300) lista.lastChild.remove()
    }
  } catch (e) {
    estado.textContent = 'sem conexão com o bot'
  }
}

puxar()
setInterval(puxar, 1000)
</script>
</body>
</html>`
