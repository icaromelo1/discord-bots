import type { DataSource } from 'typeorm'

// Mesmo motivo do config: a base compartilhada não pode importar o DataSource de um
// app específico. Cada bot tem seu próprio schema no Postgres e registra o seu aqui
// no boot.

let atual: DataSource | null = null

export function setDataSource(dataSource: DataSource): void {
  atual = dataSource
}

export function getDataSource(): DataSource {
  if (!atual) {
    throw new Error('setDataSource() não foi chamado. O app precisa registrar seu DataSource no boot.')
  }
  return atual
}

export function resetDataSource(): void {
  atual = null
}
