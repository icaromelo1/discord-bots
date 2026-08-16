import { describe, expect, it } from 'vitest'
import { icarusCommandData, ICARUS_COMMAND_NAMES } from './comandos'

describe('icarusCommandData', () => {
  it('registra o comando /icarus com os subcomandos esperados', () => {
    expect(icarusCommandData).toHaveLength(1)

    const comando = icarusCommandData[0]
    expect(comando.name).toBe('icarus')

    const nomesDosSubcomandos = (comando.options ?? []).map((option) => option.name)
    expect(nomesDosSubcomandos.sort()).toEqual(['entrar', 'esquecer', 'memoria', 'sair', 'testar-audio'])
  })
})

describe('ICARUS_COMMAND_NAMES', () => {
  it('contém icarus', () => {
    expect(ICARUS_COMMAND_NAMES.has('icarus')).toBe(true)
    expect(ICARUS_COMMAND_NAMES.size).toBe(1)
  })
})
