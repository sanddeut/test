// 뒤로 가기 다이얼로그 화면 찍기: 목적지 설정 단계에서 휴대폰 뒤로 가기
import { createRequire } from "module";
import fs from "fs";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const SP = "/tmp/claude-0/-home-user-test/00da1e0a-459d-5465-910e-8f650899689b/scratchpad";
const OUT = `${SP}/shots/v4/queue`;
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


const st = () => p.evaluate(() => ({ step: S.steps[S.stepIdx]?.id, ask: Boolean(S.waiter?.options), text: S.waiter && !S.waiter.options, form: { ...S.form }, picks: [...document.querySelectorAll("#rc-choices .choice b")].map((b) => b.textContent), opts: S.waiter?.options?.map((o) => o.label) }));
async function approveUntil(id) {
  for (let t = 0; t < 300; t++) {
    await p.waitForTimeout(400);
    const s = await st();
    if (s.step === id && (s.ask || s.text)) return s;
    if (s.ask) await p.evaluate(() => { const o = S.waiter.options.find((x) => x.id === "approve") || S.waiter.options[0]; S.waiter.onPick(o); });
  }
  throw new Error("timeout " + id);
}
for (let t = 0; t < 200; t++) {
  await p.waitForTimeout(150);
  const a = await p.evaluate(() => ({ acting: document.querySelector(".phone").classList.contains("acting"), step: S.steps[S.stepIdx]?.id, low: S.automation }));
  if (a.acting && a.low === "low" && a.step === "dest") break;
  if (await p.evaluate(() => S.waiter?.options?.some((o) => o.id === "approve"))) await p.evaluate(() => S.waiter.onPick(S.waiter.options.find((o) => o.id === "approve")));
}
await p.fill("#msg", "모범택시로 해줘"); await p.press("#msg", "Enter");
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/q1.png` });
for (let t = 0; t < 60; t++) { await p.waitForTimeout(300); if (await p.evaluate(() => !S.queuedText)) break; }
await p.waitForTimeout(6000); console.log(JSON.stringify(await p.evaluate(() => ({ step: S.steps[S.stepIdx]?.id, paused: S.paused, waiter: !!S.waiter, q: S.queuedText, form: S.form }))));
await p.screenshot({ path: `${OUT}/q2.png` });
const tail = await p.evaluate(() => [...document.querySelectorAll("#chat > .bubble")].slice(-6).map((b) => (b.classList.contains("user") ? "U: " : "A: ") + b.textContent));
console.log(tail.join("\n"));
await b.close();
