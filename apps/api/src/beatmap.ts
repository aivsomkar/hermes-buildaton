import type { ReferenceBeats } from "./compose.js";

export interface ReferenceShot {
  t0: number;
  t1: number;
  role?: string;
  blueprint?: string;
}

export interface FullBeats extends ReferenceBeats {
  shots?: ReferenceShot[];
}

export interface BeatMapAct {
  role: string;
  blueprint: string;
  referenceSpan: string;
  targetStart: number;
  targetSeconds: number;
}

export interface BeatMap {
  referenceSeconds: number;
  targetSeconds: number;
  /** Which third of the film cuts fastest in the reference: rank order, e.g. [2,1,3]. */
  paceRankByThird: number[];
  cutsPerSecondByThird: number[];
  acts: BeatMapAct[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Compress the reference's measured beat structure onto the target duration.
 * This is the skeleton the director MUST follow — the reference relationship
 * is enforced by code, not by prose.
 */
export function buildBeatMap(beats: FullBeats): BeatMap | null {
  const shots = beats.shots ?? [];
  const referenceSeconds = beats.meta?.duration ?? 0;
  if (shots.length < 2 || referenceSeconds <= 5) return null;
  const targetSeconds = Math.min(45, Math.max(28, referenceSeconds));

  // Merge consecutive shots that share a beat role into acts.
  const acts: Array<{ role: string; blueprint: string; start: number; end: number }> = [];
  for (const shot of shots) {
    const role = shot.role ?? "Beat";
    const last = acts[acts.length - 1];
    if (last && last.role === role) last.end = shot.t1;
    else acts.push({ role, blueprint: shot.blueprint ?? "titlecard-reveal", start: shot.t0, end: shot.t1 });
  }

  // Proportional compression with per-act clamps, then renormalize.
  const raw = acts.map((act) => Math.min(9, Math.max(2.5, ((act.end - act.start) / referenceSeconds) * targetSeconds)));
  const scale = targetSeconds / raw.reduce((a, b) => a + b, 0);
  let cursor = 0;
  const mapped: BeatMapAct[] = acts.map((act, index) => {
    const seconds = round1((raw[index] ?? 3) * scale);
    const entry: BeatMapAct = {
      role: act.role,
      blueprint: act.blueprint,
      referenceSpan: `${act.start.toFixed(1)}-${act.end.toFixed(1)}s`,
      targetStart: round1(cursor),
      targetSeconds: seconds,
    };
    cursor += seconds;
    return entry;
  });

  const cuts = beats.pacing?.cuts_per_sec_by_third ?? [];
  const paceRankByThird = cuts
    .map((value, index) => ({ value, third: index + 1 }))
    .sort((a, b) => b.value - a.value)
    .map((entry) => entry.third);

  return {
    referenceSeconds: round1(referenceSeconds),
    targetSeconds: round1(cursor),
    paceRankByThird,
    cutsPerSecondByThird: cuts.map((c) => Math.round(c * 100) / 100),
    acts: mapped,
  };
}

export interface Conformance {
  ok: boolean;
  notes: string[];
  outputSeconds: number;
  outputCutsByThird: number[];
}

/** Compare a rendered film's measured pacing against the beat map. */
export function checkConformance(beatMap: BeatMap, output: FullBeats): Conformance {
  const notes: string[] = [];
  const outputSeconds = output.meta?.duration ?? 0;
  const outputCuts = output.pacing?.cuts_per_sec_by_third ?? [];

  const durationDelta = Math.abs(outputSeconds - beatMap.targetSeconds) / beatMap.targetSeconds;
  if (durationDelta > 0.25) {
    notes.push(`Duration ${outputSeconds.toFixed(1)}s deviates ${(durationDelta * 100).toFixed(0)}% from the ${beatMap.targetSeconds}s beat-map target`);
  }

  const outputRank = outputCuts
    .map((value, index) => ({ value, third: index + 1 }))
    .sort((a, b) => b.value - a.value)
    .map((entry) => entry.third);
  if (beatMap.paceRankByThird.length === 3 && outputRank.length === 3 && beatMap.paceRankByThird[0] !== outputRank[0]) {
    notes.push(`Reference is fastest in third ${beatMap.paceRankByThird[0]}, output is fastest in third ${outputRank[0]} — the pacing shape was not transferred`);
  }

  return {
    ok: notes.length === 0,
    notes,
    outputSeconds: round1(outputSeconds),
    outputCutsByThird: outputCuts.map((c) => Math.round(c * 100) / 100),
  };
}
