---
title: "FCM 푸시 수신을 메인 프로세스에 구현해야 하는 진짜 이유 — 렌더러(Chromium)에 푸시 서비스가 없음"
date: 2026-06-04
category: architecture
module: electron-blocks/push.js + main.js + react-web-calendar(useDeviceManager)
problem_type: platform_constraint
component: desktop-shell
severity: high
status: 설계_확정
tags: [electron, fcm, push-receiver, web-push, push-service, service-worker, vapid, main-process, mcs]
related_docs:
  - react-web-calendar/docs/solutions/integration-issues/electron-push-notification-stale-block-makeallblocklist-merge-2026-06-04.md
---

# FCM 푸시 수신을 메인 프로세스에 구현해야 하는 진짜 이유

## 한 줄 요약

**Electron 렌더러(번들된 Chromium)에는 브라우저가 붙는 "푸시 서비스(push service)" 연결이 없다.**
그래서 `pushManager.subscribe()`(= firebase 웹 SDK `getToken()`의 내부 호출)가 실패하고, **렌더러는 웹푸시를 수신할 경로 자체가 없다.** 수신을 하려면 메인 프로세스(Node)에서 FCM을 직접 받아야 한다.

> 흔한 오해: "알림 권한을 못 받아서 메인에 구현한다" — **아니다.** 권한과는 별개 문제다(아래 "권한은 별개" 참고).

## 배경: 웹푸시는 3개 층으로 나뉜다

| 층 | 정체 | 위치 |
|----|------|------|
| ① **푸시 서비스 (push service)** | 브라우저 ↔ Google FCM/GCM 푸시 인프라. `pushManager.subscribe(vapidKey)`가 여기에 구독을 등록하고, 메시지가 이 경로로 단말에 내려온다. | 브라우저 런타임 내장 (인프라) |
| ② **서비스 워커** | `firebase-messaging-sw.js`. ①이 내려준 푸시를 백그라운드에서 받아 알림 표시·클릭 처리하는 **클라이언트 핸들러**. | 웹앱 `public/` |
| ③ **앱 백엔드** | 토큰으로 FCM에 "이 토큰에 보내줘"라고 요청하는 발송 측. | 서버 |

일반 브라우저(Chrome)는 ①이 내장돼 있어 `subscribe()`가 성공 → ② SW가 푸시를 받는다.

## 문제: Electron 렌더러엔 ①이 없다

Electron이 번들하는 Chromium에는 **Google 푸시 메시징 서비스 연결이 구성돼 있지 않다.** 결과:

- 렌더러에서 firebase 웹 SDK `getToken(vapidKey)` 호출
  → 내부적으로 `serviceWorkerRegistration.pushManager.subscribe()` 시도
  → **`DOMException: Registration failed - push service not available`**
- ② SW를 등록해도 **구독할 ①이 없어** 수신할 게 없다 → SW는 무용지물.
- 실측: 이 `DOMException`이 throw되면 웹앱의 토큰 발급 흐름이 끊겨 **로그인 후 빈 화면**까지 유발했다.

즉, 권한이 아무리 정상이어도 **렌더러에는 푸시를 받을 통로가 물리적으로 없다.**

## 해결: 메인 프로세스에서 FCM을 직접 수신

`push.js`가 `@eneris/push-receiver`로 **메인 프로세스(Node)** 에서 FCM의 MCS 프로토콜을 직접 말한다:

- 웹 레포 `.env.<mode>`의 `VITE_FIREBASE_*` + VAPID 키로 **웹앱과 동일한 firebase 프로젝트**에 등록.
- MCS 소켓으로 푸시를 수신 → Electron 네이티브 `Notification` 표시 + IPC로 렌더러에 전달.
- 여기서 발급되는 토큰은 **정상 FCM 토큰**이라, 백엔드는 기존과 똑같이 그 토큰으로 보내면 된다(웹/Electron 구분 안 함).

```
[백엔드] --send(token)--> [FCM]
                            │
        (웹)  Google 푸시 서비스 → 브라우저 SW
        (Electron) MCS 소켓 → push.js (메인 프로세스)  ← 렌더러엔 이 경로가 없어 메인이 대신 받음
                            │
                  onToken  → main.js → IPC → preload(electronAPI.getFcmToken) → 웹앱이 백엔드에 토큰 등록
                  onMessage→ 네이티브 알림 + 렌더러 전달
                  onClick  → 창 포커스 + 웹앱이 해당 일정 fetch
```

**핵심: 메인 프로세스 구현의 이유는 "푸시 서비스(①)가 렌더러에 없어서"다.** 받을 경로가 메인(Node)밖에 없으므로, 권한 여부와 무관하게 수신은 반드시 메인에 있어야 한다.

## 권한은 별개 문제 (혼동 주의)

알림 권한 자동 승인([main.js](../../../main.js) `setPermissionRequestHandler`/`setPermissionCheckHandler`)은 **수신과 무관한 별도의 우회**다:

- 역할: 웹앱 [useDeviceManager](../../../../react-web-calendar/src/hooks/useDeviceManager.ts)의 `if (Notification.permission === 'granted')` 분기를 **통과시켜 토큰 등록을 트리거**하기 위함. Electron엔 권한 프롬프트 UI가 없어 `granted`가 안 나올 수 있다.
- 이게 main.js에 있는 건 `setPermissionRequestHandler`가 **session API라 메인에서만 호출 가능**하기 때문이지, "푸시를 메인에 구현해야 해서"가 아니다.
- 설계 트릭: 권한은 granted로 만들되, 그 분기에서 firebase `getToken()` 대신 **`electronAPI.getFcmToken()`(push.js 토큰)을 쓴다** → `pushManager.subscribe()`를 아예 안 호출하므로 위 `DOMException`이 발생하지 않는다.

| 구성요소 | 메인 프로세스에 있는 이유 |
|----------|---------------------------|
| `push.js` (FCM 수신) | 렌더러에 **푸시 서비스가 없어서** 수신 불가 → 메인이 직접 수신 (근본 이유) |
| 권한 자동승인 (main.js) | 권한 프롬프트가 없어 `granted`가 안 나옴 → 등록 분기 통과용 **별도 우회**. session API라 마침 메인에 위치 |

## 검증 / 재현

- `DISABLE_PUSH` 또는 웹 SDK 경로를 강제로 태우면 `push service not available` DOMException → 빈 화면 재현(과거 실측).
- 정상 경로: `[push] connected (mode=...). FCM token: ...` 로그 후 그 토큰으로 발송 시 네이티브 알림 수신.
- MCS 내부 프로토콜 진단이 필요하면 `PUSH_DEBUG=1`로 실행(기본 OFF).

## 관련 문서

- 푸시 클릭 후 일정이 stale하게 보이던 별개 버그(makeAllBlockList 머지) → `react-web-calendar/docs/solutions/integration-issues/electron-push-notification-stale-block-makeallblocklist-merge-2026-06-04.md`
