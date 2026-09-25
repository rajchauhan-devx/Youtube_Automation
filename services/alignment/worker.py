"""Single request, isolated WhisperX worker. No credentials or project paths needed."""
import difflib
import hashlib
import json
import os
import sys
import unicodedata


def normalized(text):
    return "".join(char for char in unicodedata.normalize("NFC", text).lower()
                   if unicodedata.category(char)[0] in ("L", "M", "N"))


def align_request(request):
    import whisperx
    text, language = request["text"], request["language"]
    if language not in ("en", "hi") or not text.strip() or len(text) > 50000:
        raise ValueError("Unsupported narration language or length")
    with open(request["audioPath"], "rb") as audio_file:
        if hashlib.sha256(audio_file.read()).hexdigest() != request["audioHash"]:
            raise ValueError("Audio hash mismatch")
    if hashlib.sha256(text.encode()).hexdigest() != request["narrationHash"]:
        raise ValueError("Narration hash mismatch")
    device = os.environ.get("ALIGNMENT_DEVICE", "cpu")
    model_name = os.environ.get("ALIGNMENT_ASR_MODEL")
    if not model_name:
        raise ValueError("Configure ALIGNMENT_ASR_MODEL; model downloads are not implicit setup")
    audio = whisperx.load_audio(request["audioPath"])
    duration = len(audio) / 16000
    model = whisperx.load_model(model_name, device, compute_type="int8" if device == "cpu" else "float16", language=language)
    transcription = model.transcribe(audio, batch_size=1, language=language)
    spoken = " ".join(segment["text"] for segment in transcription["segments"])
    correspondence = difflib.SequenceMatcher(None, normalized(text), normalized(spoken), autojunk=False).ratio()
    if correspondence < float(os.environ.get("ALIGNMENT_MIN_CORRESPONDENCE", "0.8")):
        raise ValueError("Transcription does not reliably match supplied TTS text; refusing forced timestamps")
    align_model, metadata = whisperx.load_align_model(language_code=language, device=device, model_name=os.environ.get("ALIGNMENT_LANGUAGE_MODEL"))
    result = whisperx.align([{"start": 0, "end": duration, "text": text}], align_model, metadata, audio, device, return_char_alignments=False)
    tokens, cursor, previous_end = [], 0, 0.0
    for word in result["word_segments"]:
        value = word["word"]
        offset = text.find(value, cursor)
        score = float(word.get("score", 0))
        if offset < 0 or "start" not in word or "end" not in word or score < 0.5:
            raise ValueError("Unreliable word alignment; caller should use measured phrase timing or honest approximate mode")
        if normalized(text[cursor:offset]):
            raise ValueError("Alignment omitted an interior narrated word")
        start, end = float(word["start"]), float(word["end"])
        if start < previous_end or end <= start or end > duration + 0.001:
            raise ValueError("Invalid aligned interval")
        cursor, previous_end = offset + len(value), end
        # JS string offsets count UTF-16 code units, including any supplementary characters.
        utf16 = lambda value: len(value.encode("utf-16-le")) // 2
        tokens.append({"id": f"token-{len(tokens)}", "text": value, "startOffset": utf16(text[:offset]), "endOffset": utf16(text[:cursor]), "start": start, "end": end, "confidence": score, "evidence": f"WhisperX forced alignment; transcript correspondence={correspondence:.3f}; model={model_name}"})
    if not tokens or normalized(text[cursor:]):
        raise ValueError("Alignment omitted the final narrated phrase")
    return {"audioHash": request["audioHash"], "narrationHash": request["narrationHash"], "language": language, "duration": duration, "tokens": tokens, "provider": "whisperx", "version": "3.8.6-adapter-1", "mode": "word"}


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as source:
        request = json.load(source)
    with open(sys.argv[2], "w", encoding="utf-8") as target:
        json.dump(align_request(request), target, ensure_ascii=False)
