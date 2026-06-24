; TimeBlocks NSIS 커스텀 스크립트 (electron-builder가 build/installer.nsh를 자동 포함)
;
; TimeBlocks는 트레이 상주(window-all-closed에서 quit 안 함) + openAtLogin으로
; 항상 백그라운드 프로세스가 떠 있다. 게다가 창 close를 가로채 hide만 하므로,
; NSIS 인스톨러의 graceful close(창에 WM_CLOSE 전송)로는 프로세스가 죽지 않는다.
; → "TimeBlocks cannot be closed. Please close it manually and click Retry" 무한 루프.
;
; per-user 설치(perMachine:false)라 본인 소유 프로세스라서 권한 없이 종료 가능.
; 설치/제거 시작 시점에 기존 프로세스를 강제 종료해 우회한다.

!macro customInit
  nsExec::Exec 'taskkill /f /im "${APP_EXECUTABLE_FILENAME}"'
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /f /im "${APP_EXECUTABLE_FILENAME}"'
!macroend
