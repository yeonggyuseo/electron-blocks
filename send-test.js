// FCM 토큰으로 테스트 푸시를 직접 전송한다 (수신기 격리 테스트용).
// 백엔드·디바이스 등록을 전부 우회하고, 지정한 토큰으로만 직배송한다.
//
// 사전 준비(1회):
//   Firebase 콘솔 → (해당 프로젝트) 프로젝트 설정 → 서비스 계정 →
//   "새 비공개 키 생성" → 받은 JSON을 이 폴더에 service-account.json 으로 저장
//   ※ 토큰이 dev 프로젝트(time-…)면 dev 프로젝트의 키, prod면 prod 키.
//
// 사용:
//   node send-test.js <fcmToken> [title] [body]

const admin = require('firebase-admin')
const path = require('node:path')
const fs = require('node:fs')

const [, , token, title = '테스트 알림', body = 'electron-blocks 수신 테스트'] = process.argv

if (!token) {
  console.error('사용법: node send-test.js <fcmToken> [title] [body]')
  process.exit(1)
}

const saPath = path.join(__dirname, 'service-account.json')
if (!fs.existsSync(saPath)) {
  console.error(`service-account.json 이 없습니다: ${saPath}`)
  console.error('Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 → 이 경로에 저장')
  process.exit(1)
}

admin.initializeApp({ credential: admin.credential.cert(require(saPath)) })

admin
  .messaging()
  .send({ token, notification: { title, body }, data: { title, body } })
  .then((id) => {
    console.log('✅ 전송 성공:', id)
    console.log('→ electron 터미널에 [push] message received 가 뜨는지 확인하세요.')
    process.exit(0)
  })
  .catch((err) => {
    console.error('❌ 전송 실패:', err.errorInfo || err)
    process.exit(1)
  })
