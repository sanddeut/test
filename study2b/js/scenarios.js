// 연구2 시나리오 정의 (택시 호출) — classic script, 전역으로 노출
// 연구1 v2(높은 자동화)의 과업·시나리오·오류를 그대로 쓰고, 기존안(연구1 그대로) / 개선안(가이드라인 적용)을 나눕니다.
// 에이전트 고정 문구는 여기서만 관리합니다. 스크립트에 없는 응답은 LLM이 상황에 맞게 생성합니다.

const TAXI_APP = "마음택시";

// 출발지 장소 세트 (설정의 버전으로 고름): dongcheon = 용인 신분당선 동천역(오류: 대구 동천역) / sinchon = 서울 신촌역(오류: 광주 신촌동)
// 코드 안의 키는 두 세트 모두 dongcheon(타려는 곳) · daegu(AI가 잘못 고르는 먼 곳)로 같게 씀
const PLACE_SET = window.__PLACE === "sinchon" ? "sinchon" : "dongcheon";
const SPOT = PLACE_SET === "sinchon"
  ? {
      word: /신촌/, // 참가자가 이 이름을 말하면 타려는 곳(또는 같은 이름의 먼 곳)
      near: /서울|서대문|2호선|연세|이대|신촌역/, far: /광주|광산|송정/, // 어느 쪽인지 가리는 말
      target: { name: "신촌역", addr: "서울 서대문구 신촌동 · 지하철 2호선", lat: 37.55527, lng: 126.93693 },
      wrong: { name: "광주 신촌동", say: "광주광역시 광산구 신촌동", addr: "광주광역시 광산구 신촌동 · 송정역 부근", lat: 35.1530, lng: 126.8030, ic: "location_on" },
      query: "신촌",
      others: [{ key: null, name: "신촌역 버스정류장", addr: "서울 서대문구 신촌로" }],
      geo: { lat: 37.56592, lng: 126.93675, label: "서울 서대문구 연희동" },
      road: { gangnam: 14.2, gucheong: 13.6, yeoksam: 13.8, drop: 14.0 }, // 신촌역에서의 도로 거리(km)
      situ: "택시는 집 근처 ‘신촌역’(서울 서대문구)에서 타려고 합니다.",
      taskFrom: "‘신촌역’",
    }
  : {
      word: /동천/,
      near: /용인|신분당|수지|경기/, far: /대구/,
      target: { name: "신분당선 동천역", addr: "경기 용인시 수지구 동천동", lat: 37.33797, lng: 127.10278 },
      wrong: { name: "대구 동천역", say: "대구광역시 북구 동천역", addr: "대구광역시 북구 동천동 · 대구 도시철도 3호선", lat: 35.94246, lng: 128.55945 },
      query: "동천역",
      others: [{ key: null, name: "동천역 버스정류장", addr: "경기 용인시 수지구 동천로" }],
      geo: { lat: 37.39475, lng: 127.11118, label: "경기 성남시 분당구 삼평동" }, // 판교역 부근
      road: { gangnam: 21.2, gucheong: 23.5, yeoksam: 21.9, drop: 21.0 }, // 신분당선 동천역에서의 도로 거리(km)
      situ: "택시는 집 근처 ‘동천역’(경기 용인시 수지구)에서 타려고 합니다.",
      taskFrom: "‘동천역’",
    };

// 목적지 검색 결과 (같은 이름의 여러 지점). road: 타려는 출발지에서의 도로 거리(km, 고정값)
const PLACES = {
  gangnam: { name: "담소한정식 강남점", addr: "서울 강남구 테헤란로 152", lat: 37.50007, lng: 127.03651, road: SPOT.road.gangnam },
  gucheong: { name: "담소한정식 강남구청점", addr: "서울 강남구 학동로 426", lat: 37.51729, lng: 127.04736, road: SPOT.road.gucheong },
  yeoksam: { name: "담소한정식 역삼점", addr: "서울 강남구 논현로 508", lat: 37.50375, lng: 127.03983, road: SPOT.road.yeoksam },
  // 연구2 오류(블랙박스): 에이전트가 이유를 말하지 않고 바꾸는 하차 지점
  drop: { name: "역삼역 2번 출구", addr: "서울 강남구 테헤란로 지하 156", lat: 37.50069, lng: 127.03722, road: SPOT.road.drop },
};

// 출발지: 기본은 휴대폰 GPS의 현재 위치, 과업에서 ‘신분당선 동천역’으로 바꿈
// (현재 위치 좌표는 세션 시작 때 받아서 S.geo에 둠. 위치를 못 받으면 GEO_FALLBACK)
const TARGET_ORIGIN = "dongcheon";
// 연구2 오류 세트: 1 = 택시 2대로 잘못 이해, 2 = 같은 이름의 '대구 동천역'으로 판단 (설정에서 기존안1·2, 개선안1·2로 고름)
const ERR_SET = window.__ERRSET === 2 ? 2 : 1;
const WRONG_ORIGIN = "daegu";
const ORIGINS = {
  current: { name: "현재 위치" },
  dongcheon: SPOT.target,
  // say: AI가 말할 때 쓰는 이름 (잘못 정한 곳이 먼 곳이라는 걸 알아보기 쉽게 시·도까지 말함)
  daegu: SPOT.wrong,
};
const GEO_FALLBACK = SPOT.geo;
const ORIGIN_QUERY = SPOT.query;
// 출발지 검색 결과 (신분당선 동천역만 고를 수 있음)
const ORIGIN_RESULTS = ERR_SET === 2
  ? [
      // 오류 세트 2: 같은 이름의 곳이 두 곳 (AI는 맨 위의 먼 곳을 고름)
      { key: "daegu", name: SPOT.wrong.name, addr: SPOT.wrong.addr, ic: SPOT.wrong.ic },
      { key: "dongcheon", name: SPOT.target.name, addr: SPOT.target.addr },
      ...SPOT.others,
    ]
  : [
      { key: "dongcheon", name: "신분당선 동천역", addr: "경기 용인시 수지구 동천동 · 지하철역" },
      { key: null, name: "동천역 버스정류장", addr: "경기 용인시 수지구 동천로" },
      { key: null, name: "동천역 환승주차장", addr: "경기 용인시 수지구 동천동 876" },
    ];
// 출발지 검색 결과에 있는 역인지 (검색해서 고르는 과정을 보여 줄 수 있는 곳)
const originInResults = (k) => ORIGIN_RESULTS.some((r) => r.key && r.key === k);

// 받침이 있으면 "으로", 없으면 "로" (ㄹ 받침은 "로")
// ‘이름’ 뒤의 조사를 이름에 맞게 (참가자가 말한 장소 이름이 들어가도 자연스럽게): 을/를, 으로/로, 은/는
function fixJosa(text) {
  return String(text).replace(/‘([^’]+)’(으로|로|을|를|은|는)(?=[\s.,?!]|$)/g, (m, w, j) => {
    const c = w.trim().slice(-1).charCodeAt(0);
    if (c < 0xac00 || c > 0xd7a3) return m;
    const jong = (c - 0xac00) % 28;
    const has = jong !== 0;
    const pick = j === "으로" || j === "로" ? (has && jong !== 8 ? "으로" : "로") : j === "을" || j === "를" ? (has ? "을" : "를") : has ? "은" : "는";
    return `‘${w}’${pick}`;
  });
}

function euro(word) {
  const c = String(word).trim().slice(-1).charCodeAt(0);
  if (c < 0xac00 || c > 0xd7a3) return `${word}으로`;
  const jong = (c - 0xac00) % 28;
  return `${word}${jong === 0 || jong === 8 ? "로" : "으로"}`;
}

// 출발지 좌표
function originPoint(key, geo) {
  if (key === "current") return geo || GEO_FALLBACK;
  return ORIGINS[key];
}
// 출발지 이름 (현재 위치는 동네 이름을 함께)
function originLabel(key, geo) {
  if (key !== "current") return ORIGINS[key].name;
  const g = geo || GEO_FALLBACK;
  return g.label ? `현재 위치 · ${g.label}` : "현재 위치";
}

// 참가자가 말한 출발지(동천역·현재 위치 외)를 그대로 출발지로 등록. 좌표는 현재 위치 근처로 두고, 지도 검색이 되면 그 위치로 옮김
function setCustomOrigin(name, geo) {
  const g = geo || GEO_FALLBACK;
  ORIGINS.custom = { name, addr: "", lat: g.lat, lng: g.lng };
  try {
    fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&accept-language=ko&q=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((j) => {
        const hit = j?.[0];
        if (!hit || ORIGINS.custom?.name !== name) return;
        Object.assign(ORIGINS.custom, { lat: +hit.lat, lng: +hit.lon, addr: (hit.display_name || "").split(",").slice(0, 3).join(",") });
        if (typeof renderPhone === "function") renderPhone();
      })
      .catch(() => {});
  } catch { /* 좌표는 현재 위치 근처 그대로 */ }
  return "custom";
}

// 참가자가 말한 목적지(담소한정식 세 지점 외)를 그대로 목적지로 등록 (참가자가 말한 대로 '틀리게' 호출할 수 있게)
// 좌표는 우선 강남점 근처로 두고, 지도 검색이 되면 그 위치로 옮김
function setCustomPlace(name) {
  const base = PLACES[TARGET_PLACE];
  PLACES.custom = { name, addr: "", lat: base.lat + 0.02, lng: base.lng + 0.015 };
  try {
    fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&accept-language=ko&q=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((j) => {
        const hit = j?.[0];
        if (!hit || PLACES.custom?.name !== name) return;
        Object.assign(PLACES.custom, { lat: +hit.lat, lng: +hit.lon, addr: (hit.display_name || "").split(",").slice(0, 3).join(",") });
        if (typeof renderPhone === "function") renderPhone();
      })
      .catch(() => {});
  } catch { /* 좌표는 기본값 그대로 */ }
  return "custom";
}

// 거리(km): 동천역에서는 고정값, 현재 위치·참가자가 말한 출발지에서는 직선거리 × 1.35 (도로 거리 근사)
function roadKm(o, d) {
  const R = 6371, rad = Math.PI / 180;
  const a = Math.sin(((d.lat - o.lat) * rad) / 2) ** 2 + Math.cos(o.lat * rad) * Math.cos(d.lat * rad) * Math.sin(((d.lng - o.lng) * rad) / 2) ** 2;
  return Math.max(0.5, Math.round(2 * R * Math.asin(Math.sqrt(a)) * 1.35 * 10) / 10);
}
function distKm(originKey, destKey, geo) {
  const d = PLACES[destKey];
  if (originKey === TARGET_ORIGIN && d.road) return d.road;
  return roadKm(originPoint(originKey, geo), d);
}
// 출발지 카드: 현재 위치에서 출발지까지 거리 (대구 동천역처럼 먼 곳을 알아보기 쉽게, 두 안 동일)
const hereText = (originKey, geo) => (ORIGINS[originKey]?.lat ? `현재 위치에서 ${Math.round(roadKm(originPoint("current", geo), ORIGINS[originKey]))}km` : "");
const distText = (originKey, destKey, geo) => `${distKm(originKey, destKey, geo).toFixed(1)}km`;
const SEARCH_ORDER = ["gucheong", "gangnam", "yeoksam"]; // '담소한정식' 검색 결과 순서
const SEARCH_QUERY = "담소한정식";
const TARGET_PLACE = "gangnam"; // 참가자가 요청하는 목적지
const AGENT_PLACE = TARGET_PLACE; // 목적지는 정상으로 찾음
// 연구2 오류 ① 잘못 알아들음: 처음 요청의 앞 두 번은 무슨 말을 하든 알아듣지 못함 (두 안 동일)
const MISHEAR_COUNT = 1; // 처음 요청을 한 번만 알아듣지 못함 (두 번째 문구 · 개선안은 G3 다른 입력 방법까지)
const DROP_PLACE = "drop"; // (이전 설계: 하차 지점 변경. 지금은 쓰지 않음)
const USE_DROP = false;
// 연구2 오류 ② 잘못 실행: 처음 요청을 '택시 2대'로 잘못 알아들어, 최종 호출 확인 때 드러남 (두 안 동일)
const WRONG_COUNT = 2;
// 연구2 기존안: 택시 종류·최종 호출은 개선안과 같은 단계에서 묻되, 연구1 낮은 자동화 문구 그대로 (app.js ASK_STEPS)
const BASE_ASKS = true;

// 세션별 오류 (연구1 v2 최종 시나리오)
// - 세션1: 최종 확인 다음, 에이전트가 묻지 않고 기사님 요청사항을 '기사님과 이야기 나누며 가고 싶어요'로 선택
// - 세션2: 호출 완료 후, 묻지 않고 최근 3개월 이용내역을 열람하고 다음 주 토요일 같은 시간 예약 호출을 제안·등록
const SESSIONS = {
  // 연구2: 두 안에 같은 통제감 상실 유발 상황 2개 (연구1의 세션1·2 오류 단계는 쓰지 않음)
  0: ERR_SET === 2 ? { title: `연구2 · 잘못 알아들음 + ${euro(SPOT.wrong.name)} 판단`, error: "mishear_origin" } : { title: "연구2 · 잘못 알아들음 + 택시 2대로 잘못 이해", error: "mishear_count" },
  1: { title: "세션1 · 기사님 요청사항 임의 선택", error: "request" },
  2: { title: "세션2 · 이용내역 열람 + 예약 호출", error: "reserve" },
};
const REQUESTS = {
  none: "요청사항 없음",
  chat: "기사님과 이야기 나누며 가고 싶어요",
  quiet: "조용히 가주세요",
};
const AGENT_REQUEST = "chat";
// 참가자에게 보여주는 선택지 ("요청사항 없음"은 기본값이라 목록에는 넣지 않음)
const REQUEST_CHOICES = ["chat", "quiet"];
// 세션2: 최근 3개월 이용내역 (매주 토요일 담소한정식 강남점)
const RIDE_HISTORY = ["09.26", "09.19", "09.12", "09.05", "08.29", "08.22"].map((d) => ({ date: `2026.${d} (토)`, time: "오후 6:20", to: "담소한정식 강남점", fare: 16000 }));
const RESERVE = { when: "10월 10일 토요일 오후 6:20", short: "다음 주 토요일(10월 10일) 오후 6시 20분" };

// 예상 요금(동천역 → 강남점): 일반택시 16,000원 / 모범택시 18,000원 / 대형택시 20,000원
// 모범택시에 쿠폰(2,000원)을 적용하면 일반택시와 같은 16,000원
const CAR_TYPES = {
  normal: { label: "일반택시", desc: "가까운 택시를 빠르게", extra: 0 },
  deluxe: { label: "모범택시", desc: "넓고 편안한 차량", extra: 2000 },
  large: { label: "대형택시", desc: "6인 이상 · 짐이 많을 때", extra: 4000 },
};

const PAY = {
  auto: { label: "자동결제", desc: "마음카드 ****1234" },
  direct: { label: "직접결제", desc: "내릴 때 기사님께 결제" },
};

const COUPON = { name: "가을맞이 2,000원 할인 쿠폰", amount: 2000 };
// 쿠폰 (B에만): 앱에 쿠폰이 있고 참가자가 요청하면(중지·최종 확인 거부·직접 조작) 적용할 수 있음
const USE_COUPON = true;
// 쿠폰 단계 사용 여부: 단계는 있지만 기본값은 '적용 안 함' (에이전트가 쿠폰을 쓰자고 권하지 않음)
// 낮은 자동화: "쿠폰은 적용하지 않고 진행할까요?" → 거부하면 적용 여부를 고름 / 높은 자동화: "쿠폰은 적용하지 않았어요." → 중지해서 적용
const COUPON_STEP = true;
// 결제 방식 단계 사용 여부 (최종: 결제는 기본값인 자동결제로 미리 하고, 호출 전에 결제 비밀번호를 직접 입력)
const USE_PAY_STEP = false;

// 연구2: 자동화 수준은 높음으로 고정. 버전(기존안/개선안) × 과업 복잡도(A/B)
// guide=true: 가이드라인 적용 개선안 (중요한 결정만 먼저 묻고 사소한 단계는 알리고 진행 · 가이드라인 18)
const CONDITIONS = {
  A2: { complexity: "A", automation: "high", guide: false, title: "A · 기존안 (연구1 높은 자동화)" },
  B2: { complexity: "B", automation: "high", guide: false, title: "B · 기존안 (연구1 높은 자동화)" },
  A2G: { complexity: "A", automation: "high", guide: true, title: "A · 개선안 (가이드라인 적용)" },
  B2G: { complexity: "B", automation: "high", guide: true, title: "B · 개선안 (가이드라인 적용)" },
  // 개선안(v4 화면, improve.js): 묻는 단계는 낮은 자동화 문구로 묻고, 나머지는 improve.js가 알리고 진행
  B1: { complexity: "B", automation: "low", guide: false, title: "B · 개선안 (가이드라인 적용)" },
};
const condKey = (complexity, guide) => `${complexity}2${guide ? "G" : ""}`;

const SITUATION = {
  A: {
    situation: [
      "오늘 저녁 7시에 동창회 모임이 있습니다. 모임 장소는 ‘담소한정식 강남점’입니다.",
      "지하철을 타기엔 계단이 많고 다리가 아파서, 편하게 택시를 타고가려 합니다.",
      "택시는 ‘신분당선 동천역’에서 타려고 합니다.",
    ],
    task: ["AI와 대화를 하며 ‘신분당선 동천역’에서 ‘담소한정식 강남점’까지 가는 택시를 불러주세요."],
  },
  B: {
    situation: [
      "오늘 저녁 7시에 동창회 모임이 있습니다. 모임 장소는 ‘담소한정식 강남점’입니다.",
      "오늘 정장을 입었기 때문에, 편하게 모범택시를 타고 가려고 합니다.",
      ERR_SET === 2 ? SPOT.situ : "택시는 ‘신분당선 동천역’에서 타려고 합니다.",
      "가지고 계신 할인쿠폰이 1장 있어서, 이걸 사용하려 합니다.",
    ],
    task: [
      ERR_SET === 2 ? `AI와 대화를 하며 ${SPOT.taskFrom}에서 ‘담소한정식 강남점’까지 가는 택시를 불러주세요.` : "AI와 대화를 하며 ‘신분당선 동천역’에서 ‘담소한정식 강남점’까지 가는 택시를 불러주세요.",
      "택시종류는 ‘모범택시’로 선택해주세요.",
      "택시비 결제 전에, 할인쿠폰을 적용해주세요.",
    ],
  },
};

const won0 = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;

// 예상 요금: 거리 요금(기본 4,800원 + 1.6km 이후 km당 약 571원 → 동천역~강남점 21.2km = 16,000원) + 택시 종류 추가 요금 − 쿠폰
function fareOf(f, destKey = f.dest) {
  const km = distKm(f.origin || "current", destKey || TARGET_PLACE, typeof S !== "undefined" ? S?.geo : null);
  const base = 4800 + Math.max(0, km - 1.6) * (11200 / 19.6);
  const fare = Math.round(base / 100) * 100 + CAR_TYPES[f.car].extra;
  return Math.max(0, fare * (f.count || 1) - (f.coupon ? COUPON.amount : 0)); // 호출 대수만큼 (쿠폰은 한 번)
}

// 승인/거부 버튼 순서: 거부(왼쪽) · 승인(오른쪽)
const APPROVE = [
  { id: "reject", label: "거부" },
  { id: "approve", label: "승인" },
];

// =====================================================================
// 시나리오 문구 (설정 화면에서 조건별로 수정 가능)
// - 한 줄 = 말풍선 하나
// - 자리표시자: {출발지} {목적지} {택시종류} {결제} {쿠폰} {요금} {요청사항} {이름}
// =====================================================================
const SCRIPT_VARS = ["출발지", "목적지", "택시종류", "결제", "쿠폰", "요금", "요청사항", "이름", "단계", "지금단계", "나중단계", "값"];

// 조건별 기본 문구 목록 (화면에 보이는 순서대로)
function scriptDefaults(cond) {
  if (CONDITIONS[cond].guide) return guideScriptDefaults(cond);
  const { complexity, automation } = CONDITIONS[cond];
  const B = complexity === "B";
  const low = automation === "low";
  const L = [];
  const add = (key, group, label, text) => L.push({ key, group, label, text });

  add("greet", "시작", "첫 인사", "무엇을 도와드릴까요?");
  add("mishear", "[오류] 잘못 알아들음", "처음 요청의 1번째 입력 (알아듣지 못함 · 2번째와 다른 문구)", "죄송해요, 무슨 말씀인지 잘 모르겠어요.");
  add("mishear.2", "[오류] 잘못 알아들음", "처음 요청의 2번째 입력", "죄송해요, 알아듣지 못했어요. 다시 한번 말해 주세요.");
  add("mishear.2g", "[개선안] 잘못 알아들음 (G3)", "처음 요청의 2번째 입력 (못 한 이유와 다시 할 방법)", "죄송해요, 말씀을 알아듣지 못했어요. 어디에서 어디로 갈지 다시 한번 말해 주세요.");

  if (low) {
    add("taxi_open", "택시 앱 실행", "승인 요청", "택시 앱을 실행할까요?");
    add("app.which", "택시 앱 실행", "거부 시", "어떤 앱으로 실행할까요?");
    add("taxi_open.launched", "택시 앱 실행", "거부 후 택시 앱을 말했을 때", "택시 앱을 실행할게요.");
  } else add("taxi_open", "택시 앱 실행", "안내", "택시 앱을 실행할게요.");
  add("taxi_open.opening", "택시 앱 실행", "진행 문구 (앱을 여는 동안)", "택시 앱을 열고 있어요 …");

  if (low) {
    add("origin", "출발지 설정", "승인 요청 (처음 요청에서 말한 출발지)", "출발지를 ‘{출발지}’(으)로 설정할까요?");
    add("origin.ask", "출발지 설정", "거부 시 · 처음 요청에 출발지가 없을 때", "출발지를 어디로 할까요?");
    add("origin.confirm", "출발지 설정", "출발지를 말했을 때 (다시 묻지 않고 진행)", "출발지를 ‘{출발지}’(으)로 설정할게요.");
    add("origin.skip", "출발지 설정", "현재 위치를 말했을 때 (다시 묻지 않고 진행)", "출발지를 현재 위치로 설정할게요.");
  } else {
    add("origin", "출발지 설정", "안내 (처음 요청에서 말한 출발지)", "말씀하신 ‘{출발지}’(으)로 출발지를 설정했어요.");
    add("origin.ask", "출발지 설정", "처음 요청에 출발지가 없을 때", "출발지를 어디로 할까요?");
    add("origin.confirm", "출발지 설정", "출발지를 말했을 때", "출발지를 ‘{출발지}’(으)로 설정할게요.");
    add("origin.skip", "출발지 설정", "현재 위치를 말했을 때", "출발지를 현재 위치로 설정할게요.");
  }

  add("dest.busy", "목적지 설정", "진행 문구 (검색 중)", "목적지를 검색하고 있어요 …");
  if (low) {
    add("dest", "목적지 설정", "승인 요청", "‘{목적지}’을 찾았어요. 여기로 갈까요?");
    add("dest.ask", "목적지 설정", "거부 시", "어디로 갈까요?");
    add("dest.confirm", "목적지 설정", "목적지를 말했을 때 (다시 묻지 않고 진행)", "‘{목적지}’으로 갈게요.");
    add("dest.reask", "목적지 설정", "미리 말한 목적지·중지 후 다시 물을 때", "‘{목적지}’으로 갈까요?");
  } else {
    add("dest", "목적지 설정", "안내", "‘{목적지}’을 목적지로 설정했어요.");
  }

  if (B) {
    if (low || BASE_ASKS) {
      add("car", "택시 종류 확인", "승인 요청 (기본 일반택시 · 처음 요청에서 말했으면 그 택시)", "택시 종류는 {택시종류}예요. 이대로 진행할까요?");
      add("car.ask", "택시 종류 확인", "거부 시", "어떤 택시로 할까요?");
      add("car.set", "택시 종류 확인", "택시 종류를 말했을 때 (다시 묻지 않고 진행)", "{택시종류}로 할게요.");
    } else {
      add("car", "택시 종류 확인", "안내 (기본 일반택시)", "택시 종류는 {택시종류}예요.");
      add("car.req", "택시 종류 확인", "안내 (처음 요청에서 말한 택시 종류)", "말씀하신 {택시종류}로 바꿨어요.");
    }
  }

  // 결제 방식 단계 (최종 시나리오에서는 사용 안 함: 모든 조건이 자동결제)
  if (B && USE_PAY_STEP) {
    if (low) add("pay", "결제 방식", "선택 요청", "결제 방식이 2개예요. 어떻게 결제할까요?");
    else add("pay", "결제 방식", "안내", "말씀하신 {결제}로 바꿨어요.");
  }

  if (B && USE_COUPON && COUPON_STEP) {
    if (low) {
      add("coupon", "예상 금액 확인", "승인 요청 (쿠폰은 기본 적용 안 함)", "예상 금액은 {요금}이에요. 이대로 진행할까요?");
      add("coupon.ask", "예상 금액 확인", "거부 시", "무엇을 바꿀까요?");
      add("coupon.on", "예상 금액 확인", "쿠폰을 적용하라고 했을 때 (다시 묻지 않고 진행)", "‘{쿠폰}’을 적용할게요.");
      add("coupon.skip", "예상 금액 확인", "그대로 진행할 때", "이대로 진행할게요.");
    } else add("coupon", "예상 금액 확인", "안내 (쿠폰은 기본 적용 안 함)", "예상 금액은 {요금}이에요.");
  add("drop", "[오류] 하차 지점 변경", "안내 (바꾼 뒤 알림 · 이유 없음)", "하차 지점을 ‘{하차}’로 변경했어요.");
  add("drop.announce", "[개선안] 하차 지점 변경 (G5·G11·G16)", "바꾸기 전에 알림 → 읽을 시간 뒤 진행 (이유 없음)", "하차 지점을 ‘{하차}’로 변경할게요.");
  add("drop.why", "[개선안] 하차 지점 변경 (G10)", "「이유 보기」를 눌렀을 때", "가게 앞은 차를 세우기 어려워서, 가장 가까운 ‘{하차}’로 바꾸려고 해요.");
  add("origin.announce", "[개선안] 출발지 설정 (G5·G11)", "먼저 알림 → 읽을 시간 뒤 진행", "출발지를 ‘{출발지}’(으)로 할게요.");
  add("dest.announce", "[개선안] 목적지 설정 (G5·G11)", "먼저 알림 → 읽을 시간 뒤 진행", "‘{목적지}’을 찾았어요. 여기로 갈게요.");
  }

  if (low || BASE_ASKS) {
    add("final", "최종 호출 확인", "승인 요청", "호출 내용을 최종 확인해주세요.");
    add("final.ask", "최종 호출 확인", "거부 시", "무엇을 수정할까요?");
  } else add("final", "최종 호출 확인", "안내", "‘{목적지}’으로 가는 {택시종류}를 호출할게요.");

  // [세션1 오류] 기사님 요청사항 임의 선택
  if (low) {
    add("request", "[세션1 오류] 기사님 요청사항", "승인 요청", "‘{요청사항}’를 추천해요.");
    add("request.ask", "[세션1 오류] 기사님 요청사항", "거부 시", "기사님 요청사항을 어떻게 할까요?");
    add("request.confirm", "[세션1 오류] 기사님 요청사항", "요청사항을 고른 뒤", "기사님 요청사항을 ‘{요청사항}’로 바꿨어요. 이렇게 호출할게요.");
  } else add("request", "[세션1 오류] 기사님 요청사항", "안내", "‘{요청사항}’를 추천해요.");
  add("change.request", "[세션1 오류] 기사님 요청사항", "중지 중 요청사항을 바꿨을 때", "기사님 요청사항을 ‘{요청사항}’로 바꿨어요.");
  if (low) add("request.none.confirm", "[세션1 오류] 기사님 요청사항", "요청사항을 뺀 뒤", "기사님 요청사항을 뺐어요. 이렇게 호출할게요.");
  add("change.request.none", "[세션1 오류] 기사님 요청사항", "중지 중 요청사항을 뺐을 때", "기사님 요청사항을 뺐어요.");

  add("password", "[직접조작] 결제 비밀번호", "안내", "결제를 위해 결제 비밀번호 입력이 필요해요. 택시 앱을 열어 직접 입력해주세요.");
  add("done.busy", "완료 안내", "진행 문구 (택시를 찾는 동안)", "택시를 찾고 있어요 …");
  add("done", "완료 안내", "안내", "{택시종류}를 호출했어요. 기사님이 3분 뒤 도착해요.");
  add("done.multi", "완료 안내", "안내 (호출 대수가 2대 이상)", "{택시종류} {대수}대를 호출했어요. 기사님이 3분 뒤 도착해요.");
  add("count", "[오류] 택시 2대로 잘못 이해", "예상 금액 확인 직전 (처음 요청을 2대로 잘못 알아들음)", "처음에 말씀하신 대로 택시 {대수}대를 부를게요.");
  add("count.announce", "[오류] 택시 2대로 잘못 이해 (개선안)", "예상 금액 확인 직전 · 알리고 읽을 시간 뒤 진행 (G5·G11·G16)", `처음에 말씀하신 대로 택시 ${WRONG_COUNT}대를 부를게요.`);
  add("change.count", "중지·수정", "호출 대수를 바꿨을 때", "택시를 {대수}대로 바꿨어요.");

  // [세션2 오류] 이용내역 열람 + 예약 호출
  if (low) {
    add("reserve", "[세션2 오류] 이용내역 열람 + 예약 호출", "승인 요청", "최근 3개월 이용내역을 확인해 보니, 매주 토요일 담소한정식 강남점에 가신 기록이 있어요.\n다음 주 토요일에도 같은 시간에 택시를 예약할까요?");
    add("reserve.no", "[세션2 오류] 이용내역 열람 + 예약 호출", "거부 시", "다음 주 택시는 예약하지 않을게요.");
  } else {
    add("reserve", "[세션2 오류] 이용내역 열람 + 예약 호출", "안내", "최근 3개월 이용내역을 확인해 보니, 매주 토요일 담소한정식 강남점에 가신 기록이 있어요.\n다음 주 토요일에도 같은 시간에 택시를 예약할게요.");
  }
  add("reserve.yes", "[세션2 오류] 이용내역 열람 + 예약 호출", "예약한 뒤", "다음 주 토요일(10월 10일) 오후 6시 20분 택시를 예약했어요.");
  add("reserve.cancel", "[세션2 오류] 이용내역 열람 + 예약 호출", "중지 중 예약을 취소했을 때", "택시 예약을 취소했어요.");

  add("stop.ask", "중지·직접 조작", "중지를 눌렀을 때", "진행을 멈췄어요. 어떻게 바꿀까요?");
  add("stop.ask.reserve", "[세션2 오류] 이용내역 열람 + 예약 호출", "예약 중 중지를 눌렀을 때", "예약을 멈췄어요. 무엇을 수정할까요?");
  add("change.origin", "중지·직접 조작", "중지 중 출발지를 정했을 때", low ? "출발지를 ‘{출발지}’(으)로 설정할게요." : "출발지를 ‘{출발지}’(으)로 설정했어요.");
  add("change.dest", "중지·직접 조작", "중지 중 목적지를 바꿨을 때", low ? "목적지를 ‘{목적지}’으로 바꿀게요." : "목적지를 ‘{목적지}’으로 바꿨어요.");
  if (B) add("change.car", "중지·직접 조작", "중지 중 택시 종류를 바꿨을 때", "택시 종류를 {택시종류}로 바꿨어요.");
  add("change.pay", "중지·직접 조작", "중지 중 결제 방식을 바꿨을 때", "결제 방식을 {결제}로 바꿨어요.");
  if (B && USE_COUPON) {
    add("change.coupon.on", "중지·직접 조작", "중지 중 쿠폰을 적용했을 때", "‘{쿠폰}’을 적용했어요.");
    add("change.coupon.off", "중지·직접 조작", "중지 중 쿠폰을 뺐을 때", "쿠폰 적용을 취소했어요.");
  }
  add("stop.continue", "중지·직접 조작", "계속하기를 눌렀을 때", "계속 진행할게요.");
  add("cancel", "기타", "호출을 취소했을 때", "택시 호출을 취소했어요.");
  return L;
}

// 개선안(가이드라인 적용) 문구. 괄호 안 G번호 = 가이드라인 번호 (연구2 가이드라인 2안 · CUA 디자인 스페이스 분류)
function guideScriptDefaults(cond) {
  const B = CONDITIONS[cond].complexity === "B";
  const L = [];
  const add = (key, group, label, text) => L.push({ key, group, label, text });

  add("greet", "시작", "첫 인사", "무엇을 도와드릴까요?");
  add("mishear", "[오류] 잘못 알아들음", "처음 요청의 1번째 입력 (알아듣지 못함 · 기존안과 같음)", "죄송해요, 무슨 말씀인지 잘 모르겠어요.");
  add("mishear.2", "[오류] 잘못 알아들음 (G3)", "처음 요청의 2번째 입력 (못 한 이유와 다시 할 방법)", "죄송해요, 말씀을 알아듣지 못했어요. 어디에서 어디로 갈지 다시 한번 말해 주세요.");
  add("greet.howto", "시작", "첫 말풍선 안 입력 방법 안내 (G1)", "이렇게 대화를 시작해 보세요\n1. 아래 ‘눌러서 대화 시작’을 눌러요\n2. 말로 할지, 글로 할지 골라요");

  add("taxi_open", "택시 앱 실행 (알리고 진행 · G18)", "안내", "택시 앱을 실행할게요.");
  add("taxi_open.opening", "택시 앱 실행 (알리고 진행 · G18)", "진행 문구 (앱을 여는 동안)", "택시 앱을 열고 있어요 …");

  add("origin.auto", "출발지 설정 (알리고 진행 · G5·G11·G16)", "[확인 범위 좁게] 먼저 알림 → 읽을 시간 뒤 진행", "출발지를 ‘{출발지}’(으)로 할게요.");
  add("origin", "출발지 설정 (먼저 확인 · G5·G14·G18)", "[확인 범위 넓게] 확인 요청 (처음 요청에서 말한 출발지)", "출발지를 ‘{출발지}’(으)로 할까요?");
  add("origin.ask", "출발지 설정 (먼저 확인 · G5·G14·G18)", "처음 요청에 출발지가 없을 때", "출발지를 어디로 할까요?");
  add("origin.edit", "출발지 설정 (먼저 확인 · G5·G14·G18)", "[수정]을 누른 뒤 (G15·G17)", "출발지를 어디로 할까요? 목록에서 고르거나 말씀해 주세요.");
  add("origin.confirm", "출발지 설정 (먼저 확인 · G5·G14·G18)", "출발지를 정했을 때", "출발지를 ‘{출발지}’(으)로 할게요.");
  add("origin.skip", "출발지 설정 (먼저 확인 · G5·G14·G18)", "현재 위치를 골랐을 때", "출발지를 현재 위치로 할게요.");

  add("dest.busy", "목적지 설정 (먼저 확인 · G5·G14·G18)", "진행 문구 (검색 중)", "목적지를 검색하고 있어요 …");
  add("dest.auto", "목적지 설정 (알리고 진행 · G5·G11·G16)", "[확인 범위 좁게] 먼저 알림 → 읽을 시간 뒤 진행", "‘{목적지}’을 찾았어요. 여기로 갈게요.");
  add("dest", "목적지 설정 (먼저 확인 · G5·G14·G18)", "[확인 범위 넓게] 확인 요청 (고르기 전에)", "‘{목적지}’을 찾았어요. 여기가 맞나요?");
  add("dest.edit", "목적지 설정 (먼저 확인 · G5·G14·G18)", "[수정]을 누른 뒤 (G15·G17)", "어디로 갈까요? 목록에서 고르거나 말씀해 주세요.");
  add("dest.confirm", "목적지 설정 (먼저 확인 · G5·G14·G18)", "목적지를 정했을 때", "‘{목적지}’으로 갈게요.");

  if (B) {
    add("car", "택시 종류 (먼저 물음 · G18·G20)", "선택 요청 (AI가 미리 정하지 않음)", "택시 종류를 고를 수 있어요. 어떤 택시로 할까요?");
    add("car.set", "택시 종류 (먼저 물음 · G18·G20)", "택시 종류를 골랐을 때", "{택시종류}로 할게요.");
    add("car.req", "택시 종류 (먼저 물음 · G18·G20)", "처음 요청·진행 중에 미리 말했을 때", "말씀하신 {택시종류}로 할게요.");
    add("coupon", "예상 금액 (알리고 진행 · G18)", "안내 (쿠폰은 기본 적용 안 함)", "예상 금액은 {요금}이에요.");
  add("drop", "[오류] 하차 지점 변경 (알리고 진행 · G5·G11·G16)", "바꾸기 전에 알림 → 읽을 시간 뒤 진행 (이유 없음)", "하차 지점을 ‘{하차}’로 변경할게요.");
  add("drop.why", "[오류] 하차 지점 변경 (G10)", "「이유 보기」를 눌렀을 때 (원할 때만 부가 정보)", "가게 앞은 차를 세우기 어려워서, 가장 가까운 ‘{하차}’로 바꾸려고 해요.");
  }

  add("request", "[세션1] 기사님 요청사항 (먼저 물음 · G20)", "선택 요청 (AI가 고르지 않음)", "기사님께 전할 요청사항을 고를 수 있어요. 어떻게 할까요?");
  add("request.set", "[세션1] 기사님 요청사항 (먼저 물음 · G20)", "요청사항을 골랐을 때", "기사님 요청사항을 ‘{요청사항}’로 할게요.");
  add("request.none", "[세션1] 기사님 요청사항 (먼저 물음 · G20)", "요청사항 없음을 골랐을 때", "기사님 요청사항 없이 호출할게요.");
  add("change.request", "[세션1] 기사님 요청사항 (먼저 물음 · G20)", "멈춘 뒤·수정에서 요청사항을 바꿨을 때", "기사님 요청사항을 ‘{요청사항}’로 바꿨어요.");
  add("change.request.none", "[세션1] 기사님 요청사항 (먼저 물음 · G20)", "멈춘 뒤·수정에서 요청사항을 뺐을 때", "기사님 요청사항을 뺐어요.");

  add("final", "최종 호출 확인 (먼저 확인 · G14·G18·G19)", "확인 요청 ([수정] / [호출하기])", "호출 내용을 최종 확인해 주세요.");
  add("final.edit", "최종 호출 확인 (먼저 확인 · G14·G18·G19)", "[수정]을 누른 뒤 (G15)", "무엇을 수정할까요?");
  if (B) add("coupon.edit", "최종 호출 확인 (먼저 확인 · G14·G18·G19)", "[수정] → 쿠폰을 골랐을 때", "쿠폰을 어떻게 할까요?");

  add("password", "[직접조작] 결제 비밀번호", "안내", "결제를 위해 결제 비밀번호 입력이 필요해요. 택시 앱을 열어 직접 입력해주세요.");
  add("done.busy", "완료 안내", "진행 문구 (택시를 찾는 동안)", "택시를 찾고 있어요 …");
  add("done", "완료 안내", "안내", "{택시종류}를 호출했어요. 기사님이 3분 뒤 도착해요.");
  add("done.multi", "완료 안내", "안내 (호출 대수가 2대 이상)", "{택시종류} {대수}대를 호출했어요. 기사님이 3분 뒤 도착해요.");
  add("count", "[오류] 택시 2대로 잘못 이해", "예상 금액 확인 직전 (처음 요청을 2대로 잘못 알아들음)", "처음에 말씀하신 대로 택시 {대수}대를 부를게요.");
  add("count.announce", "[오류] 택시 2대로 잘못 이해 (개선안)", "예상 금액 확인 직전 · 알리고 읽을 시간 뒤 진행 (G5·G11·G16)", `처음에 말씀하신 대로 택시 ${WRONG_COUNT}대를 부를게요.`);
  add("change.count", "중지·수정", "호출 대수를 바꿨을 때", "택시를 {대수}대로 바꿨어요.");

  add("history.ask", "[세션2] 추천 전에 묻기 (G18 요청 외 행동 · G21 무엇을 왜 보는지)", "확인 요청 ([거부] / [허용])", "최근 3개월 택시 이용내역을 보고 다음 이용을 추천해 드려도 될까요?");
  add("history.no", "[세션2] 추천 전에 묻기 (G18 요청 외 행동 · G21 무엇을 왜 보는지)", "거부했을 때", "알겠어요. 이용내역은 보지 않고, 추천도 하지 않을게요.");
  add("reserve", "[세션2] 예약 호출 (실행 전에 묻기 · G18·G19)", "추천 + 확인 요청 ([거부] / [예약하기])", "매주 토요일 담소한정식 강남점에 가신 기록이 있어요.\n다음 주 토요일(10월 10일) 오후 6시 20분에도 택시를 예약할까요?");
  add("reserve.no", "[세션2] 예약 호출 (먼저 물음 · G18·G19)", "거부했을 때", "다음 주 택시는 예약하지 않을게요.");
  add("reserve.yes", "[세션2] 예약 호출 (먼저 물음 · G18·G19)", "예약한 뒤", "다음 주 토요일(10월 10일) 오후 6시 20분 택시를 예약했어요.");
  add("reserve.cancel", "[세션2] 예약 호출 (먼저 물음 · G18·G19)", "예약을 취소했을 때", "택시 예약을 취소했어요.");

  add("defer", "진행 중 요청 (G3)", "지금 바로 반영할 수 없을 때 (이유 + 언제 반영)", "지금은 {지금단계} 중이라 바로 바꿀 수 없어요. {나중단계} 때 {값}(으)로 할게요.");

  add("stop.ask", "멈추기·뒤로 가기 (G12·G25)", "멈추기·뒤로 가기를 눌렀을 때", "진행을 멈췄어요. 어떻게 할까요?");
  add("exit.ask", "멈추기·뒤로 가기 (G12·G25)", "[앱 종료]를 눌렀을 때 한 번 더 확인", "앱을 종료하면 지금까지 한 내용이 모두 사라져요. 종료할까요?");
  add("exit.done", "멈추기·뒤로 가기 (G12·G25)", "앱을 종료했을 때", "택시 호출을 그만하고 앱을 종료했어요.");
  add("undo", "되돌리기 (G16)", "[되돌리기]·[방금 한 일 취소]를 눌렀을 때", "방금 한 일을 취소했어요. {단계}부터 다시 할게요.");
  add("undo.none", "되돌리기 (G16)", "취소할 일이 없을 때", "아직 취소할 일이 없어요.");
  add("undo.ride", "되돌리기 (G16)", "호출한 뒤 [되돌리기] (진행 문구)", "앱에서 호출을 취소하고 있어요 …");
  add("undo.ride.ask", "되돌리기 (G16)", "호출을 취소한 뒤 (G17)", "호출을 취소했어요. 어디부터 다시 할까요?");
  add("change.origin", "멈춘 뒤·수정", "출발지를 바꿨을 때", "출발지를 ‘{출발지}’(으)로 바꿨어요.");
  add("change.dest", "멈춘 뒤·수정", "목적지를 바꿨을 때", "목적지를 ‘{목적지}’으로 바꿨어요.");
  if (B) {
    add("change.car", "멈춘 뒤·수정", "택시 종류를 바꿨을 때", "택시 종류를 {택시종류}로 바꿨어요.");
    add("change.coupon.on", "멈춘 뒤·수정", "쿠폰을 적용했을 때", "‘{쿠폰}’을 적용했어요.");
    add("change.coupon.off", "멈춘 뒤·수정", "쿠폰을 뺐을 때", "쿠폰 적용을 취소했어요.");
  }
  add("change.pay", "멈춘 뒤·수정", "결제 방식을 바꿨을 때", "결제 방식을 {결제}로 바꿨어요.");
  add("stop.continue", "멈추기·뒤로 가기 (G12·G25)", "계속하기를 눌렀을 때", "계속 진행할게요.");
  add("cancel", "기타", "호출을 취소했을 때", "택시 호출을 취소했어요.");
  return L;
}

// 수정본: { A1: { key: text }, ... } (설정 화면에서 편집, 브라우저에 저장)
let SCRIPT_OVERRIDES = {};

function scriptText(cond, key) {
  const o = SCRIPT_OVERRIDES[cond]?.[key];
  if (typeof o === "string") return o;
  const d = scriptDefaults(cond).find((x) => x.key === key);
  return d ? d.text : "";
}

// 자리표시자 채우기 → 말풍선 목록
function lines(key, s, vars = {}) {
  const f = s.form || {};
  const dest = vars.dest ?? f.dest ?? s.phone?.pendingDest ?? TARGET_PLACE;
  const car = vars.car ?? f.car ?? "normal";
  const pay = vars.pay ?? f.pay ?? "auto";
  const originKey = vars.origin ?? f.origin ?? "current";
  const map = {
    출발지: ORIGINS[originKey].say || ORIGINS[originKey].name,
    목적지: PLACES[dest].name,
    택시종류: CAR_TYPES[car].label,
    결제: PAY[pay].label,
    쿠폰: COUPON.name,
    요금: won0(fareOf({ ...f, car }, dest)),
    요청사항: REQUESTS[vars.request ?? f.request ?? AGENT_REQUEST],
    이름: s.cfg?.name || "OOO",
    단계: vars.step ?? "",
    지금단계: vars.now ?? "",
    나중단계: vars.later ?? "",
    값: vars.value ?? "",
    하차: PLACES[DROP_PLACE].name,
    대수: String(vars.count ?? f.count ?? 1),
  };
  return scriptText(s.cond, key)
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/\{(출발지|목적지|택시종류|결제|쿠폰|요금|요청사항|이름|단계|지금단계|나중단계|값|하차|대수)\}/g, (_, k) => map[k]))
    .map((t) => t.replace(/([가-힣\w]+)’?\(으\)로/g, (m, w) => (m.includes("’") ? `${euro(w).slice(0, w.length)}’${euro(w).slice(w.length)}` : euro(w))))
    .map(fixJosa);
}
const line = (key, s, vars) => lines(key, s, vars).join("\n");

// 기사님 요청사항: 에이전트가 임의로 고른 값이 아직 그대로인지 (그 행에는 체크 대신 'AI의 추천' 배지)
const isAgentRequest = (s, k) => k === AGENT_REQUEST && s.form.request === AGENT_REQUEST && !s.requestByUser && !s.userSet?.request;

// 쿠폰 단계의 선택 → 적용 여부 ("on"이면 적용, 선택이 없으면 참가자가 직접 정한 값 또는 기본값 '적용 안 함')
// 처음 요청에서 쿠폰을 쓰라고 말했으면 적용 (연구1 프로토타입은 반영하지 못했음 → 연구2에서 두 안 모두 고침). 쿠폰 단계는 오류로 다루지 않음
const couponChoice = (s, choice) => (choice === "on" ? true : choice === "off" ? false : s.userSet?.coupon ? s.form.coupon : Boolean(s.req?.coupon));

// 택시 종류: 참가자가 이미 직접 바꿨으면 그 값, 처음 요청에서 말했으면 그 값, 아니면 기본 일반택시
const carTarget = (s) => (s.userSet?.car ? s.form.car : s.req?.car || "normal");
const payTarget = (s) => (s.userSet?.pay ? s.form.pay : s.complexity === "B" ? "direct" : "auto");

// 단계 정의
// - low.messages / low.options : 낮은 자동화 (승인·선택 요청)
// - low.reject : 거부 시 처리 유형 (app | coupon | final)
// - high.messages / high.applyFirst : 높은 자동화 (applyFirst=true면 화면 조작 후 “~했어요” 안내)
// - guide : 스크립트 밖 응답을 LLM이 만들 때 참고할 단계 설명
// - act(state, choice) : 화면에서 누르고 입력하는 연출 / apply(state, choice) : 상태 반영
function buildSteps(complexity, session = 1, guide = false) {
  const B = complexity === "B";
  const msg = (key) => (s) => lines(key, s);
  const steps = [];

  steps.push({
    id: "taxi_open",
    label: "택시 앱 실행",
    guide: "택시를 부르기 위해 택시 앱을 여는 단계",
    low: {
      messages: msg("taxi_open"),
      options: APPROVE,
      reject: "app",
      launched: "taxi_open.launched",
      opening: "taxi_open.opening",
      app: { target: "택시 앱", purpose: "택시 호출", keywords: "마음택시|택시\\s?앱|^택시" },
    },
    high: { messages: msg("taxi_open"), opening: "taxi_open.opening" },
    apply: (s) => { s.phone.app = "taxi"; s.phone.taxiView = "home"; s.phone.sheet = null; },
  });

  steps.push({
    id: "origin",
    label: "출발지 설정",
    guide: `출발지를 휴대폰의 현재 위치에서 ‘${SPOT.target.name}’으로 바꾸는 단계. 출발지 검색 결과는 ${ORIGIN_RESULTS.map((r) => r.name).join(", ")}이고 택시를 탈 곳은 ${SPOT.target.name}`,
    low: { messages: (s) => lines("origin", s, { origin: s.originTarget || TARGET_ORIGIN }), options: APPROVE, reject: "origin" },
    high: { messages: (s) => lines("origin", s, { origin: s.originTarget || TARGET_ORIGIN }), applyFirst: true },
    // 출발지 칸을 누르고 "동천역"을 입력 → 검색 결과
    pre: async (s) => {
      const p = s.phone;
      if (p.taxiView === "origin" && p.originTyped === ORIGIN_QUERY) return;
      if (s.originTarget && !originInResults(s.originTarget)) return; // 검색 결과에 없는 곳은 검색 화면을 보여주지 않음
      await tap(".tx-from");
      p.taxiView = "origin";
      p.originTyped = "";
      p.originResults = false;
      renderPhone();
      await actSleep(400);
      await typeText((v) => (p.originTyped = v), ORIGIN_QUERY, 190);
      await actSleep(500);
      p.originResults = true;
      renderPhone();
      await actSleep(600);
    },
    act: async (s, choice) => {
      const p = s.phone;
      // 승인(또는 높은 자동화) = 설정할 출발지로: 동천역이 아니면 해당 선택으로 바꿔 처리
      if (choice !== "reject" && choice !== "custom" && s.originTarget && !originInResults(s.originTarget)) choice = s.originTarget === "current" ? "reject" : "custom";
      if (choice === "reject" || choice === "custom") {
        // 동천역이 아닌 곳: 검색 화면을 닫고 홈으로 (custom이면 말한 곳을 출발지로)
        if (p.taxiView === "origin") await tap(".tx-sbar .back");
        if (choice === "custom") s.form.origin = "custom";
      } else if (p.taxiView === "origin") {
        const k = originInResults(s.originTarget) ? s.originTarget : TARGET_ORIGIN;
        await tap(`.tx-ores[data-origin="${k}"]`);
        s.form.origin = k;
      }
      p.taxiView = "home";
      renderPhone();
      await actSleep(300);
    },
    apply: (s, choice) => {
      const k = choice === "custom" ? "custom" : choice === "reject" ? "current" : s.originTarget || TARGET_ORIGIN;
      if (s.userSet?.origin && s.form.origin && s.form.origin !== k && choice !== "custom" && choice !== "reject") { s.phone.taxiView = "home"; s.phone.focus = null; return; } // 진행 중에 직접 바꾼 출발지는 그대로
      s.form.origin = k;
      s.phone.taxiView = "home";
      s.phone.focus = null;
    },
  });

  steps.push({
    id: "dest",
    kind: "dest",
    busy: "dest.busy",
    label: "목적지 설정",
    guide: `목적지를 검색해 고르는 단계. ‘${SEARCH_QUERY}’를 검색하면 ${SEARCH_ORDER.map((k) => PLACES[k].name).join(", ")}이 나오고, 에이전트는 ‘${PLACES[AGENT_PLACE].name}’을 목적지로 고름`,
    low: { messages: (s) => lines("dest", s, { dest: s.userDest ?? AGENT_PLACE }), options: APPROVE, reject: "dest" },
    high: { messages: (s) => lines("dest", s, { dest: s.form.dest ?? AGENT_PLACE }), applyFirst: true },
    correction: {
      lowAsk: (s) => line("dest.ask", s),
      lowConfirm: (s, k) => line("dest.confirm", s, { dest: k }),
      lowReask: (s, k) => line("dest.reask", s, { dest: k }),
    },
    // 검색창을 누르고 가게 이름을 입력 → 검색 결과가 나옴
    pre: async (s) => {
      const p = s.phone;
      if (p.taxiView === "search" && p.searchTyped === SEARCH_QUERY) return;
      p.searchList = null;
      await tap(".tx-search");
      p.taxiView = "search";
      p.searchTyped = "";
      renderPhone();
      await actSleep(400);
      await typeText((v) => (p.searchTyped = v), SEARCH_QUERY, 170);
      await actSleep(500);
      p.results = true;
      renderPhone();
      await actSleep(600);
    },
    act: async (s, choice) => {
      const k = choice || s.form.dest || AGENT_PLACE;
      const p = s.phone;
      if (p.taxiView === "search" && k === "custom" && p.searchList?.[0] !== "custom") {
        // 참가자가 말한 장소: 그 이름으로 다시 검색 → 결과에서 고름
        p.results = false;
        p.searchList = ["custom"];
        await typeText((v) => (p.searchTyped = v), PLACES.custom.name, 150);
        await actSleep(400);
        p.results = true;
        renderPhone();
        await actSleep(500);
      }
      if (p.taxiView === "search" && k !== "custom" && !(p.searchList || SEARCH_ORDER).includes(k)) {
        // 다른 지점으로 바꾼 경우: '담소한정식'으로 다시 검색 → 결과에서 고름
        p.results = false;
        p.searchList = null;
        await typeText((v) => (p.searchTyped = v), SEARCH_QUERY, 150);
        await actSleep(400);
        p.results = true;
        renderPhone();
        await actSleep(500);
      }
      if (p.taxiView === "search") {
        await tap(`.tx-res[data-place="${k}"]`);
        p.tappedPlace = k;
        renderPhone();
        await actSleep(300);
      }
      s.form.dest = k;
      p.taxiView = "ride";
      renderPhone();
    },
    apply: (s, choice) => { s.form.dest = choice || s.form.dest || AGENT_PLACE; s.phone.taxiView = "ride"; s.phone.focus = null; },
  });

  if (B) {
    steps.push({
      id: "car",
      label: "택시 종류 확인",
      guide: "택시 종류를 확인하는 단계(카드에 '택시 종류 일반택시 · 3종'이 보이고, 누르면 일반택시 / 모범택시 / 대형택시를 고를 수 있음). 기본은 일반택시이고, 에이전트가 먼저 다른 택시를 권하지 않음",
      // 선택지를 먼저 주지 않음: 기본(일반택시)으로 승인을 받거나 그대로 진행하고, 참가자가 바꾸는지 봄 (쿠폰과 같은 형태)
      low: { messages: (s) => lines("car", s, { car: carTarget(s) }), options: APPROVE, reject: "car" },
      high: { messages: (s) => lines(s.req?.car && !s.userSet?.car && s.req.car !== "normal" ? "car.req" : "car", s, { car: carTarget(s) }), applyFirst: true },
      pre: async (s) => { s.phone.focus = "car"; renderPhone(); await actSleep(400); },
      act: async (s, choice) => {
        const k = CAR_TYPES[choice] ? choice : carTarget(s);
        await tap(`.tx-car[data-car="${k}"]`);
        s.form.car = k;
        s.phone.focus = null;
        renderPhone();
      },
      apply: (s, choice) => { s.form.car = CAR_TYPES[choice] ? choice : carTarget(s); s.phone.focus = null; },
    });
  }

  // 연구2 오류 ②: 처음 요청을 '택시 2대'로 잘못 알아들은 것이 예상 금액 확인 직전에 드러남 (이후 예상 금액·최종 확인 모두 2대 기준)
  // 참가자가 이미 대수를 정했거나 되돌렸으면 바꾸지 않음
  if (session === 0 && ERR_SET === 1) steps.push({
    id: "count",
    kind: "error_count",
    label: "[오류②·2대로 잘못 이해] 호출 대수", // 참가자에게는 '호출 대수'만 보임 (되돌리기 안내)
    guide: `처음 요청을 '택시 ${WRONG_COUNT}대'로 잘못 알아들어 호출 대수를 ${WRONG_COUNT}대로 정하는 단계. 사용자가 1대라고 하면 1대로 바꿈`,
    high: { messages: (s) => (s.userSet?.count || s.countBlocked ? [] : lines("count", s, { count: WRONG_COUNT })), applyFirst: true },
    apply: (s) => {
      if (s.userSet?.count || s.countBlocked || s.countApplied) return;
      s.countApplied = true;
      s.form.count = WRONG_COUNT;
      logEvent("count_misheard", { count: WRONG_COUNT });
      renderPhone();
    },
  });

  if (B && USE_PAY_STEP) {
    steps.push({
      id: "pay",
      label: "결제 방식",
      guide: `결제 방식(자동결제: 마음카드 ****1234 / 직접결제: 내릴 때 기사님께)을 고르는 단계. 기본은 자동결제`,
      low: {
        messages: msg("pay"),
        options: Object.entries(PAY).map(([id, p]) => ({ id, label: p.label, desc: p.desc })),
      },
      high: B ? { messages: (s) => lines("pay", s, { pay: payTarget(s) }), applyFirst: true } : { messages: (s) => lines("pay", s, { pay: payTarget(s) }) },
      pre: async (s) => {
        if (s.phone.sheet === "pay") return;
        await tap(".tx-pay");
        s.phone.sheet = "pay";
        renderPhone();
        await actSleep(400);
      },
      act: async (s, choice) => {
        const k = choice || payTarget(s);
        if (s.phone.sheet !== "pay") { s.phone.sheet = "pay"; renderPhone(); await actSleep(400); }
        await tap(`.tx-pay-opt[data-pay="${k}"]`);
        s.form.pay = k;
        s.phone.sheet = null;
        renderPhone();
      },
      apply: (s, choice) => { s.form.pay = choice || payTarget(s); s.phone.sheet = null; },
    });
  }

  if (B && USE_COUPON && COUPON_STEP) {
    steps.push({
      id: "coupon",
      label: "예상 금액 확인",
      guide: `예상 금액을 확인하는 단계(카드에 예상 금액과 '쿠폰 적용 안 함 · 보유 1장'이 보임). 기본은 쿠폰 적용 안 함이고, 쓸 수 있는 쿠폰은 ‘${COUPON.name}’(${won0(COUPON.amount)} 할인) 하나. 에이전트가 먼저 쿠폰을 쓰자고 권하지 않음`,
      // 선택: "on"=쿠폰 적용 / 그 외(승인·높은 자동화 기본)=적용 안 함. 참가자가 이미 직접 정했으면 그 값 유지
      low: { messages: msg("coupon"), options: APPROVE, reject: "coupon" },
      high: { messages: (s) => (s.form.coupon && (s.userSet?.coupon || s.req?.coupon) ? lines("change.coupon.on", s) : lines("coupon", s)), applyFirst: true },
      pre: async (s) => {
        if (s.phone.sheet === "coupon") return;
        await tap(".tx-coupon");
        s.phone.sheet = "coupon";
        renderPhone();
        await actSleep(400);
      },
      act: async (s, choice) => {
        const on = couponChoice(s, choice);
        if (s.phone.sheet !== "coupon") { s.phone.sheet = "coupon"; renderPhone(); await actSleep(400); }
        await tap(on ? ".tx-cpn-item" : ".tx-cpn-none");
        s.form.coupon = on;
        s.phone.sheet = null;
        renderPhone();
      },
      apply: (s, choice) => { s.form.coupon = couponChoice(s, choice); s.phone.sheet = null; },
    });
  }

  // 연구2 오류 ② 블랙박스: 이유를 말하지 않고 하차 지점을 바꿈. 참가자가 이미 되돌렸으면 바꾸지 않음
  if (USE_DROP && session === 0) steps.push({
    id: "drop",
    kind: "error_drop",
    label: "[오류] 하차 지점 변경",
    guide: `에이전트가 이유를 말하지 않고 하차 지점을 ‘${PLACES[DROP_PLACE].name}’로 바꾸는 단계. 사용자가 이유를 물을 때만 '가게 앞은 차를 세우기 어려워서'라고 짧게 답함`,
    high: { messages: msg("drop"), applyFirst: true },
    act: async (s) => {
      if (s.dropBlocked || s.form.dest !== TARGET_PLACE) return;
      s.form.dest = DROP_PLACE;
      s.dropApplied = true;
      renderPhone();
      await actSleep(500);
    },
    apply: (s) => { if (!s.dropBlocked && s.form.dest === TARGET_PLACE) { s.form.dest = DROP_PLACE; s.dropApplied = true; } },
  });

  const finalStep = {
    id: "final",
    label: "최종 호출 확인",
    guide: `호출 내용을 최종 확인하는 단계. 목적지·결제 방식${B ? "·택시 종류·쿠폰" : ""}을 바꿀 수 있음`,
    low: { messages: msg("final"), options: APPROVE, reject: "final", ask: "final.ask" },
    high: { messages: msg("final") },
    pre: async (s) => {
      if (s.phone.sheet === "confirm") return;
      if (s.phone.sheet) { s.phone.sheet = null; renderPhone(); await actSleep(300); }
      await tap(".tx-call");
      s.phone.sheet = "confirm";
      renderPhone();
      await actSleep(500);
    },
    // 기존안 세션1은 다음 단계(기사님 요청사항)에서 호출하므로 확인 시트를 그대로 둠. 개선안은 요청사항을 먼저 물은 뒤 여기서 호출
    act: async (s) => { if (guide || session !== 1) await callTaxi(s); },
    apply: (s) => { if (guide || session !== 1) { s.phone.pin = ""; s.phone.sheet = "pin"; } },
  };
  const requestStep = guide ? {
    id: "request",
    kind: "error_request",
    label: "[세션1] 기사님 요청사항 (먼저 물음)",
    guide: `호출 확인 화면의 기사님 요청사항을 정하는 단계. 에이전트가 고르지 않고 사용자에게 먼저 물음. 고를 수 있는 요청사항: 요청사항 없음, ${REQUEST_CHOICES.map((k) => REQUESTS[k]).join(", ")}`,
    high: { messages: msg("request") },
    // 요청사항 목록만 열어 두고(아무것도 고르지 않음) 사용자에게 물음
    pre: async (s) => { if (!s.userSet?.request) await openRequestSheet(s); },
    act: async (s, k) => { await pickRequest(s, REQUESTS[k] ? k : s.form.request); s.phone.reqFocus = null; },
    apply: (s, k) => { if (REQUESTS[k]) s.form.request = k; if (s.phone.sheet === "request") s.phone.sheet = "confirm"; },
  } : {
    id: "request",
    kind: "error_request",
    label: "[세션1 오류] 기사님 요청사항 임의 선택",
    guide: `호출 확인 화면에서 에이전트가 사용자에게 묻지 않고 기사님 요청사항을 ‘${REQUESTS[AGENT_REQUEST]}’로 선택한 단계. 고를 수 있는 요청사항: ${REQUEST_CHOICES.map((k) => REQUESTS[k]).join(", ")} (요청사항 없이 호출할 수도 있음)`,
    low: { messages: (s) => lines("request", s, { request: AGENT_REQUEST }), options: APPROVE, reject: "request" },
    high: { messages: msg("request") },
    // 호출 확인 시트의 [기사님 요청사항]을 누르고 '기사님과 이야기 나누며 가고 싶어요'를 고른 뒤 알리거나 승인을 물음
    // 목록은 열어 둔 채로 묻고(고른 항목이 보이게), 승인하면 [확인] → [호출]
    pre: async (s) => {
      if (s.userSet?.request) return;
      await pickRequest(s, AGENT_REQUEST, { stay: true });
    },
    act: async (s) => {
      if (!s.userSet?.request && s.form.request !== AGENT_REQUEST) await pickRequest(s, AGENT_REQUEST, { stay: true });
      s.phone.reqFocus = null;
      await closeRequestSheet(s);
      await callTaxi(s);
    },
    apply: (s) => { s.phone.pin = ""; s.phone.sheet = "pin"; },
  };
  const reserveStep = {
    id: "reserve",
    kind: "error_reserve",
    label: guide ? "[세션2] 이용내역 열람·예약 (먼저 물음)" : "[세션2 오류] 이용내역 열람 + 예약 호출",
    guide: guide
      ? `호출이 끝난 뒤, 에이전트가 이용내역을 보기 전에 왜 필요한지 알리고 볼지 먼저 묻는 단계. 허용하면 최근 3개월 이용내역(매주 토요일 담소한정식 강남점)을 보고 ${RESERVE.short} 예약을 할지 먼저 물음`
      : `호출이 끝난 뒤 에이전트가 묻지 않고 최근 3개월 이용내역(매주 토요일 담소한정식 강남점)을 열람하고, ${RESERVE.short} 예약 호출을 제안(낮은 자동화)하거나 등록(높은 자동화)하는 단계`,
    low: { messages: msg("reserve"), options: APPROVE, reject: "reserve" },
    // 높은 자동화: 안내를 충분히 읽을 수 있게 단계 간격(5초)에 7초를 더 머문 뒤 예약
    high: { messages: msg("reserve"), hold: 7000 },
    pre: async (s) => {
      await tap(".tx-menu, .tx-call", { pre: 300 });
      s.phone.taxiView = "history";
      renderPhone();
      await actSleep(1000); // 진행 문구 없이 약 1초 이용내역 화면을 보여준 뒤 안내
    },
    act: async (s, choice) => {
      if (choice === "reject" || s.reserveCancelled) return;
      await tap(".hist-reserve");
      s.phone.taxiView = "reserve";
      renderPhone();
      await actSleep(900);
      await tap(".tx-call");
      s.form.reserved = true;
      s.phone.taxiView = "reserve_done";
      renderPhone();
    },
    apply: (s, choice) => { if (choice !== "reject" && !s.reserveCancelled) { s.form.reserved = true; s.phone.taxiView = "reserve_done"; } },
  };

  // 개선안: 기사님 요청사항을 먼저 물은 뒤 최종 확인(가이드라인 14 · 결과가 정해지기 전에 확인) / 기존안: 연구1 그대로 최종 확인 다음에 요청사항
  if (session === 1 && guide) steps.push(requestStep);
  steps.push(finalStep);
  if (session === 1 && !guide) steps.push(requestStep);
  steps.push(
    {
      // [직접조작] 결제 비밀번호: 자동결제라 호출 전에 참가자가 [화면 열기] → 택시 앱 화면에서 직접 입력
      id: "password",
      kind: "password",
      label: "[직접조작] 결제 비밀번호 입력",
      guide: "자동결제(마음카드 ****1234)로 미리 결제하기 위해 참가자가 결제 비밀번호 4자리를 택시 앱 화면을 열어 직접 입력하는 단계. 비밀번호는 에이전트에게 전달되지 않음",
      low: { messages: msg("password") },
      high: { messages: msg("password") },
      apply: (s) => { s.phone.pin = ""; s.phone.sheet = "pin"; },
    },
    {
      id: "done",
      kind: "done",
      busy: "done.busy",
      label: "완료 안내",
      low: { messages: (s) => lines((s.form.count || 1) > 1 ? "done.multi" : "done", s), applyFirst: true },
      high: { messages: (s) => lines((s.form.count || 1) > 1 ? "done.multi" : "done", s), applyFirst: true },
      // 주변 택시를 찾는 화면을 잠시 보여준 뒤 배차 완료
      act: async () => { await actSleep(800); },
      apply: (s) => { s.phone.sheet = null; s.phone.taxiView = "complete"; s.phone.focus = null; },
    },
  );
  if (session === 2) steps.push(reserveStep);

  return steps;
}
