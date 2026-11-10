# 0.111cm 챌린지

초코 스틱이 줄어드는 동안 딱 **0.111cm** 남았을 때 멈추는 타이밍 게임. 닉네임만으로 참여하고 팀 순위로 겨뤄요.

## 기능

- **기본 게임**: 15cm에서 시작해 초당 약 1.85cm로 줄다가, 마지막 4cm쯤부터 초당 약 4cm로 빨라져요. 한 판은 6~7초예요. 0.111cm와의 오차로 P·S·A·B·C·D 등급을 매겨요. 끝까지 다 먹으면 '완식'.
- **블라인드 모드**: 1cm 아래부터 숫자, 확대경, 스틱 끝이 가려져요. 순위는 일반 모드와 따로 매겨요.
- **변칙 스틱**: 40% 확률로 급가속, 멈칫, 출렁 중 하나가 섞여 나와요.
- **팀 순위**: 모드별 1인 최고 기록 실시간 순위, 최근 플레이.
- **공유**: 결과 카드 이미지(공유 시트 또는 저장), 도전장 링크(`#c=...`)로 1:1 도전.
- **닉네임 로그인**: Firebase 익명 인증으로 브라우저마다 고유 ID를 만들고, 닉네임은 먼저 쓴 사람이 점유해요.

## Firebase 설정

1. **웹 앱 등록**: 프로젝트 설정 → 일반 → 내 앱 → 웹 앱 추가. 나온 `firebaseConfig` 값을 `js/config.js`에 붙여넣어요.
2. **Firestore 생성**: Firestore Database → 데이터베이스 만들기 → 위치 `asia-northeast3`(서울) → 프로덕션 모드.
3. **보안 규칙**: Firestore → 규칙 탭에 `firestore.rules` 내용을 전부 붙여넣고 게시.
4. **익명 로그인**: Authentication → 로그인 방법 → 익명 사용 설정.
5. **승인된 도메인**: Authentication → 설정 → 승인된 도메인에 `grute02.github.io` 추가.

`js/config.js`가 비어 있으면 기록이 이 브라우저에만 남는 모드로 동작해요.

## 배포 (GitHub Pages)

저장소 Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `/ (root)` → Save.
1~2분 뒤 `https://grute02.github.io/Pepero_game/`에서 열려요.

## 로컬 실행

ES 모듈을 쓰기 때문에 파일을 더블클릭하면 안 열려요. 간단한 서버로 띄워요.

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## 구조

```
index.html          화면 구조
css/style.css       스타일 (라이트/다크)
js/config.js        Firebase 설정값
js/sim.js           게임 규칙, 스틱 시뮬레이션, 등급 (DOM 없음)
js/render.js        캔버스: 게임 화면, 결과 카드
js/store.js         Firebase 연동, 로컬 기록
js/share.js         결과 카드 공유, 도전장 링크
js/main.js          화면 연결
firestore.rules     Firestore 보안 규칙
```

## 데이터

| 컬렉션 | 문서 id | 내용 |
|---|---|---|
| `nicknames` | 소문자 닉네임 | `uid`, `nickname` (닉네임 점유) |
| `players` | uid | `nickname`, `nickKey`, `createdAt`, `updatedAt` |
| `scores_normal`, `scores_blind` | uid | `best`(오차), `bestLen`, `bestAt`, `tries`, `lastLen`, `lastAt` |

## 알아둘 점

- 닉네임은 처음 등록한 브라우저에 묶여요. 브라우저 데이터를 지우거나 다른 기기에서 열면 새 닉네임을 정해야 해요.
- 브라우저 게임이라 작정하면 점수를 조작할 수 있어요. 규칙은 본인 문서만 쓰기, 값 범위, 최고 기록 악화 금지까지만 막아요. 팀 내 재미용 기준이에요.
