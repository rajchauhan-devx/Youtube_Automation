"""Download pretrained inference assets only; this script never trains a model."""
import argparse
import os
from pathlib import Path

from model_assets import (
    BASE_REPO, BASE_REVISION, HINDI_REPO, HINDI_REVISION, HINDI_FILES,
    TOKENIZER_FILE, asset, hindi_reference, verify_hindi_weights,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="Verify the official Hindi weight SHA256 hashes")
    args = parser.parse_args()

    from spacy_pkuseg import pkuseg
    pkuseg_home = Path(os.environ.setdefault("PKUSEG_HOME", str(Path(__file__).resolve().parent.parent / "data/model-cache/pkuseg")))
    pkuseg_home.mkdir(parents=True, exist_ok=True)
    pkuseg()

    for filename in ("ve.pt", "t3_mtl23ls_v3.safetensors", "s3gen.pt", TOKENIZER_FILE, "conds.pt", "Cangjie5_TC.json"):
        print(f"English/shared: {asset(BASE_REPO, filename, BASE_REVISION)}", flush=True)
    for filename in (*HINDI_FILES, TOKENIZER_FILE):
        print(f"Hindi: {asset(HINDI_REPO, filename, HINDI_REVISION)}", flush=True)
    print(f"Native Hindi reference: {hindi_reference()}", flush=True)
    if args.verify:
        verify_hindi_weights()
        print("Official Hindi checkpoint SHA256 hashes verified.", flush=True)
    print("Pretrained Hindi and English voiceover assets are ready. No training required.")


if __name__ == "__main__":
    main()
