// 기존안 간결하게: 대화 기록을 남기지 않고, AI 회색 카드(진행 카드) 안의 내용만 계속 바뀜
// - 진행 카드가 처음 나오기 전의 대화(인사·첫 요청 등)는 그대로 두고, 그 뒤에 생긴 말풍선(지난 질문·「승인」 답 등)만 숨김
// - 카드 안 질문이 비어 있을 때는 바로 앞 AI 말을 카드 안에 보여 줌 (카드 밖 말풍선 대신)
"use strict";

// 기존안(2c): 단계마다 넘어가는 시간을 절반으로 (화면 조작 속도 배율 0.5 + 문구를 읽는 시간 2.5초)
PACE = 0.5;

// 답할 일이 없는 알림(앱 실행·출발지·목적지·예상 금액)에는 안쪽 카드 없음. 선택지와 함께 나오는 카드(택시 종류·최종 호출 등)는 그대로
const _showNoticeBrief = showNotice;
showNotice = function (text) {
  const pv = stepPreview;
  stepPreview = () => null;
  try { return _showNoticeBrief(text); } finally { stepPreview = pv; }
};

function briefUpdate() {
  const c = chat();
  const card = $("#run-card");
  const kids = [...c.children];
  if (!card) { kids.forEach((el) => el.classList.contains("bb-hide") && el.classList.remove("bb-hide")); return; }
  const before = kids.slice(0, kids.indexOf(card));
  // 회색 카드가 처음 나오기 전의 대화(인사·첫 요청 등)는 그대로 둠
  if (!card.dataset.bbInit) { card.dataset.bbInit = "1"; before.forEach((el) => { el.dataset.bbKeep = "1"; }); }
  const q = card.querySelector("#rc-q");
  const qEmpty = q.hidden || !q.textContent.trim();
  const lastAgent = before.filter((el) => !el.dataset.bbKeep && el.classList.contains("bubble") && el.classList.contains("agent") && !el.classList.contains("typing")).at(-1);
  for (const el of before) {
    if (el.id === "chips" || el.id === "chat-spacer" || el.dataset.bbKeep) continue;
    if (!el.classList.contains("bb-hide")) el.classList.add("bb-hide");
  }
  let echo = card.querySelector("#rc-echo");
  if (!echo) {
    echo = document.createElement("div");
    echo.id = "rc-echo"; echo.className = "rc-q rc-echo"; echo.hidden = true;
    q.before(echo);
  }
  const text = qEmpty && lastAgent ? lastAgent.textContent : "";
  if (echo.textContent !== text) echo.textContent = text;
  if (echo.hidden === Boolean(text)) echo.hidden = !text; // 값이 바뀔 때만 (대화창 감시가 무한 반복되지 않게)
}

(function setupBrief() {
  const c = chat();
  if (!c) return;
  new MutationObserver(briefUpdate).observe(c, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
  setInterval(briefUpdate, 300);
})();
