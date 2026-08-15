import { In, IsNull } from 'typeorm'
import { AppDataSource } from '../db/data-source'
import { Transcricao } from '../db/transcricao.entity'
import { Trecho } from '../db/trecho.entity'

export interface FalaParaSalvar {
  guildId: string
  canalId: string
  autorId: string
  autorNome: string
  texto: string
  origem: 'gemini' | 'whisper'
  faladoEm: Date
}

export async function salvarFala(fala: FalaParaSalvar): Promise<string> {
  const repo = AppDataSource.getRepository(Transcricao)
  const transcricao = repo.create(fala)
  const salva = await repo.save(transcricao)
  return salva.id
}

export async function trechosPendentes(limite = 20): Promise<Trecho[]> {
  const repo = AppDataSource.getRepository(Trecho)
  return repo.find({
    where: { embedding: IsNull() },
    take: limite,
  })
}

export async function salvarEmbedding(trechoId: string, embedding: number[]): Promise<void> {
  const repo = AppDataSource.getRepository(Trecho)
  await repo.update({ id: trechoId }, { embedding })
}

export async function criarTrechoDeFalas(guildId: string, transcricaoIds: string[]): Promise<string> {
  const transcricaoRepo = AppDataSource.getRepository(Transcricao)
  const falas = await transcricaoRepo.find({ where: { id: In(transcricaoIds) } })
  if (falas.length === 0) {
    throw new Error('Nenhuma transcrição encontrada para os ids informados')
  }
  falas.sort((a, b) => a.faladoEm.getTime() - b.faladoEm.getTime())

  const texto = falas.map((fala) => fala.texto).join('\n')
  const autores = [...new Set(falas.map((fala) => fala.autorId))]
  const faladoEm = falas[0].faladoEm

  const trechoRepo = AppDataSource.getRepository(Trecho)
  const trecho = trechoRepo.create({
    guildId,
    transcricaoId: falas[0].id,
    texto,
    autores,
    faladoEm,
    embedding: null,
  })
  const salvo = await trechoRepo.save(trecho)
  return salvo.id
}

export async function esquecerUsuario(guildId: string, autorId: string): Promise<number> {
  const repo = AppDataSource.getRepository(Transcricao)
  const resultado = await repo.delete({ guildId, autorId })
  return resultado.affected ?? 0
}

export async function resumoDoQueSabe(
  guildId: string,
  autorId: string,
): Promise<{ falas: number; primeira: Date | null; ultima: Date | null }> {
  const repo = AppDataSource.getRepository(Transcricao)
  const resultado = await repo
    .createQueryBuilder('transcricao')
    .select('COUNT(*)', 'falas')
    .addSelect('MIN(transcricao.falado_em)', 'primeira')
    .addSelect('MAX(transcricao.falado_em)', 'ultima')
    .where('transcricao.guild_id = :guildId', { guildId })
    .andWhere('transcricao.autor_id = :autorId', { autorId })
    .getRawOne<{ falas: string; primeira: Date | null; ultima: Date | null }>()

  return {
    falas: Number(resultado?.falas ?? 0),
    primeira: resultado?.primeira ? new Date(resultado.primeira) : null,
    ultima: resultado?.ultima ? new Date(resultado.ultima) : null,
  }
}
