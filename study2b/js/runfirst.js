// 새 개선안(study2b): 실행화면을 기본으로 보여 줌 (improve.js 위에 얹음) · 레이아웃 A안 (하단 고정 AI 패널)
// - 택시를 불러 달라고 하면 허용 팝업 → 허용하면 로딩 화면 뒤 튕기듯 빠지며 실행화면으로 (홈 화면 없이 택시 앱 스플래시부터)
// - 처음에는 화면을 어둡게 하고 흰 글씨로 "AI가 '마음택시' 앱을 사용합니다." → 딤이 약하게 남고, 화면 전체 테두리
// - 위 헤더: 「AI가 앱 사용중..」 + 「멈추기」「내가 하기」
// - 아래 AI 패널: 늘 같은 자리·같은 높이. 위 줄은 지금 하는 일("출발지를 찾는 중…", AI가 화면을 누르는 동안만), 아래는 AI의 마지막 말
//   확인·선택할 일이 있으면 앱 화면을 거의 안 보일 만큼 어둡게 하고, 패널이 위로 커져 확인할 내용(호출 내용 등)·선택지·입력창을 함께 보여 줌
// - 대화창은 따로 버튼 없이 AI 프로필을 누를 때만 (보이는 이 화면이 기본)
"use strict";

const RF_LOADING_MS = 900; // 허용한 뒤 로딩 화면
const RF_SWAP_MS = 1200; // 튕기며 화면이 바뀌는 시간 (slideSwap과 같게)
const RF_HEAD = 58; // 위 헤더 높이 (태그 + 멈추기 · 내가 하기)
const RF_INTRO_MS = 3800;
const RF_FIRST_MS = 2500; // 스플래시가 끝난 뒤 앱 첫 화면을 보여 주는 시간 (줄어드는 1.1초 포함) // "AI가 '마음택시' 앱을 사용합니다." 안내를 보여 주는 시간
const rf = { doing: "", ask: null, picks: null, note: "", noteStep: null, last: "", typing: false, key: "", runBeforeManual: false, composerHome: null };

const rfOn = () => Boolean(S?.runFirst && !S.finished && $(".phone").dataset.view === "progress");

function setupRunFirst() {
  const phone = $(".phone");
  const L = document.createElement("div");
  L.id = "rf-layer";
  L.className = "rf-layer";
  L.innerHTML = `<div class="rf-dim"></div>
    <p class="rf-intro">AI가 ‘${esc(TAXI_APP)}’ 앱을 사용합니다.</p>
    <div class="rf-border"></div>
    <div class="rf-head"><div class="rf-chip" role="status">AI가 앱 사용중..</div></div>
    <div class="rf-ctrl"><button type="button" class="rf-stop">멈추기</button><button type="button" class="rf-manual">내가 하기</button></div>
    <div class="rf-msgs" role="region" aria-label="AI 도우미" aria-live="polite">
      <button type="button" class="rf-avatar" aria-label="AI 도우미 (대화창 보기)">AI</button>
      <p class="rf-q"></p>
      <button type="button" class="rf-undo" hidden><span class="ms">undo</span>되돌리기</button>
    </div>
    <div class="rf-panel"><div class="rf-pv"></div><div class="rf-opts"></div></div>
    <div class="rf-bottom"><div class="rf-talk"></div><div class="rf-fab-slot"></div></div>`;
  phone.appendChild(L);
  const load = document.createElement("div");
  load.id = "rf-loading";
  load.innerHTML = '<span class="rf-spinner"></span>';
  phone.appendChild(load);
  // 프로필을 누르면 대화창으로 (따로 버튼은 두지 않음). 진행 카드의 「실행화면 보기」로 돌아옴
  L.querySelector(".rf-avatar").onclick = () => {
    if (!rfOn()) return;
    logEvent("rf_avatar_chat");
    S.showRun = false;
    syncControls();
  };
  // 작은 화면 아래: 멈추기(대화창의 멈추기와 같음 → 패널에서 멈춘 뒤 메뉴), 내가 하기(직접 조작)
  L.querySelector(".rf-stop").onclick = () => { if (rfOn() && !$("#btn-stop").disabled) { logEvent("rf_stop"); handleStop("rf"); } };
  // 되돌리기: 대화창의 마지막 「되돌리기」와 같음 (방금 끝낸 단계를 취소할지 한 번 묻고 다시 함)
  L.querySelector(".rf-undo").onclick = () => { const u = chat().querySelector(":scope > .undo-link"); if (u && rfOn()) { logEvent("rf_undo"); u.click(); } };
  L.querySelector(".rf-manual").onclick = () => { if (rfOn() && !$("#btn-manual").disabled) { logEvent("rf_manual"); startManual(); } };
  // 작은 앱 화면을 누르면 크게, 다시 누르면 작게 (화면 안내 토스트 대신)
  $(".screen-box").addEventListener("click", (e) => {
    if (!S?.runFirst || !phone.classList.contains("rf-live") || phone.dataset.view !== "progress") return;
    e.stopImmediatePropagation();
    rfZoom(!phone.classList.contains("rf-big"));
  }, true);
  // 말로(글로) 답할 때는 개선안의 입력창(#composer)을 그대로 패널 안으로 옮겨 씀. 원래 자리를 기억해 둠
  rf.composerHome = document.createComment("composer-home");
  $("#composer").before(rf.composerHome);
}
document.addEventListener("DOMContentLoaded", setupRunFirst);
// 확인할 내용·선택지는 작은 화면과 오른쪽 메시지 중 더 아래쪽 밑에서 시작 (메시지가 길어도 겹치지 않게)
function rfPlacePanel() {
  const L = $("#rf-layer");
  if (!L || !$(".phone").classList.contains("rf-live")) return;
  const m = L.querySelector(".rf-msgs");
  const c = L.querySelector(".rf-ctrl");
  const top = Math.max(m.offsetTop + m.offsetHeight, c.offsetTop + c.offsetHeight) + 14;
  const bottom = L.querySelector(".rf-bottom");
  const panel = L.querySelector(".rf-panel");
  panel.style.top = `${top}px`;
  panel.style.bottom = `${bottom.offsetHeight ? bottom.offsetHeight + 24 : 12}px`; // 맨 아래 입력창과 겹치지 않게
}
document.addEventListener("DOMContentLoaded", () => { const ro = new ResizeObserver(rfPlacePanel); ro.observe($("#rf-layer .rf-msgs")); ro.observe($("#rf-layer .rf-bottom")); });
setInterval(() => { if (S?.runFirst) rfRender(); }, 300); // 단계가 바뀌면 "~하는 중…" 문구도 바꿈

// 허용 팝업에서 허용하면 실행화면으로 넘어간 뒤에 앱을 열기 시작함
const _showPermDialogRF = showPermDialog;
showPermDialog = function () {
  return _showPermDialogRF().then(async (ok) => {
    if (ok && S && !S.finished) await rfEnter();
    return ok;
  });
};

async function rfEnter() {
  const L = $("#rf-layer");
  S.runFirst = true;
  S.runIntroShown = true; // improve.js의 [확인] 안내 대신 아래 안내
  Object.assign(rf, { line: "", msgStep: null, stepSeen: null, doing: "", ask: null, picks: null, note: "", last: "", typing: false, key: "" });
  L.classList.remove("intro", "live");
  $(".phone").classList.remove("rf-live", "rf-big", "rf-headfull");
  $("#rf-loading").classList.add("on");
  logEvent("rf_enter");
  await sleep(RF_LOADING_MS);
  S.showRun = true;
  S.rfSwap = true;
  // 홈 화면을 거치지 않고 택시 앱 스플래시부터 보여 줌 (택시 앱 실행 단계는 여기서 끝냄)
  const open = S.steps.find((x) => x.id === "taxi_open");
  if (open) {
    open.apply(S); S.rfOpened = true; rf.line = `${TAXI_APP} 앱을 여는 중…`; renderPhone();
    // 스플래시를 안내("AI가 '마음택시' 앱을 사용합니다.")가 끝날 때까지 띄워 둠
    const p = S.phone;
    const ms = RF_SWAP_MS + RF_INTRO_MS;
    clearTimeout(p.loadingTimer);
    p.loading = "splash-taxi";
    p.loadingUntil = Date.now() + ms;
    p.loadingTimer = setTimeout(() => { p.loading = null; renderPhone(); }, ms);
    renderPhone();
  }
  syncControls(); // → syncView에서 로딩 화면이 튕기며 빠지고 앱 화면이 들어옴
  await sleep(RF_SWAP_MS);
  L.classList.add("intro");
  gLog(["G6", "G23"], "run_intro");
  await sleep(RF_INTRO_MS);
  L.classList.remove("intro");
  // 헤더가 먼저 화면 위에 나타난 뒤, 앱 화면과 함께 작은 화면 위로 줄어들어 붙음
  $(".phone").classList.add("rf-headfull");
  L.classList.add("live");
  await sleep(700);
  $(".phone").classList.remove("rf-headfull");
  // 스플래시가 끝나면 전체 화면이던 앱 화면이 85%로 줄어들며 위 헤더·아래 AI 패널이 나타남
  const clip = $(".screen-clip");
  const before = clip.getBoundingClientRect();
  $(".phone").classList.add("rf-live");
  fitScreen();
  animateZoom(clip, before);
}

// 택시 앱은 실행화면으로 넘어올 때 이미 열었으므로, 앱 실행 단계는 스플래시가 끝나기를 기다리기만 함
const _runAutoRF = runAuto;
runAuto = async function (step) {
  if (step.id === "taxi_open" && S?.rfOpened) {
    logEvent("taxi_open_rf");
    await waitLoading();
    rf.line = `${TAXI_APP} 앱을 열었어요.`; rfRender();
    await sleep(RF_FIRST_MS * PACE); // 앱 첫 화면을 조금 더 보여 준 뒤 시작
    await gate();
    return true;
  }
  return _runAutoRF(step);
};

// 실행화면이 기본: 프로필을 눌러 대화창으로 가지 않았으면 끝날 때까지 실행화면 (직접 조작·비밀번호 입력 화면은 원래대로)
const _wantedViewRF = wantedView;
wantedView = function () {
  const v = _wantedViewRF();
  if (v !== "chat" || !S?.runFirst || !S.showRun || !S.running || S.finished) return v;
  return "progress";
};

const _syncViewRF = syncView;
syncView = function () {
  const phone = $(".phone");
  const prev = phone.dataset.view;
  _syncViewRF();
  phone.classList.toggle("rf", Boolean(S?.runFirst));
  if (S?.rfSwap && phone.dataset.view === "progress" && prev !== "progress") {
    S.rfSwap = false;
    delete phone.dataset.trans; // 원래의 확대 효과 대신
    const ghost = document.createElement("div");
    ghost.className = "trans-ghost rf-ghost";
    ghost.innerHTML = '<span class="rf-spinner"></span>';
    $("#rf-loading").classList.remove("on");
    slideSwap(phone, ghost, true);
  }
  rfRender();
};

// 실행화면 크기: 스플래시·안내 동안은 기기 전체 화면, 그 뒤에는 왼쪽 위 아주 작은 화면 (굳이 보려고 하지 않을 만큼)
// 작은 화면을 누르면 크게(화면 가운데), 다시 누르면 작게. 앱은 늘 기기 전체 크기로 그리고 줄이기만 함 (잘리지 않음)
const RF_THUMB = 0.24;
const _fitScreenRF = fitScreen;
fitScreen = function () {
  _fitScreenRF();
  const phone = $(".phone");
  if (!S?.runFirst || phone?.dataset.view !== "progress") return;
  const clip = $(".screen-clip");
  const W = phone.clientWidth;
  const H = parseFloat(phone.style.getPropertyValue("--app-h")) || phone.clientHeight;
  const live = phone.classList.contains("rf-live");
  const scale = !live ? 1 : phone.classList.contains("rf-big") ? Math.min(0.82, (H - RF_HEAD - 70) / H, (W - 32) / W) : RF_THUMB;
  phone.style.setProperty("--scale", scale.toFixed(4));
  phone.style.setProperty("--app-h", `${H}px`);
  clip.style.width = `${Math.floor(W * scale)}px`;
  clip.style.height = `${Math.floor(H * scale)}px`;
  phone.style.setProperty("--rf-tw", `${Math.floor(W * RF_THUMB)}px`);
  phone.style.setProperty("--rf-th", `${Math.floor(H * RF_THUMB)}px`);
};

function rfZoom(big) {
  const phone = $(".phone");
  const clip = $(".screen-clip");
  const before = clip.getBoundingClientRect();
  phone.classList.toggle("rf-big", big);
  fitScreen();
  animateZoom(clip, before);
  logEvent(big ? "rf_screen_big" : "rf_screen_small");
}

// 실행화면에서 「내가 앱 조작하기」로 들어갔다가 돌아오면 다시 실행화면으로 (원래는 대화창으로)
const _startManualRF = startManual;
startManual = function () {
  rf.runBeforeManual = Boolean(S?.runFirst && $(".phone").dataset.view === "progress");
  return _startManualRF();
};
const _endManualRF = endManual;
endManual = function () {
  const r = _endManualRF();
  if (S?.runFirst && rf.runBeforeManual) { S.showRun = true; syncControls(); }
  return r;
};

// 질문(선택지)이 생기면 패널로
const _setChipsRF = setChips;
setChips = function (options, onPick) {
  _setChipsRF(options, onPick);
  // 버튼 이름은 improve.js와 같게 (확인/수정, 호출하기 등)
  rf.ask = options?.length ? { options: relabel(options, choiceLabels()), onPick } : null;
  rf.note = "";
  rfRender();
};

// 거부한 뒤 되묻는 추천 선택지(improve.js)도 패널로
const _renderPicksRF = renderPicks;
renderPicks = function (list, waiter, question = lastAgentText()) {
  _renderPicksRF(list, waiter, question);
  rf.picks = { list, waiter, question };
  rf.note = "";
  rfRender();
};
const _clearPicksRF = clearPicks;
clearPicks = function () {
  _clearPicksRF();
  if (rf.picks) { rf.picks = null; rfRender(); }
};

// AI가 하는 말(알림·대답)은 패널에. "~하는 중…" 같은 진행 문구는 넣지 않음
const _agentSayRF = agentSay;
agentSay = async function (text, opts = {}) {
  const r = await _agentSayRF(text, opts);
  if (S?.runFirst && S.running && !S.finished && !isProgressLine(text) && !(opts.gated && S.jumpTo != null)) {
    rf.note = rf.note && rf.noteStep === S.stepIdx ? `${rf.note}\n${text}` : text;
    rf.noteStep = S.stepIdx;
    rf.last = text;
    rf.line = text; // 패널 메시지는 화면에 맞춰 차례로: ~하는 중… → '…' 검색 중… → ~할게요 → 다음 단계 ~하는 중…
    rf.msgStep = S.stepIdx;
    rfRender();
  }
  return r;
};

// 참가자가 답한 뒤 AI가 반응하기 전: 패널 위 줄에 "…"
const _showTypingRF = showTyping;
showTyping = function (on) {
  _showTypingRF(on);
  if (rf.typing !== on) {
    rf.typing = on;
    if (on) { rf.note = ""; rf.msgStep = null; rf.line = ""; } // 참가자가 답하면 질문 문구는 내리고, 다음 조작은 "~하는 중…"부터
    rfRender();
  }
};

const _setActingRF = setActing;
setActing = function (on) {
  _setActingRF(on);
  if (!S?.runFirst) return;
  if (!on) return;
  // 이 단계에서 AI가 아직 말하기 전에 화면을 누르기 시작하면 "~하는 중…" (말한 뒤의 조작은 그 말을 그대로 둠)
  const id = S.steps[S.stepIdx]?.id;
  if (id && rf.msgStep !== S.stepIdx) rf.line = `${DOING[id] || "앱을 조작하는 중"}…`;
  rf.note = "";
  rfRender();
};

// 결제 비밀번호: 패널의 [화면 열기]로 앱의 비밀번호 창에 직접 입력
const _renderPinCardRF = renderPinCard;
renderPinCard = function () {
  _renderPinCardRF();
  rfRender();
};

const PILL_IDS = ["approve", "reject", "manual", "resume", "no", "yes"];
// 말·글로 답할 수 있는 때: 멈춘 뒤 대화, 말로 답하는 질문, 추천 선택지
const rfTalkable = () => Boolean(S.ivWaiter || rf.picks || (S.waiter && !S.waiter.options && !S.waiter.pin));

function rfRender() {
  const L = $("#rf-layer");
  if (!L) return;
  const live = L.classList.contains("live");
  L.querySelector(".rf-stop").disabled = $("#btn-stop").disabled;
  L.querySelector(".rf-manual").disabled = $("#btn-manual").disabled;
  const on = rfOn() && !S.manual && !S.pinOpen;
  // 되돌리기로 앞 단계로 돌아가면 지난 단계의 말은 지움
  if (S && rf.stepSeen != null && S.stepIdx < rf.stepSeen) { rf.last = ""; rf.line = ""; rf.msgStep = null; }
  if (S) rf.stepSeen = S.stepIdx;
  const pin = on && S.waiter?.pin && S.pinResolve && !S.paused && !S.ivWaiter; // 취소(멈춤) 뒤에는 멈춘 뒤 질문을 보여 줌
  const picks = on && !pin && rf.picks && S.waiter === rf.picks.waiter ? rf.picks : null;
  const ask = on && !pin && !picks && rf.ask && (S.waiter || S.ivWaiter) ? rf.ask : null;
  const talk = on && !pin && rfTalkable();
  const asking = Boolean(pin || picks || ask || talk);
  L.dataset.mode = asking ? "ask" : "";
  $(".phone").classList.toggle("rf-asking", asking);
  rfComposer(on && live); // 입력창은 늘 맨 아래에
  // 되돌릴 수 있는 단계가 있으면(대화창에 「되돌리기」가 붙어 있으면) 패널 위 줄 오른쪽에 「되돌리기」
  L.querySelector(".rf-undo").hidden = !(on && live && !asking && chat().querySelector(":scope > .undo-link"));
  // 메시지 자리 하나에: 답을 준비하는 중 "…" / 화면을 누르는 동안 "~하는 중…" / 멈췄을 때 / 그 외에는 AI의 마지막 말 (한 번에 하나만)
  const typing = on && !asking && rf.typing;
  const status = !on || asking || typing ? "" : S.paused ? "멈춰 있어요" : "";
  const q = pin || ask ? rfQuestion() : picks ? picks.question : talk ? rf.last || lastAgentText() : typing ? "" : status || rf.line || rf.last || "";
  const sig = ask ? ask.options.map((o) => o.id + o.label).join(",") : picks ? picks.list.map((o) => o.label).join(",") : "";
  const kind = pin ? "pin" : picks ? "picks" : ask ? "ask" : talk ? "talk" : "";
  const key = `${kind}|${typing}|${status ? 1 : 0}|${q}|${sig}|${asking ? S.stepIdx : ""}`;
  if (key === rf.key) return;
  rf.key = key;
  const qEl = L.querySelector(".rf-q");
  const prevQ = qEl.textContent;
  qEl.classList.toggle("typing", typing);
  if (typing) qEl.innerHTML = "<i></i><i></i><i></i>"; else qEl.textContent = q || "";
  if (q && q !== prevQ) { qEl.classList.remove("fresh"); void qEl.offsetWidth; qEl.classList.add("fresh"); }
  // 확인할 내용: 진행 카드에 함께 보여 주던 재구성 UI (최종 호출이면 호출 내용 전체)
  const pvBox = L.querySelector(".rf-pv");
  pvBox.innerHTML = "";
  if (ask && ask.options.some((o) => o.id === "approve") && !S.noPreview) { const pv = stepPreview(); if (pv) pvBox.appendChild(pv); }
  const box = L.querySelector(".rf-opts");
  box.innerHTML = "";
  box.className = "rf-opts";
  if (pin) {
    box.classList.add("pills");
    box.append(rfBtn("취소", "ghost", () => $(".pw-card .pw-cancel")?.click()), rfBtn("화면 열기", "", () => $(".pw-card .pw-go")?.click()));
  } else if (picks) {
    box.classList.add("list");
    for (const o of picks.list) {
      box.appendChild(rfRow(o.label, "", "", () => {
        if (o.input) { if (inputMode.mode !== "text") setInputMode("text"); $("#msg").focus(); return; } // 직접 입력: 패널 안 입력창으로
        pickReject(o, picks.waiter);
      }));
    }
  } else if (ask) {
    const list = ask.options.length >= 2 && !ask.options.every((o) => PILL_IDS.includes(o.id));
    box.classList.add(list ? "list" : "pills");
    for (const o of ask.options) {
      box.appendChild(list && !PILL_IDS.includes(o.id)
        ? rfRow(o.label, o.desc, o.price, () => ask.onPick(o))
        : rfBtn(o.label, o.id === "reject" || o.id === "manual" ? "ghost" : "", () => ask.onPick(o)));
    }
  }
  L.querySelector(".rf-panel").scrollTop = 0;
  rfPlacePanel();
  if (q) logEvent("rf_panel", { mode: kind || "message", text: q });
}

// 개선안 입력창을 패널 안으로 옮기거나 원래 자리로 돌려 놓음
function rfComposer(inBubble) {
  const form = $("#composer");
  const slot = $("#rf-layer .rf-talk");
  if (!form || !slot || !rf.composerHome) return;
  const fab = $("#mode-fab");
  if (inBubble && form.parentNode !== slot) {
    slot.appendChild(form);
    if (inputMode.mode === "start" || inputMode.mode === "pick") setInputMode("text");
    if (fab) $("#rf-layer .rf-fab-slot").appendChild(fab); // 말로 하기 ↔ 글로 하기는 입력창 아래 왼쪽
  } else if (!inBubble && form.parentNode === slot) {
    rf.composerHome.after(form);
    if (fab) form.appendChild(fab);
  }
}

function rfBtn(label, cls, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `rf-btn ${cls}`;
  b.textContent = label;
  b.onclick = fn;
  return b;
}
function rfRow(label, desc, price, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "rf-row";
  b.innerHTML = `<span><b>${esc(label)}</b>${desc ? `<small>${esc(desc)}</small>` : ""}</span>${price ? `<em>${esc(price)}</em>` : ""}`;
  b.onclick = fn;
  return b;
}

// 질문 문구: 진행 카드에 올라간 질문, 없으면 마지막 질문
function rfQuestion() {
  const q = $("#rc-q");
  if (q && !q.hidden && q.textContent.trim()) return q.textContent.trim();
  return S.lastQuestion || rf.last || lastAgentText();
}

// AI가 화면 조작을 마친 뒤 다음 단계로 넘어가기 전 기다리는 시간을 줄임 (조작 전 읽을 시간은 그대로)
const RF_DWELL_MAX = 800;
const _dwellRF = dwell;
dwell = function (ms = 1800) {
  return _dwellRF(S?.runFirst ? Math.min(ms, RF_DWELL_MAX) : ms);
};

// AI가 화면을 누르고 글자를 치는 속도만 늦춤 (읽을 시간·대기 시간은 그대로)
const RF_ACT_SLOW = 2.4;
const _tapRF = tap;
tap = function (sel, { pre = 450, hold = 350, after = 450, quick = false } = {}) {
  const k = S?.runFirst ? RF_ACT_SLOW : 1;
  return _tapRF(sel, { pre: pre * k, hold: hold * k, after: after * k, quick });
};
const _typeTextRF = typeText;
typeText = function (set, text, ms = 170) {
  if (S?.runFirst) { rf.line = `‘${text}’ 검색 중…`; rfRender(); } // 검색어를 치는 동안
  return _typeTextRF(set, text, S?.runFirst ? ms * RF_ACT_SLOW : ms);
};
