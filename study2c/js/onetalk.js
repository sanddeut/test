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
  if (S?.unified && S.steps[S.stepIdx]?.id === "final") return finalCard();
  if (S?.steps[S.stepIdx]?.id === "taxi_open") return null;
  const el = _stepPreviewOne();
  // 출발지·목적지 카드: 빨간 위치 아이콘과 「현재 위치에서 ○km」는 빼고, 이름·주소 아래에 작은 지도 그림
  if (el?.classList?.contains("pv-place")) {
    el.querySelector(".pv-pin")?.remove();
    el.querySelector(".pv-here")?.remove();
    el.classList.add("one-place");
    const isO = el.classList.contains("pv-origin");
    const pl = isO ? ORIGINS[S.originTarget || TARGET_ORIGIN] : PLACES[S.form.dest || S.userDest || AGENT_PLACE];
    if (!el.querySelector(".one-map")) el.insertAdjacentHTML("beforeend", miniMapSVG(isO ? 0 : 1, pl));
  }
  return el;
};
// 작은 지도 그림 (앱 지도와 같은 색: 옅은 바탕, 흰 길, 파란 강, 가운데 빨간 핀)
// (지금은 쓰지 않음: 카드 안 지도도 늘 그림) 실제 지도: 그 장소 좌표를 가운데 두고 지도 조각(타일)을 이어 붙임
const MAP_Z = 16;
function mapTiles(lat, lng) {
  const n = 2 ** MAP_Z * 256;
  const px = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const py = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const tx = Math.floor(px / 256), ty = Math.floor(py / 256);
  const imgs = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) {
    const x = tx + dx, y = ty + dy, s = "abcd"[(x + y) & 3];
    // 지도 위치: 상자 가운데(50%)에 좌표가 오도록
    imgs.push(`<img alt="" loading="lazy" referrerpolicy="no-referrer" src="https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${MAP_Z}/${x}/${y}.png" style="left:calc(50% + ${Math.round(x * 256 - px)}px);top:calc(50% + ${Math.round(y * 256 - py)}px)" onerror="this.remove()" onload="this.closest('.one-map')?.classList.add('tiles-ok')">`);
  }
  return `<div class="one-map-tiles">${imgs.join("")}</div><span class="one-map-attr">© OpenStreetMap © CARTO</span>`;
}
function miniMapSVG(v, pl) {
  return `<div class="one-map" aria-hidden="true">${v ? MAP_GANGNAM : pl?.lat && pl.lat < 36.5 ? MAP_DAEGU : MAP_YONGSAN}<span class="one-map-pin"><svg viewBox="-12 -24 24 30"><ellipse cx="0" cy="4" rx="5" ry="1.8" fill="#000" opacity=".18"/><path d="M0 4 C-7 -4 -8 -7 -8 -10 A8 8 0 1 1 8 -10 C8 -7 7 -4 0 4 Z" fill="#e8453c" stroke="#fff" stroke-width="1.2"/><circle cy="-10" r="3" fill="#fff"/></svg></span></div>`;
}
// 지도를 불러오지 못할 때 보이는 그림 (실제 위치를 본떠 그림: 지도 앱처럼 땅·숲·물·길·건물·이름)
const MAP_TXT = (x, y, t, o = "") => `<text x="${x}" y="${y}" ${o} font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif">${t}</text>`;
// 대구 용산역(2호선): 동서로 지나는 달구벌대로, 북쪽 와룡산 자락, 아파트 단지
const MAP_DAEGU = `<svg viewBox="60 18 200 68" preserveAspectRatio="xMidYMid slice">
<rect width="320" height="110" fill="#f1efea"/>
<path d="M0 0 H190 C170 14 130 22 80 24 C40 26 14 30 0 36 Z" fill="#d6e8cc"/>
<g fill="#e3dfd6"><rect x="8" y="34" width="60" height="16" rx="2"/><rect x="80" y="30" width="70" height="20" rx="2"/><rect x="162" y="30" width="62" height="20" rx="2"/><rect x="236" y="30" width="78" height="20" rx="2"/>
<rect x="8" y="68" width="60" height="36" rx="2"/><rect x="80" y="68" width="70" height="36" rx="2"/><rect x="162" y="68" width="62" height="36" rx="2"/><rect x="236" y="68" width="78" height="36" rx="2"/></g>
<g fill="#d8d3c8"><rect x="88" y="34" width="8" height="13" rx="1"/><rect x="100" y="34" width="8" height="13" rx="1"/><rect x="112" y="34" width="8" height="13" rx="1"/><rect x="124" y="34" width="8" height="13" rx="1"/><rect x="170" y="74" width="8" height="18" rx="1"/><rect x="182" y="74" width="8" height="18" rx="1"/><rect x="194" y="74" width="8" height="18" rx="1"/><rect x="244" y="74" width="8" height="18" rx="1"/><rect x="256" y="74" width="8" height="18" rx="1"/><rect x="268" y="74" width="8" height="18" rx="1"/><rect x="92" y="74" width="22" height="14" rx="1"/></g>
<g stroke="#fff" stroke-width="5"><line x1="74" y1="20" x2="74" y2="110"/><line x1="156" y1="20" x2="156" y2="110"/><line x1="230" y1="20" x2="230" y2="110"/></g>
<line x1="0" y1="59" x2="320" y2="59" stroke="#efd58c" stroke-width="16"/><line x1="0" y1="59" x2="320" y2="59" stroke="#fde9a6" stroke-width="13"/>
<line x1="0" y1="59" x2="320" y2="59" stroke="#e8c96f" stroke-width=".8" stroke-dasharray="6 5"/>
<g transform="translate(176 59)"><circle r="6.5" fill="#fff" stroke="#3cb44a" stroke-width="2.4"/><text y="2.6" text-anchor="middle" font-size="7" font-weight="700" fill="#3cb44a" font-family="sans-serif">2</text></g>
<g font-size="8" fill="#8a7a3c" font-weight="500">${MAP_TXT(88, 62, "달구벌대로")}</g>
<g font-size="7.5" fill="#2e8a3a" font-weight="700">${MAP_TXT(186, 52, "용산역")}</g>
<g font-size="7" fill="#7f9a72">${MAP_TXT(110, 14, "와룡산")}</g>
<g font-size="7" fill="#8a8578">${MAP_TXT(244, 100, "용산동")}</g>
</svg>`;
// 서울 용산역(1호선): 남북으로 지나는 철길과 한강대로, 아이파크몰, 신용산역(4호선)
const MAP_YONGSAN = `<svg viewBox="60 18 200 68" preserveAspectRatio="xMidYMid slice">
<rect width="320" height="110" fill="#f1efea"/>
<path d="M240 0 H320 V46 C296 44 270 34 256 20 C248 12 242 6 240 0 Z" fill="#d6e8cc"/>
<g fill="#e3dfd6"><rect x="8" y="6" width="80" height="40" rx="2"/><rect x="8" y="58" width="80" height="46" rx="2"/><rect x="190" y="6" width="44" height="40" rx="2"/><rect x="190" y="58" width="60" height="46" rx="2"/><rect x="262" y="58" width="52" height="46" rx="2"/></g>
<g fill="#d8d3c8"><rect x="16" y="12" width="22" height="16" rx="1"/><rect x="48" y="14" width="30" height="20" rx="1"/><rect x="16" y="66" width="30" height="18" rx="1"/><rect x="196" y="12" width="20" height="22" rx="1"/><rect x="198" y="66" width="18" height="26" rx="1"/><rect x="270" y="64" width="34" height="20" rx="1"/></g>
<rect x="134" y="36" width="34" height="40" rx="3" fill="#e9e1d2"/>
<g stroke="#b9b4aa" stroke-width="1.2"><line x1="110" y1="0" x2="110" y2="110"/><line x1="118" y1="0" x2="118" y2="110"/><line x1="126" y1="0" x2="126" y2="110"/></g>
<line x1="118" y1="0" x2="118" y2="110" stroke="#b9b4aa" stroke-width="7" stroke-dasharray="1 5"/>
<line x1="0" y1="52" x2="104" y2="52" stroke="#fff" stroke-width="5"/>
<line x1="180" y1="0" x2="180" y2="110" stroke="#efd58c" stroke-width="15"/><line x1="180" y1="0" x2="180" y2="110" stroke="#fde9a6" stroke-width="12"/>
<line x1="250" y1="52" x2="320" y2="52" stroke="#fff" stroke-width="4"/>
<g transform="translate(118 56)"><circle r="6.5" fill="#fff" stroke="#0d3692" stroke-width="2.4"/><text y="2.6" text-anchor="middle" font-size="7" font-weight="700" fill="#0d3692" font-family="sans-serif">1</text></g>
<g transform="translate(200 52)"><circle r="5.5" fill="#fff" stroke="#00a2d1" stroke-width="2"/><text y="2.4" text-anchor="middle" font-size="6.5" font-weight="700" fill="#00a2d1" font-family="sans-serif">4</text></g>
<g font-size="7.5" fill="#0d3692" font-weight="700">${MAP_TXT(128, 34, "용산역")}</g>
<g font-size="6.5" fill="#8a8578">${MAP_TXT(136, 86, "아이파크몰")}${MAP_TXT(208, 46, "신용산역")}</g>
<g font-size="7" fill="#8a7a3c">${MAP_TXT(183, 98, "한강대로", 'transform="rotate(-90 183 98)"')}</g>
<g font-size="7" fill="#7f9a72">${MAP_TXT(270, 20, "용산공원")}</g>
</svg>`;
// 강남 테헤란로 152: 동서로 지나는 테헤란로, 역삼역(2호선), 네모난 블록과 건물
const MAP_GANGNAM = `<svg viewBox="60 18 200 68" preserveAspectRatio="xMidYMid slice">
<rect width="320" height="110" fill="#f1efea"/>
<g fill="#e3dfd6">
<rect x="6" y="6" width="44" height="30" rx="2"/><rect x="62" y="4" width="50" height="32" rx="2"/><rect x="124" y="6" width="40" height="30" rx="2"/><rect x="186" y="4" width="46" height="32" rx="2"/><rect x="244" y="6" width="34" height="30" rx="2"/><rect x="290" y="4" width="28" height="32" rx="2"/>
<rect x="6" y="76" width="44" height="30" rx="2"/><rect x="62" y="76" width="34" height="30" rx="2"/><rect x="124" y="76" width="40" height="30" rx="2"/><rect x="186" y="76" width="46" height="30" rx="2"/><rect x="244" y="76" width="34" height="30" rx="2"/><rect x="290" y="76" width="28" height="30" rx="2"/></g>
<g fill="#d8d3c8"><rect x="12" y="12" width="14" height="18" rx="1"/><rect x="70" y="10" width="20" height="20" rx="1"/><rect x="132" y="12" width="12" height="16" rx="1"/><rect x="194" y="10" width="18" height="18" rx="1"/><rect x="250" y="12" width="14" height="16" rx="1"/><rect x="12" y="82" width="18" height="16" rx="1"/><rect x="132" y="82" width="16" height="18" rx="1"/><rect x="196" y="82" width="22" height="16" rx="1"/><rect x="250" y="82" width="16" height="18" rx="1"/></g>
<rect x="100" y="76" width="18" height="30" rx="2" fill="#d6e8cc"/>
<g stroke="#fff" stroke-width="5"><line x1="56" y1="0" x2="56" y2="110"/><line x1="118" y1="0" x2="118" y2="110"/><line x1="238" y1="0" x2="238" y2="110"/><line x1="284" y1="0" x2="284" y2="110"/></g>
<line x1="176" y1="0" x2="176" y2="110" stroke="#e2ddd2" stroke-width="10"/><line x1="176" y1="0" x2="176" y2="110" stroke="#fff" stroke-width="8"/>
<line x1="0" y1="56" x2="320" y2="56" stroke="#efd58c" stroke-width="16"/><line x1="0" y1="56" x2="320" y2="56" stroke="#fde9a6" stroke-width="13"/>
<line x1="0" y1="56" x2="320" y2="56" stroke="#e8c96f" stroke-width=".8" stroke-dasharray="6 5"/>
<g transform="translate(206 56)"><circle r="6.5" fill="#fff" stroke="#3cb44a" stroke-width="2.4"/><text y="2.6" text-anchor="middle" font-size="7" font-weight="700" fill="#3cb44a" font-family="sans-serif">2</text></g>
<g font-size="8" fill="#8a7a3c" font-weight="500">${MAP_TXT(22, 59, "테헤란로")}${MAP_TXT(250, 59, "테헤란로")}</g>
<g font-size="7.5" fill="#2e8a3a" font-weight="700">${MAP_TXT(214, 49, "역삼역")}</g>
<g font-size="7" fill="#8a8578">${MAP_TXT(179, 22, "논현로", 'transform="rotate(90 179 22)"')}${MAP_TXT(121, 98, "역삼로", 'transform="rotate(-90 121 98)"')}</g>
<g font-size="7" fill="#7f9a72">${MAP_TXT(98, 102, "공원")}</g>
</svg>`;

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
  // 한 세트 = AI 말이 먼저(늘 맨 위 같은 자리), 그 아래 참가자의 답. 새 AI 말이 오면 다음 세트
  // (말이 아직 없는 진행 카드·「~하는 중」은 지금 세트에 붙음)
  const isUser = (x) => x.classList.contains("bubble") && x.classList.contains("user");
  const isAI = (x) => (x.classList.contains("bubble") && x.classList.contains("agent") && !x.classList.contains("typing"))
    || x.classList.contains("one-own")
    || (x.id === "run-card" && (x.classList.contains("asking") || Boolean(x.querySelector("#rc-q:not([hidden])")?.textContent.trim())));
  const pages = [[]];
  for (const el of c.children) {
    if (el.id === "chips" || el.id === "chat-spacer" || el.id === "one-ctrl" || el.id === "one-open") continue;
    if (isAI(el) && pages.at(-1).some((x) => isAI(x) || isUser(x))) pages.push([]);
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
  // 참가자가 답하면 그 답을 2초 동안 보여 준 뒤 다음 세트로 (그 사이 새 AI 말이 와도 2초는 지금 세트)
  const nUser = c.querySelectorAll(":scope > .bubble.user").length;
  if (nUser !== one.nUser) { if (nUser > (one.nUser || 0)) { one.userAt = Date.now(); setTimeout(oneUpdate, 2100); } one.nUser = nUser; } // 2초 뒤 화면에 다른 변화가 없어도 다음 세트로 넘어가게
  const lastUser = [...c.querySelectorAll(":scope > .bubble.user")].at(-1);
  const hold = !past && last > 0 && one.userAt && Date.now() - one.userAt < 2000 && lastUser && !pages[last].includes(lastUser);
  const shownIdx = hold ? last - 1 : last;
  const show = new Set(past ? pages.slice(0, -1).flat() : pages[shownIdx]);
  // 말이 없는 진행 카드(「~하는 중」)가 참가자 답보다 위에 있으면 숨김 (답 아래 「~하는 중」 하나만)
  const rc = $("#run-card");
  if (rc && show.has(rc) && !rc.classList.contains("asking") && !rc.querySelector("#rc-q:not([hidden])")?.textContent.trim()) {
    let n = rc.nextElementSibling, later = false;
    while (n) { if (show.has(n) && ((n.classList.contains("bubble") && n.classList.contains("user")) || n.id === "typing")) { later = true; break; } n = n.nextElementSibling; }
    if (later) show.delete(rc);
  } // 지난 대화 보기: 지금 세트를 뺀 지난 대화 모두 / 평소: 지금 세트만
  for (const el of c.children) {
    if (el.id === "chips" || el.id === "chat-spacer" || el.id === "one-ctrl" || el.id === "one-open") continue;
    const hide = !show.has(el);
    if (el.classList.contains("one-hide") !== hide) el.classList.toggle("one-hide", hide);
    if (el.classList.contains("one-cur") !== (el === cur)) el.classList.toggle("one-cur", el === cur);
  }
  // 세트가 바뀌면 전환 효과: 다음·새 세트는 아래에서 올라오고, 이전 세트는 위에서 내려옴
  const shown = past ? -1 : last;
  const firstEl = past ? null : pages[shownIdx][0];
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
  oneDoingSync(); // 단계가 바뀌는 순간 「~하는 중」도 바로 (지난 단계 문구가 잠깐 보이지 않게)
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
  (card.querySelector(".rc-body") || card).appendChild(box); // 카드 안에 잠깐
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
  if (!box) return;
  // 「마음택시 앱을 열어서 사용할게요」와 동시에 보임. 앱이 아직 홈 화면이면 스플래시 모양으로 가려 둠
  const q = $("#rc-q");
  const said = Boolean(q && !q.hidden && q.textContent.trim());
  if (box.hidden === said) box.hidden = !said;
  const pre = S?.phone?.app === "home";
  if (box.classList.contains("mini-pre") !== pre) box.classList.toggle("mini-pre", pre);
}
setInterval(() => {
  if (!mini.on) return;
  miniShow();
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
    if (S) S.miniDone = true; // 작은 앱 화면이 끝난 뒤부터 「실행화면」 버튼
    fitScreen();
  };
  logEvent("rc_mini_end");
  if (now || !box) return restore();
  // 잠깐 보여 준 뒤 그냥 접혀 사라짐. 그다음부터 오른쪽 아래 「실행화면」 버튼
  box.classList.add("closing");
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
const APPLYING = { origin: "출발지를 설정하는 중", dest: "목적지를 설정하는 중", car: "택시 종류를 바꾸는 중", drop: "하차 지점을 바꾸는 중", count: "호출 대수를 바꾸는 중" };
// 대화창과 실행화면이 같은 문구: 「AI가 ~하는 중」
function oneDoingText() {
  let t;
  if (one.doing) t = one.doing.replace(/…$/, "");
  else if (one.staleQ && S?.stepIdx === one.staleStep) t = APPLYING[S.steps[S.stepIdx]?.id] || "반영하는 중";
  else { const id = S?.running && !S.finished ? S.steps?.[S.stepIdx]?.id : null; t = (typeof DOING !== "undefined" && DOING[id]) || "답을 준비하는 중"; }
  return `AI가 ${t}`;
}
// 실행화면 아래 「AI가 ~하고 있어요」도 대화창과 같은 「AI가 ~하는 중」으로
const _waitLabelOne = waitLabel;
waitLabel = function () { return S?.unified ? oneDoingText() : _waitLabelOne(); };
function oneDoingSync() {
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
}
setInterval(oneDoingSync, 200);

// 앱 여는 단계가 너무 길지 않게: 읽을 시간 6초 → 2초, 연 뒤 기다림 3.5초 → 1.2초 (원래 약 14초 → 약 6초)
const ONE_PLAN = /[?&]plan=1/.test(location.search);
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
  // 시작 전 계획(「이렇게 진행할게요」)은 쓰지 않음 (해 보니 없는 게 나음). ?plan=1 이면 다시 켬
  if (r && S && !S.finished && S.jumpTo == null && !S.planDone) {
    S.planDone = true;
    if (ONE_PLAN) { if (!(await onePlan())) return false; }
    else if (S.req.car && CAR_TYPES[S.req.car]) planCar(S.req.car); // 처음 요청에서 말한 택시 종류는 다시 묻지 않고 「~로 할게요」
  }
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
  const said = "이렇게 진행할게요.";
  await agentSay(said, { gated: true }); // 「~하는 중」을 내리기 전에 새 말이 카드에 들어가야 지난 카드가 다시 보이지 않음
  showTyping(false);
  one.doing = null;
  for (;;) {
    S.planAsk = true;
    let c;
    try {
      c = await askChoice([{ id: "reject", label: "수정" }, { id: "approve", label: "이대로 진행" }], said, [...changeIntents(), "cancel"],
        "택시를 부르기 전에 진행 계획을 확인하는 중이야. 그대로 하라고 하면 approve, 출발지·목적지·택시 종류를 바꾸라고 하면 해당 set_ 의도, 고치겠다고만 하면 reject야.");
    } finally { S.planAsk = false; }
    logEvent("decision", { choice: c.id, via: c.via, key: "plan" });
    if (c.id === "approve") { if (S.req.car && CAR_TYPES[S.req.car]) planCar(S.req.car); return true; } // 계획에 적힌 택시 종류는 다시 묻지 않음
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
    if (!(await onePlanEdit())) return false;
  }
}
// 계획에서 [수정]: 무엇을 수정할지 고르고 → 그 항목을 물어 요청에 반영 → 계획을 다시 보여 줌
function planApply(o) {
  if (o.origin && ORIGINS[o.origin]) S.req.origin = o.origin;
  else if (o.origin_name) { S.req.origin = null; S.req.originName = o.origin_name; }
  if (o.car_type && CAR_TYPES[o.car_type]) planCar(o.car_type);
  const k = namedDest(o); if (k) S.userDest = k;
}
// 계획에서 고른 택시 종류는 택시 종류 단계에서 다시 묻지 않고 그대로 씀
function planCar(k) { S.req.car = k; S.form.car = k; (S.userSet ||= {}).car = true; }
async function onePlanEdit() {
  const q = "무엇을 수정할까요?";
  await agentSay(q, { gated: true });
  // 계획에 이미 정해진(참가자가 말한) 것만 고를 수 있게
  const [ro, rd, rc] = planRows();
  const items = [ro[1] && { id: "p_origin", label: "출발지", desc: ro[1] }, rd[1] && { id: "p_dest", label: "도착지", desc: rd[1] }, rc[1] && { id: "p_car", label: "택시 종류", desc: rc[1] }].filter(Boolean);
  if (!items.length) items.push({ id: "p_origin", label: "출발지" }, { id: "p_dest", label: "도착지" });
  const c = await askChoice(items, q, [...changeIntents(), "cancel"], "진행 계획에서 무엇을 고칠지 고르는 중이야. 출발지·도착지·택시 종류를 바로 말하면 해당 set_ 의도야.");
  if (c.id === "cancel") { await cancelRide(); return false; }
  if (c.out && String(c.id).startsWith("set_")) { planApply(c.out); return true; }
  if (c.id === "p_car") {
    const q2 = "어떤 택시로 할까요?";
    await agentSay(q2, { gated: true });
    // 출발지를 정하기 전이라 요금은 빼고
    const c2 = await askChoice(CAR_OPTS().map((o) => ({ ...o, price: "" })), q2, ["set_car"], "택시 종류를 고르는 중이야. 일반택시=normal, 모범택시=deluxe, 대형택시=large.");
    const k = CAR_TYPES[c2.id] ? c2.id : c2.out?.car_type;
    if (CAR_TYPES[k]) planCar(k);
    return true;
  }
  if (c.id === "p_origin" || c.id === "p_dest") {
    const q2 = c.id === "p_origin" ? "어디에서 출발할까요? 말이나 글로 알려 주세요." : "어디로 갈까요? 말이나 글로 알려 주세요.";
    renderBubble("agent", q2); // 말·글로 답하는 질문은 대화창 AI 말풍선으로 (실행화면 패널에도)
    S.lastQuestion = q2;
    const text = await waitText();
    if (text) {
      const o = await turn(text, { said: q2, intents: [c.id === "p_origin" ? "set_origin" : "set_dest", "other"], hint: c.id === "p_origin" ? "출발지를 고치는 중이야. 말한 곳이 출발지면 set_origin." : "도착지를 고치는 중이야. 말한 곳이 목적지면 set_dest." });
      if (o) planApply(o);
    }
    return true;
  }
  return true;
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
  // 최종 확인 질문에는 고른 버튼 대신 그때의 호출 내용 정리
  if (choices.some((o) => o.id === "approve") && /최종 확인/.test(q.textContent)) {
    const sum = finalCard();
    sum.querySelectorAll("[data-edit]").forEach((x) => { x.removeAttribute("data-edit"); x.removeAttribute("role"); });
    sum.querySelectorAll(".ms").forEach((x) => x.remove());
    sum.classList.add("hist-final");
    q.appendChild(sum);
    return;
  }
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
    u.textContent = "수정"; // 일시정지 옆 버튼: 「수정」 (지금·바로 전 단계를 다시 함)
    u.onclick = () => {
      if (oneCanCancelPending()) return oneCancelPending(); // 「~할게요」 하고 기다리는 중이면 그 일을 하기 전에 취소
      const l = [...chat().querySelectorAll(":scope > .undo-link")].at(-1); if (l) { logEvent("one_undo"); l.click(); }
    };
    const pz = document.createElement("button");
    pz.type = "button"; pz.id = "one-pause"; pz.className = "one-pill";
    pz.onclick = () => onePause(!one.userPaused);
    row.append(u, pz); // 왼쪽 「수정」(최종 확인의 수정과 같은 자리·모양), 오른쪽 「일시정지」
  }
  if (one.userPaused && S && !S.paused) one.userPaused = false; // 다른 곳(되돌리기 등)에서 다시 시작된 경우
  // 지금 세트의 마지막 AI 말(진행 카드나 AI 말풍선). 「~하는 중…」만 보일 때(진행 카드에 아직 할 말이 없을 때)는 두 버튼을 숨김
  const ai = [...c.children].filter((el) => show.has(el) && (el.id === "run-card" || (el.classList.contains("agent") && !el.classList.contains("typing")))).at(-1);
  const rq = ai?.id === "run-card" ? ai.querySelector("#rc-q") : null;
  const said = ai && (ai.id !== "run-card" || ai.classList.contains("asking") || (rq && !rq.hidden && rq.textContent.trim() && !ai.classList.contains("one-stale")));
  // 카드에 이미 고를 버튼(수정·승인 등)이 있으면 「일시정지」「취소」는 빼 둠
  const asking = ai?.id === "run-card" && ai.classList.contains("asking");
  // 그 AI 말에 참가자가 이미 답했으면(답이 아래에 있으면) 버튼은 숨김
  let answered = false;
  for (let n = ai?.nextElementSibling; n; n = n.nextElementSibling) if (show.has(n) && n.classList.contains("bubble") && n.classList.contains("user")) { answered = true; break; }
  const opening = S?.steps?.[S.stepIdx]?.id === "taxi_open"; // 마음택시 여는 단계에서만 예외로 빼 둠
  const vis = Boolean(!past && S?.running && !S.finished && said && !asking && !opening && (!answered || S.rideDone));
  if (row.hidden === vis) row.hidden = !vis; // 값이 바뀔 때만 (같은 값을 다시 넣어도 대화창 감시가 다시 돌아 무한 반복됨)
  if (!vis) return;
  const u = row.querySelector("#one-undo"), pz = row.querySelector("#one-pause");
  const noUndo = !c.querySelector(":scope > .undo-link") && !oneCanCancelPending();
  if (u.disabled !== noUndo) u.disabled = noUndo;
  // 호출을 마친 뒤에는 「멈추기」「수정」 대신 「되돌리기」 알약 하나 (끝난 일이라 말을 달리함)
  const done = Boolean(S.rideDone);
  if (row.classList.contains("one-ctrl-done") !== done) row.classList.toggle("one-ctrl-done", done);
  const uLabel = done ? '<span class="ms">undo</span>되돌리기' : "수정"; // 호출 뒤 「되돌리기」에는 아이콘
  if (u.innerHTML !== uLabel) u.innerHTML = uLabel;
  const pzHTML = one.userPaused ? "계속하기" : "일시정지"; // 아이콘 없이 글자만
  if (pz.innerHTML !== pzHTML) pz.innerHTML = pzHTML;
  const noPause = !one.userPaused && (S.paused || S.undoPending);
  if (pz.disabled !== noPause) pz.disabled = noPause;
  // 작업 카드면 카드 안 맨 아래(구분선 아래 알약 두 개). 호출을 마친 뒤(말풍선)는 그 바로 아래 「되돌리기」
  if (ai?.id === "run-card" && !done) {
    const host = ai.querySelector(".rc-body") || ai;
    if (row.parentNode !== host || host.lastElementChild !== row) host.appendChild(row);
    return;
  }
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
    b.onclick = () => { if (!S || S.finished) return; logEvent("one_open_run"); showRun(true); };
    $("#composer")?.appendChild(b);
  }
  return b;
}
function oneOpenBtn(c, show, past) {
  const b = oneRunFab(true);
  if (!b) return;
  const card = $("#run-card"), o = $("#rc-open");
  // 실행화면을 볼 수 있을 때 늘 같은 자리에 (작은 앱 화면이 떠 있는 동안은 숨김: 닫힐 때 이 버튼으로 들어감)
  const vis = Boolean(!past && S?.running && !S.finished && (S.miniDone || (S.steps[S.stepIdx]?.id && S.steps[S.stepIdx].id !== "taxi_open")) && card && o && !mini.on); // 질문 중(택시 종류·최종 호출 등)에도 늘 같은 자리에
  if (b.hidden === vis) b.hidden = !vis;
}

// 「~할게요」 하고 읽을 시간을 기다리는 동안의 「취소」: 그 단계를 하기 전 상태로 돌리고 다시 물음 (되돌리기와 같은 방식)
function oneCanCancelPending() {
  if (oneCanRedoOpen()) return true;
  return Boolean(S?.unified && S.readProg && S.readProg.t < S.readProg.total && !S.undoPending && !S.finished && undoable(S.stepIdx) && S.undoResolve);
}
// 마음택시를 여는 중의 「수정」: 앱을 열기 전(허용 직전)으로 돌아가 허용할지 다시 물음
function oneCanRedoOpen() {
  return Boolean(S?.unified && S.steps?.[S.stepIdx]?.id === "taxi_open" && S.perm?.app === true && S.undoResolve && !S.undoPending && !S.finished);
}
function oneCancelPending() {
  const i = S.stepIdx;
  if (oneCanRedoOpen()) {
    logEvent("one_redo_open");
    S.undoPending = true; S.oneCancelled = true; S.paused = true;
    if (mini.on) miniEnd(true);
    syncControls();
    setTimeout(() => { S.perm.app = null; S.undoTo = i; S.undoResolve?.("__undo"); }, 400 * PACE);
    return;
  }
  logEvent("one_cancel_pending", { step: S.steps[i]?.id });
  S.undoPending = true;
  S.oneCancelled = true; // 되돌림 안내를 「취소했어요」로
  S.paused = true; // 하던 진행은 여기서 멈춰 두고 버림
  S.readProg = null;
  syncControls();
  setTimeout(() => { S.undoTo = i; S.undoResolve?.("__undo"); }, 400 * PACE);
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
  // 처음 요청은 정해진 대로 못 알아들으므로(오류 ①) 「전달됨」 없이 처음부터 「전달 실패」
  const willMiss = !S.running && !S.m.request && S.session === 0 && (S.m.mishears || 0) < MISHEAR_COUNT;
  row.innerHTML = willMiss ? '<span class="send-fail" role="status"><span class="ms">error</span>전달 실패</span>' : '<span class="send-ok" role="status"><span class="ms">check_circle</span>전달됨</span>';
  b.after(row);
  if (!willMiss) setTimeout(() => row.classList.add("gone"), RECEIPT_MS);
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
// 막대가 차는 시간에는 읽을 시간 + 실제로 앱을 조작하는 시간이 함께 들어감:
// 읽는 동안 앞부분이 차고, 남은 부분은 AI가 앱을 조작하는 동안 차서 그 단계가 끝날 때 꽉 참
// 조작 시간 어림값 (단계마다 실제로 걸리는 시간에 맞춤, 「~하는 중」 속도 0.7배 기준). 실제로 끝나는 때에 맞춰 마지막에 꽉 채움
// 어림값은 실제보다 조금 짧게 두어 막대가 끝까지 찬 뒤 다음 단계로 넘어가게 함 (다 차면 꽉 찬 채로 기다림)
const OP_EST = { taxi_open: 4300, origin: 2900, dest: 3800, coupon: 850 };
let OP_EST_MS = 3500;
// 「AI가 ~하는 중」(읽을 시간이 끝나고 AI가 앱을 조작하는 동안)에는 조금 빠르게: 속도 배율 0.7 (읽을 시간·답을 기다리는 동안은 그대로)
const ONE_PACE = PACE, ONE_DOING_PACE = 0.7;
setInterval(() => {
  if (!S?.unified) return;
  const reading = S.readProg && S.readProg.t < S.readProg.total;
  const doing = S.running && !S.finished && !S.paused && !S.waiter && !reading;
  const want = doing ? Math.min(ONE_PACE, ONE_DOING_PACE) : ONE_PACE;
  if (PACE !== want && !(doing && PACE < want)) PACE = want; // 택시 종류를 바꾸는 중처럼 이미 더 빠르면 그대로
}, 100);
function opEnd() { if (S?.opBar && !S.opBar.done) { S.opBar.done = true; const o = S.opBar; setTimeout(() => { if (S?.opBar === o) S.opBar = null; }, 350); } }
setInterval(() => {
  if (!S?.unified) return;
  const p = S.readProg;
  OP_EST_MS = OP_EST[S.steps?.[S.stepIdx]?.id] || 3500;
  if (p && p.t >= p.total && !S.opBar) S.opBar = { read: p.total, t: 0, step: S.stepIdx, est: OP_EST_MS }; // 읽을 시간이 끝남 → 조작 시작
  const o = S.opBar;
  if (!o || o.done) return;
  if (!S.paused) o.t += 80;
  // 다음 단계로 넘어가거나, 질문이 뜨거나, 되돌리거나, 끝나면 꽉 채우고 내림
  if (S.stepIdx !== o.step || S.waiter || S.undoPending || S.finished || (S.readProg && S.readProg.t < S.readProg.total)) opEnd();
}, 80);
function barFrac() {
  if (S.readProg && !S.opBar) return Math.min(1, (S.readProg.t + 250) / (S.readProg.total + OP_EST_MS));
  const o = S.opBar;
  if (!o) return null;
  if (o.done) return 1;
  const est = o.est || OP_EST_MS;
  const k = o.t / est; // 어림 시간이 지나면 꽉 찬 채로 다음 단계를 기다림
  const f = Math.min(1, k);
  return (o.read + f * est) / (o.read + est);
}
setInterval(() => {
  const p = S?.unified && !S.finished && (S.readProg || S.opBar) ? barFrac() : null;
  let bar = $("#one-read");
  if (p == null) { if (bar) bar.remove(); return; }
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
  bar.firstChild.style.width = `${p * 100}%`;
}, 120);

// =====================================================================
// 호출이 끝나면 「AI가 한 일」 요약 (이유는 넣지 않음). 참가자가 고른 것은 「내가 고름」
// =====================================================================
const ONE_SUM = false; // 요약은 쓰지 않음 (true로 바꾸면 다시 보임)
setInterval(() => {
  if (!S?.unified || !ONE_SUM) return;
  let box = $("#one-sum");
  if (!S.rideDone) { if (box) box.remove(); one.sumAt = null; return; }
  if (box) return;
  if (!one.sumAt) one.sumAt = Date.now() + 2000; // 호출 완료 말이 먼저 뜨고, 요약은 조금 뒤에
  if (Date.now() < one.sumAt) return;
  const f = S.form;
  const mine = () => ""; // 「내가 고름」 태그는 쓰지 않음
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
  box.innerHTML = `<b class="sum-t">오늘 한 일 요약</b><ol>${rows.map((r) => `<li><span>${r}</span></li>`).join("")}</ol>`;
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

// 하기 전에 취소한 경우: 「방금 한 일을 되돌렸어요」 대신 「취소했어요」
const _renderBubbleCancel = renderBubble;
renderBubble = function (role, text) {
  if (role === "agent" && S?.oneCancelled && /^방금 한 일을 되돌렸어요\./.test(text)) { S.oneCancelled = false; text = text.replace(/^방금 한 일을 되돌렸어요\./, "수정할게요."); }
  return _renderBubbleCancel(role, text);
};

// 택시 종류를 고른 뒤: 「택시 종류를 확인하는 중」을 다시 띄우지 않고 「○○택시로 바꾸는 중」, 화면 조작도 빠르게
const _doApplyOne = doApply;
doApply = async function (step, choice, opts) {
  if (!S?.unified || step?.id !== "car" || !S.userSet?.car) return _doApplyOne(step, choice, opts);
  // 목록에서 고른 뒤: 읽을 시간·대기 화면 없이 바로 바꾸고, 「○○택시로 설정했어요.」 말풍선을 띄운 뒤 넘어감
  S.carReadDone = false;
  S.carSaidOne = true; // 뒤에 오는 「○○택시로 할게요」(car.set)는 말하지 않음
  const pace = PACE;
  const label = CAR_TYPES[S.form.car]?.label || "고르신 택시";
  one.doing = `${label}로 바꾸는 중…`;
  PACE = Math.min(PACE, 0.5);
  let r;
  try { r = await _doApplyOne(step, choice, opts); } finally { PACE = pace; one.doing = null; }
  // 알리고 진행하는 말처럼 카드에 보이게 (낮은 자동화로 두면 숨겨진 줄로 감)
  const prev = [S.automation, S.cond];
  S.automation = "high"; S.cond = "B2";
  const card = $("#run-card");
  const said = `${CAR_TYPES[S.form.car]?.label || label}로 설정했어요.`;
  card?.classList.add("one-plain"); // 카드 안 택시 종류 줄·수정/일시정지 없이 말만 (다음 말이 뜰 때까지)
  const idx = S.stepIdx;
  // 다음 단계로 넘어가도 새 말이 뜰 때까지는 말만 보이게 (그 사이 다음 단계 카드가 먼저 비치지 않게)
  const w = setInterval(() => {
    const q = $("#rc-q");
    if (!S || S.finished || (q && !q.hidden && q.textContent.trim() && q.textContent.trim() !== said) || (S.waiter && S.stepIdx !== idx)) { card?.classList.remove("one-plain"); clearInterval(w); }
  }, 100);
  try { await agentSay(said); } finally { [S.automation, S.cond] = prev; }
  await sleep(2500);
  return r;
};

// 「~하는 중」 깜빡임 줄이기: 카드에 할 말이 없으면 늘 「~하는 중」 (잠깐씩 켜졌다 꺼지는 진행 표시와 상관없이)
// 참가자가 답한 뒤 AI 말이 아무것도 안 보이는 틈이 생기면, 진행 카드를 바로 아래로 옮겨 「~하는 중」을 이어서 보여 줌
setInterval(() => {
  if (!S?.unified || !S.running || S.finished || one.page != null || mini.closing) return;
  const c = chat(), card = $("#run-card"), q = $("#rc-q");
  if (!card || !q || (!q.hidden && q.textContent.trim()) || card.classList.contains("asking") || $("#typing") || S.steps[S.stepIdx]?.id === "taxi_open") return;
  const kids = [...c.children].filter((el) => !["chips", "chat-spacer", "one-ctrl"].includes(el.id));
  const lastUser = kids.filter((el) => el.classList.contains("bubble") && el.classList.contains("user")).at(-1);
  if (lastUser && kids.indexOf(card) < kids.indexOf(lastUser)) c.insertBefore(card, $("#chips"));
}, 150);

// 이미 정한 택시 종류(처음 요청·계획에서): 다시 묻지 않고 출발지·목적지처럼 「~로 할게요」 → 읽을 시간 막대(일시정지·취소 가능) → 반영
const _askCarOne = askCar;
askCar = async function (step) {
  if (!S?.unified || !(S.userSet?.car && CAR_TYPES[S.form.car])) return _askCarOne(step);
  await doPre(step);
  await agentSay(`말씀하신 ${CAR_TYPES[S.form.car].label}로 할게요.`, { gated: true });
  for (let t = 0; t < READ_MS; t += 250) { S.readProg = { t, total: READ_MS }; await sleep(250 * PACE); await gate(); }
  S.readProg = { t: READ_MS, total: READ_MS }; setTimeout(() => { if (S) S.readProg = null; }, 400);
  S.carReadDone = true;
  await doApply(step, S.form.car);
  await dwell();
  return true;
};

// 깜빡임 막기: 카드 안 글이 바뀔 때마다 다시 나타나던 효과(.rc-body.enter, 0.25초 숨었다 나타남)는 쓰지 않고,
// 카드 안 말이 실제로 새 말로 바뀔 때만 한 번 부드럽게 나타남
setInterval(() => {
  if (!S?.unified) return;
  const q = $("#rc-q"), body = $("#run-card .rc-body");
  if (!q || !body) return;
  const t = !q.hidden ? q.textContent.trim() : "";
  if (t && t !== one.lastQ) {
    one.lastQ = t;
    body.classList.remove("one-fresh"); void body.offsetWidth; body.classList.add("one-fresh");
  } else if (!t) one.lastQ = one.lastQ || "";
}, 60);

// 읽을 시간 막대가 다 차면 AI가 실제로 앱을 누르는 동안(몇 초) 같은 카드가 멈춰 있는 것처럼 보이지 않게:
// 다 읽은 말은 내리고 「출발지를 설정하는 중…」을 보여 줌. 다음 말이 카드에 들어오면 다시 보통대로
setInterval(() => {
  if (!S?.unified) return;
  const card = $("#run-card"), q = $("#rc-q");
  const t = q && !q.hidden ? q.textContent.trim() : "";
  const p = S.readProg;
  if (p && p.t >= p.total && t && one.staleQ !== t) { one.staleQ = t; one.staleStep = S.stepIdx; }
  if (one.staleQ && t !== one.staleQ) one.staleQ = null;
  const stale = Boolean(card && one.staleQ && t === one.staleQ);
  if (card && card.classList.contains("one-stale") !== stale) { card.classList.toggle("one-stale", stale); oneDoingSync(); }
}, 80);

// =====================================================================
// 최종 확인 카드: 호출 대수·결제 행은 빼고 글씨 크게. 각 행을 눌러(›) 바로 수정 ([수정]을 누르지 않아도)
// - 쿠폰: 누르면 바로 적용/해제 · 출발·도착·택시 종류: 「어떻게 바꿀까요?」 선택지
// =====================================================================
// 행을 눌러 바꾼 값(쿠폰 등)이 카드에 바로 보이게: 값이 달라지면 카드 내용을 다시 그림
setInterval(() => {
  const d = document.querySelector(".one-final");
  if (!d || !S?.unified) return;
  const n = finalCard();
  if (n.innerHTML !== d.innerHTML) d.innerHTML = n.innerHTML;
}, 300);
function finalCard() {
  const f = S.form;
  const rows = [
    ["edit_origin", "출발", ORIGINS[f.origin]?.name || originLabel(f.origin, S.geo)],
    ["edit_dest", "도착", PLACES[f.dest || TARGET_PLACE].name],
    ["edit_car", "택시 종류", CAR_TYPES[f.car].label],
    ["coupon", "쿠폰", f.coupon ? COUPON.name : "적용 안 함"],
    ["", "예상 요금", won0(fareOf(f))],
  ];
  const d = document.createElement("div");
  d.className = "rc-pv rc-summary one-final";
  const TAP = ["edit_origin", "edit_dest", "edit_car", "coupon"];
  d.innerHTML = rows.map(([k0, label, v]) => { const k = TAP.includes(k0) ? k0 : ""; return `<div ${k ? `data-edit="${k}" role="button" tabindex="0"` : ""}><span>${esc(label)}</span><b>${esc(v)}${k ? '<span class="ms">chevron_right</span>' : ""}</b></div>`; }).join("");
  d.onclick = (e) => {
    const row = e.target.closest("[data-edit]");
    const w = S?.waiter;
    if (!row || !w?.resolve) return;
    const k = row.dataset.edit;
    logEvent("final_row_edit", { item: k });
    if (k === "coupon") return w.resolve({ type: "button", id: "set_coupon", out: { intent: "set_coupon", coupon: !S.form.coupon } });
    finalRowEdit(k);
  };
  return d;
}
const _gAskFinal = gAsk;
gAsk = function (key, vars, options, opts) {
  if (key === "final.edit" && S?.finalJump) { const id = S.finalJump; S.finalJump = null; return Promise.resolve({ id, via: "row" }); }
  return _gAskFinal(key, vars, options, opts);
};

// 행을 누르면: [수정] → 그 항목(「출발지 바꾸기」 등)을 차례로 눌러 「어떻게 바꿀까요?」 선택지까지 바로
async function finalRowEdit(k) {
  const label = { edit_origin: "출발지 바꾸기", edit_dest: "목적지 바꾸기", edit_car: "택시 종류 바꾸기" }[k];
  const chip = (re) => [...document.querySelectorAll("#rc-choices .chip:not([disabled]), #rc-choices .choice, #rc-choices button")].find((x) => x.offsetParent && re.test(x.textContent.trim()));
  const waitChip = async (re) => { for (let t = 0; t < 40; t++) { const c = chip(re); if (c) return c; await sleep(100); } return null; };
  const edit = await waitChip(/^수정/);
  if (!edit) return;
  edit.click();
  const item = await waitChip(new RegExp(label));
  item?.click();
}
// 최종 확인에서 「목적지 바꾸기」도 고를 수 있는 지점 3곳 + 직접 입력
const _rejectPicksOne = rejectPicks;
rejectPicks = function () {
  const r = _rejectPicksOne();
  if (!r || S?.steps?.[S.stepIdx]?.id !== "final") return r;
  const d = r.find((x) => x.label === "목적지 바꾸기");
  if (d) d.sub = [...SEARCH_ORDER.map((k) => ({ label: PLACES[k].name, out: { intent: "set_dest", place: k } })), DIRECT];
  return r;
};

// 입력칸 ✕: 듣는 중이든 다 받아 적은 뒤든, 누르면 듣기를 끝내고 적힌 말을 모두 지움
document.addEventListener("click", (e) => {
  if (!e.target.closest?.("#voice-btn .vcancel")) return;
  e.stopPropagation(); e.preventDefault();
  window.stopMic?.(false);
  const m = $("#msg"); m.value = ""; m.dispatchEvent(new Event("input"));
  if (S) logEvent("voice_clear");
}, true);

// 고른 택시를 막대 전에 이미 말했으면 반영 뒤 같은 말을 다시 하지 않음
const _sayKeyOne = sayKey;
sayKey = async function (key, vars, opts) {
  if (key === "car.set" && S?.carSaidOne) { S.carSaidOne = false; return; }
  // 진행 중에 말로 바꾼 경우(「출발지를 ‘…’로 설정했어요」 등): 해석하느라 잠깐 멈춘 상태라 숨겨진 줄로 가던 것을 대화에 바로 보여 줌
  if (S?.unified && /^change\./.test(key) && S.running && !S.finished) return _sayKeyOne(key, vars, { ...(opts || {}), talk: true });
  return _sayKeyOne(key, vars, opts);
};

// 「무엇을 수정할까요?」에서 항목을 고른 뒤 이어지는 질문(「출발지를 어디로 바꿀까요?」 등): 진행 카드가 내 답 위에 남아 한 화면 묶음에서 빠지던 것을, 내 답 아래로 옮겨 보이게
const _renderPicksOne = renderPicks;
renderPicks = function (list, waiter, question) {
  const r = _renderPicksOne(list, waiter, question);
  const c = chat(), card = $("#run-card");
  const lastUser = [...c.querySelectorAll(":scope > .bubble.user")].at(-1);
  if (S?.unified && card && lastUser && (card.compareDocumentPosition(lastUser) & Node.DOCUMENT_POSITION_FOLLOWING)) c.insertBefore(card, $("#chips"));
  return r;
};

// 결제 비밀번호 카드: 제목·마음택시 줄은 빼고 카드 모양 아이콘 + 「마음카드 ****1234」 하나, 설명은 짧게
const _renderPinCardOne = renderPinCard;
renderPinCard = function () {
  _renderPinCardOne();
  if (!S?.unified) return;
  const card = chipsBox().querySelector(".pw-open");
  const head = card?.querySelector(".pw-head");
  if (head) head.innerHTML = '<span class="one-paycard" aria-hidden="true"><i></i></span><span><b>마음카드 ****1234</b></span>';
  card?.querySelector(".pw-note")?.remove(); // 설명은 AI 메시지에 담음
  // 버튼: 최종 확인의 [수정][이대로 호출]처럼 카드 아래 한 줄 [취소][화면 열기] (화면 열기 아이콘은 그대로)
  const go = card?.querySelector(".pw-go"), cancel = card?.querySelector(".pw-cancel");
  if (go && cancel) {
    const row = document.createElement("div");
    row.className = "one-pw-btns";
    row.append(cancel, go);
    card.after(row);
  }
};

// 결제 비밀번호 안내: 비밀번호가 AI에게 가지 않는다는 설명을 AI 말에 담음 (카드 안 설명 줄은 뺐음)
const PW_MSG = "결제를 위해 비밀번호 입력이 필요해요. 비밀번호는 AI에게 전달되지 않으니, ‘마음택시’ 앱을 열어 직접 입력해주세요.";
const _linesPw = lines;
lines = function (key, s, vars) {
  if (key === "password" && (s || S)?.unified) return [PW_MSG];
  return _linesPw(key, s, vars);
};

// =====================================================================
// 판단 근거: AI 프로필 줄 오른쪽 끝(작업 카드 오른쪽 위)에 작은 회색 물음표.
// 누르면 카드 안에 근거가 펼쳐지고, 읽는 동안은 진행을 잠시 멈춤(「계속하기」로 이어서). 다시 누르면 닫히고 이어서 진행
// =====================================================================
const josaEulReul = (w) => { const c = (w || "").trim().slice(-1).charCodeAt(0) - 0xac00; return c >= 0 && c <= 11171 && c % 28 ? "을" : "를"; };
const _reasonOfOne = reasonOf;
reasonOf = function (id) {
  const r = _reasonOfOne(id);
  return r ? r.replace(/‘([^’]+)’을 검색/, (m, w) => `‘${w}’${josaEulReul(w)} 검색`) : r;
};
function oneWhy() {
  if (!S?.unified) return;
  const card = $("#run-card"), q = $("#rc-q");
  const t = q && !q.hidden ? q.textContent.trim() : "";
  const why = t && S.reasons?.[t] && card?.classList.contains("one-cur") && !card.classList.contains("one-stale") && !S.finished ? S.reasons[t] : null;
  let btn = $("#one-why");
  const host = card?.querySelector(".rc-body") || card; // 카드 본문 기준으로 위치 (프로필 줄 오른쪽 끝)
  if (!btn && host) {
    btn = document.createElement("button");
    btn.type = "button"; btn.id = "one-why"; btn.className = "one-why"; btn.setAttribute("aria-label", "왜 이렇게 정했나요?");
    btn.innerHTML = '<span class="ms">help</span>';
    btn.onclick = () => oneWhyToggle();
    host.appendChild(btn);
  }
  if (btn) { if (host && btn.parentNode !== host) host.appendChild(btn); btn.hidden = !why; }
  let box = $("#one-why-box");
  if (!why || one.whyFor !== t) {
    if (box) box.remove();
    if (one.whyFor && one.whyPaused && one.userPaused) onePause(false);
    one.whyFor = null; one.whyPaused = false;
    btn?.classList.remove("on");
    return;
  }
  const body = card.querySelector(".rc-body") || card;
  if (!box) {
    box = document.createElement("div");
    box.id = "one-why-box"; box.className = "one-why-box";
    const [lead, list] = why.split(/\s*검색 결과:\s*/);
    box.innerHTML = `<p>${esc(lead)}</p>` + (list ? `<ol>${list.split(/,\s*/).map((x, i) => `<li${i === 0 ? ' class="on"' : ""}>${esc(x)}</li>`).join("")}</ol>` : "");
  }
  const ctrl = body.querySelector(":scope > .one-ctrl");
  if (box.parentNode !== body || (ctrl && box.nextElementSibling !== ctrl)) ctrl ? body.insertBefore(box, ctrl) : body.appendChild(box);
}
function oneWhyToggle() {
  const q = $("#rc-q"), t = q?.textContent.trim();
  if (!t || !S?.reasons?.[t]) return;
  const open = one.whyFor !== t;
  if (open) {
    one.whyFor = t;
    $("#one-why")?.classList.add("on");
    logEvent("one_why_open", { text: t });
    if (S.running && !S.paused) { onePause(true); one.whyPaused = true; } // 근거를 읽는 동안 잠시 멈춤
  } else {
    logEvent("one_why_close");
    $("#one-why-box")?.remove();
    $("#one-why")?.classList.remove("on");
    one.whyFor = null;
    if (one.whyPaused && one.userPaused) onePause(false);
    one.whyPaused = false;
  }
  oneWhy();
}
setInterval(oneWhy, 150);


// [실행화면 AI 패널] 대화창과 같은 입력창을 패널 맨 아래에 (실행화면을 보는 동안만 옮겨 두고, 대화창으로 오면 제자리로)
// - 패널에 고를 선택지가 있을 때는 입력창을 넣지 않음
(function () {
  const comp = $("#composer");
  if (!comp) return;
  const home = document.createComment("composer-home");
  comp.parentNode.insertBefore(home, comp);
  setInterval(() => {
    const panel = $(".pv-panel");
    const run = S?.unified && document.querySelector(".phone")?.dataset.view === "progress" && panel && !$("#pv-chips")?.querySelector("button");
    if (run && comp.parentNode !== panel) panel.appendChild(comp);
    else if (!run && comp.parentNode !== home.parentNode) home.parentNode.insertBefore(comp, home.nextSibling);
  }, 150);
})();
