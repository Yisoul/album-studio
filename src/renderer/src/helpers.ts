import type { MediaAssetSummary } from '../../shared/types'

export function thumbnailUrl(assetId: string, size = 320): string {
  return `album-media://thumbnail/${encodeURIComponent(assetId)}?size=${size}`
}

export function previewUrl(assetId: string, size = 1600): string {
  return `album-media://preview/${encodeURIComponent(assetId)}?size=${size}`
}

export function formatDate(value: string | null): string {
  if (!value) return '未知日期'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知日期'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date)
}

export function formatCamera(asset: MediaAssetSummary): string {
  const model = [asset.cameraMake, asset.cameraModel].filter(Boolean).join(' ')
  const details = [
    model,
    asset.lens,
    asset.focalLength ? `${Math.round(asset.focalLength)}mm` : null,
    asset.aperture ? `f/${asset.aperture}` : null,
    asset.shutterSpeed,
    asset.iso ? `ISO ${asset.iso}` : null
  ].filter(Boolean)
  return details.join(' · ') || '无拍摄参数'
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}