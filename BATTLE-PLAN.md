# LaunchReel — Hermes Buildathon Battle Plan

**Event:** Hermes Buildathon, Pune · 8-hour sprint (kickoff 10 AM, build ~11 AM–5:30 PM, live demos after)
**Track:** AI as Agency (locked at registration)
**Builder:** Solo (Omkar)
**One-liner:** *An AI launch-video agency for software companies. Paste your product URL + a demo video you wish yours looked like — an agent crew studies both, then renders a 30–60s launch video starring your product's real UI, in the style of your inspiration.*

---

## 1. The idea

Scoped to **software launch videos** (product launches, feature launches) — not general video production. Two inputs on the landing page: the **product URL** and an **inspiration video** (YouTube/X link or MP4 upload). A director agent on Hermes delegates in parallel:

```
                     ┌─────────────────────────┐
   Web landing ────▶ │  DIRECTOR (Hermes,       │ ◀── Telegram admin channel
   (product URL +    │  delegate_task           │     (approvals, escalations)
    inspiration vid  │  role="orchestrator")    │
    + email, pay)    └────────────┬─────────────┘
       ┌───────────┬──────────────┼──────────────┬─────────────┐
       ▼           ▼              ▼              ▼             ▼
  RESEARCHER   STYLE ANALYST  SCRIPTWRITER   VIDEO         PUBLISHER +
  browses URL, yt-dlp/upload  script + beats PRODUCER      COPYWRITER
  Linkup, UI   → ffprobe +    following the  HyperFrames   posts to X (xurl),
  capture via  whisper +      style brief    render: real  MP4 to public URL,
  hyperframes  frame sampling                UI scenes +   launch post, job
  capture      → style brief                 ElevenLabs VO status update
               (pacing, arc,                 + captions
               tone, palette)
```

**The differentiator:** the video stars the client's *actual product UI* (captured from their URL by HyperFrames, composed as HTML scenes — no stock footage), paced and styled after the inspiration video they provided. Nobody else in the room will have output that looks custom-made, because theirs won't be.

- **Job state lives in Convex** (jobs table: url, email, status, script, video_url, paid). The landing page shows live agent progress via Convex reactivity — great demo moment.
- **Client pays ₹199 via Dodo** to unlock HD download / priority queue.
- **The room is the market:** every team needs a demo video for their submission post (the handbook tells all builders to post a demo clip tonight with #HermesBuildathon) and a backup recording for the stage. Sell to them all afternoon.
- **Meta-move:** LaunchReel's own launch video is made by LaunchReel. Its launch post is written and posted by its own copywriter/publisher agents.

**Why this build:** every rubric parameter is engineering-controlled (no dependence on strangers), it uses Hermes differentiators as load-bearing parts (parallel delegation, skills, memory, cron — what judges rewarded in the previous Hermes challenge), and the right-to-win story is real (Artlabs AI video-automation experience, founder marketing pain).

**Graceful degradation:** video is the flagship, not the floor. If rendering fights back, the agency still delivers script + posts + landing copy end-to-end — still a complete AI agency for the root parameter.

---

## 2. Eligibility (Rule 03 — "No Hermes, no score")

Qualify **both** ways:
1. **Coding partner:** Do the build in Hermes sessions (point it at your ported skills). Keep session receipts — mentors scroll them.
2. **Base harness:** The director agent runs ON Hermes (`delegate_task` orchestrator). End users interact with it through the landing page; you drive it via Telegram. Show ≥1 capability doing real work live: subagent delegation + memory recall of a repeat client + a cron job (e.g., 5 PM cron posts the day's stats to X).

---

## 3. Rubric targets & evidence plan (164 base + overflow)

| Parameter | Weight | Target | How to get it | Evidence for mentor |
|---|---|---|---|---|
| Working product shipping real output | 20× | **L4, push L5** | Real deliverables on real surfaces: MP4 at public URL, real X posts, videos delivered to other teams. L5 needs 85%+ success over 3+ runs with exception-only escalation — run 3 clean jobs before judging | Live run during judging; the X posts; delivered videos; job log in Convex |
| **Overflow** | +20/task | **3–6 extra tasks** | Queue other teams' URLs during judging; each completed video/campaign = +20 | Judge watches queue drain live |
| Agent org structure | 5× | **L4** | Director plans per-request (different plans for video-only vs full campaign), reviews outputs, bounces bad drafts back. L5 stretch: director spawns a new specialist type mid-task | Langfuse trace showing two structurally different plans + one revision bounce |
| Observability | 7× | **L4** | Enable in-tree Langfuse plugin: trace tree (who called whom), tokens + cost per step, filter by agent | Open Langfuse, answer "which agent spent most today?" from the tool |
| Evaluation & iteration | 5× | **L3** | Named eval set: 8 test product URLs + checklist (script mentions real features? video renders? captions synced? post has hook?). Run before/after prompt changes, record scores in a sheet. L4 needs CI-blocking — skip unless time | Show the eval set + scores of v1 vs v2 |
| Handoffs & memory | 2× | **L4** | Context flows director→specialists (script → producer → publisher). Hermes memory recalls repeat clients: "same brand voice as your last video" | Re-run a job for a team that already ordered; agent references their earlier order |
| Cost & latency per task | 1× | **L3–L4** | Target < 10 min & < $2/video (MPT is cheap; fal b-roll $1–3; cap b-roll to 2 clips) | Timed live run + cost from Langfuse |
| Management UI | 1× | **L2–L3** | The web dashboard: pause queue, edit voice/style presets, view runs. Don't over-invest — it's 1× | PM-profile volunteer changes voiceover style from UI |

**Realistic base:** ~120–135 pts + 60–120 overflow.

### Power-ups (+150 — do all six, mentor must see each working)
- [ ] **ElevenLabs** — voiceover in every video (load-bearing). *Evidence: live demo.*
- [ ] **Linkup** — researcher agent's live search on the product/company. *Evidence: code + live query.*
- [ ] **Convex** — jobs table is the product state. *Evidence: repo + dashboard.*
- [ ] **Cloudflare** — host landing on CF Pages, store MP4s in R2. (Vercel earns 0; CF earns 25 for the same work. If Next.js on CF fights you, use Vite+React on CF Pages.) *Evidence: live URL + CF dashboard.*
- [ ] **Dodo Payments** — live ₹199 checkout for HD/priority. *Evidence: dashboard + live checkout.*
- [ ] **Wispr Flow** — dictate prompts/scripts all day; 500+ words. *Evidence: stats screenshot.*

### Cross-track bonus (cap 50 — free money, don't chase past the cap)
- **Virality signups (12.5×, max 50):** landing page email + first-use event. ~5 signups = L2-equivalent… realistically other teams + their friends using it gets you 10–25 signups → meaningful bonus. This alone can hit the 50 cap.
- **Revenue (6×/10×):** Dodo payments from other teams = real buyers, passes the removal test. **NEVER take friend/teammate payments — mentors match payer emails against rosters and call buyers; a spoofed number zeroes the parameter.**
- Post your own launch (agent-written) on X + LinkedIn + Instagram for impressions.

---

## 4. Stack decisions (final)

| Layer | Choice | Why / fallback |
|---|---|---|
| Agent harness | **hermes-agent** (MIT), `delegate_task` role=orchestrator, `max_spawn_depth≥2`, `delegation.subagent_auto_approve: true` | The track. Fallback: static routing (still L3 org) |
| Orchestration pattern | Official **creative-kanban-video-orchestrator** optional skill + **oh-my-hermes** dispatcher patterns | Pre-designed director/specialist profiles — legal scaffolding |
| Video render | **HyperFrames** (CLI 0.7.54 + full skill suite in ~/.claude/skills, wired into Hermes as external skills): `website-to-video` / `product-launch-video` skills — real UI capture from the product URL, HTML-composed scenes, deterministic render, cost ≈ cents | Fallback 1: **MoneyPrinterTurbo** (image pulled, config prepped, API boots). Fallback 2: **short-video-maker** (image pulled). Fallback 3: ffmpeg slideshow |
| Inspiration-video analysis | **yt-dlp** (link) or direct upload → **ffprobe** (cuts/duration) + **whisper-cli** (VO transcript) + frame sampling → vision pass → style brief (pacing, structure, tone, palette) | If analysis is flaky: extract only duration + transcript + 3 keyframes — still a usable brief |
| AI b-roll | Hermes in-tree **`video_gen/fal`** plugin (Kling/Veo/Wan), ~$0.05–0.10/s, cap 2 clips/video — garnish only, UI scenes carry the video | Skip b-roll entirely — HyperFrames scenes stand alone |
| Screenshots / UI capture | `hyperframes capture` + Playwright (both verified working) | — |
| Voiceover | **ElevenLabs API** (Creator perk) via hyperframes-media | Fallback: local Kokoro TTS (verified installed — loses power-up, keeps demo) |
| Captions | hyperframes-media (whisper-cli verified) | — |
| Web app | Landing + status page + dashboard on **Cloudflare Pages**, **Convex** backend, MP4s in **R2** | Vercel only if CF deploy is broken (lose +25) |
| Analytics | Datafast or PostHog on landing, **read-only access ready** (visitors uncapped needs this) | — |
| Publisher | Hermes **xurl** skill → X; Dodo payment link | LinkedIn/IG manual paste if API friction |
| Observability | **Langfuse plugin** (in-tree) | Fallback: JSONL log + simple viewer page (still L2–L3) |

**Repos assessed and rejected as base:** videosos (browser editor, not headless — fal integration reference only), Open-Generative-AI (MuAPI-dependent studio UI — but bookmark its linked **Generative-Media-Skills** + **Text-To-Video-AI**), OpenMontage (AGPL, non-deterministic long runs — pipeline design reference only), ShortGPT (dead).

**Own projects (reuse as reference/utilities only — never as the product):** creatorOS_Website (Supabase waitlist pattern → rebuild fresh on Convex), Storytelling Website (GSAP landing polish, if time), CreatorOS capture utils (videoDownload/transcribe patterns), whatsapp-cowork (WhatsApp MCP if a second channel is wanted — low priority). **TipTour/Hermes-for-Noobs is NOT eligible** (pre-existing, May git history) — don't touch it.

---

## 5. Tonight — pre-event checklist (setup ≠ pre-building; keep product code for the floor)

**Rule 05 line:** accounts, installs, credits, dry-runs of *tools* on throwaway content = allowed ("wiring up infra is not pre-building"; standard scaffolding fine). Writing LaunchReel's actual code tonight = not allowed. Stay on the right side; flag anything borderline to a mentor in the morning.

### Accounts & credits (~45 min)
- [ ] Hermes installed + `hermes status` green; provider set (OpenAI credits if you gave org ID at registration, else OpenRouter $10). Provider id is `openai-api`, model `gpt-5.6-sol`
- [ ] Telegram bot via @BotFather + `hermes gateway setup` + test DM
- [ ] fal.ai account + $5 credits; test `hermes plugins enable video_gen/fal` + one tiny generation
- [ ] ElevenLabs: redeem 1-month Creator perk; API key in env; test one TTS call
- [ ] Linkup: claim $50 credits; test one query
- [ ] Convex account; `npx convex dev` once on a scratch project
- [ ] Cloudflare account; deploy a hello-world to Pages once; create an R2 bucket
- [ ] Dodo Payments: redeem perk code from email (subject "Your Dodo Payments perk"), activate account, understand test→live mode toggle
- [ ] Wispr Flow installed (3-month perk), working in your editor
- [ ] Datafast or PostHog account; know how to grant read-only access
- [ ] X account logged in; `xurl` skill auth done (posting rights)

### Hermes porting (~30 min — the handbook's own prompt)
- [ ] `skills: external_dirs: [~/.claude/skills]` in `~/.hermes/config.yaml`
- [ ] Run the handbook's port prompt (commands→skills, MCP→yaml, global CLAUDE.md→SOUL.md/MEMORY.md)
- [ ] `hermes skills browse` shows what you expect; install `creative-kanban-video-orchestrator`
- [ ] Test `delegate_task` with 2 parallel dummy subagents
- [ ] Enable + smoke-test Langfuse plugin (LANGFUSE_* env vars)

### Tool dry-runs on throwaway content (~1 h)
- [x] **HyperFrames doctor all-green** (CLI 0.7.54, whisper-cli, Kokoro TTS, ffmpeg 8.1, headless Chrome, Docker) — primary render path verified
- [x] MoneyPrinterTurbo: image pulled, config.toml prepped (needs Pexels + OpenAI keys), API container boots — fallback ready
- [x] short-video-maker: image pulled — fallback 2 ready
- [x] Playwright: chromium installed, screenshot dry-run passed
- [x] yt-dlp installed (inspiration-video downloads)
- [ ] One junk HyperFrames render end-to-end (30s test composition with Kokoro VO) — needs a working LLM provider or do it by hand
- [x] Inspiration-video analysis dry-run passed: yt-dlp → ffprobe (duration/fps) → scene-cut detection → whisper-cli transcript (model at ~/.cache/hyperframes/whisper/models/) → keyframe extraction

### Logistics
- [ ] Register track: **AI as Agency**
- [ ] Charger, hotspot backup, headphones
- [ ] This file + handbook bookmarked offline

---

## 6. Sprint schedule (build ~11:00–5:30, submit before deadline — NOT last 5 min)

| Time | Goal | Cut line |
|---|---|---|
| 11:00–11:30 | Repo init, Convex schema (jobs), CF Pages hello deploy, Hermes director skill skeleton | — |
| 11:30–13:00 | **Spine first:** URL → researcher (UI capture + Linkup) → script → HyperFrames render with VO + captions → MP4 in R2. Ugly is fine | **13:00: no rendered video → drop to MPT (image ready); 13:45 still stuck → short-video-maker / ffmpeg slideshow** |
| 13:00–14:30 | Style analyst (inspiration video → brief, wired into scriptwriter) + full crew: copywriter + publisher (xurl), director planning/review loop, memory, Langfuse verified | **14:30: style analysis flaky → reduce to duration + transcript + 3 keyframes** |
| 14:30–15:30 | Landing page: URL + inspiration-video (link or upload) form, email capture, live status via Convex, Dodo ₹199 checkout, Datafast snippet | **15:30: Dodo fighting → static payment link; landing ugly → ship anyway** |
| 15:30–16:30 | **Sell to the room.** Walk the floor: "free launch video for your submission post, ₹199 for HD." Run jobs. Post own launch (agent-made) on X/LinkedIn/IG | Feature freeze at 15:30 — evidence > features |
| 16:30–17:15 | Eval set run (8 URLs, record scores), 3 clean back-to-back runs for the L5 claim, backup recording of a full run, power-up evidence sweep (screenshots/dashboards), **submit at growthx.club/hermes-buildathon/submit** | — |
| 17:15– | Demo prep: log into every surface (Convex, Langfuse, Dodo, Datafast, X), rehearse 4 min twice | — |

---

## 7. Demo script (4 min)

- **0:00–0:20 Context:** "Every software launch needs a launch video, and agencies charge lakhs with two-week turnarounds. LaunchReel is an AI launch-video agency — a director and five specialists that turn your product URL plus a video you wish yours looked like into a launch video starring your real UI. It made [N] videos for teams in this room this afternoon, and [M] of them paid."
- **0:20–2:00 Live demo:** Judge gives any product URL + picks an inspiration video → paste both on landing → Langfuse trace on screen: director plans, style analyst reads the inspiration, specialists fan out → script appears → render → play the finished video: *their actual UI*, voiceover, captions, paced like the inspiration → publisher posts to X live. **Edge case:** submit a dead URL → researcher fails → director escalates to Telegram with full context instead of crashing.
- **2:00–3:00 Proof:** Convex jobs table (every job today), Dodo live-mode dashboard (real payments from other teams), Langfuse cost-per-video, Datafast visitors, signups list, the X posts.
- **3:00–4:00 Q&A prep:** Weakest number is task success rate — know it cold: "8 of 9 jobs completed end-to-end; the failure was an SPA the researcher couldn't screenshot; it escalated with context, that run is now eval case #9."

---

## 8. Verification & anti-gotcha prep

- Convex/analytics **read-only access ready before judging** (visitors param is capped at L2 without it)
- No teammate/friend signups or payments anywhere — mentors strike rows, email signups, call buyers
- Keep Hermes session receipts open in a tab (coding-partner eligibility glance)
- Every claimed number must be on a screen you can open in <10 seconds
- If any starting point feels borderline (ported skills, MPT), **flag it in the submission** — honest flags survive, hidden origins auto-DQ

## 9. Top risks & answers

1. **Render pipeline breaks mid-sprint** → four-step ladder, all pre-verified tonight: HyperFrames (doctor green) → MPT (image + config ready) → short-video-maker (image ready) → ffmpeg slideshow. Decision deadlines in schedule — don't debug past a cut line.
1b. **Inspiration video can't be fetched/analyzed** (private link, odd codec) → landing page says "YouTube/X link or MP4 upload"; analysis degrades to duration + transcript + keyframes; worst case director proceeds URL-only and notes it to the client — the job still completes.
2. **fal/ElevenLabs latency spikes** → b-roll capped at 2 clips; edge-tts fallback exists (sacrifices one power-up, not the demo).
3. **Nobody in the room orders** → the free tier is the hook (free SD video for their submission post, pay for HD). Worst case: run jobs on 8 eval URLs — the rubric scores output, not customers.
4. **X API/posting friction** → publisher falls back to "deliver post text + MP4, human clicks post" = still L4 root ("human approves every step").
5. **Solo time crunch** → the spine (URL→video) is the only must-have by 13:00. Everything else stacks on a working spine.
