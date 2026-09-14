import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDatabase } from '../src/main/database'
import { WorkExporter } from '../src/main/exporter'
import { FontService } from '../src/main/fonts'

const systemFont = 'C:\\Windows\\Fonts\\Inkfree.ttf'

describe('FontService', () => {
  let directory: string
  let db: AppDatabase
  let fonts: FontService

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'album-fonts-'))
    db = new AppDatabase(':memory:')
    db.migrate()
    fonts = new FontService(join(directory, 'fonts'), join(directory, 'fonts', 'fonts.json'))
  })

  afterEach(async () => {
    db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it.skipIf(!existsSync(systemFont))('imports a font and exports text through vector paths', async () => {
    const imported = await fonts.import([systemFont])
    expect(imported).toHaveLength(1)
    expect(await fonts.list()).toHaveLength(1)
    const album = db.createAlbum('字体导出')
    const work = db.createWork({ albumId: album.id, name: '字体测试', outputMode: 'pages', canvasWidth: 800, canvasHeight: 600, background: '#ffffff' })
    const page = db.createPage(work.id, 0, '#ffffff')
    db.createTextLayer(page.id, { x: 0.1, y: 0.2, width: 0.8, height: 0.3, rotation: 0, zIndex: 1, text: 'Imported 123', fontSize: 64, color: '#111111', fontFamily: imported[0].family, fontWeight: 'normal', align: 'left' })
    const exporter = new WorkExporter(db, fonts)
    const result = await exporter.exportWork(work.id, { directory, format: 'png', quality: 92, longEdge: 800, gap: 0, fileNamePrefix: 'font-export' })
    expect(result.files).toHaveLength(1)
    expect(existsSync(result.files[0])).toBe(true)
  })
})
