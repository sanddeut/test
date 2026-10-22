#!/usr/bin/env python3
"""shots/*/shots.json + curation(curate.py) → site/index.html + site/img/*.webp"""
import json, os, html, sys
from PIL import Image

SP = os.path.dirname(os.path.abspath(__file__))
SHOTS = f"{SP}/shots"
SITE = f"{SP}/site"
os.makedirs(f"{SITE}/img", exist_ok=True)
sys.path.insert(0, SP)
from curate import PAGES  # noqa: E402

runs = {}
for ver in ("v2", "v3"):
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

def phone(src, cap, alt):
    return f'<figure class="ph"><button type="button" class="zoom" aria-label="{E(alt)} 크게 보기"><img src="{src}" alt="{E(alt)}" loading="lazy" width="351" height="702"></button><figcaption>{E(cap)}</figcaption></figure>'

def row(ver, item):
    rn, sid = item["shot"]
    s = runs[(ver, rn)][sid]
    num = item.get("n", "")
    tags = "".join(f'<span class="tag t-{t[0]}">{E(t[1])}</span>' for t in item.get("tags", []) if t[0] not in ("s1", "s2"))
    prefix = "".join(f"[{t[1]}] " for t in item.get("tags", []) if t[0] in ("s1", "s2"))
    text = item.get("text", s.get("text", ""))
    lines = "".join(f"<p>{E(t)}</p>" for t in text.split("\n") if t)
    opts = item.get("opts", s.get("options") or [])
    opt_html = ""
    note = ""
    figs = []
    a = img(ver, rn, s["chat"])
    figs.append(phone(a, item.get("cap1", "대화창"), f"{item['label']} 대화창"))
    if s.get("run") and not item.get("noRun"):
        figs.append(phone(img(ver, rn, s["run"]), "실행화면", f"{item['label']} 실행화면"))
    for extra in item.get("extra", []):
        ern, esid, ecap, *field = extra
        es = runs[(ver, ern)][esid]
        figs.append(phone(img(ver, ern, es[field[0] if field else "chat"]), ecap, f"{item['label']} {ecap}"))
    cls = " ".join(t[0] for t in item.get("tags", []) if t[0] in ("b", "s1", "s2"))
    return f'''<li class="step {cls}">
  <div class="meta"><div class="num">{E(num)}</div><div class="mt"><h4>{E(prefix + item["label"])}</h4>{tags and f'<div class="tags">{tags}</div>'}{opt_html}{note}</div></div>
  <div class="figs">{"".join(figs)}</div>
</li>'''

body = []
toc = []
for page in PAGES:
    ver = page["ver"]
    toc.append(f'<a href="#{ver}">{E(page["title"])}</a>')
    secs = []
    for sec in [s for s in page["sections"] if s["id"] != "task"]:
        sid = f'{ver}-{sec["id"]}'
        rows = "\n".join(row(ver, it) for it in sec["items"])
        intro = ""
        secs.append(f'<details class="acc" id="{sid}" open><summary><h3>{E(sec["title"])}</h3></summary><ol class="steps">{rows}</ol></details>')
    subnav = " ".join(f'<a href="#{ver}-{s["id"]}">{E(s["title"])}</a>' for s in page["sections"])
    body.append(f'''<article id="{ver}">{"".join(secs)}</article>''')

tpl = open(f"{SP}/template.html").read()
out = tpl.replace("{{TOC}}", " ".join(toc)).replace("{{BODY}}", "\n".join(body))
open(f"{SITE}/index.html", "w").write(out)
json.dump(sorted(set(used)), open(f"{SITE}/used.json", "w"))
print("images", len(set(used)), "size MB", round(sum(os.path.getsize(f"{SITE}/img/{u}") for u in set(used)) / 1e6, 2))
