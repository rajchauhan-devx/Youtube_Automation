#!/usr/bin/env python3
"""Offline vision pass for the Motion Pack (runs once per asset, never during render).

Usage:
    python analyze.py --input img.jpg --output img.vision.json [--width W --height H]
    python analyze.py --input frames_dir/ --output clip.vision.json --fps 1

Outputs structured placement data only (subject/face boxes + ranked empty
cells, normalized 0-1). Detection backends are best-effort: YOLOv8n
(ultralytics) for subjects and MediaPipe for faces. When neither is installed
the script still emits valid JSON with empty detections and a default
empty-cell ranking, so placement falls back to safe-zone templates.

Exit codes: 0 on valid JSON written, non-zero on bad args / unreadable input.
"""

import argparse
import datetime
import json
import os
import struct
import sys

CELLS = [
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
]

DEFAULT_EMPTY = [
    "top-right", "top-left", "top-center",
    "center-left", "center-right",
    "bottom-left", "bottom-right", "bottom-center", "center",
]

CELL_BOUNDS = {
    name: (col / 3.0, row / 3.0, 1 / 3.0, 1 / 3.0)
    for row in range(3)
    for col, name in enumerate(
        [CELLS[row * 3], CELLS[row * 3 + 1], CELLS[row * 3 + 2]]
    )
}


def read_png_size(path):
    with open(path, "rb") as f:
        head = f.read(26)
    if head[1:4] != b"PNG":
        return None
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def read_jpeg_size(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[0:2] != b"\xff\xd8":
        return None
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        if marker in (0xD8, 0xD9, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        i += 2 + length
    return None


def image_size(path, hint_w, hint_h):
    ext = os.path.splitext(path)[1].lower()
    size = None
    try:
        if ext == ".png":
            size = read_png_size(path)
        elif ext in (".jpg", ".jpeg"):
            size = read_jpeg_size(path)
        else:
            try:
                from PIL import Image  # type: ignore

                with Image.open(path) as im:
                    size = (im.width, im.height)
            except Exception:
                size = None
    except Exception:
        size = None
    if size:
        return size
    if hint_w and hint_h:
        return hint_w, hint_h
    return 0, 0


_YOLO = None
_YOLO_FAILED = False
_FACE = None
_FACE_FAILED = False


def get_yolo():
    """Load YOLOv8n once per process (batch mode analyzes many frames)."""
    global _YOLO, _YOLO_FAILED
    if _YOLO is None and not _YOLO_FAILED:
        try:
            from ultralytics import YOLO  # type: ignore

            _YOLO = YOLO("yolov8n.pt")
        except Exception:
            _YOLO_FAILED = True
    return _YOLO


def get_face():
    """Load MediaPipe face detection once per process."""
    global _FACE, _FACE_FAILED
    if _FACE is None and not _FACE_FAILED:
        try:
            import mediapipe as mp  # type: ignore

            _FACE = mp.solutions.face_detection.FaceDetection(
                model_selection=1, min_detection_confidence=0.5
            )
        except Exception:
            _FACE_FAILED = True
    return _FACE


def detect(path):
    """Return (subjects, faces) as normalized dicts. Empty lists when backends missing."""
    subjects, faces = [], []
    model = get_yolo()
    if model is not None:
        try:
            for r in model.predict(path, verbose=False):
                for b in r.boxes:
                    conf = float(b.conf[0])
                    if conf < 0.45:
                        continue
                    cx, cy, bw, bh = (float(v) for v in b.xywhn[0])
                    label = r.names[int(b.cls[0])]
                    subjects.append({
                        "label": str(label),
                        "x": max(0.0, cx - bw / 2.0),
                        "y": max(0.0, cy - bh / 2.0),
                        "w": max(0.0, bw),
                        "h": max(0.0, bh),
                        "conf": round(conf, 3),
                    })
        except Exception:
            subjects = []
    fd = get_face()
    if fd is not None:
        try:
            from PIL import Image  # type: ignore

            import numpy as np  # type: ignore

            with Image.open(path).convert("RGB") as im:
                frame = np.asarray(im)
            res = fd.process(frame)
            for det in res.detections or []:
                bb = det.location_data.relative_bounding_box
                faces.append({
                    "x": max(0.0, float(bb.xmin)),
                    "y": max(0.0, float(bb.ymin)),
                    "w": max(0.0, float(bb.width)),
                    "h": max(0.0, float(bb.height)),
                    "conf": round(float(det.score[0]), 3),
                })
        except Exception:
            faces = []
    return subjects, faces


def overlap(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    iw = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
    ih = max(0.0, min(ay + ah, by + bh) - max(ay, by))
    return iw * ih


def rank_empty(subjects, faces):
    boxes = [(s["x"], s["y"], s["w"], s["h"]) for s in subjects]
    boxes += [(f["x"], f["y"], f["w"], f["h"]) for f in faces]
    if not boxes:
        return list(DEFAULT_EMPTY)
    scored = []
    for name in CELLS:
        cell = CELL_BOUNDS[name]
        area = cell[2] * cell[3]
        occ = sum(overlap(cell, b) for b in boxes) / area
        scored.append((occ, name))
    scored.sort(key=lambda kv: (kv[0], DEFAULT_EMPTY.index(kv[1])))
    return [name for _, name in scored]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--width", type=int, default=0)
    ap.add_argument("--height", type=int, default=0)
    ap.add_argument("--fps", type=float, default=1.0,
                    help="Sample rate when --input is a frame directory")
    args = ap.parse_args()
    if os.path.isdir(args.input):
        return analyze_video(args.input, args.output, args.fps)
    if not os.path.isfile(args.input):
        print(f"input not found: {args.input}", file=sys.stderr)
        return 2
    width, height = image_size(args.input, args.width, args.height)
    subjects, faces = detect(args.input)
    doc = {
        "version": 1,
        "source": "yolov8n+mediapipe",
        "width": width,
        "height": height,
        "faces": faces,
        "subjects": subjects,
        "emptyCells": rank_empty(subjects, faces),
        "analyzedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    tmp = args.output + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2)
    os.replace(tmp, args.output)
    print(f"vision: {len(subjects)} subjects, {len(faces)} faces -> {args.output}")
    return 0


def analyze_video(frames_dir, output, fps):
    """Batch mode: models load once, every sampled frame gets one entry."""
    names = sorted(
        f for f in os.listdir(frames_dir)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    )
    if not names:
        print(f"no frames in {frames_dir}", file=sys.stderr)
        return 2
    entries = []
    for i, name in enumerate(names):
        path = os.path.join(frames_dir, name)
        width, height = image_size(path, 0, 0)
        subjects, faces = detect(path)
        entries.append({
            "tMs": round(i * 1000.0 / fps),
            "faces": faces,
            "subjects": subjects,
            "emptyCells": rank_empty(subjects, faces),
        })
    duration_ms = round(len(names) * 1000.0 / fps)
    doc = {
        "version": 1,
        "source": "yolov8n+mediapipe",
        "durationMs": duration_ms,
        "sampleFps": fps,
        "frames": entries,
    }
    tmp = output + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2)
    os.replace(tmp, output)
    print(f"vision: {len(entries)} frames @ {fps}fps -> {output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
