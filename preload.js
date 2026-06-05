const { contextBridge, ipcRenderer } = require('electron')

// Context-isolated bridge between the web app and the Electron shell.
// 푸시는 메인 프로세스가 수신 → 여기서 토큰/메시지를 웹앱에 전달한다.
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // 메인 프로세스가 발급한 FCM 토큰을 가져온다(백엔드 디바이스 등록에 사용).
  getFcmToken: () => ipcRenderer.invoke('get-fcm-token'),

  // 위젯에서 일정 생성 요청 → 메인이 풀 캘린더 창을 열고 생성 다이얼로그를 띄운다.
  openFullCalendarCreate: () => ipcRenderer.invoke('open-full-calendar-create'),

  // 위젯 본문 클릭 → 풀 캘린더 창만 연다(생성 다이얼로그 없음).
  openFullCalendar: () => ipcRenderer.invoke('open-full-calendar'),

  // 풀 캘린더가 생성 다이얼로그 열기 신호를 수신. 반환값은 구독 해제 함수.
  onOpenCreateDialog: (cb) => {
    const l = () => cb()
    ipcRenderer.on('open-create-dialog', l)
    return () => ipcRenderer.removeListener('open-create-dialog', l)
  },

  // 토큰이 (재)발급될 때 호출. 반환값은 구독 해제 함수.
  onFcmToken: (cb) => {
    const listener = (_e, token) => cb(token)
    ipcRenderer.on('fcm-token', listener)
    return () => ipcRenderer.removeListener('fcm-token', listener)
  },

  // 푸시 메시지 수신 시 호출. 반환값은 구독 해제 함수.
  onPushMessage: (cb) => {
    const listener = (_e, message) => cb(message)
    ipcRenderer.on('push-message', listener)
    return () => ipcRenderer.removeListener('push-message', listener)
  },

  // 알림 클릭 시 호출. 반환값은 구독 해제 함수.
  onPushClick: (cb) => {
    const listener = (_e, message) => cb(message)
    ipcRenderer.on('push-click', listener)
    return () => ipcRenderer.removeListener('push-click', listener)
  },
})
