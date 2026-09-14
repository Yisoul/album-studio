import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import fontkit from 'fontkit'
import type { CustomFont } from '../shared/types'

const SUPPORTED_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2'])

interface StoredFont extends CustomFont {
  fileName: string
  originalName: string
}

export class FontService {
  constructor(private readonly directory: string, private readonly catalogPath: string) {}

  async list(): Promise<CustomFont[]> {
    const stored = await this.readCatalog()
    return stored.map(({ id, name, family }) => ({ id, name, family }))
  }

  async import(paths: string[]): Promise<CustomFont[]> {
    await mkdir(this.directory, { recursive: true })
    const stored = await this.readCatalog()
    const added: StoredFont[] = []
    for (const sourcePath of paths) {
      const extension = extname(sourcePath).toLowerCase()
      if (!SUPPORTED_EXTENSIONS.has(extension)) continue
      const info = await stat(sourcePath)
      if (!info.isFile()) continue
      const id = randomUUID()
      const fileName = `${id}${extension}`
      const destination = join(this.directory, fileName)
      await copyFile(sourcePath, destination)
      let family = basename(sourcePath, extension)
      try {
        const opened = fontkit.openSync(destination) as { familyName?: string; fonts?: Array<{ familyName?: string }> }
        family = opened.fonts?.[0]?.familyName || opened.familyName || family
      } catch { /* Keep the file name as the display family. */ }
      added.push({ id, name: basename(sourcePath), family, fileName, originalName: basename(sourcePath) })
    }
    if (added.length > 0) await this.writeCatalog([...stored, ...added])
    return added.map(({ id, name, family }) => ({ id, name, family }))
  }

  async remove(id: string): Promise<void> {
    const stored = await this.readCatalog()
    const target = stored.find((font) => font.id === id)
    if (!target) return
    await rm(join(this.directory, target.fileName), { force: true })
    await this.writeCatalog(stored.filter((font) => font.id !== id))
  }

  async getPath(id: string): Promise<string | null> {
    const stored = await this.readCatalog()
    const target = stored.find((font) => font.id === id)
    return target ? join(this.directory, target.fileName) : null
  }

  async getPathForFamily(family: string): Promise<string | null> {
    const stored = await this.readCatalog()
    const target = [...stored].reverse().find((font) => font.family === family)
    return target ? join(this.directory, target.fileName) : null
  }

  async mimeType(id: string): Promise<string> {
    const path = await this.getPath(id)
    if (!path) return 'application/octet-stream'
    const extension = extname(path).toLowerCase()
    if (extension === '.otf') return 'font/otf'
    if (extension === '.woff') return 'font/woff'
    if (extension === '.woff2') return 'font/woff2'
    return 'font/ttf'
  }

  private async readCatalog(): Promise<StoredFont[]> {
    try {
      const parsed = JSON.parse(await readFile(this.catalogPath, 'utf8')) as StoredFont[]
      const existing: StoredFont[] = []
      for (const font of parsed) {
        try { if ((await stat(join(this.directory, font.fileName))).isFile()) existing.push(font) } catch { /* Skip missing font files. */ }
      }
      return existing
    } catch { return [] }
  }

  private async writeCatalog(fonts: StoredFont[]): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    await writeFile(this.catalogPath, JSON.stringify(fonts, null, 2), 'utf8')
  }
}
