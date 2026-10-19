# Full-body fallback figures

Characters without usable artwork receive a bundled, illustrated full-body shadow with clothing, hair, hands, shoes and soft self-shading. Six generated figures replace the angular SVG stand-ins. Each is programmatically darkened to charcoal, with an anonymous face and a transparent antialiased cutout. Adult and child variants use distinct artwork. No external image downloads, model calls or normal maps run during gameplay. The narrator remains invisible.

| Descriptive label | Figure | Default relative size |
| --- | --- | --- |
| man, gentleman, wizard, father, Mr | Man | `1` |
| woman, lady, witch, mother, Madam | Woman | `0.95` |
| boy, schoolboy, young wizard | Boy | `0.6` |
| girl, schoolgirl, young witch | Girl | `0.5` |
| child with no gender information | Neutral child | `0.55` |
| unknown or ambiguous name | Neutral adult | `1` |

Only complete descriptive words in the speaker's name, display name or aliases are used. Proper names such as Jason or Nina do not imply gender or age. Words such as `human` do not accidentally match `man`. Explicit character properties take precedence over name inference:

```json
{
  "displayName": "Lyra",
  "silhouette": "girl",
  "bustScale": 0.5
}
```

`silhouette` accepts `man`, `woman`, `boy`, `girl`, `child` or `neutral`, either as a string or `{ "type": "girl" }`. A valid positive `bustScale` overrides the default size. Alternatively, `gender` (or `sex`) and a numeric `age` or `ageGroup` can select a figure. Numeric ages under 18 and age groups `child`, `minor`, `teen` or `teenager` select child proportions; `adult` selects adult proportions. An explicit `silhouette` overrides these fields. Character registry overrides support the same properties. Refresh assets after changing properties files.

These size defaults apply only while artwork is unavailable. Loaded artwork retains its authored `bustScale`, defaulting to `1`. Stand-ins take part in the shared [cast zoom](character-framing.md), so similarly sized characters normalize together and mixed groups preserve their ratios. Hidden missing figures do not affect the zoom. Feet remain at the screen floor in both artwork framing modes; row depth, silence grace, dimming, retreat and pixel offsets still apply. The smaller placeholder footprint is preserved, now depicting the whole body rather than a cropped bust.

Repeated beats reuse the same figure element and locally cached PNG. Shadows are baked into the artwork, with no animation loop. Existing scene lighting and narration dimming still apply. Environment CSS may set `--vn-fallback-brightness` (default `1`) to adjust shadow brightness. Name labels continue to use the environment theme.

The six production assets live in [`assets/fallback-figures/`](../assets/fallback-figures/). They were created with the built-in image generator; the [prompt set](fallback-figure-prompts.json) records their art direction. The offline [`tools/shade-fallback-figures.py`](../tools/shade-fallback-figures.py) script applies the requested shadow treatment, cleans alpha residue and normalizes framing. It requires Pillow only when rebuilding assets; PNGs work directly in the extension.
