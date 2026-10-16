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

Positive X moves right; negative X moves left. Positive Y moves down; negative Y moves up. The example shifts the character 20 pixels right and 30 pixels up. Offsets remain pixels even when the character is scaled or placed in a smaller back row. `bustScale` multiplies the global scale and works in both framing modes. Registry overrides keyed by the character folder ID can supply the same fields. Use **Refresh assets** after editing properties files.

Environment CSS that changes stage clearance can use `.vn-stage { --vn-stage-bottom: 180px; }`. The default is `min(28vh,230px)`; full-body placement uses the same variable, so the image remains anchored correctly as the viewport changes. `:scope[data-sprite-framing="full-body"]` targets the selected mode. Each character's `data-framing` reports its effective framing; a shadow remains `bust`.

## Narration lighting

While a narration paragraph is presented, the whole cast—including shadows—gently transitions to 85% brightness. This applies whether the narrator is voiced or muted. Dialogue and character thoughts restore the existing speaker/inactive lighting. Scene brightness, time-of-day lighting and the cached ambient-light values are unchanged; this is a presentation effect. Reduced motion suppresses the transition.

Environment CSS can adjust the strength with `:scope { --vn-narration-brightness: .9; }`. A value of `1` disables this dim. The overlay has the `.vn-narrating` class while presenting narration.
