import type { TrechoRelevante } from '../memory/busca'
import { buscar } from '../memory/busca'

export interface PessoaNaCall {
  userId: string
  nome: string
}

export interface ContextoDaSessao {
  texto: string
  trechosUsados: number
}

const LIMITE_CARACTERES = 4000

export async function montarContexto(
  guildId: string,
  pessoas: PessoaNaCall[],
  consulta = '',
): Promise<ContextoDaSessao> {
  const nomesPorId = new Map(pessoas.map((pessoa) => [pessoa.userId, pessoa.nome]))
  const trechos = await buscar(guildId, consulta)
  const cabecalho = montarCabecalho(pessoas)

  if (trechos.length === 0) {
    const texto = `${cabecalho}\n\nAinda não tenho memória de conversas anteriores com essas pessoas.`
    return { texto, trechosUsados: 0 }
  }

  let texto = cabecalho
  let trechosUsados = 0
  for (const trecho of trechos) {
    const linha = formatarTrecho(trecho, nomesPorId)
    const candidato = `${texto}\n\n${linha}`
    if (candidato.length > LIMITE_CARACTERES && trechosUsados > 0) {
      break
    }
    texto = candidato
    trechosUsados++
  }

  return { texto, trechosUsados }
}

function montarCabecalho(pessoas: PessoaNaCall[]): string {
  if (pessoas.length === 0) {
    return 'Não há ninguém identificado na call agora.'
  }
  const nomes = pessoas.map((pessoa) => pessoa.nome).join(', ')
  return `Na call agora: ${nomes}.`
}

function formatarTrecho(trecho: TrechoRelevante, nomesPorId: Map<string, string>): string {
  const autores = trecho.autores.map((autorId) => nomesPorId.get(autorId) ?? autorId).join(' e ')
  const data = trecho.faladoEm.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `[${data}] ${autores}: ${trecho.texto}`
}
