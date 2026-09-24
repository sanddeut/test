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
  logEvent("agent_message", { text });
}

function setChips(options, onPick) {
  const box = $("#chips");
  box.innerHTML = "";
  (options || []).forEach((o) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chip ${o.id === "reject" ? "chip-ghost" : ""}`;
    b.textContent = o.label;
    b.onclick = () => onPick(o);
    box.appendChild(b);
  });
  syncControls();
}

// 러너가 선택지를 제시하고 답을 기다림 (버튼 or 자유 발화)
function waitRunnerInput(options) {
  return new Promise((resolve) => {
    S.waiter = { resolve, options };
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

// 대화 턴 해석: 의도 분류 + 값 추출 + 스크립트 밖 응답(reply)
async function turn(text, { said, intents, hint, fallback }) {
  const step = S.steps[S.stepIdx];
  const res = await interpret("turn", text, {
    condition: S.cond,
    automation: S.automation === "high" ? "높은 자동화(승인 없이 자동 진행)" : "낮은 자동화(단계마다 승인 요청)",
    step: step ? { label: step.label, guide: step.guide || null } : null,
    agent_said: said,
    intents,
    reply_hint: hint || null,
    current_transfer: formSnapshot(),
    participant_task: SITUATION[S.complexity].task,
    fallback_reply: fallback || null,
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
    // 높은 자동화: 진행 중에 말을 걸면 중지로 간주
    appendBubble("user", text);
    logEvent("user_text", { text });
    handleStop("text", text);
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
  $("#msg").placeholder = canTalk ? "여기에 말씀하세요" : S.finished ? "과업이 끝났어요" : S.manual ? "직접 조작 중이에요" : "AI가 진행 중이에요";
  document.querySelectorAll("#chips .chip").forEach((b) => (b.disabled = S.paused));

  const high = S.automation === "high";
  $("#controls").hidden = !high || S.finished;
  const live = high && S.running && !S.finished && !S.pinOpen;
  $("#btn-stop").disabled = !live || S.paused;
  $("#btn-manual").disabled = !live || S.paused;
  $("#manual-bar").hidden = !S.manual;

  const st = S.finished ? "완료" : S.manual ? "직접 조작 중" : S.paused ? "멈춤" : S.running ? "진행 중" : "대기";
  $("#agent-state").textContent = st;
  $("#agent-state").dataset.state = S.finished ? "done" : S.paused ? "paused" : S.running ? "running" : "idle";
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

async function handleStop(via, firstText) {
  if (S.paused || S.finished) return;
  S.paused = true;
  S.m.stops++;
  markIntervention(`stop_${via}`);
  logEvent("stop", { via });
  showTyping(false);
  syncControls();

  const B = S.complexity === "B";
  const ask = S.steps[S.errorIdx].correction.highAsk;
  let said = ask;
  let text = firstText;
  if (text == null) await agentSay(ask);
  else said = S.log.filter((e) => e.type === "agent_message").at(-1)?.text || ask;

  for (;;) {
    if (text == null) text = await new Promise((r) => { S.ivWaiter = r; syncControls(); });
    const o = await turn(text, {
      said,
      intents: ["set_amount", ...(B ? ["set_memo"] : []), "set_source", "continue", "cancel", "other"],
      hint: "참가자가 도우미의 자동 진행을 멈추고 말한 상황입니다. 바꿀 내용이 분명하지 않으면 무엇을 바꾸고 싶은지 자연스럽게 물어보세요.",
    });
    text = null;
    if (o.intent === "set_amount" && o.amount_won) {
      setAmount(o.amount_won);
      logEvent("amount_changed", { amount: o.amount_won, via: `stop_${via}` });
      await agentSay(S.steps[S.errorIdx].correction.highDone(o.amount_won));
      break;
    }
    if (o.intent === "set_memo" && o.memo) {
      setMemo(o.memo, `stop_${via}`);
      await agentSay(`받는 분 통장 메모를 ‘${o.memo}’으로 바꿨어요.`);
      break;
    }
    if (o.intent === "set_source" && o.source_account) {
      S.form.source = o.source_account;
      logEvent("source_changed", { source: o.source_account, via: `stop_${via}` });
      renderPhone();
      await agentSay(`${ACCOUNTS[o.source_account].label}에서 출금할게요.`);
      break;
    }
    if (o.intent === "continue") {
      await agentSay("계속 진행할게요.");
      break;
    }
    if (o.intent === "cancel") return cancelTransfer();
    said = o.reply;
    await agentSay(o.reply);
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
  await agentSay("송금을 취소했어요.");
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
  S.phone.sheet = null; // 확인 시트가 떠 있으면 내려서 수정 가능하게
  showTyping(false);
  renderPhone();
  syncControls();
}

async function endManual() {
  if (!S.manual) return;
  const snap = S.manualSnapshot;
  const amtInput = $("#m-amount");
  const memoInput = $("#m-memo");
  const srcInput = document.querySelector('input[name="m-source"]:checked');
  const changes = {};
  if (amtInput) {
    const v = Number(String(amtInput.value).replace(/[^\d]/g, ""));
    const cur = S.form.amount ?? S.userAmount ?? null;
    if (v && v !== cur) { changes.amount = v; setAmount(v); }
  }
  if (memoInput && memoInput.value !== (S.form.memo ?? "")) { changes.memo = memoInput.value; S.form.memo = memoInput.value; }
  if (srcInput && srcInput.value !== S.form.source) { changes.source = srcInput.value; S.form.source = srcInput.value; }
  S.phone.sheet = snap.sheet;
  S.manual = false;
  logEvent("manual_end", { changes });
  syncControls();
  renderPhone();
  await agentSay("이어서 진행할게요.");
  resume();
}

// =====================================================================
// 시나리오 러너
// =====================================================================
async function run() {
  syncControls();
  await agentSay("무엇을 도와드릴까요?");
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
    // 어떤 앱을 말하든 정해진 프로토타입을 실행
    await agentSay("어떤 앱으로 실행할까요?");
    const text = await waitText();
    logEvent("app_named", { text });
    await agentSay(step.low.launched);
    step.apply(S);
    renderPhone();
    return "done";
  }

  if (type === "account") {
    const ask = "어떤 계좌로 송금할까요?";
    if (!o) await agentSay(ask);
    for (;;) {
      if (!o) {
        o = await turn(await waitText(), {
          said: ask,
          intents: ["find_other", "set_account", "direct_input", "approve", "cancel", "other"],
          hint: "approve는 원래 제안한 김영숙님 계좌로 하겠다는 뜻입니다. 계좌번호를 말하면 set_account입니다.",
        });
      }
      if (o.intent === "find_other") {
        // 다른 계좌를 찾아도 같은 계좌만 나옴
        logEvent("find_other_account");
        return "retry";
      }
      if (o.intent === "set_account" && o.account_number) {
        S.form.recipientCustom = o.account_number;
        logEvent("recipient_changed", { account: o.account_number });
        await agentSay(`입력하신 계좌(${o.account_number})로 송금할게요.`);
        step.apply(S);
        renderPhone();
        return "done";
      }
      if (o.intent === "direct_input") {
        await agentSay("송금할 계좌번호를 말씀해주세요.");
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
        await agentSay("이벤트 안내 팝업을 닫았어요.");
        break;
      }
      await agentSay(t.reply);
    }
    step.apply(S);
    renderPhone();
    return "done";
  }

  if (type === "memo") {
    const ask = step.low.ask;
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
    const ask = step.low.ask;
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
  renderPhone();

  let question = preempted ? corr.lowConfirm(pending) : step.low.messages[0];
  await agentSay(question);
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
      await agentSay(corr.lowAsk);
      o = await turn(await waitText(), {
        said: corr.lowAsk,
        intents: ["set_amount", "continue", "cancel", "other"],
        hint: "금액 외의 것을 바꾸고 싶다고 하면 그 말에 짧게 답하고, 지금은 송금액을 입력하는 단계라는 흐름으로 자연스럽게 돌아오세요.",
      });
    }
    if (o.intent === "set_amount" && o.amount_won) {
      pending = o.amount_won;
      S.phone.pendingAmount = pending;
      renderPhone();
      logEvent("amount_changed", { amount: pending, via: "reject_text" });
      question = corr.lowConfirm(pending);
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
      msgs = [step.correction.highDone(S.userAmount)];
      logEvent("error_preempted", { amount: S.userAmount });
    } else {
      S.form.amount = ERROR_AMOUNT;
    }
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
      await handleStop("text", r.text);
      if (S.finished) return false;
      continue;
    }
    const o = await turn(r.text, { said: resolveMsgs(spec.messages).join(" "), intents: ["open", "other"] });
    if (o.intent === "open") break;
    await agentSay(o.reply);
  }
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
function renderPhone() {
  if (!S) return;
  const p = S.phone;
  let body = "";
  if (p.app === "home") body = homeScreen();
  else if (p.app === "sms_list") body = smsListScreen();
  else if (p.app === "sms_detail") body = smsDetailScreen();
  else if (p.app === "bank") body = bankScreen();
  $("#screen").innerHTML = `
    <div class="statusbar"><span>9:41</span><span class="sb-icons">●●● ▲ ▮</span></div>
    <div class="app">${body}</div>
    ${p.toast ? `<div class="toast">${esc(p.toast)}</div>` : ""}`;
  $("#screen").querySelectorAll("[data-pin]").forEach((b) => (b.onclick = () => pinPress(b.dataset.pin)));
  $("#screen").querySelectorAll("[data-popup-close]").forEach((b) => (b.onclick = () => S.popupResolve && S.popupResolve()));
}

function homeScreen() {
  const apps = [
    ["문자", "💬", "#34c759"], ["마음은행", "₩", "#2f6fed"], ["전화", "📞", "#30b650"], ["카메라", "📷", "#8e8e93"],
    ["캘린더", "📅", "#ff9500"], ["사진", "🌄", "#af52de"], ["설정", "⚙️", "#636366"], ["지도", "🗺️", "#00a3a3"],
  ];
  return `<div class="home">${apps
    .map(([n, i, c]) => `<div class="app-icon"><div class="ai" style="background:${c}">${i}</div><span>${n}</span></div>`)
    .join("")}</div>`;
}

function smsListScreen() {
  const rows = [
    ["김영숙", "안녕하세요, 30기 총무 김영숙이에요. 올해 동창회 회비…", "오전 9:12", true],
    ["우리딸", "엄마 주말에 갈게요~", "어제"],
    ["택배알림", "[배송완료] 고객님의 상품이 문 앞에 배송되었습니다.", "어제"],
    ["마음은행", "[마음은행] 9월 카드 결제 예정 금액 안내", "9월 20일"],
    ["건강보험공단", "건강검진 대상자 안내", "9월 18일"],
  ];
  return `<div class="appbar">메시지</div><div class="sms-list">${rows
    .map(([n, t, d, unread]) => `<div class="sms-row ${unread ? "unread" : ""}"><div class="avatar">${esc(n[0])}</div><div class="sms-main"><b>${esc(n)}</b><p>${esc(t)}</p></div><time>${d}</time></div>`)
    .join("")}</div>`;
}

function smsDetailScreen() {
  const text = esc(SMS_TEXT(S)).replace(
    "농협 302-1234-5678",
    `<mark class="${S.phone.smsHighlight ? "on" : ""}">농협 302-1234-5678</mark>`,
  );
  return `<div class="appbar"><span class="back">‹</span> 김영숙</div>
    <div class="sms-thread"><div class="sms-date">오늘 오전 9:12</div><div class="sms-bubble">${text.replace(/\n/g, "<br>")}</div></div>`;
}

function bankScreen() {
  const p = S.phone;
  const f = S.form;
  let view = "";
  if (p.bankView === "home") {
    view = `<div class="bank-home">
      ${Object.values(ACCOUNTS).map((a) => `<div class="acct-card"><small>${a.label}</small><div>${a.number}</div><b>${a.balance.toLocaleString("ko-KR")}원</b></div>`).join("")}
      <div class="bank-menu"><span>이체</span><span>조회</span><span>공과금</span><span>상품</span></div></div>`;
  } else if (p.bankView === "transfer") {
    view = transferForm();
  } else if (p.bankView === "complete") {
    view = `<div class="bank-done"><div class="check">✓</div><h3>이체 완료</h3>
      <p>김영숙(농협 302-1234-5678)</p><b>${won(f.amount)}</b>${f.memo ? `<p class="muted">받는 분 통장 표시: ${esc(f.memo)}</p>` : ""}</div>`;
  }
  let overlay = "";
  if (p.popup) {
    overlay = `<div class="popup-dim"><div class="popup"><div class="popup-art">🍂</div><b>가을맞이 적금 이벤트</b><p>지금 가입하면 최대 연 4.5% 우대금리!</p><div class="popup-btns ${p.popupClosable ? "live" : ""}"><span ${p.popupClosable ? "data-popup-close" : ""}>오늘 하루 보지 않기</span><span ${p.popupClosable ? "data-popup-close" : ""}>닫기</span></div></div></div>`;
  }
  if (p.sheet === "confirm") {
    overlay = `<div class="sheet-dim"><div class="sheet"><h4>이체 정보 확인</h4>
      ${row("출금 계좌", ACCOUNTS[f.source].label)}${row("받는 분", "김영숙 · 농협 302-1234-5678")}${row("보낼 금액", won(f.amount))}${S.complexity === "B" ? row("받는 분 통장 표시", f.memo || "-") : ""}
      <div class="btn-primary">이체하기</div></div></div>`;
  } else if (p.sheet === "pin") {
    if (S.pinOpen) {
      const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
      overlay = `<div class="sheet-dim"><div class="sheet pin"><h4>계좌 비밀번호</h4><p class="muted">비밀번호 4자리를 입력해주세요</p>
        <div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i < p.pin.length ? "on" : ""}"></i>`).join("")}</div>
        <div class="keypad">${keys.map((k) => (k ? `<button type="button" data-pin="${k}">${k === "del" ? "⌫" : k}</button>` : "<span></span>")).join("")}</div></div></div>`;
    }
  } else if (p.sheet === "sending") {
    overlay = `<div class="sheet-dim"><div class="sheet"><div class="spinner"></div><p style="text-align:center">이체 중이에요…</p></div></div>`;
  }
  return `<div class="appbar bank-bar">마음은행 ${p.bankView === "transfer" ? "<small>· 이체</small>" : ""}</div>${view}${overlay}`;
}

function row(k, v) {
  return `<div class="kv"><span>${k}</span><b>${esc(v)}</b></div>`;
}

function transferForm() {
  const f = S.form;
  const p = S.phone;
  const man = S.manual;
  const foc = (k) => (p.focus === k && !man ? "focus" : "");
  const src = man
    ? Object.entries(ACCOUNTS).map(([k, a]) => `<label class="src-opt ${f.source === k ? "sel" : ""}"><input type="radio" name="m-source" value="${k}" ${f.source === k ? "checked" : ""}> ${a.label}<small>${a.balance.toLocaleString("ko-KR")}원</small></label>`).join("")
    : Object.entries(ACCOUNTS).map(([k, a]) => `<div class="src-opt ${f.source === k && p.focus !== "source" ? "sel" : ""}">${a.label}<small>${a.balance.toLocaleString("ko-KR")}원</small></div>`).join("");
  const rcpt = f.recipient
    ? `<b>김영숙</b> · 농협 302-1234-5678 <span class="tag">${S.complexity === "A" ? "자주 쓰는 계좌" : "문자에서 붙여넣음"}</span>`
    : `<span class="ph">계좌번호 입력</span>`;
  const shownAmt = f.amount ?? p.pendingAmount ?? S.userAmount;
  const amt = man
    ? `<input id="m-amount" inputmode="numeric" value="${shownAmt ?? ""}" placeholder="금액(원)"><small class="muted">원 단위 숫자로 입력</small>`
    : shownAmt != null
      ? `<b class="${f.amount == null ? "pending" : ""}">${won(shownAmt)}</b>${f.amount == null ? ' <span class="tag warn">입력 대기</span>' : ""}`
      : `<span class="ph">금액 입력</span>`;
  const memo = S.complexity === "B"
    ? `<div class="field ${foc("memo")}"><label>받는 분 통장 표시</label>${man ? `<input id="m-memo" value="${esc(f.memo ?? "")}" placeholder="메모">` : f.memo ? `<b>${esc(f.memo)}</b>` : '<span class="ph">메모 (선택)</span>'}</div>`
    : "";
  return `<div class="transfer ${man ? "manual" : ""}">
    <div class="field ${foc("source")}"><label>출금 계좌</label><div class="src">${src}</div></div>
    <div class="field ${foc("recipient")}"><label>받는 분</label><div>${rcpt}</div></div>
    <div class="field ${foc("amount")}"><label>보낼 금액</label><div>${amt}</div></div>
    ${memo}
    <div class="btn-primary ${man ? "" : "dim"}">다음</div></div>`;
}

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
  LLM.model = $("#model").value.trim() || "gemini-2.5-flash";
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
  $("#log tbody").innerHTML = "";
  $("#setup").hidden = true;
  $("#stage").hidden = false;
  renderPhone();
  renderStepper();
  logEvent("session_start", { condition: S.cond, participant: cfg.pid, llm: LLM.enabled ? LLM.model : "rules", delay_ms: cfg.delay });
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
  $("#model").value = store.get("gemini_model", "gemini-2.5-flash");
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
  $("#btn-researcher").onclick = () => document.body.classList.toggle("drawer-open");
  $("#btn-close-drawer").onclick = () => document.body.classList.remove("drawer-open");
  $("#btn-reset").onclick = backToSetup;
  $("#btn-json").onclick = () => S && download(`${S.sessionId}.json`, JSON.stringify({ summary: summary(), log: S.log }, null, 2), "application/json");
  $("#btn-csv").onclick = () => S && download(`${S.sessionId}_events.csv`, toCSV(S.log), "text/csv");
  $("#btn-all").onclick = () => download(`sessions_summary_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(store.get("sessions", []).map((x) => x.summary)), "text/csv");
  $("#btn-clear").onclick = () => { if (confirm("이 브라우저에 저장된 모든 세션 기록을 지울까요?")) { store.del("sessions"); renderSessionCount(); } };
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === ".") document.body.classList.toggle("drawer-open"); });
  setupMic();
  renderSessionCount();
}

document.addEventListener("DOMContentLoaded", init);
