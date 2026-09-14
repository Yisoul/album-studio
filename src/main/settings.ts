import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AppSettings } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  thumbnailCacheLimitGb: 10,
  autoWatch: true
}

export class SettingsService {
  constructor(private readonly filePath: string) {}

  async get(): Promise<AppSettings> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<AppSettings>
      return {
        thumbnailCacheLimitGb: clamp(parsed.thumbnailCacheLimitGb ?? DEFAULT_SETTINGS.thumbnailCacheLimitGb, 1, 100),
        autoWatch: parsed.autoWatch ?? DEFAULT_SETTINGS.autoWatch
      }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  async save(settings: AppSettings): Promise<AppSettings> {
    const normalized: AppSettings = {
      thumbnailCacheLimitGb: clamp(settings.thumbnailCacheLimitGb, 1, 100),
      autoWatch: Boolean(settings.autoWatch)
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(normalized, null, 2), 'utf8')
    return normalized
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}