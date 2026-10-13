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

The renderer still reads scenes and inline HTML from the selected chat's POV section. `scenes/` and `artifacts/` are authoring storage, not automatic script execution or an alternative conversation history.
