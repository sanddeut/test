// 연구2 개선안: 연구1 가이드라인 중 함께 정한 것만 반영 (원안 코드는 그대로 두고 여기서 감싸서 바꿈)
"use strict";

// =====================================================================
// [입력 방법] 첫 화면은 입력 방법(상호작용 시작 방법)을 명시적으로 보여 줘야 한다
// - 첫 인사 아래 안내 카드
// - 맨 처음에는 입력창 대신 「눌러서 시작하기」 버튼 하나 → 누르면 「말로 하기」「글자로 하기」로 갈라짐
// - 고른 뒤에는 고른 방식만 보여주고, 입력창 위 작은 버튼으로 다른 방식으로 바꿈
// - 보내기 버튼은 화살표 대신 '보내기' 글자
// =====================================================================
const inputMode = { mode: "start" }; // start | pick | text | voice

function setInputMode(mode) {
  inputMode.mode = mode;
  $(".phone").dataset.input = mode;
  const fab = $("#mode-fab");
  if (fab) fab.innerHTML = mode === "voice"
    ? '<span class="ms">swap_horiz</span>글자로 하기'
    : '<span class="ms">swap_horiz</span>말로 하기';
  if (S) logEvent("input_mode", { mode });
}

function setupInputMode() {
  const form = $("#composer");
  // 처음 화면: 긴 버튼 하나 → 두 개로 갈라짐
  const start = document.createElement("div");
  start.id = "start-wrap";
  start.className = "start-wrap only-chat";
  start.innerHTML = `<button type="button" id="start-btn" class="start-btn">눌러서 시작하기</button>
    <button type="button" id="pick-voice" class="pick-btn"><span class="ms fill">mic</span>말로 하기</button>
    <button type="button" id="pick-text" class="pick-btn"><span class="ms">keyboard</span>글자로 하기</button>`;
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

  // 입력창 위 오른쪽 작은 버튼: 말로 하기 ↔ 글자로 하기
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
  const said = $("#msg").value.trim();
  v.classList.toggle("on", listening());
  // 말로 하기: 텍스트 필드 없이 [눌러서 말하기 | 보내기]. 듣는 중에는 '듣고 있어요 …', 말한 뒤에는 받아 적은 말
  v.classList.toggle("on", listening());
  v.classList.toggle("said", !listening() && Boolean(said));
  v.innerHTML = listening()
    ? `<span>듣고 있어요 …</span>`
    : said
      ? `<span>${esc(said)}</span>`
      : `<span>눌러서 말하기</span>`;
}

// =====================================================================
// [입력 피드백] 시스템은 사용자의 입력이 오류 없이 전달되었는지를 즉시 알려야 한다
// - 내 말풍선 옆에 작은 회색 글씨로 '전달됨' (메신저의 '읽음'처럼)
// - 글자를 적어 두고 보내지 않으면 보내기 버튼을 깜빡이며 '보내기를 눌러야 전달돼요'
// =====================================================================
const _renderBubble = renderBubble;
renderBubble = function (role, text) {
  _renderBubble(role, text);
  if (role !== "user") return;
  const b = [...chat().querySelectorAll(".bubble.user")].at(-1);
  if (b && !b.querySelector(".receipt")) b.insertAdjacentHTML("beforeend", '<span class="receipt">전달됨</span>');
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
  const d = document.createElement("div");
  d.className = "bubble agent guide-card";
  d.innerHTML = `<b>이렇게 대화를 시작해보세요</b>
    <ol>
      <li>아래 「눌러서 시작하기」를 눌러요</li>
      <li>말로 할지, 글자로 할지 골라요</li>
    </ol>`;
  chat().insertBefore(d, $("#chips"));
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
  $("#msg").placeholder = "AI에게 말하기…";
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

// 새 세션을 시작할 때마다 처음 상태(눌러서 시작하기)로
const _start = start;
start = function () {
  setInputMode("start");
  return _start();
};

document.addEventListener("DOMContentLoaded", setupInputMode);
