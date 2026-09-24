// 연구1 시나리오 정의 (PDF "연구1 시나리오 설계" 수정본 기준) — classic script, 전역으로 노출
// 에이전트 고정 문구는 여기서만 관리합니다. 스크립트에 없는 응답은 LLM이 상황에 맞게 생성합니다.

const RECIPIENT = { name: "김영숙", bank: "농협", account: "302-1234-5678" };
const REQUESTED_AMOUNT = 300000; // 참가자가 요청하는 금액
const ERROR_AMOUNT = 100000; // 에이전트가 잘못 알아듣는 금액

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
      "동창회 정기모임 회비를 매년 총무에게 보내고 계십니다.",
      "총무 김영숙님의 계좌는 ‘자주 사용하는 계좌’ 목록에 저장돼있습니다.",
      "올해 회비 30만원을 보내려고 합니다.",
    ],
    task: ["나의 주거래 통장에서 동창회 총무 계좌로 30만원 송금"],
  },
  B: {
    situation: [
      "동창회 정기모임 회비를 매년 총무에게 보내고 계십니다.",
      "올해 총무인 김영숙님이 문자로 계좌번호를 보내며 회비를 입금해달라고 하셨습니다.",
      "총무에게 올해 회비 30만원을 보내며, 선생님 기수와 성명을 메모로 남기려고 합니다.",
    ],
    task: [
      "총무가 보낸 문자를 읽고",
      "나의 주거래 통장에서 총무 계좌로 30만원 송금",
      "받는 사람에게 ‘30기 OOO’이라고 메모 남기기",
    ],
  },
};

const SMS_TEXT = () =>
  `안녕하세요, 30기 총무 김영숙이에요.\n올해 동창회 회비 30만원 입금 부탁드려요.\n\n회비 입금 계좌: 농협 302-1234-5678 (김영숙)\n\n입금하실 때 기수와 성함을 메모로 남겨주세요.`;

function won(n) {
  if (n == null) return "";
  if (n % 10000 === 0) return `${(n / 10000).toLocaleString("ko-KR")}만원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

// 받는 분 표기 (참가자가 계좌를 직접 입력하면 바뀜)
function rcpt(s) {
  return s.form.recipientCustom ? `입력하신 계좌(${s.form.recipientCustom})` : "김영숙(농협 302-1234-5678)";
}

const APPROVE = [
  { id: "approve", label: "승인" },
  { id: "reject", label: "거부" },
];

// 단계 정의
// - low.messages / low.options : 낮은 자동화 (승인 요청)
// - low.reject : 거부 시 처리 유형 (app | account | popup | amount | memo | final)
// - high.messages / high.applyFirst : 높은 자동화 (applyFirst=true면 화면 조작 후 “~했어요” 안내)
// - guide : 스크립트 밖 응답을 LLM이 만들 때 참고할 단계 설명
// - apply(state, choiceId) : 폰 화면/상태 변경
function buildSteps(complexity, participantName) {
  const B = complexity === "B";
  const memo = `30기 ${participantName || "OOO"}`;
  const steps = [];

  if (B) {
    steps.push(
      {
        id: "sms_open",
        label: "문자 앱 실행",
        guide: "총무가 보낸 문자를 읽기 위해 문자 앱을 여는 단계",
        low: { messages: ["문자 앱을 실행할까요?"], options: APPROVE, reject: "app", launched: "문자 앱을 실행할게요." },
        high: { messages: ["문자 앱을 실행할게요."] },
        apply: (s) => { s.phone.app = "sms_list"; },
      },
      {
        id: "sms_find",
        label: "총무 문자 찾기",
        guide: "문자 목록에서 총무 김영숙님의 문자를 찾는 단계",
        low: { messages: ["문자 목록 확인 중 …", "김영숙 님의 문자를 찾았어요."] },
        high: { messages: ["문자 목록 확인 중 …", "김영숙 님의 문자를 찾았어요."] },
        apply: (s) => { s.phone.app = "sms_detail"; },
      },
      {
        id: "sms_account",
        label: "문자 속 계좌번호 찾아 복사하기",
        guide: "문자에서 회비 입금 계좌(김영숙 농협 302-1234-5678)를 찾아 송금할 계좌로 정하는 단계. 다른 계좌를 찾아달라고 해도 문자에 있는 계좌는 이것뿐임",
        low: {
          messages: ["문자에서 ‘회비 입금 계좌’를 찾았어요. (김영숙 농협 302-1234-5678)", "이 계좌로 송금을 진행할까요?"],
          options: APPROVE,
          reject: "account",
        },
        high: {
          messages: ["문자에서 ‘회비 입금 계좌’를 찾았어요. (김영숙 농협 302-1234-5678)", "이 계좌로 송금을 진행할게요."],
          applyFirst: true,
        },
        apply: (s) => { s.phone.smsHighlight = true; s.phone.toast = "계좌번호를 복사했어요"; },
      },
    );
  }

  steps.push({
    id: "bank_open",
    label: "은행 앱 실행",
    guide: "송금을 위해 은행 앱을 여는 단계",
    low: {
      messages: [B ? "이제 송금을 위해 은행 앱을 실행할까요?" : "은행 앱을 실행할까요?"],
      options: APPROVE,
      reject: "app",
      launched: B ? "이제 은행 앱을 실행할게요." : "은행 앱을 실행할게요.",
    },
    high: { messages: [B ? "이제 은행 앱을 실행할게요." : "은행 앱을 실행할게요."] },
    apply: (s) => {
      s.phone.app = "bank";
      s.phone.toast = null;
      // 광고 팝업은 높은 복잡도(B)에서만 뜸
      if (B) s.phone.popup = true;
      else { s.phone.bankView = "transfer"; s.phone.focus = "source"; }
    },
  });

  if (B) {
    steps.push({
      id: "popup",
      label: "광고 팝업 닫기",
      guide: "은행 앱에 뜬 이벤트 광고 팝업을 닫는 단계. 참가자가 닫지 말라고 하면, 팝업 내용을 보고 화면의 ‘닫기’를 직접 누르면 이어서 진행한다고 안내",
      low: { messages: ["이벤트 안내 팝업을 닫을까요?"], options: APPROVE, reject: "popup" },
      high: { messages: ["이벤트 안내 팝업을 닫았어요."], applyFirst: true },
      apply: (s) => { s.phone.popup = false; s.phone.bankView = "transfer"; s.phone.focus = "source"; },
    });
  }

  steps.push({
    id: "source",
    label: "출금계좌 선택",
    guide: "출금할 계좌(주거래 통장 1,523,400원 / 적금출금 계좌 482,000원) 중 하나를 고르는 단계",
    low: {
      messages: ["계좌가 2개에요. 어떤 계좌에서 출금할까요?"],
      options: [
        { id: "main", label: "주거래" },
        { id: "savings", label: "적금출금 계좌" },
      ],
    },
    high: { messages: ["2개의 계좌를 발견했어요.", "말씀하신 ‘주거래 통장’에서 출금할게요."] },
    apply: (s, choice) => {
      s.form.source = choice === "savings" ? "savings" : "main";
      s.phone.focus = "recipient";
    },
  });

  if (B) {
    steps.push({
      id: "recipient",
      label: "받는계좌 입력",
      guide: "문자에서 복사한 계좌를 받는 분 계좌에 입력하는 단계",
      low: {
        messages: (s) => [s.form.recipientCustom ? `${rcpt(s)}를 입력할게요.` : "문자에서 복사한 김영숙님(농협 302-1234-5678) 계좌를 입력할게요."],
      },
      high: { messages: ["문자에서 복사한 김영숙님(농협 302-1234-5678) 계좌를 입력했어요."], applyFirst: true },
      apply: (s) => { s.form.recipient = true; s.phone.focus = "amount"; },
    });
  } else {
    steps.push({
      id: "recipient",
      label: "받는계좌 입력",
      guide: "자주 사용하는 계좌 목록에서 ‘동창회 총무’ 김영숙님 계좌(농협 302-1234-5678)를 받는 분으로 정하는 단계. 다른 계좌를 찾아달라고 해도 목록에서 맞는 계좌는 이것뿐임",
      low: {
        messages: ["자주 사용하는 계좌 목록에서 ‘동창회 총무’ 김영숙님 계좌(농협 302-1234-5678)를 찾았어요. 이 계좌로 송금할까요?"],
        options: APPROVE,
        reject: "account",
      },
      high: {
        messages: ["자주 사용하는 계좌에서 ‘동창회 총무’ 김영숙님 계좌(농협 302-1234-5678)를 찾았어요.", "이 계좌로 송금할게요."],
      },
      apply: (s) => { s.form.recipient = true; s.phone.focus = "amount"; },
    });
  }

  steps.push({
    id: "amount",
    kind: "error_amount",
    label: "[오류] 30만원을 10만원으로 잘못 알아듣고 송금 시도",
    guide: "송금액을 입력하는 단계. 에이전트는 금액을 10만원으로 입력하려 함",
    low: { messages: [`송금액을 입력할게요. 요청하신 ${won(ERROR_AMOUNT)}으로 입력할까요?`], options: APPROVE, reject: "amount" },
    high: { messages: [`요청하신 송금액 ${won(ERROR_AMOUNT)}을 입력했어요.`], applyFirst: true },
    // 수정 분기 문구
    correction: {
      lowAsk: B ? "어떻게 바꿀까요?" : "무엇을 수정할까요?",
      lowConfirm: (amt) => `송금액 ${won(amt)}을 입력할까요?`,
      highAsk: "진행을 멈췄어요. 어떻게 바꿀까요?",
      highDone: (amt) => (B ? `송금액 ${won(amt)}을 입력했어요.` : `요청하신 금액인 ${won(amt)}을 입력했어요.`),
    },
    apply: (s) => { s.phone.focus = B ? "memo" : null; },
  });

  if (B) {
    steps.push({
      id: "memo",
      label: "받는 분 통장 메모 입력",
      guide: `받는 분 통장에 표시될 메모를 정하는 단계. 기본 메모는 ‘${memo}’`,
      defaultMemo: memo,
      low: {
        messages: (s) => [`받는 분 통장에 ‘${s.pendingMemo ?? memo}’으로 메모를 남길까요?`],
        options: APPROVE,
        reject: "memo",
        ask: "어떻게 메모를 남길까요?",
      },
      high: { messages: (s) => [`받는 분 통장에 ‘${s.pendingMemo ?? memo}’으로 메모를 남겼어요.`], applyFirst: true },
      apply: (s) => { s.form.memo = s.pendingMemo ?? memo; s.pendingMemo = null; s.phone.focus = null; },
    });
  }

  steps.push(
    {
      id: "final",
      label: "최종 이체 확인",
      guide: "송금 내용을 최종 확인하는 단계. 금액·출금계좌·메모를 바꿀 수 있음",
      low: {
        messages: (s) => [
          "송금 내용을 최종 확인해주세요.",
          `“${ACCOUNTS[s.form.source].label}에서 ${rcpt(s)}으로 ${won(s.form.amount)}을 보냅니다.”`,
        ],
        options: APPROVE,
        reject: "final",
        ask: "무엇을 수정할까요?",
      },
      high: { messages: (s) => [`${ACCOUNTS[s.form.source].label}에서 ${rcpt(s)}으로 ${won(s.form.amount)}을 보낼게요.`] },
      apply: (s) => { s.phone.sheet = "confirm"; },
    },
    {
      id: "password",
      kind: "password",
      label: "[직접조작] 비밀번호 입력 요청",
      guide: "계좌 비밀번호를 참가자가 직접 입력해야 하는 단계. ‘화면 열기’를 누르면 입력 화면이 열림",
      low: { messages: ["이체를 위해 계좌비밀번호 입력이 필요해요. 화면을 열어 직접 입력해주세요."] },
      high: { messages: ["이체를 위해 계좌비밀번호 입력이 필요해요. 화면을 열어 직접 입력해주세요."] },
      apply: (s) => { s.phone.sheet = "pin"; },
    },
    {
      id: "done",
      kind: "done",
      label: "완료 안내",
      low: { messages: (s) => [`${rcpt(s)}으로 ${won(s.form.amount)}을 보냈어요.`] },
      high: { messages: (s) => [`${rcpt(s)}으로 ${won(s.form.amount)}을 보냈어요.`] },
      apply: (s) => { s.phone.sheet = null; s.phone.bankView = "complete"; },
    },
  );

  return steps;
}
