# Per-environment dialogue and controls CSS

Create `environments/YOUR-WORLD/dialogue.css`. VN+ loads it for the selected environment; switching environments unloads the previous stylesheet. A legacy flat installation can use `dialogue.css` at its root. Click **Refresh assets** or reload SillyTavern after editing. No inventory rebuild or server restart is needed.

The file is local and Git-ignored, so extension updates do not overwrite it. The extension settings checkbox **General → Apply environment CSS (dialogue / settings)** disables these files globally without deleting them. Its status shows which files loaded, are missing or failed.

For matching extension settings, add an optional `settings.css` next to `dialogue.css` (VN+ 2.20+). It uses the same scoping, local URLs and reload behavior, but reaches only `#vnplus-settings`. Either file can exist independently. Rules in `dialogue.css` do not spill into settings; rules in `settings.css` do not reach the overlay, SillyTavern's other settings or other extensions. Styles continue to apply if SillyTavern remounts the settings panel. Switching environments unloads both files.

An original [Harry Potter theme](../examples/harry-potter/README.md) includes both files, parchment dialogue, dark green and brass controls, and paper ledger settings.

## Example

```css
/* Your dialogue box can have a different size, shape and screen position. */
.vn-dialogue {
    position: fixed;
    left: 5vw;
    right: 5vw;
    bottom: 90px;
    width: auto;
    min-height: 150px;
    margin: 0;
    border-radius: 0;
}

/* Move the existing playback controls. Their behavior stays intact. */
.vn-controls {
    position: fixed;
    right: 5vw;
    bottom: 22px;
    margin: 0;
    gap: 10px;
}
.vn-controls [data-action="next"] { order: -1; }
```

See [the complete sample](../examples/dialogue.css) or open the local preview at `demo/index.html?css`. The sample is optional; installing the extension does not apply it automatically. The normal SillyTavern theme remains the fallback when no file is present.

## Selectors

| Selector | Controls |
| --- | --- |
| `:scope` | VN overlay and its CSS variables |
| `.vn-dialogue` | Box geometry, fill, border, texture and padding |
| `.vn-dialogue::before` | Accent strip |
| `.vn-speaker` | Speaker label |
| `.vn-text` | Dialogue text |
| `.vn-dialogue-foot` | Position counter and continue hint |
| `.vn-controls` | Playback button row |
| `.vn-top`, `.vn-top nav` | Top bar and scene tools |
| `.vn-framing-picker`, `[data-framing-picker]` | Bust / full-body artwork selector |
| `[data-action="back"]` | Back |
| `[data-action="next"]` | Continue |
| `[data-action="replay"]`, `[data-action="skip"]` | Replay / Skip viewed |
| `[data-action="auto"]`, `[data-action="reply"]` | Auto / Reply |
| `[data-action="speech"]`, `[data-action="transcript"]`, `[data-action="debug"]` | Voices / Transcript / Inspect |
| `[data-action="mute-music"]`, `[data-action="exit"]` | Mute music / Exit VN |

Use flex/grid order, alignment and positioning to rearrange the existing buttons; CSS does not change their actions or HTML hierarchy. Keep controls reachable on small screens and use `@media` rules for alternate layouts.

Selectors are scoped to that VN overlay. `:scope`, `:root`, `body`, `html` and a leading `#vnplus-overlay` refer to the overlay itself. Root sibling selectors are excluded. Normal rules, pseudo-elements, `@media`, `@supports`, `@container` and named `@keyframes` work. Keyframe names are isolated per overlay. CSS nesting and global rules such as `@import`, `@font-face`, `@page` and `@property` are not installed; use ordinary selectors and the existing font settings.

In `settings.css`, `:scope`, `:root`, `body`, `html` and a leading `#vnplus-settings` instead refer to VN+'s settings panel. Useful selectors include `h3`, `details`, `summary`, `.vn-setting`, `.vn-settings-actions`, `.vn-hint`, `input`, `select`, `textarea`, and `.vn-speech-settings`. `#vnplus-overlay` is excluded there. Example:

```css
:scope { --vn-ui-color: #30291e; --vn-panel: #f4e9cf; background: #e9d9b5; }
summary { color: #254c39; font-family: Georgia, serif; }
.vn-setting { border-bottom: 1px solid #9c835b40; }
```

## Textures and overrides

Local `url(...)` paths are relative to the environment folder, for example `url("ui/paper.png")` or `url("characters/shared/box_texture.png")`. Embedded data images work too. URLs cannot leave the environment, use remote hosts or include query strings. For `image-set`, use explicit `url(...)` entries. Referenced files are fetched directly; they do not need an inventory entry.

The dialogue width/minimum-height settings now supply default CSS variables, so ordinary `width` and `min-height` declarations can override them. Character properties and some renderer choices still use inline styles—for example an authored texture, text font/size or box color. Use `!important` when deliberately overriding those, such as `.vn-dialogue { background-image: none !important; }`. An image-only textbox also strips frame decorations with `!important`; disable that option or explicitly override the relevant decoration properties when designing a framed theme.

Custom CSS affects presentation only. It does not execute JavaScript, edit messages, change voice assignments or move controls between documents.
