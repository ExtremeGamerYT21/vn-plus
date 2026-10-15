# Persistent HTML artifacts

VN+ 2.14 gives interactive artifacts a small `window.VNPlus` API backed by **message.extra.vn_plus**. The HTML remains in an opaque-origin iframe. VN+ supplies only scene information at that artifact's timeline point and JSON data belonging to its artifact ID/environment. No provider credentials, arbitrary SillyTavern extra fields, parent DOM, direct storage or filesystem API is exposed.

## Local menu files

Put a self-contained HTML file in the chosen environment:

```text
environments/harry-potter/artifacts/diary/index.html
```

Open it with a standalone command inside the POV section:

```text
/////
#ARTIFACT diary
```

The ID is its directory name. Use letters/digits, underscores, dots or hyphens, beginning with a letter/digit (maximum 64 characters). Paths, slashes and URL escapes are rejected. VN+ reads only `artifacts/<id>/index.html` within the selected environment; it does not fall back to another environment. HTML reloads when opened, without an inventory rebuild. Closing, changing chat/environment or invalidating playback cancels pending loading. Authored artifact folders are Git-ignored so personal menus stay local across updates; the starter in examples is tracked separately.

Copy [the working diary](../examples/diary.html) to that location as a starter. Its inline CSS and script render saved entries, append new ones with the fictional scene date/time, and show save errors. The preview at `/demo/index.html?artifact` uses the same example with a simulated in-memory chat; real SillyTavern saves through its normal chat API.

Local HTML uses the same resource policy as fenced artifacts: inline styles/scripts, SVG and embedded data/blob media. Separate external/relative scripts, stylesheets, images, fonts and network requests are not loaded. Embed resources in the HTML for now.

## Named fenced artifacts

Since 2.16, the reserved `diary` ID also receives important-scene entries emitted by the existing POV transformer as a trailing `vnplus-journal` JSON block. VN+ collects per-response deltas locally, with no extra model call. Entries obey the end-of-response timeline boundary and coexist with manual notes. See [journal format, transformer prompt and setup](journal.md).

Inline HTML can use the same persistence:

````text
```html interactive id=diary
<h1>Diary</h1>
<script>
(async () => {
    await VNPlus.ready;
    const entries = await VNPlus.extra.get('entries', []);
    console.log(entries);
})();
</script>
```
````

**Allow isolated interactive HTML artifacts** must be enabled for scripts and the bridge. Static artifacts have neither. A named ID shares history with that same ID in later messages in the same environment. An unnamed interactive fence gets a message-variant-specific ID and stays separate from unrelated fences.

## API

```js
await VNPlus.ready;

const snapshot = await VNPlus.read();
// { anchor: {messageId, variantId, revision, message, swipe, beat},
//   scene: {...}, variables: {...}, data: {...} }

const scene = await VNPlus.getScene();
const pages = await VNPlus.extra.get('entries', []);

await VNPlus.extra.push('entries', {
    text: 'Meet Jason tomorrow.',
    date: scene.scene?.date || null,
    time: scene.scene?.time || null
});
await VNPlus.extra.set('bookmark', 3);
await VNPlus.extra.remove('bookmark');
```

`read()`/`extra.read()` return independent copies. `get(key, fallback)` returns a saved value or the fallback (null by default). `set` replaces one key, `push` appends one JSON value to an array (creating it if absent), and `remove` records deletion of a key. Write methods resolve with the updated read snapshot after requesting a normal SillyTavern chat save. `VNPlus.get/set/push/remove` are aliases. `getScene()` returns scene state only. Check `scene.available`/`scene.updating` when using asynchronously resolved artwork/lighting; the known header is included while resolution is pending.

`scene` is reconstructed at this artifact's paragraph, including when opened through a historical transcript. It does not expose the latest response's later paragraphs. `variables` contains the same scalar names as VN's metadata variables, computed for that paragraph. `data` contains this artifact ID/environment's saved values only.

Values must be JSON, with finite numbers and no functions, DOM objects or prototype keys. Limits: 256 KiB per value, depth 32, 1000 actions and 1 MiB of event data per message revision. Keys follow the same 64-character naming rule as artifact IDs. Use `push` for diary entries instead of storing a growing full copy on every save. Static pages, old/closed frames and unknown bridge operations cannot write.

The bridge uses a transferred MessageChannel tied to the active iframe and a nonce. Ordinary window postMessages are not accepted as data commands. Chat/message/raw-source/swipe identity and the session lifetime are checked on each action. Data writes cannot modify message text, cached scene fields or another extension's metadata.

## Timeline behaviour

Each action is appended to the selected message revision with its environment, artifact ID, paragraph index, operation and structured story header. Reads fold matching actions from selected message/swipe revisions through the current paragraph. Action UUIDs prevent duplicate inherited events being applied twice. Diaries are not subject to the recent-cast expiry window.

- Reopening/reloading restores saved data.
- Going backward omits later actions without deleting them.
- Older messages are read-only; create a SillyTavern branch at that message before editing them.
- In the same message, writing before an existing later action is rejected to protect its future.
- A branch inherits its copied message prefix. Its first write can trim copied later actions in the fork message after the current paragraph; the parent file is unchanged. Chat integrity IDs distinguish branches from renamed chats where available.
- Swipes have separate variant identities, including new alternatives that SillyTavern initially seeds with copied extra metadata. Only VN's namespace is mirrored into the active `swipe_info` extra.
- Editing source text selects a different revision. Old revisions/actions remain in metadata; restoring the original text recovers its history. They are not silently applied to different source text.
- `remove` changes state from that point onward; earlier timeline views can still show the old value.

Persistent data stays in chat JSON, separate from the reusable HTML file. It is not appended to narration or included in ordinary model text by VN+. Another extension can deliberately read or inject metadata, so this is storage outside the normal prompt rather than encrypted storage.
