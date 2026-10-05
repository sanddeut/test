// 연구1 v2 시나리오 정의 (택시 호출) — classic script, 전역으로 노출
// 송금 버전의 원칙(2×2, 오류 1회, 낮은 자동화=단계별 승인 / 높은 자동화=안내 후 진행)을 그대로 따릅니다.
// 에이전트 고정 문구는 여기서만 관리합니다. 스크립트에 없는 응답은 LLM이 상황에 맞게 생성합니다.

const TAXI_APP = "마음택시";

// 목적지 검색 결과 (같은 이름의 여러 지점). road: 신분당선 동천역에서의 도로 거리(km, 고정값)
const PLACES = {
  gangnam: { name: "담소한정식 강남점", addr: "서울 강남구 테헤란로 152", lat: 37.50007, lng: 127.03651, road: 21.2 },
  gucheong: { name: "담소한정식 강남구청점", addr: "서울 강남구 학동로 426", lat: 37.51729, lng: 127.04736, road: 23.5 },
  yeoksam: { name: "담소한정식 역삼점", addr: "서울 강남구 논현로 508", lat: 37.50375, lng: 127.03983, road: 21.9 },
};

// 출발지: 기본은 휴대폰 GPS의 현재 위치, 과업에서 ‘신분당선 동천역’으로 바꿈
// (현재 위치 좌표는 세션 시작 때 받아서 S.geo에 둠. 위치를 못 받으면 GEO_FALLBACK)
const TARGET_ORIGIN = "dongcheon";
const ORIGINS = {
  current: { name: "현재 위치" },
  dongcheon: { name: "신분당선 동천역", addr: "경기 용인시 수지구 동천동", lat: 37.33797, lng: 127.10278 },
};
const GEO_FALLBACK = { lat: 37.39475, lng: 127.11118, label: "경기 성남시 분당구 삼평동" }; // 판교역 부근
const ORIGIN_QUERY = "동천역";
// 출발지 검색 결과 (신분당선 동천역만 고를 수 있음)
const ORIGIN_RESULTS = [
  { key: "dongcheon", name: "신분당선 동천역", addr: "경기 용인시 수지구 동천동 · 지하철역" },
  { key: null, name: "동천역 버스정류장", addr: "경기 용인시 수지구 동천로" },
  { key: null, name: "동천역 환승주차장", addr: "경기 용인시 수지구 동천동 876" },
];

// 받침이 있으면 "으로", 없으면 "로" (ㄹ 받침은 "로")
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

// 거리(km): 동천역에서는 고정값, 현재 위치·참가자가 말한 출발지에서는 직선거리 × 1.35 (도로 거리 근사)
function distKm(originKey, destKey, geo) {
  const d = PLACES[destKey];
  if (originKey === TARGET_ORIGIN) return d.road;
  const o = originPoint(originKey, geo);
  const R = 6371, rad = Math.PI / 180;
  const a = Math.sin(((d.lat - o.lat) * rad) / 2) ** 2 + Math.cos(o.lat * rad) * Math.cos(d.lat * rad) * Math.sin(((d.lng - o.lng) * rad) / 2) ** 2;
  return Math.max(0.5, Math.round(2 * R * Math.asin(Math.sqrt(a)) * 1.35 * 10) / 10);
}
const distText = (originKey, destKey, geo) => `${distKm(originKey, destKey, geo).toFixed(1)}km`;
const SEARCH_ORDER = ["gucheong", "gangnam", "yeoksam"]; // 검색 결과 순서 (에이전트는 맨 위 강남구청점을 고름)
const SEARCH_QUERY = "담소한정식";
const TARGET_PLACE = "gangnam"; // 참가자가 요청하는 목적지
const AGENT_PLACE = TARGET_PLACE; // 에이전트가 고르는 목적지 (v2 최종: 목적지 오류 없음)

// 세션별 오류 (연구1 v2 최종 시나리오)
// - 세션1: 최종 확인 다음, 에이전트가 묻지 않고 기사님 요청사항을 '기사님과 이야기 나누며 가고 싶어요'로 선택
// - 세션2: 호출 완료 후, 묻지 않고 최근 3개월 이용내역을 열람하고 다음 주 토요일 같은 시간 예약 호출을 제안·등록
const SESSIONS = {
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
const RIDE_HISTORY = ["09.26", "09.19", "09.12", "09.05", "08.29", "08.22"].map((d) => ({ date: `2026.${d} (토)`, time: "오후 6:20", to: "담소한정식 강남점", fare: 19700 }));
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

const CONDITIONS = {
  A1: { complexity: "A", automation: "low", title: "A1 · 낮은 복잡도 × 낮은 자동화" },
  A2: { complexity: "A", automation: "high", title: "A2 · 낮은 복잡도 × 높은 자동화" },
  B1: { complexity: "B", automation: "low", title: "B1 · 높은 복잡도 × 낮은 자동화" },
  B2: { complexity: "B", automation: "high", title: "B2 · 높은 복잡도 × 높은 자동화" },
};

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
      "택시는 ‘신분당선 동천역’에서 타려고 합니다.",
      "가지고 계신 할인쿠폰이 1장 있어서, 이걸 사용하려 합니다.",
    ],
    task: [
      "AI와 대화를 하며 ‘신분당선 동천역’에서 ‘담소한정식 강남점’까지 가는 택시를 불러주세요.",
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
  return Math.max(0, fare - (f.coupon ? COUPON.amount : 0));
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
const SCRIPT_VARS = ["출발지", "목적지", "택시종류", "결제", "쿠폰", "요금", "요청사항", "이름"];

// 조건별 기본 문구 목록 (화면에 보이는 순서대로)
function scriptDefaults(cond) {
  const { complexity, automation } = CONDITIONS[cond];
  const B = complexity === "B";
  const low = automation === "low";
  const L = [];
  const add = (key, group, label, text) => L.push({ key, group, label, text });

  add("greet", "시작", "첫 인사", "무엇을 도와드릴까요?");

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
    if (low) add("car", "택시 종류 변경", "선택 요청", "택시 종류가 3개예요. 어떤 택시로 할까요?");
    else {
      add("car", "택시 종류 변경", "안내 (처음 요청에서 말한 택시 종류)", "말씀하신 {택시종류}로 바꿨어요.");
      add("car.ask", "택시 종류 변경", "처음 요청에 택시 종류가 없을 때", "택시 종류가 3개예요. 어떤 택시로 할까요?");
      add("car.set", "택시 종류 변경", "택시 종류를 골랐을 때", "{택시종류}로 설정했어요.");
    }
  }

  // 결제 방식 단계 (최종 시나리오에서는 사용 안 함: 모든 조건이 자동결제)
  if (B && USE_PAY_STEP) {
    if (low) add("pay", "결제 방식", "선택 요청", "결제 방식이 2개예요. 어떻게 결제할까요?");
    else add("pay", "결제 방식", "안내", "말씀하신 {결제}로 바꿨어요.");
  }

  if (B && USE_COUPON && COUPON_STEP) {
    if (low) {
      add("coupon", "쿠폰 적용", "승인 요청 (기본: 적용 안 함)", "쿠폰은 적용하지 않고 진행할까요?");
      add("coupon.ask", "쿠폰 적용", "거부 시", "쿠폰을 어떻게 할까요?");
      add("coupon.on", "쿠폰 적용", "쿠폰을 고른 뒤 (다시 묻지 않고 진행)", "‘{쿠폰}’을 적용할게요.");
      add("coupon.skip", "쿠폰 적용", "적용 안 함을 고른 뒤", "쿠폰은 적용하지 않을게요.");
    } else add("coupon", "쿠폰 적용", "안내 (기본: 적용 안 함)", "쿠폰은 적용하지 않았어요.");
  }

  if (low) {
    add("final", "최종 호출 확인", "승인 요청", "호출 내용을 최종 확인해주세요.");
    add("final.ask", "최종 호출 확인", "거부 시", "무엇을 수정할까요?");
  } else add("final", "최종 호출 확인", "안내", "‘{목적지}’으로 가는 {택시종류}를 호출할게요.");

  // [세션1 오류] 기사님 요청사항 임의 선택
  if (low) {
    add("request", "[세션1 오류] 기사님 요청사항", "승인 요청", "기사님 요청사항을 선택할 수 있어요. ‘{요청사항}’를 선택했어요.");
    add("request.ask", "[세션1 오류] 기사님 요청사항", "거부 시", "기사님 요청사항을 어떻게 할까요?");
    add("request.confirm", "[세션1 오류] 기사님 요청사항", "요청사항을 고른 뒤", "기사님 요청사항을 ‘{요청사항}’로 바꿨어요. 이렇게 호출할게요.");
  } else add("request", "[세션1 오류] 기사님 요청사항", "안내", "기사님 요청사항을 선택할 수 있어요. ‘{요청사항}’를 선택했어요.");
  add("change.request", "[세션1 오류] 기사님 요청사항", "중지 중 요청사항을 바꿨을 때", "기사님 요청사항을 ‘{요청사항}’로 바꿨어요.");
  if (low) add("request.none.confirm", "[세션1 오류] 기사님 요청사항", "요청사항을 뺀 뒤", "기사님 요청사항을 뺐어요. 이렇게 호출할게요.");
  add("change.request.none", "[세션1 오류] 기사님 요청사항", "중지 중 요청사항을 뺐을 때", "기사님 요청사항을 뺐어요.");

  add("password", "[직접조작] 결제 비밀번호", "안내", "결제를 위해 결제 비밀번호 입력이 필요해요. 택시 앱을 열어 직접 입력해주세요.");
  add("done.busy", "완료 안내", "진행 문구 (택시를 찾는 동안)", "택시를 찾고 있어요 …");
  add("done", "완료 안내", "안내", "{택시종류}를 호출했어요. 기사님이 3분 뒤 도착해요.");

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
    출발지: ORIGINS[originKey].name,
    목적지: PLACES[dest].name,
    택시종류: CAR_TYPES[car].label,
    결제: PAY[pay].label,
    쿠폰: COUPON.name,
    요금: won0(fareOf({ ...f, car }, dest)),
    요청사항: REQUESTS[vars.request ?? f.request ?? AGENT_REQUEST],
    이름: s.cfg?.name || "OOO",
  };
  return scriptText(s.cond, key)
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/\{(출발지|목적지|택시종류|결제|쿠폰|요금|요청사항|이름)\}/g, (_, k) => map[k]))
    .map((t) => t.replace(/([가-힣\w]+)’?\(으\)로/g, (m, w) => (m.includes("’") ? `${euro(w).slice(0, w.length)}’${euro(w).slice(w.length)}` : euro(w))));
}
const line = (key, s, vars) => lines(key, s, vars).join("\n");

// 쿠폰 단계의 선택 → 적용 여부 ("on"이면 적용, 선택이 없으면 참가자가 직접 정한 값 또는 기본값 '적용 안 함')
const couponChoice = (s, choice) => (choice === "on" ? true : choice === "off" ? false : s.userSet?.coupon ? s.form.coupon : false);

// 높은 자동화(B)에서 바꿀 값: 참가자가 이미 직접 바꿨으면 그 값, 아니면 과업의 값
const carTarget = (s) => (s.userSet?.car ? s.form.car : s.req?.car || "deluxe");
const payTarget = (s) => (s.userSet?.pay ? s.form.pay : s.complexity === "B" ? "direct" : "auto");

// 단계 정의
// - low.messages / low.options : 낮은 자동화 (승인·선택 요청)
// - low.reject : 거부 시 처리 유형 (app | coupon | final)
// - high.messages / high.applyFirst : 높은 자동화 (applyFirst=true면 화면 조작 후 “~했어요” 안내)
// - guide : 스크립트 밖 응답을 LLM이 만들 때 참고할 단계 설명
// - act(state, choice) : 화면에서 누르고 입력하는 연출 / apply(state, choice) : 상태 반영
function buildSteps(complexity, session = 1) {
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
    guide: "출발지를 휴대폰의 현재 위치에서 ‘신분당선 동천역’으로 바꾸는 단계. 출발지 검색 결과는 신분당선 동천역, 동천역 버스정류장, 동천역 환승주차장이고 택시를 탈 곳은 신분당선 동천역",
    low: { messages: (s) => lines("origin", s, { origin: s.originTarget || TARGET_ORIGIN }), options: APPROVE, reject: "origin" },
    high: { messages: (s) => lines("origin", s, { origin: s.originTarget || TARGET_ORIGIN }), applyFirst: true },
    // 출발지 칸을 누르고 "동천역"을 입력 → 검색 결과
    pre: async (s) => {
      const p = s.phone;
      if (p.taxiView === "origin" && p.originTyped === ORIGIN_QUERY) return;
      if (s.originTarget && s.originTarget !== TARGET_ORIGIN) return; // 동천역이 아닌 곳은 검색 화면을 보여주지 않음
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
      if (choice !== "reject" && choice !== "custom" && s.originTarget && s.originTarget !== TARGET_ORIGIN) choice = s.originTarget === "current" ? "reject" : "custom";
      if (choice === "reject" || choice === "custom") {
        // 동천역이 아닌 곳: 검색 화면을 닫고 홈으로 (custom이면 말한 곳을 출발지로)
        if (p.taxiView === "origin") await tap(".tx-sbar .back");
        if (choice === "custom") s.form.origin = "custom";
      } else if (p.taxiView === "origin") {
        await tap(`.tx-ores[data-origin="${TARGET_ORIGIN}"]`);
        s.form.origin = TARGET_ORIGIN;
      }
      p.taxiView = "home";
      renderPhone();
      await actSleep(300);
    },
    apply: (s, choice) => {
      const k = choice === "custom" ? "custom" : choice === "reject" ? "current" : s.originTarget || TARGET_ORIGIN;
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
    guide: `목적지를 검색해 고르는 단계. 검색 결과는 ${SEARCH_ORDER.map((k) => PLACES[k].name).join(", ")} 세 곳이고, 에이전트는 ‘${PLACES[AGENT_PLACE].name}’을 목적지로 고름`,
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
      label: "택시 종류 변경",
      guide: "택시 종류(일반택시 / 모범택시 / 대형택시)를 고르는 단계. 기본은 일반택시",
      low: {
        messages: msg("car"),
        // 예상 요금은 목적지·쿠폰에 따라 바뀌므로 물을 때마다 새로 계산
        get options() { return Object.entries(CAR_TYPES).map(([id, c]) => ({ id, label: c.label, price: `예상 ${won0(fareOf({ ...S.form, car: id }))}` })); },
      },
      high: { messages: (s) => lines("car", s, { car: carTarget(s) }), applyFirst: true },
      pre: async (s) => { s.phone.focus = "car"; renderPhone(); await actSleep(400); },
      act: async (s, choice) => {
        const k = choice || carTarget(s);
        await tap(`.tx-car[data-car="${k}"]`);
        s.form.car = k;
        s.phone.focus = null;
        renderPhone();
      },
      apply: (s, choice) => { s.form.car = choice || carTarget(s); s.phone.focus = null; },
    });
  }

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
      label: "쿠폰 적용",
      guide: `쿠폰 적용 단계. 기본은 쿠폰 적용 안 함이고, 쓸 수 있는 쿠폰은 ‘${COUPON.name}’(${won0(COUPON.amount)} 할인) 하나. 에이전트가 먼저 쿠폰을 쓰자고 권하지 않음`,
      // 선택: "on"=쿠폰 적용 / 그 외(승인·높은 자동화 기본)=적용 안 함. 참가자가 이미 직접 정했으면 그 값 유지
      low: { messages: msg("coupon"), options: APPROVE, reject: "coupon" },
      high: { messages: (s) => (s.userSet?.coupon && s.form.coupon ? lines("change.coupon.on", s) : lines("coupon", s)), applyFirst: true },
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

  steps.push(
    {
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
      // 세션1은 다음 단계(기사님 요청사항)에서 호출하므로 확인 시트를 그대로 둠
      act: async (s) => { if (session === 2) await callTaxi(s); },
      apply: (s) => { if (session === 2) { s.phone.pin = ""; s.phone.sheet = "pin"; } },
    },
    ...(session === 1 ? [{
      id: "request",
      kind: "error_request",
      label: "[세션1 오류] 기사님 요청사항 임의 선택",
      guide: `호출 확인 화면에서 에이전트가 사용자에게 묻지 않고 기사님 요청사항을 ‘${REQUESTS[AGENT_REQUEST]}’로 선택한 단계. 고를 수 있는 요청사항: ${REQUEST_CHOICES.map((k) => REQUESTS[k]).join(", ")} (요청사항 없이 호출할 수도 있음)`,
      low: { messages: (s) => lines("request", s, { request: AGENT_REQUEST }), options: APPROVE, reject: "request" },
      high: { messages: msg("request") },
      // 호출 확인 시트의 [기사님 요청사항]을 누르고 '기사님과 이야기 나누며 가고 싶어요'를 고른 뒤 알리거나 승인을 물음
      // 목록은 열어 둔 채로 묻고(고른 항목이 보이게), 승인하면 [확인] → [호출]
      // 낮은·높은 자동화 모두 목록에서 바로 골라 둔 채로 알림 (낮은 자동화는 승인을 물음)
      pre: async (s) => {
        if (s.userSet?.request) return;
        // 낮은·높은 자동화 모두 목록에서 먼저 골라 둠 (낮은 자동화는 그 뒤 승인을 물음)
        await pickRequest(s, AGENT_REQUEST, { stay: true });
      },
      act: async (s) => {
        if (!s.userSet?.request && s.form.request !== AGENT_REQUEST) await pickRequest(s, AGENT_REQUEST, { stay: true });
        s.phone.reqFocus = null;
        await closeRequestSheet(s);
        await callTaxi(s);
      },
      apply: (s) => { s.phone.pin = ""; s.phone.sheet = "pin"; },
    }] : []),
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
      low: { messages: msg("done"), applyFirst: true },
      high: { messages: msg("done"), applyFirst: true },
      // 주변 택시를 찾는 화면을 잠시 보여준 뒤 배차 완료
      act: async () => { await actSleep(2600); },
      apply: (s) => { s.phone.sheet = null; s.phone.taxiView = "complete"; s.phone.focus = null; },
    },
    ...(session === 2 ? [{
      id: "reserve",
      kind: "error_reserve",
      label: "[세션2 오류] 이용내역 열람 + 예약 호출",
      guide: `호출이 끝난 뒤 에이전트가 묻지 않고 최근 3개월 이용내역(매주 토요일 담소한정식 강남점)을 열람하고, ${RESERVE.short} 예약 호출을 제안(낮은 자동화)하거나 등록(높은 자동화)하는 단계`,
      low: { messages: msg("reserve"), options: APPROVE, reject: "reserve" },
      high: { messages: msg("reserve") },
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
    }] : []),
  );

  return steps;
}
