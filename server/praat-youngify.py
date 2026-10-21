"""Local Praat processing. stdin: one JSON line, then mono f32le PCM.

stdout uses the same framing. No files, credentials or network access required.
Praat is provided by the optional praat-parselmouth dependency (GPLv3+).
"""
import json
import sys

import numpy as np
import parselmouth
from parselmouth.praat import call


def transform(samples, settings):
    if samples.size < 4410 or np.max(np.abs(samples), initial=0) < 1e-5:
        return samples, "Praat: silence or very short audio left unchanged."
    sound = parselmouth.Sound(samples.astype(np.float64), sampling_frequency=44100)
    pitch = sound.to_pitch_ac(pitch_floor=60, pitch_ceiling=600)
    frequencies = pitch.selected_array["frequency"]
    voiced = frequencies[frequencies > 0]
    if voiced.size < 3:
        return samples, "Praat: no stable voiced pitch; audio left unchanged."
    median = call(pitch, "Get quantile", 0, 0, 0.5, "Hertz")
    changed = call([sound, pitch], "Change gender", settings["formantRatio"],
                   median * 2 ** (settings["pitchSemitones"] / 12), settings["pitchRange"], 1.0)
    result = changed.values[0]
    # Praat keeps duration at factor 1. Only tolerate sample rounding, never time-stretch.
    if abs(result.size - samples.size) > 4:
        raise ValueError("Praat changed clip duration unexpectedly")
    if result.size < samples.size:
        result = np.pad(result, (0, samples.size - result.size))
    result = result[:samples.size].astype("<f4")
    if not np.isfinite(result).all():
        raise ValueError("Praat returned invalid samples")
    return result, "Praat: pitch and formants adjusted; duration preserved."


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        print(json.dumps({"available": True, "version": parselmouth.__version__}))
    else:
        header = json.loads(sys.stdin.buffer.readline(4096))
        raw = sys.stdin.buffer.read(44100 * 4 * 120 + 1)
        if not raw or len(raw) % 4 or len(raw) > 44100 * 4 * 120:
            raise ValueError("Invalid PCM size")
        samples = np.frombuffer(raw, dtype="<f4")
        if not np.isfinite(samples).all():
            raise ValueError("Non-finite PCM")
        output, note = transform(samples, header)
        sys.stdout.buffer.write((json.dumps({"note": note}) + "\n").encode("utf-8"))
        sys.stdout.buffer.write(output.astype("<f4").tobytes())
