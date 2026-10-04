// 폰 앱 화면 렌더링 (홈 · 마음택시)
// 택시 앱은 실제 택시 호출 앱의 흐름(지도 홈 → 목적지 검색 → 택시 종류·결제·쿠폰 → 호출 → 배차)을 따르되,
// 브랜드·로고는 가상의 "마음택시"로 둡니다.
"use strict";

// 진행 속도 배율 (설정 화면의 「진행 속도」, 클수록 느림)
let PACE = 1; // 전체 배율 (각 동작 시간은 아래에서 따로 정함)
// 구글 Material Symbols 아이콘
const mi = (name, cls = "") => `<span class="ms ${cls}">${name}</span>`;

// 화면이 바뀔 때 실제 앱처럼 로딩을 잠깐 보여줌
// - 앱 실행: 스플래시 화면
// - 택시 앱 안 화면 이동: 로딩 스피너 (가끔 조금 더 길게 버퍼링)
function screenKey(p) {
  return [p.app, p.app === "taxi" ? p.taxiView : "", p.sheet || ""].join("|");
}

function startLoading(p) {
  const key = screenKey(p);
  const prev = p.lastKey;
  p.lastKey = key;
  if (!prev || prev === key) return;
  const [prevApp, prevView] = prev.split("|");
  let type = null;
  let ms = 0;
  if (p.app !== prevApp && p.app !== "home") {
    type = "splash-taxi";
    ms = 2200; // 앱 스플래시
  } else if (p.app === "taxi" && !p.sheet && prevView !== p.taxiView && ["ride", "calling"].includes(p.taxiView)) {
    type = "spinner";
    ms = Math.random() < 0.35 ? 2000 + Math.random() * 600 : 900 + Math.random() * 400; // 화면 이동 로딩, 때때로 더 길게 버퍼링
  }
  ms *= PACE;
  if (!type) return;
  // 앱 실행 중에는 진행 문구를 "…을 실행 중입니다..."로 바꿈
  const launching = type === "splash-taxi" ? "택시 앱을 실행 중입니다..." : null;
  if (launching) setStatus?.(launching);
  p.loading = type;
  p.loadingUntil = Date.now() + ms;
  clearTimeout(p.loadingTimer);
  p.loadingTimer = setTimeout(() => {
    p.loading = null;
    renderPhone();
    // 실행이 끝났으니 "실행 중입니다..."는 지우고 다음 문구까지 "…" 표시
    const st = document.querySelector("#pv-status");
    if (launching && st && st.textContent === launching) setStatus?.("", true);
  }, ms);
}

function loadingOverlay(p) {
  if (!p.loading || Date.now() >= p.loadingUntil) return "";
  if (p.loading === "splash-taxi") {
    return `<div class="ld splash-taxi"><span class="tx-logo big">${mi("local_taxi", "fill")}</span><b>${TAXI_APP}</b><div class="ld-bar"><i></i></div></div>`;
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
  else if (p.app === "taxi") body = taxiScreen();
  if (p.toast && p.toastShown !== p.toast) {
    // 알림(토스트)은 2초 뒤 사라짐
    p.toastShown = p.toast;
    clearTimeout(p.toastTimer);
    p.toastTimer = setTimeout(() => { p.toast = null; p.toastShown = null; renderPhone(); }, 2000);
  }
  $("#screen").innerHTML = `${body}${p.toast ? `<div class="toast">${esc(p.toast)}</div>` : ""}${loadingOverlay(p)}`;
  mountMap();
  bindPhone();
  if (typeof syncView === "function") syncView();
}

function bindPhone() {
  const sc = $("#screen");
  const on = (attr, fn) => sc.querySelectorAll(`[${attr}]`).forEach((b) => (b.onclick = () => fn(b.getAttribute(attr))));
  on("data-man-app", () => manualOpenApp());
  on("data-man-search", () => manualSearch());
  on("data-man-from", () => manualOriginSearch());
  on("data-man-origin", (k) => manualOrigin(k));
  on("data-man-place", (k) => manualPlace(k));
  on("data-man-car", (k) => manualCar(k));
  on("data-man-pay", () => manualPaySheet());
  on("data-man-payopt", (k) => manualPay(k));
  on("data-man-coupon", () => manualCoupon());
  on("data-man-close", () => manualCloseSheet());
  on("data-done-confirm", () => confirmDone());
  on("data-pin", (k) => pinPress(k));
  on("data-man-req", () => manualRequestSheet());
  on("data-man-reqopt", (k) => manualRequest(k));
  on("data-man-reqok", () => { if (S?.manual) { S.phone.sheet = "confirm"; renderPhone(); } });
  on("data-man-reserve-cancel", () => manualCancelReserve());
}

// ---------------- 홈 화면 ----------------
function homeScreen() {
  const apps = [
    ["메시지", "chat", "#1a73e8"], [TAXI_APP, "local_taxi", "#f5b400"], ["전화", "call", "#34a853"], ["카메라", "photo_camera", "#5f6368"],
    ["캘린더", "calendar_month", "#f29900"], ["갤러리", "photo_library", "#a142f4"], ["설정", "settings", "#5f6368"], ["지도", "map", "#0f9d58"],
  ];
  return `<div class="home"><div class="home-clock">6:12<small>9월 29일 화요일</small></div><div class="home-grid">${apps
    .map(([n, i, c]) => {
      // 직접 조작 중에는 택시 앱만 눌러서 열 수 있음
      const open = S.manual && n === TAXI_APP ? 'data-man-app="taxi"' : "";
      return `<div class="app-icon ${open ? "live" : ""}" ${open}><div class="ai" style="background:${c}">${mi(i)}</div><span>${n}</span></div>`;
    })
    .join("")}</div></div>`;
}

// ---------------- 마음택시 ----------------
// 지금 화면에 보일 목적지 (직접 조작 중 고른 곳 > 정해진 곳 > 승인 대기 중인 곳)
const shownDest = () => S.manualDest ?? S.form.dest ?? S.phone.pendingDest;

function taxiScreen() {
  const p = S.phone;
  let view = "";
  if (p.taxiView === "home") view = taxiHome();
  else if (p.taxiView === "origin") view = taxiOrigin();
  else if (p.taxiView === "search") view = taxiSearch();
  else if (p.taxiView === "ride") view = taxiRide();
  else if (p.taxiView === "calling") view = taxiCalling();
  else if (p.taxiView === "complete") view = taxiComplete();
  else if (p.taxiView === "history") view = taxiHistory();
  else if (p.taxiView === "reserve") view = taxiReserve(false);
  else if (p.taxiView === "reserve_done") view = taxiReserve(true);
  return `<div class="taxi">${view}${taxiOverlay()}</div>`;
}

// 경로 화면 위에 떠 있는 상단 바: 앱 로고 + 출발 › 도착 (실제 택시 앱처럼)
function floatHead() {
  const dest = PLACES[shownDest() || TARGET_PLACE];
  return `<div class="tx-float"><span class="tx-logo sm">${mi("local_taxi", "fill")}</span><span class="tx-float-od"><b>${esc(originLabel(S.form.origin, S.geo))}</b>${mi("chevron_right")}<b>${esc(dest.name)}</b></span></div>`;
}

// 지도: 실제 지도(Leaflet + 오픈스트리트맵 기반 타일)를 이 자리에 붙임. 지도 라이브러리를 못 불러오면 그림 지도로 대체
function mapArt({ route = false } = {}) {
  if (window.L) return `<div class="tx-map-slot ${route ? "route" : ""}"></div>`;
  return `<div class="tx-map ${route ? "route" : ""}">
    <i class="river"></i><i class="road r1"></i><i class="road r2"></i><i class="road r3"></i><i class="road r4"></i>
    ${route ? '<svg class="tx-route" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M24 78 L24 52 L62 52 L62 24 L76 24" /></svg><span class="pin end">' + mi("location_on", "fill") + "</span>" : ""}
    <span class="me"><i></i></span>
  </div>`;
}

function taxiHome() {
  const live = S.manual ? "data-man-search" : "";
  return `<div class="tx-page">
    ${mapArt()}
    <div class="tx-top"><span class="tx-logo sm">${mi("local_taxi", "fill")}</span><b>${TAXI_APP}</b>${mi("menu", "tx-menu")}</div>
    <div class="tx-home-card">
      <div class="tx-from ${S.phone.focus === "origin" ? "hl" : ""}" ${S.manual ? "data-man-from" : ""}>${mi(S.form.origin === "current" ? "my_location" : "trip_origin")}<span><small>출발</small> ${originHtml()}</span>${mi("chevron_right", "tx-from-go")}</div>
      <div class="tx-search ${S.phone.focus === "search" ? "hl" : ""}" ${live}>${mi("search")}<span class="ph">어디로 갈까요?</span></div>
      <div class="tx-quick"><span>${mi("home")}집</span><span>${mi("work")}회사</span><span>${mi("add")}추가</span></div>
      ${USE_COUPON ? `<div class="tx-banner">${mi("confirmation_number")}<span>쿠폰함에 쓸 수 있는 쿠폰이 있어요</span></div>` : ""}
    </div>
  </div>`;
}

// 출발지 표시: 현재 위치는 동네 이름을 작게
function originHtml() {
  const k = S.form.origin;
  if (k !== "current") return `<b>${esc(ORIGINS[k].name)}</b>`;
  const g = S.geo || GEO_FALLBACK;
  return `<b>현재 위치</b>${g.label ? ` <small>${esc(g.label)}</small>` : ""}`;
}

// 출발지 검색
function taxiOrigin() {
  const p = S.phone;
  const typed = S.manual ? ORIGIN_QUERY : p.originTyped || "";
  const show = S.manual || p.originResults;
  const rows = show
    ? ORIGIN_RESULTS.map((r) => {
        const live = S.manual && r.key ? `data-man-origin="${r.key}"` : "";
        return `<div class="tx-res tx-ores ${!S.manual && r.key === TARGET_ORIGIN ? "hl" : ""}" ${r.key ? `data-origin="${r.key}"` : ""} ${live}>${mi(r.key ? "subway" : "location_on", "fill tx-res-ic o")}
          <div class="tx-res-main"><b>${esc(r.name)}</b><small>${esc(r.addr)}</small></div></div>`;
      }).join("")
    : "";
  return `<div class="tx-page white">
    <div class="tx-sbar">${mi("arrow_back_ios", "back")}<div class="tx-sinput">${typed ? esc(typed) : '<span class="ph">출발지 검색</span>'}<i class="caret"></i></div></div>
    <div class="tx-sfrom">${mi("my_location")} 지금 출발지 · ${esc(originLabel(S.form.origin, S.geo))}</div>
    ${show ? `<div class="tx-res-head">검색 결과 ${ORIGIN_RESULTS.length}</div>${rows}` : '<div class="tx-res-empty">출발지를 검색해 주세요</div>'}
  </div>`;
}

function taxiSearch() {
  const p = S.phone;
  const typed = S.manual ? SEARCH_QUERY : p.searchTyped || "";
  const showResults = S.manual || p.results;
  const pick = p.tappedPlace ?? null;
  const pending = p.pendingDest;
  const rows = showResults
    ? SEARCH_ORDER.map((k) => {
        const pl = PLACES[k];
        const cls = [k === pick ? "tapped" : "", !S.manual && k === pending && pick == null ? "hl" : ""].join(" ");
        return `<div class="tx-res ${cls}" data-place="${k}" ${S.manual ? `data-man-place="${k}"` : ""}>${mi("location_on", "fill tx-res-ic")}
          <div class="tx-res-main"><b>${esc(pl.name)}</b><small>${esc(pl.addr)}</small></div><span class="tx-dist">${distText(S.form.origin, k, S.geo)}</span></div>`;
      }).join("")
    : "";
  return `<div class="tx-page white">
    <div class="tx-sbar">${mi("arrow_back_ios", "back")}<div class="tx-sinput">${typed ? esc(typed) : '<span class="ph">장소, 주소 검색</span>'}<i class="caret"></i></div></div>
    <div class="tx-sfrom">${mi("my_location")} 출발 · ${esc(originLabel(S.form.origin, S.geo))}</div>
    ${showResults ? `<div class="tx-res-head">검색 결과 ${SEARCH_ORDER.length}</div>${rows}` : '<div class="tx-res-empty">최근 검색 기록이 없어요</div>'}
  </div>`;
}

function taxiRide() {
  const p = S.phone;
  const f = S.form;
  const dest = PLACES[shownDest() || TARGET_PLACE];
  const man = S.manual;
  const cars = Object.entries(CAR_TYPES).map(([k, c]) =>
    `<div class="tx-car ${f.car === k ? "on" : ""}" data-car="${k}" ${man ? `data-man-car="${k}"` : ""}>
      <span class="tx-car-ic ${k}">${mi(k === "large" ? "airport_shuttle" : "local_taxi", "fill")}</span>
      <span class="tx-car-main"><b>${c.label}</b><small>${c.desc}</small></span><b class="tx-price">${won0(fareOf({ ...f, car: k }, shownDest()))}</b></div>`).join("");
  return `<div class="tx-page">
    ${mapArt({ route: true })}
    ${floatHead()}
    <div class="tx-sheet-fixed">
      <div class="tx-od">
        <div>${mi("trip_origin", "o")}<span>${originHtml()}</span></div>
        <div class="tx-dest" ${man ? "data-man-search" : ""}>${mi("location_on", "fill d")}<span><b>${esc(dest.name)}</b><small>${esc(dest.addr)}</small></span></div>
      </div>
      <div class="tx-cars ${p.focus === "car" ? "hl" : ""}">${cars}</div>
      <div class="tx-row tx-pay" ${man ? "data-man-pay" : ""}><span>결제</span><b>${PAY[f.pay].label} <small>${PAY[f.pay].desc}</small> ${mi("chevron_right")}</b></div>
      ${USE_COUPON ? `<div class="tx-row tx-coupon" ${man ? "data-man-coupon" : ""}><span>쿠폰</span><b class="${f.coupon ? "on" : ""}">${f.coupon ? `−${won0(COUPON.amount)} 적용` : "1장 사용 가능"} ${mi("chevron_right")}</b></div>` : ""}
      <div class="tx-call">${CAR_TYPES[f.car].label} 호출하기</div>
    </div>
  </div>`;
}

function taxiCalling() {
  return `<div class="tx-page">
    ${mapArt({ route: true })}
    ${floatHead()}
    <div class="tx-sheet-fixed center"><div class="tx-radar"><i></i><i></i>${mi("local_taxi", "fill")}</div>
      <b>주변 ${esc(CAR_TYPES[S.form.car].label)}를 찾고 있어요</b><small class="muted">잠시만 기다려 주세요</small></div>
  </div>`;
}

// 세션2: 이용내역 (최근 3개월)
function taxiHistory() {
  const rows = RIDE_HISTORY.map((h) => `<div class="hist-row"><span><b>${esc(h.to)}</b><small>${h.date} ${h.time} · 신분당선 동천역 출발</small></span><b>${won0(h.fare)}</b></div>`).join("");
  return `<div class="tx-page white"><div class="tx-sbar">${mi("arrow_back_ios", "back")}<b class="tx-htitle">이용내역</b></div>
    <div class="hist-filter"><span class="on">3개월</span><span>1개월</span><span>전체</span></div>
    <div class="hist-list">${rows}</div>
    <div class="hist-reserve">${mi("event_repeat")} 같은 경로로 예약하기</div></div>`;
}

// 세션2: 예약 호출 / 예약 완료
function taxiReserve(done) {
  const cancel = S.manual && done && S.form.reserved ? `<div class="tx-call ghost" data-man-reserve-cancel>예약 취소</div>` : "";
  return `<div class="tx-page white tx-resv">
    ${done ? `<div class="tx-done-head"><span class="done-check">${mi("check")}</span><span><b>택시를 예약했어요</b><small>출발 30분 전에 배차를 시작해요</small></span></div>` : `<div class="tx-sbar">${mi("arrow_back_ios", "back")}<b class="tx-htitle">예약 호출</b></div>`}
    <div class="done-box">
      <div><span>출발</span><b>신분당선 동천역</b></div>
      <div><span>도착</span><b>담소한정식 강남점</b></div>
      <div><span>예약 시간</span><b>${RESERVE.when}</b></div>
      <div><span>택시 종류</span><b>${CAR_TYPES[S.form.car].label}</b></div>
    </div>
    ${done ? `${cancel}<div class="tx-call" data-done-confirm>확인</div>` : '<div class="tx-call">예약하기</div>'}
  </div>`;
}

function rideRows() {
  const f = S.form;
  return [
    ["출발", originLabel(f.origin, S.geo)],
    ["도착", PLACES[f.dest || TARGET_PLACE].name],
    ["택시 종류", CAR_TYPES[f.car].label],
    ["결제", `${PAY[f.pay].label} · ${PAY[f.pay].desc}`],
    ...((S.complexity === "B" && USE_COUPON) || f.coupon ? [["쿠폰", f.coupon ? `${COUPON.name}` : "적용 안 함"]] : []),
    ...(f.request && f.request !== "none" ? [["기사님 요청사항", REQUESTS[f.request]]] : []),
    ["예상 요금", won0(fareOf(f))],
  ];
}

function taxiComplete() {
  const f = S.form;
  return `<div class="tx-page">
    ${mapArt({ route: true })}
    ${floatHead()}
    <div class="tx-sheet-fixed">
      <div class="tx-done-head"><span class="done-check">${mi("check")}</span><span><b>기사님이 오고 있어요</b><small>3분 뒤 도착 · 서울 32바 1234 · 흰색 쏘나타</small></span></div>
      <div class="done-box">${rideRows().map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>
      <div class="tx-call" data-done-confirm>확인</div>
    </div>
  </div>`;
}

function taxiOverlay() {
  const p = S.phone;
  const f = S.form;
  // 시트가 처음 나타날 때만 등장 애니메이션
  const cur = p.sheet || "";
  const enter = cur !== p.overlayShown ? "enter" : "";
  p.overlayShown = cur;
  const man = S.manual;
  const closer = man ? "data-man-close" : "";
  if (p.sheet === "pay") {
    return `<div class="dim ${enter}" ${closer}><div class="sheet ${enter}" onclick="event.stopPropagation()"><h3>결제 방식</h3>
      ${Object.entries(PAY).map(([k, o]) => `<div class="tx-pay-opt ${f.pay === k ? "on" : ""}" data-pay="${k}" ${man ? `data-man-payopt="${k}"` : ""}>
        ${mi(k === "auto" ? "credit_card" : "payments")}<span><b>${o.label}</b><small>${o.desc}</small></span>${mi(f.pay === k ? "radio_button_checked" : "radio_button_unchecked", "radio")}</div>`).join("")}
    </div></div>`;
  }
  if (p.sheet === "coupon") {
    return `<div class="dim ${enter}" ${closer}><div class="sheet ${enter}" onclick="event.stopPropagation()"><h3>쿠폰</h3>
      <div class="tx-cpn-item ${f.coupon ? "on" : ""}"><span class="cpn-amt">${won0(COUPON.amount)}</span><span><b>${COUPON.name}</b><small>모든 택시 · 10월 31일까지</small></span></div>
      <div class="tx-cpn-none">적용 안 함</div>
    </div></div>`;
  }
  if (p.sheet === "confirm") {
    return `<div class="dim ${enter}"><div class="sheet ${enter}">
      <h3>${esc(PLACES[f.dest || TARGET_PLACE].name)}으로<br><em>${CAR_TYPES[f.car].label}</em>를 호출할까요?</h3>
      ${rideRows().slice(2).filter(([k]) => k !== "기사님 요청사항").map(([k, v]) => `<div class="kv"><span>${k}</span><b>${esc(v)}</b></div>`).join("")}
      <div class="kv tx-req ${p.focus === "request" ? "hl" : ""}" ${man ? "data-man-req" : ""}><span>기사님 요청사항</span><b>${esc(REQUESTS[f.request || "none"])} ${mi("chevron_right")}</b></div>
      <div class="bk-btn2"><span>취소</span><span class="primary">호출</span></div></div></div>`;
  }
  if (p.sheet === "pin") {
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
    return `<div class="dim ${enter}"><div class="sheet pin ${enter}"><div class="tx-brand"><span class="tx-logo sm">${mi("local_taxi", "fill")}</span><b>${TAXI_APP} 페이</b><small>${mi("lock")} 보안 키패드</small></div><h3>결제 비밀번호</h3><p class="muted">마음카드 ****1234 · 비밀번호 4자리를 입력해주세요</p>
      <div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i < (p.pin || "").length ? "on" : ""}"></i>`).join("")}</div>
      <div class="keypad">${keys.map((k) => (k ? `<button type="button" data-pin="${k}">${k === "del" ? mi("backspace") : k}</button>` : "<span></span>")).join("")}</div></div></div>`;
  }
  if (p.sheet === "request") {
    return `<div class="dim" ${closer}><div class="sheet" onclick="event.stopPropagation()"><h3>기사님 요청사항</h3>
      ${REQUEST_CHOICES.map((k) => [k, REQUESTS[k]]).map(([k, v]) => `<div class="tx-pay-opt tx-reqopt ${(f.request || "none") === k ? "on" : ""} ${p.reqFocus === k ? "hl" : ""}" data-req="${k}" ${man ? `data-man-reqopt="${k}"` : ""}>
        <span><b>${esc(v)}</b></span>${mi((f.request || "none") === k ? "radio_button_checked" : "radio_button_unchecked", "radio")}</div>`).join("")}
      <div class="tx-call tx-req-ok" ${man ? "data-man-reqok" : ""}>확인</div>
    </div></div>`;
  }
  return "";
}

// ---------------- 직접 조작 입력 ----------------
// 직접 조작으로 단계를 끝낸 경우 기록 → 에이전트는 그 단계를 다시 하지 않고 넘어감
function manualMark(stepId, choice = true) {
  S.manualDone = S.manualDone || {};
  S.manualDone[stepId] = choice;
  logEvent("manual_action", { step: stepId, choice });
}
const curStepId = () => S.steps[S.stepIdx]?.id;

function manualOpenApp() {
  if (!S?.manual) return;
  S.phone.app = "taxi";
  S.phone.taxiView = "home";
  S.phone.focus = null;
  manualMark("taxi_open");
  renderPhone();
}

function manualSearch() {
  if (!S?.manual) return;
  S.phone.taxiView = "search";
  renderPhone();
}

function manualOriginSearch() {
  if (!S?.manual) return;
  S.phone.taxiView = "origin";
  renderPhone();
}

function manualOrigin(k) {
  if (!S?.manual) return;
  S.form.origin = k;
  S.userSet.origin = true;
  S.phone.taxiView = "home";
  if (curStepId() === "origin") manualMark("origin", "approve");
  renderPhone();
}

function manualRequestSheet() {
  if (!S?.manual) return;
  S.phone.sheet = "request";
  renderPhone();
}

function manualRequest(k) {
  if (!S?.manual) return;
  S.form.request = k;
  S.userSet.request = true;
  S.requestByUser = true;
  logEvent("request_changed", { request: k, via: "manual" });
  renderPhone();
}

function manualCancelReserve() {
  if (!S?.manual) return;
  S.form.reserved = false;
  S.reserveCancelled = true;
  S.phone.taxiView = "history";
  logEvent("reserve_cancelled", { via: "manual" });
  renderPhone();
}

function manualPlace(k) {
  if (!S?.manual) return;
  S.manualDest = k;
  S.phone.tappedPlace = k;
  S.phone.taxiView = "ride";
  renderPhone();
}

function manualCar(k) {
  if (!S?.manual) return;
  S.form.car = k;
  (S.userSet ||= {}).car = true;
  if (curStepId() === "car") manualMark("car", k);
  renderPhone();
}

function manualPaySheet() {
  if (!S?.manual) return;
  S.phone.sheet = "pay";
  renderPhone();
}

function manualPay(k) {
  if (!S?.manual) return;
  S.form.pay = k;
  (S.userSet ||= {}).pay = true;
  S.phone.sheet = null;
  if (curStepId() === "pay") manualMark("pay", k);
  renderPhone();
}

function manualCoupon() {
  if (!S?.manual) return;
  S.form.coupon = !S.form.coupon;
  (S.userSet ||= {}).coupon = true;
  if (curStepId() === "coupon") manualMark("coupon", S.form.coupon ? "approve" : "reject");
  renderPhone();
}

function manualCloseSheet() {
  if (!S?.manual) return;
  S.phone.sheet = null;
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

async function waitLoading() {
  while (S.phone.loading && Date.now() < S.phone.loadingUntil) await sleep(80);
  await sleep(250 * PACE);
}

// 화면 속 요소를 누르는 표시 (터치 원). 누르기 한 번 ≈ 1.2초 (누를 곳 찾기 → 누름 → 반응)
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

// 글자 하나씩 입력
async function typeText(set, text, ms = 170) {
  await waitLoading();
  for (let i = 1; i <= text.length; i++) {
    set(text.slice(0, i));
    renderPhone();
    await actSleep(ms);
  }
}

// 이미 목적지를 정한 뒤 목적지가 바뀌면 검색 화면으로 돌아가 다시 고름
async function redoDest(k) {
  const p = S.phone;
  if (p.app !== "taxi" || p.taxiView !== "ride") return;
  const sheet = p.sheet;
  actNoGate++;
  setActing(true);
  if (sheet) { p.sheet = null; renderPhone(); await actSleep(400); }
  await tap(".tx-dest");
  p.taxiView = "search";
  p.searchTyped = SEARCH_QUERY;
  p.results = true;
  p.tappedPlace = null;
  renderPhone();
  await actSleep(600);
  await tap(`.tx-res[data-place="${k}"]`);
  p.tappedPlace = k;
  p.taxiView = "ride";
  renderPhone();
  await actSleep(500);
  if (sheet === "confirm") { await tap(".tx-call"); p.sheet = sheet; renderPhone(); await actSleep(400); }
  setActing(false);
  actNoGate--;
}

// =====================================================================
// 실제 지도 (Leaflet). 화면을 다시 그려도 지도는 하나만 만들어 두고 자리(.tx-map-slot)에 옮겨 붙임
// =====================================================================
const LiveMap = { map: null, el: null, layer: null, key: "", routes: {} };

function ensureMap() {
  if (LiveMap.map || !window.L) return LiveMap.map;
  const el = document.createElement("div");
  el.className = "tx-live-map";
  LiveMap.el = el;
  const map = L.map(el, {
    zoomControl: false, attributionControl: true, dragging: false, touchZoom: false, scrollWheelZoom: false,
    doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, fadeAnimation: false, zoomAnimation: false,
  });
  // 지도 타일: OpenStreetMap 기본 타일 (API 키 불필요. CARTO 타일은 API 키를 요구해 교체)
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© OpenStreetMap",
  }).addTo(map);
  map.attributionControl.setPrefix(false);
  LiveMap.layer = L.layerGroup().addTo(map);
  LiveMap.map = map;
  return map;
}

const pinIcon = (cls, html = "") => L.divIcon({ className: `lm-pin ${cls}`, html, iconSize: null });

function mountMap() {
  const slot = $("#screen").querySelector(".tx-map-slot");
  if (!slot || !ensureMap()) return;
  if (LiveMap.el.parentNode !== slot) slot.appendChild(LiveMap.el);
  requestAnimationFrame(refreshMap);
}

// 지도 내용 갱신 (화면·출발지·목적지가 바뀐 경우에만 다시 맞춤)
function refreshMap() {
  const map = LiveMap.map;
  if (!map || !S || !LiveMap.el.isConnected || !LiveMap.el.clientWidth) return;
  map.invalidateSize(false);
  const p = S.phone;
  const route = ["ride", "calling", "complete"].includes(p.taxiView);
  const o = originPoint(S.form.origin, S.geo);
  const destKey = route ? shownDest() || TARGET_PLACE : null;
  const key = [p.taxiView, S.form.origin, o.lat, o.lng, destKey, LiveMap.el.clientWidth, LiveMap.el.clientHeight, LiveMap.routes[`${o.lat},${o.lng}>${destKey}`] ? 1 : 0].join("|");
  if (key === LiveMap.key) return;
  LiveMap.key = key;
  LiveMap.layer.clearLayers();
  const current = S.form.origin === "current";
  L.marker([o.lat, o.lng], { icon: pinIcon(current ? "me" : "origin", current ? "<i></i>" : `<span>출발 ${mi("chevron_right")}</span>`) }).addTo(LiveMap.layer);
  // 경로가 없을 때(출발지 설정 중): 동천역으로 바꾼 뒤에는 역 주변이 보이게 가깝게, 현재 위치는 조금 넓게
  if (!destKey) {
    map.setView([o.lat, o.lng], current ? 16 : 18, { animate: false });
    map.panBy([0, sheetCover() / 2], { animate: false }); // 출발지 핀이 아래 카드에 가리지 않고 보이는 부분 가운데에 오게
    return;
  }
  const d = PLACES[destKey];
  const eta = d.road ? Math.round(d.road * 1.3) : null; // 도로 거리로 어림한 예상 소요 시간(분)
  L.marker([d.lat, d.lng], { icon: pinIcon("dest", `<span><em>도착</em>${eta ? `<b>${eta}분 예상 ${mi("chevron_right")}</b>` : ""}</span>`) }).addTo(LiveMap.layer);
  const rk = `${o.lat},${o.lng}>${destKey}`;
  const line = LiveMap.routes[rk];
  if (line) {
    L.polyline(line, { color: "#fff", weight: 9, opacity: 0.9 }).addTo(LiveMap.layer);
    L.polyline(line, { color: "#3274e6", weight: 6, opacity: 1 }).addTo(LiveMap.layer);
  }
  else {
    L.polyline([[o.lat, o.lng], [d.lat, d.lng]], { color: "#3274e6", weight: 4, opacity: 0.6, dashArray: "6 8" }).addTo(LiveMap.layer);
    fetchRoute(rk, o, d);
  }
  // 지도 아래쪽은 바텀시트가 덮으므로, 시트 위로 보이는 부분 안에 경로가 들어오게 맞춤
  const covered = sheetCover();
  map.fitBounds(L.latLngBounds([[o.lat, o.lng], [d.lat, d.lng]]), { paddingTopLeft: [40, 110], paddingBottomRight: [40, covered + 36] });
}

// 지도 아래쪽을 덮고 있는 바텀시트(홈 카드·호출 시트) 높이 (축소 화면이면 실제 크기로 환산)
function sheetCover() {
  const sheet = LiveMap.el.closest(".tx-page")?.querySelector(".tx-sheet-fixed, .tx-home-card");
  const mr = LiveMap.el.getBoundingClientRect();
  if (!sheet || !mr.height) return 0;
  return Math.max(0, (mr.bottom - sheet.getBoundingClientRect().top) * (LiveMap.el.clientHeight / mr.height));
}

// 실제 도로 경로 (OSRM 공개 서버). 실패하면 점선 직선을 그대로 둠
async function fetchRoute(rk, o, d) {
  if (LiveMap.routes[rk] !== undefined) return;
  LiveMap.routes[rk] = null;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${o.lng},${o.lat};${d.lng},${d.lat}?overview=simplified&geometries=geojson`;
    const res = await fetch(url);
    const j = await res.json();
    const coords = j.routes?.[0]?.geometry?.coordinates;
    if (coords?.length) { LiveMap.routes[rk] = coords.map(([lng, lat]) => [lat, lng]); LiveMap.key = ""; refreshMap(); }
  } catch { /* 직선으로 둠 */ }
}

// 휴대폰 위치 받기 (세션 시작 때). 못 받으면 GEO_FALLBACK. 정확한 좌표는 기록에 남기지 않고 동네 이름만 남김
function locate() {
  S.geo = { ...GEO_FALLBACK, ok: false };
  const sess = S;
  if (!navigator.geolocation) { logEvent("geo", { ok: false, reason: "unsupported" }); return; }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      if (S !== sess) return;
      S.geo = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: "", ok: true };
      renderPhone();
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${S.geo.lat}&lon=${S.geo.lng}&zoom=16&accept-language=ko`);
        const a = (await r.json()).address || {};
        const parts = [a.city || a.county || a.state, a.borough || a.city_district || a.district, a.quarter || a.suburb || a.neighbourhood].filter(Boolean);
        if (S === sess) S.geo.label = [...new Set(parts)].join(" ");
      } catch { /* 동네 이름 없이 "현재 위치"만 */ }
      if (S !== sess) return;
      logEvent("geo", { ok: true, label: S.geo.label || null });
      renderPhone();
    },
    (err) => { if (S === sess) logEvent("geo", { ok: false, reason: err.message || String(err.code) }); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

// 호출 확인 시트에서 [호출] → 결제 비밀번호 창 (비밀번호를 넣으면 호출됨)
async function callTaxi(s) {
  if (s.phone.sheet !== "confirm") { s.phone.sheet = "confirm"; renderPhone(); await actSleep(400); }
  await tap(".sheet .primary");
  s.phone.pin = "";
  s.phone.sheet = "pin";
  renderPhone();
}

// 결제 비밀번호를 넣은 뒤: 결제 확인 → 주변 택시 찾기
function startCalling(s) {
  s.phone.sheet = null;
  s.phone.taxiView = "calling";
  renderPhone();
}

// 호출 확인 시트의 [기사님 요청사항] → 목록에서 고름 → 확인 시트로 돌아옴
// stay=true: 고른 뒤에도 요청사항 목록(바텀시트)을 열어 둬서 무엇을 골랐는지 화면에서 보이게 함
async function pickRequest(s, k, { stay = false } = {}) {
  const p = s.phone;
  if (p.sheet !== "request") {
    if (p.sheet !== "confirm") { p.sheet = "confirm"; renderPhone(); await actSleep(400); }
    p.focus = "request";
    renderPhone();
    await tap(".tx-req");
    p.focus = null;
    p.sheet = "request";
    renderPhone();
    await actSleep(500);
  }
  await tap(`.tx-reqopt[data-req="${k}"]`);
  s.form.request = k;
  renderPhone();
  await actSleep(300);
  if (stay) return;
  await closeRequestSheet(s);
}

// 호출 확인 시트의 [기사님 요청사항] → 목록 열기 (아직 고르지 않음)
async function openRequestSheet(s) {
  const p = s.phone;
  if (p.sheet === "request") return;
  if (p.sheet !== "confirm") { p.sheet = "confirm"; renderPhone(); await actSleep(400); }
  p.focus = "request";
  renderPhone();
  await tap(".tx-req");
  p.focus = null;
  p.sheet = "request";
  renderPhone();
  await actSleep(500);
}

// 요청사항 목록의 [확인] → 호출 확인 시트로
async function closeRequestSheet(s) {
  if (s.phone.sheet !== "request") return;
  await tap(".tx-req-ok");
  s.phone.sheet = "confirm";
  renderPhone();
  await actSleep(400);
}

// 참가자가 말한 대로 요청사항을 바꿈 (실행화면을 열어 누르는 과정을 보여줌)
async function redoRequest(k) {
  actNoGate++;
  S.reticking = true;
  if (!S.showRun && typeof showRun === "function") showRun(true);
  setActing(true);
  await actSleep(700);
  await pickRequest(S, k, { stay: true });
  setActing(false);
  S.reticking = false;
  if (typeof syncControls === "function") syncControls();
  actNoGate--;
}
