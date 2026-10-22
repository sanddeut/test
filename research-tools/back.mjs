// 뒤로 가기 다이얼로그 화면 찍기: 목적지 설정 단계에서 휴대폰 뒤로 가기
import { createRequire } from "module";
import fs from "fs";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const SP = "/tmp/claude-0/-home-user-test/00da1e0a-459d-5465-910e-8f650899689b/scratchpad";
const OUT = `${SP}/shots/v4/back`;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
const p = await ctx.newPage();
await p.route("**/cdnjs.cloudflare.com/ajax/libs/leaflet/**", (r) => r.fulfill({ path: `${SP}/node_modules/leaflet/dist/${r.request().url().endsWith(".css") ? "leaflet.css" : "leaflet.js"}` }));
await p.route("**/tile.openstreetmap.org/**", (r) => r.fulfill({ path: `${SP}/tile.png`, contentType: "image/png" }));
await p.route(/nominatim|project-osrm|generativelanguage/, (r) => r.abort());
await p.goto("http://localhost:8123/v4/", { waitUntil: "networkidle" });
await p.evaluate(() => { try { localStorage.clear(); } catch {} });
await p.reload({ waitUntil: "networkidle" });
await p.fill("#pname", "홍길동");
await p.check('input[name="cond"][value="B1"]');
await p.evaluate(() => { PACE = 0.5; });
await p.click("#btn-web"); await p.waitForTimeout(1500); await p.evaluate(() => document.querySelector(".perm-yes")?.click());
await p.evaluate(() => document.querySelector("#btn-task-close")?.click()); await p.waitForTimeout(600);
await p.click("#start-btn"); await p.click("#pick-text");
await p.fill("#msg", "신분당선 동천역에서 담소한정식 강남점까지 택시 불러줘");
await p.click("#send");
// 목적지 설정 질문이 뜰 때까지 승인
for (let t = 0; t < 240; t++) {
  await p.waitForTimeout(500);
  const st = await p.evaluate(() => ({ step: S.steps[S.stepIdx]?.id, ask: Boolean(S.waiter?.options) }));
  if (st.step === "dest" && st.ask) break;
  if (st.ask) await p.evaluate(() => { const o = S.waiter.options.find((x) => x.id === "approve"); if (o) S.waiter.onPick(o); });
}
await p.waitForTimeout(1500);
await p.evaluate(() => history.back());
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/bk-chat.png` });
await p.click(".bd-quit");
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/bq-chat.png` });
fs.writeFileSync(`${OUT}/shots.json`, JSON.stringify({ shots: [
  { id: "bk", kind: "back", step: "dest", label: "뒤로 가기", text: "", options: [], chat: "bk-chat.png", run: null },
  { id: "bq", kind: "back", step: "dest", label: "앱 종료 확인", text: "", options: [], chat: "bq-chat.png", run: null }] }));
await b.close();
console.log("ok");
