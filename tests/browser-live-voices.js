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
}
