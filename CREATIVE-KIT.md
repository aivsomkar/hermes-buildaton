# LaunchReel Creative Kit

Everything the crew needs to make launch videos that don't look AI-generated. Two halves: what's ALREADY ON THIS MACHINE (use it, don't rebuild it), and what to pull from outside.

---

## 1. The local arsenal (already installed — Hermes sees all of it via external_dirs)

| Need | Where it lives | What's inside |
|---|---|---|
| **Storytelling formats** | `~/.claude/skills/product-launch-video/references/story-design.md` | 5 named arcs with beat orders: **PAS**, **Future Pacing**, **Demo Loop**, **BAB**, **Feature-Benefit Cascade** + a script bank; VO written in proven script shapes |
| **Shot templates** | `product-launch-video` + `hyperframes-animation/blueprints/` | **15 time-coded shot blueprints reverse-engineered from 50 golden launch clips**: kinetic-type-beats, typewriter-reveal, cursor-ui-demo, device-surface-showcase, dataviz-countup, logo-assemble-lockup, grid-card-assemble, constellation-hub, comparison-split, titlecard-reveal, spatial-pan-stations… each with `[slots]` + one signature move |
| **Motion vocabulary** | `product-launch-video/references/motion-language.md` + `hyperframes-animation/rules/` | Named moves → backing rule recipes: word-swap, per-word stagger, kinetic beat-slam, type-on with caret, value-scaled counter, SVG self-draw, push/focus/drift camera, zoom-to-target, cursor tracking… |
| **Cuts & transitions** | `product-launch-video/references/cut-catalog.md`, `hyperframes-animation/transitions/` | Scene-to-scene seams, within-frame swaps |
| **Per-frame build agents** | `product-launch-video/sub-agents/frame-worker.md` | The shot-sequence architecture: one worker per frame — maps 1:1 onto Hermes `delegate_task` specialists |
| **SFX (bundled, zero-credential)** | `hyperframes-media/assets/sfx/` | 21 files: whoosh ×3, impact-bass ×2, riser, sparkle, pop, chime, ping, clicks, key-press, typing, glitch ×3, notification, error. Mix at ~0.35 volume under VO+BGM |
| **Audio engine** | `hyperframes-media/scripts/audio.mjs` | One request file → TTS (HeyGen→ElevenLabs→Kokoro chain) + BGM + SFX + word timestamps for captions |
| **UI polish components** | HyperFrames registry (`hyperframes add <name>`) | `logo-outro` (cinematic logo sting), `shimmer-sweep`, `grain-overlay`, `vignette`, `motion-blur`, `grid-pixelate-wipe`, `morph-text`, `data-chart`, 20+ caption styles |
| **Lottie/Rive search** | `claude-lottie` skill | Brand-coherent confetti/checkmarks/loaders on demand |
| **Asset resolution** | `media-use` skill | One verb (`resolve`) → BGM/SFX/image/icon cascade with a local ledger |
| **Whisper model** | `~/.cache/hyperframes/whisper/models/ggml-small.en.bin` | Already downloaded — transcription works offline |

**Action tonight:** `npx hyperframes auth login` (free HeyGen OAuth) — one login unlocks BGM retrieval + SFX retrieval + word-timestamped TTS. Without it: ElevenLabs TTS + bundled SFX still work; BGM needs the pack below.

---

## 2. Storytelling blueprints (from analysis of Linear / Arc / Raycast / Apple / Vercel / PH launches)

Conventions that hold across all of them: pain-first opens convert ~22% better than logo-first; value prop must land inside 10s; something new on screen every 3–5s; logo arrives LATE (tiny corner watermark only, in feature videos); every scene change lands on a musical beat; end card holds 2–3s and loops back to shot 1; assume sound-off viewing — all copy on screen.

**A. Pain → Reveal → Rapid-Fire → Sting** (product launches, 45–60s — the Product Hunt classic)
0–5s cold open on pain, text only, riser building → 5–8s beat-drop product reveal (spring scale 92→100%, first bass hit HERE) → 8–32s three feature hits (~8s each: 1s label → 5–6s real UI with zoom-to-click → 1s result) → 32–40s momentum montage (4–8 cuts, 0.5–1s each) → 40–48s social proof (logo wall / count-up / tweet card), music thins → 48–60s CTA + logo sting + URL, hold 2–3s.

**B. Single-Thread Demo** (FEATURE launches, 30–45s — Linear/Screen Studio format)
0–3s "Introducing [Feature]" card over dimmed UI (product visible at 0:00 — audience knows it) → 3–28s ONE continuous workflow, no cuts, the camera does the editing (pan/zoom follows every click, 150–200% on the key interaction), click SFX per press → 28–35s outcome frame held + one line of copy → 35–40s lockup + "Available today". Low cut-rate is the point — this is how feature differs from product launch.

**C. Manifesto Open** (category-defining, 60s — Arc/Apple)
0–12s thesis in type, 3–4 declarative lines, no UI → 12–15s the turn + **0.3–0.5s of near-silence right before the reveal** (the most reliable trick in the genre) → 15–22s hero reveal SLOW (2–3s scale-in, glow bloom, music opens) → 22–45s 3–4 calm feature hits (6s each) → 45–55s zoom-out to bento composition of floating panels → 55–60s logo LAST, once, + date.

**D. Before/After Split** (30s teaser)
0–6s the old way, deliberately ugly (desaturated, cluttered, tense) → 6–8s snap transition + impact hit + color floods to brand palette → 8–24s two feature hits, springy and confident → 24–30s CTA card, one verb.

**E. Metric Hook** (30–45s, quantifiable payoff)
0–4s giant number counts full-frame ("6 hours" → "6 minutes"), tabular-nums, tick SFX accelerating → 4–8s context line + reveal → 8–30s the mechanism (2–3 UI moments) → 30–40s the number returns beside the logo (callback).

**Selection rule for the style analyst:** inspiration video is feature-of-known-product-shaped → B; brand-new product → A; big vision language → C; has a hero metric → E; ad-cut → D. Map to the local arcs: A≈PAS, B≈Demo Loop, C≈Future Pacing, D≈BAB, E≈Feature-Benefit/dataviz-countup.

---

## 3. Motion/VFX vocabulary (2024–26 SaaS launch house style, with implementation hints)

1. **Screen-Studio virtual camera** — whole UI in a wrapper; `gsap.to(cam, {scale:1.8, x:-420, y:-180, dur:1.1, ease:"power3.inOut"})`; 100% establish → 150–200% interaction → 100% result. Never linear.
2. **Cursor choreography** — fake cursor on curved paths, 0.6–1s per move, `power2.out` arrival, scale 0.85 on click + radial ripple (scale 0→2.5, fade, 0.4s).
3. **Critically-damped springs** — `back.out(1.4–1.7)` on entrances; no bounce on large panels, tiny bounce on buttons/badges/toasts.
4. **Staggered cascade** (THE Linear signature) — stagger 0.05–0.08, y 12–24→0, fade, 0.5s. Nothing arrives all at once.
5. **Parallax device float** — `perspective:1200px; rotateX(8deg) rotateY(-6deg)`, slow yoyo drift, satellite cards at different translateZ depths.
6. **Text kinetics** — masked line reveals (`yPercent:110→0`, overflow hidden), word-slot flips, and blur-in (`blur(8px)→0`) for the premium look.
7. **Count-ups** — GSAP snap + `font-variant-numeric: tabular-nums` (no digit jitter); slot-machine rolls for flair.
8. **The dark glow stack** — #0A0A0B base (never pure black), blurred radial brand-hue blobs (blur 120px, 15–25% opacity) drifting behind content, 1px `rgba(255,255,255,.08)` borders, text #EDEDED, animated conic border beams on hero cards.
9. **Bento grid** — asymmetric feature-card grid; cards spring in staggered; camera zooms INTO one cell as the transition to that feature's beat.
10. **Mask/clip reveals** — `clip-path inset()` wipes; circular expansion from the click point for scene changes.
11. **Sheen sweep** — one 45° gradient strip across the end card, 0.8s (registry: `shimmer-sweep`).
12. **Glass toasts** — spring in + `backdrop-filter: blur(20px)` to dramatize product events ("Deploy complete ✓").
13. **Speed ramp** — montage 0.5–1s shots, proof 4–6s shots, never medium; every cut on a beat.
14. **Grain + vignette** — noise at 3–5% opacity + soft vignette = the single cheapest fix for the "flat HTML" look (registry: `grain-overlay`, `vignette`).
15. **Fake motion blur** — 2–3 frames of `blur(4px)` + scaleX stretch on fast wipes (registry: `motion-blur`).

---

## 4. External assets (commercial-safe, download tonight)

| Category | Source | License |
|---|---|---|
| SFX beyond the bundled 21 | Pixabay SFX · Mixkit · Freesound (**CC0 filter only**) · ZapSplat CC0 section | all free commercial, no attribution |
| **BGM** (insurance vs no-HeyGen) | Pixabay Music ("electronic/corporate/tech") · Mixkit Music · YT Audio Library (non-CC-BY only) | free commercial |
| Browser/device chrome | **css-device-frames** (MIT, CSS-only, themeable) · ScreenshotFrames · html5-device-mockups · or DIY: 3 traffic lights + toolbar ≈ 20 lines CSS | MIT |
| Icons | **Lucide** (the shadcn/SaaS default) · Heroicons · Phosphor (6 weights) · Tabler · **Simple Icons** (CC0 brand logos for logo walls) | ISC/MIT/CC0 |
| Illustrations | unDraw (recolorable SVG) | open |
| Lottie | LottieFiles free (Lottie Simple License — fine once rendered to MP4) · useAnimations | free commercial |
| Fonts | **Inter/Inter Display** (Linear's voice) · **Geist Sans/Mono** (Vercel's, OFL) · Space Grotesk · Manrope · JetBrains Mono/IBM Plex Mono (terminal beats) · Satoshi/General Sans/Cabinet Grotesk via Fontshare (the "premium startup" look) | OFL/ITF free |

Gotchas: don't redistribute Pixabay/Mixkit files standalone (fine inside rendered video); Freesound must be CC0-filtered per file.

**Tonight's asset pack (`~/Desktop/hermes-buildathon/assets/`):** 4–6 BGM tracks (2 driving electronic, 2 ambient tech, 1 warm), Inter + Geist + Space Grotesk + JetBrains Mono woff2, Lucide SVG sprite, css-device-frames CSS, 2 Lottie files (confetti, checkmark).

---

## 5. Reference videos (style-analysis test inputs — download 2–3 tonight)

1. **Linear — Introducing Linear Releases** — youtube.com/watch?v=6dIwFoQ0eVg — gold standard Blueprint B (their whole channel + X account = your format)
2. **Arc — Intro & First Look** — youtube.com/watch?v=QsCNcqdHVrc — manifesto product launch (C)
3. **Arc — Meet Act II** — youtube.com/watch?v=WIeJF3kL5ng — study the silence-before-reveal beat
4. **Arc Max launch** — youtube.com/watch?v=y7koAGLf0EE — rapid multi-feature format
5. **Raycast — Introducing Raycast Focus** — youtube.com/watch?v=NZwqx_dS-k0 — keyboard-driven UI choreography (B)
6. **Vercel Ship 2024 keynote opener** — youtube.com/watch?v=CHP3aDTP5Qo — dark/glow/gradient motion language
7. **Screen Studio homepage demo** — screen.studio — the canonical smooth-zoom/cursor grammar
8. Any recent Apple event product film — beat-drop timing, "available today" closers, bento recap

Linear and Raycast post tighter 30s native cuts on X — closest analogs to LaunchReel output.

**Downloaded and deconstructed** (see `REFERENCE-BREAKDOWNS.md` for full beat tables): `assets/reference-videos/` has linear-releases, arc-act2, raycast-focus, plus three real X launch videos analyzed shot-by-shot — Inkbox.ai (live-action skit + AR overlays), Glass Health (textbook narrated PAS hybrid), and **motion.so (chat-as-cinema — the format LaunchReel's own launch video should use, and a competitor to have an answer for)**.
