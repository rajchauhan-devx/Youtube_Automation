"""Align the supplied narration to its audio locally; never generate a transcript."""
import contextlib
import importlib.metadata
import json
import sys


def main():
    with contextlib.redirect_stdout(sys.stderr):
        import whisperx
        from whisperx.alignment import load_align_model
        if sys.argv[1:] == ["--health"]:
            result = {"ready": True, "version": importlib.metadata.version("whisperx")}
        else:
            with open(sys.argv[1], encoding="utf-8") as source:
                request = json.load(source)
            device = request.get("device", "cpu")
            model, metadata = whisperx.load_align_model(request["language"], device, model_dir=request.get("modelDir"))
            audio = whisperx.load_audio(request["audioPath"])
            aligned = whisperx.align(request["segments"], model, metadata, audio, device,
                                     interpolate_method="ignore", return_char_alignments=False)
            result = {"provider": "whisperx", "version": importlib.metadata.version("whisperx"),
                      "words": aligned["word_segments"]}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
