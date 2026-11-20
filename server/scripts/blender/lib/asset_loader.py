"""
Unified Pretrained Asset Loader for Blender 5.3 (RTX 3050 6GB Optimized)
========================================================================
Loads ready-made pretrained 3D assets directly into any Blender scene without
hand-coding geometry vertex-by-vertex:

  1. Z-Anatomy Human Anatomy Atlas (.blend)  -> append specific organs/bones/muscles
  2. Poly Haven CC0 Library                  -> local + on-demand HDRIs, PBR textures, 3D models
  3. Objaverse 1.0 (46k LVIS / 800k models)  -> local catalog search + on-demand .glb import
  4. TripoSR / Hunyuan3D-2mini local meshes  -> import AI-generated .glb/.obj meshes
  5. Automated Zack D. Cutaway Modifiers     -> animated Boolean cross-section slice on any mesh
"""

from __future__ import annotations

import json
import math
import urllib.request
from pathlib import Path
from typing import Any, Iterable

try:
    import bpy
    from mathutils import Vector
except ImportError:  # Allows non-Blender unit inspection/search
    bpy = None
    Vector = None

REPO_ROOT = Path(__file__).resolve().parents[4]
PRETRAINED_DIR = REPO_ROOT / "assets" / "blender_pretrained"
ANATOMY_DIR = PRETRAINED_DIR / "anatomy" / "Z-Anatomy"
HDRI_DIR = PRETRAINED_DIR / "hdri"
TEXTURES_DIR = PRETRAINED_DIR / "textures"
MODELS_DIR = PRETRAINED_DIR / "models"
INDEXES_DIR = PRETRAINED_DIR / "indexes"
TEMPLATES_DIR = PRETRAINED_DIR / "templates"
OBJAVERSE_CACHE_DIR = MODELS_DIR / "objaverse_cache"

UA = "Mozilla/5.0 YoutubeAutomationBlenderLoader/1.0"


# ---------------------------------------------------------------------------
# 1. Z-Anatomy (.blend) Organ / Bone / Muscle Appender
# ---------------------------------------------------------------------------
def find_z_anatomy_blend() -> Path | None:
    if not ANATOMY_DIR.exists():
        return None
    blends = sorted(ANATOMY_DIR.rglob("*.blend"), key=lambda p: p.stat().st_size, reverse=True)
    return blends[0] if blends else None


def list_z_anatomy_objects(filter_keyword: str = "") -> list[str]:
    """List object names available inside the local Z-Anatomy .blend atlas."""
    if bpy is None:
        raise RuntimeError("list_z_anatomy_objects must be called inside Blender.")
    blend_path = find_z_anatomy_blend()
    if not blend_path:
        raise FileNotFoundError(f"Z-Anatomy .blend not found under {ANATOMY_DIR}")
    kw = filter_keyword.lower().strip()
    with bpy.data.libraries.load(str(blend_path), link=False) as (data_from, _):
        names = list(data_from.objects)
    if kw:
        names = [n for n in names if kw in n.lower()]
    return names


def load_z_anatomy_objects(
    keywords: Iterable[str],
    collection_name: str = "Z_Anatomy_Imported",
    max_objects: int = 30,
    meshes_only: bool = True,
) -> list[Any]:
    """Append matching anatomical structures (e.g. ['heart', 'aorta']) from Z-Anatomy."""
    if bpy is None:
        raise RuntimeError("load_z_anatomy_objects must be called inside Blender.")
    blend_path = find_z_anatomy_blend()
    if not blend_path:
        raise FileNotFoundError(f"Z-Anatomy .blend not found under {ANATOMY_DIR}")

    kws = [k.lower().strip() for k in keywords if k.strip()]
    label_suffixes = (".t", ".j", ".g", ".s")
    with bpy.data.libraries.load(str(blend_path), link=False) as (data_from, data_to):
        matched = [
            name for name in data_from.objects
            if any(k in name.lower() for k in kws)
            and (not meshes_only or not name.lower().endswith(label_suffixes))
        ][:max_objects]
        data_to.objects = matched

    col = bpy.data.collections.get(collection_name)
    if col is None:
        col = bpy.data.collections.new(collection_name)
        bpy.context.scene.collection.children.link(col)

    imported = []
    for obj in data_to.objects:
        if obj is not None:
            if meshes_only and obj.type != "MESH":
                bpy.data.objects.remove(obj, do_unlink=True)
                continue
            col.objects.link(obj)
            imported.append(obj)
    return imported


# ---------------------------------------------------------------------------
# 2. Poly Haven HDRIs, PBR Materials & 3D Models (Local + On-Demand)
# ---------------------------------------------------------------------------
def _fetch_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _download_file(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as resp, open(dest, "wb") as out:
        out.write(resp.read())
    return dest


def search_polyhaven(kind: str, query: str, limit: int = 10) -> list[str]:
    """Search the offline Poly Haven index ('hdris', 'textures', or 'models')."""
    idx_path = INDEXES_DIR / f"polyhaven_{kind}.json"
    if not idx_path.exists():
        return []
    catalog = json.loads(idx_path.read_text(encoding="utf-8"))
    q = query.lower().strip()
    matches = []
    for asset_id, meta in catalog.items():
        haystack = " ".join([
            asset_id,
            str(meta.get("name", "")),
            " ".join(meta.get("tags", [])),
            " ".join(meta.get("categories", [])),
        ]).lower()
        if q in haystack:
            matches.append(asset_id)
            if len(matches) >= limit:
                break
    return matches


def apply_polyhaven_hdri(hdri_name: str = "studio_small_08", strength: float = 1.0, resolution: str = "2k") -> Path:
    """Apply a local (or auto-downloaded) Poly Haven HDRI to the Blender World shader."""
    if bpy is None:
        raise RuntimeError("apply_polyhaven_hdri must be called inside Blender.")

    local_matches = list(HDRI_DIR.glob(f"{hdri_name}*.hdr")) + list(HDRI_DIR.glob(f"{hdri_name}*.exr"))
    if local_matches:
        hdri_path = local_matches[0]
    else:
        files = _fetch_json(f"https://api.polyhaven.com/files/{hdri_name}")
        hdri_info = files["hdri"]
        res = resolution if resolution in hdri_info else next(iter(hdri_info.keys()))
        fmt = "hdr" if "hdr" in hdri_info[res] else next(iter(hdri_info[res].keys()))
        hdri_path = _download_file(hdri_info[res][fmt]["url"], HDRI_DIR / f"{hdri_name}_{res}.{fmt}")

    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    nt = scene.world.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(hdri_path), check_existing=True)

    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return hdri_path


def load_polyhaven_pbr_material(texture_name: str, uv_scale: float = 1.0) -> Any:
    """Create a Blender Principled BSDF material from a local (or on-demand) Poly Haven texture."""
    if bpy is None:
        raise RuntimeError("load_polyhaven_pbr_material must be called inside Blender.")

    tex_dir = TEXTURES_DIR / texture_name
    if not tex_dir.exists() or not any(tex_dir.iterdir()):
        files = _fetch_json(f"https://api.polyhaven.com/files/{texture_name}")
        tex_dir.mkdir(parents=True, exist_ok=True)
        for map_name in ("Diffuse", "Rough", "nor_gl"):
            if map_name in files and "1k" in files[map_name]:
                fmt = "jpg" if "jpg" in files[map_name]["1k"] else next(iter(files[map_name]["1k"].keys()))
                _download_file(files[map_name]["1k"][fmt]["url"], tex_dir / f"{texture_name}_{map_name.lower()}_1k.{fmt}")

    mat = bpy.data.materials.new(name=f"PH_{texture_name}")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (uv_scale, uv_scale, uv_scale)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])

    def _find_map(tag: str) -> Path | None:
        hits = list(tex_dir.glob(f"*_{tag}_*"))
        return hits[0] if hits else None

    diff_p = _find_map("diffuse")
    if diff_p:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(diff_p), check_existing=True)
        tex.projection = "BOX"
        nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    rough_p = _find_map("rough")
    if rough_p:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(rough_p), check_existing=True)
        tex.image.colorspace_settings.name = "Non-Color"
        tex.projection = "BOX"
        nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Roughness"])

    nor_p = _find_map("nor_gl")
    if nor_p:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(nor_p), check_existing=True)
        tex.image.colorspace_settings.name = "Non-Color"
        tex.projection = "BOX"
        nrm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], nrm.inputs["Color"])
        nt.links.new(nrm.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def import_gltf_normalized(
    filepath: str | Path,
    target_size: float = 2.0,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    name_prefix: str = "ImportedAsset",
) -> Any:
    """Import a .glb/.gltf file, parent under a clean root Empty, normalize scale & place at location."""
    if bpy is None:
        raise RuntimeError("import_gltf_normalized must be called inside Blender.")

    filepath = Path(filepath)
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(filepath))
    new_objs = [o for o in bpy.context.scene.objects if o not in before]

    root = bpy.data.objects.new(name_prefix, None)
    bpy.context.scene.collection.objects.link(root)

    top_level = [o for o in new_objs if o.parent is None]
    for o in top_level:
        o.parent = root

    # Compute combined world bounding box for mesh objects
    meshes = [o for o in new_objs if o.type == "MESH"]
    if meshes and target_size > 0:
        bpy.context.view_layer.update()
        mins = [float("inf")] * 3
        maxs = [float("-inf")] * 3
        for m in meshes:
            for corner in m.bound_box:
                wc = m.matrix_world @ Vector(corner)
                for i in range(3):
                    mins[i] = min(mins[i], wc[i])
                    maxs[i] = max(maxs[i], wc[i])
        max_dim = max(maxs[i] - mins[i] for i in range(3))
        if max_dim > 1e-5:
            scale = target_size / max_dim
            root.scale = (scale, scale, scale)

    root.location = location
    return root


def import_polyhaven_model(model_name: str, target_size: float = 2.0, location=(0.0, 0.0, 0.0)) -> Any:
    """Import a local (or auto-downloaded) Poly Haven CC0 3D model."""
    model_dir = MODELS_DIR / "polyhaven" / model_name
    gltfs = list(model_dir.glob("*.gltf")) + list(model_dir.glob("*.glb"))
    if not gltfs:
        files = _fetch_json(f"https://api.polyhaven.com/files/{model_name}")
        gltf_dict = files["gltf"]
        res = "1k" if "1k" in gltf_dict else next(iter(gltf_dict.keys()))
        entry = gltf_dict[res]["gltf"]
        model_dir.mkdir(parents=True, exist_ok=True)
        gltf_dest = _download_file(entry["url"], model_dir / Path(entry["url"]).name)
        for rel_path, inc in entry.get("include", {}).items():
            _download_file(inc["url"], model_dir / rel_path)
        gltfs = [gltf_dest]
    return import_gltf_normalized(gltfs[0], target_size=target_size, location=location, name_prefix=f"PH_{model_name}")


# ---------------------------------------------------------------------------
# 3. Objaverse 1.0 Local Catalog Search (46,000+ Categorized 3D Models)
# ---------------------------------------------------------------------------
def search_objaverse_lvis(keyword: str, limit: int = 10) -> list[tuple[str, str]]:
    """Return [(category, uid), ...] matching keyword from local Objaverse LVIS index."""
    import re
    idx_path = INDEXES_DIR / "objaverse_lvis_annotations.json"
    if not idx_path.exists():
        return []
    lvis = json.loads(idx_path.read_text(encoding="utf-8"))
    kw = keyword.lower().strip()
    word_re = re.compile(rf"(^|[_\(\s-]){re.escape(kw)}($|[_\)\s-])")
    results: list[tuple[str, str]] = []
    seen: set[str] = set()
    tiers = [
        lambda c: c.lower() == kw,
        lambda c: bool(word_re.search(c.lower())),
        lambda c: kw in c.lower(),
    ]
    for pred in tiers:
        for cat, uids in lvis.items():
            if pred(cat):
                for uid in uids:
                    if uid not in seen:
                        seen.add(uid)
                        results.append((cat, uid))
                        if len(results) >= limit:
                            return results
    return results


# ---------------------------------------------------------------------------
# 4. Automated Zack D. Films Animated Boolean Cross-Section Cutaway
# ---------------------------------------------------------------------------
def apply_animated_cutaway(
    target_obj: Any,
    axis: str = "Y",
    start_frame: int = 1,
    end_frame: int = 48,
    cutter_size: float = 10.0,
) -> Any:
    """Apply an animated Boolean Difference cross-section slicer to any mesh."""
    if bpy is None:
        raise RuntimeError("apply_animated_cutaway must be called inside Blender.")

    bpy.ops.mesh.primitive_cube_add(size=cutter_size, location=target_obj.location)
    cutter = bpy.context.active_object
    cutter.name = f"CutawaySlicer_{target_obj.name}"
    cutter.display_type = "WIRE"
    cutter.hide_render = True

    axis_idx = {"X": 0, "Y": 1, "Z": 2}[axis.upper()]
    start_loc = list(target_obj.location)
    end_loc = list(target_obj.location)
    start_loc[axis_idx] -= cutter_size
    end_loc[axis_idx] -= cutter_size * 0.5

    cutter.location = start_loc
    cutter.keyframe_insert(data_path="location", frame=start_frame)
    cutter.location = end_loc
    cutter.keyframe_insert(data_path="location", frame=end_frame)

    mod = target_obj.modifiers.new(name="ZackD_Cutaway", type="BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "FAST"
    mod.object = cutter
    return cutter
