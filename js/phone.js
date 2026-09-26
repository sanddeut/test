// 폰 앱 화면 렌더링 (홈 · 문자 · 마음은행)
// 은행 앱은 실제 모바일 뱅킹 앱의 레이아웃(홈 계좌 카드 → 이체 대상 → 금액 키패드 → 통장표기)을 따르되,
// 브랜드·로고는 가상의 "마음은행"으로 둡니다.
"use strict";

const BANK_NAME = "마음은행";
// 진행 속도 배율 (설정 화면의 「진행 속도」, 클수록 느림)
let PACE = 1; // 전체 배율 (각 동작 시간은 아래에서 따로 정함)
// 구글 Material Symbols 아이콘
const mi = (name, cls = "") => `<span class="ms ${cls}">${name}</span>`;
const won0 = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;

// 화면이 바뀔 때 실제 앱처럼 로딩을 잠깐 보여줌
// - 앱 실행: 스플래시 화면
// - 은행 앱 안 화면 이동: 로딩 스피너 (가끔 조금 더 길게 버퍼링)
function screenKey(p) {
  return [p.app, p.app === "bank" ? p.bankView : "", p.sheet || ""].join("|");
}

function startLoading(p) {
  const key = screenKey(p);
  const prev = p.lastKey;
  p.lastKey = key;
  if (!prev || prev === key || S.manual || p.sheet === "pin" || p.sheet === "sending") return;
  let [prevApp] = prev.split("|");
  const family = (a) => (a.startsWith("sms") ? "sms" : a);
  if (family(prevApp) === family(p.app) && prevApp !== p.app) prevApp = "__same";
  let type = null;
  let ms = 0;
  if (prevApp === "__same") {
    type = "spinner"; // 같은 앱 안에서 화면 이동 (문자 목록 → 문자 보기)
    ms = 900;
  } else if (p.app !== prevApp && p.app !== "home") {
    type = p.app === "bank" ? "splash-bank" : "splash-app";
    ms = p.app === "bank" ? 2200 : 1400; // 앱 스플래시
  } else if (!p.sheet && p.app === "bank") {
    type = "spinner";
    ms = Math.random() < 0.35 ? 2000 + Math.random() * 600 : 900 + Math.random() * 400; // 화면 이동 로딩, 때때로 더 길게 버퍼링
  } else if (p.app !== prevApp || p.app === "sms_detail") {
    type = "spinner";
    ms = 900;
  }
  ms *= PACE;
  if (!type) return;
  // 앱 실행 중에는 진행 문구를 "…을 실행 중입니다..."로 바꿈
  if (type === "splash-bank") setStatus?.("은행 앱을 실행 중입니다...");
  if (type === "splash-app" && p.app.startsWith("sms")) setStatus?.("문자 앱을 실행 중입니다...");
  p.loading = type;
  p.loadingUntil = Date.now() + ms;
  clearTimeout(p.loadingTimer);
  p.loadingTimer = setTimeout(() => { p.loading = null; renderPhone(); }, ms);
}

function loadingOverlay(p) {
  if (!p.loading || Date.now() >= p.loadingUntil) return "";
  if (p.loading === "splash-bank") {
    return `<div class="ld splash-bank"><span class="bk-logo big"><i></i></span><b>${BANK_NAME}</b><div class="ld-bar"><i></i></div></div>`;
  }
  if (p.loading === "splash-app") return `<div class="ld splash-app"><div class="spinner"></div></div>`;
  return `<div class="ld veil"><div class="ld-top"><i></i></div><div class="spinner"></div></div>`;
}

function renderPhone() {
  if (!S) return;
  const p = S.phone;
  startLoading(p);
  let body = "";
  if (p.app === "home") body = homeScreen();
  else if (p.app === "sms_list") body = smsListScreen();
  else if (p.app === "sms_detail") body = smsDetailScreen();
  else if (p.app === "bank") body = bankScreen();
  $("#screen").innerHTML = `${body}${p.toast ? `<div class="toast">${esc(p.toast)}</div>` : ""}${loadingOverlay(p)}`;
  bindPhone();
  if (typeof syncView === "function") syncView();
}

function bindPhone() {
  const sc = $("#screen");
  sc.querySelectorAll("[data-pin]").forEach((b) => (b.onclick = () => pinPress(b.dataset.pin)));
  sc.querySelectorAll("[data-popup-close]").forEach((b) => (b.onclick = () => S.popupResolve && S.popupResolve()));
  sc.querySelectorAll("[data-key]").forEach((b) => (b.onclick = () => manualKey(b.dataset.key)));
  sc.querySelectorAll("[data-src-toggle]").forEach((b) => (b.onclick = () => manualToggleSource()));
  const memo = sc.querySelector("#m-memo");
  if (memo) memo.oninput = () => (S.manualMemo = memo.value);
}

// ---------------- 홈 화면 ----------------
function homeScreen() {
  const apps = [
    ["메시지", "chat", "#1a73e8"], [BANK_NAME, "account_balance", "#2f7cf6"], ["전화", "call", "#34a853"], ["카메라", "photo_camera", "#5f6368"],
    ["캘린더", "calendar_month", "#f29900"], ["갤러리", "photo_library", "#a142f4"], ["설정", "settings", "#5f6368"], ["지도", "map", "#0f9d58"],
  ];
  return `<div class="home"><div class="home-clock">9:41<small>9월 24일 목요일</small></div><div class="home-grid">${apps
    .map(([n, i, c]) => `<div class="app-icon"><div class="ai" style="background:${c}">${mi(i)}</div><span>${n}</span></div>`)
    .join("")}</div></div>`;
}

// ---------------- 문자 ----------------
function smsListScreen() {
  const rows = [
    ["김영숙", "안녕하세요, 30기 총무 김영숙이에요. 올해 동창회 회비…", "오전 9:12", true],
    ["우리딸", "엄마 주말에 갈게요~", "어제"],
    ["택배알림", "[배송완료] 고객님의 상품이 문 앞에 배송되었습니다.", "어제"],
    [BANK_NAME, `[${BANK_NAME}] 9월 카드 결제 예정 금액 안내`, "9월 20일"],
    ["건강보험공단", "건강검진 대상자 안내", "9월 18일"],
  ];
  return `<div class="sms"><div class="sms-title">메시지</div><div class="sms-list">${rows
    .map(([n, t, d, unread]) => `<div class="sms-row ${unread ? "unread" : ""}"><div class="avatar">${esc(n[0])}</div><div class="sms-main"><b>${esc(n)}</b><p>${esc(t)}</p></div><time>${d}</time></div>`)
    .join("")}</div></div>`;
}

function smsDetailScreen() {
  const text = esc(SMS_TEXT()).replace(
    "농협 302-1234-5678",
    `<mark class="${S.phone.smsHighlight ? "on" : ""}">농협 302-1234-5678</mark>`,
  );
  return `<div class="sms"><div class="sms-bar">${mi("arrow_back", "back")}<b>김영숙</b></div>
    <div class="sms-thread"><div class="sms-date">오늘 오전 9:12</div><div class="sms-bubble">${text.replace(/\n/g, "<br>")}</div></div></div>`;
}

// ---------------- 마음은행 ----------------
const bankLogo = (cls = "") => `<span class="bk-logo ${cls}"><i></i></span>`;
const nhLogo = () => `<span class="bk-logo nh"><i></i></span>`;

function bankScreen() {
  const p = S.phone;
  let view = "";
  const v = S.manual && ["amount", "detail"].includes(p.bankView) ? "amount" : p.bankView;
  if (v === "home") view = bankHome();
  else if (v === "to") view = bankTo();
  else if (v === "acct_input") view = bankAcctInput();
  else if (v === "amount") view = bankAmount();
  else if (v === "detail") view = bankDetail();
  else if (v === "complete") view = bankComplete();
  return `<div class="bank">${view}${bankOverlay()}</div>`;
}

function bankHome() {
  const p = S.phone;
  const cards = Object.entries(ACCOUNTS).map(([k, a], i) => {
    const hl = p.focus === "source" ? "hl" : p.tapped === k ? "tapped" : "";
    return `<div class="bk-card ${hl}" data-acct="${k}">
      ${bankLogo()}<div class="bk-card-main"><b>${a.label}</b><small>마음 ${a.number} ${mi("content_copy", "copy")}</small><strong>${won0(a.balance)}</strong></div>
      ${mi("more_vert", "kebab")}<span class="bk-send ${p.tapped === k ? "on" : ""}">이체</span>
    </div>`;
  }).join("");
  return `<div class="bk-home">
    <div class="bk-top"><div class="seg-toggle"><span class="on">일반홈</span><span>쉬운</span></div>
      <div class="bk-icons"><span class="ai-badge">AI</span>${mi("notifications")}${mi("menu")}</div></div>
    <div class="bk-hero">
      <div class="bk-notice"><span class="bell">${mi("notifications_active")}</span><div>가을맞이 정기적금<br>우대금리 미리 확인해보세요</div>${mi("close", "x")}</div>
      <div class="moon"></div>
      <div class="bk-hero-row"><span class="pill">${mi("settings")} 홈계좌설정</span><span class="pill">잔액숨김 <i class="tgl"></i></span></div>
    </div>
    <div class="bk-cards">${cards}</div>
    <div class="bk-tabbar"><span>${mi("shopping_bag")}상품</span><span>${mi("donut_small")}자산·소비</span><span class="on">${mi("home", "fill")}홈</span><span>${mi("sync_alt")}이체</span><span>${mi("redeem")}혜택</span></div>
  </div>`;
}

// 이체 대상: 추천(최근입금계좌) / 자주 / 내계좌 탭
const TO_ROWS = {
  recent: [
    { name: "김철수", date: "2026.09.20", bank: "마음 120-555-102938", logo: "bank", star: false },
    { name: "관리사무소", date: "2026.09.01", bank: "농협 301-0045-1128", logo: "nh", star: false },
    { name: "우리딸 이지은", date: "2026.08.28", bank: "마음 110-234-567890", logo: "bank", star: true },
    { name: "건강보험공단", date: "2026.08.25", bank: "기업 048-000-112233", logo: "bank", star: false },
  ],
  fav: [
    { name: "동창회 총무 김영숙", date: "2025.09.26", bank: "농협 302-1234-5678", logo: "nh", star: true, target: true },
    { name: "우리딸 이지은", date: "2026.08.28", bank: "마음 110-234-567890", logo: "bank", star: true },
  ],
};

function bankTo() {
  const p = S.phone;
  const tab = p.toTab || "recent";
  const list = TO_ROWS[tab]
    .map((r) => `<div class="to-row ${r.target ? "target" : ""} ${r.target && p.focus === "recipient" ? "hl" : ""} ${r.target && S.form.recipient ? "tapped" : ""}">${r.logo === "nh" ? nhLogo() : bankLogo()}
      <div class="to-main"><b>${r.name}</b><span class="sep">|</span><small>${r.date}</small><p>${r.bank}</p></div>${mi("star", `star ${r.star ? "on fill" : ""}`)}</div>`)
    .join("");
  return `<div class="bk-page">
    <div class="bk-nav">${mi("arrow_back_ios", "back")}</div>
    <h2 class="bk-h">어디로 이체하시겠어요?</h2>
    <div class="acct-field"><span class="ph">계좌번호 입력</span>${mi("photo_camera")}</div>
    <div class="seg3"><span data-tab="recent" class="${tab === "recent" ? "on" : ""}">추천</span><span data-tab="fav" class="${tab === "fav" ? "on" : ""}">자주</span><span data-tab="mine">내계좌</span></div>
    <div class="to-head"><b>${tab === "fav" ? "자주 쓰는 계좌" : "최근입금계좌"}</b><small>편집</small></div>
    ${list}
    <div class="to-more">더보기 ${mi("expand_more")}</div>
    <div class="to-contact"><span class="plus">${mi("add")}</span>연락처로 이체하기</div>
  </div>`;
}

function bankAcctInput() {
  const p = S.phone;
  const typed = p.acctTyped || "";
  return `<div class="bk-page">
    <div class="bk-nav right">${mi("close", "close")}</div>
    <h2 class="bk-h sm">계좌번호를 입력해 주세요</h2>
    <div class="line-input ${typed ? "filled" : "focus"}">${typed ? esc(typed) : '<span class="ph">입력</span>'}<i class="caret"></i>${p.pasteTip ? '<span class="paste-tip">붙여넣기</span>' : ""}</div>
    <div class="line-select">${p.bankPicked ? esc(p.bankPicked) : '<span class="ph">은행/증권사 선택</span>'}${mi("expand_more")}</div>
    <div class="spacer"></div>
    <div class="bk-btn ${typed && p.bankPicked ? "" : "off"}">확인</div>
  </div>`;
}

function transferHead() {
  const f = S.form;
  const a = ACCOUNTS[f.source];
  const custom = f.recipientCustom;
  return `<div class="bk-nav between">${mi("arrow_back_ios", "back")}<span class="cancel">취소</span></div>
    <div class="tr-line" ${S.manual ? "data-src-toggle" : ""}>${bankLogo("sm")}<b>${BANK_NAME} 계좌에서</b>${mi("expand_more", "chev")}</div>
    <small class="tr-sub">${a.label} ${a.number}</small>
    <div class="tr-line">${custom ? bankLogo("sm") : nhLogo()}<b>${custom ? "입력하신" : "김영숙"} 님 계좌로</b>${mi("expand_more", "chev")}</div>
    <small class="tr-sub">${custom ? esc(custom) : "농협 302-1234-5678"}</small>`;
}

function amountLine(amt) {
  const a = ACCOUNTS[S.form.source];
  if (!amt) {
    return `<div class="amt-q">얼마를 이체하시겠어요?</div><small class="tr-sub">출금가능금액 ${a.balance.toLocaleString("ko-KR")} 원</small>`;
  }
  return `<div class="amt-big">${Number(amt).toLocaleString("ko-KR")}<span>원</span></div>
    <small class="tr-sub"><b>${won(amt)}</b> <span class="sep">|</span> 출금가능금액 ${a.balance.toLocaleString("ko-KR")} 원</small>`;
}

function bankAmount() {
  const p = S.phone;
  // 에이전트가 키패드로 입력 중인 금액(typedAmount) 또는 직접 조작 중인 금액
  const amt = S.manual ? Number(S.manualAmount || 0) : Number(p.typedAmount || 0);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"];
  const live = S.manual ? "live" : "";
  const memoRow = S.manual && S.complexity === "B"
    ? `<div class="memo-edit"><label>받는 분 통장표기</label><input id="m-memo" value="${esc(S.manualMemo ?? S.form.memo ?? "")}" placeholder="${esc(S.cfg.name)}"></div>`
    : "";
  return `<div class="bk-page tr">
    ${transferHead()}
    <div class="amt-area">${amountLine(amt)}</div>
    ${memoRow}
    <div class="quick ${live}">${["+1만", "+5만", "+10만", "+100만", "전액"].map((q) => `<span ${S.manual ? `data-key="${q}"` : ""}>${q}</span>`).join("")}</div>
    <div class="keypad-bk ${live}">${keys.map((k) => `<span data-k="${k}" ${S.manual ? `data-key="${k}"` : ""}>${k === "back" ? mi("backspace") : k}</span>`).join("")}</div>
    <div class="bk-btn ${amt ? "" : "off"}">확인</div>
  </div>`;
}

function bankDetail() {
  const f = S.form;
  const p = S.phone;
  const memoShown = p.memoTyping != null ? `${esc(p.memoTyping)}<i class="caret"></i>` : `${esc(f.memo || S.cfg.name)} ${mi("chevron_right")}`;
  return `<div class="bk-page tr">
    ${transferHead()}
    <div class="amt-area">${amountLine(f.amount)}</div>
    <div class="spacer"></div>
    <div class="dt-row memo ${p.focus === "memo" ? "hl" : ""} ${p.memoTyping != null ? "editing" : ""}"><span>받는 분 통장표기</span><b>${memoShown}</b></div>
    <div class="dt-row"><span>내 통장표기</span><b>${f.recipientCustom ? "입력하신 계좌" : "김영숙"} ${mi("chevron_right")}</b></div>
    <div class="dt-more">더보기 ${mi("expand_more")}</div>
    <div class="dt-note">이체 유의사항 및 안내</div>
    <div class="bk-btn2"><span>추가이체</span><span class="primary">다음</span></div>
  </div>`;
}

function bankComplete() {
  const f = S.form;
  return `<div class="bk-page done">
    <div class="done-check">${mi("check")}</div>
    <h2 class="bk-h center">${f.recipientCustom ? "입력하신 계좌로" : "김영숙님께"}<br>${won0(f.amount)}을 이체했어요</h2>
    <div class="done-box">
      <div><span>출금 계좌</span><b>${ACCOUNTS[f.source].label}</b></div>
      <div><span>받는 분</span><b>${f.recipientCustom ? esc(f.recipientCustom) : "농협 302-1234-5678"}</b></div>
      ${S.complexity === "B" ? `<div><span>받는 분 통장표기</span><b>${esc(f.memo || S.cfg.name)}</b></div>` : ""}
    </div>
    <div class="bk-btn">확인</div>
  </div>`;
}

function bankOverlay() {
  const p = S.phone;
  const f = S.form;
  // 시트·팝업이 처음 나타날 때만 등장 애니메이션 (키패드 입력 등 다시 그릴 때는 그대로)
  const cur = `${p.popup ? "popup" : ""}|${p.sheet === "pin" && !S.pinOpen ? "" : p.sheet || ""}`;
  const enter = cur !== p.overlayShown ? "enter" : "";
  p.overlayShown = cur;
  if (p.popup) {
    const live = p.popupClosable;
    return `<div class="dim center ${enter}"><div class="evt">
      <div class="evt-art">${mi("redeem", "fill")}</div><b>가을맞이 정기적금 이벤트</b><p>지금 가입하면 최대 연 4.5% 우대금리!</p>
      <div class="evt-btns ${live ? "live" : ""}"><span ${live ? "data-popup-close" : ""}>오늘 하루 보지 않기</span><span class="evt-close" ${live ? "data-popup-close" : ""}>닫기</span></div></div></div>`;
  }
  if (p.sheet === "confirm") {
    return `<div class="dim ${enter}"><div class="sheet ${enter}">
      <h3>${f.recipientCustom ? "입력하신 계좌로" : "김영숙님께"}<br><em>${won0(f.amount)}</em>을 이체할까요?</h3>
      <div class="kv"><span>출금 계좌</span><b>${ACCOUNTS[f.source].label}</b></div>
      <div class="kv"><span>받는 계좌</span><b>${f.recipientCustom ? esc(f.recipientCustom) : "농협 302-1234-5678"}</b></div>
      ${S.complexity === "B" ? `<div class="kv"><span>받는 분 통장표기</span><b>${esc(f.memo || S.cfg.name)}</b></div>` : ""}
      <div class="bk-btn2"><span>취소</span><span class="primary">이체</span></div></div></div>`;
  }
  if (p.sheet === "pin" && S.pinOpen) {
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
    return `<div class="dim ${enter}"><div class="sheet pin ${enter}"><h3>계좌 비밀번호</h3><p class="muted">비밀번호 4자리를 입력해주세요</p>
      <div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i < p.pin.length ? "on" : ""}"></i>`).join("")}</div>
      <div class="keypad">${keys.map((k) => (k ? `<button type="button" data-pin="${k}">${k === "del" ? mi("backspace") : k}</button>` : "<span></span>")).join("")}</div></div></div>`;
  }
  if (p.sheet === "sending") {
    return `<div class="dim"><div class="sheet"><div class="spinner"></div><p style="text-align:center">이체 중이에요…</p></div></div>`;
  }
  return "";
}

// ---------------- 직접 작업(직접조작) 입력 ----------------
function manualKey(k) {
  if (!S?.manual) return;
  let v = S.manualAmount || "";
  const bal = ACCOUNTS[S.form.source].balance;
  const add = { "+1만": 10000, "+5만": 50000, "+10만": 100000, "+100만": 1000000 };
  if (k === "back") v = v.slice(0, -1);
  else if (k === "전액") v = String(bal);
  else if (add[k]) v = String(Number(v || 0) + add[k]);
  else if (v.length < 9) v = (v + k).replace(/^0+/, "");
  S.manualAmount = v;
  renderPhone();
}

function manualToggleSource() {
  if (!S?.manual) return;
  S.form.source = S.form.source === "main" ? "savings" : "main";
  renderPhone();
}

// =====================================================================
// 에이전트 조작 연출 (축소 화면에서 실제로 누르고 입력하는 것처럼)
// =====================================================================
// 연출 중 대기. 중지·직접 조작으로 멈추면 재개될 때까지 기다림 (중지 대화 안에서의 재입력은 예외)
let actNoGate = 0;
const actSleep = async (ms) => { await sleep(ms * PACE); if (!actNoGate && typeof gate === "function") await gate(); };

function setActing(on) {
  const ph = $(".phone");
  if (ph) ph.classList.toggle("acting", on);
}

// 화면 속 요소를 누르는 표시 (터치 원)
async function waitLoading() {
  while (S.phone.loading && Date.now() < S.phone.loadingUntil) await sleep(80);
  await sleep(250 * PACE);
}

// 누르기 한 번 ≈ 1.2초 (누를 곳 찾기 → 누름 → 반응). 키패드처럼 연달아 누를 때는 quick
async function tap(sel, { pre = 450, hold = 350, after = 450, quick = false } = {}) {
  if (!quick) await waitLoading(); // 화면 로딩이 끝난 뒤에 누름
  if (pre) await actSleep(pre);
  const el = $("#screen").querySelector(sel);
  const layer = $("#touch-layer");
  if (el && layer && $(".phone").dataset.view === "progress") {
    const r = el.getBoundingClientRect();
    const c = $(".screen-clip").getBoundingClientRect();
    const dot = document.createElement("i");
    dot.className = "touch";
    dot.style.left = `${r.left + r.width / 2 - c.left}px`;
    dot.style.top = `${r.top + r.height / 2 - c.top}px`;
    layer.appendChild(dot);
    el.classList.add("pressed");
    setTimeout(() => dot.remove(), 900);
  }
  await actSleep(hold);
  if (el) el.classList.remove("pressed");
  await actSleep(after);
}

// 금액 입력: 금액 칸을 한 번 누르고 금액이 한 번에 입력됨 (수정할 때도 한 번에 바뀜)
async function typeAmount(amount) {
  const p = S.phone;
  await waitLoading();
  await actSleep(400);
  await tap(".amt-area", { pre: 300 });
  if (S.form.amount != null && S.form.amount !== Number(amount)) return; // 도중에 참가자가 금액을 바꾼 경우
  p.typedAmount = String(amount);
  renderPhone();
  await actSleep(900);
}

// 글자 하나씩 입력
async function typeText(set, text, ms = 170) {
  await waitLoading();
  for (let i = 1; i <= text.length; i++) {
    set(text.slice(0, i));
    renderPhone();
    await actSleep(ms);
  }
}

// 이미 금액 입력을 지난 뒤 금액이 바뀌면 금액 화면으로 돌아가 다시 입력
async function retypeAmount(amount) {
  const p = S.phone;
  if (p.app !== "bank" || !["amount", "detail"].includes(p.bankView) || p.typedAmount == null) return;
  const sheet = p.sheet;
  actNoGate++;
  setActing(true);
  if (sheet) { p.sheet = null; renderPhone(); await actSleep(400); }
  if (p.bankView === "detail") { await tap(".tr-sub b"); p.bankView = "amount"; renderPhone(); await actSleep(500); }
  await typeAmount(amount);
  await tap(".bk-btn");
  p.bankView = "detail";
  renderPhone();
  await actSleep(500);
  if (sheet) { await tap(".bk-btn2 .primary"); p.sheet = sheet; renderPhone(); await actSleep(400); }
  setActing(false);
  actNoGate--;
}
