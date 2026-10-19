export async function runDialogueEmotionChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const source = 'PRIVATE\n/////\nNina: "A normal line." [neutral]\nNina: "Stop doing that." [anger]\nNina: "[shouting] **GET** OUT!" [angry]\nNina: "I thought you would stay." [sadness]\nNina: "You mean everything to me." [loving]\nNina: "A normal line again." [neutral]';
    context.chatId = 'emotion-typography'; context.chat = [{ mes: source }]; mountChat();
    const controller = makeController();
    Object.assign(controller.settings, { reducedMotion: false, autoAdvance: false, autoCreateCharacters: false, typewriterEffect: false, textEffects: true, environmentCss: false, letterSpacing: 1 });
    Object.assign(controller.settings.tts, { enabled: false, autoGenerate: false });
    const text = controller.root.querySelector('.vn-text');
    const size = () => parseFloat(getComputedStyle(text).fontSize);
    const pattern = () => controller.dialogue.letters.map(letter => ['x', 'y', 'angle', 'duration', 'delay'].map(key => letter.style.getPropertyValue(`--vn-letter-${key}`)));
    let baseline, scattered;
    try {
        await check('canonical anger has per-letter jitter with independent phases and ordinary spaces and word wrapping', async () => {
            await controller.open(0); baseline = size(); await controller.action('next');
            assert(text.classList.contains('vn-text-jitter')); assert(text.querySelectorAll('.vn-text-word').length > 1);
            const letters = [...text.querySelectorAll('.vn-letter:not(.vn-space)')];
            assert(new Set(letters.map(letter => letter.style.getPropertyValue('--vn-letter-delay'))).size > 3);
            if (!matchMedia('(prefers-reduced-motion: reduce)').matches) assert(getComputedStyle(letters[0]).animationName.includes('vn-letter-jitter'));
            for (const space of text.querySelectorAll('.vn-space')) equal(getComputedStyle(space).animationName, 'none');
        });
        await check('inline shouting produces larger spread rotated lettering while preserving emphasis and repeatable placement', async () => {
            await controller.action('next'); assert(size() > baseline * 1.2);
            assert(text.classList.contains('vn-text-scatter') && text.classList.contains('vn-shout') && text.classList.contains('vn-text-jitter'));
            assert(parseFloat(getComputedStyle(text).letterSpacing) > 1); equal(text.textContent, '"GET OUT!"'); equal(text.querySelector('strong').textContent, 'GET');
            scattered = pattern(); assert(new Set(scattered.map(value => value[2]).filter(Boolean)).size > 3);
            await controller.action('back'); await controller.action('next'); equal(pattern(), scattered);
            controller.dialogue.layout.fit(); equal(pattern(), scattered);
        });
        await check('sadness is visibly smaller and love glows through the parchment theme without replacing character text colours', async () => {
            await controller.action('next'); assert(size() <= baseline * .81); assert(!text.classList.contains('vn-text-jitter'));
            controller.settings.environmentCss = true;
            controller.environmentStyle.read = () => fetch('../examples/harry-potter/dialogue.css').then(response => response.text());
            controller.environmentStyle.readSettings = async () => null; await controller.loadEnvironmentStyle();
            await controller.action('next'); assert(text.classList.contains('vn-text-love'));
            assert(getComputedStyle(text.querySelector('.vn-letter')).textShadow !== 'none');
            equal(getComputedStyle(text.querySelector('.vn-letter')).color, getComputedStyle(text).color);
            await controller.action('next'); assert(!text.classList.contains('vn-text-love') && !text.classList.contains('vn-text-scatter'));
            equal(getComputedStyle(text.querySelector('.vn-letter')).textShadow, 'none'); equal(pattern().flat().filter(Boolean).length, 0);
        });
        await check('reduced motion keeps static emotion styling while effects off restores ordinary text and source stays unchanged', async () => {
            controller.settings.reducedMotion = true;
            await controller.dialogue.render({ type: 'dialogue', character: 'Nina', emotion: 'angry, shouting', text: '"Listen!"' });
            assert(!text.classList.contains('vn-text-jitter')); assert(text.classList.contains('vn-text-scatter')); assert(size() > baseline);
            await controller.dialogue.render({ type: 'dialogue', character: 'Nina', emotion: 'love', text: '"Dear friend."' }); assert(text.classList.contains('vn-text-love'));
            controller.settings.textEffects = false;
            await controller.dialogue.render({ type: 'dialogue', character: 'Nina', emotion: 'angry, shouting, love', text: '"Ordinary."' });
            for (const name of ['vn-text-jitter', 'vn-text-scatter', 'vn-text-love', 'vn-shout']) assert(!text.classList.contains(name));
            equal(size(), baseline); equal(context.chat[0].mes, source);
        });
    } finally { controller.dispose(); }

    await check('scattered angry lettering follows real voice word timestamps and skip retains its deterministic placement', async () => {
        const source = 'PRIVATE\n/////\nNina: "[shouting] Hello **friend**." [angry]';
        context.chatId = 'emotion-voice-clock'; context.chat = [{ mes: source }]; mountChat();
        const controller = makeController(), requests = [];
        Object.assign(controller.settings, { reducedMotion: false, typewriterEffect: true, typewriterSpeed: 5, textEffects: true, autoAdvance: false, autoCreateCharacters: false, environmentCss: false });
        Object.assign(controller.settings.tts, { enabled: true, autoGenerate: true, autoPlay: true, syncText: true, narratorEnabled: false });
        controller.settings.characters.nina = { voiceId: 'emotion-test-nina' };
        controller.speech.endpoint = async (path, options) => {
            if (path === 'status') return Response.json({ configured: true, maxParallelBatches: 5 });
            requests.push(JSON.parse(options.body).body.text);
            return new Response(`data: ${JSON.stringify({ audio_base64: btoa('fake audio'), chunk_seq: 0, chunk_audio_offset_sec: 0,
                alignment: { segments: [{ text: 'Hello', start: .2, end: .4 }, { text: 'friend', start: .6, end: .8 }] } })}\n\n`);
        };
        controller.speech.decode = async () => new Float32Array(44100);
        controller.speech.process = async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, samples: new Float32Array(44100), notes: [] }));
        controller.speech.audioFactory = () => ({ currentTime: 0, paused: true, async play() { this.paused = false; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} });
        const visible = () => controller.dialogue.letters.filter(letter => letter.style.visibility !== 'hidden').map(letter => letter.textContent).join('');
        try {
            await controller.open(0); await eventually(() => controller.speech.playback?.status === 'playing');
            const text = controller.root.querySelector('.vn-text'), before = controller.dialogue.letters.map(letter => letter.style.getPropertyValue('--vn-letter-angle'));
            assert(text.classList.contains('vn-text-jitter') && text.classList.contains('vn-text-scatter')); equal(requests.length, 1);
            controller.speech.audio.currentTime = .21; await eventually(() => visible() === '"Hello ');
            assert(controller.dialogue.typing); controller.dialogue.skip(); equal(visible(), '"Hello friend."');
            equal(controller.dialogue.letters.map(letter => letter.style.getPropertyValue('--vn-letter-angle')), before);
            equal(context.chat[0].mes, source); assert(!text.textContent.includes('[shouting]'));
        } finally { controller.dispose(); }
    });
}
