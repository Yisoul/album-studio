import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppStats, CreateWorkRequest } from '../../shared/api'
import type {
  Album, AppSettings, DuplicateGroup, MediaAssetSummary, MediaLocation, OutputMode,
  ScanProgress, SearchFilters, SourceRemovalMode, SourceRemovalResult, SourceRoot, SourceRootImpact,
  TemplateDefinition, Work
} from '../../shared/types'
import Editor from './Editor'
import TextInputDialog from './TextInputDialog'
import { errorMessage, formatCamera, formatDate, previewUrl, thumbnailUrl } from './helpers'

type NavKey = 'library' | 'duplicates' | 'albums' | 'settings'

export default function App() {
  const [nav, setNav] = useState<NavKey>('library')
  const [stats, setStats] = useState<AppStats>({ assets: 0, duplicateGroups: 0, missing: 0, roots: 0 })
  const [roots, setRoots] = useState<SourceRoot[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<TemplateDefinition[]>([])
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [toast, setToast] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false)

  const refreshStats = useCallback(async () => setStats(await window.albumApi.app.getStats()), [])
  const refreshRoots = useCallback(async () => setRoots(await window.albumApi.library.listRoots()), [])
  const refreshAlbums = useCallback(async () => setAlbums(await window.albumApi.albums.list()), [])
  const refreshTemplates = useCallback(async () => setTemplates(await window.albumApi.templates.list()), [])

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshStats(), refreshRoots(), refreshAlbums(), refreshTemplates()])
  }, [refreshAlbums, refreshRoots, refreshStats, refreshTemplates])

  useEffect(() => {
    void refreshAll().catch((error) => setToast({ kind: 'error', text: errorMessage(error) }))
    return window.albumApi.app.onScanProgress((progress) => {
      setScanProgress(progress)
      if (progress.phase === 'complete') void refreshStats().catch(() => undefined)
    })
  }, [refreshAll, refreshStats])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(timer)
  }, [toast])

  const addRoots = async () => {
    try {
      const paths = await window.albumApi.app.chooseFolders()
      if (paths.length === 0) return
      const added = await window.albumApi.library.addRoots(paths)
      await refreshRoots()
      for (const root of added) await window.albumApi.library.scanRoot(root.id)
      await Promise.all([refreshStats(), refreshRoots()])
      setToast({ kind: 'info', text: `已加入 ${added.length} 个来源目录` })
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    }
  }

  const removeRoot = async (rootId: string, mode: SourceRemovalMode): Promise<SourceRemovalResult> => {
    const result = await window.albumApi.library.removeRoot(rootId, mode)
    await Promise.all([refreshRoots(), refreshStats(), refreshAlbums()])
    return result
  }

  const setRootEnabled = async (rootId: string, enabled: boolean): Promise<void> => {
    await window.albumApi.library.setRootEnabled(rootId, enabled)
    await Promise.all([refreshRoots(), refreshStats()])
  }

  const scanAll = async () => {
    try {
      await window.albumApi.app.scanAll()
      await refreshStats()
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    }
  }

  const createAlbum = async (name: string): Promise<void> => {
    const album = await window.albumApi.albums.create(name)
    await refreshAlbums()
    setAlbumDialogOpen(false)
    setSelectedAlbumId(album.id)
    setNav('albums')
  }

  if (editingWorkId) {
    return (
      <>
        <Editor workId={editingWorkId} onBack={async () => { setEditingWorkId(null); await refreshStats() }} onToast={setToast} />
        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div><strong>相册工作台</strong><span>本地摄影作品库</span></div></div>
        <nav className="nav-list">
          <NavButton icon="▦" label="图库" active={nav === 'library'} onClick={() => setNav('library')} />
          <NavButton icon="⧉" label="重复项" count={stats.duplicateGroups} active={nav === 'duplicates'} onClick={() => setNav('duplicates')} />
          <NavButton icon="▤" label="相册" count={albums.length} active={nav === 'albums'} onClick={() => setNav('albums')} />
          <NavButton icon="⚙" label="设置" active={nav === 'settings'} onClick={() => setNav('settings')} />
        </nav>
        <div className="sidebar-stats"><span>{stats.assets.toLocaleString()} 张照片</span><span>{stats.roots} 个来源目录</span>{stats.missing > 0 && <span className="warning">{stats.missing} 张缺失</span>}</div>
      </aside>
      <main className="main-content">
        {scanProgress && scanProgress.phase !== 'complete' && (
          <div className="scan-banner">
            <span>正在读取照片</span>
            <div className="scan-track"><i style={{ width: `${scanProgress.discovered ? Math.round(scanProgress.processed / scanProgress.discovered * 100) : 0}%` }} /></div>
            <span>{scanProgress.processed} / {scanProgress.discovered}</span>
          </div>
        )}
        {nav === 'library' && <LibraryPage roots={roots} albums={albums} onAddRoots={addRoots} onScanAll={scanAll} onRefreshStats={refreshStats} onToast={setToast} />}
        {nav === 'duplicates' && <DuplicatesPage onToast={setToast} onRefresh={refreshStats} />}
        {nav === 'albums' && <AlbumsPage albums={albums} selectedAlbumId={selectedAlbumId} onSelectAlbum={setSelectedAlbumId} onRefreshAlbums={refreshAlbums} templates={templates} onOpenWork={setEditingWorkId} onToast={setToast} onCreateAlbum={() => setAlbumDialogOpen(true)} />}
        {nav === 'settings' && <SettingsPage roots={roots} onAddRoots={addRoots} onRemoveRoot={removeRoot} onSetRootEnabled={setRootEnabled} onScanAll={scanAll} onRefreshStats={refreshStats} onToast={setToast} />}
      </main>
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      {albumDialogOpen && <TextInputDialog title="新建相册" label="相册名称" confirmLabel="创建相册" onClose={() => setAlbumDialogOpen(false)} onConfirm={createAlbum} />}
    </div>
  )
}

function NavButton(props: { icon: string; label: string; count?: number; active: boolean; onClick: () => void }) {
  return <button className={`nav-button ${props.active ? 'active' : ''}`} onClick={props.onClick}><span className="nav-icon">{props.icon}</span><span>{props.label}</span>{props.count != null && props.count > 0 && <b>{props.count}</b>}</button>
}

function LibraryPage(props: { roots: SourceRoot[]; albums: Album[]; onAddRoots: () => Promise<void>; onScanAll: () => Promise<void>; onRefreshStats: () => Promise<void>; onToast: (toast: { kind: 'info' | 'error'; text: string }) => void }) {
  const pageSize = 120
  const [filters, setFilters] = useState<Omit<SearchFilters, 'limit' | 'offset'>>({})
  const [page, setPage] = useState(0)
  const [photos, setPhotos] = useState<MediaAssetSummary[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<MediaAssetSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const requestIdRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(async () => {
      const requestId = ++requestIdRef.current
      if (page === 0) setLoading(true)
      else setLoadingMore(true)
      try {
        const result = await window.albumApi.library.search({ ...filters, limit: pageSize, offset: page * pageSize })
        if (requestId !== requestIdRef.current) return
        setTotal(result.total)
        setPhotos((current) => page === 0 ? result.items : [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))])
      } catch (error) {
        if (requestId === requestIdRef.current) props.onToast({ kind: 'error', text: errorMessage(error) })
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    }, page === 0 ? 220 : 0)
    return () => clearTimeout(timer)
  }, [filters, page, props.onToast])

  const hasMore = photos.length < total

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore || loading || loadingMore) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setPage((current) => current + 1)
    }, { rootMargin: '300px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore])

  const updateFilters = (patch: Partial<Omit<SearchFilters, 'limit' | 'offset'>>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(0)
  }

  const addToAlbum = async (albumId: string) => {
    if (!albumId || selected.size === 0) return
    try {
      await window.albumApi.albums.addAssets(albumId, [...selected])
      props.onToast({ kind: 'info', text: `已加入 ${selected.size} 张照片` })
      setSelected(new Set())
    } catch (error) {
      props.onToast({ kind: 'error', text: errorMessage(error) })
    }
  }

  return (
    <section className="page">
      <header className="page-header"><div><p className="eyebrow">PHOTO LIBRARY</p><h1>图库</h1><p className="subtle">原图只在磁盘保存一份，相册和作品都使用引用。</p></div><div className="header-actions"><button className="button secondary" onClick={() => void props.onScanAll()}>重新扫描</button><button className="button primary" onClick={() => void props.onAddRoots()}>＋ 添加文件夹</button></div></header>
      {props.roots.every((root) => !root.enabled) ? <EmptyState title="还没有启用的照片来源" text="添加一个包含 JPG 或 PNG 的文件夹，或重新启用已停用的目录。" action="选择照片文件夹" onAction={() => void props.onAddRoots()} /> : (
        <>
          <div className="toolbar filter-bar">
            <input className="search-input" placeholder="搜索文件名、路径、相机或镜头" value={filters.text ?? ''} onChange={(event) => updateFilters({ text: event.target.value })} />
            <select value={filters.orientation ?? ''} onChange={(event) => updateFilters({ orientation: (event.target.value || undefined) as SearchFilters['orientation'] })}><option value="">全部方向</option><option value="landscape">横图</option><option value="portrait">竖图</option><option value="square">方图</option></select>
            <input placeholder="相机" value={filters.cameraModel ?? ''} onChange={(event) => updateFilters({ cameraModel: event.target.value || undefined })} />
            <input placeholder="镜头" value={filters.lens ?? ''} onChange={(event) => updateFilters({ lens: event.target.value || undefined })} />
            <label className="check-label"><input type="checkbox" checked={filters.favorite ?? false} onChange={(event) => updateFilters({ favorite: event.target.checked || undefined })} /> 仅收藏</label>
          </div>
          <div className="selection-bar">
            <span>共 {total.toLocaleString()} 张{selected.size > 0 ? `，已选 ${selected.size} 张` : ''}</span>
            {selected.size > 0 && <><select defaultValue="" onChange={(event) => { void addToAlbum(event.target.value); event.target.value = '' }}><option value="" disabled>加入相册…</option>{props.albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}</select><button className="text-button" onClick={() => setSelected(new Set())}>取消选择</button></>}
          </div>
          {loading && photos.length === 0 ? <div className="loading">正在读取图库…</div> : <div className="photo-grid">{photos.map((photo) => <PhotoCard key={photo.id} asset={photo} selected={selected.has(photo.id)} onToggle={() => setSelected((current) => toggleSet(current, photo.id))} onOpen={() => setDetail(photo)} />)}</div>}
          {photos.length === 0 && !loading && <EmptyState title="没有匹配的照片" text="换个关键词或清空筛选条件。" />}
          {photos.length > 0 && <div className="load-more" ref={sentinelRef}>{hasMore ? <button className="button secondary" disabled={loadingMore} onClick={() => setPage((current) => current + 1)}>{loadingMore ? '正在加载…' : '加载更多'}</button> : <span>已显示全部 {total.toLocaleString()} 张</span>}</div>}
        </>
      )}
      {detail && <PhotoDetail asset={detail} onClose={() => setDetail(null)} onToast={props.onToast} />}
    </section>
  )
}
function PhotoCard(props: { asset: MediaAssetSummary; selected: boolean; onToggle: () => void; onOpen: () => void }) {
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => setImageFailed(false), [props.asset.id])
  const unavailable = props.asset.missing || imageFailed
  return (
    <article className={`photo-card ${props.selected ? 'selected' : ''}`} onClick={props.onToggle} onDoubleClick={props.onOpen}>
      <div className="photo-image">
        {unavailable ? <div className="photo-placeholder"><span>▧</span><small>来源已移除</small></div> : <img loading="lazy" src={thumbnailUrl(props.asset.id)} alt={props.asset.primaryPath ?? '照片'} onError={() => setImageFailed(true)} />}
        <button className={`select-dot ${props.selected ? 'active' : ''}`} aria-label="选择照片">{props.selected ? '✓' : ''}</button>
        {props.asset.favorite && <span className="favorite-mark">★</span>}
        {props.asset.missing && <span className="missing-mark">文件缺失</span>}
        {props.asset.locationCount > 1 && <span className="duplicate-mark">{props.asset.locationCount} 份副本</span>}
      </div>
      <div className="photo-meta"><strong>{unavailable ? '来源不可用' : fileName(props.asset.primaryPath)}</strong><span>{formatDate(props.asset.capturedAt)}</span></div>
    </article>
  )
}

function PhotoDetail(props: { asset: MediaAssetSummary; onClose: () => void; onToast: (toast: { kind: 'info' | 'error'; text: string }) => void }) {
  const [locations, setLocations] = useState<MediaLocation[]>([])
  useEffect(() => { void window.albumApi.library.listLocations(props.asset.id).then(setLocations) }, [props.asset.id])
  const favorite = async () => { try { await window.albumApi.library.setFavorite(props.asset.id, !props.asset.favorite); props.onClose() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  return (
    <Modal title={fileName(props.asset.primaryPath)} onClose={props.onClose} wide>
      <div className="detail-layout">
        <div className="detail-preview"><img src={previewUrl(props.asset.id)} alt="照片预览" /></div>
        <div className="detail-info"><dl><dt>拍摄时间</dt><dd>{formatDate(props.asset.capturedAt)}</dd><dt>尺寸</dt><dd>{props.asset.width} × {props.asset.height}</dd><dt>拍摄参数</dt><dd>{formatCamera(props.asset)}</dd></dl><button className="button secondary" onClick={() => void favorite()}>{props.asset.favorite ? '取消收藏' : '加入收藏'}</button><h3>文件位置</h3>{locations.map((location) => <div className={`location-row ${location.status === 'missing' ? 'missing' : ''}`} key={location.id}><span title={location.absolutePath}>{location.absolutePath}</span>{location.status === 'available' && <button className="text-button" onClick={() => void window.albumApi.library.showInFolder(location.id)}>定位</button>}</div>)}</div>
      </div>
    </Modal>
  )
}

function DuplicatesPage(props: { onToast: (toast: { kind: 'info' | 'error'; text: string }) => void; onRefresh: () => Promise<void> }) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const load = useCallback(async () => setGroups(await window.albumApi.library.listDuplicates()), [])
  useEffect(() => { void load() }, [load])
  return <section className="page"><header className="page-header"><div><p className="eyebrow">EXACT DUPLICATES</p><h1>重复项</h1><p className="subtle">只按文件内容识别完全相同的照片，不主动删除任何副本。</p></div></header>{groups.length === 0 ? <EmptyState title="没有发现重复文件" text="来源目录中相同内容的 JPG 或 PNG 会在这里显示。" /> : <div className="duplicate-list">{groups.map((group) => <DuplicateCard key={group.assetId} group={group} onChanged={async () => { await Promise.all([load(), props.onRefresh()]) }} onToast={props.onToast} />)}</div>}</section>
}

function DuplicateCard(props: { group: DuplicateGroup; onChanged: () => Promise<void>; onToast: (toast: { kind: 'info' | 'error'; text: string }) => void }) {
  const [locations, setLocations] = useState<MediaLocation[]>([])
  useEffect(() => { void window.albumApi.library.listLocations(props.group.assetId).then(setLocations) }, [props.group.assetId])
  const run = async (action: () => Promise<void>) => { try { await action(); await props.onChanged() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  return (
    <article className="duplicate-card"><img src={thumbnailUrl(props.group.assetId)} alt="重复照片" /><div className="duplicate-content"><div className="duplicate-title"><strong>{props.group.locationCount} 个相同副本</strong><span>磁盘仅保留原文件，不额外复制</span></div>{locations.map((location) => <div className={`location-row ${location.status === 'missing' ? 'missing' : ''}`} key={location.id}><span title={location.absolutePath}>{location.absolutePath}</span>{location.status === 'available' && <button className="text-button" onClick={() => void run(() => window.albumApi.library.setPreferredLocation(props.group.assetId, location.id))}>设为原图</button>}{location.status === 'available' && <button className="text-button danger" onClick={() => { if (window.confirm('将这份原图移入系统回收站？')) void run(() => window.albumApi.library.deleteOriginal(location.id)) }}>删除到回收站</button>}</div>)}<button className="text-button danger" onClick={() => { if (window.confirm('从图库移除这组照片？磁盘文件不会删除。')) void run(() => window.albumApi.library.ignoreAsset(props.group.assetId)) }}>从图库移除</button></div></article>
  )
}

function AlbumsPage(props: { albums: Album[]; selectedAlbumId: string | null; onSelectAlbum: (albumId: string | null) => void; onRefreshAlbums: () => Promise<void>; templates: TemplateDefinition[]; onOpenWork: (workId: string) => void; onToast: (toast: { kind: 'info' | 'error'; text: string }) => void; onCreateAlbum: () => void }) {
  const selected = props.albums.find((album) => album.id === props.selectedAlbumId)
  if (selected) return <AlbumDetail album={selected} onBack={() => props.onSelectAlbum(null)} onRefreshAlbums={props.onRefreshAlbums} templates={props.templates} onOpenWork={props.onOpenWork} onToast={props.onToast} />
  return <section className="page"><header className="page-header"><div><p className="eyebrow">ALBUMS</p><h1>相册</h1><p className="subtle">同一张照片可放入多个相册，不会产生额外副本。</p></div><button className="button primary" onClick={() => void props.onCreateAlbum()}>＋ 新建相册</button></header>{props.albums.length === 0 ? <EmptyState title="还没有相册" text="创建相册后，可以从图库批量选图加入。" action="新建相册" onAction={() => void props.onCreateAlbum()} /> : <div className="album-grid">{props.albums.map((album) => <button className="album-card" key={album.id} onClick={() => props.onSelectAlbum(album.id)}>{album.coverAssetId ? <img src={thumbnailUrl(album.coverAssetId, 640)} alt={album.name} /> : <div className="album-placeholder">▤</div>}<span><strong>{album.name}</strong><small>{formatDate(new Date(album.updatedAt).toISOString())} 更新</small></span></button>)}</div>}</section>
}

function AlbumDetail(props: { album: Album; onBack: () => void; onRefreshAlbums: () => Promise<void>; templates: TemplateDefinition[]; onOpenWork: (workId: string) => void; onToast: (toast: { kind: 'info' | 'error'; text: string }) => void }) {
  const [assets, setAssets] = useState<MediaAssetSummary[]>([])
  const [works, setWorks] = useState<Work[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [workDialogOpen, setWorkDialogOpen] = useState(false)
  const load = useCallback(async () => { const [nextAssets, nextWorks] = await Promise.all([window.albumApi.albums.listAssets(props.album.id), window.albumApi.works.list(props.album.id)]); setAssets(nextAssets); setWorks(nextWorks) }, [props.album.id])
  useEffect(() => { void load() }, [load])
  const removeAlbum = async () => { if (!window.confirm(`删除相册“${props.album.name}”？作品和相册关系会一起删除，磁盘原图不受影响。`)) return; try { await window.albumApi.albums.remove(props.album.id); await props.onRefreshAlbums(); props.onBack() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  const removeSelected = async () => { if (!selected.size) return; try { for (const assetId of selected) await window.albumApi.albums.removeAsset(props.album.id, assetId); setSelected(new Set()); await load() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  return (
    <section className="page">
      <header className="page-header album-header"><button className="back-button" onClick={props.onBack}>← 全部相册</button><div><p className="eyebrow">ALBUM</p><h1>{props.album.name}</h1><p className="subtle">{assets.length} 张照片 · {works.length} 套作品</p></div><div className="header-actions"><button className="button secondary danger" onClick={() => void removeAlbum()}>删除相册</button><button className="button secondary" onClick={() => setPickerOpen(true)}>＋ 选择照片</button><button className="button primary" onClick={() => setWorkDialogOpen(true)}>开始排版</button></div></header>
      <section className="section-block"><div className="section-heading"><h2>照片</h2>{selected.size > 0 && <button className="text-button danger" onClick={() => void removeSelected()}>从相册移除 {selected.size} 张</button>}</div>{assets.length === 0 ? <EmptyState title="相册还是空的" text="从图库选择照片加入，不会复制原文件。" action="选择照片" onAction={() => setPickerOpen(true)} /> : <div className="photo-grid compact">{assets.map((asset) => <PhotoCard key={asset.id} asset={asset} selected={selected.has(asset.id)} onToggle={() => setSelected((current) => toggleSet(current, asset.id))} onOpen={() => undefined} />)}</div>}</section>
      <section className="section-block"><div className="section-heading"><h2>作品版本</h2></div>{works.length === 0 ? <p className="subtle">还没有作品。一个相册可以保存多套不同排版。</p> : <div className="work-grid">{works.map((work) => <button className="work-card" key={work.id} onClick={() => props.onOpenWork(work.id)}><div className="work-preview"><span>{work.outputMode === 'long_image' ? '长图' : '多页'}</span></div><strong>{work.name}</strong><small>{work.canvasWidth} × {work.canvasHeight}</small></button>)}</div>}</section>
      {pickerOpen && <AssetPicker title="选择照片加入相册" onClose={() => setPickerOpen(false)} onConfirm={async (ids) => { try { await window.albumApi.albums.addAssets(props.album.id, ids); setPickerOpen(false); await load() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }} />}
      {workDialogOpen && <WorkCreateDialog album={props.album} templates={props.templates} onClose={() => setWorkDialogOpen(false)} onCreate={async (request) => { try { const document = await window.albumApi.works.create(request); await load(); setWorkDialogOpen(false); props.onOpenWork(document.work.id) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }} />}
    </section>
  )
}

function WorkCreateDialog(props: { album: Album; templates: TemplateDefinition[]; onClose: () => void; onCreate: (request: CreateWorkRequest) => Promise<void> }) {
  const [name, setName] = useState(`${props.album.name} 作品`)
  const [templateId, setTemplateId] = useState(props.templates[0]?.id ?? '')
  const template = props.templates.find((item) => item.id === templateId)
  const outputMode: OutputMode = template?.category ?? 'pages'
  return <Modal title="创建排版作品" onClose={props.onClose}><div className="form-stack"><label>作品名称<input value={name} onChange={(event) => setName(event.target.value)} /></label><div><label>起始模板</label><div className="template-picker">{props.templates.map((item) => <button key={item.id} className={item.id === templateId ? 'active' : ''} onClick={() => setTemplateId(item.id)}><i className={`template-shape template-${item.id}`} /><span>{item.name}</span></button>)}</div></div><p className="subtle">输出方式：{outputMode === 'long_image' ? '单张长图' : '封面与多页图片组'}</p><button className="button primary full" disabled={!name.trim() || !templateId} onClick={() => void props.onCreate({ albumId: props.album.id, name: name.trim(), outputMode, templateId })}>创建并进入编辑器</button></div></Modal>
}

function AssetPicker(props: { title: string; onClose: () => void; onConfirm: (ids: string[]) => Promise<void> }) {
  const [filters, setFilters] = useState<SearchFilters>({ limit: 200, offset: 0 })
  const [assets, setAssets] = useState<MediaAssetSummary[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => { void window.albumApi.library.search(filters).then((result) => setAssets(result.items)) }, [filters])
  return <Modal title={props.title} onClose={props.onClose} wide><input className="search-input full" placeholder="搜索照片" value={filters.text ?? ''} onChange={(event) => setFilters({ ...filters, text: event.target.value })} /><div className="picker-grid">{assets.map((asset) => <PhotoCard key={asset.id} asset={asset} selected={selected.has(asset.id)} onToggle={() => setSelected((current) => toggleSet(current, asset.id))} onOpen={() => undefined} />)}</div><div className="modal-actions"><span>已选 {selected.size} 张</span><button className="button primary" disabled={!selected.size} onClick={() => void props.onConfirm([...selected])}>确认加入</button></div></Modal>
}

function SettingsPage(props: {
  roots: SourceRoot[]
  onAddRoots: () => Promise<void>
  onRemoveRoot: (rootId: string, mode: SourceRemovalMode) => Promise<SourceRemovalResult>
  onSetRootEnabled: (rootId: string, enabled: boolean) => Promise<void>
  onScanAll: () => Promise<void>
  onRefreshStats: () => Promise<void>
  onToast: (toast: { kind: 'info' | 'error'; text: string }) => void
}) {
  const [settings, setSettings] = useState<AppSettings>({ thumbnailCacheLimitGb: 10, autoWatch: true })
  const [removeTarget, setRemoveTarget] = useState<SourceRoot | null>(null)
  const [impact, setImpact] = useState<SourceRootImpact | null>(null)
  useEffect(() => { void window.albumApi.app.getSettings().then(setSettings) }, [])
  const save = async (next: AppSettings) => { try { setSettings(await window.albumApi.app.saveSettings(next)); props.onToast({ kind: 'info', text: '设置已保存' }) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  const backup = async () => { try { const path = await window.albumApi.app.backupNow(); props.onToast({ kind: 'info', text: `备份已保存：${path}` }); await props.onRefreshStats() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  const openRemove = async (root: SourceRoot) => {
    setRemoveTarget(root)
    setImpact(null)
    try { setImpact(await window.albumApi.library.getRootImpact(root.id)) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  const toggleRoot = async (root: SourceRoot) => {
    try { await props.onSetRootEnabled(root.id, !root.enabled); props.onToast({ kind: 'info', text: root.enabled ? '已停止扫描该目录' : '已重新启用该目录' }) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }
  return (
    <section className="page settings-page">
      <header className="page-header"><div><p className="eyebrow">SETTINGS</p><h1>设置</h1><p className="subtle">所有数据保存在本机应用目录，原图始终留在原位置。</p></div></header>
      <section className="settings-card">
        <div className="section-heading"><h2>照片来源目录</h2><button className="button secondary" onClick={() => void props.onAddRoots()}>添加文件夹</button></div>
        {props.roots.map((root) => <div className={`settings-row source-row ${root.enabled ? '' : 'disabled'}`} key={root.id}><span title={root.path}><strong>{sourceName(root.path)}</strong><small>{root.path}</small></span><span className="settings-actions"><i className={`status-badge ${root.enabled ? '' : 'disabled'}`}>{root.enabled ? '已启用' : '已停用'}</i><button className="text-button" onClick={() => void toggleRoot(root)}>{root.enabled ? '停用' : '重新启用'}</button><button className="text-button danger" onClick={() => void openRemove(root)}>移除</button></span></div>)}
      </section>
      <section className="settings-card">
        <h2>扫描与缓存</h2>
        <label className="settings-row"><span><strong>自动监听目录</strong><small>新增、改名和删除照片时自动更新索引</small></span><input type="checkbox" checked={settings.autoWatch} onChange={(event) => void save({ ...settings, autoWatch: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>缩略图缓存上限</strong><small>单位 GB，缓存可随时重新生成</small></span><input type="number" min="1" max="100" value={settings.thumbnailCacheLimitGb} onChange={(event) => setSettings({ ...settings, thumbnailCacheLimitGb: Number(event.target.value) })} onBlur={() => void save(settings)} /></label>
        <div className="button-row"><button className="button secondary" onClick={() => void props.onScanAll()}>重新扫描全部目录</button><button className="button secondary" onClick={() => void backup()}>立即备份数据库</button></div>
      </section>
      {removeTarget && <RemoveRootDialog root={removeTarget} impact={impact} onClose={() => { setRemoveTarget(null); setImpact(null) }} onConfirm={async (mode) => {
        try {
          const result = await props.onRemoveRoot(removeTarget.id, mode)
          const message = mode === 'disable' ? '已停止扫描该目录' : `已处理 ${result.affectedAssets} 张照片，移除 ${result.removedLocations} 个文件位置`
          props.onToast({ kind: 'info', text: message })
          setRemoveTarget(null)
          setImpact(null)
        } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
      }} />}
    </section>
  )
}

function RemoveRootDialog(props: { root: SourceRoot; impact: SourceRootImpact | null; onClose: () => void; onConfirm: (mode: SourceRemovalMode) => Promise<void> }) {
  const [mode, setMode] = useState<SourceRemovalMode>('library')
  const [busy, setBusy] = useState(false)
  const options: Array<{ value: SourceRemovalMode; title: string; text: string }> = [
    { value: 'library', title: '从图库移除，相册保留引用', text: '照片不再出现在图库；已加入相册的照片会标记来源已移除。' },
    { value: 'disable', title: '仅停止扫描', text: '照片继续保留在图库，来源目录保留在设置页，可随时重新启用。' },
    { value: 'all', title: '从图库、相册和作品一起移除', text: '删除图库记录、相册引用和对应图片图层，保留文字与页面背景。' }
  ]
  const submit = async () => { setBusy(true); try { await props.onConfirm(mode) } finally { setBusy(false) } }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) props.onClose() }}>
      <div className="modal">
        <header><h2>移除来源目录</h2><button disabled={busy} onClick={props.onClose}>×</button></header>
        <div className="modal-body">
          <p className="source-path">{props.root.path}</p>
          <div className="removal-impact">{props.impact ? `当前目录关联 ${props.impact.assetCount.toLocaleString()} 张照片、${props.impact.locationCount.toLocaleString()} 个文件位置` : '正在统计影响范围…'}</div>
          <div className="removal-options">{options.map((option) => <label className={mode === option.value ? 'active' : ''} key={option.value}><input type="radio" name="source-removal" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} /><span><strong>{option.title}</strong><small>{option.text}</small></span></label>)}</div>
          <p className="danger-note">这里只修改相册工作台的数据，不会删除、移动或重命名磁盘原图。</p>
          <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={props.onClose}>取消</button><button className={`button ${mode === 'all' ? 'danger-solid' : 'primary'}`} disabled={busy || !props.impact} onClick={() => void submit()}>{busy ? '处理中…' : '确认'}</button></div>
        </div>
      </div>
    </div>
  )
}
export function Modal(props: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose() }}><div className={`modal ${props.wide ? 'wide' : ''}`}><header><h2>{props.title}</h2><button aria-label="关闭" onClick={props.onClose}>×</button></header><div className="modal-body">{props.children}</div></div></div>
}

function EmptyState(props: { title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-symbol">▧</div><h2>{props.title}</h2><p>{props.text}</p>{props.action && <button className="button primary" onClick={props.onAction}>{props.action}</button>}</div>
}

function Toast(props: { toast: { kind: 'info' | 'error'; text: string }; onClose: () => void }) {
  return <div className={`toast ${props.toast.kind}`}><span>{props.toast.text}</span><button onClick={props.onClose}>×</button></div>
}

function toggleSet(current: Set<string>, id: string): Set<string> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function sourceName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}
function fileName(path: string | null): string {
  if (!path) return '文件缺失'
  return path.split(/[\\/]/).pop() || path
}