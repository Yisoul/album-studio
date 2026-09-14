import type {
  Album, AppSettings, DuplicateGroup, ExportOptions, ExportResult, Layer, MediaAssetSummary,
  MediaLocation, OutputMode, Page, ScanProgress, SearchFilters, SourceRemovalMode, SourceRemovalResult, SourceRoot, SourceRootImpact, TemplateDefinition, Work, WorkDocument
} from './types'

export interface AppStats {
  assets: number
  duplicateGroups: number
  missing: number
  roots: number
}

export interface ImageLayerRequest {
  assetId: string | null
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  fit: 'cover' | 'contain'
  radius: number
}

export interface TextLayerRequest {
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

export interface CreateWorkRequest {
  albumId: string
  name: string
  outputMode: OutputMode
  templateId?: string
  canvasWidth?: number
  canvasHeight?: number
  background?: string
}

export interface AlbumStudioApi {
  app: {
    getStats(): Promise<AppStats>
    getSettings(): Promise<AppSettings>
    saveSettings(settings: AppSettings): Promise<AppSettings>
    chooseFolders(): Promise<string[]>
    chooseExportDirectory(): Promise<string | null>
    scanAll(): Promise<void>
    backupNow(): Promise<string>
    onScanProgress(callback: (progress: ScanProgress) => void): () => void
  }
  library: {
    listRoots(): Promise<SourceRoot[]>
    addRoots(paths: string[]): Promise<SourceRoot[]>
    removeRoot(rootId: string, mode: SourceRemovalMode): Promise<SourceRemovalResult>
    setRootEnabled(rootId: string, enabled: boolean): Promise<SourceRoot>
    getRootImpact(rootId: string): Promise<SourceRootImpact>
    scanRoot(rootId: string): Promise<{ discovered: number; indexed: number; errors: string[] }>
    search(filters: SearchFilters): Promise<{ items: MediaAssetSummary[]; total: number }>
    get(assetId: string): Promise<MediaAssetSummary | null>
    listDuplicates(): Promise<DuplicateGroup[]>
    listLocations(assetId: string): Promise<MediaLocation[]>
    setPreferredLocation(assetId: string, locationId: string): Promise<void>
    setFavorite(assetId: string, favorite: boolean): Promise<void>
    ignoreAsset(assetId: string): Promise<void>
    deleteOriginal(locationId: string): Promise<void>
    showInFolder(locationId: string): Promise<void>
  }
  albums: {
    list(): Promise<Album[]>
    create(name: string): Promise<Album>
    remove(albumId: string): Promise<void>
    listAssets(albumId: string): Promise<MediaAssetSummary[]>
    addAssets(albumId: string, assetIds: string[]): Promise<void>
    removeAsset(albumId: string, assetId: string): Promise<void>
    reorder(albumId: string, assetIds: string[]): Promise<void>
    setCover(albumId: string, assetId: string): Promise<void>
  }
  works: {
    list(albumId: string): Promise<Work[]>
    create(request: CreateWorkRequest): Promise<WorkDocument>
    get(workId: string): Promise<WorkDocument>
    update(workId: string, changes: Partial<Pick<Work, 'name' | 'outputMode' | 'canvasWidth' | 'canvasHeight' | 'background'>>): Promise<Work>
    remove(workId: string): Promise<void>
    createPage(workId: string, position: number, background: string): Promise<Page>
    deletePage(pageId: string): Promise<void>
    createImageLayer(pageId: string, input: ImageLayerRequest): Promise<Layer>
    createTextLayer(pageId: string, input: TextLayerRequest): Promise<Layer>
    updateLayer(layerId: string, changes: Record<string, unknown>): Promise<void>
    updateTextLayer(layerId: string, text: string, style: Record<string, unknown>): Promise<void>
    deleteLayer(layerId: string): Promise<void>
  }
  templates: {
    list(): Promise<TemplateDefinition[]>
    save(name: string, payload: TemplateDefinition): Promise<string>
  }
  exporter: {
    run(workId: string, options: ExportOptions): Promise<ExportResult>
  }
}