// 연구2 개선안: 연구1 가이드라인 중 함께 정한 것만 반영 (원안 코드는 그대로 두고 여기서 감싸서 바꿈)
"use strict";

// =====================================================================
// [입력 방법] 첫 화면은 입력 방법(상호작용 시작 방법)을 명시적으로 보여 줘야 한다
// - 첫 인사 아래 안내 카드
// - 맨 처음에는 입력창 대신 「눌러서 시작하기」 버튼 하나 → 누르면 「말로 하기」「글로 하기」로 갈라짐
// - 고른 뒤에는 고른 방식만 보여주고, 입력창 위 작은 버튼으로 다른 방식으로 바꿈
// - 보내기 버튼은 화살표 대신 '보내기' 글자
// =====================================================================
const inputMode = { mode: "start" }; // start | pick | text | voice
const TEXT_PLACEHOLDER = "여기에 적어 주세요";

function setInputMode(mode) {
  inputMode.mode = mode;
  $(".phone").dataset.input = mode;
  const fab = $("#mode-fab");
  if (fab) fab.innerHTML = mode === "voice"
    ? '<span class="ms">swap_horiz</span>글로 하기'
    : '<span class="ms">swap_horiz</span>말로 하기';
  if (S) logEvent("input_mode", { mode });
}

function setupInputMode() {
  const form = $("#composer");
  // 처음 화면: 긴 버튼 하나 → 두 개로 갈라짐
  const start = document.createElement("div");
  start.id = "start-wrap";
  start.className = "start-wrap only-chat";
  start.innerHTML = `<button type="button" id="start-btn" class="start-btn">눌러서 대화 시작</button>
    <button type="button" id="pick-voice" class="pick-btn"><span class="ms fill">mic</span>말로 하기</button>
    <button type="button" id="pick-text" class="pick-btn"><span class="ms">keyboard</span>글로 하기</button>`;
  form.before(start);
  $("#start-btn").onclick = () => setInputMode("pick");
  $("#pick-text").onclick = () => {
    setInputMode("text");
    $("#msg").focus(); // 누르는 동작 안에서 바로 커서를 넣어 휴대폰 키보드가 올라오게 함
  };
  // 이 기기에서 음성 인식을 쓸 수 없으면 「말로 하기」는 누를 수 없게 표시
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
    $("#pick-voice").disabled = true;
    $("#pick-voice").title = "이 기기에서는 말로 하기를 쓸 수 없어요";
  }
  $("#pick-voice").onclick = () => {
    setInputMode("voice");
    startListening();
  };

  // 말로 하기: 입력칸 자리에 긴 말하기 버튼 (들은 내용은 이 버튼 안에 보여줌)
  const voice = document.createElement("button");
  voice.type = "button";
  voice.id = "voice-btn";
  voice.className = "voice-btn";
  form.insertBefore(voice, $("#msg"));
  voice.onclick = () => startListening();
  renderVoice();
  new MutationObserver(renderVoice).observe($("#mic"), { attributes: true, attributeFilter: ["class"] });
  $("#msg").addEventListener("input", renderVoice);
  $("#msg").addEventListener("input", watchUnsent);
  form.addEventListener("submit", () => { clearTimeout(unsentTimer); form.classList.remove("unsent"); });
  $("#send").addEventListener("click", () => { clearTimeout(unsentTimer); form.classList.remove("unsent"); });
  const hint = document.createElement("span");
  hint.className = "unsent-hint";
  hint.textContent = "보내기를 눌러야 전달돼요";
  form.appendChild(hint);

  // 입력창 위 오른쪽 작은 버튼: 말로 하기 ↔ 글로 하기
  const fab = document.createElement("button");
  fab.type = "button";
  fab.id = "mode-fab";
  fab.className = "mode-fab";
  form.appendChild(fab);
  fab.onclick = () => {
    if (inputMode.mode === "voice") { stopListening(); setInputMode("text"); $("#msg").focus(); }
    else { setInputMode("voice"); startListening(); }
  };
  setInputMode("start");
}

const listening = () => $("#mic").classList.contains("rec");
function startListening() { if (!listening()) $("#mic").click(); }
function stopListening() { if (listening()) $("#mic").click(); }

function renderVoice() {
  const v = $("#voice-btn");
  if (!v) return;
  // 말로 하기: [눌러서 말하기 | 보내기]를 한 칸으로 묶음
  // 듣기 시작하면 '듣고 있어요 …', 말이 받아 적히기 시작하면 그 글자가 작아지며 위로 올라가고 아래에 받아 적은 말이 채워짐
  if (!v.querySelector(".vlabel")) v.innerHTML = '<span class="vlabel"></span><span class="vtext"></span>';
  const said = $("#msg").value.trim();
  const on = listening();
  v.classList.toggle("on", on);
  v.classList.toggle("has-text", Boolean(said));
  v.querySelector(".vlabel").textContent = on ? "듣고 있어요 …" : said ? "" : "눌러서 말하기";
  v.querySelector(".vtext").textContent = said;
}

// =====================================================================
// [입력 피드백] 시스템은 사용자의 입력이 오류 없이 전달되었는지를 즉시 알려야 한다
// - 내 말풍선 옆에 작은 초록 동그라미 체크로 전달됐음을 표시 (메신저의 '읽음'처럼)
// - 글자를 적어 두고 보내지 않으면 보내기 버튼을 깜빡이며 '보내기를 눌러야 전달돼요'
// =====================================================================
const STEP_WHAT = {
  taxi_open: "택시 앱 실행", origin: "출발지 설정", dest: "목적지 설정", car: "택시 종류", pay: "결제 방식",
  coupon: "예상 금액", request: "기사님 요청사항", final: "최종 호출", reserve: "예약 호출",
};
const _renderBubble = renderBubble;
renderBubble = function (role, text) {
  _renderBubble(role, text);
  if (role !== "user") return;
  const b = [...chat().querySelectorAll(".bubble.user")].at(-1);
  if (b && !b.querySelector(".receipt")) b.insertAdjacentHTML("beforeend", '<span class="receipt" title="전달됨" aria-label="전달됨"><span class="ms">check_circle</span></span>');
  // 승인/거부 버튼으로 답한 경우: 무엇에 답했는지 작은 글씨로 아랫줄에
  const what = S?.running && ["승인", "거부", "확인", "수정", "허용", "호출하기", "예약하기"].includes(text) ? (S.consentAsk ? "이용내역 확인" : STEP_WHAT[S.steps[S.stepIdx]?.id]) : null;
  if (b && what && !b.querySelector(".ub-what")) b.querySelector(".receipt").insertAdjacentHTML("beforebegin", `<small class="ub-what">${what}</small>`);
};

const UNSENT_MS = 4000;
let unsentTimer = null;
function watchUnsent() {
  clearTimeout(unsentTimer);
  $("#composer").classList.remove("unsent");
  if (!$("#msg").value.trim()) return;
  unsentTimer = setTimeout(() => {
    if (!$("#msg").value.trim() || $("#send").dataset.mode !== "send") return;
    $("#composer").classList.add("unsent");
    if (S) logEvent("unsent_hint");
  }, UNSENT_MS);
}

// 보내기 버튼: 화살표 대신 '보내기' 글자 (작업 중 중지 버튼은 원안 그대로)
// 글로 하기 입력칸 안내 문구: '말하기'가 아니라 글자로 적는 곳임을 알 수 있게
const _syncControlsPh = syncControls;
syncControls = function () {
  _syncControlsPh();
  if (S && !$("#msg").disabled) $("#msg").placeholder = TEXT_PLACEHOLDER;
};

const _syncSendButton = syncSendButton;
syncSendButton = function () {
  _syncSendButton();
  const btn = $("#send");
  if (btn.dataset.mode === "send" && btn.textContent !== "보내기") btn.textContent = "보내기";
  if (btn.dataset.mode === "stop" && btn.textContent !== "멈추기") btn.textContent = "멈추기";
  btn.classList.toggle("send-text", btn.dataset.mode === "send");
  btn.classList.toggle("stop-text", btn.dataset.mode === "stop");
};

// 첫 인사 아래 안내 카드
const _sayKey = sayKey;
sayKey = async function (key, vars, opts) {
  const r = await _sayKey(key, vars, opts);
  if (key === "greet") renderStartGuide();
  return r;
};

function renderStartGuide() {
  // 첫 인사 말풍선 안에 안내를 함께 넣고, 안내는 회색 상자로 AI의 말과 구분
  const greet = [...chat().querySelectorAll(".bubble.agent")].at(-1);
  if (!greet) return;
  greet.classList.add("with-guide");
  greet.insertAdjacentHTML("beforeend", `<div class="guide-box">
    <b class="guide-title"><span class="ms">info</span>이렇게 대화를 시작해보세요</b>
    <ol>
      <li>아래 「눌러서 대화 시작」을 눌러요</li>
      <li>말로 할지, 글로 할지 골라요</li>
    </ol>
  </div>`);
  scrollChat();
}

// =====================================================================
// [입력 방법] 시스템은 사용자가 대화로도 진행 중인 작업을 통제할 수 있게 해야 한다
// - 낮은 자동화도 AI가 작업하는 동안 입력창을 열어 두고, 말한 내용을 받아 반영 (높은 자동화와 같은 방식)
// =====================================================================
const lowTalkable = () => Boolean(S && S.automation === "low" && S.running && !S.finished && !S.paused && !S.manual
  && !S.pinOpen && !S.pwWait && !S.waiter && !S.ivWaiter);

const _syncControls = syncControls;
syncControls = function () {
  _syncControls();
  if (!lowTalkable()) return;
  $("#msg").disabled = false;
  $("#mic").disabled = false;
  $("#msg").placeholder = TEXT_PLACEHOLDER;
  syncSendButton();
};

const _onSubmit = onSubmit;
onSubmit = function (e) {
  const text = $("#msg").value.trim();
  if (!text || !lowTalkable()) return _onSubmit(e);
  e?.preventDefault();
  $("#msg").value = "";
  fitMsg();
  appendBubble("user", text);
  logEvent("user_text", { text });
  // 화면을 누르는 중이라 바로 반영할 수 없으면 이유와 대안을 짧게 알리고, 다음에 물을 때 반영 (가이드라인 3)
  if ($(".phone").classList.contains("acting")) {
    S.queuedText = text;
    logEvent("input_queued", { text });
    renderBubble("agent", "지금은 앱 화면을 누르는 중이라 바로 바꿀 수 없어요. 이 단계가 끝나면 바로 반영할게요.");
    return;
  }
  handleInterjection(text);
  syncControls();
};

// =====================================================================
// [입력 방법] 시스템은 사용자가 대화나 익숙한 방식(취소, 뒤로 가기 등)으로도 작업을 통제할 수 있게 해야 한다
// - 휴대폰 뒤로 가기를 누르면 페이지를 나가지 않고 진행을 멈춘 뒤 가운데 다이얼로그로 물음
//   계속하기(기본) / 방금 한 일 취소 / 앱 종료(구분선 아래 빨간 글자)
// =====================================================================
function setupBackDialog() {
  const d = document.createElement("div");
  d.id = "back-dlg";
  d.className = "back-dlg";
  d.hidden = true;
  d.innerHTML = `<div class="bd-card" role="dialog" aria-modal="true" aria-labelledby="bd-title">
      <b id="bd-title">진행을 멈췄어요</b>
      <p>어떻게 할까요?</p>
      <button type="button" class="bd-go">계속하기</button>
      <button type="button" class="bd-undo">방금 한 일 취소</button>
      <button type="button" class="bd-quit">앱 종료</button>
    </div>
    <div class="bd-card bd-confirm" role="dialog" aria-modal="true" aria-labelledby="bd-q-title" hidden>
      <b id="bd-q-title">앱을 종료할까요?</b>
      <p>지금까지 한 일이 모두 취소돼요.</p>
      <button type="button" class="bd-quit-yes">종료하기</button>
      <button type="button" class="bd-quit-no">돌아가기</button>
    </div>`;
  $(".phone").appendChild(d);
  d.querySelector(".bd-go").onclick = () => closeBackDialog("continue");
  d.querySelector(".bd-undo").onclick = () => closeBackDialog("undo");
  // 앱 종료는 한 번 더 확인
  d.querySelector(".bd-quit").onclick = () => showQuitConfirm(true);
  d.querySelector(".bd-quit-no").onclick = () => showQuitConfirm(false);
  d.querySelector(".bd-quit-yes").onclick = () => closeBackDialog("quit");
  window.addEventListener("popstate", () => {
    if (!S || S.finished || !S.running) return;
    history.pushState({ v4: 1 }, ""); // 페이지에 머묾
    openBackDialog();
  });
}

function showQuitConfirm(on) {
  const d = $("#back-dlg");
  d.querySelector(".bd-card:not(.bd-confirm)").hidden = on;
  d.querySelector(".bd-confirm").hidden = !on;
  if (S) logEvent(on ? "quit_confirm" : "quit_back");
}

function openBackDialog() {
  if (!$("#back-dlg").hidden) return;
  S.backPaused = !S.paused;
  if (S.backPaused) { S.paused = true; syncControls(); }
  logEvent("back_button");
  showQuitConfirm(false);
  $("#back-dlg").hidden = false;
}

function closeBackDialog(choice) {
  $("#back-dlg").hidden = true;
  logEvent("back_choice", { choice });
  if (choice === "quit") return finish("cancelled");
  if (choice === "undo" && requestUndo()) return; // 멈춘 상태 그대로 되돌림 (이전 진행은 다시 이어지지 않음)
  if (S.backPaused) resume();
}

// =====================================================================
// [진행 카드] 읽을 것을 줄임: '할 일 처리하는 중' 제목을 빼고, AI가 작업 중일 때는 움직이는 점(…)으로 알림
// =====================================================================
const _setCard = setCard;
setCard = function (opts = {}) {
  _setCard(opts);
  const c = $("#run-card");
  if (!c) return;
  const title = c.querySelector("#rc-title");
  title.hidden = title.textContent === "할 일 처리하는 중";
  const st = c.querySelector("#rc-status");
  // 진행 문장은 대화에 이미 있으니, 작업 중에는 점만 보여 줌
  const working = Boolean(S?.running) && !S.finished && !S.stopped && !c.classList.contains("asking");
  if (working) st.innerHTML = '<span class="dots" aria-label="작업 중"><i></i><i></i><i></i></span><span class="rc-sub">AI가 앱 조작 중</span>';
  c.classList.toggle("working", working);
};

// [진행 카드] 아이콘과 움직이는 점은 카드 바깥 위에, 결과와 질문은 그 아래 흰 카드에 (점 다음에 카드가 차례로 나타남)
const _ensureRunCard = ensureRunCard;
ensureRunCard = function () {
  const c = _ensureRunCard();
  if (!c.querySelector(".rc-body")) {
    const body = document.createElement("div");
    body.className = "rc-body";
    [...c.children].filter((el) => !el.classList.contains("rc-head")).forEach((el) => body.appendChild(el));
    c.appendChild(body);
    // 카드 내용이 바뀔 때마다 다시 나타나는 효과
    const replay = () => { body.classList.remove("enter"); void body.offsetWidth; body.classList.add("enter"); };
    new MutationObserver(replay).observe(c.querySelector("#rc-q"), { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    replay();
  }
  return c;
};

// =====================================================================
// [되돌리기] 「방금 한 일 취소」(뒤로 가기 다이얼로그)와 AI 말풍선 아래 「되돌리기」
// 바로 전에 끝낸 단계를 그 단계 시작 전 상태로 되돌리고, 그 단계를 다시 물음 (높은 자동화도 이 단계만은 물어봄)
// 최종 호출 확인부터는 되돌릴 수 없음
// =====================================================================
const NO_UNDO = ["final", "password", "done", "reserve"];
const undoable = (i) => i >= 0 && S?.steps[i] && !NO_UNDO.includes(S.steps[i].id);
const stepName = (step) => step.label.replace(/^\[[^\]]*\]\s*/, "");

function snapState() {
  return structuredClone({
    form: S.form, phone: S.phone, userSet: S.userSet, userDest: S.userDest, originTarget: S.originTarget,
    manualDone: S.manualDone || {}, requestByUser: S.requestByUser, reserveCancelled: S.reserveCancelled,
  });
}

const _runStepAt = runStepAt;
runStepAt = async function (i, step) {
  (S.snaps ||= [])[i] = snapState();
  const redo = S.redoIdx === i;
  S.redoIdx = null;
  const work = runByPolicy(step, redo);
  const undo = new Promise((res) => { S.undoResolve = res; });
  const r = await Promise.race([work, undo]);
  S.undoResolve = null;
  if (r !== "__undo") return r;
  // 되돌리기: 그 단계 시작 전 상태로 돌리고 다시 물음 (멈춰 둔 이전 진행은 버림)
  const t = S.undoTo;
  Object.assign(S, structuredClone(S.snaps[t]));
  S.waiter = null; S.ivWaiter = null;
  // 멈춰 있던 이전 진행은 버리고 다시 시작
  S.resumeWaiters = []; S.paused = false; S.manual = false; S.backPaused = false; S.inReject = false; S.pickOut = null;
  S.picksShown = false;
  if (typeof setActing === "function") setActing(false);
  syncControls();
  const c = $("#run-card");
  if (c) {
    c.querySelector("#rc-q").textContent = ""; c.querySelector("#rc-q").hidden = true;
    c.querySelector("#rc-choices").innerHTML = "";
    c.classList.remove("asking", "notice", "can-manual", "away");
  }
  resetStatus();
  setChips([]);
  renderPhone();
  logEvent("undo", { to: S.steps[t].id });
  S.redoIdx = t;
  S.undoPending = false;
  renderBubble("agent", `방금 한 일을 되돌렸어요. ${stepName(S.steps[t])}부터 다시 할게요.`);
  await sleep(1200 * PACE);
  return "undo";
};

// 되돌릴 단계: 결과를 말한 마지막 AI 말풍선의 단계, 없으면 지금 단계 바로 전 단계
// 최종 호출 확인에 답하기 전까지만 되돌릴 수 있음
function canUndoNow() {
  const f = S.steps.findIndex((x) => x.id === "final");
  return f < 0 || S.stepIdx <= f;
}

function lastDoneStep() {
  const b = lastDoneBubble();
  const i = b ? Number(b.dataset.step) : (S?.stepIdx ?? 0) - 1;
  return undoable(i) ? i : null;
}

// 이미 끝난 단계(지금 단계보다 앞)의 마지막 AI 말풍선: 낮은 자동화는 승인한 질문, 높은 자동화는 "~했어요" 결과
// 승인/거부로 답한 단계는 사용자 말풍선, 답할 일이 없던 단계(높은 자동화)는 AI 말풍선
function lastDoneBubble() {
  return [...chat().querySelectorAll(":scope > .bubble[data-step]")].filter((x) => Number(x.dataset.step) < S.stepIdx).at(-1) || null;
}

function requestUndo(target = lastDoneStep(), via = "back") {
  if (!S || S.finished || !S.running || target == null || S.undoPending || !canUndoNow()) return false;
  S.undoPending = true;
  S.undoTo = target;
  appendBubble("user", via === "bubble" ? "되돌리기" : "방금 한 일 취소");
  logEvent("undo_request", { via, to: S.steps[target].id });
  document.querySelectorAll(".undo-link").forEach((b) => b.remove());
  // AI를 멈추고, 입력을 기다리거나 멈춘 지점에 닿으면 되돌림
  S.paused = true;
  const iv = setInterval(() => {
    if (!S || S.finished) return clearInterval(iv);
    if (S.undoResolve && (S.waiter || S.ivWaiter || S.resumeWaiters.length)) { clearInterval(iv); S.undoResolve("__undo"); }
  }, 80);
  return true;
}

// 이미 끝낸 단계의 마지막 AI 말풍선 하나 아래에 작은 「되돌리기」
function refreshUndoLink() {
  if (!S) return;
  const c = chat();
  c.querySelectorAll(".undo-link").forEach((b) => b.remove());
  if (!S.running || S.finished || S.undoPending) return;
  const b = lastDoneBubble();
  if (!b || !undoable(Number(b.dataset.step))) return;
  if (!canUndoNow()) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "undo-link" + (b.classList.contains("user") ? " on-user" : "");
  btn.innerHTML = '<span class="ms">undo</span>되돌리기';
  btn.onclick = () => requestUndo(Number(b.dataset.step), "bubble");
  b.after(btn);
}

// 미뤄 둔 요청은 화면 조작이 끝나면 바로 해석해서 반영 (지금 묻고 있는 질문과 상관없는 요청이어도)
setInterval(() => {
  if (!S?.queuedText || S.paused || S.finished || $(".phone").classList.contains("acting")) return;
  const text = S.queuedText; S.queuedText = null;
  handleInterjection(text);
}, 200);

function setupUndo() {
  const c = chat();
  new MutationObserver((ms) => {
    let changed = false;
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && n.classList.contains("bubble") && S?.running && n.dataset.step == null && (n.classList.contains("agent") || n.querySelector(".ub-what"))) { n.dataset.step = S.stepIdx; changed = true; }
      if (n.nodeType === 1 && n.classList.contains("bubble")) changed = true;
    }
    if (changed) refreshUndoLink();
  }).observe(c, { childList: true });
  // 단계가 넘어갈 때도 다시 확인
  let last = -2;
  setInterval(() => { if (S && S.stepIdx !== last) { last = S.stepIdx; refreshUndoLink(); } }, 300);
}

// =====================================================================
// [가이드라인 20] 기사님 요청사항: AI가 임의로 고르지 않고 먼저 물음 (낮은·높은 자동화 모두)
// 요청사항 목록을 열어 둔 채 묻고, 사용자가 고른 것을 실행화면에서 선택
// =====================================================================
const REQ_OPTIONS = () => [...REQUEST_CHOICES, "none"].map((id) => ({ id, label: REQUESTS[id] }));

async function openRequestList(s) {
  const p = s.phone;
  if (!["confirm", "request"].includes(p.sheet)) {
    if (p.sheet) { p.sheet = null; renderPhone(); await actSleep(300); }
    await tap(".tx-call");
    p.sheet = "confirm";
    renderPhone();
    await actSleep(500);
  }
  if (p.sheet !== "request") {
    p.focus = "request";
    renderPhone();
    await tap(".tx-req");
    p.focus = null;
    p.sheet = "request";
    renderPhone();
    await actSleep(500);
  }
}

async function askRequest(step) {
  resetStatus();
  setStatus("", true);
  setActing(true);
  try { await openRequestList(S); } finally { setActing(false); }
  await dwell(150);
  const ask = "기사님 요청사항을 선택할 수 있어요. 어떤 걸로 할까요?";
  await agentSay(ask);
  const hint = `고를 수 있는 기사님 요청사항은 ${REQUEST_CHOICES.map((k) => `${REQUESTS[k]}(${k})`).join(", ")}이고, 요청사항 없이 하려면 none이야. 사용자가 요청사항이나 '없음'을 말하면 set_request야. 말하지 않으면 reply로 어떤 요청사항으로 할지 되물어.`;
  for (;;) {
    const c = await askChoice(REQ_OPTIONS(), ask, ["set_request", "cancel"], hint);
    if (c.id === "__reask") continue;
    if (c.id === "cancel") { await cancelRide(); return false; }
    const k = REQUESTS[c.id] ? c.id : c.out?.request;
    if (!REQUESTS[k]) { if (c.out?.reply) await agentSay(c.out.reply, { talk: true }); continue; }
    S.m.approvals++;
    logEvent("request_chosen", { request: k, via: c.via });
    S.userSet.request = true;
    S.requestByUser = true;
    resetStatus();
    setStatus("", true);
    setActing(true);
    try {
      if (k === "none") { S.form.request = "none"; renderPhone(); await actSleep(300); await closeRequestSheet(S); }
      else await pickRequest(S, k);
    } finally { setActing(false); }
    renderPhone();
    await agentSay(k === "none" ? "기사님 요청사항 없이 진행할게요." : `기사님 요청사항을 ‘${REQUESTS[k]}’로 정했어요.`);
    await dwell();
    return true;
  }
}

// =====================================================================
// [가이드라인 17] 거부한 뒤 되물을 때 고를 수 있는 추천 선택지 (말이나 글로 답해도 됨)
// =====================================================================
const CAR_PICKS = () => Object.keys(CAR_TYPES).map((k) => ({ label: CAR_TYPES[k].label, out: { intent: "set_car", car_type: k } }));
const DIRECT = { label: "직접 입력", input: true };
function rejectPicks() {
  if (!S?.inReject) return null;
  switch (S.steps[S.stepIdx]?.id) {
    case "taxi_open": return [{ label: `${TAXI_APP} 실행`, out: { intent: "approve" } }, { label: "그만하기", cancel: true }];
    case "origin": return [{ label: "현재 위치", out: { intent: "set_origin", origin: "current" } }, DIRECT];
    case "car": return CAR_PICKS();
    case "coupon": return [{ label: "쿠폰 적용", out: { intent: "set_coupon", coupon: true } }, { label: "적용 안 함", out: { intent: "continue" } }];
    case "final": return [
      { label: "출발지 바꾸기", ask: "출발지를 어디로 바꿀까요?", sub: [{ label: "현재 위치", out: { intent: "set_origin", origin: "current" } }, DIRECT] },
      { label: "목적지 바꾸기", ask: "목적지를 어디로 바꿀까요?", sub: [DIRECT] },
      ...(S.complexity === "B" ? [{ label: "택시 종류 바꾸기", ask: "어떤 택시로 바꿀까요?", sub: CAR_PICKS() }] : []),
      { label: "호출 취소", cancel: true },
    ];
    default: return null;
  }
}

// 질문과 선택지를 진행 카드 안에 함께 (다른 선택 질문과 같은 모양)
function renderPicks(list, waiter, question = lastAgentText()) {
  const c = $("#run-card");
  if (!c || !cardLive()) return;
  const last = [...chat().querySelectorAll(":scope > .bubble.agent")].at(-1);
  if (last && last.textContent === question) last.remove(); // 방금 말풍선으로 나온 질문을 카드로 옮김
  const q = c.querySelector("#rc-q");
  q.textContent = question;
  q.hidden = false;
  const box = c.querySelector("#rc-choices");
  box.innerHTML = "";
  const listEl = document.createElement("div");
  listEl.className = "choice-list";
  list.forEach((o) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice chip";
    b.innerHTML = `<span class="c-main"><b>${esc(o.label)}</b></span><span class="ms c-go">chevron_right</span>`;
    b.onclick = () => pickReject(o, waiter);
    listEl.appendChild(b);
  });
  box.appendChild(listEl);
  c.classList.remove("away");
  c.classList.add("asking", "can-manual");
  setCard({});
  placeCard();
  S.picksShown = true;
  scrollChat();
}

function clearPicks() {
  if (!S?.picksShown) return;
  S.picksShown = false;
  freezeQuestion();
}

function pickReject(o, waiter) {
  if (!S || S.paused || S.waiter !== waiter) return;
  if (o.input) {
    // 직접 입력: 글 입력창으로
    if (inputMode.mode !== "text") setInputMode("text");
    $("#msg").focus();
    return;
  }
  appendBubble("user", o.label); // 질문은 대화 기록으로 남기고 답을 붙임
  logEvent("user_button", { choice: o.label, via: "reject_pick" });
  if (o.sub) { renderPicks(o.sub, waiter, o.ask); return; }
  S.waiter = null;
  syncControls();
  if (o.cancel) { cancelRide(); return; }
  S.pickOut = o.out;
  replyPause().then(() => waiter.resolve({ type: "text", text: o.label }));
}

// 선택지가 떠 있을 때 말이나 글로 답하면, 질문을 먼저 대화 기록으로
const _appendBubble = appendBubble;
appendBubble = function (role, text) {
  if (role === "user") clearPicks();
  return _appendBubble(role, text);
};

const _waitText = waitText;
waitText = function () {
  const p = _waitText();
  const list = rejectPicks();
  if (list) renderPicks(list, S.waiter);
  return p.then((t) => { clearPicks(); return t; });
};

const _turn = turn;
turn = async function (text, opts) {
  if (S?.pickOut) { const o = S.pickOut; S.pickOut = null; return { reply: "", ...o }; }
  return _turn(text, opts);
};

const _handleReject = handleReject;
handleReject = async function (...args) {
  S.inReject = true;
  try { return await _handleReject(...args); } finally { if (S) S.inReject = false; }
};

// =====================================================================
// [하나의 개선안] 낮은·높은 자동화를 나누지 않고, 단계마다 가이드라인 18(사소한 단계는 알아서, 중요한 결정은 확인)에 따라
// - 알아서 하고 알림: 택시 앱 실행, 예상 금액(최종 호출 확인에서 함께 확인)
// - 확인: 출발지·목적지("여기가 맞나요?"), 최종 호출
// - 먼저 물음(목록): 택시 종류, 기사님 요청사항
// - 세션2: 이용내역을 보기 전에 이유와 함께 허용을 묻고, 예약도 먼저 물음
// =====================================================================
const STEP_POLICY = { taxi_open: "auto", coupon: "auto", pay: "auto", car: "list", request: "list", reserve: "consent" };

const _newSession = newSession;
newSession = function (cfg) {
  // 조건 선택과 상관없이 하나의 개선안 (높은 복잡도 과업 기준)
  const s = _newSession({ ...cfg, condition: "B1" });
  s.unified = true;
  return s;
};

// 버튼 이름: 질문의 무게와 상황에 맞게 (가이드라인 19)
// 맞는지 확인: 수정 / 확인, 정보 접근 허용: 거부 / 허용, 예약 제안: 거부 / 예약하기, 최종 호출: 수정 / 호출하기
function choiceLabels() {
  if (S?.consentAsk) return { reject: "거부", approve: "허용" };
  const id = S?.steps[S.stepIdx]?.id;
  if (id === "final") return { reject: "수정", approve: "호출하기" };
  if (id === "reserve") return { reject: "거부", approve: "예약하기" };
  return { reject: "수정", approve: "확인" };
}
const relabel = (options, L) => (options || []).map((o) => (o.id === "approve" && o.label === "승인" ? { ...o, label: L.approve } : o.id === "reject" && o.label === "거부" ? { ...o, label: L.reject } : o));
const _setChips = setChips;
setChips = function (options, onPick) {
  const L = choiceLabels();
  // 이용내역 허용을 물을 때는 예약 내용 카드를 보여 주지 않음 (아직 이용내역을 보지 않았으므로)
  if (S?.consentAsk) { const pv = stepPreview; stepPreview = () => null; try { return _setChips(relabel(options, L), onPick); } finally { stepPreview = pv; } }
  return _setChips(relabel(options, L), onPick);
};

// 알아서 하는 단계: 결과를 읽을 시간을 넉넉히 (가이드라인 11)
async function runAuto(step) {
  const prev = [S.automation, S.cond];
  S.automation = "high";
  S.cond = "B2"; // 알리는 문구("~할게요", "~이에요")
  let r;
  try { r = await runHighStep(step); } finally { [S.automation, S.cond] = prev; }
  if (r && !S.finished) { await sleep(1500 * PACE); await gate(); } // 결과를 읽을 시간 (가이드라인 11)
  return r;
}

async function askCar(step) {
  await doPre(step);
  // 이미 말한 택시 종류가 있으면 다시 묻지 않음
  if (S.userSet?.car && CAR_TYPES[S.form.car]) {
    await doApply(step, S.form.car);
    await agentSay(`말씀하신 ${CAR_TYPES[S.form.car].label}로 할게요.`);
    await dwell();
    return true;
  }
  const ask = "택시 종류를 고를 수 있어요. 어떤 택시로 할까요?";
  await agentSay(ask);
  const opts = Object.keys(CAR_TYPES).map((k) => ({ id: k, label: CAR_TYPES[k].label, price: won0(fareOf({ ...S.form, car: k })) }));
  for (;;) {
    const c = await askChoice(opts, ask, ["set_car", "cancel"], "택시 종류를 말하면 set_car(일반택시=normal, 모범택시=deluxe, 대형택시=large)야. 말하지 않으면 reply로 어떤 택시로 할지 되물어.");
    if (c.id === "__reask") continue;
    if (c.id === "cancel") { await cancelRide(); return false; }
    const k = CAR_TYPES[c.id] ? c.id : c.out?.car_type;
    if (!CAR_TYPES[k]) { if (c.out?.reply) await agentSay(c.out.reply, { talk: true }); continue; }
    S.m.approvals++;
    logEvent("car_chosen", { car: k, via: c.via });
    setOption("car", k, c.via);
    await doApply(step, k);
    await sayKey("car.set", { car: k });
    await dwell();
    return true;
  }
}

// 세션2: 이용내역을 보기 전에 이유와 함께 묻고(가이드라인 21), 예약도 먼저 물음(가이드라인 18)
async function askReserve(step) {
  const why = "사용자님의 지난 택시 이용내역을 바탕으로, 다음에 또 이용하실 것 같은 날에 미리 택시 예약을 제안드리고 싶어요. 최근 3개월 택시 이용내역을 확인해도 될까요?";
  promote(); // 호출 완료 안내는 먼저 대화 기록으로 (질문과 섞이지 않게)
  await agentSay(why);
  S.consentAsk = true;
  let c;
  try { do { c = await askChoice(APPROVE, why, [], "이용내역을 확인해도 되면 approve, 안 되면 reject야."); } while (c.id === "__reask"); }
  finally { S.consentAsk = false; }
  logEvent("history_consent", { allowed: c.id === "approve", via: c.via });
  if (c.id !== "approve") {
    S.reserveCancelled = true;
    await agentSay("이용내역은 확인하지 않을게요.");
    return finish("completed");
  }
  setActing(true);
  try { await step.pre(S); } finally { setActing(false); }
  const pre = step.pre;
  step.pre = null; // 이미 이용내역을 열었음
  try { return await runLowStep(step); } finally { step.pre = pre; }
}

function runByPolicy(step, redo) {
  const p = STEP_POLICY[step.id];
  if (step.id === "request") return askRequest(step);
  if (step.id === "car") return askCar(step);
  if (p === "consent") return askReserve(step);
  if (p === "auto" && !redo) return runAuto(step);
  return runLowStep(step);
}

// =====================================================================
// [가이드라인 21, 22] 대화를 시작할 때 무엇을 허용할지 묻기 (항목별로 끌 수 있음)
// =====================================================================
const PERMS = [
  { id: "app", name: "앱 대신 조작하기", why: "택시를 부르려고 휴대폰 앱을 대신 눌러요" },
  { id: "location", name: "위치 정보", why: "출발지를 찾을 때 써요" },
  { id: "history", name: "택시 이용내역", why: "자주 가는 곳을 찾을 때 써요" },
];
function showPermDialog() {
  if ($("#perm-dlg")) $("#perm-dlg").remove();
  const d = document.createElement("div");
  d.id = "perm-dlg";
  d.className = "perm-dlg";
  d.innerHTML = `<div class="perm-card" role="dialog" aria-modal="true" aria-labelledby="perm-title">
      <b id="perm-title">AI와의 대화에서 무엇을 허용할까요?</b>
      <ul>${PERMS.map((p) => `<li><span><b>${p.name}</b><small>${p.why}</small></span><label class="perm-tgl"><input type="checkbox" data-perm="${p.id}" checked><i></i></label></li>`).join("")}</ul>
      <div class="perm-btns"><button type="button" class="perm-no">허용 안 함</button><button type="button" class="perm-yes">허용</button></div>
    </div>`;
  $(".phone").appendChild(d);
  const close = (all) => {
    const perm = Object.fromEntries([...d.querySelectorAll("[data-perm]")].map((x) => [x.dataset.perm, all && x.checked]));
    if (S) { S.perm = perm; logEvent("permissions", perm); }
    d.remove();
  };
  d.querySelector(".perm-yes").onclick = () => close(true);
  d.querySelector(".perm-no").onclick = () => close(false);
}

// 새 세션을 시작할 때마다 처음 상태(눌러서 시작하기)로
const _start = start;
start = function () {
  setInputMode("start");
  setTimeout(showPermDialog, 0); // 대화를 시작할 때 무엇을 허용할지 묻기
  history.pushState({ v4: 1 }, ""); // 뒤로 가기를 눌러도 페이지를 나가지 않게
  return _start();
};

// =====================================================================
// [사용자 역할] 화면은 실행 화면이 AI가 지금 내 앱을 대리조작하는 실시간 화면임을 명시적으로 알려야 한다
// - 실행화면 테두리에 여러 색 그라데이션이 돌아가고, 위 가운데에 'AI가 앱 조작 중' 칩
// - 직접 조작 버튼을 화면 바로 아래로 옮겨 한 흐름에서 이해할 수 있게
// =====================================================================
function setupRunFrame() {
  // 피그마 시안: 칩은 실행화면 위 가운데에 매달린 탭, 직접 조작 버튼은 실행화면 안 오른쪽 아래 빨간 「내가 조작하기」
  const clip = $(".screen-clip");
  const veil = document.createElement("div");
  veil.className = "ai-veil"; // AI가 조작하는 동안 흰색 0.3 덮개로 조금 흐리게
  clip.appendChild(veil);
  const chip = document.createElement("div");
  chip.className = "ai-live-chip";
  chip.textContent = "AI가 앱 조작 중 ...";
  clip.appendChild(chip);
  // 실행화면 아래 한 칸에 「멈추기」와 「내가 조작하기」를 묶음 (테두리 안)
  const frame = document.createElement("div");
  frame.className = "run-frame";
  clip.parentNode.insertBefore(frame, clip);
  frame.appendChild(clip);
  const tray = document.createElement("div");
  tray.className = "run-tray";
  const stop = $("#btn-stop");
  stop.textContent = "멈추기";
  stop.classList.add("tray-stop");
  const btn = $("#btn-manual");
  btn.classList.add("frame-manual");
  btn.textContent = "내가 조작하기";
  tray.append(stop, btn);
  frame.appendChild(tray);
  // 오른쪽 위 「?」: 실행화면의 각 요소 안내
  const help = document.createElement("button");
  help.type = "button";
  help.id = "btn-help";
  help.className = "pv-help";
  help.setAttribute("aria-label", "화면 안내");
  help.innerHTML = '<span class="ms">help</span>';
  help.onclick = openCoach;
  $(".pv-head").appendChild(help);
}

// 실행화면 크기: 아래 버튼 칸만큼 빼고 맞춤
const _fitScreen = fitScreen;
fitScreen = function () {
  _fitScreen();
  const phone = $(".phone");
  if (phone?.dataset.view !== "progress") return;
  const box = $(".screen-box");
  const clip = $(".screen-clip");
  const W = phone.clientWidth;
  const H = parseFloat(phone.style.getPropertyValue("--app-h")) || phone.clientHeight;
  const tray = 64;
  const scale = Math.max(0.3, Math.min(0.8, (box.clientHeight - 36 - tray) / H, (box.clientWidth * 0.86) / W));
  phone.style.setProperty("--scale", scale.toFixed(4));
  clip.style.width = `${Math.floor(W * scale)}px`;
  clip.style.height = `${Math.floor(H * scale)}px`;
};

// =====================================================================
// [「?」 화면 안내] AI를 잠시 멈추고, 실행화면·멈추기·내가 조작하기를 차례로 짚어 줌 (나머지는 어둡게)
// =====================================================================
const COACH = [
  { sel: ".screen-clip", text: "AI가 지금 내 앱을 대신 누르는 실시간 화면이에요. 여기는 누를 수 없어요." },
  { sel: "#btn-stop", text: "AI를 잠시 멈춰요. 다시 이어서 할 수 있어요." },
  { sel: "#btn-manual", text: "AI 대신 내가 직접 앱을 눌러요." },
];
function openCoach() {
  if (!S) return;
  const pausedByCoach = S.running && !S.paused;
  if (pausedByCoach) { S.paused = true; syncControls(); }
  logEvent("help_open");
  const phone = $(".phone");
  phone.classList.add("coaching");
  const layer = document.createElement("div");
  layer.className = "coach";
  layer.innerHTML = '<div class="coach-hole"></div><div class="coach-tip" role="dialog" aria-live="polite"><p></p><div class="coach-foot"><span class="coach-n"></span><button type="button" class="coach-next"></button></div></div>';
  phone.appendChild(layer);
  let i = 0;
  const show = () => {
    const t = $(COACH[i].sel);
    const pr = phone.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    const pad = 6;
    const hole = layer.querySelector(".coach-hole");
    Object.assign(hole.style, { left: `${r.left - pr.left - pad}px`, top: `${r.top - pr.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, borderRadius: getComputedStyle(t).borderRadius });
    const tip = layer.querySelector(".coach-tip");
    tip.querySelector("p").textContent = COACH[i].text;
    tip.querySelector(".coach-n").textContent = `${i + 1} / ${COACH.length}`;
    tip.querySelector(".coach-next").textContent = i < COACH.length - 1 ? "다음" : "알겠어요";
    // 짚은 곳 아래에 자리가 있으면 아래, 없으면 위
    const below = r.bottom - pr.top + 14;
    tip.style.top = "";
    tip.style.bottom = "";
    if (below + 150 < pr.height) tip.style.top = `${below}px`;
    else tip.style.bottom = `${pr.bottom - r.top + 14}px`;
    if (i === 0) { tip.style.top = `${r.top - pr.top + r.height * 0.4}px`; tip.style.bottom = ""; }
  };
  layer.querySelector(".coach-next").onclick = () => {
    i++;
    if (i < COACH.length) return show();
    layer.remove();
    phone.classList.remove("coaching");
    logEvent("help_close");
    if (pausedByCoach && S && !S.finished) resume();
  };
  show();
}

// 내가 조작하기: 실행화면이 커지며 전체 화면을 덮고 → 흰 화면과 로딩 스피너 → 실제 앱 화면이 살짝 튕기며 나타남
const _startManual = startManual;
startManual = function () {
  const fromRun = $(".phone").dataset.view === "progress";
  const r = _startManual();
  if (fromRun) playManualIntro();
  return r;
};

function playManualIntro() {
  const phone = $(".phone");
  let load = $("#manual-loading");
  if (!load) {
    load = document.createElement("div");
    load.id = "manual-loading";
    load.innerHTML = '<span class="spinner"></span>';
    phone.appendChild(load);
  }
  const zoomMs = 1100 * PACE; // 원안의 확대 애니메이션 시간과 같게
  clearTimeout(playManualIntro.t1); clearTimeout(playManualIntro.t2);
  playManualIntro.t1 = setTimeout(() => {
    load.className = "on";
    playManualIntro.t2 = setTimeout(() => {
      load.className = "";
      const clip = $(".screen-clip");
      clip.classList.remove("bounce-in"); void clip.offsetWidth; clip.classList.add("bounce-in");
    }, 900);
  }, zoomMs);
}

// =====================================================================
// [진행 현황] 화면은 지금 진행 중인 단계가 무엇인지 분명히 알려야 한다
// - 현재 대화(진행 카드 또는 마지막 말풍선)를 대화창 맨 위에 둠: 아래에 빈 공간을 둬서 지나간 대화가 위로 올라가게
// - 지나간 대화는 흐리게, 스크롤을 올려 그 대화가 화면 아래쪽으로 오면 다시 진하게
// - 지나간 AI 말풍선에는 작게 '완료'
// =====================================================================
function currentItem() {
  const c = chat();
  const card = $("#run-card");
  if (card && !card.classList.contains("away") && card.offsetParent) return card;
  const items = [...c.querySelectorAll(":scope > .bubble:not(.typing)")];
  return items.at(-1) || null;
}

let focusQueued = false;
function queueFocus() {
  if (focusQueued) return;
  focusQueued = true;
  requestAnimationFrame(() => requestAnimationFrame(() => { focusQueued = false; applyFocus(); }));
}

const FADE = 84; // 현재 대화 위로 남겨 둘 높이 (바로 앞 말풍선과 「되돌리기」가 살짝 보이게)
function applyFocus() {
  const c = chat();
  if (!c || !S) return;
  let spacer = $("#chat-spacer");
  if (!spacer) { spacer = document.createElement("div"); spacer.id = "chat-spacer"; }
  if (spacer.nextSibling || spacer.parentNode !== c) c.appendChild(spacer);
  const cur = currentItem();
  // 현재 대화가 맨 위에 오도록 아래 빈 공간
  if (cur) {
    const top = cur.offsetTop - c.offsetTop;
    const contentEnd = spacer.offsetTop - c.offsetTop;
    // 위쪽 흐림 띠(FADE) 아래에 현재 대화가 오도록
    const need = c.clientHeight - (contentEnd - top) - FADE;
    spacer.style.height = `${Math.max(0, need)}px`;
    c.scrollTop = Math.max(0, top - FADE);
    c.classList.toggle("scrolled", c.scrollTop > 4);
  }
}


function setupFocus() {
  const c = chat();
  // 위에 지나간 대화가 있을 때만 위쪽 흐림
  const markScrolled = () => c.classList.toggle("scrolled", c.scrollTop > 4);
  c.addEventListener("scroll", markScrolled, { passive: true });
  new MutationObserver((ms) => { if (ms.some((m) => [...m.addedNodes, ...m.removedNodes].some((n) => n.id !== "chat-spacer"))) queueFocus(); })
    .observe(c, { childList: true });
  const card = () => $("#run-card");
  new MutationObserver(queueFocus).observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true, attributeOldValue: false });
}

document.addEventListener("DOMContentLoaded", setupInputMode);
document.addEventListener("DOMContentLoaded", setupFocus);
document.addEventListener("DOMContentLoaded", setupRunFrame);
document.addEventListener("DOMContentLoaded", setupBackDialog);
document.addEventListener("DOMContentLoaded", setupUndo);
