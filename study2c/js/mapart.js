// =====================================================================
// 마음택시 앱 지도: 실제 지도(Leaflet)를 불러오지 못할 때 보이는 그림 지도
// 실제 위치를 본떠 그림 (대구 용산역 주변 / 서울 용산역 주변 / 대구→강남, 용산→강남 경로)
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
// 경로 지도는 아래쪽이 카드에 가려지므로 지형을 세로로 줄여 위쪽에 모음 (선 굵기는 그대로)
const RY = (y) => Math.round(0.55 * y + 27);
const maSquish = (geo) => `<g transform="matrix(1 0 0 0.55 0 27)">${geo.replace(/<path /g, '<path vector-effect="non-scaling-stroke" ')}</g>`;
const maSvg = (body) => `<svg class="ma-svg" viewBox="0 0 390 780" preserveAspectRatio="xMidYMid slice"><rect width="390" height="780" fill="${MA.land}"/>${body}</svg>`;

// 대구 용산역 주변 (대구 도시철도 2호선, 동서로 지나는 달구벌대로, 북쪽 와룡산, 아파트 단지)
function maDaegu(dot) {
  return maSvg(`
<path d="M0 0 H260 C240 50 200 90 140 104 C90 116 40 120 0 150 Z" fill="${MA.park}"/>
<path d="M300 0 H390 V120 C360 110 330 80 316 50 C308 30 300 14 300 0 Z" fill="${MA.park2}"/>
<g fill="${MA.block}"><rect x="10" y="190" width="110" height="140" rx="6"/><rect x="140" y="170" width="100" height="160" rx="6"/><rect x="260" y="180" width="120" height="150" rx="6"/><rect x="10" y="420" width="110" height="130" rx="6"/><rect x="140" y="420" width="100" height="130" rx="6"/><rect x="260" y="420" width="120" height="130" rx="6"/><rect x="10" y="600" width="170" height="170" rx="6"/><rect x="210" y="600" width="170" height="170" rx="6"/></g>
<g fill="${MA.bldg}"><rect x="22" y="204" width="16" height="44" rx="2"/><rect x="48" y="204" width="16" height="44" rx="2"/><rect x="74" y="204" width="16" height="44" rx="2"/><rect x="22" y="268" width="16" height="44" rx="2"/><rect x="48" y="268" width="16" height="44" rx="2"/><rect x="74" y="268" width="16" height="44" rx="2"/><rect x="152" y="186" width="30" height="40" rx="2"/><rect x="192" y="186" width="36" height="30" rx="2"/><rect x="152" y="250" width="76" height="64" rx="2"/><rect x="272" y="196" width="16" height="48" rx="2"/><rect x="298" y="196" width="16" height="48" rx="2"/><rect x="324" y="196" width="16" height="48" rx="2"/><rect x="350" y="196" width="16" height="48" rx="2"/><rect x="272" y="264" width="16" height="48" rx="2"/><rect x="298" y="264" width="16" height="48" rx="2"/><rect x="324" y="264" width="16" height="48" rx="2"/><rect x="22" y="434" width="40" height="30" rx="2"/><rect x="72" y="440" width="36" height="40" rx="2"/><rect x="152" y="436" width="40" height="34" rx="2"/><rect x="272" y="436" width="16" height="46" rx="2"/><rect x="298" y="436" width="16" height="46" rx="2"/><rect x="324" y="436" width="16" height="46" rx="2"/><rect x="350" y="436" width="16" height="46" rx="2"/></g>
<rect x="160" y="490" width="60" height="44" rx="6" fill="${MA.park2}"/>
${maRoad("M-10 375 H400", 18, true)}
${maRoad("M130 140 V790", 8)}
${maRoad("M250 150 C252 260 250 360 250 790", 9)}
${maRoad("M-10 580 C120 576 260 580 400 584", 7)}
${maSubway(196, 375, "2", "#3cb44a")}
${maT(196, 404, "용산역", { size: 14, weight: 700, fill: "#2e8a3a" })}
${maSubway(370, 375, "2", "#3cb44a")}
${maT(352, 404, "죽전역", { size: 11, fill: "#2e8a3a" })}
${maSubway(22, 375, "2", "#3cb44a")}
${maT(44, 404, "이곡역", { size: 11, fill: "#2e8a3a" })}
${maT(100, 368, "달구벌대로", { size: 12, fill: "#8a7a3c" })}
${maT(120, 60, "와룡산", { size: 14, fill: "#6d8c60" })}
${maT(66, 182, "용산동", { size: 13, fill: "#8a8578" })}
${maT(318, 172, "용산동", { size: 12, fill: "#8a8578" })}
${maT(190, 690, "대구 달서구", { size: 13, fill: "#8a8578" })}
${maT(190, 524, "공원", { size: 11, fill: "#6d8c60" })}
${dot ? maDot(dot[0], dot[1]) : ""}`);
}

// 서울 용산역 주변 (1호선·경의중앙선 철길, 한강대로, 신용산역 4호선, 용산공원, 남쪽 한강)
function maYongsan(dot) {
  return maSvg(`
<path d="M250 0 H390 V230 C350 240 300 220 280 180 C262 140 250 80 250 0 Z" fill="${MA.park}"/>
<path d="M-10 560 C80 540 180 556 260 566 C320 574 360 566 400 556 V680 C330 690 260 680 190 676 C110 672 50 660 -10 670 Z" fill="${MA.water}"/>
<g fill="${MA.block}"><rect x="10" y="20" width="90" height="140" rx="6"/><rect x="10" y="190" width="90" height="150" rx="6"/><rect x="10" y="370" width="90" height="150" rx="6"/><rect x="190" y="250" width="50" height="110" rx="6"/><rect x="270" y="270" width="110" height="100" rx="6"/><rect x="190" y="400" width="190" height="120" rx="6"/><rect x="10" y="700" width="380" height="80" rx="6"/></g>
<g fill="${MA.bldg}"><rect x="22" y="34" width="30" height="40" rx="2"/><rect x="60" y="40" width="30" height="30" rx="2"/><rect x="22" y="206" width="66" height="40" rx="2"/><rect x="22" y="262" width="30" height="60" rx="2"/><rect x="22" y="386" width="40" height="30" rx="2"/><rect x="198" y="262" width="34" height="36" rx="2"/><rect x="282" y="282" width="40" height="34" rx="2"/><rect x="332" y="300" width="36" height="52" rx="2"/><rect x="202" y="414" width="16" height="52" rx="2"/><rect x="228" y="414" width="16" height="52" rx="2"/><rect x="254" y="414" width="16" height="52" rx="2"/><rect x="300" y="420" width="60" height="40" rx="2"/></g>
<rect x="114" y="250" width="56" height="90" rx="6" fill="#e9e1d2"/>
<g stroke="#b9b4aa" stroke-width="2"><path d="M128 -10 V560"/><path d="M140 -10 V560"/><path d="M152 -10 V560"/></g>
<path d="M140 -10 V560" stroke="#b9b4aa" stroke-width="10" stroke-dasharray="1 7" fill="none"/>
${maRoad("M180 -10 C182 120 182 260 186 380 C190 460 196 520 204 790", 14, true)}
${maRoad("M-10 380 C80 382 160 386 400 380", 9)}
${maRoad("M-10 540 C120 530 260 536 400 530", 10, true)}
${maRoad("M240 380 C244 300 250 240 280 180", 6)}
${maSubway(128, 230, "1", "#0d3692")}
${maT(142, 214, "용산역", { size: 14, weight: 700, fill: "#0d3692", anchor: "start" })}
${maT(142, 296, "아이파크몰", { size: 11, fill: "#8a8578", anchor: "middle" })}
${maSubway(214, 300, "4", "#00a2d1")}
${maT(226, 322, "신용산역", { size: 11, fill: "#0b7fa6", anchor: "start" })}
${maT(196, 160, "한강대로", { rot: 90, size: 12, fill: "#8a7a3c" })}
${maT(320, 120, "용산공원", { size: 13, fill: "#6d8c60" })}
${maT(60, 620, "한강", { size: 14, fill: "#3f78ad" })}
${maT(300, 525, "강변북로", { size: 11, fill: "#8a7a3c" })}
${maT(300, 480, "한강로동", { size: 12, fill: "#8a8578" })}
${maT(300, 740, "이촌동", { size: 12, fill: "#8a8578" })}
${dot ? maDot(dot[0], dot[1]) : ""}`);
}

// 대구 용산역 → 강남 경로 (경부고속도로를 따라 약 297km)
function maRouteDaegu() {
  const route = "M330 400 C312 380 296 368 280 352 C262 334 248 316 232 296 C214 274 198 252 182 232 C166 212 150 196 134 182 C118 168 104 160 90 152";
  return maSvg(`${maSquish(`
<path d="M0 0 H170 C150 40 110 60 60 70 C30 76 12 90 0 100 Z" fill="${MA.block}"/>
<path d="M290 420 C320 400 370 404 390 410 V470 C350 470 310 450 290 420 Z" fill="${MA.block}"/>
<path d="M240 150 C280 120 340 130 390 150 V280 C350 280 300 250 270 220 C250 200 230 180 240 150 Z" fill="${MA.park}"/>
<path d="M10 250 C50 230 100 250 110 300 C116 340 80 360 40 356 C10 352 0 320 0 300 Z" fill="${MA.park2}"/>
<path d="M140 330 C170 310 210 320 220 350 C226 372 200 390 170 386 C146 382 130 356 140 330 Z" fill="${MA.park2}"/>
<path d="M-10 124 C30 118 60 110 96 116 C130 122 150 104 180 92 C210 80 240 78 270 70 C300 62 340 40 400 20" fill="none" stroke="${MA.water}" stroke-width="14" stroke-linecap="round"/>
<path d="M186 236 C200 290 230 330 250 380 C262 410 270 440 280 480" fill="none" stroke="${MA.water}" stroke-width="8" stroke-linecap="round"/>
${maRoad("M70 140 C110 160 130 180 150 200 C180 230 210 270 240 306 C270 342 300 372 340 410 C360 428 380 440 400 450", 7, true)}
${maRoad("M90 152 C80 220 70 300 60 420", 5)}
<path d="${route}" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/>
<path d="${route}" fill="none" stroke="#2f7cf6" stroke-width="6.5" stroke-linecap="round"/>
`)}
${maT(50, RY(98), "서울", { size: 15, weight: 700, fill: "#5d584b" })}
${maT(76, RY(182), "강남", { size: 13, weight: 700, fill: "#5d584b" })}
${maT(122, RY(214), "오산", { size: 12 })}
${maT(152, RY(250), "천안", { size: 12 })}
${maT(200, RY(296), "대전", { size: 13, weight: 600 })}
${maT(252, RY(346), "김천", { size: 12 })}
${maT(352, RY(436), "대구", { size: 15, weight: 700, fill: "#5d584b" })}
${maT(150, RY(88), "한강", { size: 12, fill: "#3f78ad" })}
${maT(262, RY(408), "낙동강", { size: 11, fill: "#3f78ad", rot: 60 })}
${maT(220, RY(262), "경부고속도로", { size: 11, fill: "#8a7a3c", rot: 38 })}
${maDot(330, RY(400))}${maPin(90, RY(152))}`);
}

// 서울 용산역 → 강남 경로 (한남대교를 건너 약 10km)
function maRouteYongsan() {
  const route = "M86 140 C96 170 110 196 132 214 C156 232 180 238 204 252 C224 266 236 290 252 316 C268 340 286 352 304 356";
  return maSvg(`${maSquish(`
<g fill="${MA.block}"><rect x="0" y="0" width="390" height="190" /><rect x="0" y="300" width="390" height="480"/></g>
<path d="M-10 220 C60 210 130 236 200 250 C270 264 330 244 400 236 V300 C330 304 270 322 200 312 C130 300 60 280 -10 286 Z" fill="${MA.water}"/>
<path d="M150 40 C200 30 260 50 270 90 C276 120 240 140 200 136 C160 132 130 80 150 40 Z" fill="${MA.park}"/>
<path d="M300 380 C330 370 370 384 380 410 C386 430 360 444 330 440 C304 436 290 404 300 380 Z" fill="${MA.park}"/>
${maRoad("M-10 196 C120 200 260 196 400 190", 8, true)}
${maRoad("M-10 360 C120 352 260 356 400 362", 8, true)}
${maRoad("M86 -10 C88 60 88 110 86 140", 7)}
${maRoad("M204 252 C224 266 236 290 252 316", 6)}
<path d="${route}" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/>
<path d="${route}" fill="none" stroke="#2f7cf6" stroke-width="6.5" stroke-linecap="round"/>
`)}
${maT(72, RY(110), "용산", { size: 15, weight: 700, fill: "#5d584b" })}
${maT(318, RY(394), "강남", { size: 15, weight: 700, fill: "#5d584b" })}
${maT(110, RY(262), "한강", { size: 13, fill: "#3f78ad" })}
${maT(262, RY(270), "한남대교", { size: 11 })}
${maT(210, RY(84), "용산공원", { size: 11, fill: "#6d8c60" })}
${maT(330, RY(186), "강변북로", { size: 10, fill: "#8a7a3c" })}
${maDot(86, RY(140))}${maPin(304, RY(356))}`);
}

// 지금 화면에 맞는 그림 지도를 고름
function mapArtSvg(route) {
  const o = S?.form?.origin;
  const far = o && o !== "current" && /대구/.test(ORIGINS[o]?.name || "");
  if (route) return far ? maRouteDaegu() : maRouteYongsan();
  if (far) return maDaegu([196, 375]);
  if (o && o !== "current") return maYongsan([128, 230]); // 서울 용산역 (출발지를 고친 경우)
  return maYongsan([250, 470]); // 현재 위치 (한강로동)
}

// 지도 라이브러리를 못 불러오면 그림 지도 (원래 단순한 길·강 그림 대신)
const _mapArtPlain = mapArt;
mapArt = function (opts = {}) {
  if (window.L) return _mapArtPlain(opts);
  return `<div class="tx-map ma ${opts.route ? "route" : ""}">${mapArtSvg(opts.route)}</div>`;
};
