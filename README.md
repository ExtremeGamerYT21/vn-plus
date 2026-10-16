# Visual Novel+ 2.20.2

Version 2.20.2 keeps characters visible under unknown emotion tags when their configured default image is missing: `neutral` is now a final safe fallback. For example, `[cool]` can use `neutral.png` even if properties still specify a nonexistent `default.png`. Exact artwork, character aliases, ranked expressions and valid defaults retain priority. Original story tags, voices and character properties are preserved. Refresh SillyTavern after updating.

Version 2.20.1 gives the Harry Potter theme a shared parchment sheet around dialogue and playback controls, an original local paper texture, irregular edges, soft paper shadows and raised brass keys with pressed states. Copy the theme's `ui/` folder along with its CSS files. The new `.vn-dialogue-shell` defaults to `display: contents`, preserving other themes and image-only textbox layouts. See [theme installation and customization](examples/harry-potter/README.md). Refresh SillyTavern after updating.

Version 2.20 adds optional per-environment **settings.css**, scoped to VN+'s extension settings alongside the existing **dialogue.css** for the overlay. Both unload on environment changes, survive settings-panel remounts, reload with **Refresh assets**, and can be disabled under **General → Apply environment CSS (dialogue / settings)**. CSS variable font shorthands now retain their values. The original [Harry Potter correspondence & brass theme](examples/harry-potter/README.md) provides parchment dialogue, emerald ink, brass controls and matching ledger settings. Copy its CSS files and `ui/` folder into your local Harry Potter environment to use it; installed custom CSS remains Git-ignored. Refresh SillyTavern after updating; no server restart is needed.

Version 2.19 adds a quick **Busts / Full body** toolbar selector, mirrored in **General → Artwork framing**. Full-body drawings anchor at the screen bottom while missing-art shadows keep their existing bust height and baseline. Existing per-character `offsetX`/`offsetY` pixel shifts and `bustScale` work in either mode. Narration gently dims the cast, restoring speaker lighting when dialogue resumes, independently of narrator voicing. See [framing, offsets and narration lighting](docs/character-framing.md). Refresh SillyTavern after updating; no server restart is needed.

Version 2.18 adds a master emotion routing table with **388 recognized labels/adjectives** and ranked fallbacks over SillyTavern's full **28 base emotions**. Identical artwork wins first, then character `expressionAliases`, then the closest available ranked expression in that character's environment. Sparse sprite sets, legacy names, neutral/default art and newly added closer canonical sprites are supported. Inspect reports the route and rank; blinking follows the selected image. See [emotion routing and examples](docs/emotion-routing.md). Refresh SillyTavern after updating; no server restart is needed.

Version 2.17 continuously checks the current response while VN is open, recovering when a POV transformer silently adds or replaces the `/////` section. Historical playback keeps its selection. Fish settings add optional **automatic voice generation** with a next-line readiness symbol and **narrator voicing** from the environment's `characters/narrator/properties.json`. Narrator name, text color and font apply even while muted. **General → Hide player bust (first-person view)** keeps the player invisible while preserving dialogue, voice and emotion. Automatic generation is opt-in and reuses prepared audio; failed requests require manual retry. See [voice settings and narrator setup](docs/speech.md). Refresh SillyTavern after updating; no server restart is needed.

Version 2.16 collects important-scene journal entries from the existing POV transformer’s optional trailing `vnplus-journal` JSON block. No additional model request is made. Each response stores only its diary additions in `extra.vn_plus`, with duplicate suppression, inherited story dates, selected-swipe/revision/branch isolation and an end-of-response visibility boundary. The diary API combines these with manual notes. See [journal setup and transformer instructions](docs/journal.md). Import the optional journal-display RegEx preset to hide metadata in ordinary chat too. Refresh SillyTavern after updating; no server restart is needed.

Version 2.15 adds deterministic narrative timing and **independent interactive visuals**. Auto follows actual prepared voice audio, or configurable dialogue/reading/action rules, and pauses when there is no timing rule. `#VISUAL see_watch` opens a local object while dialogue continues; `#VISUAL CLOSE see_watch [hurried]` attaches its close to the preceding spoken beat. Reaction aliases/patterns control timing, animation and optional SFX. Paired watch/newspaper/note inspections use reproducible duration ranges; unpaired objects stay open. JEV remains unimplemented. See [timing, commands and setup](docs/narrative-timing.md) and the [working pocket watch](examples/watch.html). Refresh SillyTavern after updating; no server restart is needed.

Version 2.14 stores VN scene snapshots, scalar variables and persistent artifact actions in **each message's `extra.vn_plus`**, synchronized with its selected swipe and content revision. It stops publishing chat-local variables and retires the old VN-owned copies. Interactive HTML gets `VNPlus.read()`, `VNPlus.getScene()` and `VNPlus.extra.get/set/push/remove` through a scoped sandbox bridge. Named artifacts share their own timeline data across messages; branches, swipes, edits and historical paragraphs stay separate. `#ARTIFACT diary` opens the selected environment's `artifacts/diary/index.html`. See [message state](docs/shared-state.md), [artifact setup/API](docs/artifact-bridge.md), and the [working diary example](examples/diary.html). Refresh SillyTavern after updating; no server restart is needed.

Version 2.13 makes `vn_plus` a reconstruction of the **latest selected chat context**, updated on startup, chat/message/history changes and whenever VN opens, including while VN is closed. Stored output is never reused as input. The latest background/music/header and recent cast/emotions come from current selected swipes; generation holds the last completed context. Pending rebuilds clear old values and report `available: false, updating: true`. Historical playback has its own `vn_plus_playback` JSON and `vnplus:playback-changed` event. **General → Cast memory** defaults to the last three completed VN responses; `0` retains characters until an exit or scene/location change. Opening without an explicit message selects the latest response. No server restart is needed; refresh SillyTavern after updating.

Version 2.12 publishes the cached VN scene through SillyTavern's **chat-local shared variables**. Other extensions can read `vn_plus` as JSON, subscribe to `vnplus:state-changed`, or use scalar macros such as `{{getvar::vn_plus_time}}` and `{{getvar::vn_plus_player_emotion}}`. Cast/emotions, header metadata, backgrounds, indoor/outdoor lighting, ambient tint, music/ambience and playback status follow the presented paragraph and remain cached when VN closes. See [the shared state API](docs/shared-state.md) for all fields and integration examples. Refresh SillyTavern after updating; no server restart is needed.

A procedural visual novel presentation layer for SillyTavern. It reads **only** the player perspective after an exact `/////` line in the selected assistant message. Canonical narration, conversation storage, generation, and outgoing context remain under SillyTavern and your separate POV workflow.

The renderer is rebuilt in plain JavaScript modules. All 590 supplied assets and the existing character properties are preserved. The extension contains the current implementation, its tests, preview and development tools; unused editing variants and old source/style copies have been removed.

Version 2.11 preserves the visible world between responses and while generation runs. Repeating the same music/ambience recording—even under another keyword or filename alias—keeps its audio player and playback position. Repeating a background keeps the image in place, and existing characters keep their nodes, expressions and animation records instead of entering again. Cast, ambience and other persistent presentation state are reconstructed from earlier selected POVs until changed or cleared. Old SFX/artifacts are not replayed. See [scene continuity](docs/continuity.md). Refresh SillyTavern after updating; no server restart is needed.

Version 2.10 loads an optional local `dialogue.css` from each environment. Customize the dialogue box, typography, textures, button placement/order and responsive layout with scoped CSS. Files unload on environment changes and reload with **Refresh assets**. Disable them under **General → Apply environment CSS (dialogue / settings)**. They are Git-ignored and stay local across updates. See [environment CSS and selectors](docs/environment-css.md) and [the sample stylesheet](examples/dialogue.css). The default appearance is unchanged without a custom file.

Version 2.9 extracts structured scene headers and applies story-time lighting to outdoor backgrounds and busts. See [scene variables and background lighting](docs/scene-context.md) for the header format, variables, local properties and the lighting schedule. The latest header carries across responses and refreshes. Indoor backgrounds keep full brightness; unlisted backgrounds are outdoors. Refresh SillyTavern after updating; no server restart is needed.

Version 2.8 reconstructs **background and music from earlier chat responses**. Before playing a response, VN+ searches earlier assistant POV sections backward for the latest background and music commands independently, including the music speed. This works after refresh without a cached scene. Current-response commands override inherited media when reached, so a later background/music change does not appear ahead of its paragraph. The recovered names use the normal exact-first asset matching in the selected environment.

`#BACKGROUND NONE` / `CLEAR` and `#MUSIC STOP` / `NONE` explicitly clear that channel; `#SCENE RESET` prevents either channel from coming back from older history. A blank background/music command also clears it, matching normal playback. User/system messages, canonical sections before `/////`, rejected swipes, HTML and code blocks do not supply commands. The search reads the active chat's current edited/selected messages, without changing them or replaying previous SFX, artifacts or cast. Earlier-message edits/swipes and newly loaded history refresh inherited media while preserving the current paragraph. Without a prior command, the channel starts empty. Refresh SillyTavern after updating; no server restart is needed.

Version 2.7 adds local descriptive matching for backgrounds and character expressions. Exact filenames (including case-insensitive matches and newly added exact files) take priority. If those fail, VN+ breaks the request and inventoried filenames into keywords, normalizes separators/camel case/accents, and uses a small synonym dictionary plus ranked keyword coverage. For example, `#BACKGROUND Hogwarts hallway at night` can find `Hogwarts - Corridor - Night.png`; a `joyful` expression can use a `cheerful_smile` sprite. Conflicting explicit day/night, inside/outside or weather details are rejected, and unrelated matches remain missing instead of choosing arbitrary artwork.

Background matching stays inside the selected environment's backgrounds; expression matching stays inside the character's folder and excludes blink images. Exact expression aliases are checked before descriptive matches, then the normal default sprite is used. Blink paths, fonts and explicit textbox textures retain their existing exact lookup rules. Matching reads filenames, not image contents, and uses no AI service, embeddings or network API. Additions need an up-to-date inventory (`npm run inventory`, then **Refresh assets**). Keyword decisions are included in resolver diagnostics. Refresh SillyTavern after updating; no server restart is needed for this release.

Version 2.7.1 extends exact-first keyword matching to **music, ambience, SFX and legacy character sound files**. For example, `#SFX glass smashing` can find `sfx/glass_shatter.ogg`, `#MUSIC calm piano music` can find `music/Peaceful_Piano.mp3`, and `#AMBIENT roadway sounds` can find a traffic recording. Sound-specific synonyms cover common actions, moods and intensity; explicit opening/closing, quiet/loud and tense/calm conflicts are rejected. Purely generic requests such as `sound effect` do not choose an arbitrary file. Generated Fish dialogue still uses its assigned character voice and prepared clip.

Exact sound lookup keeps all existing folder priorities, including newly added files outside the inventory. Descriptive fallback uses indexed files in the selected environment and the existing category folders: music uses `sfx/music`, `music` and legacy `sfx`; ambience uses `ambient`, `sfx/ambient` and legacy `sfx/music`/`sfx`. SFX keyword matching excludes the dedicated music/ambience subfolders. Character sounds search their own folder, shared sounds and general SFX, without borrowing another character's recording. Filename ranking and its diagnostics are cached until assets are refreshed.

Version 2.6 reveals spoken dialogue word by word using the generated voice's transcription timestamps and actual audio playback position. Enable or disable **Reveal dialogue with voice timing** under **Fish Audio voices → Voice generation and playback** (on by default). Speech pauses and playback stalls keep the text aligned; Auto waits for both text and voice. Lines without usable timings use the ordinary typewriter. Updating from 2.5.1 requires a browser refresh; this release does not change the server bridge.

Version 2.1 adds music mute, breathing, expression crossfades and optional blink sprites. Version 2.1.1 offers **Left and right groups** or **Four separate busts**, selectable from the VN toolbar or **General → Bust layout** in extension settings. Switching rearranges existing busts without restarting the scene, typewriter, music or animations. The choice is saved; old spread/compact preferences migrate to Four separate busts.

Version 2.2 replaces the raster displacement filter with a real textured triangle mesh, removing its quantized pixel stepping. Each character can set the breathing deformation's X/Y center in properties or through **Characters → Breathing center** controls.

Version 2.2.1 cleans up obsolete JavaScript/CSS files and an overridden dialogue-border declaration.

Version 2.3 puts authored content in selectable **environments**. Choose **The Coffin of Andy and Leyley**, **Harry Potter**, **Re:Zero**, or your own setting under **General → Content environment** or in the VN toolbar. The supplied artwork is in the Coffin environment; the other two are empty starters ready for your content.

Version 2.3.1 adds GitHub installation and updates. Personal content uses an optional local inventory, keeping the shipped catalog clean for future updates.

Version 2.4 adds silhouette busts for missing art, SillyTavern theme inheritance with optional VN color overrides, text shaking limited to configurable intense emotion tags, internal thoughts, and optional Fish Audio voices from character properties. Plain prose works as narration without a `NARRATION` marker. Parenthesized dialogue displays as internal thoughts and stays silent.

## Install

Version 2.5 automatically creates folders for previously unknown POV speakers inside the selected environment. Each gets an empty `sprites/`, a `properties.json`, a saved random `textColor`/accent, and a blank `voiceId` (mute). Existing names, aliases, configured characters and the player are reused; the narrator is excluded. The local catalog is updated automatically, and existing properties/artwork are never overwritten by the folder creator. Control this under **Characters → Create folders for unknown speakers**. This uses the bundled server bridge without needing a Fish key; restart SillyTavern once after updating to load the new server code. Global folder creation requires an administrator account. See [character folder setup](environments/README.md).

1. Open **Extensions → Install extension** in SillyTavern and enter:

   ```text
   https://github.com/ExtremeGamerYT21/vn-plus
   ```

   This creates a Git clone with `manifest.json` at its root. For an existing manual/ZIP installation, back up its complete folder outside the extensions directory, remove that old installation, and install from the URL once. Copy your custom content into the new installation afterward.

2. Keep one active installation of VN+. Reload SillyTavern. To receive later releases, use **Extensions → Manage extensions → Update** for Visual Novel+. Manual ZIP copies need the one-time Git installation above before this works.
3. Open **Extensions → Visual Novel+**. Enable the extension. Automatic opening is off initially; use the **VN** button on any assistant response or **Enter / resume VN** in settings. Existing preferences migrate under `extensionSettings.visual_novel_plus`.
4. Import the two supplied RegEx scripts through **Extensions → RegEx → Import**:

   - `regex/vn-plus-pov-display.json`: AI output, **Markdown/display only**. Shows POV and blanks assistant messages without a separator, including a pending canonical-only response.
   - `regex/vn-plus-canonical-context.json`: AI output, **Prompt only**. Sends canonical text before the separator to the model; ordinary messages without a separator remain intact in model context.

   Both must remain formatting/context-only, with no destructive save-to-message operation. They are not installed or enabled automatically. Order them before other display/context scripts that could remove or alter the separator. The display preset deliberately hides every assistant response without a POV section; scope it to your combined-message workflow if you also use ordinary chats.

5. Set player identity and aliases (default: **Jason**) and optional character registry overrides. Existing non-POV chats require the separate workflow to add a POV section; the renderer never calls a model or rewrites old messages.

The adapter was checked against **SillyTavern 1.19.0** source. It uses the supported `SillyTavern.getContext()` interface and available lifecycle events, as documented in [SillyTavern's extension guide](https://docs.sillytavern.app/for-contributors/writing-extensions/). A different version needs a live compatibility check.

Put personal worlds in a new environment folder and run `npm run inventory`; this writes ignored `assets.local.json`, which is merged with the shipped catalog at startup and by **Refresh assets**. Custom environment folders are ignored by Git by default and stay on your machine. Editing shipped files such as the Coffin artwork or `properties.json` can still cause a Git conflict if an update changes the same file; use character overrides in settings or a copied personal environment for those changes.

## Script example

```text
Ashley recognizes the visitor but chooses not to tell Jason.

/////

#BACKGROUND living_room
#MUSIC buzz slowed
#ENTER Jason
#ENTER Ashley
#ENTER Nina

NARRATION
You hear the door open. Ashley glances toward it.

ASHLEY: "We have company." [smug]
NINA: "Who is it?" [excited]

#SFX door
```

See [the complete command grammar](docs/grammar.md), including cinematic/prose/black modes and automatic HTML artifacts. Persistent scene state is reconstructed from earlier selected messages; current commands override it in sequence. Use exits, stops and scene resets to clear it. One-shot effects remain local to the response that requests them.

## Content environments

Every setting has its own folder under `environments/`, containing characters and their properties, backgrounds, music, ambience, SFX, fonts, textures, and optional authored scene/material files. The dropdown displays the name from its `environment.json`:

```text
environments/
  coffin-of-andy-and-leyley/
  harry-potter/
  re-zero/
```

The supplied art/audio/fonts and all original character properties have been moved into `coffin-of-andy-and-leyley` without changing their bytes. The old nested texture copy is preserved as `characters/shared/box_texture_legacy_copy.png` there. Harry Potter and Re:Zero contain folder structures and metadata, with no artwork supplied yet.

Switching changes the selected media library, restores the current paragraph, stops previous music and pending asset loads, and applies that environment's own character overrides, dialogue font and dialogue texture. These settings are saved separately per environment. Existing registry/font/texture preferences migrate into the original Coffin environment. Other playback, volume and layout settings are shared.

Commands such as `#BACKGROUND kitchen` and expression names such as `happy` stay the same; their paths are relative to the selected environment. Missing art uses the normal fallback. Media and character properties never fall back to another environment, so different worlds can reuse filenames and character IDs. Loaded local fonts also use distinct family names internally.

To add a setting, copy an empty starter folder to a new lowercase folder ID, edit `environment.json`, add your media, run `npm run inventory` and click **Refresh assets** in VN+ settings. The builder discovers environment folders automatically, including modern `music/` and `ambient/` folders. An older flat inventory is still supported. See [the environment authoring guide](environments/README.md).

## Assets and character properties

Paths below are relative to `environments/{selected-id}/`:

```text
characters/{id}/sprites/{expression}.webp   # modern
characters/{id}/{expression}.png           # legacy
characters/{id}/properties.json
characters/shared/box_texture.png
backgrounds/{name}.{webp,png,jpg,...}
sfx/music/{track}.{mp3,ogg,...}             # legacy music preserved
music/{track}.{mp3,ogg,...}                 # alternative music folder
ambient/{track}.{mp3,ogg,...}
sfx/{sound}.{mp3,ogg,...}
fonts/{font}.{ttf,woff2,...}
scenes/{name}.txt                          # optional authoring storage
artifacts/{id}/index.html                  # local HTML menu, opened with #ARTIFACT id
```

Asset names can be semantic uppercase identifiers; the inventory matches them case-insensitively. New assets not in the inventory are probed and cached. After adding files, **Refresh assets** in settings clears cached misses. `npm run inventory` refreshes the optional `assets.local.json` list, making new property aliases discoverable immediately. Node is needed only for this authoring tool; no Node runtime or build step is required to use the installed extension.

Property example (all fields optional):

```json
{
  "displayName": "Draco Malfoy",
  "aliases": ["Draco", "Malfoy"],
  "defaultExpression": "default",
  "expressionAliases": { "annoyed": "angry", "excited": "happy" },
  "color": "#81bd94",
  "nameplateColor": "#a7dabc",
  "nameplateBackground": "#182c20",
  "borderColor": "#81bd9488",
  "boxColor": "#101a14",
  "textColor": "#ebfff0",
  "narrationColor": "#d2dfd4",
  "font": "faustina",
  "boxTexture": "shared/box_texture.png",
  "bustScale": 0.9,
  "offsetX": 0,
  "offsetY": 0,
  "voiceSpeed": 0.8,
  "voiceScale": 1.0,
  "sound": "chuckle.ogg"
}
```

`offsetX` and `offsetY` are pixel shifts: positive X moves right and positive Y moves down. Use the toolbar’s **Full body** option to place artwork at the screen bottom while retaining the shadow placeholders’ bust framing. See [character framing](docs/character-framing.md).

Registry overrides in settings use a JSON object keyed by character folder ID and can also specify `assetFolder`. These override file properties. There are sprite previews, expression/identity alias maps, and layout overrides. Actual expression assets always take priority over aliases/defaults; `excited` retains its own presentation flair. Inactive speakers dim; narration does not remove them. Missing sprites use named shadow silhouettes, or can be hidden by preference.

Textures, color, fonts, opacity, border visibility and dialogue sizing are configurable globally; a speaking character can override colors, font and texture. `nameplateColor`, `nameplateBackground`, `borderColor`, and `boxColor` customize the nameplate/panel independently. `sounds` optionally maps expression names to voice/effect filenames. Custom per-character box/nameplate styles use these supported semantic properties rather than arbitrary application HTML/CSS injection.

## Theme and character voices

The VN interface follows SillyTavern’s theme colors and font. **Theme** in VN settings provides optional body, panel, world, border, accent, muted-text and silhouette colors; blank fields inherit the current ST theme. Character properties can still override dialogue colors, textures and fonts. The previous default purple colors/font migrate to theme inheritance while custom values remain.

**Presentation → Textbox image only (no fill or frame)** uses the character's `boxTexture` or the global texture as the entire box, preserving transparent pixels and removing the colored fill, border, accent strip, shadow, rounded clipping and blur. The normal box remains when no texture is configured. Use `"boxImageOnly":true` or `false` in character properties for a per-character override. Hiding the panel background also keeps any configured texture visible.

The narrator has no bust or cast slot. `Narrator:` and `Narration:` labels are narration, and `#ENTER Narrator` / `#ENTER Narration` leave the cast alone. Missing-art silhouettes remain available for actual characters.

Text shakes only for tags in **Presentation → Emotion tags that shake**, such as rage, terror, panic or unhinged. Calm tags and narration stay still, including when an old global jitter setting or a shake/jitter text command is present. Reduced motion disables shaking.

Set `"voiceId":"YOUR_FISH_VOICE_ID"` in a character’s properties or registry override to voice that character. With no ID, the character is mute. Fish settings are under **Extensions → Visual Novel+ → Fish Audio voices**, also available from the VN toolbar’s **Voices** button. The optional server bridge keeps the key in SillyTavern’s secret store; generation is manual and only includes selected finalized spoken dialogue. See [Fish setup, generation, timing review and audio finishing](docs/speech.md).

Version 2.5.1 discovers all character folders and property aliases in the selected environment directly through a read-only bridge endpoint, even when the local inventory is missing or outdated. A file such as `jason_weber/properties.json` with `displayName: "Jason"` or an alias `Jason` resolves to that character's voice; a virtual player override named `jason` no longer masks it. Exact real folder IDs take priority over aliases. **Prepare selected dialogue** rereads these properties, so edited voice IDs are picked up without rebuilding the inventory. Restart SillyTavern after updating the server bridge. Indexed properties still work when live discovery is unavailable.

## Sprite motion and blinking

**Left and right groups** (`rows`) alternates stable slots between two diagonal groups. Each deeper character steps inward/upward, scales to 95% of the preceding row, and stays behind nearer busts. **Four separate busts** (`separate`) uses four evenly spaced, flat stations with no depth reduction: the primary left/right characters occupy the outer stations first, then the two inner stations. Smaller casts retain those fixed stations; larger casts expand to additional columns so nobody is removed. Jason keeps the primary left position in both modes. Changing speaker only changes highlighting. Row spacing/rise/depth scale applies to the grouped layout; global scale/offsets work in both.

Breathing moves the vertices of a **48 × 48 textured mesh**, with a smooth falloff around the torso and fixed image borders. Shared vertices prevent gaps between triangles. Floating-point motion, linear texture filtering, mipmaps where supported, and a canvas sized for the displayed bust/device pixel ratio preserve smooth subpixel movement and transparent edges. One [WebGL context](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API) renders the entire cast. If WebGL is unavailable or its context is lost, ordinary static sprites remain visible. Source art is preserved.

Set `breathing.centerX` and `breathing.centerY` in each character's `properties.json` or registry override. Both are normalized coordinates from **0 to 1 over the full image, including transparent padding**: X increases from left to right, Y from top to bottom. The default `(0.5, 0.62)` centers breathing on the lower-middle torso. The local deformation follows your chosen center; place it below the head to keep the face still. **Characters** settings also has character selection, X/Y inputs, and load/apply buttons. Applying a center changes the visible mesh immediately without restarting playback or audio.

Expression images interpolate through an opacity crossfade after the new image loads. Both images use the same breathing phase/center throughout the blend; blink alternatives use that mesh too. Rapid navigation cancels obsolete blends. Settings provide breathing strength/cycle and expression blend duration.

To add blinking, provide a closed-eye version with the **same canvas size, pose and alignment** as its open-eye expression. Configure it in the character's `properties.json`, or the registry override:

```json
{
  "blink": {
    "enabled": true,
    "images": {
      "default": "sprites/default_blink.webp",
      "happy": "sprites/happy_blink.webp",
      "angry": "sprites/angry_blink.webp"
    },
    "intervalMin": 2800,
    "intervalMax": 6500,
    "duration": 130
  },
  "breathing": { "enabled": true, "amount": 1.6, "duration": 4200, "centerX": 0.5, "centerY": 0.62 }
}
```

Paths are relative to that character's asset folder. A simple filename such as `happy_blink.webp` tries both `sprites/` and the legacy flat folder. For a shared closed-eye image for all expressions, use `"blink": {"image":"sprites/blink.webp"}`. `"blink": false` or `"breathing": false` disables that effect for a character.

Automatic filenames `expression_blink.webp/png` or `expression.blink.webp/png` are also recognized in flat or `sprites/` folders; `default_blink` is a fallback. Run `npm run inventory` after adding automatic variants, then **Refresh assets** (or reload). Explicit `blink.images` / `blink.image` configuration works without regenerating the inventory. `blink.enabled: true` also permits direct probing for automatic filenames. With no blink artwork/configuration, eyes stay open and no optional blink requests are sent. No new blink artwork is fabricated by the extension.

Blink intervals vary naturally, independently for each bust; eyes close briefly and reopen instantly. Expression changes, exits and scene cleanup cancel pending blinks. **Reduced motion**, including the browser's preference, disables breathing, blinking and expression crossfade. Breathing amount is a displacement strength percentage, not a whole-image zoom percentage.

Breathing shares one render clock for all busts. Background tabs pause it and return eyes to the open image; scene cleanup cancels the clock, pending sprite loads, blink timers and expression animations.

## Playback and controls

| Action | Result |
| --- | --- |
| Click dialogue / Space / Enter / Right arrow | Finish typewriter, then advance. |
| Back / Left arrow | Restore the previous visible beat and full presentation snapshot. |
| Replay | Restart selected scene, including one-shot effects. |
| Skip viewed | Move through already viewed content without replaying one-shot effects. |
| Auto | Toggle delayed automatic progression; artifacts wait for dismissal. |
| Mute music / Unmute music | Silence only music, including fading tracks, while preserving playback position. Ambience/SFX and music volume stay independent. |
| Transcript | Read POV text; artifacts have view buttons. |
| Reply | Send through SillyTavern's normal input/button. Enter sends; Shift+Enter adds a line. |
| Retry response | Delegate to SillyTavern regeneration for the final assistant message. |
| Exit VN / Esc | Close; reopening resumes the same scene. Esc first dismisses a panel/artifact. |
| Reveal Omniscient | Explicit canonical-only read-only dialog from a chat message's upper-right controls. |

Existing drafts in SillyTavern's regular input are protected: sending from VN asks you to review the draft in normal chat instead of overwriting it. Retry on an older response is disabled; use normal chat's swipe controls. Audio starts after browser interaction, loops independently for music/ambience, and stops when VN closes. Reopening restores track selection without multiplying sources. Reduced motion disables animated text/scene effects and typewriter; the initial preference respects the browser's reduced-motion setting.

Music mute is a saved preference and remains active across scene changes/reopening. It uses the browser's [media mute property](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/muted), so unmuting continues the playing track instead of restarting it.

## Privacy, storage and lifecycle

- No prompt injection, story rewriting, LLM generation calls or independent conversation store. Optional Fish Audio speech sends only manually selected spoken POV dialogue through the bundled server bridge when you request generation.
- Settings persist through SillyTavern; VN runtime variables and artifact actions persist in message.extra.vn_plus. Derived scene snapshots rebuild from current context after startup; artifact actions supply the persistent timeline. Seen-beat sets (up to 32 response fingerprints), asset results and diagnostics are bounded in memory. No global localStorage scene/transcript keys are written. Legacy localStorage keys are ignored; obsolete VN-owned shared variables are retired.
- Swipes/edits reconstruct the selected source; chat changes clear staging/audio; refresh reconstructs the scene from the saved message. Branch identity includes chat and character/group IDs.
- Canonical text is shown only by a deliberate reveal. Reveal closes on generation, editing, swiping, chat changes or entering VN. A missing/incomplete POV produces a safe waiting/unavailable view.
- HTML artifacts have isolated, opaque-origin iframes. Static mode strips scripts. Interactive mode requires explicit interactive markup/local artifact commands and a user setting. The scoped VNPlus bridge reads scene data and saves artifact values through message extra; direct same-origin/SillyTavern APIs remain unavailable. See [artifact setup and constraints](docs/artifact-bridge.md).
- The scene inspector contains POV tokens, parser diagnostics, presentation snapshots and resolved/missing assets, never canonical narration.

## Validation and development

```text
cd vn-plus
npm test
npm run preview
```

There are no install-time dependencies. Preview serves a read-only local development fixture at `http://127.0.0.1:8973/demo/index.html`; browser acceptance checks are at `/tests/browser.html`. These use a simulated SillyTavern host and do not touch your chats or call a model. This server is for testing only; the extension itself needs no server beyond SillyTavern.

Maintainers use `npm run inventory:release` to regenerate the tracked `assets.json` before publishing intentionally bundled content. GitHub Actions runs the Node tests on pushes and pull requests.

See [validation results and remaining live checks](docs/validation.md) and [the original architecture audit](docs/architecture-audit.md). The separate cheap-frontier POV rewrite/concatenation workflow is intentionally outside this renderer.
