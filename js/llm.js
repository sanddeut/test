// 참가자 발화 해석 + 스크립트 밖 응답 생성
// - Gemini API 키가 있으면 Gemini 구조화 출력(JSON)으로 의도 분류·값 추출·자연스러운 응답 생성
// - 키가 없거나 호출이 실패하면 규칙 기반(유형별 정해진 답변)으로 대체
// 시나리오 고정 문구는 scenarios.js가 통제하고, LLM 응답(reply)은 스크립트에 없는 상황에서만 쓰입니다.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";

const LLM_SYSTEM = `당신은 스마트폰에서 송금을 대신 해주는 "AI 도우미" 연구 프로토타입의 언어 이해·응답 모듈입니다.
참가자(주로 중장년층)가 도우미에게 한 말을 해석해 지정된 JSON 스키마로만 답합니다.
도우미의 정해진 문구와 진행 순서는 연구 시나리오 스크립트가 통제합니다. 당신은
1) 참가자의 의도를 허용된 intent 중 하나로 분류하고 필요한 값을 추출하며,
2) 스크립트에 없는 말(질문, 잡담, 예상 밖 요청 등)에 대해 도우미가 할 짧은 응답(reply)을 씁니다.

값 추출 규칙:
- 금액은 원 단위 정수로 변환합니다. 예: "30만원", "삼십만 원", "300,000원" → 300000.
- 구어체, 맞춤법 오류, 음성인식 오류(예: "삼심만원")를 너그럽게 해석합니다.

reply 작성 규칙:
- 해요체, 2문장 이내, 스크립트 문구와 비슷한 길이로 씁니다.
- 참가자의 말에 먼저 자연스럽게 반응한 뒤, 현재 단계로 부드럽게 돌아오도록 이끕니다. 강압적으로 되돌리지 않습니다.
- 객관적 사실만 말하고, 부가설명이나 확신 정도("아마", "확실히" 등)는 넣지 않습니다.
- context에 없는 사실(다른 계좌, 잔액 외 정보 등)을 지어내지 않습니다.
- 화면의 버튼(승인/거부 등)은 참가자에게 이미 보이므로 버튼 이름을 길게 설명하지 않습니다.`;

const LLM_TASKS = {
  request:
    "참가자의 첫 과업 요청을 해석하세요. 송금 요청이 아니거나 금액을 알 수 없을 때만 clarification에 되묻는 말(해요체, 2문장 이내)을 쓰세요.",
  turn:
    "도우미가 context.agent_said 라고 말한 뒤 참가자가 대답했습니다. context.intents 중 참가자의 의도에 가장 맞는 id를 intent로 고르고, 해당하는 값을 채우세요. reply에는 그 상황에서 도우미가 할 자연스러운 응답을 쓰세요(context.reply_hint가 있으면 참고). 어느 intent에도 맞지 않으면 other를 고르세요.",
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
  continue: "바꿀 것 없이 그대로 진행하라고 함",
  cancel: "송금 자체를 취소하라고 함",
  other: "위 어느 것에도 해당하지 않음 (질문, 잡담, 이해하기 어려운 말 등)",
};

const LLM = {
  key: "",
  model: DEFAULT_MODEL,

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
    const { fallback_reply, ...llmContext } = context;
    if (this.enabled) {
      try {
        let schema = REQUEST_SCHEMA;
        if (kind === "turn") {
          llmContext.intents = context.intents.map((id) => ({ id, meaning: INTENT_MEANINGS[id] || id }));
          schema = turnSchema(context.intents);
        }
        const output = await geminiCall(this.key, this.model, LLM_TASKS[kind], schema, text, llmContext);
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

async function geminiCall(key, model, task, schema, text, context) {
  const prompt = `${task}\n\n<context>\n${JSON.stringify(context, null, 2)}\n</context>\n\n<participant_utterance>\n${text}\n</participant_utterance>`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: LLM_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema: schema,
          // 2.5 Flash 계열은 추론(thinking)을 꺼서 응답 지연을 줄임
          ...(/2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
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

    const amount = extractAmount(t);
    if (amount != null && allowed.has("set_amount")) return out("set_amount", { amount_won: amount });
    const acct = extractAccount(t);
    if (acct && allowed.has("set_account")) return out("set_account", { account_number: acct });
    if (allowed.has("set_source") && /(적금|주거래)/.test(t)) return out("set_source", { source_account: /적금/.test(t) ? "savings" : "main" });
    if (allowed.has("find_other") && /다른/.test(t)) return out("find_other");
    if (allowed.has("direct_input") && /직접/.test(t)) return out("direct_input");
    if (allowed.has("cancel") && /(취소|그만|안\s?보내|보내지\s?마)/.test(t)) return out("cancel");
    if (allowed.has("main") && /주거래|주\s?통장/.test(t)) return out("main");
    if (allowed.has("savings") && /적금/.test(t)) return out("savings");
    if (allowed.has("set_memo") && !YES.test(t) && !NO.test(t) && !QUESTION.test(t)) {
      return out("set_memo", { memo: t.replace(/^['‘"“]|['’"”]$/g, "").replace(/(으로|로)?\s*(남겨|해|적어)(줘|주세요|줘요)?\.?$/, "").trim() });
    }
    if (allowed.has("reject") && NO.test(t)) return out("reject");
    if (allowed.has("approve") && YES.test(t)) return out("approve");
    if (allowed.has("open") && YES.test(t)) return out("open");
    if (allowed.has("continue") && (YES.test(t) || /(그대로|없어|없어요)/.test(t))) return out("continue");
    return out("other");
  },
};
