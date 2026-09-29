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
  bindPhone();
  if (typeof syncView === "function") syncView();
}

function bindPhone() {
  const sc = $("#screen");
  const on = (attr, fn) => sc.querySelectorAll(`[${attr}]`).forEach((b) => (b.onclick = () => fn(b.getAttribute(attr))));
  on("data-man-app", () => manualOpenApp());
  on("data-man-search", () => manualSearch());
  on("data-man-place", (k) => manualPlace(k));
  on("data-man-car", (k) => manualCar(k));
  on("data-man-pay", () => manualPaySheet());
  on("data-man-payopt", (k) => manualPay(k));
  on("data-man-coupon", () => manualCoupon());
  on("data-man-close", () => manualCloseSheet());
  on("data-done-confirm", () => confirmDone());
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
  else if (p.taxiView === "search") view = taxiSearch();
  else if (p.taxiView === "ride") view = taxiRide();
  else if (p.taxiView === "calling") view = taxiCalling();
  else if (p.taxiView === "complete") view = taxiComplete();
  return `<div class="taxi">${view}${taxiOverlay()}</div>`;
}

// 간단한 지도 (도로 격자 + 강 + 현재 위치 / 도착 핀)
function mapArt({ route = false } = {}) {
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
      <div class="tx-from">${mi("my_location")}<span>우리집 <small>(현재 위치)</small></span></div>
      <div class="tx-search ${S.phone.focus === "search" ? "hl" : ""}" ${live}>${mi("search")}<span class="ph">어디로 갈까요?</span></div>
      <div class="tx-quick"><span>${mi("home")}집</span><span>${mi("work")}회사</span><span>${mi("add")}추가</span></div>
      <div class="tx-banner">${mi("confirmation_number")}<span>쿠폰함에 쓸 수 있는 쿠폰이 있어요</span></div>
    </div>
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
          <div class="tx-res-main"><b>${esc(pl.name)}</b><small>${esc(pl.addr)}</small></div><span class="tx-dist">${pl.dist}</span></div>`;
      }).join("")
    : "";
  return `<div class="tx-page white">
    <div class="tx-sbar">${mi("arrow_back_ios", "back")}<div class="tx-sinput">${typed ? esc(typed) : '<span class="ph">장소, 주소 검색</span>'}<i class="caret"></i></div></div>
    <div class="tx-sfrom">${mi("my_location")} 출발 · 우리집 (현재 위치)</div>
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
    <div class="tx-sheet-fixed">
      <div class="tx-od">
        <div>${mi("my_location", "o")}<span>우리집 <small>(현재 위치)</small></span></div>
        <div class="tx-dest" ${man ? "data-man-search" : ""}>${mi("location_on", "fill d")}<span><b>${esc(dest.name)}</b><small>${esc(dest.addr)}</small></span></div>
      </div>
      <div class="tx-cars ${p.focus === "car" ? "hl" : ""}">${cars}</div>
      <div class="tx-row tx-pay" ${man ? "data-man-pay" : ""}><span>결제</span><b>${PAY[f.pay].label} <small>${PAY[f.pay].desc}</small> ${mi("chevron_right")}</b></div>
      <div class="tx-row tx-coupon" ${man ? "data-man-coupon" : ""}><span>쿠폰</span><b class="${f.coupon ? "on" : ""}">${f.coupon ? `−${won0(COUPON.amount)} 적용` : "1장 사용 가능"} ${mi("chevron_right")}</b></div>
      <div class="tx-call">${CAR_TYPES[f.car].label} 호출하기</div>
    </div>
  </div>`;
}

function taxiCalling() {
  return `<div class="tx-page">
    ${mapArt({ route: true })}
    <div class="tx-sheet-fixed center"><div class="tx-radar"><i></i><i></i>${mi("local_taxi", "fill")}</div>
      <b>주변 ${esc(CAR_TYPES[S.form.car].label)}를 찾고 있어요</b><small class="muted">잠시만 기다려 주세요</small></div>
  </div>`;
}

function rideRows() {
  const f = S.form;
  return [
    ["출발", "우리집 (현재 위치)"],
    ["도착", PLACES[f.dest || TARGET_PLACE].name],
    ["택시 종류", CAR_TYPES[f.car].label],
    ["결제", `${PAY[f.pay].label} · ${PAY[f.pay].desc}`],
    ...(S.complexity === "B" || f.coupon ? [["쿠폰", f.coupon ? `${COUPON.name}` : "적용 안 함"]] : []),
    ["예상 요금", won0(fareOf(f))],
  ];
}

function taxiComplete() {
  const f = S.form;
  return `<div class="tx-page">
    ${mapArt({ route: true })}
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
      ${rideRows().slice(2).map(([k, v]) => `<div class="kv"><span>${k}</span><b>${esc(v)}</b></div>`).join("")}
      <div class="bk-btn2"><span>취소</span><span class="primary">호출</span></div></div></div>`;
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
