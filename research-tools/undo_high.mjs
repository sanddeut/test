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
await p.check('input[name="cond"][value="B2"]');
await p.evaluate(() => { PACE = 0.5; });
await p.click("#btn-web"); await p.waitForTimeout(1500); await p.evaluate(() => document.querySelector(".perm-yes")?.click());
await p.evaluate(() => document.querySelector("#btn-task-close")?.click()); await p.waitForTimeout(600);
await p.click("#start-btn"); await p.click("#pick-text");
await p.fill("#msg", "신분당선 동천역에서 담소한정식 강남점까지 택시 불러줘");
await p.click("#send");


for (let t = 0; t < 200; t++) { await p.waitForTimeout(300); if (await p.evaluate(() => S.stepIdx >= 3)) break; }
const before = await p.evaluate(() => ({ step: S.steps[S.stepIdx].id, form: { ...S.form } }));
console.log("before", JSON.stringify(before));
await p.evaluate(() => history.back()); await p.waitForTimeout(800);
await p.click(".bd-undo");
for (let t = 0; t < 100; t++) { await p.waitForTimeout(300); const s = await p.evaluate(() => ({ step: S.steps[S.stepIdx]?.id, ask: Boolean(S.waiter?.options), form: { ...S.form } })); if (s.ask) { console.log("after", JSON.stringify(s)); break; } }
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/h1-chat.png` });
const tail = await p.evaluate(() => [...document.querySelectorAll("#chat > .bubble")].slice(-3).map((b) => (b.classList.contains("user") ? "U: " : "A: ") + b.textContent));
console.log(tail.join("\n"));
await b.close();
