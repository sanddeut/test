// =====================================================================
// 마음택시 앱 지도: 실제 지도(Leaflet)를 불러오지 못할 때 보이는 그림 지도
// 실제 위치를 본떠 그림 (원주 연세대 미래캠퍼스 주변 / 신촌 연세대 주변 / 원주→강남, 신촌→강남 경로)
// 화면 비율은 휴대폰 화면(세로)에 맞춤: viewBox 390×780, 위쪽(지도가 보이는 곳)에 중요한 것을 둠
// =====================================================================
const MA = {
  land: "#f2efe8", park: "#d7e9cb", park2: "#cfe4c2", water: "#b8d6ef", block: "#e6e2d9", bldg: "#dbd6cb",
  road: "#ffffff", edge: "#e0dbd0", main: "#fde9a6", mainEdge: "#ecd287", label: "#7d786c", font: "Noto Sans KR, Apple SD Gothic Neo, sans-serif",
};
const maT = (x, y, t, { size = 12, fill = MA.label, weight = 500, rot = 0, anchor = "middle" } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}" font-family="${MA.font}" stroke="#fff" stroke-width="3" paint-order="stroke" stroke-opacity=".75"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ""}>${t}</text>`;
const maRoad = (d, w = 9, main = false) =>
  `<path d="${d}" fill="none" stroke="${main ? MA.mainEdge : MA.edge}" stroke-width="${w + 2}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${main ? MA.main : MA.road}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const maDot = (x, y) => `<circle cx="${x}" cy="${y}" r="22" fill="#2f7cf6" opacity=".16"/><circle cx="${x}" cy="${y}" r="8" fill="#2f7cf6" stroke="#fff" stroke-width="3.5"/>`;
const maPin = (x, y) => `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="2" rx="7" ry="2.5" fill="#000" opacity=".18"/><path d="M0 2 C-11 -11 -13 -16 -13 -21 A13 13 0 1 1 13 -21 C13 -16 11 -11 0 2 Z" fill="#e8453c" stroke="#fff" stroke-width="2"/><circle cy="-21" r="5" fill="#fff"/></g>`;
const maSubway = (x, y, n = "2", c = "#3cb44a") => `<g transform="translate(${x} ${y})"><circle r="9" fill="#fff" stroke="${c}" stroke-width="3"/><text y="4" text-anchor="middle" font-size="10" font-weight="700" fill="${c}" font-family="sans-serif">${n}</text></g>`;
const maSvg = (body) => `<svg class="ma-svg" viewBox="0 0 390 780" preserveAspectRatio="xMidYMid slice"><rect width="390" height="780" fill="${MA.land}"/>${body}</svg>`;

// 원주 연세대 미래캠퍼스 주변 (산·숲, 매지호수, 연세대길)
function maWonju(dot) {
  return maSvg(`
<path d="M0 0 H200 C170 60 120 90 70 110 C40 122 18 150 0 170 Z" fill="${MA.park}"/>
<path d="M300 0 H390 V260 C360 240 330 200 320 160 C310 110 300 60 300 0 Z" fill="${MA.park}"/>
<path d="M0 470 C50 450 90 470 120 520 C140 560 120 620 0 640 Z" fill="${MA.park2}"/>
<path d="M290 560 C330 520 390 520 390 520 V780 H250 C250 690 260 600 290 560 Z" fill="${MA.park2}"/>
<path d="M232 370 C250 340 300 336 326 356 C352 376 352 418 326 440 C298 464 252 458 234 432 C220 412 220 390 232 370 Z" fill="${MA.water}"/>
<rect x="110" y="220" width="130" height="120" rx="10" fill="${MA.block}"/>
<g fill="${MA.bldg}"><rect x="122" y="232" width="34" height="20" rx="3"/><rect x="164" y="230" width="46" height="16" rx="3"/><rect x="164" y="254" width="22" height="30" rx="3"/><rect x="194" y="258" width="34" height="22" rx="3"/><rect x="122" y="262" width="30" height="34" rx="3"/><rect x="160" y="296" width="40" height="30" rx="3"/><rect x="208" y="292" width="24" height="34" rx="3"/><rect x="74" y="300" width="26" height="22" rx="3"/><rect x="250" y="226" width="30" height="22" rx="3"/></g>
<rect x="130" y="350" width="60" height="40" rx="6" fill="${MA.park2}"/>
${maRoad("M-10 560 C60 520 90 470 104 400 C116 346 150 344 200 346 C250 348 270 300 300 240 C330 180 360 150 400 130", 11, true)}
${maRoad("M200 346 C206 400 196 470 170 530 C150 580 150 650 160 790", 7)}
${maRoad("M104 400 C80 380 40 372 -10 380", 6)}
${maRoad("M240 220 C250 180 262 120 270 -10", 6)}
${maT(72, 540, "연세대길", { rot: -48, size: 12 })}
${maT(282, 404, "매지호수", { fill: "#3f78ad", size: 14 })}
${maT(175, 212, "연세대학교 미래캠퍼스", { size: 14, weight: 700, fill: "#5d584b" })}
${maT(160, 374, "운동장", { size: 11, fill: "#6d8c60" })}
${maT(350, 90, "매봉산", { size: 12, fill: "#6d8c60" })}
${maT(70, 60, "백운산 자락", { size: 12, fill: "#6d8c60" })}
${maT(110, 700, "흥업면", { size: 13, fill: "#8a8578" })}
${dot ? maDot(dot[0], dot[1]) : ""}`);
}

// 신촌 연세대 주변 (연세대 캠퍼스, 안산, 연세로, 신촌역 2호선, 연희동)
function maSinchon(dot) {
  return maSvg(`
<path d="M0 0 H150 C140 70 100 110 40 130 C20 136 8 150 0 160 Z" fill="${MA.park}"/>
<path d="M150 70 C200 54 290 60 330 90 C360 112 362 200 340 250 C320 290 240 300 190 290 C150 282 136 230 140 170 C142 120 140 90 150 70 Z" fill="${MA.park2}"/>
<g fill="${MA.bldg}"><rect x="200" y="120" width="40" height="24" rx="3"/><rect x="250" y="130" width="30" height="34" rx="3"/><rect x="190" y="166" width="34" height="30" rx="3"/><rect x="236" y="180" width="46" height="22" rx="3"/><rect x="292" y="160" width="26" height="40" rx="3"/><rect x="210" y="220" width="40" height="26" rx="3"/><rect x="262" y="226" width="30" height="24" rx="3"/></g>
<g fill="${MA.block}"><rect x="10" y="190" width="100" height="90" rx="6"/><rect x="10" y="300" width="100" height="100" rx="6"/><rect x="10" y="420" width="100" height="110" rx="6"/><rect x="150" y="330" width="70" height="90" rx="6"/><rect x="250" y="330" width="130" height="90" rx="6"/><rect x="150" y="470" width="70" height="80" rx="6"/><rect x="250" y="470" width="130" height="80" rx="6"/></g>
<g fill="${MA.bldg}"><rect x="22" y="204" width="30" height="22" rx="2"/><rect x="62" y="230" width="36" height="34" rx="2"/><rect x="22" y="316" width="40" height="26" rx="2"/><rect x="70" y="350" width="28" height="36" rx="2"/><rect x="24" y="440" width="34" height="30" rx="2"/><rect x="160" y="344" width="48" height="30" rx="2"/><rect x="264" y="344" width="44" height="28" rx="2"/><rect x="320" y="376" width="48" height="32" rx="2"/><rect x="164" y="484" width="40" height="40" rx="2"/><rect x="270" y="486" width="60" height="44" rx="2"/></g>
${maRoad("M130 -10 C128 120 126 200 128 300 C130 400 128 560 126 790", 9)}
${maRoad("M235 300 C236 360 236 420 236 450 C236 520 236 640 236 790", 10)}
${maRoad("M-10 450 H400", 14, true)}
${maRoad("M-10 300 C60 296 100 300 130 300 C170 300 200 304 400 304", 8)}
${maRoad("M-10 600 C120 590 260 600 400 640", 9)}
${maSubway(236, 450)}
${maT(250, 440, "신촌역", { size: 13, weight: 700, fill: "#2e8a3a", anchor: "start" })}
${maT(248, 400, "연세로", { rot: 90, size: 12 })}
${maT(70, 444, "신촌로", { size: 12, fill: "#8a7a3c" })}
${maT(245, 110, "연세대학교", { size: 14, weight: 700, fill: "#4d6b42" })}
${maT(60, 80, "안산", { size: 13, fill: "#6d8c60" })}
${maT(60, 180, "연희동", { size: 13, fill: "#8a8578" })}
${maT(118, 220, "연희로", { rot: 90, size: 11 })}
${maT(320, 590, "창천동", { size: 12, fill: "#8a8578" })}
${dot ? maDot(dot[0], dot[1]) : ""}`);
}

// 원주 → 강남 경로 (영동고속도로를 따라 약 108km)
function maRouteWonju() {
  const route = "M330 372 C318 360 300 352 282 338 C262 322 246 312 226 300 C206 288 188 270 168 250 C152 234 140 214 124 196 C110 180 98 166 88 154";
  return maSvg(`
<path d="M0 0 H180 C160 40 120 60 70 70 C40 76 18 90 0 100 Z" fill="${MA.block}"/>
<path d="M150 230 C190 210 230 220 250 250 C262 268 244 286 220 286 C190 286 160 266 150 230 Z" fill="${MA.park}"/>
<path d="M260 120 C300 100 360 110 390 130 V250 C360 240 320 220 300 200 C276 180 250 150 260 120 Z" fill="${MA.park}"/>
<path d="M20 230 C60 220 90 250 96 290 C100 320 70 340 40 336 C10 332 0 300 0 280 Z" fill="${MA.park2}"/>
<path d="M300 400 C330 390 380 400 390 410 V520 C350 510 310 470 300 400 Z" fill="${MA.park2}"/>
<path d="M-10 124 C30 118 60 110 96 116 C130 122 150 104 180 92 C210 80 240 78 270 70 C300 62 340 40 400 20" fill="none" stroke="${MA.water}" stroke-width="16" stroke-linecap="round"/>
<path d="M270 70 C290 120 300 170 330 210 C350 238 360 280 400 300" fill="none" stroke="${MA.water}" stroke-width="10" stroke-linecap="round"/>
${maRoad("M70 150 C120 180 150 230 190 270 C230 300 280 330 330 372 C350 388 370 400 400 410", 7, true)}
${maRoad("M88 154 C100 220 110 300 120 420", 6, true)}
${maRoad("M20 160 C60 150 76 154 88 154 C130 150 170 160 210 150", 5)}
<path d="${route}" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/>
<path d="${route}" fill="none" stroke="#2f7cf6" stroke-width="6.5" stroke-linecap="round"/>
${maT(52, 98, "서울", { size: 15, weight: 700, fill: "#5d584b" })}
${maT(72, 186, "강남", { size: 13, weight: 700, fill: "#5d584b" })}
${maT(120, 258, "성남", { size: 12 })}
${maT(146, 300, "용인", { size: 12 })}
${maT(214, 330, "이천", { size: 12 })}
${maT(270, 376, "여주", { size: 12 })}
${maT(346, 404, "원주", { size: 15, weight: 700, fill: "#5d584b" })}
${maT(150, 88, "한강", { size: 12, fill: "#3f78ad" })}
${maT(318, 182, "남한강", { size: 11, fill: "#3f78ad", rot: 50 })}
${maT(232, 296, "영동고속도로", { size: 11, fill: "#8a7a3c", rot: 34 })}
${maDot(330, 372)}${maPin(88, 154)}`);
}

// 신촌 → 강남 경로 (한강을 건너 약 12km)
function maRouteSinchon() {
  const route = "M86 150 C110 170 130 190 150 214 C170 238 186 252 206 262 C226 272 246 290 262 312 C276 330 290 344 304 356";
  return maSvg(`
<g fill="${MA.block}"><rect x="0" y="0" width="390" height="190" /><rect x="0" y="300" width="390" height="480"/></g>
<path d="M-10 220 C60 210 130 236 200 250 C270 264 330 244 400 236 V300 C330 304 270 322 200 312 C130 300 60 280 -10 286 Z" fill="${MA.water}"/>
<path d="M40 40 C80 30 120 50 130 80 C136 100 110 116 80 112 C50 108 30 80 40 40 Z" fill="${MA.park}"/>
<path d="M300 380 C330 370 370 384 380 410 C386 430 360 444 330 440 C304 436 290 404 300 380 Z" fill="${MA.park}"/>
${maRoad("M-10 160 C120 156 260 160 400 166", 8, true)}
${maRoad("M-10 360 C120 352 260 356 400 362", 8, true)}
${maRoad("M196 120 C200 200 206 260 210 340 C212 400 214 480 216 790", 7)}
${maRoad("M150 214 C170 238 186 252 206 262", 5)}
<path d="${route}" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/>
<path d="${route}" fill="none" stroke="#2f7cf6" stroke-width="6.5" stroke-linecap="round"/>
${maT(80, 128, "신촌", { size: 15, weight: 700, fill: "#5d584b" })}
${maT(318, 394, "강남", { size: 15, weight: 700, fill: "#5d584b" })}
${maT(110, 262, "한강", { size: 13, fill: "#3f78ad" })}
${maT(230, 230, "한남대교", { size: 11 })}
${maDot(86, 150)}${maPin(304, 356)}`);
}

// 지금 화면에 맞는 그림 지도를 고름
function mapArtSvg(route) {
  const o = S?.form?.origin;
  const wonju = o && o !== "current" && /원주/.test(ORIGINS[o]?.name || "");
  if (route) return wonju ? maRouteWonju() : maRouteSinchon();
  if (wonju) return maWonju([175, 300]);
  if (o && o !== "current") return maSinchon([240, 190]); // 신촌 연세대 (출발지를 고친 경우)
  return maSinchon([70, 250]); // 현재 위치 (연희동)
}

// 지도 라이브러리를 못 불러오면 그림 지도 (원래 단순한 길·강 그림 대신)
const _mapArtPlain = mapArt;
mapArt = function (opts = {}) {
  if (window.L) return _mapArtPlain(opts);
  return `<div class="tx-map ma ${opts.route ? "route" : ""}">${mapArtSvg(opts.route)}</div>`;
};
