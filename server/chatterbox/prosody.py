"""Text boundaries and conservative audio joins, independent of the TTS model."""
from __future__ import annotations

import re
import numpy as np

REVISION = "natural-v1"
_ABBREVIATION = re.compile(r"(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)|\b[A-Za-z])\.$", re.I)


def split_phrases(text: str, max_chars: int = 420) -> list[str]:
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


def boundary_pause(text: str, language: str = "en") -> int:
    """Syntax-aware pause so narration breathes like a human.

    Questions and exclamations get a longer beat, full stops a medium beat,
    commas and clause marks a short beat. Hindi devotional delivery breathes
    slightly longer after the danda (।) than English does after a period.
    """
    stripped = text.strip()
    if re.search(r'[?!][\"\'”’]*$', stripped):
        return 340 if language == "hi" else 320
    if re.search(r'।[\"\'”’]*$', stripped):
        return 280
    if re.search(r'\.[\"\'”’]*$', stripped):
        return 240
    if re.search(r'[,;:—–…][\"\'”’]*$', stripped):
        return 150 if language == "hi" else 140
    return 120 if language == "hi" else 110


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


_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
         "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
         "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def _cardinal(n: int) -> str:
    """Dependency-free integer to words for speech normalization (0-999M)."""
    if n < 0:
        return "minus " + _cardinal(-n)
    if n < 20:
        return _ONES[n]
    if n < 100:
        return _TENS[n // 10] + ("" if n % 10 == 0 else " " + _ONES[n % 10])
    if n < 1000:
        return _ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " " + _cardinal(n % 100))
    if n < 1_000_000:
        return _cardinal(n // 1000) + " thousand" + ("" if n % 1000 == 0 else " " + _cardinal(n % 1000))
    if n < 1_000_000_000:
        return _cardinal(n // 1_000_000) + " million" + ("" if n % 1_000_000 == 0 else " " + _cardinal(n % 1_000_000))
    return str(n)


def _year_words(year: int) -> str:
    if 1000 <= year <= 2099:
        first, second = year // 100, year % 100
        head = _cardinal(first)
        if second == 0:
            return head + " hundred"
        if second < 10:
            return head + " oh " + _ONES[second]
        return head + " " + _cardinal(second)
    return _cardinal(year)


_ABBR = [(r"\bDr\.", "Doctor"), (r"\bMr\.", "Mister"), (r"\bMrs\.", "Missus"),
         (r"\bMs\.", "Miss"), (r"\bSt\.", "Saint"), (r"\bvs\.", "versus"),
         (r"\be\.g\.", "for example"), (r"\bi\.e\.", "that is"),
         (r"\betc\.", "etcetera"), (r"\bapprox\.", "approximately")]


_HI_ONES = ["शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ",
             "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह",
             "अठारह", "उन्नीस"]
# Idiomatic 20-99 (compositional tens+ones sounds wrong in Hindi, e.g. 87 is
# सत्तासी, not अस्सी सात).
_HI_2DIGIT = ["बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस",
              "सत्ताईस", "अट्ठाईस", "उनतीस", "तीस", "इकतीस", "बत्तीस", "तैंतीस",
              "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस",
              "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चवालीस", "पैंतालीस",
              "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास", "पचास", "इक्यावन",
              "बावन", "तिरपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन",
              "उनसठ", "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ",
              "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर", "सत्तर", "इकहत्तर",
              "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर",
              "अठहत्तर", "उन्यासी", "अस्सी", "इक्यासी", "बयासी", "तिरासी",
              "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी",
              "नब्बे", "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पचानवे",
              "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे"]


def _hindi_cardinal(n: int) -> str:
    """Integer to idiomatic Hindi words using Indian place values."""
    if n < 0:
        return "ऋण " + _hindi_cardinal(-n)
    if n < 20:
        return _HI_ONES[n]
    if n < 100:
        return _HI_2DIGIT[n - 20]
    if n < 1000:
        return _HI_ONES[n // 100] + " सौ" + ("" if n % 100 == 0 else " " + _hindi_cardinal(n % 100))
    if n < 100_000:
        return _hindi_cardinal(n // 1000) + " हज़ार" + ("" if n % 1000 == 0 else " " + _hindi_cardinal(n % 1000))
    if n < 10_000_000:
        return _hindi_cardinal(n // 100_000) + " लाख" + ("" if n % 100_000 == 0 else " " + _hindi_cardinal(n % 100_000))
    if n < 1_000_000_000:
        return _hindi_cardinal(n // 10_000_000) + " करोड़" + ("" if n % 10_000_000 == 0 else " " + _hindi_cardinal(n % 10_000_000))
    return str(n)


def _hindi_year(year: int) -> str:
    if 1000 <= year <= 2099:
        first, second = year // 100, year % 100
        head = _hindi_cardinal(first)
        if second == 0:
            return head + " सौ"
        return head + " सौ " + _hindi_cardinal(second)
    return _hindi_cardinal(year)


_HI_UNITS = {"km": " किलोमीटर", "ml": " मिलीलीटर", "kg": " किलोग्राम", "cm": " सेंटीमीटर"}


def normalize_for_speech(text: str, language: str = "en") -> str:
    """Expand what TTS models otherwise spell out literally.

    Runs at synthesis time (not inside segmentation) so chunk-boundary unit
    tests stay exact. Devanagari wording is preserved; Arabic numerals inside
    Hindi get Hindi words, Latin patterns get English equivalents.
    """
    out = str(text)
    if language == "hi":
        out = out.replace("&", " और ")
        out = re.sub(r"\b(\d{1,3}(?:,\d{3})+)\b", lambda m: _hindi_cardinal(int(m.group(1).replace(",", ""))), out)
        out = re.sub(r"(?:₹|Rs\.?|रु\.?)\s*(\d+(?:\.\d+)?)\b",
                     lambda m: _hindi_cardinal(int(float(m.group(1)))) + " रुपये", out)
        out = re.sub(r"\b(\d+(?:\.\d+)?)%", lambda m: _hindi_cardinal(int(float(m.group(1)))) + " प्रतिशत", out)
        out = re.sub(r"\b(\d{1,2}):(\d{2})\b",
                     lambda m: _hindi_cardinal(int(m.group(1))) + " बजकर " + _hindi_cardinal(int(m.group(2))) + " मिनट"
                     if int(m.group(2)) != 0 else _hindi_cardinal(int(m.group(1))) + " बजे", out)
        out = re.sub(r"\b(\d+)\.(\d+)\s*(km|ml|kg|cm)\b",
                     lambda m: _hindi_cardinal(int(m.group(1))) + " दशमलव " + " ".join(_HI_ONES[int(d)] for d in m.group(2)) + _HI_UNITS[m.group(3)], out)
        out = re.sub(r"\b(\d+)\.(\d+)\b",
                     lambda m: _hindi_cardinal(int(m.group(1))) + " दशमलव " + " ".join(_HI_ONES[int(d)] for d in m.group(2)), out)
        out = re.sub(r"\b((?:19|20)\d{2})\b", lambda m: _hindi_year(int(m.group(1))), out)
        out = re.sub(r"\b(\d+)\s*(km|ml|kg|cm)\b",
                     lambda m: _hindi_cardinal(int(m.group(1))) + _HI_UNITS[m.group(2)], out)
        out = re.sub(r"\b(\d+)\b", lambda m: _hindi_cardinal(int(m.group(1))) if len(m.group(1)) <= 7 else m.group(1), out)
        return re.sub(r"\s+", " ", out).strip()
    out = out.replace("&", " and ")
    for pattern, spoken in _ABBR:
        out = re.sub(pattern, spoken, out)
    out = re.sub(r"\b(\d{1,3}(?:,\d{3})+)\b", lambda m: _cardinal(int(m.group(1).replace(",", ""))), out)
    out = re.sub(r"\$(\d+(?:\.\d+)?)\s*([mMbBkK])\b",
                 lambda m: _cardinal(int(float(m.group(1)))) + (" million dollars" if m.group(2).lower() == "m"
                 else " billion dollars" if m.group(2).lower() == "b" else " thousand dollars"), out)
    out = re.sub(r"\$(\d+(?:\.\d+)?)\b",
                 lambda m: (_cardinal(int(float(m.group(1)))) + " dollars") if "." not in m.group(1)
                 else (_cardinal(int(float(m.group(1).split(".")[0]))) + " dollars and " + " ".join(_ONES[int(d)] for d in m.group(1).split(".")[1]) + " cents"), out)
    out = re.sub(r"\b(\d+(?:\.\d+)?)%", lambda m: _cardinal(int(float(m.group(1)))) + " percent", out)
    out = re.sub(r"\b(\d+)\.(\d+)\s*(km|ml|kg|cm)\b",
                 lambda m: _cardinal(int(m.group(1))) + " point " + " ".join(_ONES[int(d)] for d in m.group(2)) + {"km": " kilometers", "ml": " milliliters", "kg": " kilograms", "cm": " centimeters"}[m.group(3)], out)
    out = re.sub(r"\b(\d+)\.(\d+)\b",
                 lambda m: _cardinal(int(m.group(1))) + " point " + " ".join(_ONES[int(d)] for d in m.group(2)), out)
    out = re.sub(r"\b((?:19|20)\d{2})\b", lambda m: _year_words(int(m.group(1))), out)
    out = re.sub(r"\b(\d+)\s*(km|ml|kg|cm)\b",
                 lambda m: _cardinal(int(m.group(1))) + {"km": " kilometers", "ml": " milliliters", "kg": " kilograms", "cm": " centimeters"}[m.group(2)], out)
    out = re.sub(r"\b(\d+)\b", lambda m: _cardinal(int(m.group(1))) if len(m.group(1)) <= 7 else m.group(1), out)
    return re.sub(r"\s+", " ", out).strip()


def _split_long_piece(text: str, max_chars: int) -> list[str]:
    return split_phrases(text, max_chars)


def _segments(text: str, max_chars: int = 420, language: str = "en") -> list[tuple[str, str | int]]:
    result: list[tuple[str, str | int]] = []
    cursor = 0
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Paragraph breaks represent a new thought; single line wrapping does not.
    # Hindi devotional pacing breathes slightly longer between thoughts.
    para_pause = " [pause 0.55s] " if language == "hi" else " [pause 0.45s] "
    text = re.sub(r"\n[ \t]*\n+", para_pause, text)
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

