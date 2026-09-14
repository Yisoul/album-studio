import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDatabase } from '../src/main/database'
import { BackupService } from '../src/main/backup'

describe('BackupService', () => {
  let directory: string
  let dbPath: string
  let db: AppDatabase

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'album-backup-'))
    dbPath = join(directory, 'library.sqlite')
    db = new AppDatabase(dbPath)
    db.migrate()
    db.createSourceRoot(join(directory, 'photos'))
  })

  afterEach(async () => {
    db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('creates timestamped database backups and keeps only the newest seven', async () => {
    const service = new BackupService(db, dbPath, join(directory, 'backups'), 7)
    for (let index = 0; index < 8; index += 1) {
      await service.createBackup(new Date(2026, 0, index + 1, 12, 0, 0))
    }

    const files = await readdir(join(directory, 'backups'))
    expect(files).toHaveLength(7)
    expect(files.some((file) => file.includes('2026-01-01'))).toBe(false)
    expect(files.some((file) => file.includes('2026-01-08'))).toBe(true)
  })
})