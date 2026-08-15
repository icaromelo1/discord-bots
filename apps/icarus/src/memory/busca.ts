import { Trecho } from '../db/trecho.entity'
import { gerarEmbedding, similaridadeCosseno } from './embeddings'

export interface TrechoRelevante {
  texto: string
  autores: string[]
  faladoEm: Date
  escore: number
}

interface CandidatoTrecho {
  texto: string
  autores: string[]
  faladoEm: Date
  embedding: number[] | null
}

// Busca em duas etapas de propósito: o banco não tem pgvector, então quem reduz
// dezenas de milhares de trechos para algumas centenas é o pg_trgm (léxico, indexável);
// só depois disso o cosseno em memória - que exige o embedding da consulta - reordena
// o pouco que sobrou pela semântica de verdade.
export async function buscar(
  guildId: string,
  consulta: string,
  opcoes?: { limite?: number; candidatos?: number },
): Promise<TrechoRelevante[]> {
  const limite = opcoes?.limite ?? 8
  const candidatos = opcoes?.candidatos ?? 300

  const linhas = await buscarCandidatos(guildId, consulta, candidatos)
  if (linhas.length === 0) {
    return []
  }

  const embeddingConsulta = await gerarEmbedding(consulta)
  return ordenarPorSimilaridade(embeddingConsulta, linhas, limite)
}

export function ordenarPorSimilaridade(
  embeddingConsulta: number[],
  candidatos: { texto: string; autores: string[]; faladoEm: Date; embedding: number[] | null }[],
  limite: number,
): TrechoRelevante[] {
  return candidatos
    .map((candidato) => ({
      texto: candidato.texto,
      autores: candidato.autores,
      faladoEm: candidato.faladoEm,
      escore: candidato.embedding ? similaridadeCosseno(embeddingConsulta, candidato.embedding) : 0,
    }))
    .sort((a, b) => b.escore - a.escore)
    .slice(0, limite)
}

async function buscarCandidatos(guildId: string, consulta: string, candidatos: number): Promise<CandidatoTrecho[]> {
  // Import tardio de propósito: carregar o DataSource exige configuração de banco
  // (DATABASE_URL), e a função pura deste módulo (ordenarPorSimilaridade) precisa
  // ser testável sem isso.
  const { AppDataSource } = await import('../db/data-source')
  const repo = AppDataSource.getRepository(Trecho)
  const qb = repo
    .createQueryBuilder('trecho')
    .select('trecho.texto', 'texto')
    .addSelect('trecho.autores', 'autores')
    .addSelect('trecho.faladoEm', 'faladoEm')
    .addSelect('trecho.embedding', 'embedding')
    .where('trecho.guild_id = :guildId', { guildId })
    .take(candidatos)

  if (consulta.trim().length > 0) {
    qb.setParameter('consulta', consulta).orderBy('similarity(trecho.texto, :consulta)', 'DESC')
  } else {
    qb.orderBy('trecho.falado_em', 'DESC')
  }

  return qb.getRawMany<CandidatoTrecho>()
}
