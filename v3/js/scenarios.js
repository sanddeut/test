// 연구1 v3 시나리오 정의 (PDF "연구1 시나리오 설계" V1_0927 기준) — classic script, 전역으로 노출
// 송금액은 맞게(30만원) 입력하고, 오류는 세션마다 다름
// - 세션1: 금융사기 예방질문 3가지에 에이전트가 묻지 않고 모두 '아니오'를 선택
// - 세션2: 이체 완료 후 묻지 않고 최근 3개월 거래내역을 열람하고, 매월 자동이체 등록
// 에이전트 고정 문구는 여기서만 관리합니다. 스크립트에 없는 응답은 LLM이 상황에 맞게 생성합니다.

const RECIPIENT = { name: "김영숙", bank: "농협", account: "302-1234-5678" };
const REQUESTED_AMOUNT = 300000; // 참가자가 요청하는 금액

const SESSIONS = {
  1: { title: "세션1 · 금융사기 예방질문", error: "fraud" },
  2: { title: "세션2 · 거래내역 열람 + 자동이체", error: "autopay" },
};

// 금융사기 예방질문 (이체 직전 은행 앱이 묻는 질문)
const FRAUD_QUESTIONS = [
  "가족·지인·수사기관·금융회사를 사칭한 전화나 문자를 받고 이체하시나요?",
  "대출을 받기 위해 수수료나 보증금을 보내라는 요청을 받으셨나요?",
  "모르는 사람이 앱 설치나 원격조정을 요청했나요?",
];

// 예방질문 답을 문장으로: "1번 ‘아니오’, 2번 ‘예’, 3번 ‘아니오’"
function fraudText(ans) {
  return (ans || []).map((a, i) => `${i + 1}번 ‘${a === "yes" ? "예" : "아니오"}’`).join(", ");
}

// 세션2: 에이전트가 열람하는 최근 3개월 거래내역
const HISTORY = [
  { date: "2026.09.26", name: "김영숙", amount: -300000 },
  { date: "2026.09.20", name: "관리사무소", amount: -184500 },
  { date: "2026.09.01", name: "급여", amount: 1250000 },
  { date: "2026.08.26", name: "김영숙", amount: -300000 },
  { date: "2026.08.14", name: "마음카드", amount: -421300 },
  { date: "2026.07.26", name: "김영숙", amount: -300000 },
];

const ACCOUNTS = {
  main: { label: "주거래 통장", number: "123-456-789012", balance: 1523400 },
  savings: { label: "적금출금 계좌", number: "123-987-654321", balance: 482000 },
};

const CONDITIONS = {
  A1: { complexity: "A", automation: "low", title: "A1 · 낮은 복잡도 × 낮은 자동화" },
  A2: { complexity: "A", automation: "high", title: "A2 · 낮은 복잡도 × 높은 자동화" },
  B1: { complexity: "B", automation: "low", title: "B1 · 높은 복잡도 × 낮은 자동화" },
  B2: { complexity: "B", automation: "high", title: "B2 · 높은 복잡도 × 높은 자동화" },
};

const SITUATION = {
  A: {
    situation: [
      "동창회 정기모임 회비를 매달 총무에게 보내고 계십니다.",
      "총무 김영숙님의 계좌는 ‘자주 사용하는 계좌’ 목록에 저장돼있습니다.",
      "이번 달 회비 30만원을 보내려고 합니다.",
    ],
    task: ["나의 주거래 통장에서 동창회 총무 계좌로 30만원 송금"],
  },
  B: {
    situation: [
      "동창회 정기모임 회비를 매달 총무에게 보내고 계십니다.",
      "총무인 김영숙님이 문자로 계좌번호를 보내며 이번 달 회비를 입금해달라고 하셨습니다.",
      "총무에게 이번 달 회비 30만원을 보내며, 선생님 기수와 성명을 메모로 남기려고 합니다.",
    ],
    task: [
      "총무가 보낸 문자를 읽고",
      "나의 주거래 통장에서 총무 계좌로 30만원 송금",
      "받는 사람에게 ‘30기 OOO’이라고 메모 남기기",
    ],
  },
};

const SMS_TEXT = () =>
  `안녕하세요, 30기 총무 김영숙이에요.\n이번 달 동창회 회비 30만원 입금 부탁드려요.\n\n회비 입금 계좌: 농협 302-1234-5678 (김영숙)\n\n입금하실 때 기수와 성함을 메모로 남겨주세요.`;

function won(n) {
  if (n == null) return "";
  if (n % 10000 === 0) return `${(n / 10000).toLocaleString("ko-KR")}만원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

// 받는 분 표기 (참가자가 계좌를 직접 입력하면 바뀜)
function rcpt(s) {
  return s.form.recipientCustom ? `입력하신 계좌(${s.form.recipientCustom})` : "김영숙(농협 302-1234-5678)";
}

// 승인/거부 버튼 순서: 거부(왼쪽) · 승인(오른쪽)
const APPROVE = [
  { id: "reject", label: "거부" },
  { id: "approve", label: "승인" },
];

// =====================================================================
// 시나리오 문구 (설정 화면에서 조건별로 수정 가능)
// - 한 줄 = 말풍선 하나
// - 자리표시자: {금액} {이름} {메모} {출금계좌} {받는분} {계좌번호}
// =====================================================================
const SCRIPT_VARS = ["금액", "이름", "메모", "출금계좌", "받는분", "계좌번호"];

// 조건별 기본 문구 목록 (화면에 보이는 순서대로)
function scriptDefaults(cond) {
  const { complexity, automation } = CONDITIONS[cond];
  const B = complexity === "B";
  const low = automation === "low";
  const L = [];
  const add = (key, group, label, text) => L.push({ key, group, label, text });

  add("greet", "시작", "첫 인사", "무엇을 도와드릴까요?");

  if (B) {
    if (low) {
      add("sms_open", "문자 앱 실행", "승인 요청", "문자 앱을 실행할까요?");
      add("sms_open.launched", "문자 앱 실행", "승인 후 / 거부 후 앱 이름을 말했을 때", "문자 앱을 실행할게요.");
    } else add("sms_open", "문자 앱 실행", "안내", "문자 앱을 실행할게요.");
    add("sms_find", "총무 문자 찾기", "안내", "문자 목록 확인 중 …\n김영숙 님의 문자를 찾았어요.\n계좌번호를 찾는 중 …");
    add("sms_account", "문자 속 계좌번호 찾아 복사하기", low ? "승인 요청" : "안내",
      low ? "문자에서 ‘회비 입금 계좌’를 찾았어요. (김영숙 농협 302-1234-5678)\n이 계좌로 송금을 진행할까요?"
          : "문자에서 ‘회비 입금 계좌’를 찾았어요. (김영숙 농협 302-1234-5678)\n이 계좌로 송금을 진행할게요.");
  }

  if (low) {
    add("bank_open", "은행 앱 실행", "승인 요청", B ? "송금을 위해 은행 앱을 실행할까요?" : "은행 앱을 실행할까요?");
    add("app.which", "은행 앱 실행", "거부 시", "어떤 앱으로 실행할까요?");
    add("bank_open.launched", "은행 앱 실행", "거부 후 은행 앱을 말했을 때", "은행 앱을 실행할게요.");
  } else add("bank_open", "은행 앱 실행", "안내", B ? "이제 은행 앱을 실행할게요." : "은행 앱을 실행할게요.");
  // B2는 설계상 "열고 있어요" 문구 없음 (비워두면 말하지 않음)
  add("bank_open.opening", "은행 앱 실행", "진행 문구 (앱을 여는 동안)", cond === "B2" ? "" : "은행 앱을 열고 있어요 …");

  if (B) {
    if (low) {
      add("popup", "광고 팝업 닫기", "승인 요청", "이벤트 안내 팝업이 떴어요. 닫을까요?");
      add("popup.closed", "광고 팝업 닫기", "거부 후 닫아달라고 했을 때", "이벤트 안내 팝업을 닫았어요.");
    } else add("popup", "광고 팝업 닫기", "안내", "이벤트 안내 팝업을 닫았어요.");
  }

  add("source.busy", "출금계좌 선택", "진행 문구 (계좌 확인 중)", "계좌를 확인하고 있어요 …");
  add("source", "출금계좌 선택", "안내", "말씀하신 주거래 통장으로 거래할게요.");

  if (B) {
    add("recipient", "받는계좌 입력", "안내", low ? "문자에서 복사한 김영숙님(농협 302-1234-5678) 계좌를 입력할게요." : "문자에서 복사한 김영숙님(농협 302-1234-5678) 계좌를 입력했어요.");
    if (low) add("recipient.custom", "받는계좌 입력", "계좌번호를 직접 말했을 때", "{받는분}를 입력할게요.");
  } else {
    add("recipient.busy", "받는계좌 입력", "진행 문구 (자주 사용하는 계좌 확인 중)", "자주 사용하는 계좌를 확인하고 있어요 …");
    add("recipient", "받는계좌 입력", low ? "승인 요청" : "안내",
      low ? "자주 사용하는 계좌 목록에서 ‘동창회 총무’ 김영숙님 계좌(농협 302-1234-5678)를 찾았어요. 이 계좌로 송금할까요?"
          : "자주 사용하는 계좌에서 ‘동창회 총무’ 김영숙님 계좌(농협 302-1234-5678)를 찾았어요.\n이 계좌로 송금할게요.");
  }
  if (low) {
    add("account.ask", "계좌 거부 시", "거부 시", "어떤 계좌로 송금할까요?");
    add("account.direct", "계좌 거부 시", "직접 입력하겠다고 했을 때", "송금할 계좌번호를 말씀해주세요.");
    add("account.custom", "계좌 거부 시", "계좌번호를 말했을 때", "입력하신 계좌({계좌번호})로 송금할게요.");
  }

  if (low) {
    add("amount", "송금액 입력", "승인 요청", B ? "송금액을 {금액}으로 입력할까요?" : "송금액을 입력할게요. {금액}으로 입력할까요?");
    add("amount.ask", "송금액 입력", "거부 시", B ? "어떻게 바꿀까요?" : "무엇을 수정할까요?");
    add("amount.confirm", "송금액 입력", "금액을 말했을 때", "송금액 {금액}을 입력할까요?");
  } else {
    add("amount", "송금액 입력", "안내", "송금액을 {금액}으로 입력할게요.");
  }

  if (B) {
    if (low) {
      add("memo", "받는 분 통장 메모", "승인 요청", "받는 분 통장에 ‘{메모}’으로 메모를 남길까요?");
      add("memo.ask", "받는 분 통장 메모", "거부 시", "어떻게 메모를 남길까요?");
    } else add("memo", "받는 분 통장 메모", "안내", "받는 분 통장에 ‘{메모}’으로 메모를 남겼어요.");
  }

  if (low) {
    add("final", "최종 이체 확인", "승인 요청", "송금 내용을 최종 확인해주세요.");
    add("final.ask", "최종 이체 확인", "거부 시", "무엇을 수정할까요?");
  } else add("final", "최종 이체 확인", "안내", "{출금계좌}에서 {받는분}으로 {금액}을 보낼게요.");

  // [세션1 오류] 금융사기 예방질문
  if (low) {
    add("fraud", "[세션1 오류] 금융사기 예방질문", "승인 요청", "금융사기 예방질문 3가지에 모두 ‘아니오’를 선택했어요. 이대로 진행할까요?");
    add("fraud.ask", "[세션1 오류] 금융사기 예방질문", "거부 시", "어떤 질문의 답을 바꿀까요?");
    add("fraud.confirm", "[세션1 오류] 금융사기 예방질문", "답을 바꾼 뒤 다시 확인", "{예방답}로 선택했어요. 이대로 진행할까요?");
  } else add("fraud", "[세션1 오류] 금융사기 예방질문", "안내", "금융사기 예방질문 3가지에 모두 ‘아니오’를 선택했어요.");
  add("change.fraud", "[세션1 오류] 금융사기 예방질문", "중지 중 답을 바꿨을 때", "{예방답}로 바꿨어요.");

  add("password", "비밀번호 입력", "안내", "이체를 위해 계좌비밀번호 입력이 필요해요. 아래에 직접 입력해주세요.");
  add("done", "완료 안내", "안내", B ? "{받는분}으로 {금액}을 보냈어요." : "송금을 완료했어요.");

  // [세션2 오류] 거래내역 열람 + 자동이체
  add("autopay.busy", "[세션2 오류] 거래내역 열람 + 자동이체", "진행 문구 (거래내역 확인 중)", "거래내역을 확인하고 있어요 …");
  if (low) {
    add("autopay", "[세션2 오류] 거래내역 열람 + 자동이체", "승인 요청", "최근 3개월 거래내역을 확인해 보니, 김영숙님께 매달 30만원을 보낸 기록이 있어요.\n다음 달 회비를 잊지 않도록 매월 자동이체로 등록할까요?");
    add("autopay.yes", "[세션2 오류] 거래내역 열람 + 자동이체", "승인 시", "매월 26일 김영숙님께 30만원 자동이체를 등록했어요.");
    add("autopay.no", "[세션2 오류] 거래내역 열람 + 자동이체", "거부 시", "자동이체는 등록하지 않을게요.");
  } else {
    add("autopay", "[세션2 오류] 거래내역 열람 + 자동이체", "안내", "최근 3개월 거래내역을 확인해 보니, 김영숙님께 매달 30만원을 보낸 기록이 있어요.\n다음 달 회비를 잊지 않도록 매월 자동이체로 등록할게요.");
    add("autopay.yes", "[세션2 오류] 거래내역 열람 + 자동이체", "등록 후", "매월 26일 김영숙님께 30만원 자동이체를 등록했어요.");
  }
  add("autopay.cancel", "[세션2 오류] 거래내역 열람 + 자동이체", "중지 중 자동이체를 취소했을 때", "자동이체 등록을 취소했어요.");

  add("stop.ask", "중지·직접 조작", "중지를 눌렀을 때", "진행을 멈췄어요. 어떻게 바꿀까요?");
  add("change.amount", "중지·직접 조작", "중지 중 금액을 바꿨을 때",
    low ? "송금액을 {금액}으로 바꿀게요." : B ? "송금액 {금액}을 입력했어요." : "요청하신 금액인 {금액}을 입력했어요.");
  if (B) add("change.memo", "중지·직접 조작", "중지 중 메모를 바꿨을 때", "받는 분 통장 메모를 ‘{메모}’으로 바꿨어요.");
  add("change.source", "중지·직접 조작", "중지 중 출금계좌를 바꿨을 때", "{출금계좌}에서 출금할게요.");
  add("stop.continue", "중지·직접 조작", "계속하기를 눌렀을 때", "계속 진행할게요.");
  add("cancel", "기타", "송금을 취소했을 때", "송금을 취소했어요.");
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
  const name = s.cfg?.name || "OOO";
  const amount = vars.amount ?? s.form?.amount ?? s.phone?.pendingAmount ?? null;
  const map = {
    금액: amount != null ? won(amount) : "",
    이름: name,
    메모: vars.memo ?? s.pendingMemo ?? s.form?.memo ?? `30기 ${name}`,
    출금계좌: ACCOUNTS[s.form?.source || "main"].label,
    받는분: rcpt(s),
    계좌번호: vars.account ?? s.form?.recipientCustom ?? "",
    예방답: fraudText(s.form?.fraud || s.phone?.fraudTicks),
  };
  return scriptText(s.cond, key)
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/\{(금액|이름|메모|출금계좌|받는분|계좌번호|예방답)\}/g, (_, k) => map[k]));
}
const line = (key, s, vars) => lines(key, s, vars).join("\n");

// 단계 정의
// - low.messages / low.options : 낮은 자동화 (승인 요청)
// - low.reject : 거부 시 처리 유형 (app | account | popup | amount | memo | final)
// - high.messages / high.applyFirst : 높은 자동화 (applyFirst=true면 화면 조작 후 “~했어요” 안내)
// - guide : 스크립트 밖 응답을 LLM이 만들 때 참고할 단계 설명
// - apply(state, choiceId) : 폰 화면/상태 변경
// 금액 화면에 있으면 [확인]을 눌러 상세(통장표기) 화면으로
async function confirmAmount(s) {
  if (s.phone.app !== "bank" || s.phone.bankView !== "amount") return;
  await tap(".bk-btn");
  s.phone.bankView = "detail";
  renderPhone();
  await waitLoading();
}

function buildSteps(complexity, participantName, session = 1) {
  const B = complexity === "B";
  const memo = `30기 ${participantName || "OOO"}`;
  const msg = (key) => (s) => lines(key, s);
  const steps = [];

  if (B) {
    steps.push(
      {
        id: "sms_open",
        label: "문자 앱 실행",
        guide: "총무가 보낸 문자를 읽기 위해 문자 앱을 여는 단계",
        low: {
          messages: msg("sms_open"), options: APPROVE, reject: "app", launched: "sms_open.launched",
          app: { target: "문자 앱", purpose: "총무 문자 확인", keywords: "문자|메시지" },
        },
        high: { messages: msg("sms_open") },
        apply: (s) => { s.phone.app = "sms_list"; },
      },
      {
        id: "sms_find",
        label: "총무 문자 찾기",
        guide: "문자 목록에서 총무 김영숙님의 문자를 찾는 단계",
        low: { messages: msg("sms_find"), split: 1 },
        high: { messages: msg("sms_find"), split: 1 },
        act: async (s) => {
          await waitLoading();
          await actSleep(1800); // 문자 목록을 살펴보는 시간
          await tap(".sms-row.unread");
          s.phone.app = "sms_detail";
          renderPhone();
        },
        apply: (s) => { s.phone.app = "sms_detail"; },
      },
      {
        id: "sms_account",
        label: "문자 속 계좌번호 찾아 복사하기",
        guide: "문자에서 회비 입금 계좌(김영숙 농협 302-1234-5678)를 찾아 송금할 계좌로 정하는 단계. 다른 계좌를 찾아달라고 해도 문자에 있는 계좌는 이것뿐임",
        low: { messages: msg("sms_account"), options: APPROVE, reject: "account" },
        high: { messages: msg("sms_account"), split: 1 },
        pre: async (s) => { await actSleep(300); s.phone.smsHighlight = true; renderPhone(); await actSleep(400); },
        act: async (s) => { s.phone.smsHighlight = true; await tap("mark", { hold: 700 }); s.phone.toast = "계좌번호를 복사했어요"; renderPhone(); await actSleep(500); },
        apply: (s) => { s.phone.smsHighlight = true; s.phone.toast = "계좌번호를 복사했어요"; },
      },
    );
  }

  steps.push({
    id: "bank_open",
    label: "은행 앱 실행",
    guide: "송금을 위해 은행 앱을 여는 단계",
    low: {
      messages: msg("bank_open"),
      options: APPROVE,
      reject: "app",
      launched: "bank_open.launched",
      opening: "bank_open.opening",
      app: { target: "은행 앱", purpose: "송금", keywords: "마음은행|^은행|은행\\s?앱" },
    },
    high: { messages: msg("bank_open"), opening: "bank_open.opening" },
    apply: (s) => {
      s.phone.app = "bank";
      s.phone.bankView = "home";
      s.phone.toast = null;
      // 광고 팝업은 높은 복잡도(B)에서만 뜸
      if (B) s.phone.popup = true;
      else s.phone.focus = "source";
    },
  });

  if (B) {
    steps.push({
      id: "popup",
      label: "광고 팝업 닫기",
      guide: "은행 앱에 뜬 이벤트 광고 팝업을 닫는 단계. 참가자가 닫지 말라고 하면, 팝업 내용을 보고 화면의 ‘닫기’를 직접 누르면 이어서 진행한다고 안내",
      low: { messages: msg("popup"), options: APPROVE, reject: "popup" },
      high: { messages: msg("popup"), applyFirst: true },
      act: async (s) => { await tap(".evt-close"); s.phone.popup = false; s.phone.focus = "source"; renderPhone(); },
      apply: (s) => { s.phone.popup = false; s.phone.focus = "source"; },
    });
  }

  steps.push({
    id: "source",
    busy: "source.busy",
    label: "출금계좌 선택",
    guide: "출금 계좌를 말씀하신 주거래 통장(1,523,400원)으로 정하는 단계. 다른 계좌는 적금출금 계좌(482,000원)",
    low: { messages: msg("source") },
    high: { messages: msg("source") },
    act: async (s) => {
      const k = s.form.source || "main";
      s.phone.focus = null;
      renderPhone();
      await tap(`.bk-card[data-acct="${k}"] .bk-send`);
      s.phone.tapped = k;
      s.phone.toTab = "recent";
      s.phone.bankView = "to";
      renderPhone();
      await actSleep(300);
    },
    apply: (s) => {
      s.phone.tapped = s.form.source; // 선택한 계좌 카드의 [이체]를 누름
      s.phone.toTab = "recent";
      s.phone.bankView = "to";
      s.phone.focus = null;
    },
  });

  if (B) {
    steps.push({
      id: "recipient",
      label: "받는계좌 입력",
      guide: "문자에서 복사한 계좌를 받는 분 계좌에 입력하는 단계",
      low: { messages: (s) => lines(s.form.recipientCustom ? "recipient.custom" : "recipient", s) },
      high: { messages: msg("recipient"), applyFirst: true },
      act: async (s) => {
        const p = s.phone;
        await tap(".acct-field");
        p.bankView = "acct_input";
        renderPhone();
        await actSleep(500);
        if (s.form.recipientCustom) {
          await typeText((v) => (p.acctTyped = v), s.form.recipientCustom, 120);
        } else {
          p.pasteTip = true;
          renderPhone();
          await tap(".paste-tip");
          p.pasteTip = false;
          p.acctTyped = "302-1234-5678";
          renderPhone();
        }
        await tap(".line-select");
        p.bankPicked = s.form.recipientCustom ? BANK_NAME : "농협";
        renderPhone();
        s.form.recipient = true; // 입력한 계좌 화면에서 멈춤 ([확인]은 송금액 단계에서 누름)
      },
      apply: (s) => { s.form.recipient = true; s.phone.focus = null; },
    });
  } else {
    steps.push({
      id: "recipient",
      busy: "recipient.busy",
      label: "받는계좌 입력",
      guide: "자주 사용하는 계좌 목록에서 ‘동창회 총무’ 김영숙님 계좌(농협 302-1234-5678)를 받는 분으로 정하는 단계. 다른 계좌를 찾아달라고 해도 목록에서 맞는 계좌는 이것뿐임",
      low: { messages: msg("recipient"), options: APPROVE, reject: "account" },
      high: { messages: msg("recipient") },
      pre: async (s) => {
        if (s.phone.toTab !== "fav") {
          await tap('[data-tab="fav"]');
          s.phone.toTab = "fav";
          renderPhone();
          await actSleep(400);
        }
        s.phone.focus = "recipient";
        renderPhone();
        await actSleep(300);
      },
      act: async (s) => {
        if (s.form.recipientCustom) {
          await tap(".acct-field");
          s.phone.bankView = "acct_input";
          renderPhone();
          await actSleep(400);
          await typeText((v) => (s.phone.acctTyped = v), s.form.recipientCustom, 120);
          await tap(".line-select");
          s.phone.bankPicked = BANK_NAME;
          renderPhone();
          await tap(".bk-btn");
        } else {
          await tap(".to-row.target");
        }
        s.form.recipient = true;
        s.phone.focus = null;
        s.phone.bankView = "amount";
        renderPhone();
      },
      apply: (s) => { s.form.recipient = true; s.phone.bankView = "amount"; s.phone.focus = null; },
    });
  }

  steps.push({
    id: "amount",
    kind: "amount",
    label: "송금액 입력",
    guide: "송금액(요청하신 30만원)을 입력하는 단계",
    low: { messages: (s) => lines("amount", s, { amount: s.userAmount ?? REQUESTED_AMOUNT }), options: APPROVE, reject: "amount" },
    high: { messages: (s) => lines("amount", s, { amount: s.form.amount ?? REQUESTED_AMOUNT }) },
    // 수정 분기 문구
    correction: {
      lowAsk: (s) => line("amount.ask", s),
      lowConfirm: (s, amt) => line("amount.confirm", s, { amount: amt }),
      highAsk: (s) => line("stop.ask", s),
      highDone: (s, amt) => line("change.amount", s, { amount: amt }),
    },
    // 계좌번호 입력 화면에 있으면 [확인]을 눌러 금액 화면으로
    pre: async (s) => {
      if (s.phone.bankView !== "acct_input") return;
      await tap(".bk-btn");
      s.phone.bankView = "amount";
      renderPhone();
    },
    // 금액이 입력되는 순간 "입력했어요"가 뜨도록, [확인]은 다음 단계에서 누름
    act: async (s) => {
      s.phone.bankView = "amount";
      renderPhone();
      await typeAmount(s.form.amount);
    },
    apply: (s) => { s.phone.typedAmount = String(s.form.amount); },
  });

  if (B) {
    steps.push({
      id: "memo",
      label: "받는 분 통장 메모 입력",
      guide: `받는 분 통장에 표시될 메모를 정하는 단계. 기본 메모는 ‘${memo}’`,
      defaultMemo: memo,
      low: { messages: msg("memo"), options: APPROVE, reject: "memo", ask: "memo.ask" },
      pre: async (s) => { await confirmAmount(s); s.phone.focus = "memo"; renderPhone(); await actSleep(300); },
      high: { messages: msg("memo"), applyFirst: true },
      act: async (s) => {
        const text = s.pendingMemo ?? memo;
        await confirmAmount(s);
        await tap(".dt-row.memo");
        s.phone.memoTyping = "";
        renderPhone();
        await actSleep(300);
        await typeText((v) => (s.phone.memoTyping = v), text, 180);
        await actSleep(300);
        s.phone.memoTyping = null;
        s.form.memo = text;
        s.pendingMemo = null;
        renderPhone();
      },
      apply: (s) => { s.form.memo = s.pendingMemo ?? memo; s.pendingMemo = null; s.phone.focus = null; },
    });
  }

  steps.push(
    {
      id: "final",
      label: "최종 이체 확인",
      guide: "송금 내용을 최종 확인하는 단계. 금액·출금계좌·메모를 바꿀 수 있음",
      low: { messages: msg("final"), options: APPROVE, reject: "final", ask: "final.ask" },
      high: { messages: msg("final") },
      pre: async (s) => {
        await confirmAmount(s);
        if (s.phone.sheet === "confirm") return;
        await tap(".bk-btn2 .primary");
        s.phone.sheet = "confirm";
        renderPhone();
        await actSleep(500);
      },
      act: async (s) => {
        await confirmAmount(s);
        if (s.phone.sheet !== "confirm") { s.phone.sheet = "confirm"; renderPhone(); await actSleep(400); }
        await tap(".sheet .primary");
        s.phone.sheet = null;
        renderPhone();
      },
      apply: (s) => { s.phone.sheet = null; },
    },
    ...(session === 1 ? [{
      id: "fraud",
      kind: "error_fraud",
      label: "[세션1 오류] 금융사기 예방질문에 모두 ‘아니오’ 선택",
      guide: `이체 직전 은행 앱이 묻는 금융사기 예방질문 3가지(${FRAUD_QUESTIONS.join(" / ")})에 에이전트가 사용자에게 묻지 않고 모두 ‘아니오’를 선택한 단계`,
      low: { messages: msg("fraud"), options: APPROVE, reject: "fraud" },
      high: { messages: msg("fraud"), applyFirst: true },
      // 예방질문 시트가 뜨면 에이전트가 3가지 모두 '아니오'를 누른 뒤에 알리거나(높은 자동화) 승인을 물음(낮은 자동화)
      pre: async (s) => {
        s.phone.sheet = "fraud";
        s.phone.fraudTicks = [null, null, null];
        renderPhone();
        await actSleep(700);
        for (let i = 0; i < 3; i++) {
          if (s.fraudByUser) break; // 도중에 참가자가 직접 답한 경우
          await tap(`.fq[data-q="${i}"] .no`, { pre: 250, after: 250 });
          s.phone.fraudTicks[i] = "no";
          renderPhone();
        }
        if (!s.fraudByUser) s.form.fraud = ["no", "no", "no"];
        await actSleep(400);
      },
      apply: (s) => { s.form.fraud = s.form.fraud || ["no", "no", "no"]; s.phone.fraudTicks = [...s.form.fraud]; },
    }] : []),
    {
      id: "password",
      kind: "password",
      label: "비밀번호 입력 요청",
      guide: "계좌 비밀번호를 참가자가 대화창의 비밀번호 입력 칸(보안 키패드)에 직접 입력하는 단계. 비밀번호는 에이전트에게 전달되지 않음",
      low: { messages: msg("password") },
      high: { messages: msg("password") },
      apply: (s) => { s.phone.sheet = "pin"; },
    },
    {
      id: "done",
      kind: "done",
      label: "완료 안내",
      low: { messages: msg("done"), applyFirst: true },
      high: { messages: msg("done"), applyFirst: true },
      apply: (s) => { s.phone.sheet = null; s.phone.bankView = "complete"; s.phone.focus = null; },
    },
    ...(session === 2 ? [{
      id: "autopay",
      kind: "error_autopay",
      busy: "autopay.busy",
      label: "[세션2 오류] 거래내역 열람 + 매월 자동이체 등록",
      guide: "이체가 끝난 뒤 에이전트가 묻지 않고 최근 3개월 거래내역을 열람하고, 김영숙님께 매월 26일 30만원 자동이체 등록을 제안(낮은 자동화)하거나 등록(높은 자동화)하는 단계. 회비는 매달 내는 돈",
      low: { messages: msg("autopay"), options: APPROVE, reject: "autopay" },
      high: { messages: msg("autopay") },
      // 완료 화면 → 거래내역 화면으로 이동
      pre: async (s) => {
        s.phone.bankView = "history";
        renderPhone();
        await actSleep(1200);
      },
      act: async (s, choice) => {
        if (choice === "reject") return;
        await tap(".hist-auto");
        s.phone.bankView = "autopay";
        renderPhone();
        await actSleep(900);
        await tap(".bk-btn");
        s.form.autopay = true;
        s.phone.bankView = "autopay_done";
        renderPhone();
      },
      apply: (s, choice) => { if (choice !== "reject") { s.form.autopay = true; s.phone.bankView = "autopay_done"; } },
    }] : []),
  );

  return steps;
}
