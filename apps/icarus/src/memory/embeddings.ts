import type { FeatureExtractionPipeline } from '@huggingface/transformers'
import { pipeline } from '@huggingface/transformers'

export const DIMENSOES = 384

let extratorPromise: Promise<FeatureExtractionPipeline> | null = null

function obterExtrator(): Promise<FeatureExtractionPipeline> {
  if (!extratorPromise) {
    extratorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  }
  return extratorPromise
}

export async function gerarEmbedding(texto: string): Promise<number[]> {
  const [embedding] = await gerarEmbeddings([texto])
  return embedding
}

export async function gerarEmbeddings(textos: string[]): Promise<number[][]> {
  const extrator = await obterExtrator()
  const saida = await extrator(textos, { pooling: 'mean', normalize: true })
  const dados = saida.tolist() as number[][]
  return dados
}

export function similaridadeCosseno(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vetores de tamanhos diferentes: ${a.length} e ${b.length}`)
  }
  let produto = 0
  for (let i = 0; i < a.length; i++) {
    produto += a[i] * b[i]
  }
  return produto
}
