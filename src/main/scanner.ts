import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, opendir, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import * as exifr from 'exifr'
import sharp from 'sharp'
import type { AppDatabase, MediaLocationInput, Orientation, SourceRoot } from './database'

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', '$recycle.bin', 'system volume information'])

export interface ScanProgress {
  rootId: string
  phase: 'scanning' | 'reading' | 'complete' | 'error' | 'error'
  discovered: number
  processed: number
  indexed: number
  errors: number
  message?: string
}

export interface ScanResult {
  discovered: number
  indexed: number
  errors: string[]
}

interface ExifRecord {
  DateTimeOriginal?: Date
  CreateDate?: Date
  Make?: string
  Model?: string
  LensModel?: string
  FocalLength?: number
  FNumber?: number
  ExposureTime?: number
  ISO?: number
}

export async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
}

export class LibraryScanner {
  private readonly watchers = new Map<string, FSWatcher>()
  private readonly scanTimers = new Map<string, NodeJS.Timeout>()

  constructor(private readonly db: AppDatabase) {}

  async scanRoot(
    root: SourceRoot,
    onProgress?: (progress: ScanProgress) => void
  ): Promise<ScanResult> {
    const errors: string[] = []
    let discovered = 0
    let processed = 0
    let indexed = 0

    try {
      await access(root.path)
    } catch (error) {
      errors.push(`${root.path}: ${error instanceof Error ? error.message : String(error)}`)
      onProgress?.({ rootId: root.id, phase: 'error', discovered, processed, indexed, errors: errors.length, message: '来源目录当前不可用' })
      return { discovered, indexed, errors }
    }

    this.db.markRootLocationsMissing(root.id)
    const files = await this.collectSupportedFiles(root.path, errors)
    discovered = files.length
    onProgress?.({ rootId: root.id, phase: 'scanning', discovered, processed, indexed, errors: errors.length })

    await mapLimit(files, Math.max(1, Math.min(4, (await import('node:os')).cpus().length - 1)), async (filePath) => {
      try {
        await this.indexFile(root, filePath)
        indexed += 1
      } catch (error) {
        errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        processed += 1
        onProgress?.({ rootId: root.id, phase: 'reading', discovered, processed, indexed, errors: errors.length })
      }
    })

    onProgress?.({ rootId: root.id, phase: 'complete', discovered, processed, indexed, errors: errors.length })
    return { discovered, indexed, errors }
  }

  async scanAll(
    roots: SourceRoot[],
    onProgress?: (progress: ScanProgress) => void
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = []
    for (const root of roots) {
      if (root.enabled) results.push(await this.scanRoot(root, onProgress))
    }
    return results
  }

  watchRoot(root: SourceRoot, onChanged?: (root: SourceRoot) => void): void {
    this.unwatchRoot(root.id)
    const watcher = watch(root.path, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
      ignored: (path) => {
        const name = basename(path).toLowerCase()
        return IGNORED_DIRECTORIES.has(name)
      }
    })

    watcher.on('all', (_event, changedPath) => {
      if (changedPath && !SUPPORTED_EXTENSIONS.has(extname(changedPath).toLowerCase())) return
      const existing = this.scanTimers.get(root.id)
      if (existing) clearTimeout(existing)
      this.scanTimers.set(root.id, setTimeout(() => {
        this.scanTimers.delete(root.id)
        void this.scanRoot(root).then(() => onChanged?.(root))
      }, 900))
    })

    this.watchers.set(root.id, watcher)
  }

  async close(): Promise<void> {
    for (const timer of this.scanTimers.values()) clearTimeout(timer)
    this.scanTimers.clear()
    await Promise.all([...this.watchers.values()].map((watcher) => watcher.close()))
    this.watchers.clear()
  }

  private unwatchRoot(rootId: string): void {
    const timer = this.scanTimers.get(rootId)
    if (timer) clearTimeout(timer)
    this.scanTimers.delete(rootId)
    const watcher = this.watchers.get(rootId)
    if (watcher) void watcher.close()
    this.watchers.delete(rootId)
  }

  private async collectSupportedFiles(rootPath: string, errors: string[]): Promise<string[]> {
    const files: string[] = []
    const visit = async (directory: string): Promise<void> => {
      let handle
      try {
        handle = await opendir(directory)
      } catch (error) {
        errors.push(`${directory}: ${error instanceof Error ? error.message : String(error)}`)
        return
      }

      try {
        for await (const entry of handle) {
          if (entry.name.startsWith('.') || IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) continue
          const childPath = join(directory, entry.name)
          if (entry.isDirectory()) {
            await visit(childPath)
          } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
            files.push(childPath)
          }
        }
      } catch (error) {
        errors.push(`${directory}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    await visit(rootPath)
    return files
  }

  private async indexFile(root: SourceRoot, filePath: string): Promise<void> {
    if (this.db.isPathIgnored(filePath)) return
    const fileStat = await stat(filePath)
    const metadata = await sharp(filePath, { failOn: 'none' }).metadata()
    if (!metadata.width || !metadata.height) throw new Error('无法读取图片尺寸')

    const exif = await this.readExif(filePath)
    const contentHash = await hashFile(filePath)
    const orientation = normalizeOrientation(metadata.orientation, metadata.width, metadata.height)
    const input: MediaLocationInput = {
      rootId: root.id,
      absolutePath: filePath,
      relativePath: relative(root.path, filePath),
      contentHash,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtimeMs,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format ?? extname(filePath).slice(1).toLowerCase(),
      capturedAt: normalizeDate(exif.DateTimeOriginal ?? exif.CreateDate),
      cameraMake: exif.Make ?? null,
      cameraModel: exif.Model ?? null,
      lens: exif.LensModel ?? null,
      focalLength: finiteOrNull(exif.FocalLength),
      aperture: finiteOrNull(exif.FNumber),
      shutterSpeed: formatExposure(exif.ExposureTime),
      iso: finiteOrNull(exif.ISO),
      orientation
    }
    this.db.upsertMediaLocation(input)
  }

  private async readExif(path: string): Promise<ExifRecord> {
    try {
      const parsed = await exifr.parse(path, {
        tiff: true,
        exif: true,
        gps: false,
        interop: false,
        ifd1: false
      })
      return (parsed ?? {}) as ExifRecord
    } catch {
      return {}
    }
  }
}

function normalizeOrientation(value: number | undefined, width: number, height: number): Orientation {
  if (value && [5, 6, 7, 8].includes(value)) return 'portrait'
  if (width === height) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

function normalizeDate(value: Date | undefined): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatExposure(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  if (value >= 1) return `${Number(value.toFixed(2))}s`
  return `1/${Math.max(1, Math.round(1 / value))}`
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      await worker(items[index])
    }
  })
  await Promise.all(runners)
}