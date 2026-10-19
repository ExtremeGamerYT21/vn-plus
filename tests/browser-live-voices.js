import { runLanguageVoiceChecks } from './browser-speech-language.js';
import { runBackgroundPipelineChecks } from './browser-background-pipeline.js';
import { runNarratorVoiceChecks } from './browser-narrator-voices.js';
import { runManualBackgroundChecks } from './browser-manual-backgrounds.js';
import { runDialogueTagChecks } from './browser-dialogue-tags.js';
import { runDialogueEmotionChecks } from './browser-dialogue-emotions.js';

export async function runLiveVoiceChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    context.chatId = 'live-voices'; context.chat = [{ mes: 'Canonical only.' }]; mountChat();
    const controller = makeController(); controller.settings.autoCreateCharacters = false;
    const text = () => controller.root.querySelector('.vn-text').textContent;
    try {
        await check('an open missing-POV screen recovers from silent mes replacement without a host event', async () => {
            await controller.open(0); assert(!controller.root.querySelector('.vn-status').hidden);
            context.chat[0].mes = 'PRIVATE\n/////\nThe completed perspective arrives.';
            await eventually(() => text().includes('completed perspective'));
            const generation = controller.generation, position = controller.playback.position;
            await pause(1100); equal(controller.generation, generation); equal(controller.playback.position, position);
        });
        await check('silent latest responses and swipes refresh while historical playback retains its selection', async () => {
            context.chat.push({ mes: 'PRIVATE\n/////\nThe next response.', swipe_id: 0 });
            await eventually(() => controller.selected === 1 && text().includes('next response'));
            context.chat[1].swipe_id = 1; context.chat[1].mes = 'PRIVATE\n/////\nA new swipe.';
            await eventually(() => text().includes('new swipe'));
            await controller.open(0); context.chat.push({ mes: 'PRIVATE\n/////\nA later response.' });
            await pause(1100); equal(controller.selected, 0); assert(text().includes('completed perspective'));
        });
        await check('closed VN screens stop source monitoring and reopen on the latest authoritative POV', async () => {
            controller.close(); const generation = controller.generation;
            context.chat.at(-1).mes = 'PRIVATE\n/////\nUpdated while closed.';
            await pause(650); assert(controller.root.hidden); equal(controller.generation, generation);
            await controller.open(); assert(text().includes('Updated while closed'));
        });
        await check('narrator properties style silent narration and never produce a narrator body', async () => {
            controller.settings.characters.narrator = { name: 'The Storyteller', textColor: '#abcdef', font: 'Georgia', voiceId: 'narrator-test' };
            controller.sceneRevision = null; await controller.open();
            equal(controller.root.querySelector('.vn-speaker').textContent, 'The Storyteller');
            equal(controller.root.querySelector('.vn-dialogue').style.getPropertyValue('--vn-text-color'), '#abcdef');
            assert(controller.root.querySelector('.vn-text').style.fontFamily.includes('Georgia'));
            equal(controller.speech.prepared.segments.length, 0); assert(!controller.stage.nodes.has('narrator'));
            assert(controller.speechSettingsPanel.fields.has('narratorEnabled'));
        });
        await check('the first-person checkbox hides aliased player bodies while retaining dialogue and voice assignment', async () => {
            controller.settings.characters.jason_weber = { displayName: 'Jason', aliases: ['Jason Weber'], voiceId: 'player-test' };
            controller.settings.playerName = 'Jason';
            controller.registry.acceptCharacter({ id: 'jason_weber', properties: controller.settings.characters.jason_weber });
            context.chat.at(-1).mes = 'PRIVATE\n/////\nJason Weber: "Hello."';
            const input = controller.settingsPanel.querySelector('[data-setting="showPlayerBust"]');
            input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true }));
            await eventually(() => text().includes('Hello') && controller.speech.prepared?.segments.length === 1);
            equal(controller.settings.showPlayerBust, false); assert(!controller.stage.nodes.has('jason_weber'), 'Player alias still produced a body');
            equal(controller.speech.prepared.segments[0].voice, 'player-test'); equal(controller.root.querySelector('.vn-speaker').textContent, 'Jason');
        });
        await check('automatic voices prepare ahead and the next-line symbol changes to ready without manual generation', async () => {
            controller.close(); let posts = 0;
            controller.settings.characters.nina = { voiceId: 'nina-test' };
            Object.assign(controller.settings.tts, { enabled: true, autoGenerate: true, narratorEnabled: false, chapterSize: 1 });
            controller.speech.endpoint = async path => {
                if (path === 'status') return Response.json({ configured: true });
                assert(path === 'synthesize'); posts++;
                const event = { audio_base64: btoa('fake-audio'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: [{ text: 'Hello', start: .1, end: .5 }] } };
                return new Response(`data: ${JSON.stringify(event)}\n\n`);
            };
            controller.speech.decode = async () => new Float32Array(44100);
            controller.speech.process = async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, samples: new Float32Array(4410), notes: [] }));
            controller.speech.audioFactory = () => ({ currentTime: 0, paused: true, async play() { this.paused = false; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} });
            context.chat.at(-1).mes = 'PRIVATE\n/////\nYou listen.\nNina: "Hello"\nNina: "Hello"';
            controller.sceneRevision = null; await controller.open();
            const badge = controller.root.querySelector('.vn-voice-ready');
            await eventually(() => badge.dataset.state === 'ready'); equal(posts, 2); assert(badge.textContent.includes('✓'));
            await controller.action('next'); await eventually(() => controller.speech.playback?.status === 'playing');
            equal(posts, 2); await controller.open(); equal(posts, 2);
        });
        await check('parallel voice batch setting stays synchronized between settings and Voices', async () => {
            const field = controller.speechSettingsPanel.fields.get('parallelBatches'), previous = controller.settings.tts.parallelBatches;
            const recording = controller.speech.job, playing = controller.speech.audio;
            assert(field); equal(field.input.min, '1'); equal(field.input.max, '5');
            try {
                field.input.value = '2'; field.input.dispatchEvent(new Event('change', { bubbles: true }));
                equal(controller.settings.tts.parallelBatches, 2); equal(controller.voicePanel.fields.get('parallelBatches').input.value, '2');
                assert(controller.speech.job === recording); assert(controller.speech.audio === playing && !playing.paused);
                const other = controller.voicePanel.fields.get('parallelBatches').input;
                other.value = '1'; other.dispatchEvent(new Event('change', { bubbles: true }));
                equal(controller.settings.tts.parallelBatches, 1); equal(field.input.value, '1');
            } finally { field.input.value = previous; field.input.dispatchEvent(new Event('change', { bubbles: true })); }
        });
        await check('text waits for a late automatic clip and follows its actual word clock', async () => {
            controller.close(); controller.settings.typewriterEffect = true; controller.settings.reducedMotion = false; controller.settings.typewriterSpeed = 5;
            let release; controller.speech.autoAttempts.clear();
            const endpoint = controller.speech.endpoint.bind(controller.speech);
            controller.speech.endpoint = async (path, options) => path === 'synthesize' ? new Promise(resolve => release = () => resolve(endpoint(path, options))) : endpoint(path, options);
            context.chat.at(-1).mes = 'PRIVATE\n/////\nNina: "Hello"'; controller.sceneRevision = null;
            await controller.open(); await eventually(() => !!release);
            await pause(100); assert(controller.dialogue.typing); assert(controller.dialogue.letters.every(letter => letter.style.visibility === 'hidden'));
            release(); await eventually(() => controller.speech.playback?.status === 'playing');
            controller.speech.audio.currentTime = .3; await eventually(() => !controller.dialogue.typing);
            assert(controller.dialogue.letters.every(letter => letter.style.visibility !== 'hidden'));
        });
    } finally { controller.dispose(); }
    await check('S2.1 prompt compilation preserves chat and reveals original German snippets with actual voice timestamps', async () => {
        context.chatId = 'speech-text-browser';
        const source = 'PRIVATE\n/////\nNina: "Ja, I understand." [curious]\nNina: "Jason Weber!" [angry]';
        context.chat = [{ mes: source }]; mountChat();
        const directed = makeController(), requests = [];
        Object.assign(directed.settings, { autoCreateCharacters: false, autoAdvance: false, typewriterEffect: true, reducedMotion: false, typewriterSpeed: 5 });
        directed.settings.characters.nina = { voiceId: 'nina-test' };
        directed.settings.characters.jason_weber = { displayName: 'Jason', aliases: ['Jason Weber'] };
        Object.assign(directed.settings.tts, { enabled: true, autoGenerate: true, autoPlay: true, chapterSize: 1, syncText: true });
        directed.speech.endpoint = async (path, options) => {
            if (path === 'status') return Response.json({ configured: true });
            const body = JSON.parse(options.body); requests.push(body.body.text);
            const first = body.body.text.includes('understand');
            const segments = (first ? ['Ya', 'I', 'understand'] : ['Jason', 'Weber']).map((text, i) => ({ text, start: .2 + i * .2, end: .35 + i * .2 }));
            return new Response(`data: ${JSON.stringify({ audio_base64: btoa('audio'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments } })}\n\n`);
        };
        directed.speech.decode = async () => new Float32Array(44100);
        directed.speech.process = async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, samples: new Float32Array(44100), notes: [] }));
        directed.speech.audioFactory = () => ({ currentTime: 0, paused: true, async play() { this.paused = false; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} });
        try {
            await directed.open(0); await eventually(() => directed.speech.playback?.status === 'playing');
            assert(requests.includes('<|speaker:0|>[curious] Ya, I understand.'));
            await eventually(() => requests.includes('<|speaker:0|>[stern, controlled displeasure] Jason Weber!'));
            equal(directed.root.querySelector('.vn-text').textContent.trim(), '"Ja, I understand."');
            directed.speech.audio.currentTime = .21;
            await eventually(() => directed.dialogue.letters.filter(letter => letter.style.visibility !== 'hidden').map(letter => letter.textContent).join('').trim() === '"Ja,');
            assert(directed.dialogue.typing, 'Phonetic spelling forced ordinary estimated typewriter timing');
            directed.speech.audio.currentTime = .61; await eventually(() => !directed.dialogue.typing);
            equal(context.chat[0].mes, source);
        } finally { directed.dispose(); }
    });
    await check('parallel chapters expose later voice readiness early and keep recordings and exports in story order', async () => {
        context.chatId = 'parallel-browser-voices';
        const source = 'PRIVATE\n/////\nYou listen.\nNina: "Line 0"\nNina: "Line 1"\nNina: "Line 2"';
        context.chat = [{ mes: source }]; mountChat();
        const parallel = makeController(), pending = new Map(); let posts = 0;
        Object.assign(parallel.settings, { autoCreateCharacters: false, autoAdvance: false, typewriterEffect: false });
        parallel.settings.characters.nina = { voiceId: 'parallel-nina' };
        Object.assign(parallel.settings.tts, { enabled: true, autoGenerate: false, autoPlay: false, chapterSize: 1, parallelBatches: 2 });
        parallel.speech.endpoint = async (path, options) => {
            if (path === 'status') return Response.json({ configured: true, maxParallelBatches: 5 });
            const index = Number(/Line (\d+)/.exec(JSON.parse(options.body).body.text)[1]); posts++;
            return new Promise((resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
                pending.set(index, () => {
                    const payload = { audio_base64: btoa('audio'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: [{ text: `Line ${index}`, start: .1, end: .5 }] } };
                    resolve(new Response(`data: ${JSON.stringify(payload)}\n\n`));
                });
            });
        };
        parallel.speech.decode = async () => new Float32Array(44100);
        parallel.speech.process = async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, samples: new Float32Array(4410), notes: [] }));
        try {
            await parallel.open(0); const generation = parallel.speech.generate(); await eventually(() => posts === 2);
            pending.get(1)(); await eventually(() => posts === 3 && parallel.speech.job.chapters[0]?.index === 1);
            const downloads = parallel.speechSettingsPanel.recordings.querySelectorAll('.vn-settings-actions button');
            assert(downloads.length === 2 && [...downloads].every(button => button.disabled));
            await parallel.action('next'); const badge = parallel.root.querySelector('.vn-voice-ready');
            await eventually(() => badge.dataset.state === 'ready'); assert(badge.textContent.includes('✓'));
            pending.get(0)(); pending.get(2)(); await generation;
            equal(parallel.speech.job.chapters.map(chapter => chapter.index).join(','), '0,1,2');
            assert([...parallel.speechSettingsPanel.recordings.querySelectorAll('.vn-settings-actions button')].every(button => !button.disabled));
            equal(context.chat[0].mes, source);
        } finally { parallel.dispose(); }
    });
    await runLanguageVoiceChecks({ check, assert, equal, eventually, context, mountChat, makeController });
    await runBackgroundPipelineChecks({ check, assert, equal, eventually, context, mountChat, makeController });
    await runNarratorVoiceChecks({ check, assert, equal, eventually, context, mountChat, makeController });
    await runDialogueTagChecks({ check, assert, equal, eventually, context, mountChat, makeController });
    await runDialogueEmotionChecks({ check, assert, equal, eventually, context, mountChat, makeController });
    await runManualBackgroundChecks({ check, assert, equal, eventually, context, mountChat, makeController });
}
