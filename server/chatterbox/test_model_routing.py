import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import torch

import server


class FakeModel:
    sr = 24000

    def __init__(self, language):
        self.language = language
        self.conds = f"{language}-native"
        self.calls = []

    def prepare_conditionals(self, path, exaggeration):
        self.conds = path

    def generate(self, text, **kwargs):
        self.calls.append((text, kwargs, self.conds))
        return torch.from_numpy((0.2 * np.sin(np.arange(24000) * 0.05)).astype(np.float32)).unsqueeze(0)


class ModelRoutingTests(unittest.TestCase):
    def setUp(self):
        self.loaded = []

        def load(language, device, version):
            model = FakeModel(language)
            self.loaded.append(model)
            return model

        self.patches = [
            patch.object(server, "load_model", side_effect=load),
            patch.object(server, "_select_device", return_value="cpu"),
            patch.object(server, "MODEL", None),
            patch.object(server, "MODEL_LANGUAGE", None),
            patch.object(server, "MODEL_STATE", "loading"),
            patch.object(server, "MODEL_ERROR", None),
            patch.object(server, "BUILTIN_CONDITIONALS", None),
            patch.object(server, "ACTIVE_DEVICE", "cpu"),
        ]
        for context in self.patches:
            context.start()
            self.addCleanup(context.stop)

    def test_hindi_startup_and_repeated_requests_use_hindi_checkpoint(self):
        server._load_model()
        self.assertEqual(server.health()["model"], "chatterbox-hindi-v3")
        for _ in range(2):
            result = server.speech(server.SpeechRequest(input="भारत की कहानी।", language="hi", seed=42))
            self.assertEqual(result.headers["x-tts-model"], "chatterbox-hindi-v3")
            self.assertTrue(result.body.startswith(b"RIFF"))
        self.assertEqual(len(self.loaded), 1)
        self.assertEqual(self.loaded[0].calls[-1][1]["language_id"], "hi")
        self.assertEqual(self.loaded[0].calls[-1][2], "hi-native")

    def test_language_switch_reloads_correct_model_without_crossing_voices(self):
        server._load_model()
        server._generate(server.SpeechRequest(input="Hello world.", language="en"))
        server._generate(server.SpeechRequest(input="नमस्ते भारत।", language="hi"))
        self.assertEqual([model.language for model in self.loaded], ["hi", "en", "hi"])
        self.assertEqual(self.loaded[1].calls[0][2], "en-native")
        self.assertEqual(self.loaded[2].calls[0][2], "hi-native")

    def test_custom_reference_does_not_replace_native_default(self):
        server._load_model()
        with patch.object(server, "_resolve_voice_path", return_value=Path("custom.wav")):
            server._generate(server.SpeechRequest(input="हमारी कहानी।", language="hi"))
        server._generate(server.SpeechRequest(input="हमारी कहानी।", language="hi"))
        self.assertEqual(self.loaded[0].calls[0][2], "custom.wav")
        self.assertEqual(self.loaded[0].calls[1][2], "hi-native")

    def test_failed_hindi_load_is_visible_and_never_uses_english_as_fallback(self):
        server._load_model("en")
        with patch.object(server, "load_model", side_effect=RuntimeError("Hindi weights unavailable")):
            with self.assertRaisesRegex(RuntimeError, "Hindi weights unavailable"):
                server._generate(server.SpeechRequest(input="नमस्ते भारत।", language="hi"))
        self.assertIsNone(server.MODEL)
        self.assertEqual(server.MODEL_STATE, "error")
        self.assertEqual(self.loaded[0].calls, [])


if __name__ == "__main__":
    unittest.main()
