# Validation record

Validation performed on 2026-10-15 against the workspace remake. Installed SillyTavern **1.19.0** source was inspected for API names, event signatures, selected-message semantics, regeneration, normal send controls, and RegEx preset fields. Browser checks use a simulated host without changing real chats or settings. The installed extension was subsequently backed up and converted to a Git clone for updates; SillyTavern's application source was not changed.

## Automated checks

- Version 2.5 tests real filesystem creation in isolated temporary environments: empty sprites folders, saved random properties, colors preserved across a fresh service instance, alias lookup without an inventory, unchanged existing artwork/properties/published catalog, concurrent requests across environments, local catalog preservation, Unicode/Windows device names, path traversal and junction rejection, invalid catalogs, legacy flat installations, and authenticated administrator routing without a Fish key. Browser checks simulate the bridge to verify first-line coloring, no duplicate known speakers, silent default voices, the disable setting, readable failures, and stale-response isolation on environment changes. The read-only demo disables filesystem requests.

- Version 2.4.1 excludes reserved narrator labels/entrances and narrator aliases from staging, cast slots and voice prompts. Browser checks verify narrator text remains readable through navigation, and the image-only textbox setting persists, keeps its texture even with the panel background disabled, removes fill/border/accent/shadow/blur/nameplate background, respects character overrides, and falls back to the normal box when no texture is configured. The final visible browser run passed all 27 checks; an earlier background run timed out waiting for an existing expression crossfade to finish.

- **81 Node tests pass** (`npm test`): privacy/whitespace boundary, Unicode/multiline parsing, incomplete POV, legacy commands/assets, four NPCs plus player, aliases, snapshots, SFX history/replay, swipes/branches, RegEx presets, asset containment, exact expression precedence, audio lifecycle/cancellation, hostile object-key names, diagonal row depth, fixed separate bust stations, layout preference migration, mesh topology/fractional motion/fixed borders, configurable centers and clamping, absence of inverted triangles at maximum strength, blink paths/missing-art behavior, music mute during fades/pending loads/reopening, environment root validation/media isolation, independent settings-profile migration, stale font cleanup, paragraph reconstruction without repeating effects, the published environment inventory, personal catalog merging without changing published data, legacy local additions, and release removal of obsolete media without revival from a stale local catalog.
- **29 browser checks pass.** The fixture tests the actual DOM renderers/controller using a **simulated SillyTavern host**, covering privacy, four characters, themes/expressions, diagonal row depth, synchronized toolbar/settings layout selection without restarting playback/audio, synchronized environment selection/profile isolation/current-paragraph preservation, stale environment sprite/preview/audio cancellation, refreshed custom environments and switching during generation/while closed, music mute, moving mesh vertices, live per-character center controls, expression crossfade/cancellation, closed-eye texture swaps/reopening/reduced-motion cleanup, GPU seam/alpha/orientation checks and context-loss fallback, state restoration, HTML sandbox isolation, reveal, pending generation, swipes/edits, chat cleanup, refresh/remount/reinitialization, missing art, stale async loads, click/keyboard/typewriter/auto controls, and reply/retry/exit/resume. Audio sources in acceptance checks are simulated; the playable demo uses browser audio. Machine-readable results are in `browser-results.json`.
- Production modules pass `node --check`; no runtime package dependencies.
- Version 2.4 adds Fish Audio tests for property-only voice assignments and mute characters, POV/dialogue/thought filtering, fresh chapter speaker mappings, all-chapter validation before requests, fragmented UTF-8/CRLF/multiline SSE, ordered audio and cumulative alignment replacement, ambiguous/missing timestamps, shared silence margins, PCM/WAV assembly, RMS/peak processing, cache reuse, failed/cancelled chapters, obsolete audio callbacks, per-user secret isolation, fixed provider routing and single-request concurrency. Provider requests are simulated; no real Fish API key or account was used.
- Browser checks verify shadow silhouettes, inherited ST colors/font, live theme overrides, intense-only text shaking, Fish settings/key-form clearing, property-derived voice IDs, decoded chapter audio, processing workers, dialogue/voice synchronization, mute thoughts/narration, cached regeneration, draft blocking, swipe cancellation, and real MP3 worker exports decoded by Web Audio. Live Fish voice quality/account compatibility remain manual checks.
- Version 2.4 tests freestyle prose without a narration marker and quoted/bare internal thoughts, including nested parentheses, multiline text, preserved expressions, backward restoration, and incomplete streaming input. Browser checks verify italic thought styling even with reduced motion, speaker identity, transcript labels, suppression of automatic character sounds, explicit SFX, return to spoken dialogue/narration, replay, and unchanged chat content.
- Version 2.2.1 removed six unused legacy JavaScript files and two old stylesheets. All 52 JavaScript sources, including tests, workers, the bundled MP3 encoder and server plugin, pass syntax checks. The active stylesheet's class/ID selectors have source references, and its overridden dialogue-border rule is consolidated.
- Version 2.3.1 separates personal additions into ignored `assets.local.json`. Running the default inventory builder leaves the published `assets.json` byte-identical. Browser refresh reads both catalogs, discovers a personal environment, and preserves the current paragraph while leaving the published data unchanged. GitHub Actions runs the Node tests.
- Version 2.3 moves all supplied authored content into the Coffin environment. Every originally inventoried asset is checked against the previous ZIP by SHA-256 at its new relative path; the extra nested texture copy is preserved there too. Harry Potter and Re:Zero are empty starter environments. The inventory contains 592 files: the original 590, that extra texture copy, and the relocated authored demo scene.
- Desktop visuals inspected with supplied sprites/backgrounds, themes, dialogue/typewriter and a centered artifact panel. Right-side browser shrink-to-fit was caught and corrected.
- Version 2.2 uses actual moving mesh vertices instead of the quantized SVG displacement map. A synthetic semitransparent texture is checked at five fractional breathing phases: interior alpha remains uniform across triangle boundaries, colors retain premultiplied-alpha integrity, and top/bottom marker strips retain orientation. Context-loss fallback removes the mesh and exposes ordinary images. A shared animation-frame clock/context drives all visible busts and stops on cleanup, reduced motion, or hidden tabs. Center controls are checked for persistence and unchanged sprite/cursor identity. Blink tests use an existing alternate expression as a stand-in; real closed-eye artwork must be supplied for production blinking.

## Required acceptance cases

| Case | Evidence |
| --- | --- |
| 1. Combined message renders POV only | Split/parser tests and DOM privacy assertion. |
| 2. No accidental canonical reveal in VN | Missing/empty/pending tests; no canonical tokens in inspector/transcript. |
| 3. Three/four NPCs on one scenario card | Node stages four NPCs plus Jason; browser stages four people from one message. |
| 4. Jason's left priority | Slot tests including a late player entrance. |
| 5. Silence does not remove characters | Presence assertions through dialogue and narration. |
| 6. Expression and property styling | Exact excited sprite/alias tests; browser sprite/theme assertions. |
| 7. Background/music/ambience/SFX | State tests, supplied asset paths, independent audio tests and fixture rendering. Audible output remains a live check. |
| 8. Backward restoration | Snapshot equality and real DOM background/audio-selection restoration. |
| 9. Automatic HTML | Parser and browser artifact opening/dismissal; static script stripping; interactive opaque origin denies parent DOM/storage access. |
| 10. Missing art | Named placeholder and readable text in browser. |
| 11. Alternative swipe | Fixture changes authoritative selected swipe and emits installed API event names. |
| 12. Chat isolation | Fixture clears background, sprites, audio and stale transcript; no global persistence. |
| 13. Refresh | Fresh controller reconstructs a stored message; core compiles identically. |
| 14. Read-only reveal | Stored chat JSON unchanged; explicit modal closes during generation. |
| 15. Legacy compatibility | Assets preserved; flat/sprites layouts, music folders, old commands and properties tested. |
| 16. Reply/retry/exit/resume | Normal controls delegate to simulated host; draft and older-message retry safeguards. |

## Live checks still required

1. Install/reload in your actual 1.19.0 session; confirm coexistence with your extensions/theme.
2. Import the supplied RegEx presets and verify your full script ordering shows only POV and sends only canonical text, including streaming/pending responses. The renderer does not configure RegEx automatically.
3. Exercise your actual generation/POV workflow: regenerate, swipe, edit, delete, branch, switch chats and refresh. Fixture events verify adapter logic; real provider/extension timing has not been exercised.
4. Listen to music, ambience, speed/pitch, crossfades and SFX after interaction; verify browser autoplay and background-tab behavior.
5. Send/retry once using your actual generation settings. Automated checks avoid real messages and paid calls.
6. Check custom art/fonts, mobile hardware and very long scenes. Desktop visuals were inspected; mobile hardware and large-session soak testing were not performed.

## Deliberate scope and limits

- The separate model-based POV rewrite/concatenation workflow is outside the renderer, as specified. No prompt manager, separate history, image generation or LLM requests.
- Responses are self-contained scenes: include setup commands in each. This avoids cross-message branch/swipe leakage.
- Snapshots restore track selection/rate, not historical audio sample offset. Replay explicitly enables one-shot effects again.
- Seen progress is bounded and session-only. Refresh reconstructs from the message starting at its first beat.
- Prefer fenced HTML for complex documents and multiline quoted dialogue without blank separating lines. Raw HTML parsing is compact rather than a full HTML lexer.
- Styling uses semantic colors/fonts/textures/scale/offsets/sounds; arbitrary app-level HTML/CSS injection is not supported.
- Interactive artifacts remain isolated and CSP-constrained, but are not CPU/memory-limited execution environments.
