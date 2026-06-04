# electron-blocks

Timeblocks 데스크톱 셸. **캘린더 UI는 직접 구현하지 않고** `react-web-calendar` 빌드를 메인 프로세스 창에 로드한다.

## 구조

- `main.js` — 메인 프로세스. `app://` 커스텀 프로토콜로 웹 빌드를 서빙하고 `BrowserWindow`에 로드.
- `preload.js` — contextIsolation 브리지(현재 최소 stub).

## 웹 빌드를 왜 `http://localhost:3000`으로 서빙하나

`react-web-calendar`는 **BrowserRouter + 절대경로 asset(`/assets/...`)** 라서 `file://`로 열면 깨진다.
메인 프로세스에 작은 정적 HTTP 서버를 띄워 **`http://localhost:3000`** origin으로 서빙한다. 이 origin은:

- 백엔드(`VITE_DB_HOST`)가 이미 CORS 화이트리스트에 둔 dev origin → **API가 CORS 통과** (`webSecurity` 끌 필요 없음)
- OAuth 리디렉트 URI(localhost:3000 등록)와 일치
- 절대경로 asset·history 라우팅·서비스워커(firebase) 정상 동작

포트는 `WEB_PORT` env로 변경 가능. 3000이 이미 사용 중이면(웹 dev 서버 실행 등) 그 서버를 그대로 로드한다.

## 실행

```bash
npm install

# 1) 빌드 로드 (기본). ../react-web-calendar/build 를 자동으로 찾는다.
#    빌드가 없으면: cd ../react-web-calendar && npm run build
npm start

# 2) 실행 중인 웹 dev 서버(localhost:3000) 로드
npm run start:dev
```

빌드 탐색 우선순위: `WEB_BUILD_DIR` env → `./web-build` → `../react-web-calendar/build`

## 패키징 (추후)

```bash
npm run sync:web    # 사촌 레포 build/ 를 ./web-build 로 복사 (패키지에 번들)
npm run dist:mac    # 또는 dist:win
```

## CORS

**현재 해결됨**: 빌드를 `http://localhost:3000`으로 서빙해서 origin을 백엔드가 이미 허용하는 dev origin과 일치시킴 → CORS 통과, `webSecurity`는 켠 상태 유지.

단 이건 **백엔드가 localhost:3000을 화이트리스트에 둔 환경(dev/staging)** 에서만 통한다. 운영 백엔드가 다른 origin만 허용한다면 추가 처리가 필요하다:

1. **백엔드 CORS 화이트리스트에 셸 origin 추가** (가장 정석)
2. **API를 메인 프로세스 `net.fetch`로 프록시** — 메인은 브라우저 컨텍스트가 아니라 CORS 무관. 렌더러는 IPC로 요청 → 메인이 대신 호출. (보안상으로도 최선, 위젯 프로세스와도 일관)
3. **`session.webRequest.onHeadersReceived`로 응답에 `Access-Control-Allow-*` 주입** — 표적 우회 (프리플라이트 status 처리 주의)

## Firebase / 웹푸시 (로그인 후 빈 화면 원인)

Electron 렌더러엔 **웹푸시(FCM) 백엔드가 없다**(Chromium 기반이라 Google 푸시 서비스 미포함). 그래서 웹앱이 `getToken()`을 호출하면 `pushManager.subscribe()`가 **`DOMException: Registration failed - push service not available`** 를 던지고, 이게 로그인 후 메인 화면을 **빈 화면**으로 만든다(실험으로 확인됨).

- **해결**: `main.js`에서 알림 권한을 거부(`setPermissionRequestHandler`) → 웹앱이 `permission === 'granted'` 분기를 안 타서 push 토큰 경로(`getDeviceToken`)를 호출하지 않음 → DOMException 미발생.
- **디버그**: `DISABLE_PUSH=0 npm start` 로 push를 다시 켜면 빈 화면이 재현된다.
- **푸시 본구현**: 아래 "푸시(FCM)" 참고. 웹 SDK 경로는 끈 채로, 메인 프로세스가 FCM을 직접 수신한다.

## 푸시 (FCM) — 메인 프로세스 수신

`push.js`가 `@eneris/push-receiver`로 FCM의 MCS 프로토콜을 **메인 프로세스(Node)에서** 직접 처리한다(렌더러 웹푸시 불가 우회).

- **설정값**: 웹 레포 `.env.<mode>`의 `VITE_FIREBASE_*`를 런타임에 읽어 같은 프로젝트로 등록. 모드는 `FCM_MODE`(기본: 빌드=`production`, dev서버=`development`).
- **영속화**: 자격증명/수신ID를 `userData/push-<mode>.json`에 저장 → 재시작 시 같은 토큰 + 중복 알림 방지.
- **수신 시**: Electron 네이티브 `Notification` 표시 + 렌더러에 IPC 전달.
- **렌더러 브리지**(preload `electronAPI`): `getFcmToken()` / `onFcmToken(cb)` / `onPushMessage(cb)`.

### 테스트
`npm start` 터미널에 `[push] connected ... FCM token:` 으로 토큰이 찍힌다. 그 토큰으로 푸시를 보내면(FCM/백엔드) 네이티브 알림이 뜬다.

### 남은 작업 (전체 루프)
백엔드가 **로그인 사용자에게** 푸시를 보내려면 이 토큰이 백엔드에 등록돼야 한다. 현재 웹앱은 (알림 권한 거부로) 토큰을 등록하지 않으므로, **웹앱이 `electronAPI.getFcmToken()`으로 받은 토큰을 기존 디바이스 등록(`saveDeviceRequest`)에 사용하도록** 분기 추가 필요 → react-web-calendar 수정 + 재빌드.

## 다음 단계 (미구현)

- 위젯 프로세스(2번째 독립 프로세스)
- 디스크 SQLite 캐시 공유
- 트레이 / 자동시작 / 단일 인스턴스 락
