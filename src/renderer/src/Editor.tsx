import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Image as KonvaImage, Layer as KonvaLayer, Rect, Stage, Text as KonvaText, Transformer } from 'react-konva'
import type { ExportOptions, ExportResult, Layer, MediaAssetSummary, TemplateDefinition, WorkDocument } from '../../shared/types'
import TextInputDialog from './TextInputDialog'
import { errorMessage, previewUrl, thumbnailUrl } from './helpers'

interface EditorProps {
  workId: string
  onBack: () => Promise<void>
  onToast: (toast: { kind: 'info' | 'error'; text: string }) => void
}

type LayerPatch = Partial<Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'zIndex' | 'style' | 'text'>>

export default function Editor(props: EditorProps) {
  const [document, setDocument] = useState<WorkDocument | null>(null)
  const [albumAssets, setAlbumAssets] = useState<MediaAssetSummary[]>([])
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const next = await window.albumApi.works.get(props.workId)
    setDocument(next)
    setActivePageId((current) => current && next.pages.some((page) => page.id === current) ? current : next.pages[0]?.id ?? null)
    setLoading(false)
  }, [props.workId])

  useEffect(() => {
    void load().catch((error) => {
      props.onToast({ kind: 'error', text: errorMessage(error) })
      setLoading(false)
    })
  }, [load, props.onToast])

  useEffect(() => {
    if (!document) return
    void window.albumApi.albums.listAssets(document.work.albumId).then(setAlbumAssets)
  }, [document?.work.albumId])

  const activePage = document?.pages.find((page) => page.id === activePageId) ?? null
  const selectedLayer = activePage?.layers.find((layer) => layer.id === selectedLayerId) ?? null

  const updateLayer = async (layerId: string, patch: LayerPatch) => {
    setDocument((current) => current ? ({
      ...current,
      pages: current.pages.map((page) => ({ ...page, layers: page.layers.map((layer) => layer.id === layerId ? { ...layer, ...patch } : layer) }))
    }) : current)
    try { await window.albumApi.works.updateLayer(layerId, patch as Record<string, unknown>) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }); await load() }
  }

  const updateText = async (layerId: string, text: string, style: Record<string, unknown>) => {
    setDocument((current) => current ? ({
      ...current,
      pages: current.pages.map((page) => ({ ...page, layers: page.layers.map((layer) => layer.id === layerId ? { ...layer, text, style: { ...layer.style, ...style } } : layer) }))
    }) : current)
    try { await window.albumApi.works.updateTextLayer(layerId, text, style) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }); await load() }
  }

  const addImage = async (assetId: string) => {
    if (!activePage) return
    const count = activePage.layers.length
    try {
      const layer = await window.albumApi.works.createImageLayer(activePage.id, { assetId, x: 0.12, y: 0.12, width: 0.72, height: 0.52, rotation: 0, zIndex: count + 1, fit: 'cover', radius: 8 })
      setDocument((current) => current ? ({ ...current, pages: current.pages.map((page) => page.id === activePage.id ? { ...page, layers: [...page.layers, layer] } : page) }) : current)
      setSelectedLayerId(layer.id)
      setPickerOpen(false)
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  const addText = async () => {
    if (!activePage) return
    try {
      const layer = await window.albumApi.works.createTextLayer(activePage.id, { x: 0.1, y: 0.78, width: 0.8, height: 0.12, rotation: 0, zIndex: activePage.layers.length + 1, text: '编辑标题', fontSize: 56, color: '#111111', fontFamily: 'Microsoft YaHei', fontWeight: 'bold', align: 'left', letterSpacing: 0, lineHeight: 1.2 })
      setDocument((current) => current ? ({ ...current, pages: current.pages.map((page) => page.id === activePage.id ? { ...page, layers: [...page.layers, layer] } : page) }) : current)
      setSelectedLayerId(layer.id)
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  const addPage = async () => {
    if (!document) return
    try {
      const page = await window.albumApi.works.createPage(document.work.id, document.pages.length, document.work.background)
      setDocument({ ...document, pages: [...document.pages, { ...page, layers: [] }] })
      setActivePageId(page.id)
      setSelectedLayerId(null)
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  const deletePage = async () => {
    if (!document || !activePage || document.pages.length <= 1 || !window.confirm('删除当前页面？')) return
    try {
      await window.albumApi.works.deletePage(activePage.id)
      const remaining = document.pages.filter((page) => page.id !== activePage.id)
      setDocument({ ...document, pages: remaining })
      setActivePageId(remaining[0]?.id ?? null)
      setSelectedLayerId(null)
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  const deleteLayer = async () => {
    if (!document || !activePage || !selectedLayer) return
    try {
      await window.albumApi.works.deleteLayer(selectedLayer.id)
      setDocument({ ...document, pages: document.pages.map((page) => page.id === activePage.id ? { ...page, layers: page.layers.filter((layer) => layer.id !== selectedLayer.id) } : page) })
      setSelectedLayerId(null)
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  const saveTemplate = async (name: string) => {
    if (!document || !activePage) throw new Error('当前作品没有可保存的页面')
    const payload: TemplateDefinition = {
      id: `custom:${crypto.randomUUID()}`,
      name,
      category: document.work.outputMode,
      canvasWidth: document.work.canvasWidth,
      canvasHeight: document.work.canvasHeight,
      background: activePage.background,
      layers: activePage.layers.map((layer) => ({ type: layer.type, x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation, zIndex: layer.zIndex, style: layer.style, text: layer.type === 'text' ? layer.text ?? '' : undefined }))
    }
    await window.albumApi.templates.save(name, payload)
    setTemplateDialogOpen(false)
    props.onToast({ kind: 'info', text: '模板已保存' })
  }

  if (loading || !document) return <div className="editor-loading">正在打开作品…</div>

  return (
    <div className="editor-shell">
      <header className="editor-header"><button className="back-button" onClick={() => void props.onBack()}>← 返回相册</button><div className="editor-title"><strong>{document.work.name}</strong><span>{document.work.canvasWidth} × {document.work.canvasHeight} · {document.work.outputMode === 'long_image' ? '长图' : '多页'}</span></div><div className="header-actions"><button className="button secondary" onClick={() => setTemplateDialogOpen(true)}>存为模板</button><button className="button primary" onClick={() => setExportOpen(true)}>导出作品</button></div></header>
      <div className="editor-workspace">
        <aside className="editor-left"><div className="panel-heading"><h3>页面</h3><button onClick={() => void addPage()} title="新增页面">＋</button></div><div className="page-list">{document.pages.map((page, index) => <button className={page.id === activePage?.id ? 'active' : ''} key={page.id} onClick={() => { setActivePageId(page.id); setSelectedLayerId(null) }}><b>{String(index + 1).padStart(2, '0')}</b><span>第 {index + 1} 页</span></button>)}</div>{document.pages.length > 1 && <button className="text-button danger" onClick={() => void deletePage()}>删除当前页面</button>}<div className="panel-heading layer-heading"><h3>图层</h3><span>{activePage?.layers.length ?? 0}</span></div><div className="layer-list">{[...(activePage?.layers ?? [])].sort((a, b) => b.zIndex - a.zIndex).map((layer) => <button key={layer.id} className={layer.id === selectedLayerId ? 'active' : ''} onClick={() => setSelectedLayerId(layer.id)}><i>{layer.type === 'image' ? '▧' : 'T'}</i><span>{layer.type === 'image' ? fileNameFromLayer(layer, albumAssets) : layer.text || '文字'}</span></button>)}</div><div className="editor-add-row"><button onClick={() => setPickerOpen(true)}>＋ 图片</button><button onClick={() => void addText()}>＋ 文字</button></div></aside>
        <main className="canvas-area"><Canvas document={document} pageId={activePage?.id ?? null} selectedLayerId={selectedLayerId} onSelect={setSelectedLayerId} onChange={updateLayer} /></main>
        <aside className="editor-right">{selectedLayer ? <LayerInspector layer={selectedLayer} onUpdate={(patch) => void updateLayer(selectedLayer.id, patch)} onUpdateText={(text, style) => void updateText(selectedLayer.id, text, style)} onDelete={() => void deleteLayer()} /> : <div className="inspector-empty"><strong>选择一个图层</strong><span>可以拖动、缩放、旋转和调整属性。</span></div>}</aside>
      </div>
      {pickerOpen && <ImagePicker assets={albumAssets} onClose={() => setPickerOpen(false)} onSelect={(assetId) => void addImage(assetId)} />}
      {exportOpen && <ExportDialog work={document} onClose={() => setExportOpen(false)} onToast={props.onToast} />}
      {templateDialogOpen && <TextInputDialog title="保存自定义模板" label="模板名称" initialValue={`${document.work.name} 模板`} confirmLabel="保存模板" onClose={() => setTemplateDialogOpen(false)} onConfirm={saveTemplate} />}
    </div>
  )
}

function Canvas(props: { document: WorkDocument; pageId: string | null; selectedLayerId: string | null; onSelect: (layerId: string | null) => void; onChange: (layerId: string, patch: LayerPatch) => Promise<void> }) {
  const page = props.document.pages.find((item) => item.id === props.pageId)
  const scale = Math.min(820 / props.document.work.canvasWidth, 640 / props.document.work.canvasHeight)
  const width = Math.round(props.document.work.canvasWidth * scale)
  const height = Math.round(props.document.work.canvasHeight * scale)
  return <div className="canvas-frame" onClick={() => props.onSelect(null)}>{page ? <Stage width={width} height={height}><KonvaLayer><Rect width={width} height={height} fill={page.background || props.document.work.background} /></KonvaLayer><KonvaLayer>{[...page.layers].sort((a, b) => a.zIndex - b.zIndex).map((layer) => <EditableNode key={layer.id} layer={layer} stageWidth={width} stageHeight={height} scale={scale} selected={layer.id === props.selectedLayerId} onSelect={() => props.onSelect(layer.id)} onChange={(patch) => props.onChange(layer.id, patch)} />)}</KonvaLayer></Stage> : <div className="canvas-empty">这个作品没有页面</div>}</div>
}

function EditableNode(props: { layer: Layer; stageWidth: number; stageHeight: number; scale: number; selected: boolean; onSelect: () => void; onChange: (patch: LayerPatch) => Promise<void> }) {
  const shapeRef = useRef<Konva.Node>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const image = useImage(props.layer.type === 'image' && props.layer.assetId ? previewUrl(props.layer.assetId, 1600) : null)
  const x = props.layer.x * props.stageWidth
  const y = props.layer.y * props.stageHeight
  const width = Math.max(1, props.layer.width * props.stageWidth)
  const height = Math.max(1, props.layer.height * props.stageHeight)

  useEffect(() => {
    if (!props.selected || !transformerRef.current || !shapeRef.current) return
    transformerRef.current.nodes([shapeRef.current])
    transformerRef.current.getLayer()?.batchDraw()
  }, [props.selected, image])

  const commit = (node: Konva.Node) => {
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    node.scaleX(1); node.scaleY(1)
    void props.onChange({ x: node.x() / props.stageWidth, y: node.y() / props.stageHeight, width: Math.max(0.02, node.width() * scaleX / props.stageWidth), height: Math.max(0.02, node.height() * scaleY / props.stageHeight), rotation: node.rotation() })
  }

  const common = { x, y, width, height, rotation: props.layer.rotation, draggable: true, onClick: props.onSelect, onTap: props.onSelect, onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void props.onChange({ x: event.target.x() / props.stageWidth, y: event.target.y() / props.stageHeight }), onTransformEnd: (event: Konva.KonvaEventObject<Event>) => commit(event.target) }
  const shape = props.layer.type === 'image'
    ? image
      ? <KonvaImage {...common} ref={shapeRef as React.RefObject<Konva.Image>} image={image} cornerRadius={numberStyle(props.layer.style.radius)} />
      : <Rect {...common} ref={shapeRef as React.RefObject<Konva.Rect>} fill="#e8e4dc" stroke="#b8b0a4" dash={[8, 6]} />
    : <KonvaText {...common} ref={shapeRef as React.RefObject<Konva.Text>} text={String(props.layer.text ?? '')} fontSize={numberStyle(props.layer.style.fontSize, 48) * props.scale} fontFamily={stringStyle(props.layer.style.fontFamily, 'Microsoft YaHei')} fontStyle={stringStyle(props.layer.style.fontWeight, 'normal') === 'bold' ? 'bold' : 'normal'} fill={stringStyle(props.layer.style.color, '#111111')} align={stringStyle(props.layer.style.align, 'left') as 'left' | 'center' | 'right'} letterSpacing={numberStyle(props.layer.style.letterSpacing)} lineHeight={numberStyle(props.layer.style.lineHeight, 1.2)} />
  return <>{shape}<Transformer ref={transformerRef} rotateEnabled enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']} borderStroke="#c6653f" anchorStroke="#c6653f" anchorFill="#fffaf2" anchorSize={8} keepRatio={false} /></>
}

function useImage(url: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) { setImage(null); return }
    const next = new window.Image()
    next.onload = () => setImage(next)
    next.onerror = () => setImage(null)
    next.src = url
    return () => { next.onload = null; next.onerror = null }
  }, [url])
  return image
}

function LayerInspector(props: { layer: Layer; onUpdate: (patch: LayerPatch) => void; onUpdateText: (text: string, style: Record<string, unknown>) => void; onDelete: () => void }) {
  const [text, setText] = useState(props.layer.text ?? '')
  useEffect(() => setText(props.layer.text ?? ''), [props.layer.id, props.layer.text])
  const style = props.layer.style
  const numeric = (label: string, key: 'x' | 'y' | 'width' | 'height' | 'rotation', value: number, step = 0.01) => <label>{label}<input type="number" step={step} value={Number(value.toFixed(3))} onChange={(event) => props.onUpdate({ [key]: Number(event.target.value) })} /></label>
  return <div className="inspector"><div className="panel-heading"><h3>属性</h3><button className="text-button danger" onClick={props.onDelete}>删除</button></div><div className="inspector-grid">{numeric('X', 'x', props.layer.x)}{numeric('Y', 'y', props.layer.y)}{numeric('宽', 'width', props.layer.width)}{numeric('高', 'height', props.layer.height)}{numeric('旋转', 'rotation', props.layer.rotation, 1)}</div>{props.layer.type === 'text' ? <><label>文字内容<textarea value={text} onChange={(event) => setText(event.target.value)} onBlur={() => props.onUpdateText(text, {})} /></label><div className="inspector-grid"><label>字号<input type="number" value={numberStyle(style.fontSize, 48)} onChange={(event) => props.onUpdateText(text, { fontSize: Number(event.target.value) })} /></label><label>颜色<input type="color" value={stringStyle(style.color, '#111111')} onChange={(event) => props.onUpdateText(text, { color: event.target.value })} /></label></div><label>对齐<select value={stringStyle(style.align, 'left')} onChange={(event) => props.onUpdateText(text, { align: event.target.value })}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label></> : <div className="inspector-grid"><label>填充<select value={stringStyle(style.fit, 'cover')} onChange={(event) => props.onUpdate({ style: { ...style, fit: event.target.value } })}><option value="cover">裁剪填满</option><option value="contain">完整显示</option></select></label><label>圆角<input type="number" min="0" value={numberStyle(style.radius)} onChange={(event) => props.onUpdate({ style: { ...style, radius: Number(event.target.value) } })} /></label></div>}</div>
}

function ImagePicker(props: { assets: MediaAssetSummary[]; onClose: () => void; onSelect: (assetId: string) => void }) {
  const [query, setQuery] = useState('')
  const assets = props.assets.filter((asset) => !query || asset.primaryPath?.toLowerCase().includes(query.toLowerCase()))
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose() }}><div className="modal wide"><header><h2>选择相册照片</h2><button onClick={props.onClose}>×</button></header><div className="modal-body"><input className="search-input full" placeholder="搜索" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="picker-grid simple">{assets.map((asset) => <button key={asset.id} onClick={() => props.onSelect(asset.id)}><img src={thumbnailUrl(asset.id)} alt="照片" /><span>{asset.primaryPath?.split(/[\\/]/).pop()}</span></button>)}</div></div></div></div>
}

function ExportDialog(props: { work: WorkDocument; onClose: () => void; onToast: (toast: { kind: 'info' | 'error'; text: string }) => void }) {
  const [options, setOptions] = useState<ExportOptions>({ directory: '', format: 'jpeg', quality: 92, longEdge: 1440, gap: 24, fileNamePrefix: props.work.work.name })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const chooseDirectory = async () => { const directory = await window.albumApi.app.chooseExportDirectory(); if (directory) setOptions({ ...options, directory }) }
  const run = async () => { if (!options.directory) return; setBusy(true); try { setResult(await window.albumApi.exporter.run(props.work.work.id, options)) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } finally { setBusy(false) } }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose() }}><div className="modal"><header><h2>导出作品</h2><button onClick={props.onClose}>×</button></header><div className="modal-body"><div className="form-stack"><label>导出目录<div className="input-action"><input value={options.directory} readOnly placeholder="请选择目录" /><button onClick={() => void chooseDirectory()}>选择</button></div></label><label>文件名前缀<input value={options.fileNamePrefix} onChange={(event) => setOptions({ ...options, fileNamePrefix: event.target.value })} /></label><div className="inspector-grid"><label>格式<select value={options.format} onChange={(event) => setOptions({ ...options, format: event.target.value as 'jpeg' | 'png' })}><option value="jpeg">JPEG</option><option value="png">PNG</option></select></label><label>长边像素<select value={options.longEdge} onChange={(event) => setOptions({ ...options, longEdge: Number(event.target.value) })}><option value="1080">1080</option><option value="1440">1440</option><option value="2160">2160</option></select></label></div>{props.work.work.outputMode === 'long_image' && <label>页面间距<input type="number" value={options.gap} onChange={(event) => setOptions({ ...options, gap: Number(event.target.value) })} /></label>}<button className="button primary full" disabled={!options.directory || busy} onClick={() => void run()}>{busy ? '正在导出…' : '开始导出'}</button>{result && <div className="export-result"><strong>已导出 {result.files.length} 个文件</strong>{result.files.map((file) => <span key={file}>{file}</span>)}</div>}</div></div></div></div>
}

function fileNameFromLayer(layer: Layer, assets: MediaAssetSummary[]): string {
  const asset = assets.find((item) => item.id === layer.assetId)
  return asset?.primaryPath?.split(/[\\/]/).pop() ?? '空白图片框'
}

function numberStyle(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
function stringStyle(value: unknown, fallback: string): string { return typeof value === 'string' && value ? value : fallback }