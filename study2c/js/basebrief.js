// 기존안 간결하게: 대화 기록을 남기지 않고, AI 회색 카드(진행 카드) 안의 내용만 계속 바뀜
// - 진행 카드가 생기면 그 위의 말풍선(첫 요청·지난 질문·「승인」 답 등)은 숨김
// - 카드 안 질문이 비어 있을 때는 바로 앞 AI 말을 카드 안에 보여 줌 (카드 밖 말풍선 대신)
// - 참가자의 입력·선택이 필요하지 않은 단계(앱 열기·출발지·목적지·예상 금액 등)는 안쪽 카드를 보여 주지 않음
"use strict";

// 알림(답할 일 없음)에는 안쪽 카드 없음. 선택지와 함께 나오는 카드(택시 종류·최종 호출 등)는 그대로
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
  const q = card.querySelector("#rc-q");
  const qEmpty = q.hidden || !q.textContent.trim();
  const lastAgent = before.filter((el) => el.classList.contains("bubble") && el.classList.contains("agent") && !el.classList.contains("typing")).at(-1);
  for (const el of before) {
    if (el.id === "chips" || el.id === "chat-spacer") continue;
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
