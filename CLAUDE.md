# 이 저장소에서 작업할 때

석사 연구용 프로토타입 저장소예요. AI 에이전트가 휴대폰 앱(택시 호출)을 대신 조작하는 상황을 실험해요.
- 연구1: `v2/` (택시 호출 원안, 낮은 자동화 B1 / 높은 자동화 B2). `v3/`는 송금 버전으로, 최종 실험에는 쓰지 않았어요.
- 연구2: `v4/` (연구1에서 도출한 가이드라인 25개를 반영한 개선안, 하나의 프로토타입). 개선 내용은 대부분 `v4/js/improve.js`와 `v4/css/style.css` 끝부분에 있어요.

시작 전에 꼭 읽기:
1. `research-tools/HANDOFF.md`: 지금까지 정한 디자인 결정과 이유, 진행 방식
2. `v4/guideline-log.md`: 가이드라인 25개별 적용 내용 기록 (수정할 때마다 함께 고쳐야 함)
3. `research-tools/README.md`: 캡처 스크립트와 정리 페이지 만드는 법

## 꼭 지킬 규칙

- 대답은 항상 한국말로 해요. 진행 상황을 짧게 알릴 때도 한국말.
- 가운데점(·)은 절대 쓰지 않아요. 나열은 쉼표나 '와/과'로.
- 꺾쇠(「」)는 쓰지 않아요. 버튼 이름 등은 작은따옴표로 써요. 예: '눌러서 대화 시작'
- 디자인이나 시나리오를 바꾸는 결정은 사용자와 하나씩 같이 정해요. 제안은 하되, 묻지 않고 먼저 바꾸지 않아요. 사용자가 정해 준 것만 반영해요.
- 바꾼 뒤에는 실제로 돌려서 캡처로 확인하고, 정리 페이지(아래)를 다시 만들어 올려요.
- 원안 `v2/`는 사용자가 요청할 때만 고쳐요.
- 작업 브랜치: `claude/inspiring-pascal-si7315`. 커밋 후 푸시해요. PR은 요청할 때만.

## 정리 페이지 (claude.ai 아티팩트)

- 연구1 프로토타입 화면 모음: https://claude.ai/artifact/4kzTYFFGogaAgBTie3D9n1
- 연구2 프로토타입 개선안 (원안 낮은 자동화 / 원안 높은 자동화 / 개선안 세 칸 비교): https://claude.ai/artifact/MwWcf4ipVnp1yKtyzyifXa
- 연구2 가이드라인 적용 (가이드라인 순서대로, 페이지에서 직접 문구 편집 가능): https://claude.ai/artifact/2D8aDKCXMapPx1JF9vnvCt
- 논문용 가이드라인과 구현 대응표 (현재 판과 이전 판 전환): https://claude.ai/artifact/XC5W9KEJy8r82BRjLk26ad (`research-tools/build_table.py`로 `paper-guideline-table.md`에서 만듦)

가이드라인 원문: FigJam '가이드라인 정리' (파일 키 bkwIjqwKSX6YknzhUVgewt, 노드 2130:1270) 2안. 연구1 어피니티는 FigJam 노드 86:730.
