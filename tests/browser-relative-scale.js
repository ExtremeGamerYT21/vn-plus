export async function runRelativeScaleChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    context.chatId = 'relative-cast-scale';
    context.chat = [{ mes: 'PRIVATE\n/////\n#MUSIC buzz\n#ENTER Nina\n#ENTER Ashley\nNina: "Together."' }]; mountChat();
    const controller = makeController();
    Object.assign(controller.settings, { reducedMotion: true, autoAdvance: false, typewriterEffect: false, autoCreateCharacters: false,
        spriteBreathing: false, spriteBlinking: false, sceneLightEnabled: false, layout: 'rows', spriteFraming: 'bust', bustScale: 1, bustHeight: 78,
        missingAsset: 'placeholder', characters: { nina: { bustScale: 2 }, ashley: { bustScale: 2 }, small: { bustScale: .5 } } });
    controller.settings.tts.enabled = false; controller.settings.tts.autoGenerate = false;
    const height = id => controller.stage.nodes.get(id).getBoundingClientRect().height;
    const near = (actual, expected) => assert(Math.abs(actual - expected) < 1, `${actual} differs from ${expected}`);
    const zoom = () => Number(controller.root.querySelector('.vn-stage').style.getPropertyValue('--vn-cast-zoom'));
    let state, nina, frame, baseline, music, plays;
    try {
        await check('equally large characters normalize to regular size without changing their authored properties', async () => {
            await controller.audio.unlock(); await controller.open(0);
            await eventually(() => controller.stage.nodes.get('nina')?.dataset.sprite && controller.stage.nodes.get('ashley')?.dataset.sprite && controller.audio.channels.music.audio);
            state = structuredClone(controller.playback.restore().beat.state);
            nina = controller.stage.nodes.get('nina'); frame = controller.stage.sprites.records.get(nina).frame;
            music = controller.audio.channels.music.audio; plays = music.plays; baseline = height('nina');
            equal(zoom(), .5); near(baseline, innerHeight * .78); near(height('ashley'), baseline);
            equal(controller.registry.get('nina').bustScale, 2);
        });
        await check('a small entrant zooms the same cached large busts up and preserves four-to-one proportions and row depth', async () => {
            state.characters.small = { id: 'small', name: 'Small', slot: 2, present: true, expression: 'default' };
            await controller.stage.render(state, 3);
            assert(zoom() > .5); assert(height('nina') > baseline); assert(height('small') < baseline);
            near(height('nina'), height('small') / controller.settings.rowDepthScale * 4);
            assert(controller.stage.nodes.get('nina') === nina); assert(controller.stage.sprites.records.get(nina).frame === frame);
            assert(controller.audio.channels.music.audio === music); equal(music.plays, plays);
        });
        await check('removing the small entrant restores framing and an all-small cast is normal sized in either layout or framing mode', async () => {
            delete state.characters.small; await controller.stage.render(state, 3); near(height('nina'), baseline);
            controller.settings.characters.nina.bustScale = .5; controller.settings.characters.ashley.bustScale = .5;
            for (const layout of ['rows', 'separate']) for (const framing of ['bust', 'full-body']) {
                controller.settings.layout = layout; controller.settings.spriteFraming = framing;
                await controller.stage.render(state, 2); equal(zoom(), 2); near(height('nina'), baseline); near(height('ashley'), baseline);
                assert(controller.stage.sprites.records.get(nina).frame === frame);
            }
        });
        await check('hidden player narrator absent characters and hidden missing art never change the visible cast zoom', async () => {
            controller.settings.showPlayerBust = false; controller.settings.missingAsset = 'hide';
            for (const [id, slot] of [['jason', 2], ['narrator', 3], ['absent', 4], ['missing', 5]]) {
                controller.settings.characters[id] = { bustScale: 100 };
                state.characters[id] = { id, name: id, slot, present: id !== 'absent', expression: 'default' };
            }
            await controller.stage.render(state, 6); equal(zoom(), 2); near(height('nina'), baseline);
            assert(!controller.stage.nodes.has('jason') && !controller.stage.nodes.has('narrator') && !controller.stage.nodes.has('absent'));
            equal(getComputedStyle(controller.stage.nodes.get('missing')).visibility, 'hidden');
            state.speaker = 'ashley'; await controller.stage.render(state, 6); equal(zoom(), 2);
        });
        await check('cast zoom transitions respect reduced motion and closing releases its shared value', async () => {
            controller.settings.reducedMotion = false; await controller.stage.render(state, 6);
            if (!controller.stage.sprites.reduced) assert(getComputedStyle(nina).transitionProperty.includes('transform'));
            controller.settings.reducedMotion = true; await controller.stage.render(state, 6);
            equal(getComputedStyle(nina).transitionDuration, '0s');
            controller.close(); equal(controller.root.querySelector('.vn-stage').style.getPropertyValue('--vn-cast-zoom'), '');
        });
    } finally { controller.dispose(); }
}
