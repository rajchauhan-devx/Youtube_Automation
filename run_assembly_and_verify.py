#!/usr/bin/env python3
"""
Assemble all 16 rendered shots into FINAL_BLENDER_EXPLAINER.mp4
Mux audio, subtitles, and run complete frame-by-frame verification.
"""

import os
import sys
import subprocess
import cv2
from render_full_production import assemble_full_video, SHOTS, WORK_DIR, FINAL_VIDEO, REF_VIDEO, REPORT_DIR
from frame_by_frame_verifier import verify_all_shots

def main():
    print("Checking all 16 rendered shots...")
    shot_paths = []
    total_frames = 0
    for s in SHOTS:
        p = os.path.join(WORK_DIR, f"{s['name']}.mp4")
        if not os.path.exists(p):
            raise FileNotFoundError(f"Missing shot: {p}")
        cap = cv2.VideoCapture(p)
        fc = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        cap.release()
        total_frames += fc
        print(f"Shot {s['shot']:02d} | {s['name']:<24} | {fc:4d} frames @ {fps:.1f} fps")
        shot_paths.append(p)
        
    print(f"\nTotal frames across all 16 shots: {total_frames} frames (target 1790)")
    
    print("\nAssembling full video with subtitles and audio muxing...")
    final_video = assemble_full_video(shot_paths)
    
    print("\nRunning frame-by-frame comparative verification...")
    summary = verify_all_shots(REF_VIDEO, final_video, REPORT_DIR)
    
    print("\n=======================================================")
    print("PRODUCTION VERIFICATION SUMMARY")
    print("=======================================================")
    print(f"Overall Average SSIM: {summary['overall_average_ssim']:.4f}")
    print(f"Overall Color Correlation: {summary['overall_color_correlation']:.4f}")
    print(f"Overall PSNR: {summary['overall_psnr_db']:.2f} dB")
    print("=======================================================")

if __name__ == "__main__":
    main()
