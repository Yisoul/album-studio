import { app, BrowserWindow, Menu, net, protocol } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BackupService } from './backup'
import { AppDatabase } from './database'
import { WorkExporter } from './exporter'
import { registerIpcHandlers, seedTemplates } from './ipc'
import { LibraryScanner } from './scanner'
import { SettingsService } from './settings'
import { ThumbnailService } from './thumbnails'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'album-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

let mainWindow: BrowserWindow | null = null
let database: AppDatabase | null = null
let scanner: LibraryScanner | null = null
let removeIpcHandlers: (() => void) | null = null

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#f6f4ef',
    title: '相册工作台',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const headless = process.env.ALBUM_STUDIO_HEADLESS === '1'
  window.once('ready-to-show', () => { if (!headless) window.show() })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

async function initialize(): Promise<void> {
  const userData = app.getPath('userData')
  const databasePath = join(userData, 'library.sqlite')
  const thumbnailDirectory = join(userData, 'thumbnails')
  const backupDirectory = join(userData, 'backups')

  database = new AppDatabase(databasePath)
  database.migrate()
  seedTemplates(database)

  const backups = new BackupService(database, databasePath, backupDirectory, 7)
  const settings = new SettingsService(join(userData, 'settings.json'))
  const thumbnails = new ThumbnailService(database, thumbnailDirectory)
  scanner = new LibraryScanner(database)
  const exporter = new WorkExporter(database)

  protocol.handle('album-media', async (request) => {
    try {
      const url = new URL(request.url)
      const assetId = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      const size = Math.max(64, Math.min(4096, Number(url.searchParams.get('size') ?? 320)))
      const filePath = url.hostname === 'thumbnail'
        ? await thumbnails.getThumbnail(assetId, size)
        : await thumbnails.getPreview(assetId, size)
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Image not found', { status: 404 })
    }
  })

  mainWindow = createWindow()
  removeIpcHandlers = registerIpcHandlers({
    db: database,
    scanner,
    exporter,
    backups,
    settings,
    thumbnails,
    getWindow: () => mainWindow
  })

  void backups.createBackup().catch(() => undefined)
  void settings.get().then((value) => thumbnails.enforceCacheLimit(value.thumbnailCacheLimitGb * 1024 * 1024 * 1024)).catch(() => undefined)
  void (async () => {
    const currentSettings = await settings.get()
    const roots = database?.listSourceRoots() ?? []
    await scanner?.scanAll(roots, (progress) => {
      mainWindow?.webContents.send('app:scan-progress', progress)
    })
    if (currentSettings.autoWatch) {
      for (const root of roots) scanner?.watchRoot(root)
    }
  })().catch((error) => {
    console.error('初始化图库失败', error)
  })
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  app.setAppUserModelId('com.albumstudio.desktop')
  await initialize()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
}).catch((error) => {
  console.error(error)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  removeIpcHandlers?.()
  void scanner?.close()
  database?.close()
  database = null
})