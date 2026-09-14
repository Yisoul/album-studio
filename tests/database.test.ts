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
  it('sorts library results by capture time or file name', () => {
    const root = db.createSourceRoot('C:\\sort-photos')
    db.upsertMediaLocation({
      rootId: root.id, absolutePath: 'C:\\sort-photos\\b.jpg', relativePath: 'b.jpg', contentHash: 'sort-b',
      sizeBytes: 10, modifiedAt: 1, width: 100, height: 100, format: 'jpeg', capturedAt: '2026-02-01T00:00:00.000Z', orientation: 'square'
    })
    db.upsertMediaLocation({
      rootId: root.id, absolutePath: 'C:\\sort-photos\\a.jpg', relativePath: 'a.jpg', contentHash: 'sort-a',
      sizeBytes: 10, modifiedAt: 1, width: 100, height: 100, format: 'jpeg', capturedAt: '2026-01-01T00:00:00.000Z', orientation: 'square'
    })

    db.upsertMediaLocation({
      rootId: root.id, absolutePath: 'C:\\sort-photos\\unknown.jpg', relativePath: 'unknown.jpg', contentHash: 'sort-unknown',
      sizeBytes: 10, modifiedAt: 1, width: 100, height: 100, format: 'jpeg', orientation: 'square'
    })

    expect(db.searchAssets({ limit: 20, offset: 0, sort: 'captured_desc' }).items.map((item) => item.primaryPath)).toEqual(['C:\\sort-photos\\b.jpg', 'C:\\sort-photos\\a.jpg', 'C:\\sort-photos\\unknown.jpg'])
    expect(db.searchAssets({ limit: 20, offset: 0 }).items.map((item) => item.primaryPath)[0]).toBe('C:\\sort-photos\\b.jpg')
    expect(db.searchAssets({ limit: 20, offset: 0, sort: 'filename_asc' }).items.map((item) => item.primaryPath)).toEqual(['C:\\sort-photos\\a.jpg', 'C:\\sort-photos\\b.jpg', 'C:\\sort-photos\\unknown.jpg'])
  })
  it('filters by file name, camera, and lens independently', () => {
    const root = db.createSourceRoot('C:\\filter-photos')
    db.upsertMediaLocation({
      rootId: root.id, absolutePath: 'C:\\filter-photos\\sunset-a.jpg', relativePath: 'sunset-a.jpg', contentHash: 'filter-a',
      sizeBytes: 10, modifiedAt: 1, width: 100, height: 100, format: 'jpeg', capturedAt: '2026-03-01T00:00:00.000Z', cameraMake: 'Sony', cameraModel: 'ILCE-7M4', lens: 'FE 24-70mm F2.8 GM II', orientation: 'square'
    })
    db.upsertMediaLocation({
      rootId: root.id, absolutePath: 'C:\\filter-photos\\portrait-b.jpg', relativePath: 'portrait-b.jpg', contentHash: 'filter-b',
      sizeBytes: 10, modifiedAt: 1, width: 100, height: 100, format: 'jpeg', capturedAt: '2026-02-01T00:00:00.000Z', cameraMake: 'Canon', cameraModel: 'EOS R5', lens: 'RF 50mm F1.2 L USM', orientation: 'square'
    })

    expect(db.searchAssets({ limit: 20, offset: 0, text: 'sunset' }).items.map((item) => item.primaryPath)).toEqual(['C:\\filter-photos\\sunset-a.jpg'])
    expect(db.searchAssets({ limit: 20, offset: 0, cameraModel: 'Sony' }).items.map((item) => item.cameraModel)).toEqual(['ILCE-7M4'])
    expect(db.searchAssets({ limit: 20, offset: 0, cameraModel: '7M4' }).items.map((item) => item.primaryPath)).toEqual(['C:\\filter-photos\\sunset-a.jpg'])
    expect(db.searchAssets({ limit: 20, offset: 0, lens: 'RF 50mm' }).items.map((item) => item.primaryPath)).toEqual(['C:\\filter-photos\\portrait-b.jpg'])
  })

  it('lists physical folders and filters photos by selected folder', () => {
    const root = db.createSourceRoot('I:\\folder-tree')
    db.upsertMediaLocation({ rootId: root.id, absolutePath: 'I:\\folder-tree\\one\\a.jpg', relativePath: 'one\\a.jpg', contentHash: 'dir-one', sizeBytes: 10, modifiedAt: 1, width: 100, height: 100, format: 'jpeg', orientation: 'square' })
    db.upsertMediaLocation({ rootId: root.id, absolutePath: 'I:\\folder-tree\\two\\b.jpg', relativePath: 'two\\b.jpg', contentHash: 'dir-two', sizeBytes: 10, modifiedAt: 1, width: 100, height: 100, format: 'jpeg', orientation: 'square' })

    const folders = db.listFolders()
    expect(folders.map((folder) => folder.name)).toEqual(['one', 'two'])
    expect(db.searchAssets({ limit: 20, offset: 0, folderPaths: ['I:\\folder-tree\\two'] }).items[0].primaryDirectoryPath).toBe('I:\\folder-tree\\two')
  })
  it('can limit library searches to selected source folders', () => {
    const firstRoot = db.createSourceRoot('C:\\folder-a')
    const secondRoot = db.createSourceRoot('C:\\folder-b')
    db.upsertMediaLocation({
      rootId: firstRoot.id,
      absolutePath: 'C:\\folder-a\\one.jpg',
      relativePath: 'one.jpg',
      contentHash: 'folder-a-photo',
      sizeBytes: 10,
      modifiedAt: 1,
      width: 100,
      height: 100,
      format: 'jpeg',
      orientation: 'square'
    })
    db.upsertMediaLocation({
      rootId: secondRoot.id,
      absolutePath: 'C:\\folder-b\\two.jpg',
      relativePath: 'two.jpg',
      contentHash: 'folder-b-photo',
      sizeBytes: 10,
      modifiedAt: 1,
      width: 100,
      height: 100,
      format: 'jpeg',
      orientation: 'square'
    })

    expect(db.searchAssets({ limit: 20, offset: 0, rootIds: [firstRoot.id] }).total).toBe(1)
    expect(db.searchAssets({ limit: 20, offset: 0, rootIds: [firstRoot.id, secondRoot.id] }).total).toBe(2)
  })
  it('keeps photos searchable while a source root is only disabled', () => {
    const root = db.createSourceRoot('E:\\disabled\\photos')
    const asset = db.upsertMediaLocation({
      rootId: root.id,
      absolutePath: 'E:\\disabled\\photos\\one.jpg',
      relativePath: 'one.jpg',
      contentHash: 'disabled-only',
      sizeBytes: 10,
      modifiedAt: 1,
      width: 100,
      height: 100,
      format: 'jpeg',
      orientation: 'square'
    })

    const result = db.removeSourceRoot(root.id, 'disable')

    expect(result.affectedAssets).toBe(1)
    expect(db.listSourceRoots().find((item) => item.id === root.id)?.enabled).toBe(false)
    expect(db.searchAssets({ limit: 20, offset: 0 }).total).toBe(1)
    expect(db.getAsset(asset.assetId)?.missing).toBe(false)
  })

  it('removes a source root from the library while preserving album and work references', () => {
    const root = db.createSourceRoot('F:\\removed\\photos')
    const asset = db.upsertMediaLocation({
      rootId: root.id,
      absolutePath: 'F:\\removed\\photos\\one.jpg',
      relativePath: 'one.jpg',
      contentHash: 'library-removed',
      sizeBytes: 10,
      modifiedAt: 1,
      width: 100,
      height: 100,
      format: 'jpeg',
      orientation: 'square'
    })
    const album = db.createAlbum('保留引用')
    db.addAssetToAlbum(album.id, asset.assetId)
    const work = db.createWork({ albumId: album.id, name: '保留作品', outputMode: 'pages', canvasWidth: 1080, canvasHeight: 1440, background: '#fff' })
    const page = db.createPage(work.id, 0, '#fff')
    db.createImageLayer(page.id, { assetId: asset.assetId, x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1, fit: 'cover', radius: 0 })

    const result = db.removeSourceRoot(root.id, 'library')

    expect(result.removedLocations).toBe(1)
    expect(result.removedAssets).toBe(0)
    expect(db.searchAssets({ limit: 20, offset: 0 }).total).toBe(0)
    expect(db.listAlbumAssets(album.id)).toHaveLength(1)
    expect(db.listLayers(page.id)).toHaveLength(1)
    expect(db.getAsset(asset.assetId)?.missing).toBe(true)
    expect(db.isPathIgnored('F:\\removed\\photos\\one.jpg')).toBe(true)
  })

  it('fully removes photos from the library, albums, and image layers', () => {
    const root = db.createSourceRoot('G:\\all\\photos')
    const asset = db.upsertMediaLocation({
      rootId: root.id,
      absolutePath: 'G:\\all\\photos\\one.jpg',
      relativePath: 'one.jpg',
      contentHash: 'full-removed',
      sizeBytes: 10,
      modifiedAt: 1,
      width: 100,
      height: 100,
      format: 'jpeg',
      orientation: 'square'
    })
    const album = db.createAlbum('全部移除')
    db.addAssetToAlbum(album.id, asset.assetId)
    const work = db.createWork({ albumId: album.id, name: '全部移除作品', outputMode: 'pages', canvasWidth: 1080, canvasHeight: 1440, background: '#fff' })
    const page = db.createPage(work.id, 0, '#fff')
    db.createImageLayer(page.id, { assetId: asset.assetId, x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 1, fit: 'cover', radius: 0 })
    db.createTextLayer(page.id, { x: 0, y: 0.8, width: 1, height: 0.1, rotation: 0, zIndex: 2, text: '保留文字', fontSize: 48, color: '#111', fontFamily: 'Microsoft YaHei', fontWeight: 'normal', align: 'left' })

    const result = db.removeSourceRoot(root.id, 'all')

    expect(result.removedAssets).toBe(1)
    expect(result.removedAlbumItems).toBe(1)
    expect(result.removedLayers).toBe(1)
    expect(db.getAsset(asset.assetId)).toBeNull()
    expect(db.listAlbumAssets(album.id)).toHaveLength(0)
    expect(db.listLayers(page.id)).toHaveLength(1)
    expect(db.listLayers(page.id)[0].type).toBe('text')
    expect(db.countAssets()).toBe(0)
  })

  it('re-adds a removed source root and clears ignored paths', () => {
    const root = db.createSourceRoot('H:\\readd\\photos')
    db.upsertMediaLocation({
      rootId: root.id,
      absolutePath: 'H:\\readd\\photos\\one.jpg',
      relativePath: 'one.jpg',
      contentHash: 'readd-photo',
      sizeBytes: 10,
      modifiedAt: 1,
      width: 100,
      height: 100,
      format: 'jpeg',
      orientation: 'square'
    })
    db.removeSourceRoot(root.id, 'library')

    const restored = db.createSourceRoot('H:\\readd\\photos')

    expect(restored.enabled).toBe(true)
    expect(db.isPathIgnored('H:\\readd\\photos\\one.jpg')).toBe(false)
  })
  it('sets a first photo as album cover and keeps a valid fallback', () => {
    const root = db.createSourceRoot('I:\\cover-photos')
    const first = db.upsertMediaLocation({ rootId: root.id, absolutePath: 'I:\\cover-photos\\first.jpg', relativePath: 'first.jpg', contentHash: 'cover-first', sizeBytes: 10, modifiedAt: 1, width: 100, height: 100, format: 'jpeg', orientation: 'square' }).assetId
    const second = db.upsertMediaLocation({ rootId: root.id, absolutePath: 'I:\\cover-photos\\second.jpg', relativePath: 'second.jpg', contentHash: 'cover-second', sizeBytes: 10, modifiedAt: 1, width: 100, height: 100, format: 'jpeg', orientation: 'square' }).assetId
    const album = db.createAlbum('封面测试')
    db.addAssetToAlbum(album.id, first)
    expect(db.getAlbum(album.id)?.coverAssetId).toBe(first)
    db.addAssetToAlbum(album.id, second)
    db.setAlbumCover(album.id, second)
    expect(db.getAlbum(album.id)?.coverAssetId).toBe(second)
    db.removeAssetFromAlbum(album.id, second)
    expect(db.getAlbum(album.id)?.coverAssetId).toBe(first)
    db.removeAssetFromAlbum(album.id, first)
    expect(db.getAlbum(album.id)?.coverAssetId).toBeNull()
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