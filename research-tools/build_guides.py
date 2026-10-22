#!/usr/bin/env python3
"""가이드라인 25개 순서대로, 적용 내용과 원안/개선안 캡처 → site4/index.html"""
import json, os, html, re
from PIL import Image

SP = os.path.dirname(os.path.abspath(__file__))
SHOTS = f"{SP}/shots"
SITE = f"{SP}/site4"
LOG = "/home/user/test/v4/guideline-log.md"
os.makedirs(f"{SITE}/img", exist_ok=True)
E = html.escape
used = []

def load(ver, rn):
    p = f"{SHOTS}/{ver}/{rn}/shots.json"
    return json.load(open(p))["shots"] if os.path.exists(p) else []

def webp(src, out):
    dst = f"{SITE}/img/{out}"
    if not os.path.exists(dst):
        im = Image.open(src).convert("RGB")
        im = im.resize((im.width * 9 // 20, im.height * 9 // 20), Image.LANCZOS)
        im.save(dst, "WEBP", quality=82, method=6)
    used.append(out)
    return f"img/{out}"

def shot(ver, rn, pick, field="chat", nth=0):
    ss = load(ver, rn)
    hits = [s for s in ss if (s["id"] == pick if isinstance(pick, str) else pick(s))]
    s = hits[nth] if len(hits) > nth else None
    if not s or not s.get(field): return None
    return webp(f"{SHOTS}/{ver}/{rn}/{s[field]}", f"{ver}-{rn}-{s[field].replace('.png', '.webp')}")

def raw(path):
    return webp(f"{SHOTS}/v4/{path}", "v4-" + path.replace("/", "-").replace(".png", ".webp"))

ASK = lambda step: (lambda s: s["step"] == step and s["kind"] in ("ask", "chips"))
SAY = lambda step, t=None: (lambda s: s["step"] == step and s["kind"] == "say" and (t is None or t in s.get("text", "")))
L, H = "원안 낮은 자동화", "원안 높은 자동화"
o = lambda run, sid, cap, field="chat": (shot("v2", run, sid, field), cap)
n4 = lambda run, pick, cap, field="chat", nth=0: (shot("v4", run, pick, field, nth), cap)
r4 = lambda path, cap: (raw(path), cap)

I = lambda text, orig, new: (text, [x for x in orig if x[0]], [x for x in new if x[0]])
TAXI, ORI, DEST, CAR, CPN, REQ, FIN = SAY("taxi_open"), ASK("origin"), ASK("dest"), ASK("car"), SAY("coupon"), ASK("request"), ASK("final")
G = {
  1: [I(["어떻게 시작해야 하는지 바로 알 수 있도록, CTA를 '눌러서 대화 시작' 버튼 하나로 통합하고 안내를 추가함"], [o("first", "0a", "원안 첫 화면")], [r4("inputs/0a-chat.png", "첫 화면")]),
      I(["입력 가능한 방식을 명시적으로 제시하고, 두 방법 중 하나를 직접 고를 수 있게함"], [], [r4("inputs/0b-chat.png", "말로/글로 고르기")]),
      I(["'글로 하기'를 고르면 바로 키보드가 올라오게 함.", "원안의 플레이스 홀더는 반드시 말(음성)로 해야하는 것으로 오해의 여지가 있어, \"여기에 적어 주세요\"로 바꿈"], [], [r4("inputs/0c-chat.png", "글로 하기")]),
      I(["말로 입력하는 방법을 보다 직관적으로 변경 (마이크 아이콘 버튼 ➞ [눌러서 말하기] 텍스트 버튼)"], [], [r4("inputs/0e-chat.png", "말로 하기")])],
  2: [I("원안에는 입력이 전달됐는지 알 수 있는 표시가 없어, 보낸 순간 말풍선 옆에 체크를 잠깐 보여 줌", [o("B1s1", "05", "원안: 전달 표시 없음")], [r4("queue/q1.png", "보낸 말풍선 옆 체크")]),
      I("글만 쓰고 보내지 않아 전달되지 않는 일을 막도록, 잠시 뒤 \"보내기를 눌러야 전달돼요\"라고 알림", [], [r4("inputs/0f-chat.png", "보내기 안 누름")]),
      I("말이 제대로 들어가고 있는지 알 수 있도록, 듣는 중 표시와 받아 적는 내용을 바로 보여 줌", [], [r4("inputs/0d-chat.png", "듣는 중"), r4("inputs/0g-chat.png", "받아 적는 중")])],
  3: [I("원안에서는 진행 중에 한 요청이 아무 반응 없이 무시되어, 지금 바로 할 수 없는 이유와 언제 반영하는지 알리고 실제로 반영함", [], [r4("queue/q1.png", "이유와 대안 안내")])],
  4: [I("AI가 일하고 있다는 것을 글을 읽지 않아도 알아차리도록, 실행화면 테두리를 움직이는 그라데이션으로 바꿈", [o("B2s1", "03", "원안 실행화면", "run")], [n4("B1s1", ORI, "움직이는 테두리", "run")]),
      I("조작권이 나에게 넘어왔다는 것을 놓치지 않도록, 화면이 커지고 로딩을 거쳐 전환되는 모션을 더함", [], [r4("manual/m1-chat.png", "화면이 커짐"), r4("manual/m2-chat.png", "로딩")])],
  5: [I("원안 높은 자동화는 설정한 뒤에야 알려서, 사용자가 잘못 말했거나 AI가 잘못 알아들어도 그대로 진행됨. 실행하기 전에 \"여기가 맞나요?\"라고 먼저 확인함", [o("B2s1", "03", "원안: 설정한 뒤 알림")], [n4("B1s1", ORI, "출발지 확인"), n4("B1s1", DEST, "목적지 확인")]),
      I("알아서 하는 단계도 결과만 알리지 않고 \"~할게요\"라고 먼저 알림", [], [n4("B1s1", TAXI, "택시 앱을 실행할게요")])],
  6: [I("지금 누가 조작하는지 바로 알 수 있도록, AI가 조작할 때는 실행화면 위에 \"AI가 앱 조작 중\" 칩과 흰 덮개를 보여 줌", [o("B1s1", "05", "원안 실행화면", "run")], [n4("B1s1", ORI, "AI가 앱 조작 중", "run")]),
      I("내가 조작할 때는 헤더를 연한 빨강으로 바꿔 AI가 조작할 때와 확실히 구분함", [], [r4("manual/m4-chat.png", "직접 조작 중")]),
      I("대화창에서도 AI가 조작 중임을 알 수 있도록, 작업 중 표시 위에 \"AI가 앱 조작 중\"을 작게 적음", [], [n4("B1s1", TAXI, "대화창 작업 중 표시")])],
  7: [I("원안에서는 \"승인\"만 남아 무엇을 승인했는지, 내가 한 것인지 AI가 한 것인지 헷갈려서, 무엇에 답했는지 작은 글씨로 함께 남김", [o("B1s1", "05", "원안: \"승인\"만 남음")], [n4("B1s1", DEST, "확인 / 출발지 설정")])],
  8: [I("원안에서는 지난 대화와 현재 단계가 섞여 지난 승인 버튼을 누르기도 함. 지금 단계를 항상 맨 위에 두고 지난 대화는 위쪽 가장자리에서 흐려지게 함", [o("B1s1", "18", "원안")], [n4("B1s1", FIN, "현재 단계가 맨 위")])],
  9: [I("지금 기다려야 하는지 바로 알 수 있도록, AI가 일할 때는 글 대신 움직이는 점만 보여 줌", [o("B2s1", "05", "원안")], [n4("B1s1", TAXI, "기다릴 때")]),
      I("내가 답해야 할 때는 점을 없애고 질문과 버튼만 남겨 차이를 분명히 함", [], [n4("B1s1", ORI, "행동할 때")])],
  10: [I("읽을 것이 너무 많아 무엇을 봐야 할지 몰랐던 문제를 줄이려고, \"할 일 처리하는 중\", \"확인이 필요해요\" 같은 반복되는 줄을 지움", [o("B1s1", "09", "원안 진행 카드")], [n4("B1s1", CAR, "질문만 남김")]),
       I("핵심인 AI의 말이 먼저 보이도록, 발화는 굵게 하고 카드 안의 정보는 작게, '실행화면 보기'는 약하게 바꿈", [o("B2s1", "04", "원안 결과 카드")], [n4("B1s1", CPN, "개선안 결과 카드")])],
  11: [I("원안 높은 자동화는 너무 빨라 읽고 따라가지 못함. 알아서 하는 단계는 결과를 더 오래 보여 주고, 더 시간이 필요하면 '멈추기'로 멈출 수 있게 함", [o("B2s1", "06", "원안: 빠르게 넘어감")], [n4("B1s1", CPN, "알림 뒤 더 머묾")])],
  12: [I("원안의 빨간 네모 아이콘은 중지 버튼인지 알아보지 못해, '멈추기'라는 글자 버튼으로 바꿈", [o("B2s1", "05", "원안 중지 버튼")], [n4("B1s1", TAXI, "멈추기 버튼")]),
       I("개입할 수 있는 버튼을 찾기 쉽도록, 실행화면 바로 아래 한 칸에 '멈추기'와 '내가 조작하기'를 모음", [o("B2s1", "03", "원안 실행화면", "run")], [r4("coach/k0.png", "아래 버튼 칸")]),
       I("버튼이 무슨 일을 하는지 모를 때 '?'를 누르면 멈추기를 짚어 설명함", [], [r4("coach/k2.png", "'?' 안내 2/3")])],
  13: [I("언제든 내가 직접 할 수 있다는 것을 드러내도록, 원안의 작은 '직접 조작' 대신 눈에 띄는 빨간 '내가 조작하기'로 바꿈", [o("B1s1", "05", "원안 직접 조작 버튼", "run")], [r4("manual/m0-chat.png", "내가 조작하기")]),
       I("누른 뒤 조작권이 넘어왔다는 것을 알 수 있도록 화면 전환 과정을 보여 줌", [], [r4("manual/m1-chat.png", "커짐"), r4("manual/m2-chat.png", "로딩"), r4("manual/m4-chat.png", "앱 화면")]),
       I("'?' 안내에서 내가 조작하기를 짚어 설명함", [], [r4("coach/k3.png", "'?' 안내 3/3")])],
  14: [I("원안 높은 자동화에서는 오류를 알아차려도 이미 진행이 끝나 있었음. 결과가 정해지는 순간마다 먼저 확인받은 뒤 진행함", [o("B2s1", "07", "원안: 정한 뒤 알림")], [n4("B1s1", DEST, "목적지 확인"), n4("B1s1", FIN, "최종 호출 확인")])],
  15: [I("원안에서는 거부한 뒤 무엇을 말해야 할지 몰라 막힘. 수정을 누르면 고를 수 있는 선택지를 바로 보여 줌", [o("B1s1", "15", "원안: 거부 후 다시 고르기")], [r4("t17/c1-chat.png", "출발지 수정")]),
       I("이미 끝낸 단계도 고칠 수 있다는 것을 알 수 있도록, 답한 말풍선 아래에 '되돌리기'를 둠", [], [r4("undo/u0-chat.png", "되돌리기")])],
  16: [I("원안에는 되돌리는 방법이 없었음. '되돌리기'나 '방금 한 일 취소'를 누르면 그 단계 전으로 돌리고 다시 물어봄", [], [r4("undo/u0-chat.png", "되돌리기"), r4("undo/u3-chat.png", "되돌린 뒤 다시 물음")])],
  17: [I("거절한 뒤 다시 말로 설명해야 했던 부담을 줄이려고, 되묻는 질문과 함께 선택지 목록을 보여 줌", [o("B1s1", "15", "원안: 말로 다시 고르기")], [r4("t17/c1-chat.png", "출발지 수정"), r4("t17/f1-chat.png", "최종 호출 수정")])],
  18: [I("낮은 자동화와 높은 자동화를 나누지 않고 단계의 중요도에 따라 확인 수준을 정함. 사소한 단계(택시 앱 실행, 예상 금액)는 알아서 하고 알림", [o("B1s1", "03", "원안 낮은 자동화: 앱 실행도 승인")], [n4("B1s1", TAXI, "택시 앱 실행"), n4("B1s1", CPN, "예상 금액")]),
       I("되돌리기 어렵거나 비용이 드는 결정(출발지, 목적지, 최종 호출)은 반드시 확인함", [], [n4("B1s1", FIN, "최종 호출 확인")]),
       I("원안 높은 자동화는 요청하지 않은 예약까지 묻지 않고 해 버림. 요청 외 행동은 먼저 물음", [o("B2s2", "04", "원안 높은 자동화: 묻지 않고 예약")], [n4("B1s2", ASK("reserve"), "예약 묻기", nth=1)])],
  19: [I("원안의 \"승인\"은 모든 질문에 똑같이 쓰여 무겁게 느껴짐. 질문의 무게에 맞게 수정/확인, 거부/허용, 거부/예약하기, 수정/호출하기로 나눔", [o("B1s1", "18", "원안: 승인/거부")], [n4("B1s1", DEST, "수정/확인"), n4("B1s2", ASK("reserve"), "거부/허용"), n4("B1s1", FIN, "수정/호출하기")])],
  20: [I("원안에서는 AI가 기사님 요청사항을 마음대로 골라 사용자가 강요로 느낌. AI가 고르지 않고 먼저 물음", [o("B1s1", "13", "원안 낮은 자동화"), o("B2s1", "07", "원안 높은 자동화")], [n4("B1s1", REQ, "먼저 물음")]),
       I("요금이 달라지는 택시 종류도 미리 정해 두지 않고 먼저 물음", [o("B1s1", "09", "원안: 일반택시로 정해 둠")], [n4("B1s1", CAR, "택시 종류 묻기")])],
  21: [I("내 정보가 어디에 쓰이는지 몰라 불안했던 문제를 줄이려고, 시작할 때 무엇에 접근해 무엇에 쓰는지 알리고 허용을 받음", [], [r4("perm/p1-chat.png", "시작할 때 권한")]),
       I("원안에서는 묻지 않고 이용내역을 열어 봄. 보기 전에 왜 필요한지와 함께 먼저 물음", [o("B1s2", "04", "원안: 이미 이용내역을 봄")], [n4("B1s2", ASK("reserve"), "이유와 함께 묻기")])],
  22: [I("AI가 볼 수 있는 정보를 사용자가 정할 수 있도록 항목별로 켜고 끌 수 있게 하고, 거부하면 보지 않음", [], [r4("perm/p1-chat.png", "항목별 토글")])],
  23: [I("원안의 실행화면을 길 안내나 상세 정보로 오해해서, \"AI가 앱 조작 중\" 칩과 움직이는 테두리로 지금 내 앱을 대신 조작하는 화면임을 드러냄", [o("B1s1", "05", "원안 실행화면", "run")], [n4("B1s1", ORI, "실행화면", "run")]),
       I("'?' 안내에서 실시간 화면이라고 직접 설명함", [], [r4("coach/k1.png", "'?' 안내 1/3")])],
  24: [I("원안에서는 실행화면을 눌러도 반응이 없어 헤맴. 흰 덮개로 누를 수 없는 화면임을 보이고 '?' 안내에서도 알림", [o("B1s1", "05", "원안 실행화면", "run")], [n4("B1s1", ORI, "흰 덮개", "run"), r4("coach/k1.png", "누를 수 없음 안내")]),
       I("누를 수 있는 목록에만 ›를 붙여 누를 수 없는 정보와 구분함", [], [n4("B1s1", CAR, "누를 수 있는 목록"), n4("B1s1", FIN, "누를 수 없는 표")])],
  25: [I("익숙한 뒤로 가기로도 통제할 수 있도록, 누르면 AI를 멈추고 계속하기, 방금 한 일 취소, 앱 종료 중에서 고르게 함", [], [r4("back/bk-chat.png", "뒤로 가기")]),
       I("실수로 모든 진행을 잃지 않도록 앱 종료는 한 번 더 확인함", [], [r4("back/bq-chat.png", "앱 종료 확인")])],
}

# 기록 파일에서 가이드라인별 적용 내용
rows = {}
for l in open(LOG).read().split("\n"):
    c = l.split(" | ")
    if l.startswith("| ") and c[0][2:].strip().isdigit() and len(c) >= 7:
        rows.setdefault(int(c[0][2:]), {"cat": c[1], "sub": c[2], "text": c[3], "how": [x.strip() for x in re.split(r"<br>", c[4]) if x.strip()]})

def figs(items, empty, key=""):
    items = [(s, c) for s, c in items if s]
    if not items: return f'<p class="none">{empty}</p>'
    return "".join(f'<figure><button type="button" class="zoom" data-src="{s}" aria-label="{E(c)} 크게 보기"><img src="{s}" alt="{E(c)}" loading="lazy" width="351" height="702"></button><figcaption data-key="{key}-c{i}">{E(c)}</figcaption></figure>' for i, (s, c) in enumerate(items))

# 대제목 > 소제목 > 카드, 대제목과 소제목은 접고 펼 수 있음
tree = []
for n in range(1, 26):
    r = rows[n]
    if not tree or tree[-1][0] != r["cat"]: tree.append((r["cat"], []))
    subs = tree[-1][1]
    if not subs or subs[-1][0] != r["sub"]: subs.append((r["sub"], []))
    items = []
    for k, (text, orig, new) in enumerate(G[n]):
        key = f"g{n}-i{k}"
        o_html = f'<div class="grp"><p class="grp-t">원안</p><div class="figs">{figs(orig, "", key + "-o")}</div></div><span class="arrow" aria-hidden="true">→</span>' if orig else ""
        sents = text if isinstance(text, list) else [x.strip().rstrip(".") for x in re.split(r"\.\s+", text) if x.strip()]
        bullets = "".join(f'<li data-key="{key}-s{j}">{E(x)}</li>' for j, x in enumerate(sents))
        items.append(f'<li class="item"><div class="shots">{o_html}<div class="grp new"><p class="grp-t">개선안</p><div class="figs">{figs(new, "", key + "-n")}</div></div></div><ul class="what" data-item="{key}">{bullets}</ul></li>')
    subs[-1][1].append(f'''<details class="g" id="g{n}">
  <summary><p class="rule">{n}. {E(r["text"])}</p></summary>
  <ol class="items">{"".join(items)}</ol>
</details>''')
secs = []
for cat, subs in tree:
    inner = "".join(f'<section class="sub"><h3 class="subcat">{E(sub)}</h3><div class="cards">{"".join(cards)}</div></section>' for sub, cards in subs)
    secs.append(f'<section class="catblock"><h2 class="cat">{E(cat)}</h2>{inner}</section>')

page = open(f"{SP}/guides_tpl.html").read().replace("{{BODY}}", "\n".join(secs))
open(f"{SITE}/index.html", "w").write(page)
json.dump(sorted(set(used)), open(f"{SITE}/used.json", "w"))
print("images", len(set(used)), "MB", round(sum(os.path.getsize(f"{SITE}/img/{u}") for u in set(used)) / 1e6, 2))
