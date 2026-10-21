"""Optional real-DSP checks: run with the Python installed by tools/install-praat.js."""
import importlib.util
from pathlib import Path
import unittest
import sys

sys.dont_write_bytecode = True

import numpy as np
import parselmouth
from parselmouth.praat import call

spec = importlib.util.spec_from_file_location("youngify", Path(__file__).resolve().parents[1] / "server/praat-youngify.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PraatChecks(unittest.TestCase):
    def test_pitch_formants_and_duration(self):
        rate = 44100
        time = np.arange(rate * 2) / rate
        samples = np.zeros(time.size)
        for harmonic in range(1, 35):
            frequency = harmonic * 110
            amplitude = (np.exp(-((frequency - 650) / 150) ** 2)
                         + .6 * np.exp(-((frequency - 1200) / 180) ** 2) + .05) / harmonic
            samples += amplitude * np.sin(2 * np.pi * frequency * time)
        samples = (.5 * samples / np.max(np.abs(samples))).astype("<f4")
        changed, note = module.transform(samples, {"pitchSemitones": 4, "formantRatio": 1.15, "pitchRange": 1})
        self.assertEqual(changed.size, samples.size)
        self.assertTrue(np.isfinite(changed).all())
        self.assertIn("duration preserved", note)
        def pitch(values):
            sound = parselmouth.Sound(values, sampling_frequency=rate)
            return call(sound.to_pitch_ac(pitch_floor=60, pitch_ceiling=600), "Get quantile", 0, 0, .5, "Hertz")
        ratio = pitch(changed) / pitch(samples)
        self.assertAlmostEqual(ratio, 2 ** (4 / 12), delta=.025)
        # Compare resonance envelopes with pitch fixed: only formants should move.
        formants, _ = module.transform(samples, {"pitchSemitones": 0, "formantRatio": 1.15, "pitchRange": 1})
        self.assertAlmostEqual(pitch(formants) / pitch(samples), 1, delta=.025)
        self.assertGreater(float(np.mean(np.abs(formants - samples))), .02)
        print(f"Real Praat: median {pitch(samples):.1f} -> {pitch(changed):.1f} Hz; {changed.size} samples preserved")

    def test_unvoiced_and_short_clips(self):
        for samples in [np.zeros(44100, dtype="<f4"), np.ones(1000, dtype="<f4") * .01]:
            changed, note = module.transform(samples, {"pitchSemitones": 4, "formantRatio": 1.15, "pitchRange": 1})
            np.testing.assert_array_equal(changed, samples)
            self.assertIn("unchanged", note)


if __name__ == "__main__":
    unittest.main()
