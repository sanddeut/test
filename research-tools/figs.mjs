// 논문용 주석 그림: 장면마다 요소에 번호를 달아 찍음 (번호와 가이드라인 대응은 figs.json)
import { createRequire } from "module";
import fs from "fs";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");
const SP = "/tmp/claude-0/-home-user-test/00da1e0a-459d-5465-910e-8f650899689b/scratchpad";
const OUT = `${SP}/shots/fig`;
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
await p.evaluate(() => { PACE = 0.5; });

// marks: [selector, 번호, 상자 여백]
const RECTS = {}; // 피그마에서 다시 그릴 수 있게 장면마다 번호 상자 위치(CSS px, 화면 390x780)를 남김
async function shot(name, marks) {
  await p.screenshot({ path: `${OUT}/${name}-clean.png` }); // 번호 없는 원본
  const [miss, boxes] = await p.evaluate((marks) => {
    document.querySelector("#fig-ov")?.remove();
    const ov = document.createElement("div");
    ov.id = "fig-ov";
    ov.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    const miss = [], boxes = [];
    for (const [sel, n, pad = 4] of marks) {
      const uni = sel.startsWith("union:"); // 여러 요소를 한 상자로 묶어 표시
      const all = [...document.querySelectorAll(uni ? sel.slice(6) : sel)].filter((e) => e.getClientRects().length);
      const el = all.at(-1);
      if (!el) { miss.push(sel); continue; }
      const rs = (uni ? all : [el]).map((e) => e.getBoundingClientRect());
      const r = { left: Math.min(...rs.map((x) => x.left)), top: Math.min(...rs.map((x) => x.top)), right: Math.max(...rs.map((x) => x.right)), bottom: Math.max(...rs.map((x) => x.bottom)) };
      const box = document.createElement("div");
      const L = Math.max(2, r.left - pad), T = Math.max(2, r.top - pad);
      const W = Math.min(innerWidth - 2, r.right + pad) - L, H = Math.min(innerHeight - 2, r.bottom + pad) - T;
      box.style.cssText = `position:absolute;left:${L}px;top:${T}px;width:${W}px;height:${H}px;border:2px solid #F26B1D;border-radius:10px;box-sizing:border-box`;
      const badge = document.createElement("div");
      badge.textContent = n;
      const bx = Math.min(Math.max(2, L - 11), innerWidth - 26), by = Math.min(Math.max(2, T - 11), innerHeight - 26);
      badge.style.cssText = `position:absolute;left:${bx}px;top:${by}px;width:24px;height:24px;border-radius:12px;background:#F26B1D;color:#fff;font:700 13px/24px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff`;
      ov.append(box, badge);
      boxes.push({ n, x: L, y: T, w: W, h: H });
    }
    document.body.appendChild(ov);
    return [miss, boxes];
  }, marks);
  RECTS[name] = boxes;
  fs.writeFileSync(`${OUT}/rects.json`, JSON.stringify(RECTS, null, 1));
  if (miss.length) console.log("MISSING", name, miss);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await p.evaluate(() => document.querySelector("#fig-ov")?.remove());
  console.log("shot", name);
}
const st = () => p.evaluate(() => ({ step: S.steps[S.stepIdx]?.id, ask: Boolean(S.waiter?.options), pin: Boolean(S.waiter?.pin || S.pinOpen), post: Boolean(S.postCall), acting: document.querySelector(".phone").classList.contains("acting") }));
async function waitFor(fn, ms = 60000) { for (let t = 0; t < ms / 150; t++) { if (await p.evaluate(fn)) return; await p.waitForTimeout(150); } throw new Error("timeout " + fn); }
// 실제 버튼을 눌러 답함 (말풍선에 '확인' 등 실제 이름이 남도록)
const approve = () => p.evaluate(() => {
  const bs = [...document.querySelectorAll("#rc-choices button, #chips button, #pv-chips button")].filter((x) => x.getClientRects().length && !x.disabled);
  const b = bs.find((x) => /^(확인|호출하기|허용|예약하기)$/.test(x.textContent.trim())) || bs.find((x) => x.classList.contains("choice")) || bs.at(-1);
  if (b) b.click(); else { const o = S.waiter.options.find((x) => x.id === "approve") || S.waiter.options[0]; S.waiter.onPick(o); }
});

// 그림 1: 시작
await p.click("#btn-web");
await waitFor(() => document.querySelector(".perm-card"));
await p.evaluate(() => document.querySelector("#btn-task-close")?.click());
await p.waitForTimeout(1000);
await shot("f1a", [["#perm-title", 1], [".perm-card ul", 2]]);
await p.evaluate(() => document.querySelector(".perm-yes")?.click());
await p.evaluate(() => document.querySelector("#btn-task-close")?.click()); await p.waitForTimeout(800);
await p.click("#start-btn"); await p.waitForTimeout(800);
await shot("f1b", [[".guide-box", 3], [":has(> #pick-voice)", 4]]);
await p.click("#pick-text");
await p.fill("#msg", "신분당선 동천역에서 담소한정식 강남점까지 택시 불러줘");
await p.click("#send");

// 그림 3: AI가 일할 때 (첫 화면 조작 중)
await waitFor(() => document.querySelector("#run-card.working") && document.querySelector(".phone").classList.contains("acting") && S.phone.app === "taxi");
await p.waitForTimeout(300);
await shot("f3a", [["#rc-status", 1], ["#rc-open", 2], ["#send", 3]]);

// 그림 2: 진행 카드 (택시 종류 목록, 최종 호출 확인), 그림 4: 뒤로 가기
let did = {};
for (let t = 0; t < 600; t++) {
  await p.waitForTimeout(300);
  const s = await st();
  if (s.pin) { for (const k of "1234") { await p.evaluate((k) => { try { pinPress(k); } catch {} }, k); await p.waitForTimeout(150); } continue; }
  if (s.post) break;
  if (s.step === "car" && s.acting && !did.run) {
    did.run = 1;
    await p.evaluate(() => showRun(true)); await p.waitForTimeout(1300);
    await shot("f3b", [[".ai-live-chip", 4, 2], [".screen-clip", 5, 6], ["#btn-stop", 6], ["#btn-manual", 7], ["#btn-help", 8]]);
    await p.evaluate(() => showRun(false));
  }
  if (!s.ask) continue;
  if (s.step === "car" && !did.car) {
    did.car = 1; await p.waitForTimeout(1200);
    await p.evaluate(() => { const c = chat(); for (let e = c; e; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 4) { e.scrollBy(0, -70); break; } }); await p.waitForTimeout(500);
    await shot("f2a", [[".bubble.user:has(.ub-what)", 1], [".undo-link", 2, 2], ["#rc-q", 3], ["#rc-choices .choice-list, #rc-choices", 4]]);
  }
  if (s.step === "final" && !did.final) {
    did.final = 1; await p.waitForTimeout(1200);
    await shot("f2b", [[".rc-summary", 5], ["union:#rc-choices .chip:not(.choice)", 6], ["#rc-manual", 7]]);
    await p.evaluate(() => history.back()); await p.waitForTimeout(900);
    await shot("f4a", [[".bd-card", 1, 6], [".bd-undo", 2, 2]]);
    await p.click(".bd-go"); await p.waitForTimeout(1500);
    await waitFor(() => S.waiter?.options);
  }
  await approve();
  await p.waitForTimeout(600);
}
await waitFor(() => S.postCall && S.waiter);
await p.waitForTimeout(1500);
await shot("f4b", [[".undo-link", 3, 2]]);
await p.click(".undo-link");
await waitFor(() => S.afterCancel && S.waiter && document.querySelector("#rc-choices .choice"));
await p.waitForTimeout(1000);
await shot("f4c", [["#rc-q", 4], ["#rc-choices", 5]]);
await b.close();
