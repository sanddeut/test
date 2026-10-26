// 개선안 c(study2c): 대화창 중심은 그대로, 화면에는 AI의 지금 말 하나만 크게 (improve.js 위에 얹음)
// - 지금 말: AI가 답을 준비하는 "…" > 진행 카드(질문·알림·진행 중) > 마지막 AI 말풍선 중 하나
// - 지난 대화(참가자 말 포함)는 위 한 줄 「지난 대화 N개 · 펼치기」로 접어 둠. 펼치면 원래 대화창 그대로, 「접기」로 다시 접음
// - 단계 수를 미리 알 수 없는 과업에도 그대로 쓸 수 있게, 단계표·진행 점 없이 지금 말만 보여 줌
"use strict";

const one = { open: false, hidden: 0 };
// fade: 지난 대화를 접지 않고 제자리에 작고 흐리게 남김 (지금 말만 크게, 늘 화면 안에) / fold: 위 한 줄 「지난 대화 N개 · 펼치기」로 접음
// plain(기본): 원래 개선안 대화창 그대로(지난 말은 위로 밀려 올라감), 지금 말만 크게
// 주소 끝에 ?one=fold / ?one=fade 를 붙이면 접는 방식 / 흐리게 남기는 방식으로 볼 수 있음
// page(기본): 한 번에 한 세트(내 입력 + 이어진 AI 응답)만. 위 ⌃로 이전 세트, 아래 ⌄로 다음 세트
const ONE_MODE = ["fold", "fade", "plain"].includes(new URLSearchParams(location.search).get("one")) ? new URLSearchParams(location.search).get("one") : "page";

function setupOneTalk() {
  const bar = document.createElement("button");
  bar.type = "button";
  bar.id = "one-bar";
  bar.className = "one-bar only-chat";
  bar.hidden = true;
  bar.onclick = () => {
    one.open = !one.open;
    if (S) logEvent(one.open ? "one_history_open" : "one_history_close");
    oneUpdate();
    if (one.open) chat().scrollTop = chat().scrollHeight;
  };
  chat().before(bar);
  // 위 「지난 대화 ⌃」: 지난 대화 전체 보기 · 아래 「지금 단계로 돌아가기」(지난 대화를 볼 때만)
  const up = document.createElement("button");
  up.type = "button"; up.id = "one-up"; up.className = "one-nav one-up only-chat"; up.hidden = true;
  up.setAttribute("aria-label", "이전 대화"); up.innerHTML = '<span class="one-nav-t">지난 대화</span><span class="ms">keyboard_arrow_up</span>';
  up.onclick = () => oneHistory(true);
  chat().before(up);
  const down = document.createElement("button");
  down.type = "button"; down.id = "one-down"; down.className = "one-nav one-down only-chat"; down.hidden = true;
  down.setAttribute("aria-label", "지금 단계로 돌아가기"); down.innerHTML = '지금 단계로 돌아가기 <span class="ms">keyboard_arrow_down</span>';
  down.onclick = () => oneHistory(false);
  chat().after(down);
  // 지난 대화를 볼 때 맨 위에 얇은 회색 머리 「지난 대화 보는 중」
  const head = document.createElement("div");
  head.id = "one-hist-head"; head.className = "one-hist-head only-chat"; head.hidden = true;
  head.textContent = "지난 대화 보는 중";
  chat().before(head);
  new MutationObserver(() => oneUpdate()).observe(chat(), { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
}
document.addEventListener("DOMContentLoaded", setupOneTalk);
setInterval(() => oneUpdate(), 300);

// 지금 말: 참가자가 답한 뒤 "…" / 진행 카드 / 마지막 AI 말풍선
function oneCurrent() {
  const c = chat();
  const typing = c.querySelector(":scope > #typing");
  if (typing) return typing;
  const card = c.querySelector(":scope > #run-card");
  if (card && !card.classList.contains("away") && !card.hidden && S?.running && !S.finished) return card;
  return [...c.querySelectorAll(":scope > .bubble.agent:not(.typing)")].at(-1) || null;
}

let oneBusy = false;
function oneUpdate() {
  if (oneBusy) return;
  oneBusy = true;
  try {
    const c = chat();
    const bar = $("#one-bar");
    const on = Boolean(S?.unified) && !one.open;
    if (ONE_MODE === "fade") return oneFade(c, bar);
    if (ONE_MODE === "plain") return onePlain(c, bar);
    if (ONE_MODE === "page") return onePage(c, bar);
    c.classList.toggle("one", on);
    if (!bar) return;
    if (!S?.unified) { bar.hidden = true; return; }
    const cur = oneCurrent();
    // 지금 말 바로 뒤에 붙은 것(되돌리기·이유 보기·다시 보내기 등)은 함께 보여 줌
    const keep = new Set([cur, $("#chips"), $("#chat-spacer")]);
    for (let n = cur?.nextElementSibling; n && !n.classList.contains("bubble") && n.id !== "run-card" && n.id !== "chips"; n = n.nextElementSibling) keep.add(n);
    let hidden = 0;
    for (const el of c.children) {
      const hide = on && !keep.has(el);
      if (el.classList.contains("one-hide") !== hide) el.classList.toggle("one-hide", hide);
      if (hide && el.classList.contains("bubble")) hidden++;
      if (el.classList.contains("one-cur") !== (el === cur)) el.classList.toggle("one-cur", el === cur);
    }
    if (!one.open) one.hidden = hidden;
    const label = one.open ? '접기 <span class="ms">expand_less</span>' : `지난 대화 ${one.hidden}개 <span class="one-more">펼치기 <span class="ms">expand_more</span></span>`;
    if (bar.dataset.label !== label) { bar.dataset.label = label; bar.innerHTML = label; }
    bar.hidden = !one.open && one.hidden === 0;
    if (on && c.scrollTop) c.scrollTop = 0;
  } finally {
    oneBusy = false;
  }
}

// 새 세션은 접힌 상태로 시작
const _startOne = start;
start = function () {
  one.open = false;
  return _startOne();
};

// 마음택시 앱을 열 때 진행 카드의 앱 카드(마음택시 · 택시 앱)는 빼 둠 (앱을 연다는 걸 알릴 다른 방법을 정할 때까지)
const _stepPreviewOne = stepPreview;
stepPreview = function () {
  if (S?.planAsk) return planCard();
  if (S?.steps[S.stepIdx]?.id === "taxi_open") return null;
  return _stepPreviewOne();
};

// 흐리게 남기기: 지난 말은 작고 흐리게, 지금 말은 크게. 새 말이 오면 지금 말이 보이게 아래로 (위로 올리면 지난 말을 읽을 수 있음)
let oneFadeCur = null;
function oneFade(c, bar) {
  if (bar) bar.hidden = true;
  const on = Boolean(S?.unified);
  c.classList.toggle("one-fade", on);
  if (!on) return;
  const cur = oneCurrent();
  const keep = new Set([cur]);
  for (let n = cur?.nextElementSibling; n && !n.classList.contains("bubble") && n.id !== "run-card" && n.id !== "chips"; n = n.nextElementSibling) keep.add(n);
  for (const el of c.children) {
    if (el.id === "chips" || el.id === "chat-spacer") continue;
    const past = !keep.has(el);
    if (el.classList.contains("one-past") !== past) el.classList.toggle("one-past", past);
    if (el.classList.contains("one-cur") !== (el === cur)) el.classList.toggle("one-cur", el === cur);
  }
  if (cur && cur !== oneFadeCur) {
    oneFadeCur = cur;
    requestAnimationFrame(() => cur.scrollIntoView({ block: "end", behavior: "smooth" }));
  }
}

// 원래 대화창 그대로: 지금 말에만 크게 표시 (지난 말은 원래 개선안처럼 위로 밀려 올라감)
function onePlain(c, bar) {
  if (bar) bar.hidden = true;
  const on = Boolean(S?.unified);
  c.classList.toggle("one-plain", on);
  if (!on) return;
  const cur = oneCurrent();
  for (const el of c.children) if (el.classList.contains("one-cur") !== (el === cur)) el.classList.toggle("one-cur", el === cur);
}

// 한 세트씩: 내 말 + 그에 대한 AI 말 하나가 한 세트. AI가 혼자 이어서 진행한 단계는 AI 말 하나씩 따로 (첫 인사는 첫 세트)
one.page = null; // null = 지금 세트(맨 끝)
one.curKey = null;
function onePages(c) {
  const pages = [[]];
  for (const el of c.children) {
    if (el.id === "chips" || el.id === "chat-spacer" || el.id === "one-ctrl" || el.id === "one-open") continue;
    const page = pages.at(-1);
    const isAI = (x) => (x.classList.contains("bubble") && x.classList.contains("agent") && !x.classList.contains("typing")) || x.id === "run-card" || x.classList.contains("one-own"); // one-own: 새 화면에 따로 띄우는 「~하는 중」
    // 내 말이 오면 새 세트. AI 말도 한 세트에 하나만 (AI가 혼자 이어서 진행한 단계는 단계마다 따로)
    if (el.classList.contains("bubble") && el.classList.contains("user") && page.some((x) => x.classList.contains("bubble") || x.id === "run-card")) pages.push([]);
    else if (isAI(el) && page.some(isAI)) pages.push([]);
    pages.at(-1).push(el);
  }
  return pages;
}
function oneGo(d) {
  const pages = onePages(chat());
  const last = pages.length - 1;
  const at = one.page ?? last;
  const next = Math.max(0, Math.min(last, at + d));
  one.page = next >= last ? null : next;
  if (S) logEvent("one_page", { page: next + 1, of: last + 1 });
  oneUpdate();
}
// 「지난 대화 ⌃」: 지난 대화를 단계로 나누지 않고 한 번에 스크롤해서 봄 (그동안 AI는 잠시 멈춤) · 「지금 단계로 돌아가기」로 지금 세트로
function oneHistory(on) {
  one.page = on ? -1 : null;
  if (S) logEvent(on ? "one_history_open" : "one_page_now");
  oneUpdate();
  const c = chat();
  if (on) requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; if (typeof focusUserMoved !== "undefined") focusUserMoved = true; }); // 원래 개선안의 자동 위치 맞춤이 스크롤을 되돌리지 않게
  else c.scrollTop = 0;
}
function onePage(c, bar) {
  if (bar) bar.hidden = true;
  const on = Boolean(S?.unified);
  c.classList.toggle("one-page", on);
  const up = $("#one-up"), down = $("#one-down");
  if (!on) { if (up) up.hidden = true; if (down) down.hidden = true; return; }
  const pages = onePages(c);
  const last = pages.length - 1;
  // 새 AI 말이 오면 지금 세트로 돌아옴
  const cur = oneCurrent();
  const key = `${c.querySelectorAll(":scope > .bubble:not(.typing)").length}|${$("#run-card")?.classList.contains("asking") ? 1 : 0}`; // 새 말풍선이 오거나 질문이 뜰 때만
  if (key !== one.curKey) one.curKey = key; // (지난 대화를 보는 동안에는 AI가 멈춰 있으므로 화면을 바꾸지 않음)
  const past = one.page != null;
  const show = new Set(past ? pages.slice(0, -1).flat() : pages[last]); // 지난 대화 보기: 지금 세트를 뺀 지난 대화 모두 / 평소: 지금 세트만
  for (const el of c.children) {
    if (el.id === "chips" || el.id === "chat-spacer" || el.id === "one-ctrl" || el.id === "one-open") continue;
    const hide = !show.has(el);
    if (el.classList.contains("one-hide") !== hide) el.classList.toggle("one-hide", hide);
    if (el.classList.contains("one-cur") !== (el === cur)) el.classList.toggle("one-cur", el === cur);
  }
  // 세트가 바뀌면 전환 효과: 다음·새 세트는 아래에서 올라오고, 이전 세트는 위에서 내려옴
  const shown = past ? -1 : last;
  const firstEl = past ? null : pages[last][0];
  if (one.shownEl !== firstEl) {
    const back = one.shownIdx != null && shown < one.shownIdx;
    one.shownEl = firstEl; one.shownIdx = shown;
    c.classList.remove("one-in-up", "one-in-down"); void c.offsetWidth;
    c.classList.add(back ? "one-in-down" : "one-in-up");
    // 효과가 끝나면 바로 뗌 (붙어 있으면 같은 세트 안에서 카드가 자리를 옮길 때마다 다시 나타나는 효과가 되풀이되어 깜빡임)
    clearTimeout(one.fadeT);
    one.fadeT = setTimeout(() => c.classList.remove("one-in-up", "one-in-down"), 300);
  }
  if (up) up.hidden = past || last === 0;
  if (down) down.hidden = !past;
  const hh = $("#one-hist-head");
  if (hh && hh.hidden === past) hh.hidden = !past;
  c.classList.toggle("one-past-view", past);
  oneUndo(c, show, past);
  oneOpenBtn(c, show, past);
  onePauseForHistory(past);
}

// =====================================================================
// 허용 뒤 진행 카드 안에 실제 앱 화면을 작게 보여 줌 (마음택시 스플래시 → 첫 화면)
// 앱 여는 단계가 끝나면 출발지로 넘어가기 전에 작은 화면은 접히고 「실행화면 보기」 버튼으로 바뀜
// =====================================================================
const MINI_SCALE = 0.24; // 카드 밖 작은 앱 화면 크기 (기기 화면의 24%)
const MINI_MAX_MS = 30000;
const mini = { on: false, home: null, t0: 0, endAt: 0 };
const _showPermDialogOne = showPermDialog;
showPermDialog = function () {
  return _showPermDialogOne().then((ok) => { if (ok && S && !S.finished) miniStart(); return ok; });
};
function miniStart() {
  const clip = $(".screen-clip");
  const card = $("#run-card");
  if (!clip || !card || mini.on) return;
  mini.home = { parent: clip.parentNode, next: clip.nextSibling };
  const box = document.createElement("div");
  box.id = "rc-mini";
  box.className = "rc-mini";
  box.setAttribute("aria-label", "AI가 누르는 마음택시 화면");
  box.appendChild(clip);
  card.after(box); // 카드 밖, 카드 바로 아래
  // 작게 보일 때는 눌러도 실행화면으로 가지 않음 (보기만)
  card.classList.add("mini-on");
  mini.on = true; mini.t0 = Date.now(); mini.endAt = 0;
  miniShow();
  miniFit();
  logEvent("rc_mini_start");
}
// 휴대폰 홈 화면일 때는 숨겨 두고, 마음택시가 열리는 순간(스플래시)부터 보임
function miniShow() {
  const box = $("#rc-mini");
  if (box) box.hidden = S?.phone?.app === "home";
}
setInterval(() => {
  if (!mini.on) return;
  miniShow();
  // 카드가 아래로 자리를 옮겨도 작은 앱 화면은 늘 카드 바로 아래
  const box = $("#rc-mini"), card = $("#run-card");
  if (box && card && !mini.closing && card.nextElementSibling !== box) card.after(box);
}, 100);
function miniFit() {
  const phone = $(".phone");
  const clip = $("#rc-mini .screen-clip");
  if (!clip) return;
  const W = phone.clientWidth;
  const H = phone.clientHeight;
  phone.style.setProperty("--app-w", `${W}px`);
  phone.style.setProperty("--app-h", `${H}px`);
  phone.style.setProperty("--mini-w", `${Math.floor(W * MINI_SCALE)}px`);
  phone.style.setProperty("--mini-h", `${Math.floor(H * MINI_SCALE)}px`);
  phone.style.setProperty("--mini-k", String(MINI_SCALE));
}
function miniEnd(now = false) {
  if (!mini.on || (mini.closing && !now)) return;
  mini.closing = true;
  const box = $("#rc-mini");
  const clip = box?.querySelector(".screen-clip");
  const restore = () => {
    if (clip && mini.home) mini.home.parent.insertBefore(clip, mini.home.next);
    box?.remove();
    $("#run-card")?.classList.remove("mini-on");
    mini.on = false;
    mini.closing = false;
    fitScreen();
  };
  logEvent("rc_mini_end");
  if (now || !box) return restore();
  // 작은 화면이 오른쪽 아래 「실행화면」 버튼 쪽으로 날아가며 작아짐 (대화창 밖으로 꺼내 맨 위에서 움직임)
  const fab = oneRunFab(true);
  if (fab) fab.hidden = false; // 날아갈 자리(버튼)를 먼저 보이게
  const phone = $(".phone");
  const scr = clip?.querySelector(".screen");
  const c = clip?.getBoundingClientRect(), f = fab?.getBoundingClientRect(), pr = phone.getBoundingClientRect();
  const keep = { clip: clip?.style.cssText, scr: scr?.style.cssText };
  if (clip && c?.width && f?.width) {
    const k = getComputedStyle(phone).getPropertyValue("--mini-k") || String(MINI_SCALE);
    phone.appendChild(clip);
    clip.style.cssText += `;position:absolute;left:${c.left - pr.left}px;top:${c.top - pr.top}px;width:${c.width}px;height:${c.height}px;z-index:80;margin:0;border-radius:14px;overflow:hidden;box-shadow:0 0 0 1px #c9cdd6,0 6px 18px rgba(0,0,0,.18);transform-origin:50% 50%;transition:transform .7s cubic-bezier(.4,0,.2,1),opacity .7s ease;pointer-events:none`;
    if (scr) scr.style.transform = `scale(${k})`;
    const dx = f.left + f.width / 2 - (c.left + c.width / 2), dy = f.top + f.height / 2 - (c.top + c.height / 2);
    box.classList.add("closing");
    requestAnimationFrame(() => requestAnimationFrame(() => { clip.style.transform = `translate(${dx}px, ${dy}px) scale(${Math.max(0.08, f.height / c.height)})`; clip.style.opacity = "0.15"; }));
  }
  setTimeout(() => {
    if (clip) clip.style.cssText = keep.clip || "";
    if (scr) scr.style.cssText = keep.scr || "";
    fab?.classList.add("one-run-pop");
    setTimeout(() => fab?.classList.remove("one-run-pop"), 500);
    restore();
  }, 720);
}
// 실행화면·직접 조작으로 갈 때는 바로 원래 자리로
const _syncViewOne = syncView;
syncView = function () {
  if (mini.on && wantedView() !== "chat") miniEnd(true);
  _syncViewOne();
  if (mini.on) miniFit();
};
// (앱 여는 단계가 끝나면 접음. 혹시 남아 있으면 다른 단계로 넘어갈 때·30초 뒤 접음)
setInterval(() => {
  if (!mini.on || !S) return;
  const id = S.steps[S.stepIdx]?.id;
  const q = $("#rc-q");
  const told = id === "origin" && q && !q.hidden && q.textContent.includes("출발지");
  if (told && !mini.endAt) mini.endAt = Date.now() + 3000;
  if ((id && id !== "taxi_open") || Date.now() - mini.t0 > MINI_MAX_MS || S.finished) miniEnd();
}, 250);

// 「…」만 오래 보이지 않게: AI가 일하는 동안 프로필 옆에 지금 하는 일 ("택시 종류를 확인하는 중…")
function oneDoingText() {
  if (one.doing) return one.doing;
  const id = S?.steps?.[S.stepIdx]?.id;
  return `${(typeof DOING !== "undefined" && DOING[id]) || "답을 준비하는 중"}…`;
}
setInterval(() => {
  if (!S?.unified || ONE_MODE !== "page") return;
  const t = oneDoingText();
  const st = $("#rc-status");
  if (st && st.dataset.doing !== t) st.dataset.doing = t;
  const ty = $("#typing");
  if (ty && ty.dataset.doing !== t) ty.dataset.doing = t;
  // 「~하는 중」과 그 결과(카드 안 말)가 함께 보이지 않게: 결과가 뜨면 「~하는 중」은 숨김
  const card = $("#run-card"), q = $("#rc-q");
  const said = Boolean(card && q && !q.hidden && q.textContent.trim());
  if (card && card.classList.contains("one-said") !== said) card.classList.toggle("one-said", said);
}, 200);

// 앱 여는 단계가 너무 길지 않게: 읽을 시간 6초 → 2초, 연 뒤 기다림 3.5초 → 1.2초 (원래 약 14초 → 약 6초)
const _runAutoOne = runAuto;
runAuto = async function (step) {
  if (step.id !== "taxi_open" || !S?.cfg) return _runAutoOne(step);
  const delay = S.cfg.delay;
  S.cfg.delay = Math.min(delay, 2000);
  S.fastOpen = true;
  let r;
  try { r = await _runAutoOne(step); } finally { S.cfg.delay = delay; S.fastOpen = false; }
  // 출발지로 넘어가기 전에 작은 앱 화면을 접어 「실행화면 보기」로 바꾸고 넘어감
  if (mini.on) { miniEnd(); await sleep(900 * PACE); }
  if (r && S && !S.finished && S.jumpTo == null && !S.planDone) { S.planDone = true; if (!(await onePlan())) return false; }
  return r;
};

// =====================================================================
// 시작 전 계획: 앱을 살펴본 뒤 "이렇게 진행할게요" + 할 일 목록 → [수정] / [이대로 진행]
// - 참가자가 말한 것(출발지·도착지·택시 종류)만 적고, 말하지 않은 것은 채우지 않음
// =====================================================================
function planRows() {
  const o = S.req.origin ? ORIGINS[S.req.origin]?.name : S.req.originName;
  const dk = S.userDest || (S.m.request ? namedDest(S.m.request) : null);
  const d = dk ? PLACES[dk]?.name : null;
  const c = S.req.car ? CAR_TYPES[S.req.car]?.label : null;
  return [["출발지 선택", o], ["도착지 선택", d], ["택시 종류 선택", c], ["결제 금액 확인 · 쿠폰 적용", null]];
}
function planCard() {
  const d = document.createElement("div");
  d.className = "rc-pv one-plan";
  d.innerHTML = planRows().map(([k, v], i) => `<div><span class="pl-n">${i + 1}</span><span class="pl-k">${esc(k)}</span>${v ? `<b>${esc(v)}</b>` : ""}</div>`).join("");
  return d;
}
async function onePlan() {
  // 다음 화면(새 세트)에 「앱을 살펴보는 중…」만 떴다가, 그 자리에 「이렇게 진행할게요.」
  one.doing = "앱을 살펴보는 중…";
  showTyping(true);
  $("#typing")?.classList.add("one-own");
  await sleep(2200 * PACE);
  showTyping(false);
  one.doing = null;
  const said = "이렇게 진행할게요.";
  await agentSay(said, { gated: true });
  for (;;) {
    S.planAsk = true;
    let c;
    try {
      c = await askChoice([{ id: "reject", label: "수정" }, { id: "approve", label: "이대로 진행" }], said, [...changeIntents(), "cancel"],
        "택시를 부르기 전에 진행 계획을 확인하는 중이야. 그대로 하라고 하면 approve, 출발지·목적지·택시 종류를 바꾸라고 하면 해당 set_ 의도, 고치겠다고만 하면 reject야.");
    } finally { S.planAsk = false; }
    logEvent("decision", { choice: c.id, via: c.via, key: "plan" });
    if (c.id === "approve") return true;
    if (c.id === "cancel") { await cancelRide(); return false; }
    if (c.id === "__undo" || c.id === "__reask") continue;
    if (c.out && String(c.id).startsWith("set_")) {
      // 계획 단계에서 말한 것은 요청에 모아 두고, 해당 단계에서 그대로 씀
      const o = c.out;
      if (o.origin && ORIGINS[o.origin]) S.req.origin = o.origin;
      else if (o.origin_name) { S.req.origin = null; S.req.originName = o.origin_name; }
      if (o.car_type && CAR_TYPES[o.car_type]) S.req.car = o.car_type;
      { const k = namedDest(o); if (k) S.userDest = k; }
      await agentSay("바꿨어요. 이렇게 진행할게요.", { talk: true });
      continue;
    }
    await agentSay("무엇을 바꿀까요? 말이나 글로 알려 주세요.", { talk: true });
  }
}
const _dwellOne = dwell;
dwell = function (ms = 1800) {
  return _dwellOne(S?.fastOpen ? Math.min(ms, 2000) : ms); // 앱 첫 화면은 2초 보여 줌
};

// 실행화면 첫 안내(「AI가 마음택시 앱을 사용하는 실시간 화면을 보여드려요」): [확인]을 누르지 않아도 2.5초 뒤 저절로 닫히고 AI가 이어서 진행
const INTRO_MS = 2500;
const _syncViewIntro = syncView;
syncView = function () {
  _syncViewIntro();
  const intro = $(".run-intro");
  if (intro && !intro.hidden && !intro.dataset.auto) {
    intro.dataset.auto = "1";
    setTimeout(() => { if (!intro.hidden) intro.querySelector(".run-intro-ok")?.click(); delete intro.dataset.auto; }, INTRO_MS);
  }
};

// =====================================================================
// 지나간 AI 질문에 선택지를 남기고, 내가 고른 것에 표시 (✓)
// 질문에 답하면 질문은 대화 기록(말풍선)으로 옮겨지는데, 그 말풍선 안에 그때의 선택지를 작게 붙임
// =====================================================================
let oneChoices = null;
const _setChipsHist = setChips;
setChips = function (options, onPick) {
  if (options?.length) {
    const opts = typeof relabel === "function" ? relabel(options, choiceLabels()) : options;
    oneChoices = opts.map((o) => ({ label: o.label, desc: o.desc, price: o.price }));
  }
  return _setChipsHist(options, onPick);
};
const _renderPicksHist = renderPicks;
renderPicks = function (list, waiter, question) {
  oneChoices = list.map((o) => ({ label: o.label }));
  return _renderPicksHist(list, waiter, question);
};
const _appendBubbleHist = appendBubble;
appendBubble = function (role, text, opts) {
  const choices = role === "user" ? oneChoices : null;
  if (role === "user") oneChoices = null;
  const r = _appendBubbleHist(role, text, opts);
  if (choices?.length && S?.unified) oneAttachChoices(choices, text);
  return r;
};
function oneAttachChoices(choices, answer) {
  const users = chat().querySelectorAll(":scope > .bubble.user");
  let q = users[users.length - 1]?.previousElementSibling;
  while (q && !(q.classList.contains("bubble") && q.classList.contains("agent") && !q.classList.contains("typing"))) q = q.previousElementSibling;
  if (!q || q.querySelector(".hist-opts")) return;
  const said = String(answer || "").trim();
  const picked = choices.find((o) => o.label === said) || choices.find((o) => said && said.includes(o.label));
  const box = document.createElement("div");
  box.className = "hist-opts";
  box.innerHTML = choices.map((o) => `<div class="${o === picked ? "on" : ""}"><span>${esc(o.label)}${o.desc ? `<small>${esc(o.desc)}</small>` : ""}</span>${o.price ? `<em>${esc(o.price)}</em>` : ""}${o === picked ? '<span class="ms">check_circle</span>' : ""}</div>`).join("");
  q.appendChild(box);
}

// 지난 대화를 보는 동안에는 AI를 잠시 멈추고, 지금 대화로 돌아오면 이어서 진행
function onePauseForHistory(past) {
  if (!S || S.finished) return;
  if (past && !one.histPaused && S.running && !S.paused) {
    one.histPaused = true;
    S.paused = true;
    logEvent("one_history_pause");
    syncControls();
  } else if (!past && one.histPaused) {
    one.histPaused = false;
    logEvent("one_history_resume");
    resume();
  }
}

// 지금 세트의 AI 말(회색 카드) 바로 아래 알약 두 개: 「취소」(방금 한 일 취소) · 「일시정지」/「계속하기」
// - 대화 속 「되돌리기」는 숨기고 여기에만 둠. 진행 중에는 늘 같은 자리에 있고, 지금 할 수 없으면 흐리게 (떴다 사라지지 않게)
function oneUndo(c, show, past) {
  let row = $("#one-ctrl");
  if (!row) {
    row = document.createElement("div");
    row.id = "one-ctrl"; row.className = "one-ctrl"; row.hidden = true;
    const u = document.createElement("button");
    u.type = "button"; u.id = "one-undo"; u.className = "one-pill";
    u.innerHTML = '<span class="ms">undo</span>취소';
    u.onclick = () => { const l = [...chat().querySelectorAll(":scope > .undo-link")].at(-1); if (l) { logEvent("one_undo"); l.click(); } };
    const pz = document.createElement("button");
    pz.type = "button"; pz.id = "one-pause"; pz.className = "one-pill";
    pz.onclick = () => onePause(!one.userPaused);
    row.append(pz, u); // 왼쪽 일시정지, 오른쪽 취소
  }
  if (one.userPaused && S && !S.paused) one.userPaused = false; // 다른 곳(되돌리기 등)에서 다시 시작된 경우
  // 지금 세트의 마지막 AI 말(진행 카드나 AI 말풍선). 「~하는 중…」만 보일 때(진행 카드에 아직 할 말이 없을 때)는 두 버튼을 숨김
  const ai = [...c.children].filter((el) => show.has(el) && (el.id === "run-card" || (el.classList.contains("agent") && !el.classList.contains("typing")))).at(-1);
  const rq = ai?.id === "run-card" ? ai.querySelector("#rc-q") : null;
  const said = ai && (ai.id !== "run-card" || ai.classList.contains("asking") || (rq && !rq.hidden && rq.textContent.trim()));
  // 카드에 이미 고를 버튼(수정·승인 등)이 있으면 「일시정지」「취소」는 빼 둠
  const asking = ai?.id === "run-card" && ai.classList.contains("asking");
  const opening = S?.steps?.[S.stepIdx]?.id === "taxi_open"; // 마음택시 여는 단계에서만 예외로 빼 둠
  const vis = Boolean(!past && S?.running && !S.finished && said && !asking && !opening);
  if (row.hidden === vis) row.hidden = !vis; // 값이 바뀔 때만 (같은 값을 다시 넣어도 대화창 감시가 다시 돌아 무한 반복됨)
  if (!vis) return;
  const u = row.querySelector("#one-undo"), pz = row.querySelector("#one-pause");
  const noUndo = !c.querySelector(":scope > .undo-link");
  if (u.disabled !== noUndo) u.disabled = noUndo;
  const pzHTML = one.userPaused ? '<span class="ms">play_arrow</span>계속하기' : '<span class="ms">pause</span>일시정지';
  if (pz.innerHTML !== pzHTML) pz.innerHTML = pzHTML;
  const noPause = !one.userPaused && (S.paused || S.undoPending);
  if (pz.disabled !== noPause) pz.disabled = noPause;
  // 카드(말풍선) 밖 바로 아래. 작은 앱 화면이 있으면 그 아래
  let anchor = ai;
  if (anchor?.nextElementSibling?.id === "rc-mini") anchor = anchor.nextElementSibling;
  if (anchor?.nextElementSibling?.id === "chips" && show.has(anchor.nextElementSibling)) anchor = anchor.nextElementSibling;
  if (anchor && anchor.nextElementSibling !== row) anchor.after(row);
}

// 「실행화면」: 입력창 위 오른쪽에 떠 있는 버튼 (원래 카드 안 「실행화면 보기」는 숨겨 두고 같은 기능)
function oneRunFab(make) {
  let b = $("#one-run-fab");
  if (!b && make !== false) {
    b = document.createElement("button");
    b.type = "button"; b.id = "one-run-fab"; b.className = "one-run-fab"; b.hidden = true;
    b.innerHTML = '<span class="ms">open_in_full</span>실행화면';
    b.onclick = () => { const o = $("#rc-open"); if (o && !o.disabled) { logEvent("one_open_run"); o.click(); } };
    $("#composer")?.appendChild(b);
  }
  return b;
}
function oneOpenBtn(c, show, past) {
  const b = oneRunFab(true);
  if (!b) return;
  const card = $("#run-card"), o = $("#rc-open");
  // 실행화면을 볼 수 있을 때 늘 같은 자리에 (작은 앱 화면이 떠 있는 동안은 숨김: 닫힐 때 이 버튼으로 들어감)
  const vis = Boolean(!past && S?.running && !S.finished && card && o && (mini.closing || (!mini.on && getComputedStyle(o).display !== "none")));
  if (b.hidden === vis) b.hidden = !vis;
}

// 「일시정지」: AI가 하던 일을 멈춤 (대화는 그대로). 「계속하기」로 이어서
function onePause(on) {
  if (!S || S.finished) return;
  if (on) {
    if (S.paused) return;
    one.userPaused = true; S.paused = true;
    S.m.stops++;
    logEvent("stop", { via: "one_pause" });
    syncControls();
  } else {
    one.userPaused = false;
    logEvent("one_resume");
    resume();
  }
  oneUpdate();
}

// 「전달됨」은 「전달 실패」와 같은 자리(내 말풍선 아래 줄)에, 같은 크기로
const _oneRenderBubble = renderBubble;
renderBubble = function (role, text) {
  _oneRenderBubble(role, text);
  if (role !== "user" || !S?.unified) return;
  const b = [...chat().querySelectorAll(":scope > .bubble.user")].at(-1);
  const rc = b?.querySelector(".receipt");
  if (!rc) return;
  rc.remove();
  const row = document.createElement("div");
  row.className = "resend-row sent-row";
  row.innerHTML = '<span class="send-ok" role="status"><span class="ms">check_circle</span>전달됨</span>';
  b.after(row);
  setTimeout(() => row.classList.add("gone"), RECEIPT_MS);
};
const _oneMishear = onMishear;
onMishear = function (n, text) {
  const ub = [...chat().querySelectorAll(":scope > .bubble.user")].at(-1);
  if (ub?.nextElementSibling?.classList.contains("sent-row")) ub.nextElementSibling.remove();
  return _oneMishear(n, text);
};

// 실행화면 아래 AI 메시지 칸은 아래에서 올라온 서랍(패널) 모양. 호출 내용 최종 확인은 화면이 작아 안 보이므로 서랍 안에 호출 내용을 함께
const _setChipsDrawer = setChips;
setChips = function (options, onPick) {
  const r = _setChipsDrawer(options, onPick);
  const box = $("#pv-chips");
  if (S?.unified && box && options?.length && S.steps[S.stepIdx]?.id === "final" && !S.consentAsk) {
    const sum = rideSummary();
    sum.classList.add("pv-drawer-sum");
    box.prepend(sum);
  }
  requestAnimationFrame(() => { if ($(".phone").dataset.view === "progress") fitScreen(); });
  return r;
};

// 「일시정지」 중에 말이나 글로 고쳐 달라고 보내면 바로 이어서 진행 (보낸 말은 평소처럼 처리됨)
const _onSubmitOne = onSubmit;
onSubmit = function (e) {
  if (one.userPaused && S && !S.finished && $("#msg").value.trim()) { logEvent("one_resume_by_message"); onePause(false); }
  return _onSubmitOne(e);
};
$("#composer").onsubmit = (e) => onSubmit(e);

// =====================================================================
// 알리고 진행하는 단계("~로 할게요"): 읽을 시간을 말풍선 안 막대로 (다 차면 진행, 일시정지하면 멈춤)
// =====================================================================
setInterval(() => {
  const p = S?.unified && !S.finished ? S.readProg : null;
  let bar = $("#one-read");
  if (!p) { if (bar) bar.remove(); return; }
  const c = chat();
  const ai = [...c.children].filter((el) => !el.classList.contains("one-hide") && (el.id === "run-card" || (el.classList.contains("agent") && !el.classList.contains("typing")))).at(-1);
  if (!ai) return;
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "one-read"; bar.className = "one-read";
    bar.innerHTML = "<i></i>";
  }
  const host = ai.id === "run-card" ? ai.querySelector(".rc-body") || ai : ai; // 회색 말풍선 맨 위 테두리처럼
  if (bar.parentNode !== host) host.appendChild(bar);
  bar.firstChild.style.width = `${Math.min(100, ((p.t + 250) / p.total) * 100)}%`;
}, 120);

// =====================================================================
// 호출이 끝나면 「AI가 한 일」 요약 (이유는 넣지 않음). 참가자가 고른 것은 「내가 고름」
// =====================================================================
setInterval(() => {
  if (!S?.unified) return;
  let box = $("#one-sum");
  if (!S.rideDone) { if (box) box.remove(); one.sumAt = null; return; }
  if (box) return;
  if (!one.sumAt) one.sumAt = Date.now() + 2000; // 호출 완료 말이 먼저 뜨고, 요약은 조금 뒤에
  if (Date.now() < one.sumAt) return;
  const f = S.form;
  const mine = (k) => (S.userSet?.[k] ? ' <em>내가 고름</em>' : "");
  const rows = [
    `${esc(TAXI_APP)} 앱을 열었어요`,
    `출발지를 <b>${esc(ORIGINS[f.origin]?.name || originLabel(f.origin, S.geo))}</b>로 정했어요${mine("origin")}`,
    `도착지를 <b>${esc(PLACES[f.dest]?.name || "")}</b>로 정했어요${mine("dest")}`,
    `택시 종류는 <b>${esc(CAR_TYPES[f.car].label)}</b>${mine("car")}`,
    `결제 금액 <b>${esc(won0(fareOf(f)))}</b> · 쿠폰 ${f.coupon ? "적용" : "적용 안 함"}`,
    `${esc(CAR_TYPES[f.car].label)}를 호출했어요`,
  ];
  box = document.createElement("div");
  box.id = "one-sum"; box.className = "one-sum";
  box.innerHTML = `<b class="sum-t">오늘 사용자님과 함께 한 일</b><ol>${rows.map((r) => `<li>${r}</li>`).join("")}</ol>`;
  const c = chat();
  const ai = [...c.children].filter((el) => el.id === "run-card" || (el.classList.contains("agent") && !el.classList.contains("typing"))).at(-1);
  if (ai) ai.after(box); else c.insertBefore(box, $("#chips"));
  logEvent("one_summary");
}, 400);

// 말풍선 안 「?」(판단 이유 펼쳐 보기)는 쓰지 않음
decorateOne = function (el) {
  if (el.classList.contains("has-more") || el.classList.contains("more-open")) el.classList.remove("has-more", "more-open");
  if (el.nextElementSibling?.classList.contains("more-box")) el.nextElementSibling.remove();
};
