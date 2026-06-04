const { app, Notification: ElectronNotification } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const PushReceiver = require('@eneris/push-receiver').default

// Electron 렌더러엔 웹푸시 백엔드가 없어 firebase 웹 SDK의 getToken()이 실패한다.
// 대신 메인 프로세스(Node)에서 FCM의 MCS 프로토콜로 직접 토큰을 발급받고
// 소켓으로 푸시 메시지를 수신한다. 발급된 토큰은 정상 FCM 토큰이라, 백엔드는
// 기존과 동일하게 그 토큰으로 푸시를 보내면 된다.

// 웹 레포의 .env.<mode> 에서 VITE_FIREBASE_* 값을 런타임에 읽는다(같은 프로젝트로 등록).
function loadFirebaseEnv(mode) {
  const envPath = path.join(__dirname, '..', 'react-web-calendar', `.env.${mode}`)
  const out = {}
  if (!fs.existsSync(envPath)) return out
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*(VITE_FIREBASE_[A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function writeJSON(p, data) {
  try {
    fs.writeFileSync(p, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('[push] persist failed:', e)
  }
}

// FCM 수신 시작. onToken/onMessage 콜백으로 결과를 바깥(IPC)에 넘긴다.
async function startPush({ mode = 'production', onToken, onMessage, onClick } = {}) {
  const env = loadFirebaseEnv(mode)
  const firebase = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    appId: env.VITE_FIREBASE_APP_ID,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
  }
  const vapidKey = env.VITE_FIREBASE_VAPI

  if (!firebase.apiKey || !firebase.projectId || !vapidKey) {
    console.error(`[push] firebase env (.env.${mode}) 누락 — 푸시 비활성화`)
    return null
  }

  // 자격증명/수신ID를 디스크에 영속화 → 재시작 시 같은 토큰 재사용 + 중복 알림 방지.
  const storePath = path.join(app.getPath('userData'), `push-${mode}.json`)
  const persisted = readJSON(storePath) || {}
  let credentials = persisted.credentials

  const instance = new PushReceiver({
    firebase,
    vapidKey,
    credentials,
    persistentIds: persisted.persistentIds || [],
    // 내부 프로토콜(연결/로그인/하트비트/수신)을 터미널에 노출 → 수동 전송 없이 진단.
    debug: process.env.PUSH_DEBUG !== '0',
  })

  instance.onReady(() => console.log('[push] ready (MCS 연결·로그인 완료, 수신 대기)'))

  const persist = () =>
    writeJSON(storePath, { credentials, persistentIds: instance.persistentIds })

  instance.onCredentialsChanged(({ newCredentials }) => {
    credentials = newCredentials
    persist()
    console.log('[push] credentials updated. token:\n' + newCredentials.fcm.token)
    onToken?.(newCredentials.fcm.token)
  })

  instance.onNotification(({ message }) => {
    persist()
    const n = message.notification || {}
    const data = message.data || {}
    const title = n.title || data.title || 'TimeBlocks'
    const body = n.body || data.body || ''
    console.log('[push] message received:', title, '/', body)
    console.log('[push] full message:', JSON.stringify(message))
    if (ElectronNotification.isSupported()) {
      const notif = new ElectronNotification({ title, body })
      // 클릭은 로컬에서 처리(외부 URL로 보내지 않음) — 로컬 창에 포커스.
      notif.on('click', () => {
        console.log('[push] notification clicked')
        onClick?.(message)
      })
      notif.show()
    }
    onMessage?.(message)
  })

  await instance.connect()
  const token = instance.fcmToken
  console.log(`[push] connected (mode=${mode}). FCM token:\n${token}`)
  onToken?.(token)
  return { instance, token }
}

module.exports = { startPush }
