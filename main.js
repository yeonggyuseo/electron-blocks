const { app, BrowserWindow, ipcMain, session } = require('electron')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const { startPush } = require('./push')

let latestFcmToken = null

function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  })
}

const isDev = !app.isPackaged
// Serve on the origin the backend already trusts (web dev origin) so API calls
// pass CORS without disabling webSecurity, and OAuth redirect URIs match.
const PORT = Number(process.env.WEB_PORT) || 3000
const ORIGIN = `http://localhost:${PORT}`
// Optional: skip the built-in server and load an already-running server instead.
const DEV_SERVER_URL = process.env.WEB_DEV_SERVER || ''

// Resolve the react-web-calendar build directory.
// Priority: env override -> bundled web-build (packaged) -> sibling repo build (dev).
function resolveWebBuildDir() {
  const candidates = [
    process.env.WEB_BUILD_DIR,
    path.join(__dirname, 'web-build'),
    path.join(__dirname, '..', 'react-web-calendar', 'build'),
  ].filter(Boolean)
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || null
}

const WEB_BUILD_DIR = resolveWebBuildDir()

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

// Minimal static server for the SPA build, with index.html fallback so
// BrowserRouter routes resolve. Bound to localhost only.
function startStaticServer(rootDir, port) {
  const root = path.resolve(rootDir)
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, ORIGIN).pathname)
        let filePath = path.join(root, pathname)
        if (!filePath.startsWith(root)) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(root, 'index.html') // SPA fallback + root '/'
        }
        res.setHeader('Content-Type', MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream')
        fs.createReadStream(filePath).pipe(res)
      } catch {
        res.writeHead(500)
        res.end('Internal error')
      }
    })
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function createMainWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.loadURL(url)

  // Surface renderer console / crashes / load failures in the terminal so the
  // real uncaught error is visible without digging through DevTools.
  const wc = win.webContents
  wc.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[renderer L${level}] ${message}  (${sourceId}:${line})`)
  })
  wc.on('render-process-gone', (_e, details) => {
    console.error('[renderer GONE]', details)
  })
  wc.on('did-fail-load', (_e, code, desc, failedUrl) => {
    console.error('[did-fail-load]', code, desc, failedUrl)
  })
  wc.on('preload-error', (_e, file, err) => {
    console.error('[preload-error]', file, err)
  })

  if (isDev) win.webContents.openDevTools({ mode: 'detach' })
  return win
}

function showMissingBuildWindow() {
  const win = new BrowserWindow({ width: 720, height: 420 })
  const html =
    '<body style="font:14px -apple-system,sans-serif;padding:32px;color:#333">' +
    '<h2>web build not found</h2>' +
    '<p>react-web-calendar 빌드를 찾지 못했습니다. 아래 중 하나를 하세요:</p>' +
    '<ul>' +
    '<li><code>cd ../react-web-calendar &amp;&amp; npm run build</code> 후 다시 실행</li>' +
    '<li>또는 <code>npm run start:dev</code> (실행 중인 dev 서버 사용)</li>' +
    '<li>또는 <code>WEB_BUILD_DIR=/path/to/build npm start</code></li>' +
    '</ul></body>'
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
}

app.whenReady().then(async () => {
  // Electron엔 "알림 허용?" 프롬프트 UI가 없어 Notification.requestPermission()이
  // granted를 안 돌려줄 수 있다. 그러면 useDeviceManager의 granted 분기가 안 돌아
  // 디바이스 등록(saveDeviceRequest)이 누락된다. → 권한을 자동 허용해 granted 보장.
  // (granted 분기는 getToken 대신 메인 프로세스 FCM 토큰을 쓰므로 push DOMException 없음)
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(true))
  ses.setPermissionCheckHandler(() => true)

  // 1) External dev server explicitly requested.
  if (DEV_SERVER_URL) {
    createMainWindow(DEV_SERVER_URL)
  } else if (!WEB_BUILD_DIR) {
    showMissingBuildWindow()
  } else {
    // 2) Serve the build on the trusted localhost origin.
    try {
      await startStaticServer(WEB_BUILD_DIR, PORT)
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        // Port already serving (web dev server or a prior instance) — load it as-is.
        console.warn(`[electron-blocks] port ${PORT} in use; loading existing server at ${ORIGIN}`)
      } else {
        throw err
      }
    }
    createMainWindow(`${ORIGIN}/`)
  }

  // 메인 프로세스 FCM 푸시 시작 (웹 SDK 푸시는 Electron에서 불가하므로 이쪽이 정식 경로).
  if (DEV_SERVER_URL || WEB_BUILD_DIR) {
    const fcmMode = process.env.FCM_MODE || (DEV_SERVER_URL ? 'development' : 'production')
    ipcMain.handle('get-fcm-token', () => latestFcmToken)
    startPush({
      mode: fcmMode,
      onToken: (t) => {
        latestFcmToken = t
        broadcast('fcm-token', t)
      },
      onMessage: (m) => broadcast('push-message', m),
      onClick: (m) => {
        // 알림 클릭 시 외부 URL로 가지 않고 로컬 창을 앞으로 + 메시지 전달.
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
        }
        // macOS는 win.focus()만으론 백그라운드 앱이 앞으로 안 나옴 → 강제 포커스.
        if (process.platform === 'darwin') app.focus({ steal: true })
        broadcast('push-click', m)
      },
    }).catch((e) => console.error('[push] start failed:', e))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && (DEV_SERVER_URL || WEB_BUILD_DIR)) {
      createMainWindow(DEV_SERVER_URL || `${ORIGIN}/`)
    }
  })
})

// macOS keeps the app alive when all windows close (standard convention).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
