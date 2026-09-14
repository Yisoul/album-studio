import { useCallback, useEffect, useState } from 'react'
import type { AppStats, CreateWorkRequest } from '../../shared/api'
import type {
  Album, AppSettings, DuplicateGroup, MediaAssetSummary, MediaLocation, OutputMode,
  ScanProgress, SearchFilters, SourceRoot, TemplateDefinition, Work
} from '../../shared/types'
import Editor from './Editor'
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

  const removeRoot = async (rootId: string) => {
    if (!window.confirm('移除此来源目录？磁盘原图不会被删除，数据库中的位置记录会被清理。')) return
    try {
      await window.albumApi.library.removeRoot(rootId)
      await Promise.all([refreshRoots(), refreshStats()])
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    }
  }

  const scanAll = async () => {
    try {
      await window.albumApi.app.scanAll()
      await refreshStats()
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    }
  }

  const createAlbum = async () => {
    const name = window.prompt('新相册名称')
    if (!name?.trim()) return
    try {
      const album = await window.albumApi.albums.create(name.trim())
      await refreshAlbums()
      setSelectedAlbumId(album.id)
      setNav('albums')
    } catch (error) {
      setToast({ kind: 'error', text: errorMessage(error) })
    }
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
        <div className="brand"><div className="brand-mark">光</div><div><strong>相册工作台</strong><span>本地摄影作品库</span></div></div>
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
        {nav === 'albums' && <AlbumsPage albums={albums} selectedAlbumId={selectedAlbumId} onSelectAlbum={setSelectedAlbumId} onRefreshAlbums={refreshAlbums} templates={templates} onOpenWork={setEditingWorkId} onToast={setToast} onCreateAlbum={createAlbum} />}
        {nav === 'settings' && <SettingsPage roots={roots} onAddRoots={addRoots} onRemoveRoot={removeRoot} onScanAll={scanAll} onRefreshStats={refreshStats} onToast={setToast} />}
      </main>
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

function NavButton(props: { icon: string; label: string; count?: number; active: boolean; onClick: () => void }) {
  return <button className={`nav-button ${props.active ? 'active' : ''}`} onClick={props.onClick}><span className="nav-icon">{props.icon}</span><span>{props.label}</span>{props.count != null && props.count > 0 && <b>{props.count}</b>}</button>
}

function LibraryPage(props: { roots: SourceRoot[]; albums: Album[]; onAddRoots: () => Promise<void>; onScanAll: () => Promise<void>; onRefreshStats: () => Promise<void>; onToast: (toast: { kind: 'info' | 'error'; text: string }) => void }) {
  const [filters, setFilters] = useState<SearchFilters>({ limit: 120, offset: 0 })
  const [photos, setPhotos] = useState<MediaAssetSummary[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<MediaAssetSummary | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const result = await window.albumApi.library.search(filters)
        setPhotos(result.items)
        setTotal(result.total)
      } catch (error) {
        props.onToast({ kind: 'error', text: errorMessage(error) })
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => clearTimeout(timer)
  }, [filters, props.onToast])

  const addToAlbum = async (albumId: string) => {
    if (!albumId || selected.size === 0) return
    try {
      await window.albumApi.albums.addAssets(albumId, [...selected])
      props.onToast({ kind: 'info', text: `已加入 ${selected.size} 张照片` })
      setSelected(new Set())
    } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) }
  }

  return (
    <section className="page">
      <header className="page-header"><div><p className="eyebrow">PHOTO LIBRARY</p><h1>图库</h1><p className="subtle">原图只在磁盘保存一份，相册和作品都使用引用。</p></div><div className="header-actions"><button className="button secondary" onClick={() => void props.onScanAll()}>重新扫描</button><button className="button primary" onClick={() => void props.onAddRoots()}>＋ 添加文件夹</button></div></header>
      {props.roots.length === 0 ? <EmptyState title="还没有照片来源" text="添加一个包含 JPG 或 PNG 的文件夹，软件会建立本地索引，不会改动原图。" action="选择照片文件夹" onAction={() => void props.onAddRoots()} /> : (
        <>
          <div className="toolbar filter-bar">
            <input className="search-input" placeholder="搜索文件名、路径、相机或镜头" value={filters.text ?? ''} onChange={(event) => setFilters({ ...filters, text: event.target.value, offset: 0 })} />
            <select value={filters.orientation ?? ''} onChange={(event) => setFilters({ ...filters, orientation: (event.target.value || undefined) as SearchFilters['orientation'], offset: 0 })}><option value="">全部方向</option><option value="landscape">横图</option><option value="portrait">竖图</option><option value="square">方图</option></select>
            <input placeholder="相机" value={filters.cameraModel ?? ''} onChange={(event) => setFilters({ ...filters, cameraModel: event.target.value || undefined, offset: 0 })} />
            <input placeholder="镜头" value={filters.lens ?? ''} onChange={(event) => setFilters({ ...filters, lens: event.target.value || undefined, offset: 0 })} />
            <label className="check-label"><input type="checkbox" checked={filters.favorite ?? false} onChange={(event) => setFilters({ ...filters, favorite: event.target.checked || undefined, offset: 0 })} /> 仅收藏</label>
          </div>
          <div className="selection-bar">
            <span>共 {total.toLocaleString()} 张{selected.size > 0 ? `，已选 ${selected.size} 张` : ''}</span>
            {selected.size > 0 && <><select defaultValue="" onChange={(event) => { void addToAlbum(event.target.value); event.target.value = '' }}><option value="" disabled>加入相册…</option>{props.albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}</select><button className="text-button" onClick={() => setSelected(new Set())}>取消选择</button></>}
          </div>
          {loading && photos.length === 0 ? <div className="loading">正在读取图库…</div> : <div className="photo-grid">{photos.map((photo) => <PhotoCard key={photo.id} asset={photo} selected={selected.has(photo.id)} onToggle={() => setSelected((current) => toggleSet(current, photo.id))} onOpen={() => setDetail(photo)} />)}</div>}
          {photos.length === 0 && !loading && <EmptyState title="没有匹配的照片" text="换个关键词或清空筛选条件。" />}
        </>
      )}
      {detail && <PhotoDetail asset={detail} onClose={() => setDetail(null)} onToast={props.onToast} />}
    </section>
  )
}

function PhotoCard(props: { asset: MediaAssetSummary; selected: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <article className={`photo-card ${props.selected ? 'selected' : ''}`} onClick={props.onToggle} onDoubleClick={props.onOpen}>
      <div className="photo-image">
        <img loading="lazy" src={thumbnailUrl(props.asset.id)} alt={props.asset.primaryPath ?? '照片'} />
        <button className={`select-dot ${props.selected ? 'active' : ''}`} aria-label="选择照片">{props.selected ? '✓' : ''}</button>
        {props.asset.favorite && <span className="favorite-mark">★</span>}
        {props.asset.missing && <span className="missing-mark">文件缺失</span>}
        {props.asset.locationCount > 1 && <span className="duplicate-mark">{props.asset.locationCount} 份副本</span>}
      </div>
      <div className="photo-meta"><strong>{fileName(props.asset.primaryPath)}</strong><span>{formatDate(props.asset.capturedAt)}</span></div>
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

function AlbumsPage(props: { albums: Album[]; selectedAlbumId: string | null; onSelectAlbum: (albumId: string | null) => void; onRefreshAlbums: () => Promise<void>; templates: TemplateDefinition[]; onOpenWork: (workId: string) => void; onToast: (toast: { kind: 'info' | 'error'; text: string }) => void; onCreateAlbum: () => Promise<void> }) {
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

function SettingsPage(props: { roots: SourceRoot[]; onAddRoots: () => Promise<void>; onRemoveRoot: (rootId: string) => Promise<void>; onScanAll: () => Promise<void>; onRefreshStats: () => Promise<void>; onToast: (toast: { kind: 'info' | 'error'; text: string }) => void }) {
  const [settings, setSettings] = useState<AppSettings>({ thumbnailCacheLimitGb: 10, autoWatch: true })
  useEffect(() => { void window.albumApi.app.getSettings().then(setSettings) }, [])
  const save = async (next: AppSettings) => { try { setSettings(await window.albumApi.app.saveSettings(next)); props.onToast({ kind: 'info', text: '设置已保存' }) } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  const backup = async () => { try { const path = await window.albumApi.app.backupNow(); props.onToast({ kind: 'info', text: `备份已保存：${path}` }); await props.onRefreshStats() } catch (error) { props.onToast({ kind: 'error', text: errorMessage(error) }) } }
  return <section className="page settings-page"><header className="page-header"><div><p className="eyebrow">SETTINGS</p><h1>设置</h1><p className="subtle">所有数据保存在本机应用目录，原图始终留在原位置。</p></div></header><section className="settings-card"><div className="section-heading"><h2>照片来源目录</h2><button className="button secondary" onClick={() => void props.onAddRoots()}>添加文件夹</button></div>{props.roots.map((root) => <div className="settings-row" key={root.id}><span title={root.path}>{root.path}</span><button className="text-button danger" onClick={() => void props.onRemoveRoot(root.id)}>移除</button></div>)}</section><section className="settings-card"><h2>扫描与缓存</h2><label className="settings-row"><span><strong>自动监听目录</strong><small>新增、改名和删除照片时自动更新索引</small></span><input type="checkbox" checked={settings.autoWatch} onChange={(event) => void save({ ...settings, autoWatch: event.target.checked })} /></label><label className="settings-row"><span><strong>缩略图缓存上限</strong><small>单位 GB，缓存可随时重新生成</small></span><input type="number" min="1" max="100" value={settings.thumbnailCacheLimitGb} onChange={(event) => setSettings({ ...settings, thumbnailCacheLimitGb: Number(event.target.value) })} onBlur={() => void save(settings)} /></label><div className="button-row"><button className="button secondary" onClick={() => void props.onScanAll()}>重新扫描全部目录</button><button className="button secondary" onClick={() => void backup()}>立即备份数据库</button></div></section></section>
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

function fileName(path: string | null): string {
  if (!path) return '文件缺失'
  return path.split(/[\\/]/).pop() || path
}