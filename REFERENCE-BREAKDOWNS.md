# Reference breakdowns — 3 real X launch videos (analyzed 2026-07-12)

Manual deconstructions (probe → cuts → whisper → contact sheet → visual read). These three are the style targets; files + analysis artifacts in `assets/reference-videos/`.

---

## 1. Inkbox.ai (@rayruizhiliao) — "Live-Action Skit + AR Overlays"
104s · 1080p · 13 hard cuts · dialogue-driven (skit, not narration)

| Time | Beat | What's on screen |
|---|---|---|
| 0–8 | **Skit cold open + credibility** | Founder on a retro purple landline: "Claude, you there? Text all my friends — we joined Y Combinator." Giant purple kinetic type "CLAUDE" over footage; YC logo card at 0:02 |
| 8–31 | **Scenario 1 (the product working, as fiction)** | AI agent phone-calls Sarah (actor, on street) about a double-charge bug; she debugs by voice; iMessage bubbles float AR-style over live shots |
| 31–48 | **Product intro** | "Installed with one command" (single laptop UI moment); agent gets email/phone/iMessage/URL; founders hold purple phones across locations; giant type "PHONE", "ANYWHERE" |
| 48–70 | **Scenario 2 (deeper capability)** | Thumb-POV iMessage shots: voice memos to the agent → PR opened → Stripe refund → customer emails |
| 70–86 | **Resolution** | Office scene; "Bug Fix Report" notification lands; agent dashboard on laptop |
| 86–104 | **Founders direct-to-camera + sting** | Three founders on a bench, launch manifesto VO, giant "inkbox.ai" type closer |

**Steal:** product proven inside a story, not a feature tour · keywords as giant kinetic type OVER footage · UI as floating AR overlays, never screen recordings · credibility badge in the first 3 seconds · humans at the end. **Not reproducible by us** (needs actors) — but the AR-overlay + giant-type grammar IS.

## 2. Glass Health (@GlassHealthHQ) — textbook narrated PAS hybrid
84s · 720p · 44 cuts (fast!) · fully VO-driven · LIGHT mode (health = clean white)

| Time | Beat | What's on screen |
|---|---|---|
| 0–5 | **Hook** | "Your health is everything…" X-ray + giant "EVERYTHING" type |
| 5–25 | **Pain montage** (5 pains × ~4s, ~2s/cut) | Live footage (MRI, wearables, record clutter, confused 2am search, rushed doctor) + floating data callouts (CGM 108, BP 142) |
| 25–33 | **Agitation climax** | Emotional shot (anxious hands), symptom labels floating; music tense |
| 33–35 | **The turn** | "Glass changes that." — logo card on white, breather beat |
| 35–52 | **Mechanism** | Clean UI push-ins: chat + 3D body viz, health timeline, trend cards |
| 52–61 | **Proof** | "120,000+ Doctors" stat card · "most accurate medical AI" · Harvard-Stanford eval bars |
| 61–75 | **Demo loop** | Typed real questions → answer cards; daily check-ins as overlays on life footage |
| 75–84 | **CTA** | "Create a profile… free today" → logo + URL pill (glass.health) |

**Steal:** the 40%-mark turn ("X changes that" + logo card breather) · data callouts floating on footage · pain montage at ~2s/cut vs proof at 4–6s · stat cards as their own beats · URL pill end card. Maps 1:1 to our Blueprint A / PAS arc — this is the shape our crew should default to for product launches.

## 3. motion.so (@_adishj) — "Chat-as-Cinema" ★ the money format
45s · 1440p · 13 cuts · **music-only, zero VO** · off-white canvas, depth-of-field camera

| Time | Beat | What's on screen |
|---|---|---|
| 0–6 | **Chat hook** | User bubble types "yo. what are we making?" — camera racks focus between bubbles on a blurred plane |
| 6–15 | **Scenario 1** | "what's trending on tech twitter?" → agent task chips tick (✓ X searched · ✓ 31 posts read) → "3 things are blowing up" list → "lets go with the fable 5 one" → "do you have assets?" → ✓ Pulling brand assets → "found them. starting the video." |
| 15–21 | **Output reveal (video-in-video)** | Hard cut to the PRODUCED launch video: black FABLE 5 title cards — "SMARTER." — then back to chat |
| 21–32 | **Scenario 2 (integration beat)** | "check the feature we shipped last week @github" → ✓ 13 PRs checked → "I found these PRs. wanna make a video?" |
| 32–42 | **Scenario 3 (integration beat)** | "sprint planning @notion" → ✓ Workspace read / ✓ Sprint mapped → "do you want me to make a video?" → "yeah" |
| 42–45 | **Sting** | "Talk to Motion." → motion.so logo on black |

**Steal everything.** This format is 100% buildable in HyperFrames HTML: chat bubbles + task-status chips + camera pans with DOF blur + one video-in-video reveal. No VO to record, no footage to shoot. Three-scenario loop = Demo Loop arc. Integration @-chips are the feature beats.

---

## Decisions this forces

1. **LaunchReel's own launch video should be the motion.so format** — the meta-story writes itself: the director agent's chat ("paste a URL + an inspiration video" → task chips → video-in-video reveal of a client video we made). Fully HTML, buildable by our own crew — the strongest possible proof.
2. **Default arcs by job type:** product launch → Glass shape (PAS hybrid); feature launch → Single-Thread Demo; when client's inspiration is a skit film (Inkbox-style) → we adapt its *grammar* (giant type, AR overlays, story beats) onto UI footage, and say so in the style brief.
3. **Competitor awareness: motion.so exists and does chat→launch-video.** Judges may know it. Our differentiation to state out loud: (a) full agency crew on Hermes with real org/observability/evals — not a single tool; (b) **inspiration-video style transfer** (deconstructor skill) — "make it like THIS" is our unique input; (c) real UI capture from the client's URL. This also answers "why now" and validates the market — rehearse this answer for Q&A.
4. These three MP4s are the deconstructor skill's test set (spec §sprint build order) — expected outputs are now known, so testing the skill = diffing against these tables.
