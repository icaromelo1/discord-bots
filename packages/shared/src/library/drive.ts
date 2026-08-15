import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getSharedConfig } from '../config'

const execFileAsync = promisify(execFile)
const EXEC_OPTS = { maxBuffer: 10 * 1024 * 1024, timeout: 5 * 60 * 1000 }

export class DriveStorage {
  private readonly remoteFixo: string | null
  private readonly configPathFixo: string | null | undefined

  constructor(remote?: string, configPath?: string | null) {
    this.remoteFixo = remote ?? null
    this.configPathFixo = configPath
  }

  // Lidos por chamada, e não no construtor: a instância padrão nasce no carregamento
  // do módulo, antes de configureShared().
  private get remote(): string {
    return this.remoteFixo ?? getSharedConfig().library.driveRemote
  }

  private get configPath(): string | null {
    return this.configPathFixo !== undefined ? this.configPathFixo : getSharedConfig().library.rcloneConfigPath
  }

  private args(extra: string[]): string[] {
    return this.configPath ? ['--config', this.configPath, ...extra] : extra
  }

  async upload(localPath: string, fileName: string): Promise<void> {
    await execFileAsync('rclone', this.args(['copyto', localPath, `${this.remote}/${fileName}`]), EXEC_OPTS)
  }

  async download(fileName: string, destPath: string): Promise<void> {
    await execFileAsync('rclone', this.args(['copyto', `${this.remote}/${fileName}`, destPath]), EXEC_OPTS)
  }

  async deleteFile(fileName: string): Promise<void> {
    await execFileAsync('rclone', this.args(['deletefile', `${this.remote}/${fileName}`]), EXEC_OPTS)
  }

  async listFiles(): Promise<string[]> {
    const { stdout } = await execFileAsync('rclone', this.args(['lsf', this.remote]), EXEC_OPTS)
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  }
}

export const driveStorage = new DriveStorage()
