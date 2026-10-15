# Content environments

Each setting owns a directory here. Choose it under General → Content environment or from the VN toolbar. The supplied assets are in `coffin-of-andy-and-leyley`; `harry-potter` and `re-zero` are empty starter environments.

```
environments/{id}/
  environment.json           # { "name": "Your setting", "description": "..." }
  characters/{character}/    # sprites, properties.json, blink images, voice/SFX
  characters/shared/        # dialogue textures and shared character sounds
  backgrounds/
  music/
  ambient/
  sfx/                      # also accepts existing sfx/music and sfx/ambient
  fonts/
  scenes/                   # optional storage for your authored scene scripts
  artifacts/                # optional storage for your authored HTML/materials
```

Folder IDs use lowercase letters/digits with hyphens or underscores. Names shown in the dropdown come from `environment.json`. Copy one starter directory to add another environment, change its name, then run `npm run inventory` in `vn-plus/` and click Refresh assets in VN+ settings.

This command writes `assets.local.json`, an ignored catalog of personal additions. VN+ merges it with the shipped `assets.json` without changing that tracked file, so future Git updates can replace the shipped catalog. Custom environment directories are ignored by Git by default; your local content is not automatically published. To bundle a new environment in a release, a maintainer must explicitly allow that folder in `.gitignore`, run `npm run inventory:release`, and commit its content and the generated `assets.json`.

Prefer a copied personal environment or character overrides in settings when modifying supplied content. Changes to tracked artwork or property files may conflict with a later update; back up authored content before resolving a conflict.

Asset names in POV commands remain relative to the selected environment: `#BACKGROUND kitchen`, `#MUSIC theme`, and `NINA: "Hello." [happy]`. Each environment can reuse these names. Missing art uses the existing placeholder; media never falls back to another setting.

Character registry overrides, dialogue font choice and dialogue texture choice are saved separately for each environment. Per-character file properties, breathing centers, blink alternatives, themes and sounds live beside that setting's artwork. Global playback/audio/layout preferences continue to apply across environments.

## Automatic character folders

With **Characters → Create folders for unknown speakers** enabled (the default), opening a finalized VN scene creates a starter folder for every spoken/thought speaker that does not match an existing character, alias, configured identity or player name. Narration and standalone `#ENTER` commands do not trigger creation. The server also checks folders and property aliases that have not been inventoried yet.

For `New Person: "Hello."`, the result is:

```text
environments/<selected-environment>/characters/new_person/
  properties.json
  sprites/
```

The generated JSON contains `displayName`, an empty `aliases` array, `defaultExpression: "default"`, matching random `color` and `textColor`, an empty `voiceId`, and the default breathing center. Its color is saved once and reused on later visits/restarts. Empty `voiceId` keeps the new character mute; the missing-art silhouette appears until you add artwork. Edit the properties to choose a different color or voice.

The creator adds the properties to `assets.local.json` automatically, preserving other local entries and leaving `assets.json` unchanged. New character directories are ignored by Git, including inside the built-in environments; already tracked files retain their existing tracking. Existing properties and artwork are preserved byte-for-byte. Add `sprites/default.webp`, `happy.webp`, `happy_blink.webp`, etc. later; run `npm run inventory` and **Refresh assets** after adding artwork so optional blink variants are indexed. Maintainers intentionally publishing new character files must explicitly force-add them.

This feature uses the bundled VN+ server bridge, independently of Fish and without an API key. Restart SillyTavern after installing/updating the bridge. Its global content-writing route is available to authenticated administrator accounts. If the bridge is unavailable or creation fails, VN playback remains readable and displays a notice. Folder names are normalized; Windows device names such as `CON` receive a `character_` prefix.

Mystery labels containing only punctuation, such as `???`, receive a deterministic `unknown_<hash>` folder ID. Different labels stay separate, and their original display names remain in the properties.

The renderer still reads scenes and inline HTML from the selected chat's POV section. `scenes/` and `artifacts/` are authoring storage, not automatic script execution or an alternative conversation history.
