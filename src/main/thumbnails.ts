import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { AppDatabase } from './database'

export class ThumbnailService {
  private readonly pending = new Map<string, Promise<string>>()

  constructor(
    private readonly db: AppDatabase,
    private readonly cacheDirectory: string
  ) {}

  getThumbnail(assetId: string, maxSize = 320): Promise<string> {
    return this.getCachedImage(assetId, maxSize, 78)
  }

  getPreview(assetId: string, maxSize = 1600): Promise<string> {
    return this.getCachedImage(assetId, maxSize, 86)
  }

  async enforceCacheLimit(maxBytes: number): Promise<{ deleted: number; freedBytes: number }> {
    let entries: Array<{ path: string; size: number; modifiedAt: number }>
    try {
      const names = await readdir(this.cacheDirectory)
      entries = await Promise.all(names.filter((name) => name.endsWith('.webp')).map(async (name) => {
        const path = join(this.cacheDirectory, name)
        const info = await stat(path)
        return { path, size: info.size, modifiedAt: info.mtimeMs }
      }))
    } catch {
      return { deleted: 0, freedBytes: 0 }
    }

    let total = entries.reduce((sum, entry) => sum + entry.size, 0)
    let deleted = 0
    let freedBytes = 0
    for (const entry of entries.sort((left, right) => left.modifiedAt - right.modifiedAt)) {
      if (total <= Math.max(0, maxBytes)) break
      await unlink(entry.path).catch(() => undefined)
      total -= entry.size
      freedBytes += entry.size
      deleted += 1
    }
    return { deleted, freedBytes }
  }
  private getCachedImage(assetId: string, maxSize: number, quality: number): Promise<string> {
    const key = `${assetId}:${maxSize}`
    const existing = this.pending.get(key)
    if (existing) return existing
    const task = this.generate(assetId, maxSize, quality).finally(() => this.pending.delete(key))
    this.pending.set(key, task)
    return task
  }

  private async generate(assetId: string, maxSize: number, quality: number): Promise<string> {
    const asset = this.db.getAsset(assetId)
    const location = this.db.getPreferredLocation(assetId)
    if (!asset || !location) throw new Error('照片文件不可用')

    await mkdir(this.cacheDirectory, { recursive: true })
    const safeSize = Math.max(64, Math.min(4096, Math.round(maxSize)))
    const cachePath = join(this.cacheDirectory, `${assetId}_${asset.contentHash.slice(0, 12)}_${safeSize}.webp`)
    try {
      const info = await stat(cachePath)
      if (info.size > 0) return cachePath
    } catch {
      // Cache miss.
    }

    const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`
    try {
      await sharp(location.absolutePath, { failOn: 'none' })
        .rotate()
        .resize({ width: safeSize, height: safeSize, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toFile(temporaryPath)
      await rename(temporaryPath, cachePath)
      return cachePath
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }
}