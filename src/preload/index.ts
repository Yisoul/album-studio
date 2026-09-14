import { contextBridge, ipcRenderer } from 'electron'
import type { AlbumStudioApi } from '../shared/api'
import type { AppSettings, ExportOptions, LayerOrderAction, Page, ScanProgress, SearchFilters, SourceRemovalMode, TemplateDefinition } from '../shared/types'

const api: AlbumStudioApi = {
  app: {
    getStats: () => ipcRenderer.invoke('app:get-stats'),
    getSettings: () => ipcRenderer.invoke('app:get-settings'),
    saveSettings: (settings: AppSettings) => ipcRenderer.invoke('app:save-settings', settings),
    chooseFolders: () => ipcRenderer.invoke('app:choose-folders'),
    chooseExportDirectory: () => ipcRenderer.invoke('app:choose-export-directory'),
    scanAll: () => ipcRenderer.invoke('app:scan-all'),
    backupNow: () => ipcRenderer.invoke('app:backup-now'),
    onScanProgress: (callback: (progress: ScanProgress) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => callback(progress)
      ipcRenderer.on('app:scan-progress', listener)
      return () => ipcRenderer.removeListener('app:scan-progress', listener)
    }
  },
  library: {
    listRoots: () => ipcRenderer.invoke('library:list-roots'),
    addRoots: (paths: string[]) => ipcRenderer.invoke('library:add-roots', paths),
    removeRoot: (rootId: string, mode: SourceRemovalMode) => ipcRenderer.invoke('library:remove-root', rootId, mode),
    setRootEnabled: (rootId: string, enabled: boolean) => ipcRenderer.invoke('library:set-root-enabled', rootId, enabled),
    getRootImpact: (rootId: string) => ipcRenderer.invoke('library:get-root-impact', rootId),
    scanRoot: (rootId: string) => ipcRenderer.invoke('library:scan-root', rootId),
    search: (filters: SearchFilters) => ipcRenderer.invoke('library:search', filters),
    get: (assetId: string) => ipcRenderer.invoke('library:get-asset', assetId),
    listDuplicates: () => ipcRenderer.invoke('library:list-duplicates'),
    listFolders: () => ipcRenderer.invoke('library:list-folders'),
    listLocations: (assetId: string) => ipcRenderer.invoke('library:list-locations', assetId),
    setPreferredLocation: (assetId: string, locationId: string) => ipcRenderer.invoke('library:set-preferred-location', assetId, locationId),
    setFavorite: (assetId: string, favorite: boolean) => ipcRenderer.invoke('library:set-favorite', assetId, favorite),
    ignoreAsset: (assetId: string) => ipcRenderer.invoke('library:ignore-asset', assetId),
    deleteOriginal: (locationId: string) => ipcRenderer.invoke('library:delete-original', locationId),
    showInFolder: (locationId: string) => ipcRenderer.invoke('library:show-in-folder', locationId)
  },
  albums: {
    list: () => ipcRenderer.invoke('albums:list'),
    create: (name: string) => ipcRenderer.invoke('albums:create', name),
    remove: (albumId: string) => ipcRenderer.invoke('albums:remove', albumId),
    listAssets: (albumId: string) => ipcRenderer.invoke('albums:list-assets', albumId),
    addAssets: (albumId: string, assetIds: string[]) => ipcRenderer.invoke('albums:add-assets', albumId, assetIds),
    removeAsset: (albumId: string, assetId: string) => ipcRenderer.invoke('albums:remove-asset', albumId, assetId),
    reorder: (albumId: string, assetIds: string[]) => ipcRenderer.invoke('albums:reorder', albumId, assetIds),
    setCover: (albumId: string, assetId: string) => ipcRenderer.invoke('albums:set-cover', albumId, assetId)
  },
  works: {
    list: (albumId: string) => ipcRenderer.invoke('works:list', albumId),
    create: (request) => ipcRenderer.invoke('works:create', request),
    get: (workId: string) => ipcRenderer.invoke('works:get', workId),
    update: (workId: string, changes) => ipcRenderer.invoke('works:update', workId, changes),
    remove: (workId: string) => ipcRenderer.invoke('works:remove', workId),
    createPage: (workId: string, position: number, background: string) => ipcRenderer.invoke('works:create-page', workId, position, background),
    updatePage: (pageId: string, changes: Pick<Page, 'background'>) => ipcRenderer.invoke('works:update-page', pageId, changes),
    deletePage: (pageId: string) => ipcRenderer.invoke('works:delete-page', pageId),
    createImageLayer: (pageId: string, input) => ipcRenderer.invoke('works:create-image-layer', pageId, input),
    createTextLayer: (pageId: string, input) => ipcRenderer.invoke('works:create-text-layer', pageId, input),
    updateLayer: (layerId: string, changes: Record<string, unknown>) => ipcRenderer.invoke('works:update-layer', layerId, changes),
    reorderLayers: (pageId: string, layerIds: string[], action: LayerOrderAction) => ipcRenderer.invoke('works:reorder-layers', pageId, layerIds, action),
    replaceImageLayerAsset: (layerId: string, assetId: string) => ipcRenderer.invoke('works:replace-image-layer-asset', layerId, assetId),
    updateTextLayer: (layerId: string, text: string, style: Record<string, unknown>) => ipcRenderer.invoke('works:update-text-layer', layerId, text, style),
    deleteLayer: (layerId: string) => ipcRenderer.invoke('works:delete-layer', layerId)
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    save: (name: string, payload: TemplateDefinition) => ipcRenderer.invoke('templates:save', name, payload)
  },
  exporter: {
    run: (workId: string, options: ExportOptions) => ipcRenderer.invoke('exporter:run', workId, options)
  }
}

contextBridge.exposeInMainWorld('albumApi', api)