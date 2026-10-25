// 연구2 개선안: 연구2 가이드라인 구현(v4)의 화면·동작을 연구2 시나리오(기존안과 같은 엔진)에 얹음
// v4/js/improve.js를 가져와 연구2 결정에 맞게 고침: 출발지·목적지는 알리고 진행, 택시 종류·최종 호출만 먼저 물음,
// 오류 ① 잘못 알아들음(G2 전달 안 됨 표시·다시 보내기, G3 다른 입력 방법) ② 하차 지점 변경(G5 먼저 알림, G10 이유 보기, G16 되돌리기)
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
  form.addEventListener("submit", () => { clearTimeout(v4UnsentTimer); form.classList.remove("unsent"); });
  $("#send").addEventListener("click", () => { clearTimeout(v4UnsentTimer); form.classList.remove("unsent"); });
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
  if (!v.querySelector(".vlabel")) {
    v.innerHTML = '<span class="vlabel"></span><span class="vtext"></span><span class="vcancel" role="button" aria-label="취소"><span class="ms">close</span></span>';
    // 듣는 중 ✕: 듣기를 끝냄
    v.querySelector(".vcancel").addEventListener("click", (e) => { e.stopPropagation(); window.stopMic?.(false); renderVoice(); }); // 듣기만 끝냄 (받아 적은 말은 남김)
  }
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
  if (b && !b.querySelector(".receipt")) b.insertAdjacentHTML("beforeend", '<span class="receipt" title="전달됨" aria-label="전달됨"><span class="ms">check_circle</span><em>전달됨</em></span>');
  // 전달됨은 잠시 보인 뒤 사라짐 (전달 안 됨은 계속 보임)
  const rc = b?.querySelector(".receipt");
  if (rc && !rc.dataset.timer) { rc.dataset.timer = "1"; setTimeout(() => { if (!rc.classList.contains("fail")) rc.classList.add("gone"); }, RECEIPT_MS); }
  // 승인/거부 버튼으로 답한 경우: 무엇에 답했는지 작은 글씨로 아랫줄에
  const what = S?.running && ["승인", "거부", "확인", "수정", "허용", "호출하기", "예약하기"].includes(text) ? (S.consentAsk ? "이용내역 확인" : STEP_WHAT[S.steps[S.stepIdx]?.id]) : null;
  if (b && what && !b.querySelector(".ub-what")) b.querySelector(".receipt").insertAdjacentHTML("beforebegin", `<small class="ub-what">${what}</small>`);
};

const RECEIPT_MS = 3500; // '전달됨' 표시를 보여 주는 시간
const UNSENT_MS = 4000;
let v4UnsentTimer = null;
function watchUnsent() {
  clearTimeout(v4UnsentTimer);
  $("#composer").classList.remove("unsent");
  if (!$("#msg").value.trim()) return;
  v4UnsentTimer = setTimeout(() => {
    if (!$("#msg").value.trim() || $("#send").dataset.mode !== "send") return;
    $("#composer").classList.add("unsent");
    if (S) logEvent("unsent_hint");
  }, UNSENT_MS);
}

// 보내기 버튼: 화살표 대신 '보내기' 글자 (작업 중 중지 버튼은 원안 그대로)
// 글로 하기 입력칸 안내 문구: '말하기'가 아니라 글자로 적는 곳임을 알 수 있게
const STOP_LABEL = "일시정지"; // 멈추기 버튼 이름 (입력창·실행화면 모두)
const _syncControlsPh = syncControls;
syncControls = function () {
  _syncControlsPh();
  if (S && !$("#msg").disabled) $("#msg").placeholder = TEXT_PLACEHOLDER;
  else if (S && $("#msg").placeholder === "AI가 작업 중이에요") $("#msg").placeholder = "AI가 앱 조작 중…"; // 대화창 대신 입력창에서 알림
  const st = $("#btn-stop");
  const stLabel = S?.framePaused ? "다시 시작" : STOP_LABEL;
  if (st && st.textContent !== stLabel) st.textContent = stLabel;
  if (S?.framePaused) { st.disabled = false; $("#btn-manual").disabled = false; }
  const mb = $("#btn-manual");
  if (S?.unified && mb && mb.textContent !== "내가 앱 조작하기") mb.textContent = "내가 앱 조작하기";
};

const _syncSendButton = syncSendButton;
syncSendButton = function () {
  _syncSendButton();
  const btn = $("#send");
  // 개선안: 입력창 버튼은 늘 「보내기」 (멈추기는 실행화면의 「일시정지」로)
  if (S?.unified && btn.dataset.mode === "stop") btn.dataset.mode = "send";
  if (S?.unified && !S.finished) btn.disabled = false; // 언제든 보낼 수 있게
  if (btn.dataset.mode === "send" && btn.textContent !== "보내기") btn.textContent = "보내기";
  if (btn.dataset.mode === "stop" && btn.textContent !== STOP_LABEL) btn.textContent = STOP_LABEL;
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
  $("#msg").placeholder = "AI가 앱 조작 중…"; // AI가 작업하는 동안: 대화창 대신 입력창에서 알림 (말을 걸 수는 있음)
  syncSendButton();
};

// 개선안: 입력칸 안내 문구는 늘 같게
const _syncControlsNoPh = syncControls;
syncControls = function () {
  _syncControlsNoPh();
  if (S?.unified) $("#msg").placeholder = "메시지 입력...";
  if (S?.unified && !S.finished) { $("#msg").disabled = false; $("#send").disabled = false; $("#mic").disabled = false; } // 언제든 입력하고 보낼 수 있게
};

// 개선안: 보내기는 언제나 가능. AI가 바로 받을 수 없는 순간(답을 해석하는 중 등)에 보낸 말은 말풍선으로 먼저 보이고, 받을 수 있게 되면 이어서 처리
function canTakeText() {
  return Boolean(S.ivWaiter || (S.waiter && !S.paused) || (S.automation === "high" && S.running && !S.paused && !S.pinOpen) || lowTalkable());
}
function deliverQueued() {
  const text = S?.inbox;
  if (!text || S.finished) return;
  if (S.ivWaiter) { const w = S.ivWaiter; S.ivWaiter = null; S.inbox = null; logEvent("user_text", { text, queued: true }); w(text); }
  else if (S.waiter && !S.paused) { const w = S.waiter; S.waiter = null; S.inbox = null; setChips([]); logEvent("user_text", { text, queued: true }); w.resolve({ type: "text", text }); }
  else if (lowTalkable() && !$(".phone").classList.contains("acting")) { S.inbox = null; logEvent("user_text", { text, queued: true }); handleInterjection(text); }
  else return;
  syncControls();
}
setInterval(() => { if (S?.unified) deliverQueued(); }, 300);

const _onSubmit = onSubmit;
onSubmit = function (e) {
  const text = $("#msg").value.trim();
  if (text && S?.unified && !S.finished && !canTakeText()) {
    e?.preventDefault();
    window.stopMic?.(false);
    $("#msg").value = "";
    $("#msg").dispatchEvent(new Event("input"));
    fitMsg();
    clearUnsent();
    appendBubble("user", text);
    S.inbox = S.inbox ? `${S.inbox}\n${text}` : text;
    logEvent("input_queued", { text });
    return;
  }
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
  if (working) st.innerHTML = '<span class="dots" aria-label="AI가 앱 조작 중"><i></i><i></i><i></i></span>'; // 기다림 안내는 AI 프로필 옆으로
  c.classList.toggle("working", working);
};

// [기다림 안내] AI가 일하는 동안 "잠시만 기다려 주세요"를 분명히: 대화창은 AI 프로필 옆(점 자리), 실행화면은 아래 카드
const STEP_DOING = {
  taxi_open: "택시 앱을 열고", origin: "출발지를 설정하고", dest: "목적지를 설정하고", car: "택시 종류를 고르고",
  count: "택시 대수를 정하고", pay: "결제 방식을 고르고", coupon: "예상 금액을 확인하고", drop: "내릴 곳을 정하고",
  request: "기사님 요청사항을 고르고", final: "호출 내용을 정리하고", reserve: "예약 호출을 준비하고",
};
function waitLabel() {
  if (!S?.running || S.finished) return "AI가 답변을 준비하고 있어요";
  return `AI가 ${STEP_DOING[S.steps[S.stepIdx]?.id] || "앱을 조작하고"} 있어요`;
}
function aiBusy() {
  if (!S || S.finished) return false;
  if ($("#perm-dlg")?.offsetParent) return false; // 허용을 묻는 중
  if ($("#typing")) return true;
  const asking = $("#pv-chips")?.children.length || $("#run-card")?.classList.contains("asking") || S.waiter || S.ivWaiter;
  return Boolean(S.running && !S.paused && !S.stopped && !S.manual && !S.pinOpen && !S.pwWait && !asking);
}
const waitHTML = (cls) => `<div class="${cls}" role="status" hidden><i class="wait-spin"></i><span><b></b><small>잠시만 기다려 주세요</small></span></div>`;
// 대화창: AI가 답을 준비할 때는 「…」 말풍선 대신 기다림 안내
const _showTyping = showTyping;
showTyping = function (on) {
  _showTyping(on);
  const t = $("#typing");
  if (on && t && S?.unified && !t.classList.contains("wait-bubble")) {
    t.classList.add("wait-bubble");
    t.innerHTML = '<i class="wait-spin"></i><div><b>AI가 답변을 준비하고 있어요</b><small>잠시만 기다려 주세요</small></div>';
  }
};
setInterval(() => {
  if (!S?.unified) return;
  const on = aiBusy(), t = waitLabel();
  // 실행화면: 아래 카드
  if (!$(".pv-wait")) $("#pv-status").insertAdjacentHTML("afterend", waitHTML("pv-wait"));
  const pv = $(".pv-wait");
  pv.hidden = !on;
  if (pv.querySelector("b").textContent !== t) pv.querySelector("b").textContent = t;
  // 대화창: 진행 카드 위 AI 프로필 옆 (점 자리)
  const head = $("#run-card .rc-head");
  if (head) {
    if (!head.querySelector(".rc-wait")) {
      head.insertAdjacentHTML("beforeend", '<div class="rc-wait" role="status"><span><b></b><small>잠시만 기다려 주세요</small></span></div>');
      const pb = document.createElement("button"); // 대화창에서 바로 멈추기 (입력창 버튼은 늘 「보내기」)
      pb.type = "button"; pb.className = "wait-stop"; pb.textContent = STOP_LABEL;
      pb.onclick = () => S && handleStop("button");
      head.querySelector(".rc-wait").appendChild(pb);
    }
    head.classList.toggle("waiting", on && S.running && !$("#typing"));
    const hb = head.querySelector(".rc-wait b");
    if (hb.textContent !== t) hb.textContent = t;
  }
  // 실행화면 태그: AI가 질문하고 답을 기다리는 동안에는 「AI가 답을 기다려요」
  const chip = $(".ai-live-chip");
  if (chip) {
    const waiting = S.running && !S.finished && !S.paused && ($("#pv-chips")?.children.length || $("#run-card")?.classList.contains("asking") || S.waiter);
    const ct = waiting ? "AI가 답을 기다려요" : "AI가 앱 조작 중 ...";
    if (chip.textContent !== ct) chip.textContent = ct;
  }
}, 300);

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
// 최종 호출 확인부터는 되돌릴 수 없음. 단, 호출한 뒤에는 호출 완료 안내 아래 '되돌리기'로 AI가 호출 취소를 시도함 (아래 [호출한 뒤])
// =====================================================================
const NO_UNDO = ["final", "password", "done", "reserve", "taxi_open", "coupon"];
// 호출한 뒤(세션1은 배차 뒤 기다리는 동안, 세션2는 예약을 마치기 전까지): 호출 완료 안내 아래 되돌리기 = 호출 취소 시도
const afterCall = () => Boolean(S && (S.postCall || (S.rideDone && !S.form.reserved)));
const undoable = (i) => i >= 0 && S?.steps[i] && (!NO_UNDO.includes(S.steps[i].id) || (afterCall() && S.steps[i].id === "done"));
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
  if (afterCall()) return cancelCall(null); // 호출한 뒤 되돌리기 = 호출 취소 시도
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
  if (afterCall()) return true;
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
  if (afterCall()) {
    // 호출 완료 안내 아래 (세션2는 예약을 물을 때 대화 기록으로 옮겨져 예약 단계 번호가 붙으므로 문구로 찾음)
    const d = S.steps.findIndex((x) => x.id === "done");
    const said = lines("done", S).join(" ");
    const b = [...chat().querySelectorAll(":scope > .bubble.agent")].filter((x) => Number(x.dataset.step) === d || x.textContent === said).at(-1) || null;
    if (b) b.dataset.step = d;
    return b;
  }
  const done = [...chat().querySelectorAll(":scope > .bubble[data-step]")].filter((x) => Number(x.dataset.step) < S.stepIdx);
  // 오류 ② 택시 2대: 예상 금액(되돌릴 수 없는 알림)이 끝난 뒤에도 최종 호출 전까지 '2대를 부를게요' 아래에 「되돌리기」를 남김 (가이드라인 16)
  // (말풍선 번호는 대화 기록으로 옮겨질 때 붙어 예상 금액 단계로 잡힐 수 있으므로 문구로 찾음)
  const ci = S.steps.findIndex((x) => x.id === "count");
  if (ci >= 0 && S.stepIdx > ci && ["coupon", "final"].includes(S.steps[S.stepIdx]?.id) && S.countApplied && !S.countBlocked && !S.userSet?.count) {
    const said = lines("count.announce", S).join(" ").trim();
    const cnt = done.filter((x) => x.classList.contains("agent") && x.textContent.trim().startsWith(said)).at(-1);
    if (cnt) { cnt.dataset.step = ci; return cnt; }
  }
  return done.at(-1) || null;
}

function requestUndo(target = lastDoneStep(), via = "back") {
  if (!S || S.finished || !S.running || target == null || S.undoPending || !canUndoNow()) return false;
  S.undoPending = true;
  S.undoTo = target;
  if (afterCall() && $("#run-card")?.classList.contains("asking")) freezeQuestion(); // 묻던 질문(세션2 예약)을 먼저 대화 기록으로
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
  if (S?.afterCancel) return AFTER_CANCEL_PICKS();
  if (!S?.inReject) return null;
  switch (S.steps[S.stepIdx]?.id) {
    case "taxi_open": return [{ label: `${TAXI_APP} 실행`, out: { intent: "approve" } }, { label: "그만하기", cancel: true }];
    case "origin": return [{ label: "현재 위치", out: { intent: "set_origin", origin: "current" } }, DIRECT];
    case "car": return CAR_PICKS();
    case "coupon": return [{ label: "쿠폰 적용", out: { intent: "set_coupon", coupon: true } }, { label: "적용 안 함", out: { intent: "continue" } }];
    case "final": return [
      { label: "출발지 바꾸기", ask: "출발지를 어디로 바꿀까요?", sub: [...(ERR_SET === 2 ? ORIGIN_RESULTS.filter((r) => r.key).map((r) => ({ label: r.name, out: { intent: "set_origin", origin: r.key } })) : []), { label: "현재 위치", out: { intent: "set_origin", origin: "current" } }, DIRECT] },
      { label: "목적지 바꾸기", ask: "목적지를 어디로 바꿀까요?", sub: [DIRECT] },
      ...(S.complexity === "B" ? [{ label: "택시 종류 바꾸기", ask: "어떤 택시로 바꿀까요?", sub: CAR_PICKS() }] : []),
      ...(S.session === 0 && ERR_SET === 1 ? [{ label: "호출 대수 바꾸기", ask: "택시를 몇 대 부를까요?", sub: [1, 2].map((n) => ({ label: `${n}대`, out: { intent: "set_count", count: n } })) }] : []),
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
// 연구2: 높은 자동화를 유지하고 G18·G20에 따라 택시 종류·최종 호출만 먼저 물음. 출발지·목적지·하차 지점은 먼저 알리고 읽을 시간 뒤 진행
const STEP_POLICY = { taxi_open: "auto", origin: "announce", dest: "announce", car: "list", count: "announce", coupon: "auto", pay: "auto", drop: "announce", request: "list", reserve: "consent" };
const READ_MS = 6000; // 알리고 진행하는 단계의 읽을 시간 (가이드라인 11)

const _newSession = newSession;
newSession = function (cfg) {
  // 조건 선택과 상관없이 하나의 개선안 (높은 복잡도 과업 기준)
  const s = _newSession({ ...cfg, condition: "B1" });
  s.unified = true;
  s.perm = { app: null, location: true }; // 앱 대신 조작은 택시 앱을 열기 직전에 물음
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
  if (r && !S.finished) await gate(); // 따로 더 쉬지 않음 (읽을 시간은 단계 간격 6초로 충분)
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

// 먼저 알리고("~할게요") 읽을 시간 뒤 진행 (가이드라인 5·11). 진행한 뒤에는 「되돌리기」 (가이드라인 16)
async function announceStep(step) {
  if (step.id === "drop" && (S.dropBlocked || S.form.dest !== TARGET_PLACE)) return true;
  if (step.id === "count" && (S.userSet?.count || S.countBlocked)) return true;
  const prev = S.automation;
  S.automation = "high"; // 알리고 진행하는 단계는 높은 자동화와 같은 방식으로 말풍선을 남김
  try { return await announceInner(step); } finally { S.automation = prev; }
}
async function announceInner(step) {
  if (step.id === "origin") { const r = await prepOrigin(step); if (r !== "go") return r; }
  if (manualDone(step)) { logEvent("step_done_manually"); return true; }
  await gate();
  await sayBusy(step);
  await doPre(step);
  if (step.kind === "dest") S.form.dest = S.form.dest ?? S.userDest ?? AGENT_PLACE;
  const vars = step.id === "origin" ? { origin: S.originTarget || TARGET_ORIGIN } : step.kind === "dest" ? { dest: S.form.dest } : {};
  const n0 = S.log.filter((e) => e.type === "dest_changed").length;
  const said = lines(`${step.id}.announce`, S, vars);
  const why = reasonOf(step.id);
  if (why) said.forEach((m) => ((S.reasons ||= {})[m.trim()] = why));
  for (const m of said) await agentSay(m, { gated: true });
  if (step.id === "count" && S.m.errorShownAt == null) S.m.errorShownAt = now();
  if (step.id === "drop") {
    if (S.m.errorShownAt == null) S.m.errorShownAt = now();
    // 바꾸는 이유는 먼저 말하지 않고, 「AI가 ~하는 중」을 펼치면 볼 수 있음 (가이드라인 10)
  }
  for (let t = 0; t < READ_MS; t += 250) { await sleep(250 * PACE); await gate(); }
  // 읽는 동안 참가자가 목적지를 직접 바꿨으면 하차 지점은 바꾸지 않음
  if (step.id === "drop" && S.log.filter((e) => e.type === "dest_changed").length !== n0) { S.dropBlocked = true; return true; }
  await doApply(step, step.kind === "dest" ? S.form.dest : undefined, { announced: true });
  if (step.kind === "dest") S.m.destStepDecision = S.form.dest === AGENT_PLACE ? "agent" : "changed";
  await dwell();
  return true;
}

// 앱 대신 조작하기를 허용하지 않았으면, 택시 앱을 열기 전에 왜 필요한지 설명하고 다시 묻기 (가이드라인 21·22)
async function askAppPermission() {
  const ask = `택시를 부르려면 제가 ‘${TAXI_APP}’ 앱에 들어가서 대신 눌러야 해요. 허용해 주시겠어요?`;
  await agentSay(ask);
  const opts = [{ id: "approve", label: "허용" }]; // 실험 진행을 위해 허용만 둠
  for (;;) {
    const c = await askChoice(opts, ask, ["cancel"], "앱 대신 조작하기를 허용하면 approve, 허용하지 않으면 reject야.");
    if (c.id === "__reask") continue;
    if (c.id === "cancel") { await cancelRide(); return false; }
    logEvent("app_permission_ask", { allowed: c.id === "approve", via: c.via });
    if (c.id === "approve") { S.perm.app = true; await agentSay("허용해 주셔서 고마워요. 택시 앱을 열게요."); return true; }
    await agentSay("허용하지 않으시면 제가 택시 앱을 열 수 없어요. 직접 하시려면 아래 「내가 앱 조작하기」를 눌러 주세요. 허용하시면 바로 이어서 할게요.");
  }
}

function runByPolicy(step, redo) {
  const p = STEP_POLICY[step.id];
  if (step.id === "taxi_open" && S.perm && S.perm.app !== true) {
    // 처음이면 팝업으로 묻고, 허용 안 함이면 대화에서 왜 필요한지 설명하고 다시 물음
    const ask = S.perm.app == null ? showPermDialog() : Promise.resolve(false);
    return ask.then((ok) => (ok ? runAuto(step) : askAppPermission().then((ok2) => (ok2 ? runAuto(step) : ok2))));
  }
  if (step.id === "origin" && redo && ERR_SET === 2 && S.originErrDone) logEvent("origin_undo", { via: "undo" }); // 오류②(대구 동천역)를 되돌림
  if (p === "announce") {
    // 오류 ② 택시 2대: 되돌리면 1대로 두고 다시 바꾸지 않음
    if (step.id === "count") { if (redo) { S.countBlocked = true; logEvent("count_changed", { value: 1, via: "undo" }); return Promise.resolve(true); } return announceStep(step); }
    if (step.id === "drop") { if (redo) { S.dropBlocked = true; return Promise.resolve(true); } return announceStep(step); }
    return redo ? runLowStep(step) : announceStep(step); // 되돌린 뒤에는 맞는지 물음
  }
  if (step.id === "request") return askRequest(step);
  if (step.id === "car") return askCar(step);
  if (p === "consent") return askReserve(step);
  if (p === "auto" && !redo) return runAuto(step);
  return runLowStep(step);
}

// =====================================================================
// [가이드라인 21, 22] 대화를 시작할 때 무엇을 허용할지 묻기 (항목별로 끌 수 있음)
// =====================================================================
// [가이드라인 21, 22] 택시 앱을 열기 직전에 앱 대신 조작을 허용할지 묻기 (허용 / 허용 안 함)
function showPermDialog() {
  return new Promise((res) => {
    if ($("#perm-dlg")) $("#perm-dlg").remove();
    const d = document.createElement("div");
    d.id = "perm-dlg";
    d.className = "perm-dlg";
    d.innerHTML = `<div class="perm-card" role="dialog" aria-modal="true" aria-labelledby="perm-title">
        <b id="perm-title">사용자님 대신에 제가 ‘${TAXI_APP}’ 앱에 들어가서 택시를 부르려고 해요.<br>괜찮을까요?</b>
        <div class="perm-btns"><button type="button" class="perm-no">허용 안 함</button><button type="button" class="perm-yes">허용</button></div>
      </div>`;
    $(".phone").appendChild(d);
    const close = (ok) => {
      if (S) { S.perm.app = ok; logEvent("permissions", { app: ok }); gLog(["G21", "G22"], "permission_set", { app: ok }); }
      d.remove();
      res(ok);
    };
    d.querySelector(".perm-yes").onclick = () => close(true);
    d.querySelector(".perm-no").onclick = () => close(false);
  });
}

// 새 세션을 시작할 때마다 처음 상태(눌러서 시작하기)로
const _start = start;
start = function () {
  document.body.classList.add("unified");
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
  // 실행화면에 처음 들어오면 화면 전체를 어둡게 하고 무엇을 보는 화면인지 알림 → [확인]을 누를 때까지 AI는 멈춤
  const chip = document.createElement("div");
  chip.className = "ai-live-chip"; // 안내(딤)를 닫은 뒤에 보임
  chip.textContent = "AI가 앱 조작 중 ...";
  clip.appendChild(chip);
  const intro = document.createElement("div");
  intro.className = "run-intro";
  intro.hidden = true;
  intro.innerHTML = '<span class="tx-logo run-intro-logo"><span class="ms fill">local_taxi</span></span><p>AI가 마음택시 앱을 사용하는<br>실시간 화면을 보여드려요.</p><button type="button" class="run-intro-ok">확인</button>';
  intro.addEventListener("click", (e) => e.stopPropagation());
  intro.querySelector("button").onclick = () => {
    intro.hidden = true;
    gLog(["G6", "G23"], "run_intro_ok");
    if (S?.introPause) { S.introPause = false; resume(); }
  };
  clip.appendChild(intro);
  // 실행화면(테두리) 바로 아래, 테두리 밖에 「일시정지」와 「내가 앱 조작하기」
  const frame = document.createElement("div");
  frame.className = "run-frame";
  clip.parentNode.insertBefore(frame, clip);
  frame.appendChild(clip);
  const tray = document.createElement("div");
  tray.className = "run-tray";
  const stop = $("#btn-stop");
  stop.textContent = STOP_LABEL;
  stop.classList.add("tray-stop");
  const btn = $("#btn-manual");
  btn.classList.add("frame-manual");
  btn.textContent = "내가 앱 조작하기";
  tray.append(stop, btn);
  frame.after(tray);
  // 실행화면에서 「일시정지」: 대화로 돌아가지 않고 이 화면에서 멈춤 (화면을 어둡게 하고 가운데 흰 일시정지 아이콘), 버튼은 「다시 시작」
  const pv = document.createElement("div");
  pv.className = "pause-veil";
  pv.innerHTML = '<span class="ms">pause</span>';
  clip.appendChild(pv);
  tray.addEventListener("click", (e) => {
    if (!S || S.finished || $(".phone").dataset.view !== "progress") return;
    if (e.target.closest("#btn-stop")) {
      e.stopImmediatePropagation(); e.preventDefault();
      if (S.framePaused) framePause(false); else if (!S.paused) framePause(true);
    } else if (e.target.closest("#btn-manual") && S.framePaused) framePause(false, "manual"); // 멈춘 채로 내가 조작하기 → 멈춤을 풀고 넘어감
  }, true);
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

function framePause(on, why = "resume") {
  S.framePaused = on;
  $(".phone").classList.toggle("frame-paused", on);
  if (on) {
    S.paused = true;
    S.m.stops++;
    logEvent("stop", { via: "frame" });
    gLog("G12", "frame_pause");
    syncControls();
  } else {
    logEvent("resume", { via: `frame_${why}` });
    resume();
  }
}

// 실행화면에 처음 들어올 때 한 번 안내 (세션마다)
const _syncView = syncView;
syncView = function () {
  _syncView();
  if (!S || !S.unified || S.finished || S.runIntroShown || $(".phone").dataset.view !== "progress") return;
  S.runIntroShown = true;
  $(".run-intro").hidden = false;
  if (!S.paused) { S.paused = true; S.introPause = true; syncControls(); }
  gLog(["G6", "G23"], "run_intro");
};

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
  const tray = 72;
  const scale = Math.max(0.3, Math.min(200 / W, (box.clientHeight - 24 - tray) / H)); // 실행화면 폭 200px (높이가 모자라면 그만큼 작게)
  phone.style.setProperty("--scale", scale.toFixed(4));
  clip.style.width = `${Math.floor(W * scale)}px`;
  clip.style.height = `${Math.floor(H * scale)}px`;
};

// =====================================================================
// [「?」 화면 안내] AI를 잠시 멈추고, 실행화면·멈추기·내가 조작하기를 차례로 짚어 줌 (나머지는 어둡게)
// =====================================================================
const COACH = [
  { sel: ".screen-clip", text: "AI가 지금 내 앱을 대신 조작하는 실시간 화면이에요. 여기는 누를 수 없어요." },
  { sel: "#btn-stop", text: "AI의 조작을 잠시 멈춰요." },
  { sel: "#btn-manual", text: "AI 대신 내가 직접 앱을 조작해요." },
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
  layer.innerHTML = '<div class="coach-hole"></div><div class="coach-tip" role="tooltip" aria-live="polite"><p></p></div><div class="coach-foot"><span class="coach-n"></span><button type="button" class="coach-next"></button></div>';
  phone.appendChild(layer);
  let i = 0;
  const show = () => {
    const t = $(COACH[i].sel);
    const pr = phone.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    const pad = 0; // 밝게 남기는 영역을 요소에 딱 맞춤
    const hole = layer.querySelector(".coach-hole");
    Object.assign(hole.style, { left: `${r.left - pr.left - pad}px`, top: `${r.top - pr.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, borderRadius: getComputedStyle(t).borderRadius });
    const tip = layer.querySelector(".coach-tip");
    tip.querySelector("p").textContent = COACH[i].text;
    layer.querySelector(".coach-n").textContent = `${i + 1} / ${COACH.length}`;
    layer.querySelector(".coach-next").textContent = i < COACH.length - 1 ? "다음" : "알겠어요";
    // 말풍선: 짚은 곳 위(실행화면은 화면 안쪽 가운데), 꼬리는 짚은 곳 가운데를 가리킴
    tip.classList.remove("up", "down", "inside");
    tip.style.top = ""; tip.style.bottom = "";
    if (i === 0) {
      // 실행화면: 바로 아래에 붙여 두고 꼬리가 위(실행화면)를 가리킴
      tip.classList.add("up");
      tip.style.top = `${r.bottom - pr.top + 12}px`;
    }
    else { tip.classList.add("down"); tip.style.bottom = `${pr.bottom - r.top + 16}px`; }
    const cx = r.left - pr.left + r.width / 2;
    tip.style.setProperty("--tail-x", `${Math.max(24, Math.min(pr.width - 24, cx)) - 20}px`);
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
let focusCur = null, focusKey = "", focusUserMoved = false;
function queueFocus() {
  if (focusQueued) return;
  focusQueued = true;
  requestAnimationFrame(() => requestAnimationFrame(() => { focusQueued = false; applyFocus(); }));
}

const FADE = 84; // 현재 대화 위로 남겨 둘 높이 (바로 앞 말풍선과 「되돌리기」가 살짝 보이게)
const UNDO_PEEK = 43; // 「되돌리기」 위로 남겨 둘 높이 (보통 때 FADE와 같은 위치: 되돌리기는 현재 대화 41px 위)
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
    let at = top - FADE;
    // 맨 위의 정의: 「되돌리기」가 보이고 그 위 말풍선 끝이 살짝 보이게. 되돌리기가 현재 대화보다 멀리 위에 있으면(사이에 말풍선이 있으면) 그만큼 덜 올림
    // (현재 대화가 화면 아래로 잘리지 않는 한에서)
    const link = c.querySelector(":scope > .undo-link");
    if (link && link.offsetTop < cur.offsetTop) {
      const byLink = link.offsetTop - c.offsetTop - UNDO_PEEK;
      const fit = top + cur.offsetHeight - c.clientHeight + 12;
      at = Math.min(at, Math.max(byLink, fit));
    }
    const need = c.clientHeight - (contentEnd - at);
    spacer.style.height = `${Math.max(0, need)}px`;
    // 사용자가 직접 스크롤했으면 현재 대화가 바뀔 때까지 위치를 되돌리지 않음 (스크롤이 튕기지 않게)
    // 새 말풍선이 오거나 단계가 바뀌면 다시 현재 대화로
    const key = `${S.stepIdx}|${c.children.length}|${cur.id || cur.textContent.length}`;
    if (cur !== focusCur || key !== focusKey) { focusCur = cur; focusKey = key; focusUserMoved = false; }
    if (!focusUserMoved) c.scrollTop = Math.max(0, at);
    c.classList.toggle("scrolled", c.scrollTop > 4);
  }
}


function setupFocus() {
  const c = chat();
  // 위에 지나간 대화가 있을 때만 위쪽 흐림
  const markScrolled = () => c.classList.toggle("scrolled", c.scrollTop > 4);
  c.addEventListener("scroll", markScrolled, { passive: true });
  const userMove = () => { focusUserMoved = true; };
  ["wheel", "touchmove", "pointerdown"].forEach((t) => c.addEventListener(t, userMove, { passive: true }));
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

// =====================================================================
// [호출한 뒤] 배차가 끝나도 대화를 끝내지 않고 호출 완료 안내 아래 '되돌리기'를 남겨 둠 (세션1)
// - 되돌리기, '방금 한 일 취소': AI가 앱에서 '호출 취소'를 눌러 봄 → "호출을 취소했어요. 어디부터 다시 할까요?"
// - 호출한 뒤 출발지, 목적지, 택시 종류, 요청사항, 쿠폰을 바꿔 달라고 하면: AI가 앱에서 바꿔 보다가 막힘
//   → 앱이 보여 준 이유를 그대로 전하고, 호출을 취소하고 다시 부를지 물음
// =====================================================================
const AFTER_ITEMS = {
  set_origin: { name: "출발지를", row: "출발" },
  set_dest: { name: "목적지를", row: "도착" },
  set_car: { name: "택시 종류를", row: "택시 종류" },
  set_request: { name: "기사님 요청사항을", row: "기사님 요청사항" },
  set_coupon: { name: "쿠폰을", row: "쿠폰" },
};
const AFTER_INTENTS = ["set_origin", "set_dest", "set_car", "set_coupon"];
const AFTER_CANCEL_PICKS = () => [
  { label: "출발지", ask: "출발지를 어디로 바꿀까요?", sub: [{ label: "현재 위치", out: { intent: "set_origin", origin: "current" } }, DIRECT] },
  { label: "목적지", ask: "목적지를 어디로 바꿀까요?", sub: [DIRECT] },
  { label: "택시 종류", ask: "어떤 택시로 바꿀까요?", sub: CAR_PICKS() },
  ...(S?.steps.some((x) => x.id === "request") ? [{ label: "기사님 요청사항", ask: "기사님 요청사항을 어떤 걸로 할까요?", sub: REQ_OPTIONS().map((o) => ({ label: o.label, out: { intent: "set_request", request: o.id } })) }] : []),
];

// 배차 완료 화면: 항목마다 표시를 달고, 아래에 '호출 취소'
const _taxiComplete = taxiComplete;
taxiComplete = function () {
  let h = _taxiComplete();
  if (!S?.unified) return h;
  for (const [k] of rideRows()) h = h.replace(`<div><span>${k}</span>`, `<div data-row="${k}"><span>${k}</span>`);
  return h.replace("data-done-confirm>확인</div>", 'data-done-confirm>확인</div><div class="tx-cancel-call">호출 취소</div>');
};

const _finish = finish;
finish = function (status) {
  if (S && !S.finished && S.unified && S.rideDone && S.session !== 2) {
    if (status === "completed" && !S.postCall) return postCallWait();
    if (S.postCall && status === "cancelled") status = "completed"; // 호출한 뒤 앱을 끝내도 호출은 된 것
  }
  return _finish(status);
};

const POST_CALL_IDLE_MS = 10000; // 호출한 뒤 이만큼 아무것도 하지 않으면 체험을 마침 (기록 저장·끝 화면)
async function postCallWait() {
  S.postCall = true;
  setChips([]);
  refreshUndoLink();
  for (;;) {
    let idle;
    const text = await Promise.race([waitText(), new Promise((r) => { idle = setTimeout(() => r("__idle"), POST_CALL_IDLE_MS); })]);
    clearTimeout(idle);
    if (text === "__idle") {
      // 「되돌리기」로 호출을 취소하는 중이면 여기서 끝내지 않음 (다시 호출하면 그때 다시 10초를 기다림)
      if (S.callCancelling || !S.postCall) return;
      if (S.noAutoEnd) continue; // 호출한 뒤 「되돌리기」를 눌렀으면 이 세션은 저절로 끝내지 않음 (뒤로 가기 → 앱 종료로 끝냄)
      // 참가자가 무언가 하는 중이면(멈춤·직접 조작·되돌리기 확인·입력 중·듣는 중) 끝내지 않고 다시 기다림
      if (S.paused || S.manual || S.undoPending || S.listening || $("#msg").value.trim() || !$("#undo-dlg")?.hidden) continue;
      S.waiter = null;
      setChips([]);
      return _finish("completed");
    }
    const o = await turn(text, {
      said: lastAgentText(),
      freePlace: "any",
      intents: [...AFTER_INTENTS, "cancel", "other"],
      hint: "택시 호출이 끝나 기사님이 오고 있어. 출발지, 목적지, 택시 종류, 기사님 요청사항, 쿠폰을 바꾸라고 하면 그 의도야. 호출을 취소하라고 하면 cancel이야. 그 외에는 짧게 답해.",
    });
    if (o.intent === "cancel") return cancelCall(null);
    if (AFTER_ITEMS[o.intent]) {
      const r = await tryChangeAfterCall(o);
      if (r) return r;
      continue;
    }
    await agentSay(o.reply || "기사님이 오고 있어요.", { talk: true });
  }
}

// 호출한 뒤 옵션 바꾸기: 앱에서 해 보고, 막힌 이유를 그대로 전함
async function tryChangeAfterCall(o) {
  const it = AFTER_ITEMS[o.intent];
  logEvent("after_call_change", { what: o.intent });
  await agentSay(`${it.name} 바꿔 볼게요.`);
  setStatus("", true);
  setActing(true);
  try {
    const row = `.done-box [data-row="${it.row}"]`;
    await tap(document.querySelector(row) ? row : ".done-box");
    S.phone.toast = `호출 후에는 ${it.name} 바꿀 수 없어요`;
    renderPhone();
    await actSleep(1600);
  } finally { setActing(false); }
  resetStatus();
  await agentSay(`택시 앱에서 '${S.phone.toastShown || `호출 후에는 ${it.name} 바꿀 수 없어요`}'라고 해서 바꾸지 못했어요.`);
  const ask = "바꾸려면 호출을 취소하고 다시 불러야 해요. 취소할까요?";
  await agentSay(ask);
  const opts = [{ id: "reject", label: "그대로 두기" }, { id: "approve", label: "호출 취소" }];
  let c;
  do { c = await askChoice(opts, ask, [], "호출을 취소하라고 하면 approve, 그대로 두라고 하면 reject야."); } while (c.id === "__reask");
  logEvent("after_call_cancel_ask", { cancel: c.id === "approve", via: c.via });
  if (c.id === "approve") return cancelCall(o);
  await agentSay("호출을 그대로 둘게요.");
  return null;
}

// 호출 취소: 앱에서 '호출 취소'를 누른 뒤 최종 호출 확인 직전 상태로 돌아가, 바꿀 것을 반영하고 다시 호출할지 물음
async function cancelCall(change) {
  S.callCancelling = true; // 호출한 뒤 10초 대기가 이 사이에 체험을 끝내지 않게
  S.noAutoEnd = true; // 마지막에 되돌리기를 했으면 그 뒤로는 10초 뒤 자동 종료를 하지 않음
  const f = S.steps.findIndex((x) => x.id === "final");
  S.waiter = null; S.ivWaiter = null;
  S.resumeWaiters = []; S.paused = false; S.manual = false; S.backPaused = false; S.inReject = false; S.pickOut = null;
  S.undoPending = false;
  S.consentAsk = false; // 세션2: 이용내역 허용을 묻던 중이면 그 질문은 버림
  syncControls();
  logEvent("after_call_cancel", { change: change?.intent || null });
  await agentSay("호출을 취소해 볼게요.");
  setStatus("", true);
  setActing(true);
  try {
    await tap(".tx-cancel-call");
    S.phone.toast = "호출을 취소했어요";
    renderPhone();
    await actSleep(1200);
    Object.assign(S, structuredClone(S.snaps[f]));
    S.rideDone = false;
    S.postCall = false;
    S.phone.sheet = null;
    renderPhone();
    await actSleep(400);
  } finally { setActing(false); }
  resetStatus();
  if (!change) {
    const ask = "호출을 취소했어요. 어디부터 다시 할까요?";
    await agentSay(ask);
    S.afterCancel = true;
    try {
      for (;;) {
        const o = await turn(await waitText(), {
          said: ask,
          freePlace: "any",
          intents: [...AFTER_INTENTS.filter((x) => x !== "set_coupon"), "other"],
          hint: "택시 호출을 취소했어. 출발지, 목적지, 택시 종류, 기사님 요청사항 중 무엇을 바꿀지 말하면 그 의도야. 그 외에는 짧게 답하고 무엇을 바꿀지 다시 물어.",
        });
        if (await applyAfterCancel(o)) break;
        await agentSay(o.reply || ask, { talk: true });
      }
    } finally { S.afterCancel = false; }
  } else {
    await agentSay("호출을 취소했어요.");
    await applyAfterCancel(change);
  }
  S.undoTo = f;
  S.redoIdx = f;
  S.callCancelling = false;
  return "undo"; // 최종 호출 확인부터 다시
}

async function applyAfterCancel(o) {
  if (o.intent === "set_origin" && namedOrigin(o)) { setOption("origin", namedOrigin(o), "after_call"); await sayKey("change.origin"); return true; }
  if (o.intent === "set_dest" && namedDest(o)) {
    const k = namedDest(o);
    S.form.dest = k;
    renderPhone();
    await redoDest(k);
    await sayKey("change.dest", { dest: k });
    return true;
  }
  if (o.intent === "set_car" && CAR_TYPES[o.car_type]) { setOption("car", o.car_type, "after_call"); renderPhone(); await sayKey("change.car"); return true; }
  if (o.intent === "set_coupon" && typeof o.coupon === "boolean") { setOption("coupon", o.coupon, "after_call"); await sayKey(o.coupon ? "change.coupon.on" : "change.coupon.off"); return true; }
  if (o.intent === "set_request" && REQUESTS[o.request]) {
    S.userSet.request = true;
    S.requestByUser = true;
    await redoRequest(o.request);
    S.phone.sheet = null;
    renderPhone();
    await sayKey(o.request === "none" ? "change.request.none" : "change.request");
    return true;
  }
  return false;
}

// =====================================================================
// [연구2 오류 ① 잘못 알아들음] 시스템은 사용자의 입력이 오류 없이 전달되었는지를 즉시 알려야 한다 (가이드라인 2)
// - 알아듣지 못한 말풍선은 초록 체크 대신 빨간 느낌표와 '전달 안 됨', 옆에 「다시 보내기」
// - 두 번째로 못 알아들었을 때만: AI 말풍선 아래에 다른 입력 방법 알약 (가이드라인 3)
// =====================================================================
function onMishear(n, text) {
  const ub = [...chat().querySelectorAll(":scope > .bubble.user")].at(-1);
  const rc = ub?.querySelector(".receipt");
  const resend = (via) => {
    document.querySelectorAll(".resend-row, .resend-pill").forEach((x) => x.remove());
    gLog("G2", "mishear_resend", { n, via });
    $("#msg").value = text;
    $("#composer").requestSubmit();
  };
  if (rc) rc.remove(); // 말풍선 옆 표시 대신 아래 줄에 [! 전달 실패] (다시 보내기는 AI 말풍선 아래 알약)
  if (ub) {
    const row = document.createElement("div");
    row.className = "resend-row";
    row.innerHTML = '<span class="send-fail" role="status"><span class="ms">error</span>전달 실패</span>';
    ub.after(row);
  }
  gLog("G2", "mishear_mark", { n });
  if (n < MISHEAR_COUNT) return; // 마지막 실패 때 다른 입력 방법 알약 (가이드라인 3)
  const ab = [...chat().querySelectorAll(":scope > .bubble.agent")].at(-1);
  if (!ab) return;
  const voice = inputMode.mode === "voice";
  // AI 말풍선 아래: [말로(글로) 입력할 수도 있어요] [다시 보내기] (같은 알약 모양)
  const pills = document.createElement("div");
  pills.className = "mis-pills";
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "mode-pill";
  pill.textContent = voice ? "글로 입력할 수도 있어요" : "말로 입력할 수도 있어요";
  pill.onclick = () => {
    gLog("G3", "mishear_switch_mode", { to: voice ? "text" : "voice" });
    pills.remove();
    if (inputMode.mode === "voice") { stopListening(); setInputMode("text"); $("#msg").focus(); }
    else { setInputMode("voice"); startListening(); }
  };
  const again2 = document.createElement("button");
  again2.type = "button";
  again2.className = "mode-pill resend-pill";
  again2.textContent = "다시 보내기";
  again2.onclick = () => { pills.remove(); resend("pill"); };
  again2.classList.add("big");
  pills.append(again2); // 다른 입력 방법 알약은 빼고 「다시 보내기」만 크게 (1회차 파일럿 뒤)
  ab.after(pills);
  scrollChat();
}

// =====================================================================
// [되돌리기] 「되돌리기」를 누르면 진행을 잠시 멈추고 한 번 묻고 취소 (실수로 누른 경우 대비)
// =====================================================================
const _requestUndo = requestUndo;
requestUndo = function (target = lastDoneStep(), via = "back") {
  if (via !== "bubble") return _requestUndo(target, via);
  if (!S || S.finished || !S.running || target == null || S.undoPending || !canUndoNow()) return false;
  const dlg = $("#undo-dlg");
  if (!dlg) return _requestUndo(target, via);
  const own = !S.paused;
  if (own) { S.paused = true; syncControls(); }
  const ride = afterCall();
  $("#undo-q").textContent = ride ? "호출을 취소할까요?" : "방금 한 일을 취소할까요?";
  $("#undo-d").textContent = ride ? "앱에서 호출을 취소한 뒤, 어디부터 다시 할지 골라요." : `${stepName(S.steps[target])}부터 다시 해요.`;
  dlg.hidden = false;
  const close = (yes) => {
    dlg.hidden = true;
    logEvent("undo_confirm", { target: S.steps[target].id, answer: yes ? "yes" : "no" });
    if (own) { S.paused = false; resume(); }
    if (yes) _requestUndo(target, via);
  };
  $("#undo-yes").onclick = () => close(true);
  $("#undo-no").onclick = () => close(false);
  return true;
};

// =====================================================================
// [연구2 오류 ② 하차 지점 변경] 바꾸는 이유는 먼저 말하지 않고, 원할 때 「이유 보기」로 (가이드라인 10)
// 알림이 진행 카드에 떠 있는 동안에는 카드 안에서 펼치고, 카드 내용이 대화 기록으로 옮겨지면 그 말풍선 아래로 따라감
// =====================================================================
function addWhyV4(key, ann) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "why-link";
  b.innerHTML = '<span class="ms">help</span> 이유 보기';
  b.onclick = () => {
    S.m.whyOpened = (S.m.whyOpened || 0) + 1;
    gLog("G10", "why_open", { key });
    const t = lines(key, S).join(" ");
    const inCard = $("#run-card")?.contains(b);
    const el = document.createElement("div");
    el.className = inCard ? "why-text" : "bubble agent";
    el.textContent = t;
    b.after(el);
    b.remove();
    scrollChat();
  };
  S.whyAnn = ann;
  const q = $("#run-card #rc-q");
  if (q && !q.hidden && q.textContent.includes(ann)) q.after(b);
  else {
    const last = [...chat().querySelectorAll(":scope > .bubble.agent")].reverse().find((x) => x.textContent.includes(ann));
    (last || [...chat().querySelectorAll(":scope > .bubble.agent")].at(-1))?.after(b);
    S.whyAnn = null;
  }
}
function settleWhy() {
  const ann = S?.whyAnn;
  if (!ann) return;
  const card = $("#run-card");
  const q = card?.querySelector("#rc-q");
  if (q && !q.hidden && q.textContent.includes(ann)) return; // 아직 카드에 떠 있음
  const bub = [...chat().querySelectorAll(":scope > .bubble.agent")].reverse().find((x) => x.textContent.includes(ann));
  if (!bub) return;
  let at = bub;
  const w = card?.querySelector(".why-text");
  if (w) { const d = document.createElement("div"); d.className = "bubble agent"; d.textContent = w.textContent; w.remove(); at.after(d); at = d; }
  const l = card?.querySelector(".why-link");
  if (l) at.after(l);
  S.whyAnn = null;
}
setInterval(settleWhy, 250);

// =====================================================================
// [작업 과정 펼쳐 보기] 진행 카드 위 「› AI가 ~하는 중…」: 단계마다 문구가 바뀌고, 누르면 이 단계의 작업 과정과 판단 근거가 펼쳐짐
// 핵심만 보여 주고 부가 정보는 원할 때 볼 수 있게 (가이드라인 10). 상용 AI의 '생각하는 중'처럼 모든 단계에 똑같이
// =====================================================================
const DOING = {
  taxi_open: "택시 앱을 여는 중", origin: "출발지를 찾는 중", dest: "목적지를 찾는 중", car: "택시 종류를 확인하는 중",
  coupon: "예상 금액을 확인하는 중", pay: "결제 방식을 확인하는 중", drop: "도착 위치를 확인하는 중", final: "호출 내용을 정리하는 중",
  password: "결제를 준비하는 중", done: "택시를 찾는 중",
};
function traceOf(id) {
  const f = S.form;
  const car = CAR_TYPES[f.car]?.label || "일반택시";
  switch (id) {
    case "taxi_open": return [`휴대폰에서 택시를 부를 수 있는 ‘${TAXI_APP}’ 앱을 찾았어요.`, `${TAXI_APP} 앱을 열고 있어요.`];
    case "origin": { const o = ORIGINS[S.originTarget || TARGET_ORIGIN]?.name || "출발지"; return S.originTarget === WRONG_ORIGIN ? ["출발지 칸을 눌러 검색했어요.", `검색 결과 맨 위에 나온 ‘${o}’을 골랐어요.`] : ["출발지 칸을 눌러 검색했어요.", `검색 결과 중 ‘${o}’을 골랐어요. 말씀하신 출발지와 이름이 같아서예요.`]; }
    case "dest": { const d = PLACES[f.dest ?? S.userDest ?? AGENT_PLACE]?.name || "목적지"; return [`검색창에 ‘${SEARCH_QUERY}’를 입력했어요.`, `같은 이름의 지점 ${SEARCH_ORDER.length}곳 중 ‘${d}’을 골랐어요. 말씀하신 지점 이름과 같아서예요.`]; }
    case "car": return [`택시 종류 ${Object.keys(CAR_TYPES).length}가지와 종류별 예상 요금을 불러왔어요.`];
    case "coupon": return [`${car} 기준으로 예상 요금을 계산했어요.`, `쓸 수 있는 쿠폰 1장이 있어요. 지금은 적용하지 않은 상태예요.`];
    case "drop": return ["도착 위치 주변의 정차 정보를 확인했어요.", `가게 앞은 차를 세우기 어려운 곳이라, 가장 가까운 ‘${PLACES[DROP_PLACE].name}’로 바꾸려고 해요.`];
    case "final": return ["출발지, 도착지, 택시 종류, 결제 방식, 쿠폰, 예상 요금을 한 화면에 모았어요."];
    case "password": return ["결제하려면 결제 비밀번호가 필요해요. 비밀번호는 제가 대신 넣지 않아요."];
    case "done": return ["호출 요청을 보냈고, 가까운 기사님을 찾고 있어요."];
    default: return [];
  }
}
function renderThink(st) {
  const id = S.steps[S.stepIdx]?.id;
  const doing = `AI가 ${DOING[id] || "앱을 조작하는 중"}…`;
  let btn = st.querySelector(".think");
  if (!btn || btn.dataset.step !== String(S.stepIdx)) {
    st.innerHTML = `<button type="button" class="think" aria-expanded="false"><span class="ms">chevron_right</span><span class="think-t"></span></button><div class="think-log" hidden></div>`;
    btn = st.querySelector(".think");
    btn.dataset.step = String(S.stepIdx);
    btn.onclick = (e) => {
      e.stopPropagation();
      const log = st.querySelector(".think-log");
      const open = log.hidden;
      log.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      btn.classList.toggle("open", open);
      if (open) {
        log.innerHTML = traceOf(S.steps[S.stepIdx]?.id).map((t) => `<p>${esc(t)}</p>`).join("");
        S.m.thinkOpens = (S.m.thinkOpens || 0) + 1;
        if (S.steps[S.stepIdx]?.id === "drop") S.m.whyOpened = (S.m.whyOpened || 0) + 1;
        gLog("G10", "think_open", { step: S.steps[S.stepIdx]?.id });
      }
    };
  }
  btn.querySelector(".think-t").textContent = doing;
}

// =====================================================================
// [판단 이유 펼쳐 보기] AI가 판단한 말풍선(사실을 알리는 말풍선은 제외) 오른쪽에 ›, 누르면 아래로 펼쳐져 판단 이유·부가 정보 (가이드라인 10)
// 진행 카드에 떠 있을 때도, 대화 기록으로 옮겨진 뒤에도 같은 방식
// =====================================================================
function reasonOf(id) {
  // 오류②(대구 동천역): 실제 판단 근거(검색 결과 맨 위)를 그대로 보여 줌 (가이드라인 10)
  if (id === "origin" && S.originTarget === WRONG_ORIGIN) return `‘${ORIGIN_QUERY}’을 검색해서 맨 위에 나온 곳을 골랐어요. 검색 결과: ${ORIGIN_RESULTS.map((r) => r.name || r).join(", ")}`;
  if (id === "origin") return `처음 말씀하신 출발지와 이름이 같은 곳을 골랐어요. 검색 결과: ${ORIGIN_RESULTS.map((r) => r.name || r).join(", ")}`;
  if (id === "dest") { const d = PLACES[S.form.dest ?? AGENT_PLACE]?.name || ""; return `같은 이름의 지점 ${SEARCH_ORDER.length}곳(${SEARCH_ORDER.map((k) => PLACES[k].name.replace("담소한정식 ", "")).join(", ")}) 중 말씀하신 지점과 같은 ‘${d}’을 골랐어요.`; }
  if (id === "count") return `처음 요청을 ‘택시 ${WRONG_COUNT}대를 불러 달라’는 뜻으로 알아들었어요.`;
  if (id === "drop") return `가게 앞은 차를 세우기 어려운 곳이라, 가장 가까운 ‘${PLACES[DROP_PLACE].name}’로 바꾸려고 해요.`;
  return null;
}
function moreToggle(key, el) {
  const open = !(S.moreOpen ||= {})[key];
  S.moreOpen[key] = open;
  if (open) {
    S.m.moreOpens = (S.m.moreOpens || 0) + 1;
    if (S.reasons[key] === reasonOf("drop")) S.m.whyOpened = (S.m.whyOpened || 0) + 1;
    gLog("G10", "reason_open", { text: key });
  }
  decorateMore();
  el?.scrollIntoView?.({ block: "nearest" });
}
function moreBox(key) {
  const d = document.createElement("div");
  d.className = "more-box";
  d.dataset.key = key;
  d.textContent = S.reasons[key];
  return d;
}
function decorateOne(el, key) {
  const has = Boolean(S.reasons?.[key]);
  el.classList.toggle("has-more", has);
  if (!has) return;
  const open = Boolean(S.moreOpen?.[key]);
  el.classList.toggle("more-open", open);
  if (!el.dataset.moreBound) {
    el.dataset.moreBound = "1";
    el.setAttribute("role", "button");
    el.addEventListener("click", () => { const k = el.dataset.moreKey; if (k && S.reasons?.[k]) moreToggle(k, el); });
  }
  el.dataset.moreKey = key;
  const next = el.nextElementSibling;
  const box = next?.classList.contains("more-box") ? next : null;
  if (open && !box) el.after(moreBox(key));
  if (!open && box) box.remove();
  if (open && box && box.dataset.key !== key) { box.remove(); el.after(moreBox(key)); }
}
function decorateMore() {
  if (!S?.reasons) return;
  const keyOf = (t) => Object.keys(S.reasons).find((k) => t === k || t.startsWith(k)) || t; // 말풍선에 '완료' 같은 작은 표시가 붙어도 찾음
  chat().querySelectorAll(":scope > .bubble.agent").forEach((b) => decorateOne(b, keyOf(b.textContent.trim())));
  const q = $("#run-card #rc-q");
  if (q) {
    const key = !q.hidden ? q.textContent.trim() : "";
    if (S.reasons[key]) decorateOne(q, key);
    else {
      q.classList.remove("has-more", "more-open");
      q.dataset.moreKey = "";
      if (q.nextElementSibling?.classList.contains("more-box")) q.nextElementSibling.remove();
    }
  }
}
setInterval(decorateMore, 200);

// [실행 전 알림] 무엇을 하려는지 구체적으로: 어떤 앱을 열어 대신 쓰는지 (가이드라인 5). 기존안은 연구1 문구 그대로
const _lines = lines;
lines = function (key, s, vars) {
  if (s?.unified && key === "taxi_open") return [`${TAXI_APP} 앱을 열어서 사용할게요.`];
  const r = _lines(key, s, vars);
  // 오류 ② 택시 2대로 잘못 이해: 판단 근거는 말풍선 ›를 눌렀을 때 (가이드라인 10)
  if (s?.unified && key === "count") r.forEach((m) => ((s.reasons ||= {})[m.trim()] = `처음 요청을 ‘택시 ${s.form.count || 1}대를 불러 달라’는 뜻으로 알아들었어요.`));
  return r;
};
