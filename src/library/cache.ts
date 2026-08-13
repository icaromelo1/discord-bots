import * as fs from 'node:fs'
import * as path from 'node:path'
import { config } from '../config'

export class MusicCache {
  private readonly dir: string

  constructor(dir: string = config.library.cacheDir) {
    this.dir = path.resolve(dir)
    fs.mkdirSync(this.dir, { recursive: true })
  }

  dirPath(): string {
    return this.dir
  }

  localPath(fileName: string): string {
    return path.join(this.dir, fileName)
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
