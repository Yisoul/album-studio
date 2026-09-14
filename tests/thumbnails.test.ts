import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDatabase } from '../src/main/database'
import { ThumbnailService } from '../src/main/thumbnails'

describe('ThumbnailService', () => {
  let directory: string
  let db: AppDatabase
  let assetId: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'album-thumb-'))
    db = new AppDatabase(':memory:')
    db.migrate()
    const root = db.createSourceRoot(directory)
    const source = join(directory, 'large.png')
    await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#557799' } }).png().toFile(source)
    assetId = db.upsertMediaLocation({
      rootId: root.id,
      absolutePath: source,
      relativePath: 'large.png',
      contentHash: 'thumbnail-source',
      sizeBytes: 100,
      modifiedAt: 1,
      width: 2400,
      height: 1600,
      format: 'png',
      orientation: 'landscape'
    }).assetId
  })

  afterEach(async () => {
    db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('evicts old cache files when the configured size limit is exceeded', async () => {
    const service = new ThumbnailService(db, join(directory, 'cache'))
    const thumbnail = await service.getThumbnail(assetId, 320)

    const result = await service.enforceCacheLimit(1)

    expect(result.deleted).toBeGreaterThan(0)
    await expect(stat(thumbnail)).rejects.toThrow()
  })
  it('creates and reuses a bounded WebP thumbnail', async () => {
    const service = new ThumbnailService(db, join(directory, 'cache'))
    const first = await service.getThumbnail(assetId, 320)
    const second = await service.getThumbnail(assetId, 320)
    const metadata = await sharp(await readFile(first)).metadata()
    const file = await stat(first)

    expect(first).toBe(second)
    expect(file.size).toBeGreaterThan(0)
    expect(metadata.format).toBe('webp')
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(320)
  })
})