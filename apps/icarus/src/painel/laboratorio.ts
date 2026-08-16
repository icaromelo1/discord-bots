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
  .chamada-bloco { gap: 14px; }
  .chamada-topo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  button.chamada-botao.ativa { border-color: var(--nao); color: var(--nao); }
  .indicador-chamada { width: 10px; height: 10px; border-radius: 50%; background: var(--linha); flex-shrink: 0; }
  .indicador-chamada.ativa { background: var(--ok); animation: pulso-chamada 1.2s infinite; }
  @keyframes pulso-chamada {
    0% { box-shadow: 0 0 0 0 rgba(127, 177, 133, .55); }
    70% { box-shadow: 0 0 0 8px rgba(127, 177, 133, 0); }
    100% { box-shadow: 0 0 0 0 rgba(127, 177, 133, 0); }
  }
  .medidor { height: 6px; background: var(--fundo); border: 1px solid var(--linha); border-radius: 3px; overflow: hidden; }
  .medidor-barra { height: 100%; width: 0%; background: var(--acento); transition: width .05s linear; }
  .chamada-tempos { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--fraco); }
  .chamada-tempos b { color: var(--acento); }
  .chamada-chat { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; }
  .msg-chamada { padding: 8px 10px; border-radius: 4px; font-size: 13px; max-width: 85%; }
  .msg-pessoa { align-self: flex-end; background: var(--painel); border: 1px solid var(--linha); }
  .msg-bot { align-self: flex-start; background: #241f14; border: 1px solid var(--acento); }
  .msg-chamada .quem {
    display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
    color: var(--fraco); margin-bottom: 2px;
  }
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
    <button data-aba="groq">Groq + Piper</button>
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
    <h3 class="titulo-secao">Modo chamada</h3>
    <div class="bloco chamada-bloco">
      <div class="chamada-topo">
        <button class="secundaria chamada-botao" id="piper-call-btn">Iniciar chamada</button>
        <span class="indicador-chamada" id="piper-call-indicador"></span>
        <span class="status" id="piper-call-status"></span>
      </div>
      <div class="medidor"><div class="medidor-barra" id="piper-call-medidor"></div></div>
      <div id="piper-call-erro"></div>
      <div class="chamada-tempos" id="piper-call-tempos"></div>
      <div class="chamada-chat" id="piper-call-chat"></div>
    </div>
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
    <h3 class="titulo-secao">Modo chamada</h3>
    <div class="bloco chamada-bloco">
      <div class="chamada-topo">
        <button class="secundaria chamada-botao" id="gemini-call-btn">Iniciar chamada</button>
        <span class="indicador-chamada" id="gemini-call-indicador"></span>
        <span class="status" id="gemini-call-status"></span>
      </div>
      <div class="medidor"><div class="medidor-barra" id="gemini-call-medidor"></div></div>
      <div id="gemini-call-erro"></div>
      <div class="chamada-tempos" id="gemini-call-tempos"></div>
      <div class="chamada-chat" id="gemini-call-chat"></div>
    </div>
    <h3 class="titulo-secao">Histórico</h3>
    <div class="historico" id="gemini-historico"><div class="vazio">Nenhuma geração ainda.</div></div>
  </section>

  <section class="aba" id="aba-stream">
    <div class="bloco">
      <h2>Fala-para-fala com a Live API</h2>
      <p>Piper e Gemini TTS leem o texto que você escreve. Aqui o Icarus responde ao texto, como numa conversa —
      a voz continua comparável entre as três abas, mas a fala que sai desta é outra, gerada pela resposta dele,
      não uma leitura do que você digitou.</p>
    </div>
    <div class="campo">
      <label for="stream-texto">Texto</label>
      <textarea id="stream-texto" spellcheck="false">Fala galera, aqui é o Icarus, tô testando minha voz.</textarea>
      <span class="dica">Cmd/Ctrl+Enter para enviar</span>
    </div>
    <div class="linha">
      <div class="campo">
        <label for="stream-voz">Voz</label>
        <select id="stream-voz"><option>carregando…</option></select>
      </div>
      <div class="campo">
        <label for="stream-modelo">Modelo</label>
        <select id="stream-modelo">
          <option value="gemini-2.5-flash-native-audio-latest">gemini-2.5-flash-native-audio-latest</option>
          <option value="gemini-2.5-flash-native-audio-preview-09-2025">gemini-2.5-flash-native-audio-preview-09-2025</option>
        </select>
      </div>
    </div>
    <div class="campo">
      <label for="stream-instrucao">Instrução de sistema (opcional)</label>
      <input type="text" id="stream-instrucao" placeholder="Você é o Icarus. Responda curto e natural.">
    </div>
    <button class="acao" id="stream-gerar">Enviar e ouvir</button>
    <div class="status" id="stream-status"></div>
    <div id="stream-erro"></div>
    <h3 class="titulo-secao">Modo chamada</h3>
    <div class="bloco chamada-bloco">
      <div class="chamada-topo">
        <button class="secundaria chamada-botao" id="stream-call-btn">Iniciar chamada</button>
        <span class="indicador-chamada" id="stream-call-indicador"></span>
        <span class="status" id="stream-call-status"></span>
      </div>
      <div class="medidor"><div class="medidor-barra" id="stream-call-medidor"></div></div>
      <div id="stream-call-erro"></div>
      <div class="chamada-tempos" id="stream-call-tempos"></div>
      <div class="chamada-chat" id="stream-call-chat"></div>
    </div>
    <h3 class="titulo-secao">Histórico</h3>
    <div class="historico" id="stream-historico"><div class="vazio">Nenhuma geração ainda.</div></div>
    <h3 class="titulo-secao">Estado do bot</h3>
    <div class="linha">
      <button class="secundaria" id="stream-atualizar">Atualizar estado</button>
    </div>
    <div class="estado-grid" id="stream-estado">carregando…</div>
  </section>

  <section class="aba" id="aba-groq">
    <div class="bloco">
      <h2>Groq + Piper</h2>
      <p>Transcreve com Whisper no Groq (idioma forçado em português), pensa com Llama no Groq, e fala com
      Piper local — tudo em free tier.</p>
    </div>
    <div id="groq-sem-chave" style="display:none">
      <div class="erro" style="user-select: text">Falta a GROQ_API_KEY. Crie uma chave grátis em
      console.groq.com e coloque no .env.</div>
    </div>
    <div id="groq-controles">
      <div class="linha">
        <div class="campo">
          <label for="groq-voz">Voz (Piper)</label>
          <select id="groq-voz"><option>carregando…</option></select>
        </div>
        <div class="campo">
          <label for="groq-velocidade">Velocidade — <span class="slider-valor" id="groq-velocidade-valor">1.0</span></label>
          <input type="range" id="groq-velocidade" min="0.5" max="2.0" step="0.1" value="1.0">
        </div>
      </div>
      <div class="campo">
        <label for="groq-instrucao">Instrução de sistema (opcional)</label>
        <input type="text" id="groq-instrucao" placeholder="Você é o Icarus. Responda curto e natural.">
      </div>
      <h3 class="titulo-secao">Modo chamada</h3>
      <div class="bloco chamada-bloco">
        <div class="chamada-topo">
          <button class="secundaria chamada-botao" id="groq-call-btn">Iniciar chamada</button>
          <span class="indicador-chamada" id="groq-call-indicador"></span>
          <span class="status" id="groq-call-status"></span>
        </div>
        <div class="medidor"><div class="medidor-barra" id="groq-call-medidor"></div></div>
        <div id="groq-call-erro"></div>
        <div class="chamada-tempos" id="groq-call-tempos"></div>
        <div class="chamada-chat" id="groq-call-chat"></div>
      </div>
    </div>
  </section>

</main>
<script>
const abas = document.querySelectorAll('#abas button')
const secoes = document.querySelectorAll('.aba')
abas.forEach((btn) => {
  btn.addEventListener('click', () => {
    Object.values(chamadas).forEach((c) => { if (c.ativa) c.encerrar() })
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

async function carregarVozesPiper(selectId) {
  const select = document.getElementById(selectId || 'piper-voz')
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

async function carregarVozesGemini(selectId) {
  const select = document.getElementById(selectId)
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

const groqVelocidade = document.getElementById('groq-velocidade')
const groqVelocidadeValor = document.getElementById('groq-velocidade-valor')
groqVelocidade.addEventListener('input', () => {
  groqVelocidadeValor.textContent = Number(groqVelocidade.value).toFixed(1)
})

async function verificarEstadoGroq() {
  try {
    const r = await fetch('/api/voz/groq/estado')
    const dados = await r.json()
    document.getElementById('groq-sem-chave').style.display = dados.configurado ? 'none' : ''
    document.getElementById('groq-controles').style.display = dados.configurado ? '' : 'none'
  } catch (e) {
    document.getElementById('groq-sem-chave').style.display = ''
    document.getElementById('groq-controles').style.display = 'none'
  }
}

function inserirHistorico(historicoId, item) {
  const container = document.getElementById(historicoId)
  const vazio = container.querySelector('.vazio')
  if (vazio) vazio.remove()

  const div = document.createElement('div')
  div.className = 'item-hist'
  const tempoHtml =
    item.primeiroSomMs != null
      ? '<span>primeiro som: <b>' + formatarMs(item.primeiroSomMs) + '</b></span>' +
        '<span>total: <b>' + formatarMs(item.tempoMs) + '</b></span>'
      : '<span>geração: <b>' + formatarMs(item.tempoMs) + '</b></span>'
  const respondidoHtml = item.respondido
    ? '<div class="texto-usado">respondeu: ' + item.respondido + '</div>'
    : ''
  div.innerHTML =
    '<div class="meta">' +
      '<span>motor: <b>' + item.motor + '</b></span>' +
      '<span>voz: <b>' + item.voz + '</b></span>' +
      tempoHtml +
      '<span>duração: <b>' + item.duracaoS.toFixed(1) + 's</b></span>' +
      '<span>tamanho: <b>' + formatarBytes(item.bytes) + '</b></span>' +
    '</div>' +
    '<div class="texto-usado">' + item.texto + '</div>' +
    respondidoHtml

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

const streamBotao = document.getElementById('stream-gerar')
async function gerarStream() {
  const texto = document.getElementById('stream-texto').value
  if (!texto.trim()) return
  const voz = document.getElementById('stream-voz').value
  const modelo = document.getElementById('stream-modelo').value
  const instrucao = document.getElementById('stream-instrucao').value

  mostrarErro('stream-erro', '')
  const status = document.getElementById('stream-status')
  streamBotao.disabled = true
  status.textContent = 'gerando…'

  const inicio = performance.now()
  try {
    const r = await fetch('/api/voz/sintetizar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        motor: 'stream',
        texto,
        opcoes: { voz, modelo, instrucao: instrucao || undefined },
      }),
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

    const textoHeader = r.headers.get('x-icarus-texto')
    const respondido = textoHeader ? decodeURIComponent(textoHeader) : ''
    const primeiroSomHeader = r.headers.get('x-icarus-primeiro-audio-ms')
    const primeiroSomMs = primeiroSomHeader ? Number(primeiroSomHeader) : null

    const blob = await r.blob()
    const tempoMs = performance.now() - inicio
    const duracaoS = await duracaoDoAudio(blob)
    const url = URL.createObjectURL(blob)

    status.textContent =
      (primeiroSomMs != null ? 'primeiro som ' + formatarMs(primeiroSomMs) + ' · ' : '') +
      'total ' + formatarMs(tempoMs) + ' · ' + formatarBytes(blob.size)
    inserirHistorico('stream-historico', {
      motor: 'stream',
      voz,
      texto,
      respondido,
      tempoMs,
      primeiroSomMs,
      duracaoS,
      bytes: blob.size,
      url,
    })
  } catch (e) {
    status.textContent = ''
    mostrarErro('stream-erro', e.message || String(e))
  } finally {
    streamBotao.disabled = false
  }
}
streamBotao.addEventListener('click', gerarStream)
document.getElementById('stream-texto').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') gerarStream()
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

class ChamadaCliente {
  constructor(prefixo, obterOpcoes) {
    this.prefixo = prefixo
    this.obterOpcoes = obterOpcoes
    this.ws = null
    this.audioContextEntrada = null
    this.audioContextSaida = null
    this.stream = null
    this.processor = null
    this.fonte = null
    this.bufferFala = []
    this.silencioMs = 0
    this.duracaoFalaMs = 0
    this.teveEnergiaReal = false
    this.proximoInicioReproducao = 0
    this.linhaPessoaAberta = null
    this.linhaBotAberta = null
    this.ativa = false
    /** Motor da chamada em curso, guardado ao 'iniciar' para decidir como tratar o áudio capturado. */
    this.motorAtual = null
    /** Se o bot está com fala em reprodução — usado pelo barge-in local do motor stream. */
    this.botFalando = false
    /** Fontes de áudio agendadas e ainda tocando/por tocar, para poder cortar tudo de uma vez. */
    this.fontesAgendadas = []
    /** Folga antes do primeiro pedaço de cada resposta, pra absorver variação de rede sem picotar. */
    this.FOLGA_REPRODUCAO = 0.12

    this.LIMIAR = 0.012
    this.SILENCIO_MAX_MS = 800
    this.FALA_MIN_MS = 300
    /** Quanto do passado recente entra junto quando a fala começa. */
    this.PRE_BUFFER_MS = 400
    this.preBuffer = []

    this.botao = document.getElementById(prefixo + '-call-btn')
    this.indicador = document.getElementById(prefixo + '-call-indicador')
    this.status = document.getElementById(prefixo + '-call-status')
    this.erro = document.getElementById(prefixo + '-call-erro')
    this.medidor = document.getElementById(prefixo + '-call-medidor')
    this.tempos = document.getElementById(prefixo + '-call-tempos')
    this.chat = document.getElementById(prefixo + '-call-chat')

    this.botao.addEventListener('click', () => {
      if (this.ativa) this.encerrar()
      else this.iniciar()
    })
  }

  mostrarErro(mensagem) {
    this.erro.innerHTML = mensagem ? '<div class="erro">' + mensagem + '</div>' : ''
  }

  async iniciar() {
    this.mostrarErro('')
    this.chat.innerHTML = ''
    this.tempos.innerHTML = ''
    this.linhaPessoaAberta = null
    this.linhaBotAberta = null
    this.status.textContent = 'conectando…'

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
    } catch (e) {
      this.mostrarErro('Não foi possível acessar o microfone: ' + (e.message || e))
      this.status.textContent = ''
      return
    }

    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.ws = new WebSocket(protocolo + '//' + location.host + '/ws/chamada')

    this.ws.addEventListener('open', () => {
      const opcoes = this.obterOpcoes()
      this.motorAtual = opcoes.motor
      this.ws.send(JSON.stringify(Object.assign({ tipo: 'iniciar' }, opcoes)))
    })

    this.ws.addEventListener('message', (ev) => this.aoReceberMensagem(JSON.parse(ev.data)))
    this.ws.addEventListener('close', () => this.encerrar())
    this.ws.addEventListener('error', () => {
      this.mostrarErro('Falha na conexão com o servidor de chamada.')
    })
  }

  aoReceberMensagem(msg) {
    if (msg.tipo === 'pronto') {
      this.ativa = true
      this.botao.textContent = 'Encerrar chamada'
      this.botao.classList.add('ativa')
      this.indicador.classList.add('ativa')
      this.status.textContent = 'em chamada · fale para começar'
      this.iniciarCapturaMicrofone()
      return
    }
    if (msg.tipo === 'transcricao') return this.aoReceberTranscricao(msg)
    if (msg.tipo === 'falando') {
      this.botFalando = true
      // toda resposta nova ganha a folga de novo — é o início dela, não uma continuação
      this.proximoInicioReproducao = 0
      this.status.textContent = 'o bot está falando…'
      return
    }
    if (msg.tipo === 'audio') return this.tocarAudio(msg.dados, msg.taxaHz)
    if (msg.tipo === 'interrompido') {
      // o modelo foi interrompido por alguém falando por cima: para na hora e descarta
      // o que ainda estava agendado, senão o bot continua "falando" uma resposta abandonada
      this.pararReproducaoLocal()
      this.status.textContent = 'em chamada · fale para começar'
      return
    }
    if (msg.tipo === 'fim-da-fala') {
      this.botFalando = false
      this.linhaPessoaAberta = null
      this.linhaBotAberta = null
      this.status.textContent = 'em chamada · fale para começar'
      if (msg.tempos) this.mostrarTempos(msg.tempos)
      return
    }
    if (msg.tipo === 'erro') {
      this.mostrarErro(msg.mensagem)
      return
    }
    if (msg.tipo === 'encerrada') {
      this.encerrar()
    }
  }

  /** Corta a reprodução em curso e descarta o que estava agendado para tocar depois. */
  pararReproducaoLocal() {
    for (const fonte of this.fontesAgendadas) {
      try {
        fonte.stop()
      } catch (e) {
        // já pode ter terminado sozinha
      }
    }
    this.fontesAgendadas = []
    this.proximoInicioReproducao = 0
    this.botFalando = false
  }

  mostrarTempos(t) {
    this.tempos.innerHTML =
      '<span>transcrever: <b>' + formatarMs(t.transcrever) + '</b></span>' +
      '<span>pensar: <b>' + formatarMs(t.pensar) + '</b></span>' +
      '<span>falar: <b>' + formatarMs(t.falar) + '</b></span>' +
      '<span>total: <b>' + formatarMs(t.total) + '</b></span>'
  }

  aoReceberTranscricao(msg) {
    const chave = msg.quem === 'pessoa' ? 'linhaPessoaAberta' : 'linhaBotAberta'
    if (msg.parcial && this[chave]) {
      this[chave].textoAtual += msg.texto
      this[chave].el.querySelector('.texto').textContent = this[chave].textoAtual
      this.chat.scrollTop = this.chat.scrollHeight
      return
    }

    const div = document.createElement('div')
    div.className = 'msg-chamada ' + (msg.quem === 'pessoa' ? 'msg-pessoa' : 'msg-bot')
    div.innerHTML = '<span class="quem">' + (msg.quem === 'pessoa' ? 'você' : 'bot') + '</span><span class="texto"></span>'
    div.querySelector('.texto').textContent = msg.texto
    this.chat.appendChild(div)
    this.chat.scrollTop = this.chat.scrollHeight

    this[chave] = msg.parcial ? { el: div, textoAtual: msg.texto } : null
  }

  iniciarCapturaMicrofone() {
    const AudioContextClasse = window.AudioContext || window.webkitAudioContext
    this.audioContextEntrada = new AudioContextClasse()
    this.fonte = this.audioContextEntrada.createMediaStreamSource(this.stream)
    this.processor = this.audioContextEntrada.createScriptProcessor(4096, 1, 1)

    const taxaEntrada = this.audioContextEntrada.sampleRate

    this.processor.onaudioprocess = (ev) => {
      const entrada = ev.inputBuffer.getChannelData(0)
      const pcm16k = this.reamostrarPara16k(entrada, taxaEntrada)
      const rms = this.calcularRms(pcm16k)
      const duracaoChunkMs = (pcm16k.length / 16000) * 1000

      this.atualizarMedidor(rms)

      const comEnergia = rms > this.LIMIAR

      if (this.motorAtual === 'stream') {
        // barge-in local: não espera o servidor avisar que foi interrompido, corta na
        // hora que o nível do microfone passa do limiar enquanto o bot está falando —
        // é o que dá sensação de conversa de verdade
        if (comEnergia && this.botFalando) this.pararReproducaoLocal()

        // fluxo contínuo: cada pedaço vai direto pro servidor assim que é capturado,
        // silêncio incluso — quem decide o fim do turno agora é o servidor do Gemini
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ tipo: 'audio', dados: this.paraBase64(pcm16k) }))
        }
        return
      }

      // piper, gemini e groq: transcrição é por requisição, então acumula a fala
      // inteira e só envia quando detecta silêncio
      if (comEnergia) {
        this.teveEnergiaReal = true
        this.silencioMs = 0
      } else {
        this.silencioMs += duracaoChunkMs
      }

      if (comEnergia || this.bufferFala.length > 0) {
        // Ao COMEÇAR a falar, inclui o que veio logo antes de a energia subir. Sem isto
        // a primeira sílaba é cortada — e é justamente ela que o modelo usa para decidir
        // o idioma: "É finalmente" chegava como "C'est finalement", em francês.
        if (this.bufferFala.length === 0 && this.preBuffer.length > 0) {
          for (const anterior of this.preBuffer) {
            this.bufferFala.push(anterior)
            this.duracaoFalaMs += (anterior.length / 16000) * 1000
          }
          this.preBuffer = []
        }
        this.bufferFala.push(pcm16k)
        this.duracaoFalaMs += duracaoChunkMs
      } else {
        // enquanto está em silêncio, mantém uma janela curta do passado recente
        this.preBuffer.push(pcm16k)
        let acumulado = 0
        for (const parte of this.preBuffer) acumulado += (parte.length / 16000) * 1000
        while (acumulado > this.PRE_BUFFER_MS && this.preBuffer.length > 1) {
          const fora = this.preBuffer.shift()
          acumulado -= (fora.length / 16000) * 1000
        }
      }

      if (this.bufferFala.length > 0 && this.silencioMs >= this.SILENCIO_MAX_MS) {
        this.finalizarSegmento()
      }
    }

    this.fonte.connect(this.processor)
    this.processor.connect(this.audioContextEntrada.destination)
  }

  finalizarSegmento() {
    const partes = this.bufferFala
    const duracaoMs = this.duracaoFalaMs
    const teveEnergiaReal = this.teveEnergiaReal
    this.bufferFala = []
    this.duracaoFalaMs = 0
    this.silencioMs = 0
    this.teveEnergiaReal = false
    this.preBuffer = []

    if (duracaoMs < this.FALA_MIN_MS || !teveEnergiaReal) return

    let total = 0
    for (const p of partes) total += p.length
    const junto = new Int16Array(total)
    let offset = 0
    for (const p of partes) {
      junto.set(p, offset)
      offset += p.length
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ tipo: 'audio', dados: this.paraBase64(junto) }))
    }
  }

  calcularRms(pcm16) {
    let soma = 0
    for (let i = 0; i < pcm16.length; i++) {
      const v = pcm16[i] / 32768
      soma += v * v
    }
    return pcm16.length ? Math.sqrt(soma / pcm16.length) : 0
  }

  atualizarMedidor(rms) {
    const pct = Math.min(100, (rms / 0.3) * 100)
    this.medidor.style.width = pct + '%'
  }

  reamostrarPara16k(float32, taxaEntrada) {
    if (taxaEntrada === 16000) {
      const saida = new Int16Array(float32.length)
      for (let i = 0; i < float32.length; i++) saida[i] = this.paraInt16(float32[i])
      return saida
    }
    const razao = taxaEntrada / 16000
    const tamanhoSaida = Math.floor(float32.length / razao)
    const saida = new Int16Array(tamanhoSaida)
    for (let i = 0; i < tamanhoSaida; i++) {
      const inicio = Math.floor(i * razao)
      const fim = Math.floor((i + 1) * razao)
      let soma = 0
      let n = 0
      for (let j = inicio; j < fim && j < float32.length; j++) {
        soma += float32[j]
        n++
      }
      saida[i] = this.paraInt16(n ? soma / n : 0)
    }
    return saida
  }

  paraInt16(amostra) {
    const s = Math.max(-1, Math.min(1, amostra))
    return s < 0 ? s * 32768 : s * 32767
  }

  paraBase64(int16) {
    const bytes = new Uint8Array(int16.buffer)
    let binario = ''
    const tamanhoBloco = 0x8000
    for (let i = 0; i < bytes.length; i += tamanhoBloco) {
      binario += String.fromCharCode.apply(null, bytes.subarray(i, i + tamanhoBloco))
    }
    return btoa(binario)
  }

  tocarAudio(base64, taxaHz) {
    const AudioContextClasse = window.AudioContext || window.webkitAudioContext
    if (!this.audioContextSaida) {
      this.audioContextSaida = new AudioContextClasse()
      this.proximoInicioReproducao = 0
    }
    const binario = atob(base64)
    const bytes = new Uint8Array(binario.length)
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
    const int16 = new Int16Array(bytes.buffer)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768

    const buffer = this.audioContextSaida.createBuffer(1, float32.length, taxaHz)
    buffer.copyToChannel(float32, 0)

    const origem = this.audioContextSaida.createBufferSource()
    origem.buffer = buffer
    origem.connect(this.audioContextSaida.destination)
    origem.onended = () => {
      const i = this.fontesAgendadas.indexOf(origem)
      if (i >= 0) this.fontesAgendadas.splice(i, 1)
    }

    const agora = this.audioContextSaida.currentTime
    // proximoInicioReproducao volta a zero no início de cada resposta — é aí que entra
    // a folga, pra absorver variação de rede sem picotar; os pedaços seguintes da mesma
    // resposta continuam agendados em sequência, sem folga extra
    const primeiroDaResposta = this.proximoInicioReproducao === 0
    const inicio = Math.max(agora, this.proximoInicioReproducao) + (primeiroDaResposta ? this.FOLGA_REPRODUCAO : 0)
    origem.start(inicio)
    this.proximoInicioReproducao = inicio + buffer.duration
    this.fontesAgendadas.push(origem)
  }

  encerrar() {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ tipo: 'encerrar' }))
        } catch (e) {
          // conexão já pode estar caindo
        }
      }
      this.ws.close()
      this.ws = null
    }
    if (this.processor) {
      this.processor.disconnect()
      this.processor.onaudioprocess = null
      this.processor = null
    }
    if (this.fonte) {
      this.fonte.disconnect()
      this.fonte = null
    }
    if (this.audioContextEntrada) {
      this.audioContextEntrada.close()
      this.audioContextEntrada = null
    }
    if (this.audioContextSaida) {
      this.audioContextSaida.close()
      this.audioContextSaida = null
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
    this.bufferFala = []
    this.duracaoFalaMs = 0
    this.silencioMs = 0
    this.fontesAgendadas = []
    this.proximoInicioReproducao = 0
    this.botFalando = false
    this.motorAtual = null
    this.ativa = false
    this.botao.textContent = 'Iniciar chamada'
    this.botao.classList.remove('ativa')
    this.indicador.classList.remove('ativa')
    this.status.textContent = ''
    this.medidor.style.width = '0%'
  }
}

const chamadas = {
  piper: new ChamadaCliente('piper', () => ({
    motor: 'piper',
    voz: document.getElementById('piper-voz').value,
    velocidade: Number(piperVelocidade.value),
  })),
  gemini: new ChamadaCliente('gemini', () => ({
    motor: 'gemini',
    voz: document.getElementById('gemini-voz').value,
  })),
  stream: new ChamadaCliente('stream', () => ({
    motor: 'stream',
    voz: document.getElementById('stream-voz').value,
    instrucao: document.getElementById('stream-instrucao').value || undefined,
  })),
  groq: new ChamadaCliente('groq', () => ({
    motor: 'groq',
    voz: document.getElementById('groq-voz').value,
    velocidade: Number(groqVelocidade.value),
    instrucao: document.getElementById('groq-instrucao').value || undefined,
  })),
}

carregarVozesPiper('piper-voz')
carregarVozesPiper('groq-voz')
carregarVozesGemini('gemini-voz')
carregarVozesGemini('stream-voz')
atualizarEstadoStream()
verificarEstadoGroq()
</script>
</body>
</html>`
