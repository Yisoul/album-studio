import { beforeEach, describe, expect, it } from 'vitest'
import { AppDatabase } from '../src/main/database'

describe('work document persistence', () => {
  let db: AppDatabase
  let assetId: string
  let workId: string
  let pageId: string

  beforeEach(() => {
    db = new AppDatabase(':memory:')
    db.migrate()
    const root = db.createSourceRoot('C:\\photos')
    assetId = db.upsertMediaLocation({
      rootId: root.id,
      absolutePath: 'C:\\photos\\photo.jpg',
      relativePath: 'photo.jpg',
      contentHash: 'work-photo',
      sizeBytes: 100,
      modifiedAt: 1,
      width: 1200,
      height: 800,
      format: 'jpeg',
      orientation: 'landscape'
    }).assetId
    const album = db.createAlbum('作品')
    workId = db.createWork({
      albumId: album.id,
      name: '第一版',
      outputMode: 'pages',
      canvasWidth: 1080,
      canvasHeight: 1440,
      background: '#ffffff'
    }).id
    pageId = db.createPage(workId, 0, '#ffffff').id
  })

  it('loads and updates an editable work document', () => {
    const imageLayer = db.createImageLayer(pageId, {
      assetId,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rotation: 0,
      zIndex: 1,
      fit: 'cover',
      radius: 0
    })
    const textLayer = db.createTextLayer(pageId, {
      x: 0.1,
      y: 0.8,
      width: 0.8,
      height: 0.1,
      rotation: 0,
      zIndex: 2,
      text: '标题',
      fontSize: 64,
      color: '#111111',
      fontFamily: 'Microsoft YaHei',
      fontWeight: 'bold',
      align: 'center'
    })

    const document = db.getWorkDocument(workId)
    expect(document?.pages[0].layers.map((layer) => layer.id)).toEqual([imageLayer.id, textLayer.id])

    db.updatePage(pageId, { background: '#111111' })
    expect(db.listPages(workId)[0].background).toBe('#111111')
    db.updateLayer(imageLayer.id, { x: 0.05, y: 0.04, width: 0.9, height: 0.5, rotation: 5 })
    db.updateLayer(imageLayer.id, { x: 0.05, y: 0.04, width: 0.9, height: 0.5, rotation: 5 })
    expect(db.getWorkDocument(workId)?.pages[0].layers[0]).toMatchObject({ x: 0.05, y: 0.04, rotation: 5 })
    db.updateTextLayer(textLayer.id, '新的标题', { fontSize: 72, lineHeight: 1.5 })
    expect(db.listLayers(pageId).find((layer) => layer.id === textLayer.id)).toMatchObject({ text: '新的标题', style: { fontSize: 72, lineHeight: 1.5 } })

    const movedFirst = db.reorderLayers(pageId, [textLayer.id], 'bottom')
    expect(movedFirst.map((layer) => layer.id)).toEqual([textLayer.id, imageLayer.id])
    const movedTop = db.reorderLayers(pageId, [textLayer.id], 'top')
    expect(movedTop.map((layer) => layer.id)).toEqual([imageLayer.id, textLayer.id])

    const replacementRoot = db.createSourceRoot('C:\\photos-replace')
    const replacementAsset = db.upsertMediaLocation({
      rootId: replacementRoot.id,
      absolutePath: 'C:\\photos-replace\\replacement.jpg',
      relativePath: 'replacement.jpg',
      contentHash: 'replacement-photo',
      sizeBytes: 100,
      modifiedAt: 1,
      width: 1200,
      height: 800,
      format: 'jpeg',
      orientation: 'landscape'
    }).assetId
    db.replaceImageLayerAsset(imageLayer.id, replacementAsset)
    expect(db.getWorkDocument(workId)?.pages[0].layers[0].assetId).toBe(replacementAsset)
    db.deleteLayer(textLayer.id)
    expect(db.getWorkDocument(workId)?.pages[0].layers).toHaveLength(1)
    expect(db.listWorks(document!.work.albumId)).toHaveLength(1)
  })
})