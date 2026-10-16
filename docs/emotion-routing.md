# Ranked bust emotions

VN+ uses a deterministic master lookup in [core/emotion-routing.js](../core/emotion-routing.js). The installed SillyTavern list has **28 base emotions including neutral**, rather than 26. Every base label has a complete ordered row containing all 28 labels. `EMOTION_ROUTES` gives each of 388 recognized labels/adjectives its ordered row; `EMOTION_ADJECTIVES` supplies the canonical profile. These are authored presentation preferences and can be adjusted in that one module. No model, embedding service or image-content analysis is involved.

The base labels are `admiration`, `amusement`, `anger`, `annoyance`, `approval`, `caring`, `confusion`, `curiosity`, `desire`, `disappointment`, `disapproval`, `disgust`, `embarrassment`, `excitement`, `fear`, `gratitude`, `grief`, `joy`, `love`, `nervousness`, `optimism`, `pride`, `realization`, `relief`, `remorse`, `sadness`, `surprise`, and `neutral`.

## Selection order

1. **Identical filename.** `[joy]` uses `joy.png` if present. Matching ignores filename case. A literal custom/legacy name such as `happy.webp` wins for `[happy]` too. Newly added literal files are probed even if not indexed yet.
2. **Character overrides.** After an exact miss, `expressionAliases` in this character's properties are tried in the specified order. An explicit alias can also point at the configured default.
3. **Master ranking over available sprites.** Choose the first available profile in the requested adjective's ordered row. Character A and character B can therefore show different expressions for the same tag. Within a profile, its canonical filename wins, followed by legacy/adjective filenames with deterministic ties. A closer canonical file added after the inventory is built is probed before accepting an inventoried weaker fallback.
4. **Existing descriptive/default fallback.** When there is no named ranked match, descriptive artwork can still use keyword matching, then `defaultExpression` and `default`. If those files are absent, `neutral` is the final safe face, including when it has not been indexed yet. Unknown tags such as `[cool]`, `[brisk]` or `[dry]` therefore keep a character visible when it has `neutral.png` but no `default.png`. With no matching art, the existing shadow/hide preference applies.

Only this character's folder (or its explicit `assetFolder`) in the selected environment supplies candidates. Both `characters/id/sprites/emotion.ext` and `characters/id/emotion.ext` work. Closed-eye variants, other character folders and non-image files cannot win an open-eye emotion route. An allowed `default` image participates as neutral, so it can outrank distant/opposite expressions. Full rows rank every base emotion; if only a distant expression exists, it remains eligible. Include a neutral/default image for sparse sets when you want a neutral alternative.

| Input | First ranked choices after a literal/override miss |
| --- | --- |
| `[happy]`, `[cheerful]` | joy → amusement → excitement → optimism → love → relief … |
| `[annoyed]`, `[irritated]` | annoyance → anger → disgust → disapproval → disappointment … |
| `[shocked]`, `[startled]` | surprise → realization → confusion → curiosity → excitement … |
| `[terrified]`, `[afraid]` | fear → nervousness → surprise → confusion → grief … |
| `[heartbroken]` | grief → sadness → remorse → disappointment → fear … |
| `[flustered]`, `[shy]` | embarrassment → nervousness → remorse → confusion … |

For example, `[annoyed]` chooses `annoyance` if it exists; without it, `anger`; without either, `disgust`. An `anger` sprite supersedes a weaker `disgust` fallback for that character. Legacy files such as `angry`, `sad`, `surprised`, `terror`, `happy` and `cheerful_smile` remain supported. Case and simple modifiers such as `[very happy]` or `[slightly-annoyed]` normalize locally; unknown labels retain the custom/keyword/default path.

The availability list comes from the current environment's asset catalog. After changing a sprite set, run `npm run inventory` in the installed extension and use **Refresh assets**. This clears routing caches and refreshes additions/removals. Choosing an expression doesn't rename artwork, alter the original story tag, or change the cached narrative emotion. Repeated routes are cached per character/folder/environment and effective override configuration.

## Character override

```json
{
  "expressionAliases": {
    "annoyed": ["disapproval", "anger"],
    "excited": "joy"
  },
  "defaultExpression": "neutral"
}
```

If `annoyed` itself is absent, that character tries `disapproval`, then `anger`, before the master ranking. A failed override falls through to the global table.

## Inspecting a decision and blinking

Open **Inspect**, look under `assets`, then find `emotion:character:tag`. The record contains `requested`, `matched`, `method`, `canonical`, `rank`, the ordered `ranking`, and `available` names. Literal matches have rank 0; ranked matches use the one-based position in their profile row. For example, `[annoyed]` → `anger` reports rank 2. Methods distinguish `exact`, `character-alias`, `emotion-ranking`, `keywords`, `fallback` and `missing`.

Automatic blink lookup follows the **chosen open-eye filename**. If `[happy]` selects `joy.webp`, blinking uses `joy_blink.webp`/`.png` (or `joy.blink`), not an unrelated `happy_blink` or `default_blink`. Explicit blink images remain available in character properties.
