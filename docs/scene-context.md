# Scene variables and background lighting

A standalone header supplies the scene's date, story phase, time, season and location:

```text
[3 August 1991 | Before First Year | 12:26 p.m. | Summer | Madam Malkin's Robes for All Occasions, Diagon Alley]
```

VN+ accepts this header before or after the exact `/////` separator. Only these structured fields are extracted from the canonical section; its prose and commands never enter the VN parser. Headers inside code/HTML or an unfinished quoted POV utterance are not scene metadata. English month names/three-letter abbreviations, 12-hour AM/PM and 24-hour `HH:mm` work. Invalid dates/times do not replace the last valid header.

The current response's canonical header supplies its initial values. Without one, VN+ searches earlier selected assistant messages, skipping user/system messages. Headers in the current POV update variables when playback reaches them, without a separate visible paragraph. Backward navigation restores the earlier values. Refreshes, chat changes and earlier edits reconstruct the data. A presentation `#SCENE RESET` keeps story metadata until another header replaces it.

## Variables

The scene inspector's `variables` object includes:

```json
{
  "date": "1991-08-03",
  "dateLabel": "3 August 1991",
  "phase": "Before First Year",
  "time": "12:26",
  "timeLabel": "12:26 p.m.",
  "year": 1991,
  "month": 8,
  "day": 3,
  "hour": 12,
  "minute": 26,
  "minutes": 746,
  "season": "Summer",
  "location": "Madam Malkin's Robes for All Occasions, Diagon Alley",
  "background": "street",
  "lighting": { "inside": false, "level": 1, "brightness": 1, "period": "day" }
}
```

These are VN+ variables, not SillyTavern chat-variable writes. The controller's `sceneVariables` getter returns a detached snapshot. The overlay emits a bubbling `vnplus:scene-context` event with the same snapshot after background properties resolve. Scene variables can be read by host extension code using `globalThis[Symbol.for('visual-novel-plus.controller')].sceneVariables`. Existing artifact iframes remain isolated; an artifact bridge is a separate feature. Time is fictional local scene time, not the PC clock, and does not advance on its own.

## Background properties

Each environment can keep a local, Git-ignored file at `backgrounds/properties.json`:

```json
{
  "kitchen.png": { "inside": true },
  "street.png": { "inside": false },
  "Hogwarts - Great Hall - Candlelit Tables.png": { "inside": true }
}
```

Keys use actual filenames relative to `backgrounds/`, including subfolders. Matching is case-insensitive; extensionless keys also work. Properties are looked up on the **resolved image**, including when the command uses descriptive keyword matching. Only the boolean `inside: true` disables time-based shading. Missing entries are outdoors.

Run `npm run backgrounds` from the extension folder to create this file for every environment, or add entries for new images. Existing values/extra fields are preserved, invalid JSON is never replaced, and unclassified new entries default to outdoors. This also supports legacy flat installations. Shipped Coffin classifications are in `properties.default.json`; they are used when no valid local properties map exists and seed newly created entries. A valid local `properties.json` is the complete override: omitted entries are outdoors. Personal background properties are excluded from the published inventory and Git updates. After editing them, click **Refresh assets** or reload SillyTavern.

## Lighting

Outdoor brightness follows a fixed story-time schedule with interpolated dawn/dusk:

| Time | Daylight level |
| --- | --- |
| 00:00–05:00 | 0 |
| 06:00 | 0.35 |
| 08:00–16:00 | 1 |
| 18:00 | 0.35 |
| 19:00–24:00 | 0 |

`lighting.level` is 0–1. Visual brightness ranges from 0.45 at night to 1 in daytime so art stays readable. The filter affects the background and busts together; dialogue and controls stay readable. Indoors, brightness/level remain 1 with period `indoor`. Without a valid header, brightness stays 1 with period `unknown`. Season is stored as data; the schedule does not calculate astronomy or latitude. Manual scene tint/fades remain independent. The local preview's `demo/index.html?lighting` demonstrates midday, night and an indoor scene.
