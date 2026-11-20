"""
Assembles the 1,790 rendered 720x1280 24fps PNG frames from texas_oil_v4
with reference audio and high-retention YouTube Shorts kinetic yellow-highlighted captions
into TEXAS_OIL_RECREATION_V4_MASTER.mp4.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "production_workspace" / "texas_oil_v4"
FRAMES_DIR = OUT_DIR / "frames"
AUDIO_PATH = ROOT / "scratch" / "user_ref_video" / "audio.wav"
if not AUDIO_PATH.exists():
    AUDIO_PATH = ROOT / "audio.wav"
OUT_MP4 = ROOT / "TEXAS_OIL_RECREATION_V4_MASTER.mp4"

# Kinetic Subtitle Beats with punch keyword highlights in Electric Yellow ({\\c&H0000E6FF&})
# SubStation Alpha (ASS) format uses BGR hex: &H0000E6FF& = #FFE600 (Vibrant Yellow)
# &H00FFFFFF& = Pure White
YEL = "{\\c&H0000E6FF&}"
WHT = "{\\c&H00FFFFFF&}"

SUBTITLES = [
    (0.0, 1.8, f"If you drill a hole\\nin {YEL}Texas{WHT},"),
    (1.8, 3.7, f"you have\\nan {YEL}oil well{WHT}."),
    (3.7, 5.5, f"But the {YEL}sandy sides{WHT}\\nkeep caving in."),
    (5.5, 7.5, f"So, you pump\\n{YEL}thick mud{WHT}"),
    (7.5, 10.5, f"down the hole,\\nand its {YEL}weight{WHT}"),
    (10.5, 13.0, f"holds the walls\\nin {YEL}place{WHT}."),
    (13.0, 15.2, f"and a {YEL}thousand feet{WHT}\\ndown,"),
    (15.2, 17.5, f"you hit {YEL}oil{WHT}."),
    (17.5, 19.5, f"Your mud\\n{YEL}bubbles out{WHT},"),
    (19.5, 22.0, f"and {YEL}1,000 feet{WHT}\\nof drill pipe"),
    (22.0, 24.0, f"shoots out the {YEL}top{WHT}\\nof your derrick."),
    (24.0, 26.2, f"The oil blasts higher\\nthan a {YEL}ten-story building{WHT},"),
    (26.2, 29.6, f"and for {YEL}nine days{WHT},\\nit rains oil."),
    (29.6, 32.5, f"A single {YEL}spark{WHT}\\ncould set the whole field\\non {YEL}fire{WHT}."),
    (32.5, 35.5, f"Because oil\\nisn't sitting in a {YEL}lake{WHT}."),
    (35.5, 38.2, f"It's {YEL}soaked into the rock{WHT},\\nlike water in a sponge,"),
    (38.2, 40.5, f"and {YEL}gas{WHT} has been pushing\\nthe whole time."),
    (40.5, 43.2, f"Modern wells use\\n{YEL}giant steel jaws{WHT},"),
    (43.2, 45.8, f"and when the oil kicks,\\nthey {YEL}slam shut{WHT}."),
    (45.8, 48.5, f"This is a {YEL}blowout preventer{WHT},"),
    (48.5, 51.5, f"and that's why oil wells\\n{YEL}don't gush{WHT} anymore."),
    (51.5, 54.8, f"Years go by,\\nthe {YEL}squeeze runs out{WHT},"),
    (54.8, 57.5, f"So, you hang a pump\\non a long {YEL}string of rods{WHT},"),
    (57.5, 60.8, f"and a {YEL}beam on top{WHT}\\nrocks them up and down."),
    (60.8, 64.0, f"Your little motor\\nstruggles with the {YEL}weight{WHT}."),
    (64.0, 67.5, f"So, you hang {YEL}big weights{WHT}\\non the back of the beam,"),
    (67.5, 70.5, f"helping {YEL}pull the rods{WHT}\\nas they come up."),
    (70.5, 74.58, f"This is a {YEL}pumpjack{WHT}.\\nYou have built an {YEL}oilfield{WHT}."),
]


def fmt_ass_time(sec: float) -> str:
    cs = int(round(sec * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h:d}:{m:02d}:{s:02d}.{cs:02d}"


def build_ass_subtitles(ass_path: Path) -> None:
    header = """[Script Info]
Title: Mildly Elsewhere Texas Oil Shorts Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ShortsDefault,Arial Black,32,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3.2,1.2,2,40,40,165,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for s_time, e_time, text in SUBTITLES:
        st = fmt_ass_time(s_time)
        et = fmt_ass_time(e_time)
        lines.append(f"Dialogue: 0,{st},{et},ShortsDefault,,0,0,0,,{text}\n")
    ass_path.write_text("".join(lines), encoding="utf-8")
    print(f"[OK] Generated ASS kinetic subtitles -> {ass_path}")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ass_path = OUT_DIR / "kinetic_captions.ass"
    build_ass_subtitles(ass_path)

    frames = sorted(FRAMES_DIR.glob("frame_*.png"))
    print(f"[INFO] Checking frames in {FRAMES_DIR}: found {len(frames)} frames.")

    if not frames:
        print("[WARNING] No full frame sequence found yet. Generating preview video or waiting for full render.")
        return

    ass_esc = ass_path.as_posix().replace(":", r"\:")
    cmd = [
        "ffmpeg", "-y",
        "-framerate", "24",
        "-i", str(FRAMES_DIR / "frame_%04d.png"),
        "-i", str(AUDIO_PATH),
        "-vf", f"subtitles='{ass_esc}'",
        "-c:v", "libx264",
        "-profile:v", "high",
        "-preset", "medium",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        str(OUT_MP4)
    ]

    print("[FFMPEG] Running video assembly command...")
    print(" ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[ERROR] FFmpeg failed:\n{res.stderr}")
        sys.exit(1)

    print(f"[SUCCESS] Master production video assembled cleanly -> {OUT_MP4}")
    if OUT_MP4.exists():
        size_mb = OUT_MP4.stat().st_size / (1024 * 1024)
        print(f"[OK] Output Size: {size_mb:.2f} MB")


if __name__ == "__main__":
    main()
