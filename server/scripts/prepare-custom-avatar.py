#!/usr/bin/env python3
"""Prepare custom transparent presenter avatars for MuseTalk in TubeFlow.

Processes raw avatar videos with solid/dark backdrops:
1. Normalizes video to 25fps H.264 (source_25fps.mp4).
2. Extracts full RGB frames (full_imgs/00000000.png ...).
3. Detects face bounding boxes with OpenCV YuNet (coords.pkl).
4. Encodes 256x256 lower-face crops with MuseTalk VAE (latents.pt).
5. Segments presenter using DeepLabV3 + luminance matting for clean alpha transparency.
6. Encodes VP9 transparent video with alpha_mode=1 (transparent.webm).
7. Encodes 500-frame forward/reverse ffv1 gray alpha cycle (cycle-v1.mkv).
8. Generates tight_crop bounding box and metadata.json.
"""

import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import pickle
import shutil
import subprocess
import sys

import cv2
import numpy as np
import torch
import torchvision.transforms.functional as TF
from torchvision.models.segmentation import deeplabv3_mobilenet_v3_large, DeepLabV3_MobileNet_V3_Large_Weights

# Add MuseTalk-Demo to sys.path
REPO_ROOT = Path(__file__).resolve().parents[2]
MUSETALK_ROOT = REPO_ROOT / "MuseTalk-Demo"
sys.path.insert(0, str(MUSETALK_ROOT))

from app import config

sys.path.insert(0, str(MUSETALK_ROOT / "MuseTalk"))
from musetalk.models.vae import VAE


def get_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def compute_alpha_mask(frame, seg_model, device):
    """Compute anti-aliased alpha mask for a frame with DeepLabV3 + luminance matting."""
    h, w = frame.shape[:2]
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    tensor = TF.normalize(
        TF.to_tensor(rgb).unsqueeze(0).to(device),
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    )
    with torch.inference_mode():
        output = seg_model(tensor)["out"][0]
        # Class 15 is person in COCO
        mask = (output.argmax(0) == 15).byte().cpu().numpy() * 255

    # Exclude bottom-right watermark region (e.g. x > 1650, y > 800)
    mask[800:, 1650:] = 0

    # Fill interior holes: invert mask and floodfill background from border points
    inv = cv2.bitwise_not(mask)
    flood_mask = np.zeros((h + 2, w + 2), np.uint8)
    for y in range(0, h, 10):
        if inv[y, 0] == 255:
            cv2.floodFill(inv, flood_mask, (0, y), 0)
        if inv[y, w - 1] == 255:
            cv2.floodFill(inv, flood_mask, (w - 1, y), 0)
    for x in range(0, w, 10):
        if inv[0, x] == 255:
            cv2.floodFill(inv, flood_mask, (x, 0), 0)
    for x in list(range(0, 250, 10)) + list(range(w - 250, w, 10)):
        if inv[h - 1, x] == 255:
            cv2.floodFill(inv, flood_mask, (x, h - 1), 0)

    filled = cv2.bitwise_or(mask, inv)

    # Edge matting / feathering:
    core = cv2.erode(filled, np.ones((5, 5), np.uint8))
    dilated = cv2.dilate(filled, np.ones((9, 9), np.uint8))

    alpha = np.zeros((h, w), dtype=np.float32)
    alpha[core > 0] = 255.0

    trans = (dilated > 0) & (core == 0)
    v = np.max(frame, axis=2).astype(np.float32)
    ramp = np.clip((v - 6.0) / (32.0 - 6.0), 0.0, 1.0) * 255.0
    alpha[trans] = ramp[trans]

    smooth = cv2.GaussianBlur(alpha, (3, 3), 0.8)
    alpha = np.where(core > 0, 255.0, np.where(dilated == 0, 0.0, smooth))
    return np.clip(alpha, 0, 255).astype(np.uint8)


def prepare_avatar(source_path: Path, avatar_id: str, display_name: str, duration: float = 10.0):
    source_path = source_path.resolve()
    if not source_path.is_file():
        raise FileNotFoundError(f"Source video not found: {source_path}")

    target_dir = MUSETALK_ROOT / "avatars" / "prepared" / avatar_id
    temp_dir = MUSETALK_ROOT / "avatars" / "prepared" / f".temp_{avatar_id}"

    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)
    frames_dir = temp_dir / "full_imgs"
    frames_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n==========================================")
    print(f"Preparing avatar: {avatar_id} ({display_name})")
    print(f"Source: {source_path}")
    print(f"Target: {target_dir}")
    print(f"==========================================\n")

    # Step 1: Normalize video to 25fps H.264
    normalized_video = temp_dir / "source_25fps.mp4"
    print(f"[1/7] Normalizing video to 25fps: {normalized_video.name}")
    norm_cmd = [
        "ffmpeg", "-v", "error", "-y",
        "-i", str(source_path),
        "-t", str(duration),
        "-an",
        "-vf", "scale=1920:1080",
        "-r", "25",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        str(normalized_video),
    ]
    subprocess.run(norm_cmd, check=True)

    # Step 2: Initialize Face Detector and VAE
    print(f"[2/7] Loading Face Detector and VAE...")
    device = get_device()
    print(f"Using device: {device}")

    detector_path = config.MODELS_DIR / "face_detection_yunet_2023mar.onnx"
    detector = cv2.FaceDetectorYN.create(str(detector_path), "", (320, 320), 0.85)

    vae = VAE(str(config.MODELS_DIR / "sd-vae"))
    vae.vae.to(device).eval()

    # Step 3: Extract frames, compute coords and VAE latents
    print(f"[3/7] Detecting faces and encoding VAE latents...")
    cap = cv2.VideoCapture(str(normalized_video))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Total video frames: {total_frames}")

    coords = []
    latents = []
    raw_frames = []

    frame_idx = 0
    with torch.inference_mode():
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            raw_frames.append(frame)
            height, width = frame.shape[:2]
            detector.setInputSize((width, height))
            _, faces = detector.detect(frame)
            if faces is None or len(faces) != 1:
                raise ValueError(f"Frame {frame_idx}: expected exactly 1 face, found {0 if faces is None else len(faces)}")

            face = faces[0]
            x, y, w, h = face[:4]
            nose_y = float(face[9])
            bottom = min(height, int(y + h + h * 0.06))
            top = max(0, int(2 * nose_y - bottom))
            left, right = max(0, int(x)), min(width, int(x + w))
            box = [left, top, right, bottom]

            crop = cv2.resize(frame[top:bottom, left:right], (256, 256), interpolation=cv2.INTER_LANCZOS4)
            latent = vae.get_latents_for_unet(crop).cpu()
            if not torch.isfinite(latent).all():
                raise RuntimeError(f"Frame {frame_idx}: VAE latent produced non-finite values")

            frame_path = frames_dir / f"{frame_idx:08d}.png"
            cv2.imwrite(str(frame_path), frame)

            coords.append(box)
            latents.append(latent)
            frame_idx += 1
            if frame_idx % 50 == 0:
                print(f"  Processed {frame_idx}/{total_frames} frames")
    cap.release()

    if len(coords) == 0:
        raise ValueError("No frames processed from video")

    print(f"Saving coords.pkl ({len(coords)} boxes) and latents.pt ({len(latents)} latents)...")
    with (temp_dir / "coords.pkl").open("wb") as f:
        pickle.dump(coords, f)
    torch.save(latents, temp_dir / "latents.pt")

    # Step 4: Compute Alpha Masks with DeepLabV3
    print(f"[4/7] Computing alpha masks with DeepLabV3 on {device}...")
    seg_model = deeplabv3_mobilenet_v3_large(weights=DeepLabV3_MobileNet_V3_Large_Weights.DEFAULT).to(device).eval()

    alpha_masks = []
    min_x_crop = width
    max_x_crop = 0
    min_y_crop = height
    max_y_crop = 0

    for idx, frame in enumerate(raw_frames):
        alpha = compute_alpha_mask(frame, seg_model, device)
        alpha_masks.append(alpha)

        # Track bounding box for tight crop
        ys, xs = np.where(alpha > 20)
        if len(xs) > 0:
            min_x_crop = min(min_x_crop, xs.min())
            max_x_crop = max(max_x_crop, xs.max())
            min_y_crop = min(min_y_crop, ys.min())
            max_y_crop = max(max_y_crop, ys.max())

        if (idx + 1) % 50 == 0:
            print(f"  Computed alpha mask for {idx + 1}/{len(raw_frames)} frames")

    # Compute tight crop percentages with safety margin
    crop_x = max(0.0, (min_x_crop - 20) / width * 100.0)
    crop_y = max(0.0, (min_y_crop - 20) / height * 100.0)
    crop_w = min(100.0 - crop_x, (max_x_crop - min_x_crop + 40) / width * 100.0)
    crop_h = min(100.0 - crop_y, (max_y_crop - min_y_crop + 40) / height * 100.0)

    tight_crop = {
        "x": round(float(crop_x), 1),
        "y": round(float(crop_y), 1),
        "width": round(float(crop_w), 1),
        "height": round(float(crop_h), 1),
    }
    print(f"Calculated tight crop: {tight_crop}")

    # Step 5: Encode transparent.webm (VP9 with alpha_mode=1)
    webm_path = temp_dir / "transparent.webm"
    print(f"[5/7] Encoding transparent WebM (VP9): {webm_path.name}...")
    webm_cmd = [
        "ffmpeg", "-v", "error", "-y",
        "-f", "rawvideo",
        "-pix_fmt", "rgba",
        "-s", f"{width}x{height}",
        "-r", "25",
        "-i", "-",
        "-c:v", "libvpx-vp9",
        "-b:v", "3M",
        "-pix_fmt", "yuva420p",
        "-metadata:s:v:0", "alpha_mode=1",
        str(webm_path),
    ]
    webm_proc = subprocess.Popen(webm_cmd, stdin=subprocess.PIPE)
    for frame, alpha in zip(raw_frames, alpha_masks):
        # Convert BGR to RGB and add Alpha
        rgba = cv2.cvtColor(frame, cv2.COLOR_BGR2RGBA)
        rgba[:, :, 3] = alpha
        webm_proc.stdin.write(rgba.tobytes())
    webm_proc.stdin.close()
    if webm_proc.wait() != 0:
        raise RuntimeError("Failed to encode transparent.webm")

    # Step 6: Encode cycle-v1.mkv (500 frames: 250 forward + 250 reverse)
    cycle_path = temp_dir / "cycle-v1.mkv"
    print(f"[6/7] Encoding cycle-v1.mkv (500 frames ffv1 gray forward/reverse)...")
    cycle_cmd = [
        "ffmpeg", "-v", "error", "-y",
        "-f", "rawvideo",
        "-pix_fmt", "gray",
        "-s", f"{width}x{height}",
        "-r", "25",
        "-i", "-",
        "-c:v", "ffv1",
        "-pix_fmt", "gray",
        str(cycle_path),
    ]
    cycle_proc = subprocess.Popen(cycle_cmd, stdin=subprocess.PIPE)
    # Forward frames
    for alpha in alpha_masks:
        cycle_proc.stdin.write(alpha.tobytes())
    # Reverse frames
    for alpha in reversed(alpha_masks):
        cycle_proc.stdin.write(alpha.tobytes())
    cycle_proc.stdin.close()
    if cycle_proc.wait() != 0:
        raise RuntimeError("Failed to encode cycle-v1.mkv")

    # Step 7: Write metadata.json
    print(f"[7/7] Writing metadata.json...")
    metadata = {
        "avatar_id": avatar_id,
        "source_mode": "mouthless",
        "name": display_name,
        "source_path": str(source_path),
        "fps": 25,
        "resolution": f"{width}x{height}",
        "duration": len(coords) / 25.0,
        "bbox_shift": 5,
        "num_frames_cycle": len(coords) * 2,
        "preparation_status": "prepared",
        "date_prepared": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "adapter_version": 1,
        "face_detector": "OpenCV YuNet",
        "tight_crop": tight_crop,
    }
    with (temp_dir / "metadata.json").open("w") as f:
        json.dump(metadata, f, indent=2)

    # Move to final target
    if target_dir.exists():
        print(f"Removing existing {target_dir}...")
        shutil.rmtree(target_dir)
    temp_dir.rename(target_dir)

    print(f"\nSuccessfully prepared {avatar_id} at {target_dir}!\n")


def main():
    parser = argparse.ArgumentParser(description="Prepare custom transparent presenter avatar for MuseTalk")
    parser.add_argument("--source", type=str, required=True, help="Path to input video file")
    parser.add_argument("--id", type=str, required=True, help="Avatar ID (e.g. avatar_odds)")
    parser.add_argument("--name", type=str, required=True, help="Display name for dropdown")
    parser.add_argument("--duration", type=float, default=10.0, help="Duration in seconds (default 10.0)")
    args = parser.parse_args()

    prepare_avatar(
        source_path=Path(args.source),
        avatar_id=args.id,
        display_name=args.name,
        duration=args.duration,
    )


if __name__ == "__main__":
    main()
