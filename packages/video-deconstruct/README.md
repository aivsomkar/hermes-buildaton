# video-deconstruct

Deterministic local pipeline for turning a reference video into `beats.json`, `BREAKDOWN.md`, `style-brief.md`, keyframes, and a contact sheet.

```bash
python3 src/deconstruct.py /path/to/reference.mp4 --out ./analysis --fast
python3 -m unittest discover -s tests -v
```
