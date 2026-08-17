# Icarus

Bot de Discord que conversa por voz, com memória do que foi dito na call.

> **Status: pausado em 17/08/2026.** Implementado e parcialmente funcional.
> 43 commits · 49 arquivos · ~4.800 linhas · 226 testes verdes
>
> Design original: [`docs/design/2026-08-14-icarus.md`](../../docs/design/2026-08-14-icarus.md)
> · Como rodar local: [`RODAR-LOCAL.md`](RODAR-LOCAL.md)

Este documento é a retrospectiva completa: a ideia, o que foi construído, até onde
chegou e como retomar. Escrito para que alguém — inclusive o Icaro daqui a seis meses —
consiga voltar a mexer sem reconstruir o raciocínio, e principalmente sem repetir os
erros que já custaram tempo aqui.

---

## 1. A ideia

Um segundo bot de Discord que **convivesse na call como um membro**: ouvindo a conversa,
entrando quando chamado, conhecendo quem é quem e lembrando do que já foi dito. Não um
assistente que responde comando, mas alguém presente.

Além disso: tocar música (como o DJ NARUTINHO) e, um dia, conversar por texto e
compartilhar tela.

O pedido original foi *"quero que ele converse como as IAs fazem hoje no modo de voz —
tipo a Siri, o OK Google, a Alexa"*.

---

## 2. O que foi construído

### Monorepo (subprojeto S1, concluído e em produção)

O repositório `discord-dj` virou `discord-bots`, com npm workspaces:

```
packages/shared/   fila, voz, biblioteca de música, painéis, client, os 7 comandos
apps/dj/           DJ NARUTINHO
apps/icarus/       Icarus
apps/gm/           bot do Minecraft (migrado, nunca subiu)
```

`packages/shared` não lê variável de ambiente: cada app monta um `SharedConfig` e chama
`configureShared()`. O mesmo para o banco, via `setDataSource()`. Cada bot tem schema
próprio no mesmo Postgres.

**Isto foi o maior ganho concreto do projeto e continua valendo**, independente do
Icarus: o DJ NARUTINHO roda em produção sobre essa base, e um bot novo que use voz ou
música custa uma pasta, não um projeto.

### Módulos do Icarus

| Módulo | O que faz |
|---|---|
| `ears/` | Recebe áudio do Discord separado por pessoa, converte 48kHz estéreo → 16kHz mono, ignora bots |
| `wake/` | Detecta a palavra de ativação sobre a transcrição |
| `live/` | Sessão Gemini Live: áudio nos dois sentidos, ferramentas, guardas de cota |
| `mouth/` | Fala na call e pede ducking ao DJ |
| `memory/` | Transcrição de ambiente, embeddings locais, busca híbrida |
| `brain/` | Persona, conhecimento curado, montagem de contexto |
| `painel/` | Painel de escuta ao vivo e laboratório de voz |
| `voz/` | Piper, Gemini TTS, Groq, Live API — os quatro motores |

### O laboratório de voz

Ferramenta de depuração que acabou virando a parte mais útil do projeto. Roda em
`localhost:8791/laboratorio`, **sem depender do Discord**, com quatro abas:

- **Piper local** — síntese na máquina, ~550ms, vozes pt-BR
- **Gemini TTS** — 30 vozes, controle de estilo por prompt, ~4,4s
- **Stream (Live API)** — fala-para-fala em tempo real
- **Groq + Piper** — Whisper com idioma forçado + Llama + voz local

Cada aba tem **modo chamada**: microfone do navegador entrando, resposta saindo no
alto-falante, com medidor de nível, transcrição ao vivo e tempos discriminados.

---

## 3. O que funciona e o que não

### Funciona, verificado

- Conversa por voz de ponta a ponta no Discord: ele ouviu, entendeu, respondeu falando
- Ferramentas: tocar, pular, pausar, parar, ver fila, lembrar, encerrar conversa
- Memória: 452 falas transcritas e guardadas em uso real
- Música pela biblioteca compartilhada, sem uma linha duplicada
- Laboratório com os quatro motores

### Não funciona ou ficou pela metade

- **Confiabilidade da conversa no Discord.** Funcionava às vezes. A causa raiz foi
  atacada (áudio, turno, silêncio), mas nunca chegou a ficar estável o suficiente para
  uso normal.
- **Palavra de ativação.** Três palavras tentadas (Icarus, Ícaro, Arroz, Cubo), nenhuma
  confiável com Whisper local em áudio de Discord.
- **`trechos` vazio**: os embeddings nunca foram gerados em produção, então a busca
  semântica nunca rodou de verdade. Só a tabela de transcrições foi populada.
- **Conhecimento curado da Bayuka**: o arquivo nunca foi escrito, então ele nunca soube
  quem é quem.
- **GM**: migrado para o monorepo, buildado, nunca subiu.

---

## 4. Números medidos (não estimados)

| Medida | Valor | Onde |
|---|---|---|
| Whisper `tiny`, 3s de áudio | 0,96s | VM ARM, 4 núcleos |
| Whisper `base`, 3s | 1,93s | idem |
| Whisper `small`, 8s | 7,6s (0,95x tempo real) | idem |
| Piper, frase de 5s | ~550ms | Mac ARM |
| Gemini TTS | ~4,4s | rede |
| Live API, primeiro som | **2.395ms** após o fim da fala | melhor configuração |
| Live API, detecção automática | ~3.200ms | pior |
| Imagem Docker do Icarus | 3,17 GB | com whisper + 3 modelos |
| RAM em execução | ~57 MB | |

### Cotas do free tier (a descoberta mais cara do projeto)

| Serviço | Free tier |
|---|---|
| **Gemini Live (áudio nativo)** | **grátis, sem limite prático** |
| Gemini texto (`generateContent`) | **20 requisições/dia** |
| Groq Whisper | 2.000 requisições/dia |
| Groq texto | 30 por minuto |

O caminho em cascata (transcrever + pensar) gasta **duas** requisições por fala. Com o
Gemini isso dá dez falas por dia. Foi o que travou os testes.

---

## 5. Decisões e por quê

| Decisão | Motivo |
|---|---|
| Dois bots, biblioteca compartilhada | Escolha do Icaro; ducking resolvido por endpoint HTTP interno |
| Monorepo no repo existente | Mudança atômica entre biblioteca e consumidores |
| Deploy independente por app | `docker compose build icarus` não toca o DJ |
| Sem pgvector | Postgres compartilhado não tem a extensão; cosseno em força bruta basta nesta escala |
| Memória completa e imprecisa | Escolha do Icaro: dá para limpar texto depois, não dá para recuperar fala perdida |
| Gemini Live | Único fala-para-fala com free tier real |
| Vídeo/tela fora | A biblioteca que faz isso é para *selfbot* — risco recai sobre a conta pessoal |

---

## 6. Bugs que custaram caro (leia antes de mexer)

Esta é a seção que justifica o documento.

**Decimação sem filtro anti-aliasing.** A conversão 48kHz → 16kHz pegava uma amostra a
cada três e descartava as outras. Tudo acima de 8kHz era rebatido para dentro da faixa da
voz, destruindo as consoantes. "Arroz" virava "A hoís". Isso degradou **todo** o
reconhecimento e me fez perseguir a palavra de ativação por seis rodadas antes de olhar o
pipeline de áudio. A correção é média dos três quadros, e existe teste que falha com o
código antigo.

**Primeira sílaba cortada.** A detecção de fala só começava a gravar depois que a energia
subia, comendo o início da frase — que é justamente o que o modelo usa para decidir o
idioma. "É finalmente" chegava como "C'est finalement", em francês. Corrigido com
pré-buffer de 400ms.

**`tsconfig.tsbuildinfo` versionado.** Dentro do container, o tsc lia o cache do Mac,
concluía que estava tudo atualizado e não emitia nada — o `dist` do shared nunca era
gerado. Invisível localmente.

**whisper.cpp compilado com bibliotecas dinâmicas.** O binário era copiado entre estágios
do Docker sem as `.so`, e morria no primeiro uso. Corrigido com `BUILD_SHARED_LIBS=OFF`.

**uid 1001 vs 1000.** O usuário `ubuntu` da VM é 1001; o `node` do container é 1000. O
rclone não lia a config montada e falhava calado.

**`execFile` promisificado ignora a opção `input`.** O piper esperava um texto que nunca
chegava. Precisa de `spawn` com escrita no stdin.

**Áudio sem `activityEnd` não é processado.** Tentei manter o turno aberto para ele
"ouvir sem responder" — o resultado foi ele não ouvir nada, porque o modelo só processa
quando o turno fecha. Sessão aberta, zero eventos.

**Um stream de áudio por resposta.** O `Mouth` criava o canal uma vez e nunca mais;
depois da primeira resposta o recurso era consumido e as seguintes eram escritas num cano
morto. Sintoma: só a primeira fala saía.

**Regra do desenho antigo sobrevivendo ao desenho novo.** "Duas falas sem resposta =
encerra" fazia sentido quando a sessão só abria ao ser chamado; com sessão sempre aberta,
ouvir sem responder é o normal, e a regra derrubava a sessão a cada duas frases.

**`proactivity: { proactiveAudio: true }` trava a conexão.** A opção existe na
documentação; a sessão simplesmente nunca abre. Adicionada sem teste, quebrou o Stream
inteiro.

**Nomes de modelo assumidos.** `gemini-2.5-flash-native-audio-preview-12-2025` (citado na
doc de preços) e `gemini-2.5-flash` **não existem** para contas novas. Sempre listar os
modelos da chave antes de configurar.

**Silêncio digital perfeito não é reconhecido como silêncio.** Zeros absolutos não
disparam a detecção de fim de turno; ruído baixo dispara.

---

## 7. A lição de arquitetura

A palavra de ativação existia para **economizar custo** — derrubava a conta de ~US$37 para
~US$4 por mês. Mas o free tier escolhido tornava a escuta **gratuita**. Passei seis
rodadas resolvendo um problema difícil de reconhecimento local para economizar dinheiro
que não estava sendo gasto.

A pergunta que teria evitado isso: *este problema ainda existe, dadas as escolhas que já
foram feitas?*

Na mesma linha: existiam dois caminhos de áudio, um provado em produção (tocar arquivo,
que a música usa há dias) e um que nunca funcionou direito (streaming). Manter os dois foi
teimosia — a fala deveria ter migrado para o caminho provado assim que o outro deu
trabalho.

---

## 8. Estado atual

| Item | Estado |
|---|---|
| Container `icarus` na VM | **parado** (`exited`), não removido |
| Container `discord-dj` | **rodando**, intacto |
| Container `mc-discord-bot` | parado |
| Schema `icarus` no Postgres | preservado, 452 transcrições |
| Aplicação no Discord | existe, token válido, bot offline |
| Chave do Gemini | válida, no `.env` da VM |
| Código | tudo em `main`, 226 testes verdes |

Nada foi apagado. Religar é `docker compose start icarus` na VM.

---

## 9. Se for retomar

**Primeiro, decidir a arquitetura de voz** — é a decisão que estava travando tudo:

1. **Groq + Piper** (recomendado): 2.000 transcrições/dia de graça, idioma forçado em
   português, voz local em meio segundo, e a fala passa a usar o caminho de arquivo que
   já é provado em produção. Falta só criar a chave em console.groq.com.
2. **Gemini Live**: melhor latência (2,4s), mas sem controle de voz, sem forçar idioma, e
   depende do caminho de streaming que deu mais trabalho.
3. **Habilitar cobrança no Google**: libera tudo por ~US$5/mês e torna a escolha livre.

**Depois**, na ordem:

- Trocar a fala para o caminho de arquivo (mesma tubulação da música)
- Gerar os embeddings, que nunca rodaram — a busca semântica está escrita e não testada
- Escrever o conhecimento curado da Bayuka, sem o qual ele não conhece ninguém
- Só então voltar à palavra de ativação, se ainda fizer falta

**O laboratório é o melhor ponto de partida.** Ele testa tudo sem Discord, sem call e sem
depender de outras pessoas. Se eu tivesse construído ele no começo em vez de no fim, o
projeto teria andado muito mais rápido.
