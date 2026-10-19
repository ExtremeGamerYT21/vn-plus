# Full-body artwork and position shifts

Use the VN toolbar's **Busts / Full body** selector, or **Extensions → Visual Novel+ → General → Artwork framing**. The two controls stay synchronized. The default remains Busts, preserving existing layouts.

**Full body** anchors the bottom of each loaded image at the screen bottom, with the usual row depth lift. The drawing can extend behind the dialogue box and controls. Artwork retains its configured height and scale, so a full-length sprite no longer starts above the top of the stage simply because its feet were anchored at the raised bust baseline. Its bottom means the image canvas edge, including transparent padding. Breathing, expression blending and blinking continue to use the same image and renderer.

Missing-art shadow placeholders retain their bust height and baseline. They also keep the existing top/bottom alignment preference. Full-body artwork always anchors from the bottom, including when shadows are top-aligned. If an image fails to load, its shadow returns to bust framing. Switching modes repositions existing nodes without restarting music, voices or the current paragraph.

## Character properties

`offsetX` and `offsetY` already support signed pixel shifts in `properties.json`:

```json
{
  "displayName": "Lyra Malfoy",
  "bustScale": 1,
  "offsetX": 20,
  "offsetY": -30
}
```

Positive X moves right; negative X moves left. Positive Y moves down; negative Y moves up. The example shifts the character 20 pixels right and 30 pixels up. Offsets remain pixels even when the character is scaled or placed in a smaller back row. Registry overrides keyed by the character folder ID can supply the same fields. Use **Refresh assets** after editing properties files.

`bustScale` defines a character's size relative to the other visible characters, in both framing modes. The cast shares an automatic zoom: two characters both set to `2` appear at normal size together, as do two both set to `0.5`. Mixing a `2` character with a `0.5` character makes the larger one four times the smaller one's scale, before row depth. The shared zoom uses the geometric mean of the visible cast's scales, keeping these ratios intact; a missing or invalid scale means `1`. The **Global bust scale** and **Bust height** controls still adjust the overall framing.

The zoom eases over 650 ms when the visible cast changes, respecting reduced motion. Characters staying through their silence grace still count until they leave. Hidden player busts, the narrator, absent characters and missing-art placeholders set to **Hide** do not affect the zoom. Visible shadows participate like ordinary busts. Changing the current speaker or expression does not change the zoom. Background camera zoom, media playback and pixel offsets remain independent.

Environment CSS that changes stage clearance can use `.vn-stage { --vn-stage-bottom: 180px; }`. The default is `min(28vh,230px)`; full-body placement uses the same variable, so the image remains anchored correctly as the viewport changes. `:scope[data-sprite-framing="full-body"]` targets the selected mode. Each character's `data-framing` reports its effective framing; a shadow remains `bust`.

## Narration lighting

While a narration paragraph is presented, the whole cast—including shadows—receives an additional 85% brightness multiplier, combined with each character's [quiet-beat dimming and retreat](character-presence.md). This applies whether the narrator is voiced or muted. Dialogue and character thoughts restore focus to their speaker. Scene brightness, time-of-day lighting and the cached ambient-light values are unchanged; this is a presentation effect. Reduced motion suppresses the transition.

Environment CSS can adjust the strength with `:scope { --vn-narration-brightness: .9; }`. A value of `1` disables this dim. The overlay has the `.vn-narrating` class while presenting narration.
