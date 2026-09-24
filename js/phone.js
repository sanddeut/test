// 폰 앱 화면 렌더링 (홈 · 문자 · 마음은행)
// 은행 앱은 실제 모바일 뱅킹 앱의 레이아웃(홈 계좌 카드 → 이체 대상 → 금액 키패드 → 통장표기)을 따르되,
// 브랜드·로고는 가상의 "마음은행"으로 둡니다.
"use strict";

const BANK_NAME = "마음은행";
const won0 = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;

function renderPhone() {
  if (!S) return;
  const p = S.phone;
  let body = "";
  if (p.app === "home") body = homeScreen();
  else if (p.app === "sms_list") body = smsListScreen();
  else if (p.app === "sms_detail") body = smsDetailScreen();
  else if (p.app === "bank") body = bankScreen();
  $("#screen").innerHTML = `${body}${p.toast ? `<div class="toast">${esc(p.toast)}</div>` : ""}`;
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
    ["메시지", "💬", "#1a73e8"], [BANK_NAME, "₩", "#2f7cf6"], ["전화", "📞", "#34a853"], ["카메라", "📷", "#5f6368"],
    ["캘린더", "📅", "#f29900"], ["갤러리", "🌄", "#a142f4"], ["설정", "⚙️", "#5f6368"], ["지도", "🗺️", "#0f9d58"],
  ];
  return `<div class="home"><div class="home-clock">9:41<small>9월 24일 목요일</small></div><div class="home-grid">${apps
    .map(([n, i, c]) => `<div class="app-icon"><div class="ai" style="background:${c}">${i}</div><span>${n}</span></div>`)
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
  return `<div class="sms"><div class="sms-bar"><span class="back">‹</span><b>김영숙</b></div>
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
    return `<div class="bk-card ${hl}">
      ${bankLogo()}<div class="bk-card-main"><b>${a.label}</b><small>마음 ${a.number} <span class="copy">⧉</span></small><strong>${won0(a.balance)}</strong></div>
      <span class="kebab">⋮</span><span class="bk-send ${p.tapped === k ? "on" : ""}">이체</span>
      ${i === 0 ? `<div class="bk-card-promo">↪ 가을맞이 적금 가입하고 우대금리 받아요!</div>` : ""}
    </div>`;
  }).join("");
  return `<div class="bk-home">
    <div class="bk-top"><div class="seg-toggle"><span class="on">일반홈</span><span>쉬운</span></div>
      <div class="bk-icons"><span class="ai-badge">AI</span><span>🔔</span><span>☰</span></div></div>
    <div class="bk-hero">
      <div class="bk-notice"><span class="bell">🔔</span><div>가을맞이 정기적금<br>우대금리 미리 확인해보세요</div><span class="x">×</span></div>
      <div class="moon"></div>
      <div class="bk-hero-row"><span class="pill">⚙ 홈계좌설정</span><span class="pill">잔액숨김 <i class="tgl"></i></span></div>
    </div>
    <div class="bk-cards">${cards}</div>
    <div class="bk-tabbar"><span><i>🛍</i>상품</span><span><i>◔</i>자산·소비</span><span class="on"><i>⌂</i>홈</span><span><i>⇄</i>이체</span><span><i>☺</i>혜택</span></div>
  </div>`;
}

function bankTo() {
  const p = S.phone;
  const A = S.complexity === "A";
  const rows = [
    { name: "동창회 총무 김영숙", date: "2025.09.26", bank: "농협 302-1234-5678", logo: nhLogo(), star: true, target: true },
    { name: "우리딸 이지은", date: "2026.09.15", bank: "마음 110-234-567890", logo: bankLogo(), star: true },
    { name: "관리사무소", date: "2026.09.01", bank: "농협 301-0045-1128", logo: nhLogo(), star: false },
    { name: "김철수", date: "2026.08.20", bank: "마음 120-555-102938", logo: bankLogo(), star: false },
  ];
  const list = rows
    .map((r) => `<div class="to-row ${r.target && p.focus === "recipient" && A ? "hl" : ""} ${r.target && S.form.recipient ? "tapped" : ""}">${r.logo}
      <div class="to-main"><b>${r.name}</b><span class="sep">|</span><small>${r.date}</small><p>${r.bank}</p></div><span class="star ${r.star ? "on" : ""}">★</span></div>`)
    .join("");
  return `<div class="bk-page">
    <div class="bk-nav"><span class="back">‹</span></div>
    <h2 class="bk-h">어디로 이체하시겠어요?</h2>
    <div class="acct-field ${!A && p.focus === "recipient" ? "hl" : ""}"><span class="ph">계좌번호 입력</span><span>📷</span></div>
    <div class="seg3"><span class="${A ? "" : "on"}">추천</span><span class="${A ? "on" : ""}">자주</span><span>내계좌</span></div>
    <div class="to-head"><b>${A ? "자주 쓰는 계좌" : "최근입금계좌"}</b><small>편집</small></div>
    ${list}
    <div class="to-more">더보기 ⌄</div>
    <div class="to-contact"><span class="plus">＋</span>연락처로 이체하기</div>
  </div>`;
}

function bankAcctInput() {
  const filled = S.form.recipient || S.phone.acctPasted;
  const acct = S.form.recipientCustom || "302-1234-5678";
  return `<div class="bk-page">
    <div class="bk-nav right"><span class="close">✕</span></div>
    <h2 class="bk-h sm">계좌번호를 입력해 주세요</h2>
    <div class="line-input ${filled ? "filled" : "focus"}">${filled ? esc(acct) : '<span class="ph">입력</span>'}</div>
    <div class="line-select">${filled && !S.form.recipientCustom ? "농협" : '<span class="ph">은행/증권사 선택</span>'}<span>⌄</span></div>
    ${filled ? '<div class="paste-hint">문자에서 복사한 계좌번호를 붙여넣었어요</div>' : ""}
  </div>`;
}

function transferHead() {
  const f = S.form;
  const a = ACCOUNTS[f.source];
  const custom = f.recipientCustom;
  return `<div class="bk-nav between"><span class="back">‹</span><span class="cancel">취소</span></div>
    <div class="tr-line" ${S.manual ? "data-src-toggle" : ""}>${bankLogo("sm")}<b>${BANK_NAME} 계좌에서</b><span class="chev">⌄</span></div>
    <small class="tr-sub">${a.label} ${a.number}</small>
    <div class="tr-line">${custom ? bankLogo("sm") : nhLogo()}<b>${custom ? "입력하신" : "김영숙"} 님 계좌로</b><span class="chev">⌄</span></div>
    <small class="tr-sub">${custom ? esc(custom) : "농협 302-1234-5678"}</small>`;
}

function amountLine(amt, pending) {
  const a = ACCOUNTS[S.form.source];
  if (amt == null) {
    return `<div class="amt-q">얼마를 이체하시겠어요?</div><small class="tr-sub">출금가능금액 ${a.balance.toLocaleString("ko-KR")} 원</small>`;
  }
  return `<div class="amt-big ${pending ? "pending" : ""}">${Number(amt).toLocaleString("ko-KR")}<span>원</span></div>
    <small class="tr-sub"><b>${won(amt)}</b> <span class="sep">|</span> 출금가능금액 ${a.balance.toLocaleString("ko-KR")} 원</small>`;
}

function bankAmount() {
  const p = S.phone;
  let amt = S.form.amount ?? p.pendingAmount ?? null;
  if (S.manual) amt = S.manualAmount ? Number(S.manualAmount) : null;
  const pending = S.form.amount == null && p.pendingAmount != null;
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"];
  const live = S.manual ? "live" : "";
  const memoRow = S.manual && S.complexity === "B"
    ? `<div class="memo-edit"><label>받는 분 통장표기</label><input id="m-memo" value="${esc(S.manualMemo ?? S.form.memo ?? "")}" placeholder="${esc(S.cfg.name)}"></div>`
    : "";
  return `<div class="bk-page tr ${p.focus === "amount" ? "focus-amt" : ""}">
    ${transferHead()}
    <div class="amt-area">${amountLine(amt, pending)}</div>
    ${memoRow}
    <div class="quick ${live}">${["+1만", "+5만", "+10만", "+100만", "전액"].map((q) => `<span data-key="${S.manual ? q : ""}">${q}</span>`).join("")}</div>
    <div class="keypad-bk ${live}">${keys.map((k) => `<span ${S.manual ? `data-key="${k}"` : ""}>${k === "back" ? "←" : k}</span>`).join("")}</div>
    <div class="bk-btn ${amt ? "" : "off"}">확인</div>
  </div>`;
}

function bankDetail() {
  const f = S.form;
  const p = S.phone;
  return `<div class="bk-page tr">
    ${transferHead()}
    <div class="amt-area">${amountLine(f.amount, false)}</div>
    <div class="spacer"></div>
    <div class="dt-row ${p.focus === "memo" ? "hl" : ""}"><span>받는 분 통장표기</span><b>${esc(f.memo || S.cfg.name)} ›</b></div>
    <div class="dt-row"><span>내 통장표기</span><b>${f.recipientCustom ? "입력하신 계좌" : "김영숙"} ›</b></div>
    <div class="dt-more">더보기 ⌄</div>
    <div class="dt-note">이체 유의사항 및 안내</div>
    <div class="bk-btn2"><span>추가이체</span><span class="primary">다음</span></div>
  </div>`;
}

function bankComplete() {
  const f = S.form;
  return `<div class="bk-page done">
    <div class="done-check">✓</div>
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
  if (p.popup) {
    const live = p.popupClosable;
    return `<div class="dim center"><div class="evt">
      <div class="evt-art">🍂🎁</div><b>가을맞이 정기적금 이벤트</b><p>지금 가입하면 최대 연 4.5% 우대금리!</p>
      <div class="evt-btns ${live ? "live" : ""}"><span ${live ? "data-popup-close" : ""}>오늘 하루 보지 않기</span><span ${live ? "data-popup-close" : ""}>닫기</span></div></div></div>`;
  }
  if (p.sheet === "confirm") {
    return `<div class="dim"><div class="sheet">
      <h3>${f.recipientCustom ? "입력하신 계좌로" : "김영숙님께"}<br><em>${won0(f.amount)}</em>을 이체할까요?</h3>
      <div class="kv"><span>출금 계좌</span><b>${ACCOUNTS[f.source].label}</b></div>
      <div class="kv"><span>받는 계좌</span><b>${f.recipientCustom ? esc(f.recipientCustom) : "농협 302-1234-5678"}</b></div>
      ${S.complexity === "B" ? `<div class="kv"><span>받는 분 통장표기</span><b>${esc(f.memo || S.cfg.name)}</b></div>` : ""}
      <div class="bk-btn2"><span>취소</span><span class="primary">이체</span></div></div></div>`;
  }
  if (p.sheet === "pin" && S.pinOpen) {
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
    return `<div class="dim"><div class="sheet pin"><h3>계좌 비밀번호</h3><p class="muted">비밀번호 4자리를 입력해주세요</p>
      <div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i < p.pin.length ? "on" : ""}"></i>`).join("")}</div>
      <div class="keypad">${keys.map((k) => (k ? `<button type="button" data-pin="${k}">${k === "del" ? "⌫" : k}</button>` : "<span></span>")).join("")}</div></div></div>`;
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
