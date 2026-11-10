#!/usr/bin/env python3
"""Every internal link in dist/ must resolve to a file that exists."""

import os, re, sys
from collections import Counter

DIST = sys.argv[1] if len(sys.argv) > 1 else "dist"
ATTR = re.compile(r'(?:href|src)="(/[^"#?]*)"')

broken = Counter()
files = 0
for root, _, names in os.walk(DIST):
    for name in names:
        if not name.endswith(".html"):
            continue
        files += 1
        path = os.path.join(root, name)
        html = open(path, encoding="utf8").read()
        page = "/" + os.path.relpath(path, DIST).replace("index.html", "")
        for m in ATTR.finditer(html):
            target = m.group(1)
            if target == "/":
                ok = os.path.isfile(os.path.join(DIST, "index.html"))
            else:
                cand = os.path.join(DIST, target.lstrip("/"))
                ok = (
                    os.path.isfile(cand)
                    or os.path.isfile(os.path.join(cand, "index.html"))
                    or os.path.isfile(
                        os.path.join(
                            DIST, target.lstrip("/").split("#")[0] + "/index.html"
                        )
                    )
                )
            if not ok:
                broken[(target, page)] += 1

print(f"{files} html files checked")
if not broken:
    print("no broken internal links")
else:
    print(f"{len(broken)} broken targets:")
    for (target, page), n in broken.most_common(40):
        print(f"  {target}   <- {page}")
