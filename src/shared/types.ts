export type Orientation = 'landscape' | 'portrait' | 'square'
export type OutputMode = 'pages' | 'long_image'
export type LayerType = 'image' | 'text'

export interface SourceRoot {
  id: string
  path: string
  enabled: boolean
  createdAt: number
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
  locationCount: number
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
  limit: number
  offset: number
}

export interface DuplicateGroup {
  assetId: string
  contentHash: string
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

export interface WorkDocument {
  work: Work
  pages: Array<Page & { layers: Layer[] }>
}

export interface TemplateLayer {
  type: LayerType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  style: Record<string, unknown>
  text?: string
}

export interface TemplateDefinition {
  id: string
  name: string
  category: 'pages' | 'long_image'
  canvasWidth: number
  canvasHeight: number
  background: string
  layers: TemplateLayer[]
}

export interface ScanProgress {
  rootId: string
  phase: 'idle' | 'scanning' | 'reading' | 'complete' | 'error'
  discovered: number
  processed: number
  indexed: number
  errors: number
  message?: string
}

export interface ExportOptions {
  directory: string
  format: 'jpeg' | 'png'
  quality: number
  longEdge: 1080 | 1440 | 2160 | number
  gap: number
  fileNamePrefix: string
}

export interface ExportResult {
  files: string[]
  width: number
  pages: number
}

export interface AppSettings {
  thumbnailCacheLimitGb: number
  autoWatch: boolean
}

export interface ScanSummary {
  discovered: number
  indexed: number
  errors: string[]
}