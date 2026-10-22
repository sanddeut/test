# 연구 화면 캡처와 정리 페이지 작업 파일

택시 호출 프로토타입(원안 `v2/`, 개선안 `v4/`)의 화면을 자동으로 캡처하고, 정리 페이지를 만드는 데 쓴 스크립트와 결과물이에요.

## 정리 페이지 (pages/)

| 폴더 | 페이지 | 링크 |
|---|---|---|
| 연구1_화면모음 | 연구1 프로토타입 화면 모음 (원안) | https://claude.ai/artifact/4kzTYFFGogaAgBTie3D9n1 |
| 연구2_개선안_비교 | 원안 낮은 자동화 / 원안 높은 자동화 / 개선안 비교 | https://claude.ai/artifact/MwWcf4ipVnp1yKtyzyifXa |
| 연구2_가이드라인_적용 | 가이드라인 25개 순서대로 적용 내용 정리 | https://claude.ai/artifact/2D8aDKCXMapPx1JF9vnvCt , 노션: https://app.notion.com/p/401f12e24fd681858b1fd408acb365e3 |

각 폴더의 `index.html`과 `img/`가 올린 페이지와 같아요. `연구2_가이드라인_적용/페이지에서_고친_문구/`는 페이지의 '문구 편집'으로 고친 내용을 내려받은 것이에요(이미 `build_guides.py`에 반영함).

## 캡처 (Playwright)

- `drive.mjs`: 시나리오 한 번을 끝까지 진행하며 단계마다 대화창과 실행화면을 찍음. 예: `node drive.mjs v4 B1 1 B1s1 "" approve`
- `back.mjs`, `manual.mjs`, `coach.mjs`, `perm.mjs`, `undo.mjs`, `t17.mjs`, `queue.mjs`: 뒤로 가기, 내가 조작하기, '?' 안내, 권한 다이얼로그, 되돌리기, 수정 후 추천 선택지, 진행 중 요청 장면을 따로 찍음
- `aftercall.mjs [undo|change|back|s2]`: 호출한 뒤 되돌리기(호출 취소), 호출 뒤 옵션 변경 실패, 뒤로 가기로 취소, 세션2 예약 중 되돌리기 장면 (shots/v4/after)
- 실행 전: 저장소 루트에서 `python3 -m http.server 8123`, `npm install` (leaflet)
- `.mjs` 파일 안의 `SP` 경로(작업 폴더)는 쓰는 위치에 맞게 바꿔야 해요. 캡처는 `SP/shots/<버전>/<이름>/`에 저장돼요.

## 페이지 만들기

- `build.py` + `curate.py` + `template.html`: 연구1 화면 모음
- `build3.py` + `template2.html`: 연구2 세 칸 비교 페이지
- `build_guides.py` + `guides_tpl.html`: 연구2 가이드라인 적용 페이지 (내용은 `v4/guideline-log.md`의 가이드라인 문장과 `build_guides.py`의 항목별 설명)
- `build_notion.py`: 올린 가이드라인 적용 페이지(`pages/연구2_가이드라인_적용/index.html`)를 노션용 마크다운(`notion.md`)으로 바꿈. 범주는 제목2, 소제목은 제목3, 가이드라인은 토글, 항목은 원안 → 개선안 캡처와 설명 불릿을 열로. 캡처는 깃허브 raw 주소. 페이지에서 고친 문구는 db를 내려받은 폴더를 인자로 주면 덮어씀
- `recent.json`: 비교 페이지에서 붉은 테두리로 표시할 캡처
- `ideas.md`: 중간에 메모해 둔 아이디어
