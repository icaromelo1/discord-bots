export class Ducking {
  constructor(
    private readonly url: string | null,
    private readonly volumeAoFalar: number,
  ) {}

  async abaixar(guildId: string): Promise<void> {
    await this.enviar(guildId, this.volumeAoFalar)
  }

  async restaurar(guildId: string): Promise<void> {
    await this.enviar(guildId, 1)
  }

  // Falha do DJ nunca pode impedir o Icarus de falar: ducking é conforto, não requisito.
  // Qualquer erro (DJ fora do ar, timeout, guild não tocando nada) é só logado e engolido.
  private async enviar(guildId: string, volume: number): Promise<void> {
    if (!this.url) return

    try {
      await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId, volume }),
        signal: AbortSignal.timeout(1_500),
      })
    } catch (error) {
      console.error('[icarus] falha ao pedir ducking ao DJ:', error)
    }
  }
}
