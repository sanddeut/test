# 이전 게시본 이미지와 비교해 바뀐 개선안 화면만 recent.json에 기록 (붉은 테두리)
import os, json, sys
from PIL import Image, ImageChops
SP = os.path.dirname(os.path.abspath(__file__))
prev, cur = f"{SP}/img_prev", f"{SP}/site2/img"
changed = []
for f in sorted(os.listdir(cur)):
    if not f.startswith("v4-"):
        continue
    p = f"{prev}/{f}"
    if not os.path.exists(p):
        changed.append(f); continue
    a, b = Image.open(p).convert("L"), Image.open(f"{cur}/{f}").convert("L")
    if a.size != b.size:
        changed.append(f); continue
    d = ImageChops.difference(a, b).point(lambda x: 255 if x > 40 else 0)
    if d.getbbox() and sum(d.histogram()[255:]) > 150:
        changed.append(f)
json.dump(changed, open(f"{SP}/recent.json", "w"), ensure_ascii=False, indent=0)
print(len(changed), changed)
