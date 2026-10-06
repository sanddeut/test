// 시나리오 진행 엔진 + 폰 화면 렌더링 + 연구자 로그
"use strict";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// v2는 기존 버전과 같은 도메인이라 저장 공간을 같이 씀 → Gemini 키·모델만 공유하고 나머지(세션 기록·문구 수정 등)는 "v2:" 접두어로 분리
const SHARED_KEYS = new Set(["gemini_key", "gemini_model", "llm_last_error"]);
const skey = (k) => (SHARED_KEYS.has(k) ? k : `v2:${k}`);
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(skey(k)); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(skey(k), JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  del(k) { try { localStorage.removeItem(skey(k)); } catch { /* noop */ } },
};

let S = null; // 현재 세션 상태

// =====================================================================
// 세션 생성
// =====================================================================
function newSession(cfg) {
  const cond = CONDITIONS[cfg.condition];
  const steps = buildSteps(cond.complexity, cfg.session);
  return {
    sessionId: `${cfg.pid || "P"}_${cfg.condition}_${new Date().toISOString().replace(/[:.]/g, "-")}`,
    cfg,
    cond: cfg.condition,
    complexity: cond.complexity,
    automation: cond.automation,
    steps,
    session: cfg.session,
    errorIdx: steps.findIndex((s) => String(s.kind).startsWith("error_")),
    destIdx: steps.findIndex((s) => s.kind === "dest"),
    requestByUser: false, // 참가자가 요청사항을 바꾸거나 거부함
    reserveCancelled: false, // 참가자가 예약을 막거나 취소함
    rideDone: false,
    stepIdx: -1,
    form: { origin: "current", dest: null, car: "normal", pay: "auto", coupon: false, request: "none", reserved: false },
    geo: null, // 휴대폰 현재 위치 (locate)
    userSet: {}, // 참가자가 직접 바꾼 항목 (높은 자동화에서 과업 값으로 덮어쓰지 않게)
    pinResolve: null,
    phone: { pin: "", app: "home", taxiView: "home", focus: null, sheet: null, toast: null, pendingDest: null, searchTyped: "", results: false, tappedPlace: null, originTyped: "", originResults: false },
    running: false,
    paused: false,
    manual: false,
    pinOpen: false,
    showRun: false, // 참가자가 「실행화면 보기」로 진행 화면을 연 상태 (기본은 대화창)
    finished: false,
    userDest: null, // 오류 단계 이전에 참가자가 미리 정정한 목적지
    req: { origin: null, originName: null, car: null }, // 처음 요청(과 이어진 답)에서 참가자가 말한 출발지·택시 종류. 없으면 해당 단계에서 물음
    originTarget: null, // 설정할 출발지 (말한 곳. 없으면 물어서 받음)
    waiter: null, // 러너가 참가자 입력을 기다릴 때 {resolve, options}
    ivWaiter: null, // 중지 후 개입 대화가 입력을 기다릴 때
    resumeWaiters: [],
    t0: performance.now(),
    startedAt: new Date().toISOString(),
    log: [],
    m: {
      request: null,
      errorShownAt: null,
      errorOutcome: null, // accepted | corrected | cancelled
      correctionVia: null, // reject_button | reject_text | stop_button | stop_text | manual
      errorResponseMs: null, // 오류 문구 노출 → 개입(또는 승인)까지
      approvals: 0,
      stops: 0,
      manuals: 0,
      llmCalls: 0,
      llmFallbacks: 0,
      finalDest: null,
      finishedAt: null,
    },
  };
}

const now = () => Math.round(performance.now() - S.t0);

function logEvent(type, data = {}) {
  const step = S.steps[S.stepIdx];
  const ev = { t_ms: now(), at: new Date().toISOString(), step: step ? step.id : "request", type, ...data };
  S.log.push(ev);
  renderLogRow(ev);
  renderSummary();
}

// =====================================================================
// 채팅 UI
// =====================================================================
const chat = () => $("#chat");
// 대화창을 맨 아래로 (화면 전환·버튼 표시로 높이가 바뀐 뒤에 맞춤)
const scrollChat = () => requestAnimationFrame(() => { const c = chat(); c.scrollTop = c.scrollHeight; });

// 대화창에는 대화(질문·답·응답)만 말풍선으로 남기고, 진행 상황은 진행 카드 한 곳에서 짧게 바뀌며 보여줌 (로그는 남기지 않음)
function appendBubble(role, text) {
  if (S && role === "user") {
    resetStatus(); // 참가자가 답하면 진행 문구를 새로 시작
    // 높은 자동화 알림 카드가 떠 있으면 그 알림을 먼저 대화 기록으로 남긴 뒤 참가자 말풍선을 붙임 (순서가 뒤바뀌지 않게)
    if ($("#run-card")?.classList.contains("notice")) freezeQuestion();
  }
  renderBubble(role, text);
}

// 진행 문구를 새로 시작 (이전 단계 문구·아직 말풍선으로 옮기지 않은 문구 지움)
function resetStatus() {
  if (!S) return;
  S.statusLines = null;
  S.pendingLines = [];
}

// 진행 중에 한 말은 우선 진행 카드에만 보이고, 참가자의 답이 필요해지면 그 말을 보여줌
// ask=true(버튼·키패드로 답하는 질문): 진행 카드 안에 질문과 선택지를 함께 (메타 뮤즈 승인 카드처럼)
// ask=false(말로 답하는 질문): 대화창 말풍선으로
function promote(ask = false) {
  const ls = S?.pendingLines || [];
  if (ask && cardLive()) {
    if (ls.length) {
      freezeQuestion();
      S.pendingLines = [];
      const q = $("#rc-q");
      q.textContent = ls.join("\n");
      tagSrc(q, q.textContent);
      q.hidden = false;
    } else if (!$("#rc-q").textContent.trim() && S.lastQuestion && !lastBubbleAsks() && lastAgentText() !== S.lastQuestion) {
      // 같은 질문으로 돌아온 경우(거부 후 "그대로 해", 직접 조작 후 복귀): 마지막 질문을 다시 카드에
      $("#rc-q").textContent = S.lastQuestion;
      tagSrc($("#rc-q"), S.lastQuestion);
      $("#rc-q").hidden = false;
    }
    $("#run-card").classList.add("asking");
    $("#run-card").classList.remove("away");
    setCard({ status: "확인이 필요해요", thinking: false });
    placeCard();
    return;
  }
  // 말로 답하는 질문(거부 후 "무엇을 수정할까요?" 등) 동안에는 진행 카드를 숨김
  if (cardLive()) $("#run-card").classList.add("away");
  if (!ls.length) return;
  S.pendingLines = [];
  ls.forEach((t) => renderBubble("agent", t));
}

// 바로 앞 AI 말풍선이 이미 질문으로 끝났으면(예: LLM 응답 "…여기로 갈까요?") 카드에 같은 질문을 반복하지 않음
function lastBubbleAsks() {
  const last = [...chat().querySelectorAll(".bubble")].at(-1);
  return Boolean(last?.classList.contains("agent") && /[?？]\s*$/.test(last.textContent));
}

// 대화창의 마지막 AI 말풍선 문구 (같은 질문을 카드에 다시 띄우지 않으려고 비교)
function lastAgentText() {
  const last = [...chat().querySelectorAll(".bubble.agent")].at(-1);
  return last ? last.textContent : "";
}

const cardLive = () => Boolean($("#run-card") && S?.running && !S.finished);

// 카드 안 질문에 답하면 그 질문을 대화 기록(말풍선)으로 남기고 카드는 다시 진행 상태로
function freezeQuestion() {
  const c = $("#run-card");
  if (!c) return;
  const q = c.querySelector("#rc-q");
  if (q.textContent.trim()) {
    const div = document.createElement("div");
    div.className = "bubble agent";
    div.textContent = q.textContent;
    tagSrc(div, q.textContent);
    chat().insertBefore(div, c);
  }
  q.textContent = "";
  q.hidden = true;
  c.querySelector("#rc-choices").innerHTML = "";
  if (c.classList.contains("asking")) setCard({ status: "" }); // 답했으면 "확인이 필요해요"를 지움
  c.classList.remove("asking", "notice", "can-manual");
  S.noticeStep = null;
}

// 단계별 재구성 UI (승인 질문과 함께 진행 카드 안에 표시)
// 선택지 목록은 누르는 버튼처럼 보이지 않게: 한 상자 안의 목록(스택드 리스트) + 고른 행 오른쪽에 색 체크만
const PV_CHECK = '<span class="ms pv-check">check</span>';
const PV_GO = '<span class="ms pv-go">chevron_right</span>';

// 요청사항·쿠폰 미리보기 목록은 대화창 카드에서 바로 고를 수 있게 (파일럿: 거부 → 목록 단계가 번거로움)
function pickable(box, stepId) {
  box.querySelectorAll("[data-pick]").forEach((d) => {
    const go = () => pickFromCard(stepId, d.dataset.pick, d.dataset.label || (d.querySelector("b") || d).textContent.trim());
    d.onclick = go;
    d.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
  return box;
}

async function pickFromCard(stepId, k, label) {
  if (!S || S.finished || stepIdNow() !== stepId || S.manual) return;
  const cur = stepId === "request" ? S.form.request : S.form.coupon ? "on" : "off";
  const out = stepId === "request" ? { intent: "set_request", request: k } : { intent: "set_coupon", coupon: k === "on" };
  if (S.automation === "low") {
    // 묻고 있는 승인 카드에서 고름: 지금 값과 같으면 승인, 다르면 그 값으로 바꾸고 바로 진행
    const w = S.waiter;
    if (!w?.options?.some((o) => o.id === "approve") || S.paused) return;
    S.waiter = null;
    setChips([]);
    appendBubble("user", label);
    logEvent("user_card_pick", { step: stepId, choice: k });
    await replyPause();
    w.resolve(k === cur ? { type: "button", id: "approve", card: true } : { type: "button", id: out.intent, out, card: true });
    return;
  }
  // 높은 자동화: 알림 카드에서 다른 값을 고르면 중지·수정처럼 바로 반영하고 이어서 진행
  if (k === cur || S.paused) return;
  S.paused = true;
  syncControls();
  appendBubble("user", label);
  logEvent("user_card_pick", { step: stepId, choice: k });
  markIntervention("card_pick");
  await replyPause();
  if (stepId === "request") {
    S.requestByUser = true;
    S.userSet.request = true;
    logEvent("request_changed", { request: k, via: "card_pick" });
    await redoRequest(k);
    await sayKey(k === "none" ? "change.request.none" : "change.request", undefined, { talk: true });
  } else {
    setOption("coupon", k === "on", "card_pick");
    await sayKey(k === "on" ? "change.coupon.on" : "change.coupon.off", undefined, { talk: true });
  }
  const old = $("#rc-choices .rc-pv");
  const pv = stepPreview();
  if (old && pv) old.replaceWith(pv);
  resume();
}
function stepPreview() {
  const id = S.steps[S.stepIdx]?.id;
  const el = (cls, html) => { const d = document.createElement("div"); d.className = `rc-pv ${cls}`; d.innerHTML = html; return d; };
  const appTile = (name, icon, color, sub) =>
    el("pv-app", `<span class="pv-icon" style="background:${color}"><span class="ms">${icon}</span></span><span><b>${esc(name)}</b><small>${esc(sub)}</small></span>`);
  // 높은 자동화: 고른 항목 표시 (낮은 자동화는 선택 목록이 대신함)
  const picked = (opts, cur) => el("pv-accts", Object.entries(opts).map(([k, o]) =>
    `<div class="${cur === k ? "on" : ""}"><span><b>${esc(o.label)}</b><small>${esc(o.desc)}</small></span>${cur === k ? PV_CHECK : ""}</div>`).join(""));
  switch (id) {
    case "taxi_open": return appTile(TAXI_APP, "local_taxi", "#f5b400", "택시 앱");
    case "origin":
      // 출발지를 '바꾼다'는 개념은 드러내지 않고, 설정할 출발지 하나만 보여줌
      return el("pv-acct pv-place pv-origin", `<span class="pv-pin"><span class="ms">trip_origin</span></span><span><b>${esc(ORIGINS[TARGET_ORIGIN].name)}</b><small>${esc(ORIGINS[TARGET_ORIGIN].addr)}</small></span>`);
    case "dest": {
      const k = S.phone.pendingDest ?? S.form.dest ?? AGENT_PLACE;
      return el("pv-acct pv-place", `<span class="pv-pin"><span class="ms fill">location_on</span></span><span><b>${esc(PLACES[k].name)}</b><small>${esc(PLACES[k].addr)} · ${esc(distText(S.form.origin, k, S.geo))}</small></span>`);
    }
    case "car":
      return el("pv-accts", Object.entries(CAR_TYPES).map(([k, c]) =>
        `<div class="${S.form.car === k ? "on" : ""}"><span><b>${esc(c.label)}</b></span><span class="pv-right"><small>예상 ${esc(won0(fareOf({ ...S.form, car: k })))}</small>${S.form.car === k ? PV_CHECK : ""}</span></div>`).join(""));
    case "pay": return picked(PAY, S.form.pay);
    case "coupon": {
      // 예상 금액 확인: 금액 + 쿠폰 적용 현황(적용 안 함 · 보유 1장). 쿠폰 줄을 누르면 적용/해제
      const on = !!S.form.coupon;
      return pickable(el("rc-summary pv-fare", `<div><span>예상 금액</span><b class="pv-fare-v">${esc(won0(fareOf(S.form)))}</b></div>
        <div class="pv-cpn" data-pick="${on ? "off" : "on"}" data-label="${on ? "쿠폰 적용 안 함" : "쿠폰 적용"}" role="button" tabindex="0"><span>쿠폰</span><b>${on ? `${esc(won0(COUPON.amount))} 할인 적용` : "적용 안 함"} <small>· 보유 1장</small>${PV_GO}</b></div>`), "coupon");
    }
    case "final": return rideSummary();
    case "request": {
      const cur = S.phone.reqFocus ?? S.form.request;
      return pickable(el("pv-accts pv-req pickable", REQUEST_CHOICES.map((k) => [k, REQUESTS[k]]).map(([k, v]) =>
        `<div class="${cur === k ? "on" : ""}" data-pick="${k}" role="button" tabindex="0"><b>${esc(v)}</b>${cur === k ? PV_CHECK : PV_GO}</div>`).join("")), "request");
    }
    case "reserve":
      return el("rc-summary", [["출발", "신분당선 동천역"], ["도착", "담소한정식 강남점"], ["예약 시간", RESERVE.when], ["택시 종류", CAR_TYPES[S.form.car].label]]
        .map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join(""));
    default: return null;
  }
}

function rideSummary() {
  const div = document.createElement("div");
  div.className = "rc-summary";
  div.innerHTML = rideRows().map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  return div;
}

// 높은 자동화 알림 카드: 같은 단계 문구는 이어 붙이고, 새 단계가 되면 이전 알림을 대화 기록(말풍선)으로 남김
function showNotice(text) {
  const c = $("#run-card");
  const q = $("#rc-q");
  if (S.noticeStep !== S.stepIdx || !q.textContent) {
    freezeQuestion();
    S.noticeStep = S.stepIdx;
    q.textContent = text;
    tagSrc(q, text);
    const pv = stepPreview();
    if (pv) $("#rc-choices").appendChild(pv);
    c.classList.remove("away");
  } else q.textContent += `\n${text}`;
  q.hidden = false;
  c.classList.add("notice");
  placeCard();
}

// 선택지를 넣을 곳: 진행 중에는 진행 카드 안, 그 외에는 대화창 아래
const chipsBox = () => (cardLive() ? $("#rc-choices") : $("#chips"));

// ---------- 진행 카드 (대화창 안: 할 일 처리 중 / 짧은 진행 문구 / 실행화면 보기) ----------
// 중지는 입력창의 보내기 버튼이 작업 중에 중지 버튼으로 바뀌고, 직접 조작은 중지한 뒤 선택지로 제시
function ensureRunCard() {
  let c = $("#run-card");
  if (c) return c;
  c = document.createElement("div");
  c.id = "run-card";
  c.className = "run-card";
  c.innerHTML = `<div class="rc-head"><span class="rc-icon"><span class="ms">auto_awesome</span></span>
      <div class="rc-text"><b id="rc-title">할 일 처리하는 중</b><small id="rc-status"></small></div></div>
    <div id="rc-q" class="rc-q" hidden></div>
    <div id="rc-choices" class="rc-choices"></div>
    <button type="button" id="rc-open" class="rc-open"><span class="ms">open_in_full</span> 실행화면 보기</button>
    <button type="button" id="rc-manual" class="rc-manual">직접 조작하기</button>`;
  chat().insertBefore(c, $("#chips"));
  c.querySelector("#rc-open").onclick = () => showRun(true);
  // 질문 카드 아래 작은 링크 (chatGPT의 "Sign in manually instead"처럼) → 앱 화면에서 직접 조작
  c.querySelector("#rc-manual").onclick = () => S && startManual();
  scrollChat();
  return c;
}

// 진행 카드를 대화창 맨 아래(선택지 바로 위)로: 참가자가 답한 뒤 작업이 이어질 때
function placeCard() {
  const c = $("#run-card");
  if (!c) return;
  if (c.nextElementSibling !== $("#chips") || $("#typing")) {
    chat().insertBefore(c, $("#chips"));
    const t = $("#typing");
    if (t) chat().insertBefore(t, $("#chips"));
    scrollChat();
  }
}

function setCard({ status, thinking, title } = {}) {
  const c = $("#run-card");
  if (!c) return;
  if (title != null) c.querySelector("#rc-title").textContent = title;
  const st = c.querySelector("#rc-status");
  if (status != null) st.textContent = status;
  if (thinking != null) st.classList.toggle("thinking", thinking);
}

function showRun(on) {
  if (!S) return;
  S.showRun = on;
  logEvent(on ? "run_view_open" : "run_view_close");
  syncControls();
}

// 출처 표시 붙이기 (규칙 대체면 Gemini 실패 이유도 함께: 연구자용)
function tagSrc(el, text) {
  el.dataset.src = srcOf(text);
  const errs = S?.errByText || {};
  const err = errs[text] || String(text).split("\n").map((t) => errs[t]).find(Boolean);
  if (err) el.dataset.err = err.slice(0, 140); else delete el.dataset.err;
}

// 문구의 출처: 시나리오(고정 문구) / llm / rules(규칙 대체)
function srcOf(text) {
  const map = S?.srcByText || {};
  const hit = String(text).split("\n").map((t) => map[t]).find(Boolean);
  return map[text] || hit || "script";
}

function renderBubble(role, text) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  if (role === "agent") tagSrc(div, text);
  chat().insertBefore(div, $("#chips"));
  chat().scrollTop = chat().scrollHeight;
}

// 진행 화면 하단 상태 문구 (최근 에이전트 발화)
function setStatus(text, thinking = false) {
  const el = $("#pv-status");
  if (!el) return;
  if (text != null) el.textContent = text;
  el.classList.toggle("thinking", thinking);
  // 대화창의 진행 카드도 같은 문구로 (진행 중일 때)
  if (!S?.running || S.finished) return;
  if (text != null) {
    $("#run-card")?.classList.remove("away"); // 작업이 이어지면 카드를 다시 보여줌
    // 카드 본문(알림·질문)에 이미 보이는 문구는 상태 줄에 반복하지 않음
    const last = text.split("\n").at(-1);
    const shown = last && ($("#rc-q")?.textContent || "").split("\n").includes(last);
    setCard({ status: shown ? "작업 중이에요" : last, thinking });
    placeCard();
  } else setCard({ thinking });
}

function showTyping(on) {
  let t = $("#typing");
  if (on && !t) {
    t = document.createElement("div");
    t.id = "typing";
    t.className = "bubble agent typing";
    t.innerHTML = "<span></span><span></span><span></span>";
    chat().insertBefore(t, $("#chips"));
    chat().scrollTop = chat().scrollHeight;
  } else if (!on && t) t.remove();
  setStatus(null, on);
}

// 참가자가 답한 뒤 다음 반응까지: 말풍선 자리에 "…"을 잠깐 보여준 뒤 이어감
const REPLY_PAUSE = 1500;
async function replyPause() {
  showTyping(true);
  await sleep(REPLY_PAUSE * PACE);
  showTyping(false);
}

// gated=true: 러너가 말할 때. 중지 중이면 재개될 때까지 기다렸다가 말함
// talk=true: 진행 중이라도 바로 대화창 말풍선으로 (참가자 말에 대한 응답)
async function agentSay(text, { gated = false, talk = false } = {}) {
  const card = S.running && !S.finished && !talk; // 진행 중 문구 → 진행 카드
  const inChat = wantedView() === "chat";
  // 진행 중 문구는 화면 로딩(스플래시·스피너)이 끝난 뒤에 띄움 (대화창에 있어도 실제 화면과 같은 시점)
  if (card || !inChat) await waitLoading();
  const typingMs = (!card && inChat ? Math.min(1600, 450 + text.length * 14) : 150) * PACE;
  for (;;) {
    if (gated) await gate();
    if (S.finished && gated) return;
    if (card) setStatus(null, true); else showTyping(true);
    await sleep(typingMs);
    if (card) setStatus(null, false); else showTyping(false);
    if (!gated || !S.paused) break;
  }
  // "~하고 있어요 …" 같은 진행 문구는 진행 카드에만 보이고 대화창 말풍선으로 옮기지 않음
  if (card && !isProgressLine(text)) {
    // 높은 자동화: 승인 없이 진행하되, 낮은 자동화의 승인 카드와 같은 내용(문구+재구성 UI)을 알림 카드로 보여줌
    if (S.automation === "high" && !S.paused && S.stepIdx >= 0 && cardLive()) showNotice(text);
    else S.pendingLines = [...(S.pendingLines || []), text];
  } else if (!card) appendBubble("agent", text);
  // 진행 화면 문구: 같은 단계의 연속 문구는 최근 2개까지 함께 보여줌 (예: "최종 확인해주세요" + 호출 내용)
  let prev = S.statusStep === S.stepIdx && S.statusLines ? S.statusLines : [];
  if (isProgressLine(prev.at(-1) || "")) prev = prev.slice(0, -1); // 진행 문구는 다음 문구가 나오면 사라짐
  S.statusLines = [...prev, text].slice(-2);
  S.statusStep = S.stepIdx;
  setStatus(S.statusLines.join("\n"));
  logEvent("agent_message", { text, screen: screenKey(S.phone) });
}

// 진행 문구: "…" 또는 "..."으로 끝나는 문구 (예: "계좌를 확인하고 있어요 …")
const isProgressLine = (t) => /(…|\.\.\.)\s*$/.test(t);

// 시나리오 문구(키)를 말풍선으로: 여러 줄이면 줄마다 말풍선 하나
async function sayKey(key, vars, opts) {
  const ls = lines(key, S, vars);
  for (const t of ls) await agentSay(t, opts);
  return ls.join(" ");
}

// 선택지 버튼: 진행 화면(축소 화면 아래)과 대화창 양쪽에 표시
// 승인/거부·단일 버튼은 알약 버튼, 그 외 여러 선택지는 세로 목록(stacked list)
function setChips(options, onPick) {
  const opts = options || [];
  if (opts.length) {
    promote(true); // 답이 필요해지면 방금 한 말을 질문으로 (진행 카드 안)
    // 승인·선택 질문에는 「직접 조작하기」 링크 (중지 후 선택지에는 이미 직접 조작이 있음)
    $("#run-card")?.classList.toggle("can-manual", cardLive() && !opts.some((o) => o.id === "manual" || o.id === "resume"));
  } else freezeQuestion(); // 답했으면 질문을 대화 기록으로
  const pill = ["approve", "reject", "manual", "resume"];
  const isList = opts.length >= 2 && !opts.every((o) => pill.includes(o.id));
  // 목록 선택지와 알약 버튼(직접 조작·계속하기 등)이 섞이면: 목록 아래에 알약 버튼 줄
  const mixed = isList && opts.some((o) => pill.includes(o.id));
  $("#chips").innerHTML = "";
  [chipsBox(), $("#pv-chips")].forEach((box) => {
    box.innerHTML = "";
    // 진행 카드 안 질문: 실행화면 대신, 판단에 필요한 내용을 재구성한 UI를 함께 보여줌
    if (box.id === "rc-choices" && opts.some((o) => o.id === "approve")) { const pv = stepPreview(); if (pv) box.appendChild(pv); }
    let parent = box;
    let pills = box;
    if (isList) {
      parent = document.createElement("div");
      parent.className = "choice-list";
      box.appendChild(parent);
    }
    if (mixed) {
      pills = document.createElement("div");
      pills.className = "pill-row";
      box.appendChild(pills);
    }
    opts.forEach((o) => {
      const asPill = mixed && pill.includes(o.id);
      const b = document.createElement("button");
      b.type = "button";
      if (o.card) {
        b.className = "open-card chip";
        b.innerHTML = `<span class="oc-head"><span class="bk-logo sm"><i></i></span><span><b>${esc(o.card.title)}</b><small>${esc(o.card.sub)}</small></span></span><span class="oc-btn">${esc(o.label)}</span>`;
      } else if (isList && !asPill) {
        b.className = "choice chip";
        b.innerHTML = `<span class="c-main"><b>${esc(o.label)}</b>${o.desc ? `<small>${esc(o.desc)}</small>` : ""}</span>${o.price ? `<span class="c-price">${esc(o.price)}</span>` : ""}<span class="ms c-go">chevron_right</span>`;
      } else {
        b.className = `chip ${o.id === "reject" || o.id === "manual" ? "chip-ghost" : ""}`;
        b.textContent = o.label;
      }
      b.onclick = () => onPick(o);
      (asPill ? pills : parent).appendChild(b);
    });
  });
  syncControls();
  scrollChat();
}

// 러너가 선택지를 제시하고 답을 기다림 (버튼 or 자유 발화)
function waitRunnerInput(options) {
  return new Promise((resolve) => {
    const onPick = (o) => {
      if (S.paused || !S.waiter) return;
      S.waiter = null;
      setChips([]);
      appendBubble("user", o.label);
      logEvent("user_button", { choice: o.id, label: o.label });
      replyPause().then(() => resolve({ type: "button", id: o.id }));
    };
    S.waiter = { resolve, options, onPick };
    setChips(options, onPick);
    syncControls();
  });
}

// 선택지를 제시하고 답을 받음. 텍스트면 LLM으로 해석하고, 스크립트 밖 말이면 LLM 응답 후 다시 대기
// extra: 선택지 외에 이 단계에서 바로 받아들일 의도 (예: set_dest)
async function askChoice(options, said, extra = [], hint) {
  S.lastQuestion = said;
  for (;;) {
    const r = await waitRunnerInput(options);
    if (r.type === "reask") return { id: "__reask", via: "stop" };
    if (r.type === "button") return { id: r.id, via: r.card ? "card" : r.manual ? "manual" : "button", out: r.out };
    const ids = options.map((o) => o.id);
    const o = await turn(r.text, { said, intents: [...ids, ...extra, "other"], hint });
    if (ids.includes(o.intent) || extra.includes(o.intent)) return { id: o.intent, via: "text", text: r.text, out: o };
    await agentSay(o.reply, { talk: true });
  }
}

function waitText() {
  return new Promise((resolve) => {
    S.waiter = { resolve, options: null };
    setChips([]);
    promote();
    syncControls();
  }).then((r) => r.text);
}

function formSnapshot() {
  const f = S.form;
  const dest = f.dest ?? S.phone.pendingDest ?? S.userDest ?? null;
  return {
    origin: originLabel(f.origin, S.geo),
    destination: dest ? PLACES[dest].name : null,
    car_type: CAR_TYPES[f.car].label,
    payment: PAY[f.pay].label,
    coupon: f.coupon ? COUPON.name : "적용 안 함",
    estimated_fare: dest ? won0(fareOf(f, dest)) : null,
  };
}

// 최근 대화 몇 줄 (LLM이 맥락을 알 수 있게)
function recentDialog(n = 6) {
  return S.log
    .filter((e) => e.type === "agent_message" || e.type === "user_text" || e.type === "user_button")
    .slice(-n)
    .map((e) => (e.type === "agent_message" ? `에이전트: ${e.text}` : `사용자: ${e.text ?? `[${e.label} 버튼]`}`));
}

// 대화 턴 해석: 의도 분류 + 값 추출 + 스크립트 밖 응답(reply)
async function turn(text, { said, intents, hint, fallback, fallbackBy, appKeywords, freeOrigin }) {
  const step = S.steps[S.stepIdx];
  const res = await interpret("turn", text, {
    automation: S.automation === "high" ? "높은 자동화" : "낮은 자동화",
    step: step ? `${S.stepIdx + 1}. ${step.label}` : "과업 요청",
    step_guide: step?.guide || null,
    agent_said: said,
    current_ride: formSnapshot(),
    recent: recentDialog(),
    intents,
    reply_hint: hint || null,
    fallback_reply: fallback || null,
    fallback_by_intent: fallbackBy || null,
    app_keywords: appKeywords || null,
    free_origin: freeOrigin || null,
  });
  return res.output;
}

async function interpret(kind, text, context) {
  showTyping(true);
  const t0 = performance.now();
  const res = await LLM.interpret(kind, text, context);
  // 답이 바로 튀어나오지 않게 "…"을 최소한 잠깐 보여줌
  await sleep(Math.max(0, REPLY_PAUSE * PACE - (performance.now() - t0)));
  showTyping(false);
  // 응답 출처 기록 (연구자용 표시): LLM이 만든 답인지, Gemini 실패로 규칙이 대신한 답인지
  const replyText = res.output?.reply ?? res.output?.clarification;
  if (replyText) {
    (S.srcByText ||= {})[replyText] = res.source === "gemini" ? "llm" : "rules";
    if (res.error) (S.errByText ||= {})[replyText] = res.error;
  }
  S.m.llmCalls++;
  if (res.source === "rules" && LLM.enabled) {
    S.m.llmFallbacks++;
    // Gemini 호출이 실패해 규칙 해석으로 대체됐음을 연구자가 알 수 있게 (상단 칩)
    const chip = $("#llm-chip");
    chip.textContent = "Gemini 오류 · 규칙으로 대체";
    chip.dataset.on = "err";
    chip.title = res.error || "";
  }
  logEvent("interpret", { kind, input: text, output: res.output, source: res.source, model: res.model || null, latency_ms: res.latency_ms, error: res.error || null });
  return res;
}

// =====================================================================
// 입력창 / 버튼
// =====================================================================
function onSubmit(e) {
  e?.preventDefault();
  const input = $("#msg");
  const text = input.value.trim();
  if (!text || !S || S.finished) return;
  input.value = "";

  if (S.ivWaiter) {
    const w = S.ivWaiter; S.ivWaiter = null;
    appendBubble("user", text);
    logEvent("user_text", { text });
    w(text);
  } else if (S.waiter && !S.paused) {
    const w = S.waiter; S.waiter = null;
    setChips([]);
    appendBubble("user", text);
    logEvent("user_text", { text });
    w.resolve({ type: "text", text });
  } else if (S.automation === "high" && S.running && !S.paused && !S.pinOpen) {
    // 높은 자동화: 진행 중에 말을 걸면 잠시 멈추고 해석 (수정 요청이면 반영, 그 외엔 응답 후 계속 진행)
    appendBubble("user", text);
    logEvent("user_text", { text });
    handleInterjection(text);
  }
  syncControls();
}

// 에이전트가 작업 중이면(참가자 답을 기다리는 중이 아니면) 보내기 버튼이 중지 버튼으로 바뀜. 글자를 입력하면 다시 보내기
function isWorking() {
  return Boolean(S && S.running && !S.finished && !S.paused && !S.waiter && !S.ivWaiter && !S.pwWait && !S.pinOpen);
}
function syncSendButton() {
  const btn = $("#send");
  if (!S) return;
  const stop = isWorking() && !$("#msg").value.trim();
  if (btn.dataset.mode !== (stop ? "stop" : "send")) {
    btn.dataset.mode = stop ? "stop" : "send";
    btn.innerHTML = `<span class="ms${stop ? " fill" : ""}">${stop ? "stop" : "arrow_upward"}</span>`;
    btn.title = stop ? "중지" : "보내기";
  }
  if (stop) btn.disabled = false;
}

function syncControls() {
  if (!S) return;
  const canTalk =
    !S.finished && !S.manual &&
    (S.ivWaiter || (S.waiter && !S.paused) || (S.automation === "high" && S.running && !S.paused && !S.pinOpen));
  $("#msg").disabled = !canTalk;
  $("#send").disabled = !canTalk;
  $("#mic").disabled = !canTalk;
  $("#msg").placeholder = canTalk ? "AI에게 말하기…" : S.finished ? "과업이 끝났어요" : S.manual ? "직접 조작 중이에요" : "AI가 작업 중이에요";
  document.querySelectorAll("#chips .chip, #pv-chips .chip, #rc-choices .chip").forEach((b) => (b.disabled = S.paused && !S.stopped));

  const live = S.running && !S.finished && !S.pinOpen && !S.pwWait;
  $("#btn-stop").disabled = !live || S.paused;
  $("#btn-manual").disabled = !live || S.paused;
  if ($("#rc-manual")) $("#rc-manual").disabled = !live || S.paused;
  $("#run-card")?.classList.toggle("ended", S.finished);
  if (!S.finished) setCard({ title: S.stopped || S.manual ? "작업을 멈췄어요" : "할 일 처리하는 중" });
  syncSendButton();
  $("#pv-title").textContent = S.finished ? "작업 완료" : S.paused && !S.manual ? "작업 멈춤" : "작업 진행 중";
  syncView();
}

// 화면 전환
// - direct  : 직접 작업·비밀번호 입력·팝업 직접 닫기 → 앱 화면을 실제 크기로
// - chat    : 기본 화면. 진행 상황은 진행 카드로, 선택·입력은 대화창 안 자체 UI로
// - progress: 「실행화면 보기」를 누른 경우 → 앱 화면을 축소해 보여주고, 단순 선택은 그 아래 버튼으로
function wantedView() {
  if (!S) return "chat";
  if (S.manual || S.pinOpen || S.phone.popupClosable || S.awaitDoneConfirm) return "direct";
  if (S.reticking) return "progress"; // 요청사항을 바꾸는 동안은 중지 중이어도 실행화면으로 보여줌
  if (S.pwWait) return "chat";
  if (S.ivWaiter || S.stopped) return "chat";
  if (S.waiter && !S.waiter.options) return "chat";
  if (!S.running || S.finished) return "chat";
  if (S.phone.app === "home") return "chat"; // 첫 앱을 열기 전에는 폰 홈 화면 대신 대화창에서 진행
  return S.showRun ? "progress" : "chat";
}

function syncView() {
  const v = wantedView();
  const phone = $(".phone");
  const prev = phone.dataset.view;
  if (prev !== v) {
    // 축소 화면 ↔ 실제 크기 화면 전환은 크기가 자연스럽게 커지고 작아지도록 애니메이션
    const zoom = ["progress", "direct"].includes(prev) && ["progress", "direct"].includes(v);
    const clip = $(".screen-clip");
    const before = zoom ? clip.getBoundingClientRect() : null;
    const ghost = (prev === "chat" && v === "direct") || (prev === "direct" && v === "chat") ? snapshotView(phone, prev) : null;
    phone.dataset.view = v;
    if (S) logEvent("view", { view: v });
    // 대화창 ↔ 앱 전체 화면: 나가는 화면은 튕기듯 작아지며 옆으로 빠지고, 들어오는 화면은 반대편에서 튕기며 들어옴
    if ((prev === "chat" && v === "direct") || (prev === "direct" && v === "chat")) slideSwap(phone, ghost, v === "direct");
    // 대화창 ↔ 진행 화면 전환 효과 (길고 분명하게)
    if ((prev === "chat" && v === "progress") || (prev === "progress" && v === "chat")) {
      phone.dataset.trans = v;
      clearTimeout(S?.transTimer);
      if (S) S.transTimer = setTimeout(() => delete phone.dataset.trans, 1400);
    }
    scrollChat();
    if (zoom) {
      fitScreen();
      animateZoom(clip, before);
    }
  }
  requestAnimationFrame(() => { fitScreen(); if (typeof refreshMap === "function") refreshMap(); });
  if (S) {
    // 직접 조작·비밀번호 직접 입력 중에는 왼쪽 위 뒤로(<) 버튼만 → 누르면 대화로 돌아감 (팝업 직접 닫기·완료 화면은 버튼 없이 앱 화면만)
    $(".direct-bar").classList.toggle("off", !(S.manual || S.pinOpen));
  }
}

// 지금 보이는 화면(대화창 또는 앱 전체 화면)을 복제해 그대로 덮어 둠 → 전환하는 동안 이 복제본이 빠져나감
function snapshotView(phone, view) {
  const pr = phone.getBoundingClientRect();
  const ghost = document.createElement("div");
  ghost.className = "trans-ghost";
  ghost.style.background = getComputedStyle(phone).backgroundColor;
  const sel = view === "chat" ? ".chat-head, #chat, #composer" : ".direct-bar, .screen-box";
  for (const el of phone.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const c = el.cloneNode(true);
    c.classList.remove("only-chat", "only-direct", "only-screen");
    [c, ...c.querySelectorAll("[id]")].forEach((x) => x.removeAttribute("id"));
    Object.assign(c.style, { position: "absolute", left: `${r.left - pr.left}px`, top: `${r.top - pr.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: "0", display: getComputedStyle(el).display });
    c.dataset.scroll = el.scrollTop;
    ghost.appendChild(c);
  }
  return ghost;
}

function slideSwap(phone, ghost, toApp) {
  if (!ghost || !ghost.animate) return;
  phone.querySelectorAll(".trans-ghost").forEach((g) => g.remove());
  phone.prepend(ghost);
  ghost.querySelectorAll("[data-scroll]").forEach((c) => (c.scrollTop = +c.dataset.scroll));
  const dir = toApp ? -1 : 1; // 앱으로: 대화창은 왼쪽으로 / 대화창으로: 앱은 오른쪽으로
  const out = ghost.animate([
    { transform: "none", borderRadius: "0px", boxShadow: "0 0 0 rgba(0,0,0,0)" },
    { transform: "scale(.86)", borderRadius: "28px", boxShadow: "0 12px 40px rgba(0,0,0,.22)", offset: 0.22 },
    { transform: "scale(.9)", borderRadius: "28px", boxShadow: "0 12px 40px rgba(0,0,0,.22)", offset: 0.34 },
    { transform: `translateX(${dir * 112}%) scale(.86)`, borderRadius: "28px", boxShadow: "0 12px 40px rgba(0,0,0,.18)" },
  ], { duration: 950, easing: "cubic-bezier(.45,0,.3,1)", fill: "forwards" });
  out.onfinish = () => ghost.remove();
  // 들어오는 화면: 기기 가운데를 기준으로 함께 움직이도록 요소별 기준점을 맞춤
  const pr = phone.getBoundingClientRect();
  const sel = toApp ? ".direct-bar:not(.off), .screen-box" : ".chat-head, #chat, #composer";
  for (const el of phone.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    el.style.transformOrigin = `${pr.left + pr.width / 2 - r.left}px ${pr.top + pr.height / 2 - r.top}px`;
    const card = el.classList.contains("screen-box"); // 앱 화면은 카드처럼 둥근 모서리로 들어와 전체 화면으로 펴짐
    const a = el.animate([
      { transform: `translateX(${-dir * 108}%) scale(.86)`, opacity: 0.6, ...(card && { borderRadius: "28px" }) },
      { transform: `translateX(${dir * 4}%) scale(.97)`, opacity: 1, offset: 0.62, ...(card && { borderRadius: "22px" }) },
      { transform: `translateX(${-dir * 1.5}%) scale(1)`, offset: 0.8, ...(card && { borderRadius: "10px" }) },
      { transform: "none", ...(card && { borderRadius: "0px" }) },
    ], { duration: 950, delay: 220, easing: "cubic-bezier(.3,.7,.3,1)", fill: "backwards" });
    a.onfinish = () => (el.style.transformOrigin = "");
  }
}

// 진행 화면: 앱을 기기 전체 크기로 렌더링한 뒤, 남은 공간에 맞게 축소
function fitScreen() {
  const phone = $(".phone");
  if (!phone || $("#stage").hidden) return;
  const cs = getComputedStyle(phone);
  const W = phone.clientWidth;
  const H = phone.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  phone.style.setProperty("--app-w", `${W}px`);
  phone.style.setProperty("--app-h", `${H}px`);
  const clip = $(".screen-clip");
  if (phone.dataset.view === "progress") {
    const box = $(".screen-box");
    const scale = Math.max(0.3, Math.min(0.84, (box.clientHeight - 36) / H, (box.clientWidth * 0.92) / W));
    phone.style.setProperty("--scale", scale.toFixed(4));
    clip.style.width = `${Math.floor(W * scale)}px`;
    clip.style.height = `${Math.floor(H * scale)}px`;
  } else {
    clip.style.width = "";
    clip.style.height = "";
  }
}

// FLIP: 이전 위치·크기에서 새 위치·크기로 부드럽게 이동
function animateZoom(el, before) {
  const after = el.getBoundingClientRect();
  if (!before.width || !after.width) return;
  const sx = before.width / after.width;
  const sy = before.height / after.height;
  const dx = before.left - after.left;
  const dy = before.top - after.top;
  el.style.transition = "none";
  el.style.transformOrigin = "0 0";
  el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  el.getBoundingClientRect(); // 강제 리플로우
  const dur = (1.1 * PACE).toFixed(2);
  el.style.transition = `transform ${dur}s cubic-bezier(.2, .8, .2, 1), border-radius ${dur}s`;
  el.style.transform = "";
  const done = () => { el.style.transition = ""; el.style.transform = ""; el.removeEventListener("transitionend", done); };
  el.addEventListener("transitionend", done);
}

function openTask(on) {
  $("#task-card").classList.toggle("open", on);
  $("#task-dim").classList.toggle("open", on);
  if (S) logEvent(on ? "task_open" : "task_close");
}


// =====================================================================
// 중지 / 직접조작 (높은 자동화)
// =====================================================================
function gate() {
  if (!S.paused) return Promise.resolve();
  return new Promise((r) => S.resumeWaiters.push(r));
}

function resume() {
  S.paused = false;
  S.manual = false;
  const ws = S.resumeWaiters; S.resumeWaiters = [];
  ws.forEach((r) => r());
  renderPhone();
  syncControls();
}

function markIntervention(via) {
  if (S.m.errorShownAt != null && S.m.errorResponseMs == null && S.m.errorOutcome == null) {
    S.m.errorResponseMs = now() - S.m.errorShownAt;
    S.m.correctionVia = via;
  }
}


// 목적지 바꾸기 (오류 단계 전이면 미리 정정한 값으로 기억, 낮은 자동화면 다시 물음)
function setDest(k) {
  if (S.automation === "low" && S.stepIdx === S.destIdx && S.form.dest == null) {
    // 낮은 자동화 목적지 질문 중에 바꾼 경우: 바뀐 목적지로 다시 확인
    S.lowPendingOverride = k;
    S.needReask = true;
    renderPhone();
    return;
  }
  if (S.automation === "low") S.needReask = true;
  if (S.stepIdx >= S.destIdx) {
    S.form.dest = k;
  } else {
    S.userDest = k;
  }
  renderPhone();
}

// 택시 종류·결제·쿠폰 바꾸기
function setOption(field, value, via) {
  if (S.form[field] === value) return false;
  S.form[field] = value;
  S.userSet[field] = true;
  if (S.automation === "low") S.needReask = true;
  logEvent(`${field}_changed`, { value, via });
  renderPhone();
  return true;
}

// 대화로 바꿀 수 있는 항목 (조건별)
const stepIdNow = () => S.steps[S.stepIdx]?.id;

// 기사님 요청사항 선택지 (지금 선택된 항목 표시)
function requestOptions() {
  return REQUEST_CHOICES.map((id) => ({ id, label: REQUESTS[id], desc: (S.form.request || "none") === id ? "지금 선택됨" : "" }));
}

function changeIntents() {
  return [...(stepIdNow() === "request" ? ["set_request"] : []), "set_origin", "set_dest", ...(S.complexity === "B" ? ["set_car"] : []), ...(USE_PAY_STEP ? ["set_pay"] : []), ...(S.complexity === "B" && USE_COUPON ? ["set_coupon"] : [])];
}

// 높은 자동화에서 말한 내용 해석. 수정 요청은 반영하고, 그 외에는 짧게 응답한 뒤 진행 상황을 알리고 계속 진행
function highIntents() {
  return [...changeIntents(), "pause", "continue", "cancel", "other"];
}
const HIGH_HINT =
  "높은 자동화에서는 사용자의 답을 기다리지 않고 자동으로 진행해. other/continue이면 reply는 발화를 짧게 받아준 뒤 현재 진행 상황을 알리는 형태로 끝내고, 승인을 묻지 마. " +
  "사용자가 무언가 잘못됐다고 지적하거나 멈추라고 하면(예: '잘못했잖아', '이상해', '틀렸어') 값이 없어도 pause로 분류해.";

async function applyHighChange(o, via) {
  if (o.intent === "set_request" && REQUESTS[o.request]) {
    S.requestByUser = true;
    S.userSet.request = true;
    logEvent("request_changed", { request: o.request, via });
    await redoRequest(o.request);
    await sayKey(o.request === "none" ? "change.request.none" : "change.request");
    return true;
  }
  if (o.intent === "set_origin" && ORIGINS[o.origin]) {
    setOption("origin", o.origin, via);
    await sayKey("change.origin");
    return true;
  }
  if (o.intent === "set_dest" && PLACES[o.place]) {
    setDest(o.place);
    logEvent("dest_changed", { dest: o.place, via });
    await redoDest(o.place);
    await sayKey("change.dest", { dest: o.place });
    return true;
  }
  if (o.intent === "set_car" && CAR_TYPES[o.car_type]) {
    setOption("car", o.car_type, via);
    await sayKey("change.car");
    return true;
  }
  if (o.intent === "set_pay" && PAY[o.pay_method]) {
    setOption("pay", o.pay_method, via);
    await sayKey("change.pay");
    return true;
  }
  if (o.intent === "set_coupon" && typeof o.coupon === "boolean") {
    setOption("coupon", o.coupon, via);
    await sayKey(o.coupon ? "change.coupon.on" : "change.coupon.off");
    return true;
  }
  return false;
}

async function handleInterjection(text) {
  if (S.paused || S.finished) return;
  S.paused = true; // 해석하는 동안 진행을 잠시 보류
  S.m.interjections = (S.m.interjections || 0) + 1;
  showTyping(false);
  syncControls();
  const said = S.log.filter((e) => e.type === "agent_message").at(-1)?.text || "";
  const o = await turn(text, { said, intents: highIntents(), hint: HIGH_HINT, fallback: "네, 택시 호출을 이어서 진행할게요." });
  if (changeIntents().includes(o.intent)) {
    S.m.stops++;
    markIntervention("stop_text");
    logEvent("stop", { via: "text" });
    if (await applyHighChange(o, "stop_text")) return resume();
  }
  if (o.intent === "pause") {
    S.paused = false;
    return handleStop("text");
  }
  if (o.intent === "cancel") return cancelRide();
  await agentSay(o.reply, { talk: true });
  resume();
}

// 중지 버튼(모든 조건) → 대화창에서 "진행을 멈췄어요. 어떻게 바꿀까요?"
// 참가자가 말하면 응답하거나 바뀐 내용을 반영하고, 「계속하기」를 누를 때까지 멈춰 있음
const STOP_HINT =
  "사용자가 '중지'를 눌러 진행이 멈춘 상태야. 발화에 응답한 뒤, '계속하기'를 누르면 이어서 진행한다고 안내해. 재개 여부를 말로 묻지 마. " +
  "사용자가 무엇이 잘못됐다고만 하고 바꿀 값을 말하지 않으면(예: '목적지가 잘못됐어'), 무엇으로 바꿀지 되물어(예: '목적지를 어디로 바꿀까요?'). 이때는 계속하기 안내를 하지 마.";

async function handleStop(via) {
  if (S.paused || S.finished) return;
  S.paused = true;
  S.stopped = true;
  S.m.stops++;
  markIntervention(`stop_${via}`);
  logEvent("stop", { via });
  showTyping(false);
  const saved = S.waiter?.options ? { options: S.waiter.options, onPick: S.waiter.onPick } : null;
  syncControls();

  resetStatus(); // 진행 문구를 새로 시작
  let said = await sayKey(stepIdNow() === "reserve" ? "stop.ask.reserve" : "stop.ask");
  for (;;) {
    setChips([...(stepIdNow() === "request" ? requestOptions() : []), { id: "manual", label: "직접 조작" }, { id: "resume", label: "계속하기" }], (o) => {
      if (!S.ivWaiter) return;
      const w = S.ivWaiter; S.ivWaiter = null;
      appendBubble("user", o.label);
      logEvent("user_button", { choice: o.id, label: o.label });
      replyPause().then(() => w(REQUESTS[o.id] ? { req: o.id } : { [o.id]: true }));
    });
    const r = await new Promise((res) => { S.ivWaiter = res; syncControls(); });
    if (r?.resume) break;
    if (r?.req) {
      // 목록에서 고른 요청사항으로 바꿈 (실행화면에서 고르는 과정을 보여줌)
      await applyHighChange({ intent: "set_request", request: r.req }, `stop_${via}`);
      said = S.log.filter((e) => e.type === "agent_message").at(-1)?.text || said;
      continue;
    }
    if (r?.manual) {
      // 중지 상태에서 직접 조작으로 넘어감 → 끝나면 endManual이 원래 단계로 되돌림
      S.stopped = false;
      S.paused = false;
      setChips([]);
      return startManual();
    }
    setChips([]);
    const o = await turn(r, {
      said,
      intents: [...changeIntents(), "continue", "cancel", "other"],
      hint: STOP_HINT,
      fallback: "계속하기를 누르시면 이어서 진행할게요.",
    });
    if (await applyHighChange(o, `stop_${via}`)) { said = S.log.filter((e) => e.type === "agent_message").at(-1)?.text || said; continue; }
    if (o.intent === "cancel") { S.stopped = false; return cancelRide(); }
    if (o.intent === "continue") break;
    said = o.reply;
    await agentSay(o.reply, { talk: true });
  }
  S.stopped = false;
  setChips([]);
  resetStatus();
  await sayKey("stop.continue");
  await finishIntervention(saved);
}

// 중지·직접 조작이 끝난 뒤 원래 단계로 돌아감. 낮은 자동화에서 내용이 바뀌었으면 질문을 다시 함
async function finishIntervention(saved) {
  const reask = S.needReask && S.waiter;
  S.needReask = false;
  // "계속 진행할게요."를 잠시 보여준 뒤 이어감 (그동안 선택지는 숨김)
  await sleep(2500 * PACE);
  resetStatus(); // "계속 진행할게요."는 진행 문구로만 보이고 다음 질문에 섞이지 않게
  resume();
  if (reask) {
    const w = S.waiter; S.waiter = null;
    w.resolve({ type: "reask" });
  } else if (S.waiter?.pin) {
    // 비밀번호 입력 중 취소(중지) → 계속하기: 비밀번호 카드를 다시 보여줌
    promote(true);
    renderPinCard();
  } else if (saved && S.waiter) {
    // 멈추기 전 질문을 다시 보여주고 선택지를 함께 띄움
    resetStatus();
    if (S.lastQuestion) await agentSay(S.lastQuestion);
    if (S.waiter) setChips(saved.options, saved.onPick);
  }
}

async function cancelRide() {
  if (S.rideDone) {
    // 호출이 끝난 뒤의 "취소"는 예약 취소
    S.reserveCancelled = true;
    S.form.reserved = false;
    logEvent("reserve_cancelled");
    if (["reserve", "reserve_done"].includes(S.phone.taxiView)) { S.phone.taxiView = "history"; renderPhone(); }
    await sayKey("reserve.cancel");
    return finish("completed");
  }
  await sayKey("cancel");
  return finish("cancelled");
}

function startManual() {
  if (S.paused || S.finished) return;
  S.paused = true;
  S.manual = true;
  S.m.manuals++;
  markIntervention("manual");
  logEvent("manual_start");
  S.manualSnapshot = { ...S.form, sheet: S.phone.sheet, view: S.phone.taxiView };
  S.manualDest = null;
  // 앱 실행을 묻는 중이면 홈 화면에서 직접 앱을 열 수 있게
  const stepId = S.steps[S.stepIdx]?.id;
  if (stepId === "taxi_open" && S.manualDone?.[stepId] === undefined) S.phone.app = "home";
  // 목적지를 묻는 중이면 검색 결과에서 직접 고를 수 있게
  if (stepId === "dest" && S.form.dest == null && S.phone.app === "taxi") S.phone.taxiView = "search";
  S.phone.sheet = null; // 시트가 떠 있으면 내려서 수정 가능하게
  $("#pv-chips").innerHTML = ""; // 대화창의 질문 카드는 그대로 두고, 돌아오면 같은 질문을 이어서 보여줌
  showTyping(false);
  renderPhone();
  syncControls();
}

async function endManual() {
  if (!S.manual) return;
  const snap = S.manualSnapshot;
  const changes = {};
  const cur = S.form.dest ?? S.lowPendingOverride ?? S.phone.pendingDest ?? S.userDest ?? null;
  if (S.manualDest && S.manualDest !== cur) { changes.dest = S.manualDest; setDest(S.manualDest); }
  S.manualDest = null;
  for (const k of ["origin", "car", "pay", "coupon"]) {
    if (S.form[k] !== snap[k]) { changes[k] = S.form[k]; if (S.automation === "low") S.needReask = true; }
  }
  // 검색 화면에서 목적지를 정하지 않고 돌아오면 원래 화면으로
  if (S.phone.taxiView === "search" && snap.view !== "search" && !changes.dest) S.phone.taxiView = snap.view;
  if (S.phone.taxiView === "ride" && S.form.dest == null && !changes.dest) S.phone.taxiView = snap.view;
  S.phone.sheet = snap.sheet;
  S.manual = false;
  S.showRun = false; // 뒤로(<)를 누르면 대화창으로
  logEvent("manual_end", { changes });
  // "이어서 진행할게요" 없이, 직접 조작 전의 말풍선·카드를 그대로 이어서 보여줌
  const w = S.waiter;
  const curStep = S.steps[S.stepIdx];
  const done = curStep && w?.options ? S.manualDone?.[curStep.id] : undefined;
  if (done !== undefined) S.needReask = false; // 지금 묻던 단계를 직접 끝낸 경우는 다시 묻지 않음
  const reask = S.needReask && w;
  S.needReask = false;
  resume();
  if (done !== undefined) {
    // 지금 묻던 단계를 직접 끝냈으면(앱 실행·택시 종류·결제 방식 등) 그 답으로 처리하고 다음 단계로
    const id = typeof done === "string" ? done : "approve";
    S.waiter = null;
    setChips([]);
    logEvent("decision_manual", { choice: id });
    w.resolve({ type: "button", id, manual: true });
  } else if (reask) {
    // 낮은 자동화에서 내용이 바뀌었으면 바뀐 내용으로 다시 물음
    S.waiter = null;
    w.resolve({ type: "reask" });
  } else if (w?.pin) {
    promote(true);
    renderPinCard();
  } else if (w?.options) {
    if (S.waiter) setChips(w.options, w.onPick);
  }
}

// =====================================================================
// 시나리오 러너
// =====================================================================
async function run() {
  syncControls();
  await sayKey("greet");
  // 1) 과업 요청 해석
  for (;;) {
    const text = await waitText();
    const res = await interpret("request", text, {
      condition: S.cond,
      scenario_task: SITUATION[S.complexity].task,
    });
    const o = res.output;
    // 참가자가 말한 출발지·택시 종류는 이어진 답에서도 모아 둠 (말하지 않은 정보는 해당 단계에서 물음)
    if (o.origin && ORIGINS[o.origin]) S.req.origin = o.origin;
    else if (o.origin_name) { S.req.origin = null; S.req.originName = o.origin_name; }
    if (o.car_type && CAR_TYPES[o.car_type]) S.req.car = o.car_type;
    if (o.is_ride_request && !(o.destination == null && o.clarification)) {
      S.m.request = { text, ...o };
      showTyping(true);
      await sleep(1800 * PACE); // 요청을 처리하는 것처럼 "…"을 잠시 보여줌
      break;
    }
    await agentSay(o.clarification || "저는 휴대폰 앱을 대신 조작해서 택시 호출 같은 일을 도와드릴 수 있어요. 어떤 일을 도와드릴까요?");
  }

  S.running = true;
  showTyping(false);
  ensureRunCard();
  setStatus("", true);
  syncControls();

  // 2) 단계 진행
  for (let i = 0; i < S.steps.length; i++) {
    if (S.finished) return;
    await gate();
    S.stepIdx = i;
    const step = S.steps[i];
    logEvent("step_start", { label: step.label });
    renderStepper();
    const ok = S.automation === "low" ? await runLowStep(step) : await runHighStep(step);
    if (!ok || S.finished) return;
    if (S.automation === "low") await sleep(1000 * PACE); // 높은 자동화는 단계 안에서 읽는 시간을 둠
  }
}

const resolveMsgs = (m) => (typeof m === "function" ? m(S) : m);

// 참가자가 직접 조작으로 이미 끝낸 단계인지
const manualDone = (step) => S.manualDone?.[step.id] !== undefined;

// 단계 조작: act가 있으면 화면에서 누르고 입력하는 과정을 보여주며 진행, 없으면 바로 반영
// announced=true: 바로 앞에서 이 조작을 알리는 문구("~할게요")를 말한 경우 → 조작 중에도 그 문구를 유지
async function doApply(step, choice, { announced = false } = {}) {
  if (manualDone(step)) { renderPhone(); return; } // 직접 조작으로 이미 화면이 바뀌어 있음
  if (step.act && !announced) {
    // 새 조작이 시작되면 이전 문구(이미 답한 질문, 이전 결과)는 지우고 "…" 표시
    resetStatus();
    setStatus("", true);
  }
  if (step.act) {
    setActing(true);
    try { await step.act(S, choice); } finally { setActing(false); }
  }
  step.apply(S, choice);
  renderPhone();
  if (step.act) {
    // 화면이 바뀌었으니 이전 안내 문구는 지우고, 다음 문구가 나올 때까지 "…" 표시
    resetStatus();
    setStatus("", true);
  }
}

// 화면이 바뀐 뒤 잠시 머무름 (로딩이 끝난 뒤부터)
async function dwell(ms = 1800) {
  await waitLoading();
  await sleep(ms * PACE);
  if (S.automation === "high") await gate();
}

// 단계 준비: 문구를 말하기 전에 화면에서 찾는 과정 (예: 자주 탭으로 이동)
async function doPre(step) {
  if (!step.pre || manualDone(step)) return;
  // 새 단계의 준비 동작이 시작되면 이전 단계 문구는 지우고 "…" 표시
  resetStatus();
  setStatus("", true);
  setActing(true);
  try { await step.pre(S); } finally { setActing(false); }
  await dwell(150);
}

// 단계 시작 진행 문구 (예: "계좌를 확인하고 있어요 …") → 잠시 보여준 뒤 단계 진행
async function sayBusy(step) {
  if (!step.busy || manualDone(step)) return;
  const ls = lines(step.busy, S);
  if (!ls.length) return;
  resetStatus();
  for (const t of ls) await agentSay(t, { gated: S.automation === "high" });
  await sleep(1500 * PACE);
  if (S.automation === "high") await gate();
}

// ---------- 낮은 자동화 ----------
// 거부 유형별로 선택지 단계에서 바로 받아들일 수 있는 의도
const REJECT_EXTRA = {
  final: ["set_origin", "set_dest", "set_car", "set_pay", "set_coupon", "cancel"],
};

async function runLowStep(step) {
  if (step.kind === "password") return runPassword(step, step.low);
  if (step.id === "origin") { const r = await prepOrigin(step); if (r !== "go") return r; }
  if (step.kind === "dest") return runLowDest(step);

  if (manualDone(step) && step.low.options) { logEvent("step_done_manually"); return true; } // 이미 직접 한 단계는 묻지 않고 넘어감
  await sayBusy(step);
  await doPre(step);
  if (!step.low.options) {
    // 안내만 하는 단계: 문구와 화면 조작 순서를 맞춤
    const msgs = resolveMsgs(step.low.messages);
    const split = step.low.split ?? (step.low.applyFirst ? 0 : msgs.length);
    for (const m of msgs.slice(0, split)) await agentSay(m);
    await doApply(step, undefined, { announced: split > 0 });
    for (const m of msgs.slice(split)) await agentSay(m);
    if (step.kind === "done") S.rideDone = true;
    if (isLastStep(step)) return finish("completed");
    await dwell();
    return true;
  }
  const isError = String(step.kind).startsWith("error_");
  let repeat = true;
  for (;;) {
    const msgs = resolveMsgs(step.low.messages);
    if (repeat) for (const m of msgs) await agentSay(m);
    if (isError && S.m.errorShownAt == null) S.m.errorShownAt = now();
    repeat = true;

    let extra = step.low.reject === "request" ? ["set_request"] : REJECT_EXTRA[step.low.reject] || [];
    if (step.low.reject === "final") extra = extra.filter((x) => x === "cancel" || changeIntents().includes(x));
    const c = await askChoice(step.low.options, msgs.join(" "), extra);
    if (c.id === "__reask") continue; // 중지·직접 조작으로 바뀐 내용으로 다시 물음
    S.m.approvals++;
    logEvent("decision", { choice: c.id, via: c.via });
    if (c.id !== "reject" && step.low.options.some((o) => o.id === c.id)) {
      if (isError && S.m.errorResponseMs == null && S.m.errorShownAt != null) S.m.errorResponseMs = now() - S.m.errorShownAt;
      const opening = step.low.opening && !manualDone(step) ? lines(step.low.opening, S) : [];
      for (const t of opening) await agentSay(t);
      await doApply(step, c.id, { announced: opening.length > 0 });
      if (step.kind === "error_reserve" && S.form.reserved) await sayKey("reserve.yes");
      if (step.act) await dwell(1000);
      break;
    }
    if (isError && S.m.correctionVia == null) {
      if (S.m.errorShownAt != null) S.m.errorResponseMs = now() - S.m.errorShownAt;
      S.m.correctionVia = `reject_${c.via}`;
    }
    const r = await handleReject(step, c, msgs.join(" "));
    if (r === "cancel") return false;
    if (r === "done") break;
    if (r === "reask") repeat = false; // 같은 질문의 선택지로 돌아감 (문구 반복 없이)
    // "retry": 바뀐 내용으로 같은 단계 문구를 다시 보여줌
  }
  if (isLastStep(step)) return finish("completed");
  return true;
}

const isLastStep = (step) => S.steps.at(-1) === step;

// 거부 후 처리. 반환: "done" | "retry" | "reask" | "cancel"
async function handleReject(step, c, said) {
  const type = step.low.reject;
  let o = c.id !== "reject" ? c.out : null; // 선택지 단계에서 이미 구체적인 요청을 말한 경우

  if (type === "app") {
    // 지정된 앱이 아닌 다른 앱(다른 택시 앱 포함)을 말하면 그 앱으로는 할 수 없다고 알리고 지정된 앱 실행을 다시 물음
    const app = step.low.app;
    const ask = line("app.which", S);
    const launch = async () => {
      await sayKey(step.low.launched);
      if (step.low.opening) await sayKey(step.low.opening);
      await doApply(step, undefined, { announced: true });
      return "done";
    };
    const opts = {
      intents: ["approve", "unsuitable_app", "other"],
      hint:
        `지정된 앱은 ${app.target}이고, 이 단계의 목적은 ${app.purpose}이야. 사용자가 ${app.target}을 실행하라고 하면 approve야. ` +
        `그 외의 앱(다른 택시 앱 포함)을 말하면 unsuitable_app이고, reply는 그 앱으로는 ${app.purpose}을 할 수 없다는 사실을 알린 뒤 ${app.target}을 실행할지 묻는 형태로 써.`,
      appKeywords: app.keywords,
      fallbackBy: {
        unsuitable_app: `그 앱으로는 ${app.purpose}을 할 수 없어요. ${app.purpose}을 위해 ${app.target}을 실행할까요?`,
        other: `${app.purpose}을 위해서는 ${app.target}을 실행해야 해요. ${app.target}을 실행할까요?`,
      },
    };
    await agentSay(ask);
    let said = ask;
    let o = null;
    for (;;) {
      if (!o) o = await turn(await waitText(), { ...opts, said });
      logEvent("app_named", { intent: o.intent });
      if (o.intent === "approve") return launch();
      // 지정되지 않은 앱 / 기타 → 응답 후 지정된 앱 실행 여부를 다시 물음
      said = o.reply;
      await agentSay(o.reply, { talk: true });
      const c = await askChoice(APPROVE, said, ["unsuitable_app"], opts.hint);
      if (c.id === "approve") return launch();
      if (c.id === "reject" || c.id === "__reask") { await agentSay(ask); said = ask; o = null; continue; }
      o = c.out;
    }
  }

  if (type === "origin") return askOrigin(step, "reject_text");

  if (type === "request") {
    // 참가자가 말한 요청사항으로 바꿈 → 실행화면에서 고르는 과정을 보여주고 → 다시 승인을 물음
    S.requestByUser = true;
    const hint = `고를 수 있는 기사님 요청사항은 ${REQUEST_CHOICES.map((k) => `${REQUESTS[k]}(${k})`).join(", ")}이고(요청사항 없이 하려면 none), 지금은 ‘${REQUESTS[S.form.request]}’야. 사용자가 다른 요청사항이나 '없음'을 말하면 set_request야. 말하지 않으면 reply로 어떤 요청사항으로 할지 되물어.`;
    let o = c.id === "set_request" ? c.out : null;
    // 요청사항 목록을 선택지로 보여주고 고르게 함 (말로 답해도 됨)
    const pickFromList = async () => {
      const ask = line("request.ask", S);
      await agentSay(ask);
      for (;;) {
        const p = await askChoice(requestOptions(), ask, ["set_request", "continue", "cancel"], hint);
        if (p.id === "__reask") continue;
        if (REQUESTS[p.id]) return { intent: "set_request", request: p.id };
        if (p.out) return p.out;
        return { intent: p.id };
      }
    };
    for (;;) {
      if (!o) o = await pickFromList();
      if (o.intent === "set_request" && REQUESTS[o.request]) {
        logEvent("request_changed", { request: o.request, via: "reject_text" });
        S.userSet.request = true;
        S.phone.reqFocus = null;
        await redoRequest(o.request);
        // 고른 뒤 다시 묻지 않고 "이렇게 호출할게요." → 호출
        await sayKey(S.form.request === "none" ? "request.none.confirm" : "request.confirm", undefined, { talk: true });
        await doApply(step, "approve", { announced: true });
        return "done";
      }
      if (o.intent === "continue") { S.phone.reqFocus = null; S.userSet.request = true; await doApply(step, "approve", { announced: true }); return "done"; }
      if (o.intent === "cancel") { await cancelRide(); return "cancel"; }
      await agentSay(o.reply, { talk: true });
      o = null;
    }
  }

  if (type === "reserve") {
    S.reserveCancelled = true;
    logEvent("reserve_rejected");
    await sayKey("reserve.no");
    return "done";
  }

  if (type === "coupon") {
    // 기본(적용 안 함)을 거부하면 적용 여부를 고르게 함 → 고른 대로 다시 묻지 않고 진행
    if (c.id === "set_coupon" && typeof c.out?.coupon === "boolean") {
      // 카드 목록에서 바로 고른 경우
      logEvent("coupon_chosen", { coupon: c.out.coupon, via: c.via });
      await sayKey(c.out.coupon ? "coupon.on" : "coupon.skip", undefined, { talk: true });
      await doApply(step, c.out.coupon ? "on" : "off", { announced: true });
      return "done";
    }
    // 무엇을 바꿀지 말로 받음 (쿠폰 목록을 먼저 보여주지 않음)
    const ask = line("coupon.ask", S);
    await agentSay(ask);
    let said = ask;
    for (;;) {
      const o = await turn(await waitText(), {
        said,
        intents: ["set_coupon", "set_car", "continue", "cancel", "other"],
        hint: `지금은 예상 금액을 확인하는 단계야(쿠폰 적용 안 함). 쿠폰을 적용하라고 하면 set_coupon(coupon=true), 택시 종류를 바꾸라고 하면 set_car, 그대로 하라고 하면 continue야. 그 외에는 reply로 짧게 답하고 무엇을 바꿀지 다시 물어. 쿠폰을 먼저 권하지 마.`,
        fallback: "무엇을 바꿀까요?",
      });
      if (o.intent === "set_coupon" && typeof o.coupon === "boolean") {
        logEvent("coupon_chosen", { coupon: o.coupon, via: "reject_text" });
        await sayKey(o.coupon ? "coupon.on" : "coupon.skip", undefined, { talk: true });
        await doApply(step, o.coupon ? "on" : "off", { announced: true });
        return "done";
      }
      if (o.intent === "set_car" && CAR_TYPES[o.car_type]) {
        setOption("car", o.car_type, "reject_text");
        S.needReask = false;
        await sayKey("change.car", undefined, { talk: true });
        await doApply(step, "approve", { announced: true });
        return "done";
      }
      if (o.intent === "continue") { await sayKey("coupon.skip", undefined, { talk: true }); await doApply(step, "approve", { announced: true }); return "done"; }
      if (o.intent === "cancel") { await cancelRide(); return "cancel"; }
      said = o.reply;
      await agentSay(o.reply, { talk: true });
    }
  }

  if (type === "final") {
    const ask = line(step.low.ask, S);
    if (!o) await agentSay(ask);
    if (!o) {
      o = await turn(await waitText(), {
        said: ask,
        intents: [...changeIntents(), "continue", "cancel", "other"],
        hint: "바꿀 수 있는 것은 출발지, 목적지" + (USE_PAY_STEP ? ", 결제 방식" : "") + (S.complexity === "B" ? ", 택시 종류" + (USE_COUPON ? ", 쿠폰" : "") : "") + "이야. 그 외 요청이면 짧게 답하고 최종 확인 단계로 자연스럽게 돌아와.",
      });
    }
    // 거부 후 말한 수정은 반영한 뒤 다시 묻지 않고 바로 진행
    const proceed = async (key, vars) => {
      S.needReask = false;
      await sayKey(key, vars, { talk: true });
      await doApply(step, "approve", { announced: true });
      return "done";
    };
    if (o.intent === "set_dest" && PLACES[o.place]) {
      setDest(o.place);
      logEvent("dest_changed", { dest: o.place, via: "final" });
      await redoDest(o.place);
      return proceed("change.dest", { dest: o.place });
    }
    if (o.intent === "set_origin" && ORIGINS[o.origin]) { setOption("origin", o.origin, "final"); return proceed("change.origin"); }
    if (o.intent === "set_car" && CAR_TYPES[o.car_type]) { setOption("car", o.car_type, "final"); return proceed("change.car"); }
    if (o.intent === "set_pay" && PAY[o.pay_method]) { setOption("pay", o.pay_method, "final"); return proceed("change.pay"); }
    if (o.intent === "set_coupon" && typeof o.coupon === "boolean") { setOption("coupon", o.coupon, "final"); return proceed(o.coupon ? "change.coupon.on" : "change.coupon.off"); }
    if (o.intent === "cancel") { await cancelRide(); return "cancel"; }
    if (o.intent !== "continue") await agentSay(o.reply, { talk: true });
    return "reask";
  }

  return "reask";
}

async function runLowDest(step) {
  await sayBusy(step);
  await doPre(step);
  const corr = step.correction;
  let pending = S.userDest ?? AGENT_PLACE;
  const preempted = S.userDest != null;
  S.phone.pendingDest = pending;
  renderPhone();

  const qLines = preempted ? [corr.lowReask(S, pending)] : resolveMsgs(step.low.messages);
  for (const t of qLines) await agentSay(t);
  let question = qLines.join(" ");
  if (preempted) logEvent("dest_preset", { dest: pending });

  for (;;) {
    const c = await askChoice(step.low.options, question, ["set_dest"]);
    if (c.id === "__reask") {
      if (S.lowPendingOverride != null) { pending = S.lowPendingOverride; S.lowPendingOverride = null; S.phone.pendingDest = pending; renderPhone(); }
      question = corr.lowReask(S, pending);
      await agentSay(question);
      continue;
    }
    S.m.approvals++;
    logEvent("decision", { choice: c.id, via: c.via, pending_dest: pending });
    if (c.id === "approve") break;
    let o = c.id === "set_dest" ? c.out : null;
    if (!o || !PLACES[o.place]) {
      await agentSay(corr.lowAsk(S));
      o = await turn(await waitText(), {
        said: corr.lowAsk(S),
        intents: ["set_dest", "continue", "cancel", "other"],
        hint: `목적지를 말하지 않았으면(잡담, 감정 표현, 목적지 외 요청 등) reply는 발화를 짧게 받아준 뒤 "‘${PLACES[pending].name}’으로 갈까요? 다른 곳이면 말씀해주세요."처럼 현재 목적지로 갈지 묻는 형태로 끝내. 시나리오에 없는 개념을 만들어내지 마.`,
      });
    }
    if (o.intent === "set_dest" && PLACES[o.place]) {
      pending = o.place;
      S.phone.pendingDest = pending;
      renderPhone();
      logEvent("dest_changed", { dest: pending, via: "reject_text" });
      // 거부 후 말한 목적지는 다시 묻지 않고 "‘○○’으로 갈게요." → 바로 진행
      await agentSay(corr.lowConfirm(S, pending), { talk: true });
      break;
    }
    if (o.intent === "continue") break;
    if (o.intent === "cancel") return cancelRide();
    await agentSay(o.reply, { talk: true }); // 목적지 외 요청 → 응답(말풍선) 후 같은 질문의 선택지로 복귀
  }
  S.form.dest = pending;
  S.phone.pendingDest = null;
  S.m.destStepDecision = pending === AGENT_PLACE ? "agent" : "changed";
  await doApply(step, pending); // 승인 후 검색 결과에서 목적지를 누름
  await dwell(1000);
  return true;
}

// ---------- 처음 요청에 없던 정보 묻기 ----------
// 출발지: 처음 요청에서 말했으면 그 곳으로 승인을 묻거나(낮은 자동화) 설정(높은 자동화), 말하지 않았으면 먼저 물음
async function prepOrigin(step) {
  if (manualDone(step) || S.userSet.origin) return "go";
  if (S.req.originName && !S.req.origin) S.req.origin = setCustomOrigin(S.req.originName, S.geo);
  if (S.req.origin) { S.originTarget = S.req.origin; return "go"; }
  if (S.automation === "high") await gate();
  const r = await askOrigin(step, "asked");
  if (r === "cancel") return false;
  if (S.automation === "low") await dwell();
  return true;
}

// 출발지를 어디로 할지 물음 → 말한 곳(동천역 / 현재 위치 / 그 외 장소)으로 다시 묻지 않고 바로 설정
async function askOrigin(step, via) {
  const ask = line("origin.ask", S);
  await agentSay(ask);
  let said = ask;
  for (;;) {
    const o = await turn(await waitText(), {
      said,
      intents: ["set_origin", "cancel", "other"],
      hint: `사용자가 출발지로 할 장소를 말하면 set_origin이야. ‘${ORIGINS[TARGET_ORIGIN].name}’이면 origin=${TARGET_ORIGIN}, 현재 위치면 origin=current, 그 외 장소면 origin=null로 두고 origin_name에 그 장소 이름을 써. 장소를 말하지 않았으면(잡담, 질문 등) other이고, reply는 짧게 받아준 뒤 출발지를 어디로 할지 다시 묻는 형태로 써.`,
      fallback: "출발지를 어디로 할까요?",
      freeOrigin: true,
    });
    logEvent("origin_named", { intent: o.intent, origin: o.origin, via });
    const named = o.intent === "set_origin" && !ORIGINS[o.origin] && o.origin_name ? setCustomOrigin(o.origin_name, S.geo) : null;
    if (o.intent === "set_origin" && (ORIGINS[o.origin] || named)) {
      const k = named || o.origin;
      S.originTarget = k;
      logEvent("origin_changed", { origin: k, name: ORIGINS[k].name, via });
      await sayKey(k === "current" ? "origin.skip" : "origin.confirm", { origin: k }, { talk: true });
      // 동천역이면 실행화면에서 검색해 고르는 과정을 보여줌
      if (k === TARGET_ORIGIN && S.phone.taxiView !== "origin") await doPre(step);
      await doApply(step, k === "current" ? "reject" : k === TARGET_ORIGIN ? "approve" : "custom", { announced: true });
      return "done";
    }
    if (o.intent === "cancel") { await cancelRide(); return "cancel"; }
    said = o.reply;
    await agentSay(o.reply, { talk: true });
  }
}

// 택시 종류(B, 높은 자동화): 처음 요청에서 말하지 않았으면 고르게 함 (말했으면 그대로 설정)
async function askCarHigh(step) {
  await gate();
  const opts = step.low.options;
  const ask = line("car.ask", S);
  await agentSay(ask);
  for (;;) {
    const c = await askChoice(opts, ask, ["set_car"]);
    if (c.id === "__reask") continue;
    const k = CAR_TYPES[c.id] ? c.id : c.out?.car_type;
    if (k && CAR_TYPES[k]) {
      S.req.car = k;
      logEvent("car_named", { car: k, via: c.via });
      await doPre(step);
      await doApply(step, k, { announced: true });
      await sayKey("car.set", { car: k }, { talk: true });
      await dwell();
      return true;
    }
    if (c.out?.intent === "cancel") return cancelRide();
    if (c.out?.reply) await agentSay(c.out.reply, { talk: true });
  }
}

// ---------- 높은 자동화 ----------
async function runHighStep(step) {
  if (step.kind === "password") return runPassword(step, step.high);
  if (step.id === "origin") { const r = await prepOrigin(step); if (r !== "go") return r; }
  if (step.id === "car" && !S.req.car && !S.userSet.car && !manualDone(step)) return askCarHigh(step);
  if (manualDone(step) && step.kind !== "dest") { logEvent("step_done_manually"); return true; }

  let msgs = resolveMsgs(step.high.messages);
  let applyFirst = step.high.applyFirst;
  const isError = String(step.kind).startsWith("error_");

  if (step.kind === "dest") {
    await gate();
    S.form.dest = S.userDest ?? AGENT_PLACE;
    msgs = resolveMsgs(step.high.messages);
  }

  await gate();
  await sayBusy(step);
  await doPre(step);
  // 준비 동작 중 문구가 바뀌었을 수 있으므로(참가자가 값을 바꾼 경우) 오류 단계가 아니면 다시 계산
  if (step.kind !== "dest") msgs = resolveMsgs(step.high.messages);
  const say = async (list) => {
    for (const m of list) {
      await agentSay(m, { gated: true });
      if (isError && S.m.errorShownAt == null) S.m.errorShownAt = now();
    }
  };
  // 단계 간격(S.cfg.delay)은 "문구를 읽는 시간"으로 씀: 문구가 나온 뒤 기다렸다가 다음 조작으로
  const read = async () => { await sleep(S.cfg.delay); await gate(); };
  const split = step.high.split;
  if (split != null) {
    await say(msgs.slice(0, split));
    await gate();
    await doApply(step, undefined, { announced: true });
    await say(msgs.slice(split));
    await read();
  } else if (applyFirst) {
    // 조작 → "~했어요" → 읽는 시간
    await gate();
    await doApply(step, step.kind === "dest" ? S.form.dest : undefined);
    await say(msgs);
    if (!isLastStep(step)) await read();
  } else {
    // "~할게요" → 읽는 시간 → 조작 → 바뀐 화면 잠시 보여주고 다음 단계로
    await say(msgs);
    await read();
    await gate();
    if (step.high.opening && !manualDone(step)) await say(lines(step.high.opening, S)); // 예: "택시 앱을 열고 있어요 …"
    if (!(step.kind === "error_reserve" && S.reserveCancelled)) {
      await doApply(step, undefined, { announced: true });
      if (step.kind === "error_reserve" && S.form.reserved && !S.finished) await say(lines("reserve.yes", S));
    }
    await dwell(900);
  }
  if (step.kind === "done") S.rideDone = true;
  if (isLastStep(step)) return finish("completed");
  return true;
}

// ---------- 결제 비밀번호 (공통 · 직접조작 1회) ----------
// ---------- 비밀번호 (공통) ----------
// 대화창에는 [화면 열기]만 두고, 입력은 택시 앱 전체 화면의 비밀번호 창에서 받음
async function runPassword(step, spec) {
  if (S.automation === "high") await gate();
  S.pwWait = true;
  syncControls();
  await sleep(900 * PACE);
  S.phone.pin = "";
  step.apply(S); // 택시 앱에 비밀번호 입력 창을 띄움 (입력은 [화면 열기] → 앱 화면에서)
  renderPhone();
  for (const m of resolveMsgs(spec.messages)) await agentSay(m, { gated: S.automation === "high" });
  S.lastQuestion = resolveMsgs(spec.messages).join("\n");
  logEvent("pin_open");
  const t = now();
  for (;;) {
    const r = await waitPin();
    if (r.type === "pin") break;
    if (r.type === "reask") continue; // 취소(중지) 후 계속하기 → 다시 비밀번호 입력
    if (S.automation === "high") {
      // 높은 자동화: 말을 걸면 중지로 간주하고 개입 대화 후 다시 대기
      await handleInterjection(r.text);
      if (S.finished) return false;
      continue;
    }
    const o = await turn(r.text, { said: resolveMsgs(spec.messages).join(" "), intents: ["other"] });
    await agentSay(o.reply, { talk: true });
  }
  logEvent("pin_entered", { duration_ms: now() - t, via: S.pinOpen ? "app" : "chat" });
  if (S.pinOpen) { await sleep(600 * PACE); S.pinOpen = false; syncControls(); await sleep(900); }
  renderPinDone();
  S.pwWait = false;
  syncControls();
  // 결제 확인 → [호출] → 주변 택시 찾기
  startCalling(S);
  setStatus("", true);
  await sleep(1200 * PACE);
  return true;
}

// 대화창에 비밀번호 입력 카드를 띄우고 4자리 입력(또는 말)을 기다림
function waitPin() {
  return new Promise((resolve) => {
    S.pinResolve = () => { S.waiter = null; setChips([]); resolve({ type: "pin" }); };
    S.waiter = { resolve: (r) => { S.pinResolve = null; resolve(r); }, options: null, pin: true };
    setChips([]);
    promote(true);
    renderPinCard();
    syncControls();
  });
}

// 대화창에는 [화면 열기] 버튼만 둠 → 누르면 택시 앱 전체 화면으로 넘어가 비밀번호 창에 직접 입력
function renderPinCard() {
  const box = chipsBox();
  box.innerHTML = `<div class="pw-card pw-open">
    <div class="pw-head"><span class="tx-logo">${mi("local_taxi", "fill")}</span><span><b>결제 비밀번호 입력</b><small><span class="ms">lock</span> ${esc(TAXI_APP)} · 마음카드 ****1234</small></span></div>
    <p class="pw-note">비밀번호는 택시 앱에서 직접 입력하고, AI에게 전달되거나 저장되지 않아요.</p>
    <button type="button" class="pw-go"><span class="ms">open_in_new</span> 화면 열기</button>
    <button type="button" class="pw-cancel">취소</button></div>`;
  // 취소: 중지와 같음 → "진행을 멈췄어요. 어떻게 바꿀까요?" (계속하기를 누르면 다시 비밀번호 입력)
  box.querySelector(".pw-cancel").onclick = () => { if (S.pinResolve) handleStop("pin_cancel"); };
  box.querySelector(".pw-go").onclick = () => {
    if (!S.pinResolve) return;
    S.pinOpen = true;
    logEvent("pin_direct");
    renderPhone();
    syncControls();
  };
  scrollChat();
}

function renderPinDone() {
  const div = document.createElement("div");
  div.className = "bubble user pw-done";
  div.innerHTML = '<span class="ms">lock</span> 비밀번호 입력 완료';
  chat().insertBefore(div, $("#chips"));
  scrollChat();
}

function pinPress(k) {
  if (!S?.pinResolve) return;
  if (k === "del") S.phone.pin = S.phone.pin.slice(0, -1);
  else if (S.phone.pin.length < 4) S.phone.pin += k;
  renderPhone();
  if (S.phone.pin.length === 4) {
    const r = S.pinResolve; S.pinResolve = null;
    setTimeout(r, 300);
  }
}

function finish(status) {
  if (S.finished) return false;
  S.finished = true;
  S.running = false;
  S.m.finalDest = S.form.dest;
  // 오류 결과 확정: 세션1은 에이전트가 고른 요청사항이 그대로 남았는지, 세션2는 예약이 등록된 채 끝났는지
  if (status === "completed" && S.m.errorOutcome == null) {
    if (S.session === 1) S.m.errorOutcome = S.form.request === AGENT_REQUEST && !S.requestByUser ? "accepted" : "corrected";
    else if (S.errorIdx >= 0 && S.stepIdx >= S.errorIdx) S.m.errorOutcome = S.form.reserved ? "accepted" : "corrected";
  }
  if (status === "cancelled") S.m.errorOutcome = S.m.errorOutcome ?? "cancelled";
  S.m.finishedAt = now();
  logEvent("session_end", { status, summary: summary() });
  S.status = status;
  // 실행화면을 보고 있었다면 배차 완료 화면을 [확인]을 누를 때까지 그대로 둠 → 누르면 대화창으로
  if (status === "completed" && S.showRun) S.awaitDoneConfirm = true;
  setChips([]);
  promote();
  setCard({ title: "할 일 마무리", status: status === "completed" ? "택시를 호출했어요" : "호출을 취소했어요", thinking: false });
  syncControls();
  saveSession();
  return false;
}

function confirmDone() {
  if (!S?.awaitDoneConfirm) return;
  S.awaitDoneConfirm = false;
  S.showRun = false;
  logEvent("done_confirm");
  saveSession();
  syncControls();
}

// =====================================================================
// 폰 화면
// =====================================================================
function renderStepper() {
  const el = $("#stepper");
  if (!el) return;
  el.innerHTML = S.steps
    .map((s, i) => `<li class="${i < S.stepIdx ? "done" : i === S.stepIdx ? "now" : ""}">${esc(s.label)}</li>`)
    .join("");
}

// =====================================================================
// 연구자 패널: 로그 / 요약 / 내보내기
// =====================================================================
function summary() {
  const m = S.m;
  return {
    session_id: S.sessionId,
    participant_id: S.cfg.pid,
    participant_name: S.cfg.name,
    condition: S.cond,
    session: S.session,
    error_type: SESSIONS[S.session].error,
    complexity: S.complexity,
    automation: S.automation,
    llm: LLM.enabled ? LLM.model : "rules",
    prompt_version: S.promptVersion ?? null,
    script_version: S.scriptVersion ?? null,
    started_at: S.startedAt,
    status: S.status || (S.finished ? "ended" : "in_progress"),
    request_text: m.request?.text ?? null,
    request_dest_parsed: m.request?.destination ?? null,
    error_outcome: m.errorOutcome,
    dest_step_decision: m.destStepDecision ?? null,
    correction_via: m.correctionVia,
    error_response_ms: m.errorResponseMs,
    final_origin: S.form.origin,
    geo_ok: S.geo?.ok ?? null,
    final_dest: m.finalDest,
    final_car: S.form.car,
    final_pay: S.form.pay,
    final_coupon: S.form.coupon,
    driver_request: S.form.request,
    request_changed_by_user: S.requestByUser,
    reserved: S.form.reserved,
    approvals: m.approvals,
    stops: m.stops,
    interjections: m.interjections || 0,
    manual_controls: m.manuals,
    llm_calls: m.llmCalls,
    llm_fallbacks: m.llmFallbacks,
    total_ms: m.finishedAt,
  };
}

function renderSummary() {
  const el = $("#summary");
  if (!el || !S) return;
  const s = summary();
  const label = S.session === 1
    ? { accepted: "수용 (에이전트가 고른 요청사항 그대로)", corrected: "거부·수정", cancelled: "취소" }
    : { accepted: "수용 (예약됨)", corrected: "거부·취소", cancelled: "호출 취소" };
  const items = [
    ["조건", `${S.cond} · 세션${S.session}`],
    ["해석", s.llm],
    ["오류 결과 (최종)", label[s.error_outcome] || "-"],
    ["개입 방식", s.correction_via || "-"],
    ["오류→반응", s.error_response_ms != null ? `${(s.error_response_ms / 1000).toFixed(1)}초` : "-"],
    ["최종 출발지", ORIGINS[s.final_origin].name],
    ["최종 목적지", s.final_dest ? PLACES[s.final_dest].name : "-"],
    ...(S.complexity === "B" ? [["택시 종류·쿠폰", `${CAR_TYPES[s.final_car].label} · 쿠폰 ${s.final_coupon ? "적용" : "안 함"}`]] : []),
    ["승인 응답", s.approvals],
    ["중지 / 직접조작", `${s.stops} / ${s.manual_controls}`],
    ["LLM 호출 (대체)", `${s.llm_calls} (${s.llm_fallbacks})`],
    ["소요 시간", s.total_ms != null ? `${(s.total_ms / 1000).toFixed(1)}초` : "-"],
  ];
  el.innerHTML = items.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("");
}

function renderLogRow(ev) {
  const tb = $("#log tbody");
  if (!tb) return;
  const tr = document.createElement("tr");
  const { t_ms, step, type, at, ...rest } = ev;
  let detail = rest.text ?? "";
  if (type === "interpret") detail = `[${rest.kind}·${rest.source}${rest.latency_ms != null ? ` ${rest.latency_ms}ms` : ""}] “${rest.input}” → ${JSON.stringify(rest.output)}${rest.error ? ` ⚠ ${rest.error}` : ""}`;
  else if (!detail && Object.keys(rest).length) detail = JSON.stringify(rest);
  tr.innerHTML = `<td>${(t_ms / 1000).toFixed(1)}</td><td>${esc(step)}</td><td>${esc(type)}</td><td>${esc(detail)}</td>`;
  tr.className = `ev-${type}`;
  tb.appendChild(tr);
  const wrap = $("#log-wrap");
  wrap.scrollTop = wrap.scrollHeight;
}

function saveSession() {
  const all = store.get("sessions", []);
  const rec = { summary: summary(), log: S.log };
  const i = all.findIndex((x) => x.summary.session_id === S.sessionId);
  if (i >= 0) all[i] = rec; else all.push(rec);
  store.set("sessions", all);
  renderSessionCount();
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function toCSV(rows) {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

function renderSessionCount() {
  $("#session-count").textContent = store.get("sessions", []).length;
}

// =====================================================================
// 설정 화면
// =====================================================================
function readSetup() {
  return {
    pid: $("#pid").value.trim() || "P00",
    name: $("#pname").value.trim() || "OOO",
    condition: document.querySelector('input[name="cond"]:checked').value,
    session: Number(document.querySelector('input[name="session"]:checked')?.value || 1),
    delay: 5000, // 높은 자동화 단계 간격 (고정)
    pace: PACE,
    showTask: true,
  };
}

function applyLLMSettings() {
  // 키와 모델은 key.html(연구자 전용)에서 저장하거나, 키가 담긴 공유 링크로 받음
  LLM.key = store.get("gemini_key", "") || "";
  const savedModel = store.get("gemini_model", DEFAULT_MODEL);
  LLM.model = savedModel === "gemini-2.5-flash" ? DEFAULT_MODEL : savedModel || DEFAULT_MODEL;
  const st = $("#llm-status-text");
  if (st) {
    st.textContent = LLM.enabled ? `Gemini 연결됨 · ${LLM.model}` : "Gemini 연결 안 됨";
    st.classList.toggle("off", !LLM.enabled);
    // 최근 호출이 실패했으면 이유를 함께 (연구자 확인용)
    const le = LLM.enabled ? store.get("llm_last_error", null) : null;
    if (le?.error && Date.now() - Date.parse(le.at) < 24 * 3600 * 1000) st.textContent += ` · 최근 오류: ${le.error.slice(0, 80)}`;
  }
  store.set("gemini_model", LLM.model);
  const chip = $("#llm-chip");
  chip.textContent = LLM.enabled ? `Gemini · ${LLM.model}` : "규칙 기반 해석";
  chip.dataset.on = LLM.enabled ? "1" : "0";
}

// 모바일에서 주소창 없이 전체화면으로 (세션 시작 버튼을 누를 때 요청, 지원하지 않으면 무시)
// 홈 화면에 추가한 앱으로 열었으면 이미 전체화면이라 요청하지 않음
function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  const installed = matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches;
  if (!req || installed || document.fullscreenElement || !matchMedia("(pointer: coarse)").matches) return;
  try { const r = req.call(el, { navigationUI: "hide" }); if (r?.catch) r.catch(() => {}); } catch { /* 무시 */ }
}

function start() {
  enterFullscreen();
  applyLLMSettings();
  const cfg = readSetup();
  store.set("setup", { pid: cfg.pid, name: cfg.name, condition: cfg.condition, session: cfg.session, delay: cfg.delay, showTask: cfg.showTask, pace: cfg.pace });
  S = newSession(cfg);

  const sit = SITUATION[S.complexity];
  $("#task-card").hidden = !cfg.showTask;
  $("#task-situation").innerHTML = sit.situation.map((t) => `<p>${esc(t)}</p>`).join("");
  $("#task-list").innerHTML = sit.task.map((t) => `<li>${esc(t.replace("OOO", cfg.name))}</li>`).join("");
  $("#cond-title").textContent = CONDITIONS[S.cond].title;

  chat().querySelectorAll(".bubble, #run-card").forEach((b) => b.remove());
  $("#chips").innerHTML = "";
  $("#pv-chips").innerHTML = "";
  setStatus("");
  $("#log tbody").innerHTML = "";
  $("#setup").hidden = true;
  $("#stage").hidden = false;
  document.body.classList.add("in-session");
  document.body.classList.remove("drawer-open");
  if (cfg.showTask) openTask(true); // 시작할 때 상황·과업 먼저 보여줌 (모바일)
  renderPhone();
  renderStepper();
  S.promptVersion = LLM.promptVersion;
  S.scriptVersion = scriptVersion(S.cond);
  $("#prompt-live").value = LLM.prompt;
  logEvent("session_start", { session: S.session, condition: S.cond, participant: cfg.pid, llm: LLM.enabled ? LLM.model : "rules", delay_ms: cfg.delay, pace: cfg.pace, prompt_version: LLM.promptVersion, prompt: LLM.prompt, script_version: S.scriptVersion, script_overrides: SCRIPT_OVERRIDES[S.cond] || null });
  locate(); // 휴대폰 현재 위치 (출발지 기본값)
  run().catch((e) => { console.error(e); logEvent("error", { message: String(e) }); });
}

function backToSetup() {
  if (S && !S.finished && S.log.length > 1) {
    if (!confirm("진행 중인 세션을 종료하고 설정 화면으로 돌아갈까요? (로그는 저장돼요)")) return;
    S.status = "aborted";
    S.m.finishedAt = now();
    logEvent("session_end", { status: "aborted" });
    saveSession();
  }
  if (S) S.finished = true;
  S = null;
  $("#stage").hidden = true;
  $("#setup").hidden = false;
  document.body.classList.remove("in-session");
  openTask(false);
}

// =====================================================================
// 프롬프트 편집
// =====================================================================
function setPrompt(text, { from } = {}) {
  LLM.prompt = text;
  if (text.trim() === DEFAULT_PROMPT.trim()) store.del("prompt"); else store.set("prompt", text);
  if (from !== "setup") $("#prompt").value = text;
  if (from !== "live") $("#prompt-live").value = text;
  renderPromptMeta();
}

function renderPromptMeta() {
  const edited = LLM.prompt.trim() !== DEFAULT_PROMPT.trim();
  const meta = `버전 ${LLM.promptVersion} · ${edited ? "수정됨" : "기본값"} · ${LLM.prompt.length.toLocaleString("ko-KR")}자`;
  $("#prompt-live-meta").textContent = meta;
}

function initPrompt() {
  const saved = store.get("prompt", null);
  setPrompt(typeof saved === "string" && saved.trim() ? saved : DEFAULT_PROMPT);
  $("#prompt").oninput = () => setPrompt($("#prompt").value, { from: "setup" });
  $("#btn-prompt-apply").onclick = () => {
    const before = LLM.promptVersion;
    setPrompt($("#prompt-live").value, { from: "live" });
    $("#prompt-apply-msg").textContent = before === LLM.promptVersion ? "바뀐 내용이 없어요" : `버전 ${LLM.promptVersion} 적용됨`;
    $("#prompt-apply-msg").dataset.ok = "1";
    if (S && before !== LLM.promptVersion) logEvent("prompt_changed", { version: LLM.promptVersion, prompt: LLM.prompt });
  };

}

// =====================================================================
// 시나리오 문구 편집
// =====================================================================
let scriptCond = "A1";

function scriptVersion(cond) {
  const o = SCRIPT_OVERRIDES[cond];
  return o && Object.keys(o).length ? promptVersion(JSON.stringify(o)) : "기본";
}

function saveScripts() {
  // 기본값과 같은 항목은 지움
  for (const cond of Object.keys(SCRIPT_OVERRIDES)) {
    const defs = Object.fromEntries(scriptDefaults(cond).map((d) => [d.key, d.text]));
    for (const [k, v] of Object.entries(SCRIPT_OVERRIDES[cond])) if (v === defs[k]) delete SCRIPT_OVERRIDES[cond][k];
    if (!Object.keys(SCRIPT_OVERRIDES[cond]).length) delete SCRIPT_OVERRIDES[cond];
  }
  if (Object.keys(SCRIPT_OVERRIDES).length) store.set("script_overrides", SCRIPT_OVERRIDES);
  else store.del("script_overrides");
}

function renderScriptMeta() {
  const n = Object.keys(SCRIPT_OVERRIDES[scriptCond] || {}).length;
  document.querySelectorAll("#script-tabs button").forEach((b) => {
    const m = Object.keys(SCRIPT_OVERRIDES[b.dataset.cond] || {}).length;
    b.textContent = b.dataset.cond + (m ? " •" : "");
  });
}

function renderScriptEditor() {
  document.querySelectorAll("#script-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.cond === scriptCond));
  let html = "";
  let group = null;
  for (const d of scriptDefaults(scriptCond)) {
    if (d.group !== group) { group = d.group; html += `<div class="script-group">${esc(group)}</div>`; }
    const cur = scriptText(scriptCond, d.key);
    const edited = cur !== d.text;
    html += `<div class="script-row ${edited ? "edited" : ""}" data-key="${d.key}">
      <label><span>${esc(d.label)}</span>${edited ? '<button type="button" class="undo">기본값</button>' : ""}</label>
      <textarea rows="${Math.max(1, cur.split("\n").length)}">${esc(cur)}</textarea></div>`;
  }
  $("#script-list").innerHTML = html;
  const fit = (ta) => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight + 2}px`; };
  $("#script-list").querySelectorAll(".script-row").forEach((row) => {
    const key = row.dataset.key;
    const ta = row.querySelector("textarea");
    requestAnimationFrame(() => fit(ta));
    ta.oninput = () => {
      fit(ta);
      SCRIPT_OVERRIDES[scriptCond] = SCRIPT_OVERRIDES[scriptCond] || {};
      SCRIPT_OVERRIDES[scriptCond][key] = ta.value;
      saveScripts();
      const def = scriptDefaults(scriptCond).find((x) => x.key === key).text;
      row.classList.toggle("edited", ta.value !== def);
      renderScriptMeta();
    };
    const undo = row.querySelector(".undo");
    if (undo) undo.onclick = () => {
      delete SCRIPT_OVERRIDES[scriptCond]?.[key];
      saveScripts();
      renderScriptEditor();
    };
  });
  renderScriptMeta();
}

function initScripts() {
  const saved = store.get("script_overrides", null);
  SCRIPT_OVERRIDES = saved && typeof saved === "object" ? saved : {};
  document.querySelectorAll("#script-tabs button").forEach((b) => (b.onclick = () => { scriptCond = b.dataset.cond; renderScriptEditor(); }));
  renderScriptEditor();
}

// =====================================================================
// 음성 입력 (브라우저 지원 시)
// =====================================================================
function setupMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $("#mic");
  if (!SR) { btn.hidden = true; return; }
  let rec = null;
  btn.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = "ko-KR";
    rec.interimResults = true;
    // 받아 적기만 함: 보내기 버튼을 누를 때까지 보내지 않음 (이미 입력해 둔 글 뒤에 이어 씀)
    const input = $("#msg");
    const base = input.value.trim();
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join("").trim();
      input.value = [base, said].filter(Boolean).join(" ");
      input.dispatchEvent(new Event("input")); // 보내기 버튼 상태 갱신
    };
    rec.onend = () => { rec = null; btn.classList.remove("rec"); };
    rec.onerror = () => { rec = null; btn.classList.remove("rec"); };
    btn.classList.add("rec");
    rec.start();
  };
}

// =====================================================================
// 초기화
// =====================================================================
// ---------- 공유 링크로 API 키 전달 ----------
// 링크 형식: .../#k=<base64url(JSON {k: 키, m: 모델})>
function b64url(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(str) {
  return decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/"))));
}

// 링크(또는 붙여넣은 텍스트)에서 키를 꺼내 저장. 성공하면 true
function saveKeyFrom(text) {
  const m = String(text || "").match(/[#&]k=([\w-]+)/);
  if (!m) return false;
  try {
    const cfg = JSON.parse(unb64url(m[1]));
    if (!cfg.k) return false;
    store.set("gemini_key", cfg.k);
    if (cfg.m) store.set("gemini_model", cfg.m);
    return true;
  } catch {
    return false;
  }
}

function readKeyFromLink() {
  if (!/[#&]k=/.test(location.hash)) return false;
  const ok = saveKeyFrom(location.hash);
  history.replaceState(null, "", location.pathname + location.search); // 주소창에서 키 지움
  return ok;
}

// 키가 없을 때(예: 아이폰에 설치한 앱) 받은 링크를 붙여넣어 키 저장
function setupPasteKey() {
  const box = $("#paste-key");
  // 평소에는 숨기고, 「연결 안 됨」 문구를 누르면 링크 붙여넣기 칸이 열림
  const refresh = () => { applyLLMSettings(); if (LLM.enabled) box.hidden = true; };
  // 키가 없으면 링크 붙여넣기 칸, 키가 있으면 연결 진단 페이지로
  $("#llm-status-text").onclick = () => { if (!LLM.enabled) box.hidden = !box.hidden; else location.href = "key.html"; };
  $("#btn-paste-key").onclick = () => {
    const ok = saveKeyFrom($("#paste-link").value);
    if (!ok) { alert("링크에서 키를 찾지 못했어요. 받은 링크 전체를 붙여넣어 주세요."); return; }
    $("#paste-link").value = "";
    refresh();
  };
  refresh();
}

// ---------- 앱으로 설치 ----------
// 설정 화면 맨 아래: 「웹에서 보기」(세션 시작) + 「앱 설치」
let installEvent = null;
function setupInstall() {
  const big = $("#btn-install-big");
  const hint = $("#install-hint");
  const installed = matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || navigator.standalone;
  if (installed) {
    // 설치한 앱으로 열었으면 설치 버튼 없이 시작 버튼만
    big.hidden = true;
    $("#btn-web").textContent = "세션 시작";
    return;
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e;
  });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const manualText = ios
    ? "사파리 아래 공유 버튼 → 「홈 화면에 추가」를 누르면 앱으로 설치돼요. 설치한 앱을 처음 열면, 받은 링크를 한 번 더 붙여넣어 주세요."
    : "크롬 오른쪽 위 ⋮ 메뉴 → 「홈 화면에 추가」(또는 「앱 설치」)를 누르면 앱으로 설치돼요.";
  big.onclick = async () => {
    if (!installEvent) {
      // 설치 창을 띄울 수 없으면 직접 설치하는 방법을 안내
      hint.textContent = manualText;
      hint.hidden = false;
      return;
    }
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    installEvent = null;
  };
  window.addEventListener("appinstalled", () => {
    big.hidden = true;
    hint.textContent = "설치했어요. 홈 화면의 「AI 택시」 아이콘으로 열어주세요.";
    hint.hidden = false;
  });
}

// 코드의 기본 문구(시나리오 문구·프롬프트)를 새로 정리하면 이 값을 바꿈
// → 브라우저에 저장된 예전 수정본을 지우고 최신 기본값을 쓰게 함 (이후 새로 고친 내용은 다시 저장됨)
const CONTENT_VERSION = "v2-taxi-2026-10-03";
function resetOldContent() {
  if (store.get("content_version", null) === CONTENT_VERSION) return;
  store.del("script_overrides");
  store.del("prompt");
  store.set("content_version", CONTENT_VERSION);
}

function init() {
  resetOldContent();
  readKeyFromLink();
  setupInstall();
  const saved = store.get("setup", {});
  if (saved.pid) $("#pid").value = saved.pid;
  if (saved.name) $("#pname").value = saved.name;
  if (saved.condition) { const r = document.querySelector(`input[name="cond"][value="${saved.condition}"]`); if (r) r.checked = true; }
  if (saved.session) { const r = document.querySelector(`input[name="session"][value="${saved.session}"]`); if (r) r.checked = true; }
  applyLLMSettings();
  setupPasteKey();

  $("#setup-form").onsubmit = (e) => { e.preventDefault(); start(); };
  $("#composer").onsubmit = onSubmit;
  $("#send").addEventListener("click", (e) => {
    if ($("#send").dataset.mode !== "stop" || !S) return;
    e.preventDefault();
    handleStop("button");
  });
  $("#msg").addEventListener("input", syncSendButton);
  $("#btn-stop").onclick = () => S && handleStop("button");
  $("#btn-manual").onclick = () => S && startManual();
  $("#btn-manual-done").onclick = () => {
    if (!S) return;
    if (S.manual) return endManual();
    if (S.pinOpen) { S.pinOpen = false; logEvent("pin_direct_back"); renderPhone(); syncControls(); } // 대화창으로 돌아감 ([화면 열기]로 다시 열 수 있음)
  };
  $("#btn-back").onclick = () => showRun(false);
  $("#btn-task-close").onclick = () => openTask(false);
  $("#task-dim").onclick = () => openTask(false);
  // 연구자 패널: 세션 중에는 상단 제목을 세 번 연속 탭 (또는 Ctrl + .)
  document.querySelectorAll(".secret").forEach((el) => {
    let taps = [];
    el.addEventListener("click", () => {
      const t = Date.now();
      taps = [...taps.filter((x) => t - x < 800), t];
      if (taps.length >= 3) { taps = []; document.body.classList.toggle("drawer-open"); }
    });
  });
  window.addEventListener("resize", fitScreen);
  // 키보드가 올라오면 보이는 영역 높이에 맞춰 화면(입력칸 포함)이 함께 올라오게 함
  const vv = window.visualViewport;
  if (vv) {
    const fitViewport = () => {
      document.documentElement.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      window.scrollTo(0, 0);
      fitScreen();
      scrollChat();
    };
    vv.addEventListener("resize", fitViewport);
    fitViewport();
  }
  // 응답 출처 표시 (연구자 패널, 이 기기에만 저장)
  // 설정 화면과 연구자 패널의 두 스위치를 같이 움직임
  // 큰 글씨 모드 (설정 화면 토글, 이 기기에 저장)
  const bigBox = $("#big-text");
  const setBig = (on) => { store.set("big_text", on); document.body.classList.toggle("big-text", on); if (bigBox) bigBox.checked = on; requestAnimationFrame(() => { if (typeof fitScreen === "function") fitScreen(); }); };
  setBig(Boolean(store.get("big_text", false)));
  if (bigBox) bigBox.onchange = () => setBig(bigBox.checked);
  const srcBoxes = [$("#show-src"), $("#show-src-setup")];
  const setSrc = (on) => { store.set("show_src", on); document.body.classList.toggle("show-src", on); srcBoxes.forEach((b) => (b.checked = on)); };
  setSrc(Boolean(store.get("show_src", false)));
  srcBoxes.forEach((b) => (b.onchange = () => setSrc(b.checked)));
  $("#btn-researcher").onclick = () => document.body.classList.toggle("drawer-open");
  $("#btn-close-drawer").onclick = () => document.body.classList.remove("drawer-open");
  $("#btn-reset").onclick = backToSetup;
  $("#btn-json").onclick = () => S && download(`${S.sessionId}.json`, JSON.stringify({ summary: summary(), log: S.log }, null, 2), "application/json");
  $("#btn-csv").onclick = () => S && download(`${S.sessionId}_events.csv`, toCSV(S.log), "text/csv");
  $("#btn-all").onclick = () => download(`sessions_summary_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(store.get("sessions", []).map((x) => x.summary)), "text/csv");
  $("#btn-clear").onclick = () => { if (confirm("이 브라우저에 저장된 모든 세션 기록을 지울까요?")) { store.del("sessions"); renderSessionCount(); } };
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === ".") document.body.classList.toggle("drawer-open"); });
  setupMic();
  initPrompt();
  initScripts();
  renderSessionCount();
}

document.addEventListener("DOMContentLoaded", init);
