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
  // 한 세트씩 보기: 위 ⌃(이전 세트) · 아래 ⌄(다음 세트)
  const up = document.createElement("button");
  up.type = "button"; up.id = "one-up"; up.className = "one-nav one-up only-chat"; up.hidden = true;
  up.setAttribute("aria-label", "이전 대화"); up.innerHTML = '<span class="ms">keyboard_arrow_up</span>';
  up.onclick = () => oneGo(-1);
  chat().before(up);
  const down = document.createElement("button");
  down.type = "button"; down.id = "one-down"; down.className = "one-nav one-down only-chat"; down.hidden = true;
  down.setAttribute("aria-label", "다음 대화"); down.innerHTML = '<span class="ms">keyboard_arrow_down</span>';
  down.onclick = () => oneGo(1);
  chat().after(down);
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
    if (el.id === "chips" || el.id === "chat-spacer") continue;
    const page = pages.at(-1);
    const isAI = (x) => (x.classList.contains("bubble") && x.classList.contains("agent") && !x.classList.contains("typing")) || x.id === "run-card";
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
  if (key !== one.curKey) { one.curKey = key; one.page = null; }
  if (one.page != null && one.page >= last) one.page = null;
  const show = new Set(pages[one.page ?? last]);
  for (const el of c.children) {
    if (el.id === "chips" || el.id === "chat-spacer") continue;
    const hide = !show.has(el);
    if (el.classList.contains("one-hide") !== hide) el.classList.toggle("one-hide", hide);
    if (el.classList.contains("one-cur") !== (el === cur)) el.classList.toggle("one-cur", el === cur);
  }
  // 세트가 바뀌면 전환 효과: 다음·새 세트는 아래에서 올라오고, 이전 세트는 위에서 내려옴
  const shown = one.page ?? last;
  const firstEl = pages[shown][0];
  if (one.shownEl !== firstEl) {
    const back = one.shownIdx != null && shown < one.shownIdx;
    one.shownEl = firstEl; one.shownIdx = shown;
    c.classList.remove("one-in-up", "one-in-down"); void c.offsetWidth;
    c.classList.add(back ? "one-in-down" : "one-in-up");
  }
  if (up) up.hidden = (one.page ?? last) === 0;
  if (down) down.hidden = one.page == null;
}

// =====================================================================
// 허용 뒤 진행 카드 안에 실제 앱 화면을 작게 보여 줌 (마음택시 스플래시 → 첫 화면)
// 앱 여는 단계가 끝나면 출발지로 넘어가기 전에 작은 화면은 접히고 「실행화면 보기」 버튼으로 바뀜
// =====================================================================
const MINI_SCALE = 0.3;
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
  box.setAttribute("role", "button");
  box.setAttribute("aria-label", "AI가 누르는 화면 크게 보기");
  box.appendChild(clip);
  (card.querySelector("#rc-open") || card.lastElementChild).before(box);
  box.onclick = () => { miniEnd(true); showRun(true); };
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
setInterval(() => { if (mini.on) miniShow(); }, 100);
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
  box.classList.add("closing"); // 접히는 효과 뒤 「실행화면 보기」로
  setTimeout(restore, 600);
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
  return r;
};
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
