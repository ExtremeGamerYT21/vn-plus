import { SpriteMeshRenderer } from '../renderers/sprite-mesh.js';
import { sceneLight, LIGHT_DEFAULTS } from '../core/scene-light.js';

export async function runSceneLightChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const savedLight = Object.fromEntries(Object.keys(LIGHT_DEFAULTS).map(key => [key, context.extensionSettings.visual_novel_plus[key]]));
    const header = time => `[3 August 1991 | Before First Year | ${time} | Summer | Lighting test]`;
    const source = `${header('06:00')}\nPRIVATE\n/////\n#BACKGROUND kitchen\n#MUSIC buzz\n#VISUAL light-probe\nNina: "At dawn." [happy]\n${header('12:00')}\nNina: "At noon." [happy]`;
    context.chatId = 'scene-light-browser'; context.chat = [{ mes: source }]; mountChat();
    const controller = makeController(), messages = [];
    let properties = { inside: false }, probe;
    Object.assign(controller.settings, { sceneLightEnabled: false, sceneLightNormalMaps: false, reducedMotion: true, spriteBreathing: false, autoCreateCharacters: false, interactiveArtifacts: true, typewriterEffect: false, autoAdvance: false });
    controller.settings.tts.enabled = false; controller.settings.tts.autoGenerate = false;
    controller.resolver.backgroundProperties = async () => structuredClone(properties);
    controller.contextResolver.backgroundProperties = async () => structuredClone(properties);
    controller.readArtifact = async () => `<output id="light">waiting</output><script>(async()=>{await VNPlus.ready;const report=light=>{document.querySelector('output').textContent=JSON.stringify(light);parent.postMessage({fixture:'scene-light',light},'*')};VNPlus.onLighting(report);report(await VNPlus.getLighting());})();</script>`;
    const receive = event => { if (event.source === probe?.contentWindow && event.data?.fixture === 'scene-light') messages.push(event.data.light); };
    window.addEventListener('message', receive);
    const setting = (key, value) => { const input = controller.settingsPanel.querySelector(`[data-setting="${key}"]`); input.checked = value; input.dispatchEvent(new Event('change', { bubbles: true })); };
    let node, frame, music, shadow;
    try {
        await check('2D normal-mapped light is opt-in and enabling it preserves the current frame music and beat', async () => {
            await controller.audio.unlock(); await controller.open(0);
            await eventually(() => controller.stage.nodes.get('nina')?.dataset.sprite && controller.audio.channels.music.audio && controller.visuals.items.get('light-probe')?.node.querySelector('iframe'));
            node = controller.stage.nodes.get('nina'); frame = controller.stage.sprites.records.get(node).frame;
            probe = controller.visuals.items.get('light-probe').node.querySelector('iframe');
            music = controller.audio.channels.music.audio; const plays = music.plays, position = controller.playback.position;
            assert(!controller.root.classList.contains('vn-2d-light')); assert(!frame.querySelector('canvas'));
            setting('sceneLightEnabled', true);
            await eventually(() => frame.classList.contains('vn-sprite-meshed') && controller.sceneVariables.lighting?.light?.enabled);
            assert(controller.stage.nodes.get('nina') === node); assert(controller.stage.sprites.records.get(node).frame === frame);
            assert(controller.audio.channels.music.audio === music); equal(music.plays, plays); equal(controller.playback.position, position);
            equal(controller.stage.sprites.frameId, null); equal(getComputedStyle(controller.root.querySelector('.vn-stage')).filter, 'none');
            assert(controller.root.querySelector('.vn-top').style.filter.includes('url('));
            equal(controller.sceneVariables.lighting.light.renderer, '2d');
        });
        await check('unchanged light and typewriter spans reuse cached shading without full HUD passes or sprite redraws', async () => {
            const lighting = controller.stage.lightRenderer, mesh = controller.stage.sprites.mesh;
            await eventually(() => lighting.frame === undefined && !controller.stage.sprites.records.get(node).loads.size);
            const surface = mesh.surfaces.get(frame), passes = surface.lightingPasses, draws = surface.draws;
            let paints = 0; const paint = lighting.paint; lighting.paint = function() { paints++; return paint.call(this); };
            try {
                for (let i = 0; i < 30; i++) {
                    lighting.update(structuredClone(lighting.light));
                    const span = document.createElement('span'); span.textContent = 'x'; controller.root.querySelector('.vn-dialogue').append(span);
                }
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                equal(paints, 0); equal(surface.lightingPasses, passes); equal(surface.draws, draws);
                assert(surface.litTextures.size <= 2); equal(controller.stage.sprites.frameId, null);
            } finally { lighting.paint = paint; }
        });
        await check('an already open sandbox receives changing light coordinates without reloading or parent access', async () => {
            await eventually(() => messages.some(light => light.enabled && light.kind === 'sun'));
            const dawn = messages.find(light => light.enabled && light.kind === 'sun'); equal(dawn.position.x, .06); equal(dawn.color, '#ff9955');
            equal(dawn.renderer, '2d'); assert(Number.isFinite(dawn.direction.x) && Number.isFinite(dawn.direction.y));
            assert(dawn.artifact.width > 0); assert(dawn.viewport.width > 0);
            await controller.action('next');
            await eventually(() => messages.some(light => light.position?.x === .5 && light.color === '#fffdf5'));
            assert(controller.visuals.items.get('light-probe').node.querySelector('iframe') === probe);
            await eventually(() => context.chat[0].extra.vn_plus.playback?.lighting.light?.color === '#fffdf5');
            equal(context.chat[0].mes, source);
        });
        await check('background overrides are shared with extra and artifacts and do not depend on indoor story time', async () => {
            properties = { inside: true, light: { position: { x: .8, y: .1, z: .7 }, color: '#f0ba70', intensity: .75, ambient: .3 } };
            controller.present(controller.playback.restore());
            await eventually(() => controller.sceneVariables.lighting?.light?.color === '#f0ba70');
            equal(controller.sceneVariables.lighting.light.position, properties.light.position);
            await eventually(() => messages.some(light => light.inside && light.color === '#f0ba70'));
            await eventually(() => context.chat[0].extra.vn_plus.playback?.lighting.light?.color === '#f0ba70');
            equal(context.chat[0].extra.vn_plus.playback.lighting.light.position, properties.light.position);
        });
        await check('static artifacts receive fallback shading while bridge-enabled objects retain control of their own lighting', async () => {
            controller.html.open({ type: 'artifact', interactive: false, html: '<h1>A static note</h1>' });
            const staticFrame = controller.root.querySelector(':scope > .vn-artifact iframe');
            await eventually(() => staticFrame?.style.filter.includes('url(')); equal(probe.style.filter, '');
            assert(staticFrame.getAttribute('sandbox') === ''); controller.html.close();
        });
        await check('HUD lighting can be disabled separately and repeatedly restores original theme shadows and filters', async () => {
            const top = controller.root.querySelector('.vn-top'), button = controller.root.querySelector('[data-action="next"]');
            const light = controller.stage.lightRenderer.light;
            for (let i = 0; i < 8; i++) controller.stage.lightRenderer.update(light);
            shadow = button.style.boxShadow; assert(shadow.length < 600, 'Relighting accumulated its own shadows');
            setting('sceneLightHud', false); await eventually(() => !top.style.filter);
            equal(button.style.boxShadow, ''); assert(frame.querySelector('canvas'));
            setting('sceneLightHud', true); await eventually(() => !!top.style.filter);
            assert(button.style.boxShadow.length < 600);
            setting('sceneLightEnabled', false); await eventually(() => !frame.querySelector('canvas'));
            equal(top.style.filter, ''); equal(button.style.boxShadow, ''); assert(!controller.root.classList.contains('vn-2d-light'));
            assert(controller.audio.channels.music.audio === music);
        });
        await check('closed-VN context reconstruction publishes authored lighting without starting a hidden renderer', async () => {
            controller.close(); setting('sceneLightEnabled', true);
            await eventually(() => context.chat[0].extra.vn_plus.context?.lighting?.light?.color === '#f0ba70');
            equal(context.chat[0].extra.vn_plus.context.lighting.light.position, properties.light.position);
            assert(controller.root.hidden); equal(controller.stage.nodes.size, 0); equal(controller.stage.sprites.frameId, null);
        });
    } finally { window.removeEventListener('message', receive); controller.dispose(); }

    await check('async expression maps reject obsolete loads and blink frames inherit available open-eye maps', async () => {
        const makeImage = color => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96; const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 96, 96); return canvas.toDataURL(); };
        const first = makeImage('#b07a63'), second = makeImage('#708ba4'), blink = makeImage('#69849a'), normal = makeImage('rgb(128,128,255)'), material = makeImage('rgb(255,220,0)');
        context.chatId = 'lighting-map-loads'; context.chat = [{ mes: 'PRIVATE\n/////\nNina: "First." [happy]\nNina: "Second." [sad]' }]; mountChat();
        const next = makeController();
        Object.assign(next.settings, { sceneLightEnabled: true, sceneLightNormalMaps: true, reducedMotion: false, spriteBreathing: false, spriteBlinking: true, autoCreateCharacters: false, typewriterEffect: false, autoAdvance: false });
        next.settings.tts.enabled = false; let release;
        next.resolver.sprite = async (_id, emotions) => emotions[0] === 'happy' ? first : second;
        next.resolver.blinkSprite = async () => blink;
        next.resolver.spriteMaps = url => url === first ? new Promise(resolve => release = () => resolve({ normal, material })) : Promise.resolve(url === second ? { normal, material } : {});
        try {
            await next.open(0); await eventually(() => !!release);
            const node = next.stage.nodes.get('nina'), old = next.stage.sprites.records.get(node).frame;
            await next.action('next');
            await eventually(() => next.stage.sprites.records.get(node).frame !== old && next.stage.sprites.records.get(node).frame.dataset.normalMap === 'true');
            release(); const record = next.stage.sprites.records.get(node), current = record.frame;
            await eventually(() => current.querySelector('.vn-sprite-blink') && next.stage.sprites.mesh.materials.get(current)?.get(current.querySelector('.vn-sprite-blink')));
            assert(!next.stage.sprites.mesh.materials.get(old)?.get(old.querySelector('.vn-sprite-open'))?.normal, 'An obsolete map load entered the outgoing expression');
            next.stage.sprites.blink(node);
            equal(current.dataset.blinking, 'true'); equal(current.dataset.normalMap, 'true'); equal(current.dataset.materialMap, 'true');
            assert(next.stage.sprites.mesh.surfaces.get(current).image === current.querySelector('.vn-sprite-blink'));
            const surface = next.stage.sprites.mesh.surfaces.get(current), passes = surface.lightingPasses;
            next.stage.sprites.stopBlink(record); next.stage.sprites.blink(node);
            equal(surface.lightingPasses, passes); equal(surface.litTextures.size, 2);
            equal(next.stage.sprites.frameId, null);
        } finally { next.dispose(); }
    });
    await check('cached GPU normal and material maps follow a 2D direction and retain transparent edges', async () => {
        const frame = document.createElement('div'); frame.className = 'vn-sprite-frame'; frame.style.cssText = 'position:fixed;left:100px;top:100px;width:96px;height:96px;max-height:none'; document.body.append(frame);
        const image = async (color, inset = 0) => {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
            const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(inset, inset, 96 - inset * 2, 96 - inset * 2);
            const result = new Image(); result.src = canvas.toDataURL(); await result.decode(); return result;
        };
        const albedo = await image('#777777', 8); albedo.className = 'vn-sprite-open'; frame.append(albedo);
        const flat = await image('rgb(128,128,255)'), left = await image('rgb(25,128,204)'), matte = await image('rgb(255,255,0)'), polished = await image('rgb(255,20,255)');
        const renderer = new SpriteMeshRenderer(), config = { amount: 0, centerX: .5, centerY: .5 };
        try {
            assert(renderer.enable(frame), 'WebGL was unavailable for lighting checks');
            const rect = frame.getBoundingClientRect(), center = { x: (rect.left + rect.width / 2) / innerWidth, y: (rect.top + rect.height / 2) / innerHeight };
            const light = { ...sceneLight({ minutes: 720 }, false, { ...LIGHT_DEFAULTS, sceneLightEnabled: true }), position: { x: center.x - 1.5, y: center.y, z: .4 }, ambient: .15 };
            const pixel = () => renderer.surfaces.get(frame).context.getImageData(48, 48, 1, 1).data;
            renderer.setMaps(frame, albedo, { normal: flat, material: matte }); assert(renderer.draw(frame, config, 0, light)); const flatValue = pixel()[0];
            renderer.setMaps(frame, albedo, { normal: left, material: matte }); assert(renderer.draw(frame, config, 0, light)); assert(pixel()[0] > flatValue + 12, 'Normals did not face the light');
            equal(renderer.surfaces.get(frame).context.getImageData(0, 0, 1, 1).data[3], 0);
            const surface = renderer.surfaces.get(frame), passes = surface.lightingPasses, draws = surface.draws;
            renderer.draw(frame, config, 0, { ...light, position: { ...light.position, z: 99 } });
            equal(surface.lightingPasses, passes); equal(surface.draws, draws);
            for (let step = 1; step <= 60; step++) renderer.draw(frame, { ...config, amount: .016 }, step / 60, light);
            equal(surface.lightingPasses, passes); equal(surface.draws, draws + 60);
            assert(surface.litTextures.size === 1, 'Breathing accumulated cached textures');
            const overhead = { ...light, color: '#ffffff', position: { ...center, z: 1 } };
            renderer.setMaps(frame, albedo, { normal: flat, material: matte }); renderer.draw(frame, config, 0, overhead); const dull = pixel()[0];
            renderer.setMaps(frame, albedo, { normal: flat, material: polished }); renderer.draw(frame, config, 0, overhead); assert(pixel()[0] !== dull, 'Packed roughness/metallic map had no effect');
            renderer.draw(frame, config, 0, { ...overhead, enabled: false }); assert(Math.abs(pixel()[0] - 119) <= 1, 'Disabled lighting altered original artwork');
            equal(surface.litTextures.size, 0);
            const marker = document.createElement('canvas'); marker.width = marker.height = 96;
            const ctx = marker.getContext('2d'); ctx.fillStyle = '#cc0000'; ctx.fillRect(8, 8, 80, 40); ctx.fillStyle = '#0000cc'; ctx.fillRect(8, 48, 80, 40);
            const tagged = new Image(); tagged.src = marker.toDataURL(); await tagged.decode(); tagged.className = 'vn-sprite-open'; albedo.replaceWith(tagged);
            renderer.setMaps(frame, tagged, { normal: flat, material: matte }); renderer.draw(frame, config, 0, overhead);
            const top = surface.context.getImageData(48, 24, 1, 1).data, bottom = surface.context.getImageData(48, 72, 1, 1).data;
            assert(top[0] > top[2] + 50 && bottom[2] > bottom[0] + 50, 'Cached lighting inverted sprite orientation');
            equal(surface.litTextures.size, 1);
            const cachedPasses = surface.lightingPasses; frame.style.width = '128px'; renderer.draw(frame, config, 0, overhead);
            equal(surface.lightingPasses, cachedPasses + 1); equal(surface.litTextures.size, 1);
        } finally { renderer.dispose(); frame.remove(); }
    });
    Object.assign(context.extensionSettings.visual_novel_plus, savedLight);
}
