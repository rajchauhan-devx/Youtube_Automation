"""
Generates narration audio + synced SRT captions using edge-tts for our
Zack D. Films style pretrained Blender explainer demo.
"""
from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "production_workspace" / "pretrained_demo"
OUT_DIR.mkdir(parents=True, exist_ok=True)

VOICE = "en-US-ChristopherNeural"

def synth_windows_sapi(text: str, out_mp3: Path) -> None:
    wav_tmp = out_mp3.with_suffix(".wav")
    safe = text.replace("'", "''")
    ps = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        "$s.Rate = 1; "
        f"$s.SetOutputToWaveFile('{wav_tmp}'); "
        f"$s.Speak('{safe}'); "
        "$s.Dispose()"
    )
    subprocess.check_call(["powershell", "-NoProfile", "-Command", ps])
    subprocess.check_call(
        ["ffmpeg", "-y", "-i", str(wav_tmp), "-c:a", "libmp3lame", "-b:a", "192k", str(out_mp3)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    wav_tmp.unlink(missing_ok=True)


async def synth_line(text: str, mp3_path: Path) -> None:
    for v in (VOICE, "en-US-GuyNeural", "en-US-AriaNeural"):
        try:
            comm = edge_tts.Communicate(text, voice=v)
            await comm.save(str(mp3_path))
            if mp3_path.exists() and mp3_path.stat().st_size > 1000:
                return
        except Exception as e:
            print(f"[WARN] edge-tts ({v}) failed: {e}")
    print("[INFO] Using Windows SpeechSynthesizer fallback...")
    synth_windows_sapi(text, mp3_path)

SHOTS = [
    ("shot1", "Ever wonder what actually happens seconds after you swallow a pill?"),
    ("shot2", "It races down your esophagus right past your beating heart and lungs..."),
    ("shot3", "and drops straight into stomach acid strong enough to dissolve metal!"),
    ("shot4", "In minutes, microscopic enzymes break it apart and send it into your bloodstream."),
]


def probe_duration(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        text=True,
    ).strip()
    return float(out)


def fmt_srt_time(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


async def generate_all() -> None:
    timings = []
    t_cursor = 0.0
    srt_entries = []
    concat_list = OUT_DIR / "audio_concat.txt"
    concat_lines = []

    idx = 1
    for shot_id, text in SHOTS:
        mp3_path = OUT_DIR / f"{shot_id}.mp3"
        await synth_line(text, mp3_path)
        dur = probe_duration(mp3_path)
        start = t_cursor
        end = t_cursor + dur
        timings.append({
            "shot": shot_id,
            "text": text,
            "start": round(start, 3),
            "end": round(end, 3),
            "duration": round(dur, 3),
        })
        # Split into 2 punchy caption chunks per shot for Shorts readability
        words = text.split()
        mid = len(words) // 2
        chunk1 = " ".join(words[:mid])
        chunk2 = " ".join(words[mid:])
        mid_t = start + dur * (len(chunk1) / max(len(text), 1))
        srt_entries.append(f"{idx}\n{fmt_srt_time(start)} --> {fmt_srt_time(mid_t)}\n{chunk1}\n")
        idx += 1
        srt_entries.append(f"{idx}\n{fmt_srt_time(mid_t)} --> {fmt_srt_time(end)}\n{chunk2}\n")
        idx += 1

        concat_lines.append(f"file '{mp3_path.as_posix()}'")
        t_cursor = end

    concat_list.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")
    merged_audio = OUT_DIR / "narration.mp3"
    subprocess.check_call([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
        "-c", "copy", str(merged_audio),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    srt_path = OUT_DIR / "captions.srt"
    srt_path.write_text("\n".join(srt_entries), encoding="utf-8")

    meta = {"total_duration": round(t_cursor, 3), "shots": timings, "audio": str(merged_audio), "srt": str(srt_path)}
    (OUT_DIR / "timings.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    asyncio.run(generate_all())
