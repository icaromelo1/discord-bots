import 'reflect-metadata'

async function main(): Promise<void> {
  throw new Error('bootstrap ainda não implementado')
}

main().catch((error) => {
  console.error('[discord-dj] falha no boot:', error)
  process.exit(1)
})
