// 호출한 뒤 되돌리기(호출 취소 성공)와 옵션 바꾸기(실패) 장면
import { createRequire } from "module";
import fs from "fs";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const SP = "/tmp/claude-0/-home-user-test/00da1e0a-459d-5465-910e-8f650899689b/scratchpad";
const OUT = `${SP}/shots/v4/after`;
fs.mkdirSync(OUT, { recursive: true });
const mode = process.argv[2] || "undo";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERR", e.message));
await p.route("**/cdnjs.cloudflare.com/ajax/libs/leaflet/**", (r) => r.fulfill({ path: `${SP}/node_modules/leaflet/dist/${r.request().url().endsWith(".css") ? "leaflet.css" : "leaflet.js"}` }));
await p.route("**/tile.openstreetmap.org/**", (r) => r.fulfill({ path: `${SP}/tile.png`, contentType: "image/png" }));
await p.route(/nominatim|project-osrm|generativelanguage/, (r) => r.abort());
await p.goto("http://localhost:8123/v4/", { waitUntil: "networkidle" });
await p.evaluate(() => { try { localStorage.clear(); } catch {} });
await p.reload({ waitUntil: "networkidle" });
await p.fill("#pname", "홍길동");
await p.check('input[name="cond"][value="B1"]');
if (mode === "s2") await p.check('input[name="session"][value="2"]');
await p.evaluate(() => { PACE = 0.4; });
await p.click("#btn-web"); await p.waitForTimeout(1500); await p.evaluate(() => document.querySelector(".perm-yes")?.click());
await p.evaluate(() => document.querySelector("#btn-task-close")?.click()); await p.waitForTimeout(600);
await p.click("#start-btn"); await p.click("#pick-text");
await p.fill("#msg", "신분당선 동천역에서 담소한정식 강남점까지 택시 불러줘");
await p.click("#send");
const st = () => p.evaluate(() => ({ step: S.steps[S.stepIdx]?.id, ask: Boolean(S.waiter?.options), post: Boolean(S.postCall), pin: Boolean(S.waiter?.pin || S.pinOpen), fin: S.finished }));
const tail = (n = 8) => p.evaluate((n) => [...document.querySelectorAll("#chat > .bubble")].slice(-n).map((b) => (b.classList.contains("user") ? "U: " : "A: ") + b.textContent).join("\n"), n);
for (let t = 0; t < 400; t++) {
  await p.waitForTimeout(400);
  const s = await st();
  if (s.post && !s.ask && await p.evaluate(() => Boolean(S.waiter))) break;
  if (mode === "s2" && s.step === "reserve" && s.ask) break;
  if (s.pin) { for (const k of "1234") { await p.evaluate((k) => { try { pinPress(k); } catch {} }, k); await p.waitForTimeout(150); } continue; }
  if (s.ask) await p.evaluate(() => { const o = S.waiter.options.find((x) => x.id === "approve") || S.waiter.options[0]; S.waiter.onPick(o); });
  if (t === 399) throw new Error("timeout " + JSON.stringify(s));
}
await p.waitForTimeout(1500);
console.log(await tail(4));
console.log("links:", await p.evaluate(() => [...document.querySelectorAll(".undo-link")].map((b) => b.previousElementSibling.textContent)));
await p.screenshot({ path: `${OUT}/${mode}-1.png` });
async function waitFor(fn, ms = 30000) { for (let t = 0; t < ms / 200; t++) { if (await p.evaluate(fn)) return; await p.waitForTimeout(200); } throw new Error("waitFor timeout " + fn); }
if (mode === "undo") {
  await p.click(".undo-link");
  await waitFor(() => S.afterCancel && S.waiter && document.querySelector("#rc-choices .choice"));
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/undo-2.png` });
  await p.click("#rc-choices .choice:nth-child(3)"); // 택시 종류
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/undo-3.png` });
  await p.click("#rc-choices .choice:nth-child(2)"); // 모범택시
  await waitFor(() => S.steps[S.stepIdx]?.id === "final" && S.waiter?.options);
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/undo-4.png` });
} else if (mode === "s2") {
  console.log(await p.evaluate(() => { const b = [...document.querySelectorAll("#chat > .bubble")].slice(-4).map((x) => [x.className, x.dataset.step, x.textContent.slice(0, 20)]); return JSON.stringify({ b, idx: S.stepIdx, rd: S.rideDone, res: S.form.reserved, run: S.running, fin: S.finished, up: S.undoPending, ac: afterCall(), ldb: lastDoneBubble()?.textContent }); }));
  await p.click(".undo-link");
  await waitFor(() => S.afterCancel && S.waiter && document.querySelector("#rc-choices .choice"));
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/s2-2.png` });
  await p.click("#rc-choices .choice:nth-child(3)");
  await p.waitForTimeout(800);
  await p.click("#rc-choices .choice:nth-child(2)");
  await waitFor(() => S.steps[S.stepIdx]?.id === "final" && S.waiter?.options);
  await p.evaluate(() => { const o = S.waiter.options.find((x) => x.id === "approve"); S.waiter.onPick(o); });
  for (let t = 0; t < 200; t++) { await p.waitForTimeout(300); const s = await st(); if (s.pin) { for (const k of "1234") { await p.evaluate((k) => { try { pinPress(k); } catch {} }, k); await p.waitForTimeout(150); } } if (s.step === "reserve" && s.ask) break; }
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `${OUT}/s2-3.png` });
} else if (mode === "back") {
  await p.evaluate(() => history.back()); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/back-1.png` });
  await p.click(".bd-undo");
  await waitFor(() => document.querySelector(".toast"));
  await p.evaluate(() => showRun(true)); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/back-2.png` });
  await waitFor(() => S.afterCancel && S.waiter && document.querySelector("#rc-choices .choice"));
} else {
  await p.fill("#msg", "기사님 요청사항 조용히 가고 싶어요로 바꿔줘");
  await p.click("#send");
  await waitFor(() => document.querySelector(".toast"));
  await p.evaluate(() => showRun(true)); await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/change-2.png` });
  await waitFor(() => S.waiter?.options);
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `${OUT}/change-3.png` });
  await p.evaluate(() => { const o = S.waiter.options.find((x) => x.id === "approve"); S.waiter.onPick(o); });
  await waitFor(() => S.steps[S.stepIdx]?.id === "final" && S.waiter?.options, 40000);
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/change-4.png` });
}
console.log("----\n" + await tail(10));
console.log(JSON.stringify(await p.evaluate(() => ({ form: S.form, view: S.phone.taxiView, sheet: S.phone.sheet }))));
await b.close();
