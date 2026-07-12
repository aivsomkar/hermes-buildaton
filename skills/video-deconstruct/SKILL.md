---
name: video-deconstruct
description: Deconstruct a local or URL launch-video reference into machine-readable beats, a narrative breakdown, contact sheet, and a downstream style brief.
---

# Video Deconstruct

Use when a user provides an inspiration or reference video and wants its structure, pacing, visual grammar, or reusable style priors. Analyze only. Never copy source media into a produced video.

## Run

```bash
./scripts/deconstruct.sh <video-path-or-url> --out <output-dir> [--fast]
```

The deterministic pass emits `beats.json`, `BREAKDOWN.md`, `style-brief.md`, `keyframes/`, and `contact-sheet.png`. It refuses sources over 180 seconds and falls back to two-second windows for continuous-camera videos.

## Vision enrichment

Unless `--fast` was requested, inspect `contact-sheet.png` in one vision call. Read `references/closed-vocabulary.md`. Update each shot’s `desc`, `text_on_screen`, composition, palette, and visual category. For interesting shots only, compare the first and last keyframes and choose motion names from the closed vocabulary. Do not invent motion or blueprint names.

## Classification

Use transcript, shot descriptions, and pacing data to verify beat roles and the arc. Preserve the JSON schema. Then rewrite `style-brief.md` as a compact downstream directive: arc, five-line pacing instruction, palette/type, motion motifs, SFX plan, and explicit do/don’t guidance.

## Verification

- `beats.json` parses as JSON and every shot has `t0 < t1`.
- Contact sheet and at least one keyframe per shot exist.
- Style brief never instructs downstream agents to reuse reference assets.
- Any uncertainty is marked `unknown`, not guessed.
