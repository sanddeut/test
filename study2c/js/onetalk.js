// 개선안 c(study2c): 대화창 중심은 그대로, 화면에는 AI의 지금 말 하나만 크게 (improve.js 위에 얹음)
// - 지금 말: AI가 답을 준비하는 "…" > 진행 카드(질문·알림·진행 중) > 마지막 AI 말풍선 중 하나
// - 지난 대화(참가자 말 포함)는 위 한 줄 「지난 대화 N개 · 펼치기」로 접어 둠. 펼치면 원래 대화창 그대로, 「접기」로 다시 접음
// - 단계 수를 미리 알 수 없는 과업에도 그대로 쓸 수 있게, 단계표·진행 점 없이 지금 말만 보여 줌
"use strict";

const one = { open: false, hidden: 0 };
// fade: 지난 대화를 접지 않고 제자리에 작고 흐리게 남김 (지금 말만 크게, 늘 화면 안에) / fold: 위 한 줄 「지난 대화 N개 · 펼치기」로 접음
// 주소 끝에 ?one=fold 를 붙이면 접는 방식으로 볼 수 있음
const ONE_MODE = new URLSearchParams(location.search).get("one") === "fold" ? "fold" : "fade";

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
  $(".chat-head").after(bar);
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
