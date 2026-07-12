import argparse
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "src" / "deconstruct.py"
spec = importlib.util.spec_from_file_location("deconstruct", MODULE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Could not load {MODULE_PATH}")
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

class DeconstructUnitTests(unittest.TestCase):
    def test_parse_rate(self):
        self.assertAlmostEqual(module.parse_rate("30000/1001"), 29.970, places=2)
        self.assertEqual(module.parse_rate("0/0"), 0)

    def test_role_progression(self):
        roles = [module.role_for(i, 20) for i in range(20)]
        self.assertEqual(roles[0], "Hook")
        self.assertIn("Key_Feature", roles)
        self.assertEqual(roles[-1], "Brand_Outro")

    def test_continuous_video_uses_windows(self):
        with tempfile.TemporaryDirectory() as temp:
            video = Path(temp) / "continuous.mp4"
            subprocess.run([
                "ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i",
                "color=c=red:s=640x360:d=4", "-c:v", "libx264", str(video)
            ], check=True)
            shots, threshold = module.segment(video, 4.0)
            self.assertIsNone(threshold)
            self.assertEqual([shot["kind"] for shot in shots], ["window", "window"])

class DeconstructIntegrationTests(unittest.TestCase):
    def test_rejects_too_short_reference(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            video = root / "short.mp4"
            subprocess.run([
                "ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i",
                "color=c=red:s=640x360:d=0.2:r=30", "-c:v", "libx264", str(video)
            ], check=True)
            args = argparse.Namespace(
                source=str(video), out=str(root / "out"), max_duration=10, fast=True,
                skip_transcript=True, whisper_model=str(module.DEFAULT_MODEL),
            )
            with self.assertRaises(module.DeconstructionError):
                module.deconstruct(args)

    def test_pipeline_emits_contract(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            video = root / "sample.mp4"
            out = root / "out"
            subprocess.run([
                "ffmpeg", "-y", "-v", "error",
                "-f", "lavfi", "-i", "color=c=red:s=640x360:d=2:r=30",
                "-f", "lavfi", "-i", "color=c=blue:s=640x360:d=2:r=30",
                "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[out]",
                "-map", "[out]", "-c:v", "libx264", str(video),
            ], check=True)
            args = argparse.Namespace(
                source=str(video), out=str(out), max_duration=10, fast=True,
                skip_transcript=True, whisper_model=str(module.DEFAULT_MODEL),
            )
            result = module.deconstruct(args)
            self.assertGreaterEqual(len(result["shots"]), 2)
            self.assertTrue((out / "beats.json").is_file())
            self.assertTrue((out / "BREAKDOWN.md").is_file())
            self.assertTrue((out / "style-brief.md").is_file())
            self.assertTrue((out / "contact-sheet.png").is_file())
            parsed = json.loads((out / "beats.json").read_text())
            self.assertEqual(parsed["meta"]["aspect"], "16:9")

if __name__ == "__main__":
    unittest.main()
