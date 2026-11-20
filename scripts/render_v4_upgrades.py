"""
Render upgraded shot ranges from texas_oil_v4_world.blend and assemble final master video.
Shot Ranges:
  - Shot 01 (1..88): Volumetric turbulent gusher + derrick
  - Shot 07 (541..650): 10-story gusher + height ruler arrow
  - Shot 16 (1385..1790): Hero pumpjack alignment + clean sky
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLEND_PATH = ROOT / "production_workspace" / "texas_oil_v4" / "texas_oil_v4_world.blend"
FRAMES_DIR = ROOT / "production_workspace" / "texas_oil_v4" / "frames"
BLENDER_BIN = Path(r"C:\Users\zrajc\blender\blender-5.3.0-windows-x64\blender.exe")

RANGES = [
    (1, 88, "Shot 01: Turbulent Gusher Plume & Spindletop Derrick"),
    (541, 650, "Shot 07: 10-Story Gusher Eruption & Skyscraper Wireframe"),
    (1385, 1790, "Shot 16: Hero Pumpjack Alignment & 28-Unit Panorama"),
]


def render_range(start: int, end: int, label: str) -> None:
    print(f"\n[RENDER] Starting {label} (frames {start}..{end})...")
    out_pattern = str(FRAMES_DIR / "frame_####.png")
    cmd = [
        str(BLENDER_BIN),
        "-b", str(BLEND_PATH),
        "-o", out_pattern,
        "-s", str(start),
        "-e", str(end),
        "-a"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[ERROR] Blender render failed for {label}:\n{res.stderr}")
        sys.exit(1)
    print(f"[SUCCESS] {label} completed cleanly.")


def main():
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    print("=" * 65)
    print("TEXAS OIL V4 — UPGRADED SHOT RENDER SEQUENCE")
    print("=" * 65)

    for s, e, lbl in RANGES:
        render_range(s, e, lbl)

    print("\n[ASSEMBLE] Calling scripts/assemble_texas_oil_v4.py...")
    cmd_ass = [sys.executable, str(ROOT / "scripts" / "assemble_texas_oil_v4.py")]
    res_ass = subprocess.run(cmd_ass, capture_output=True, text=True)
    print(res_ass.stdout)
    if res_ass.returncode != 0:
        print(f"[ERROR] Assembly failed:\n{res_ass.stderr}")
        sys.exit(1)

    print("\n[COMPLETE] V4 Master Video generated successfully!")


if __name__ == "__main__":
    main()
