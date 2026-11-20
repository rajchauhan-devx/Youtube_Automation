"""
Search & download any of the 46,207 tagged 3D .glb models from Objaverse 1.0
into assets/blender_pretrained/models/objaverse_cache/ for instant Blender import.

Usage:
  python scripts/fetch_objaverse_model.py "helicopter" --count 3
  python scripts/fetch_objaverse_model.py --list "car"
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = ROOT / "assets" / "blender_pretrained" / "indexes" / "objaverse_lvis_annotations.json"
CACHE_DIR = ROOT / "assets" / "blender_pretrained" / "models" / "objaverse_cache"


def search_lvis(query: str, limit: int = 20) -> list[tuple[str, str]]:
    import re
    lvis = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    q = query.lower().strip()
    word_re = re.compile(rf"(^|[_\(\s-]){re.escape(q)}($|[_\)\s-])")
    hits: list[tuple[str, str]] = []
    seen: set[str] = set()
    # Priority: exact -> word-boundary match -> substring match
    tiers = [
        lambda c: c.lower() == q,
        lambda c: bool(word_re.search(c.lower())),
        lambda c: q in c.lower(),
    ]
    for pred in tiers:
        for cat, uids in lvis.items():
            if pred(cat):
                for uid in uids:
                    if uid not in seen:
                        seen.add(uid)
                        hits.append((cat, uid))
                        if len(hits) >= limit:
                            return hits
    return hits


def main() -> None:
    parser = argparse.ArgumentParser(description="Search & download Objaverse .glb 3D models")
    parser.add_argument("query", help="Category/keyword to search (e.g. 'heart', 'car', 'drill', 'airplane')")
    parser.add_argument("--count", type=int, default=2, help="Number of .glb models to download")
    parser.add_argument("--list", action="store_true", help="Only list matching categories & UIDs without downloading")
    args = parser.parse_args()

    if not INDEX_PATH.exists():
        raise FileNotFoundError(f"Objaverse LVIS index not found at {INDEX_PATH}")

    hits = search_lvis(args.query, limit=max(args.count, 20))
    if not hits:
        print(f"No Objaverse LVIS matches found for '{args.query}'.")
        return

    if args.list:
        for cat, uid in hits:
            print(f"{cat}\t{uid}")
        return

    import objaverse

    selected = hits[: args.count]
    uids = [uid for _, uid in selected]
    print(f"Downloading {len(uids)} Objaverse model(s) for '{args.query}'...")
    paths = objaverse.load_objects(uids=uids, download_processes=2)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for cat, uid in selected:
        src = Path(paths[uid])
        safe_cat = "".join(c if c.isalnum() or c in "-_" else "_" for c in cat)
        dest = CACHE_DIR / f"{safe_cat}_{uid[:10]}{src.suffix}"
        if not dest.exists():
            shutil.copy2(src, dest)
        print(f"[READY] {cat} -> {dest}")


if __name__ == "__main__":
    main()
