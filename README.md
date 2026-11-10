# 0.111cm 챌린지

초코 스틱이 줄어드는 동안 딱 **0.111cm** 남았을 때 멈추는 타이밍 게임. 닉네임만으로 참여하고 팀 순위로 겨뤄요.

## 기능

- **기본 게임**: 화면 전체에 스틱 하나. 5cm에서 시작해 참고 영상과 같은 속도 곡선(길이가 짧을수록 빨라져서 마지막엔 초당 약 4cm)으로 줄어들어요. 한 판은 약 1.4초. 화면을 탭하면 시작하고, 다시 탭하면 멈춰요.
- **스틱 선택**: 기본, 아몬드(난이도 중, 1.2배 속도), 쿠키(난이도 상, 1.45배 속도에 속도가 들쭉날쭉). 순위는 스틱별로 따로 매겨요.
- **변칙 스틱**: 40% 확률로 급가속, 멈칫, 출렁 중 하나가 섞여 나와요.
- **팀 순위**: 0.111cm와의 오차 기준 1인 최고 기록 실시간 순위, 최근 플레이. 끝까지 다 먹은 판(0.000cm)은 플레이 수에만 들어가요.
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
js/sim.js           게임 규칙, 스틱 시뮬레이션 (DOM 없음)
js/render.js        캔버스: 스틱 화면, 결과 카드
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
| `scores_normal`, `scores_almond`, `scores_cookie` | uid | `best`(오차), `bestLen`, `bestAt`, `tries`, `lastLen`, `lastAt` |

## 알아둘 점

- 닉네임은 처음 등록한 브라우저에 묶여요. 브라우저 데이터를 지우거나 다른 기기에서 열면 새 닉네임을 정해야 해요.
- 브라우저 게임이라 작정하면 점수를 조작할 수 있어요. 규칙은 본인 문서만 쓰기, 값 범위, 최고 기록 악화 금지까지만 막아요. 팀 내 재미용 기준이에요.
