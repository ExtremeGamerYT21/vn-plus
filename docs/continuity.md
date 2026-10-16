# Scene continuity

Since 2.13, entering VN reconstructs state from the current selected chat messages. **General → Cast memory** defaults to three completed POV responses: speakers/explicit entrants refresh their presence, inactive older cast drops away, and explicit exits/scene clears/resets always win. Header location changes also clear the previous cast; same-place time changes do not. Set the window to 0 to keep cast until an exit or scene/location transition. Media and header lookup still search all prior context. Current state in message.extra.vn_plus.context rebuilds even while VN is closed; message.extra.vn_plus.playback separately describes the paragraph on screen. Artifact actions are saved alongside these snapshots and follow their own persistent timeline. See [shared state](shared-state.md).

While VN mode stays open in the same chat and environment, a new response preserves the existing world during preparation and generation. The previous dialogue and interactive panels close while generation runs, but music/ambience, artwork and character animation records stay alive. Obsolete pending loads are cancelled without stopping the active loops or removing the current images.

- **Music and ambience:** a repeated recording reuses its existing audio player, current time, mute state and playback. Matching compares the actual resolved URL, so differently worded commands that select the same file do not restart it. Speed changes update playback rate in place. A genuinely different recording uses the normal crossfade.
- **Backgrounds:** the current image stays visible until the replacement resolves. A repeated resolved image is left untouched; story-time lighting can still change independently.
- **Characters:** names/aliases resolve to canonical character IDs. Existing characters keep their DOM nodes, image frames and animation records. Repeated `#ENTER` does not reset a present character's expression or slot. A changed expression uses the normal expression transition; new characters get new records.

The opening state of each response is reconstructed by reducing earlier assistant POV commands and dialogue expressions in order. This includes cast, expressions/slots, background, music, ambience, camera, tint, fade state, text effect and presentation mode. Scene header metadata follows its existing history rules. Current-response commands then apply in sequence. Old prose, artifacts and one-shot effects are not added to the new timeline or replayed. New explicit SFX/flash/shake commands run once on first forward playback, or again on explicit replay.

## Clearing and navigating

| Command/action | Result |
| --- | --- |
| `#EXIT name` | Remove that character from subsequent scene state. |
| `#SCENE name` | Clear the cast; keep background/audio and other presentation fields. |
| `#SCENE RESET` | Reset cast, artifacts and presentation effects, retaining background, music and the last structured story header. |
| `#FADE BLACK` / `#FADE IN` | Hide/reveal the scene while keeping its background and music selected. |
| `#AMBIENT STOP` | Stop the ambient loop. |
| `#CAMERA RESET`, `#TEXT normal`, `#FADE IN` | Restore the corresponding persistent setting. |
| Exit/disable VN, switch chat or switch environment | Release the current world and audio resources. |

Going backward or opening an earlier response reconstructs its preceding state, without using later messages. Edits/swipes of earlier messages rebuild the current scene while keeping its paragraph when possible. Browser reloads recover the scene choices/cast from chat history, but create new audio players; playback position is preserved across live response transitions, not across a full page reload. Canonical prose/commands and user/system messages never supply world state; only the separately requested structured header fields may come from canonical text.

Missing background/music selections use an independent backward scan of all earlier selected POV messages, without a cast-window limit. Named media persists through scene resets. Legacy background clear/none, music stop/none and empty media commands are inert, so they cannot interrupt the search or erase a current selection. A chat with no named media anywhere has no selection to recover; VN+ does not invent an unrelated asset.
