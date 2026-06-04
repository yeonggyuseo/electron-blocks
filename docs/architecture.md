# Architecture

UI 컴포넌트는 Atomic Design, 비즈니스 도메인은 `features/`로 분리한 하이브리드 구조. 글로벌 상태는 Redux Toolkit + Redux Saga로 통합 관리.

---

## Atomic Design + Features

### Layers

UI 컴포넌트는 재사용성 기준으로 단계별 분리.

| 레이어                  | 책임                                              |
| ----------------------- | ------------------------------------------------- |
| `components/atoms/`     | 최소 단위 UI 요소 (Button, Input 등)              |
| `components/molecules/` | atoms 조합 (FormField, SearchBar 등)              |
| `components/templates/` | 페이지 골격 (Header + Content + Footer 레이아웃) |
| `components/modules/`   | 비즈니스 컨텍스트가 부여된 큰 단위 블록           |
| `components/layout/`    | Container/Grid 같은 구조 보조                     |

### Feature Modules

`features/{calendar,panel,search,dialog,memo,map,header,editor}` — 비즈니스 도메인 단위 모듈.

내부 구조는 도메인별 자유.
- 일부는 sub-folder (`features/calendar/{mainCalendar, weeklyCalendar}`).
- 일부는 평탄한 .tsx 파일들 (`features/memo/MemoItem.tsx`, `MemoList.tsx` ...).

### Public Imports

barrel(`index.ts`) 강제 없음. 호출부에서 깊은 경로로 직접 import 허용.

---

## Directory Structure

```
src/
├── App.tsx
├── index.tsx
├── api/                # API 레이어
│   ├── core/           # axios 설정 + Zod 검증 wrapper
│   └── services/       # service + contracts 페어
├── assets/             # 정적 리소스
├── components/         # Atomic Design 공용 컴포넌트
│   ├── atoms/
│   ├── molecules/
│   ├── templates/
│   ├── modules/
│   └── layout/
├── constants/          # 상수, 타입, 테마, 모델
│   ├── type/
│   ├── theme/
│   └── model/
├── features/           # 비즈니스 도메인 모듈
├── hooks/              # 커스텀 훅
├── pages/              # 페이지 컴포넌트
├── redux/              # 글로벌 상태 (Slice + Saga)
│   ├── slices/
│   ├── sagas/
│   ├── store.ts
│   ├── hook.ts
│   └── types.ts
└── utils/              # 유틸리티 함수
```

---

## File Naming

- **컴포넌트**: PascalCase (`CalendarView`)
- **함수/변수**: camelCase (`handleClick`, `eventData`)
- **상수**: UPPER_SNAKE_CASE (`MAX_EVENTS`)
- **타입**: PascalCase (`EventType`)
- **Slice 파일**: `*Slice.ts` → reducer는 `*Reducer` 이름으로 export
- **Saga 파일**: `*Saga.tsx` (.tsx 관습 유지, JSX 미사용) → watcher는 `watch*` 이름

---

## State Pattern (Redux Toolkit)

서버/클라이언트 상태 모두 Redux store에서 관리. slice는 RTK `createSlice` 사용.

### Location

```
redux/
├── store.ts           # configureStore + combineReducers + sagaMiddleware
├── hook.ts            # typed useAppDispatch / useAppSelector
├── types.ts           # RootState / AppDispatch
├── slices/*Slice.ts   # 도메인별 slice
└── sagas/*Saga.tsx    # 비동기 흐름
```

### Slice

8개 도메인 slice: `user`, `timeBlock`, `layout`, `core`, `modal`, `alert`, `picker`, `localPush`.

각 slice는 `*Reducer`로 export되어 `store.ts`의 `combineReducers`에서 합쳐짐.

### Typed Hooks

`useAppDispatch` / `useAppSelector`를 항상 사용 — raw `useDispatch` / `useSelector` 직접 사용 금지.

```tsx
import { useAppDispatch, useAppSelector } from '@/redux/hook'

const dispatch = useAppDispatch()
const targetBlock = useAppSelector((s) => s.timeBlock.targetBlock)
```

### Rules

- Slice reducer는 동기 mutation만. 비동기 / side effect는 saga로 위임 (아래 Side Effects Pattern 참고).
- `TimeBlockDataSet` 같은 클래스 인스턴스를 state에 저장하는 레거시 패턴 유지 (Domain Model 섹션 참고).

---

## Side Effects Pattern (Redux Saga)

비동기 흐름(API 호출, 페이지 데이터 로딩 등)은 saga가 담당.

### Location

`redux/sagas/{user,timeblock,alert}Saga.tsx` — 도메인별 saga 파일.

### Saga Pattern

각 saga는 `watch*` watcher generator를 export. root saga (`store.ts`)가 `all([...])`로 합침.

```ts
import { call, put, takeEvery, takeLatest } from 'redux-saga/effects'

export function* watchTimeblocks() {
  yield takeLatest(actionA.type, handlerA)
  yield takeEvery(actionB.type, handlerB)
}

function* handlerA(action: PayloadAction<...>) {
  const res = yield call(timeblockApi.fetch, action.payload)
  yield put(timeBlockSlice.actions.setBlocks(res))
}
```

- `takeLatest` — 연속 디스패치 시 마지막만 처리 (이전 진행 중인 saga 취소)
- `takeEvery` — 모든 디스패치 처리
- `call(fn, ...args)` — 함수 호출 (보통 API service)
- `put(action)` — slice 액션 디스패치
- `select(selector)` — store에서 값 읽기

### Dispatch Flow

```
UI: dispatch(actionA)
  ↓
watch*Saga: takeLatest(actionA.type, handlerA)
  ↓
handlerA generator:
  yield call(API service)        ← 비동기 호출
  yield put(slice action)        ← state 업데이트
  ↓
slice reducer: state 변경
  ↓
useAppSelector 구독자 리렌더
```

---

## API Pattern

axios 기반. service 파일과 zod contract 파일이 페어를 이룬다.

### Location

```
api/
├── core/
│   ├── index.ts                # axiosClient / s3AxiosClient
│   ├── AxiosContracts.ts       # zod response validation wrapper
│   └── AxiosValidationError.ts # validation 실패 시 throw
└── services/
    ├── {domain}.ts             # 함수 호출 + transform
    └── {domain}.contracts.ts   # zod 스키마 + 타입 (z.infer)
```

### Service + Contracts Pair

각 도메인은 service 파일과 contracts 파일이 페어:

```ts
// timeblock.contracts.ts
export const GetKeypadsResponseSchema = z.array(KeypadGroupSchema)
export type GetKeypadsResponse = z.infer<typeof GetKeypadsResponseSchema>

// timeblock.ts
import { AxiosContracts } from '../core/AxiosContracts'
import { GetKeypadsResponseSchema } from './timeblock.contracts'

export async function getKeypads() {
  return axiosClient
    .get('/keypads')
    .then(AxiosContracts.responseContract(GetKeypadsResponseSchema))
}
```

### Validation

`AxiosContracts.responseContract(schema)`가 응답을 zod로 검증:

- 성공 → `response.data`를 검증된 타입으로 반환
- 실패 → `console.error(validation.error)` 로그 후 `AxiosValidationError` throw

---

## Domain Model

### TimeBlockDataSet 클래스 사용 시 주의

Redux에 클래스 인스턴스를 저장하는 레거시 패턴 사용 중. 설계상 권장되지 않지만, **불변 패턴을 지키면 문제없이 동작**함.

**현재 구조**:

- `copy()` 메서드: shallow copy (Date만 deep copy)
- 클래스 인스턴스를 Redux에 직접 저장
- `category`도 클래스 인스턴스 (메서드 보유)

**권장 패턴 - 불변 업데이트**:

```tsx
const copied = block.data.copy()

// primitive - 그냥 수정
copied.title = 'new' // Good

// 배열 - 새 배열 할당 (push 금지)
copied.tcAlarm = [...copied.tcAlarm, newAlarm] // Good

// 객체 - 새 객체 할당
copied.extendedProperties = { ...copied.extendedProperties, key: 'value' } // Good

// 중첩 객체 - 각 레벨마다 새 객체
copied.extendedProperties = {
  ...copied.extendedProperties,
  target: { ...copied.extendedProperties.target, value: 50 },
} // Good

dispatch(updateTargetBlock({ block: composeBlock(copied) }))
```

**금지 패턴**:

```tsx
// Bad — copy() 없이 원본 직접 수정 (Redux 상태 오염)
block.data.title = 'new'
block.data.tcAlarm.push(newAlarm)

// Bad — copy() 후에도 배열/객체 내부 직접 수정 (shallow copy라 원본 영향)
copied.tcAlarm.push(newAlarm)
copied.tcAlarm[0].time = 10
copied.extendedProperties.target.value = 50
```

**주의**: `cloneDeep(this)` 전체 적용은 불가. `category` 등 중첩 클래스가 plain object로 변환되어 메서드가 사라짐.

### 블록 타입별 특징

| 타입      | allday | 시간           | 특이사항                                                                      |
| --------- | ------ | -------------- | ----------------------------------------------------------------------------- |
| **event** | 선택   | 시간 일정 가능 | 개별 timezone 지원, overnight 처리                                            |
| **todo**  | 항상   | 없음           | 반복 시 reschedule (과거 미완료 → 오늘 셀), isDone 시 dtDone 기준으로 셀 배치 |
| **habit** | 항상   | 없음           | 반복 전개 포함                                                                |
| **memo**  | 항상   | 없음           | 반복 전개 제외 — `isMemo()` 체크로 원본 그대로 유지                           |

- **시간 일정은 event 타입만** 가질 수 있다. todo, habit, memo는 시간 없이 항상 allday이다.

---

## Recurring Event Rendering Flow

### 개요

반복 일정은 서버에 원본(origin) 1개만 저장되고, 클라이언트에서 페이지 범위에 맞게 전개(expand)된다.
전개는 `MonthlyCalendar.makeRepeatChildBlock()`이 `Repeater.makeRepeatChildList()`를 호출하는 구조로 이루어진다.

---

### 핵심 개념: 날짜 좌표계

이 코드베이스에서 Date 객체는 두 가지 좌표계로 존재한다.

| 종류           | 설명                                    |
| -------------- | --------------------------------------- |
| **real UTC**   | 실제 UTC 타임스탬프                     |
| **fake-local** | 앱타임존 로컬값을 OS 로컬로 저장한 Date |

`dtStart`, `dtEnd`, `dtUntil`은 **fake-local** 방식으로 저장된다.
real UTC로 복원할 때는 반드시 `localDateToUTCTimestamp(date, appTimezoneId)`를 사용한다.

---

### Step 1: 서버 수신 — `converter.ts > convertNumToUTCDate`

서버가 내려주는 UTC timestamp(숫자)를 **fake-local Date**로 변환.

```
allday:    toLocalDatePreservingUTCValues(utcDate)
           → UTC 날짜값(year/month/date)을 OS 로컬 자정으로 저장

시간 이벤트: toLocalDatePreservingTimezoneValues(utcDate, appTimezone)
           → 앱타임존 기준 날짜/시각값을 OS 로컬 Date로 저장
```

이 시점부터 모든 `dtStart`는 **fake-local** (앱타임존 날짜 = OS 로컬 날짜 숫자).

---

### Step 2: Redux 저장

fake-local Date 그대로 저장.

---

### Step 3: 페이지 블록 필터링 — `getThisPageBlocks`

```
rawStartCell = timeDay.count(firstDateOfPage, block.data.dtStart)
rawEndCell   = timeDay.count(firstDateOfPage, block.data.dtEnd)

포함 조건:
  - rawStartCell이 [0, lastCell] 범위 안
  - rawEndCell이 [0, lastCell] 범위 안
  - isRepeatOrigin() → 무조건 포함 후 Step 4에서 전개
  - isRepeatLunar() → 음력 반복 원본도 동일하게 무조건 포함
  - 공휴일 반복 원본은 RDATE 형식으로 내려옴
```

> 주의: 클램핑(startCell < 0 → 0)된 값이 아닌 raw 값으로 판단한다.
> 클램핑 값을 쓰면 이전 달 블록이 셀 0으로 오인되어 좌측 상단에 잘못 그려지는 버그 발생.

---

### Step 4: 반복 전개 — `makeRepeatChildBlock` → `makeRepeatChildList`

> 주의: 메모 블록(`isMemo()`)은 반복 전개에서 제외된다. 반복 메모 원본은 그대로 유지.

#### 4-1. 타임존 결정

```ts
const tz = this.data.timezone ?? appTimezoneId
// tz: 이벤트 개별 타임존 (없으면 앱타임존으로 폴백)
// displayTz: 앱타임존 (화면 표시 기준)
```

#### 4-2. DTSTART 구성 (Floating 방식)

```ts
// fake-local → real UTC → 이벤트 타임존 로컬 시각 추출
const eventLocal = dayjs(toRealUTC(dtStart)).tz(tz)

// Z 없이 로컬 시각 그대로 사용 (Floating DTSTART)
dtStart = eventLocal.format('YYYYMMDDTHHmmss') // 예: "20240301T230000"
```

Floating 방식을 사용하는 이유:

- Z 없이 로컬 시각을 쓰면 rrule이 "매주 월요일 23:00 로컬"처럼 로컬 기준으로 전개
- DST가 있어도 각 occurrence를 개별 변환하므로 BYDAY 사전 보정 불필요
- 기존 UTC+Z 방식은 dayOffset을 dtStart 기준으로 한 번만 계산하여 DST 경계에서 날짜가 밀리는 버그 있었음

#### 4-3. rrule 전개 범위

```ts
// 비종일: floating 좌표계와 real timestamp 불일치를 감안해 ±2일 버퍼 추가
const BUFFER_MS = 2 * 24 * 60 * 60 * 1000
rruleStart = new Date(repeatStart - BUFFER_MS)
rruleEnd = new Date(repeatEnd + BUFFER_MS - 1)

// 종일: rrule이 UTC 자정으로 생성하므로 비교 기준도 UTC 자정으로 맞춤
rruleStart = new Date(Date.UTC(year, month, date))
```

#### 4-4. occurrence 변환 (floatingToDisplayDate)

```
floating Date (getUTC* = 이벤트 타임존 로컬 시각)
  ↓
localStr 추출: getUTC* 값을 문자열로 재구성
  ↓
dayjs.tz(localStr, eventTz).toDate()
  → 이벤트 타임존 로컬로 해석 → real UTC (DST 자동 반영)
  ↓
floorToAppTimezoneDate(realUtc, displayTz)
  → 앱타임존 기준 자정 fake-local Date
  → 이 값이 반복 블록의 dtStart로 박힘
```

#### 4-5. 버퍼 필터링

```ts
// ±2일 버퍼로 전개한 뒤, 실제 페이지 범위로 좁힘
.filter(date => date >= repeatStart && date < repeatEnd)
```

#### 4-6. Todo reschedule

Todo 반복 전개 후 날짜 목록을 재조정한다.

```ts
// 오늘(앱타임존 기준) 이전 날짜 → 가장 마지막 1개만 남김
// 오늘 이후 날짜 → 전부 유지
result = [maxPastDate, ...futureDates]
```

이로 인해 Step 5의 `computeCellNum`에서 미완료 과거 todo는 오늘 날짜 셀에 배치된다.

#### 4-7. 반복 예외 처리

사용자가 특정 날짜를 삭제/이동한 반복 예외(repeatChild)를 제거한다.

---

### Step 5: 셀 위치 결정 — `computeCellNum`

```ts
startCell = timeDay.count(firstDateOfPage, block.data.dtStart)
endCell = timeDay.count(firstDateOfPage, block.data.dtEnd)
```

Step 4-4에서 dtStart에 이미 앱타임존 기준 날짜가 심어져 있으므로 여기서는 날짜 변환 없이 셀 번호만 계산한다.

#### Todo 특수 처리

일반 블록과 달리 Todo는 타입과 날짜에 따라 셀 위치가 달라진다.

| 상태               | startCell 기준                       |
| ------------------ | ------------------------------------ |
| 완료(`isDone`)     | `dtDone` (완료 처리한 날짜)          |
| 미완료 + 미래      | `dtStart`                            |
| 미완료 + 과거/오늘 | `todayInAppTz` (오늘 날짜로 이동)    |
| 공통               | `endCell = startCell` (항상 단일 셀) |

#### 클램핑 (렌더링 위치 보정 전용)

- `startCell < 0` → 0 (이전 달에서 시작해 현재 페이지로 이어지는 블록)
- `endCell > lastCell` → 다음 달 여분 셀까지 확장

---

### Step 6: 렌더링 — `makeTimeBlockComponent`

```
startCol = startCell % 7
startRow = Math.floor(startCell / cols)
blockSpan = endCell - startCell + 1

// 주(row)를 넘어가는 블록은 분할하여 각 행에 별도 컴포넌트로 그림
```

#### Overnight 이벤트 처리

이틀에 걸쳐 시간이 설정된 event가 아래 조건을 모두 만족하면 **단일 셀**로 처리한다.

```ts
const spansTwoDays = timeDay.count(dtStart, dtEnd) === 1 // 자정을 딱 1번 넘김
const isUnder24Hours = dtEnd - dtStart < 24 * 60 * 60 * 1000
const endsBeforeMorning = dtEnd.getHours() < 6 // OVERNIGHT_CUTOFF_HOUR = 6

if (isEvent && spansTwoDays && isUnder24Hours && endsBeforeMorning) {
  blockCellSpan = 1 // 시작일 셀에만 렌더링
  endCell = startCell
  // startCell < 0이면 (이전 달 시작) → skip
}
```

> 예: 23:00~01:00 이벤트는 시작일 셀 하나에만 그려진다.

---

### 전체 흐름 요약

```
allBlockList (Redux)
  │
  ▼
getThisPageBlocks()              ← raw 셀 번호로 페이지 포함 여부 판단
  │                                 메모 원본은 전개 없이 그대로 유지
  ▼
makeRepeatChildBlock()           ← 반복 원본을 페이지 범위로 전개 (메모 제외)
  │   ├─ toRealUTC()             ← fake-local → real UTC
  │   ├─ Floating DTSTART        ← 이벤트 타임존 로컬 시각 (Z 없음)
  │   ├─ rrule.between()         ← ±2일 버퍼 범위로 전개
  │   ├─ floatingToDisplayDate() ← occurrence → 앱타임존 날짜 (DST 반영)
  │   ├─ reschedule()            ← todo 전용: 과거 날짜 중 max 1개만 유지
  │   └─ filter()                ← 실제 페이지 범위로 좁힘
  │
  ▼
computeCellNum()                 ← 앱타임존 기준 dtStart로 셀 번호 계산 (클램핑 포함)
  │                                 todo는 완료/미래/과거 여부에 따라 기준 날짜 다름
  ▼
makeTimeBlockComponent()         ← 셀 번호 → 그리드 위치/크기 → 렌더링
                                    overnight 이벤트는 단일 셀로 압축
```

### 날짜 표현 단계별 정리

| 단계                     | 날짜 표현                                          |
| ------------------------ | -------------------------------------------------- |
| 서버                     | UTC timestamp                                      |
| 수신 후                  | fake-local (앱타임존 날짜 = OS 날짜 숫자)          |
| Floating DTSTART         | 이벤트 타임존 로컬 시각 (Z 없음)                   |
| rrule 출력               | floating Date (getUTC\* = 이벤트 타임존 로컬 시각) |
| floatingToDisplayDate 후 | fake-local (앱타임존 날짜 = OS 날짜 숫자)          |
| computeCellNum           | fake-local 그대로 사용 → 올바른 셀                 |

---

## Basic Items

`src/constants/data/basicItems/`에 하드코딩된 아이템들. 서버 응답을 로컬에서 흉내낸 것.

### itemId 목록

| 파일               | type                        | dev itemId | prod itemId |
| ------------------ | --------------------------- | ---------- | ----------- |
| colorSets.ts       | `color`                     | 775        | 775         |
| stickerSets.ts     | `sticker`                   | 777        | 777         |
| bgSets.ts          | `date_highlight`            | 778        | 778         |
| dateColorSets.ts   | `date_highlight_date_color` | 780        | 780         |
| maskingTapeSets.ts | `sticker_masking_tape`      | 2286       | 2526        |
| dateStickerSets.ts | `sticker_date`              | 2287       | 2527        |
| borderSets.ts      | `date_highlight_border`     | 2293       | 2528        |
| dateTagSets.ts     | `date_highlight_date_tag`   | 2294       | 2529        |

- 775, 777, 778, 780은 dev/prod 동일
- 나머지는 `isDev ? devId : prodId` 패턴으로 환경별로 다름
- `BASIC_ITEM_IDS`에 itemId 배열을 모아두고, 유저 아이템 목록에서 `.includes(v.itemId)`로 기본 아이템 여부 판별
