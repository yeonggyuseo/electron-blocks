# TODO — macOS 코드 서명 + 공증 (외부 배포 전 필수)

> 현재 빌드는 **unsigned** 상태다. 빌드 로그의
> `skipped macOS application code signing ... 0 valid identities found`
> 가 "Developer ID 인증서가 키체인에 없다"는 뜻.
>
> unsigned 앱의 한계:
> - 사용자가 dmg를 열면 **"확인되지 않은 개발자"** 경고로 차단됨 (우클릭→열기로만 우회 가능)
> - **자동 업데이트 불가** — Squirrel.Mac은 서명 안 된 앱의 업데이트를 거부함.
>   자동 업데이트 계획이 있으므로 서명은 선택이 아니라 전제 조건.

## 1단계 — Developer ID 서명 (code signing)

**뭐냐**: Apple이 발급한 개발자 인증서("Developer ID Application: 회사명")로 앱에 전자서명을 붙이는 것. "이 앱은 등록된 개발자 ○○가 만들었고, 빌드 후 변조되지 않았다"는 도장.

- [ ] Apple Developer Program 가입 (연 $99, 회사 계정 가능 — 조직 계정은 D-U-N-S 번호 필요, 며칠 소요)
- [ ] "Developer ID Application" 타입 인증서 발급
- [ ] 빌드 머신 키체인에 인증서 설치
- [ ] `npm run dist:mac` 실행 → 로그에서 `skipped macOS application code signing`이 **사라졌는지** 확인 (인증서가 키체인에 있으면 electron-builder가 자동으로 서명)

## 2단계 — 공증 (notarization)

**뭐냐**: 서명한 앱을 Apple 서버에 업로드해서 자동 악성코드 검사를 받고, 통과 티켓을 앱에 부착(stapling)하는 절차. macOS 10.15+부터 인터넷에서 받은 앱은 사실상 필수.

- [ ] App-Specific Password 발급 (appleid.apple.com → 로그인 및 보안) 또는 App Store Connect API 키 준비
- [ ] 빌드 환경에 환경변수 설정:
  - `APPLE_ID` — 개발자 계정 Apple ID
  - `APPLE_APP_SPECIFIC_PASSWORD` — 위에서 발급한 비밀번호
  - `APPLE_TEAM_ID` — 개발자 팀 ID
- [ ] `npm run dist:mac` 실행 → electron-builder가 빌드 파이프라인에서 자동으로 업로드→대기→스테이플 수행 (몇 분 소요)
- [ ] 검증: 다른 Mac(또는 새 사용자 계정)에서 dmg 다운로드 → 더블클릭으로 **경고 없이** 열리는지 확인

## 참고 — Windows 서명 (별건)

- [ ] (외부 배포 시) Authenticode 인증서로 `TimeBlocks Setup *.exe` 서명 — 없으면 SmartScreen 경고 발생
