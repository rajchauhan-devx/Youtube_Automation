"""
RTX 3050 (6GB VRAM) Image-to-3D Mesh Generator using local Stability AI TripoSR weights.
Turns any single reference image into a textured 3D .glb/.obj mesh ready for Blender.

Usage:
  python scripts/generate_3d_6gb.py path/to/image.png --out assets/blender_pretrained/models/generated/prop.glb
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRIPOSR_CODE = ROOT / "assets" / "blender_pretrained" / "ai_3d" / "TripoSR_code"
TRIPOSR_WEIGHTS = ROOT / "assets" / "blender_pretrained" / "ai_3d" / "TripoSR"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a 3D mesh from a single image (6GB VRAM safe)")
    parser.add_argument("image", help="Path to input image (.png/.jpg)")
    parser.add_argument(
        "--out",
        default=str(ROOT / "assets" / "blender_pretrained" / "models" / "generated" / "mesh.glb"),
        help="Output .glb or .obj file path",
    )
    parser.add_argument("--chunk-size", type=int, default=4096, help="Lower = less VRAM (4096 safe for 6GB)")
    parser.add_argument("--mc-resolution", type=int, default=224, help="Marching cubes resolution (224 safe for 6GB)")
    parser.add_argument("--no-remove-bg", action="store_true", help="Skip automatic background removal")
    args = parser.parse_args()

    if not TRIPOSR_CODE.exists():
        raise FileNotFoundError(f"TripoSR code missing at {TRIPOSR_CODE}")
    if not (TRIPOSR_WEIGHTS / "model.ckpt").exists():
        raise FileNotFoundError(f"TripoSR weights missing at {TRIPOSR_WEIGHTS / 'model.ckpt'}")

    sys.path.insert(0, str(TRIPOSR_CODE))

    import numpy as np
    import torch
    from PIL import Image
    from tsr.system import TSR
    from tsr.utils import remove_background, resize_foreground

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    print(f"[TripoSR] Loading local weights from {TRIPOSR_WEIGHTS} on {device} (6GB VRAM mode)...")
    model = TSR.from_pretrained(
        str(TRIPOSR_WEIGHTS),
        config_name="config.yaml",
        weight_name="model.ckpt",
    )
    model.renderer.set_chunk_size(args.chunk_size)
    model.to(device)

    img = Image.open(args.image)
    if not args.no_remove_bg:
        try:
            import rembg
            session = rembg.new_session()
            img = remove_background(img, session)
            img = resize_foreground(img, 0.85)
        except ImportError:
            print("[TripoSR] rembg not installed; proceeding without auto background removal.")
            img = img.convert("RGB")
    else:
        img = img.convert("RGB")

    if img.mode == "RGBA":
        arr = np.array(img).astype(np.float32) / 255.0
        arr = arr[:, :, :3] * arr[:, :, 3:4] + (1 - arr[:, :, 3:4]) * 0.5
        img = Image.fromarray((arr * 255.0).astype(np.uint8))

    print("[TripoSR] Running single-image 3D reconstruction...")
    with torch.no_grad():
        scene_codes = model([img], device=device)
        meshes = model.extract_mesh(scene_codes, has_vertex_color=True, resolution=args.mc_resolution)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    meshes[0].export(str(out_path))
    print(f"[DONE] 3D mesh saved -> {out_path}")


if __name__ == "__main__":
    main()
