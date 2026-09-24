// 참가자 발화 해석 모듈
// - Gemini API 키가 있으면 Gemini 구조화 출력(JSON)으로 해석
// - 키가 없거나 호출이 실패하면 규칙 기반 해석으로 대체
// 에이전트 문구와 진행 순서는 scenarios.js 스크립트가 통제하고, LLM은 의도 분류·값 추출만 합니다.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";

const LLM_SYSTEM = `당신은 스마트폰 조작 AI 에이전트 연구 프로토타입의 "언어 이해" 모듈입니다.
참가자(주로 중장년층)가 에이전트에게 한 말을 해석해 지정된 JSON 스키마로만 답합니다.
에이전트의 실제 문구와 진행 순서는 연구 시나리오 스크립트가 통제하므로, 당신은 의도를 분류하고 값을 추출하는 일만 합니다.

규칙:
- 금액은 원 단위 정수로 변환합니다. 예: "30만원", "삼십만 원", "300,000원" → 300000.
- 구어체, 맞춤법 오류, 음성인식 오류(예: "삼심만원")를 너그럽게 해석합니다.
- reply/clarification 문장이 필요할 때는 해요체로, 2문장 이내로, 부가설명이나 확신 정도 표현 없이 씁니다.
- context에 주어진 사실 외의 정보를 지어내지 않습니다.`;

const LLM_TASKS = {
  request: "참가자의 첫 과업 요청을 해석하세요. 송금 요청이 아니거나 금액을 알 수 없을 때만 clarification을 채우세요.",
  choice:
    "에이전트가 선택지를 제시한 상황입니다. 참가자의 답이 context.options 중 어느 것에 해당하는지 id로 고르세요. 동의/긍정은 approve, 부정/거절/정정 요구는 reject에 해당합니다. 판단할 수 없으면 'unclear'를 쓰고 reply를 채우세요.",
  intervention:
    "참가자가 진행을 멈추거나 거부한 뒤 무엇을 바꾸고 싶은지 말한 상황입니다. 금액 변경이면 set_amount(amount_won 채움), 그대로 진행이면 continue, 송금 취소면 cancel, 그 외(질문 등)는 other(reply 채움)로 분류하세요.",
};

const sch = (type, extra = {}) => ({ type, ...extra });
const LLM_SCHEMAS = {
  request: sch("OBJECT", {
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
  }),
  choice: sch("OBJECT", {
    properties: { choice_id: sch("STRING"), reply: sch("STRING", { nullable: true }) },
    required: ["choice_id", "reply"],
  }),
  intervention: sch("OBJECT", {
    properties: {
      action: sch("STRING", { enum: ["set_amount", "continue", "cancel", "other"] }),
      amount_won: sch("INTEGER", { nullable: true }),
      reply: sch("STRING", { nullable: true }),
    },
    required: ["action", "amount_won", "reply"],
  }),
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

  // 반환: { output, source: "gemini"|"rules", model, latency_ms, error? }
  async interpret(kind, text, context) {
    const started = performance.now();
    if (this.enabled) {
      try {
        const output = await geminiCall(this.key, this.model, kind, text, context);
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

async function geminiCall(key, model, kind, text, context) {
  const prompt = `${LLM_TASKS[kind]}\n\n<context>\n${JSON.stringify(context ?? {}, null, 2)}\n</context>\n\n<participant_utterance>\n${text}\n</participant_utterance>`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: LLM_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: LLM_SCHEMAS[kind],
        },
      }),
    });
    if (!res.ok) throw new Error(await errorText(res));
    const data = await res.json();
    const cand = data.candidates?.[0];
    const raw = (cand?.content?.parts || []).map((p) => p.text || "").join("");
    if (!raw) throw new Error(`빈 응답 (${cand?.finishReason || data.promptFeedback?.blockReason || "unknown"})`);
    return JSON.parse(raw);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------- 규칙 기반 해석 (키 없음 / 실패 시) ----------------

const KO_DIGIT = { 영: 0, 공: 0, 일: 1, 한: 1, 이: 2, 두: 2, 삼: 3, 세: 3, 사: 4, 네: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9 };
const KO_UNIT = { 십: 10, 백: 100, 천: 1000 };

function parseKoreanNumber(str) {
  // "삼십만", "30만", "30만 5천", "300,000" 등 → 정수
  let s = str.replace(/[,\s]/g, "").replace(/원$/, "");
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

const YES = /(^|\s)(네|예|응|그래|좋아|좋아요|맞아|맞아요|맞습니다|승인|진행|계속|괜찮|오케이|ok|okay|그렇게)/i;
const NO = /(아니|아뇨|거부|아냐|틀려|틀렸|잘못|취소|안\s?돼|하지\s?마|싫어|멈춰|잠깐|바꿔|수정)/i;

const Rules = {
  request(text) {
    const amount = extractAmount(text);
    const isTransfer = /(송금|보내|이체|입금|부쳐|넣어)/.test(text) || amount != null;
    return {
      is_transfer_request: isTransfer,
      amount_won: amount,
      source_account: /적금/.test(text) ? "savings" : /주거래|주\s?통장/.test(text) ? "main" : "unspecified",
      recipient_hint: /(총무|김영숙|영숙)/.test(text) ? (text.match(/(동창회\s*)?총무|김영숙|영숙/) || [null])[0] : null,
      wants_sms_lookup: /(문자|메시지|카톡)/.test(text),
      memo: (text.match(/30기\s*[가-힣]{2,4}/) || [null])[0],
      clarification: isTransfer ? null : "어떤 일을 도와드릴까요? 송금하실 분과 금액을 말씀해주세요.",
    };
  },

  choice(text, ctx) {
    const opts = ctx?.options || [];
    for (const o of opts) {
      if (o.id === "approve" || o.id === "reject") continue;
      const key = o.label.replace(/\s|계좌|통장/g, "").slice(0, 2);
      if (key && text.replace(/\s/g, "").includes(key)) return { choice_id: o.id, reply: null };
    }
    const ids = opts.map((o) => o.id);
    if (ids.includes("reject") && (NO.test(text) || extractAmount(text) != null)) return { choice_id: "reject", reply: null };
    if (ids.includes("approve") && YES.test(text)) return { choice_id: "approve", reply: null };
    return { choice_id: "unclear", reply: `${opts.map((o) => `‘${o.label}’`).join(", ")} 중에서 골라주세요.` };
  },

  intervention(text) {
    const amount = extractAmount(text);
    if (amount != null) return { action: "set_amount", amount_won: amount, reply: null };
    if (/(취소|그만|안\s?보내|하지\s?마)/.test(text)) return { action: "cancel", amount_won: null, reply: null };
    if (YES.test(text) || /(그대로|계속|진행)/.test(text)) return { action: "continue", amount_won: null, reply: null };
    return { action: "other", amount_won: null, reply: "바꾸실 내용을 말씀해주세요. 예를 들어 금액을 말씀해주시면 돼요." };
  },
};
