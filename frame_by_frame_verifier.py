#!/usr/bin/env python3
"""
Frame-by-Frame Visual Verification & Quality Matching Engine
Compares a rendered Blender video against the reference video.
Computes:
- Peak Signal-to-Noise Ratio (PSNR)
- Structural Similarity Index (SSIM)
- Mean Squared Error (MSE)
- Color Histogram Correlation
- Side-by-side visual montage plates for every shot
"""

import os
import sys
import json
import cv2
import numpy as np

def compute_metrics(img_ref, img_gen):
    # Resize generated to match reference exactly
    h, w = img_ref.shape[:2]
    if img_gen.shape[:2] != (h, w):
        img_gen = cv2.resize(img_gen, (w, h))
        
    # MSE
    mse = np.mean((img_ref.astype(float) - img_gen.astype(float)) ** 2)
    
    # PSNR
    if mse == 0:
        psnr = 100.0
    else:
        psnr = 10.0 * np.log10((255.0 ** 2) / mse)
        
    # Color Histogram Correlation
    hist_ref = cv2.calcHist([img_ref], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
    hist_gen = cv2.calcHist([img_gen], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
    cv2.normalize(hist_ref, hist_ref)
    cv2.normalize(hist_gen, hist_gen)
    hist_corr = cv2.compareHist(hist_ref, hist_gen, cv2.HISTCMP_CORREL)
    
    # Structural similarity (simplified fast SSIM approximation on luminance)
    gray_ref = cv2.cvtColor(img_ref, cv2.COLOR_BGR2GRAY).astype(float)
    gray_gen = cv2.cvtColor(img_gen, cv2.COLOR_BGR2GRAY).astype(float)
    
    c1, c2 = 6.5025, 58.5225
    mu_ref = cv2.GaussianBlur(gray_ref, (11, 11), 1.5)
    mu_gen = cv2.GaussianBlur(gray_gen, (11, 11), 1.5)
    mu_ref_sq = mu_ref ** 2
    mu_gen_sq = mu_gen ** 2
    mu_cross = mu_ref * mu_gen
    
    sigma_ref_sq = cv2.GaussianBlur(gray_ref ** 2, (11, 11), 1.5) - mu_ref_sq
    sigma_gen_sq = cv2.GaussianBlur(gray_gen ** 2, (11, 11), 1.5) - mu_gen_sq
    sigma_cross = cv2.GaussianBlur(gray_ref * gray_gen, (11, 11), 1.5) - mu_cross
    
    ssim_map = ((2 * mu_cross + c1) * (2 * sigma_cross + c2)) / ((mu_ref_sq + mu_gen_sq + c1) * (sigma_ref_sq + sigma_gen_sq + c2))
    ssim = float(np.mean(ssim_map))
    
    return {
        "mse": float(round(mse, 2)),
        "psnr_db": float(round(psnr, 2)),
        "color_correlation": float(round(max(0.0, hist_corr), 4)),
        "ssim": float(round(max(0.0, ssim), 4))
    }

def create_side_by_side(img_ref, img_gen, shot_title, metrics):
    h, w = img_ref.shape[:2]
    if img_gen.shape[:2] != (h, w):
        img_gen = cv2.resize(img_gen, (w, h))
        
    canvas = np.zeros((h + 60, w * 2 + 20, 3), dtype=np.uint8)
    canvas[50:50+h, 0:w] = img_ref
    canvas[50:50+h, w+20:w*2+20] = img_gen
    
    # Headers
    cv2.putText(canvas, f"REFERENCE VIDEO - {shot_title}", (15, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
    cv2.putText(canvas, f"BLENDER RECREATION (SSIM: {metrics['ssim']:.3f})", (w + 35, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 120), 2)
    
    return canvas

def verify_all_shots(ref_video_path, gen_video_path, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    
    cap_ref = cv2.VideoCapture(ref_video_path)
    cap_gen = cv2.VideoCapture(gen_video_path)
    
    total_ref = int(cap_ref.get(cv2.CAP_PROP_FRAME_COUNT))
    total_gen = int(cap_gen.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap_ref.get(cv2.CAP_PROP_FPS) or 24.0
    
    print(f"Comparing Reference ({total_ref} frames) vs Blender Render ({total_gen} frames) @ {fps} fps")
    
    # 16 standard benchmark shots defined from reference cuts
    shot_definitions = [
        {"shot": 1, "name": "Hook & Cutaway Tilt", "frame": 22},
        {"shot": 2, "name": "Derrick Oil Well", "frame": 65},
        {"shot": 3, "name": "Sandy Sides Caving In", "frame": 108},
        {"shot": 4, "name": "Mud Pump Ground Piston", "frame": 142},
        {"shot": 5, "name": "Mud Column Pressure Descent", "frame": 301},
        {"shot": 6, "name": "Inside Derrick Looking Up", "frame": 459},
        {"shot": 7, "name": "Violent Pipe Ejection", "frame": 479},
        {"shot": 8, "name": "Pipe Breaking Crown", "frame": 495},
        {"shot": 9, "name": "10-Story Gusher 9-Day Sky", "frame": 621},
        {"shot": 10, "name": "Deep Strata Plunge", "frame": 748},
        {"shot": 11, "name": "Underground Reservoir Myth", "frame": 770},
        {"shot": 12, "name": "Macro Pores Zoom", "frame": 789},
        {"shot": 13, "name": "Micro Rock Sponge Pebbles", "frame": 870},
        {"shot": 14, "name": "Casing Pipe Travel Up", "frame": 952},
        {"shot": 15, "name": "Cellar BOP Hydraulic Clamp", "frame": 1181},
        {"shot": 16, "name": "Walking Beam Pump Jack", "frame": 1596},
    ]
    
    report = []
    
    for shot in shot_definitions:
        target_f = min(shot["frame"], total_ref - 1)
        cap_ref.set(cv2.CAP_PROP_POS_FRAMES, target_f)
        ret_r, img_r = cap_ref.read()
        
        # Sample generated frame mapped proportionally or directly
        if total_gen >= total_ref:
            gen_f = target_f
        else:
            gen_f = int(round((target_f / total_ref) * (total_gen - 1)))
            
        cap_gen.set(cv2.CAP_PROP_POS_FRAMES, gen_f)
        ret_g, img_g = cap_gen.read()
        
        if ret_r and ret_g:
            metrics = compute_metrics(img_r, img_g)
            sbs = create_side_by_side(img_r, img_g, shot["name"], metrics)
            sbs_filename = f"comparison_shot_{shot['shot']:02d}_{shot['name'].replace(' ', '_').lower()}.jpg"
            sbs_path = os.path.join(output_dir, sbs_filename)
            cv2.imwrite(sbs_path, sbs)
            
            shot_result = {
                "shot_index": shot["shot"],
                "shot_name": shot["name"],
                "reference_frame": target_f,
                "timestamp_sec": round(target_f / fps, 2),
                "metrics": metrics,
                "comparison_image": sbs_filename
            }
            report.append(shot_result)
            print(f"Shot {shot['shot']:02d} | {shot['name']:<28} | SSIM: {metrics['ssim']:.3f} | Color Corr: {metrics['color_correlation']:.3f} | PSNR: {metrics['psnr_db']:.1f} dB")
            
    cap_ref.release()
    cap_gen.release()
    
    avg_ssim = np.mean([r["metrics"]["ssim"] for r in report])
    avg_color = np.mean([r["metrics"]["color_correlation"] for r in report])
    avg_psnr = np.mean([r["metrics"]["psnr_db"] for r in report])
    
    summary = {
        "total_shots_verified": len(report),
        "overall_average_ssim": float(round(avg_ssim, 4)),
        "overall_color_correlation": float(round(avg_color, 4)),
        "overall_psnr_db": float(round(avg_psnr, 2)),
        "shots": report
    }
    
    json_path = os.path.join(output_dir, "verification_report.json")
    with open(json_path, "w") as f:
        json.dump(summary, f, indent=2)
        
    print(f"\nVerification Complete! Summary saved to {json_path}")
    print(f"Overall SSIM: {avg_ssim:.4f} | Overall Color Correlation: {avg_color:.4f} | Overall PSNR: {avg_psnr:.2f} dB")
    return summary

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python frame_by_frame_verifier.py <ref_video> <gen_video> <output_dir>")
        sys.exit(1)
    verify_all_shots(sys.argv[1], sys.argv[2], sys.argv[3])
