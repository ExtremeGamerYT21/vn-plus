export async function runDialogueTagChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const source = 'PRIVATE\n/////\nNina: "[laugh] Hello [cough], **friend**!" [happy]\n\nNARRATION\n[sigh] You wait.';
    context.chatId = 'dialogue-display-tags'; context.chat = [{ mes: source }]; mountChat();
    const controller = makeController();
    Object.assign(controller.settings, { autoAdvance: false, autoCreateCharacters: false, typewriterEffect: false });
    Object.assign(controller.settings.tts, { enabled: false, autoGenerate: false });
    controller.settings.characters.nina = { voiceId: 'dialogue-tag-nina' };
    try {
        await check('performance tags are hidden in dialogue and narration while emphasis emotions and source remain intact', async () => {
            await controller.open(0);
            const text = controller.root.querySelector('.vn-text');
            equal(text.textContent, '"Hello, friend!"'); equal(text.querySelector('strong').textContent, 'friend');
            assert(controller.playback.restore().beat.token.text.includes('[laugh]'));
            equal(controller.playback.restore().beat.token.emotion, 'happy');
            await controller.action('next'); equal(text.textContent, 'You wait.'); equal(context.chat[0].mes, source);
        });
    } finally { controller.dispose(); }

    await check('hidden inline tags stay in the Fish request and the visible text follows word times without displaying tag characters', async () => {
        context.chatId = 'dialogue-tag-clock';
        const source = 'PRIVATE\n/////\nNina: "[laugh] Hello [cough] friend." [happy]';
        context.chat = [{ mes: source }]; mountChat();
        const controller = makeController(), requests = [];
        Object.assign(controller.settings, { autoAdvance: false, autoCreateCharacters: false, typewriterEffect: true, reducedMotion: false, typewriterSpeed: 5 });
        Object.assign(controller.settings.tts, { enabled: true, autoGenerate: true, autoPlay: true, narratorEnabled: false, syncText: true });
        controller.settings.characters.nina = { voiceId: 'dialogue-tag-nina' };
        controller.speech.endpoint = async (path, options) => {
            if (path === 'status') return Response.json({ configured: true, maxParallelBatches: 5 });
            requests.push(JSON.parse(options.body).body.text);
            const payload = { audio_base64: btoa('fake audio'), chunk_seq: 0, chunk_audio_offset_sec: 0,
                alignment: { segments: [{ text: 'Hello', start: .2, end: .4 }, { text: 'friend', start: .6, end: .8 }] } };
            return new Response(`data: ${JSON.stringify(payload)}\n\n`);
        };
        controller.speech.decode = async () => new Float32Array(44100);
        controller.speech.process = async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, samples: new Float32Array(44100), notes: [] }));
        controller.speech.audioFactory = () => ({ currentTime: 0, paused: true, async play() { this.paused = false; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} });
        try {
            await controller.open(0); await eventually(() => controller.speech.playback?.status === 'playing');
            assert(requests[0].includes('[laughing]')); assert(requests[0].includes('[coughing]')); assert(requests[0].includes('[happy]'));
            equal(controller.root.querySelector('.vn-text').textContent, '"Hello friend."');
            const visible = () => controller.dialogue.letters.filter(letter => letter.style.visibility !== 'hidden').map(letter => letter.textContent).join('');
            controller.speech.audio.currentTime = .21; await eventually(() => visible() === '"Hello ');
            assert(controller.dialogue.typing, 'Tag removal replaced word timing with estimated typing');
            controller.speech.audio.currentTime = .61; await eventually(() => !controller.dialogue.typing);
            equal(visible(), '"Hello friend."'); assert(!visible().includes('[')); equal(context.chat[0].mes, source);
        } finally { controller.dispose(); }
    });
}
