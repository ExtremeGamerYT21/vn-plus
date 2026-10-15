# Visual Novel+ script grammar

The message envelope is ordinary canonical narration, an exact line `/////`, then the player-visible script. LF and CRLF are supported. Spaces before or after the five slashes, six slashes, and inline slashes are not separators. The first exact separator is used. The reader preserves both sections byte-for-byte as JavaScript strings. The parser never receives the canonical section.

```text
Canonical reality, including facts the player does not know.

/////

#BACKGROUND kitchen
#MUSIC buzz slowed
#ENTER Jason
#ENTER Ashley

NARRATION
You hear footsteps in the hall.

ASHLEY: "Is someone there?" [nervous]
```

Each `NARRATION` marker starts a narration block. Plain prose is also accepted in the POV section. A character name followed by a colon and quoted text starts dialogue; Unicode, spaces, apostrophes and punctuation in names are supported. Quotes, punctuation, newlines and `*emphasis*`, `_emphasis_`, `**strong emphasis**` are retained. A trailing `[expression]` is optional and case-insensitive. Multiline quoted dialogue ends before the next marker, command, dialogue, or blank separating line. Unclosed dialogue quotes and unclosed HTML fences are withheld and reported in the inspector. An expression-tagged unquoted dialogue line is also accepted.

`NARRATION` is optional: freestyle prose is narration automatically. Parentheses around the entire dialogue text mark **internal thoughts**. Both `ASHLEY: "(I should keep this to myself.)" [nervous]` and `ASHLEY: (I should keep this to myself.) [nervous]` work. Thoughts keep the character's bust, expression and theme, appear in italics with a thoughts nameplate, and suppress automatic character voice/effect sounds. Explicit `#SFX` and background audio still work. Quotes and parentheses remain in the displayed text and transcript. Curly/single quotes, nested parentheses and multiline thoughts are supported; incomplete wrappers are withheld while streaming. Parentheses within ordinary speech, such as `ASHLEY: "Hello (again)."`, remain spoken dialogue. Parenthetical prose without a character label remains narration.

Commands occupy their own line. Command names are case-insensitive. Unknown commands are ignored and reported, never displayed. Commands are applied in sequence up to the next visible narration/dialogue/artifact beat. Commands after the last visible beat are applied before the reply panel.

Standalone five-field scene headers supply date, phase, time, season and location without adding a visible beat. The latest valid header is inherited from earlier assistant messages; headers in this POV update when reached. A structured header can also precede `/////`, where only its metadata is extracted. See [scene variables and lighting](scene-context.md). Background and music also inherit their latest earlier POV commands, respecting clears/stops/scene resets.

Cast, expression/slot state, ambience, camera, tint, fade/text effects and presentation mode also persist across responses until changed or cleared. Repeated enters and repeated resolved media reuse the existing scene resources. Use `#EXIT`, `#SCENE`, stops and resets deliberately; see [scene continuity](continuity.md).

`Narrator:` and `Narration:` are reserved narration labels, with quoted or plain text. They never create a body, consume a stage slot or enter the Fish speaker prompt. `#ENTER Narrator` and `#ENTER Narration` are ignored; existing characters stay onstage during narration.

| Command | Meaning |
| --- | --- |
| `#BACKGROUND name` | Resolve `backgrounds/name` with common image extensions. `NONE` or `CLEAR` removes it. Characters remain present. |
| `#MUSIC name [speed]` | Loop music; changing tracks crossfades. Same-track requests do not restart playback. |
| `#MUSIC STOP` | Fade out music. |
| `#AMBIENT name [speed]` | Independent looping ambience; `STOP` stops it. |
| `#SFX name` | One-shot sound at this point in forward playback. |
| `#ENTER Character Name` | Stage a character until an exit/reset. Speaking also enters a character automatically. |
| `#EXIT Character Name` | Remove only that character. |
| `#FADE BLACK` / `#FADE IN` | Fade the scene to black / reveal it. Dialogue and controls remain usable. |
| `#FLASH WHITE` | Brief flash; a valid CSS color is also accepted. |
| `#SHAKE LIGHT` / `#SHAKE STRONG` | Brief scene shake. |
| `#TEXT normal` | Reset text flair override. Also `whisper`, `shout`, `jitter`, `shake`. Shaking is restricted to the configured intense emotion tags, even with a shake/jitter text override. |
| `#MODE VN` / `PROSE` / `CINEMATIC` / `BLACK` | Select the presentation mode. |
| `#CAMERA ZOOM 1.2` | Zoom the existing background, clamped to 0.5–3. |
| `#CAMERA PAN 8 -3` | Background translation in percent, clamped to ±30. |
| `#CAMERA RESET` | Restore background camera. |
| `#TINT #72549c` | Scene color tint; valid CSS colors only. |
| `#SCENE CLEAR` | Clear character presence. |
| `#SCENE RESET` | Clear all presentation to the configured default baseline. |

Speed presets: `normal` (1×), `slowed` / `slow` (0.75×), `half` (0.5×), `sped` / `fast` (1.4×), `double` (2×). Playback deliberately allows pitch to follow speed, matching the original effect where the browser supports it.

Legacy `@background`, `@music`, `@soundFX`, and `#soundFX` remain supported **inside the POV section**. Messages without the separator do not opt into legacy whole-message parsing.

## Artifacts

For an object that stays open while dialogue continues, use **`#VISUAL id`** and **`#VISUAL CLOSE id [reaction]`**, loading the environment's `artifacts/id/index.html`. Consecutive commands following dialogue execute within that dialogue beat; close reactions use the actual voice clock or a local duration estimate. **Auto** uses narrative timing rules and waits for input when no rule applies. See [narrative timing and independent visuals](narrative-timing.md) for rules, tags, examples and the distinction from modal artifact beats below. JEV classification is not implemented.

No inspection command is required. Fenced `html` and explicit raw HTML root blocks are artifact beats. For multiline/nested markup, prefer a fence:

````text
```html
<article style="background:#f7eddb;padding:32px">
  <h1>A letter</h1><p>Meet me in the garden.</p>
</article>
```
````

Closing the artifact advances to the next beat. Artifacts can be revisited through backward navigation and transcript buttons. Static HTML is the default: scripts, handlers, embedded frames, forms, and external resource/navigation attributes are stripped, and CSP limits resources to inline styles and embedded data/blob media. Full HTML documents can provide their own styles/backgrounds.

Use `html interactive id=diary` as the fence label **and** enable isolated interactive artifacts in settings to permit inline scripts and the scoped `VNPlus` metadata bridge. `#ARTIFACT diary` instead opens `artifacts/diary/index.html` from the selected environment. Named IDs preserve their own timeline data across messages; unnamed fences stay separate. The iframe keeps an opaque origin (`sandbox="allow-scripts"`, never `allow-same-origin`), no direct SillyTavern APIs/browser storage/forms/popups/top navigation, and a restrictive resource/connect CSP. `VNPlus.extra.get/set/push/remove` reads and saves JSON through message metadata with chat/swipe/revision/paragraph checks. See [artifact setup and timeline rules](artifact-bridge.md). It is not a CPU/memory quota system; static artifacts keep scripts and the bridge disabled.

## Deterministic scenes

Media commands and character names resolve inside the content environment selected in the VN toolbar or settings. `#BACKGROUND kitchen` can reference different artwork in each environment; missing art never falls back to another world. Environment selection changes presentation assets/properties and preserves the current paragraph without rewriting the message. See `environments/README.md` for folder setup.

Every response/swipe reconstructs persistent state from its currently selected history. Background/music/ambience and story headers carry forward until changed or reset. Cast presence defaults to the last three completed POV responses; speaking/entering refreshes presence. Header location changes clear the previous cast, while time changes at the same location retain it. Use `#EXIT` or `#SCENE CLEAR` for explicit departures; **General → Cast memory** can change the recency window or use 0 to retain cast until a departure/scene transition. Background changes alone do not infer departures from artwork.

The compiler assigns stable slots in arrival order. If the player arrives after an NPC took slot zero, only that NPC moves to a free slot. **Left and right groups** uses diagonal rows; **Four separate busts** uses four evenly spaced stations without depth scaling/rise, expanding for larger casts. Both assign primary left/right slots first, then inner slots. Layout overrides contain sorted percentages keyed by cast/column count and are assigned from the outer edges inward. You can switch arrangements from the VN toolbar or settings without replaying the scene. Backward navigation restores snapshots without replaying SFX/flash/shake. Replay explicitly permits one-shot effects again. Audio track identity is restored, but playback does not seek to the historical sample position.
