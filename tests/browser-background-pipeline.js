export async function runBackgroundPipelineChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    let hidden = true;
    const visibility = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
    function fixture(id, automaticPlayback) {
        hidden = true;
        context.chatId = id; context.chat = [{ mes: 'Canonical only.' }]; mountChat();
        const controller = makeController(), requests = [], played = [];
        Object.assign(controller.settings, { autoCreateCharacters: false, automaticPlayback, autoAdvance: false, typewriterEffect: false });
        controller.settings.characters.nina = { voiceId: 'background-nina' };
        Object.assign(controller.settings.tts, { enabled: true, autoGenerate: true, autoPlay: true, narratorEnabled: false });
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
        return { controller, requests, played };
    }
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    // Exercise the browser's actual source pipeline while visibility reports hidden.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    try {
        await check('a hidden tab prepares completed workflow voices without opening VN or playing audio until return', async () => {
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
                assert(document.hidden && controller.root.hidden); equal(requests.length, 1); equal(played.length, 0);
                equal(controller.stage.nodes.size, 0);
                visibility(false); await eventually(() => !controller.root.hidden && !!controller.playback);
                equal(controller.root.querySelector('.vn-voice-ready').dataset.state, 'ready'); equal(requests.length, 1);
                await pause(1100); equal(requests.length, 1);
                controller.close(); await pause(1100); assert(controller.root.hidden, 'Explicit exit reopened unchanged output');
                visibility(true);
                context.chat[0].mes = 'PRIVATE\n/////\nYou listen.\nNina: "Ready."';
                await eventually(() => requests.length === 2 && controller.speech.job?.status === 'complete');
                assert(controller.root.hidden); equal(played.length, 0);
                visibility(false); await eventually(() => !controller.root.hidden && controller.root.querySelector('.vn-voice-ready').dataset.state === 'ready');
                equal(requests.length, 2); equal(context.chat[0].mes, 'PRIVATE\n/////\nYou listen.\nNina: "Ready."');
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
        await check('a hidden open VN preserves its stage while preparing corrected text and displays it only after return', async () => {
            const { controller, requests, played } = fixture('background-open-incomplete', true);
            try {
                visibility(false);
                context.chat[0].mes = 'PRIVATE\n/////\nNina: "Hello."\nNina: "Unfinished';
                await controller.open(); equal(requests.length, 0); assert(controller.speech.status.includes('unfinished'));
                const originalPosition = controller.playback.position, originalRevision = controller.sceneSourceRevision;
                visibility(true);
                context.chat[0].mes = 'PRIVATE\n/////\nYou listen.\nNina: "Hello."';
                await eventually(() => controller.speech.job?.status === 'complete');
                equal(requests.length, 1); assert(!controller.root.hidden); equal(played.length, 0);
                equal(controller.playback.position, originalPosition); equal(controller.sceneSourceRevision, originalRevision);
                visibility(false); await eventually(() => controller.sceneSourceRevision !== originalRevision);
                equal(requests.length, 1); equal(controller.playback.position, 0);
            } finally { controller.dispose(); }
        });
        await check('minimizing pauses current voice music and ambience while returning resumes the same sources and positions', async () => {
            const { controller, requests, played } = fixture('background-pause-current', true);
            try {
                visibility(false); controller.audio.unlocked = true;
                controller.resolver.audio = async (kind, name) => `${kind}/${name}.mp3`;
                context.chat[0].mes = 'PRIVATE\n/////\n#MUSIC song\n#AMBIENT rain\nNina: "Hello."';
                await controller.open(); await eventually(() => controller.speech.playback?.status === 'playing' && !!controller.audio.channels.music.audio);
                const voice = controller.speech.audio, music = controller.audio.channels.music.audio, ambient = controller.audio.channels.ambient.audio;
                voice.currentTime = .15; music.currentTime = 12.5; ambient.currentTime = 7;
                const position = controller.playback.position;
                visibility(true); assert(voice.paused && music.paused && ambient.paused);
                await controller.open(); // Duplicate host refresh while hidden must not replay the paused line.
                const count = played.length; await pause(650); equal(played.length, count); equal(controller.playback.position, position); equal(requests.length, 1);
                visibility(false); await eventually(() => !voice.paused && !music.paused && !ambient.paused);
                assert(controller.speech.audio === voice && controller.audio.channels.music.audio === music);
                equal(voice.currentTime, .15); equal(music.currentTime, 12.5); equal(ambient.currentTime, 7); equal(requests.length, 1);
            } finally { controller.dispose(); }
        });
    } finally {
        if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor); else delete document.hidden;
    }
}
