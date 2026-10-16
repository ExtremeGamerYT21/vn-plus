# Fish Audio voices

VN+ generates voices for the selected finalized POV. Each character supplies its own `voiceId` through `properties.json` or its normal character registry override. An absent or empty ID means mute. Narration is muted by default and has its own optional voice. Internal thoughts and HTML artifacts are excluded from synthesis.

## Automatic voices and readiness

Under **Extensions → Visual Novel+ → Fish Audio voices → Voice generation and playback**, enable voices and **Automatically generate voices for completed POV responses**. Automatic generation is off by default. It uses the configured Fish model and account, including that model's normal usage charges. Keep **Play prepared clips during VN dialogue** enabled for automatic playback. Manual prepare/generate controls remain available.

Opening a completed POV prepares its voiced lines in chapters ahead of playback. The symbol beside the text describes the next voiced beat: `○` pending, `◌` generating, `✓` ready, or `!` unavailable/requires review. Its tooltip names the speaker and line. Readiness requires a usable aligned cut and successful audio finishing. Missing voice IDs stay silent.

If the current line's recording is still generating, voice-synchronized text and Auto wait for it. The text follows actual word timestamps when available. Playback/generation failures release the text to the ordinary typewriter and local timing rules; uncertain cuts require review. A failed automatic attempt does not repeat on every reopen/navigation. Use **Generate selected dialogue / Generate remaining chapters** to retry explicitly. Completed recordings are reused within the bounded in-memory cache; a page refresh clears that audio cache.

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

## Prepare and generate

1. Open the assistant response/swipe you want in VN.
2. Open **Voices** in the VN toolbar or the Fish area in extension settings.
3. **Prepare selected dialogue** lists only spoken segments with character voice IDs. Preparation makes no synthesis request. You can deselect individual lines.
4. **Generate selected dialogue** validates the whole selection before making requests. It defaults to `s2.1-pro-free`; the paid `s2.1-pro` model requires explicit selection. There is no automatic paid fallback. Only explicit HTTP 429 rejections receive bounded automatic retries; other failures require an explicit resume.
5. Requests use chapters of six spoken segments by default, with up to three chapters generating in parallel. A segment is one utterance, not a pair of turns. Chapter size is adjustable from 1–200, or splitting can be disabled. Each chapter builds a fresh ordered character/voice mapping with `<|speaker:N|>` tags. Emotion directions such as `[curious]`, `[whispering]` and `[laughing]` stay in the synthesis input.
6. Completed chapters survive cancellation or a later failure. **Generate remaining chapters** resumes explicitly. A completed matching recording is reused without another Fish request when the same scene is rendered, reopened or generated again during the current session.

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

Prepared clips play on their corresponding VN dialogue beats when that option is enabled. Narration, thoughts and characters without IDs stay mute. Advancing stops the previous voice; auto advance waits for its voice clip to finish. Original/Processed comparison is available per line. Scene downloads are real WAV files; line downloads are actual MP3 files encoded locally by the bundled LAME library.

## Optional finishing

Finishing runs in a worker and always starts from preserved original PCM. It keeps sample count and timing unchanged. Changing margins, manual cuts, noise intervals or processing settings invalidates processed output.

- Speech RMS matching targets −20 dBFS by default, adjustable from −30 to −12. Gain is limited to ±24 dB; effectively silent clips are not boosted. Whispered lines receive the same volume matching as other dialogue.
- Conventional spectral noise reduction is adjustable from 0–12 dB, default 4. It uses quiet timestamp gaps or an explicitly selected noise-only interval. With no trustworthy profile, it is skipped with an explanation.
- Optional high-shelf softening near 5 kHz is adjustable from 0–8 dB and off by default. It does not remove embedded AI artifacts reliably.
- Sample-peak protection defaults to −1.5 dBFS; optional edge fades default to 5 ms.

Processed scene exports replace approved dialogue ranges with their processed samples; other audio stays original. NVIDIA RTX Voice/Broadcast and neural denoising are not integrated.

The request fields and timestamp semantics were checked against [Fish’s OpenAPI schema](https://docs.fish.audio/api-reference/openapi.json). Automated checks use simulated provider responses; a real Fish account/key and voice IDs are needed for live synthesis and listening checks.
