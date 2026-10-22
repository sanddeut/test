// 프로토타입을 자동으로 진행시키며 단계별 스크린샷을 찍음
// usage: node drive.mjs <ver> <cond> <session> <runName> [captureFrom] [plan]
import { createRequire } from "module";
import fs from "fs";
const require = createRequire("/opt/node-tools/node_modules/");
const { chromium } = require("playwright");

const SP = "/tmp/claude-0/-home-user-test/00da1e0a-459d-5465-910e-8f650899689b/scratchpad";
const [ver, cond, session, runName, captureFrom = "", plan = "approve"] = process.argv.slice(2);
const OUT = `${SP}/shots/${ver}/${runName}`;
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.route("**/cdnjs.cloudflare.com/ajax/libs/leaflet/**", (r) => {
  const f = r.request().url().endsWith(".css") ? "leaflet.css" : "leaflet.js";
  r.fulfill({ path: `${SP}/node_modules/leaflet/dist/${f}` });
});
await page.route("**/tile.openstreetmap.org/**", (r) => r.fulfill({ path: `${SP}/tile.png`, contentType: "image/png" }));
await page.route(/nominatim|project-osrm|generativelanguage/, (r) => r.abort());

const shots = [];
let n = 0;
let capturing = captureFrom === "";
let lastKind = null;
let busy = Promise.resolve();

const st = () => page.evaluate(() => ({
  step: S.steps[S.stepIdx]?.id || "request",
  label: S.steps[S.stepIdx]?.label || "",
  view: wantedView(),
  app: S.phone.app,
  running: S.running && !S.finished,
  paused: S.paused,
}));

async function snap(kind, info) {
  const s = await st();
  if (!capturing && captureFrom && s.step === captureFrom) capturing = true;
  if (!capturing) return null;
  // 낮은 자동화: 문구 바로 뒤에 질문이 오면 문구만 찍은 화면은 질문 화면으로 대체
  if (kind !== "say" && lastKind === "say" && shots.length && shots.at(-1).step === s.step) {
    const prev = shots.pop();
    for (const f of [prev.chat, prev.run]) if (f) fs.rmSync(`${OUT}/${f}`, { force: true });
  }
  await wait(500);
  // 앱이 스스로 실행화면으로 바꾼 상태면 대화창으로 돌려서 찍고, 실행화면은 아래에서 따로 찍음
  const wasRun = await page.evaluate(() => S.showRun && wantedView() === "progress");
  if (wasRun) { await page.evaluate(() => { S.showRun = false; syncView(); }); await wait(1600); }
  const id = String(++n).padStart(2, "0");
  const chat = `${id}-chat.png`;
  await page.screenshot({ path: `${OUT}/${chat}` });
  let scroll = null;
  if ((process.env.SCROLL_IDS || "").split(",").includes(id)) {
    await page.evaluate(() => { const c = document.querySelector("#chat"); c.dataset.keep = c.scrollTop; c.scrollTop = Math.max(0, c.scrollTop - c.clientHeight * 0.5); });
    await wait(700);
    scroll = `${id}-scroll.png`;
    await page.screenshot({ path: `${OUT}/${scroll}` });
    await page.evaluate(() => { const c = document.querySelector("#chat"); c.scrollTop = +c.dataset.keep; });
    await wait(400);
  }
  let run = null;
  const canRun = await page.evaluate(() => S.running && !S.finished && S.phone.app !== "home" && wantedView() === "chat" && !S.stopped && !S.ivWaiter);
  if (canRun && kind !== "pin") {
    await page.evaluate(() => { S.showRun = true; syncView(); });
    await wait(1700);
    if ((await page.evaluate(() => wantedView())) === "progress") {
      run = `${id}-run.png`;
      await page.screenshot({ path: `${OUT}/${run}` });
    }
    if (!wasRun) { await page.evaluate(() => { S.showRun = false; syncView(); }); await wait(1600); }
  }
  const rec = { id, kind, step: s.step, label: s.label, text: info?.text || "", options: info?.labels || [], chat, run, scroll };
  shots.push(rec);
  lastKind = kind;
  console.log(id, kind, s.step, (info?.text || info?.labels?.join("/") || "").slice(0, 70));
  return rec;
}

async function clickLabel(label) {
  await page.evaluate((label) => {
    const bs = [...document.querySelectorAll("#chips button, #rc-choices button, #pv-chips button, .run-card button")].filter((b) => b.offsetParent && !b.disabled);
    const alt = { 승인: ["확인", "호출하기", "허용", "예약하기"], 거부: ["수정", "거부"] }[label] || [];
    const b = bs.find((x) => x.textContent.trim() === label) || bs.find((x) => x.textContent.includes(label)) || bs.find((x) => alt.includes(x.textContent.trim()));
    if (!b) throw new Error("no button " + label + " in " + bs.map((x) => x.textContent.trim()).join("|"));
    b.click();
  }, label);
}

// 계획: 어떤 상황에서 무엇을 누를지
const PLANS = {
  approve: () => null,
  pickQuiet: (k, info, s) => (k === "ask" && info.ids.includes("quiet") ? "조용히 가주세요" : null),
  rejectReserve: (k, info, s) => (k === "ask" && s.step === "reserve" && info.ids.includes("reject") ? "거부" : null),
  // 세션1 낮은 자동화: 요청사항 거부 → 조용히 가주세요
  rejectRequest: (k, info, s) => (k === "ask" && s.step === "request" && info.ids.includes("reject") ? "거부" : k === "ask" && s.step === "request" && info.labels.includes("조용히 가주세요") ? "조용히 가주세요" : null),
};
const STOPPED = new Set();
async function decide(kind, info) {
  const s = await st();
  if (plan === "stopAtError" && kind === "say" && /^error_/.test(info.stepKind || "") && !STOPPED.has(s.step) && !s.paused) {
    STOPPED.add(s.step);
    return { stop: true };
  }
  if (kind === "say" && /어떤 질문의 답을 바꿀까요/.test(info.text)) return { type: "1번은 예로 바꿔줘" };
  if (plan === "stopAtError" && kind === "chips" && s.paused && ver === "v3" && !STOPPED.has("typed")) { STOPPED.add("typed"); return { type: "1번은 예로 바꿔줘" }; }
  if (plan === "rejectFraud" && kind === "ask" && s.step === "fraud" && info.ids.includes("reject") && !STOPPED.has("rej")) { STOPPED.add("rej"); return { click: "거부" }; }
  if (plan === "stopAtError" && kind === "chips" && s.paused) {
    const pick = info.labels.find((l) => /조용히|예/.test(l) && !/아니오/.test(l));
    if (pick && !STOPPED.has("picked")) { STOPPED.add("picked"); return { click: pick }; }
    if (info.labels.includes("계속하기")) return { click: "계속하기" };
  }
  const p = PLANS[plan]?.(kind, info, s);
  if (p) return { click: p };
  if (kind === "ask" || kind === "chips") {
    if (info.ids?.includes("approve")) return { click: info.labels[info.ids.indexOf("approve")] };
    if (info.ids?.includes("yes")) return { click: info.labels[info.ids.indexOf("yes")] };
    if (info.labels.includes("계속하기")) return { click: "계속하기" };
    return { click: info.labels[0] };
  }
  return null;
}

await page.exposeFunction("__cap", async (kind, info) => {
  const job = busy.then(async () => {
    await snap(kind, info);
    const d = await decide(kind, info);
    return d;
  });
  busy = job.catch((e) => console.log("ERR", e.message));
  const d = await job.catch(() => null);
  if (d?.type) setTimeout(async () => { await page.fill("#msg", d.type); await page.click("#send"); }, 300);
  if (d?.click) setTimeout(() => clickLabel(d.click).catch((e) => console.log("CLICKERR", e.message)), 50);
  return d || {};
});
await page.exposeFunction("__pin", async () => {
  busy = busy.then(async () => {
    await snap("pin", { text: "결제/계좌 비밀번호" });
    lastKind = "pin";
    const open = await page.$(".pw-go");
    if (open) {
      await open.click();
      await wait(2200);
      const id = String(++n).padStart(2, "0");
      await page.screenshot({ path: `${OUT}/${id}-chat.png` });
      shots.push({ id, kind: "pin-app", step: "password", label: "비밀번호 직접 입력 (앱 화면)", text: "", options: [], chat: `${id}-chat.png`, run: null });
      console.log(id, "pin-app");
    }
    for (const k of ["1", "2", "3", "4"]) { await page.evaluate((k) => pinPress(k), k); await wait(250); }
  });
});

await page.goto(`http://localhost:8123/${ver}/`, { waitUntil: "networkidle" });
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload({ waitUntil: "networkidle" });
await page.fill("#pname", "홍길동");
await page.check(`input[name="cond"][value="${cond}"]`);
await page.check(`input[name="session"][value="${session}"]`);
await page.evaluate(() => {
  PACE = 0.6;
  const oSay = agentSay;
  window.agentSay = async function (text, opts) {
    await oSay(text, opts);
    if (/(…|\.\.\.)\s*$/.test(text)) return;
    if (S.waiter?.pin || S.pwWait) return;
    const r = await window.__cap("say", { text, stepKind: S.steps[S.stepIdx]?.kind || "" });
    if (r.stop) setTimeout(() => handleStop("button"), 30);
  };
  const oChips = setChips;
  window.setChips = function (options, onPick) {
    oChips(options, onPick);
    if (!options?.length) return;
    const info = { ids: options.map((o) => o.id), labels: options.map((o) => o.label) };
    setTimeout(() => window.__cap(S.waiter?.options ? "ask" : "chips", info), 400);
  };
  const oPin = renderPinCard;
  window.renderPinCard = function () { oPin(); setTimeout(() => window.__pin(), 500); };
  const oRead = readSetup;
  window.readSetup = function () { return { ...oRead(), delay: 1500 }; };
});
await page.click("#btn-web"); await page.waitForTimeout(400); await page.evaluate(() => document.querySelector(".perm-yes")?.click());
await wait(1500);
// 상황·과업 카드
if (!captureFrom) {
  await page.screenshot({ path: `${OUT}/00-task.png` });
  shots.push({ id: "00", kind: "task", step: "task", label: "상황·과업 카드", text: "", options: [], chat: "00-task.png", run: null });
}
if (process.env.TASKONLY) { fs.writeFileSync(`${OUT}/shots.json`, JSON.stringify({ ver, cond, session, runName, shots }, null, 1)); await browser.close(); process.exit(0); }
await page.evaluate(() => document.querySelector("#btn-task-close")?.click());
await wait(800);
const REQ = { v2: "신분당선 동천역에서 담소한정식 강남점까지 택시 불러줘", v4: "신분당선 동천역에서 담소한정식 강남점까지 택시 불러줘", v3: cond[0] === "A" ? "주거래 통장에서 동창회 총무 김영숙님께 30만원 보내줘" : "총무 문자 보고 주거래 통장에서 30만원 보내고 30기 홍길동으로 메모 남겨줘" }[ver];
if (process.env.FIRSTONLY) {
  await wait(900);
  await page.screenshot({ path: `${OUT}/0a-chat.png` });
  shots.push({ id: "0a", kind: "input", step: "input", label: "첫 화면", text: "", options: [], chat: "0a-chat.png", run: null });
  fs.writeFileSync(`${OUT}/shots.json`, JSON.stringify({ ver, cond, session, runName, shots }, null, 1));
  await browser.close();
  process.exit(0);
}
if (await page.$("#start-btn")) {
  // 개선안 첫 화면: 눌러서 시작하기 → 말로/글자로 고르기 → 글자로 하기
  const shot = async (id, label) => {
    await wait(900);
    await page.screenshot({ path: `${OUT}/${id}-chat.png` });
    shots.push({ id, kind: "input", step: "input", label, text: "", options: [], chat: `${id}-chat.png`, run: null });
  };
  if (!captureFrom) await shot("0a", "첫 화면");
  await page.click("#start-btn");
  if (!captureFrom) await shot("0b", "눌러서 시작하기를 누른 뒤");
  await page.click("#pick-text");
  if (!captureFrom) {
    // 캡처에는 휴대폰 시스템 키보드가 나오지 않아서, 글로 하기 화면에만 키보드 모양을 그려 넣고 찍음
    await page.evaluate(() => {
      const ph = document.querySelector(".phone");
      const kb = document.createElement("div");
      kb.id = "fake-kb";
      const rows = [["ㅂ", "ㅈ", "ㄷ", "ㄱ", "ㅅ", "ㅛ", "ㅕ", "ㅑ", "ㅐ", "ㅔ"], ["ㅁ", "ㄴ", "ㅇ", "ㄹ", "ㅎ", "ㅗ", "ㅓ", "ㅏ", "ㅣ"], ["⇧", "ㅋ", "ㅌ", "ㅊ", "ㅍ", "ㅠ", "ㅜ", "ㅡ", "⌫"], ["123", "🌐", "스페이스", "보내기"]];
      kb.innerHTML = rows.map((r, i) => `<div class="kb-row">${r.map((k) => `<span class="kb-key${k.length > 1 ? " wide" : ""}${k === "스페이스" ? " space" : ""}">${k}</span>`).join("")}</div>`).join("");
      const st = document.createElement("style");
      st.id = "fake-kb-style";
      st.textContent = `#fake-kb { flex: none; background: #d3d6dd; padding: 8px 4px 34px; display: flex; flex-direction: column; gap: 10px; }
        .kb-row { display: flex; gap: 6px; justify-content: center; }
        .kb-key { flex: 0 0 31px; height: 42px; border-radius: 6px; background: #fff; box-shadow: 0 1px 0 #8e9199; display: grid; place-items: center; font-size: 19px; color: #1c1d21; }
        .kb-key.wide { flex: 0 0 44px; font-size: 13px; background: #aeb3be; }
        .kb-key.space { flex: 1 1 auto; background: #fff; font-size: 14px; }
        .phone .composer { margin-bottom: 6px !important; }`;
      document.head.appendChild(st);
      ph.appendChild(kb);
    });
    await wait(400);
    await shot("0c", "글로 하기를 고른 뒤 (키보드)");
    await page.evaluate(() => { document.getElementById("fake-kb")?.remove(); document.getElementById("fake-kb-style")?.remove(); });
  }
  if (!captureFrom) {
    // 글자를 적어 두고 보내지 않았을 때
    await page.fill("#msg", "신분당선 동천역에서 담소한정식 강남점까지");
    await wait(4600);
    await shot("0f", "보내기를 누르지 않았을 때");
    await page.fill("#msg", "");
    // 말로 하기 화면 (헤드리스에는 음성 인식이 없어 화면 상태만 만들어 찍음)
    await page.evaluate(() => { setInputMode("voice"); $("#mic").hidden = false; renderVoice(); });
    await shot("0e", "말로 하기 (듣기 전)");
    await page.evaluate(() => { $("#mic").classList.add("rec"); });
    await shot("0d", "말로 하기 (듣는 중)");
    await page.evaluate(() => { $("#msg").value = "신분당선 동천역에서 담소한정식 강남점까지 택시 불러줘"; renderVoice(); });
    await shot("0g", "말로 하기 (받아 적는 중)");
    await page.evaluate(() => { $("#msg").value = ""; });
    await page.evaluate(() => { $("#mic").classList.remove("rec"); setInputMode("text"); });
  }
}
if (process.env.INPUTONLY) {
  fs.writeFileSync(`${OUT}/shots.json`, JSON.stringify({ ver, cond, session, runName, shots }, null, 1));
  await browser.close();
  process.exit(0);
}
await page.fill("#msg", REQ);
await page.click("#send");

// 끝날 때까지 대기
for (let t = 0; t < 600; t++) {
  await wait(1000);
  const done = await page.evaluate(() => S.finished).catch(() => true);
  if (done) break;
}
await busy;
await wait(2500);
await page.evaluate(() => { document.querySelector(".phone")?.scrollIntoView(); });
const id = String(++n).padStart(2, "0");
await page.screenshot({ path: `${OUT}/${id}-chat.png` });
shots.push({ id, kind: "end", step: "end", label: "종료", text: "", options: [], chat: `${id}-chat.png`, run: null });
fs.writeFileSync(`${OUT}/shots.json`, JSON.stringify({ ver, cond, session, runName, shots }, null, 1));
await browser.close();
console.log("DONE", shots.length);
