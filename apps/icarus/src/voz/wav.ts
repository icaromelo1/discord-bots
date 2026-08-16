/**
 * Extrai o PCM de um WAV, pulando o cabeçalho.
 *
 * O piper devolve WAV; o navegador e a Live API trabalham com PCM cru. Procurar o bloco
 * `data` em vez de assumir 44 bytes evita quebrar quando o arquivo traz blocos extras
 * (LIST, fact), que alguns geradores incluem.
 */
export function extrairPcmDeWav(wav: Buffer): Buffer {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF') return wav

  let posicao = 12
  while (posicao + 8 <= wav.length) {
    const bloco = wav.toString('ascii', posicao, posicao + 4)
    const tamanho = wav.readUInt32LE(posicao + 4)
    if (bloco === 'data') return wav.subarray(posicao + 8, Math.min(posicao + 8 + tamanho, wav.length))
    posicao += 8 + tamanho + (tamanho % 2)
  }

  return wav
}

/** Taxa de amostragem declarada no cabeçalho — o piper varia conforme a voz. */
export function taxaDoWav(wav: Buffer): number {
  if (wav.length < 28 || wav.toString('ascii', 0, 4) !== 'RIFF') return 22_050
  return wav.readUInt32LE(24)
}
