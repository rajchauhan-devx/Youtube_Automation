"""
Assembles rendered 720x1280 24fps PNG frames + Edge Neural narration + subtle background music
+ bold Zack D. Films-style burned-in captions into PRETRAINED_BLENDER_DEMO.mp4.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMO_DIR = ROOT / "production_workspace" / "pretrained_demo"
FRAMES_DIR = DEMO_DIR / "frames"
AUDIO_PATH = DEMO_DIR / "narration.mp3"
SRT_PATH = DEMO_DIR / "captions.srt"
BGM_PATH = ROOT / "server" / "assets" / "music" / "cinematic-pulse.mp3"
OUT_MP4 = ROOT / "PRETRAINED_BLENDER_DEMO.mp4"


def main() -> None:
    frames = sorted(FRAMES_DIR.glob("frame_*.png"))
    if not frames:
        raise FileNotFoundError(f"No rendered frames found in {FRAMES_DIR}")
    print(f"[ASSEMBLE] Found {len(frames)} rendered frames.")

    # Escape Windows path for ffmpeg subtitles filter (forward slashes + escaped drive colon)
    srt_escaped = SRT_PATH.as_posix().replace(":", r"\:")
    sub_style = (
        "FontName=Arial,FontSize=18,Bold=1,PrimaryColour=&H00FFFFFF,"
        "OutlineColour=&H00000000,BackColour=&H64000000,BorderStyle=1,"
        "Outline=2,Shadow=1,Alignment=2,MarginV=75"
    )
    vf = f"subtitles='{srt_escaped}':force_style='{sub_style}'"

    cmd = [
        "ffmpeg", "-y",
        "-framerate", "24",
        "-i", str(FRAMES_DIR / "frame_%04d.png"),
        "-i", str(AUDIO_PATH),
    ]
    if BGM_PATH.exists():
        cmd += [
            "-stream_loop", "-1", "-i", str(BGM_PATH),
            "-filter_complex",
            "[1:a]volume=1.15[vo];[2:a]volume=0.14[bg];[vo][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]",
            "-map", "0:v", "-map", "[aout]",
        ]
    else:
        cmd += ["-map", "0:v", "-map", "1:a"]

    cmd += [
        "-vf", vf,
        "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        str(OUT_MP4),
    ]
    print("[FFMPEG] Running:", " ".join(cmd))
    subprocess.check_call(cmd)
    print(f"[DONE] Final video ready -> {OUT_MP4} ({OUT_MP4.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
