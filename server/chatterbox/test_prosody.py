import unittest
import numpy as np
from prosody import split_phrases, prepare_audio, speech_edges, gap_samples, _segments


class ProsodyTests(unittest.TestCase):
    def test_ellipses_keep_context_and_paragraphs_have_a_boundary(self):
        self.assertEqual(_segments('Wait... listen closely.\r\n\r\nNow we begin.'), [
            ('text', 'Wait... listen closely.'), ('pause', 450), ('text', 'Now we begin.')])
        self.assertEqual(_segments('One wrapped\nline.'), [('text', 'One wrapped line.')])

    def test_explicit_pauses_remain_supported_without_reading_stage_directions(self):
        self.assertEqual(_segments('[Narrator]: Hello. [pause 0.8s] [break 200ms] Goodbye.'), [
            ('text', 'Hello.'), ('pause', 1000), ('text', 'Goodbye.')])

    def test_chunking_keeps_words_numbers_and_punctuation(self):
        text = 'Dr. Mehta paid 3.14 dollars. "Really?!" She asked... then smiled. ' * 12
        chunks = split_phrases(text, 100)
        self.assertEqual(' '.join(chunks), text.strip())
        self.assertTrue(all(len(chunk) <= 100 for chunk in chunks))
        self.assertFalse(any(chunk.endswith('Dr.') for chunk in chunks))
        self.assertTrue(any('3.14' in chunk for chunk in chunks))

    def test_long_clauses_and_hindi_are_not_cut_inside_words(self):
        text = 'यह हमारी कहानी है, जिसमें हर शब्द और हर आवाज़ का अपना महत्व है। ' * 15
        self.assertEqual(' '.join(split_phrases(text, 100)), text.strip())
        long_word = 'कहानी' * 50
        self.assertEqual(split_phrases(long_word, 100), [long_word])

    def test_join_does_not_overlap_phonemes_or_double_silence(self):
        sr = 24000
        speech = .2 * np.sin(2 * np.pi * 220 * np.arange(sr) / sr)
        original = np.concatenate([np.zeros(sr), speech, np.zeros(sr // 3), speech, np.zeros(sr)])
        result = prepare_audio(original, sr)
        start, end = speech_edges(result, sr)
        self.assertLessEqual(start, sr * .1)
        self.assertLessEqual(len(result) - end, sr * .27)
        # All spoken samples and the internal breath pause survive exactly.
        spoken = original[sr:-sr]
        np.testing.assert_allclose(result[start:start + len(spoken)], spoken, atol=1e-7)
        gap = gap_samples(result, result, sr, 450)
        self.assertAlmostEqual(gap + len(result) - end + start, sr * .45, delta=1)
        self.assertEqual(gap_samples(result, result, sr, 100), 0)

    def test_invalid_audio_is_rejected(self):
        for audio in [np.zeros(24000), np.array([np.nan]), np.array([])]:
            with self.assertRaises(ValueError): prepare_audio(audio, 24000)


if __name__ == '__main__':
    unittest.main()
