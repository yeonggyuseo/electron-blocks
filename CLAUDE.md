# Timeblocks Web Calendar

## Required Reading (작업 시작 전 반드시 Read)

작업 시작 **전에** 아래 문서를 Read 도구로 직접 읽는다.
"이미 안다"는 가정으로 건너뛰는 것은 금지된다.

**항상 (모든 작업)**

- [docs/agent-directives.md](docs/agent-directives.md) — 행동 원칙(4개) + 메커니컬 가드(검증/Edit/grep/컨텍스트) + ce-compound·superpowers 워크플로우
- [docs/coding-conventions.md](docs/coding-conventions.md) — Google TS 스타일, React 컴포넌트·훅·메모화·상태 스코프 규칙
- [docs/architecture.md](docs/architecture.md) — Atomic+Features 하이브리드, Redux/Saga, API(axios+zod), 도메인 모델, 반복 일정 흐름

**UI / 컴포넌트 / Figma / 디자인 시스템 작업 시**

- [docs/figma-directives.md](docs/figma-directives.md) — design-system-web 우선, globalStyle 토큰 매핑, 원자 단위 작업, MCP+스크린샷 검증

---

## Overview

React 기반 캘린더 웹 애플리케이션 - 일정 관리, 반복 일정, 메모, 지도 연동

### 핵심 기능

- **캘린더(Calendar)**: 일/주/월 뷰, 일정 관리, 반복 일정(rrule)
- **패널(Panel)**: 일정 상세 정보, 카테고리 관리
- **메모(Memo)**: 메모 작성 및 알림
- **검색(Search)**: 일정/메모 검색
- **지도(Map)**: 위치 기반 일정

### 외부 연동

- Google/Facebook 로그인
- Firebase 푸시 알림
- Sentry 에러 트래킹
- Datadog RUM

### 데코/스티커 타입 계층 (3-Layer)

데코·스티커 관련 코드는 서로 다른 3개의 "타입"이 공존하므로 혼동 금지.

| 계층            | 식별자                       | 값 예시                                          | 의미                           |
| --------------- | ---------------------------- | ------------------------------------------------ | ------------------------------ |
| **블록 타입**   | `block.data.type`            | `stickerDeco` · `dateHighlightBackground`        | 캘린더 블록 종류 (camelCase)   |
| **아이템 타입** | `item.type` (서버 아이템)    | `sticker` · `color` · `date_highlight`           | 스토어 아이템 종류 (snake)     |
| **카테고리 코드** | `attributes.category.code` | `STICKER_DECO_STANDARD` · `STICKER_DECO_EXTENDED` | 아이템 하위 분류 (UPPER_SNAKE) |

**블록 타입 전체** — `AllBlockType` ([timeBlockDataSet.ts](src/constants/model/data/timeBlockDataSet.ts))

- 일반: `event` · `todo` · `memo` · `interval` · `plan` · `habit` · `diary` · `other`
- 데코/스티커: `stickerDeco` · `stickerDate` · `stickerMaskingTape` · `dateBackgroundLegacy` · `dateHighlightBackground` · `dateHighlightBorder` · `dateHighlightDateTag` · `dateColor`

**아이템 타입 전체** — 서버 스토어 아이템 `type` (로컬 기본은 [basicItems/\*](src/constants/data/basicItems/)가 동일 규약으로 흉내)

- 상위: `theme` · `color` · `font`
- 스티커: `sticker` · `sticker_date` · `sticker_masking_tape`
- 날짜강조: `date_highlight` · `date_highlight_date_tag` · `date_highlight_date_color`

**카테고리 코드 전체** — `ITEM_CATEGORY_CODE` ([itemCategoryCode.ts](src/constants/data/itemCategoryCode.ts))

- 최상위: `THEME` · `COLOR` · `STICKER` · `FONT` · `DATE_HIGHLIGHT`
- 스티커: `STICKER_DECO` · `STICKER_MASKING_TAPE` · `STICKER_DATE`
- 데코 스티커 하위: `STICKER_DECO_STANDARD` · `STICKER_DECO_EXTENDED` · `STICKER_DECO_MOTION`
- 날짜강조 하위: `DATE_HIGHLIGHT_BACKGROUND` · `DATE_HIGHLIGHT_BORDER` · `DATE_HIGHLIGHT_DATE_TAG`
- 배경 하위: `DATE_HIGHLIGHT_BACKGROUND_SOLID` · `DATE_HIGHLIGHT_BACKGROUND_PATTERN` · `DATE_HIGHLIGHT_BACKGROUND_GRADIENT`
- 테두리 하위: `DATE_HIGHLIGHT_BORDER_SOLID` · `DATE_HIGHLIGHT_BORDER_DOTTED` · `DATE_HIGHLIGHT_BORDER_TWO_TONE_DOTTED` · `DATE_HIGHLIGHT_BORDER_PATTERN`

**주의사항**

- **로컬 기본 아이템**(`constants/data/basicItems/*`)의 `type`은 **아이템 타입(2번)** 규약을 따른다 — 예: 기본 데코 스티커는 `'stickerDeco'`가 아니라 **`'sticker'`**. 서버 아이템을 흉내 낸 것이므로 의도된 값이다.
- `item.type === 'sticker'` 류 필터는 **아이템 타입** 기준이며, 로컬 기본 아이템도 같은 규약이라 함께 매칭된다.
- **블록 타입과 아이템 타입을 직접 비교하지 말 것** (`item.type === block.data.type` ✗). 둘은 다른 계층이다.
- 그리드 컬럼/셀 크기 등 세부 분기는 **카테고리 코드(3번)** 로 판단한다 (예: 기본형 `STICKER_DECO_STANDARD` → 5열).

---

## Tech Stack

- **Build Tool**: Vite 5 (CRA에서 마이그레이션)
- **Framework**: React 17
- **Language**: TypeScript
- **State**: Redux Toolkit + Redux Saga
- **UI**: MUI (Material UI) v5
- **Styling**: styled-components
- **Form**: Formik
- **Date**: dayjs, moment, rrule
- **Design System**: @timeblocks/design-system-web

### 프로덕션 빌드 (Docker)

EC2 서버의 Node 버전 호환 문제로 Docker 사용:

```bash
./build.sh              # Docker로 빌드 (Node 18)
```

빌드 결과물: `build/` 디렉토리 → nginx로 서빙

---

## Gotcha

> [docs/solutions/](docs/solutions/) — 과거 문제 해결 사례·아키텍처 패턴·관례를 카테고리별로 정리한 지식 베이스. 작업·디버깅할 때 먼저 확인할 것

### lodash import

```tsx
// ❌ 번들 사이즈 증가
import _ from 'lodash'

// ✅ named import 사용
import { debounce, throttle } from 'lodash'
```

### z-index — 중앙 토큰 사용 + 콘텐츠 레이어와 모달 레이어 분리

z-index는 [src/constants/style/zIndexes.ts](src/constants/style/zIndexes.ts)에서 중앙 관리한다. raw 숫자를 임의로 박지 말 것.

핵심: **콘텐츠(페이지 내부) 레이어**와 **모달/오버레이 레이어**는 다른 층위다.

- 모달·다이얼로그·팝오버는 `#portal`로 렌더되며 `zIndexes.dialog(5)` / `blockEditor(3)` / `popover(4)` 등을 쓴다.
- 페이지 내부의 sticky 헤더·고정 요소는 **자기 스크롤 콘텐츠(z=auto) 위에만** 있으면 되므로 **모달 레벨보다 낮은 최소값(1~2)** 을 써야 한다.

> ❌ 실제 발생한 버그: `MemoView.MemoHeader`를 sticky로 만들며 `z-index: 10`을 박음 → 메모 상세 모달(`BlockEditor`, `blockEditor=3`)과 오버레이 위로 헤더가 뚫고 나와, 모달이 떠도 헤더만 딤 처리 안 되고 위에 보임. 또 `premiumSub: 10`과도 충돌.
>
> ✅ 해결: `zIndexes.ts`에 `stickyHeader: 1`(층위 추상화) 토큰을 추가하고 `z-index: ${zIndexes.stickyHeader}`로 낮춤. sticky 헤더는 리스트(z=auto)만 덮으면 되고, 모달(≥3)이 정상적으로 헤더를 덮음.
>
> ⚠️ `zIndexes.interfaceBar(8)`와 헷갈리지 말 것. `interfaceBar`는 **상단 글로벌 내비(CalendarNavigation) = 항상 최상단 크롬**이라 모달 위에 뜬다. 페이지 내부 sub-header는 모달 **아래**에 있어야 하므로 정반대 층위(`stickyHeader`)다. (메모의 `Styled.InterfaceBar`는 헤더 안 제목 줄일 뿐, 이 토큰과 무관.)

sticky/fixed 요소에 z-index를 줄 때 체크:

1. 이 요소가 덮어야 하는 건 같은 페이지의 스크롤 콘텐츠뿐인가? → 1~2면 충분
2. 포털 모달/오버레이가 이 요소를 덮어야 하는가? → 그렇다면 모달 레벨(3 이상)보다 반드시 낮게

### 반복 일정 / 타임존 코드 수정 금지

**반복 일정(rrule, repeat) 및 타임존(timezone, fake-local, UTC 변환) 관련 코드는 사용자의 명시적 승인 없이 절대 수정 불가.**

대상 파일 및 영역:

- `Repeater` / `makeRepeatChildList` / `makeRepeatChildBlock`
- `floatingToDisplayDate` / `toRealUTC` / `floorToAppTimezoneDate`
- `convertNumToUTCDate` / `toLocalDatePreservingUTCValues` / `toLocalDatePreservingTimezoneValues`
- fake-local ↔ real UTC 변환 로직이 포함된 모든 파일

위 영역에 변경이 필요하다고 판단되더라도:

1. 변경 이유와 영향 범위를 **먼저 설명**한다.
2. 사용자가 **"진행해"** 또는 이에 준하는 명확한 승인을 한 후에만 수정한다.
3. 사용자 승인 없이 "개선", "리팩터", "버그 수정" 명목으로 해당 코드를 수정하는 것은 **엄격히 금지**한다.

> 상세 흐름·식별자(rrule 전개, fake-local↔UTC 변환, Step 1-6 등)는 [docs/architecture.md > Recurring Event Rendering Flow](docs/architecture.md#recurring-event-rendering-flow) 참고.

---

## Development

```bash
npm start               # 개발 서버 (localhost:3000) — Firebase messaging dev SW 복사 후 vite
npm run build:dev       # 개발 빌드 (vite --mode development)
npm run build           # 프로덕션 빌드 (vite --mode production + Sentry sourcemap)
npm run preview         # 빌드 결과 로컬 미리보기 (vite preview)
npm run test            # Jest 테스트
npm run storybook       # Storybook (localhost:6006)
npm run build-storybook # Storybook 정적 빌드
npm run tc              # 타입 체크 (tsc --noEmit)
```

> 포트 3000 고정 (timeblocks-partner-store와 3001 충돌 방지).

---

## Backend API

3개의 axios 인스턴스로 외부 백엔드와 통신. 메인은 자체 캘린더 API 서버.

| 항목                | 내용                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| HTTP 클라이언트     | [src/api/core/index.ts](src/api/core/index.ts) — `axiosClient` (메인) / `s3AxiosClient` (S3) / `portalAxiosClient` (Portal) |
| BASE URL            | `import.meta.env.VITE_DB_HOST` (메인), `VITE_S3_HOST` (S3), `VITE_PORTAL_HOST` (Portal)                                    |
| 인증                | Bearer AT (`user.accessToken`), 토큰은 `BrowserStorage` (localStorage)에 저장                                              |
| 토큰 재발급         | 401 응답 시 `/api/users/token/refresh`로 자동 갱신 (`mem`으로 maxAge=1000ms 중복 요청 제거)                                  |
| Refresh 401 / 404   | 디바이스 등록 해제 호출 후 `BrowserStorage.clear()` + `user.deleteUser()` + `window.location.reload()`                       |
| Validation          | [src/api/core/AxiosContracts.ts](src/api/core/AxiosContracts.ts) — zod 스키마로 응답 검증, 실패 시 `AxiosValidationError` throw |
| SSR                 | 없음 (Vite + CSR only)                                                                                                     |

서비스 함수는 `src/api/services/{domain}.ts` + `{domain}.contracts.ts` 페어 패턴. 추가 패턴은 [docs/architecture.md](docs/architecture.md#api-pattern) 참고.

---

## Git

- Main: `main`
- Branch: `WCR-{issue}-{type}-{description}` (e.g., `WCR-165-feat-item-category`)
- Commits: follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) — `feat:`, `fix:`, `refactor:`, `chore:`

---

## Deployment

### EC2 배포 흐름

1. `./build.sh` 실행 (Docker 빌드)
2. `build/` 디렉토리에 결과물 생성
3. nginx가 정적 파일 서빙 (`/home/ec2-user/react-web-calendar/build`)

### nginx 설정

- root: `/home/ec2-user/react-web-calendar/build`
- SPA이므로 `try_files $uri $uri/ /index.html` 필요

---
