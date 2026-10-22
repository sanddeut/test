#!/usr/bin/env python3
"""원안 낮은 자동화 / 원안 높은 자동화 / 개선안(하나) 세 칸 비교 → site2/index.html"""
import json, os, html, re
from PIL import Image

SP = os.path.dirname(os.path.abspath(__file__))
SHOTS = f"{SP}/shots"
SITE = f"{SP}/site2"
os.makedirs(f"{SITE}/img", exist_ok=True)
E = html.escape
RECENT = json.load(open(f"{SP}/recent.json")) if os.path.exists(f"{SP}/recent.json") else []

def load(ver, rn):
    p = f"{SHOTS}/{ver}/{rn}/shots.json"
    return json.load(open(p))["shots"] if os.path.exists(p) else []

used = []
def img_from(src, out):
    dst = f"{SITE}/img/{out}"
    if not os.path.exists(dst):
        im = Image.open(src).convert("RGB")
        im = im.resize((im.width * 9 // 20, im.height * 9 // 20), Image.LANCZOS)
        im.save(dst, "WEBP", quality=82, method=6)
    used.append(out)
    return f"img/{out}"

def by_id(ver, rn, sid):
    return next(s for s in load(ver, rn) if s["id"] == sid)

def v4(rn, pred, nth=0):
    hits = [s for s in load("v4", rn) if pred(s)]
    return hits[nth] if len(hits) > nth else None

def fig(ver, rn, shot, field, cap):
    if not shot or not shot.get(field):
        return ""
    src = f"{SHOTS}/{ver}/{rn}/{shot[field]}"
    out = f"{ver}-{rn}-{shot[field].replace('.png', '.webp')}"
    return phone(img_from(src, out), cap)

def raw(path, cap):
    name = "v4-" + path.replace("/", "-").replace(".png", ".webp")
    if name.startswith("v4-coach-k"): name = name.replace("-k", "-k")
    return phone(img_from(f"{SHOTS}/v4/{path}", name), cap)

def phone(src, cap):
    name = src.split("/")[-1]
    rec = " recent" if name in RECENT else ""
    return f'<figure class="ph{rec}"><span class="fnum">{{{{FNUM}}}}</span><button type="button" class="zoom" aria-label="{E(cap)} 크게 보기"><img src="{src}" alt="{E(cap)}" loading="lazy" width="351" height="702"></button><figcaption>{E(cap)}</figcaption></figure>'

def pair(ver, rn, shot, cap=""):
    """대화창 + (있으면) 실행화면"""
    a = fig(ver, rn, shot, "chat", cap or "대화창")
    b = fig(ver, rn, shot, "run", "실행화면")
    return a + b

def o(ver, rn, sid, cap=""):
    return pair(ver, rn, by_id(ver, rn, sid), cap)

S = lambda step, kind=None, text=None: (lambda s: s["step"] == step and (kind is None or s["kind"] == kind) and (text is None or text in s.get("text", "")))
ASK = lambda step: (lambda s: s["step"] == step and s["kind"] in ("ask", "chips"))
SAME_LOW = '<div class="same">낮은 자동화와 같아요</div>'
NONE = '<div class="same">해당없음</div>'

ROWS = [
    ("0", "대화 시작", o("v2", "first", "0a", "첫 화면"), SAME_LOW,
     "".join(raw(f"perm/p1-chat.png", "시작할 때 권한 묻기") for _ in [0]) +
     "".join(fig("v4", "inputs", by_id("v4", "inputs", i), "chat", c) for i, c in [("0a", "첫 화면"), ("0b", "누른 뒤"), ("0c", "글로 하기"), ("0f", "보내기 안 누름"), ("0e", "말로 하기 (듣기 전)"), ("0d", "말로 하기 (듣는 중)"), ("0g", "받아 적는 중")])),
    ("1", "택시 앱 실행", o("v2", "B1s1", "03"), o("v2", "B2s1", "02"), pair("v4", "B1s1", v4("B1s1", S("taxi_open")), "알아서 하고 알림")),
    ("2", "출발지 설정", o("v2", "B1s1", "05"), o("v2", "B2s1", "03"), pair("v4", "B1s1", v4("B1s1", ASK("origin")), "여기가 맞나요?")),
    ("3", "목적지 설정", o("v2", "B1s1", "07"), o("v2", "B2s1", "04"), pair("v4", "B1s1", v4("B1s1", ASK("dest")), "여기가 맞나요?")),
    ("3-1", "뒤로 가기를 눌렀을 때", NONE, NONE, raw("back/bk-chat.png", "뒤로 가기 다이얼로그") + raw("back/bq-chat.png", "앱 종료 확인")),
    ("3-1-2", "실행화면 '?' 안내", NONE, NONE, "".join(raw(f"coach/k{k}.png", c) for k, c in [(0, "실행화면"), (1, "1. 실행화면"), (2, "2. 멈추기"), (3, "3. 내가 조작하기")])),
    ("3-2", "내가 조작하기를 눌렀을 때", NONE, NONE, "".join(raw(f"manual/{m}-chat.png", c) for m, c in [("m0", "실행화면"), ("m1", "전체 화면으로 커짐"), ("m2", "로딩"), ("m4", "앱 화면")])),
    ("4", "택시 종류", o("v2", "B1s1", "09"), o("v2", "B2s1", "05"), pair("v4", "B1s1", v4("B1s1", ASK("car")), "먼저 물음") + fig("v4", "B1s1", v4("B1s1", S("car", "say", "할게요")), "chat", "고른 뒤")),
    ("5", "예상 금액", o("v2", "B1s1", "11"), o("v2", "B2s1", "06"), pair("v4", "B1s1", v4("B1s1", S("coupon")), "알리기만 함")),
    ("6", "기사님 요청사항", o("v2", "B1s1", "13"), o("v2", "B2s1", "07"), pair("v4", "B1s1", v4("B1s1", ASK("request")), "먼저 물음") + fig("v4", "B1s1", v4("B1s1", S("request", "say", "정했어요")), "chat", "고른 뒤")),
    ("7", "최종 호출 확인", o("v2", "B1s1", "18"), o("v2", "B2s1", "13"), pair("v4", "B1s1", v4("B1s1", ASK("final")), "호출하기")),
    ("7-1", "수정을 눌렀을 때 (추천 선택지)", NONE, NONE, raw("t17/c1-chat.png", "출발지 수정") + raw("t17/f1-chat.png", "최종 호출 수정")),
    ("7-2", "되돌리기", NONE, NONE, raw("undo/u0-chat.png", "되돌리기") + raw("undo/u3-chat.png", "방금 한 일 취소 뒤")),
    ("8", "결제 비밀번호 (직접조작)", o("v2", "B1s1", "19") + fig("v2", "B1s1", by_id("v2", "B1s1", "20"), "chat", "[화면 열기] 후 앱 화면"), SAME_LOW,
     fig("v4", "B1s1", v4("B1s1", lambda s: s["kind"] == "pin"), "chat", "대화창") + fig("v4", "B1s1", v4("B1s1", lambda s: s["kind"] == "pin-app"), "chat", "[화면 열기] 후 앱 화면")),
    ("9", "호출 완료", o("v2", "B1s1", "21") + fig("v2", "B1s1", by_id("v2", "B1s1", "22"), "chat", "완료 후 앱 화면"), o("v2", "B2s1", "16"), pair("v4", "B1s1", v4("B1s1", S("done")))),
    ("10", "세션2: 이용내역과 예약", o("v2", "B1s2", "04", "이용내역 열람 + 예약 제안") + fig("v2", "B1s2r", by_id("v2", "B1s2r", "05"), "chat", "예약 거부 시") + fig("v2", "B1s2", by_id("v2", "B1s2", "05"), "chat", "예약 승인 시"),
     o("v2", "B2s2", "03", "이용내역 열람 + 예약 안내") + fig("v2", "B2s2", by_id("v2", "B2s2", "04"), "chat", "예약 등록"),
     pair("v4", "B1s2", v4("B1s2", ASK("reserve")), "이용내역 허용 묻기") + pair("v4", "B1s2", v4("B1s2", ASK("reserve"), 1), "예약 묻기") + fig("v4", "B1s2", v4("B1s2", S("reserve", "say", "예약했어요")), "chat", "예약한 뒤")),
]

FC = {"n": 0}
def number(h):
    def nxt(_):
        FC["n"] += 1
        return str(FC["n"])
    return re.sub(r"\{\{FNUM\}\}", nxt, h)

rows = []
for n, label, low, high, new in ROWS:
    if high == SAME_LOW: high = low  # 같은 화면이어도 캡처를 그대로 보여 줌
    col = lambda cls, t, body: f'<div class="col {cls}"><p class="col-t">{t}</p><div class="figs">{number(body)}</div></div>'
    rows.append(f'''<li class="step">
  <div class="meta"><div class="num">{E(n)}</div><div class="mt"><h4>{E(label)}</h4></div></div>
  <div class="cmp cmp3">{col("orig", "원안 낮은 자동화", low)}{col("orig", "원안 높은 자동화", high)}{col("new", "개선안", new)}</div>
</li>''')
body = f'<article id="v4"><ol class="steps">{"".join(rows)}</ol></article>'
tpl = open(f"{SP}/template2.html").read()
tpl = tpl.replace("</style>", "  .cmp.cmp3 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr); }\n  @media (max-width: 760px) { .cmp.cmp3 { grid-template-columns: minmax(0, 1fr); } }\n</style>", 1)
out = tpl.replace("{{TOC}}", "").replace("{{BODY}}", body)
open(f"{SITE}/index.html", "w").write(out)
json.dump(sorted(set(used)), open(f"{SITE}/used.json", "w"))
print("images", len(set(used)), "size MB", round(sum(os.path.getsize(f"{SITE}/img/{u}") for u in set(used)) / 1e6, 2), "frames", FC["n"])
