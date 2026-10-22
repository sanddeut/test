#!/usr/bin/env python3
"""shots/*/shots.json + curation(curate.py) → site/index.html + site/img/*.webp"""
import json, os, html, sys
from PIL import Image

SP = os.path.dirname(os.path.abspath(__file__))
SHOTS = f"{SP}/shots"
SITE = f"{SP}/site2"
os.makedirs(f"{SITE}/img", exist_ok=True)
sys.path.insert(0, SP)
from curate import PAGES  # noqa: E402

runs = {}
for ver in ("v2", "v4"):
    for rn in os.listdir(f"{SHOTS}/{ver}") if os.path.isdir(f"{SHOTS}/{ver}") else []:
        p = f"{SHOTS}/{ver}/{rn}/shots.json"
        if os.path.exists(p):
            runs[(ver, rn)] = {s["id"]: s for s in json.load(open(p))["shots"]}

used = []

def img(ver, rn, fname):
    if not fname:
        return None
    src = f"{SHOTS}/{ver}/{rn}/{fname}"
    out = f"{ver}-{rn}-{fname.replace('.png', '.webp')}"
    dst = f"{SITE}/img/{out}"
    if not os.path.exists(dst):
        im = Image.open(src).convert("RGB")
        im = im.resize((im.width * 9 // 20, im.height * 9 // 20), Image.LANCZOS)  # 780→351 폭
        im.save(dst, "WEBP", quality=82, method=6)
    used.append(out)
    return f"img/{out}"

E = html.escape

# 가장 최근 수정에서 바뀐 화면 (붉은 테두리). recent.json: 이미지 파일 이름 목록 또는 접두어("v4-B1s1-"처럼 끝이 -)
RECENT = json.load(open(f"{SP}/recent.json")) if os.path.exists(f"{SP}/recent.json") else []
def is_recent(src):
    name = src.split("/")[-1]
    return any(name == r or (r.endswith("-") and name.startswith(r)) or (r.endswith("*chat") and name.startswith(r[:-5]) and name.endswith("-chat.webp")) for r in RECENT)

def phone(src, cap, alt):
    return f'<figure class="ph{" recent" if is_recent(src) else ""}"><span class="fnum">{{{{FNUM}}}}</span><button type="button" class="zoom" aria-label="{E(alt)} 크게 보기"><img src="{src}" alt="{E(alt)}" loading="lazy" width="351" height="702"></button><figcaption>{E(cap)}</figcaption></figure>'

SEC_PREFIX = {"low": "낮", "high": "높"}
CUR_SEC = {"id": ""}

FCOUNT = {"n": 0}
def number(html, prefix=""):
    # 페이지 전체에서 1부터 차례로
    import re
    def nxt(_):
        FCOUNT["n"] += 1
        return str(FCOUNT["n"])
    return re.sub(r"\{\{FNUM\}\}", nxt, html)

def row(ver, item):
    rn, sid = item["shot"]
    num = item.get("n", "")
    tags = "".join(f'<span class="tag t-{t[0]}">{E(t[1])}</span>' for t in item.get("tags", []) if t[0] not in ("s1", "s2"))
    prefix = "".join(f"[{t[1]}] " for t in item.get("tags", []) if t[0] in ("s1", "s2"))
    opt_html = ""
    note = ""
    APP = lambda cap: "앱 화면" in cap or cap == "실행화면"
    def frames(v):
        """(대화창 그림들, 실행화면 쪽 그림들) — 실행화면 쪽은 실행화면과 앱 자체 화면"""
        if (v, rn) not in runs or sid not in runs[(v, rn)]:
            return None, None
        s = runs[(v, rn)][sid]
        chat_f, run_f = [], []
        cap1 = item.get("cap1", "대화창")
        (run_f if APP(cap1) else chat_f).append(phone(img(v, rn, s["chat"]), cap1, f"{item['label']} {cap1}"))
        if s.get("run") and not item.get("noRun"):
            run_f.append(phone(img(v, rn, s["run"]), "실행화면", f"{item['label']} 실행화면"))
        for extra in item.get("extra", []):
            ern, esid, ecap, *field = extra
            es = runs.get((v, ern), {}).get(esid)
            if not es:
                continue
            f = phone(img(v, ern, es[field[0] if field else "chat"]), ecap, f"{item['label']} {ecap}")
            (run_f if (field and field[0] == "run") or APP(ecap) else chat_f).append(f)
        return chat_f, run_f
    o_chat, o_run = frames("v2")
    o_chat, o_run = o_chat or [], o_run or []
    base = f'{SEC_PREFIX.get(CUR_SEC["id"], "")}{item.get("n", "")}'
    figs = [number("".join(o_chat + o_run), f"{base}-원")] if o_chat or o_run else ['<div class="same">원안에는 없어요</div>']
    n_chat, n_run = frames("v4")
    if item.get("v4scroll") and n_chat is not None:
        s4 = runs[("v4", rn)][sid]
        if s4.get("scroll"):
            n_chat.append(phone(img("v4", rn, s4["scroll"]), "위로 스크롤", f"{item['label']} 개선안 위로 스크롤"))
    if item.get("v4shots"):
        n_chat = [phone(img("v4", r, runs[("v4", r)][i]["chat"]), cap, f"{item['label']} 개선안 {cap}") for r, i, cap in item["v4shots"]]
    # 실행화면(앱 화면)은 아직 바꾼 가이드라인이 없어서 원안과 같음
    run_changed = item.get("runChanged", True)  # 실행화면 테두리·칩·직접 조작 버튼 반영 뒤로는 모든 실행화면이 바뀜
    frame = lambda title, body: f'<div class="frame"><p class="frame-t">{title}</p>{body}</div>'
    new_html = ""
    if n_chat:
        new_html += frame("대화창", f'<div class="figs">{number("".join(n_chat), f"{base}-개")}</div>')
    if o_run:
        new_html += frame("실행화면", f'<div class="figs">{number("".join(n_run), f"{base}-개실")}</div>' if run_changed and n_run else '<div class="same">원안과 같아요</div>')
    cls = " ".join(t[0] for t in item.get("tags", []) if t[0] in ("b", "s1", "s2"))
    return f'''<li class="step {cls}">
  <div class="meta"><div class="num">{E(num)}</div><div class="mt"><h4>{E(prefix + item["label"])}</h4>{tags and f'<div class="tags">{tags}</div>'}{opt_html}{note}</div></div>
  <div class="cmp">
    <div class="col orig"><p class="col-t">원안</p><div class="figs">{"".join(figs)}</div></div>
    <div class="col new"><p class="col-t">개선안</p>{f'<div class="frames">{new_html}</div>' if new_html else '<div class="empty">아직 없음</div>'}</div>
  </div>
</li>'''

body = []
toc = []
FIRST = {"n": "0", "label": "대화 시작", "shot": ("first", "0a"), "cap1": "첫 화면",
         "v4shots": [("inputs", "0a", "첫 화면"), ("inputs", "0b", "누른 뒤"), ("inputs", "0c", "글로 하기"), ("inputs", "0f", "보내기 안 누름"), ("inputs", "0e", "말로 하기 (듣기 전)"), ("inputs", "0d", "말로 하기 (듣는 중)"), ("inputs", "0g", "받아 적는 중")]}
PAGES[0]["sections"][1]["items"].insert(0, FIRST)
BACK = {"n": "3", "label": "뒤로 가기를 눌렀을 때", "shot": ("none", "x"),
        "v4shots": [("back", "bk", "뒤로 가기 다이얼로그"), ("back", "bq", "앱 종료 확인")]}
_low = PAGES[0]["sections"][1]["items"]
_low.insert(next(i for i, it in enumerate(_low) if it.get("n") == "3") + 1, BACK)
MANUAL = {"n": "3", "label": "내가 조작하기를 눌렀을 때", "shot": ("none", "x"),
          "v4shots": [("manual", "m0", "실행화면"), ("manual", "m1", "전체 화면으로 커짐"), ("manual", "m2", "로딩"), ("manual", "m4", "앱 화면")]}
_low.insert(next(i for i, it in enumerate(_low) if it is BACK) + 1, MANUAL)
next(it for it in _low if it.get("shot") == ("B1s1", "18"))["v4scroll"] = True
for page in PAGES:
    ver = page["ver"]
    toc.append(f'<a href="#{ver}">{E(page["title"])}</a>')
    secs = []
    for sec in [s for s in page["sections"] if s["id"] != "task"]:
        sid = f'{ver}-{sec["id"]}'
        CUR_SEC["id"] = sec["id"]
        rows = "\n".join(row(ver, it) for it in sec["items"])
        intro = ""
        secs.append(f'<details class="acc" id="{sid}" open><summary><h3>{E(sec["title"])}</h3></summary><ol class="steps">{rows}</ol></details>')
    subnav = " ".join(f'<a href="#{ver}-{s["id"]}">{E(s["title"])}</a>' for s in page["sections"])
    body.append(f'''<article id="{ver}">{"".join(secs)}</article>''')

tpl = open(f"{SP}/template2.html").read()
out = tpl.replace("{{TOC}}", " ".join(toc)).replace("{{BODY}}", "\n".join(body))
open(f"{SITE}/index.html", "w").write(out)
json.dump(sorted(set(used)), open(f"{SITE}/used.json", "w"))
print("images", len(set(used)), "size MB", round(sum(os.path.getsize(f"{SITE}/img/{u}") for u in set(used)) / 1e6, 2))
