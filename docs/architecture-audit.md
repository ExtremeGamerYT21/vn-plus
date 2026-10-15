# Source audit and remake decisions

The supplied workspace contained the extracted original `vn-plus` directory (no additional archive was supplied). The active `index.js`, `style.css`, manifest, README, character properties, and historical variants were inspected before replacement.

## Original implementation

The active entry point combined parsing, DOM construction, two fixed bust slots, themes, typewriter timers, Web Audio music, navigation, settings, and SillyTavern hooks in roughly 2,800 lines. Assets use both flat character folders and `sprites/`, with backgrounds in `backgrounds/`, effects in `sfx/`, music in `sfx/music/`, textures in `characters/shared/`, and fonts in `fonts/`.

Useful behavior retained by the new implementation: expression assets, speaker dimming, theme colors and textures, font loading, the emotion flair table, typewriter punctuation pauses, music speed presets, crossfading, legacy commands, and integrated reply/retry controls. All supplied art, audio, fonts, and character properties remain intact. The unused editing variants and old source/style copies were removed in version 2.2.1 after checking the manifest, module imports and HTML entry points.

## Problems addressed

- The old parser received the whole response and could expose canonical text.
- `onMessageReceived` ignored its message ID and read the last chat message.
- `normalizeEmotion` mapped `excited` to `happy` before searching for an actual excited sprite.
- A single right-side slot replaced previous NPCs; narration could hide silent NPCs.
- Backward navigation replayed text without reconstructing the background, expressions, staging, and music.
- Global localStorage scene/message keys leaked presentation across chats and branches.
- Uncancelled image, font, and audio loads could overwrite newer presentation.
- The prompt-ready handler modified the main narrator's system message.
- HTML fences were stripped rather than presented.

## New boundaries

`message-reader` is the raw-message boundary. It splits on an exact five-slash line without trimming either section. Only its POV output enters the VN parser. A separate strict scene-header extractor may read the five requested metadata fields from canonical text. The parser emits semantic tokens; the timeline compiler produces deterministic snapshots; the playback controller applies snapshots and fires one-shot effects only on first forward traversal (or explicit replay). Background, music and scene headers inherit earlier selected-message values; other presentation state starts fresh.

SillyTavern remains the conversation authority. Settings are saved through its extensionSettings interface. Seen-beat sets are bounded, in-memory only; there is no transcript persistence, prompt hook, rewriting request, or second history. Chat-display/context separation remains the user's RegEx workflow.

## Content environments

All supplied artwork, audio, fonts and character properties live in `environments/coffin-of-andy-and-leyley/`. Harry Potter and Re:Zero have independent starter folders. `content-environments` validates declared roots and manages per-environment character/font/texture preference profiles; older flat preferences migrate into the original setting.

The controller creates an asset resolver and registry rooted at the selected environment, and rebuilds the current message at its existing paragraph when selection changes. It invalidates stage/audio/preview requests, removes old loaded fonts and resumes without repeating earlier one-shot effects. Every local font receives a family name scoped to its environment. Media filenames and character IDs can therefore overlap between settings; no fallback traverses another environment.

The inventory tool discovers lowercase environment directories, reads their display metadata, and indexes all content folders. Shared rendering/POV logic remains outside those folders. Scene/material files are authoring storage; the selected chat's POV remains the only source of playback and inline HTML.

## Sprite mesh rendering

`sprite-mesh` builds a shared 48 × 48 triangle grid. Breathing updates floating-point positions around each character's normalized `centerX`/`centerY`, while UV coordinates and image borders stay fixed. One WebGL context draws premultiplied textures with linear sampling (and mipmaps when supported), then copies each result to the frame's canvas. This avoids both quantized displacement stepping and a separate GPU context for each character/expression. Mesh canvases follow displayed size/device pixel ratio, capped at 2048 pixels per dimension.

`sprite-animator` supplies a shared breathing clock and applies the same phase/configuration to incoming and outgoing expression frames. Blink alternatives switch textures immediately on the same geometry. Retired frames release textures/canvases; reduced motion restores ordinary images and clears the clock. WebGL failure/context loss falls back to those images. Applying a breathing center updates stage properties without reinitializing dialogue or audio.

## Installed API inspection

The installed source was inspected at `D:/pinokio/api/sillytavern.git/app`: package version, `public/scripts/st-context.js`, `events.js`, `script.js`, RegEx engine, and EventEmitter. The adapter uses `SillyTavern.getContext()`, `extensionSettings`, `saveSettingsDebounced`, `eventSource`, `eventTypes`, `generate`, and `getCurrentChatId`. It subscribes only to events present in that context. Reply dispatch uses the actual `#send_textarea` / `#send_but` UI; retry calls `generate('regenerate')` only for the final assistant response. No source in the installed application is changed by this remake.
