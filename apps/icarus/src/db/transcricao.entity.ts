import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Uma fala transcrita. Vem de duas origens com custos diferentes: `gemini` (grátis,
 * devolvida pela própria sessão de conversa) e `whisper` (local, transcrição de
 * ambiente que roda em fila e pode atrasar minutos).
 */
@Entity({ name: 'transcricoes' })
@Index(['guildId', 'faladoEm'])
export class Transcricao {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'guild_id', type: 'text' })
  guildId!: string

  @Column({ name: 'canal_id', type: 'text' })
  canalId!: string

  @Column({ name: 'autor_id', type: 'text' })
  autorId!: string

  @Column({ name: 'autor_nome', type: 'text' })
  autorNome!: string

  @Column({ type: 'text' })
  texto!: string

  @Column({ type: 'text' })
  origem!: 'gemini' | 'whisper'

  @Column({ name: 'falado_em', type: 'timestamptz' })
  faladoEm!: Date

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date
}
