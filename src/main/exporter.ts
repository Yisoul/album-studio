import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { AppDatabase, Layer, Page, Work } from './database'

export interface ExportOptions {
  directory: string
  format: 'jpeg' | 'png'
  quality: number
  longEdge: number
  gap: number
  fileNamePrefix: string
}

export interface ExportResult {
  files: string[]
  width: number
  pages: number
}

interface CompositeLayer {
  input: Buffer
  left: number
  top: number
}

export class WorkExporter {
  constructor(private readonly db: AppDatabase) {}

  async exportWork(workId: string, options: ExportOptions): Promise<ExportResult> {
    const document = this.db.getWorkDocument(workId)
    if (!document) throw new Error('作品不存在')
    if (document.pages.length === 0) throw new Error('作品没有可导出的页面')

    await mkdir(options.directory, { recursive: true })
    const scale = options.longEdge / document.work.canvasWidth
    const pageWidth = Math.max(1, Math.round(document.work.canvasWidth * scale))
    const pageHeight = Math.max(1, Math.round(document.work.canvasHeight * scale))
    const album = this.db.getAlbum(document.work.albumId)
    const renderedPages: Buffer[] = []

    for (const page of document.pages) {
      renderedPages.push(await this.renderPage(page, document.work, pageWidth, pageHeight, album?.name ?? ''))
    }

    if (document.work.outputMode === 'long_image') {
      const gap = Math.max(0, Math.round(options.gap))
      const totalHeight = renderedPages.length * pageHeight + Math.max(0, renderedPages.length - 1) * gap
      if (totalHeight > 65535) throw new Error('长图超过 65,535 像素，请减少页面或降低分辨率')
      const overlays: CompositeLayer[] = renderedPages.map((buffer, index) => ({
        input: buffer,
        left: 0,
        top: index * (pageHeight + gap)
      }))
      const merged = await sharp({
        create: { width: pageWidth, height: totalHeight, channels: 4, background: document.work.background }
      }).composite(overlays).png().toBuffer()
      const file = await this.writeOutput(merged, options, 1, 1)
      return { files: [file], width: pageWidth, pages: 1 }
    }

    const files: string[] = []
    for (let index = 0; index < renderedPages.length; index += 1) {
      files.push(await this.writeOutput(renderedPages[index], options, index + 1, renderedPages.length))
    }
    return { files, width: pageWidth, pages: renderedPages.length }
  }

  private async renderPage(page: Page & { layers: Layer[] }, work: Work, width: number, height: number, albumName: string): Promise<Buffer> {
    const overlays: CompositeLayer[] = []

    for (const layer of [...page.layers].sort((left, right) => left.zIndex - right.zIndex)) {
      const left = Math.round(layer.x * width)
      const top = Math.round(layer.y * height)
      const layerWidth = Math.max(1, Math.round(layer.width * width))
      const layerHeight = Math.max(1, Math.round(layer.height * height))

      if (layer.type === 'image' && layer.assetId) {
        const location = this.db.getPreferredLocation(layer.assetId)
        if (!location) continue
        const radius = numberStyle(layer.style.radius)
        const resized = await sharp(location.absolutePath)
          .rotate()
          .resize(layerWidth, layerHeight, {
            fit: layer.style.fit === 'contain' ? 'contain' : 'cover',
            position: 'centre',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .ensureAlpha()
          .png()
          .toBuffer()
        let output = radius > 0 ? await applyRoundedMask(resized, layerWidth, layerHeight, radius) : resized
        if (layer.rotation) {
          output = await sharp(output).rotate(layer.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
        }
        overlays.push({ input: output, left, top })
      }

      if (layer.type === 'text' && layer.text) {
        const textBuffer = renderTextLayer(layer, layerWidth, layerHeight, albumName, width / work.canvasWidth)
        let output = textBuffer
        if (layer.rotation) {
          output = await sharp(output).rotate(layer.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
        }
        overlays.push({ input: output, left, top })
      }
    }

    return sharp({
      create: {
        width,
        height,
        channels: 4,
        background: page.background || work.background
      }
    }).composite(overlays).png().toBuffer()
  }

  private async writeOutput(buffer: Buffer, options: ExportOptions, pageNumber: number, totalPages: number): Promise<string> {
    const safePrefix = sanitizeFileName(options.fileNamePrefix || '作品')
    const suffix = totalPages > 1 ? `_${String(pageNumber).padStart(2, '0')}` : ''
    const extension = options.format === 'png' ? 'png' : 'jpg'
    const filePath = join(options.directory, `${safePrefix}${suffix}.${extension}`)
    const pipeline = sharp(buffer)
    if (options.format === 'png') {
      await pipeline.png({ compressionLevel: 9 }).toFile(filePath)
    } else {
      await pipeline.jpeg({ quality: clamp(options.quality, 1, 100), chromaSubsampling: '4:4:4' }).toFile(filePath)
    }
    return filePath
  }
}

function renderTextLayer(layer: Layer, width: number, height: number, albumName: string, scale: number): Buffer {
  const style = layer.style
  const fontSize = Math.max(1, numberStyle(style.fontSize, 48) * scale)
  const lineHeight = numberStyle(style.lineHeight, 1.2) * fontSize
  const color = stringStyle(style.color, '#111111')
  const fontFamily = stringStyle(style.fontFamily, 'Microsoft YaHei')
  const fontWeight = stringStyle(style.fontWeight, 'normal')
  const align = stringStyle(style.align, 'left')
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
  const x = align === 'center' ? width / 2 : align === 'right' ? width : 0
  const variableText = String(layer.text ?? '').replaceAll('{{album}}', albumName)
  const lines = wrapText(variableText, width, fontSize)
  const tspans = lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join('')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <text x="${x}" y="${fontSize}" fill="${escapeXml(color)}" font-family="${escapeXml(fontFamily)}"
        font-size="${fontSize}" font-weight="${escapeXml(fontWeight)}" text-anchor="${anchor}">${tspans}</text>
    </svg>`
  return Buffer.from(svg)
}

async function applyRoundedMask(buffer: Buffer, width: number, height: number, radius: number): Promise<Buffer> {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  const mask = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" rx="${safeRadius}" ry="${safeRadius}" fill="#ffffff" />
    </svg>`)
  return sharp(buffer).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}

function wrapText(text: string, width: number, fontSize: number): string[] {
  const maxChars = Math.max(1, Math.floor(width / Math.max(1, fontSize * 0.62)))
  return text.split(/\r?\n/).flatMap((line) => {
    if (!line) return ['']
    const chunks: string[] = []
    for (let index = 0; index < line.length; index += maxChars) chunks.push(line.slice(index, index + maxChars))
    return chunks
  })
}

function numberStyle(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringStyle(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || '作品'
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}