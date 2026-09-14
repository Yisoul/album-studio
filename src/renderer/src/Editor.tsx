import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Group as KonvaGroup, Image as KonvaImage, Layer as KonvaLayer, Rect, Stage, Text as KonvaText, Transformer } from 'react-konva'
import type { ExportOptions, ExportResult, Layer, LayerOrderAction, MediaAssetSummary, TemplateDefinition, Work, WorkDocument } from '../../shared/types'
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
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([])
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [textFocusToken, setTextFocusToken] = useState(0)
  const [editingText, setEditingText] = useState<{ id: string; original: string } | null>(null)
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
  useEffect(() => {
    const clearSelection = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedLayerIds([]) }
    window.addEventListener('keydown', clearSelection)
    return () => window.removeEventListener('keydown', clearSelection)
  }, [])
  const activePage = document?.pages.find((page) => page.id === activePageId) ?? null
  const selectedLayers = (activePage?.layers ?? []).filter((layer) => selectedLayerIds.includes(layer.id))
  const selectedLayer = selectedLayers.length === 1 ? selectedLayers[0] : null

  const updateLayer = async (layerId: string, patch: LayerPatch) => {
    setDocument((current) => current ? ({
      ...current,
      pages: current.pages.map((page) => ({ ...page, layers: page.layers.map((layer) => layer.id === layerId ? { ...layer, ...patch } : layer) }))
    }) : current)
    try { await window.albumApi.works.updateLayer(layerId, patch as Record<string, unknown>) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }); await load() }
  }

  const previewText = (layerId: string, text: string) => {
    setDocument((current) => current ? ({
      ...current,
      pages: current.pages.map((page) => ({ ...page, layers: page.layers.map((layer) => layer.id === layerId ? { ...layer, text } : layer) }))
    }) : current)
  }

  const updateText = async (layerId: string, text: string, style: Record<string, unknown>) => {
    previewText(layerId, text)
    try { await window.albumApi.works.updateTextLayer(layerId, text, style) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }); await load() }
  }

  const updatePageBackground = async (background: string) => {
    if (!activePage) return
    setDocument((current) => current ? ({ ...current, pages: current.pages.map((page) => page.id === activePage.id ? { ...page, background } : page) }) : current)
    try { await window.albumApi.works.updatePage(activePage.id, { background }) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }); await load() }
  }

  const reorderLayers = async (layerIds: string[], action: LayerOrderAction) => {
    if (!document || !activePage || layerIds.length === 0) return
    try {
      const reordered = await window.albumApi.works.reorderLayers(activePage.id, layerIds, action)
      const indexes = new Map(reordered.map((layer) => [layer.id, layer.zIndex]))
      setDocument({ ...document, pages: document.pages.map((page) => page.id === activePage.id ? { ...page, layers: page.layers.map((layer) => ({ ...layer, zIndex: indexes.get(layer.id) ?? layer.zIndex })) } : page) })
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  const reorderSelected = async (action: LayerOrderAction) => reorderLayers(selectedLayerIds, action)

  const addImage = async (assetId: string) => {
    if (!activePage) return
    const count = activePage.layers.length
    const frame = imageFrameFor(albumAssets.find((asset) => asset.id === assetId))
    try {
      const layer = await window.albumApi.works.createImageLayer(activePage.id, { assetId, ...frame, rotation: 0, zIndex: count + 1, fit: 'contain', radius: 8 })
      setDocument((current) => current ? ({ ...current, pages: current.pages.map((page) => page.id === activePage.id ? { ...page, layers: [...page.layers, layer] } : page) }) : current)
      setSelectedLayerIds([layer.id])
      setPickerOpen(false)
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  const replaceImage = async (assetId: string) => {
    if (!document || !activePage || !replaceTargetId) return
    try {
      await window.albumApi.works.replaceImageLayerAsset(replaceTargetId, assetId)
      setDocument({ ...document, pages: document.pages.map((page) => page.id === activePage.id ? { ...page, layers: page.layers.map((layer) => layer.id === replaceTargetId ? { ...layer, assetId } : layer) } : page) })
      setReplaceTargetId(null)
      setPickerOpen(false)
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  const beginInlineTextEditing = (layerId: string) => {
    const layer = activePage?.layers.find((item) => item.id === layerId)
    if (!layer || layer.type !== 'text') return
    setSelectedLayerIds([layerId])
    setEditingText({ id: layerId, original: layer.text ?? '' })
  }

  const addText = async () => {
    if (!activePage) return
    try {
      const layer = await window.albumApi.works.createTextLayer(activePage.id, { x: 0.1, y: 0.78, width: 0.8, height: 0.12, rotation: 0, zIndex: activePage.layers.length + 1, text: '编辑标题', fontSize: 56, color: '#111111', fontFamily: 'Microsoft YaHei', fontWeight: 'bold', align: 'left', letterSpacing: 0, lineHeight: 1.2 })
      setDocument((current) => current ? ({ ...current, pages: current.pages.map((page) => page.id === activePage.id ? { ...page, layers: [...page.layers, layer] } : page) }) : current)
      setSelectedLayerIds([layer.id])
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  const addPage = async () => {
    if (!document) return
    try {
      const page = await window.albumApi.works.createPage(document.work.id, document.pages.length, document.work.background)
      setDocument({ ...document, pages: [...document.pages, { ...page, layers: [] }] })
      setActivePageId(page.id)
      setSelectedLayerIds([])
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  const deletePage = async () => {
    if (!document || !activePage || document.pages.length <= 1 || !window.confirm('删除当前页面？')) return
    try {
      await window.albumApi.works.deletePage(activePage.id)
      const remaining = document.pages.filter((page) => page.id !== activePage.id)
      setDocument({ ...document, pages: remaining })
      setActivePageId(remaining[0]?.id ?? null)
      setSelectedLayerIds([])
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  const deleteLayers = async () => {
    if (!document || !activePage || selectedLayerIds.length === 0) return
    if (!window.confirm(`删除选中的 ${selectedLayerIds.length} 个图层？`)) return
    try {
      for (const layerId of selectedLayerIds) await window.albumApi.works.deleteLayer(layerId)
      setDocument({ ...document, pages: document.pages.map((page) => page.id === activePage.id ? { ...page, layers: page.layers.filter((layer) => !selectedLayerIds.includes(layer.id)) } : page) })
      setSelectedLayerIds([])
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
        <aside className="editor-left"><div className="panel-heading"><h3>页面</h3><button onClick={() => void addPage()} title="新增页面">＋</button></div><div className="page-list">{document.pages.map((page, index) => <button className={page.id === activePage?.id ? 'active' : ''} key={page.id} onClick={() => { setActivePageId(page.id); setSelectedLayerIds([]) }}><b>{String(index + 1).padStart(2, '0')}</b><span>第 {index + 1} 页</span></button>)}</div>{document.pages.length > 1 && <button className="text-button danger" onClick={() => void deletePage()}>删除当前页面</button>}<div className="panel-heading layer-heading"><h3>图层</h3><span>{activePage?.layers.length ?? 0}</span></div><div className="layer-list">{[...(activePage?.layers ?? [])].sort((a, b) => b.zIndex - a.zIndex).map((layer) => { const active = selectedLayerIds.includes(layer.id); return <div className={`layer-row ${active ? 'active' : ''}`} key={layer.id}><button className="layer-select" onClick={(event) => setSelectedLayerIds((current) => event.ctrlKey || event.metaKey ? (current.includes(layer.id) ? current.filter((id) => id !== layer.id) : [...current, layer.id]) : [layer.id])}><i>{layer.type === 'image' ? '▧' : 'T'}</i><span>{layer.type === 'image' ? fileNameFromLayer(layer, albumAssets) : layer.text || '文字'}</span></button><div className="layer-quick-actions"><button title="置顶" onClick={(event) => { event.stopPropagation(); setSelectedLayerIds([layer.id]); void reorderLayers([layer.id], 'top') }}>⇈</button><button title="置底" onClick={(event) => { event.stopPropagation(); setSelectedLayerIds([layer.id]); void reorderLayers([layer.id], 'bottom') }}>⇊</button></div></div> })}</div><div className="editor-add-row"><button onClick={() => setPickerOpen(true)}>＋ 图片</button><button onClick={() => void addText()}>＋ 文字</button></div></aside>
        <main className="canvas-area"><Canvas document={document} pageId={activePage?.id ?? null} selectedLayerIds={selectedLayerIds} editingTextId={editingText?.id ?? null} onSelect={(layerId, additive) => setSelectedLayerIds((current) => layerId == null ? [] : additive ? (current.includes(layerId) ? current.filter((id) => id !== layerId) : [...current, layerId]) : [layerId])} onEdit={beginInlineTextEditing} onTextPreview={previewText} onTextCommit={(layerId, value) => { setEditingText(null); void updateText(layerId, value, {}) }} onTextCancel={() => { if (editingText) previewText(editingText.id, editingText.original); setEditingText(null) }} onChange={updateLayer} /></main>
        <aside className="editor-right"><PageSettings background={activePage?.background ?? document.work.background} onChange={(background) => void updatePageBackground(background)} />{selectedLayers.length > 1 ? <MultiSelectionPanel count={selectedLayers.length} onReorder={(action) => void reorderSelected(action)} onDelete={() => void deleteLayers()} onClear={() => setSelectedLayerIds([])} /> : selectedLayer ? <LayerInspector work={document.work} layer={selectedLayer} asset={albumAssets.find((asset) => asset.id === selectedLayer.assetId)} focusToken={textFocusToken} onPreviewText={previewText} onReorder={(action) => void reorderSelected(action)} onUpdate={(patch) => void updateLayer(selectedLayer.id, patch)} onUpdateText={(text, style) => void updateText(selectedLayer.id, text, style)} onReplace={() => { setReplaceTargetId(selectedLayer.id); setPickerOpen(true) }} onDelete={() => void deleteLayers()} /> : <InspectorEmpty onAddText={() => void addText()} onAddImage={() => { setReplaceTargetId(null); setPickerOpen(true) }} />}</aside>
      </div>
      {pickerOpen && <ImagePicker title={replaceTargetId ? '更换图片' : '添加图片'} assets={albumAssets} onClose={() => { setPickerOpen(false); setReplaceTargetId(null) }} onSelect={(assetId) => void (replaceTargetId ? replaceImage(assetId) : addImage(assetId))} />}
      {exportOpen && <ExportDialog work={document} onClose={() => setExportOpen(false)} onToast={props.onToast} />}
      {templateDialogOpen && <TextInputDialog title="保存自定义模板" label="模板名称" initialValue={`${document.work.name} 模板`} confirmLabel="保存模板" onClose={() => setTemplateDialogOpen(false)} onConfirm={saveTemplate} />}
    </div>
  )
}

function Canvas(props: {
  document: WorkDocument
  pageId: string | null
  selectedLayerIds: string[]
  editingTextId: string | null
  onSelect: (layerId: string | null, additive: boolean) => void
  onEdit: (layerId: string) => void
  onTextPreview: (layerId: string, text: string) => void
  onTextCommit: (layerId: string, text: string) => void
  onTextCancel: () => void
  onChange: (layerId: string, patch: LayerPatch) => Promise<void>
}) {
  const page = props.document.pages.find((item) => item.id === props.pageId)
  const scale = Math.min(820 / props.document.work.canvasWidth, 640 / props.document.work.canvasHeight)
  const width = Math.round(props.document.work.canvasWidth * scale)
  const height = Math.round(props.document.work.canvasHeight * scale)
  const nodeRefs = useRef(new Map<string, Konva.Node>())
  const transformerRef = useRef<Konva.Transformer>(null)
  const selectionKey = `${props.selectedLayerIds.join('|')}|${props.editingTextId ?? ''}`
  const editingLayer = page?.layers.find((layer) => layer.id === props.editingTextId && layer.type === 'text') ?? null

  useEffect(() => {
    const nodes = props.selectedLayerIds.filter((id) => id !== props.editingTextId).map((id) => nodeRefs.current.get(id)).filter((node): node is Konva.Node => Boolean(node))
    transformerRef.current?.nodes(nodes)
    transformerRef.current?.getLayer()?.batchDraw()
  }, [selectionKey, page])

  const registerNode = (layerId: string, node: Konva.Node | null) => {
    if (node) nodeRefs.current.set(layerId, node)
    else nodeRefs.current.delete(layerId)
  }

  const commitSelected = () => {
    for (const layerId of props.selectedLayerIds) {
      const node = nodeRefs.current.get(layerId)
      if (!node) continue
      const scaleX = node.scaleX()
      const scaleY = node.scaleY()
      node.scaleX(1)
      node.scaleY(1)
      void props.onChange(layerId, { x: node.x() / width, y: node.y() / height, width: Math.max(0.02, node.width() * scaleX / width), height: Math.max(0.02, node.height() * scaleY / height), rotation: node.rotation() })
    }
  }

  if (!page) return <div className="canvas-frame"><div className="canvas-empty">这个作品没有页面</div></div>
  return <div className="canvas-frame">
    <div className="canvas-stage-wrap" style={{ width, height }}>
      <Stage width={width} height={height} onMouseDown={(event) => { if (event.target === event.target.getStage()) { props.onTextCancel(); props.onSelect(null, false) } }}>
        <KonvaLayer><Rect width={width} height={height} fill={page.background || props.document.work.background} listening={false} /></KonvaLayer>
        <KonvaLayer>
          {[...page.layers].sort((a, b) => a.zIndex - b.zIndex).map((layer) => <EditableNode key={layer.id} layer={layer} stageWidth={width} stageHeight={height} scale={scale} selected={props.selectedLayerIds.includes(layer.id) && layer.id !== props.editingTextId} editing={layer.id === props.editingTextId} onSelect={(additive) => props.onSelect(layer.id, additive)} onChange={(patch) => props.onChange(layer.id, patch)} onEdit={() => props.onEdit(layer.id)} registerNode={registerNode} />)}
          <Transformer ref={transformerRef} rotateEnabled enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']} borderStroke="#c6653f" anchorStroke="#c6653f" anchorFill="#fffaf2" anchorSize={8} keepRatio={false} onTransformEnd={commitSelected} />
        </KonvaLayer>
      </Stage>
      {editingLayer && <textarea
        key={editingLayer.id}
        className="inline-text-editor"
        autoFocus
        value={editingLayer.text ?? ''}
        onChange={(event) => props.onTextPreview(editingLayer.id, event.target.value)}
        onBlur={() => props.onTextCommit(editingLayer.id, editingLayer.text ?? '')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); props.onTextCancel() }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); props.onTextCommit(editingLayer.id, editingLayer.text ?? '') }
        }}
        style={{
          left: editingLayer.x * width,
          top: editingLayer.y * height,
          width: Math.max(40, editingLayer.width * width),
          height: Math.max(28, editingLayer.height * height),
          transform: `rotate(${editingLayer.rotation}deg)`,
          fontSize: Math.max(10, numberStyle(editingLayer.style.fontSize, 48) * scale),
          fontFamily: stringStyle(editingLayer.style.fontFamily, 'Microsoft YaHei'),
          fontWeight: stringStyle(editingLayer.style.fontWeight, 'normal') === 'bold' ? 700 : 400,
          color: stringStyle(editingLayer.style.color, '#111111'),
          textAlign: stringStyle(editingLayer.style.align, 'left') as React.CSSProperties['textAlign'],
          lineHeight: numberStyle(editingLayer.style.lineHeight, 1.2),
          letterSpacing: numberStyle(editingLayer.style.letterSpacing) * scale,
          caretColor: stringStyle(editingLayer.style.color, '#111111')
        }}
      />}
    </div>
  </div>
}

function EditableNode(props: { layer: Layer; stageWidth: number; stageHeight: number; scale: number; selected: boolean; editing: boolean; onSelect: (additive: boolean) => void; onEdit: () => void; onChange: (patch: LayerPatch) => Promise<void>; registerNode: (layerId: string, node: Konva.Node | null) => void }) {
  const shapeRef = useRef<Konva.Node>(null)
  const image = useImage(props.layer.type === 'image' && props.layer.assetId ? previewUrl(props.layer.assetId, 1600) : null)
  const x = props.layer.x * props.stageWidth
  const y = props.layer.y * props.stageHeight
  const width = Math.max(1, props.layer.width * props.stageWidth)
  const height = Math.max(1, props.layer.height * props.stageHeight)
  useEffect(() => {
    props.registerNode(props.layer.id, shapeRef.current)
    return () => props.registerNode(props.layer.id, null)
  }, [props.layer.id, image, props.registerNode])
  const commit = (node: Konva.Node) => {
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    node.scaleX(1); node.scaleY(1)
    void props.onChange({ x: node.x() / props.stageWidth, y: node.y() / props.stageHeight, width: Math.max(0.02, node.width() * scaleX / props.stageWidth), height: Math.max(0.02, node.height() * scaleY / props.stageHeight), rotation: node.rotation() })
  }
  const common = {
    x,
    y,
    width,
    height,
    rotation: props.layer.rotation,
    draggable: true,
    onClick: (event: Konva.KonvaEventObject<MouseEvent>) => { const additive = event.evt.ctrlKey || event.evt.metaKey; props.onSelect(additive); if (props.layer.type === 'text' && props.selected && !additive) props.onEdit() },
    onTap: () => props.onSelect(false),
    onDblClick: (event: Konva.KonvaEventObject<MouseEvent>) => { event.cancelBubble = true; props.onSelect(false); props.onEdit() },
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void props.onChange({ x: event.target.x() / props.stageWidth, y: event.target.y() / props.stageHeight }),
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) => commit(event.target)
  }
  if (props.layer.type === 'text') {
    return <KonvaText {...common} visible={!props.editing} ref={shapeRef as React.RefObject<Konva.Text>} text={String(props.layer.text ?? '')} fontSize={numberStyle(props.layer.style.fontSize, 48) * props.scale} fontFamily={stringStyle(props.layer.style.fontFamily, 'Microsoft YaHei')} fontStyle={stringStyle(props.layer.style.fontWeight, 'normal') === 'bold' ? 'bold' : 'normal'} fill={stringStyle(props.layer.style.color, '#111111')} align={stringStyle(props.layer.style.align, 'left') as 'left' | 'center' | 'right'} letterSpacing={numberStyle(props.layer.style.letterSpacing)} lineHeight={numberStyle(props.layer.style.lineHeight, 1.2)} />
  }
  if (!image) {
    return <Rect {...common} ref={shapeRef as React.RefObject<Konva.Rect>} fill="#e8e4dc" stroke="#b8b0a4" dash={[8, 6]} />
  }
  const geometry = imageLayerGeometry(image, width, height, stringStyle(props.layer.style.fit, 'contain'))
  return <KonvaGroup {...common} ref={shapeRef as React.RefObject<Konva.Group>}>
    <Rect width={width} height={height} fill="rgba(0,0,0,0.001)" />
    <KonvaImage image={image} {...geometry} listening={false} cornerRadius={numberStyle(props.layer.style.radius)} />
  </KonvaGroup>
}

function imageLayerGeometry(image: HTMLImageElement, width: number, height: number, fit: string): { x?: number; y?: number; width: number; height: number; crop?: { x: number; y: number; width: number; height: number } } {
  const naturalWidth = image.naturalWidth || image.width || width
  const naturalHeight = image.naturalHeight || image.height || height
  const imageRatio = naturalWidth / naturalHeight
  const frameRatio = width / height
  if (fit === 'stretch') return { width, height }
  if (fit === 'contain') {
    if (imageRatio > frameRatio) {
      const drawHeight = width / imageRatio
      return { x: 0, y: (height - drawHeight) / 2, width, height: drawHeight }
    }
    const drawWidth = height * imageRatio
    return { x: (width - drawWidth) / 2, y: 0, width: drawWidth, height }
  }
  if (imageRatio > frameRatio) {
    const sourceWidth = naturalHeight * frameRatio
    return { width, height, crop: { x: (naturalWidth - sourceWidth) / 2, y: 0, width: sourceWidth, height: naturalHeight } }
  }
  const sourceHeight = naturalWidth / frameRatio
  return { width, height, crop: { x: 0, y: (naturalHeight - sourceHeight) / 2, width: naturalWidth, height: sourceHeight } }
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

function PageSettings(props: { background: string; onChange: (background: string) => void }) {
  const presets = ['#ffffff', '#f4f1ea', '#111111', '#000000']
  return <section className="page-settings">
    <div className="page-settings-head"><div><span>当前页面</span><strong>背景颜色</strong></div><input type="color" value={props.background} onChange={(event) => props.onChange(event.target.value)} /></div>
    <div className="background-presets">{presets.map((color) => <button key={color} title={color} className={props.background.toLowerCase() === color ? 'active' : ''} style={{ background: color }} onClick={() => props.onChange(color)} />)}</div>
  </section>
}

function LayerInspector(props: { work: Work; layer: Layer; asset?: MediaAssetSummary; focusToken: number; onPreviewText: (layerId: string, text: string) => void; onUpdate: (patch: LayerPatch) => void; onUpdateText: (text: string, style: Record<string, unknown>) => void; onReplace: () => void; onDelete: () => void; onReorder: (action: LayerOrderAction) => void }) {
  const [text, setText] = useState(props.layer.text ?? '')
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const layerIdRef = useRef(props.layer.id)
  const originalTextRef = useRef(props.layer.text ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const changedLayer = layerIdRef.current !== props.layer.id
    if (changedLayer || !dirtyRef.current) {
      setText(props.layer.text ?? '')
      setDirty(false)
      dirtyRef.current = false
      if (changedLayer) originalTextRef.current = props.layer.text ?? ''
    }
    layerIdRef.current = props.layer.id
  }, [props.layer.id, props.layer.text])
  useEffect(() => {
    if (props.layer.type !== 'text' || props.focusToken === 0) return
    const frame = requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.select() })
    return () => cancelAnimationFrame(frame)
  }, [props.focusToken, props.layer.id, props.layer.type])
  const style = props.layer.style
  const numeric = (label: string, key: 'x' | 'y' | 'width' | 'height' | 'rotation') => {
    const horizontal = key === 'x' || key === 'width'
    const canvasSize = horizontal ? props.work.canvasWidth : props.work.canvasHeight
    const raw = props.layer[key]
    const pixelValue = key === 'rotation' ? raw : raw * canvasSize
    const unit = key === 'rotation' ? '°' : 'px'
    return <label className="number-field"><span>{label}</span><div className="number-input"><input type="number" step="1" value={Math.round(pixelValue * 10) / 10} onChange={(event) => props.onUpdate({ [key]: key === 'rotation' ? Number(event.target.value) : Number(event.target.value) / canvasSize })} /><em>{unit}</em></div></label>
  }
  const commitText = () => {
    if (!dirtyRef.current) return
    dirtyRef.current = false
    setDirty(false)
    props.onUpdateText(text, {})
  }
  const cancelText = () => {
    const original = originalTextRef.current
    setText(original)
    setDirty(false)
    dirtyRef.current = false
    props.onPreviewText(props.layer.id, original)
  }
  const restoreImageAspect = () => {
    if (!props.asset || props.asset.width <= 0 || props.asset.height <= 0) return
    const imageRatio = props.asset.width / props.asset.height
    const nextHeight = props.layer.width * props.work.canvasWidth / imageRatio / props.work.canvasHeight
    props.onUpdate({ height: Math.min(0.98, Math.max(0.02, nextHeight)) })
  }
  return (
    <div className="inspector">
      <div className="inspector-head"><div><span>{props.layer.type === 'image' ? '图片图层' : '文字图层'}</span><strong>{props.layer.type === 'image' ? '图片设置' : '文字设置'}</strong></div><button className="icon-danger" title="删除图层" onClick={props.onDelete}>删除</button></div>
      <section className="inspector-section">
        <div className="section-title"><h4>位置</h4><small>画布像素</small></div>
        <div className="inspector-grid">{numeric('X', 'x')}{numeric('Y', 'y')}</div>
        <div className="inspector-actions"><button onClick={() => props.onUpdate({ x: (1 - props.layer.width) / 2 })}>水平居中</button><button onClick={() => props.onUpdate({ y: (1 - props.layer.height) / 2 })}>垂直居中</button></div>
      </section>
      <section className="inspector-section">
        <div className="section-title"><h4>大小与旋转</h4><small>可直接拖控制点</small></div>
        <div className="inspector-grid">{numeric('宽', 'width')}{numeric('高', 'height')}{numeric('旋转', 'rotation')}</div>
        <p>选中后拖动四角或边缘控制点，可自由改变宽高和比例。</p>
      </section>
      <section className="inspector-section">
        <h4>图层顺序</h4>
        <div className="reorder-grid"><button onClick={() => props.onReorder('top')}>置顶</button><button onClick={() => props.onReorder('up')}>上移</button><button onClick={() => props.onReorder('down')}>下移</button><button onClick={() => props.onReorder('bottom')}>置底</button></div>
      </section>
      {props.layer.type === 'text' ? <section className="inspector-section">
        <h4>文字内容</h4>
        <textarea ref={textareaRef} value={text} onChange={(event) => { const value = event.target.value; setText(value); setDirty(true); dirtyRef.current = true; props.onPreviewText(props.layer.id, value) }} onBlur={commitText} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commitText() } if (event.key === 'Escape') { event.preventDefault(); cancelText(); event.currentTarget.blur() } }} placeholder="输入文字，支持换行" />
        <div className="text-commit-row"><span>{dirty ? '内容尚未应用' : '内容已保存'}</span><button disabled={!dirty} onMouseDown={(event) => event.preventDefault()} onClick={commitText}>应用文字</button></div>
        <div className="inspector-grid"><label>字号<input type="number" min="1" value={numberStyle(style.fontSize, 48)} onChange={(event) => props.onUpdateText(text, { fontSize: Number(event.target.value) })} /></label><label>颜色<input type="color" value={stringStyle(style.color, '#111111')} onChange={(event) => props.onUpdateText(text, { color: event.target.value })} /></label></div>
        <label>字体<input value={stringStyle(style.fontFamily, 'Microsoft YaHei')} onChange={(event) => props.onUpdateText(text, { fontFamily: event.target.value })} /></label>
        <div className="inspector-grid"><label>对齐<select value={stringStyle(style.align, 'left')} onChange={(event) => props.onUpdateText(text, { align: event.target.value })}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label><label>字重<select value={stringStyle(style.fontWeight, 'normal')} onChange={(event) => props.onUpdateText(text, { fontWeight: event.target.value })}><option value="normal">常规</option><option value="bold">加粗</option></select></label></div>
        <div className="inspector-grid"><label>行距<input type="number" min="0.8" max="3" step="0.1" value={numberStyle(style.lineHeight, 1.2)} onChange={(event) => props.onUpdateText(text, { lineHeight: Number(event.target.value) })} /></label><label>字距<input type="number" step="0.5" value={numberStyle(style.letterSpacing)} onChange={(event) => props.onUpdateText(text, { letterSpacing: Number(event.target.value) })} /></label></div>
        <p>双击画布上的文字可直接就地编辑；支持 {'{{album}}'}、{'{{camera}}'}、{'{{lens}}'}、{'{{date}}'} 等变量。</p>
      </section> : <section className="inspector-section">
        <div className="section-title"><h4>图片</h4><small>{props.asset ? `${props.asset.width} × ${props.asset.height}` : '缺失图片'}</small></div>
        <button className="button secondary full" onClick={props.onReplace}>更换图片</button>
        <div className="inspector-grid"><label>显示方式<select value={stringStyle(style.fit, 'contain')} onChange={(event) => props.onUpdate({ style: { ...style, fit: event.target.value } })}><option value="contain">完整显示（保持比例）</option><option value="cover">裁剪填满</option><option value="stretch">拉伸填满（可变形）</option></select></label><label>圆角<input type="number" min="0" value={numberStyle(style.radius)} onChange={(event) => props.onUpdate({ style: { ...style, radius: Number(event.target.value) } })} /></label></div>
        <button className="button secondary full" disabled={!props.asset} onClick={restoreImageAspect}>按原图比例调整高度</button>
        <p>拖动四角可自由拉伸；需要不变形时选择“完整显示”，需要裁切时选择“裁剪填满”。</p>
      </section>}
    </div>
  )
}

function MultiSelectionPanel(props: { count: number; onReorder: (action: LayerOrderAction) => void; onDelete: () => void; onClear: () => void }) {
  return <div className="inspector multi-inspector"><div className="inspector-head"><div><span>多选模式</span><strong>已选 {props.count} 个图层</strong></div></div><section className="inspector-section"><p>可同时拖动控制框、缩放或旋转。按 Ctrl 点击继续增减图层，点击画布空白处取消选择。</p><div className="reorder-grid"><button onClick={() => props.onReorder('top')}>置顶</button><button onClick={() => props.onReorder('up')}>上移</button><button onClick={() => props.onReorder('down')}>下移</button><button onClick={() => props.onReorder('bottom')}>置底</button></div><div className="button-row"><button className="button secondary" onClick={props.onClear}>取消选择</button><button className="button danger-solid" onClick={props.onDelete}>删除所选</button></div></section></div>
}

function InspectorEmpty(props: { onAddText: () => void; onAddImage: () => void }) {
  return <div className="inspector-empty"><strong>未选择图层</strong><span>单击图层选中；按住 Ctrl 可多选。点击空白处取消选中。</span><div className="button-row"><button className="button secondary" onClick={props.onAddImage}>添加图片</button><button className="button secondary" onClick={props.onAddText}>添加文字</button></div></div>
}
function ImagePicker(props: { title: string; assets: MediaAssetSummary[]; onClose: () => void; onSelect: (assetId: string) => void }) {
  const [query, setQuery] = useState('')
  const assets = props.assets.filter((asset) => !query || asset.primaryPath?.toLowerCase().includes(query.toLowerCase()))
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose() }}><div className="modal wide"><header><h2>{props.title}</h2><button onClick={props.onClose}>×</button></header><div className="modal-body"><input className="search-input full" placeholder="搜索" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="picker-grid simple">{assets.map((asset) => <button key={asset.id} onClick={() => props.onSelect(asset.id)}><img src={thumbnailUrl(asset.id)} alt="照片" /><span>{asset.primaryPath?.split(/[\\/]/).pop()}</span></button>)}</div></div></div></div>
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

function imageFrameFor(asset?: MediaAssetSummary): { x: number; y: number; width: number; height: number } {
  const maxWidth = 0.72
  const maxHeight = 0.52
  const ratio = asset && asset.width > 0 && asset.height > 0 ? asset.width / asset.height : maxWidth / maxHeight
  let width = maxWidth
  let height = width / ratio
  if (height > maxHeight) {
    height = maxHeight
    width = height * ratio
  }
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height }
}

function numberStyle(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
function stringStyle(value: unknown, fallback: string): string { return typeof value === 'string' && value ? value : fallback }