import os
import subprocess
from PIL import Image, ImageChops, ImageStat

base_video = 'artifacts/against_the_odds_60s.mp4'
overlaid_video = 'artifacts/against_the_odds_with_motion_overlays.mp4'

timestamps = [4, 12, 21, 30, 38, 47, 55]
overlay_names = [
    '01 Title Card (Endurance)',
    '02 Tactical Reticle (Elephant Island)',
    '03 Quote Alert (Survival Quote)',
    '04 Voyage Telemetry (800 Miles Counter)',
    '05 Shackleton Lower Third',
    '06 Verified Rescue Badge',
    '07 Climax Stat (Not a Single Life Lost)'
]

print("=== VERIFYING OVERLAYS ON GENERATED VIDEO ===")
all_passed = True

for t, name in zip(timestamps, overlay_names):
    cmd_base = ['ffmpeg', '-y', '-ss', str(t), '-i', base_video, '-frames:v', '1', f'/tmp/base_{t}.png']
    cmd_over = ['ffmpeg', '-y', '-ss', str(t), '-i', overlaid_video, '-frames:v', '1', f'/tmp/over_{t}.png']
    subprocess.run(cmd_base, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    subprocess.run(cmd_over, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    img_base = Image.open(f'/tmp/base_{t}.png').convert('RGB')
    img_over = Image.open(f'/tmp/over_{t}.png').convert('RGB')

    diff = ImageChops.difference(img_base, img_over)
    stat = ImageStat.Stat(diff)
    mean_diff = sum(stat.mean) / len(stat.mean)

    # An overlay with cards, badges, text and shadows creates a mean diff > 8.0 on the 1080x1920 frame
    status = "VISIBLE & VERIFIED" if mean_diff > 8.0 else "MISSING / TOO FAINT"
    if mean_diff <= 8.0:
        all_passed = False
    print(f"Timestamp {t}s [{name}]: Mean pixel diff = {mean_diff:.2f} -> {status}")

print(f"\nOVERALL RESULT: {'SUCCESS - ALL 7 OVERLAYS VERIFIED' if all_passed else 'FAILURE'}")
