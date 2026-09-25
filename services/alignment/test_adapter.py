"""Adapter invariants only; fake model outputs do not qualify acoustic accuracy."""
import hashlib
import http.client
import os
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch
import server
import worker


class AdapterTests(unittest.TestCase):
    def run_alignment(self, text, words):
        fake = types.SimpleNamespace(
            load_audio=lambda _: [0] * 48000,
            load_model=lambda *args, **kwargs: types.SimpleNamespace(transcribe=lambda *a, **k: {"segments": [{"text": text}]}),
            load_align_model=lambda **kwargs: (None, None),
            align=lambda *args, **kwargs: {"word_segments": words},
        )
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "audio.wav"
            audio.write_bytes(b"synthetic-adapter-input")
            request = {"text": text, "language": "hi", "audioPath": str(audio),
                       "audioHash": hashlib.sha256(audio.read_bytes()).hexdigest(),
                       "narrationHash": hashlib.sha256(text.encode()).hexdigest()}
            with patch.dict(sys.modules, {"whisperx": fake}), patch.dict(os.environ, {"ALIGNMENT_ASR_MODEL": "test-model"}):
                return worker.align_request(request)

    def test_hindi_repeats_and_supplementary_character_offsets(self):
        text = "हाथ blue हाथ 👋"
        words = [{"word": word, "start": i * .5, "end": i * .5 + .4, "score": .9}
                 for i, word in enumerate(text.split())]
        result = self.run_alignment(text, words)
        self.assertEqual([token["startOffset"] for token in result["tokens"]], [0, 4, 9, 13])
        self.assertEqual(result["tokens"][-1]["endOffset"], 15)
        self.assertNotEqual(worker.normalized("हाथ"), worker.normalized("हथ"))

    def test_missing_interior_or_final_words_rejects(self):
        for text, words in [("one two three", ["one", "three"]), ("one two", ["one"])]:
            values = [{"word": word, "start": i, "end": i + .5, "score": .9} for i, word in enumerate(words)]
            with self.assertRaisesRegex(ValueError, "omitted"):
                self.run_alignment(text, values)

    def test_low_confidence_never_becomes_word_timing(self):
        with self.assertRaisesRegex(ValueError, "Unreliable"):
            self.run_alignment("हाथ", [{"word": "हाथ", "start": 0, "end": 1, "score": .1}])

    def test_cancel_before_upload_never_starts_model(self):
        httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            connection = http.client.HTTPConnection("127.0.0.1", httpd.server_port, timeout=3)
            connection.request("POST", "/cancel", headers={"X-Request-ID": "before-start"})
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            response.read()
            connection.request("POST", "/align", body=b"x", headers={"X-Request-ID": "before-start"})
            response = connection.getresponse()
            self.assertEqual(response.status, 409)
            response.read()
            connection.close()
            self.assertFalse(server.processes)
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
