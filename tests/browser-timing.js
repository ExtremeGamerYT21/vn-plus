export async function runTimingChecks({ check, assert, equal, eventually, context, mountChat, emit, makeController }) {
    context.chatId = 'timing'; context.chat = [];
    const controller = makeController();
    Object.assign(controller.settings, { autoAdvance: false, typewriterEffect: false, reducedMotion: true, interactiveArtifacts: true, characterSounds: false });
    const html = `<style>body{background:transparent}button{padding:20px}</style><button id="interact">Inspect object</button><output></output><script>
        VNPlus.ready.then(() => parent.postMessage({ timingFixture: 'ready' }, '*'));
        document.querySelector('button').onclick = () => document.querySelector('output').textContent = 'Object inspected';
        window.addEventListener('message', async event => { if (!event.data.timingRequest) return;
            try { parent.postMessage({ timingFixture: 'result', id: event.data.id, value: await VNPlus[event.data.method](...(event.data.args || [])) }, '*'); }
            catch(error) { parent.postMessage({ timingFixture: 'result', id: event.data.id, error: error.message }, '*'); }
        });
    </script>`;
    let frame, messages = [], count = 0, loads = 0;
    const listen = event => { if (event.data?.timingFixture && (event.source === frame?.contentWindow || event.source === controller.root.querySelector('.vn-visual iframe')?.contentWindow)) messages.push(event.data); };
    window.addEventListener('message', listen);
    controller.visuals.readLocal = async () => { loads++; return html; };
    const load = async script => {
        controller.close(); controller.settings.autoAdvance = false; messages = []; frame = null;
        context.chatId = `timing-${++count}`; context.chat = [{ mes: `PRIVATE\n/////\n${script}` }]; mountChat(); emit('CHAT_CHANGED'); await controller.open(0);
        frame = controller.root.querySelector('.vn-visual iframe');
        await eventually(() => { frame = controller.root.querySelector('.vn-visual iframe'); return frame && messages.some(item => item.timingFixture === 'ready'); });
    };
    const request = async (method, ...args) => {
        const id = crypto.randomUUID(); frame.contentWindow.postMessage({ timingRequest: true, id, method, args }, '*');
        await eventually(() => messages.some(item => item.id === id));
        const result = messages.find(item => item.id === id); if (result.error) throw new Error(result.error); return result.value;
    };
    try {
        await check('visual overlays preserve the same sandbox and interaction state across dialogue beats', async () => {
            await load('#VISUAL see_watch\nHenry: "Take your time."\nJason: "I see it."');
            const original = frame, opened = loads;
            assert(!controller.html.active); equal(controller.playback.timeline.beats[controller.playback.cursor].visualChecks, []);
            frame.contentWindow.postMessage({ timingRequest: true, id: 'initial', method: 'getScene' }, '*');
            await controller.action('next');
            equal(controller.root.querySelector('.vn-visual iframe'), original); equal(loads, opened); assert(!controller.html.active);
            assert(controller.root.querySelector('.vn-text').textContent.includes('I see it.'));
            equal(getComputedStyle(controller.visuals.layer).pointerEvents, 'none');
            equal(getComputedStyle(controller.visuals.items.get('see_watch').node).pointerEvents, 'auto');
        });
        await check('an open visual reads and writes message extra at the current paragraph rather than its opening paragraph', async () => {
            const data = await request('read'); equal(data.anchor.beat, controller.playback.cursor);
            const saved = await request('set', 'memo', 'continued while speaking'); equal(saved.data.memo, 'continued while speaking');
            const extra = context.chat[0].extra.vn_plus, events = extra.revisions[extra.revision].events;
            equal(events.at(-1).beat, controller.playback.cursor); equal(events.at(-1).artifact, 'see_watch');
        });
        await check('Auto progresses to reply with an interactive visual still open and never starts a Fish request', async () => {
            const original = frame; await controller.action('auto');
            await eventually(() => !controller.root.querySelector('.vn-reply').hidden);
            equal(controller.root.querySelector('.vn-visual iframe'), original); assert(!controller.html.active); assert(!controller.speech.job);
        });
        await check('a paired close stays attached to the spoken beat and waits for actual audio plus a hurried delay', async () => {
            const playBeat = controller.speech.playBeat;
            const playback = { status: 'playing', duration: 2, audio: { currentTime: 0 } };
            controller.speech.playBeat = beat => beat >= 0 ? playback : null;
            try {
                await load('#VISUAL see_watch\nYou inspect the watch.\nHenry: "We are leaving!" [calling]\n#VISUAL CLOSE see_watch [closes the watch quickly]\nYou turn toward your father.');
                assert(controller.timing.estimate.rule === 'object:watch'); await controller.action('next');
                const position = controller.playback.position; playback.audio.currentTime = 1.99; controller.timing.wake();
                assert(controller.visuals.items.has('see_watch')); equal(controller.playback.position, position);
                playback.status = 'ended'; controller.timing.wake();
                await eventually(() => !controller.visuals.items.has('see_watch'));
                equal(controller.playback.position, position); assert(controller.root.querySelector('.vn-text').textContent.includes('We are leaving!'));
            } finally { controller.speech.playBeat = playBeat; }
        });
        await check('manually closing an object preserves narrative position and cannot reopen it at the next paragraph', async () => {
            await load('#VISUAL see_watch\nHenry: "First."\nJason: "Second."');
            const position = controller.playback.position; controller.root.querySelector('.vn-visual [data-action="close-artifact"]').click();
            equal(controller.playback.position, position); assert(!controller.visuals.items.has('see_watch'));
            await controller.action('next'); assert(!controller.visuals.items.has('see_watch')); assert(!controller.html.active);
        });
        await check('visual-only turns wait for input even with Auto and multiple objects close independently', async () => {
            await load('#VISUAL see_watch\n#VISUAL newspaper');
            equal(controller.playback.restore().beat.token.type, 'interaction'); equal(controller.visuals.items.size, 2);
            await controller.action('auto'); assert(!controller.timing.estimate);
            const position = controller.playback.position;
            controller.root.querySelector('[data-visual-id="see_watch"] [data-action="close-artifact"]').click();
            equal(controller.playback.position, position); assert(!controller.visuals.items.has('see_watch')); assert(controller.visuals.items.has('newspaper'));
            assert(controller.root.querySelector('.vn-reply').hidden);
        });
        await check('exiting with a pending reaction cancels its timer and removes every visual and bridge', async () => {
            await load('#VISUAL see_watch\nHenry: "A long line with a delayed reaction."\n#VISUAL CLOSE see_watch [lazy]\nYou leave.');
            assert(controller.timing.options.commands.length === 1); controller.close();
            assert(!controller.timing.options); equal(controller.visuals.items.size, 0); equal(controller.root.querySelectorAll('.vn-visual iframe').length, 0);
        });
    } finally { controller.dispose(); window.removeEventListener('message', listen); }
    await check('Auto holds a completed beat for a full second while manual continuation stays immediate', async () => {
        context.chatId = 'autoplay-complete-delay'; context.chat = [{ mes: 'PRIVATE\n/////\nNina: "Hi."\nNina: "Next."' }]; mountChat();
        const next = makeController(); let now = 0, callback;
        Object.assign(next.settings, { autoAdvance: true, typewriterEffect: false, reducedMotion: true, autoCreateCharacters: false });
        next.settings.tts.enabled = false; next.settings.tts.autoGenerate = false;
        next.timing.now = () => now; next.timing.set = fn => { callback = fn; return 1; }; next.timing.clear = () => callback = null;
        const step = ms => { now += ms; const fn = callback; callback = null; fn?.(); };
        try {
            await next.open(0); await eventually(() => !next.dialogue.typing && next.root.querySelector('.vn-text').textContent.includes('Hi.'));
            step(300); equal(next.playback.position, 0); step(999); equal(next.playback.position, 0); step(1); equal(next.playback.position, 1);
            await eventually(() => !next.dialogue.typing && next.root.querySelector('.vn-text').textContent.includes('Next.'));
            step(500); equal(next.playback.position, 1); await next.action('next'); assert(!next.root.querySelector('.vn-reply').hidden);
        } finally { next.dispose(); }
    });
}
