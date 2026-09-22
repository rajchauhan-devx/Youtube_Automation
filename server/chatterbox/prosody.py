"""Text boundaries and conservative audio joins, independent of the TTS model."""
from __future__ import annotations

import re
import numpy as np

REVISION = "natural-v1"
_ABBREVIATION = re.compile(r"(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)|\b[A-Za-z])\.$", re.I)


def split_phrases(text: str, max_chars: int = 280) -> list[str]:
    """Keep sentences together, then prefer clauses over arbitrary word cuts.

    Decimal points, initials, abbreviations and complete punctuation survive.
    Never split a word or a Devanagari combining sequence to meet a soft limit.
    """
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    max_chars = max(80, max_chars)
    units, start = [], 0
    for match in re.finditer(r"[.!?।]+[\"'”’]*(?:\s+|$)", text):
        candidate = text[start:match.end()].strip()
        if match.group().strip() == '.' and _ABBREVIATION.search(candidate):
            continue
        # Ellipses carry in-phrase prosody; don't force a new model invocation.
        if match.group().strip().startswith('...'):
            continue
        units.append(candidate)
        start = match.end()
    if text[start:].strip():
        units.append(text[start:].strip())
    chunks, current = [], ''
    for unit in units:
        if current and len(current) + len(unit) + 1 > max_chars:
            chunks.append(current)
            current = ''
        while len(unit) > max_chars:
            candidates = [m.end() for m in re.finditer(r"[,;:—–]\s+", unit[:max_chars + 1]) if m.end() >= max_chars // 2]
            cut = candidates[-1] if candidates else unit.rfind(' ', 0, max_chars + 1)
            if cut <= 0:
                cut = unit.find(' ')
            if cut <= 0:
                break
            chunks.append(unit[:cut].strip())
            unit = unit[cut:].strip()
        current = f'{current} {unit}'.strip()
    if current:
        chunks.append(current)
    return chunks


def speech_edges(audio: np.ndarray, sample_rate: int) -> tuple[int, int]:
    """20 ms RMS activity bounds with a conservative relative threshold."""
    x = np.asarray(audio, dtype=np.float32).reshape(-1)
    if not len(x) or not np.isfinite(x).all():
        raise ValueError('The voice model returned empty or non-finite audio. Try generating again.')
    frame = max(1, int(sample_rate * .02))
    padded = np.pad(x, (0, (-len(x)) % frame))
    rms = np.sqrt(np.mean(padded.reshape(-1, frame) ** 2, axis=1))
    threshold = max(0.0001, float(rms.max()) * .008)
    active = np.flatnonzero(rms > threshold)
    if not len(active):
        raise ValueError('The voice model returned silence. Try another voice reference.')
    return int(active[0] * frame), min(len(x), int((active[-1] + 1) * frame))


def prepare_audio(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Remove only excess outer silence; leave internal breaths and timing intact."""
    x = np.asarray(audio, dtype=np.float32).reshape(-1)
    start, end = speech_edges(x, sample_rate)
    x = x[max(0, start - int(sample_rate * .08)):min(len(x), end + int(sample_rate * .25))].copy()
    # A tiny ramp prevents discontinuities without overlapping adjacent speech.
    fade = min(int(sample_rate * .004), len(x) // 2)
    if fade:
        ramp = np.linspace(0, 1, fade, dtype=np.float32)
        x[:fade] *= ramp
        x[-fade:] *= ramp[::-1]
    return x


def boundary_pause(text: str) -> int:
    return 220 if re.search(r'[.!?।][\"\'”’]*$', text.strip()) else 100


def gap_samples(left: np.ndarray, right: np.ndarray, sample_rate: int, pause_ms: int) -> int:
    """Existing model silence counts toward the pause; never double it."""
    _, left_end = speech_edges(left, sample_rate)
    right_start, _ = speech_edges(right, sample_rate)
    return max(0, round(sample_rate * pause_ms / 1000) - (len(left) - left_end) - right_start)


_PAUSE_PATTERN = re.compile(
    r"(?P<bracket>\[\s*(?:pause|break)\s*(?P<bnum>\d+(?:\.\d+)?)?\s*(?P<bunit>ms|s|sec|secs|second|seconds)?\s*\])"
    r"|(?P<paren>\(\s*pause\s*(?P<pnum>\d+(?:\.\d+)?)?\s*(?P<punit>ms|s|sec|secs|second|seconds)?\s*\))"
,
    re.IGNORECASE,
)


def _pause_ms(match: re.Match) -> int:
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
    return split_phrases(text, max_chars)


def _segments(text: str, max_chars: int = 280) -> list[tuple[str, str | int]]:
    result: list[tuple[str, str | int]] = []
    cursor = 0
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Paragraph breaks represent a new thought; single line wrapping does not.
    text = re.sub(r"\n[ \t]*\n+", " [pause 0.45s] ", text)
    for match in _PAUSE_PATTERN.finditer(text):
        spoken = _clean_spoken_text(text[cursor : match.start()])
        result.extend(("text", chunk) for chunk in _split_long_piece(spoken, max_chars))
        result.append(("pause", _pause_ms(match)))
        cursor = match.end()
    spoken = _clean_spoken_text(text[cursor:])
    result.extend(("text", chunk) for chunk in _split_long_piece(spoken, max_chars))

    compact: list[tuple[str, str | int]] = []
    for kind, value in result:
        if kind == "pause" and compact and compact[-1][0] == "pause":
            compact[-1] = ("pause", min(int(compact[-1][1]) + int(value), 5000))
        else:
            compact.append((kind, value))
    return compact

