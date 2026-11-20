"""
Assembles the 1,790 rendered 720x1280 24fps PNG frames from texas_oil_v2
with the exact reference audio track (74.58s) and synced Mildly Elsewhere captions
into TEXAS_OIL_RECREATION_V2.mp4.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "production_workspace" / "texas_oil_v2"
FRAMES_DIR = OUT_DIR / "frames"
AUDIO_PATH = ROOT / "scratch" / "user_ref_video" / "audio.wav"
if not AUDIO_PATH.exists():
    AUDIO_PATH = ROOT / "audio.wav"
OUT_MP4 = ROOT / "TEXAS_OIL_RECREATION_V2.mp4"

# Exact timed captions matching the 74.58s Mildly Elsewhere reference audio
SUBTITLES = [
    (0.0, 1.8, "If you drill a hole\nin Texas,"),
    (1.8, 3.7, "you have\nan oil well."),
    (3.7, 5.5, "But the sandy sides\nkeep caving in."),
    (5.5, 7.5, "So, you pump\nthick mud"),
    (7.5, 10.5, "down the hole,\nand its weight"),
    (10.5, 13.0, "holds the walls\nin place."),
    (13.0, 15.2, "and a thousand\nfeet down,"),
    (15.2, 17.5, "you hit oil."),
    (17.5, 19.5, "Your mud\nbubbles out,"),
    (19.5, 22.0, "and 1,000 feet\nof drill pipe"),
    (22.0, 24.0, "shoots out the top\nof your derrick."),
    (24.0, 26.2, "The oil blasts higher\nthan a ten-story building,"),
    (26.2, 29.6, "and for nine days,\nit rains oil."),
    (29.6, 32.5, "A single spark\ncould set the whole field\non fire."),
    (32.5, 35.5, "Because oil\nisn't sitting in a lake."),
    (35.5, 38.2, "It's soaked\ninto the rock,"),
    (38.2, 40.5, "and gas has been pushing\nthe whole time."),
    (40.5, 43.2, "Modern wells use\ngiant steel jaws,"),
    (43.2, 45.8, "and when the oil kicks,\nthey slam shut."),
    (45.8, 48.5, "This is a blowout\npreventer,"),
    (48.5, 51.5, "and that's why oil wells\ndon't gush anymore."),
    (51.5, 54.8, "Years go by,\nthe squeeze runs out,"),
    (54.8, 57.5, "So, you hang a pump\non a long string of rods,"),
    (57.5, 60.8, "and a beam on top\nrocks them up and down."),
    (60.8, 64.0, "Your little motor\nstruggles with the weight."),
    (64.0, 67.5, "So, you hang big weights\non the back of the beam,"),
    (67.5, 70.5, "helping pull the rods\nas they come up."),
    (70.5, 74.58, "This is a pumpjack.\nYou have built an oilfield."),
]


def fmt_srt(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main() -> None:
    frames = sorted(FRAMES_DIR.glob("frame_*.png"))
    if not frames:
        raise FileNotFoundError(f"No frames found in {FRAMES_DIR}")
    print(f"[ASSEMBLE] Found {len(frames)} frames.")

    srt_path = OUT_DIR / "captions.srt"
    entries = []
    for i, (s, e, txt) in enumerate(SUBTITLES, 1):
        entries.append(f"{i}\n{fmt_srt(s)} --> {fmt_srt(e)}\n{txt}\n")
    srt_path.write_text("\n".join(entries), encoding="utf-8")

    srt_esc = srt_path.as_posix().replace(":", r"\:")
    sub_style = (
        "FontName=Arial,FontSize=15,Bold=0,PrimaryColour=&H00FFFFFF,"
        "OutlineColour=&H00000000,BackColour=&H00000000,BorderStyle=1,"
        "Outline=1.6,Shadow=1,Alignment=2,MarginV=105"
    )
    vf = f"subtitles='{srt_esc}':force_style='{sub_style}'"

    cmd = [
        "ffmpeg", "-y",
        "-framerate", "24",
        "-i", str(FRAMES_DIR / "frame_%04d.png"),
        "-i", str(AUDIO_PATH),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        str(OUT_MP4),
    ]
    print("[FFMPEG] Encoding TEXAS_OIL_RECREATION_V2.mp4 ...")
    subprocess.check_call(cmd)
    print(f"[DONE] Master video ready -> {OUT_MP4} ({OUT_MP4.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
