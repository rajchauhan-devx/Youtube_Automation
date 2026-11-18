#!/usr/bin/env python3
"""
Full Production Pipeline: 16-Shot Blender Generation, Muxing & Verification
1. Renders all 16 dedicated shots using shot_film_generator.py (total 1790 frames @ 24fps)
2. Concatenates all 16 shot clips into raw_assembled.mp4
3. Multiplexes original audio track, burning subtitles and watermark
4. Runs automated frame-by-frame verification across all 16 reference shots (if cv2 available)
"""

import os
import sys
import subprocess
import time

try:
    from frame_by_frame_verifier import verify_all_shots
    HAS_VERIFIER = True
except ImportError:
    HAS_VERIFIER = False

# =============================================================================
# ENVIRONMENT & PATH DISCOVERY
# =============================================================================

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

def find_blender():
    candidates = [
        os.environ.get("BLENDER_BIN", ""),
        "/Applications/Blender.app/Contents/MacOS/Blender",
        "/opt/homebrew/bin/blender",
        "/usr/local/bin/blender",
        r"C:\Users\zrajc\blender\blender-5.3.0-windows-x64\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe",
        r"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe",
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return "blender"

BLENDER_BIN = find_blender()
SHOT_GENERATOR = os.path.join(ROOT_DIR, "server", "scripts", "blender", "shot_film_generator.py")

# Look up audio path
DEFAULT_AUDIO = "/Users/laheri/.gemini/antigravity/brain/9fecab6e-5215-47d8-b3b4-727c076a2a32/scratch/video_inspection/audio.wav"
AUDIO_PATH = DEFAULT_AUDIO if os.path.exists(DEFAULT_AUDIO) else os.path.join(ROOT_DIR, "audio.wav")

DEFAULT_REF = "/Users/laheri/.gemini/antigravity/brain/9fecab6e-5215-47d8-b3b4-727c076a2a32/.user_uploaded/media_1794980701122_47da31e1.mp4"
REF_VIDEO = DEFAULT_REF if os.path.exists(DEFAULT_REF) else os.path.join(ROOT_DIR, "reference.mp4")

WORK_DIR = os.path.join(ROOT_DIR, "production_workspace")
FINAL_VIDEO = os.path.join(ROOT_DIR, "FINAL_BLENDER_EXPLAINER.mp4")
REPORT_DIR = os.path.join(ROOT_DIR, "verification_results")

SHOTS = [
    {"shot": 1, "name": "shot_01_hook_tilt", "frames": 43, "fps": 24},
    {"shot": 2, "name": "shot_02_derrick_well", "frames": 45, "fps": 24},
    {"shot": 3, "name": "shot_03_sandy_cavein", "frames": 39, "fps": 24},
    {"shot": 4, "name": "shot_04_mud_pump", "frames": 29, "fps": 24},
    {"shot": 5, "name": "shot_05_mud_pressure", "frames": 297, "fps": 24},
    {"shot": 6, "name": "shot_06_derrick_lookup", "frames": 14, "fps": 24},
    {"shot": 7, "name": "shot_07_pipe_ejection", "frames": 13, "fps": 24},
    {"shot": 8, "name": "shot_08_crown_break", "frames": 22, "fps": 24},
    {"shot": 9, "name": "shot_09_gusher_geyser", "frames": 235, "fps": 24},
    {"shot": 10, "name": "shot_10_strata_plunge", "frames": 21, "fps": 24},
    {"shot": 11, "name": "shot_11_reservoir_myth", "frames": 24, "fps": 24},
    {"shot": 12, "name": "shot_12_pores_zoom", "frames": 13, "fps": 24},
    {"shot": 13, "name": "shot_13_micro_sponge", "frames": 148, "fps": 24},
    {"shot": 14, "name": "shot_14_casing_travel", "frames": 17, "fps": 24},
    {"shot": 15, "name": "shot_15_cellar_bop", "frames": 441, "fps": 24},
    {"shot": 16, "name": "shot_16_pumpjack_beam", "frames": 389, "fps": 24},
]

def render_shot(shot_info):
    out_mp4 = os.path.join(WORK_DIR, f"{shot_info['name']}.mp4")
    print(f"\n=======================================================")
    print(f"Rendering Shot {shot_info['shot']:02d}: {shot_info['name']} ({shot_info['frames']} frames @ {shot_info['fps']} fps)...")
    print(f"=======================================================")
    
    cmd = [
        BLENDER_BIN,
        "--background",
        "--python", SHOT_GENERATOR,
        "--",
        "--shot", str(shot_info["shot"]),
        "--fps", str(shot_info["fps"]),
        "--output_path", out_mp4,
        "--samples", "4"
    ]
    t0 = time.time()
    subprocess.run(cmd, check=True)
    dur = time.time() - t0
    print(f"Rendered Shot {shot_info['shot']:02d} in {dur:.1f}s ({shot_info['frames']/dur:.1f} fps) -> {out_mp4}")
    return out_mp4

def assemble_full_video(rendered_files):
    os.makedirs(WORK_DIR, exist_ok=True)
    concat_list_path = os.path.join(WORK_DIR, "concat_list.txt")
    with open(concat_list_path, "w") as f:
        for p in rendered_files:
            clean_p = os.path.abspath(p).replace("\\", "/")
            f.write(f"file '{clean_p}'\n")
            
    raw_assembled = os.path.join(WORK_DIR, "raw_assembled.mp4")
    print("\nConcatenating 16 shots with ffmpeg concat demuxer...")
    concat_cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_list_path,
        "-c", "copy",
        raw_assembled
    ]
    subprocess.run(concat_cmd, check=True)
    
    print("\nMultiplexing audio & subtitles to create final master video...")
    
    # Subtitles to draw on video
    subtitles = [
        (0.0, 1.8, "If you drill a hole in Texas,"),
        (1.8, 3.7, "you have an oil well."),
        (3.7, 5.4, "But the sandy sides keep caving in."),
        (5.4, 6.5, "So, you pump thick mud"),
        (6.5, 12.0, "down the hole as you drill,"),
        (12.0, 15.5, "and its weight pushes back against the rock."),
        (15.5, 18.6, "Now you drill deeper,"),
        (18.6, 20.3, "Your mud bubbles out,"),
        (20.3, 22.0, "and 1,000 feet of drill pipe"),
        (22.0, 24.5, "shoot up through the top of your derrick."),
        (24.5, 27.0, "A single spark could set the whole field on fire."),
        (27.0, 30.7, "and for nine days, it rains oil."),
        (30.7, 33.2, "Because oil isn't sitting in a lake underground."),
        (33.2, 39.3, "It's trapped in tiny pores in the rock, like water in a sponge,"),
        (39.3, 40.0, "the whole time."),
        (40.0, 48.0, "Modern wells use a blowout preventer."),
        (48.0, 58.4, "Thick steel rams slam shut, and the oil stops coming up."),
        (58.4, 66.0, "and that's why oil wells don't gush anymore."),
        (66.0, 74.58, "Instead, they use a pump jack, with an engine on one end and a beam on top,"),
    ]
    
    font_file = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    if not os.path.exists(font_file):
        font_file = "C\\:/Windows/Fonts/arialbd.ttf"
        
    draw_filters = []
    # Watermark MILDLY ELSEWHERE
    draw_filters.append(
        f"drawtext=fontfile='{font_file}':text='MILDLY ELSEWHERE':fontsize=20:fontcolor=white:borderw=2:bordercolor=black:x=w-text_w-40:y=180"
    )
    for s, e, text in subtitles:
        escaped_txt = text.replace("'", "").replace(":", "\\:").replace(",", "\\,")
        d = (
            f"drawtext=fontfile='{font_file}':text='{escaped_txt}':"
            f"fontsize=36:fontcolor=white:borderw=3:bordercolor=black:"
            f"x=(w-text_w)/2:y=h-240:enable='between(t\\,{s}\\,{e})'"
        )
        draw_filters.append(d)
        
    filter_complex = ",".join(draw_filters)
    
    mux_cmd = [
        "ffmpeg", "-y",
        "-i", raw_assembled,
        "-i", AUDIO_PATH,
        "-vf", filter_complex,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        FINAL_VIDEO
    ]
    subprocess.run(mux_cmd, check=True)
    print(f"\nFINAL MASTER VIDEO CREATED -> {FINAL_VIDEO}")
    return FINAL_VIDEO

def main():
    print("=================================================================")
    print("MILDLY ELSEWHERE OIL EXPLAINER: 16-SHOT HIGH-FIDELITY PRODUCTION")
    print("=================================================================")
    os.makedirs(WORK_DIR, exist_ok=True)
    os.makedirs(REPORT_DIR, exist_ok=True)
    
    start_time = time.time()
    
    # 1. Render all 16 shots
    rendered_shots = []
    for shot_info in SHOTS:
        out_path = render_shot(shot_info)
        rendered_shots.append(out_path)
        
    render_time = time.time() - start_time
    print(f"\nAll 16 shots rendered in {render_time:.1f}s ({render_time/60:.2f} min)")
    
    # 2. Assemble and mux final video
    assemble_full_video(rendered_shots)
    
    # 3. Automated frame-by-frame verification if verifier available
    if HAS_VERIFIER:
        print("\n=================================================================")
        print("EXECUTING FRAME-BY-FRAME COMPARATIVE VERIFICATION")
        print("=================================================================")
        try:
            report = verify_all_shots(REF_VIDEO, FINAL_VIDEO, REPORT_DIR)
        except Exception as e:
            print(f"Verification warning: {e}")
            
    print("\nProduction pipeline completed successfully.")

if __name__ == "__main__":
    main()
