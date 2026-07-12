# LaunchReel

LaunchReel is an AI launch-video agency for software teams: paste a product URL plus an inspiration video, and an agent crew researches the product, deconstructs the reference frame by frame, writes the script and storyboard, and renders a 30–45s launch film starring the product's **real UI** — narrated, brand-colored, with an AI-generated cinematic hook shot.

## Architecture

```
New Convex job
      ↓
Render worker claims job (lease + heartbeat)
      ↓
Hermes Director (hermes -z · fallback: claude -p · fallback: deterministic storyboard)
      ├── analyzes product capture (hyperframes capture: screenshots, tokens, copy)
      ├── interprets reference breakdown (video-deconstruct: beats, arc, pacing)
      ├── creates script and storyboard (validated creative-plan JSON)
      ├── chooses visual treatments and narrator style
      ├── plans Lumenfall shots (model auto-selected, $2.50 cap)
      └── directs the HyperFrames composition
      ↓
Deterministic renderer executes the plan
  (VO: ElevenLabs → Gemini → Kokoro · hook renders in parallel with narration)
      ↓
Final MP4 → Vercel Blob → job completed
```

Division of labor: **Hermes** reasons and directs; **Convex** owns queues, durable state, progress, retries, leases, webhooks; the **worker** executes commands and renders media; **HyperFrames** creates the composition; **Lumenfall** generates selected shots; **ElevenLabs/Gemini/Kokoro** create narration; **Vercel Blob** stores source and output media. The same pipeline also runs fully locally behind the Fastify API (`npm run dev`) with `data/jobs.json` as the store.

Run the production worker: `npm run worker -w @launchreel/api` (needs `CONVEX_SITE_URL`, `WORKER_SHARED_SECRET`, blob tokens — see [KEYS.md](KEYS.md)).

## Run locally

Requirements: Node.js 20+, Python 3.9+, FFmpeg, FFprobe, yt-dlp, and optional `whisper-cli`.

```bash
cd /Users/omkar/Desktop/hermes-buildathon
npm install
npm run dev
```

Open:

- Web app: http://localhost:5173
- API health: http://localhost:8787/api/health

Vite is explicitly bound to `0.0.0.0`, so `http://127.0.0.1:5173` also works.

## Current production flow

1. `POST /api/jobs` accepts a public product URL, an uploaded video, and output format. Remote inspiration URLs are intentionally disabled in this local security boundary.
2. The researcher derives a safe local preview identity from the product hostname; live page research awaits the production network policy.
3. `video-deconstruct` normalizes and probes the upload, identifies shots or continuous-camera windows, extracts audio and keyframes, detects pacing/silence, and emits style priors.
4. The scriptwriter creates a 12-second preview script from the product identity and reference pacing.
5. The fallback renderer creates a playable MP4 from SVG-generated title cards. It does not rely on FFmpeg's optional `drawtext` filter.
6. Job state and attempt-specific artifact URLs update through the API for live polling in the web app.

The fallback renderer proves the complete job lifecycle. The next render adapter is HyperFrames, which will replace title cards with captured real product UI, voiceover, captions, and motion based on the generated style brief.

## API

### Create with an uploaded video

The API is localhost-only and accepts uploaded references only:

```bash
curl -X POST http://127.0.0.1:8787/api/jobs \
  -F 'productUrl=https://example.com' \
  -F 'video=@/absolute/path/reference.mp4;type=video/mp4' \
  -F 'format=landscape'
```

### Read a job

```bash
curl http://localhost:8787/api/jobs/<job-id>
```

Artifacts are served from `/runs/<job-id>/...`.

## Video deconstructor

```bash
./skills/video-deconstruct/scripts/deconstruct.sh \
  /absolute/path/reference.mp4 \
  --out /tmp/reference-analysis \
  --fast
```

Output:

- `beats.json`
- `BREAKDOWN.md`
- `style-brief.md`
- `contact-sheet.png`
- `keyframes/`
- extracted audio/transcript when available

## Verification

```bash
npm test
npm run build
```

The test suite covers input validation, job creation, the no-`drawtext` render regression, continuous-camera segmentation, and the full deconstructor output contract.

## Important paths

- Web app: `apps/web/`
- API and runner: `apps/api/`
- Deconstructor engine: `packages/video-deconstruct/`
- Hermes deconstructor skill: `skills/video-deconstruct/`
- Hermes director skill: `skills/launchreel-director/`
- Runtime outputs: `runs/` (gitignored)
