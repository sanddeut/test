# 논문용 대응 표 페이지: paper-guideline-table.md(현재 판)와 .v1.md(이전 판)를 탭으로 바꿔 볼 수 있게
import re, sys, html
src = sys.argv[1] if len(sys.argv) > 1 else "."
out = sys.argv[2] if len(sys.argv) > 2 else "table.html"
def parse(path):
    cats = []
    for line in open(path, encoding="utf-8"):
        if line.startswith("## "): cats.append((line[3:].strip(), []))
        m = re.match(r"\| (\d+) \| (.+?) \| (.+?) \| (.+?) \|\s*$", line)
        if m and cats: cats[-1][1].append(m.groups())
    return cats
def render(cats):
    h = []
    for name, rows in cats:
        h.append(f'<h2>{html.escape(name)}</h2><table><colgroup><col class="c-n"><col class="c-s"><col class="c-g"><col class="c-i"></colgroup><thead><tr><th>번호</th><th>하위범주</th><th>가이드라인</th><th>구현</th></tr></thead><tbody>')
        for n, s, g, i in rows:
            h.append(f'<tr><td class="n">{n}</td><td class="s">{html.escape(s)}</td><td class="g">{html.escape(g)}</td><td class="i">{html.escape(i)}</td></tr>')
        h.append("</tbody></table>")
    return "".join(h)
cur = render(parse(f"{src}/paper-guideline-table.md"))
old = render(parse(f"{src}/paper-guideline-table.v1.md"))
page = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>가이드라인 구현 대응표</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap">
<style>
:root {{ --bg:#f5f6f8; --card:#fff; --fg:#1c1d21; --muted:#6b6f7a; --line:#e2e5ea; --accent:#0b57d0; --accent-soft:#e8effc; --sans:"Noto Sans KR",system-ui,-apple-system,sans-serif; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#15171b; --card:#1e2127; --fg:#eceef2; --muted:#9aa0ab; --line:#30343c; --accent:#8ab4ff; --accent-soft:#24304a; color-scheme:dark }} }}
:root[data-theme="dark"] {{ --bg:#15171b; --card:#1e2127; --fg:#eceef2; --muted:#9aa0ab; --line:#30343c; --accent:#8ab4ff; --accent-soft:#24304a; color-scheme:dark }}
* {{ box-sizing:border-box }}
body {{ margin:0; background:var(--bg); color:var(--fg); font-family:var(--sans); font-size:14px; line-height:1.6; letter-spacing:-0.2px }}
main {{ max-width:1100px; margin:0 auto; padding:32px 16px 64px }}
h1 {{ font-size:24px; margin:0 0 6px }}
.sub {{ color:var(--muted); margin:0 0 20px }}
.tabs {{ display:inline-flex; background:var(--card); border:1px solid var(--line); border-radius:999px; padding:3px; gap:2px }}
.tabs button {{ font:inherit; border:0; background:none; color:var(--muted); padding:6px 14px; border-radius:999px; cursor:pointer }}
.tabs button[aria-selected="true"] {{ background:var(--accent-soft); color:var(--accent); font-weight:600 }}
h2 {{ font-size:18px; margin:32px 0 10px }}
.wrap {{ overflow-x:auto }}
table {{ width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; min-width:720px }}
.c-n {{ width:52px }} .c-s {{ width:120px }} .c-g {{ width:38% }}
th {{ text-align:left; font-weight:600; color:var(--muted); font-size:13px; padding:10px 12px; border-bottom:1px solid var(--line) }}
td {{ padding:12px; border-top:1px solid var(--line); vertical-align:top }}
tbody tr:first-child td {{ border-top:0 }}
td.n {{ font-weight:600; color:var(--accent) }}
td.s {{ color:var(--muted) }}
[hidden] {{ display:none !important }}
</style></head><body><main>
<h1>가이드라인과 구현 대응표</h1>
<p class="sub">연구2 개선안에서 가이드라인 25개를 어떻게 구현했는지 정리한 논문용 표예요.</p>
<div class="tabs" role="tablist"><button role="tab" data-v="cur" aria-selected="true">현재 판</button><button role="tab" data-v="old" aria-selected="false">이전 판 (더 구체적)</button></div>
<div class="wrap" data-v="cur">{cur}</div>
<div class="wrap" data-v="old" hidden>{old}</div>
</main><script>
const pick = (v) => {{
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.v === v)));
  document.querySelectorAll(".wrap").forEach((w) => (w.hidden = w.dataset.v !== v));
  try {{ localStorage.setItem("tbl-v", v); }} catch {{}}
}};
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => pick(b.dataset.v)));
try {{ const v = localStorage.getItem("tbl-v"); if (v) pick(v); }} catch {{}}
</script></body></html>'''
open(out, "w", encoding="utf-8").write(page)
print("ok", out)
