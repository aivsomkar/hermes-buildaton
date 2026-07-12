# LaunchReel design direction

## Scene
A founder uses LaunchReel at a bright buildathon table while switching between a product tab, a reference video, and a live demo deadline. The UI must read instantly in daylight, feel energetic without neon, and make production progress obvious from several feet away.

## Aesthetic lane
Swiss production slate meets a modern motion-design studio. Strong rules, editorial timing marks, oversized condensed display type, and a warm signal color. Avoid cinematic-black cliché.

## Color strategy
Committed. A warm vermilion signal color carries key actions and progress while a pale mineral canvas keeps the workspace visible in daylight.

- Canvas: oklch(0.965 0.012 80)
- Ink: oklch(0.205 0.018 55)
- Muted ink: oklch(0.47 0.025 60)
- Signal: oklch(0.64 0.205 35)
- Signal dark: oklch(0.49 0.17 32)
- Rule: oklch(0.82 0.018 70)
- Success: oklch(0.57 0.13 145)
- Error: oklch(0.52 0.19 25)

## Typography
Display: Archivo Black, a compressed poster-like voice for the launch promise.
Body and UI: Manrope, a clean humanist family that stays readable in dense job states.
Numeric timing and technical metadata: JetBrains Mono, used sparingly.

## Layout
Use a strict 12-column visible-rule grid on desktop. The intake form occupies the left seven columns; the crew timeline and proof strip occupy the right five. On mobile it becomes a single linear production flow. Vary vertical rhythm; do not place every section in a card.

## Components
- Production slate: the main intake surface with two numbered inputs.
- Crew rail: named stages with timestamps, active-state movement, and deliverable links.
- Reference strip: compact film-frame metadata and pacing facts.
- Primary action: solid signal color, squared 10px radius, no pill buttons.
- Inputs: large, label-first, with visible focus and inline validation.

## Motion
One page-load sequence: grid rules, headline, then production slate. Active crew stages use a restrained horizontal progress sweep. All transforms use ease-out-quint; no bounce or elastic motion.

## Accessibility
Minimum 4.5:1 body contrast, visible keyboard focus, semantic labels, status updates announced with aria-live, and no information encoded by color alone.
