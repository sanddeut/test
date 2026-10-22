// 뒤로 가기 다이얼로그 화면 찍기: 목적지 설정 단계에서 휴대폰 뒤로 가기
import { createRequire } from "module";
import fs from "fs";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const SP = "/tmp/claude-0/-home-user-test/00da1e0a-459d-5465-910e-8f650899689b/scratchpad";
const OUT = `${SP}/shots/v4/undo`;
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

const st = () => p.evaluate(() => ({ step: S.steps[S.stepIdx]?.id, ask: Boolean(S.waiter?.options), form: { ...S.form }, view: S.phone.taxiView }));
async function approveUntil(id) {
  for (let t = 0; t < 300; t++) {
    await p.waitForTimeout(400);
    const s = await st();
    if (s.step === id && s.ask) return s;
    if (s.ask) await p.evaluate(() => { const o = S.waiter.options.find((x) => x.id === "approve") || S.waiter.options[0]; S.waiter.onPick(o); });
  }
  throw new Error("timeout " + id);
}
// 출발지까지 승인 → 목적지 질문에서 되돌리기 상태 확인
const a = await approveUntil("car");
console.log("at car", JSON.stringify(a));
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/u1-chat.png` });
const has = await p.evaluate(() => [...document.querySelectorAll(".undo-link")].map((b) => b.previousElementSibling.textContent));
console.log("undo link on:", has);
await p.screenshot({ path: `${OUT}/u0-chat.png` }); await p.click(".undo-link");
for (let t = 0; t < 60; t++) { await p.waitForTimeout(300); const s = await st(); if (s.ask && s.step !== "car") { console.log("after undo", JSON.stringify(s)); break; } }
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/u2-chat.png` });
// 뒤로 가기 → 방금 한 일 취소
const b2 = await approveUntil("car");
await p.evaluate(() => history.back()); await p.waitForTimeout(800);
await p.click(".bd-undo");
for (let t = 0; t < 60; t++) { await p.waitForTimeout(300); const s = await st(); if (s.ask && s.step !== "car") { console.log("after back undo", JSON.stringify(s)); break; } }
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/u3-chat.png` });
const tail = await p.evaluate(() => [...document.querySelectorAll("#chat > .bubble")].slice(-5).map((b) => (b.classList.contains("user") ? "U: " : "A: ") + b.textContent));
console.log(tail.join("\n"));
await b.close();
