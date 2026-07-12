#!/usr/bin/env python3
"""Deterministic reference-video deconstruction for LaunchReel.

Stages 0-4 and mechanical classification run locally. The companion Hermes skill
uses the emitted contact sheet for the optional vision enrichment pass.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

DEFAULT_MODEL = Path.home() / ".cache/hyperframes/whisper/models/ggml-small.en.bin"
ROLE_ORDER = ["Hook", "Problem", "Product_Intro", "Key_Feature", "Benefits", "Social_Proof", "CTA", "Brand_Outro"]
BLUEPRINTS = {
    "Hook": "kinetic-type-beats",
    "Problem": "comparison-split",
    "Product_Intro": "titlecard-reveal",
    "Key_Feature": "cursor-ui-demo",
    "Benefits": "grid-card-assemble",
    "Social_Proof": "dataviz-countup",
    "CTA": "device-surface-showcase",
    "Brand_Outro": "logo-assemble-lockup",
}

class DeconstructionError(RuntimeError):
    pass

@dataclass
class Probe:
    duration: float
    fps: float
    width: int
    height: int
    aspect: str
    has_audio: bool


def run(cmd: list[str], *, check: bool = True, timeout: int = 240) -> subprocess.CompletedProcess[str]:
    try:
        with tempfile.TemporaryFile(mode="w+t", encoding="utf-8") as stdout_file, \
                tempfile.TemporaryFile(mode="w+t", encoding="utf-8") as stderr_file:
            result = subprocess.run(cmd, text=True, stdout=stdout_file, stderr=stderr_file, timeout=timeout)
            def read_tail(file: Any, limit: int = 1_000_000) -> str:
                file.seek(0, 2)
                size = file.tell()
                file.seek(max(0, size - limit))
                return file.read()
            completed = subprocess.CompletedProcess(cmd, result.returncode, read_tail(stdout_file), read_tail(stderr_file))
    except subprocess.TimeoutExpired as exc:
        raise DeconstructionError(f"Command timed out ({' '.join(cmd[:3])})") from exc
    if check and completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "unknown command failure")[-2000:]
        raise DeconstructionError(f"Command failed ({' '.join(cmd[:3])}): {detail}")
    return completed


def require_tools(names: Iterable[str]) -> None:
    missing = [name for name in names if shutil.which(name) is None]
    if missing:
        raise DeconstructionError("Missing required tools: " + ", ".join(missing))


def is_url(value: str) -> bool:
    return urlparse(value).scheme in {"http", "https"}


def parse_rate(value: str | None) -> float:
    if not value or value in {"0/0", "N/A"}:
        return 0.0
    try:
        return float(Fraction(value))
    except (ValueError, ZeroDivisionError):
        return 0.0


def aspect_label(width: int, height: int) -> str:
    if not width or not height:
        return "unknown"
    divisor = math.gcd(width, height)
    return f"{width // divisor}:{height // divisor}"


def probe_video(path: Path) -> Probe:
    result = run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=index,codec_type,width,height,avg_frame_rate",
        "-of", "json", str(path),
    ])
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    if not video:
        raise DeconstructionError("Input does not contain a video stream")
    width, height = int(video.get("width", 0)), int(video.get("height", 0))
    return Probe(
        duration=float(data.get("format", {}).get("duration", 0)),
        fps=parse_rate(video.get("avg_frame_rate")),
        width=width,
        height=height,
        aspect=aspect_label(width, height),
        has_audio=any(item.get("codec_type") == "audio" for item in streams),
    )


def acquire_input(source: str, workspace: Path) -> Path:
    if not is_url(source):
        path = Path(source).expanduser().resolve()
        if not path.is_file():
            raise DeconstructionError(f"Video not found: {path}")
        return path
    require_tools(["yt-dlp"])
    target = workspace / "source.%(ext)s"
    run([
        "yt-dlp", "--no-playlist", "--max-filesize", "200M",
        "-f", "bv*[height<=720]+ba/b[height<=720]/b",
        "--merge-output-format", "mp4", "-o", str(target), source,
    ])
    candidates = sorted(workspace.glob("source.*"))
    if not candidates:
        raise DeconstructionError("yt-dlp completed without producing a video")
    return candidates[0]


def normalize(source: Path, target: Path) -> None:
    run([
        "ffmpeg", "-y", "-v", "error", "-i", str(source),
        "-vf", "scale=-2:720,fps=30", "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(target),
    ])


def scene_times(path: Path, threshold: float) -> list[float]:
    result = run([
        "ffmpeg", "-hide_banner", "-i", str(path), "-vf",
        f"select='gt(scene,{threshold})',showinfo", "-an", "-f", "null", "-",
    ], check=False)
    found = [float(value) for value in re.findall(r"pts_time:([0-9.]+)", result.stderr)]
    unique: list[float] = []
    for value in found:
        if not unique or value - unique[-1] > 0.15:
            unique.append(value)
    return unique


def boundaries_to_shots(boundaries: list[float], duration: float, kind: str) -> list[dict[str, Any]]:
    points = [0.0] + [t for t in boundaries if 0.12 < t < duration - 0.12] + [duration]
    shots = []
    for t0, t1 in zip(points, points[1:]):
        if t1 - t0 >= 0.12:
            shots.append({"t0": round(t0, 3), "t1": round(t1, 3), "kind": kind})
    return shots


def segment(path: Path, duration: float) -> tuple[list[dict[str, Any]], float | None]:
    best: tuple[list[dict[str, Any]], float | None] = ([], None)
    for threshold in (0.4, 0.3, 0.2):
        shots = boundaries_to_shots(scene_times(path, threshold), duration, "cut")
        if len(shots) > len(best[0]):
            best = (shots, threshold)
        if 4 <= len(shots) <= 40:
            return shots, threshold
    if len(best[0]) >= 3:
        return best
    boundaries = [float(t) for t in range(2, int(math.ceil(duration)), 2)]
    return boundaries_to_shots(boundaries, duration, "window"), None


def extract_frame(video: Path, timestamp: float, target: Path) -> None:
    run([
        "ffmpeg", "-y", "-v", "error", "-ss", f"{max(0, timestamp):.3f}",
        "-i", str(video), "-frames:v", "1", "-vf", "scale=640:-2", str(target),
    ])


def build_keyframes(video: Path, shots: list[dict[str, Any]], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for index, shot in enumerate(shots, start=1):
        t0, t1 = shot["t0"], shot["t1"]
        points = {
            "first": min(t1, t0 + 0.04),
            "mid": (t0 + t1) / 2,
            "last": max(t0, t1 - 0.04),
        }
        for label, timestamp in points.items():
            extract_frame(video, timestamp, out_dir / f"{index:03d}-{label}.png")


def build_contact_sheet(keyframes: Path, target: Path, count: int) -> None:
    rows = max(1, math.ceil(count / 4))
    pattern = str(keyframes / "*-mid.png")
    result = run([
        "ffmpeg", "-y", "-v", "error", "-pattern_type", "glob", "-framerate", "1",
        "-i", pattern, "-vf",
        f"scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:color=111111,tile=4x{rows}",
        "-frames:v", "1", str(target),
    ], check=False)
    if result.returncode != 0:
        mids = sorted(keyframes.glob("*-mid.png"))
        if mids:
            shutil.copy2(mids[0], target)


def extract_audio(video: Path, target: Path) -> None:
    run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000", str(target)])


def transcribe(audio: Path, out_dir: Path, model: Path) -> str:
    if not shutil.which("whisper-cli") or not model.is_file():
        return ""
    prefix = out_dir / "transcript"
    result = run([
        "whisper-cli", "-m", str(model), "-f", str(audio), "-otxt", "-of", str(prefix),
        "-np", "-nt",
    ], check=False)
    transcript_file = prefix.with_suffix(".txt")
    if result.returncode == 0 and transcript_file.exists():
        return transcript_file.read_text(encoding="utf-8", errors="replace").strip()
    return ""


def detect_silences(video: Path) -> list[float]:
    result = run([
        "ffmpeg", "-hide_banner", "-i", str(video), "-af", "silencedetect=noise=-30dB:d=0.25",
        "-f", "null", "-",
    ], check=False)
    return [round(float(value), 3) for value in re.findall(r"silence_start: ([0-9.]+)", result.stderr)]


def energy_curve(video: Path) -> tuple[list[dict[str, float]], float | None]:
    result = run([
        "ffmpeg", "-hide_banner", "-i", str(video), "-af", "ebur128=framelog=verbose", "-f", "null", "-",
    ], check=False)
    entries = []
    for time_s, loudness in re.findall(r"t:\s*([0-9.]+).*?M:\s*(-?[0-9.]+)", result.stderr):
        value = float(loudness)
        if value > -120:
            entries.append({"t": round(float(time_s), 2), "m": value})
    drop = None
    if len(entries) > 1:
        pair = max(zip(entries, entries[1:]), key=lambda p: p[1]["m"] - p[0]["m"])
        if pair[1]["m"] - pair[0]["m"] >= 3:
            drop = pair[1]["t"]
    return entries[::5], drop


def role_for(index: int, total: int) -> str:
    progress = (index + 0.5) / max(1, total)
    if progress < 0.10: return "Hook"
    if progress < 0.27: return "Problem"
    if progress < 0.38: return "Product_Intro"
    if progress < 0.66: return "Key_Feature"
    if progress < 0.79: return "Benefits"
    if progress < 0.89: return "Social_Proof"
    if progress < 0.96: return "CTA"
    return "Brand_Outro"


def classify_arc(shots: list[dict[str, Any]], duration: float) -> str:
    cuts_per_second = max(0, len(shots) - 1) / max(duration, 0.1)
    if shots and all(shot["kind"] == "window" for shot in shots):
        return "demo-loop"
    if cuts_per_second > 0.45:
        return "pain-reveal-rapidfire-sting"
    if duration <= 35:
        return "feature-benefit-cascade"
    return "future-pacing"


def pacing_by_third(shots: list[dict[str, Any]], duration: float) -> list[float]:
    third = duration / 3 if duration else 1
    result = []
    for part in range(3):
        start, end = part * third, (part + 1) * third
        cuts = sum(1 for shot in shots[1:] if start <= shot["t0"] < end)
        result.append(round(cuts / third, 3))
    return result


def make_outputs(source: str, probe: Probe, shots: list[dict[str, Any]], threshold: float | None,
                 transcript: str, silences: list[float], curve: list[dict[str, float]], drop: float | None,
                 out_dir: Path, fast: bool) -> dict[str, Any]:
    enriched = []
    for index, shot in enumerate(shots):
        role = role_for(index, len(shots))
        enriched.append({
            **shot,
            "role": role,
            "blueprint": BLUEPRINTS[role],
            "desc": f"Reference {shot['kind']} segment {index + 1}; vision enrichment {'skipped' if fast else 'pending'}",
            "text_on_screen": [],
            "motion": ["unknown"],
            "audio": {"vo": None, "sfx_cues": []},
        })
    arc = classify_arc(shots, probe.duration)
    vo_mode = "narrated" if len(transcript.split()) >= 12 else ("music-driven" if probe.has_audio else "silent")
    data = {
        "meta": {
            "duration": round(probe.duration, 3), "fps": round(probe.fps, 3),
            "aspect": probe.aspect, "width": probe.width, "height": probe.height,
            "has_audio": probe.has_audio, "source": source, "scene_threshold": threshold,
        },
        "arc": arc,
        "vo_mode": vo_mode,
        "logo_first_s": None,
        "ui_first_s": None,
        "pacing": {
            "cuts_per_sec_by_third": pacing_by_third(shots, probe.duration),
            "drop_s": drop,
            "silences": silences,
            "energy_curve": curve,
        },
        "palette": {"mode": "unknown", "base": None, "accents": []},
        "transcript": transcript,
        "shots": enriched,
    }
    (out_dir / "beats.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
    table = ["| Time | Role | Blueprint | Description |", "|---|---|---|---|"]
    for shot in enriched:
        table.append(f"| {shot['t0']:.2f}–{shot['t1']:.2f}s | {shot['role']} | `{shot['blueprint']}` | {shot['desc']} |")
    breakdown = f"""# Reference video breakdown\n\n## Summary\n\n- Duration: {probe.duration:.2f}s\n- Structure: **{arc}**\n- Mode: **{vo_mode}**\n- Segments: **{len(shots)}**\n- Scene threshold: **{threshold if threshold is not None else 'continuous-camera fallback'}**\n\n## Timeline\n\n{chr(10).join(table)}\n\n## Transcript\n\n{transcript or '_No usable speech transcript detected._'}\n\n## Why it works\n\nThis first-pass report is deterministic. Use the contact sheet with the `video-deconstruct` Hermes skill to enrich composition, text, palette, and motion using the closed vocabulary.\n"""
    (out_dir / "BREAKDOWN.md").write_text(breakdown, encoding="utf-8")
    pacing = ", ".join(str(v) for v in data["pacing"]["cuts_per_sec_by_third"])
    style = f"""# Style brief\n\n## Arc\nUse **{arc}** as the starting structure.\n\n## Pacing directive\n- Reference duration: {probe.duration:.1f}s across {len(shots)} segments.\n- Cuts per second by third: {pacing}.\n- Reveal/drop: {f'{drop:.1f}s' if drop is not None else 'not mechanically detected'}.\n- Preserve the pacing curve, not the source footage.\n- Keep the logo late unless vision enrichment proves otherwise.\n\n## Visual directive\nPalette and type require contact-sheet vision enrichment. Default to the client product’s captured brand tokens.\n\n## Motion motifs\nMap each beat to its listed local blueprint. Replace `unknown` motion only with names from the HyperFrames motion-language vocabulary.\n\n## Audio\nMode: **{vo_mode}**. Silence markers: {silences or 'none detected'}.\n\n## Do / don’t\nDo transfer structure, timing, and motion grammar. Do not reuse copyrighted frames, audio, logos, or copy from the reference.\n"""
    (out_dir / "style-brief.md").write_text(style, encoding="utf-8")
    return data


def deconstruct(args: argparse.Namespace) -> dict[str, Any]:
    require_tools(["ffmpeg", "ffprobe"])
    out_dir = Path(args.out).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="launchreel-") as temp:
        workspace = Path(temp)
        source_path = acquire_input(args.source, workspace)
        source_probe = probe_video(source_path)
        if source_probe.duration < 0.5:
            raise DeconstructionError("Reference must be at least 0.5 seconds long")
        if source_probe.duration > args.max_duration:
            raise DeconstructionError(
                f"Reference is {source_probe.duration:.1f}s; maximum allowed duration is {args.max_duration}s"
            )
        proxy = out_dir / "proxy.mp4"
        normalize(source_path, proxy)
        probe = probe_video(proxy)
        shots, threshold = segment(proxy, probe.duration)
        if not shots:
            raise DeconstructionError("Could not derive any valid video segments")
        build_keyframes(proxy, shots, out_dir / "keyframes")
        contact_sheet = out_dir / "contact-sheet.png"
        build_contact_sheet(out_dir / "keyframes", contact_sheet, len(shots))
        if not contact_sheet.is_file() or contact_sheet.stat().st_size == 0:
            raise DeconstructionError("Contact sheet generation failed")
        transcript, silences, curve, drop = "", [], [], None
        if probe.has_audio:
            audio = out_dir / "audio.wav"
            extract_audio(proxy, audio)
            silences = detect_silences(proxy)
            curve, drop = energy_curve(proxy)
            if not args.skip_transcript:
                transcript = transcribe(audio, out_dir, Path(args.whisper_model).expanduser())
        return make_outputs(args.source, probe, shots, threshold, transcript, silences, curve, drop, out_dir, args.fast)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Deconstruct a launch-video reference into beats and style priors")
    p.add_argument("source", help="Local video path or a URL supported by yt-dlp")
    p.add_argument("--out", required=True, help="Output directory")
    p.add_argument("--max-duration", type=float, default=180)
    p.add_argument("--fast", action="store_true", help="Mark vision enrichment skipped")
    p.add_argument("--skip-transcript", action="store_true", help="Skip local Whisper transcription")
    p.add_argument("--whisper-model", default=str(DEFAULT_MODEL))
    return p


def main() -> int:
    try:
        data = deconstruct(parser().parse_args())
        print(json.dumps({"ok": True, "shots": len(data["shots"]), "arc": data["arc"]}))
        return 0
    except (DeconstructionError, json.JSONDecodeError, OSError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
