// 기존안 간결하게: 대화 기록을 남기지 않고, AI 회색 카드(진행 카드) 안의 내용만 계속 바뀜
// - 진행 카드가 처음 나오기 전의 대화(인사·첫 요청 등)는 그대로 두고, 그 뒤에 생긴 말풍선(지난 질문·「승인」 답 등)만 숨김
// - 카드 안 질문이 비어 있을 때는 바로 앞 AI 말을 카드 안에 보여 줌 (카드 밖 말풍선 대신)
"use strict";

// 기존안(2c): 단계마다 넘어가는 시간을 절반으로 (화면 조작 속도 배율 0.5 + 문구를 읽는 시간 2.5초)
PACE = 0.5;

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

// =====================================================================
// 기존안: 호출 내용 최종 확인부터는 앱에서 직접 (대화창에는 안내와 「화면 열기」만)
// - 「화면 열기」 → 앱 화면에서 직접 [○○택시 호출하기] → [호출] → 결제 비밀번호
// =====================================================================
const _runStepAtBrief = runStepAt;
runStepAt = async function (i, step) {
  if (step.id === "final" && S && !S.finished && S.manualDone?.final === undefined) {
    S.baseHandoff = true;
    await agentSay("택시 호출 설정을 완료했어요. 앱에서 직접 결제해주세요.", { gated: true });
    const box = $("#rc-choices");
    if (box) {
      box.innerHTML = "";
      const b = document.createElement("button");
      b.type = "button"; b.className = "pw-go bb-open";
      b.innerHTML = '<span class="ms">open_in_new</span> 화면 열기';
      b.onclick = () => { logEvent("base_handoff_open"); S.phone.sheet = null; startManual(); };
      box.appendChild(b);
      $("#run-card")?.classList.add("asking");
    }
    logEvent("base_handoff");
    // 참가자가 앱에서 [호출]을 누를 때까지 기다림 (누르면 최종 호출까지 직접 끝낸 것으로 처리됨)
    while (S && !S.finished && S.manualDone?.final === undefined) await sleep(200);
    $("#run-card")?.classList.remove("asking");
    if (box) box.innerHTML = "";
  }
  return _runStepAtBrief(i, step);
};
// 호출한 뒤 결제 비밀번호도 대화창을 거치지 않고 바로 앱 화면에서
setInterval(() => {
  if (!S?.baseHandoff || S.finished || S.pinOpen) return;
  if (S.waiter?.pin) $(".pw-card .pw-go")?.click();
}, 200);
