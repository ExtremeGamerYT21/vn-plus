# Narrative timing and independent visuals

Since 2.15, **Auto** follows a local beat clock instead of a fixed delay after the typewriter finishes. Manual mode remains the default. Change **Extensions → Visual Novel+ → Timing** for silent-dialogue speed, narration reading speed and optional reaction sounds. No extra generation or Fish request is triggered by Auto.

## Timing rules

| Content | Clock |
| --- | --- |
| Prepared voiced dialogue | Actual retained PCM duration and the audio player's clock; existing transcript word timestamps reveal the text. Loading, buffering and paused audio do not consume the speech clock. |
| Dialogue without an available voice clip, including silent thoughts | Visible character count × seconds per character; default **0.1 s**. A failed clip falls back to this estimate. |
| Narration | Word count at **220 words/minute**, plus sentence pauses. Turning/nodding/sitting/standing has a minimum action duration. Explicit numeric waits, such as “wait for 5 seconds,” use that time (up to five minutes), or reading time if longer. |
| Inspecting a paired object | Watch/clock **4–7 s**, newspaper/journal **8–14 s**, note/letter/diary/book **5–9 s**, or reading time if longer. Requires inspection/check/read/look/examine wording and an active visual with a matching future close. |
| Unrecognized content, visual-only interaction, modal artifact | Wait for input. No generic timer skips an interaction. |

Object duration samples are seeded by the object ID, narration and source line. Replaying unchanged content gives the same sampled duration. There is no object timer for an unpaired visual. A sampled inspection duration controls the narration's dwell time; **it does not close the object early**. The close executes when its script beat is reached. The parser looks for its matching close in the current response, not in hypothetical future messages.

Auto waits until text reveal, voice playback, the beat's reading/action duration and attached reactions/animations finish, then holds the completed beat for the **Autoplay pause after completion** slider under **Timing**: **0–2 seconds**, default **1 second**. The pause does not overlap unfinished text or speech. Pausing/resuming, adjusting the slider or re-enabling Auto starts a fresh selected pause once the beat is ready. Clicking once still finishes text reveal; another click advances immediately. Turning Auto off does not disable dialogue-attached reactions. Inspector, voice/transcript panels, the reply editor, modal artifacts and hidden tabs hold the scheduler. Navigation and chat/swipe/environment changes cancel obsolete clocks, including a pending completion pause. Click the **Visual Novel+** settings heading to collapse or expand the entire extension panel; that preference is saved.

Spoken dialogue ending in an **em dash (`—`)** hands off immediately once its text and actual voice finish, overriding the completion pause. Pending attached commands execute at that handoff without waiting for their reaction delay or animation to finish. Consecutive voiced beats also omit the interrupted clip's trailing margin and the next clip's leading margin, including across chapter boundaries. Spoken word timestamps and approved manual cuts remain intact. Loading/paused audio still holds progression; thoughts and narration retain normal timing. This removes added padding and pauses, while ordinary playback startup latency can still apply.

## Independent HTML objects

Put a self-contained HTML document at:

```text
environments/<environment>/artifacts/see_watch/index.html
```

The path is the same as a named `#ARTIFACT`, but the presentation is independent:

```text
#VISUAL see_watch

You pull out your pocket watch and inspect it.

Henry: "Jason! We're leaving!" [calling]
#VISUAL CLOSE see_watch [hurried]

You turn toward your father.
```

The watch remains open through narration and Henry's line. Its close belongs to Henry's execution beat, so it does not wait for the player to click into the following narration. Multiple visual IDs may be open at once. Repeated openings of the same active ID preserve its iframe and interaction state. A player can close one object without advancing dialogue; it stays dismissed until the script removes it and opens it again, or playback is reset to another world. `#SCENE RESET` closes script visuals; normal location/cast changes do not implicitly close carried objects.

Visual-only turns display an untimed **Interaction** beat, even when Auto is enabled. Interactive scripts require **Allow isolated interactive HTML artifacts**. Without it, HTML remains static. Enable that setting to use the included [pocket watch](../examples/watch.html), which reads story time/lighting and can save a marked time. Copy it into the local path above. The demo at `demo/index.html?timing` loads this example directly without modifying an authored environment or making paid calls.

Each object uses an opaque sandbox, restrictive CSP and the existing [artifact metadata API](artifact-bridge.md). Its background is transparent by default. Embed textures as data URLs or inline SVG/CSS; external resources remain blocked. `.vn-visuals`, `.vn-visual` and `[data-visual-id="see_watch"]` are available to environment `dialogue.css` for position and size changes. Their containers do not intercept clicks elsewhere in the scene.

`VNPlus.read/getScene/extra.get/set/push/remove` follow the **currently viewed paragraph**, including when the same visual stays open into another response. Each request captures and validates that paragraph's message/swipe/revision. An action that races navigation is rejected for retry; it cannot silently write into a different scene. Historical playback remains read-only. JSON actions persist in `extra.vn_plus` with the existing branching rules. `context.visuals` describes script state; `playback.visuals` describes the viewed script beat.

## Dialogue-attached commands and reaction tags

Consecutive commands immediately after dialogue, allowing blank lines, are attached to that dialogue beat. A new narration, artifact, header or dialogue ends that group. Their persistent state still reconstructs in script order for history. Sound/flash/shake effects fire once per forward traversal; ordinary backward navigation and resume do not replay them. Replay explicitly enables them again. Manually continuing a finished line completes its pending commands before moving on; back/skip cancel pending reactions and restore the destination state.

| Reaction | Dispatch time | Visual animation |
| --- | --- | --- |
| `hurried` | Dialogue end + **180 ms** | **160 ms**, brisk ease |
| `scared` | Dialogue start + **80 ms** | **120 ms**, ease-out |
| `lazy` | Dialogue end + **1800 ms** | **1000 ms**, ease-in-out |
| `bored` | Dialogue end + **900 ms** | **650 ms**, ease-out |
| `normal` | Dialogue end + **450 ms** | **350 ms**, ease-in-out |

A command's trailing `[tag]` takes precedence over its dialogue's direction. With no recognized tag, the standard reaction applies. Closing a visual can also play the optional SFX name configured for that reaction in Timing settings. Reduced motion applies the state change without animating it. Auto waits for the scheduled reactions and their visual animation time before advancing.

Resolution is an exact alias map, then local natural-language patterns. For example, `[quickly]` and `[closes the watch quickly]` resolve to `hurried`; `[drops it in fear]` resolves to `scared`. Negated/unknown phrases fall back to `normal`. Natural-language matches are not cached across scene contexts. **JEV is not implemented and no classification model is called.** These patterns are deliberately limited; explicit reaction tags are the most predictable choice.
