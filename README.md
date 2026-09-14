# 相册工作台

Windows 本地摄影相册与社交作品排版工具。原图留在原目录，软件只建立索引；同一内容的多个文件合并为一个照片资产，多个相册和作品共享引用。

## 已实现

- 索引本地 JPG/JPEG/PNG 目录，读取完整 EXIF，并自动监听新增、改名和删除。
- 按 SHA-256 合并完全相同的照片；显示所有文件位置并支持切换首选原图。
- 图库搜索：文件名、路径、日期、方向、相机、镜头、焦距、光圈、快门、ISO 和收藏。
- 相册可复用同一照片，支持排序、封面和一套相册多套作品。
- 8 套内置模板；图片、文字、背景可拖动、缩放、旋转、裁剪和调层。
- 支持 `{{album}}`、`{{camera}}`、`{{lens}}`、`{{aperture}}`、`{{shutter}}`、`{{iso}}`、`{{date}}` 文字变量。
- 导出封面与多页图片组，或按间距纵向合并长图；支持 JPEG/PNG 和 1080/1440/2160 长边。
- 删除原图需要二次确认并进入系统回收站；默认移除操作绝不修改磁盘原图。
- SQLite 自动备份，保留 7 份；缩略图缓存上限可在设置中调整。

## 开发

```powershell
npm install
npm run dev
```

验证：

```powershell
npm run typecheck
npm test
npm run build
```

如果 Electron 二进制下载失败，可使用镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
node node_modules/electron/install.js
```

## 打包

```powershell
npm run package
```

安装包输出到 `dist\Album-Studio-0.1.0-Setup.exe`。仓库内的打包配置使用本地 Electron 分发，避免打包时重复下载。

## 数据位置

应用数据保存在 `%APPDATA%\相册工作台`：

- `library.sqlite`：照片索引、相册、作品和模板。
- `thumbnails`：可重新生成的 WebP 缓存。
- `backups`：数据库备份，保留最近 7 份。
- `settings.json`：扫描和缓存设置。

原图不会被移动到应用目录。

## 第一版边界

只支持 JPG/JPEG/PNG；暂不支持 RAW、HEIC、云同步、多人协作、标签、智能相册和照片调色。