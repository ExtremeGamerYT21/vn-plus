# VN scene state in message extra

Since **2.14**, VN+ stores runtime state in each message's **`extra.vn_plus`**, saved through SillyTavern's normal chat API and synchronized into the active swipe metadata. It no longer writes chat-local shared variables. Existing VN-owned `vn_plus`/`vn_plus_*` copies are retired when the message metadata is written; unrelated variables and extra fields are preserved. Settings remain normal extension preferences and Fish keys remain in the server secret store.

The namespace contains `context` (the latest reconstructed context while that message is current), `playback` (the viewed paragraph), `variables` (scalar values), `messageId`, `variantId`, the current `revision`, and a `revisions` table retaining previous source revisions and artifact actions. Root fields mirror the current revision for convenient access. Artifact storage and its API are documented in [persistent HTML artifacts](artifact-bridge.md).

Since **2.13**, this is the latest state reconstructed from the chat's currently selected messages, including the entire latest completed POV. It rebuilds on startup, opening VN, host message edits/swipes/deletion/receipt, generation completion, history loading, chat changes and environment/identity/cast settings changes, even while VN is closed. Stored variable output is never trusted as input. During asynchronous rebuilding, old fields are cleared and `available: false, updating: true` tells consumers to wait for the new result.

Read the latest snapshot from another extension:

```js
function readVN() {
    const chat = SillyTavern.getContext().chat;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i].is_user && !chat[i].is_system) return chat[i].extra?.vn_plus?.context || null;
    }
    return null;
}

const vn = readVN();
if (vn?.available) {
    console.log(vn.characters); // [{ id, name, emotion, slot, player, speaking }]
    console.log(vn.player?.emotion, vn.scene?.time);
    console.log(vn.background?.inside, vn.lighting?.level);
}
```

No server plugin or API key is required for message metadata. Snapshot changes use debounced chat saves; artifact actions request an immediate chat save. Raw message text is unchanged.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1`; consumers should check this before relying on a schema. |
| `available`, `updating` | Structured POV/header state is available from current context; a reconstruction is pending. Check `available && !updating` before consuming scene data. |
| `basis` | `context` for extra.vn_plus.context; `playback` for extra.vn_plus.playback; artifact reads can use `artifact`. |
| `active`, `generating` | VN overlay is open; a host generation is in progress. |
| `environment` | `{ id, name }` of the selected content environment. |
| `source` | `{ message, swipe, beat, position }`. Message/swipe are zero-based. Context uses the latest assistant message and null beat/position; playback also supplies zero-based beat/position. |
| `scene` | Last reached header: date/dateLabel, phase, time/timeLabel, year/month/day, hour/minute/minutes, season and location. Null without a header. |
| `timeOfDay` | `night`, `dawn`, `day`, `dusk` or `unknown`, from story time even indoors. |
| `characters` | Inferred cast in slot order, using canonical IDs and latest emotions. By default a character must speak or explicitly enter within the last three completed POV responses. Exits, scene clears/resets and changed header locations remove previous cast. Same-location time changes retain cast. Hidden player busts and the narrator are excluded. `speaking` identifies a text speaker rather than proof of audible TTS. |
| `player` | `{ id, name, emotion, present }`. Last known player emotion survives a hidden bust or exit; it is null until known and clears on `#SCENE RESET`. |
| `speaker` | Current canonical text speaker, or null for narration/artifacts. |
| `background` | `{ name, asset, inside, outside }`. `name` is the command/request; `asset` is the resolved URL or null if missing/cleared. Unclassified backgrounds are outside. |
| `lighting` | `{ inside, level, brightness, period, ambientColor, tint, tintOpacity }`. `level` is 0–1, `brightness` is the rendered multiplier. Indoors both are 1 and `period` is `indoor`. |
| `music`, `ambient` | `{ name, asset, rate, loaded, playing, muted, volume }`. Name/asset/rate describe the latest context request, including while closed. Loaded/playing describe a live audio source only when it matches that resolved recording. Muting is separate from playing. Volume is the target channel volume, not the instantaneous crossfade volume. |
| `presentation` | `{ mode, black, camera: { zoom, x, y }, textEffect }`. |

`ambientColor` is the context's CSS tint colour, normalized by the browser; untinted scenes use `#ffffff`. `tint` and `tintOpacity` describe the overlay separately (currently opacity 0.28). Time-of-day lighting changes neutral brightness, without adding a warm/cool colour model. `presentation.black` describes the separate black fade/mode.

Context snapshots publish after current message reduction, background classification and media lookup; they do not play audio, stage sprites, open artifacts, create character folders or generate voices. Host event bursts coalesce before rebuilding. Audio start/pause/error and mute events update activity separately. Breathing, blinking, text reveal and playback frames do not write variables. During generation the last completed context remains available with `generating: true`; unfinished streamed text is not used.

The context cache includes all completed paragraphs of the latest selected response, even when you are replaying an earlier paragraph/message. Closing VN sets `active` and live audio status false while context continues updating. Reloads reconstruct from the chat; switching chats/environments clears the previous output before rebuilding. Delayed results from an old context cannot overwrite the current result. Raw dialogue, canonical prose, HTML artifacts, character properties, voice IDs and credentials are not included. Only requested structured header metadata can come from canonical text. Inference uses commands, headers and speaker activity; free-form prose is not interpreted for implicit entrances/exits. **General → Cast memory** controls the response window (default 3; 0 keeps until an explicit exit, scene clear/reset or changed header location). Background/time/music searches are not limited by that cast window.

For the paragraph actually on screen and its actual audio selection, read **`message.extra.vn_plus.playback`** directly. It has the same scene fields with `basis: "playback"`, follows back/replay/explicit historical message selection, and emits **`vnplus:playback-changed`**. Its music/ambience describe the current rendered channels. It cannot overwrite the current context snapshot. Opening VN without specifying a historical message selects the latest assistant response; explicit message buttons and internal playback controls still replay the selected message without looking ahead. Playback inherits the same recent-cast and header-location rules from context up to that response.

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

The following convenience values live inside **`message.extra.vn_plus.variables`**. Read them as ordinary object properties, such as `message.extra.vn_plus.variables.vn_plus_time`. They are no longer `/getvar` or `{{getvar}}` variables.

| Variable | Value |
| --- | --- |
| `vn_plus_available`, `vn_plus_updating`, `vn_plus_active`, `vn_plus_generating` | `true` / `false` |
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

Absent scalar values are empty strings; unknown time of day is `unknown`. `context` and `playback` contain richer structured data, including resolved asset URLs, playback rate, mute and cached scene metadata. The `variables.vn_plus` field retains a JSON encoding for consumers that prefer it.
