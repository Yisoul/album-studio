import type { AlbumStudioApi } from '../../shared/api'

declare global {
  interface Window {
    albumApi: AlbumStudioApi
  }
}

export {}