# Visual Novel+ 2.4.1

A procedural visual novel presentation layer for SillyTavern. It reads **only** the player perspective after an exact `/////` line in the selected assistant message. Canonical narration, conversation storage, generation, and outgoing context remain under SillyTavern and your separate POV workflow.

The renderer is rebuilt in plain JavaScript modules. All 590 supplied assets and the existing character properties are preserved. The extension contains the current implementation, its tests, preview and development tools; unused editing variants and old source/style copies have been removed.

Version 2.1 adds music mute, breathing, expression crossfades and optional blink sprites. Version 2.1.1 offers **Left and right groups** or **Four separate busts**, selectable from the VN toolbar or **General → Bust layout** in extension settings. Switching rearranges existing busts without restarting the scene, typewriter, music or animations. The choice is saved; old spread/compact preferences migrate to Four separate busts.

Version 2.2 replaces the raster displacement filter with a real textured triangle mesh, removing its quantized pixel stepping. Each character can set the breathing deformation's X/Y center in properties or through **Characters → Breathing center** controls.

Version 2.2.1 cleans up obsolete JavaScript/CSS files and an overridden dialogue-border declaration.

Version 2.3 puts authored content in selectable **environments**. Choose **The Coffin of Andy and Leyley**, **Harry Potter**, **Re:Zero**, or your own setting under **General → Content environment** or in the VN toolbar. The supplied artwork is in the Coffin environment; the other two are empty starters ready for your content.

Version 2.3.1 adds GitHub installation and updates. Personal content uses an optional local inventory, keeping the shipped catalog clean for future updates.

Version 2.4 adds silhouette busts for missing art, SillyTavern theme inheritance with optional VN color overrides, text shaking limited to configurable intense emotion tags, internal thoughts, and optional Fish Audio voices from character properties. Plain prose works as narration without a `NARRATION` marker. Parenthesized dialogue displays as internal thoughts and stays silent.

## Install

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

See [the complete command grammar](docs/grammar.md), including cinematic/prose/black modes and automatic HTML artifacts. Each selected response initializes from an empty baseline; specify its scene setup explicitly.

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
artifacts/{name}.html                      # optional authoring storage
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

Registry overrides in settings use a JSON object keyed by character folder ID and can also specify `assetFolder`. These override file properties. There are sprite previews, expression/identity alias maps, and layout overrides. Actual expression assets always take priority over aliases/defaults; `excited` retains its own presentation flair. Inactive speakers dim; narration does not remove them. Missing sprites use named shadow silhouettes, or can be hidden by preference.

Textures, color, fonts, opacity, border visibility and dialogue sizing are configurable globally; a speaking character can override colors, font and texture. `nameplateColor`, `nameplateBackground`, `borderColor`, and `boxColor` customize the nameplate/panel independently. `sounds` optionally maps expression names to voice/effect filenames. Custom per-character box/nameplate styles use these supported semantic properties rather than arbitrary application HTML/CSS injection.

## Theme and character voices

The VN interface follows SillyTavern’s theme colors and font. **Theme** in VN settings provides optional body, panel, world, border, accent, muted-text and silhouette colors; blank fields inherit the current ST theme. Character properties can still override dialogue colors, textures and fonts. The previous default purple colors/font migrate to theme inheritance while custom values remain.

**Presentation → Textbox image only (no fill or frame)** uses the character's `boxTexture` or the global texture as the entire box, preserving transparent pixels and removing the colored fill, border, accent strip, shadow, rounded clipping and blur. The normal box remains when no texture is configured. Use `"boxImageOnly":true` or `false` in character properties for a per-character override. Hiding the panel background also keeps any configured texture visible.

The narrator has no bust or cast slot. `Narrator:` and `Narration:` labels are narration, and `#ENTER Narrator` / `#ENTER Narration` leave the cast alone. Missing-art silhouettes remain available for actual characters.

Text shakes only for tags in **Presentation → Emotion tags that shake**, such as rage, terror, panic or unhinged. Calm tags and narration stay still, including when an old global jitter setting or a shake/jitter text command is present. Reduced motion disables shaking.

Set `"voiceId":"YOUR_FISH_VOICE_ID"` in a character’s properties or registry override to voice that character. With no ID, the character is mute. Fish settings are under **Extensions → Visual Novel+ → Fish Audio voices**, also available from the VN toolbar’s **Voices** button. The optional server bridge keeps the key in SillyTavern’s secret store; generation is manual and only includes selected finalized spoken dialogue. See [Fish setup, generation, timing review and audio finishing](docs/speech.md).

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
- Only regular settings persist. Seen-beat sets (up to 32 response fingerprints), asset results and diagnostics are bounded in memory. No new global localStorage scene/transcript keys are written. Legacy stored keys are ignored rather than deleted.
- Swipes/edits reconstruct the selected source; chat changes clear staging/audio; refresh reconstructs the scene from the saved message. Branch identity includes chat and character/group IDs.
- Canonical text is shown only by a deliberate reveal. Reveal closes on generation, editing, swiping, chat changes or entering VN. A missing/incomplete POV produces a safe waiting/unavailable view.
- HTML artifacts have isolated, opaque-origin iframes. Static mode strips scripts. Interactive mode requires both explicit `html interactive` markup and a user setting; it still has no same-origin or host API access. See [artifact constraints](docs/grammar.md#artifacts).
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
