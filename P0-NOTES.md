# TIDELINE 55 — P0 notes

## What changed

- **P0-1 cover proof.** `shots.json` now seeds the cover, roadmap and guide frames instead of using `demo=11`, so the header reads **Saved in this browser**. The cover keeps trophy 28 selected (missable flag, 6/18 count, cited steps) and `renderList` scrolls the index pane to the selected row on load. `tools/shots.mjs` now accepts seeded count state.
- **P0-2 missable watch list.** The roadmap side panel is now a counted, ordered list: **9 missable flags · 3 confirmed / 4 possible / 2 watch**. Each flag is numbered 01–09 in closing-lane order and shows `Locks: … → Save: …` on one compact line.
- **P0-3 visible provenance.** Checklist and guide source rails show the short domain and a role tag (`OFFICIAL LIST`, `TRACKER`, `OFFICIAL TEXT`, `GUIDE`, `WIKI`); citation tooltips include the same domain and role. The guide frame keeps the existing “Sources disagree” note.
- **Screenshots.** All four frames recaptured at 1280×480 and under 256 KiB. No fifth frame, no brand rewrite, no `vendor/` or `main.ts` changes.

## How to verify

```bash
node --check app/app.js
node tools/check-data.mjs
node tools/check-offline.mjs

BASE_URL=http://127.0.0.1:8765 CDP_URL=http://127.0.0.1:9223 node tools/shots.mjs
python3 - <<'PY'
from PIL import Image
import os
for f in sorted(os.listdir('screenshots')):
    p = 'screenshots/' + f
    print(f, Image.open(p).size, os.path.getsize(p))
PY

MAKEFUN_OUTPUT_DIR=/tmp/tg-p0-output node main.ts
```

Expected: four images, each `(1280, 480)` and ≤ 262144 bytes; `check-data` and `check-offline` exit 0; `main.ts` reports `Build OK` without audit warnings.
