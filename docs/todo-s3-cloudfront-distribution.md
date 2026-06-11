# TODO — S3 + CloudFront 배포 / 자동 업데이트 인프라

> 데스크톱 설치파일(dmg/exe)과 자동 업데이트 피드(yml/zip)를 S3에 올리고
> CloudFront + 자체 도메인(`download.timeblocks.com` 등)으로 서빙하는 구성.
>
> **왜 이 방식인가**
> - GitHub Releases는 레포가 private이라 공개 배포에 부적합 (다운로드에 토큰 필요)
> - EC2/nginx 직접 서빙은 140MB급 파일 트래픽에 비효율
> - 이미 S3(`VITE_S3_HOST`)·도메인 인프라를 쓰고 있어 가장 자연스러움
> - `publish` 설정이 곧 electron-updater의 업데이트 피드 URL이 됨 — 배포처와 업데이트 피드가 한 곳으로 통일

## 1단계 — AWS 인프라 (인프라 담당)

- [ ] 전용 S3 버킷 생성 (예: `timeblocks-desktop`) — **퍼블릭 차단 유지** (직접 노출 금지)
- [ ] CloudFront 배포 생성, OAC(Origin Access Control)로 버킷 연결 — S3는 CloudFront를 통해서만 접근
- [ ] 자체 도메인 연결 (예: `download.timeblocks.com`) + ACM 인증서
- [ ] **캐시 비헤이비어 분리** ← 가장 잘 터지는 함정
  - `*.yml` : TTL 0~60초 (길게 캐시되면 새 버전을 올려도 사용자 앱이 옛 yml을 보고 "최신"이라 판단 → 업데이트 안 됨)
  - `*.dmg` `*.zip` `*.exe` `*.blockmap` : 파일명에 버전이 박혀 있으므로 장기 캐시 OK
- [ ] 업로드 전용 IAM 사용자/역할 생성 — 해당 버킷 `PutObject` 최소 권한

## 2단계 — electron-builder publish 설정

- [ ] `package.json` `build`에 publish 추가:
  ```jsonc
  "publish": {
    "provider": "s3",
    "bucket": "timeblocks-desktop",
    // 사용자가 받는 URL을 CloudFront 도메인으로:
    "endpoint": "https://download.timeblocks.com"
  }
  ```
- [ ] 빌드 환경(로컬 또는 CI)에 자격증명 설정: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
- [ ] 배포 빌드: `electron-builder --mac --arm64 --x64 --publish always` (win 동일) — 설치파일 + `latest*.yml` + blockmap이 함께 업로드되는지 확인
- [ ] 다운로드 확인: `https://download.timeblocks.com/TimeBlocks-{버전}-arm64.dmg` 등

## 3단계 — 자동 업데이트 (electron-updater)

> **전제**: [todo-code-signing-notarization.md](todo-code-signing-notarization.md)의 서명·공증 완료.
> unsigned 앱은 Squirrel.Mac이 업데이트를 거부하므로 서명 없이는 동작하지 않음.

- [ ] `electron-updater` 의존성 추가
- [ ] main 프로세스에 업데이트 체크 코드 통합 (`autoUpdater.checkForUpdatesAndNotify()` 등 — 시점/UX 결정 필요)
- [ ] 동작 검증: 구버전 설치 → 신버전 publish → 앱 재시작 시 자동 교체되는지 확인

## 운영 절차 (구축 완료 후 릴리스 루틴)

1. `package.json` 버전 올리기
2. `npm run dist -- --publish always` (또는 CI 트리거)
3. 끝 — 사이트 다운로드 링크는 버전 포함 URL 갱신, 기존 사용자는 자동 업데이트
