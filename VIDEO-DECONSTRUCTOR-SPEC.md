# Skill spec: `video-deconstruct` — reference-video breakdown engine

**Status: PLAN ONLY — not built.** Build it ON THE FLOOR (first hour of the sprint): it's core product IP, so building it tonight would cross rule 05. With this spec it's a ~45–60 min build.

## Purpose

Give LaunchReel (and you, forever after) a skill that takes any video — uploaded MP4 or a URL — and produces a complete structural deconstruction: what happens frame by frame, how the video is built, its beats, its shots, its storyline, its motion and sound grammar. Output is both human-readable (a breakdown doc) and machine-usable (a beats JSON + style brief that the scriptwriter and visual designer consume directly as priors).

This is the style-analyst agent's engine, promoted from ad-hoc commands to a named, reusable skill.

## Interface

```
Input:  video file path | URL (YouTube/X/Vimeo — anything yt-dlp handles)
Flags:  --max-duration 180 (refuse longer), --fast (skip vision pass), --out <dir>
Output: <out>/
  beats.json          machine-readable structure (schema below)
  BREAKDOWN.md        human narrative: timeline table + storyline + why it works
  style-brief.md      the compact directive downstream agents consume
  keyframes/          first/mid/last frame per shot
  contact-sheet.png   one tiled overview image (all shots at a glance)
```

Skill format: agentskills.io `SKILL.md` + `scripts/` + `references/` — works identically as a Claude Code skill and a Hermes skill (external_dirs already wired). The script layer is deterministic (bash/node orchestrating ffmpeg/whisper); the LLM does only the seeing and classifying.

## Pipeline (9 stages)

**0. Intake & normalize.** URL → `yt-dlp -f "bv*[height<=720]+ba/b" --max-filesize 200M`. Any input → normalized proxy: `ffmpeg -vf scale=-2:720 -r 30` MP4. Hard cap 3 min (refuse politely beyond — this is for 30–90s references).

**1. Technical probe.** `ffprobe`: duration, fps, aspect ratio, has-audio. → `beats.json.meta`.

**2. Shot segmentation.** ffmpeg scene detection at descending thresholds (0.4 → 0.3 → 0.2) until shot count lands in a sane band (~4–40 for a 60s video). **Known failure mode (verified in dry-run): continuous-camera videos (Blueprint-B style, Screen-Studio demos) have ZERO hard cuts.** Fallback: if < 3 cuts detected, switch to fixed 2s sampling windows and treat motion (stage 5) as the segmenter. Emit `shots[] = {t0, t1, kind: cut|window}`.

**3. Audio layer (3 passes, all local/verified):**
   - **Transcript:** extract 16kHz mono wav → `whisper-cli` (model already at `~/.cache/hyperframes/whisper/models/`) with word timestamps. VO lines land on the shots they overlap. Music-only videos → transcript may be lyrics or empty; both are signal ("no VO — music-driven" is a style fact).
   - **Energy curve:** `ffmpeg -af ebur128` momentary loudness → find the drop (biggest energy step-up = the reveal beat), hits (local maxima), and the build.
   - **Silence beats:** `silencedetect -30dB` → the "0.3–0.5s silence before reveal" trick, detected explicitly.
   - (V2, skip in sprint: aubio/librosa BPM grid.)

**4. Frame sampling.** Per shot: first + middle + last frame PNGs. Plus one tiled contact sheet (`ffmpeg tile` or ImageMagick `montage`) of every shot's middle frame — this single image is what makes the vision pass cheap.

**5. Vision pass (1–3 LLM calls total, not per-frame).**
   - Call 1: contact sheet + shot timing table → per-shot: what's on screen (real UI / kinetic type / device frame / logo / talking head / data viz), on-screen text (OCR), composition (centered type? bento? floating panels?), palette (dark/light, accent hues).
   - Call 2 (only for shots flagged interesting): first-vs-last frame pairs → infer the motion: zoom in/out, pan direction, cascade reveal, count-up, type-on, mask wipe. Vocabulary is CLOSED — the model must pick from the motion-language move list (`~/.claude/skills/product-launch-video/references/motion-language.md`), so output maps 1:1 to reproducible recipes.
   - `--fast` mode skips call 2; motion falls back to "unknown".

**6. Structure classification (1 LLM call).** Transcript + per-shot descriptions + energy curve → assign each shot a **beat role** from the existing blueprint taxonomy (Hook, Problem, Product_Intro, Key_Feature, Benefits, Social_Proof, CTA, Brand_Outro — same enums the local blueprints use), then name the **arc** (PAS / Future Pacing / Demo Loop / BAB / Feature-Benefit Cascade ≈ kit blueprints A–E). Also computed mechanically: logo first-appearance time, product-UI first-appearance time, cuts/sec per third (pacing curve), VO-driven vs music-driven.

**7. Blueprint matching.** Per shot, nearest of the 15 local shot blueprints (kinetic-type-beats, cursor-ui-demo, dataviz-countup, logo-assemble-lockup…) — included in call 6 with the blueprint one-liners as the option list. This is the killer feature: the deconstruction speaks the exact language the video producer builds in, so "make one like this" becomes literal.

**8. Emit outputs.**

`beats.json` schema:
```json
{
  "meta": {"duration": 58.2, "fps": 30, "aspect": "16:9", "source": "..."},
  "arc": "pain-reveal-rapidfire-sting",
  "vo_mode": "narrated | music-driven | hybrid",
  "logo_first_s": 49.1, "ui_first_s": 6.4,
  "pacing": {"cuts_per_sec_by_third": [0.4, 1.6, 0.7], "drop_s": 6.2, "silences": [5.8]},
  "palette": {"mode": "dark", "base": "#0B0B0E", "accents": ["#6E56CF"]},
  "shots": [{
    "t0": 0.0, "t1": 5.8, "role": "Hook", "blueprint": "kinetic-type-beats",
    "desc": "three text slams on black, riser under",
    "text_on_screen": ["Your standups are lying to you"],
    "motion": ["kinetic beat-slam"], "audio": {"vo": null, "sfx_cues": ["riser"]}
  }]
}
```

`style-brief.md` (what downstream agents actually read): arc + 5-line pacing directive + palette/type directive + motion motif list + SFX plan + the do/don't distilled from this reference ("logo only at 0:49 — do NOT front-load ours").

**9. Integration.** Style-analyst agent = `delegate_task` worker that runs this skill and returns `style-brief.md`. Story design (Step 3) takes `arc` as its default; visual design (Step 4) takes per-beat `blueprint` fields as priors. Repeat clients' briefs persist in Hermes memory → "same style as your last launch."

## Cost / latency budget

60s reference → ~10–20 shots → 2–3 LLM calls (contact-sheet batching keeps vision cheap) ≈ **$0.10–0.30, 2–4 min** wall clock (whisper ~20s, ffmpeg passes ~30s, LLM the rest). Fits inside the per-job cost target (< $2/video incl. render).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| No hard cuts (continuous-camera refs) | Stage-2 fallback to 2s windows + motion-as-segmenter — already designed in |
| Private/broken video URLs | yt-dlp failure → director asks client for MP4 upload; skill also takes raw files |
| Vision hallucinating structure | Closed vocabularies everywhere (roles, blueprints, moves are enum lists, not free text) |
| Long/irrelevant uploads | 3-min hard cap, refuse with a friendly message |
| Music copyright worry | Reference is only ANALYZED — nothing from it is reused in output |

## Sprint build order (inside hour 13:00–14:30 per battle plan)

1. `scripts/deconstruct.sh` — stages 0–4 (pure ffmpeg/yt-dlp/whisper, all verified tonight) — 25 min
2. Stage 5–7 prompts with closed vocab lists — 15 min
3. `SKILL.md` + wire style-analyst worker to call it — 10 min
4. Test on the 2–3 reference videos downloaded tonight (Linear Releases, Arc Act II, Raycast Focus) — 10 min

**V2 (post-event):** aubio beat grid, optical-flow motion detection, palmier-style color-grade extraction, shot-level SFX identification, side-by-side "reference vs our output" diff report.
