import * as fs from 'node:fs'
import * as path from 'node:path'
import { getSharedConfig } from '../config'

export class MusicCache {
  private readonly dirFixo: string | null
  private garantido = false

  constructor(dir?: string) {
    this.dirFixo = dir ? path.resolve(dir) : null
  }

  // A configuração é lida aqui, e não no construtor: a instância padrão é criada no
  // carregamento do módulo, antes de o app chamar configureShared().
  dirPath(): string {
    const dir = this.dirFixo ?? path.resolve(getSharedConfig().library.cacheDir)
    if (!this.garantido) {
      fs.mkdirSync(dir, { recursive: true })
      this.garantido = true
    }
    return dir
  }

  localPath(fileName: string): string {
    return path.join(this.dirPath(), fileName)
  }

  has(fileName: string): boolean {
    return fs.existsSync(this.localPath(fileName))
  }

  touch(fileName: string): void {
    const target = this.localPath(fileName)
    if (!fs.existsSync(target)) return
    const now = new Date()
    fs.utimesSync(target, now, now)
  }

  remove(fileName: string): void {
    const target = this.localPath(fileName)
    if (fs.existsSync(target)) fs.unlinkSync(target)
  }
}

export const musicCache = new MusicCache()
