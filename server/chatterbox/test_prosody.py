import unittest
import numpy as np
from prosody import split_phrases, prepare_audio, speech_edges, gap_samples, _segments, normalize_for_speech


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

    def test_hindi_decimals_currency_and_indian_grouping_keep_their_value(self):
        self.assertEqual(normalize_for_speech('ब्याज 3.5% है और कीमत ₹1,250.50 है।', 'hi'),
                         'ब्याज तीन दशमलव पाँच प्रतिशत है और कीमत एक हज़ार दो सौ पचास रुपये और पचास पैसे है।')
        self.assertEqual(normalize_for_speech('₹०.०५ और 1,00,000 लोग।', 'hi'),
                         'शून्य रुपये और पाँच पैसे और एक लाख लोग।')
        self.assertEqual(normalize_for_speech('₹10.125', 'hi'), 'दस दशमलव एक दो पाँच रुपये')

    def test_hindi_cleanup_preserves_words_and_questions(self):
        self.assertEqual(normalize_for_speech('डॉ. शर्मा और Dr. मेहता कहाँ हैं??? सच!!!', 'hi'),
                         'डॉक्टर शर्मा और डॉक्टर मेहता कहाँ हैं? सच!')
        self.assertEqual(normalize_for_speech('कृष्ण, अर्जुन और ऋषियों की कहानी।', 'hi'),
                         'कृष्ण, अर्जुन और ऋषियों की कहानी।')

    def test_hindi_years_use_idiomatic_two_thousands(self):
        self.assertEqual(normalize_for_speech('साल २०२६ और 1947।', 'hi'),
                         'साल दो हज़ार छब्बीस और उन्नीस सौ सैंतालीस।')

    def test_hindi_initialisms_are_spoken_before_tokenizer_lowercases_them(self):
        self.assertEqual(normalize_for_speech('AI और API, UPI, NASA और ISRO। OpenAI और PAID को रखो।', 'hi'),
                         'ए आई और ए पी आई, यू पी आई, नासा और इसरो। OpenAI और PAID को रखो।')
        self.assertEqual(normalize_for_speech('AI का GPU।', 'en'), 'AI का GPU।')

    def test_hindi_invisible_controls_do_not_remove_vowels_nukta_or_virama(self):
        self.assertEqual(normalize_for_speech('\ufeffकृ\u200dष्ण और क\u200cष्\u200dट, फ़ैज़।', 'hi'),
                         'कृष्ण और कष्ट, फ़ैज़।')

    def test_normalization_precedes_chunk_limits_and_keeps_explicit_pauses(self):
        text = ('₹1,00,000 और AI। ' * 12) + '[pause 0.6s] डॉ. शर्मा।'
        segments = _segments(text, 80, 'hi', normalize=True)
        chunks = [value for kind, value in segments if kind == 'text']
        self.assertTrue(all(len(chunk) <= 80 for chunk in chunks))
        self.assertIn(('pause', 600), segments)
        self.assertEqual(chunks[-1], 'डॉक्टर शर्मा।')
        self.assertNotIn('₹', ' '.join(chunks))


if __name__ == '__main__':
    unittest.main()
