import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { FolderSummary, ImageFit, LayerOrderAction, SourceRemovalMode, SourceRemovalResult, SourceRootImpact } from '../shared/types'

export type Orientation = 'landscape' | 'portrait' | 'square'
export type OutputMode = 'pages' | 'long_image'
export type LayerType = 'image' | 'text'

export interface SourceRoot {
  id: string
  path: string
  enabled: boolean
  createdAt: number
}

export interface MediaLocationInput {
  rootId: string
  directoryPath?: string
  absolutePath: string
  relativePath: string
  contentHash: string
  sizeBytes: number
  modifiedAt: number
  width: number
  height: number
  format: string
  capturedAt?: string | null
  cameraMake?: string | null
  cameraModel?: string | null
  lens?: string | null
  focalLength?: number | null
  aperture?: number | null
  shutterSpeed?: string | null
  iso?: number | null
  orientation: Orientation
}

export interface MediaLocation {
  id: string
  assetId: string
  rootId: string
  absolutePath: string
  relativePath: string
  sizeBytes: number
  modifiedAt: number
  status: 'available' | 'missing'
  preferred: boolean
}

export interface SearchFilters {
  text?: string
  capturedFrom?: string
  capturedTo?: string
  orientation?: Orientation
  cameraModel?: string
  lens?: string
  isoMin?: number
  isoMax?: number
  favorite?: boolean
  albumId?: string
  rootIds?: string[]
  folderPaths?: string[]
  sort?: 'captured_desc' | 'captured_asc' | 'added_desc' | 'added_asc' | 'filename_asc' | 'filename_desc'
  limit: number
  offset: number
}

export interface MediaAssetSummary {
  id: string
  contentHash: string
  width: number
  height: number
  format: string
  capturedAt: string | null
  cameraMake: string | null
  cameraModel: string | null
  lens: string | null
  focalLength: number | null
  aperture: number | null
  shutterSpeed: string | null
  iso: number | null
  orientation: Orientation
  favorite: boolean
  missing: boolean
  primaryPath: string | null
  primaryRootId: string | null
  primaryDirectoryPath: string | null
  locationCount: number
}
export interface Album {
  id: string
  name: string
  coverAssetId: string | null
  createdAt: number
  updatedAt: number
}

export interface Work {
  id: string
  albumId: string
  name: string
  outputMode: OutputMode
  canvasWidth: number
  canvasHeight: number
  background: string
  createdAt: number
  updatedAt: number
}

export interface Page {
  id: string
  workId: string
  position: number
  background: string
}

export interface Layer {
  id: string
  pageId: string
  type: LayerType
  assetId: string | null
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  style: Record<string, unknown>
  text: string | null
}

export interface ImageLayerInput {
  assetId: string | null
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  fit: ImageFit
  radius: number
}

export interface LayerRectUpdate {
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
  zIndex?: number
  style?: Record<string, unknown>
}
export interface TextLayerInput {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  text: string
  fontSize: number
  color: string
  fontFamily: string
  fontWeight: string
  align: 'left' | 'center' | 'right'
  letterSpacing?: number
  lineHeight?: number
}

type Row = Record<string, unknown>

const asNumber = (value: unknown): number => Number(value ?? 0)
const asString = (value: unknown): string => String(value ?? '')
const asNullableString = (value: unknown): string | null => (value == null ? null : String(value))

export class AppDatabase {
  private readonly db: DatabaseSync

  constructor(filename: string) {
    this.db = new DatabaseSync(filename)
    this.db.exec('PRAGMA foreign_keys = ON')
    if (filename !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL')
    }
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS source_roots (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL UNIQUE,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        format TEXT NOT NULL,
        captured_at TEXT,
        camera_make TEXT,
        camera_model TEXT,
        lens TEXT,
        focal_length REAL,
        aperture REAL,
        shutter_speed TEXT,
        iso INTEGER,
        orientation TEXT NOT NULL,
        favorite INTEGER NOT NULL DEFAULT 0,
        missing INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS media_locations (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
        root_id TEXT NOT NULL REFERENCES source_roots(id) ON DELETE CASCADE,
        absolute_path TEXT NOT NULL UNIQUE,
        relative_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        modified_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'available',
        preferred INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_media_locations_asset ON media_locations(asset_id);
      CREATE INDEX IF NOT EXISTS idx_media_locations_root ON media_locations(root_id);
      CREATE INDEX IF NOT EXISTS idx_media_assets_capture ON media_assets(captured_at);
      CREATE INDEX IF NOT EXISTS idx_media_assets_camera ON media_assets(camera_model);
      CREATE INDEX IF NOT EXISTS idx_media_assets_lens ON media_assets(lens);
      CREATE INDEX IF NOT EXISTS idx_media_assets_iso ON media_assets(iso);

      CREATE TABLE IF NOT EXISTS ignored_paths (
        path TEXT PRIMARY KEY,
        ignored_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS albums (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        cover_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS album_items (
        album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (album_id, asset_id)
      );

      CREATE INDEX IF NOT EXISTS idx_album_items_order ON album_items(album_id, position);

      CREATE TABLE IF NOT EXISTS works (
        id TEXT PRIMARY KEY,
        album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        output_mode TEXT NOT NULL,
        canvas_width INTEGER NOT NULL,
        canvas_height INTEGER NOT NULL,
        background TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_works_album ON works(album_id, updated_at);

      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        background TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(work_id, position)
      );

      CREATE TABLE IF NOT EXISTS layers (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        width REAL NOT NULL,
        height REAL NOT NULL,
        rotation REAL NOT NULL DEFAULT 0,
        z_index INTEGER NOT NULL,
        style_json TEXT NOT NULL,
        text_content TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_layers_page ON layers(page_id, z_index);

      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        schema_version INTEGER NOT NULL,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, unixepoch() * 1000);
    `)
    this.ensureDirectoryPathColumn()
  }

  private ensureDirectoryPathColumn(): void {
    const columns = this.db.prepare('PRAGMA table_info(media_locations)').all() as Row[]
    if (!columns.some((column) => asString(column.name) === 'directory_path')) {
      this.db.exec("ALTER TABLE media_locations ADD COLUMN directory_path TEXT NOT NULL DEFAULT ''")
    }
    const rows = this.db.prepare("SELECT id, absolute_path FROM media_locations WHERE directory_path = ''").all() as Row[]
    const update = this.db.prepare('UPDATE media_locations SET directory_path = ? WHERE id = ?')
    for (const row of rows) update.run(dirname(asString(row.absolute_path)), asString(row.id))
    this.db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, unixepoch() * 1000)').run()
  }
  close(): void {
    this.db.close()
  }

  createSourceRoot(path: string): SourceRoot {
    const existing = this.db.prepare('SELECT * FROM source_roots WHERE path = ?').get(path) as Row | undefined
    if (existing) {
      this.db.prepare('UPDATE source_roots SET enabled = 1 WHERE id = ?').run(asString(existing.id))
      this.clearIgnoredPathsUnder(path)
      return this.mapSourceRoot({ ...existing, enabled: 1 })
    }

    const id = randomUUID()
    const createdAt = Date.now()
    this.db.prepare('INSERT INTO source_roots(id, path, enabled, created_at) VALUES (?, ?, 1, ?)').run(id, path, createdAt)
    this.clearIgnoredPathsUnder(path)
    return { id, path, enabled: true, createdAt }
  }

  listSourceRoots(): SourceRoot[] {
    return (this.db.prepare('SELECT * FROM source_roots ORDER BY created_at').all() as Row[]).map((row) => this.mapSourceRoot(row))
  }

  upsertMediaLocation(input: MediaLocationInput): { assetId: string; locationId: string } {
    const now = Date.now()
    const directoryPath = input.directoryPath ?? dirname(input.absolutePath)
    const existingLocation = this.db.prepare('SELECT id, asset_id FROM media_locations WHERE absolute_path = ?').get(input.absolutePath) as Row | undefined
    const hashAsset = this.db.prepare('SELECT id FROM media_assets WHERE content_hash = ?').get(input.contentHash) as Row | undefined

    let assetId: string
    let assetAlreadyExists = false
    let preserveAssetId = false
    let mergeFromAssetId: string | null = null

    if (hashAsset) {
      assetId = asString(hashAsset.id)
      assetAlreadyExists = true
      if (existingLocation) {
        const previousAssetId = asString(existingLocation.asset_id)
        if (previousAssetId !== assetId) {
          const previousCount = this.db.prepare('SELECT COUNT(*) AS count FROM media_locations WHERE asset_id = ?').get(previousAssetId) as Row
          if (asNumber(previousCount.count) === 1) mergeFromAssetId = previousAssetId
        }
      }
    } else if (existingLocation) {
      const previousAssetId = asString(existingLocation.asset_id)
      const previousCount = this.db.prepare('SELECT COUNT(*) AS count FROM media_locations WHERE asset_id = ?').get(previousAssetId) as Row
      if (asNumber(previousCount.count) === 1) {
        assetId = previousAssetId
        assetAlreadyExists = true
        preserveAssetId = true
      } else {
        assetId = randomUUID()
      }
    } else {
      assetId = randomUUID()
    }

    if (!assetAlreadyExists) {
      this.db.prepare(`
        INSERT INTO media_assets(
          id, content_hash, width, height, format, captured_at, camera_make, camera_model, lens,
          focal_length, aperture, shutter_speed, iso, orientation, favorite, missing, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
      `).run(
        assetId, input.contentHash, input.width, input.height, input.format, input.capturedAt ?? null,
        input.cameraMake ?? null, input.cameraModel ?? null, input.lens ?? null, input.focalLength ?? null,
        input.aperture ?? null, input.shutterSpeed ?? null, input.iso ?? null, input.orientation, now, now
      )
    } else if (preserveAssetId) {
      this.db.prepare(`
        UPDATE media_assets SET content_hash = ?, width = ?, height = ?, format = ?, captured_at = ?,
          camera_make = ?, camera_model = ?, lens = ?, focal_length = ?, aperture = ?, shutter_speed = ?,
          iso = ?, orientation = ?, missing = 0, updated_at = ? WHERE id = ?
      `).run(
        input.contentHash, input.width, input.height, input.format, input.capturedAt ?? null,
        input.cameraMake ?? null, input.cameraModel ?? null, input.lens ?? null, input.focalLength ?? null,
        input.aperture ?? null, input.shutterSpeed ?? null, input.iso ?? null, input.orientation, now, assetId
      )
    } else {
      this.db.prepare(`
        UPDATE media_assets SET width = ?, height = ?, format = ?, captured_at = ?, camera_make = ?,
          camera_model = ?, lens = ?, focal_length = ?, aperture = ?, shutter_speed = ?, iso = ?,
          orientation = ?, missing = 0, updated_at = ? WHERE id = ?
      `).run(
        input.width, input.height, input.format, input.capturedAt ?? null, input.cameraMake ?? null,
        input.cameraModel ?? null, input.lens ?? null, input.focalLength ?? null, input.aperture ?? null,
        input.shutterSpeed ?? null, input.iso ?? null, input.orientation, now, assetId
      )
    }

    const locationId = existingLocation ? asString(existingLocation.id) : randomUUID()
    const availableCount = this.db.prepare("SELECT COUNT(*) AS count FROM media_locations WHERE asset_id = ? AND status = 'available'").get(assetId) as Row
    const hasPreferred = Boolean(this.db.prepare('SELECT preferred FROM media_locations WHERE asset_id = ? AND preferred = 1 LIMIT 1').get(assetId))
    const preferred = asNumber(availableCount.count) === 0 || hasPreferred

    if (existingLocation) {
      this.db.prepare(`
        UPDATE media_locations SET asset_id = ?, root_id = ?, relative_path = ?, directory_path = ?, size_bytes = ?, modified_at = ?,
          status = 'available', preferred = ?, updated_at = ? WHERE id = ?
      `).run(assetId, input.rootId, input.relativePath, directoryPath, input.sizeBytes, input.modifiedAt, preferred ? 1 : 0, now, locationId)
    } else {
      this.db.prepare(`
        INSERT INTO media_locations(
          id, asset_id, root_id, absolute_path, relative_path, directory_path, size_bytes, modified_at,
          status, preferred, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)
      `).run(
        locationId, assetId, input.rootId, input.absolutePath, input.relativePath, directoryPath, input.sizeBytes,
        input.modifiedAt, preferred ? 1 : 0, now, now
      )
    }

    this.db.prepare(`
      UPDATE media_assets
      SET missing = CASE WHEN NOT EXISTS (
        SELECT 1 FROM media_locations WHERE asset_id = media_assets.id AND status = 'available'
      ) THEN 1 ELSE 0 END
      WHERE id = ?
    `).run(assetId)

    if (mergeFromAssetId) {
      this.db.prepare(`
        INSERT OR IGNORE INTO album_items(album_id, asset_id, position, created_at)
        SELECT album_id, ?, position, created_at FROM album_items WHERE asset_id = ?
      `).run(assetId, mergeFromAssetId)
      this.db.prepare('UPDATE layers SET asset_id = ? WHERE asset_id = ?').run(assetId, mergeFromAssetId)
      this.db.prepare('UPDATE albums SET cover_asset_id = ? WHERE cover_asset_id = ?').run(assetId, mergeFromAssetId)
      this.db.prepare('DELETE FROM media_assets WHERE id = ?').run(mergeFromAssetId)
    }

    return { assetId, locationId }
  }
  listMediaLocations(assetId: string): MediaLocation[] {
    const rows = this.db.prepare('SELECT * FROM media_locations WHERE asset_id = ? ORDER BY preferred DESC, absolute_path').all(assetId) as Row[]
    return rows.map((row) => ({
      id: asString(row.id),
      assetId: asString(row.asset_id),
      rootId: asString(row.root_id),
      absolutePath: asString(row.absolute_path),
      relativePath: asString(row.relative_path),
      sizeBytes: asNumber(row.size_bytes),
      modifiedAt: asNumber(row.modified_at),
      status: asString(row.status) === 'missing' ? 'missing' : 'available',
      preferred: Boolean(row.preferred)
    }))
  }

  listDuplicateAssets(): Array<{ assetId: string; contentHash: string; locationCount: number }> {
    const rows = this.db.prepare(`
      SELECT a.id AS asset_id, a.content_hash,
        SUM(CASE WHEN l.status = 'available' THEN 1 ELSE 0 END) AS location_count
      FROM media_assets a
      JOIN media_locations l ON l.asset_id = a.id
      GROUP BY a.id, a.content_hash
      HAVING SUM(CASE WHEN l.status = 'available' THEN 1 ELSE 0 END) > 1
      ORDER BY location_count DESC, a.created_at
    `).all() as Row[]
    return rows.map((row) => ({
      assetId: asString(row.asset_id),
      contentHash: asString(row.content_hash),
      locationCount: asNumber(row.location_count)
    }))
  }

  countAssets(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM media_assets').get() as Row
    return asNumber(row.count)
  }

  createAlbum(name: string): Album {
    const id = randomUUID()
    const now = Date.now()
    this.db.prepare('INSERT INTO albums(id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, name, now, now)
    return { id, name, coverAssetId: null, createdAt: now, updatedAt: now }
  }

  getAlbum(albumId: string): Album | null {
    const row = this.db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId) as Row | undefined
    if (!row) return null
    return {
      id: asString(row.id),
      name: asString(row.name),
      coverAssetId: asNullableString(row.cover_asset_id),
      createdAt: asNumber(row.created_at),
      updatedAt: asNumber(row.updated_at)
    }
  }
  listAlbums(): Album[] {
    return (this.db.prepare('SELECT * FROM albums ORDER BY updated_at DESC').all() as Row[]).map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
      coverAssetId: asNullableString(row.cover_asset_id),
      createdAt: asNumber(row.created_at),
      updatedAt: asNumber(row.updated_at)
    }))
  }

  removeAlbum(albumId: string): void {
    this.db.prepare('DELETE FROM albums WHERE id = ?').run(albumId)
  }
  addAssetToAlbum(albumId: string, assetId: string): void {
    const now = Date.now()
    const row = this.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM album_items WHERE album_id = ?').get(albumId) as Row
    this.db.prepare(`
      INSERT OR IGNORE INTO album_items(album_id, asset_id, position, created_at) VALUES (?, ?, ?, ?)
    `).run(albumId, assetId, asNumber(row.next_position), now)
    this.db.prepare(`
      UPDATE albums
      SET cover_asset_id = COALESCE(cover_asset_id, ?), updated_at = ?
      WHERE id = ?
    `).run(assetId, now, albumId)
  }

  listAlbumAssets(albumId: string): Array<{ assetId: string; position: number }> {
    const rows = this.db.prepare('SELECT asset_id, position FROM album_items WHERE album_id = ? ORDER BY position').all(albumId) as Row[]
    return rows.map((row) => ({ assetId: asString(row.asset_id), position: asNumber(row.position) }))
  }

  createWork(input: {
    albumId: string
    name: string
    outputMode: OutputMode
    canvasWidth: number
    canvasHeight: number
    background: string
  }): Work {
    const id = randomUUID()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO works(id, album_id, name, output_mode, canvas_width, canvas_height, background, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.albumId, input.name, input.outputMode, input.canvasWidth, input.canvasHeight, input.background, now, now)
    return { id, ...input, createdAt: now, updatedAt: now }
  }

  listWorks(albumId: string): Work[] {
    return (this.db.prepare('SELECT * FROM works WHERE album_id = ? ORDER BY updated_at DESC').all(albumId) as Row[]).map((row) => ({
      id: asString(row.id),
      albumId: asString(row.album_id),
      name: asString(row.name),
      outputMode: asString(row.output_mode) as OutputMode,
      canvasWidth: asNumber(row.canvas_width),
      canvasHeight: asNumber(row.canvas_height),
      background: asString(row.background),
      createdAt: asNumber(row.created_at),
      updatedAt: asNumber(row.updated_at)
    }))
  }

  createPage(workId: string, position: number, background: string): Page {
    const id = randomUUID()
    const now = Date.now()
    this.db.prepare('INSERT INTO pages(id, work_id, position, background, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, workId, position, background, now, now)
    return { id, workId, position, background }
  }

  listPages(workId: string): Page[] {
    return (this.db.prepare('SELECT * FROM pages WHERE work_id = ? ORDER BY position').all(workId) as Row[]).map((row) => ({
      id: asString(row.id),
      workId: asString(row.work_id),
      position: asNumber(row.position),
      background: asString(row.background)
    }))
  }

  createTextLayer(pageId: string, input: TextLayerInput): Layer {
    const id = randomUUID()
    const now = Date.now()
    const style = {
      fontSize: input.fontSize,
      color: input.color,
      fontFamily: input.fontFamily,
      fontWeight: input.fontWeight,
      align: input.align,
      letterSpacing: input.letterSpacing ?? 0,
      lineHeight: input.lineHeight ?? 1.2
    }
    this.db.prepare(`
      INSERT INTO layers(id, page_id, type, asset_id, x, y, width, height, rotation, z_index, style_json, text_content, created_at, updated_at)
      VALUES (?, ?, 'text', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, pageId, input.x, input.y, input.width, input.height, input.rotation,
      input.zIndex, JSON.stringify(style), input.text, now, now
    )
    return {
      id, pageId, type: 'text', assetId: null, x: input.x, y: input.y, width: input.width,
      height: input.height, rotation: input.rotation, zIndex: input.zIndex, style, text: input.text
    }
  }

  listLayers(pageId: string): Layer[] {
    return (this.db.prepare('SELECT * FROM layers WHERE page_id = ? ORDER BY z_index, created_at').all(pageId) as Row[]).map((row) => ({
      id: asString(row.id),
      pageId: asString(row.page_id),
      type: asString(row.type) as LayerType,
      assetId: asNullableString(row.asset_id),
      x: asNumber(row.x),
      y: asNumber(row.y),
      width: asNumber(row.width),
      height: asNumber(row.height),
      rotation: asNumber(row.rotation),
      zIndex: asNumber(row.z_index),
      style: JSON.parse(asString(row.style_json)) as Record<string, unknown>,
      text: asNullableString(row.text_content)
    }))
  }

  listFolders(): FolderSummary[] {
    const rows = this.db.prepare(`
      SELECT directory_path, COUNT(DISTINCT asset_id) AS asset_count
      FROM media_locations
      WHERE status = 'available' AND directory_path != ''
      GROUP BY directory_path
      ORDER BY directory_path COLLATE NOCASE
    `).all() as Row[]
    return rows.map((row) => {
      const path = asString(row.directory_path)
      return { path, name: path.split(/[\\/]/).filter(Boolean).pop() || path, assetCount: asNumber(row.asset_count) }
    })
  }

  markRootLocationsMissing(rootId: string): void {
    const now = Date.now()
    this.db.prepare("UPDATE media_locations SET status = 'missing', updated_at = ? WHERE root_id = ?").run(now, rootId)
    this.db.prepare(`
      UPDATE media_assets
      SET missing = CASE WHEN NOT EXISTS (
        SELECT 1 FROM media_locations WHERE asset_id = media_assets.id AND status = 'available'
      ) THEN 1 ELSE 0 END
    `).run()
  }

  searchAssets(filters: SearchFilters): { items: MediaAssetSummary[]; total: number } {
    const clauses: string[] = ["EXISTS (SELECT 1 FROM media_locations availability WHERE availability.asset_id = a.id AND availability.status = 'available')"]
    const params: Array<string | number> = []

    if (filters.text?.trim()) {
      clauses.push(`EXISTS (
        SELECT 1 FROM media_locations l
        WHERE l.asset_id = a.id
          AND l.status = 'available'
          AND (l.absolute_path LIKE ? OR l.relative_path LIKE ?)
      )`)
      const term = `%${filters.text.trim()}%`
      params.push(term, term)
    }
    if (filters.capturedFrom) {
      clauses.push('a.captured_at >= ?')
      params.push(filters.capturedFrom)
    }
    if (filters.capturedTo) {
      clauses.push('a.captured_at <= ?')
      params.push(filters.capturedTo)
    }
    if (filters.orientation) {
      clauses.push('a.orientation = ?')
      params.push(filters.orientation)
    }
    if (filters.cameraModel?.trim()) {
      clauses.push('(a.camera_make LIKE ? OR a.camera_model LIKE ?)')
      const term = `%${filters.cameraModel.trim()}%`
      params.push(term, term)
    }
    if (filters.lens?.trim()) {
      clauses.push('a.lens LIKE ?')
      params.push(`%${filters.lens.trim()}%`)
    }
    if (filters.isoMin != null) {
      clauses.push('a.iso >= ?')
      params.push(filters.isoMin)
    }
    if (filters.isoMax != null) {
      clauses.push('a.iso <= ?')
      params.push(filters.isoMax)
    }
    if (filters.favorite != null) {
      clauses.push('a.favorite = ?')
      params.push(filters.favorite ? 1 : 0)
    }
    if (filters.albumId) {
      clauses.push('EXISTS (SELECT 1 FROM album_items ai WHERE ai.album_id = ? AND ai.asset_id = a.id)')
      params.push(filters.albumId)
    }
    if (filters.rootIds?.length) {
      const placeholders = filters.rootIds.map(() => '?').join(', ')
      clauses.push(`EXISTS (
        SELECT 1 FROM media_locations folder_filter
        WHERE folder_filter.asset_id = a.id
          AND folder_filter.status = 'available'
          AND folder_filter.root_id IN (${placeholders})
      )`)
      params.push(...filters.rootIds)
    }
    if (filters.folderPaths?.length) {
      const placeholders = filters.folderPaths.map(() => '?').join(', ')
      clauses.push(`EXISTS (
        SELECT 1 FROM media_locations directory_filter
        WHERE directory_filter.asset_id = a.id
          AND directory_filter.status = 'available'
          AND directory_filter.directory_path IN (${placeholders})
      )`)
      params.push(...filters.folderPaths)
    }

    const where = clauses.join(' AND ')
    const filenameOrder = "LOWER(COALESCE(primary_path, ''))"
    const orderBy = {
      captured_desc: `CASE WHEN a.captured_at IS NULL OR a.captured_at = '' THEN 1 ELSE 0 END, a.captured_at DESC, a.created_at DESC, ${filenameOrder} ASC`,
      captured_asc: `CASE WHEN a.captured_at IS NULL OR a.captured_at = '' THEN 1 ELSE 0 END, a.captured_at ASC, a.created_at ASC, ${filenameOrder} ASC`,
      added_desc: `a.created_at DESC, CASE WHEN a.captured_at IS NULL OR a.captured_at = '' THEN 1 ELSE 0 END, a.captured_at DESC, ${filenameOrder} ASC`,
      added_asc: `a.created_at ASC, CASE WHEN a.captured_at IS NULL OR a.captured_at = '' THEN 1 ELSE 0 END, a.captured_at ASC, ${filenameOrder} ASC`,
      filename_asc: `${filenameOrder} ASC`,
      filename_desc: `${filenameOrder} DESC`
    }[filters.sort ?? 'captured_desc']
    const totalRow = this.db.prepare(`SELECT COUNT(*) AS count FROM media_assets a WHERE ${where}`).get(...params) as Row
    const rows = this.db.prepare(`
      SELECT a.*,
        (
          SELECT absolute_path FROM media_locations l
          WHERE l.asset_id = a.id AND l.status = 'available'
          ORDER BY preferred DESC, absolute_path LIMIT 1
        ) AS primary_path,
        (
          SELECT root_id FROM media_locations l
          WHERE l.asset_id = a.id AND l.status = 'available'
          ORDER BY preferred DESC, absolute_path LIMIT 1
        ) AS primary_root_id,
        (
          SELECT directory_path FROM media_locations l
          WHERE l.asset_id = a.id AND l.status = 'available'
          ORDER BY preferred DESC, absolute_path LIMIT 1
        ) AS primary_directory_path,
        (
          SELECT COUNT(*) FROM media_locations l WHERE l.asset_id = a.id
        ) AS location_count
      FROM media_assets a
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, filters.limit, filters.offset) as Row[]

    return {
      total: asNumber(totalRow.count),
      items: rows.map((row) => ({
        id: asString(row.id),
        contentHash: asString(row.content_hash),
        width: asNumber(row.width),
        height: asNumber(row.height),
        format: asString(row.format),
        capturedAt: asNullableString(row.captured_at),
        cameraMake: asNullableString(row.camera_make),
        cameraModel: asNullableString(row.camera_model),
        lens: asNullableString(row.lens),
        focalLength: row.focal_length == null ? null : asNumber(row.focal_length),
        aperture: row.aperture == null ? null : asNumber(row.aperture),
        shutterSpeed: asNullableString(row.shutter_speed),
        iso: row.iso == null ? null : asNumber(row.iso),
        orientation: asString(row.orientation) as Orientation,
        favorite: Boolean(row.favorite),
        missing: Boolean(row.missing),
        primaryPath: asNullableString(row.primary_path),
        primaryRootId: asNullableString(row.primary_root_id),
      primaryDirectoryPath: asNullableString(row.primary_directory_path),
        locationCount: asNumber(row.location_count)
      }))
    }
  }
  checkpoint(): void {
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  }

  isPathIgnored(path: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM ignored_paths WHERE path = ?').get(path))
  }

  ignoreAsset(assetId: string): void {
    const locations = this.listMediaLocations(assetId)
    const insert = this.db.prepare('INSERT OR REPLACE INTO ignored_paths(path, ignored_at) VALUES (?, ?)')
    this.db.exec('BEGIN')
    try {
      for (const location of locations) insert.run(location.absolutePath, Date.now())
      this.db.prepare('DELETE FROM media_assets WHERE id = ?').run(assetId)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  removeLocation(locationId: string): void {
    const row = this.db.prepare('SELECT asset_id FROM media_locations WHERE id = ?').get(locationId) as Row | undefined
    if (!row) return
    const assetId = asString(row.asset_id)
    this.db.prepare('DELETE FROM media_locations WHERE id = ?').run(locationId)
    this.db.prepare(`
      UPDATE media_assets SET missing = CASE WHEN NOT EXISTS (
        SELECT 1 FROM media_locations WHERE asset_id = media_assets.id AND status = 'available'
      ) THEN 1 ELSE 0 END, updated_at = ? WHERE id = ?
    `).run(Date.now(), assetId)
  }

  getStats(): { assets: number; duplicateGroups: number; missing: number; roots: number } {
    const assets = this.db.prepare(`
      SELECT COUNT(*) AS count FROM media_assets a
      WHERE EXISTS (SELECT 1 FROM media_locations l WHERE l.asset_id = a.id AND l.status = 'available')
    `).get() as Row
    const missing = this.db.prepare('SELECT COUNT(*) AS count FROM media_assets WHERE missing = 1').get() as Row
    const roots = this.db.prepare('SELECT COUNT(*) AS count FROM source_roots WHERE enabled = 1').get() as Row
    return {
      assets: asNumber(assets.count),
      duplicateGroups: this.listDuplicateAssets().length,
      missing: asNumber(missing.count),
      roots: asNumber(roots.count)
    }
  }
  getAsset(assetId: string): MediaAssetSummary | null {
    const row = this.db.prepare(`
      SELECT a.*,
        (
          SELECT absolute_path FROM media_locations l
          WHERE l.asset_id = a.id AND l.status = 'available'
          ORDER BY preferred DESC, absolute_path LIMIT 1
        ) AS primary_path,
        (
          SELECT root_id FROM media_locations l
          WHERE l.asset_id = a.id AND l.status = 'available'
          ORDER BY preferred DESC, absolute_path LIMIT 1
        ) AS primary_root_id,
        (
          SELECT directory_path FROM media_locations l
          WHERE l.asset_id = a.id AND l.status = 'available'
          ORDER BY preferred DESC, absolute_path LIMIT 1
        ) AS primary_directory_path,
        (SELECT COUNT(*) FROM media_locations l WHERE l.asset_id = a.id) AS location_count
      FROM media_assets a WHERE a.id = ?
    `).get(assetId) as Row | undefined
    return row ? this.mapAssetSummary(row) : null
  }

  getPreferredLocation(assetId: string): MediaLocation | null {
    const row = this.db.prepare(`
      SELECT * FROM media_locations
      WHERE asset_id = ? AND status = 'available'
      ORDER BY preferred DESC, absolute_path LIMIT 1
    `).get(assetId) as Row | undefined
    return row ? this.mapMediaLocation(row) : null
  }

  getLocation(locationId: string): MediaLocation | null {
    const row = this.db.prepare('SELECT * FROM media_locations WHERE id = ?').get(locationId) as Row | undefined
    return row ? this.mapMediaLocation(row) : null
  }

  setPreferredLocation(assetId: string, locationId: string): void {
    const location = this.db.prepare('SELECT id FROM media_locations WHERE id = ? AND asset_id = ?').get(locationId, assetId) as Row | undefined
    if (!location) throw new Error('照片位置不存在')
    this.db.prepare('UPDATE media_locations SET preferred = 0 WHERE asset_id = ?').run(assetId)
    this.db.prepare('UPDATE media_locations SET preferred = 1 WHERE id = ?').run(locationId)
  }

  setFavorite(assetId: string, favorite: boolean): void {
    this.db.prepare('UPDATE media_assets SET favorite = ?, updated_at = ? WHERE id = ?').run(favorite ? 1 : 0, Date.now(), assetId)
  }

  removeAssetFromAlbum(albumId: string, assetId: string): void {
    this.db.prepare('DELETE FROM album_items WHERE album_id = ? AND asset_id = ?').run(albumId, assetId)
    this.db.prepare(`
      UPDATE albums
      SET cover_asset_id = CASE
        WHEN cover_asset_id = ? THEN (SELECT asset_id FROM album_items WHERE album_id = ? ORDER BY position LIMIT 1)
        ELSE cover_asset_id
      END,
      updated_at = ?
      WHERE id = ?
    `).run(assetId, albumId, Date.now(), albumId)
  }

  reorderAlbumAssets(albumId: string, assetIds: string[]): void {
    const update = this.db.prepare('UPDATE album_items SET position = ? WHERE album_id = ? AND asset_id = ?')
    this.db.exec('BEGIN')
    try {
      assetIds.forEach((assetId, index) => update.run(index, albumId, assetId))
      this.db.prepare('UPDATE albums SET updated_at = ? WHERE id = ?').run(Date.now(), albumId)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  setAlbumCover(albumId: string, assetId: string): void {
    const item = this.db.prepare('SELECT 1 FROM album_items WHERE album_id = ? AND asset_id = ?').get(albumId, assetId)
    if (!item) throw new Error('照片不属于这个相册')
    this.db.prepare('UPDATE albums SET cover_asset_id = ?, updated_at = ? WHERE id = ?').run(assetId, Date.now(), albumId)
  }

  getWork(workId: string): Work | null {
    const row = this.db.prepare('SELECT * FROM works WHERE id = ?').get(workId) as Row | undefined
    return row ? this.mapWork(row) : null
  }

  getWorkDocument(workId: string): { work: Work; pages: Array<Page & { layers: Layer[] }> } | null {
    const work = this.getWork(workId)
    if (!work) return null
    const pages = this.listPages(workId).map((page) => ({ ...page, layers: this.listLayers(page.id) }))
    return { work, pages }
  }

  updateWork(workId: string, input: Partial<Pick<Work, 'name' | 'outputMode' | 'canvasWidth' | 'canvasHeight' | 'background'>>): void {
    const current = this.getWork(workId)
    if (!current) throw new Error('作品不存在')
    this.db.prepare(`
      UPDATE works SET name = ?, output_mode = ?, canvas_width = ?, canvas_height = ?, background = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.name ?? current.name,
      input.outputMode ?? current.outputMode,
      input.canvasWidth ?? current.canvasWidth,
      input.canvasHeight ?? current.canvasHeight,
      input.background ?? current.background,
      Date.now(),
      workId
    )
  }

  deleteWork(workId: string): void {
    this.db.prepare('DELETE FROM works WHERE id = ?').run(workId)
  }

  createImageLayer(pageId: string, input: ImageLayerInput): Layer {
    const id = randomUUID()
    const now = Date.now()
    const style = { fit: input.fit, radius: input.radius }
    this.db.prepare(`
      INSERT INTO layers(id, page_id, type, asset_id, x, y, width, height, rotation, z_index, style_json, text_content, created_at, updated_at)
      VALUES (?, ?, 'image', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(
      id, pageId, input.assetId, input.x, input.y, input.width, input.height,
      input.rotation, input.zIndex, JSON.stringify(style), now, now
    )
    return {
      id, pageId, type: 'image', assetId: input.assetId, x: input.x, y: input.y,
      width: input.width, height: input.height, rotation: input.rotation, zIndex: input.zIndex, style, text: null
    }
  }

  updateLayer(layerId: string, input: LayerRectUpdate): void {
    const currentRow = this.db.prepare('SELECT * FROM layers WHERE id = ?').get(layerId) as Row | undefined
    if (!currentRow) throw new Error('图层不存在')
    const current = this.mapLayer(currentRow)
    this.db.prepare(`
      UPDATE layers SET x = ?, y = ?, width = ?, height = ?, rotation = ?, z_index = ?, style_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.x ?? current.x,
      input.y ?? current.y,
      input.width ?? current.width,
      input.height ?? current.height,
      input.rotation ?? current.rotation,
      input.zIndex ?? current.zIndex,
      JSON.stringify(input.style ? { ...current.style, ...input.style } : current.style),
      Date.now(),
      layerId
    )
  }

  reorderLayers(pageId: string, layerIds: string[], action: LayerOrderAction): Layer[] {
    const layers = this.listLayers(pageId)
    if (layers.length === 0) throw new Error('页面没有可排序的图层')
    const selected = new Set(layerIds)
    if (layerIds.length === 0 || layerIds.some((id) => !layers.some((layer) => layer.id === id))) {
      throw new Error('选择的图层不属于当前页面')
    }
    const ordered = arrangeLayerOrder(layers, selected, action)
    const now = Date.now()
    const update = this.db.prepare('UPDATE layers SET z_index = ?, updated_at = ? WHERE id = ?')
    this.db.exec('BEGIN')
    try {
      ordered.forEach((layer, index) => update.run(index + 1, now, layer.id))
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return ordered.map((layer, index) => ({ ...layer, zIndex: index + 1 }))
  }

  replaceImageLayerAsset(layerId: string, assetId: string): void {
    const layer = this.db.prepare("SELECT type FROM layers WHERE id = ?").get(layerId) as Row | undefined
    if (!layer) throw new Error('图层不存在')
    if (asString(layer.type) !== 'image') throw new Error('只有图片图层可以更换图片')
    const asset = this.db.prepare('SELECT id FROM media_assets WHERE id = ?').get(assetId) as Row | undefined
    if (!asset) throw new Error('照片不存在')
    this.db.prepare('UPDATE layers SET asset_id = ?, updated_at = ? WHERE id = ?').run(assetId, Date.now(), layerId)
  }
  updateTextLayer(layerId: string, text: string, style: Record<string, unknown>): void {
    const row = this.db.prepare('SELECT * FROM layers WHERE id = ?').get(layerId) as Row | undefined
    if (!row) throw new Error('文字图层不存在')
    if (asString(row.type) !== 'text') throw new Error('只有文字图层可以编辑文字')
    const currentStyle = JSON.parse(asString(row.style_json)) as Record<string, unknown>
    this.db.prepare('UPDATE layers SET text_content = ?, style_json = ?, updated_at = ? WHERE id = ?').run(
      text, JSON.stringify({ ...currentStyle, ...style }), Date.now(), layerId
    )
  }

  deleteLayer(layerId: string): void {
    this.db.prepare('DELETE FROM layers WHERE id = ?').run(layerId)
  }

  updatePage(pageId: string, input: Pick<Page, 'background'>): void {
    const row = this.db.prepare('SELECT work_id FROM pages WHERE id = ?').get(pageId) as Row | undefined
    if (!row) throw new Error('页面不存在')
    this.db.prepare('UPDATE pages SET background = ? WHERE id = ?').run(input.background, pageId)
    this.db.prepare('UPDATE works SET updated_at = ? WHERE id = ?').run(Date.now(), asString(row.work_id))
  }

  deletePage(pageId: string): void {
    this.db.prepare('DELETE FROM pages WHERE id = ?').run(pageId)
  }

  listTemplates(): Array<{ id: string; name: string; schemaVersion: number; isBuiltin: boolean; payload: unknown; updatedAt: number }> {
    return (this.db.prepare('SELECT * FROM templates ORDER BY is_builtin DESC, updated_at DESC').all() as Row[]).map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
      schemaVersion: asNumber(row.schema_version),
      isBuiltin: Boolean(row.is_builtin),
      payload: JSON.parse(asString(row.payload_json)),
      updatedAt: asNumber(row.updated_at)
    }))
  }

  saveTemplate(input: { id?: string; name: string; payload: unknown; isBuiltin?: boolean }): string {
    const existing = this.db.prepare('SELECT id, is_builtin FROM templates WHERE name = ?').get(input.name) as Row | undefined
    if (existing && Boolean(existing.is_builtin) && !input.isBuiltin) throw new Error('该模板名称已被内置模板使用')
    const id = existing ? asString(existing.id) : input.id ?? randomUUID()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO templates(id, name, schema_version, is_builtin, payload_json, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, payload_json = excluded.payload_json, updated_at = excluded.updated_at
    `).run(id, input.name, input.isBuiltin ? 1 : 0, JSON.stringify(input.payload), now, now)
    return id
  }

  getSourceRootImpact(rootId: string): SourceRootImpact {
    const row = this.db.prepare(`
      SELECT COUNT(DISTINCT asset_id) AS asset_count, COUNT(*) AS location_count
      FROM media_locations WHERE root_id = ?
    `).get(rootId) as Row
    return { assetCount: asNumber(row.asset_count), locationCount: asNumber(row.location_count) }
  }

  setSourceRootEnabled(rootId: string, enabled: boolean): SourceRoot {
    const row = this.db.prepare('SELECT * FROM source_roots WHERE id = ?').get(rootId) as Row | undefined
    if (!row) throw new Error('来源目录不存在')
    this.db.prepare('UPDATE source_roots SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, rootId)
    return this.mapSourceRoot({ ...row, enabled: enabled ? 1 : 0 })
  }

  removeSourceRoot(rootId: string, mode: SourceRemovalMode = 'library'): SourceRemovalResult {
    const root = this.db.prepare('SELECT * FROM source_roots WHERE id = ?').get(rootId) as Row | undefined
    if (!root) throw new Error('来源目录不存在')
    const locations = this.db.prepare('SELECT id, asset_id, absolute_path FROM media_locations WHERE root_id = ?').all(rootId) as Row[]
    const affectedAssets = new Set(locations.map((location) => asString(location.asset_id)))
    const result: SourceRemovalResult = {
      mode,
      affectedAssets: affectedAssets.size,
      removedLocations: 0,
      removedAssets: 0,
      removedAlbumItems: 0,
      removedLayers: 0
    }

    if (mode === 'disable') {
      this.db.prepare('UPDATE source_roots SET enabled = 0 WHERE id = ?').run(rootId)
      return result
    }

    const rememberIgnored = this.db.prepare('INSERT OR REPLACE INTO ignored_paths(path, ignored_at) VALUES (?, ?)')
    const now = Date.now()
    this.db.exec('BEGIN')
    try {
      if (mode === 'library') {
        for (const location of locations) rememberIgnored.run(asString(location.absolute_path), now)
        result.removedLocations = locations.length
        this.db.prepare('DELETE FROM source_roots WHERE id = ?').run(rootId)
        const updateMissing = this.db.prepare(`
          UPDATE media_assets SET missing = CASE WHEN NOT EXISTS (
            SELECT 1 FROM media_locations WHERE asset_id = media_assets.id AND status = 'available'
          ) THEN 1 ELSE 0 END, updated_at = ? WHERE id = ?
        `)
        for (const assetId of affectedAssets) updateMissing.run(now, assetId)
      } else {
        for (const assetId of affectedAssets) {
          const assetLocations = this.db.prepare('SELECT absolute_path FROM media_locations WHERE asset_id = ?').all(assetId) as Row[]
          for (const location of assetLocations) rememberIgnored.run(asString(location.absolute_path), now)
          result.removedLocations += assetLocations.length

          const layerCount = this.db.prepare('SELECT COUNT(*) AS count FROM layers WHERE asset_id = ?').get(assetId) as Row
          const albumCount = this.db.prepare('SELECT COUNT(*) AS count FROM album_items WHERE asset_id = ?').get(assetId) as Row
          result.removedLayers += asNumber(layerCount.count)
          result.removedAlbumItems += asNumber(albumCount.count)

          this.db.prepare('DELETE FROM layers WHERE asset_id = ?').run(assetId)
          this.db.prepare('DELETE FROM album_items WHERE asset_id = ?').run(assetId)
          this.db.prepare('DELETE FROM media_assets WHERE id = ?').run(assetId)
          result.removedAssets += 1
        }
        this.db.prepare('DELETE FROM source_roots WHERE id = ?').run(rootId)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return result
  }


  private clearIgnoredPathsUnder(path: string): void {
    const normalized = path.replace(/[\\/]+$/, '')
    this.db.prepare('DELETE FROM ignored_paths WHERE path = ? OR path LIKE ? OR path LIKE ?').run(
      normalized,
      `${normalized}\\%`,
      `${normalized}/%`
    )
  }
  mapAssetSummary(row: Row): MediaAssetSummary {
    return {
      id: asString(row.id),
      contentHash: asString(row.content_hash),
      width: asNumber(row.width),
      height: asNumber(row.height),
      format: asString(row.format),
      capturedAt: asNullableString(row.captured_at),
      cameraMake: asNullableString(row.camera_make),
      cameraModel: asNullableString(row.camera_model),
      lens: asNullableString(row.lens),
      focalLength: row.focal_length == null ? null : asNumber(row.focal_length),
      aperture: row.aperture == null ? null : asNumber(row.aperture),
      shutterSpeed: asNullableString(row.shutter_speed),
      iso: row.iso == null ? null : asNumber(row.iso),
      orientation: asString(row.orientation) as Orientation,
      favorite: Boolean(row.favorite),
      missing: Boolean(row.missing),
      primaryPath: asNullableString(row.primary_path),
      primaryRootId: asNullableString(row.primary_root_id),
      primaryDirectoryPath: asNullableString(row.primary_directory_path),
      locationCount: asNumber(row.location_count)
    }
  }

  mapMediaLocation(row: Row): MediaLocation {
    return {
      id: asString(row.id),
      assetId: asString(row.asset_id),
      rootId: asString(row.root_id),
      absolutePath: asString(row.absolute_path),
      relativePath: asString(row.relative_path),
      sizeBytes: asNumber(row.size_bytes),
      modifiedAt: asNumber(row.modified_at),
      status: asString(row.status) === 'missing' ? 'missing' : 'available',
      preferred: Boolean(row.preferred)
    }
  }

  mapLayer(row: Row): Layer {
    return {
      id: asString(row.id),
      pageId: asString(row.page_id),
      type: asString(row.type) as LayerType,
      assetId: asNullableString(row.asset_id),
      x: asNumber(row.x),
      y: asNumber(row.y),
      width: asNumber(row.width),
      height: asNumber(row.height),
      rotation: asNumber(row.rotation),
      zIndex: asNumber(row.z_index),
      style: JSON.parse(asString(row.style_json)) as Record<string, unknown>,
      text: asNullableString(row.text_content)
    }
  }

  mapWork(row: Row): Work {
    return {
      id: asString(row.id),
      albumId: asString(row.album_id),
      name: asString(row.name),
      outputMode: asString(row.output_mode) as OutputMode,
      canvasWidth: asNumber(row.canvas_width),
      canvasHeight: asNumber(row.canvas_height),
      background: asString(row.background),
      createdAt: asNumber(row.created_at),
      updatedAt: asNumber(row.updated_at)
    }
  }
  private mapSourceRoot(row: Row): SourceRoot {
    return {
      id: asString(row.id),
      path: asString(row.path),
      enabled: Boolean(row.enabled),
      createdAt: asNumber(row.created_at)
    }
  }
}

function arrangeLayerOrder(layers: Layer[], selected: Set<string>, action: LayerOrderAction): Layer[] {
  if (action === 'top') return [...layers.filter((layer) => !selected.has(layer.id)), ...layers.filter((layer) => selected.has(layer.id))]
  if (action === 'bottom') return [...layers.filter((layer) => selected.has(layer.id)), ...layers.filter((layer) => !selected.has(layer.id))]
  const ordered = [...layers]
  if (action === 'up') {
    for (let index = ordered.length - 2; index >= 0; index -= 1) {
      if (selected.has(ordered[index].id) && !selected.has(ordered[index + 1].id)) {
        [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]]
      }
    }
  } else {
    for (let index = 1; index < ordered.length; index += 1) {
      if (selected.has(ordered[index].id) && !selected.has(ordered[index - 1].id)) {
        [ordered[index], ordered[index - 1]] = [ordered[index - 1], ordered[index]]
      }
    }
  }
  return ordered
}
