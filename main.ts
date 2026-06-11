import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  Tray,
  Menu,
  nativeImage,
} from 'electron'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { startPush } from './push'

// app.isQuitting는 표준 속성이 아니지만(트레이 종료 vs 창 닫기 구분용 플래그) 코드 전반에서 쓴다.
declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean
    }
  }
}

type WidgetState = {
  x: number
  y: number
  width: number
  height: number
  alwaysOnTop?: boolean
}

let latestFcmToken: string | null = null
let widgetWindow: BrowserWindow | null = null
let widgetUrl = '' // 위젯 URL 보관 — Cmd+W로 닫혀 파괴된 뒤 토글로 재생성할 때 사용
let tray: Tray | null = null

function broadcast(channel: string, payload: unknown): void {
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
function resolveWebBuildDir(): string | null {
  const candidates = [
    process.env.WEB_BUILD_DIR,
    path.join(__dirname, 'web-build'),
    path.join(__dirname, '..', 'react-web-calendar', 'build'),
  ].filter((dir): dir is string => Boolean(dir))
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || null
}

const WEB_BUILD_DIR = resolveWebBuildDir()

const MIME: Record<string, string> = {
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
function startStaticServer(rootDir: string, port: number): Promise<http.Server> {
  const root = path.resolve(rootDir)
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url || '/', ORIGIN).pathname)
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

function createMainWindow(url: string): BrowserWindow {
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

  // 풀 캘린더 창을 닫으면 종료가 아니라 숨김(트레이에서 다시 연다). 진짜 종료 시엔 통과.
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  if (process.env.OPEN_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' })
  return win
}

// 위젯 위치/크기/항상위 상태를 userData에 영속화한다(레포 밖이라 별도 gitignore 불필요).
function widgetStateFile(): string {
  return path.join(app.getPath('userData'), 'widget-state.json')
}
function loadWidgetState(): WidgetState | null {
  try {
    return JSON.parse(fs.readFileSync(widgetStateFile(), 'utf8'))
  } catch {
    return null
  }
}
function saveWidgetState(win: BrowserWindow): void {
  try {
    const b = win.getBounds()
    fs.writeFileSync(
      widgetStateFile(),
      JSON.stringify({ x: b.x, y: b.y, width: b.width, height: b.height, alwaysOnTop: win.isAlwaysOnTop() }),
    )
  } catch (e) {
    console.error('[widget] state persist failed', e)
  }
}

function createWidgetWindow(url: string): BrowserWindow {
  const saved = loadWidgetState()
  const win = new BrowserWindow({
    ...(saved
      ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
      : { width: 360, height: 420 }),
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    // 위젯이 다른 앱/창 위에 항상 떠 있지 않도록 함(일반 창 레벨).
    // macOS에서 '바탕화면 레벨 고정 + 클릭 가능'은 동시 불가(type:'desktop'은 입력을 못 받음)이라,
    // alwaysOnTop을 끄고 일반 창처럼 스택되게 한다.
    alwaysOnTop: false,
    roundedCorners: true,
    // 투명 프레임리스 창의 그림자가 검은 외곽선처럼 보이므로 끈다.
    hasShadow: false,
    backgroundColor: '#00000000',
    // 로그인 상태를 알기 전엔 숨김. 렌더러가 로그인 확인 시 show-widget으로 표시.
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.loadURL(url)
  // 반투명은 웹 측에서 배경만 rgba로 처리(글자·블록은 또렷하게 유지). 창 opacity는 쓰지 않는다.
  // 이동/리사이즈/닫힘 시 위치·크기 저장.
  const persistState = () => saveWidgetState(win)
  win.on('moved', persistState)
  win.on('resized', persistState)
  win.on('close', persistState)
  if (process.env.OPEN_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' })
  return win
}

// 풀 캘린더 창을 새로 만들거나, 이미 있으면 앞으로 가져온다.
function openFullCalendar(): BrowserWindow {
  const existing = BrowserWindow.getAllWindows().find((w) => w !== widgetWindow)
  if (existing) {
    existing.show()
    existing.focus()
    return existing
  }
  return createMainWindow(`${ORIGIN}/`)
}

// 트레이(메뉴바) 아이콘 + 컨텍스트 메뉴. 아이콘 파일이 없으면 빈 이미지로 폴백.
function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'))
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('TimeBlocks')
  const menu = Menu.buildFromTemplate([
    {
      label: '위젯 보이기',
      click: () => {
        if (widgetWindow) {
          widgetWindow.show()
          widgetWindow.focus()
        }
      },
    },
    { label: '캘린더 열기', click: () => openFullCalendar() },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(menu)
}

function showMissingBuildWindow(): void {
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
    // 위젯이 기본(주) 창. 풀 캘린더는 트레이 '캘린더 열기'에서 연다.
    widgetUrl = `${DEV_SERVER_URL.replace(/\/$/, '')}/widget`
    widgetWindow = createWidgetWindow(widgetUrl)
  } else if (!WEB_BUILD_DIR) {
    showMissingBuildWindow()
  } else {
    // 2) Serve the build on the trusted localhost origin.
    try {
      await startStaticServer(WEB_BUILD_DIR, PORT)
    } catch (err: any) {
      if (err.code === 'EADDRINUSE') {
        // Port already serving (web dev server or a prior instance) — load it as-is.
        console.warn(`[electron-blocks] port ${PORT} in use; loading existing server at ${ORIGIN}`)
      } else {
        throw err
      }
    }
    // 위젯이 기본(주) 창. 풀 캘린더는 트레이 '캘린더 열기'에서 연다.
    widgetUrl = `${ORIGIN}/widget`
    widgetWindow = createWidgetWindow(widgetUrl)
  }

  // 트레이 상주(위젯 표시/풀 캘린더/종료). 위젯이 떠 있는 정상 경로에서만 생성.
  if (widgetWindow) createTray()

  // 로그인 시 자동 시작(프로덕션만). dev에서는 자동시작 등록하지 않는다.
  if (!isDev) app.setLoginItemSettings({ openAtLogin: true })

  // 메인 프로세스 FCM 푸시 시작 (웹 SDK 푸시는 Electron에서 불가하므로 이쪽이 정식 경로).
  if (DEV_SERVER_URL || WEB_BUILD_DIR) {
    const fcmMode = process.env.FCM_MODE || (DEV_SERVER_URL ? 'development' : 'production')
    ipcMain.handle('get-fcm-token', () => latestFcmToken)
    // 위젯 렌더러가 로그인 확인 시 호출 → 위젯 창 표시.
    ipcMain.handle('show-widget', () => {
      if (!widgetWindow || widgetWindow.isDestroyed()) {
        if (widgetUrl) widgetWindow = createWidgetWindow(widgetUrl)
      }
      if (widgetWindow && !widgetWindow.isDestroyed()) {
        widgetWindow.show()
      }
    })
    // 위젯 렌더러가 로그아웃 감지 시 호출 → 위젯 창 숨김.
    ipcMain.handle('hide-widget', () => {
      if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.hide()
    })
    // 풀 캘린더 헤더의 위젯 버튼 → 위젯 창 보이기/숨기기 토글.
    ipcMain.handle('toggle-widget', () => {
      // Cmd+W로 닫혀 파괴됐으면 다시 만든다.
      if ((!widgetWindow || widgetWindow.isDestroyed()) && widgetUrl) {
        widgetWindow = createWidgetWindow(widgetUrl)
        return
      }
      if (!widgetWindow || widgetWindow.isDestroyed()) return
      if (widgetWindow.isVisible()) {
        widgetWindow.hide()
      } else {
        widgetWindow.show()
        widgetWindow.focus()
      }
    })
    // 위젯의 '일정 생성' → 풀 캘린더 창을 열고, 로드 완료 후 생성 다이얼로그 신호 전달.
    ipcMain.handle('open-full-calendar-create', () => {
      const win = openFullCalendar()
      if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', () => win.webContents.send('open-create-dialog'))
      } else {
        win.webContents.send('open-create-dialog')
      }
    })
    // 위젯 본문 클릭 → 풀 캘린더 창만 연다(생성 다이얼로그 없음).
    // dateMs가 오면 풀 창을 그 월로 이동시킨다(별도 창이라 기본은 오늘 월).
    ipcMain.handle('open-full-calendar', (_e, dateMs?: number) => {
      const win = openFullCalendar()
      if (dateMs == null) return
      const send = () => win.webContents.send('navigate-to-date', dateMs)
      if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', send)
      } else {
        send()
      }
    })
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
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.show()
      widgetWindow.focus()
      return
    }
    if (BrowserWindow.getAllWindows().length === 0 && (DEV_SERVER_URL || WEB_BUILD_DIR)) {
      const widgetUrl = DEV_SERVER_URL ? `${DEV_SERVER_URL.replace(/\/$/, '')}/widget` : `${ORIGIN}/widget`
      widgetWindow = createWidgetWindow(widgetUrl)
    }
  })
})

app.on('window-all-closed', () => {
  // 위젯/트레이 상주: 창을 다 닫아도 quit하지 않는다. 종료는 트레이 '종료'로만.
})

app.on('before-quit', () => {
  app.isQuitting = true
})
