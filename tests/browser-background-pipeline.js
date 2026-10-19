import { wavBytes } from '../core/speech-pcm.js';

export async function runBackgroundPipelineChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    let hidden = true;
    const visibility = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
    function fixture(id, automaticPlayback) {
        hidden = true;
        context.chatId = id; context.chat = [{ mes: 'Canonical only.' }]; mountChat();
        const listeners = new Map();
        context.eventSource = { on(name, callback) { const set = listeners.get(name) || new Set(); set.add(callback); listeners.set(name, set); }, removeListener(name, callback) { listeners.get(name)?.delete(callback); } };
        const emit = (name, ...args) => { for (const callback of [...(listeners.get(context.eventTypes[name]) || [])]) callback(...args); };
        const controller = makeController(), requests = [], played = [];
        const decode = controller.speech.decode, process = controller.speech.process;
        Object.assign(controller.settings, { autoCreateCharacters: false, automaticPlayback, autoAdvance: false, typewriterEffect: false });
        controller.settings.characters.nina = { voiceId: 'background-nina' };
        Object.assign(controller.settings.tts, { enabled: true, autoGenerate: true, autoPlay: true, narratorEnabled: false, chapterSize: 6, splitChapters: true });
        controller.speech.endpoint = async (path, options) => {
            if (path === 'status') return Response.json({ configured: true, maxParallelBatches: 5 });
            assert(path === 'synthesize'); const input = JSON.parse(options.body); requests.push(input.body.text);
            const words = input.body.text.replace(/<\|speaker:\d+\|>|\[[^\]]*\]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
            const event = { audio_base64: btoa('simulated audio'), chunk_seq: 0, chunk_audio_offset_sec: 0,
                alignment: { segments: words.map((text, index) => ({ text, start: .1 + index * .15, end: .2 + index * .15 })) } };
            return new Response(`data: ${JSON.stringify(event)}\n\n`);
        };
        controller.speech.decode = async () => new Float32Array(44100);
        controller.speech.process = async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, samples: new Float32Array(4410), notes: [] }));
        const audioFactory = () => ({ paused: true, currentTime: 0, loop: false, async play() { this.paused = false; played.push(this); }, pause() { this.paused = true; }, removeAttribute() {}, load() {} });
        controller.speech.audioFactory = audioFactory; controller.audio.audioFactory = audioFactory;
        return { controller, requests, played, decode, process, emit };
    }
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    const eventSource = context.eventSource;
    // Exercise the browser's actual source pipeline while visibility reports hidden.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    try {
        await check('worker source discovery generates a silently replaced hidden POV without any main-page interval', async () => {
            const interval = window.setInterval; let h;
            try {
                window.setInterval = () => { throw new Error('Main-page intervals are unavailable'); };
                h = fixture('background-worker-clock', true);
            } finally { window.setInterval = interval; }
            const { controller, requests, played } = h;
            try {
                equal(controller.sourceMonitor.mode, 'worker');
                context.chat[0].mes = 'PRIVATE\n/////\nNina: "Hello."\nNina: "Ready."';
                await eventually(() => requests.length === 1 && controller.speech.job?.status === 'complete' && played.length === 1);
                assert(document.hidden && controller.root.hidden); assert(!controller.playback);
                controller.speech.audio.onended(); await pause(650); equal(played.length, 1);
            } finally { controller.dispose(); }
        });
        await check('Flowchart rerenders confirm and generate even when source worker notifications have stopped', async () => {
            const { controller, requests } = fixture('background-mutation-trigger', true);
            const worker = controller.sourceMonitor.worker, tick = worker.onmessage;
            worker.onmessage = () => worker.postMessage('received'); // Hold confirmations to isolate the DOM trigger.
            try {
                context.chat[0].mes = 'PRIVATE\n/////\nNina: "Hello."';
                const message = document.createElement('div'); message.className = 'mes_text'; message.textContent = 'Rerendered POV';
                document.querySelector('#chat .mes_block').append(message);
                await eventually(() => controller.settlingSource === controller.sourceFingerprint(context, 0));
                equal(requests.length, 0, 'A DOM notification bypassed the stability check');
                await eventually(() => controller.speech.job?.status === 'complete');
                equal(requests.length, 1); assert(controller.root.hidden);
            } finally { worker.onmessage = tick; controller.dispose(); }
        });
        await check('a missed ST completion event cannot leave hidden preparation blocked as generating', async () => {
            const { controller, requests, played, emit } = fixture('background-missed-completion', true); let generating = true;
            controller.host.isGenerating = () => generating;
            try {
                emit('GENERATION_STARTED', 'normal', {}, false);
                context.chat[0].mes = 'PRIVATE\n/////\nNina: "Hello."';
                await pause(700); equal(requests.length, 0); assert(controller.busy);
                generating = false; // No GENERATION_ENDED event; the source worker must recover it.
                await eventually(() => requests.length === 1 && controller.speech.job?.status === 'complete' && played.length === 1);
                assert(!controller.busy && controller.root.hidden && document.hidden);
            } finally { controller.dispose(); }
        });
        await check('browsing swipes and deleting messages only prepares voices, while an appended response may open VN', async () => {
            const { controller, requests, emit } = fixture('background-history-navigation', true);
            try {
                visibility(false);
                context.chat[0].mes = 'PRIVATE\n/////\nNina: "Old swipe."'; context.chat[0].swipe_id = 1;
                emit('MESSAGE_SWIPED', 0);
                await eventually(() => controller.speech.job?.status === 'complete'); equal(requests.length, 1); assert(controller.root.hidden);
                context.chat.push({ mes: 'PRIVATE\n/////\nNina: "Delete me."' }); controller.autoPresentation.reset(context);
                context.chat.pop(); emit('MESSAGE_DELETED');
                await pause(1100); assert(controller.root.hidden);
                visibility(true); context.chat[0].mes += '\nAn edited sentence.'; emit('MESSAGE_EDITED', 0);
                await eventually(() => controller.speech.job?.status === 'complete'); visibility(false);
                await pause(700); assert(controller.root.hidden, 'A deferred edit reopened VN');
                context.chat.push({ mes: 'PRIVATE\n/////\nNina: "A fresh reply."' }); emit('MESSAGE_RECEIVED', 1);
                await eventually(() => !controller.root.hidden && controller.selected === 1 && !!controller.playback);
            } finally { controller.dispose(); }
        });
        await check('a hidden new-response cue loads scene music and ambience, then pauses both after one voice', async () => {
            const { controller, requests, played } = fixture('background-cue-music', true);
            try {
                controller.audio.unlocked = true; controller.resolver.audio = async (kind, name) => `${kind}/${name}.mp3`;
                context.chat[0].mes = 'PRIVATE\n/////\n#MUSIC song\n#AMBIENT rain\nNina: "Hello."\nNina: "Wait here."';
                await eventually(() => controller.speech.playback?.status === 'playing' && !!controller.audio.channels.ambient.audio);
                const voice = controller.speech.audio, music = controller.audio.channels.music.audio, ambient = controller.audio.channels.ambient.audio;
                assert(!voice.paused && !music.paused && !ambient.paused); assert(music.volume > 0 && ambient.volume > 0);
                equal(music.src, 'music/song.mp3'); assert(controller.root.hidden && !controller.playback);
                equal(requests.length, 1); const count = played.length; voice.onended();
                assert(music.paused && ambient.paused); await pause(1100); equal(played.length, count);
            } finally { controller.dispose(); }
        });
        await check('background synthesis completes actual audio decoding and worker finishing before the tab returns', async () => {
            const { controller, decode, process, played } = fixture('background-audio-finishing', true);
            let requests = 0;
            controller.speech.decode = decode; controller.speech.process = process;
            const samples = Float32Array.from({ length: 44100 }, (_, index) => index > 4410 && index < 22050 ? Math.sin(index * .05) * .1 : 0);
            const bytes = wavBytes(samples); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
            controller.speech.endpoint = async path => {
                if (path === 'status') return Response.json({ configured: true, maxParallelBatches: 5 });
                requests++;
                return new Response(`data: ${JSON.stringify({ audio_base64: btoa(binary), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: [{ text: 'Hello', start: .1, end: .5 }] } })}\n\n`);
            };
            try {
                context.chat[0].mes = 'PRIVATE\n/////\nNina: "Hello."';
                await eventually(() => controller.speech.job?.status === 'complete' && played.length === 1);
                equal(requests, 1); assert(controller.root.hidden && document.hidden);
                assert(controller.speech.job.chapters[0].processed.results.size === 1);
            } finally { controller.dispose(); }
        });
        await check('a hidden tab announces one completed workflow line once without opening VN or advancing', async () => {
            const { controller, requests, played } = fixture('background-auto-open', true);
            try {
                controller.busy = true;
                context.chat[0].mes = 'PRIVATE\n/////\nYou listen.\nNina: "Hello."';
                await pause(650); equal(requests.length, 0); assert(controller.root.hidden);
                controller.busy = false;
                for (const source of ['PRIVATE', 'PRIVATE\n/////\n', 'PRIVATE\n/////\nNina: "Hello."\nNina: "Unfinished']) {
                    context.chat[0].mes = source; await controller.checkSource(); await controller.checkSource();
                    equal(requests.length, 0); assert(controller.root.hidden);
                }
                context.chat[0].mes = 'PRIVATE\n/////\nYou listen.\nNina: "Hello."';
                await eventually(() => controller.speech.job?.status === 'complete');
                await eventually(() => played.length === 1);
                assert(document.hidden && controller.root.hidden); equal(requests.length, 1);
                equal(controller.stage.nodes.size, 0);
                const voice = controller.speech.audio; voice.onended();
                await controller.open(); await controller.checkSource(); await pause(650);
                equal(played.length, 1); assert(!controller.playback, 'Background cue created a narrative playback loop');
                visibility(false); await eventually(() => !controller.root.hidden && !!controller.playback);
                equal(controller.root.querySelector('.vn-voice-ready').dataset.state, 'ready'); equal(requests.length, 1);
                await pause(1100); equal(requests.length, 1);
                controller.close(); await pause(1100); assert(controller.root.hidden, 'Explicit exit reopened unchanged output');
                visibility(true);
                context.chat.push({ mes: 'PRIVATE\n/////\nYou listen.\nNina: "Ready."' });
                await eventually(() => requests.length === 2 && controller.speech.job?.status === 'complete');
                await eventually(() => played.length === 2); assert(controller.root.hidden);
                visibility(false); await eventually(() => !controller.root.hidden && controller.root.querySelector('.vn-voice-ready').dataset.state === 'ready');
                equal(requests.length, 2); equal(context.chat[1].mes, 'PRIVATE\n/////\nYou listen.\nNina: "Ready."');
            } finally { controller.dispose(); }
        });
        await check('background voices prepare quietly with VN closed and opening it reuses the completed recording', async () => {
            const { controller, requests } = fixture('background-quiet-prepare', false);
            try {
                context.chat[0].mes = 'PRIVATE\n/////\nYou listen.\nNina: "Hello."';
                await eventually(() => controller.speech.job?.status === 'complete');
                assert(controller.root.hidden); equal(controller.stage.nodes.size, 0); equal(requests.length, 1);
                assert(!controller.speech.audio, 'Hidden preparation started audio playback');
                visibility(false); await pause(50); assert(controller.root.hidden, 'Automatic opening was disabled');
                await controller.open(); equal(requests.length, 1); assert(!controller.root.hidden);
                equal(controller.root.querySelector('.vn-voice-ready').dataset.state, 'ready');
            } finally { controller.dispose(); }
        });
        await check('a silent source replacement during deferred background preparation cannot generate stale voices', async () => {
            const { controller, requests } = fixture('background-stale-prepare', false);
            const prepare = controller.registry.prepare.bind(controller.registry); let release, first = true;
            controller.registry.prepare = async names => { if (first) { first = false; await new Promise(resolve => release = resolve); } return prepare(names); };
            try {
                context.chat[0].mes = 'PRIVATE\n/////\nNina: "Old."';
                await controller.checkSource(); const pending = controller.checkSource();
                await eventually(() => !!release); context.chat[0].mes = 'PRIVATE\n/////\nNina: "New."'; release(); await pending;
                equal(requests.length, 0);
                await controller.checkSource(); await controller.checkSource(); await eventually(() => controller.speech.job?.status === 'complete');
                equal(requests, ['<|speaker:0|>New.']); assert(controller.root.hidden);
            } finally { release?.(); controller.dispose(); }
        });
        await check('a hidden open VN keeps its POV loading state while preparing corrected text and displays it only after return', async () => {
            const { controller, requests, played } = fixture('background-open-incomplete', true);
            try {
                visibility(false);
                context.chat[0].mes = 'PRIVATE\n/////\nNina: "Hello."\nNina: "Unfinished';
                await controller.open(); equal(requests.length, 0); equal(controller.root.querySelector('.vn-status').dataset.phase, 'pov');
                assert(!controller.root.querySelector('.vn-status').hidden); assert(!controller.playback);
                const originalPosition = controller.playback?.position, originalRevision = controller.sceneSourceRevision;
                visibility(true);
                context.chat[0].mes = 'PRIVATE\n/////\nYou listen.\nNina: "Hello."';
                await eventually(() => controller.speech.job?.status === 'complete');
                await eventually(() => played.length === 1);
                equal(requests.length, 1); assert(!controller.root.hidden);
                equal(controller.playback?.position, originalPosition); equal(controller.sceneSourceRevision, originalRevision);
                visibility(false); await eventually(() => controller.sceneSourceRevision !== originalRevision);
                equal(requests.length, 1); equal(controller.playback.position, 0);
            } finally { controller.dispose(); }
        });
        await check('minimizing keeps music with the current voice and pauses scene loops when that one line ends', async () => {
            const { controller, requests, played } = fixture('background-pause-current', true);
            try {
                visibility(false); controller.audio.unlocked = true;
                controller.resolver.audio = async (kind, name) => `${kind}/${name}.mp3`;
                context.chat[0].mes = 'PRIVATE\n/////\n#MUSIC song\n#AMBIENT rain\nNina: "Hello."\nNina: "Stay here."';
                await controller.open(); await eventually(() => controller.speech.playback?.status === 'playing' && !!controller.audio.channels.music.audio);
                const voice = controller.speech.audio, music = controller.audio.channels.music.audio, ambient = controller.audio.channels.ambient.audio;
                voice.currentTime = .15; music.currentTime = 12.5; ambient.currentTime = 7;
                const position = controller.playback.position;
                controller.settings.autoAdvance = true;
                visibility(true); assert(!voice.paused && !music.paused && !ambient.paused);
                await controller.open(); // Duplicate host refresh must not restart or advance the current line.
                const count = played.length; await pause(650); equal(played.length, count); equal(controller.playback.position, position); equal(requests.length, 1);
                voice.onended(); assert(music.paused && ambient.paused); await pause(1400); await controller.open();
                equal(played.length, count); equal(controller.playback.position, position); assert(!controller.speech.audio);
                controller.settings.autoAdvance = false;
                visibility(false); await eventually(() => !music.paused && !ambient.paused);
                assert(controller.audio.channels.music.audio === music);
                equal(voice.currentTime, .15); equal(music.currentTime, 12.5); equal(ambient.currentTime, 7); equal(requests.length, 1);
            } finally { controller.dispose(); }
        });
        await check('a current line still loading at minimization plays once when ready and prepares the rest without playing it', async () => {
            const { controller, requests, played } = fixture('background-pending-current', true);
            const endpoint = controller.speech.endpoint; let release;
            controller.speech.endpoint = async (path, options) => {
                if (path === 'synthesize') await new Promise(resolve => release = resolve);
                return endpoint(path, options);
            };
            try {
                visibility(false); controller.settings.autoAdvance = true;
                context.chat[0].mes = 'PRIVATE\n/////\nNina: "Hello."\nNina: "Stay here."';
                await controller.open(); await eventually(() => !!release && !!controller.speech.pending);
                const position = controller.playback.position;
                visibility(true); release();
                await eventually(() => controller.speech.playback?.status === 'playing' && controller.speech.job?.status === 'complete');
                equal(played.length, 1); equal(requests.length, 1);
                const voice = controller.speech.audio; voice.onended();
                await controller.open(); await pause(1400);
                equal(controller.playback.position, position); equal(played.length, 1); assert(!controller.speech.audio);
                controller.settings.autoAdvance = false;
            } finally { release?.(); controller.dispose(); }
        });
        await check('minimizing an unvoiced narration beat does not skip ahead to a character voice', async () => {
            const { controller, played } = fixture('background-silent-current', true);
            try {
                visibility(false);
                context.chat[0].mes = 'PRIVATE\n/////\nYou listen.\nNina: "Hello."';
                await controller.open(); await eventually(() => controller.speech.job?.status === 'complete');
                const position = controller.playback.position; visibility(true);
                await controller.open(); await pause(650);
                equal(played.length, 0); equal(controller.playback.position, position);
            } finally { controller.dispose(); }
        });
        await check('automatic voice playback off also suppresses a hidden response completion cue', async () => {
            const { controller, played } = fixture('background-autoplay-disabled', true);
            try {
                controller.settings.tts.autoPlay = false;
                context.chat[0].mes = 'PRIVATE\n/////\nNina: "Hello."';
                await eventually(() => controller.speech.job?.status === 'complete');
                await controller.open(); equal(played.length, 0); assert(controller.root.hidden);
            } finally { controller.dispose(); }
        });
    } finally {
        context.eventSource = eventSource;
        if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor); else delete document.hidden;
    }
}
