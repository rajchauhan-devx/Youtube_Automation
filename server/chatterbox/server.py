from __future__ import annotations

import argparse
import io
import json
import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Literal

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from prosody import _segments, prepare_audio, gap_samples, boundary_pause, normalize_for_speech, REVISION


logging.basicConfig(
    level=os.getenv("CHATTERBOX_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
LOGGER = logging.getLogger("tubeflow.chatterbox")

SERVICE_DIR = Path(__file__).resolve().parent
DATA_ROOT = Path(os.getenv("TUBEFLOW_DATA_DIR", SERVICE_DIR.parent / "data")).resolve()
VOICE_DIR = Path(os.getenv("CHATTERBOX_VOICE_DIR", DATA_ROOT / "voices")).resolve()
VOICE_DIR.mkdir(parents=True, exist_ok=True)

MODEL_VERSION = os.getenv("CHATTERBOX_T3_MODEL", "v3")
REQUESTED_DEVICE = os.getenv("CHATTERBOX_DEVICE", "auto").lower()
MAX_INPUT_CHARS = int(os.getenv("CHATTERBOX_MAX_INPUT_CHARS", "50000"))
# Longer chunks keep 1-2 full sentences in one model call so intonation has
# context. 280 chars forced mid-sentence cuts and flat list prosody.
MAX_CHUNK_CHARS = int(os.getenv("CHATTERBOX_MAX_CHUNK_CHARS", "420"))

MODEL: ChatterboxMultilingualTTS | None = None
BUILTIN_CONDITIONALS = None
MODEL_STATE: Literal["loading", "ready", "error"] = "loading"
MODEL_ERROR: str | None = None
ACTIVE_DEVICE = "unknown"
MODEL_LOAD_STARTED_AT = time.time()
MODEL_READY_AT: float | None = None
MODEL_LOCK = threading.Lock()
GENERATION_LOCK = threading.Lock()


class SpeechRequest(BaseModel):
    model: str = "chatterbox-multilingual-v3"
    input: str = Field(min_length=1, max_length=MAX_INPUT_CHARS)
    voice: str = "builtin"
    voice_path: str | None = None
    language: Literal["en", "hi"] = "en"
    response_format: Literal["wav"] = "wav"
    exaggeration: float = Field(default=0.5, ge=0.25, le=1.5)
    cfg_weight: float = Field(default=0.5, ge=0.0, le=1.0)
    temperature: float = Field(default=0.8, ge=0.05, le=2.0)
    seed: int = Field(default=0, ge=0, le=2_147_483_647)
    repetition_penalty: float = Field(default=1.2, ge=1.0, le=2.0)


def _mps_available() -> bool:
    return bool(hasattr(torch.backends, "mps") and torch.backends.mps.is_available())


def _select_device() -> str:
    if REQUESTED_DEVICE in {"cpu", "cuda", "mps"}:
        if REQUESTED_DEVICE == "cuda" and not torch.cuda.is_available():
            raise RuntimeError(
                "CHATTERBOX_DEVICE=cuda but CUDA is unavailable. Install the CUDA PyTorch build "
                "or set CHATTERBOX_DEVICE=cpu."
            )
        if REQUESTED_DEVICE == "mps" and not _mps_available():
            raise RuntimeError(
                "CHATTERBOX_DEVICE=mps but Apple MPS is unavailable. Set CHATTERBOX_DEVICE=cpu."
            )
        return REQUESTED_DEVICE
    if torch.cuda.is_available():
        return "cuda"
    if _mps_available():
        return "mps"
    return "cpu"


def _load_model() -> None:
    global MODEL, BUILTIN_CONDITIONALS, MODEL_STATE, MODEL_ERROR, ACTIVE_DEVICE, MODEL_READY_AT
    with MODEL_LOCK:
        if MODEL is not None or MODEL_STATE == "ready":
            return
        try:
            ACTIVE_DEVICE = _select_device()
            if ACTIVE_DEVICE == "cuda":
                torch.backends.cuda.matmul.allow_tf32 = True
                gpu_name = torch.cuda.get_device_name(0)
                free_bytes, total_bytes = torch.cuda.mem_get_info(0)
                LOGGER.info(
                    "Loading Chatterbox Multilingual %s on %s (%.1f/%.1f GiB free)",
                    MODEL_VERSION,
                    gpu_name,
                    free_bytes / (1024**3),
                    total_bytes / (1024**3),
                )
            elif ACTIVE_DEVICE == "mps":
                LOGGER.info("Loading Chatterbox Multilingual %s on Apple Silicon MPS", MODEL_VERSION)
            else:
                LOGGER.warning("GPU acceleration is unavailable; Chatterbox will run on CPU and may be slow")

            loaded = ChatterboxMultilingualTTS.from_pretrained(
                device=ACTIVE_DEVICE,
                t3_model=MODEL_VERSION,
            )
            MODEL = loaded
            BUILTIN_CONDITIONALS = loaded.conds
            MODEL_STATE = "ready"
            MODEL_ERROR = None
            MODEL_READY_AT = time.time()
            LOGGER.info("Chatterbox is ready on %s", ACTIVE_DEVICE)
        except Exception as exc:  # startup failure must remain visible through /health
            MODEL = None
            MODEL_STATE = "error"
            MODEL_ERROR = f"{type(exc).__name__}: {exc}"
            LOGGER.exception("Failed to load Chatterbox")


def _voice_metadata() -> list[dict]:
    voices: list[dict] = [
        {
            "id": "builtin",
            "name": "Chatterbox Natural",
            "description": "Built-in multilingual narrator. Upload a reference for the most natural regional voice.",
            "gender": "neutral",
            "language": "multi",
            "source": "builtin",
            "deletable": False,
        }
    ]
    for metadata_path in sorted(VOICE_DIR.glob("*.json")):
        if not (metadata_path.name.startswith("clone_") or metadata_path.name.startswith("preset_")):
            continue
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            voice_id = str(metadata.get("id", ""))
            wav_path = VOICE_DIR / f"{voice_id}.wav"
            if re.fullmatch(r"(?:clone_[a-f0-9-]{36}|preset_[a-z0-9_]+)", voice_id) and wav_path.is_file():
                is_preset = voice_id.startswith("preset_")
                voices.append(
                    {
                        "id": voice_id,
                        "name": str(metadata.get("name") or ("Preset voice" if is_preset else "Custom voice")),
                        "description": str(metadata.get("description") or ("Curated studio character voice." if is_preset else "Local voice clone from an authorized reference recording.")),
                        "gender": str(metadata.get("gender") or "neutral"),
                        "language": str(metadata.get("language") or "multi"),
                        "source": "preset" if is_preset else "clone",
                        "deletable": False if is_preset else bool(metadata.get("deletable", True)),
                    }
                )
        except (OSError, ValueError, TypeError):
            LOGGER.warning("Ignoring invalid voice metadata: %s", metadata_path)
    return voices


def _voice_roots() -> list[Path]:
    """Directories a reference may legally live in: the shared library plus each
    account's private library under <data>/accounts/<id>/voices."""
    return sorted({VOICE_DIR.resolve(), (DATA_ROOT / "voices").resolve(), (DATA_ROOT / "accounts").resolve()})


def _resolve_voice_path(voice_id: str, explicit: str | None = None) -> Path | None:
    if voice_id == "builtin":
        return None
    if not re.fullmatch(r"(?:clone_[a-f0-9-]{36}|preset_[a-z0-9_]+)", voice_id):
        raise ValueError("Invalid local voice identifier")
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
        if candidate.name != f"{voice_id}.wav" or not candidate.is_file():
            raise ValueError("The selected local voice reference does not exist")
        if not any(candidate.is_relative_to(root) for root in _voice_roots()):
            raise ValueError("The selected local voice reference is outside the voice library")
        return candidate
    candidate = (VOICE_DIR / f"{voice_id}.wav").resolve()
    if candidate.parent != VOICE_DIR or not candidate.is_file():
        raise ValueError("The selected local voice reference does not exist")
    return candidate


def _seed_everything(seed: int) -> None:
    if seed <= 0:
        return
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    elif _mps_available() and hasattr(torch, "mps") and hasattr(torch.mps, "manual_seed"):
        torch.mps.manual_seed(seed)



def _terminated(chunk: str, language: str) -> str:
    """End every model call with real terminal punctuation.

    The old code appended a comma to unterminated chunks, which forced flat
    list intonation across the whole episode. Declaratives get a full stop
    (Devanagari danda for Hindi), questions/exclamations are preserved.
    """
    text = str(chunk).strip()
    if re.search(r"[.!?।,…:;…]$", text):
        return text
    if language == "hi":
        return text + "।"
    return text + "."


def _generate(request: SpeechRequest) -> tuple[bytes, int]:
    global MODEL
    if MODEL_STATE != "ready" or MODEL is None:
        raise RuntimeError(MODEL_ERROR or f"Model is {MODEL_STATE}")

    parsed = _segments(request.input, MAX_CHUNK_CHARS, request.language)
    text_count = sum(1 for kind, _ in parsed if kind == "text")
    if text_count == 0:
        raise ValueError("Input contains no speakable text")

    with GENERATION_LOCK:
        # A fixed seed keeps the whole episode in one voice. Seed 0 used to
        # mean "random every chunk" so timbre drifted mid-sentence. Now a
        # single random base is drawn per request and derived per chunk.
        import random as _random
        base_seed = int(request.seed) if request.seed else _random.randint(1, 2_147_483_647)
        _seed_everything(base_seed)
        voice_path = _resolve_voice_path(request.voice, request.voice_path)
        if voice_path is not None:
            MODEL.prepare_conditionals(str(voice_path), exaggeration=request.exaggeration)
        else:
            MODEL.conds = BUILTIN_CONDITIONALS

        sample_rate = int(MODEL.sr)
        output_parts: list[np.ndarray] = []
        previous_audio = None
        previous_text = ""
        pending_pause = 0
        text_index = 0
        for kind, value in parsed:
            if kind == "pause":
                pending_pause += int(value)
                continue

            text_index += 1
            _seed_everything(base_seed + text_index - 1)
            LOGGER.info("Generating chunk %d/%d (%d chars)", text_index, text_count, len(str(value)))
            spoken = normalize_for_speech(_terminated(value, request.language), request.language)
            # Hindi repeats है/का/में constantly; the default 1.2 penalty can
            # skip or garble them. 1.15 keeps Hindi stable without dulling English.
            rp = 1.15 if request.language == "hi" and request.repetition_penalty >= 1.2 else request.repetition_penalty
            waveform = MODEL.generate(
                spoken,
                language_id=request.language,
                audio_prompt_path=None,
                exaggeration=request.exaggeration,
                cfg_weight=request.cfg_weight,
                temperature=request.temperature,
                repetition_penalty=rp,
            )
            audio = prepare_audio(waveform.squeeze().detach().cpu().float().numpy(), sample_rate)
            if previous_audio is not None:
                pause = pending_pause if pending_pause else boundary_pause(previous_text, request.language)
                gap = gap_samples(previous_audio, audio, sample_rate, pause)
                if gap:
                    output_parts.append(np.zeros(gap, dtype=np.float32))
            elif pending_pause:
                output_parts.append(np.zeros(round(sample_rate * pending_pause / 1000), dtype=np.float32))
            output_parts.append(audio)
            previous_audio, previous_text, pending_pause = audio, str(value), 0

        if pending_pause:
            output_parts.append(np.zeros(round(sample_rate * pending_pause / 1000), dtype=np.float32))

        final_audio = np.concatenate(output_parts)
        peak = float(np.max(np.abs(final_audio))) if len(final_audio) else 0.0
        if peak > 0.0001:
            final_audio = final_audio * min(1.0, 0.891 / peak)

        output = io.BytesIO()
        sf.write(output, final_audio, sample_rate, format="WAV", subtype="PCM_16")
        return output.getvalue(), text_count


from contextlib import asynccontextmanager


def _start_loader() -> None:
    thread = threading.Thread(target=_load_model, name="chatterbox-model-loader", daemon=True)
    thread.start()


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    _start_loader()
    yield


app = FastAPI(title="TubeFlow Local Chatterbox TTS", version="1.0.0", lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://127.0.0.1:3001"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health() -> dict:
    gpu: dict | None = None
    if torch.cuda.is_available():
        free_bytes, total_bytes = torch.cuda.mem_get_info(0)
        gpu = {
            "name": torch.cuda.get_device_name(0),
            "free_vram_mb": round(free_bytes / (1024**2)),
            "total_vram_mb": round(total_bytes / (1024**2)),
        }
    elif _mps_available():
        gpu = {
            "name": "Apple Silicon (MPS)",
        }
    return {
        "online": True,
        "ready": MODEL_STATE == "ready",
        "state": MODEL_STATE,
        "error": MODEL_ERROR,
        "provider": "chatterbox",
        "synthesis_revision": REVISION,
        "model": f"chatterbox-multilingual-{MODEL_VERSION}",
        "device": ACTIVE_DEVICE,
        "gpu": gpu,
        "load_elapsed_seconds": round(time.time() - MODEL_LOAD_STARTED_AT, 1),
        "ready_at": MODEL_READY_AT,
    }


@app.get("/v1/models")
def models() -> dict:
    return {
        "object": "list",
        "data": [
            {
                "id": f"chatterbox-multilingual-{MODEL_VERSION}",
                "object": "model",
                "owned_by": "ResembleAI",
                "ready": MODEL_STATE == "ready",
            }
        ],
    }


@app.get("/v1/voices")
def voices() -> dict:
    return {"voices": _voice_metadata()}


@app.post("/v1/audio/speech")
def speech(request: SpeechRequest) -> Response:
    if MODEL_STATE != "ready":
        raise HTTPException(status_code=503, detail=MODEL_ERROR or f"Chatterbox model is {MODEL_STATE}")
    started = time.perf_counter()
    try:
        audio, chunks = _generate(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except torch.cuda.OutOfMemoryError as exc:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        raise HTTPException(
            status_code=507,
            detail="CUDA ran out of memory. Close other GPU applications or set CHATTERBOX_DEVICE=cpu.",
        ) from exc
    except Exception as exc:
        LOGGER.exception("Speech generation failed")
        raise HTTPException(status_code=500, detail=f"Speech generation failed: {exc}") from exc

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={
            "Content-Disposition": 'inline; filename="speech.wav"',
            "X-TTS-Chunks": str(chunks),
            "X-Generation-Milliseconds": str(round((time.perf_counter() - started) * 1000)),
        },
    )


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="Local OpenAI-compatible Chatterbox TTS service")
    parser.add_argument("--host", default=os.getenv("CHATTERBOX_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("CHATTERBOX_PORT", "8880")))
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level=os.getenv("CHATTERBOX_LOG_LEVEL", "info").lower())
