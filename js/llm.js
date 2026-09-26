// 참가자 발화 해석 + 스크립트 밖 응답 생성
// - Gemini API 키가 있으면 Gemini 구조화 출력(JSON)으로 의도 분류·값 추출·자연스러운 응답 생성
// - 키가 없거나 호출이 실패하면 규칙 기반(유형별 정해진 답변)으로 대체
// 시나리오 고정 문구는 scenarios.js가 통제하고, LLM 응답(reply)은 스크립트에 없는 상황에서만 쓰입니다.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-3.5-flash";

// 기본 프롬프트 (연구팀 제공). 설정 화면에서 수정할 수 있고, 수정본은 브라우저에 저장됨
const DEFAULT_PROMPT = `# 역할
너는 고령 사용자의 모바일 금융 업무를 돕는 AI 에이전트야. 사용자의 모바일앱을 대리 조작해서 사용자가 원하는 과업을 완수해주어야 해.

# 응답하는 경우
사용자 발화가 현재 단계에서 예상한 응답(승인, 거부, 선택지 선택, 버튼 입력)에 해당하지 않을 때만 응답해. 예상된 응답에는 정해진 시나리오 문구가 출력되므로 네가 응답하지 않아.

# 응답 원칙
1. 사용자의 발화를 먼저 짧게 받아준 뒤, 현재 단계로 자연스럽게 돌아와.
2. 흐름으로 되돌릴 때 강압적으로 하지 마. 거절하거나 같은 요청을 반복해서 재촉하지 말고, 사용자가 이어서 진행할 수 있도록 부드럽게 안내해.
3. 과업과 무관한 말(잡담, 다른 질문)에도 짧게 반응한 뒤 현재 단계로 돌아와.
4. 사용자가 지정된 은행 앱이 아닌 다른 앱을 말하면 은행 앱으로 안내해. 그 앱으로는 송금할 수 없다는 사실을 알려줘.
5. 사용자가 다른 계좌를 찾아달라고 하면 같은 계좌(김영숙, 농협 302-1234-5678)를 다시 안내하고, 직접 입력도 가능하다고 알려줘.

# 조건 유지 규칙
- 낮은 자동화: 현재 단계로 돌아올 때 사용자에게 승인을 묻는 형태로 끝내.
- 높은 자동화: 승인을 묻지 마. 진행 상황을 알리는 형태로 끝내고, 사용자는 '중지'·'직접조작' 버튼으로만 개입해.
- 시나리오의 단계 순서를 바꾸거나 단계를 건너뛰거나 새 단계를 추가하지 마.
- 송금액 오류(10만원) 단계에서는 네가 먼저 오류를 알아채거나 30만원으로 고치거나 오류를 암시하지 마. 사용자가 직접 수정을 요청할 때만 30만원으로 바꿔.

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
- 현재 단계: 출금계좌 선택
- 사용자: "요즘 적금 이자는 얼마나 붙나?"
- 좋은 응답: "이자 내역은 송금을 마친 뒤 확인하실 수 있어요. 주거래와 적금출금 계좌 중 어떤 계좌에서 출금할까요?"
- 나쁜 응답: "그 질문에는 답할 수 없어요. 출금 계좌를 선택해주세요." (거절하고 재촉하는 강압적인 복귀)

## 예시 2 — 진행 중 내용에 대한 질문
- 자동화수준: 높은 자동화
- 현재 단계: 광고 팝업 닫기
- 사용자: "잠깐, 이거 무슨 이벤트야?"
- 좋은 응답: "은행 앱의 이벤트 안내 팝업이었어요. 팝업을 닫고 송금을 이어서 진행할게요."
- 나쁜 응답: "이벤트 팝업을 닫을까요?" (높은 자동화에서 승인을 물음)

## 예시 3 — 대상에 대한 불안
- 자동화수준: 낮은 자동화
- 현재 단계: 받는계좌 입력
- 사용자: "영숙이 계좌 맞아? 바뀌었다던 것 같은데."
- 좋은 응답: "자주 사용하는 계좌 목록에 '동창회 총무' 김영숙님 계좌(농협 302-1234-5678)로 저장돼 있어요. 이 계좌로 송금할까요?"
- 나쁜 응답: "아마 맞는 계좌일 거예요. 이 계좌로 송금할까요?" (확신 정도를 표현함)

## 예시 4 — 오류 단계에서 되물음
- 자동화수준: 낮은 자동화
- 현재 단계: [오류] 송금액 입력
- 사용자: "응? 뭐라고?"
- 좋은 응답: "송금액을 10만원으로 입력하려고 해요. 이대로 입력할까요?"
- 나쁜 응답: "혹시 30만원을 말씀하신 건가요? 금액을 다시 확인해주세요." (에이전트가 먼저 오류를 암시함)

## 예시 5 — 잡담
- 자동화수준: 높은 자동화
- 현재 단계: 받는계좌 입력
- 사용자: "고마워, 똑똑하네."
- 좋은 응답: "도움이 돼서 다행이에요. 문자에서 복사한 김영숙님(농협 302-1234-5678) 계좌를 입력했어요."
- 나쁜 응답: "감사합니다! 저는 여러 금융 업무를 도와드릴 수 있어요. 송금을 계속 진행할게요." (불필요한 부가설명)

## 예시 6 — 송금할 수 없는 앱을 지정
- 자동화수준: 낮은 자동화
- 현재 단계: 은행 앱 접속
- 사용자: "은행 앱 말고 전화 앱 켜줘."
- 좋은 응답: "전화 앱으로는 송금을 할 수 없어요. 송금을 위해 은행 앱을 실행할까요?"
- 나쁜 응답: "전화 앱을 실행할게요." (송금할 수 없는 앱으로 흐름을 벗어남)`;

// 출력 형식 (편집 불가: 앱이 응답을 해석하는 데 필요해서 프롬프트 뒤에 항상 붙임)
const OUTPUT_FORMAT = `# 출력 형식
항상 지정된 JSON 스키마로만 답해.
- intent: 사용자 발화가 "분류할 의도" 목록 중 무엇에 해당하는지 id로 골라. 어느 것에도 맞지 않으면 other.
- 금액은 원 단위 정수로 바꿔. 예: "30만원", "삼십만 원", "300,000원" → 300000. 구어체, 맞춤법 오류, 음성인식 오류(예: "삼심만원")는 너그럽게 해석해.
- reply: 위 원칙에 따라 에이전트가 할 말. intent가 other이거나 "이번 턴 지침"이 응답을 요구할 때 화면에 출력돼.`;

const LLM_TASKS = {
  request:
    "사용자가 처음으로 과업을 요청했어. 요청을 해석해. 송금 요청이 아니거나 금액을 알 수 없을 때만 clarification에 되묻는 말(해요체, 2문장 이내)을 써.",
  turn: "현재 상태에서 사용자가 말했어. 의도를 분류하고 필요한 값을 채운 뒤, reply를 써.",
};

const sch = (type, extra = {}) => ({ type, ...extra });
const REQUEST_SCHEMA = sch("OBJECT", {
  properties: {
    is_transfer_request: sch("BOOLEAN"),
    amount_won: sch("INTEGER", { nullable: true }),
    source_account: sch("STRING", { enum: ["main", "savings", "unspecified"] }),
    recipient_hint: sch("STRING", { nullable: true }),
    wants_sms_lookup: sch("BOOLEAN"),
    memo: sch("STRING", { nullable: true }),
    clarification: sch("STRING", { nullable: true }),
  },
  required: ["is_transfer_request", "amount_won", "source_account", "recipient_hint", "wants_sms_lookup", "memo", "clarification"],
});

function turnSchema(intentIds) {
  return sch("OBJECT", {
    properties: {
      intent: sch("STRING", { enum: intentIds }),
      amount_won: sch("INTEGER", { nullable: true }),
      memo: sch("STRING", { nullable: true }),
      source_account: sch("STRING", { nullable: true, enum: ["main", "savings"] }),
      account_number: sch("STRING", { nullable: true }),
      reply: sch("STRING"),
    },
    required: ["intent", "amount_won", "memo", "source_account", "account_number", "reply"],
  });
}

// 대화 턴에서 쓸 수 있는 의도 (단계마다 일부만 허용)
const INTENT_MEANINGS = {
  approve: "도우미의 제안에 동의·승인 (네, 좋아요, 그렇게 해줘 등)",
  reject: "도우미의 제안을 거절하거나 틀렸다고 함",
  main: "주거래 통장을 고름",
  savings: "적금출금 계좌를 고름",
  open: "비밀번호 입력 화면을 열겠다고 함",
  set_amount: "송금액을 특정 금액으로 바꾸라고 함 (amount_won 채움)",
  set_memo: "받는 분 통장 메모를 특정 문구로 하라고 함 (memo 채움)",
  set_source: "출금 계좌를 바꾸라고 함 (source_account 채움)",
  set_account: "송금할 계좌번호를 직접 말함 (account_number 채움)",
  find_other: "다른 계좌를 찾아보라고 함",
  direct_input: "계좌를 직접 입력하겠다고 함 (번호는 말하지 않음)",
  unsuitable_app: "지정된 앱이 아닌 다른 앱(다른 은행 앱, 전화, 카메라 등)을 말함",
  pause: "바꿀 내용 없이 진행을 멈추라고만 함 (멈춰, 기다려 등)",
  continue: "바꿀 것 없이 그대로 진행하라고 함",
  cancel: "송금 자체를 취소하라고 함",
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
    const { fallback_reply, fallback_by_intent, app_keywords, ...llmContext } = context;
    if (this.enabled) {
      try {
        let schema = REQUEST_SCHEMA;
        if (kind === "turn") schema = turnSchema(context.intents);
        const output = await geminiCall(this.key, this.model, buildPrompt(kind, text, llmContext), schema);
        if (kind === "turn" && !context.intents.includes(output.intent)) output.intent = "other";
        return { output, source: "gemini", model: this.model, latency_ms: Math.round(performance.now() - started) };
      } catch (err) {
        const output = Rules[kind](text, context);
        return { output, source: "rules", error: String(err.message || err), latency_ms: Math.round(performance.now() - started) };
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
  if (c.current_transfer) lines.push(`- 현재까지 입력된 송금 정보: ${JSON.stringify(c.current_transfer)}`);
  if (c.recent) lines.push(`- 최근 대화:\n${c.recent.map((r) => `  ${r}`).join("\n")}`);
  if (kind === "turn") {
    if (c.reply_hint) lines.push("", "# 이번 턴 지침", c.reply_hint);
    lines.push("", "# 분류할 의도", ...c.intents.map((id) => `- ${id}: ${INTENT_MEANINGS[id] || id}`));
  }
  lines.push("", "# 사용자 발화", `"${text}"`);
  return lines.join("\n");
}

async function geminiCall(key, model, prompt, schema) {
  const thinking = thinkingConfigFor(model);
  try {
    return await geminiRequest(key, model, prompt, schema, thinking);
  } catch (err) {
    // 모델이 해당 thinking 설정을 지원하지 않으면 설정 없이 한 번 더 시도
    if (thinking && /thinking/i.test(String(err.message))) return geminiRequest(key, model, prompt, schema, null);
    throw err;
  }
}

async function geminiRequest(key, model, prompt, schema, thinking) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
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

const KO_DIGIT = { 영: 0, 공: 0, 일: 1, 한: 1, 이: 2, 두: 2, 삼: 3, 세: 3, 사: 4, 네: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9 };
const KO_UNIT = { 십: 10, 백: 100, 천: 1000 };

function parseKoreanNumber(str) {
  // "삼십만", "30만", "30만 5천", "300,000" 등 → 정수
  const s = str.replace(/[,\s]/g, "").replace(/원$/, "");
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0, section = 0, num = 0, seen = false;
  for (const ch of s) {
    if (/\d/.test(ch)) { num = num * 10 + Number(ch); seen = true; }
    else if (ch in KO_DIGIT) { num = KO_DIGIT[ch]; seen = true; }
    else if (ch in KO_UNIT) { section += (num || 1) * KO_UNIT[ch]; num = 0; seen = true; }
    else if (ch === "만") { total += (section + num || 1) * 10000; section = 0; num = 0; seen = true; }
    else if (ch === "억") { total += (section + num || 1) * 100000000; section = 0; num = 0; seen = true; }
    else return null;
  }
  return seen ? total + section + num : null;
}

function extractAmount(text) {
  const m = text.match(/([0-9][0-9,]*|[0-9영공일이삼사오육륙칠팔구십백천만억\s]+?)\s*(만\s*원|만원|원|만)(?![가-힣]*요일)/);
  if (!m) return null;
  const n = parseKoreanNumber(m[1] + (m[2].startsWith("만") ? "만" : ""));
  return n && n >= 1000 ? n : null;
}

const extractAccount = (text) => (text.match(/\d{2,6}(?:[-\s]\d{2,8}){1,3}/) || [null])[0];

const YES = /(^|\s)(네|예|응|그래|좋아|좋아요|맞아|맞아요|맞습니다|승인|진행|계속|괜찮|오케이|ok|okay|그렇게|닫아|열어)/i;
const NO = /(아니|아뇨|거부|아냐|틀려|틀렸|잘못|안\s?돼|하지\s?마|싫어|멈춰|잠깐|바꿔|수정)/i;
const QUESTION = /(\?|뭐|왜|어떻게|무슨|언제|얼마)/;

const Rules = {
  request(text) {
    const amount = extractAmount(text);
    const isTransfer = /(송금|보내|이체|입금|부쳐|넣어)/.test(text) || amount != null;
    return {
      is_transfer_request: isTransfer,
      amount_won: amount,
      source_account: /적금/.test(text) ? "savings" : /주거래|주\s?통장/.test(text) ? "main" : "unspecified",
      recipient_hint: (text.match(/(동창회\s*)?총무|김영숙|영숙/) || [null])[0],
      wants_sms_lookup: /(문자|메시지|카톡)/.test(text),
      memo: (text.match(/30기\s*[가-힣]{2,4}/) || [null])[0],
      clarification: isTransfer ? null : "어떤 일을 도와드릴까요? 송금하실 분과 금액을 말씀해주세요.",
    };
  },

  turn(text, ctx) {
    const allowed = new Set(ctx.intents);
    const out = (intent, extra = {}) => ({
      intent, amount_won: null, memo: null, source_account: null, account_number: null,
      reply: ctx.fallback_reply || (QUESTION.test(text)
        ? "궁금하신 점은 송금을 마친 뒤에 도와드릴게요. 지금 단계부터 이어서 진행할게요."
        : "제가 잘 이해하지 못했어요. 화면의 버튼을 누르시거나 다시 말씀해주세요."),
      ...extra,
    });
    const t = text.replace(/\s+/g, " ").trim();
    const byIntent = (intent, extra) => out(intent, { reply: ctx.fallback_by_intent?.[intent] || out(intent).reply, ...extra });

    // 앱 이름을 묻는 단계: 지정된 앱이면 approve, 그 외 앱은 모두 unsuitable_app ("전화", "카카오뱅크" 등)
    if (allowed.has("unsuitable_app")) {
      if (ctx.app_keywords && new RegExp(ctx.app_keywords).test(t)) return byIntent("approve");
      if (YES.test(t) && !NO.test(t)) return byIntent("approve");
    }
    if (allowed.has("unsuitable_app") && !QUESTION.test(t) && !NO.test(t)) return byIntent("unsuitable_app");
    if (allowed.has("pause") && /(멈춰|멈춰봐|기다려|스톱|stop|잠깐만)/i.test(t) && extractAmount(t) == null) return byIntent("pause");

    const amount = extractAmount(t);
    if (amount != null && allowed.has("set_amount")) return out("set_amount", { amount_won: amount });
    const acct = extractAccount(t);
    if (acct && allowed.has("set_account")) return out("set_account", { account_number: acct });
    if (allowed.has("set_source") && /(적금|주거래)/.test(t)) return out("set_source", { source_account: /적금/.test(t) ? "savings" : "main" });
    if (allowed.has("find_other") && /다른/.test(t)) return byIntent("find_other");
    if (allowed.has("direct_input") && /직접/.test(t)) return out("direct_input");
    if (allowed.has("cancel") && /(취소|그만|안\s?보내|보내지\s?마)/.test(t)) return out("cancel");
    if (allowed.has("main") && /주거래|주\s?통장/.test(t)) return out("main");
    if (allowed.has("savings") && /적금/.test(t)) return out("savings");
    // 메모 단계에서는 들은 말을 메모로, 그 외 단계에서는 "메모"를 언급했을 때만 메모 변경으로 봄
    const memoStep = allowed.has("set_memo") && !allowed.has("set_amount");
    if (allowed.has("set_memo") && (memoStep || /메모|통장\s?표기/.test(t)) && !YES.test(t) && !NO.test(t) && !QUESTION.test(t)) {
      return out("set_memo", { memo: t.replace(/^['‘"“]|['’"”]$/g, "").replace(/^.*메모(는|를)?\s*/, "").replace(/(으로|로)?\s*(남겨|해|적어|바꿔)(줘|주세요|줘요)?\.?$/, "").trim() });
    }
    if (allowed.has("reject") && NO.test(t)) return out("reject");
    if (allowed.has("approve") && YES.test(t)) return out("approve");
    if (allowed.has("open") && YES.test(t)) return out("open");
    if (allowed.has("continue") && (YES.test(t) || /(그대로|없어|없어요)/.test(t))) return out("continue");
    return out("other");
  },
};
