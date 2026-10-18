export async function runBackgroundPipelineChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    function fixture(id, automaticPlayback) {
        context.chatId = id; context.chat = [{ mes: 'Canonical only.' }]; mountChat();
        const controller = makeController(), requests = [];
        Object.assign(controller.settings, { autoCreateCharacters: false, automaticPlayback, autoAdvance: false, typewriterEffect: false });
        controller.settings.characters.nina = { voiceId: 'background-nina' };
        Object.assign(controller.settings.tts, { enabled: true, autoGenerate: true, autoPlay: false, narratorEnabled: false });
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
        return { controller, requests };
    }
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    // Exercise the browser's actual source pipeline while visibility reports hidden.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    try {
        await check('an unfocused tab waits for complete silent workflow output then opens VN and prepares voices automatically', async () => {
            const { controller, requests } = fixture('background-auto-open', true);
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
                assert(document.hidden && !controller.root.hidden); equal(requests.length, 1);
                equal(controller.root.querySelector('.vn-voice-ready').dataset.state, 'ready');
                await pause(1100); equal(requests.length, 1);
                controller.close(); await pause(1100); assert(controller.root.hidden, 'Explicit exit reopened unchanged output');
                context.chat[0].mes = 'PRIVATE\n/////\nYou listen.\nNina: "Ready."';
                await eventually(() => requests.length === 2 && controller.speech.job?.status === 'complete');
                assert(!controller.root.hidden); equal(context.chat[0].mes, 'PRIVATE\n/////\nYou listen.\nNina: "Ready."');
            } finally { controller.dispose(); }
        });
        await check('background voices prepare quietly with VN closed and opening it reuses the completed recording', async () => {
            const { controller, requests } = fixture('background-quiet-prepare', false);
            try {
                context.chat[0].mes = 'PRIVATE\n/////\nYou listen.\nNina: "Hello."';
                await eventually(() => controller.speech.job?.status === 'complete');
                assert(controller.root.hidden); equal(controller.stage.nodes.size, 0); equal(requests.length, 1);
                assert(!controller.speech.audio, 'Hidden preparation started audio playback');
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
        await check('an already open background VN waits for unfinished text and resumes automatic voices after completion', async () => {
            const { controller, requests } = fixture('background-open-incomplete', true);
            try {
                context.chat[0].mes = 'PRIVATE\n/////\nNina: "Hello."\nNina: "Unfinished';
                await controller.open(); equal(requests.length, 0); assert(controller.speech.status.includes('unfinished'));
                context.chat[0].mes = 'PRIVATE\n/////\nYou listen.\nNina: "Hello."';
                await eventually(() => controller.speech.job?.status === 'complete');
                equal(requests.length, 1); assert(!controller.root.hidden);
            } finally { controller.dispose(); }
        });
    } finally {
        if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor); else delete document.hidden;
    }
}
