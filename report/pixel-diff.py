# Compares two sets of screenshots from report/shots.mjs pixel by pixel.
# Usage: python report/pixel-diff.py <folder> <prefix-a> <prefix-b>
import os
import sys

from PIL import Image, ImageChops

folder, first, second = sys.argv[1:4]
if os.name == "nt" and not folder.startswith("\\\\?\\"):
    folder = "\\\\?\\" + os.path.abspath(folder)  # allow long Windows paths
for name in sorted(os.listdir(folder)):
    if not name.startswith(first + "-"):
        continue
    scene = name[len(first) + 1:]
    a = Image.open(os.path.join(folder, name)).convert("RGB")
    b = Image.open(os.path.join(folder, f"{second}-{scene}")).convert("RGB")
    diff = ImageChops.difference(a, b).convert("L")
    box = diff.getbbox()
    changed = diff.width * diff.height - diff.histogram()[0]
    print(scene, "identical" if box is None else f"{changed} px differ in {box}")
