import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDatabase } from '../src/main/database'

describe('AppDatabase', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = new AppDatabase(':memory:')
    db.migrate()
  })

  afterEach(() => {
    db.close()
  })

  it('merges identical content into one asset with multiple file locations', () => {
    const firstRoot = db.createSourceRoot('C:\\photos\\a')
    const secondRoot = db.createSourceRoot('C:\\photos\\b')

    const first = db.upsertMediaLocation({
      rootId: firstRoot.id,
      absolutePath: 'C:\\photos\\a\\cover.jpg',
      relativePath: 'cover.jpg',
      contentHash: 'same-hash',
      sizeBytes: 100,
      modifiedAt: 1,
      width: 1200,
      height: 800,
      format: 'jpeg',
      capturedAt: '2026-01-01T10:00:00.000Z',
      cameraMake: 'Fujifilm',
      cameraModel: 'X-T5',
      lens: 'XF 35mm F1.4',
      focalLength: 35,
      aperture: 1.4,
      shutterSpeed: '1/250',
      iso: 200,
      orientation: 'landscape'
    })
    const second = db.upsertMediaLocation({
      rootId: secondRoot.id,
      absolutePath: 'C:\\photos\\b\\copy.jpg',
      relativePath: 'copy.jpg',
      contentHash: 'same-hash',
      sizeBytes: 100,
      modifiedAt: 2,
      width: 1200,
      height: 800,
      format: 'jpeg',
      capturedAt: '2026-01-01T10:00:00.000Z',
      cameraMake: 'Fujifilm',
      cameraModel: 'X-T5',
      lens: 'XF 35mm F1.4',
      focalLength: 35,
      aperture: 1.4,
      shutterSpeed: '1/250',
      iso: 200,
      orientation: 'landscape'
    })

    expect(second.assetId).toBe(first.assetId)
    expect(db.listMediaLocations(first.assetId)).toHaveLength(2)
    expect(db.listDuplicateAssets()).toHaveLength(1)
  })

  it('allows one asset to be referenced by multiple albums without another asset row', () => {
    const root = db.createSourceRoot('C:\\photos')
    const asset = db.upsertMediaLocation({
      rootId: root.id,
      absolutePath: 'C:\\photos\\one.jpg',
      relativePath: 'one.jpg',
      contentHash: 'unique',
      sizeBytes: 10,
      modifiedAt: 1,
      width: 100,
      height: 100,
      format: 'jpeg',
      orientation: 'square'
    })
    const travel = db.createAlbum('旅行')
    const portfolio = db.createAlbum('作品集')

    db.addAssetToAlbum(travel.id, asset.assetId)
    db.addAssetToAlbum(travel.id, asset.assetId)
    db.addAssetToAlbum(portfolio.id, asset.assetId)

    expect(db.listAlbumAssets(travel.id)).toHaveLength(1)
    expect(db.listAlbumAssets(portfolio.id)[0].assetId).toBe(asset.assetId)
    expect(db.countAssets()).toBe(1)
  })

  it('marks orphaned assets as missing when their source root is removed', () => {
    const root = db.createSourceRoot('D:\\external\\photos')
    const asset = db.upsertMediaLocation({
      rootId: root.id,
      absolutePath: 'D:\\external\\photos\\one.jpg',
      relativePath: 'one.jpg',
      contentHash: 'external-only',
      sizeBytes: 10,
      modifiedAt: 1,
      width: 100,
      height: 100,
      format: 'jpeg',
      orientation: 'square'
    })

    db.removeSourceRoot(root.id)

    expect(db.getAsset(asset.assetId)?.missing).toBe(true)
    expect(db.countAssets()).toBe(1)
  })
  it('replaces a custom template when its display name is reused', () => {
    const firstId = db.saveTemplate({ id: 'custom:first', name: '统一版式', payload: { id: 'custom:first', name: '统一版式' } })
    const secondId = db.saveTemplate({ id: 'custom:second', name: '统一版式', payload: { id: 'custom:second', name: '统一版式' } })

    expect(secondId).toBe(firstId)
    expect(db.listTemplates().filter((template) => template.name === '统一版式')).toHaveLength(1)
  })
  it('persists a work with multiple independently editable pages', () => {
    const album = db.createAlbum('夜景')
    const work = db.createWork({
      albumId: album.id,
      name: '小红书发布版',
      outputMode: 'pages',
      canvasWidth: 1080,
      canvasHeight: 1440,
      background: '#ffffff'
    })

    const cover = db.createPage(work.id, 0, '#111111')
    const body = db.createPage(work.id, 1, '#ffffff')
    db.createTextLayer(cover.id, {
      x: 80,
      y: 100,
      width: 920,
      height: 120,
      rotation: 0,
      zIndex: 2,
      text: '{{album}}',
      fontSize: 64,
      color: '#ffffff',
      fontFamily: 'Microsoft YaHei',
      fontWeight: 'bold',
      align: 'center'
    })

    expect(db.listWorks(album.id)).toHaveLength(1)
    expect(db.listPages(work.id).map((page) => page.id)).toEqual([cover.id, body.id])
    expect(db.listLayers(cover.id)[0].type).toBe('text')
  })
})