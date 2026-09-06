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


logging.basicConfig(
    level=os.getenv("CHATTERBOX_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
LOGGER = logging.getLogger("tubeflow.chatterbox")

SERVICE_DIR = Path(__file__).resolve().parent
VOICE_DIR = Path(os.getenv("CHATTERBOX_VOICE_DIR", SERVICE_DIR.parent / "data" / "voices")).resolve()
VOICE_DIR.mkdir(parents=True, exist_ok=True)

MODEL_VERSION = os.getenv("CHATTERBOX_T3_MODEL", "v3")
REQUESTED_DEVICE = os.getenv("CHATTERBOX_DEVICE", "auto").lower()
MAX_INPUT_CHARS = int(os.getenv("CHATTERBOX_MAX_INPUT_CHARS", "50000"))
MAX_CHUNK_CHARS = int(os.getenv("CHATTERBOX_MAX_CHUNK_CHARS", "280"))
DEFAULT_CROSSFADE_MS = int(os.getenv("CHATTERBOX_CROSSFADE_MS", "35"))

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
    language: Literal["en", "hi"] = "en"
    response_format: Literal["wav"] = "wav"
    exaggeration: float = Field(default=0.65, ge=0.25, le=1.5)
    cfg_weight: float = Field(default=0.35, ge=0.0, le=1.0)
    temperature: float = Field(default=0.8, ge=0.05, le=2.0)
    seed: int = Field(default=0, ge=0, le=2_147_483_647)
    repetition_penalty: float = Field(default=1.2, ge=1.0, le=2.0)


def _select_device() -> str:
    if REQUESTED_DEVICE in {"cpu", "cuda"}:
        if REQUESTED_DEVICE == "cuda" and not torch.cuda.is_available():
            raise RuntimeError(
                "CHATTERBOX_DEVICE=cuda but CUDA is unavailable. Install the CUDA PyTorch build "
                "or set CHATTERBOX_DEVICE=cpu."
            )
        return REQUESTED_DEVICE
    return "cuda" if torch.cuda.is_available() else "cpu"


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
            else:
                LOGGER.warning("CUDA is unavailable; Chatterbox will run on CPU and may be slow")

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
    for metadata_path in sorted(VOICE_DIR.glob("clone_*.json")):
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            voice_id = str(metadata.get("id", ""))
            wav_path = VOICE_DIR / f"{voice_id}.wav"
            if re.fullmatch(r"clone_[a-f0-9-]{36}", voice_id) and wav_path.is_file():
                voices.append(
                    {
                        "id": voice_id,
                        "name": str(metadata.get("name") or "Custom voice"),
                        "description": "Local voice clone from an authorized reference recording.",
                        "gender": str(metadata.get("gender") or "neutral"),
                        "language": str(metadata.get("language") or "multi"),
                        "source": "clone",
                        "deletable": True,
                    }
                )
        except (OSError, ValueError, TypeError):
            LOGGER.warning("Ignoring invalid voice metadata: %s", metadata_path)
    return voices


def _resolve_voice_path(voice_id: str) -> Path | None:
    if voice_id == "builtin":
        return None
    if not re.fullmatch(r"clone_[a-f0-9-]{36}", voice_id):
        raise ValueError("Invalid local voice identifier")
    candidate = (VOICE_DIR / f"{voice_id}.wav").resolve()
    if candidate.parent != VOICE_DIR or not candidate.is_file():
        raise ValueError("The selected local voice reference does not exist")
    return candidate


_PAUSE_PATTERN = re.compile(
    r"(?P<bracket>\[\s*(?:pause|break)\s*(?P<bnum>\d+(?:\.\d+)?)?\s*(?P<bunit>ms|s|sec|secs|second|seconds)?\s*\])"
    r"|(?P<paren>\(\s*pause\s*(?P<pnum>\d+(?:\.\d+)?)?\s*(?P<punit>ms|s|sec|secs|second|seconds)?\s*\))"
    r"|(?P<ellipsis>\.{3,}|…)",
    re.IGNORECASE,
)


def _pause_ms(match: re.Match) -> int:
    if match.group("ellipsis"):
        return 400
    raw = match.group("bnum") or match.group("pnum")
    unit = (match.group("bunit") or match.group("punit") or "s").lower()
    if raw is None:
        return 600
    value = float(raw)
    milliseconds = value if unit == "ms" else value * 1000
    return int(max(100, min(milliseconds, 5000)))


def _clean_spoken_text(text: str) -> str:
    cleaned = text
    cleaned = re.sub(r"```[a-zA-Z0-9_-]*", "", cleaned)
    cleaned = cleaned.replace("```", "")
    cleaned = re.sub(r"^\s*#{1,6}\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"(\*\*|__)(.*?)\1", r"\2", cleaned)
    cleaned = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\1", cleaned)
    cleaned = re.sub(r"https?://\S+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(
        r"\[\s*(?:Narrator|Voiceover|Host|Speaker\s*\d*|Scene\s*\d*|Sound|SFX|Music|Visual|Intro|Outro)[^\]]*\]:?",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"^\s*(?:Narrator|Voiceover|Host|Speaker\s*\d*|Scene\s*\d*)\s*:\s*",
        "",
        cleaned,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    cleaned = re.sub(r"^[\s•*-]+(?=\S)", "", cleaned, flags=re.MULTILINE)
    return re.sub(r"\s+", " ", cleaned).strip()


def _split_long_piece(text: str, max_chars: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    sentences = re.findall(r"[^।.!?\n]+[।.!?]?", text)
    units = [unit.strip() for unit in sentences if unit.strip()] or [text]
    chunks: list[str] = []
    current = ""
    for unit in units:
        if len(unit) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            words = unit.split()
            word_chunk = ""
            for word in words:
                if len(word) > max_chars:
                    if word_chunk:
                        chunks.append(word_chunk)
                        word_chunk = ""
                    chunks.extend(word[i : i + max_chars] for i in range(0, len(word), max_chars))
                elif not word_chunk or len(word_chunk) + len(word) + 1 <= max_chars:
                    word_chunk = f"{word_chunk} {word}".strip()
                else:
                    chunks.append(word_chunk)
                    word_chunk = word
            if word_chunk:
                chunks.append(word_chunk)
        elif not current or len(current) + len(unit) + 1 <= max_chars:
            current = f"{current} {unit}".strip()
        else:
            chunks.append(current)
            current = unit
    if current:
        chunks.append(current)
    return chunks


def _segments(text: str) -> list[tuple[str, str | int]]:
    result: list[tuple[str, str | int]] = []
    cursor = 0
    for match in _PAUSE_PATTERN.finditer(text):
        spoken = _clean_spoken_text(text[cursor : match.start()])
        result.extend(("text", chunk) for chunk in _split_long_piece(spoken, MAX_CHUNK_CHARS))
        result.append(("pause", _pause_ms(match)))
        cursor = match.end()
    spoken = _clean_spoken_text(text[cursor:])
    result.extend(("text", chunk) for chunk in _split_long_piece(spoken, MAX_CHUNK_CHARS))

    compact: list[tuple[str, str | int]] = []
    for kind, value in result:
        if kind == "pause" and compact and compact[-1][0] == "pause":
            compact[-1] = ("pause", min(int(compact[-1][1]) + int(value), 5000))
        else:
            compact.append((kind, value))
    return compact


def _seed_everything(seed: int) -> None:
    if seed <= 0:
        return
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def _append_with_crossfade(parts: list[np.ndarray], audio: np.ndarray, sample_rate: int) -> None:
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    if not len(audio):
        return
    if not parts or not len(parts[-1]):
        parts.append(audio)
        return
    fade_samples = min(
        int(sample_rate * DEFAULT_CROSSFADE_MS / 1000),
        len(parts[-1]),
        len(audio),
    )
    if fade_samples <= 0:
        parts.append(audio)
        return
    left = parts.pop()
    fade_out = np.linspace(1.0, 0.0, fade_samples, dtype=np.float32)
    fade_in = 1.0 - fade_out
    merged = np.concatenate(
        [left[:-fade_samples], left[-fade_samples:] * fade_out + audio[:fade_samples] * fade_in, audio[fade_samples:]]
    )
    parts.append(merged)


def _generate(request: SpeechRequest) -> tuple[bytes, int]:
    global MODEL
    if MODEL_STATE != "ready" or MODEL is None:
        raise RuntimeError(MODEL_ERROR or f"Model is {MODEL_STATE}")

    parsed = _segments(request.input)
    text_count = sum(1 for kind, _ in parsed if kind == "text")
    if text_count == 0:
        raise ValueError("Input contains no speakable text")

    with GENERATION_LOCK:
        _seed_everything(request.seed)
        voice_path = _resolve_voice_path(request.voice)
        if voice_path is not None:
            MODEL.prepare_conditionals(str(voice_path), exaggeration=request.exaggeration)
        else:
            MODEL.conds = BUILTIN_CONDITIONALS

        sample_rate = int(MODEL.sr)
        output_parts: list[np.ndarray] = []
        previous_was_text = False
        text_index = 0
        for kind, value in parsed:
            if kind == "pause":
                output_parts.append(np.zeros(int(sample_rate * int(value) / 1000), dtype=np.float32))
                previous_was_text = False
                continue

            text_index += 1
            chunk_seed = request.seed + text_index - 1 if request.seed else 0
            _seed_everything(chunk_seed)
            LOGGER.info("Generating chunk %d/%d (%d chars)", text_index, text_count, len(str(value)))
            waveform = MODEL.generate(
                str(value),
                language_id=request.language,
                audio_prompt_path=None,
                exaggeration=request.exaggeration,
                cfg_weight=request.cfg_weight,
                temperature=request.temperature,
                repetition_penalty=request.repetition_penalty,
            )
            audio = waveform.squeeze().detach().cpu().float().numpy()
            if previous_was_text:
                _append_with_crossfade(output_parts, audio, sample_rate)
            else:
                output_parts.append(np.asarray(audio, dtype=np.float32).reshape(-1))
            previous_was_text = True

        final_audio = np.concatenate(output_parts)
        peak = float(np.max(np.abs(final_audio))) if len(final_audio) else 0.0
        if peak > 0.0001:
            final_audio = final_audio * min(1.0, 0.891 / peak)

        output = io.BytesIO()
        sf.write(output, final_audio, sample_rate, format="WAV", subtype="PCM_16")
        return output.getvalue(), text_count


app = FastAPI(title="TubeFlow Local Chatterbox TTS", version="1.0.0")
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
    return {
        "online": True,
        "ready": MODEL_STATE == "ready",
        "state": MODEL_STATE,
        "error": MODEL_ERROR,
        "provider": "chatterbox",
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


def _start_loader() -> None:
    thread = threading.Thread(target=_load_model, name="chatterbox-model-loader", daemon=True)
    thread.start()


_start_loader()


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="Local OpenAI-compatible Chatterbox TTS service")
    parser.add_argument("--host", default=os.getenv("CHATTERBOX_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("CHATTERBOX_PORT", "8880")))
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level=os.getenv("CHATTERBOX_LOG_LEVEL", "info").lower())
