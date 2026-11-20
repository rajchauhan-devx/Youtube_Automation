"""
Download and verify RTX 3050 (6GB VRAM) compatible pretrained Blender assets,
extensions, 3D model catalogs, HDRIs, PBR materials, and Image-to-3D AI weights.

Directory layout:
  assets/blender_pretrained/
    anatomy/          -> Z-Anatomy full human anatomy Blender atlas (.blend)
    extensions/       -> MPFB2 (MakeHuman) + MakeHuman system asset packs
    hdri/             -> Poly Haven CC0 studio & outdoor HDRIs
    textures/         -> Poly Haven CC0 PBR texture sets
    models/           -> Poly Haven CC0 3D models (.gltf/.blend) + Objaverse cache
    indexes/          -> Offline searchable catalogs (Poly Haven + Objaverse LVIS)
    ai_3d/            -> 6GB-VRAM AI 3D models (TripoSR + Hunyuan3D-2mini-turbo)
    templates/        -> zack_d_studio.blend (9:16 vertical studio template)
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
BASE_DIR = ROOT / "assets" / "blender_pretrained"

DIRS = {
    "anatomy": BASE_DIR / "anatomy",
    "extensions": BASE_DIR / "extensions",
    "hdri": BASE_DIR / "hdri",
    "textures": BASE_DIR / "textures",
    "models": BASE_DIR / "models",
    "indexes": BASE_DIR / "indexes",
    "ai_3d": BASE_DIR / "ai_3d",
    "templates": BASE_DIR / "templates",
}

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) YoutubeAutomationBlenderLoader/1.0"


def ensure_dirs() -> None:
    for d in DIRS.values():
        d.mkdir(parents=True, exist_ok=True)


def download_file(url: str, dest: Path, label: str = "") -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"[SKIP] {label or dest.name} already exists ({dest.stat().st_size / 1e6:.1f} MB)")
        return dest
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    print(f"[GET ] {label or dest.name} <- {url}")
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
        total = int(resp.headers.get("Content-Length", "0") or "0")
        downloaded = 0
        chunk_size = 1024 * 512
        last_pct = -1
        while True:
            chunk = resp.read(chunk_size)
            if not chunk:
                break
            out.write(chunk)
            downloaded += len(chunk)
            if total > 0:
                pct = int(downloaded * 100 / total)
                if pct >= last_pct + 20:
                    print(f"       {label or dest.name}: {pct}% ({downloaded/1e6:.1f}/{total/1e6:.1f} MB)")
                    last_pct = pct
    tmp.replace(dest)
    print(f"[DONE] {label or dest.name} ({dest.stat().st_size / 1e6:.1f} MB)")
    return dest


def fetch_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download_z_anatomy() -> dict[str, Any]:
    zip_path = DIRS["anatomy"] / "Z-Anatomy.zip"
    url = "https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/master/Z-Anatomy.zip"
    download_file(url, zip_path, "Z-Anatomy.zip")
    extract_dir = DIRS["anatomy"] / "Z-Anatomy"
    if not extract_dir.exists() or not any(extract_dir.rglob("*.blend")):
        print("[UNZIP] Extracting Z-Anatomy.zip ...")
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)
    blends = [str(p.relative_to(ROOT)) for p in extract_dir.rglob("*.blend")]
    print(f"[OK  ] Z-Anatomy .blend files found: {blends}")
    return {"zip": str(zip_path.relative_to(ROOT)), "blend_files": blends}


def download_mpfb2_extension() -> dict[str, Any]:
    url = "https://extensions.blender.org/download/sha256:c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad/add-on-mpfb-v2.0.18.zip"
    dest = DIRS["extensions"] / "add-on-mpfb-v2.0.18.zip"
    download_file(url, dest, "MPFB2 v2.0.18 Blender Extension")
    return {"extension_zip": str(dest.relative_to(ROOT))}


def download_polyhaven_catalog_and_starter_pack() -> dict[str, Any]:
    catalog: dict[str, Any] = {}
    for kind in ("hdris", "textures", "models"):
        idx_path = DIRS["indexes"] / f"polyhaven_{kind}.json"
        if not idx_path.exists():
            data = fetch_json(f"https://api.polyhaven.com/assets?t={kind}")
            idx_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            print(f"[OK  ] Saved Poly Haven {kind} index ({len(data)} assets)")
        else:
            data = json.loads(idx_path.read_text(encoding="utf-8"))
        catalog[kind] = data

    # Pick reliable, versatile CC0 starter HDRIs (studio + outdoor + neutral)
    hdri_candidates = [
        "studio_small_08",
        "studio_small_09",
        "photo_studio_01",
        "kloppenheim_06_puresky",
        "kloofendal_48d_partly_cloudy_puresky",
        "citrus_orchard_road_puresky",
    ]
    downloaded_hdris: list[str] = []
    for name in hdri_candidates:
        if name not in catalog["hdris"]:
            continue
        try:
            files = fetch_json(f"https://api.polyhaven.com/files/{name}")
            hdri_info = files.get("hdri", {})
            res = "2k" if "2k" in hdri_info else next(iter(hdri_info.keys()))
            fmt = "hdr" if "hdr" in hdri_info[res] else next(iter(hdri_info[res].keys()))
            url = hdri_info[res][fmt]["url"]
            dest = DIRS["hdri"] / f"{name}_{res}.{fmt}"
            download_file(url, dest, f"HDRI {name} ({res})")
            downloaded_hdris.append(str(dest.relative_to(ROOT)))
        except Exception as e:
            print(f"[WARN] HDRI {name}: {e}")

    # Pick versatile PBR textures (1k gltf/png textures for crisp EEVEE on 6GB VRAM)
    texture_candidates = [
        "rock_wall_04",
        "brown_mud_02",
        "rusty_metal_02",
        "wood_planks_grey",
        "concrete_floor_02",
        "sand_01",
    ]
    downloaded_textures: dict[str, list[str]] = {}
    for name in texture_candidates:
        if name not in catalog["textures"]:
            continue
        try:
            files = fetch_json(f"https://api.polyhaven.com/files/{name}")
            tex_dir = DIRS["textures"] / name
            tex_dir.mkdir(parents=True, exist_ok=True)
            saved: list[str] = []
            for map_name in ("Diffuse", "Rough", "nor_gl", "Displacement", "AO"):
                if map_name in files and "1k" in files[map_name]:
                    fmt = "jpg" if "jpg" in files[map_name]["1k"] else next(iter(files[map_name]["1k"].keys()))
                    url = files[map_name]["1k"][fmt]["url"]
                    dest = tex_dir / f"{name}_{map_name.lower()}_1k.{fmt}"
                    download_file(url, dest, f"TEX {name}/{map_name}")
                    saved.append(str(dest.relative_to(ROOT)))
            if saved:
                downloaded_textures[name] = saved
        except Exception as e:
            print(f"[WARN] Texture {name}: {e}")

    # Pick useful Poly Haven CC0 3D models (native .blend + textures!)
    model_candidates = [
        "Barrel_01",
        "wooden_crate_01",
        "brass_pan_01",
        "Camera_01",
        "metal_tool_chest",
        "industrial_coffee_table",
        "first_aid_kit_01",
        "jerrycan",
        "traffic_cone_01",
        "fire_hydrant",
    ]
    # Also auto-include any matching assets from catalog
    avail_models = [m for m in model_candidates if m in catalog["models"]]
    if len(avail_models) < 8:
        for k in list(catalog["models"].keys()):
            if k not in avail_models:
                avail_models.append(k)
            if len(avail_models) >= 8:
                break

    downloaded_models: list[str] = []
    for name in avail_models:
        try:
            files = fetch_json(f"https://api.polyhaven.com/files/{name}")
            gltf_dict = files.get("gltf", {})
            if not gltf_dict:
                continue
            res = "1k" if "1k" in gltf_dict else next(iter(gltf_dict.keys()))
            gltf_entry = gltf_dict[res]["gltf"]
            model_dir = DIRS["models"] / "polyhaven" / name
            model_dir.mkdir(parents=True, exist_ok=True)
            gltf_dest = model_dir / Path(gltf_entry["url"]).name
            download_file(gltf_entry["url"], gltf_dest, f"3D {name} (.gltf)")
            for rel_path, inc in gltf_entry.get("include", {}).items():
                inc_dest = model_dir / rel_path
                download_file(inc["url"], inc_dest, f"3D {name}/{rel_path}")
            downloaded_models.append(str(gltf_dest.relative_to(ROOT)))
        except Exception as e:
            print(f"[WARN] Model {name}: {e}")

    return {
        "counts": {k: len(v) for k, v in catalog.items()},
        "hdris": downloaded_hdris,
        "textures": downloaded_textures,
        "models": downloaded_models,
    }


def download_hf_models_6gb() -> dict[str, Any]:
    from huggingface_hub import hf_hub_download

    results: dict[str, Any] = {}

    # 1. Stability AI TripoSR (~1.68 GB) - Native 6GB VRAM single-image-to-3D
    triposr_dir = DIRS["ai_3d"] / "TripoSR"
    triposr_dir.mkdir(parents=True, exist_ok=True)
    print("[HF  ] Downloading stabilityai/TripoSR (1.68 GB, 6GB VRAM native)...")
    tripo_files = ["config.yaml", "model.ckpt"]
    tripo_saved = []
    for fname in tripo_files:
        p = hf_hub_download(
            repo_id="stabilityai/TripoSR",
            filename=fname,
            local_dir=str(triposr_dir),
        )
        tripo_saved.append(str(Path(p).relative_to(ROOT)))
    results["TripoSR"] = {"dir": str(triposr_dir.relative_to(ROOT)), "files": tripo_saved}

    # 2. Tencent Hunyuan3D-2mini-turbo (0.6B fp16, ~4.23 GB total) - fits 6GB VRAM w/ fp16 offload
    hy_dir = DIRS["ai_3d"] / "Hunyuan3D-2mini"
    hy_dir.mkdir(parents=True, exist_ok=True)
    print("[HF  ] Downloading tencent/Hunyuan3D-2mini turbo fp16 (~4.23 GB, 6GB VRAM optimized)...")
    hy_files = [
        "hunyuan3d-dit-v2-mini-turbo/config.yaml",
        "hunyuan3d-dit-v2-mini-turbo/model.fp16.safetensors",
        "hunyuan3d-vae-v2-mini-turbo/config.yaml",
        "hunyuan3d-vae-v2-mini-turbo/model.fp16.safetensors",
    ]
    hy_saved = []
    for fname in hy_files:
        p = hf_hub_download(
            repo_id="tencent/Hunyuan3D-2mini",
            filename=fname,
            local_dir=str(hy_dir),
        )
        hy_saved.append(str(Path(p).relative_to(ROOT)))
    results["Hunyuan3D-2mini-turbo"] = {"dir": str(hy_dir.relative_to(ROOT)), "files": hy_saved}
    return results


def main() -> None:
    ensure_dirs()
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else {"anatomy", "mpfb2", "polyhaven", "ai_3d"}
    manifest_path = BASE_DIR / "manifest.json"
    manifest: dict[str, Any] = {}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}

    if "anatomy" in only:
        manifest["z_anatomy"] = download_z_anatomy()
    if "mpfb2" in only:
        manifest["mpfb2"] = download_mpfb2_extension()
    if "polyhaven" in only:
        manifest["polyhaven"] = download_polyhaven_catalog_and_starter_pack()
    if "ai_3d" in only:
        manifest["ai_3d_6gb"] = download_hf_models_6gb()

    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\n[ALL DONE] Manifest written to {manifest_path}")


if __name__ == "__main__":
    main()
