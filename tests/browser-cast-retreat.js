export async function runCastRetreatChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    context.chatId = 'cast-retreat';
    context.chat = [{ mes: 'PRIVATE\n/////\n#MUSIC buzz\n#ENTER Nina\n#ENTER Ashley\n#ENTER NoArtRetreat\nNina: "Here." [happy]\nAshley: "One." [angry]\nAshley: "Two."\nAshley: "Three."\nAshley: "Four."\nNin: "Back."' }]; mountChat();
    const controller = makeController();
    Object.assign(controller.settings, { autoAdvance: false, typewriterEffect: false, reducedMotion: false, spriteBreathing: false, spriteBlinking: false, autoCreateCharacters: false, characters: { nina: { aliases: ['Nin'] } }, layout: 'rows', spriteFraming: 'bust', sceneLightEnabled: false, environmentCss: false });
    controller.settings.tts.enabled = false; controller.settings.tts.autoGenerate = false;
    let nina, frame, music, shadow;
    const push = async text => { context.chat.push({ mes: `PRIVATE\n/////\n${text}` }); mountChat(); await controller.open(context.chat.length - 1); };
    try {
        await check('quiet busts retreat outward and darken across beats, then speaking restores the same body and expression', async () => {
            await controller.open(0); await eventually(() => controller.stage.nodes.get('nina')?.dataset.sprite && controller.audio.channels.music.audio);
            nina = controller.stage.nodes.get('nina'); shadow = controller.stage.nodes.get('noartretreat'); music = controller.audio.channels.music.audio;
            frame = controller.stage.sprites.records.get(nina).frame;
            const start = Number.parseFloat(nina.style.left); let previous = start, light = 1;
            for (let beat = 1; beat <= 4; beat++) {
                await controller.action('next'); equal(nina.dataset.silentBeats, String(beat));
                const x = Number.parseFloat(nina.style.left), brightness = Number(nina.style.getPropertyValue('--vn-quiet-brightness'));
                assert(x < previous); assert(brightness < light); previous = x; light = brightness;
                assert(controller.stage.sprites.records.get(nina).frame === frame); equal(nina.dataset.expression, 'happy');
            }
            assert(Number.parseFloat(controller.stage.nodes.get('ashley').style.left) < 90);
            await controller.action('next'); equal(nina.style.left, `${start}%`); equal(nina.dataset.presence, 'active'); equal(nina.dataset.expression, 'happy');
            assert(controller.stage.sprites.records.get(nina).frame === frame); assert(controller.audio.channels.music.audio === music);
        });
        await check('absent characters depart with their last artwork and returning aliases cancel pending removal', async () => {
            await push('Ashley: "Only me."'); assert(!controller.stage.nodes.has('nina')); assert(!controller.stage.nodes.has('noartretreat'));
            if (!controller.stage.sprites.reduced) {
                assert(nina.isConnected && shadow.isConnected); assert(nina.classList.contains('vn-departing')); equal(nina.getAttribute('aria-hidden'), 'true');
                equal(nina.dataset.expression, 'happy'); equal(controller.stage.sprites.records.get(nina).suspended, true);
                assert(controller.stage.sprites.records.get(nina).frame === frame);
                await push('Nin: "Returned."\nAshley: "Welcome back."');
                assert(controller.stage.nodes.get('nina') === nina); assert(!nina.classList.contains('vn-departing')); assert(!controller.stage.departures.has('nina'));
                equal(nina.dataset.expression, 'happy'); assert(controller.stage.sprites.records.get(nina).frame === frame);
            }
            assert(controller.audio.channels.music.audio === music);
        });
        await check('departures release sprite resources and cold opens never stage characters absent from the message', async () => {
            await push('Ashley: "Alone again."'); await eventually(() => !nina.isConnected && !shadow.isConnected);
            assert(!controller.stage.sprites.records.has(nina)); equal(controller.stage.departures.size, 0);
            controller.close(); await controller.open(); equal([...controller.stage.nodes.keys()], ['ashley']);
            equal(controller.playback.restore().beat.state.characters.nina.present, false);
        });
        await check('reduced motion removes absent busts immediately and closing cancels every pending exit', async () => {
            controller.settings.reducedMotion = true; await push('Nin: "Here."\nAshley: "Here too."');
            const current = controller.stage.nodes.get('nina'); await push('Ashley: "Quiet."'); assert(!current.isConnected); equal(controller.stage.departures.size, 0);
            controller.settings.reducedMotion = false; await push('Nin: "Again."'); await push('Ashley: "Goodbye."');
            controller.close(); equal(controller.stage.departures.size, 0); equal(controller.stage.sprites.records.size, 0); equal(controller.root.querySelectorAll('.vn-character').length, 0);
        });
    } finally { controller.dispose(); }
}
