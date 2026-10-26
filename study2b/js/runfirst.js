// 새 개선안(study2b): 실행화면을 기본으로 보여 줌 (improve.js 위에 얹음)
// - 택시를 불러 달라고 하면 허용 팝업 → 허용하면 로딩 화면 뒤 튕기듯 빠지며 앱 전체 화면으로
// - 처음에는 화면을 어둡게 하고 흰 글씨로 "AI가 '마음택시' 앱을 사용합니다." → 딤이 약하게 남고, 오른쪽 위 「AI가 앱 사용중..」 알약 + 화면 전체 테두리
// - 오른쪽 아래 AI 원형 프로필: AI가 확인을 받거나 알릴 말이 있으면 화면을 어둡게 하고 프로필에서 말풍선을 띄움
// - 참가자가 직접 대화창으로 가지 않는 한 대화창으로 넘어가지 않음: 선택 질문, 말로(글로) 답하는 질문, 멈춘 뒤 대화, AI의 대답 모두 말풍선에서
// - 프로필을 누르면 대화창으로 가고, 진행 카드의 「실행화면 보기」로 돌아옴
"use strict";

const RF_LOADING_MS = 900; // 허용한 뒤 로딩 화면
const RF_SWAP_MS = 1200; // 튕기며 화면이 바뀌는 시간 (slideSwap과 같게)
const RF_INTRO_MS = 2600; // "AI가 '마음택시' 앱을 사용합니다." 안내를 보여 주는 시간
const rf = { ask: null, picks: null, note: "", noteStep: null, last: "", typing: false, key: "", runBeforeManual: false };

const rfOn = () => Boolean(S?.runFirst && !S.finished && $(".phone").dataset.view === "progress");

function setupRunFirst() {
  const phone = $(".phone");
  const L = document.createElement("div");
  L.id = "rf-layer";
  L.className = "rf-layer";
  L.innerHTML = `<div class="rf-dim"></div>
    <p class="rf-intro">AI가 ‘${esc(TAXI_APP)}’ 앱을 사용합니다.</p>
    <div class="rf-border"></div>
    <div class="rf-chip" role="status">AI가 앱 사용중..</div>
    <div class="rf-bubble" role="dialog" aria-live="polite" hidden>
      <p class="rf-q"></p><div class="rf-opts"></div>
      <form class="rf-input" autocomplete="off" hidden>
        <button type="button" class="rf-mic" aria-label="말로 하기"><span class="ms">mic</span></button>
        <input type="text" placeholder="여기에 적어 주세요" enterkeyhint="send">
        <button type="submit" class="rf-send">보내기</button>
      </form>
    </div>
    <button type="button" class="rf-avatar" aria-label="AI 도우미 (대화창 보기)">AI</button>`;
  phone.appendChild(L);
  const load = document.createElement("div");
  load.id = "rf-loading";
  load.innerHTML = '<span class="rf-spinner"></span>';
  phone.appendChild(load);
  // 프로필을 누르면 대화창으로 (참가자가 직접 고른 경우에만 대화창으로 감)
  L.querySelector(".rf-avatar").onclick = () => {
    if (!rfOn()) return;
    logEvent("rf_avatar_chat");
    S.showRun = false;
    syncControls();
  };
  // 말풍선 안 입력칸: 대화창 입력칸(#msg)과 같은 내용을 쓰고, 보내기는 대화창 보내기와 같음
  const form = L.querySelector(".rf-input");
  const inp = form.querySelector("input");
  const msg = $("#msg");
  inp.addEventListener("input", () => { msg.value = inp.value; });
  msg.addEventListener("input", () => { if (inp.value !== msg.value) inp.value = msg.value; }); // 말로 하기로 받아 적은 말
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    msg.value = inp.value;
    if (!msg.value.trim()) return;
    logEvent("rf_send", { text: msg.value.trim() });
    $("#composer").requestSubmit();
    inp.value = "";
  });
  const mic = form.querySelector(".rf-mic");
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) mic.hidden = true;
  mic.onclick = () => $("#mic").click();
  new MutationObserver(() => {
    const on = $("#mic").classList.contains("rec");
    mic.classList.toggle("on", on);
    mic.innerHTML = `<span class="ms">${on ? "stop_circle" : "mic"}</span>`;
    inp.placeholder = on ? "듣고 있어요 …" : "여기에 적어 주세요";
  }).observe($("#mic"), { attributes: true, attributeFilter: ["class"] });
}
document.addEventListener("DOMContentLoaded", setupRunFirst);

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
  Object.assign(rf, { ask: null, picks: null, note: "", last: "", typing: false, key: "" });
  L.classList.remove("intro", "live");
  $("#rf-loading").classList.add("on");
  logEvent("rf_enter");
  await sleep(RF_LOADING_MS);
  S.showRun = true;
  S.rfSwap = true;
  syncControls(); // → syncView에서 로딩 화면이 튕기며 빠지고 앱 화면이 들어옴
  await sleep(RF_SWAP_MS);
  L.classList.add("intro");
  gLog(["G6", "G23"], "run_intro");
  await sleep(RF_INTRO_MS);
  L.classList.remove("intro");
  L.classList.add("live");
}

// 실행화면이 기본: 참가자가 프로필을 눌러 대화창으로 가지 않았으면, 끝날 때까지 실행화면 (직접 조작·비밀번호 입력 화면은 원래대로)
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

// 실행화면을 기기 전체 크기로 (축소하지 않음)
const _fitScreenRF = fitScreen;
fitScreen = function () {
  _fitScreenRF();
  const phone = $(".phone");
  if (!S?.runFirst || phone?.dataset.view !== "progress") return;
  const clip = $(".screen-clip");
  const W = phone.clientWidth;
  const H = parseFloat(phone.style.getPropertyValue("--app-h")) || phone.clientHeight;
  phone.style.setProperty("--scale", "1");
  clip.style.width = `${W}px`;
  clip.style.height = `${H}px`;
};

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

// 질문(선택지)이 생기면 말풍선으로
const _setChipsRF = setChips;
setChips = function (options, onPick) {
  _setChipsRF(options, onPick);
  // 버튼 이름은 improve.js와 같게 (확인/수정, 호출하기 등)
  rf.ask = options?.length ? { options: relabel(options, choiceLabels()), onPick } : null;
  rf.note = "";
  rfRender();
};

// 거부한 뒤 되묻는 추천 선택지(improve.js)도 말풍선으로
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

// AI가 하는 말(알림·대답)은 말풍선으로. "~하는 중…" 같은 진행 문구는 띄우지 않음
const _agentSayRF = agentSay;
agentSay = async function (text, opts = {}) {
  const r = await _agentSayRF(text, opts);
  if (S?.runFirst && S.running && !S.finished && !isProgressLine(text) && !(opts.gated && S.jumpTo != null)) {
    rf.note = rf.note && rf.noteStep === S.stepIdx ? `${rf.note}\n${text}` : text;
    rf.noteStep = S.stepIdx;
    rf.last = text;
    rfRender();
  }
  return r;
};

// 참가자가 답한 뒤 AI가 반응하기 전: 말풍선에 "…"
const _showTypingRF = showTyping;
showTyping = function (on) {
  _showTypingRF(on);
  if (rf.typing !== on) { rf.typing = on; if (on) rf.note = ""; rfRender(); }
};

const _setActingRF = setActing;
setActing = function (on) {
  _setActingRF(on);
  if (on && rf.note) { rf.note = ""; rfRender(); }
};

// 결제 비밀번호: 말풍선의 [화면 열기]로 앱의 비밀번호 창에 직접 입력
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
  const on = rfOn() && !S.manual && !S.pinOpen;
  const pin = on && S.waiter?.pin && S.pinResolve && !S.paused && !S.ivWaiter; // 취소(멈춤) 뒤에는 멈춘 뒤 질문을 보여 줌
  const picks = on && !pin && rf.picks && S.waiter === rf.picks.waiter ? rf.picks : null;
  const ask = on && !pin && !picks && rf.ask && (S.waiter || S.ivWaiter) ? rf.ask : null;
  const talk = on && !pin && rfTalkable();
  const typing = on && rf.typing;
  const note = on && rf.note ? rf.note : "";
  const mode = pin || picks || ask || talk ? "ask" : typing ? "typing" : note ? "note" : "";
  const q = pin || ask ? rfQuestion() : picks ? picks.question : talk ? rf.last || lastAgentText() : note;
  const sig = ask ? ask.options.map((o) => o.id + o.label).join(",") : picks ? picks.list.map((o) => o.label).join(",") : "";
  const key = `${mode}|${pin ? "pin" : picks ? "picks" : ask ? "ask" : talk ? "talk" : ""}|${q}|${sig}`;
  L.dataset.mode = mode;
  $(".phone").classList.toggle("rf-asking", Boolean(mode));
  if (key === rf.key) return;
  rf.key = key;
  const bub = L.querySelector(".rf-bubble");
  bub.hidden = !mode;
  bub.classList.toggle("typing", mode === "typing");
  if (!mode) return;
  bub.querySelector(".rf-q").innerHTML = mode === "typing" ? "<span></span><span></span><span></span>" : esc(q);
  const box = bub.querySelector(".rf-opts");
  box.innerHTML = "";
  box.className = "rf-opts";
  if (pin) {
    box.classList.add("pills");
    box.append(rfBtn("취소", "ghost", () => $(".pw-card .pw-cancel")?.click()), rfBtn("화면 열기", "", () => $(".pw-card .pw-go")?.click()));
  } else if (picks) {
    box.classList.add("list");
    for (const o of picks.list) {
      box.appendChild(rfRow(o.label, "", "", () => {
        if (o.input) { bub.querySelector(".rf-input input").focus(); return; } // 직접 입력: 말풍선 입력칸으로
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
  bub.querySelector(".rf-input").hidden = !talk;
  if (mode !== "typing") { bub.classList.remove("pop"); void bub.offsetWidth; bub.classList.add("pop"); }
  bub.scrollTop = 0;
  if (mode !== "typing") logEvent("rf_bubble", { mode, text: q });
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
