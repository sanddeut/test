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
const TEXT_PLACEHOLDER = "여기에 글자로 적어 주세요";

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
const _renderBubble = renderBubble;
renderBubble = function (role, text) {
  _renderBubble(role, text);
  if (role !== "user") return;
  const b = [...chat().querySelectorAll(".bubble.user")].at(-1);
  if (b && !b.querySelector(".receipt")) b.insertAdjacentHTML("beforeend", '<span class="receipt" title="전달됨" aria-label="전달됨"><span class="ms">check_circle</span></span>');
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
  btn.classList.toggle("send-text", btn.dataset.mode === "send");
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
  // TODO: '방금 한 일 취소'는 단계별로 무엇을 되돌릴지 정한 뒤 구현 (지금은 계속하기와 같음)
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
  const working = !c.classList.contains("asking") && !S?.finished && (st.textContent === "작업 중이에요" || (!st.textContent.trim() && st.classList.contains("thinking")));
  if (working) st.innerHTML = '<span class="dots" aria-label="작업 중"><i></i><i></i><i></i></span>';
  c.classList.toggle("working", working);
};

// 새 세션을 시작할 때마다 처음 상태(눌러서 시작하기)로
const _start = start;
start = function () {
  setInputMode("start");
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
  const btn = $("#btn-manual");
  btn.classList.add("frame-manual");
  btn.innerHTML = '<span class="ms fill">back_hand</span>내가 조작하기';
  clip.appendChild(btn);
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

function applyFocus() {
  const c = chat();
  if (!c || !S) return;
  let spacer = $("#chat-spacer");
  if (!spacer) { spacer = document.createElement("div"); spacer.id = "chat-spacer"; }
  if (spacer.nextSibling || spacer.parentNode !== c) c.appendChild(spacer);
  const cur = currentItem();
  // 지나간 대화 표시
  c.querySelectorAll(":scope > .bubble, :scope > #run-card").forEach((el) => {
    const past = Boolean(cur) && el !== cur && el.id !== "typing" && (el.compareDocumentPosition(cur) & Node.DOCUMENT_POSITION_FOLLOWING);
    el.classList.toggle("past", past);
    if (past) pastObserver.observe(el);
  });
  // 현재 대화가 맨 위에 오도록 아래 빈 공간
  if (cur) {
    const top = cur.offsetTop - c.offsetTop;
    const contentEnd = spacer.offsetTop - c.offsetTop;
    const need = c.clientHeight - (contentEnd - top) - 24;
    spacer.style.height = `${Math.max(0, need)}px`;
    c.scrollTop = Math.max(0, top - 12);
  }
}

// 지나간 대화가 화면 아래쪽(아래 45%)에 오면 진하게
const pastObserver = new IntersectionObserver((entries) => {
  entries.forEach((e) => e.target.classList.toggle("near", e.isIntersecting));
}, { root: null, rootMargin: "-55% 0px 0px 0px" });

function setupFocus() {
  const c = chat();
  new MutationObserver((ms) => { if (ms.some((m) => [...m.addedNodes, ...m.removedNodes].some((n) => n.id !== "chat-spacer"))) queueFocus(); })
    .observe(c, { childList: true });
  const card = () => $("#run-card");
  new MutationObserver(queueFocus).observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true, attributeOldValue: false });
}

document.addEventListener("DOMContentLoaded", setupInputMode);
document.addEventListener("DOMContentLoaded", setupFocus);
document.addEventListener("DOMContentLoaded", setupRunFrame);
document.addEventListener("DOMContentLoaded", setupBackDialog);
