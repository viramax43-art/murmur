"""Temp: drop the dead per-face paint/extras helpers from lib_body.py."""

import re

path = r"tools/blender/lib_body.py"
lines = open(path, encoding="utf-8").read().splitlines(True)


def drop(name):
    start = next(i for i, line in enumerate(lines) if line.startswith(f"def {name}("))
    end = start + 1
    while end < len(lines) and not (lines[end].startswith("def ") or lines[end].startswith("#")):
        end += 1
    while end - 1 > start and lines[end - 1].strip() == "":
        end -= 1
    del lines[start:end]


for dead in ("paint_face", "face_details"):
    if any(line.startswith(f"def {dead}(") for line in lines):
        drop(dead)

text = re.sub(r"\n{4,}", "\n\n\n", "".join(lines))
open(path, "w", encoding="utf-8").write(text)
print("lines now", len(text.splitlines()))
