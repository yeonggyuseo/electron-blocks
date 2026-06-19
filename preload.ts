import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// Context-isolated bridge between the web app and the Electron shell.
// 푸시는 메인 프로세스가 수신 → 여기서 토큰/메시지를 웹앱에 전달한다.
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // 메인 프로세스가 발급한 FCM 토큰을 가져온다(백엔드 디바이스 등록에 사용).
  getFcmToken: () => ipcRenderer.invoke('get-fcm-token'),

  // 위젯에서 일정 생성 요청 → 메인이 풀 캘린더 창을 열고 생성 다이얼로그를 띄운다.
  openFullCalendarCreate: () => ipcRenderer.invoke('open-full-calendar-create'),

  // 위젯 렌더러: 로그인 확인 시 위젯 표시 / 로그아웃 시 숨김.
  showWidget: () => ipcRenderer.invoke('show-widget'),
  hideWidget: () => ipcRenderer.invoke('hide-widget'),

  // 위젯 고정 토글 → 새 상태(boolean) 반환. 초기 상태 조회는 getAlwaysOnTop.
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  getAlwaysOnTop: () => ipcRenderer.invoke('get-always-on-top'),

  // 위젯 본문 클릭 → 풀 캘린더 창만 연다(생성 다이얼로그 없음).
  // dateMs: 위젯이 보던 월. 풀 창을 같은 월로 이동시키는 데 쓴다.
  openFullCalendar: (dateMs?: number) =>
    ipcRenderer.invoke('open-full-calendar', dateMs),

  // 풀 캘린더가 '해당 월로 이동' 신호를 수신. 반환값은 구독 해제 함수.
  onNavigateToDate: (cb: (dateMs: number) => void) => {
    const listener = (_e: IpcRendererEvent, dateMs: number) => cb(dateMs)
    ipcRenderer.on('navigate-to-date', listener)
    return () => ipcRenderer.removeListener('navigate-to-date', listener)
  },

  // 풀 캘린더가 생성 다이얼로그 열기 신호를 수신. 반환값은 구독 해제 함수.
  onOpenCreateDialog: (cb: () => void) => {
    const l = () => cb()
    ipcRenderer.on('open-create-dialog', l)
    return () => ipcRenderer.removeListener('open-create-dialog', l)
  },

  // 토큰이 (재)발급될 때 호출. 반환값은 구독 해제 함수.
  onFcmToken: (cb: (token: string) => void) => {
    const listener = (_e: IpcRendererEvent, token: string) => cb(token)
    ipcRenderer.on('fcm-token', listener)
    return () => ipcRenderer.removeListener('fcm-token', listener)
  },

  // 푸시 메시지 수신 시 호출. 반환값은 구독 해제 함수.
  onPushMessage: (cb: (message: unknown) => void) => {
    const listener = (_e: IpcRendererEvent, message: unknown) => cb(message)
    ipcRenderer.on('push-message', listener)
    return () => ipcRenderer.removeListener('push-message', listener)
  },

  // 알림 클릭 시 호출. 반환값은 구독 해제 함수.
  onPushClick: (cb: (message: unknown) => void) => {
    const listener = (_e: IpcRendererEvent, message: unknown) => cb(message)
    ipcRenderer.on('push-click', listener)
    return () => ipcRenderer.removeListener('push-click', listener)
  },

  // 이 창에서 데이터가 바뀌었음을 메인에 알린다 → 메인이 "다른" 창들에 'data-changed' 전파.
  // (예: 풀 캘린더에서 일정 생성/설정 변경 → 위젯이 전체 재동기화)
  notifyDataChanged: () => ipcRenderer.invoke('notify-data-changed'),

  // 다른 창의 데이터 변경 신호 수신. 반환값은 구독 해제 함수.
  onDataChanged: (cb: () => void) => {
    const l = () => cb()
    ipcRenderer.on('data-changed', l)
    return () => ipcRenderer.removeListener('data-changed', l)
  },
})
