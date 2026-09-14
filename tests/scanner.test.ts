import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDatabase } from '../src/main/database'
import { LibraryScanner } from '../src/main/scanner'

describe('LibraryScanner', () => {
  let rootDir: string
  let db: AppDatabase
  let scanner: LibraryScanner

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'album-studio-'))
    db = new AppDatabase(':memory:')
    db.migrate()
    scanner = new LibraryScanner(db)
  })

  afterEach(async () => {
    db.close()
    await rm(rootDir, { recursive: true, force: true })
  })

  it('indexes JPG/PNG files and merges identical content across folders', async () => {
    await mkdir(join(rootDir, 'a'))
    await mkdir(join(rootDir, 'b'))
    const jpeg = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#d97757' } }).jpeg().toBuffer()
    await writeFile(join(rootDir, 'a', 'cover.jpg'), jpeg)
    await writeFile(join(rootDir, 'b', 'copy.jpg'), jpeg)
    await writeFile(join(rootDir, 'a', 'notes.txt'), 'ignore me')
    await sharp({ create: { width: 100, height: 200, channels: 4, background: '#336699' } }).png().toFile(join(rootDir, 'portrait.png'))

    const source = db.createSourceRoot(rootDir)
    const result = await scanner.scanRoot(source)

    expect(result.discovered).toBe(3)
    expect(result.indexed).toBe(3)
    expect(db.countAssets()).toBe(2)
    expect(db.listDuplicateAssets()).toHaveLength(1)
    expect(db.listDuplicateAssets()[0].locationCount).toBe(2)
  })

  it('keeps album references when a unique original is overwritten with content that already exists', async () => {
    const firstPath = join(rootDir, 'first.jpg')
    const secondPath = join(rootDir, 'second.jpg')
    const first = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#111111' } }).jpeg().toBuffer()
    const second = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#eeeeee' } }).jpeg().toBuffer()
    await writeFile(firstPath, first)
    await writeFile(secondPath, second)
    const source = db.createSourceRoot(rootDir)
    await scanner.scanRoot(source)

    const assets = db.searchAssets({ limit: 10, offset: 0 }).items
    const firstAsset = assets.find((asset) => asset.primaryPath === firstPath)
    const secondAsset = assets.find((asset) => asset.primaryPath === secondPath)
    const album = db.createAlbum('覆盖后保留引用')
    db.addAssetToAlbum(album.id, firstAsset!.id)

    await writeFile(firstPath, second)
    await scanner.scanRoot(source)

    expect(db.countAssets()).toBe(1)
    expect(db.listAlbumAssets(album.id)[0].assetId).toBe(secondAsset!.id)
    expect(db.listMediaLocations(secondAsset!.id)).toHaveLength(2)
  })
  it('skips unchanged files on subsequent scans', async () => {
    await writeFile(join(rootDir, 'unchanged.jpg'), await sharp({ create: { width: 80, height: 80, channels: 3, background: '#456789' } }).jpeg().toBuffer())
    const source = db.createSourceRoot(rootDir)
    const first = await scanner.scanRoot(source)
    const second = await scanner.scanRoot(source)

    expect(first.indexed).toBe(1)
    expect(second.discovered).toBe(1)
    expect(second.indexed).toBe(0)
    expect(db.searchAssets({ limit: 10, offset: 0 }).total).toBe(1)
  })

  it('does not scan source roots that are disabled', async () => {
    await writeFile(join(rootDir, 'disabled.jpg'), await sharp({ create: { width: 80, height: 80, channels: 3, background: '#123456' } }).jpeg().toBuffer())
    const source = db.createSourceRoot(rootDir)
    const disabled = db.setSourceRootEnabled(source.id, false)

    const results = await scanner.scanAll([disabled])

    expect(results).toHaveLength(0)
    expect(db.searchAssets({ limit: 10, offset: 0 }).total).toBe(0)
  })
  it('does not mark indexed files missing while an offline source root is unavailable', async () => {
    const filePath = join(rootDir, 'offline.jpg')
    const jpeg = await sharp({ create: { width: 120, height: 120, channels: 3, background: '#334455' } }).jpeg().toBuffer()
    await writeFile(filePath, jpeg)
    const source = db.createSourceRoot(rootDir)
    await scanner.scanRoot(source)
    const asset = db.searchAssets({ limit: 10, offset: 0 }).items[0]

    await rm(rootDir, { recursive: true, force: true })
    const result = await scanner.scanRoot(source)

    expect(result.errors).toHaveLength(1)
    expect(db.listMediaLocations(asset.id)[0].status).toBe('available')
    expect(db.getAsset(asset.id)?.missing).toBe(false)
  })
  it('updates the same asset when its only original file is overwritten in place', async () => {
    const filePath = join(rootDir, 'edited.jpg')
    const first = await sharp({ create: { width: 120, height: 120, channels: 3, background: '#111111' } }).jpeg().toBuffer()
    const second = await sharp({ create: { width: 120, height: 120, channels: 3, background: '#eeeeee' } }).jpeg().toBuffer()
    await writeFile(filePath, first)

    const source = db.createSourceRoot(rootDir)
    await scanner.scanRoot(source)
    const before = db.searchAssets({ limit: 10, offset: 0 }).items[0]

    await writeFile(filePath, second)
    await scanner.scanRoot(source)
    const after = db.searchAssets({ limit: 10, offset: 0 }).items[0]

    expect(db.countAssets()).toBe(1)
    expect(after.id).toBe(before.id)
    expect(after.contentHash).not.toBe(before.contentHash)
    expect(db.listMediaLocations(after.id)).toHaveLength(1)
  })
  it('keeps album references while a renamed file is recovered by content hash', async () => {
    const originalPath = join(rootDir, 'original.jpg')
    const renamedPath = join(rootDir, 'renamed.jpg')
    const jpeg = await sharp({ create: { width: 120, height: 120, channels: 3, background: '#222222' } }).jpeg().toBuffer()
    await writeFile(originalPath, jpeg)

    const source = db.createSourceRoot(rootDir)
    await scanner.scanRoot(source)
    const originalAsset = db.listDuplicateAssets()
    expect(originalAsset).toHaveLength(0)

    const before = db.searchAssets({ limit: 10, offset: 0 }).items[0]
    const album = db.createAlbum('保留引用')
    db.addAssetToAlbum(album.id, before.id)

    await rename(originalPath, renamedPath)
    await scanner.scanRoot(source)

    expect(db.countAssets()).toBe(1)
    expect(db.listAlbumAssets(album.id)[0].assetId).toBe(before.id)
    const locations = db.listMediaLocations(before.id)
    expect(locations.find((location) => location.absolutePath === originalPath)?.status).toBe('missing')
    expect(locations.find((location) => location.absolutePath === renamedPath)?.status).toBe('available')
  })
})