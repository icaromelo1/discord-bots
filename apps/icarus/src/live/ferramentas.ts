import { Type, type FunctionDeclaration } from '@google/genai'

/**
 * O que o Icarus pode FAZER, além de conversar.
 *
 * Sem isto, pedir "coloca tal música" só produzia uma resposta simpática dizendo que
 * ele não consegue — o modelo conversa, mas não alcança o bot. Declarando as ferramentas
 * na sessão, ele passa a acionar de fato a mesma camada de música que o /tocar usa.
 */
export const declaracoesDeFerramentas: FunctionDeclaration[] = [
  {
    name: 'tocar',
    description:
      'Coloca uma música para tocar na call. Aceita nome da música, artista, ou link do YouTube. ' +
      'Use quando alguém pedir para tocar, colocar ou ouvir algo.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        busca: {
          type: Type.STRING,
          description: 'Nome da música e artista, ou um link do YouTube.',
        },
      },
      required: ['busca'],
    },
  },
  {
    name: 'pular',
    description: 'Pula para a próxima música da fila.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'pausar',
    description: 'Pausa ou retoma a música que está tocando.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'parar',
    description: 'Para a música e limpa a fila inteira.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'ver_fila',
    description: 'Consulta o que está tocando agora e o que vem a seguir na fila.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'encerrar_conversa',
    description:
      'Encerra a conversa por voz com você. Chame quando a conversa claramente deixou de ' +
      'ser com você — as pessoas voltaram a falar entre si, se despediram de você, ou ' +
      'pediram para você parar. NÃO chame durante uma pausa em que ainda estão pensando ' +
      'ou falando com você.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'lembrar',
    description:
      'Busca na memória o que já foi conversado nesta call em outras ocasiões. ' +
      'Use quando perguntarem sobre algo do passado, ou sobre o que alguém disse antes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        assunto: { type: Type.STRING, description: 'O assunto a procurar na memória.' },
      },
      required: ['assunto'],
    },
  },
]

export interface ResultadoFerramenta {
  ok: boolean
  /** Texto curto que o modelo vai usar para formular a resposta falada. */
  resumo: string
}

export type ExecutorDeFerramenta = (
  nome: string,
  args: Record<string, unknown>,
) => Promise<ResultadoFerramenta>
