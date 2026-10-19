# Emotion typography

**Extensions → Visual Novel+ → Presentation → Emotion text effects** controls the styles. Existing dialogue emotion tags and inline speech directions drive presentation; no extra model call or sprite artwork is needed.

| Tag examples | Appearance |
| --- | --- |
| `anger`, `angry`, `furious`, `rage` | Per-letter jitter with independent phases. Anger synonyms use the master emotion aliases. |
| `shouting`, `yelling`, `screaming` | Larger bold letters, wider spacing, and irregular per-letter rotation and displacement. |
| `sad`, `sadness`, `sorrowful` | Smaller text. Grief and heartbreak shrink it further. |
| `love`, `loving`, `romantic`, `affectionate` | A soft glow derived from the character accent and theme. |
| `whisper`, `whispering` | Smaller, softer italic text. |

Other known emotions retain their existing font-size and typewriter pacing, including excitement, embarrassment and fear. Calm or mildly annoyed characters do not gain jitter. **Emotion tags that shake** remains the configurable set for continuous shaking; an anger entry also covers its synonyms. An empty set disables jitter. Reduced motion disables continuous jitter while retaining static sizes, scattered shouting letters and glow. Disabling **Emotion text effects** restores ordinary typography.

Examples:

```text
Nina: "Don't touch that." [anger]
Nina: "[shouting] GET OUT!" [angry]
Nina: "I miss you." [sadness]
Nina: "[shouting] I love you!" [loving]
```

Effects combine, so angry shouting can jitter and scatter, and an affectionate shout can scatter and glow. Bracketed directions remain hidden in the dialogue box and intact for TTS. `#TEXT shout` and `#TEXT whisper` still explicitly set delivery; `#TEXT normal` clears that command's persistent override. Narration does not inherit the previous speaker's emotion.

Letter offsets are seeded from the visible line and remain the same on replay, backward navigation, resizing, typewriter reveal and voice-timed reveal. Word timestamps, source messages, speaker colours, fonts and voice requests stay unchanged. Word grouping preserves normal wrapping for animated lettering; the dialogue box still widens before reveal to fit the complete styled sentence.

Environment CSS may set `--vn-love-glow` to a colour to override the default glow. Effects use existing text spans and CSS transforms; they add no JavaScript animation loop or additional speech request.
