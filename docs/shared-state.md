# Chat-local VN state

VN+ 2.12 writes a JSON string named **`vn_plus`** through `SillyTavern.getContext().variables.local.set`. It lives in the active chat's `chatMetadata.variables` alongside normal `/setvar` variables, persists through SillyTavern's debounced metadata save, and never writes global variables. VN+ owns the `vn_plus` and `vn_plus_*` names; consumers should treat them as read-only.

Read the latest snapshot from another extension:

```js
function readVN() {
    const raw = SillyTavern.getContext().variables.local.get('vn_plus');
    try { return raw ? JSON.parse(raw) : null; }
    catch { return null; }
}

const vn = readVN();
if (vn?.available) {
    console.log(vn.characters); // [{ id, name, emotion, slot, player, speaking }]
    console.log(vn.player?.emotion, vn.scene?.time);
    console.log(vn.background?.inside, vn.lighting?.level);
}
```

For older ST contexts without `variables.local.set`, VN+ uses `chatMetadata.variables` and `saveMetadataDebounced`. No server plugin or API key is required for sharing state.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1`; consumers should check this before relying on a schema. |
| `available` | A presented VN scene is cached. False before the first scene in a chat/environment. |
| `active`, `generating` | VN overlay is open; a host generation is in progress. |
| `environment` | `{ id, name }` of the selected content environment. |
| `source` | `{ message, swipe, beat, position }`, all zero-based. |
| `scene` | Last reached header: date/dateLabel, phase, time/timeLabel, year/month/day, hour/minute/minutes, season and location. Null without a header. |
| `timeOfDay` | `night`, `dawn`, `day`, `dusk` or `unknown`, from story time even indoors. |
| `characters` | Present busts in slot order, using canonical character IDs and cached emotions. Hidden player busts and the narrator are excluded. `speaking` identifies the current text speaker, including thoughts, rather than proof of audible TTS. |
| `player` | `{ id, name, emotion, present }`. Last known player emotion survives a hidden bust or exit; it is null until known and clears on `#SCENE RESET`. |
| `speaker` | Current canonical text speaker, or null for narration/artifacts. |
| `background` | `{ name, asset, inside, outside }`. `name` is the command/request; `asset` is the resolved URL or null if missing/cleared. Unclassified backgrounds are outside. |
| `lighting` | `{ inside, level, brightness, period, ambientColor, tint, tintOpacity }`. `level` is 0–1, `brightness` is the rendered multiplier. Indoors both are 1 and `period` is `indoor`. |
| `music`, `ambient` | `{ name, asset, rate, loaded, playing, muted, volume }`. These describe looping channels. `loaded` means an audio source is allocated; `playing` means it is started, unpaused, not ended and without a media error. Muting is separate from playing. Volume is the target channel volume, not a crossfade's instantaneous volume. |
| `presentation` | `{ mode, black, camera: { zoom, x, y }, textEffect }`. |

`ambientColor` is the actual CSS tint colour in the VN renderer, normalized by the browser; untinted scenes use `#ffffff`. `tint` and `tintOpacity` describe the overlay separately (currently opacity 0.28). Time-of-day lighting currently changes neutral brightness, without adding a warm/cool colour model. `presentation.black` describes the separate black fade/mode.

Scene snapshots publish after background classification and media/sprite resolution for the current paragraph. Later audio start/pause/error events and mute changes update playback status. Navigation back, replay, response/swipe/history edits, exits, stops and resets are reflected when presented. Repeating the same state does not trigger metadata saves or change events. Breathing, blinking, text reveal and audio playback frames do not write variables.

The cache describes the **last presented scene**, not unseen future paragraphs or an automatically generated interpretation of a closed chat. Closing VN keeps scene/cast/emotions but sets `active`, `music.playing`, `ambient.playing` and both `loaded` flags false. A reload restores the cache inactive. Switching chats binds to that chat's own cache, and switching environments clears the previous environment's snapshot until a new scene is presented. Delayed results from an old chat/environment/paragraph cannot overwrite the current cache. Raw dialogue, canonical prose, HTML artifacts, character properties, voice IDs and credentials are not included. Header metadata is included as requested.

Listen for changes after VN+ has stored the snapshot and scalar variables:

```js
function onVNState(event) {
    const vn = event.detail; // independent copy; modifying it cannot modify VN+
    if (vn.schemaVersion === 1 && vn.available) {
        updateMyExtension(vn);
    }
}
document.addEventListener('vnplus:state-changed', onVNState);
// Also read once when your extension starts; an initial event may precede your listener.
// document.removeEventListener('vnplus:state-changed', onVNState);
```

The event bubbles from the VN root. Keep your own listener lifecycle in your extension; VN+ does not call other extensions or add its variables to the model prompt automatically.

The following convenience variables work with `{{getvar::NAME}}` or `/getvar NAME`:

| Variable | Value |
| --- | --- |
| `vn_plus_available`, `vn_plus_active`, `vn_plus_generating` | `true` / `false` |
| `vn_plus_environment` | Environment ID |
| `vn_plus_characters` | JSON character array with emotions |
| `vn_plus_player_emotion`, `vn_plus_speaker` | Emotion / canonical speaker ID |
| `vn_plus_date`, `vn_plus_time`, `vn_plus_location` | ISO date, 24-hour time, location |
| `vn_plus_time_of_day` | Story time period |
| `vn_plus_background` | Requested background name |
| `vn_plus_inside`, `vn_plus_outside` | `true` / `false`; empty before a cached scene |
| `vn_plus_lighting_level` | 0–1; empty before a cached scene |
| `vn_plus_ambient_light_color` | CSS colour |
| `vn_plus_music`, `vn_plus_ambient` | Requested channel names |
| `vn_plus_music_playing` | `true` / `false` |

Absent scalar values are empty strings; unknown time of day is `unknown`. `vn_plus` contains richer data, including resolved asset URLs, playback rate, mute and cached scene metadata.
