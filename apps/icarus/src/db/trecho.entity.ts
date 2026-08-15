import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { Transcricao } from './transcricao.entity'

/**
 * Pedaço de conversa com embedding, para busca semântica.
 *
 * O embedding é `real[]` e não `vector`: o Postgres compartilhado desta VM não tem
 * pgvector, e instalar significaria trocar a imagem de um banco que outros serviços
 * usam. Na escala deste bot (~70 mil trechos em um ano) o cosseno em força bruta
 * custa dezenas de milissegundos — o mesmo caminho que o Oráculo já segue.
 */
@Entity({ name: 'trechos' })
@Index(['guildId'])
export class Trecho {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'guild_id', type: 'text' })
  guildId!: string

  @ManyToOne(() => Transcricao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transcricao_id' })
  transcricao!: Transcricao

  @Column({ name: 'transcricao_id', type: 'uuid' })
  transcricaoId!: string

  @Column({ type: 'text' })
  texto!: string

  @Column({ name: 'autores', type: 'text', array: true, default: () => "'{}'" })
  autores!: string[]

  @Column({ type: 'real', array: true, nullable: true })
  embedding!: number[] | null

  @Column({ name: 'falado_em', type: 'timestamptz' })
  faladoEm!: Date
}
