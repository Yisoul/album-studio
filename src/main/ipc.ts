import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { z } from 'zod'
import { BUILT_IN_TEMPLATES } from '../shared/templates'
import type { AppSettings, OutputMode, SearchFilters, SourceRemovalMode, TemplateDefinition } from '../shared/types'
import type { BackupService } from './backup'
import type { AppDatabase } from './database'
import type { WorkExporter } from './exporter'
import type { LibraryScanner } from './scanner'
import type { SettingsService } from './settings'
import type { ThumbnailService } from './thumbnails'

interface IpcContext {
  db: AppDatabase
  scanner: LibraryScanner
  exporter: WorkExporter
  backups: BackupService
  settings: SettingsService
  thumbnails: ThumbnailService
  getWindow: () => BrowserWindow | null
}

const searchSchema = z.object({
  text: z.string().optional(),
  capturedFrom: z.string().optional(),
  capturedTo: z.string().optional(),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  cameraModel: z.string().optional(),
  lens: z.string().optional(),
  isoMin: z.number().optional(),
  isoMax: z.number().optional(),
  favorite: z.boolean().optional(),
  albumId: z.string().optional(),
  rootIds: z.array(z.string().uuid()).optional(),
  folderPaths: z.array(z.string()).optional(),
  sort: z.enum(['captured_desc', 'captured_asc', 'added_desc', 'added_asc', 'filename_asc', 'filename_desc']).optional(),
  limit: z.number().int().min(1).max(500).default(120),
  offset: z.number().int().min(0).default(0)
})

export function registerIpcHandlers(context: IpcContext): () => void {
  const channels = new Set<string>()
  const handle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void => {
    ipcMain.handle(channel, listener)
    channels.add(channel)
  }

  handle('app:get-stats', () => context.db.getStats())
  handle('app:get-settings', () => context.settings.get())
  handle('app:save-settings', async (_event, value: AppSettings) => {
    const saved = await context.settings.save(value)
    await configureWatchers(context)
    return saved
  })
  handle('app:choose-folders', async () => {
    const owner = context.getWindow()
    const result = owner
      ? await dialog.showOpenDialog(owner, { title: '选择照片来源文件夹', properties: ['openDirectory', 'multiSelections'] })
      : await dialog.showOpenDialog({ title: '选择照片来源文件夹', properties: ['openDirectory', 'multiSelections'] })
    return result.canceled ? [] : result.filePaths
  })
  handle('app:choose-export-directory', async () => {
    const owner = context.getWindow()
    const result = owner
      ? await dialog.showOpenDialog(owner, { title: '选择作品导出目录', properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ title: '选择作品导出目录', properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  handle('app:scan-all', async () => {
    await scanAll(context)
  })
  handle('app:backup-now', () => context.backups.createBackup())

  handle('library:list-roots', () => context.db.listSourceRoots())
  handle('library:add-roots', async (_event, paths: string[]) => {
    const roots = z.array(z.string().min(1)).parse(paths).map((path) => context.db.createSourceRoot(path))
    await configureWatchers(context)
    return roots
  })
  handle('library:remove-root', async (_event, rootId: string, mode: SourceRemovalMode) => {
    const result = context.db.removeSourceRoot(z.string().uuid().parse(rootId), z.enum(['disable', 'library', 'all']).parse(mode))
    await configureWatchers(context)
    return result
  })
  handle('library:set-root-enabled', async (_event, rootId: string, enabled: boolean) => {
    const root = context.db.setSourceRootEnabled(z.string().uuid().parse(rootId), Boolean(enabled))
    await configureWatchers(context)
    return root
  })
  handle('library:get-root-impact', (_event, rootId: string) => context.db.getSourceRootImpact(z.string().uuid().parse(rootId)))
  handle('library:scan-root', async (_event, rootId: string) => {
    const root = context.db.listSourceRoots().find((item) => item.id === rootId)
    if (!root) throw new Error('来源目录不存在')
    return context.scanner.scanRoot(root, (progress) => broadcast(context, 'app:scan-progress', progress))
  })
  handle('library:search', (_event, filters: SearchFilters) => context.db.searchAssets(searchSchema.parse(filters)))
  handle('library:get-asset', (_event, assetId: string) => context.db.getAsset(assetId))
  handle('library:list-folders', () => context.db.listFolders())
  handle('library:list-duplicates', () => context.db.listDuplicateAssets())
  handle('library:list-locations', (_event, assetId: string) => context.db.listMediaLocations(z.string().uuid().parse(assetId)))
  handle('library:set-preferred-location', (_event, assetId: string, locationId: string) => {
    context.db.setPreferredLocation(assetId, locationId)
  })
  handle('library:set-favorite', (_event, assetId: string, favorite: boolean) => {
    context.db.setFavorite(assetId, favorite)
  })
  handle('library:ignore-asset', (_event, assetId: string) => context.db.ignoreAsset(assetId))
  handle('library:delete-original', async (_event, locationId: string) => {
    const location = context.db.getLocation(locationId)
    if (!location) throw new Error('照片位置不存在')
    await shell.trashItem(location.absolutePath)
    context.db.removeLocation(locationId)
  })
  handle('library:show-in-folder', (_event, locationId: string) => {
    const location = context.db.getLocation(locationId)
    if (!location) throw new Error('照片位置不存在')
    shell.showItemInFolder(location.absolutePath)
  })

  handle('albums:list', () => context.db.listAlbums())
  handle('albums:create', (_event, name: string) => context.db.createAlbum(z.string().trim().min(1).max(80).parse(name)))
  handle('albums:remove', (_event, albumId: string) => context.db.removeAlbum(albumId))
  handle('albums:list-assets', (_event, albumId: string) => {
    return context.db.listAlbumAssets(albumId)
      .map((item) => context.db.getAsset(item.assetId))
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
  })
  handle('albums:add-assets', (_event, albumId: string, assetIds: string[]) => {
    z.array(z.string().uuid()).parse(assetIds).forEach((assetId) => context.db.addAssetToAlbum(albumId, assetId))
  })
  handle('albums:remove-asset', (_event, albumId: string, assetId: string) => context.db.removeAssetFromAlbum(albumId, assetId))
  handle('albums:reorder', (_event, albumId: string, assetIds: string[]) => context.db.reorderAlbumAssets(albumId, assetIds))
  handle('albums:set-cover', (_event, albumId: string, assetId: string) => context.db.setAlbumCover(albumId, assetId))

  handle('works:list', (_event, albumId: string) => context.db.listWorks(albumId))
  handle('works:create', (_event, request: {
    albumId: string
    name: string
    outputMode: OutputMode
    templateId?: string
    canvasWidth?: number
    canvasHeight?: number
    background?: string
  }) => createWorkFromTemplate(context, request))
  handle('works:get', (_event, workId: string) => requireWorkDocument(context, workId))
  handle('works:update', (_event, workId: string, changes: Record<string, unknown>) => {
    context.db.updateWork(workId, changes as Parameters<AppDatabase['updateWork']>[1])
    return context.db.getWork(workId)
  })
  handle('works:remove', (_event, workId: string) => context.db.deleteWork(workId))
  handle('works:create-page', (_event, workId: string, position: number, background: string) => context.db.createPage(workId, position, background))
  handle('works:delete-page', (_event, pageId: string) => context.db.deletePage(pageId))
  handle('works:create-image-layer', (_event, pageId: string, input: Record<string, unknown>) => context.db.createImageLayer(pageId, input as unknown as Parameters<AppDatabase['createImageLayer']>[1]))
  handle('works:create-text-layer', (_event, pageId: string, input: Record<string, unknown>) => context.db.createTextLayer(pageId, input as unknown as Parameters<AppDatabase['createTextLayer']>[1]))
  handle('works:update-layer', (_event, layerId: string, changes: Record<string, unknown>) => context.db.updateLayer(layerId, changes as Parameters<AppDatabase['updateLayer']>[1]))
  handle('works:replace-image-layer-asset', (_event, layerId: string, assetId: string) => context.db.replaceImageLayerAsset(layerId, assetId))
  handle('works:update-text-layer', (_event, layerId: string, text: string, style: Record<string, unknown>) => context.db.updateTextLayer(layerId, text, style))
  handle('works:delete-layer', (_event, layerId: string) => context.db.deleteLayer(layerId))

  handle('templates:list', () => context.db.listTemplates().map((item) => item.payload as TemplateDefinition))
  handle('templates:save', (_event, name: string, payload: TemplateDefinition) => context.db.saveTemplate({ id: payload.id, name, payload }))

  handle('exporter:run', (_event, workId: string, options: Parameters<WorkExporter['exportWork']>[1]) => context.exporter.exportWork(workId, options))

  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel)
  }
}

export function seedTemplates(db: AppDatabase): void {
  for (const template of BUILT_IN_TEMPLATES) {
    db.saveTemplate({ id: `builtin:${template.id}`, name: template.name, payload: template, isBuiltin: true })
  }
}

async function configureWatchers(context: IpcContext): Promise<void> {
  await context.scanner.close()
  const settings = await context.settings.get()
  if (!settings.autoWatch) return
  for (const root of context.db.listSourceRoots().filter((item) => item.enabled)) context.scanner.watchRoot(root)
}

async function scanAll(context: IpcContext): Promise<void> {
  const roots = context.db.listSourceRoots()
  await context.scanner.scanAll(roots, (progress) => broadcast(context, 'app:scan-progress', progress))
}

function broadcast(context: IpcContext, channel: string, payload: unknown): void {
  const window = context.getWindow()
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
}

function createWorkFromTemplate(context: IpcContext, request: {
  albumId: string
  name: string
  outputMode: OutputMode
  templateId?: string
  canvasWidth?: number
  canvasHeight?: number
  background?: string
}) {
  const template = context.db.listTemplates()
    .map((item) => item.payload as TemplateDefinition)
    .find((item) => item.id === request.templateId)
  const outputMode = template?.category ?? request.outputMode
  const work = context.db.createWork({
    albumId: request.albumId,
    name: request.name,
    outputMode,
    canvasWidth: request.canvasWidth ?? template?.canvasWidth ?? 1080,
    canvasHeight: request.canvasHeight ?? template?.canvasHeight ?? 1440,
    background: request.background ?? template?.background ?? '#ffffff'
  })
  const page = context.db.createPage(work.id, 0, template?.background ?? work.background)
  const albumAssets = context.db.listAlbumAssets(request.albumId)
  let imageIndex = 0

  for (const layer of template?.layers ?? []) {
    if (layer.type === 'image') {
      const asset = albumAssets[imageIndex++]?.assetId ?? null
      context.db.createImageLayer(page.id, {
        assetId: asset,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
        zIndex: layer.zIndex,
        fit: layer.style.fit === 'contain' ? 'contain' : 'cover',
        radius: typeof layer.style.radius === 'number' ? layer.style.radius : 0
      })
    } else {
      context.db.createTextLayer(page.id, {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
        zIndex: layer.zIndex,
        text: layer.text ?? '{{album}}',
        fontSize: typeof layer.style.fontSize === 'number' ? layer.style.fontSize : 56,
        color: typeof layer.style.color === 'string' ? layer.style.color : '#111111',
        fontFamily: typeof layer.style.fontFamily === 'string' ? layer.style.fontFamily : 'Microsoft YaHei',
        fontWeight: typeof layer.style.fontWeight === 'string' ? layer.style.fontWeight : 'normal',
        align: layer.style.align === 'center' || layer.style.align === 'right' ? layer.style.align : 'left',
        letterSpacing: typeof layer.style.letterSpacing === 'number' ? layer.style.letterSpacing : 0,
        lineHeight: typeof layer.style.lineHeight === 'number' ? layer.style.lineHeight : 1.2
      })
    }
  }

  return requireWorkDocument(context, work.id)
}

function requireWorkDocument(context: IpcContext, workId: string) {
  const document = context.db.getWorkDocument(workId)
  if (!document) throw new Error('作品不存在')
  return document
}