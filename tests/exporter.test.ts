import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDatabase } from '../src/main/database'
import { WorkExporter } from '../src/main/exporter'

describe('WorkExporter', () => {
  let directory: string
  let db: AppDatabase
  let exporter: WorkExporter
  let assetId: string
  let albumId: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'album-export-'))
    db = new AppDatabase(':memory:')
    db.migrate()
    const root = db.createSourceRoot(directory)
    const source = join(directory, 'source.jpg')
    await sharp({ create: { width: 400, height: 600, channels: 3, background: '#d97757' } }).jpeg().toFile(source)
    assetId = db.upsertMediaLocation({
      rootId: root.id,
      absolutePath: source,
      relativePath: 'source.jpg',
      contentHash: 'export-source',
      sizeBytes: 100,
      modifiedAt: 1,
      width: 400,
      height: 600,
      format: 'jpeg',
      orientation: 'portrait'
    }).assetId
    albumId = db.createAlbum('导出测试').id
    db.addAssetToAlbum(albumId, assetId)
    exporter = new WorkExporter(db)
  })

  afterEach(async () => {
    db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('exports a multi-page work as correctly sized image files', async () => {
    const work = db.createWork({ albumId, name: '多页', outputMode: 'pages', canvasWidth: 1080, canvasHeight: 1440, background: '#ffffff' })
    const page = db.createPage(work.id, 0, '#ffffff')
    db.createImageLayer(page.id, { assetId, x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0, zIndex: 1, fit: 'cover', radius: 0 })

    const result = await exporter.exportWork(work.id, { directory, format: 'jpeg', quality: 92, longEdge: 1080, gap: 0, fileNamePrefix: '测试' })
    expect(result.files).toHaveLength(1)
    const metadata = await sharp(result.files[0]).metadata()
    expect(metadata.width).toBe(1080)
    expect(metadata.height).toBe(1440)
  })

  it('combines pages into a long image with the requested gap', async () => {
    const work = db.createWork({ albumId, name: '长图', outputMode: 'long_image', canvasWidth: 1080, canvasHeight: 1440, background: '#ffffff' })
    const firstPage = db.createPage(work.id, 0, '#ffffff')
    const secondPage = db.createPage(work.id, 1, '#eeeeee')
    db.createImageLayer(firstPage.id, { assetId, x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1, fit: 'cover', radius: 0 })
    db.createImageLayer(secondPage.id, { assetId, x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1, fit: 'cover', radius: 0 })

    const result = await exporter.exportWork(work.id, { directory, format: 'png', quality: 92, longEdge: 1080, gap: 24, fileNamePrefix: '长图测试' })
    expect(result.files).toHaveLength(1)
    const metadata = await sharp(result.files[0]).metadata()
    expect(metadata.width).toBe(1080)
    expect(metadata.height).toBe(2904)
  })
})