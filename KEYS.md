# LaunchReel — API keys guide

Copy `.env.example` → `.env` (gitignored) and fill in. The pipeline degrades gracefully:
every key is optional except that you want at least Lumenfall OR nothing (HyperFrames-only render).

## Render quality keys (fill these first)

| Key | Where to get it | What it unlocks | Without it |
|---|---|---|---|
| `LUMENFALL_API_KEY` | lumenfall.ai dashboard | AI-generated cinematic hook shot (model auto-selected: kling-v3 / veo-3.1-fast / sora-2 / pixverse per style, ≤$2.50 cap per job) | Graphic-only hook (brand gradient + kinetic type) |
| `LUMENFALL_MODEL` | — | `auto` (recommended) or force one model id | auto |
| `ELEVENLABS_API_KEY` | elevenlabs.io → Profile → API keys (redeem the buildathon Creator perk) | Premium voiceover | Local Kokoro TTS (still narrated, robotic-ish) |
| `ELEVENLABS_VOICE_ID` | elevenlabs.io Voice Library → copy voice ID | Voice choice | Rachel (`21m00Tcm4TlvDq8ikWAM`) |
| `LINKUP_API_KEY` | app.linkup.so (claim the $50 buildathon credit) | Company research (what they do, philosophy) woven into the script | Script uses only on-page copy |

## Production / control-plane keys (needed for the deployed product, not local demo)

| Key | Where to get it | Used by |
|---|---|---|
| `CONVEX_DEPLOYMENT`, `CONVEX_DEPLOY_KEY` | Convex dashboard → Settings → Deploy keys | `npx convex deploy`, Vercel build |
| `VITE_CONVEX_URL` | Convex dashboard → Deployment URL (`https://….convex.cloud`) | Web app live job status |
| `CONVEX_SITE_URL` | Same deployment, `.convex.site` domain | Worker HTTP endpoints + Dodo webhook URL |
| `WORKER_SHARED_SECRET` | Generate: `openssl rand -hex 24` | Authenticates the render worker to Convex `/worker/*` — set it in BOTH Convex env vars and worker `.env` |
| `SOURCE_BLOB_READ_WRITE_TOKEN` | Vercel dashboard → Storage → Blob (private store) | Inspiration uploads from the browser |
| `OUTPUT_BLOB_READ_WRITE_TOKEN` | Vercel → Storage → Blob (public store) | Publishing finished MP4s + public screenshot URLs (enables image-to-video hook via kling-v3) |

## Payments (Dodo)

| Key | Where | Notes |
|---|---|---|
| `DODO_PAYMENTS_API_KEY` | Dodo dashboard → Developer → API keys | Start in **test_mode** |
| `DODO_PAYMENTS_WEBHOOK_KEY` | Dodo → Developer → Webhooks → create endpoint `https://<deployment>.convex.site/webhooks/dodo` | Signature verification |
| `DODO_HD_PRODUCT_ID` | Dodo → Products → create "HD Launch Video ₹199" | The checkout product |
| `DODO_PAYMENTS_ENVIRONMENT` | — | `test_mode` until judging; flip to `live_mode` for real sales |

## Where each key lives

- **Local demo:** everything in `.env` at repo root.
- **Vercel (web + blob upload API):** `VITE_CONVEX_URL`, `SOURCE_BLOB_READ_WRITE_TOKEN`, `CONVEX_DEPLOY_KEY`.
- **Convex (server env vars):** `WORKER_SHARED_SECRET`, `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY`, `DODO_PAYMENTS_ENVIRONMENT`.
- **Render worker (this machine):** `WORKER_SHARED_SECRET`, `LUMENFALL_*`, `ELEVENLABS_*`, `LINKUP_API_KEY`, `OUTPUT_BLOB_READ_WRITE_TOKEN`.

Never prefix a secret with `VITE_` — those are compiled into the public bundle.
