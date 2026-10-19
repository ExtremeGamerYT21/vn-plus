import { createSilhouette } from '../renderers/silhouette.js';

export async function runSilhouetteChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const source = 'PRIVATE\n/////\n#ENTER Man\n#ENTER Woman\n#ENTER Boy\n#ENTER Girl\nMan: "Here we are."';
    context.chatId = 'full-body-standins'; context.chat = [{ mes: source }]; mountChat();
    const controller = makeController();
    Object.assign(controller.settings, { autoCreateCharacters: false, autoAdvance: false, typewriterEffect: false, reducedMotion: true,
        spriteFraming: 'bust', layout: 'separate', bustScale: 1, characters: {}, missingAsset: 'placeholder', sceneLightEnabled: false });
    Object.assign(controller.settings.tts, { enabled: false, autoGenerate: false });
    const original = controller.resolver.sprite.bind(controller.resolver), node = id => controller.stage.nodes.get(id);
    controller.resolver.sprite = async () => null;
    const scale = id => Number(node(id).style.getPropertyValue('--vn-scale'));
    let state, figures;
    try {
        await check('missing art uses distinct bundled full-body charcoal figures with transparent antialiased edges', async () => {
            await controller.open(0); await eventually(() => controller.stage.nodes.size === 4);
            state = structuredClone(controller.playback.restore().beat.state);
            figures = new Map(['man', 'woman', 'boy', 'girl'].map(id => [id, node(id).querySelector('.vn-fallback-figure')]));
            const signatures = [];
            for (const type of ['man', 'woman', 'boy', 'girl', 'neutral', 'child']) {
                const figure = figures.get(type) || createSilhouette(type, { type, label: type }).querySelector('.vn-fallback-figure');
                assert(figure.style.backgroundImage.includes(`/fallback-figures/${type}.png`)); equal(figure.getAttribute('role'), 'img');
                const image = new Image(); image.src = figure.style.backgroundImage.slice(5, -2); await image.decode();
                equal(image.naturalWidth, 768); equal(image.naturalHeight, 1536);
                const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let solid = 0, smooth = 0, brightness = 0; const tones = new Set();
                for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i + 3] === 255) { solid++; tones.add(pixels[i]); brightness = Math.max(brightness, pixels[i]); }
                    else if (pixels[i + 3] > 0) smooth++;
                }
                equal(pixels[3], 0); assert(solid > 100000); assert(smooth > 1000); assert(brightness <= 80 && brightness > 40, `${type} should remain a dark charcoal shadow (${brightness})`); assert(tones.size > 20);
                signatures.push(`${solid}/${smooth}`);
                if (figures.has(type)) {
                    equal(node(type).dataset.silhouette, type); equal(node(type).dataset.framing, 'full-body');
                    assert(Math.abs(figure.getBoundingClientRect().bottom - innerHeight) < 1);
                }
            }
            equal(new Set(signatures).size, 6);
        });
        await check('default man woman boy and girl scales preserve their exact ratios through shared cast zoom', async () => {
            equal(scale('man'), 1); equal(scale('woman'), .95); equal(scale('boy'), .6); equal(scale('girl'), .5);
            const height = id => figures.get(id).getBoundingClientRect().height;
            assert(Math.abs(height('woman') / height('man') - .95) < .001);
            assert(Math.abs(height('boy') / height('man') - .6) < .001); assert(Math.abs(height('girl') / height('man') - .5) < .001);
            await controller.stage.render(state, 4); for (const [id, figure] of figures) assert(node(id).querySelector('.vn-fallback-figure') === figure);
        });
        await check('explicit properties change fallback shape or scale without rebuilding unchanged figures or editing messages', async () => {
            controller.settings.characters.man = { bustScale: 1.2 }; controller.settings.characters.girl = { silhouette: 'woman', bustScale: .7 };
            await controller.stage.render(state, 4); equal(scale('man'), 1.2); equal(scale('girl'), .7); equal(node('girl').dataset.silhouette, 'woman');
            assert(node('man').querySelector('.vn-fallback-figure') === figures.get('man')); assert(node('girl').querySelector('.vn-fallback-figure') !== figures.get('girl'));
            equal(context.chat[0].mes, source); controller.settings.characters = {};
        });
        await check('resolved artwork keeps its authored size and failed artwork restores inferred full-body sizing and cached fallback artwork', async () => {
            const artwork = await original('nina', ['happy'], {}); assert(artwork);
            controller.resolver.sprite = async id => id === 'boy' ? artwork : null;
            // Change the expression to invalidate the intentionally missing resolver result.
            state.characters.boy.expression = 'happy'; await controller.stage.render(state, 4);
            assert(!node('boy').classList.contains('vn-no-sprite')); equal(scale('boy'), 1); equal(node('boy').dataset.framing, 'bust');
            controller.resolver.sprite = async () => null; state.characters.boy.expression = 'default'; await controller.stage.render(state, 4);
            equal(scale('boy'), .6); equal(node('boy').dataset.framing, 'full-body'); assert(node('boy').querySelector('.vn-fallback-figure') === figures.get('boy'));
        });
        await check('fallback labels are safe text and hidden missing figures do not contribute to cast zoom', async () => {
            const name = '<img src=x onerror="throw 1">', sample = createSilhouette(name); controller.root.append(sample);
            assert(!sample.querySelector('img,script')); equal(sample.querySelector('.vn-silhouette-name').textContent, name); sample.remove();
            controller.settings.missingAsset = 'hide'; await controller.stage.render(state, 4);
            for (const id of figures.keys()) equal(getComputedStyle(node(id)).visibility, 'hidden');
            equal(controller.root.querySelector('.vn-stage').style.getPropertyValue('--vn-cast-zoom'), '1');
            controller.close(); equal(controller.stage.nodes.size, 0);
        });
    } finally { controller.dispose(); }
}
