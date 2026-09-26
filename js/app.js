// 시나리오 진행 엔진 + 폰 화면 렌더링 + 연구자 로그
"use strict";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* noop */ } },
};

let S = null; // 현재 세션 상태

// =====================================================================
// 세션 생성
// =====================================================================
function newSession(cfg) {
  const cond = CONDITIONS[cfg.condition];
  const steps = buildSteps(cond.complexity, cfg.name);
  return {
    sessionId: `${cfg.pid || "P"}_${cfg.condition}_${new Date().toISOString().replace(/[:.]/g, "-")}`,
    cfg,
    cond: cfg.condition,
    complexity: cond.complexity,
    automation: cond.automation,
    steps,
    errorIdx: steps.findIndex((s) => s.kind === "error_amount"),
    stepIdx: -1,
    form: { source: "main", recipient: false, amount: null, memo: null },
    phone: { app: "home", popup: false, bankView: "home", focus: null, sheet: null, smsHighlight: false, toast: null, pendingAmount: null, pin: "" },
    running: false,
    paused: false,
    manual: false,
    pinOpen: false,
    finished: false,
    userAmount: null, // 오류 단계 이전에 참가자가 미리 정정한 금액
    waiter: null, // 러너가 참가자 입력을 기다릴 때 {resolve, options}
    ivWaiter: null, // 중지 후 개입 대화가 입력을 기다릴 때
    resumeWaiters: [],
    pinResolve: null,
    popupResolve: null,
    pendingMemo: null,
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
      finalAmount: null,
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

function appendBubble(role, text) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  chat().appendChild(div);
  chat().scrollTop = chat().scrollHeight;
}

// 진행 화면 하단 상태 문구 (최근 에이전트 발화)
function setStatus(text, thinking = false) {
  const el = $("#pv-status");
  if (!el) return;
  if (text != null) el.textContent = text;
  el.classList.toggle("thinking", thinking);
}

function showTyping(on) {
  let t = $("#typing");
  if (on && !t) {
    t = document.createElement("div");
    t.id = "typing";
    t.className = "bubble agent typing";
    t.innerHTML = "<span></span><span></span><span></span>";
    chat().appendChild(t);
    chat().scrollTop = chat().scrollHeight;
  } else if (!on && t) t.remove();
  setStatus(null, on);
}

// gated=true: 러너가 말할 때. 중지 중이면 재개될 때까지 기다렸다가 말함
async function agentSay(text, { gated = false } = {}) {
  const typingMs = Math.min(1200, 350 + text.length * 12);
  for (;;) {
    if (gated) await gate();
    if (S.finished && gated) return;
    showTyping(true);
    await sleep(typingMs);
    showTyping(false);
    if (!gated || !S.paused) break;
  }
  appendBubble("agent", text);
  // 진행 화면 문구: 같은 단계의 연속 문구는 최근 2개까지 함께 보여줌 (예: "최종 확인해주세요" + 송금 내용)
  const same = S.statusStep === S.stepIdx && S.statusLines;
  S.statusLines = same ? [...S.statusLines, text].slice(-2) : [text];
  S.statusStep = S.stepIdx;
  setStatus(S.statusLines.join("\n"));
  logEvent("agent_message", { text });
}

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
  const isList = opts.length >= 2 && !opts.every((o) => o.id === "approve" || o.id === "reject");
  ["#chips", "#pv-chips"].forEach((sel) => {
    const box = $(sel);
    box.innerHTML = "";
    let parent = box;
    if (isList) {
      parent = document.createElement("div");
      parent.className = "choice-list";
      box.appendChild(parent);
    }
    opts.forEach((o) => {
      const b = document.createElement("button");
      b.type = "button";
      if (isList) {
        b.className = "choice chip";
        b.innerHTML = `<span class="c-main"><b>${esc(o.label)}</b>${o.desc ? `<small>${esc(o.desc)}</small>` : ""}</span><span class="c-go">›</span>`;
      } else {
        b.className = `chip ${o.id === "reject" ? "chip-ghost" : ""}`;
        b.textContent = o.label;
      }
      b.onclick = () => onPick(o);
      parent.appendChild(b);
    });
  });
  syncControls();
}

// 러너가 선택지를 제시하고 답을 기다림 (버튼 or 자유 발화)
function waitRunnerInput(options) {
  return new Promise((resolve) => {
    S.waiter = { resolve, options };
    S.chatOpen = false; // 단순 선택은 대화창을 닫고 축소 화면 아래 버튼으로 노출
    setChips(options, (o) => {
      if (S.paused || !S.waiter) return;
      S.waiter = null;
      setChips([]);
      appendBubble("user", o.label);
      logEvent("user_button", { choice: o.id, label: o.label });
      resolve({ type: "button", id: o.id });
    });
    syncControls();
  });
}

// 선택지를 제시하고 답을 받음. 텍스트면 LLM으로 해석하고, 스크립트 밖 말이면 LLM 응답 후 다시 대기
// extra: 선택지 외에 이 단계에서 바로 받아들일 의도 (예: set_amount)
async function askChoice(options, said, extra = [], hint) {
  for (;;) {
    const r = await waitRunnerInput(options);
    if (r.type === "button") return { id: r.id, via: "button" };
    const ids = options.map((o) => o.id);
    const o = await turn(r.text, { said, intents: [...ids, ...extra, "other"], hint });
    if (ids.includes(o.intent) || extra.includes(o.intent)) return { id: o.intent, via: "text", text: r.text, out: o };
    await agentSay(o.reply);
  }
}

function waitText() {
  return new Promise((resolve) => {
    S.waiter = { resolve, options: null };
    setChips([]);
    syncControls();
  }).then((r) => r.text);
}

function formSnapshot() {
  return {
    source_account: ACCOUNTS[S.form.source].label,
    recipient: rcpt(S),
    amount_won: S.form.amount ?? S.phone.pendingAmount ?? S.userAmount ?? null,
    memo: S.form.memo ?? null,
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
async function turn(text, { said, intents, hint, fallback, fallbackBy, appKeywords }) {
  const step = S.steps[S.stepIdx];
  const res = await interpret("turn", text, {
    automation: S.automation === "high" ? "높은 자동화" : "낮은 자동화",
    step: step ? `${S.stepIdx + 1}. ${step.label}` : "과업 요청",
    step_guide: step?.guide || null,
    agent_said: said,
    current_transfer: formSnapshot(),
    recent: recentDialog(),
    intents,
    reply_hint: hint || null,
    fallback_reply: fallback || null,
    fallback_by_intent: fallbackBy || null,
    app_keywords: appKeywords || null,
  });
  return res.output;
}

async function interpret(kind, text, context) {
  showTyping(true);
  const res = await LLM.interpret(kind, text, context);
  showTyping(false);
  S.m.llmCalls++;
  if (res.source === "rules" && LLM.enabled) S.m.llmFallbacks++;
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

function syncControls() {
  if (!S) return;
  const canTalk =
    !S.finished && !S.manual &&
    (S.ivWaiter || (S.waiter && !S.paused) || (S.automation === "high" && S.running && !S.paused && !S.pinOpen));
  $("#msg").disabled = !canTalk;
  $("#send").disabled = !canTalk;
  $("#mic").disabled = !canTalk;
  $("#msg").placeholder = canTalk ? "AI에게 말하기…" : S.finished ? "과업이 끝났어요" : S.manual ? "직접 조작 중이에요" : "AI가 작업 중이에요";
  document.querySelectorAll("#chips .chip, #pv-chips .chip").forEach((b) => (b.disabled = S.paused));

  const high = S.automation === "high";
  const live = high && S.running && !S.finished && !S.pinOpen;
  $("#btn-stop").hidden = !high;
  $("#btn-manual").hidden = !high;
  $("#btn-stop").disabled = !live || S.paused;
  $("#btn-manual").disabled = !live || S.paused;
  $("#pv-title").textContent = S.finished ? "작업 완료" : S.paused && !S.manual ? "작업 멈춤" : "작업 진행 중";
  syncView();
}

// 화면 전환
// - direct  : 직접 작업·비밀번호 입력·팝업 직접 닫기 → 앱 화면을 실제 크기로
// - chat    : 말로 답해야 할 때(과업 요청, "어떻게 바꿀까요?" 등) → 대화창 전체 화면
// - progress: 그 외 → 앱 화면을 축소해 진행 상황을 보여주고, 단순 선택은 버튼으로 바로 노출
function wantedView() {
  if (!S) return "chat";
  if (S.manual || S.pinOpen || S.phone.popupClosable) return "direct";
  if (S.ivWaiter) return "chat";
  if (S.waiter && !S.waiter.options) return "chat";
  if (!S.running || S.finished) return "chat";
  if (S.phone.app === "home") return "chat"; // 첫 앱을 열기 전에는 폰 홈 화면 대신 대화창에서 진행
  return S.chatOpen ? "chat" : "progress"; // 참가자가 직접 대화창을 연 경우에만 대화창
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
    phone.dataset.view = v;
    if (S) logEvent("view", { view: v });
    chat().scrollTop = chat().scrollHeight;
    if (zoom) {
      fitScreen();
      animateZoom(clip, before);
    }
  }
  requestAnimationFrame(fitScreen);
  const bar = $("#direct-msg");
  if (bar && S) {
    bar.textContent = S.manual ? "직접 조작 중이에요. 다 고치셨으면 AI에게 맡겨주세요." : S.pinOpen ? "계좌 비밀번호를 직접 입력해주세요." : "팝업 내용을 보시고 직접 닫아주세요.";
    $("#btn-manual-done").hidden = !S.manual;
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
    const scale = Math.max(0.3, Math.min(0.72, (box.clientHeight - 36) / H, (box.clientWidth * 0.88) / W));
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
  el.style.transition = "transform .7s cubic-bezier(.2, .8, .2, 1), border-radius .7s";
  el.style.transform = "";
  const done = () => { el.style.transition = ""; el.style.transform = ""; el.removeEventListener("transitionend", done); };
  el.addEventListener("transitionend", done);
}

function openTask(on) {
  $("#task-card").classList.toggle("open", on);
  $("#task-dim").classList.toggle("open", on);
  if (S) logEvent(on ? "task_open" : "task_close");
}

function openChat(on) {
  if (!S) return;
  S.chatOpen = on;
  logEvent(on ? "chat_open" : "chat_close");
  syncView();
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

function errorPassed() {
  return S.stepIdx >= S.errorIdx && S.m.errorShownAt != null;
}

function setAmount(amt) {
  if (S.stepIdx >= S.errorIdx) {
    S.form.amount = amt;
    if (errorPassed() && S.m.errorOutcome == null) S.m.errorOutcome = "corrected";
  } else {
    S.userAmount = amt;
  }
  renderPhone();
}

// 높은 자동화에서 말한 내용 해석. 수정 요청은 반영하고, 그 외에는 짧게 응답한 뒤 진행 상황을 알리고 계속 진행
function highIntents() {
  return ["set_amount", ...(S.complexity === "B" ? ["set_memo"] : []), "set_source", "pause", "continue", "cancel", "other"];
}
const HIGH_HINT =
  "높은 자동화에서는 사용자의 답을 기다리지 않고 자동으로 진행해. other/continue이면 reply는 발화를 짧게 받아준 뒤 현재 진행 상황을 알리는 형태로 끝내고, 승인을 묻지 마.";

async function applyHighChange(o, via) {
  if (o.intent === "set_amount" && o.amount_won) {
    setAmount(o.amount_won);
    logEvent("amount_changed", { amount: o.amount_won, via });
    await sayKey("change.amount", { amount: o.amount_won });
    return true;
  }
  if (o.intent === "set_memo" && o.memo) {
    setMemo(o.memo, via);
    await sayKey("change.memo", { memo: o.memo });
    return true;
  }
  if (o.intent === "set_source" && o.source_account) {
    S.form.source = o.source_account;
    logEvent("source_changed", { source: o.source_account, via });
    renderPhone();
    await sayKey("change.source");
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
  const o = await turn(text, { said, intents: highIntents(), hint: HIGH_HINT, fallback: "네, 송금을 이어서 진행할게요." });
  if (["set_amount", "set_memo", "set_source"].includes(o.intent)) {
    S.m.stops++;
    markIntervention("stop_text");
    logEvent("stop", { via: "text" });
    if (await applyHighChange(o, "stop_text")) return resume();
  }
  if (o.intent === "pause") {
    S.paused = false;
    return handleStop("text");
  }
  if (o.intent === "cancel") return cancelTransfer();
  await agentSay(o.reply);
  resume();
}

// 중지 버튼(또는 "멈춰") → "진행을 멈췄어요. 어떻게 바꿀까요?" 후 개입 대화
async function handleStop(via) {
  if (S.paused || S.finished) return;
  S.paused = true;
  S.m.stops++;
  markIntervention(`stop_${via}`);
  logEvent("stop", { via });
  showTyping(false);
  syncControls();

  let said = await sayKey("stop.ask");
  for (;;) {
    const text = await new Promise((r) => { S.ivWaiter = r; syncControls(); });
    const o = await turn(text, {
      said,
      intents: highIntents().filter((x) => x !== "pause"),
      hint: HIGH_HINT + " 사용자가 중지 버튼으로 진행을 멈춘 상태야. 바꿀 내용이 분명하지 않은 말이면 reply로 짧게 응답하고 이어서 진행한다고 알려.",
    });
    if (await applyHighChange(o, `stop_${via}`)) break;
    if (o.intent === "cancel") return cancelTransfer();
    if (o.intent === "continue") { await sayKey("stop.continue"); break; }
    said = o.reply;
    await agentSay(o.reply);
    break; // 높은 자동화: 응답 후 진행 재개
  }
  resume();
}

function setMemo(memo, via) {
  const memoIdx = S.steps.findIndex((s) => s.id === "memo");
  if (S.stepIdx >= memoIdx) S.form.memo = memo;
  else S.pendingMemo = memo;
  logEvent("memo_changed", { memo, via });
  renderPhone();
}

async function cancelTransfer() {
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
  S.manualSnapshot = { ...S.form, sheet: S.phone.sheet };
  S.manualAmount = String(S.form.amount ?? S.phone.pendingAmount ?? S.userAmount ?? "");
  S.manualMemo = null;
  S.phone.sheet = null; // 확인 시트가 떠 있으면 내려서 수정 가능하게
  showTyping(false);
  renderPhone();
  syncControls();
}

async function endManual() {
  if (!S.manual) return;
  const snap = S.manualSnapshot;
  const changes = {};
  const v = Number(S.manualAmount || 0);
  const cur = S.form.amount ?? S.userAmount ?? null;
  if (S.phone.app === "bank" && v && v !== cur) { changes.amount = v; setAmount(v); }
  if (S.manualMemo != null && S.manualMemo !== (S.form.memo ?? "")) { changes.memo = S.manualMemo; setMemo(S.manualMemo, "manual"); }
  if (S.form.source !== snap.source) { changes.source = S.form.source; S.phone.tapped = S.form.source; }
  S.phone.sheet = snap.sheet;
  S.manual = false;
  logEvent("manual_end", { changes });
  syncControls();
  renderPhone();
  await sayKey("manual.resume");
  resume();
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
    if (o.is_transfer_request && !(o.amount_won == null && o.clarification)) {
      S.m.request = { text, ...o };
      break;
    }
    await agentSay(o.clarification || "송금하실 분과 금액을 말씀해주세요.");
  }

  S.running = true;
  syncControls();

  // 2) 단계 진행
  for (let i = 0; i < S.steps.length; i++) {
    if (S.finished) return;
    S.stepIdx = i;
    const step = S.steps[i];
    logEvent("step_start", { label: step.label });
    renderStepper();
    const ok = S.automation === "low" ? await runLowStep(step) : await runHighStep(step);
    if (!ok || S.finished) return;
    await sleep(S.automation === "high" ? S.cfg.delay : 500);
  }
}

const resolveMsgs = (m) => (typeof m === "function" ? m(S) : m);

// ---------- 낮은 자동화 ----------
// 거부 유형별로 선택지 단계에서 바로 받아들일 수 있는 의도
const REJECT_EXTRA = {
  account: ["find_other", "set_account", "direct_input"],
  memo: ["set_memo"],
  final: ["set_amount", "set_memo", "set_source", "cancel"],
};

async function runLowStep(step) {
  if (step.kind === "password") return runPassword(step, step.low);
  if (step.kind === "error_amount") return runLowAmount(step);

  let repeat = true;
  for (;;) {
    const msgs = resolveMsgs(step.low.messages);
    if (repeat) for (const m of msgs) await agentSay(m);
    repeat = true;
    if (!step.low.options) { step.apply(S); renderPhone(); break; }

    let extra = REJECT_EXTRA[step.low.reject] || [];
    if (step.low.reject === "final" && S.complexity !== "B") extra = extra.filter((x) => x !== "set_memo");
    const c = await askChoice(step.low.options, msgs.join(" "), extra);
    S.m.approvals++;
    logEvent("decision", { choice: c.id, via: c.via });
    if (c.id !== "reject" && step.low.options.some((o) => o.id === c.id)) {
      step.apply(S, c.id);
      renderPhone();
      break;
    }
    const r = await handleReject(step, c, msgs.join(" "));
    if (r === "cancel") return false;
    if (r === "done") break;
    if (r === "reask") repeat = false; // 같은 질문의 선택지로 돌아감 (문구 반복 없이)
    // "retry": 바뀐 내용으로 같은 단계 문구를 다시 보여줌
  }
  if (step.kind === "done") return finish("completed");
  return true;
}

// 거부 후 처리. 반환: "done" | "retry" | "reask" | "cancel"
async function handleReject(step, c, said) {
  const type = step.low.reject;
  let o = c.id !== "reject" ? c.out : null; // 선택지 단계에서 이미 구체적인 요청을 말한 경우

  if (type === "app") {
    // 지정된 앱이 아닌 다른 앱(다른 은행 앱 포함)을 말하면 그 앱으로는 할 수 없다고 알리고 지정된 앱 실행을 다시 물음
    const app = step.low.app;
    const ask = line("app.which", S);
    const launch = async () => {
      await sayKey(step.low.launched);
      step.apply(S);
      renderPhone();
      return "done";
    };
    const opts = {
      intents: ["approve", "unsuitable_app", "other"],
      hint:
        `지정된 앱은 ${app.target}이고, 이 단계의 목적은 ${app.purpose}이야. 사용자가 ${app.target}을 실행하라고 하면 approve야. ` +
        `그 외의 앱(다른 은행 앱 포함)을 말하면 unsuitable_app이고, reply는 그 앱으로는 ${app.purpose}을 할 수 없다는 사실을 알린 뒤 ${app.target}을 실행할지 묻는 형태로 써.`,
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
      await agentSay(o.reply);
      const c = await askChoice(APPROVE, said, ["unsuitable_app"], opts.hint);
      if (c.id === "approve") return launch();
      if (c.id === "reject") { await agentSay(ask); said = ask; o = null; continue; }
      o = c.out;
    }
  }

  if (type === "account") {
    const ask = line("account.ask", S);
    if (!o) await agentSay(ask);
    for (;;) {
      if (!o) {
        o = await turn(await waitText(), {
          said: ask,
          intents: ["find_other", "set_account", "direct_input", "approve", "cancel", "other"],
          hint: "approve는 원래 제안한 김영숙님 계좌로 하겠다는 뜻이야. 계좌번호를 말하면 set_account야. find_other이면 reply는 찾은 계좌가 같은 계좌(김영숙, 농협 302-1234-5678)라는 사실과 계좌번호를 직접 말해도 된다는 것을 알리고, 이 계좌로 송금할지 묻는 형태로 써.",
          fallbackBy: { find_other: "찾은 계좌는 김영숙님(농협 302-1234-5678) 계좌뿐이고, 계좌번호를 직접 말씀해주셔도 돼요. 이 계좌로 송금할까요?" },
        });
      }
      if (o.intent === "find_other") {
        // 다른 계좌를 찾아도 같은 계좌만 나옴 → 같은 계좌와 직접 입력 가능을 안내하고 승인을 다시 물음
        logEvent("find_other_account");
        await agentSay(o.reply);
        return "reask";
      }
      if (o.intent === "set_account" && o.account_number) {
        S.form.recipientCustom = o.account_number;
        logEvent("recipient_changed", { account: o.account_number });
        await sayKey("account.custom", { account: o.account_number });
        step.apply(S);
        renderPhone();
        return "done";
      }
      if (o.intent === "direct_input") {
        await sayKey("account.direct");
        o = null;
        continue;
      }
      if (o.intent === "approve") { step.apply(S); renderPhone(); return "done"; }
      if (o.intent === "cancel") { await cancelTransfer(); return "cancel"; }
      await agentSay(o.reply);
      o = null;
    }
  }

  if (type === "popup") {
    const r = await turn(c.via === "button" ? "(참가자가 ‘거부’ 버튼을 눌렀어요)" : c.text, {
      said,
      intents: ["other"],
      hint: "참가자가 도우미에게 팝업을 닫지 말라고 했습니다. 알겠다고 하고, 팝업 내용을 보시고 화면에서 직접 닫으시면 이어서 진행하겠다고 안내하세요.",
      fallback: "알겠어요. 팝업 내용을 보시고 직접 닫으시면 이어서 진행할게요.",
    });
    await agentSay(r.reply);
    for (;;) {
      const res = await waitPopupClose();
      if (res.type === "click") {
        logEvent("popup_closed_by_user");
        break;
      }
      const t = await turn(res.text, {
        said: r.reply,
        intents: ["approve", "other"],
        hint: "approve는 도우미에게 팝업을 대신 닫아달라는 뜻입니다.",
      });
      if (t.intent === "approve") {
        await sayKey("popup.closed");
        break;
      }
      await agentSay(t.reply);
    }
    step.apply(S);
    renderPhone();
    return "done";
  }

  if (type === "memo") {
    const ask = line(step.low.ask, S);
    if (!o) await agentSay(ask);
    for (;;) {
      if (!o) {
        o = await turn(await waitText(), {
          said: ask,
          intents: ["set_memo", "continue", "cancel", "other"],
          hint: "memo에는 받는 분 통장에 남길 문구만 따옴표 없이 넣으세요. continue는 원래 메모대로 하겠다는 뜻입니다.",
        });
      }
      if (o.intent === "set_memo" && o.memo) {
        S.pendingMemo = o.memo;
        logEvent("memo_changed", { memo: o.memo, via: "reject_text" });
        return "retry";
      }
      if (o.intent === "continue") return "reask";
      if (o.intent === "cancel") { await cancelTransfer(); return "cancel"; }
      await agentSay(o.reply);
      o = null;
    }
  }

  if (type === "final") {
    const ask = line(step.low.ask, S);
    if (!o) await agentSay(ask);
    if (!o) {
      o = await turn(await waitText(), {
        said: ask,
        intents: ["set_amount", ...(S.complexity === "B" ? ["set_memo"] : []), "set_source", "continue", "cancel", "other"],
        hint: "바꿀 수 있는 것은 송금액, 출금 계좌" + (S.complexity === "B" ? ", 메모" : "") + "입니다. 그 외 요청이면 짧게 답하고 최종 확인 단계로 자연스럽게 돌아오세요.",
      });
    }
    if (o.intent === "set_amount" && o.amount_won) {
      if (S.m.correctionVia == null && S.form.amount === ERROR_AMOUNT && o.amount_won !== ERROR_AMOUNT) S.m.correctionVia = "final_text";
      setAmount(o.amount_won);
      logEvent("amount_changed", { amount: o.amount_won, via: "final" });
      return "retry";
    }
    if (o.intent === "set_memo" && o.memo) { setMemo(o.memo, "final"); return "retry"; }
    if (o.intent === "set_source" && o.source_account) {
      S.form.source = o.source_account;
      logEvent("source_changed", { source: o.source_account, via: "final" });
      renderPhone();
      return "retry";
    }
    if (o.intent === "cancel") { await cancelTransfer(); return "cancel"; }
    if (o.intent !== "continue") await agentSay(o.reply);
    return "reask";
  }

  return "reask";
}

// 참가자가 팝업의 '닫기'를 직접 누르거나, 말로 답할 때까지 대기
function waitPopupClose() {
  return new Promise((resolve) => {
    const done = (r) => { S.popupResolve = null; S.waiter = null; S.phone.popupClosable = false; renderPhone(); syncControls(); resolve(r); };
    S.phone.popupClosable = true;
    S.popupResolve = () => done({ type: "click" });
    S.waiter = { resolve: (r) => done(r), options: null };
    setChips([]);
    renderPhone();
    syncControls();
  });
}

async function runLowAmount(step) {
  const corr = step.correction;
  let pending = S.userAmount ?? ERROR_AMOUNT;
  const preempted = S.userAmount != null;
  S.phone.pendingAmount = pending;
  S.phone.bankView = "amount";
  renderPhone();

  const qLines = preempted ? [corr.lowConfirm(S, pending)] : resolveMsgs(step.low.messages);
  for (const t of qLines) await agentSay(t);
  let question = qLines.join(" ");
  if (!preempted) S.m.errorShownAt = now();
  else logEvent("error_preempted", { amount: pending });

  for (;;) {
    const c = await askChoice(step.low.options, question, ["set_amount"]);
    S.m.approvals++;
    logEvent("decision", { choice: c.id, via: c.via, pending_amount: pending });
    if (c.id === "approve") {
      if (S.m.errorShownAt != null && S.m.errorResponseMs == null) S.m.errorResponseMs = now() - S.m.errorShownAt;
      break;
    }
    if (S.m.errorShownAt != null && S.m.correctionVia == null) {
      S.m.errorResponseMs = now() - S.m.errorShownAt;
      S.m.correctionVia = c.id === "set_amount" ? "reject_text" : `reject_${c.via}`;
    }
    let o = c.id === "set_amount" ? c.out : null;
    if (!o) {
      await agentSay(corr.lowAsk(S));
      o = await turn(await waitText(), {
        said: corr.lowAsk(S),
        intents: ["set_amount", "continue", "cancel", "other"],
        hint: "금액 외의 것을 바꾸고 싶다고 하면 그 말에 짧게 답하고, 지금은 송금액을 입력하는 단계라는 흐름으로 자연스럽게 돌아오세요.",
      });
    }
    if (o.intent === "set_amount" && o.amount_won) {
      pending = o.amount_won;
      S.phone.pendingAmount = pending;
      renderPhone();
      logEvent("amount_changed", { amount: pending, via: "reject_text" });
      question = corr.lowConfirm(S, pending);
      await agentSay(question);
      continue;
    }
    if (o.intent === "continue") break;
    if (o.intent === "cancel") return cancelTransfer();
    await agentSay(o.reply); // 금액 외 요청 → 응답 후 같은 질문의 선택지로 복귀
  }
  S.form.amount = pending;
  S.phone.pendingAmount = null;
  S.m.amountStepDecision = pending === ERROR_AMOUNT ? "accepted" : "corrected";
  step.apply(S);
  renderPhone();
  return true;
}

// ---------- 높은 자동화 ----------
async function runHighStep(step) {
  if (step.kind === "password") return runPassword(step, step.high);

  let msgs = resolveMsgs(step.high.messages);
  let applyFirst = step.high.applyFirst;

  if (step.kind === "error_amount") {
    await gate();
    if (S.userAmount != null) {
      S.form.amount = S.userAmount;
      msgs = lines("change.amount", S, { amount: S.userAmount });
      logEvent("error_preempted", { amount: S.userAmount });
    } else {
      S.form.amount = ERROR_AMOUNT;
    }
    S.phone.bankView = "amount";
    renderPhone();
    await sleep(700); // 금액이 입력되는 화면을 잠깐 보여줌
    applyFirst = true;
  }

  if (applyFirst) {
    await gate();
    step.apply(S);
    renderPhone();
  }
  for (const m of msgs) {
    await agentSay(m, { gated: true });
    if (step.kind === "error_amount" && S.userAmount == null && S.m.errorShownAt == null) S.m.errorShownAt = now();
  }
  if (!applyFirst) {
    await gate();
    step.apply(S);
    renderPhone();
  }
  if (step.kind === "done") return finish("completed");
  return true;
}

// ---------- 비밀번호 (직접조작, 공통) ----------
async function runPassword(step, spec) {
  for (const m of resolveMsgs(spec.messages)) await agentSay(m, { gated: S.automation === "high" });
  for (;;) {
    const r = await waitRunnerInput([{ id: "open", label: "화면 열기" }]);
    if (r.type === "button") break;
    if (S.automation === "high") {
      // 높은 자동화: 말을 걸면 중지로 간주하고 개입 대화 후 다시 대기
      await handleInterjection(r.text);
      if (S.finished) return false;
      continue;
    }
    const o = await turn(r.text, { said: resolveMsgs(spec.messages).join(" "), intents: ["open", "other"] });
    if (o.intent === "open") break;
    await agentSay(o.reply);
  }
  // 화면 열기 → 잠깐 뒤 실제 크기 화면으로 천천히 전환, 비밀번호 창은 그다음 아래에서 올라옴
  setStatus("비밀번호 입력 화면을 여는 중이에요", true);
  await sleep(600);
  setStatus(null, false);
  S.pinOpen = true;
  syncControls();
  S.phone.pin = "";
  step.apply(S);
  renderPhone();
  logEvent("pin_open");
  const t = now();
  await new Promise((r) => (S.pinResolve = r));
  logEvent("pin_entered", { duration_ms: now() - t });
  S.phone.sheet = "sending";
  renderPhone();
  await sleep(1200);
  // 이 시점에 오류 결과 확정
  S.m.errorOutcome = S.form.amount === ERROR_AMOUNT ? "accepted" : "corrected";
  return true;
}

function pinPress(k) {
  if (!S?.pinOpen || !S.pinResolve) return;
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
  S.m.finalAmount = S.form.amount;
  if (status === "cancelled") S.m.errorOutcome = S.m.errorOutcome ?? "cancelled";
  S.m.finishedAt = now();
  logEvent("session_end", { status, summary: summary() });
  S.status = status;
  setChips([]);
  syncControls();
  saveSession();
  return false;
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
    complexity: S.complexity,
    automation: S.automation,
    llm: LLM.enabled ? LLM.model : "rules",
    prompt_version: S.promptVersion ?? null,
    script_version: S.scriptVersion ?? null,
    started_at: S.startedAt,
    status: S.status || (S.finished ? "ended" : "in_progress"),
    request_text: m.request?.text ?? null,
    request_amount_parsed: m.request?.amount_won ?? null,
    error_outcome: m.errorOutcome,
    amount_step_decision: m.amountStepDecision ?? null,
    correction_via: m.correctionVia,
    error_response_ms: m.errorResponseMs,
    final_amount: m.finalAmount,
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
  const label = { accepted: "수용 (10만원 그대로)", corrected: "거부·수정", cancelled: "취소" };
  const items = [
    ["조건", S.cond],
    ["해석", s.llm],
    ["오류 결과 (최종)", label[s.error_outcome] || "-"],
    ["개입 방식", s.correction_via || "-"],
    ["오류→반응", s.error_response_ms != null ? `${(s.error_response_ms / 1000).toFixed(1)}초` : "-"],
    ["최종 금액", s.final_amount != null ? won(s.final_amount) : "-"],
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
    delay: Math.max(500, Number($("#delay").value) || 2500),
    showTask: $("#show-task").checked,
  };
}

function applyLLMSettings() {
  LLM.key = $("#api-key").value.trim();
  LLM.model = $("#model").value.trim() || DEFAULT_MODEL;
  if ($("#remember-key").checked) store.set("gemini_key", LLM.key); else store.del("gemini_key");
  store.set("gemini_model", LLM.model);
  const chip = $("#llm-chip");
  chip.textContent = LLM.enabled ? `Gemini · ${LLM.model}` : "규칙 기반 해석";
  chip.dataset.on = LLM.enabled ? "1" : "0";
}

async function testConnection() {
  applyLLMSettings();
  const out = $("#llm-test");
  if (!LLM.enabled) { out.textContent = "API 키를 입력해주세요."; out.dataset.ok = "0"; return; }
  out.textContent = "확인 중…"; out.dataset.ok = "";
  const t = performance.now();
  try {
    const r = await LLM.interpret("request", "주거래 통장에서 동창회 총무한테 삼십만원 보내줘", { condition: "A1" });
    if (r.source !== "gemini") throw new Error(r.error || "실패");
    out.textContent = `연결됨 · ${Math.round(performance.now() - t)}ms · 금액 ${r.output.amount_won?.toLocaleString("ko-KR")}원으로 해석`;
    out.dataset.ok = "1";
  } catch (e) {
    out.textContent = `실패: ${e.message}`;
    out.dataset.ok = "0";
  }
}

async function loadModels() {
  const key = $("#api-key").value.trim();
  const out = $("#llm-test");
  if (!key) { out.textContent = "API 키를 먼저 입력해주세요."; out.dataset.ok = "0"; return; }
  out.textContent = "모델 목록 불러오는 중…"; out.dataset.ok = "";
  try {
    const names = await LLM.listModels(key);
    $("#model-list").innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
    out.textContent = `${names.length}개 모델을 찾았어요. 모델 칸을 눌러 고르세요.`;
    out.dataset.ok = "1";
  } catch (e) {
    out.textContent = `실패: ${e.message}`;
    out.dataset.ok = "0";
  }
}

function start() {
  applyLLMSettings();
  const cfg = readSetup();
  store.set("setup", { pid: cfg.pid, name: cfg.name, condition: cfg.condition, delay: cfg.delay, showTask: cfg.showTask });
  S = newSession(cfg);

  const sit = SITUATION[S.complexity];
  $("#task-card").hidden = !cfg.showTask;
  $("#task-situation").innerHTML = sit.situation.map((t) => `<p>${esc(t)}</p>`).join("");
  $("#task-list").innerHTML = sit.task.map((t) => `<li>${esc(t.replace("OOO", cfg.name))}</li>`).join("");
  $("#cond-title").textContent = CONDITIONS[S.cond].title;

  chat().innerHTML = "";
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
  logEvent("session_start", { condition: S.cond, participant: cfg.pid, llm: LLM.enabled ? LLM.model : "rules", delay_ms: cfg.delay, prompt_version: LLM.promptVersion, prompt: LLM.prompt, script_version: S.scriptVersion, script_overrides: SCRIPT_OVERRIDES[S.cond] || null });
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
  $("#prompt-meta").textContent = meta;
  $("#prompt-live-meta").textContent = meta;
}

function initPrompt() {
  const saved = store.get("prompt", null);
  setPrompt(typeof saved === "string" && saved.trim() ? saved : DEFAULT_PROMPT);
  $("#prompt").oninput = () => setPrompt($("#prompt").value, { from: "setup" });
  $("#btn-prompt-reset").onclick = () => {
    if (LLM.prompt.trim() === DEFAULT_PROMPT.trim() || confirm("수정한 프롬프트를 지우고 기본값으로 되돌릴까요?")) setPrompt(DEFAULT_PROMPT);
  };
  $("#btn-prompt-save").onclick = () => download(`prompt_${LLM.promptVersion}.txt`, LLM.prompt, "text/plain");
  $("#btn-prompt-load").onclick = () => $("#prompt-file").click();
  $("#prompt-file").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPrompt(await f.text());
    e.target.value = "";
  };
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
  $("#script-meta").textContent = `${scriptCond} · ${n ? `${n}개 수정됨 · 버전 ${scriptVersion(scriptCond)}` : "기본값"}`;
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
  $("#btn-script-reset").onclick = () => {
    if (!SCRIPT_OVERRIDES[scriptCond] || confirm(`${scriptCond} 조건의 수정한 문구를 모두 기본값으로 되돌릴까요?`)) {
      delete SCRIPT_OVERRIDES[scriptCond];
      saveScripts();
      renderScriptEditor();
    }
  };
  $("#btn-script-save").onclick = () => {
    // 모든 조건의 현재 문구 전체를 저장 (기본값 포함)
    const all = {};
    for (const c of Object.keys(CONDITIONS)) all[c] = Object.fromEntries(scriptDefaults(c).map((d) => [d.key, scriptText(c, d.key)]));
    download(`scenario_script_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(all, null, 2), "application/json");
  };
  $("#btn-script-load").onclick = () => $("#script-file").click();
  $("#script-file").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      SCRIPT_OVERRIDES = {};
      for (const c of Object.keys(CONDITIONS)) if (data[c]) SCRIPT_OVERRIDES[c] = { ...data[c] };
      saveScripts();
      renderScriptEditor();
    } catch {
      alert("문구 파일을 읽지 못했어요. 「파일로 저장」으로 만든 JSON 파일인지 확인해주세요.");
    }
    e.target.value = "";
  };
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
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      $("#msg").value = r[0].transcript;
      if (r.isFinal) onSubmit();
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
function init() {
  const saved = store.get("setup", {});
  if (saved.pid) $("#pid").value = saved.pid;
  if (saved.name) $("#pname").value = saved.name;
  if (saved.condition) { const r = document.querySelector(`input[name="cond"][value="${saved.condition}"]`); if (r) r.checked = true; }
  if (saved.delay) $("#delay").value = saved.delay;
  if (saved.showTask === false) $("#show-task").checked = false;
  const key = store.get("gemini_key", "");
  if (key) { $("#api-key").value = key; $("#remember-key").checked = true; }
  // 이전 기본값(2.5 Flash)으로 저장돼 있으면 새 기본 모델로 바꿈
  const savedModel = store.get("gemini_model", DEFAULT_MODEL);
  $("#model").value = savedModel === "gemini-2.5-flash" ? DEFAULT_MODEL : savedModel;
  applyLLMSettings();

  $("#setup-form").onsubmit = (e) => { e.preventDefault(); start(); };
  $("#btn-test").onclick = testConnection;
  $("#btn-models").onclick = loadModels;
  $("#api-key").onchange = applyLLMSettings;
  $("#model").onchange = applyLLMSettings;
  $("#composer").onsubmit = onSubmit;
  $("#btn-stop").onclick = () => S && handleStop("button");
  $("#btn-manual").onclick = () => S && startManual();
  $("#btn-manual-done").onclick = () => S && endManual();
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
  $("#btn-close-chat").onclick = () => openChat(false);
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
