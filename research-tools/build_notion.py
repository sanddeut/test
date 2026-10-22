#!/usr/bin/env python3
"""올린 가이드라인 적용 페이지(index.html)를 노션용 마크다운으로 → pages/연구2_가이드라인_적용/notion.md

범주는 제목1, 소제목은 제목3, 가이드라인은 제목4 토글. 토글 안에는 항목마다 원안 캡처 → 개선안 캡처, 설명 불릿을 열로 나란히.
캡처는 깃허브에 올린 이미지 주소(raw)를 씀. 페이지에서 '문구 편집'으로 고친 내용은 edits 폴더(아티팩트 db를 내려받은 것)가 있으면 덮어씀.
사용: python3 build_notion.py [edits 폴더]
"""
import html, json, os, re, subprocess, sys
from html.parser import HTMLParser
from urllib.parse import quote

SP = os.path.dirname(os.path.abspath(__file__))
PAGE = f"{SP}/pages/연구2_가이드라인_적용"
IMG_W = 26  # 캡처 한 칸의 최대 너비(%). 캡처가 많으면 좁혀서 설명 칸을 남김
# 브랜치가 바뀌거나 지워져도 이미지가 깨지지 않도록 커밋 번호로 고정 (이미지를 바꾸면 푸시한 뒤 다시 만들어야 함)
SHA = subprocess.check_output(["git", "log", "-1", "--format=%H", "--", "pages/연구2_가이드라인_적용/img"], cwd=SP, text=True).strip()
RAW = f"https://raw.githubusercontent.com/sanddeut/test/{SHA}/" + quote("research-tools/pages/연구2_가이드라인_적용/")


class P(HTMLParser):
    """필요한 요소만 차례대로 뽑음: 범주, 소제목, 가이드라인, 항목, 묶음 라벨, 이미지, 캡션, 불릿"""
    def __init__(self):
        super().__init__()
        self.out, self.cur, self.buf = [], None, ""

    def handle_starttag(self, tag, a):
        a = dict(a)
        cls = a.get("class", "")
        kind = {"cat": "cat", "subcat": "sub", "rule": "rule", "grp-t": "grp"}.get(cls)
        if tag == "li" and cls == "item": self.out.append(("item",))
        elif tag == "img" and a.get("src", "").startswith("img/"): self.out.append(("img", a["src"]))
        elif tag == "figcaption": kind = "cap"
        elif tag == "li" and "data-key" in a: kind = "bullet"
        if kind: self.cur, self.buf, self.key = kind, "", a.get("data-key")

    def handle_data(self, d):
        if self.cur: self.buf += d

    def handle_endtag(self, tag):
        if self.cur and tag in ("h2", "h3", "p", "figcaption", "li"):
            self.out.append((self.cur, self.buf.strip(), self.key))
            self.cur = None


p = P()
p.feed(open(f"{PAGE}/index.html").read())

# 페이지에서 고친 문구
edits, lists = {}, {}
if len(sys.argv) > 1:
    for f in os.listdir(sys.argv[1]):
        d = json.load(open(os.path.join(sys.argv[1], f)))
        k = f[:-5]
        if k.endswith("-list"): lists[k[:-5]] = d["items"]
        elif "text" in d: edits[k] = d["text"]

# 구조로 묶기
tree = []  # [(범주, [(소제목, [(가이드라인, [항목])])])]
for t in p.out:
    if t[0] == "cat": tree.append((t[1], []))
    elif t[0] == "sub": tree[-1][1].append((t[1], []))
    elif t[0] == "rule": tree[-1][1][-1][1].append((t[1], []))
    elif t[0] == "item": tree[-1][1][-1][1][-1][1].append({"groups": [], "bullets": [], "key": None})
    else:
        it = tree[-1][1][-1][1][-1][1][-1]
        if t[0] == "grp": it["groups"].append((t[1], []))
        elif t[0] == "img": it["groups"][-1][1].append([t[1], ""])
        elif t[0] == "cap": it["groups"][-1][1][-1][1] = edits.get(t[2], t[1])
        elif t[0] == "bullet":
            it["key"] = re.sub(r"-s\d+$", "", t[2])
            it["bullets"].append(edits.get(t[2], t[1]))

def img(src, cap):
    return f"![{cap}]({RAW}{quote(src)})"

def block(tag, title, children, attrs=""):
    """노션 컨테이너 블록: 제목은 여는 태그 바로 뒤, 자식은 빈 줄 다음"""
    return f"<{tag}{attrs}>{title}\n\n" + "\n\n".join(children) + f"\n</{tag}>"

out = []
for cat, subs in tree:
    out.append(f"# {cat}")
    for sub, rules in subs:
        out.append(f"### {sub}")
        for rule, items in rules:
            body = []
            for it in items:
                bullets = lists.get(it["key"], it["bullets"])
                cols = []
                n = sum(len(f) for _, f in it["groups"])
                w = min(IMG_W, 72 // n)
                for label, figs in it["groups"]:
                    for fi, (src, cap) in enumerate(figs):
                        head = f"**{label}**" if fi == 0 else "<p />"
                        cols.append(f'<column ratio="{w}">\n{head}\n\n{img(src, cap)}\n</column>')
                cols.append(f'<column ratio="{100 - w * n}">\n' + "\n".join(f"- {b}" for b in bullets) + "\n</column>")
                body.append("<columns>\n" + "\n".join(cols) + "\n</columns>")
            out.append(block("toggle", re.sub(r"^(\d+)\.", r"\1\\.", rule), body, ' heading="h4"'))  # "1."이 번호 목록으로 읽히지 않게

open(f"{PAGE}/notion.md", "w").write("\n".join(out) + "\n")
print("가이드라인", sum(len(r) for _, s in tree for _, r in s), "항목", sum(len(i) for _, s in tree for _, r in s for _, i in r))
