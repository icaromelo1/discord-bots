export const LABORATORIO = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Icarus — laboratório de voz</title>
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
    position: sticky; top: 0; background: var(--fundo); z-index: 10;
    border-bottom: 1px solid var(--linha); padding: 14px 20px;
    display: flex; align-items: baseline; gap: 20px; flex-wrap: wrap;
  }
  h1 { margin: 0; font-size: 15px; letter-spacing: .06em; text-transform: uppercase; color: var(--acento); }
  nav { display: flex; gap: 4px; }
  nav button {
    background: none; border: 1px solid var(--linha); color: var(--fraco);
    font-family: var(--mono); font-size: 12px; padding: 6px 14px; border-radius: 4px;
    cursor: pointer; letter-spacing: .04em; text-transform: uppercase;
  }
  nav button:hover { color: var(--texto); border-color: var(--fraco); }
  nav button.ativa { color: var(--fundo); background: var(--acento); border-color: var(--acento); font-weight: 600; }
  main { padding: 20px; max-width: 900px; margin: 0 auto 60px; }
  .aba { display: none; flex-direction: column; gap: 18px; }
  .aba.ativa { display: flex; }
  .campo { display: flex; flex-direction: column; gap: 6px; }
  .campo label { color: var(--fraco); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  textarea, select, input[type="text"] {
    background: var(--painel); color: var(--texto); border: 1px solid var(--linha);
    border-radius: 4px; padding: 10px 12px; font-family: var(--mono); font-size: 14px;
    resize: vertical;
  }
  textarea:focus, select:focus, input:focus { outline: 1px solid var(--acento); border-color: var(--acento); }
  textarea { min-height: 90px; }
  .linha { display: flex; gap: 16px; flex-wrap: wrap; }
  .linha > .campo { flex: 1; min-width: 180px; }
  .slider-valor { color: var(--acento); font-weight: 600; }
  input[type="range"] { accent-color: var(--acento); width: 100%; }
  button.acao {
    align-self: flex-start; background: var(--acento); color: var(--fundo); border: none;
    border-radius: 4px; padding: 10px 22px; font-family: var(--mono); font-size: 13px;
    font-weight: 700; letter-spacing: .04em; text-transform: uppercase; cursor: pointer;
  }
  button.acao:hover { filter: brightness(1.08); }
  button.acao:disabled { opacity: .5; cursor: default; }
  button.secundaria {
    align-self: flex-start; background: none; color: var(--texto); border: 1px solid var(--linha);
    border-radius: 4px; padding: 8px 18px; font-family: var(--mono); font-size: 13px; cursor: pointer;
  }
  button.secundaria:hover { border-color: var(--acento); color: var(--acento); }
  .dica { color: var(--fraco); font-size: 12px; }
  .erro {
    background: #2a1712; border: 1px solid var(--nao); color: #e79b89;
    border-radius: 4px; padding: 10px 12px; font-size: 13px; white-space: pre-wrap;
  }
  .status { color: var(--fraco); font-size: 12px; }
  .bloco {
    background: var(--painel); border: 1px solid var(--linha); border-radius: 6px;
    padding: 16px; display: flex; flex-direction: column; gap: 10px;
  }
  .bloco h2 { margin: 0; font-size: 13px; color: var(--acento); text-transform: uppercase; letter-spacing: .04em; }
  .bloco p { margin: 0; color: var(--fraco); }
  .estado-grid { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--fraco); }
  .estado-grid b { color: var(--texto); }
  h3.titulo-secao {
    margin: 0; font-size: 12px; color: var(--fraco); text-transform: uppercase; letter-spacing: .04em;
    border-top: 1px solid var(--linha); padding-top: 16px;
  }
  .historico { display: flex; flex-direction: column; gap: 8px; }
  .item-hist {
    background: var(--painel); border: 1px solid var(--linha); border-left: 3px solid var(--acento);
    border-radius: 4px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;
  }
  .item-hist .meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--fraco); }
  .item-hist .meta b { color: var(--texto); }
  .item-hist .texto-usado { font-size: 12px; color: var(--fraco); }
  audio { width: 100%; height: 32px; }
  .vazio { color: var(--fraco); text-align: center; padding: 20px 0; }
  @media (max-width: 600px) {
    header { flex-direction: column; align-items: flex-start; }
    .linha { flex-direction: column; }
  }
</style>
</head>
<body>
<header>
  <h1>Icarus · laboratório de voz</h1>
  <nav id="abas">
    <button data-aba="piper" class="ativa">Piper (local)</button>
    <button data-aba="gemini">Gemini TTS</button>
    <button data-aba="stream">Stream (Live API)</button>
  </nav>
</header>
<main>

  <section class="aba ativa" id="aba-piper">
    <div class="campo">
      <label for="piper-texto">Texto</label>
      <textarea id="piper-texto" spellcheck="false">Olá, eu sou o Icarus. Essa é uma frase de teste para comparar como cada voz soa.</textarea>
      <span class="dica">Cmd/Ctrl+Enter para gerar</span>
    </div>
    <div class="linha">
      <div class="campo">
        <label for="piper-voz">Voz</label>
        <select id="piper-voz"><option>carregando…</option></select>
      </div>
    </div>
    <div class="linha">
      <div class="campo">
        <label for="piper-velocidade">Velocidade — <span class="slider-valor" id="piper-velocidade-valor">1.0</span></label>
        <input type="range" id="piper-velocidade" min="0.5" max="2.0" step="0.1" value="1.0">
      </div>
      <div class="campo">
        <label for="piper-pausa">Pausa entre frases (s) — <span class="slider-valor" id="piper-pausa-valor">0.20</span></label>
        <input type="range" id="piper-pausa" min="0" max="1.0" step="0.05" value="0.2">
      </div>
    </div>
    <button class="acao" id="piper-gerar">Gerar e ouvir</button>
    <div class="status" id="piper-status"></div>
    <div id="piper-erro"></div>
    <h3 class="titulo-secao">Histórico</h3>
    <div class="historico" id="piper-historico"><div class="vazio">Nenhuma geração ainda.</div></div>
  </section>

  <section class="aba" id="aba-gemini">
    <div class="campo">
      <label for="gemini-texto">Texto</label>
      <textarea id="gemini-texto" spellcheck="false">Olá, eu sou o Icarus. Essa é uma frase de teste para comparar como cada voz soa.</textarea>
      <span class="dica">Cmd/Ctrl+Enter para gerar</span>
    </div>
    <div class="linha">
      <div class="campo">
        <label for="gemini-voz">Voz</label>
        <select id="gemini-voz"><option>carregando…</option></select>
      </div>
      <div class="campo">
        <label for="gemini-modelo">Modelo</label>
        <select id="gemini-modelo">
          <option value="gemini-2.5-flash-preview-tts">gemini-2.5-flash-preview-tts</option>
          <option value="gemini-2.5-pro-preview-tts">gemini-2.5-pro-preview-tts</option>
          <option value="gemini-3.1-flash-tts-preview">gemini-3.1-flash-tts-preview</option>
        </select>
      </div>
    </div>
    <div class="campo">
      <label for="gemini-estilo">Estilo (opcional)</label>
      <input type="text" id="gemini-estilo" placeholder="ex: fale animado e rápido">
    </div>
    <button class="acao" id="gemini-gerar">Gerar e ouvir</button>
    <div class="status" id="gemini-status"></div>
    <div id="gemini-erro"></div>
    <h3 class="titulo-secao">Histórico</h3>
    <div class="historico" id="gemini-historico"><div class="vazio">Nenhuma geração ainda.</div></div>
  </section>

  <section class="aba" id="aba-stream">
    <div class="bloco">
      <h2>Fala-para-fala em tempo real</h2>
      <p>O modo Stream usa a Live API do Gemini para conversar em tempo real, com áudio entrando e saindo continuamente
      — não existe um botão "gerar" aqui porque não há um texto de entrada nem um arquivo de saída: é uma sessão de
      voz aberta. Por isso ele só funciona dentro de uma call do Discord, onde o Icarus está de fato ouvindo e
      falando com alguém.</p>
      <p>Comparação conceitual com Piper e Gemini TTS: a latência de resposta tende a ser bem menor, porque não
      existe um passo separado de "gerar áudio depois de pensar" — mas em troca não dá para escolher a voz nem
      ajustar velocidade ou estilo, e não dá para testar fora da call, então essa aba não tem player nem histórico,
      só o estado atual do bot.</p>
    </div>
    <div class="linha">
      <button class="secundaria" id="stream-atualizar">Atualizar estado</button>
    </div>
    <div class="estado-grid" id="stream-estado">carregando…</div>
  </section>

</main>
<script>
const abas = document.querySelectorAll('#abas button')
const secoes = document.querySelectorAll('.aba')
abas.forEach((btn) => {
  btn.addEventListener('click', () => {
    abas.forEach((b) => b.classList.remove('ativa'))
    secoes.forEach((s) => s.classList.remove('ativa'))
    btn.classList.add('ativa')
    document.getElementById('aba-' + btn.dataset.aba).classList.add('ativa')
  })
})

function formatarBytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / (1024 * 1024)).toFixed(2) + ' MB'
}

function formatarMs(ms) {
  if (ms < 1000) return ms.toFixed(0) + ' ms'
  return (ms / 1000).toFixed(2) + ' s'
}

async function duracaoDoAudio(blob) {
  return new Promise((resolve) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => resolve(isFinite(audio.duration) ? audio.duration : 0)
    audio.onerror = () => resolve(0)
    audio.src = URL.createObjectURL(blob)
  })
}

function mostrarErro(elId, mensagem) {
  const el = document.getElementById(elId)
  el.innerHTML = mensagem ? '<div class="erro">' + mensagem + '</div>' : ''
}

async function carregarVozesPiper() {
  const select = document.getElementById('piper-voz')
  try {
    const r = await fetch('/api/voz/piper/vozes')
    const dados = await r.json()
    if (!dados.vozes || dados.vozes.length === 0) {
      select.innerHTML = '<option value="">nenhuma voz encontrada</option>'
      return
    }
    select.innerHTML = dados.vozes.map((v) => '<option value="' + v.id + '">' + v.rotulo + '</option>').join('')
  } catch (e) {
    select.innerHTML = '<option value="">falha ao carregar vozes</option>'
  }
}

async function carregarVozesGemini() {
  const select = document.getElementById('gemini-voz')
  try {
    const r = await fetch('/api/voz/gemini/vozes')
    const dados = await r.json()
    if (!dados.vozes || dados.vozes.length === 0) {
      select.innerHTML = '<option value="">nenhuma voz encontrada</option>'
      return
    }
    select.innerHTML = dados.vozes.map((v) => '<option value="' + v + '">' + v + '</option>').join('')
  } catch (e) {
    select.innerHTML = '<option value="">falha ao carregar vozes</option>'
  }
}

const piperVelocidade = document.getElementById('piper-velocidade')
const piperVelocidadeValor = document.getElementById('piper-velocidade-valor')
piperVelocidade.addEventListener('input', () => {
  piperVelocidadeValor.textContent = Number(piperVelocidade.value).toFixed(1)
})

const piperPausa = document.getElementById('piper-pausa')
const piperPausaValor = document.getElementById('piper-pausa-valor')
piperPausa.addEventListener('input', () => {
  piperPausaValor.textContent = Number(piperPausa.value).toFixed(2)
})

function inserirHistorico(historicoId, item) {
  const container = document.getElementById(historicoId)
  const vazio = container.querySelector('.vazio')
  if (vazio) vazio.remove()

  const div = document.createElement('div')
  div.className = 'item-hist'
  div.innerHTML =
    '<div class="meta">' +
      '<span>motor: <b>' + item.motor + '</b></span>' +
      '<span>voz: <b>' + item.voz + '</b></span>' +
      '<span>geração: <b>' + formatarMs(item.tempoMs) + '</b></span>' +
      '<span>duração: <b>' + item.duracaoS.toFixed(1) + 's</b></span>' +
      '<span>tamanho: <b>' + formatarBytes(item.bytes) + '</b></span>' +
    '</div>' +
    '<div class="texto-usado">' + item.texto + '</div>'

  const audio = document.createElement('audio')
  audio.controls = true
  audio.src = item.url
  div.appendChild(audio)

  container.prepend(div)
}

async function sintetizar({ motor, texto, opcoes, voz, statusId, erroId, historicoId, botao }) {
  if (!texto.trim()) return
  mostrarErro(erroId, '')
  const status = document.getElementById(statusId)
  botao.disabled = true
  status.textContent = 'gerando…'

  const inicio = performance.now()
  try {
    const r = await fetch('/api/voz/sintetizar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ motor, texto, opcoes }),
    })

    if (!r.ok) {
      let mensagem = 'Erro ' + r.status
      try {
        const corpo = await r.json()
        if (corpo.erro) mensagem = corpo.erro
      } catch (e) {
        // resposta sem corpo JSON, mantém a mensagem genérica
      }
      throw new Error(mensagem)
    }

    const blob = await r.blob()
    const tempoMs = performance.now() - inicio
    const duracaoS = await duracaoDoAudio(blob)
    const url = URL.createObjectURL(blob)

    status.textContent = formatarMs(tempoMs) + ' · ' + formatarBytes(blob.size)
    inserirHistorico(historicoId, { motor, voz, texto, tempoMs, duracaoS, bytes: blob.size, url })
  } catch (e) {
    status.textContent = ''
    mostrarErro(erroId, e.message || String(e))
  } finally {
    botao.disabled = false
  }
}

const piperBotao = document.getElementById('piper-gerar')
async function gerarPiper() {
  const texto = document.getElementById('piper-texto').value
  const voz = document.getElementById('piper-voz').value
  await sintetizar({
    motor: 'piper',
    texto,
    voz,
    opcoes: {
      voz,
      velocidade: Number(piperVelocidade.value),
      pausaFrase: Number(piperPausa.value),
    },
    statusId: 'piper-status',
    erroId: 'piper-erro',
    historicoId: 'piper-historico',
    botao: piperBotao,
  })
}
piperBotao.addEventListener('click', gerarPiper)
document.getElementById('piper-texto').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') gerarPiper()
})

const geminiBotao = document.getElementById('gemini-gerar')
async function gerarGemini() {
  const texto = document.getElementById('gemini-texto').value
  const voz = document.getElementById('gemini-voz').value
  const modelo = document.getElementById('gemini-modelo').value
  const estilo = document.getElementById('gemini-estilo').value
  await sintetizar({
    motor: 'gemini',
    texto,
    voz,
    opcoes: { voz, modelo, estilo: estilo || undefined },
    statusId: 'gemini-status',
    erroId: 'gemini-erro',
    historicoId: 'gemini-historico',
    botao: geminiBotao,
  })
}
geminiBotao.addEventListener('click', gerarGemini)
document.getElementById('gemini-texto').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') gerarGemini()
})

async function atualizarEstadoStream() {
  const el = document.getElementById('stream-estado')
  el.textContent = 'carregando…'
  try {
    const r = await fetch('/api/eventos')
    const dados = await r.json()
    el.innerHTML =
      '<span>call: <b>' + (dados.estado.naCall ? dados.estado.canal : 'fora') + '</b></span>' +
      '<span>sessão: <b>' + dados.estado.sessao + '</b></span>' +
      '<span>gatilho: <b>' + dados.estado.wakeWord + '</b></span>'
  } catch (e) {
    el.textContent = 'sem conexão com o bot'
  }
}
document.getElementById('stream-atualizar').addEventListener('click', atualizarEstadoStream)

carregarVozesPiper()
carregarVozesGemini()
atualizarEstadoStream()
</script>
</body>
</html>`
