"""Pinned, pretrained Chatterbox assets. No training or weight modification."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

import requests
from huggingface_hub import hf_hub_download, try_to_load_from_cache
from huggingface_hub.constants import HF_HUB_CACHE

BASE_REPO = "ResembleAI/chatterbox"
BASE_REVISION = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"
HINDI_REPO = "ResembleAI/Chatterbox-Multilingual-hi"
HINDI_REVISION = "82ca71273cc2a9ab19efdf8315f865c1a5af0ee7"
TOKENIZER_FILE = "grapheme_mtl_merged_expanded_v1.json"
HINDI_FILES = {
    "t3_hi.safetensors": "89fd813802e2cf7350d609959cec4dae63dd58f445651b05009262d7e24780f9",
    "s3gen_v3.safetensors": "4a46190f3dccc2230fbb3488a930bccc925862ee68f2662433dfcfe93ce6c2cb",
}
HINDI_REFERENCE_URL = "https://storage.googleapis.com/chatterbox-demo-samples/mtl_prompts/hi_f1.flac"
DATA_ROOT = Path(os.getenv("TUBEFLOW_DATA_DIR", Path(__file__).resolve().parent.parent / "data")).resolve()
CACHE_DIR = Path(os.getenv("CHATTERBOX_MODEL_CACHE", DATA_ROOT / "model-cache" / "huggingface"))


def model_id(language: str, version: str = "v3") -> str:
    return "chatterbox-hindi-v3" if language == "hi" else f"chatterbox-multilingual-{version}"


def asset(repo: str, filename: str, revision: str) -> Path:
    # Read existing caches before contacting the network. Never modify a shared
    # snapshot or put Hindi weights into the base model's directory.
    for cache in dict.fromkeys([str(CACHE_DIR), HF_HUB_CACHE, str(Path.home() / ".cache/huggingface/hub")]):
        cached = try_to_load_from_cache(repo, filename, revision=revision, cache_dir=cache)
        if isinstance(cached, str) and Path(cached).is_file():
            return Path(cached)
    return Path(hf_hub_download(repo, filename, revision=revision, cache_dir=str(CACHE_DIR)))


def hindi_reference() -> Path:
    configured = os.getenv("CHATTERBOX_HINDI_REFERENCE")
    if configured:
        reference = Path(configured).expanduser().resolve()
        if not reference.is_file():
            raise FileNotFoundError(f"Hindi reference recording does not exist: {reference}")
        return reference
    reference = DATA_ROOT / "model-cache/hindi/native-hi-female.flac"
    if not reference.is_file():
        reference.parent.mkdir(parents=True, exist_ok=True)
        temporary = reference.with_suffix(".flac.part")
        try:
            with requests.get(HINDI_REFERENCE_URL, stream=True, timeout=(15, 60)) as response:
                response.raise_for_status()
                with temporary.open("wb") as output:
                    for chunk in response.iter_content(64 * 1024):
                        output.write(chunk)
            temporary.replace(reference)
        finally:
            temporary.unlink(missing_ok=True)
    return reference


def verify_hindi_weights() -> None:
    for filename, expected in HINDI_FILES.items():
        digest = hashlib.sha256()
        with asset(HINDI_REPO, filename, HINDI_REVISION).open("rb") as source:
            for chunk in iter(lambda: source.read(4 * 1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected:
            raise ValueError(f"The pretrained Hindi file failed SHA256 verification: {filename}")


def load_model(language: str, device: str, version: str = "v3"):
    """Use the installed inference engine with the official language assets."""
    import torch
    from safetensors.torch import load_file
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS, Conditionals, _resolve_multilingual_t3_model
    from chatterbox.models.t3 import T3
    from chatterbox.models.t3.modules.t3_config import T3Config
    from chatterbox.models.s3gen import S3Gen
    from chatterbox.models.tokenizers import MTLTokenizer
    from chatterbox.models.voice_encoder import VoiceEncoder

    hindi = language == "hi"
    repo, revision = (HINDI_REPO, HINDI_REVISION) if hindi else (BASE_REPO, BASE_REVISION)
    t3_name = "t3_hi.safetensors" if hindi else _resolve_multilingual_t3_model(version)
    t3_path = asset(repo, t3_name, revision)
    decoder_path = asset(repo, "s3gen_v3.safetensors" if hindi else "s3gen.pt", revision)
    tokenizer_path = asset(repo, TOKENIZER_FILE, revision)
    encoder_path = asset(BASE_REPO, "ve.pt", BASE_REVISION)

    ve = VoiceEncoder()
    ve.load_state_dict(torch.load(encoder_path, map_location="cpu", weights_only=True))
    ve.to(device).eval().requires_grad_(False)

    # Both the official Hindi demo and multilingual V3 use a 2454 text-token
    # vocabulary and 8194 speech tokens. Strict loading catches incompatible files.
    t3 = T3(T3Config.multilingual())
    t3.load_state_dict(load_file(t3_path))
    t3.to(device).eval().requires_grad_(False)

    s3gen = S3Gen()
    state = load_file(decoder_path) if hindi else torch.load(decoder_path, map_location="cpu", weights_only=True)
    incompatible = s3gen.load_state_dict(state, strict=False)
    # S3Tokenizer computes these two buffers locally; the official Hindi decoder
    # omits them. Fail on any missing learned weights or other unexpected keys.
    allowed_missing = {"tokenizer._mel_filters", "tokenizer.window"}
    if set(incompatible.missing_keys) - allowed_missing or incompatible.unexpected_keys:
        raise RuntimeError(f"Incompatible speech decoder: {incompatible}")
    del state
    s3gen.to(device).eval().requires_grad_(False)

    tokenizer = MTLTokenizer(str(tokenizer_path))
    model = ChatterboxMultilingualTTS(t3, s3gen, ve, tokenizer, device)
    if hindi:
        # Match the official Hindi demo's native Hindi reference, rather than
        # conditioning Hindi speech on the base model's English default voice.
        with torch.inference_mode():
            model.prepare_conditionals(str(hindi_reference()))
    else:
        model.conds = Conditionals.load(asset(BASE_REPO, "conds.pt", BASE_REVISION)).to(device)
    return model
