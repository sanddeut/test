// 주석 그림 합치기: 장면 캡처를 나란히 놓고 아래에 번호별 가이드라인과 설명
import { createRequire } from "module";
import fs from "fs";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const SP = "/tmp/claude-0/-home-user-test/00da1e0a-459d-5465-910e-8f650899689b/scratchpad";
const IN = `${SP}/shots/fig`;
const OUT = process.argv[2] || `${SP}/figures`;
fs.mkdirSync(OUT, { recursive: true });
const FIGS = [
  { id: "fig1", title: "그림 1. 대화 시작", panels: [["f1a", "(a) 권한 다이얼로그"], ["f1b", "(b) 대화 시작 방법"]], notes: [
    [1, "21", "대화를 시작할 때 AI가 무엇에 접근해도 되는지 먼저 물음"],
    [2, "21, 22", "항목마다 무엇에 쓰는지 한 줄로 알리고, 하나씩 켜고 끌 수 있음"],
    [3, "1", "첫 AI 말풍선 안에 대화를 시작하는 방법을 안내함"],
    [4, "1", "'눌러서 대화 시작'을 누르면 '말로 하기'와 '글로 하기' 중 고름"],
  ] },
  { id: "fig2", title: "그림 2. 진행 카드", panels: [["f2a", "(a) 목록으로 물을 때"], ["f2b", "(b) 최종 호출 확인"]], notes: [
    [1, "7, 24", "버튼으로 답한 말풍선에 무엇에 답했는지 작은 글씨로 함께 남김"],
    [2, "15", "이미 끝낸 단계의 답 아래 '되돌리기'"],
    [3, "8, 10", "현재 단계를 항상 맨 위에 두고, 질문 문장을 굵게 보여 줌"],
    [4, "20, 24", "선호가 필요한 결정은 AI가 고르지 않고 목록으로 먼저 물음. 누를 수 있는 항목에만 ›"],
    [5, "10", "호출 내용은 카드 안의 작은 카드로 보조 정보처럼 보여 줌"],
    [6, "17, 19", "질문의 무게에 맞춘 버튼 이름. '수정'을 누르면 고를 수 있는 선택지 목록이 나옴"],
    [7, "13", "언제든 직접 조작으로 넘어갈 수 있는 '직접 조작하기'"],
  ] },
  { id: "fig3", title: "그림 3. AI가 일할 때", panels: [["f3a", "(a) 대화창"], ["f3b", "(b) 실행화면"]], notes: [
    [1, "6, 9", "기다려야 할 때는 움직이는 점과 'AI가 앱 조작 중'만 보여 줌"],
    [2, "10", "실행화면은 원할 때만 '실행화면 보기'로 열어 봄"],
    [3, "12", "AI가 작업 중일 때는 보내기 자리에 '멈추기'"],
    [4, "6, 23", "'AI가 앱 조작 중' 칩"],
    [5, "4, 6, 23, 24", "움직이는 테두리와 반투명 덮개로, AI가 조작하는 실시간 화면이며 누를 수 없음을 알림"],
    [6, "12", "'멈추기'"],
    [7, "13", "'내가 조작하기'"],
    [8, "12, 23", "'?'를 누르면 실행화면과 각 버튼을 차례로 짚어 설명함"],
  ] },
  { id: "fig4", title: "그림 4. 되돌리기와 익숙한 통제", panels: [["f4a", "(a) 뒤로 가기"], ["f4b", "(b) 호출한 뒤"], ["f4c", "(c) 호출을 취소한 뒤"]], notes: [
    [1, "25", "휴대폰 뒤로 가기를 누르면 진행을 멈추고 다음 행동을 고름"],
    [2, "16", "'방금 한 일 취소'로 바로 전에 끝낸 단계를 되돌림"],
    [3, "16", "호출한 뒤에도 완료 안내 아래 '되돌리기'를 남김"],
    [4, "3, 16", "AI가 앱에서 호출 취소를 해 본 뒤 결과를 알림"],
    [5, "17", "어디부터 다시 할지 선택지 목록으로 고름"],
  ] },
];
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const b = await chromium.launch();
const p = await (await b.newContext({ deviceScaleFactor: 2, viewport: { width: 1000, height: 800 } })).newPage();
for (const f of FIGS) {
  const imgs = f.panels.map(([n, cap]) => `<figure><img src="data:image/png;base64,${fs.readFileSync(`${IN}/${n}.png`).toString("base64")}"><figcaption>${esc(cap)}</figcaption></figure>`).join("");
  const notes = f.notes.map(([n, g, t]) => `<li><span class="n">${n}</span><span class="g">가이드라인 ${g}</span><span class="t">${esc(t)}</span></li>`).join("");
  const W = f.panels.length * 300 + (f.panels.length - 1) * 24 + 64;
  await p.setViewportSize({ width: W, height: 800 });
  await p.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#fff;font-family:"Noto Sans KR","Noto Sans CJK KR",system-ui,sans-serif;color:#1d1f23}
    .wrap{padding:28px 32px 30px;width:max-content}
    h1{font-size:19px;font-weight:700;margin:0 0 18px;letter-spacing:-0.3px}
    .row{display:flex;gap:24px}
    figure{margin:0;width:300px}
    img{width:300px;display:block;border:1px solid #d9dce1;border-radius:14px}
    figcaption{font-size:14px;color:#4a4f57;text-align:center;margin-top:8px}
    ul{list-style:none;padding:0;margin:22px 0 0;display:grid;gap:8px;max-width:${W - 64}px}
    li{display:flex;align-items:baseline;gap:10px;font-size:14px;line-height:1.45}
    .n{flex:none;width:22px;height:22px;border-radius:11px;background:#F26B1D;color:#fff;font-weight:700;font-size:12px;line-height:22px;text-align:center;transform:translateY(5px)}
    .g{flex:none;min-width:118px;font-weight:700;color:#C24E0C}
    .t{color:#2b2e33}
  </style><div class="wrap"><h1>${esc(f.title)}</h1><div class="row">${imgs}</div><ul>${notes}</ul></div>`);
  await p.waitForTimeout(200);
  await p.locator(".wrap").screenshot({ path: `${OUT}/${f.id}.png` });
  console.log(f.id);
}
await b.close();
