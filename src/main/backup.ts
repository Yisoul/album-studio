import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppDatabase } from './database'

export class BackupService {
  constructor(
    private readonly db: AppDatabase,
    private readonly databasePath: string,
    private readonly backupDirectory: string,
    private readonly keep = 7
  ) {}

  async createBackup(at = new Date()): Promise<string> {
    await mkdir(this.backupDirectory, { recursive: true })
    this.db.checkpoint()
    const timestamp = at.toISOString().replaceAll(':', '-').replaceAll('.', '-')
    const destination = join(this.backupDirectory, `library-${timestamp}.sqlite`)
    await copyFile(this.databasePath, destination)
    await this.prune()
    return destination
  }

  private async prune(): Promise<void> {
    const files = (await readdir(this.backupDirectory))
      .filter((file) => /^library-.*\.sqlite$/.test(file))
      .sort()
      .reverse()
    await Promise.all(files.slice(this.keep).map((file) => rm(join(this.backupDirectory, file), { force: true })))
  }
}