import { runSceneLightChecks } from './browser-scene-light.js';
import { runMediaHistoryChecks } from './browser-media-history.js';
import { runDialogueAttributionChecks } from './browser-dialogue-attribution.js';
import { runDialogueSizeChecks } from './browser-dialogue-size.js';
import { runCastRetreatChecks } from './browser-cast-retreat.js';
import { runRelativeScaleChecks } from './browser-relative-scale.js';
import { runSilhouetteChecks } from './browser-silhouettes.js';
import { runQualityOfLifeChecks } from './browser-quality-of-life.js';

export async function runFramingChecks(options) {
    const { check, assert, equal, eventually, context, mountChat, makeController } = options;
    context.chatId = 'framing-check';
    context.chat = [{ mes: 'PRIVATE\n/////\n#MUSIC buzz\n#ENTER NoArtFraming\n#ENTER Nina\n#ENTER Ashley\nNina: "A spoken line." [happy]\nThe narrator describes the room.\nNina: "(A private thought.)" [sad]\nNina: "Speaking again." [sad]' }]; mountChat();
    const controller = makeController();
    Object.assign(controller.settings, { spriteFraming: 'bust', stageAlignment: 'bottom', typewriterEffect: false, reducedMotion: true, autoAdvance: false, autoCreateCharacters: false, layout: 'rows', bustScale: 1, bustHeight: 78, characters: { nina: { bustScale: .8 } } });
    controller.settings.tts.enabled = false; controller.settings.tts.autoGenerate = false;
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
    const near = (a, b) => assert(Math.abs(a - b) < 1, `${a} differs from ${b}`);
    const pick = (input, value) => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); };
    const toggle = mode => pick(controller.root.querySelector('[data-framing-picker]'), mode);
    let nina, shadow, ashley, shadowBefore, ninaBefore, frame, music, position, plays;
    try {
        await check('full-body framing anchors artwork at the viewport floor and preserves shadow size and baseline', async () => {
            await controller.audio.unlock(); await controller.open(0);
            await eventually(() => {
                nina = controller.stage.nodes.get('nina'); shadow = controller.stage.nodes.get('noartframing'); ashley = controller.stage.nodes.get('ashley');
                return nina?.dataset.sprite && ashley?.dataset.sprite && shadow?.classList.contains('vn-no-sprite') && controller.audio.channels.music.audio;
            });
            shadowBefore = rect(shadow.querySelector('.vn-fallback-figure')); ninaBefore = rect(nina);
            frame = controller.stage.sprites.records.get(nina).frame; music = controller.audio.channels.music.audio; plays = music.plays; position = controller.playback.position;
            toggle('full-body'); await eventually(() => nina.dataset.framing === 'full-body');
            near(rect(nina).bottom, innerHeight); near(rect(nina).height, ninaBefore.height);
            const after = rect(shadow.querySelector('.vn-fallback-figure')); for (const key of Object.keys(shadowBefore)) near(after[key], shadowBefore[key]);
            equal(shadow.dataset.framing, 'full-body');
            near(rect(ashley).bottom, innerHeight - controller.settings.rowRise * innerHeight / 100);
        });
        await check('toolbar and settings framing selectors synchronize without restarting playback artwork or music', async () => {
            const setting = controller.settingsPanel.querySelector('[data-setting="spriteFraming"]'); equal(setting.value, 'full-body');
            pick(setting, 'bust'); await eventually(() => nina.dataset.framing === 'bust');
            equal(controller.root.querySelector('[data-framing-picker]').value, 'bust'); near(rect(nina).bottom, ninaBefore.bottom);
            toggle('full-body'); await eventually(() => nina.dataset.framing === 'full-body'); equal(setting.value, 'full-body');
            assert(controller.stage.nodes.get('nina') === nina); assert(controller.stage.sprites.records.get(nina).frame === frame);
            assert(controller.audio.channels.music.audio === music); equal(music.plays, plays); equal(controller.playback.position, position);
        });
        await check('per-character X and Y offsets remain pixel shifts in full-body mode even on scaled artwork', async () => {
            const before = rect(nina); Object.assign(controller.settings.characters.nina, { offsetX: 24, offsetY: -18 }); controller.applyLayout();
            await eventually(() => nina.style.getPropertyValue('--vn-offset-x') === '24px');
            near(rect(nina).x - before.x, 24); near(rect(nina).y - before.y, -18); near(rect(nina).height, before.height);
            Object.assign(controller.settings.characters.nina, { offsetX: 0, offsetY: 0 }); controller.applyLayout();
        });
        await check('full-body artwork and fallback figures keep their feet anchored despite top alignment or custom stage clearance', async () => {
            controller.settings.stageAlignment = 'top'; controller.applyLayout();
            await eventually(() => shadow.style.top === 'auto'); near(rect(nina).bottom, innerHeight); near(rect(shadow).bottom, innerHeight);
            const topShadow = rect(shadow.querySelector('.vn-fallback-figure'));
            toggle('bust'); await eventually(() => nina.dataset.framing === 'bust');
            const sameShadow = rect(shadow.querySelector('.vn-fallback-figure')); for (const key of Object.keys(topShadow)) near(sameShadow[key], topShadow[key]);
            controller.settings.stageAlignment = 'bottom';
            controller.root.querySelector('.vn-stage').style.setProperty('--vn-stage-bottom', '130px'); toggle('full-body');
            await eventually(() => nina.dataset.framing === 'full-body'); near(rect(nina).bottom, innerHeight);
            near(rect(ashley).bottom, innerHeight - controller.settings.rowRise * innerHeight / 100);
            controller.root.querySelector('.vn-stage').style.removeProperty('--vn-stage-bottom');
        });
        await check('narration gently dims every character and shadow independently of the narrator voice toggle', async () => {
            assert(!controller.root.classList.contains('vn-narrating')); await controller.action('next');
            assert(controller.root.classList.contains('vn-narrating'));
            for (const node of controller.stage.nodes.values()) equal(getComputedStyle(node).filter, 'brightness(0.85)');
            toggle('bust'); toggle('full-body'); assert(controller.root.classList.contains('vn-narrating'));
            controller.settings.tts.narratorEnabled = true; controller.present(controller.playback.restore());
            for (const node of controller.stage.nodes.values()) equal(getComputedStyle(node).filter, 'brightness(0.85)');
            controller.settings.tts.narratorEnabled = false;
        });
        await check('thoughts and spoken dialogue restore normal character lighting after narration', async () => {
            await controller.action('next'); assert(!controller.root.classList.contains('vn-narrating'));
            equal(getComputedStyle(shadow).filter, 'brightness(1)'); assert(!shadow.classList.contains('vn-inactive'));
            assert(getComputedStyle(nina).filter !== 'brightness(0.85)');
            await controller.action('next'); assert(!controller.root.classList.contains('vn-narrating'));
            controller.close(); assert(!controller.root.classList.contains('vn-narrating'));
        });
        await check('failed artwork returns to a full-body fallback figure while full-body mode remains selected', async () => {
            const sprite = controller.resolver.sprite; controller.resolver.sprite = async () => null;
            controller.sceneRevision = null; await controller.open(0);
            await eventually(() => { const node = controller.stage.nodes.get('nina'); return node?.classList.contains('vn-no-sprite') && node.dataset.framing === 'full-body'; });
            const missing = controller.stage.nodes.get('nina'); equal(missing.dataset.framing, 'full-body'); equal(controller.settings.spriteFraming, 'full-body');
            near(rect(missing).bottom, innerHeight);
            controller.resolver.sprite = sprite;
        });
    } finally { controller.dispose(); }
    await runSceneLightChecks(options);
    await runMediaHistoryChecks(options);
    await runDialogueAttributionChecks(options);
    await runDialogueSizeChecks(options);
    await runCastRetreatChecks(options);
    await runRelativeScaleChecks(options);
    await runSilhouetteChecks(options);
    await runQualityOfLifeChecks(options);
}
