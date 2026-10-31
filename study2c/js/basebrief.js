// 기존안 간결하게: 대화 기록을 남기지 않고, AI 회색 카드(진행 카드) 안의 내용만 계속 바뀜
// - 진행 카드가 처음 나오기 전의 대화(인사·첫 요청 등)는 그대로 두고, 그 뒤에 생긴 말풍선(지난 질문·「승인」 답 등)만 숨김
// - 카드 안 질문이 비어 있을 때는 바로 앞 AI 말을 카드 안에 보여 줌 (카드 밖 말풍선 대신)
"use strict";

// 기존안(2c): 단계마다 넘어가는 시간을 절반으로 (화면 조작 속도 배율 0.5 + 문구를 읽는 시간 2.5초)
PACE = 0.5;

// 기존안: 지난 대화를 숨기지 않고 모두 남김 (단계마다 오간 말이 대화 기록으로 이어짐)
const BRIEF_HIDE = false;
function briefUpdate() {
  const c = chat();
  if (!BRIEF_HIDE) { [...c.children].forEach((el) => el.classList.contains("bb-hide") && el.classList.remove("bb-hide")); const e = $("#rc-echo"); if (e && !e.hidden) e.hidden = true; return; }
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

// 기존안 직접 조작 화면: 택시 종류는 고른 것 하나만 접어 두고, 누르면 세 가지가 펼쳐져 고를 수 있음
const _renderPhoneBrief = renderPhone;
renderPhone = function () {
  const r = _renderPhoneBrief.apply(this, arguments);
  // 앱 화면 아래 버튼은 「○○택시 호출하기」 대신 「호출하기」
  document.querySelectorAll("#screen .tx-call").forEach((x) => { if (/택시 호출하기$/.test(x.textContent.trim())) x.textContent = "호출하기"; });
  const list = document.querySelector("#screen .tx-cars");
  if (list && S?.manual) {
    list.classList.add("bb-fold");
    list.classList.toggle("open", Boolean(S.bbCarOpen));
    // 접혀 있을 때는 결제·쿠폰과 같은 한 줄: 「택시 종류 · 일반택시 ›」 (강조 없이)
    if (!S.bbCarOpen && !list.previousElementSibling?.classList.contains("bb-car-row")) {
      const row = document.createElement("div");
      row.className = "tx-row bb-car-row";
      row.innerHTML = `<span>택시 종류</span><b>${esc(CAR_TYPES[S.form.car].label)} <span class="ms">chevron_right</span></b>`;
      row.onclick = (e) => { e.stopPropagation(); S.bbCarOpen = true; logEvent("base_car_expand"); renderPhone(); };
      list.before(row);
    }
  }
  return r;
};
document.addEventListener("click", (e) => {
  const list = e.target.closest?.("#screen .tx-cars.bb-fold");
  if (!list || !S?.manual) return;
  if (!list.classList.contains("open")) {
    // 접혀 있으면 펼치기만 (고르지 않음)
    e.stopPropagation(); e.preventDefault();
    S.bbCarOpen = true; list.classList.add("open");
    logEvent("base_car_expand");
  } else setTimeout(() => { S.bbCarOpen = false; renderPhone(); }, 0); // 고르면 다시 접음
}, true);
