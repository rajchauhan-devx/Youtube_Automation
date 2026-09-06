import os
from pathlib import Path

from huggingface_hub import snapshot_download
from spacy_pkuseg import pkuseg


pkuseg_home = Path(os.environ["PKUSEG_HOME"])
pkuseg_home.mkdir(parents=True, exist_ok=True)
pkuseg()
print(f"pkuseg tokenizer cached at: {pkuseg_home}")


snapshot_path = snapshot_download(
    repo_id="ResembleAI/chatterbox",
    repo_type="model",
    revision="main",
    allow_patterns=[
        "ve.pt",
        "t3_mtl23ls_v3.safetensors",
        "s3gen.pt",
        "grapheme_mtl_merged_expanded_v1.json",
        "conds.pt",
        "Cangjie5_TC.json",
    ],
)
print(f"Chatterbox Multilingual V3 cached at: {snapshot_path}")
