# Journal entries from the existing POV transformer

Since 2.16, VN+ collects optional journal metadata from the existing POV output. It makes **no additional model calls**, adds no generation worker and does not change the original canonical/POV text. The transformer decides which scenes matter using its normal request; VN+ validates, stores and reconstructs the entries locally.

Append the instructions in [pov-journal-prompt.txt](../examples/pov-journal-prompt.txt) to the POV transformer's system prompt. In Flowchart, add them to the POV instruction message in the existing Custom Messages node feeding the existing LLM Request. Allow the journal fence as a specific exception if the original prompt prohibits all Markdown fences. Keep the node's existing rule about the workflow adding `/////`; the POV model must not emit a second separator. Do not add an LLM node or another generation trigger.

Most scenes should produce **no block**. The prompt asks for concise first-person recollections only after meaningful discoveries, decisions, relationship changes, objectives or lasting consequences, grounded strictly in the POV character's knowledge. Routine conversation/travel/shopping and repeated facts should not fill the diary. Importance is decided by that existing transformer, not another classifier in VN+.

The combined message can end like this:

````text
Canonical narration remains here.
/////
You finally feel the wand respond to your hand.

```vnplus-journal
{"entries":[{"id":"1991-08-03-first-wand","title":"My first wand","text":"A wand finally chose me today. Going to Hogwarts suddenly feels real."}]}
```
````

The trailing fence must be the **single final block**, after the presentation script. Only whitespace may follow it. It contains strict JSON with `entries`, at most three items. Each item requires a unique `id` and nonempty `text`; `title` is optional. IDs use letters/digits/underscores/dots/hyphens, start with a letter/digit and have at most 64 characters. Titles are limited to 160 characters, text to 8000, the whole JSON block to 32 KiB. Omit the block or use `{"entries":[]}` when nothing qualifies. Unknown fields and invalid payloads are rejected atomically; partial/invalid metadata stays out of VN narration, staging, TTS and transcript. The inspector can show parser diagnostics.

## Storage and timeline

Each finalized response stores only its own source-derived additions at:

```text
message.extra.vn_plus.revisions[revision].journals[environment]
```

The value contains `beat` (the end-of-response availability boundary) and `entries`. Dates use that response's latest structured story header, inheriting the previous date/time if necessary. The collector runs on normal chat/context refreshes, including startup and while VN is closed. It can recover existing correctly formatted historical blocks. It skips user/system/canonical sections and never rewrites message text, manual artifact events or unrelated extra.

The reserved artifact ID **`diary`** receives these entries through the existing `VNPlus.get('entries', [])` / `VNPlus.read()` API. Both `#ARTIFACT diary` and `#VISUAL diary` work. Existing manual `push('entries', ...)` notes remain supported. Stable milestone IDs and equivalent text suppress repeated imported entries. The [updated diary template](../examples/diary.html) renders titles safely and refreshes its entries without clearing an unfinished manual draft.

New entries are unavailable while viewing that response's story beats. They become readable by an independent diary when playback reaches the reply/end, and by diaries in later responses. Opening a historical artifact does not reveal its future. Context collection can store the delta before playback finishes, but reads enforce the paragraph boundary. Selected swipes and text revisions choose their own deltas; restoring old source text restores its corresponding history. A branch inherits its prefix and can acquire a different future. Switching worlds isolates the diary API by environment.

The default diary presents imported entries as remembered notes. Importing metadata does not assert that the character physically took out a pen or performed a new action in the narration.

## Display outside VN

VN suppresses the metadata automatically. To hide it in ordinary SillyTavern chat too, import [VN+ · Hide trailing journal metadata](../regex/vn-plus-journal-display.json) in Extensions → RegEx, after the existing POV-display preset. It is **Markdown/display only** and leaves the stored message intact, including during incomplete journal streaming. The existing canonical-context preset already excludes the entire POV portion from the main narrator's prompt.

Open **Diary** in the VN toolbar at any time; closing it returns to the same paragraph. Enable **Allow isolated interactive HTML artifacts** for reading/saving. A local `environments/<world>/artifacts/diary/index.html` overrides the template; when it is absent, VN+ loads the bundled `examples/diary.html`. Existing authored diaries are not overwritten by an update. The demonstration at `demo/index.html?journal` uses synthetic messages and makes no model requests.
