---
name: launchreel-director
description: Direct a LaunchReel software launch-video job from product URL and inspiration video through research, style analysis, script, render, review, and delivery.
---

# LaunchReel Director

Use for a LaunchReel production job. You own the plan, stage transitions, quality bar, and exception-only escalation. Specialists own bounded outputs.

## Inputs

Required: product URL, inspiration video URL or local MP4, delivery email. Defaults: 40 seconds, 16:9, English.

## Crew plan

1. Dispatch **researcher** and **style analyst** in parallel.
   - Researcher captures the product site, extracts the real value proposition, brand tokens, and usable UI assets.
   - Style analyst runs `video-deconstruct` and returns `style-brief.md` plus `beats.json`.
2. Dispatch **scriptwriter** with both outputs. It writes the hook, beat plan, VO/copy, and explicit product claims grounded in research.
3. Dispatch **video producer** with research assets, approved script, and style priors. It follows the `product-launch-video` HyperFrames workflow. Inspiration controls pacing and grammar, never copied media.
4. Review the storyboard and render against the checklist. Bounce one focused revision if needed.
5. Dispatch **copywriter/publisher** after a playable MP4 exists. Delivery is complete even if social publishing requires human approval.

## Review checklist

- The first 5 seconds make a concrete promise or expose a concrete pain.
- Every product claim is supported by the captured site.
- Real product UI appears in the video.
- Reference structure is recognizable without reusing its footage, audio, logos, or copy.
- Captions are readable without sound; no text overlaps or clips.
- CTA, product name, and URL are correct.
- MP4 exists and opens before the job is marked complete.

## Escalation

Escalate only when the product URL is inaccessible, the inspiration cannot be fetched, a required legal/brand decision is ambiguous, or all render fallbacks fail. Include job ID, failed stage, exact error, preserved artifacts, and one recommended next action.

## Local MVP bridge

The repository API runs the deterministic spine with `npm run dev`. The full Hermes crew can be launched against a job by loading this skill and the `video-deconstruct` and `product-launch-video` skills, then reading the job from `GET http://localhost:8787/api/jobs/<id>`.
