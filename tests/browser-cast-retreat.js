export async function runCastRetreatChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    context.chatId = 'cast-retreat';
    context.chat = [{ mes: 'PRIVATE\n/////\n#MUSIC buzz\n#ENTER Nina\n#ENTER Ashley\n#ENTER NoArtRetreat\nNina: "Here." [happy]\nAshley: "One." [angry]\nAshley: "Two."\nAshley: "Three."\nAshley: "Four."\nAshley: "Five."\nAshley: "Six."\nAshley: "Seven."\nAshley: "Eight."\nNin: "Back."' }]; mountChat();
    const controller = makeController();
    Object.assign(controller.settings, { autoAdvance: false, typewriterEffect: false, reducedMotion: false, spriteBreathing: false, spriteBlinking: false, autoCreateCharacters: false, characters: { nina: { aliases: ['Nin'] } }, layout: 'rows', spriteFraming: 'bust', sceneLightEnabled: false, environmentCss: false });
    controller.settings.tts.enabled = false; controller.settings.tts.autoGenerate = false;
    let nina, frame, music, shadow;
    const push = async text => { context.chat.push({ mes: `PRIVATE\n/////\n${text}` }); mountChat(); await controller.open(context.chat.length - 1); };
    const alone = async () => { await push(Array.from({ length: 5 }, (_, index) => 'Ashley: "Alone ' + index + '."').join('\n')); };
    const finishGrace = async () => { for (let beat = 2; beat <= 5; beat++) await controller.action('next'); };
    try {
        await check('quiet busts hold position brightness and opacity for four beats before retreating, then speaking restores their body and expression', async () => {
            await controller.open(0); await eventually(() => controller.stage.nodes.get('nina')?.dataset.sprite && controller.audio.channels.music.audio);
            nina = controller.stage.nodes.get('nina'); shadow = controller.stage.nodes.get('noartretreat'); music = controller.audio.channels.music.audio;
            frame = controller.stage.sprites.records.get(nina).frame;
            const start = Number.parseFloat(nina.style.left); let previous = start, light = 1;
            for (let beat = 1; beat <= 8; beat++) {
                await controller.action('next'); equal(nina.dataset.silentBeats, String(beat));
                const x = Number.parseFloat(nina.style.left), brightness = Number(nina.style.getPropertyValue('--vn-quiet-brightness'));
                if (beat <= 4) { equal(x, start); equal(brightness, 1); equal(nina.style.getPropertyValue('--vn-quiet-opacity'), '1'); assert(!nina.classList.contains('vn-inactive')); }
                else { assert(x < previous); assert(brightness < light); }
                previous = x; light = brightness;
                assert(controller.stage.sprites.records.get(nina).frame === frame); equal(nina.dataset.expression, 'happy');
            }
            assert(Number.parseFloat(controller.stage.nodes.get('ashley').style.left) < 90);
            await controller.action('next'); equal(nina.style.left, `${start}%`); equal(nina.dataset.presence, 'active'); equal(nina.dataset.expression, 'happy');
            assert(controller.stage.sprites.records.get(nina).frame === frame); assert(controller.audio.channels.music.audio === music);
        });
        await check('absent characters keep four complete grace beats before departure and returning aliases cancel pending removal', async () => {
            await alone();
            for (let beat = 1; beat <= 4; beat++) { assert(controller.stage.nodes.get('nina') === nina); assert(!nina.classList.contains('vn-departing')); equal(nina.dataset.silentBeats, String(beat)); await controller.action('next'); }
            assert(!controller.stage.nodes.has('nina')); assert(!controller.stage.nodes.has('noartretreat'));
            if (!controller.stage.sprites.reduced) {
                assert(nina.isConnected); assert(nina.classList.contains('vn-departing')); equal(nina.getAttribute('aria-hidden'), 'true');
                equal(nina.dataset.expression, 'happy'); equal(controller.stage.sprites.records.get(nina).suspended, true);
                assert(controller.stage.sprites.records.get(nina).frame === frame);
                await push('Nin: "Returned."\nAshley: "Welcome back."');
                assert(controller.stage.nodes.get('nina') === nina); assert(!nina.classList.contains('vn-departing')); assert(!controller.stage.departures.has('nina'));
                equal(nina.dataset.expression, 'happy'); assert(controller.stage.sprites.records.get(nina).frame === frame);
            }
            assert(controller.audio.channels.music.audio === music);
        });
        await check('departures release sprite resources and cold opens never revive cast whose earlier grace elapsed', async () => {
            await alone(); await finishGrace(); await eventually(() => !nina.isConnected && !shadow.isConnected);
            assert(!controller.stage.sprites.records.has(nina)); equal(controller.stage.departures.size, 0);
            await push('Ashley: "Still alone."');
            controller.close(); await controller.open(); equal([...controller.stage.nodes.keys()], ['ashley']);
            equal(controller.playback.restore().beat.state.characters.nina.present, false);
        });
        await check('reduced motion keeps the four-beat grace and closing cancels every pending exit', async () => {
            controller.settings.reducedMotion = true; await push('Nin: "Here."\nAshley: "Here too."');
            const current = controller.stage.nodes.get('nina'); await alone(); assert(current.isConnected); await finishGrace(); assert(!current.isConnected); equal(controller.stage.departures.size, 0);
            controller.settings.reducedMotion = false; await push('Nin: "Again."'); await alone(); await finishGrace();
            controller.close(); equal(controller.stage.departures.size, 0); equal(controller.stage.sprites.records.size, 0); equal(controller.root.querySelectorAll('.vn-character').length, 0);
        });
    } finally { controller.dispose(); }
}
