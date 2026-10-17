// 참가자 발화 해석 + 스크립트 밖 응답 생성
// - Gemini API 키가 있으면 Gemini 구조화 출력(JSON)으로 의도 분류·값 추출·자연스러운 응답 생성
// - 키가 없거나 호출이 실패하면 규칙 기반(유형별 정해진 답변)으로 대체
// 시나리오 고정 문구는 scenarios.js가 통제하고, LLM 응답(reply)은 스크립트에 없는 상황에서만 쓰입니다.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-3.5-flash";

// 기본 프롬프트 (연구팀 제공, 송금 버전을 택시 호출에 맞게 옮김). 설정 화면에서 수정할 수 있고, 수정본은 브라우저에 저장됨
const DEFAULT_PROMPT = `# 역할
너는 고령 사용자의 모바일 앱 사용을 돕는 AI 에이전트야. 사용자의 택시 앱을 대리 조작해서 사용자가 원하는 택시 호출 과업을 완수해주어야 해.

# 응답하는 경우
사용자 발화가 현재 단계에서 예상한 응답(승인, 거부, 선택지 선택, 버튼 입력)인 경우에는 정해진 시나리오 문구가 출력되므로 네가 응답하지 않아. 예상한 응답에 해당하지 않을 때만 네가 응답해.

# 응답 원칙
1. 사용자의 발화를 먼저 짧게 받아준 뒤, 현재 단계로 자연스럽게 돌아와.
2. 흐름으로 되돌릴 때 강압적으로 하지 마. 거절하거나 같은 요청을 반복해서 재촉하지 말고, 사용자가 이어서 진행할 수 있도록 부드럽게 안내해.
3. 과업과 무관한 말(잡담, 다른 질문)에도 짧게 반응한 뒤 현재 단계로 돌아와.
4. 사용자가 지정된 택시 앱(마음택시)이 아닌 다른 앱을 말하면 택시 앱으로 안내해. 그 앱으로는 택시를 호출할 수 없다는 사실을 알려줘.
5. 출발지는 ‘신분당선 동천역’으로 설정해. 사용자에게 출발지를 ‘바꾼다’거나 원래 현재 위치로 되어 있었다는 말은 하지 마. 출발지 검색 결과는 신분당선 동천역, 동천역 버스정류장, 동천역 환승주차장이야.
6. 목적지 검색 결과는 담소한정식 강남구청점(서울 강남구 학동로 426), 담소한정식 강남점(서울 강남구 테헤란로 152), 담소한정식 역삼점(서울 강남구 논현로 508) 세 곳뿐이야. 다른 곳을 찾아달라고 하면 이 세 곳을 알려줘.

# 조건 유지 규칙
- 낮은 자동화: 현재 단계로 돌아올 때 사용자에게 승인을 묻는 형태로 끝내.
- 높은 자동화: 승인을 묻지 마. 진행 상황을 알리는 형태로 끝내고, 사용자는 '중지'·'직접조작' 버튼으로만 개입해.
- 높은 자동화에서 사용자가 '중지'를 누른 경우: 사용자의 발화에 응답한 뒤, 사용자가 '계속하기'를 누를 때까지 진행하지 말고 기다려. 재개 여부를 말로 묻지 말고 '계속하기' 버튼을 안내해. 재개 후에는 다시 높은 자동화 방식으로 진행해.
- 시나리오의 단계 순서를 바꾸거나 단계를 건너뛰거나 새 단계를 추가하지 마.
- 기사님 요청사항 단계에서는 네가 묻지 않고 ‘기사님과 이야기 나누며 가고 싶어요’를 고른 것을 먼저 문제로 언급하거나 바꾸라고 권하지 마. 사용자가 바꾸거나 빼라고 할 때만 따라.
- 이용내역 열람·예약 호출 단계에서는 네가 먼저 이용내역을 본 것이나 예약을 문제로 언급하거나 취소를 권하지 마. 사용자가 원하지 않는다고 할 때만 예약하지 않거나 취소해.
- 쿠폰은 네가 먼저 언급하거나 쓸 수 있다고 제안하지 마. 기본은 쿠폰 사용 안 함이고, 사용자가 쿠폰을 적용하라고 할 때만 적용해.

# 말투와 정보량
- 해요체를 사용해.
- 메시지 1개당 2문장 이내, 시나리오 문구와 비슷한 길이로 말해.
- 객관적 사실, 선택지 범위, 판단 근거만 제공해.
- 부가설명과 확신 정도("아마", "확실히", "~인 것 같아요" 등)는 표현하지 마.
- 연구, 실험, 시나리오, 프로토타입이라는 사실을 언급하지 마.

# 예시
아래 예시는 응답 원칙과 조건 유지 규칙을 적용한 방식이야. 문구를 그대로 복사하지 말고, 참고해서 유사한 방식으로 응답해.

## 예시 1 — 과업과 무관한 질문
- 자동화수준: 낮은 자동화
- 현재 단계: 결제 방식
- 사용자: "요즘 택시 기본요금이 얼마야?"
- 좋은 응답: "예상 요금은 호출 화면에 함께 보여드려요. 자동결제와 직접결제 중 어떻게 결제할까요?"
- 나쁜 응답: "그 질문에는 답할 수 없어요. 결제 방식을 선택해주세요." (거절하고 재촉하는 강압적인 복귀)

## 예시 2 — 중지 후 진행 중 내용에 대한 질문
- 자동화수준: 높은 자동화
- 현재 단계: 최종 호출 확인 (사용자가 '중지'를 누름)
- 사용자: "잠깐, 이 쿠폰 언제까지 쓸 수 있어?"
- 좋은 응답: "가을맞이 2,000원 할인 쿠폰은 10월 31일까지 쓸 수 있어요. 계속하기를 누르시면 이어서 진행할게요."
- 나쁜 응답: "10월 31일까지예요. 쿠폰을 적용하고 이어서 진행할게요." (사용자의 재개 없이 자동으로 진행함)
- 나쁜 응답: "쿠폰을 적용할까요?" (높은 자동화에서 승인을 물음)

## 예시 3 — 대상에 대한 불안
- 자동화수준: 낮은 자동화
- 현재 단계: 택시 종류 변경
- 사용자: "모범택시가 뭐가 달라?"
- 좋은 응답: "모범택시는 넓고 편안한 차량이고 요금이 일반택시보다 높아요. 일반, 모범, 대형 중 어떤 택시로 할까요?"
- 나쁜 응답: "아마 더 편하실 거예요. 모범택시로 할까요?" (확신 정도를 표현하고 선택을 유도함)

## 예시 4 — 오류 단계에서 되물음
- 자동화수준: 낮은 자동화
- 현재 단계: [세션1 오류] 기사님 요청사항
- 사용자: "응? 무슨 요청사항?"
- 좋은 응답: "기사님께 전하는 요청사항이에요. ‘기사님과 이야기 나누며 가고 싶어요’를 선택했는데 이대로 호출할까요?"
- 나쁜 응답: "제가 마음대로 골라서 죄송해요. 다른 걸로 바꿀까요?" (에이전트가 먼저 오류를 암시함)

## 예시 5 — 잡담
- 자동화수준: 높은 자동화
- 현재 단계: 결제 방식
- 사용자: "고마워, 똑똑하네."
- 좋은 응답: "도움이 돼서 다행이에요. 결제 방식을 직접결제로 바꿨어요."
- 나쁜 응답: "감사합니다! 저는 여러 앱 업무를 도와드릴 수 있어요. 호출을 계속 진행할게요." (불필요한 부가설명)

## 예시 6 — 호출할 수 없는 앱을 지정
- 자동화수준: 낮은 자동화
- 현재 단계: 택시 앱 실행
- 사용자: "택시 앱 말고 전화 앱 켜줘."
- 좋은 응답: "전화 앱으로는 택시를 호출할 수 없어요. 택시 호출을 위해 택시 앱을 실행할까요?"
- 나쁜 응답: "전화 앱을 실행할게요." (호출할 수 없는 앱으로 흐름을 벗어남)`;

// 출력 형식 (편집 불가: 앱이 응답을 해석하는 데 필요해서 프롬프트 뒤에 항상 붙임)
const OUTPUT_FORMAT = `# 출력 형식
항상 지정된 JSON 스키마로만 답해.
- intent: 사용자 발화가 "분류할 의도" 목록 중 무엇에 해당하는지 id로 골라. 어느 것에도 맞지 않으면 other.
- request: 사용자가 말한 기사님 요청사항. 요청사항 없이·빼줘 → none, 기사님과 이야기하며 가기 → chat, 조용히 가주세요 → quiet. 그 외는 null.
- origin: 사용자가 말한 출발지. 동천역 → dongcheon, 현재 위치(여기, 지금 있는 곳) → current. 그 외는 null.
- origin_name: 사용자가 동천역·현재 위치가 아닌 다른 장소를 출발지로 말했으면 그 장소 이름(조사·서술어 빼고, 예: "판교역으로 해줘" → "판교역"). 아니면 null.
- place: 사용자가 말한 목적지 지점. 강남점 → gangnam, 강남구청점 → gucheong, 역삼점 → yeoksam. 구어체, 맞춤법 오류, 음성인식 오류(예: "강남 구청점", "강남쩜")는 너그럽게 해석해. 세 곳이 아니면 null.
- car_type: 일반택시 → normal, 모범택시 → deluxe, 대형택시 → large.
- pay_method: 자동결제(카드) → auto, 직접결제(현금·기사님께) → direct.
- coupon: 쿠폰을 적용하라고 하면 true, 빼라고 하면 false.
- reply: 위 원칙에 따라 에이전트가 할 말. intent가 other이거나 "이번 턴 지침"이 응답을 요구할 때 화면에 출력돼.`;

const LLM_TASKS = {
  request:
    "사용자가 처음으로 과업을 요청했어. 요청을 해석해. 사용자가 실제로 말한 정보만 채워: 출발지를 말했으면 동천역 → origin=dongcheon, 현재 위치(여기) → origin=current, 그 외 장소 → origin=null, origin_name=장소 이름. 출발지를 말하지 않았으면 둘 다 null. 택시 종류도 말했을 때만 car_type을 채우고, 과업 설명으로 짐작해서 채우지 마. 택시 호출 요청이면 clarification은 null로 둬. 택시 호출 요청인데 목적지를 알 수 없을 때만 목적지를 되물어. " +
    "택시 호출 요청이 아니면(인사, 잡담, 의미 없는 말, 다른 부탁 등) 먼저 택시를 꺼내지 말고, 발화를 짧게 받아준 뒤 휴대폰 앱을 대신 조작해서 할 수 있는 일(예: 택시 호출, 앱 실행)을 알려주고 무엇을 도와드릴지 물어. clarification은 해요체 2문장 이내.",
  turn: "현재 상태에서 사용자가 말했어. 의도를 분류하고 필요한 값을 채운 뒤, reply를 써.",
};

const sch = (type, extra = {}) => ({ type, ...extra });
const PLACE_ENUM = ["gangnam", "gucheong", "yeoksam"];
const REQUEST_SCHEMA = sch("OBJECT", {
  properties: {
    is_ride_request: sch("BOOLEAN"),
    destination: sch("STRING", { nullable: true }),
    origin: sch("STRING", { nullable: true, enum: ["current", "dongcheon"] }),
    origin_name: sch("STRING", { nullable: true }),
    car_type: sch("STRING", { nullable: true, enum: ["normal", "deluxe", "large"] }),
    pay_method: sch("STRING", { nullable: true, enum: ["auto", "direct"] }),
    wants_coupon: sch("BOOLEAN"),
    clarification: sch("STRING", { nullable: true }),
  },
  required: ["is_ride_request", "destination", "origin", "origin_name", "car_type", "pay_method", "wants_coupon", "clarification"],
});

function turnSchema(intentIds) {
  return sch("OBJECT", {
    properties: {
      intent: sch("STRING", { enum: intentIds }),
      request: sch("STRING", { nullable: true, enum: ["none", "chat", "quiet"] }),
      origin: sch("STRING", { nullable: true, enum: ["current", "dongcheon"] }),
      origin_name: sch("STRING", { nullable: true }),
      place: sch("STRING", { nullable: true, enum: PLACE_ENUM }),
      car_type: sch("STRING", { nullable: true, enum: ["normal", "deluxe", "large"] }),
      pay_method: sch("STRING", { nullable: true, enum: ["auto", "direct"] }),
      coupon: sch("BOOLEAN", { nullable: true }),
      reply: sch("STRING"),
    },
    required: ["intent", "request", "origin", "origin_name", "place", "car_type", "pay_method", "coupon", "reply"],
  });
}

// 대화 턴에서 쓸 수 있는 의도 (단계마다 일부만 허용)
const INTENT_MEANINGS = {
  approve: "도우미의 제안에 동의·승인 (네, 좋아요, 그렇게 해줘 등)",
  reject: "도우미의 제안을 거절하거나 틀렸다고 함",
  normal: "일반택시를 고름",
  deluxe: "모범택시를 고름",
  large: "대형택시를 고름",
  auto: "자동결제(등록된 카드)를 고름",
  direct: "직접결제(내릴 때 기사님께)를 고름",
  set_origin: "출발지를 바꾸라고 함 (origin 채움)",
  set_request: "기사님 요청사항을 바꾸거나 빼라고 함 (request 채움: 없음 → none, 대화·이야기 → chat, 조용히 → quiet)",
  set_dest: "목적지를 특정 지점으로 바꾸라고 함 (place 채움)",
  set_car: "택시 종류를 바꾸라고 함 (car_type 채움)",
  set_pay: "결제 방식을 바꾸라고 함 (pay_method 채움)",
  set_coupon: "쿠폰을 적용하거나 빼라고 함 (coupon 채움)",
  unsuitable_app: "지정된 앱이 아닌 다른 앱(다른 택시 앱, 전화, 카메라 등)을 말함",
  pause: "바꿀 값 없이 진행을 멈추라고 하거나 무언가 잘못됐다고 지적함 (멈춰, 기다려, 잘못했잖아, 이상해 등)",
  continue: "바꿀 것 없이 그대로(하던 대로) 진행하라고 함. 예: '그냥 해', '하던 거 해', '괜찮아 계속해', '없어'",
  cancel: "택시 호출 자체를 취소하라고 함",
  cancel_reserve: "다음 주 택시 예약을 하지 말라고 하거나 취소하라고 함 (예약 취소해줘, 예약하지 마, 예약 필요 없어, 그건 하지 마 등)",
  other: "위 어느 것에도 해당하지 않음 (질문, 잡담, 이해하기 어려운 말 등)",
};

// 프롬프트 버전 표시용 짧은 해시
function promptVersion(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

const LLM = {
  key: "",
  model: DEFAULT_MODEL,
  prompt: DEFAULT_PROMPT,

  get system() {
    return `${this.prompt.trim()}\n\n${OUTPUT_FORMAT}`;
  },
  get promptVersion() {
    return promptVersion(this.prompt.trim());
  },

  get enabled() {
    return Boolean(this.key);
  },

  async listModels(key) {
    const res = await fetch(`${GEMINI_BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
    if (!res.ok) throw new Error(await errorText(res));
    const data = await res.json();
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => n.startsWith("gemini"));
  },

  // kind: "request" | "turn"
  // 반환: { output, source: "gemini"|"rules", model, latency_ms, error? }
  async interpret(kind, text, context = {}) {
    const started = performance.now();
    const { fallback_reply, fallback_by_intent, app_keywords, free_origin, ...llmContext } = context;
    if (this.enabled) {
      try {
        let schema = REQUEST_SCHEMA;
        if (kind === "turn") schema = turnSchema(context.intents);
        const output = await geminiCall(this.key, this.model, buildPrompt(kind, text, llmContext), schema);
        if (kind === "turn" && !context.intents.includes(output.intent)) output.intent = "other";
        this.lastError = null;
        return { output, source: "gemini", model: workingModel || this.model, latency_ms: Math.round(performance.now() - started) };
      } catch (err) {
        const output = Rules[kind](text, context);
        this.lastError = String(err.message || err);
        try { localStorage.setItem("llm_last_error", JSON.stringify({ at: new Date().toISOString(), error: this.lastError })); } catch {}
        return { output, source: "rules", error: this.lastError, latency_ms: Math.round(performance.now() - started) };
      }
    }
    return { output: Rules[kind](text, context), source: "rules", latency_ms: Math.round(performance.now() - started) };
  },
};

async function errorText(res) {
  try {
    const j = await res.json();
    return `${res.status} ${j.error?.message || ""}`.trim();
  } catch {
    return String(res.status);
  }
}

// 모델 세대별 추론(thinking) 설정: 응답 지연을 줄이려고 최소로 둠
function thinkingConfigFor(model) {
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: "minimal" }; // 3.x 이후: thinkingLevel
  if (/2\.5-flash/.test(model)) return { thinkingBudget: 0 }; // 2.5 Flash: thinkingBudget
  return null;
}

// 매 턴 입력되는 현재 상태 + 사용자 발화
function buildPrompt(kind, text, c) {
  const lines = [LLM_TASKS[kind], "", "# 현재 상태"];
  lines.push(`- 자동화수준: ${c.automation}`);
  if (c.step) lines.push(`- 현재 단계: ${c.step}`);
  if (c.agent_said) lines.push(`- 현재 단계의 에이전트 문구: ${c.agent_said}`);
  if (c.step_guide) lines.push(`- 단계 설명: ${c.step_guide}`);
  if (c.current_ride) lines.push(`- 현재까지 입력된 호출 정보: ${JSON.stringify(c.current_ride)}`);
  if (c.recent) lines.push(`- 최근 대화:\n${c.recent.map((r) => `  ${r}`).join("\n")}`);
  if (kind === "turn") {
    if (c.reply_hint) lines.push("", "# 이번 턴 지침", c.reply_hint);
    lines.push("", "# 분류할 의도", ...c.intents.map((id) => `- ${id}: ${INTENT_MEANINGS[id] || id}`));
  }
  lines.push("", "# 사용자 발화", `"${text}"`);
  return lines.join("\n");
}

async function geminiCallModel(key, model, prompt, schema) {
  const thinking = thinkingConfigFor(model);
  try {
    return await geminiRequest(key, model, prompt, schema, thinking);
  } catch (err) {
    // 모델이 해당 thinking 설정을 지원하지 않으면 설정 없이 한 번 더 시도
    if (thinking && /thinking/i.test(String(err.message))) return geminiRequest(key, model, prompt, schema, null);
    throw err;
  }
}

// 일시적인 실패(요청 한도 429, 서버 오류 5xx, 시간 초과·네트워크)는 잠깐 쉬고 한 번 더 시도
async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    const m = String(err.message || err);
    if (!/^(429|500|502|503|504)\b|abort|network|Failed to fetch|Load failed/i.test(m)) throw err;
    await new Promise((r) => setTimeout(r, 1200));
    return fn();
  }
}

// 지정한 모델이 없으면(404) 대체 모델로 이어서 시도하고, 되는 모델을 기억함
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-2.5-flash"];
let workingModel = null;
async function geminiCall(key, model, prompt, schema) {
  const chain = [workingModel || model, ...FALLBACK_MODELS.filter((m) => m !== (workingModel || model))];
  let lastErr;
  for (const m of chain) {
    try {
      const out = await withRetry(() => geminiCallModel(key, m, prompt, schema));
      workingModel = m;
      return out;
    } catch (err) {
      lastErr = err;
      if (!/^(404|400)\b|not found|not supported/i.test(String(err.message))) throw err;
    }
  }
  throw lastErr;
}

async function geminiRequest(key, model, prompt, schema, thinking) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: LLM.system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        // Gemini 3.x는 temperature 등 샘플링 값을 기본값으로 두는 것을 권장
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(await errorText(res));
    const data = await res.json();
    const cand = data.candidates?.[0];
    const raw = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
    if (!raw) throw new Error(`빈 응답 (${cand?.finishReason || data.promptFeedback?.blockReason || "unknown"})`);
    return JSON.parse(raw);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------- 규칙 기반 해석 (키 없음 / 실패 시) ----------------
// 예상 밖 답변을 몇 가지 유형으로 나누고, 유형별로 정해진 답변을 돌려줍니다.

// 기사님 요청사항: "빼줘"·"없이" → none, "대화"·"이야기" → chat, "조용히" → quiet
function extractRequest(t) {
  if (/조용/.test(t)) return /(빼|말고|없이|취소|싫)/.test(t) ? "none" : "quiet";
  if (/(대화|이야기|얘기|말\s?걸)/.test(t)) return /(빼|말고|없이|취소|싫|안\s?하)/.test(t) ? "none" : "chat";
  if (/(요청|요청사항)/.test(t) && /(빼|없이|없애|취소|안\s?해)/.test(t)) return "none";
  if (/^(없어|없이|빼줘|빼|없음)/.test(t.trim())) return "none";
  return null;
}

// 출발지: "동천" → dongcheon, "현재 위치"·"여기" → current
const extractOrigin = (t) => (/동천/.test(t) ? "dongcheon" : /현재\s?위치|지금\s?있는|여기서/.test(t) ? "current" : null);

// 자유 장소 이름: "판교역으로 해줘" → "판교역" (질문·부정·의미 없는 말이면 null)
function extractFreePlace(t) {
  if (QUESTION.test(t) || /(몰라|모르겠|글쎄|아무|그냥\s?해|취소|그만)/.test(t)) return null;
  const n = t.replace(/^(출발지(는|를|을)?|출발은)\s*/, "")
    .replace(/\s*(에서|으로|로)?\s*(출발|해\s?줘|해\s?주세요|바꿔\s?줘|바꿔\s?주세요|설정해\s?줘|설정해\s?주세요|할게요?|탈게요?|타고\s?갈게요?|부탁해요?|해요|요)?[.!~\s]*$/, "")
    .trim();
  return n.length >= 2 && n.length <= 25 ? n : null;
}

// 목적지 지점: "강남구청" → gucheong, "역삼" → yeoksam, "강남(점)" → gangnam
function extractPlace(text) {
  const t = text.replace(/\s+/g, "");
  if (/구청/.test(t)) return "gucheong";
  if (/역삼/.test(t)) return "yeoksam";
  if (/강남/.test(t)) return "gangnam";
  return null;
}
const extractCar = (t) => (/모범/.test(t) ? "deluxe" : /대형|큰\s?차|밴/.test(t) ? "large" : /일반/.test(t) ? "normal" : null);
const extractPay = (t) => (/직접|현금|기사님께|내릴\s?때/.test(t) ? "direct" : /자동|카드/.test(t) ? "auto" : null);

const YES = /(^|\s)(네|예|응|그래|좋아|좋아요|맞아|맞아요|맞습니다|승인|진행|계속|괜찮|오케이|ok|okay|그렇게|열어|적용)/i;
const NO = /(아니|아뇨|거부|아냐|틀려|틀렸|잘못|안\s?돼|하지\s?마|싫어|멈춰|잠깐|바꿔|수정)/i;
const QUESTION = /(\?|뭐|왜|어떻게|무슨|언제|얼마|어디)/;

const Rules = {
  request(text) {
    const place = extractPlace(text);
    const isRide = /(택시|호출|불러|잡아|타고|가고\s?싶|데려다)/.test(text) || place != null;
    return {
      is_ride_request: isRide,
      destination: place ? PLACES[place].name : /한정식|담소|모임/.test(text) ? text : null,
      origin: extractOrigin(text),
      origin_name: extractOrigin(text) ? null : (text.match(/([가-힣A-Za-z0-9]+(?:\s[가-힣A-Za-z0-9]+)?)\s*에서/)?.[1] ?? null),
      car_type: extractCar(text),
      pay_method: extractPay(text),
      wants_coupon: /쿠폰|할인/.test(text),
      clarification: isRide
        ? (place == null && !/한정식|담소|모임/.test(text) ? "어디로 갈까요?" : null)
        : "저는 휴대폰 앱을 대신 조작해서 택시 호출 같은 일을 도와드릴 수 있어요. 어떤 일을 도와드릴까요?",
    };
  },

  turn(text, ctx) {
    const allowed = new Set(ctx.intents);
    const out = (intent, extra = {}) => ({
      intent, request: null, origin: null, origin_name: null, place: null, car_type: null, pay_method: null, coupon: null,
      reply: ctx.fallback_reply || (QUESTION.test(text)
        ? "궁금하신 점은 호출을 마친 뒤에 도와드릴게요. 지금 단계부터 이어서 진행할게요."
        : "제가 잘 이해하지 못했어요. 화면의 버튼을 누르시거나 다시 말씀해주세요."),
      ...extra,
    });
    const t = text.replace(/\s+/g, " ").trim();
    const byIntent = (intent, extra) => out(intent, { reply: ctx.fallback_by_intent?.[intent] || out(intent).reply, ...extra });

    // 예약 단계: 예약을 하지 말라거나 취소하라는 말은 예약 취소 (멈춤·호출 취소보다 먼저)
    if (allowed.has("cancel_reserve") && (/(예약|그거|그건).*(취소|하지\s?마|하지\s?말|말아|필요\s?없|안\s?해|싫)/.test(t) || /^(취소|취소해|취소해\s?줘|하지\s?마|안\s?해|필요\s?없어)/.test(t))) return out("cancel_reserve");

    // 앱 이름을 묻는 단계: 지정된 앱이면 approve, 그 외 앱은 모두 unsuitable_app ("전화", "카카오T" 등)
    if (allowed.has("unsuitable_app")) {
      if (ctx.app_keywords && new RegExp(ctx.app_keywords).test(t)) return byIntent("approve");
      if (YES.test(t) && !NO.test(t)) return byIntent("approve");
    }
    if (allowed.has("unsuitable_app") && !QUESTION.test(t) && !NO.test(t)) return byIntent("unsuitable_app");

    if (allowed.has("set_request")) {
      const r = extractRequest(t);
      if (r) return out("set_request", { request: r });
    }
    const origin = extractOrigin(t);
    const place = extractPlace(t);
    const car = extractCar(t);
    const pay = extractPay(t);
    const couponWord = /쿠폰|할인/.test(t);
    if (allowed.has("pause") && (/(멈춰|멈춰봐|기다려|스톱|stop|잠깐만|이상해|잘못)/i.test(t) || NO.test(t)) && !origin && !place && !car && !pay && !couponWord) return byIntent("pause");

    if (origin && allowed.has("set_origin") && (!place || /출발/.test(t))) return out("set_origin", { origin });
    // 출발지를 묻는 중: 동천역·현재 위치 외의 장소를 말하면 그 이름 그대로
    if (ctx.free_origin && allowed.has("set_origin")) {
      const name = extractFreePlace(t);
      if (name) return out("set_origin", { origin_name: name });
    }

    if (place && allowed.has("set_dest")) return out("set_dest", { place });
    // 값 없이 "목적지가 잘못됐어" → 어디로 바꿀지 되물음
    if (!place && allowed.has("set_dest") && /(목적지|도착|장소|지점|가게|식당)/.test(t) && !QUESTION.test(t.replace(/어디/, ""))) return out("other", { reply: "목적지를 어디로 바꿀까요?" });
    if (car && allowed.has(car)) return out(car);
    if (car && allowed.has("set_car")) return out("set_car", { car_type: car });
    if (pay && allowed.has(pay)) return out(pay);
    if (pay && allowed.has("set_pay")) return out("set_pay", { pay_method: pay });
    if (couponWord && allowed.has("set_coupon")) return out("set_coupon", { coupon: !/(빼|말고|안\s?써|취소|없이)/.test(t) });
    if (allowed.has("cancel") && /(취소|그만|안\s?갈|부르지\s?마|(예약|호출)\s?하지\s?(마|말)|예약\s?(안\s?해|말아))/.test(t)) return out("cancel");
    if (allowed.has("reject") && NO.test(t)) return out("reject");
    if (allowed.has("approve") && YES.test(t)) return out("approve");
    // 목적지가 맞는지 의심·확인하는 말 → 지금 목적지를 알려줌 (질문을 '그대로 진행'으로 오해하지 않게)
    if (/(목적지|어디|장소)/.test(t) && (QUESTION.test(t) || NO.test(t) || /맞/.test(t))) {
      const cur = ctx.current_ride?.destination;
      if (cur) return out("other", { reply: `목적지는 ‘${cur}’이에요.${ctx.fallback_reply ? " " + ctx.fallback_reply : ""}` });
    }
    if (allowed.has("continue") && !QUESTION.test(t) && !NO.test(t) && (YES.test(t) || /(그대로|없어|하던|원래대로|다시\s?해|그냥\s?(해|진행|불러)|이대로)/.test(t))) return out("continue");
    return out("other");
  },
};
