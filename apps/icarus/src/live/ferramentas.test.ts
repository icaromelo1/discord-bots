import { describe, expect, it } from 'vitest'
import { declaracoesDeFerramentas } from './ferramentas'

describe('declarações de ferramentas', () => {
  it('expõe as ações que o modelo precisa para agir, não só conversar', () => {
    const nomes = declaracoesDeFerramentas.map((d) => d.name)
    expect(nomes).toEqual(['tocar', 'pular', 'pausar', 'parar', 'ver_fila', 'lembrar'])
  })

  it('tocar exige o termo de busca — sem ele o modelo chamaria a ação vazia', () => {
    const tocar = declaracoesDeFerramentas.find((d) => d.name === 'tocar')
    expect(tocar?.parameters?.required).toEqual(['busca'])
  })

  it('lembrar exige o assunto', () => {
    const lembrar = declaracoesDeFerramentas.find((d) => d.name === 'lembrar')
    expect(lembrar?.parameters?.required).toEqual(['assunto'])
  })

  it('toda ferramenta tem descrição — é por ela que o modelo decide quando usar', () => {
    for (const d of declaracoesDeFerramentas) {
      expect(d.description, `${d.name} sem descrição`).toBeTruthy()
      expect(d.description!.length).toBeGreaterThan(20)
    }
  })

  it('ações sem argumento declaram objeto vazio, não undefined', () => {
    for (const nome of ['pular', 'pausar', 'parar', 'ver_fila']) {
      const d = declaracoesDeFerramentas.find((x) => x.name === nome)
      expect(d?.parameters?.properties).toEqual({})
    }
  })
})
