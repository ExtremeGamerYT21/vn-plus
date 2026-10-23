# Fish Audio voices

VN+ generates voices for the selected finalized POV. Each character supplies its own `voiceId` through `properties.json` or its normal character registry override. An absent or empty character ID falls back to the narrator voice in this environment's `characters/narrator/properties.json`. If neither voice ID is configured, the line stays silent. Narration itself is muted by default and has its own toggle; that toggle does not disable the dialogue fallback. Internal thoughts and HTML artifacts are excluded from synthesis.

## Automatic voices and readiness

Under **Extensions → Visual Novel+ → Fish Audio voices → Voice generation and playback**, enable voices and **Automatically generate voices for completed POV responses**. Automatic generation is off by default. It uses the configured Fish model and account, including that model's normal usage charges. Keep **Play prepared clips during VN dialogue** enabled for automatic playback. Manual prepare/generate controls remain available.

Opening a completed POV prepares its voiced lines in chapters ahead of playback. The symbol beside the text describes the next voiced beat: `○` pending, `◌` generating, `✓` ready, or `!` unavailable/requires review. Its tooltip names the speaker and line. Readiness requires a usable aligned cut and successful audio finishing. Characters without their own voice IDs use the narrator voice when configured.

Automatic preparation continues with the SillyTavern tab hidden or the browser minimized. The current voice line keeps playing, or starts when its recording becomes ready, then holds on that beat. Auto never advances hidden scenes. For a newly completed response, **General → Open completed responses automatically** also permits one voiced line as an audible completion cue, once per prepared response; the remaining lines only generate/cache. **Play prepared clips during VN dialogue** must be enabled for that cue. Scene music and ambience accompany the line, respecting mute and volume settings, then pause until you return. Normal interaction with SillyTavern unlocks scene audio under the browser's playback rules. On returning, automatic opening can show a newly prepared response; an already open VN refreshes its selected response. With automatic opening off and VN closed, voices remain prepared until you open it yourself. Matching recordings are reused. Browsing existing swipes, editing or deleting messages, loading history and switching chats do not open a closed VN or announce old lines. Newly generated swipes and completed POV transformations can open it. Exiting VN suppresses that response, including late edits, without cancelling active synthesis.

The source monitor waits for unchanged completed POV text across two checks, including replacements made by the Flowchart transformer without a SillyTavern message event. Host events and chat DOM edits wake discovery immediately; a dedicated worker supplies the later stability checks, independently of the hidden page's chained interval timer. An event also schedules one backup confirmation if worker notifications stop. Returning from page suspension reconnects the worker. SillyTavern's actual generation flag supplements its events, so a missed completion event cannot leave preparation blocked after an observed generation ends. If workers are unavailable, monitoring falls back to a page timer plus event triggers. Missing/empty POVs, unfinished quotes/artifacts, disabled voices, generation in progress, and internal thoughts do not start automatic TTS. Chat/source/swipe/environment changes still invalidate obsolete preparation, and matching audio is not generated again on each check. The tab must remain loaded: a browser-frozen/discarded/closed tab cannot execute extensions or its dedicated workers. This does not run the Flowchart workflow on the server or keep the PC generating when switched off. No server bridge update is needed.

If the current line's recording is still generating, voice-synchronized text and Auto wait for it. The text follows actual word timestamps when available. Playback/generation failures release the text to the ordinary typewriter and local timing rules; uncertain cuts require review. A failed automatic attempt does not repeat on every reopen/navigation. Use **Generate selected dialogue / Generate remaining chapters** to retry explicitly. Completed recordings are reused within the bounded in-memory cache; a page refresh clears that audio cache.

Bracketed performance tags such as `[laugh]`, `[cough]`, `[sigh]`, and multiword delivery instructions stay in the speech input but are hidden in the dialogue box, including during typewriter and word-synchronized reveal. Original message text and parsed speech/emotion information remain unchanged.

[Emotion typography](dialogue-emotions.md) uses the same directions for angry jitter, scattered shouting, smaller sad or whispered text and affectionate glow. These styles preserve word timestamps and character settings; **Reduced motion** stops continuous jitter and **Emotion text effects** disables the visual styles.

## Narrator and first-person view

**Voice the narrator (off = muted)** uses this environment's `characters/narrator/properties.json`. The file is loaded even without an inventory entry. For example:

```json
{
  "displayName": "Narrator",
  "voiceId": "YOUR_FISH_VOICE_ID",
  "textColor": "#d8d0bc",
  "font": "Georgia"
}
```

`name` is also accepted when `displayName` is absent. Name, text color, font and normal box styling apply even when narration is muted. Enabling the toggle without a voice ID keeps narration silent. The narrator never receives a bust. Use **Refresh assets** after editing properties files.

In **Fish Audio voices → Voice generation and playback**, **Narrator delivery tag** defaults to `warm, expressive storytelling`. VN+ prepends `[warm, expressive storytelling]` to each narration passage before synthesis, including explicitly named narrator aliases. Enter a short direction with or without brackets (up to 160 characters), or clear it to use only source delivery cues. Authored emotions and positional effects remain available. This setting affects actual narration only; character dialogue that borrows the narrator voice retains the character's own delivery. It changes the synthesis prompt and cache identity without changing displayed prose, word timing, message text or narrator properties. Existing recordings remain intact; the selected delivery is used for newly generated audio. The narrator's voice toggle still controls whether narration is voiced at all. Fish supports [natural-language delivery tags](https://fish.audio/blog/fish-audio-s2-fine-grained-ai-voice-control-at-the-word-level/); the strength of a cue depends on the voice and generated performance.

Narrator paragraphs collect into narrator-only Fish batches across the scene, including paragraphs separated by character dialogue. Character lines collect separately in their own dialogue batches. The existing chapter-size and language limits apply independently to each group; **Split into short chapters** off removes the size split. Requests use fresh speaker/voice maps and are queued by their first scene beat. Actual narration text stays out of character dialogue requests. A character without a personal voice intentionally uses the narrator reference in its dialogue batch, preserving the original character name, expression, language, vocal cues and beat timing. All such characters share one Fish speaker slot; they do not each consume a separate voice assignment. Personal character voices always take priority, and malformed configured IDs still report an error. Ambiguous language hints inherit from their own narration/dialogue group, so narration cannot change the language of a short character reply. **Voices** labels completed batches **Narration** or **Dialogue**. The narrator toggle and existing character voice IDs still apply. Refresh the browser to load this parser change; the server bridge does not need an update.

Timestamp alignment separates each batch back into its original paragraphs/lines using their beat IDs. VN playback interleaves those clips in story order. When batches span intervening beats, original and processed **scene WAV** downloads also join the aligned clips in story order, using their configured margins. These scene downloads wait for all required batches and usable/reviewed cuts. Original batch audio remains intact for timing review, and individual completed clips remain available. A batch spanning multiple positions has no single global scene offset. Ordinary batches that already follow story order retain their existing full-recording exports.

**General → Hide player bust (first-person view)** hides the canonical player and their aliases. Set **Player identity** to the player character's name. Dialogue, player emotion and the player's own voice ID continue to work. Existing `showPlayerBust` preferences are preserved; checking the new label sets that value to false.

```json
{
  "displayName": "Ashley",
  "voiceId": "YOUR_FISH_VOICE_ID"
}
```

Replace the placeholder with a real Fish voice ID. A voice-page URL such as `https://fish.audio/pt/m/4744963f03b24efeb8e29b86aca419a0/` also works; only its ID is sent to Fish. IDs are scoped to the selected environment’s character properties, just like artwork. Use registry overrides or a personal environment when customizing bundled characters to avoid modifying Git-tracked content.

Folder IDs, `displayName` and every entry in `aliases` resolve to the same canonical character and voice. For example, `characters/jason_weber/properties.json` with `displayName: "Jason"` and `aliases: ["Jason Weber", "J. Weber"]` voices all three speaker labels using its `voiceId`. The player name is a fallback identity, and virtual player settings no longer hide a real character file. An override keyed by the canonical ID (`jason_weber`) still applies, including an explicitly blank voice ID.

The version 2.5.1 bridge reads all properties in the selected environment before resolving aliases, without writing files or generating speech. It works with a missing/stale inventory and with automatic folder creation disabled. **Prepare selected dialogue** repeats this read to pick up voice-ID edits. Alias discovery is available to authenticated users; folder creation remains an administrator operation. Restart SillyTavern once after updating the bridge. If live discovery is unavailable, indexed/local properties remain usable and its failure is recorded in the character settings status.

## One-time server bridge setup

The frontend uses a small bundled SillyTavern server plugin so API credentials remain in SillyTavern’s per-user secret store. It sends requests to Fish’s fixed HTTPS endpoint. No key is placed in VN settings, manifests, logs, voice prompts, downloaded audio or timing metadata.

The same bridge also creates local starter folders for unknown speakers. That feature needs no Fish key; generated `voiceId` is blank until you assign one. Restart SillyTavern after updating to version 2.5 so its new character-folder endpoint is loaded.

After installing VN+ as a global extension, run this command from the extension directory:

```text
node tools/install-server-plugin.js /path/to/SillyTavern
```

Use the SillyTavern application folder containing `config.yaml` and `src/`, not its extensions directory. The optional second argument specifies a different global VN+ folder name. The installer creates `plugins/vn-plus-tts.mjs`, which follows the installed extension’s Git updates. `enableServerPlugins` must be `true` in `config.yaml`. Restart SillyTavern once to load it, and after later updates that change server code. This setup is for a global installation; a per-user frontend needs a global copy of the bridge source installed by the server administrator.

Open **Extensions → Visual Novel+ → Fish Audio voices**, check the bridge, save the key, and enable voices. Save/remove controls manage only VN+’s Fish key. The form clears the typed key after submission and never retrieves the stored value.

## Standalone voice workbench

Choose **Open voice workbench** in VN+ voice settings, or open `/scripts/extensions/third-party/vn-plus/playground/index.html` on your SillyTavern server. The separate page uses your existing local bridge and saved Fish key; keep SillyTavern running. No additional server, build, or API-key entry is needed.

Enter a voice ID (or Fish voice-page URL) and sample text, then **Generate original**. The default model is S2.1 Pro Free; the paid model must be selected explicitly. Generation uses the selected model's normal account usage. You can also **Load audio** from a local recording without a Fish call. Audio stays in memory and is cleared when the page closes.

Pitch, formants and pitch variation use the same bounds and local Praat transformation as character `ttsYoungify`. Auto-apply reprocesses the same original after slider changes; turn it off to apply manually. The last few configurations are cached. Original/Processed buttons (or A/B outside text fields) switch listening sources at the same playhead position. The page shows separate waveforms, duration, processing notes and **estimated** median voiced pitch; unvoiced clips may have no pitch estimate. Applying Praat makes no additional Fish request. A failed effect is shown as an error and never passed off as processed audio.

Download original/processed WAV files or **Copy settings** into the character's `properties.json`. The page never edits character files or chat data. It remembers only the voice ID, sample text and selected controls in browser-local preferences; it never reads or stores your API key.

## Younger character voices with local Praat

Set `ttsYoungify` in the character's `properties.json` (or its registry override). It is off when omitted:

```json
{
  "displayName": "Jason",
  "voiceId": "YOUR_FISH_VOICE_ID",
  "ttsYoungify": true
}
```

`true` uses **+4 semitones**, **1.15 formant ratio**, and unchanged pitch range. For finer control, replace `true` with:

```json
{
  "enabled": true,
  "pitchSemitones": 4,
  "formantRatio": 1.15,
  "pitchRange": 1
}
```

`pitchSemitones` accepts 0–12; `formantRatio` accepts 1–1.4 (1 preserves resonance); `pitchRange` accepts 0.5–2 (1 preserves variation). Set `ttsYoungify` to `false`, or `enabled` to `false`, to disable it. Start with small changes and compare **Play original / Play processed**. This adjusts perceived pitch/resonance; results depend on the source recording.

The effect uses the real [Praat pitch/formant transformation](https://praat.org/manual/Sound__Change_gender___.html) through [Parselmouth](https://pypi.org/project/praat-parselmouth/), an optional GPLv3+ dependency. From the installed extension directory, install its isolated Python environment once:

```text
node tools/install-praat.js /path/to/SillyTavern
```

Python 3.10 or newer must be available. An optional second argument selects the Python executable. The environment lives in `SillyTavern/plugins/vn-plus-praat/.venv`, outside the extension checkout, so Git updates preserve it. Server administrators can instead set `VNPLUS_PRAAT_PYTHON` to an existing Python executable with `praat-parselmouth==0.4.7` and NumPy installed. Browser requests cannot choose executables or file paths. Install the server bridge as above, and **restart SillyTavern after this server update**. **Fish Audio voices → Check Praat** verifies the dependency.

Use **Apply latest voice effects** in **Voices** after editing properties. It reloads character properties and rebuilds existing cached clips without a Fish synthesis request, including a retry after a Praat fallback. If the voice ID or dialogue changed and no matching recording exists, it asks you to generate that recording separately. The per-line **Praat applied / unchanged / fallback / pending** status reports the actual processed clip; **requested +N semitones** only describes configuration. **Play processed** auditions the effect, while **Play original** auditions the source. Already generated Fish recordings are reused; only the local processed clips are rebuilt when `ttsYoungify` changes. The adjustment belongs to the speaking character, including when that character borrows the narrator's voice. Narrator properties affect actual narration only. Other characters in the same Fish batch retain their own settings. It applies to normal playback and processed exports even if general audio finishing is off; original playback/exports always retain the source audio.

Praat runs locally after clip alignment, with at most two transformations at once and no additional Fish request. Duration and sample count stay unchanged so transcript timing remains usable. Peak protection is reapplied after transformation. Clips without stable voiced pitch, silence, and clips shorter than 100 ms stay unchanged with a processing note. Clips longer than 120 seconds require shorter chapters/cuts. Missing Praat or a failed transformation is reported in **Voices**. That line plays its own unmodified voice; other lines play as soon as they are ready, without waiting for another character's effect. This fallback is cached so playback does not retry a broken effect on every beat. After correcting setup, use **Generate selected dialogue** to retry local effects on cached Fish audio, or refresh assets/prepare after changing the character settings. Original audio always remains available. Actual timbre should be checked by listening; automatic tests check pitch, timing, transport, cache reuse and errors.

## Prepare and generate

1. Open the assistant response/swipe you want in VN.
2. Open **Voices** in the VN toolbar or the Fish area in extension settings.
3. **Prepare selected dialogue** lists only spoken segments with character voice IDs. Preparation makes no synthesis request. You can deselect individual lines.
4. **Generate selected dialogue** validates the whole selection before making requests. It defaults to `s2.1-pro-free`; the paid `s2.1-pro` model requires explicit selection. There is no automatic paid fallback. Only explicit HTTP 429 rejections receive bounded automatic retries; other failures require an explicit resume.
5. Requests use chapters of six spoken segments by default, with up to three chapters generating in parallel. A segment is one utterance, not a pair of turns. Chapter size is adjustable from 1–200, or size splitting can be disabled. Language changes still start separate requests. Each chapter builds a fresh ordered character/voice mapping with `<|speaker:N|>` tags. Emotion directions such as `[curious]`, `[whispering]` and `[laughing]` stay in the synthesis input.
6. Completed chapters survive cancellation or a later failure. **Generate remaining chapters** resumes explicitly. A completed matching recording is reused without another Fish request when the same scene is rendered, reopened or generated again during the current session.

## S2.1 dialogue delivery and pronunciation

VN+ compiles the Fish input separately from the chat and displayed dialogue. Each speaker marker is followed by the line's direction, for example `<|speaker:0|>[curious] Hello.`. Trailing emotion cues move before the utterance; inline sentence emotions move before that sentence's words. Repeated identical cues are deduplicated. Inline `[break]`, `[long-break]`, `[emphasis]` and vocal events such as `[sighing]` retain their authored positions. This follows [Fish's S2 emotion guidance](https://docs.fish.audio/developer-guide/core-features/emotions), which recommends sentence-start emotions, concise descriptions and natural vocal sounds. S2.1 supports free-form bracket descriptions; these are delivery hints rather than guaranteed performances.

Deterministic phrase rules run automatically for both supported S2.1 models:

- An angry, serious, stern or annoyed **opening full-name address** becomes `[stern, controlled displeasure]`. `Henry: "Jason Weber!" [angry]` sends `[stern, controlled displeasure] Jason Weber!`. VN+ checks known folder names, display names and aliases, including mute characters. Mentioning a name later in a sentence, a first-name call, or a happy greeting does not trigger this rule. An explicit whispering/shouting modifier is preserved.
- Explicit `[voice_break]`, `[voice breaks]` and `[voice cracks]` become `[voice breaking]`. A repeated initial such as `I-I` with a sad/tearful direction adds a voice-breaking hint; a nervous/scared direction adds hesitant stammering. Ordinary compounds and calm stutters receive no invented emotional direction.
- Short standalone vocalizations receive sound cues while keeping their written sounds: `Ha ha!` / `Hahaha!` → `[laughing]`, `Heh.` → `[chuckling]`, `Ugh.` → `[groaning]`, `Ahem.` → `[clear throat]`, and `Huff, puff.` → `[panting]`. Standalone `Sigh.`, `Gasp!` and `Yawn.` are supported too. Existing vocal directions are not duplicated.
- Nearby English narration can supply a missing vocal action: `You *sigh*.` followed by `Jason: "Fine."` sends `[sighing] Fine.` for the player; `Henry coughs.` supplies `[coughing]` to Henry's adjacent dialogue. Names and aliases identify the actor; `you`/`I` use the configured player identity. `he`/`she`/`they` require one unambiguous neighboring speaker. The following matching utterance is preferred; a trailing action can attach to the preceding matching utterance. Each action is used once. Laughs, chuckles/giggles, coughs, sighs, sobs/cries, gasps, groans, pants, yawns, snores, sneezes and throat clearing are recognized, including common past/progressive forms and simple adverbs. Existing vocal tags anywhere in the dialogue or its direction take precedence, including variants and combined tags. Negated, hypothetical, quoted and ambiguous descriptions are skipped. Scene boundaries, thoughts and artifacts block association. Narrator voicing and dialogue voice fallback retain their normal rules; an action without adjacent voiced dialogue does not create another request or standalone audio. These are Fish delivery hints; actual vocal performance still depends on the voice.
- Short German interjections in otherwise English dialogue use `Ja` → `Ya` and `Ach so` → `Ach zo`, preserving capitalization and whole-word boundaries. These are English-friendly spellings for code-switches, not a German translation or a general pronunciation dictionary. Recognizable German passages are left intact. Set `"ttsLanguage": "de-DE"` (or another non-English language code) in a character's `properties.json` to disable these English snippet substitutions for that character; `en-GB` / `en-US` allow them. This property also disambiguates language grouping for short/unknown lines; it does not change the Fish voice/accent.

Chat text, narration, sprite emotions and character properties are never rewritten by this compiler. Only eligible spoken segments reach it: thought/mute/narrator settings still apply. For pronunciation substitutions, chapter alignment and synchronized text accept either the original or phonetic spelling **only at that changed word**. Displayed `Ja` therefore follows the actual `Ya` timestamp. Other mismatches, missing words, ambiguous cuts and invalid timings still require review; vocal sounds without usable transcript words do not get guessed timestamps. Recordings remain cached by their compiled prompt, so a changed pronunciation/direction generates a new recording rather than reusing old audio. Parsing changes take effect after refreshing the page; they require no new server-bridge installation.

Automated checks cover prompt construction, registry names, transcript alignment and browser text reveal using simulated Fish responses. Actual vocal acting and pronunciation still depend on the selected voice and need a listening check.

## Whole-language voice batches

**Isolate voice IDs into separate batches** is enabled by default. Each dialogue voice gets its own request track,
with a single reference ID and speaker index 0. Narration stays in a separate track, even when a character borrows
its voice. Original beat IDs, alignment, per-character Praat settings, scene exports and parallel generation retain
story order. Chapter-size and language limits apply within each voice track; narration-interrupted utterances stay
joined. Disable the option to use the original multi-speaker batching. This removes cross-reference switching from
the provider request; it does not guarantee a source voice's timbre or acting.

Each completed chapter has **Voice routing and request text** showing its recorded request's voice IDs, canonical
characters, beat IDs, speaker indices and exact prompt. No API key is included. Compare **Play original chapter for
timing review** with the individual clips to distinguish a generated-voice mismatch from a clip-boundary issue.
Conflicting voice IDs for one canonical speaker are rejected before synthesis instead of silently using the first.

When narration separates two fragments from the same character in the same language, Fish receives one continuous
utterance: `<|speaker:0|>[angry] Open that door, [serious] and you will regret it.` A fragment ending in a full stop
is joined too. There is no repeated speaker marker or newline between those fragments; each keeps its own emotion
direction. A joined utterance stays together even across the short-chapter size target. Original VN lines, word
timestamps, individual clip cuts and narration playback remain separate and retain their story order. Muting narrator
voicing does not prevent joining. Another character's dialogue (including silent dialogue), thoughts, artifacts, scene
commands/headers, a language change or deselecting an intermediate fragment ends the join.

Speaker-labelled paragraphs can mix quoted dialogue and unquoted prose on the same line. For example,
`Professor: "The point," he says, as he points at the door, "is that you listen." He steps back.` becomes separate
character and narration beats. Only the quoted fragments enter the character's joined Fish utterance; prose uses
the narrator's voice setting. Simple attributions such as `she repeated` are still omitted. Nested/escaped quotes
remain inside speech, and unfinished quoted fragments are withheld while streaming. Original chat text is preserved.

Whole non-English utterances automatically start a separate Fish request. Within each narration/dialogue group, consecutive voiced utterances in the same detected language share that request, including different dialogue characters, until the chapter-size limit. English resumes in a new request. Disabling **Split into short chapters** removes the size split; it still keeps languages and narration/dialogue separate. The existing parallel queue, cancellation, timestamp alignment and audio cache preserve each clip's original story position. No new server installation is required.

With voice isolation off, these lines create three batches: **English / German + German / English**:

```text
Henry: "Do it as I say, ja?"
Henry: "Ja, wir gehen jetzt nach Hause."
Jason: "Ich bin gleich bereit."
Jason: "I understand, Dad."
```

The English snippet becomes `ya` only in the Fish prompt. The German batch retains `Ja`, umlauts, original emotion cues and the same character voice IDs. Original VN text is unchanged. **Prepare selected dialogue** shows each line's language; completed chapters show it too. Deselecting English lines can leave a single German batch.

Detection runs locally, without LLM/API requests or downloaded models. Weighted vocabularies distinguish English, German, French, Spanish, Portuguese, Italian, Dutch, Polish, Russian and Ukrainian. Shared words such as `in`, `die`, `no` and `a` carry less weight; clear English wording keeps a mixed utterance in the English group. Writing-system checks also isolate Japanese, Chinese, Korean, Arabic, Greek, Devanagari, Hebrew and Thai text. This is a heuristic, particularly for short replies, names, related languages and shared scripts. An ambiguous reply such as `Ja!` uses its character's valid `ttsLanguage` hint first, otherwise the preceding detected speech (or following speech at the start), otherwise English. A clear sentence can override a character's usual language. Unknown Latin-language sentences need a property hint when the vocabulary cannot identify them. VN+ does not split an English/German mixture inside one utterance into separate clips.

Separating the requests gives Fish foreign-language text without English speech from the preceding batch. It does not guarantee an accent. Fish's [TTS API documentation](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech) says its `language` parameter affects normalization and timestamps, not the model's accent. VN+ leaves that API parameter unset and lets Fish infer the language from each request; the language labels above are local metadata.

## Parallel voice batches

Under **Fish Audio voices → Voice generation and playback**, set **Parallel voice batches (1 = sequential)** to an integer from 1–5. The same control appears in the VN **Voices** panel. The default is 3; choose 1 for sequential behavior. A response needs multiple chapters to benefit. Changing the preference applies to the next generation and does not interrupt playback, cancel current requests or invalidate existing audio.

The queue starts the earliest missing chapters, up to the selected limit. A freed worker takes the next missing chapter. Completed chapters become playable independently of earlier unfinished chapters, with their own timestamps and speaker mapping. The next-line readiness symbol can therefore show ready even while other batches are generating. Recordings and full-scene audio remain in narrative order. Scene WAV export waits if an earlier chapter is missing; individual completed clips and chapter review remain available.

If a batch fails, no new queued chapters are dispatched after that failure is observed. Already running chapters may finish and remain cached. **Generate remaining chapters** requests only missing chapter indices, including holes before later completed chapters. Changing chats, source text, swipes or environments cancels all outstanding work; late responses cannot enter the new scene. The existing ten-minute decoded-audio cap applies across all completed chapters.

HTTP 429 rejections retry at most twice, after 1 and 2 seconds by default. A longer `Retry-After` can extend those waits, capped at 30 seconds per retry. Cancellation also cancels retry waits. Other errors, interrupted streams and timeouts are not retried automatically. Persistent rate-limit errors suggest lowering this setting; the model never switches to a paid alternative.

Bridge version 4 advertises a local cap of five concurrent requests per SillyTavern user, shared across that user's browser tabs. **Restart SillyTavern after installing 2.21**, then refresh the browser. Until the new bridge is loaded, VN+ uses a single request and displays restart guidance. Fish's own account limit is separate and shared across API keys and other API workloads; see [Fish's current concurrency limits](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits).

Opening or advancing a scene starts synthesis only when automatic voice generation is enabled. Generation is blocked during SillyTavern’s generation and for unfinished POV input. Chat, swipe, source and environment identities keep clips separate; changing the source stops obsolete playback and requests. Prepared recordings are bounded in memory and are not restored after a page reload; download recordings you want to retain. Local safeguards allow 200 selected segments, eight voiced characters, 20,000 characters per chapter and ten minutes of decoded scene audio. These are VN+ limits, not Fish service limits.

When Fish voices are enabled, automatic legacy character/emotion sounds are suppressed. Explicit `#SFX`, music and ambience remain independent. If another SillyTavern TTS provider automatically narrates your responses, turn off its automatic narration to avoid overlapping speech.

## Timing review and playback

**Reveal dialogue with voice timing**, under **Voice generation and playback**, is on by default. With automatic voice playback and the typewriter enabled, dialogue appears word by word at the generated transcription timestamps. The reveal follows the audio's current playback position, including retained opening silence, pauses and playback stalls. It uses prepared clips; when automatic generation is enabled it can also wait for a clip still being generated ahead. The reveal itself makes no synthesis requests.

Missing or mismatched word timings use the ordinary typewriter; playback failure resumes it from the visible text. Clicking to finish text leaves the voice playing, and Auto waits for both. Reduced motion, a disabled typewriter, zero typewriter speed and backward navigation display the full line immediately. Stopping voice playback also finishes the text. The 2.6 update changes only frontend code, so an installation already running the 2.5.1 bridge needs a browser refresh, without another server restart.

Audio bytes are collected in arrival order. Cumulative alignment snapshots replace earlier snapshots for the same chunk. Chunk offsets are added to timed words. Each chapter’s independent audio is decoded to mono 44.1 kHz PCM; scene WAV exports join the decoded samples, rather than concatenating independent MP3 files.

Dialogue matching uses monotonic edit-distance alignment separately in each chapter, excluding emotion/speaker tags from matching. Automatic cuts require at least 95% text coverage, matched first/last tokens, an unambiguous alignment and valid times. Uncertain cuts show **Review required** and cannot be attached to a VN line, played as a line, or exported until reviewed. No proportional timing estimates are used.

Use **Play original chapter for timing review**, enter chapter-local start/end seconds, and **Approve cut**. Manual cuts must stay within the chapter and avoid overlapping approved clips. The original recording remains available even when a cut needs review.

Default margins retain 200 ms before and after speech, independently adjustable from 0–2 seconds. They retain existing audio, without adding silence. Short gaps are shared proportionally without overlap; long gaps retain each requested margin while leaving the unused middle out. Cuts respect chapter edges and adjacent timed words.

A spoken line ending in an em dash (`—`) omits its automatic trailing margin. If the next visible beat is also voiced, that clip omits its leading margin, even across chapter boundaries. Intervening silent beats prevent incoming-margin trimming. Word timestamps, review requirements and approved manual cuts are preserved; these local cuts make no additional Fish request. Auto also skips its configurable completion pause for interrupted spoken dialogue. Playback startup latency may still apply.

Prepared clips play on their corresponding VN dialogue beats when that option is enabled. Narration follows its own voice toggle, thoughts stay silent, and characters without IDs use the configured narrator voice. With neither ID present, a character stays silent. Advancing stops the previous voice; auto advance waits for its voice clip to finish. Original/Processed comparison is available per line. Scene downloads are real WAV files; line downloads are actual MP3 files encoded locally by the bundled LAME library.

## Optional finishing

Finishing runs in a worker and always starts from preserved original PCM. It keeps sample count and timing unchanged. Changing margins, manual cuts, noise intervals or processing settings invalidates processed output.

- Speech RMS matching targets −20 dBFS by default, adjustable from −30 to −12. Gain is limited to ±24 dB; effectively silent clips are not boosted. Whispered lines receive the same volume matching as other dialogue.
- Conventional spectral noise reduction is adjustable from 0–12 dB, default 4. It uses quiet timestamp gaps or an explicitly selected noise-only interval. With no trustworthy profile, it is skipped with an explanation.
- Optional high-shelf softening near 5 kHz is adjustable from 0–8 dB and off by default. It does not remove embedded AI artifacts reliably.
- Sample-peak protection defaults to −1.5 dBFS; optional edge fades default to 5 ms.

Processed scene exports replace approved dialogue ranges with their processed samples; other audio stays original. NVIDIA RTX Voice/Broadcast and neural denoising are not integrated.

The request fields and timestamp semantics were checked against [Fish’s OpenAPI schema](https://docs.fish.audio/api-reference/openapi.json). Automated checks use simulated provider responses; a real Fish account/key and voice IDs are needed for live synthesis and listening checks.
