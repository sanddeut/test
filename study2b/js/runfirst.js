// 새 개선안(study2b): 실행화면을 기본으로 보여 줌 (improve.js 위에 얹음)
// - 택시를 불러 달라고 하면 허용 팝업 → 허용하면 로딩 화면 뒤 튕기듯 빠지며 앱 전체 화면으로
// - 처음에는 화면을 어둡게 하고 흰 글씨로 "AI가 '마음택시' 앱을 사용합니다." → 딤이 약하게 남고, 오른쪽 위 「AI가 앱 사용중..」 알약 + 화면 전체 테두리
// - 오른쪽 아래 AI 원형 프로필: AI가 확인을 받거나 알릴 말이 있으면 화면을 어둡게 하고 프로필에서 말풍선을 띄움
// - 말로 답해야 하는 질문(무엇을 바꿀까요? 등)·중지 뒤 대화는 원래처럼 대화창으로. 프로필을 누르면 대화창으로 가고, 진행 카드의 「실행화면 보기」로 돌아옴
"use strict";

const RF_LOADING_MS = 900; // 허용한 뒤 로딩 화면
const RF_SWAP_MS = 1200; // 튕기며 화면이 바뀌는 시간 (slideSwap과 같게)
const RF_INTRO_MS = 2600; // "AI가 '마음택시' 앱을 사용합니다." 안내를 보여 주는 시간
const rf = { ask: null, note: "", noteStep: null, key: "" };

const rfOn = () => Boolean(S?.runFirst && !S.finished && $(".phone").dataset.view === "progress");

function setupRunFirst() {
  const phone = $(".phone");
  const L = document.createElement("div");
  L.id = "rf-layer";
  L.className = "rf-layer";
  L.innerHTML = `<div class="rf-dim"></div>
    <p class="rf-intro">AI가 ‘${esc(TAXI_APP)}’ 앱을 사용합니다.</p>
    <div class="rf-border"></div>
    <div class="rf-chip" role="status"><span class="dots"><i></i><i></i><i></i></span>AI가 앱 사용중..</div>
    <div class="rf-bubble" role="dialog" aria-live="polite" hidden><p class="rf-q"></p><div class="rf-opts"></div></div>
    <button type="button" class="rf-avatar" aria-label="AI 도우미 (대화창 보기)">AI</button>`;
  phone.appendChild(L);
  const load = document.createElement("div");
  load.id = "rf-loading";
  load.innerHTML = '<span class="rf-spinner"></span>';
  phone.appendChild(load);
  // 프로필을 누르면 대화창으로 (말풍선이 떠 있을 때는 말풍선으로 답함)
  L.querySelector(".rf-avatar").onclick = () => {
    if (!rfOn() || !L.querySelector(".rf-bubble").hidden) return;
    logEvent("rf_avatar_chat");
    S.showRun = false;
    syncControls();
  };
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
  rf.ask = null; rf.note = ""; rf.key = "";
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

// 실행화면이 기본: 말로 답할 때, 중지 뒤 대화, 끝난 뒤가 아니면 대화창 대신 실행화면
const _wantedViewRF = wantedView;
wantedView = function () {
  const v = _wantedViewRF();
  if (v !== "chat" || !S?.runFirst || !S.showRun) return v;
  if (!S.running || S.finished || S.ivWaiter || S.stopped) return v;
  if (S.waiter && !S.waiter.options && !S.waiter.pin) return v;
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

// 질문(선택지)이 생기면 말풍선으로
const _setChipsRF = setChips;
setChips = function (options, onPick) {
  _setChipsRF(options, onPick);
  // 버튼 이름은 improve.js와 같게 (확인/수정, 호출하기 등)
  rf.ask = options?.length ? { options: relabel(options, choiceLabels()), onPick } : null;
  rf.note = "";
  rfRender();
};

// 알리는 말도 말풍선으로 (AI가 다음 조작을 시작하면 닫힘). "~하는 중…" 같은 진행 문구는 띄우지 않음
const _agentSayRF = agentSay;
agentSay = async function (text, opts = {}) {
  const r = await _agentSayRF(text, opts);
  if (S?.runFirst && S.running && !S.finished && !opts.talk && !isProgressLine(text) && !(opts.gated && S.jumpTo != null)) {
    rf.note = rf.note && rf.noteStep === S.stepIdx ? `${rf.note}\n${text}` : text;
    rf.noteStep = S.stepIdx;
    rfRender();
  }
  return r;
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
function rfRender() {
  const L = $("#rf-layer");
  if (!L) return;
  const on = rfOn() && !S.manual && !S.pinOpen;
  const pin = on && S.waiter?.pin && S.pinResolve;
  const ask = on && !pin && rf.ask && S.waiter ? rf.ask : null;
  const note = on && !pin && !ask && rf.note ? rf.note : "";
  const mode = pin || ask ? "ask" : note ? "note" : "";
  const q = pin || ask ? rfQuestion() : note;
  const key = `${mode}|${q}|${ask ? ask.options.map((o) => o.id + o.label).join(",") : ""}`;
  L.dataset.mode = mode;
  $(".phone").classList.toggle("rf-asking", Boolean(mode));
  if (key === rf.key) return;
  rf.key = key;
  const bub = L.querySelector(".rf-bubble");
  bub.hidden = !mode;
  if (!mode) return;
  bub.querySelector(".rf-q").textContent = q;
  const box = bub.querySelector(".rf-opts");
  box.innerHTML = "";
  if (pin) {
    box.className = "rf-opts pills";
    box.append(rfBtn("취소", "ghost", () => $(".pw-card .pw-cancel")?.click()), rfBtn("화면 열기", "", () => $(".pw-card .pw-go")?.click()));
  } else if (ask) {
    const list = ask.options.length >= 2 && !ask.options.every((o) => PILL_IDS.includes(o.id));
    box.className = `rf-opts ${list ? "list" : "pills"}`;
    for (const o of ask.options) {
      const b = rfBtn(o.label, o.id === "reject" || o.id === "manual" ? "ghost" : "", () => ask.onPick(o));
      if (list && !PILL_IDS.includes(o.id)) {
        b.className = "rf-row";
        b.innerHTML = `<span><b>${esc(o.label)}</b>${o.desc ? `<small>${esc(o.desc)}</small>` : ""}</span>${o.price ? `<em>${esc(o.price)}</em>` : ""}`;
      }
      box.appendChild(b);
    }
  } else box.className = "rf-opts";
  bub.classList.remove("pop"); void bub.offsetWidth; bub.classList.add("pop");
  logEvent("rf_bubble", { mode, text: q });
}

function rfBtn(label, cls, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `rf-btn ${cls}`;
  b.textContent = label;
  b.onclick = fn;
  return b;
}

// 질문 문구: 진행 카드에 올라간 질문, 없으면 마지막 질문
function rfQuestion() {
  const q = $("#rc-q");
  if (q && !q.hidden && q.textContent.trim()) return q.textContent.trim();
  return S.lastQuestion || lastAgentText();
}
