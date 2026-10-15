import { VNController } from '../controller.js';
import { createHost } from '../integration.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { isolatedDocument } from '../renderers/html-renderer.js';
import { SpriteMeshRenderer, breathingConfig } from '../renderers/sprite-mesh.js';
import { DEFAULT_ENVIRONMENT } from '../core/content-environments.js';
import { encodeMP3 } from '../core/speech-mp3.js';
import { decodeChapter, wavBytes } from '../core/speech-pcm.js';
import { SAMPLE_RATE } from '../core/speech-segments.js';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message = 'Assertion failed') => { if (!value) throw new Error(message); };
const equal = (a, b) => assert(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const eventually = async (predicate, message = 'State did not become ready') => { for (let i = 0; i < 200; i++) { if (predicate()) return; await pause(20); } throw new Error(message); };
const inventory = await fetch('../assets.json').then(response => response.json());
const listeners = new Map(), events = ['GENERATION_STARTED','GENERATION_ENDED','GENERATION_STOPPED','MESSAGE_RECEIVED','MESSAGE_SWIPED','MESSAGE_UPDATED','MESSAGE_EDITED','MESSAGE_SWIPE_DELETED','CHARACTER_MESSAGE_RENDERED','MESSAGE_DELETED','CHAT_CHANGED','CHAT_LOADED','MORE_MESSAGES_LOADED','APP_READY'];
let sends = 0, retries = 0;
const initial = `SECRET_CANONICAL_DO_NOT_RENDER\n#BACKGROUND secret\n/////\n#BACKGROUND kitchen\n#MUSIC buzz\n#AMBIENT outside_noise\n#ENTER Jason\n#ENTER Ashley\n#ENTER Nina\n#ENTER Leyley\nASHLEY: "Hello." [smug]\n#BACKGROUND street\n#SFX door\nNINA: "Ready?" [excited]\n\`\`\`html\n<div><h1>Letter</h1><script>parent.document.body.dataset.compromised='yes'</script></div>\n\`\`\`\nNARRATION\nAfter artifact`;
const context = {
    characterId: 0, chatId: 'A', chat: [{ mes: initial, swipe_id: 0 }, { mes: 'User', is_user: true }],
    extensionSettings: { visual_novel_plus: { ...structuredClone(DEFAULT_SETTINGS), typewriterEffect: false, characterSounds: false, reducedMotion: true, dialogueFont: 'faustina', characters: { jason: { assetFolder: 'andrew', color: '#78c976' } } } },
    eventTypes: Object.fromEntries(events.map(name => [name, name])), saveSettingsDebounced() {},
    eventSource: { on(name, callback) { const set = listeners.get(name) || new Set(); set.add(callback); listeners.set(name, set); }, removeListener(name, callback) { listeners.get(name)?.delete(callback); } },
    async generate(type) { assert(type === 'regenerate'); retries++; },
};
const emit = (name, ...args) => { for (const callback of [...(listeners.get(name) || [])]) callback(...args); };
document.querySelector('#send_but').addEventListener('click', () => { sends++; document.querySelector('#send_textarea').value = ''; });
function mountChat() { document.querySelector('#chat').innerHTML = context.chat.map((message, index) => `<div class="mes" mesid="${index}"><div class="mes_block"><div class="mes_buttons"></div></div></div>`).join(''); }
mountChat();
let controller = new VNController(createHost(() => context, { localContent: false }), new URL('../', import.meta.url), inventory);
class FakeAudio { constructor() { this.volume = 1; this.paused = true; } async play() { this.paused = false; } pause() { this.paused = true; } removeAttribute() {} load() {} }
controller.audio.audioFactory = () => new FakeAudio();
let failures = 0, passes = 0;
async function check(name, run) {
    const row = document.createElement('li');
    try { await run(); passes++; row.className = 'pass'; row.textContent = `PASS · ${name}`; }
    catch (error) { failures++; row.className = 'fail'; row.textContent = `FAIL · ${name}: ${error.message}`; console.error(name, error); }
    document.querySelector('#test-results').append(row);
}
await check('POV privacy and four characters from one scenario', async () => {
    await controller.open(0); await pause(200);
    assert(!controller.root.textContent.includes('SECRET_CANONICAL'));
    equal(controller.root.querySelectorAll('.vn-character').length, 4);
    equal(controller.playback.restore().beat.state.characters.jason.slot, 0);
    assert(controller.root.querySelector('[data-character="ashley"] img').src.includes('/ashley/'));
    equal(controller.root.querySelector('.vn-dialogue').style.getPropertyValue('--vn-accent'), controller.registry.get('ashley').color);
    const widths = [...controller.root.querySelectorAll('.vn-character')].map(node => node.style.width); assert(widths.every(width => width === widths[0]));
});
await check('backward restores background, expression and audio state', async () => {
    const first = structuredClone(controller.playback.restore().beat.state);
    await controller.action('next'); await pause(100);
    assert(controller.root.querySelector('.vn-background').style.backgroundImage.includes('street'));
    assert(controller.root.querySelector('[data-character="nina"] img').src.includes('/excited.webp'));
    await controller.action('back'); await pause(100);
    equal(controller.playback.restore().beat.state, first);
    assert(controller.root.querySelector('.vn-background').style.backgroundImage.includes('kitchen'));
    equal(controller.audio.channels.music.track.name, 'buzz'); equal(controller.audio.channels.ambient.track.name, 'outside_noise');
});
await check('grouped rows keep the player left and rear busts smaller and higher', async () => {
    const jason = controller.root.querySelector('[data-character="jason"]'), ashley = controller.root.querySelector('[data-character="ashley"]');
    const nina = controller.root.querySelector('[data-character="nina"]'), leyley = controller.root.querySelector('[data-character="leyley"]');
    equal(jason.dataset.side, 'left'); equal(ashley.dataset.side, 'right'); equal(nina.dataset.depth, '1'); equal(leyley.dataset.depth, '1');
    assert(parseFloat(nina.style.left) > parseFloat(jason.style.left)); assert(parseFloat(leyley.style.left) < parseFloat(ashley.style.left));
    assert(parseFloat(nina.style.bottom) > parseFloat(jason.style.bottom)); assert(Number(nina.style.zIndex) < Number(jason.style.zIndex));
    equal(Number(nina.style.getPropertyValue('--vn-scale')), (controller.registry.get('nina').bustScale || 1) * .95);
});
await check('VN music mute button preserves selection and leaves ambience independent', async () => {
    const music = controller.audio.channels.music.audio, ambient = controller.audio.channels.ambient.audio;
    controller.root.querySelector('[data-action="mute-music"]').click(); assert(music.muted); assert(!ambient.muted);
    equal(controller.audio.channels.music.audio, music); equal(controller.audio.channels.music.track.name, 'buzz');
    equal(controller.root.querySelector('[data-action="mute-music"]').textContent, 'Unmute music');
    equal(controller.root.querySelector('[data-action="mute-music"]').getAttribute('aria-pressed'), 'true');
    controller.root.querySelector('[data-action="mute-music"]').click(); assert(!music.muted);
});
await check('both layout selectors synchronize and switch live without restarting the scene', async () => {
    const picker = controller.root.querySelector('[data-layout-picker]'), settingsPicker = document.querySelector('[data-setting="layout"]');
    equal([...picker.options].map(option => option.textContent), ['Left and right groups', 'Four separate busts']);
    const cursor = controller.playback.cursor, music = controller.audio.channels.music.audio;
    const nodes = [...controller.stage.nodes.values()];
    picker.value = 'separate'; picker.dispatchEvent(new Event('change', { bubbles: true })); await pause(50);
    equal(controller.settings.layout, 'separate'); equal(settingsPicker.value, 'separate'); equal(context.extensionSettings.visual_novel_plus.layout, 'separate');
    equal([...controller.stage.nodes.values()].map(node => parseFloat(node.style.left)).sort((a,b)=>a-b), [12.5,37.5,62.5,87.5]);
    assert([...controller.stage.nodes.values()].every(node => node.style.bottom === '0vh' && node.dataset.depth === '0'));
    equal(controller.playback.cursor, cursor); assert(controller.audio.channels.music.audio === music);
    assert([...controller.stage.nodes.values()].every((node,index)=>node === nodes[index]));
    settingsPicker.value = 'rows'; settingsPicker.dispatchEvent(new Event('change', { bubbles: true })); await pause(50);
    equal(picker.value, 'rows'); assert(controller.root.querySelector('[data-character="nina"]').style.bottom !== '0vh');
    equal(controller.playback.cursor, cursor); assert(controller.audio.channels.music.audio === music);
});
await check('environment selectors isolate content/profiles and preserve the selected paragraph', async () => {
    const picker = controller.root.querySelector('[data-environment-picker]'), settingsPicker = controller.settingsPanel.querySelector('[data-setting="environment"]');
    equal([...picker.options].map(option => option.textContent), ['The Coffin of Andy and Leyley', 'Harry Potter', 'Re:Zero']);
    const originalChat = JSON.stringify(context.chat), oldMusic = controller.audio.channels.music.audio;
    controller.settings.characters.nina = { breathing: { centerX: .3, centerY: .6 } }; controller.settingsChanged('breathingCenter');
    await controller.action('next'); equal(controller.playback.position, 1);
    picker.value = 'harry-potter'; picker.dispatchEvent(new Event('change', { bubbles: true }));
    await eventually(() => controller.environment.id === 'harry-potter' && controller.playback?.position === 1);
    await Promise.all([...controller.stage.sprites.records.values()].map(record => record.pending));
    equal(settingsPicker.value, 'harry-potter'); equal(context.extensionSettings.visual_novel_plus.environment, 'harry-potter');
    equal(controller.root.querySelectorAll('.vn-character img').length, 0); equal(controller.root.querySelector('.vn-background').style.backgroundImage, '');
    assert(oldMusic.paused); equal(controller.audio.sources.size, 0); assert(controller.resolver.base.href.endsWith('/environments/harry-potter/'));
    equal(controller.registry.get('nina').boxTexture, undefined); equal(controller.root.querySelector('.vn-dialogue').style.backgroundImage, '');
    equal(controller.root.querySelector('.vn-text').style.fontFamily, 'inherit');
    equal(JSON.parse(controller.settingsPanel.querySelector('[aria-label="Character registry JSON"]').value), {});
    const editor = controller.settingsPanel.querySelector('[aria-label="Character registry JSON"]');
    editor.value = JSON.stringify({ nina: { color: '#abcdef', breathing: { centerX: .8 } } });
    [...controller.settingsPanel.querySelectorAll('button')].find(button => button.textContent === 'Apply registry').click();
    await eventually(() => controller.playback?.position === 0); await controller.action('next');
    settingsPicker.value = 're-zero'; settingsPicker.dispatchEvent(new Event('change', { bubbles: true }));
    await eventually(() => controller.environment.id === 're-zero' && controller.playback?.position === 1);
    equal(controller.settings.characters, {}); equal(picker.value, 're-zero');
    picker.value = DEFAULT_ENVIRONMENT; picker.dispatchEvent(new Event('change', { bubbles: true }));
    await eventually(() => controller.environment.id === DEFAULT_ENVIRONMENT && controller.playback?.position === 1);
    await eventually(() => controller.root.querySelector('[data-character="nina"] img')?.src.includes('/excited.webp'));
    equal(controller.registry.get('nina').breathing.centerX, .3); equal(controller.settings.environmentProfiles['harry-potter'].characters.nina.color, '#abcdef');
    assert(controller.root.querySelector('.vn-text').style.fontFamily.includes(`vn-${DEFAULT_ENVIRONMENT}-`));
    await eventually(() => controller.audio.channels.music.audio?.src.includes(`/environments/${DEFAULT_ENVIRONMENT}/`));
    assert(controller.audio.channels.music.audio !== oldMusic); equal(JSON.stringify(context.chat), originalChat);
    delete controller.settings.characters.nina; controller.settingsChanged('breathingCenter'); await controller.action('back');
});
await check('environment switching cancels old sprite, preview and audio loads', async () => {
    const oldResolver = controller.resolver, pendingSprites = [];
    const oldSpriteURL = oldResolver.url('characters/nina/default.webp'), oldMusicURL = oldResolver.url('sfx/music/buzz.mp3');
    oldResolver.sprite = () => new Promise(resolve => pendingSprites.push(resolve));
    const state = controller.playback.restore().beat.state;
    const pendingStage = controller.stage.render({ ...state, characters: { ghost: { id: 'ghost', name: 'Ghost', expression: 'default', slot: 0 } } }, 1);
    controller.settingsPanel.querySelector('[aria-label="Preview character"]').value = 'Nina';
    [...controller.settingsPanel.querySelectorAll('button')].find(button => button.textContent === 'Preview sprite').click();
    let resolveMusic; oldResolver.audio = () => new Promise(resolve => resolveMusic = resolve);
    const pendingMusic = controller.audio.setChannel('music', { name: 'delayed', rate: 1 });
    await eventually(() => pendingSprites.length === 2 && resolveMusic);
    await controller.selectEnvironment('harry-potter');
    for (const resolve of pendingSprites) resolve(oldSpriteURL); resolveMusic(oldMusicURL);
    await pendingStage; await pendingMusic; await pause(30);
    assert(oldResolver.disposed); equal(controller.audio.sources.size, 0);
    assert(![...controller.root.querySelectorAll('img')].some(image => image.src.includes(`/environments/${DEFAULT_ENVIRONMENT}/`)));
    const preview = controller.settingsPanel.querySelector('.vn-sprite-preview'); assert(preview.hidden); assert(!preview.getAttribute('src'));
    await controller.selectEnvironment(DEFAULT_ENVIRONMENT);
    await eventually(() => controller.root.querySelector('[data-character="ashley"] img')?.src.includes('/ashley/'));
    equal(controller.playback.position, 0);
});
await check('refresh merges personal content and selection remains safe during generation or while closed', async () => {
    const originalJSON = controller.catalogResolver.json, picker = controller.root.querySelector('[data-environment-picker]');
    const publishedBefore = JSON.stringify(inventory), requested = [];
    controller.catalogResolver.json = async path => {
        requested.push(path);
        return path === 'assets.json' ? inventory : { environments: { test_castle: { path: 'environments/test_castle', name: 'Test castle', description: '', files: [], characters: {} } } };
    };
    try {
        await controller.refreshAssets(); equal(picker.options.length, 4); equal(picker.options[3].textContent, 'Test castle'); equal(controller.playback.position, 0);
        equal(controller.settingsPanel.querySelector('[data-setting="environment"]').options.length, 4);
        equal(requested.sort(), ['assets.json', 'assets.local.json']); equal(JSON.stringify(inventory), publishedBefore);
    } finally { controller.catalogResolver.json = originalJSON; await controller.refreshAssets(); }
    emit('GENERATION_STARTED', 'normal'); await controller.selectEnvironment('re-zero');
    assert(controller.root.querySelector('.vn-status').textContent.includes('Waiting')); assert(!controller.root.textContent.includes('SECRET_CANONICAL'));
    emit('GENERATION_ENDED'); await eventually(() => controller.playback?.position === 0);
    controller.close(); await controller.selectEnvironment(DEFAULT_ENVIRONMENT); assert(controller.root.hidden); equal(controller.audio.sources.size, 0);
    await controller.open(0); await eventually(() => controller.root.querySelector('[data-character="ashley"] img')?.src.includes('/ashley/'));
    equal(controller.playback.position, 0); equal(picker.options.length, 3);
});
await check('artifact opens automatically, blocks scripts and application access', async () => {
    await controller.action('next'); await controller.action('next');
    assert(controller.html.active); const frame = controller.root.querySelector('.vn-artifact iframe');
    equal(frame.getAttribute('sandbox'), ''); assert(!frame.srcdoc.includes('<script>')); assert(frame.srcdoc.includes('Letter'));
    await pause(100); assert(!document.body.dataset.compromised);
    await controller.action('close-artifact'); assert(!controller.html.active); assert(controller.root.querySelector('.vn-text').textContent.includes('After artifact'));
});
await check('HTML sanitizer strips network navigation, forms and nested frames', async () => {
    const html = isolatedDocument('<div><iframe src="/secret"></iframe><form action="/api"><input></form><a href="https://evil.test">link</a><img src="https://evil.test/x"><script>alert(1)</script></div>');
    assert(!html.includes('<iframe')); assert(!html.includes('<form')); assert(!html.includes('https://evil')); assert(!html.includes('<script>'));
    controller.settings.interactiveArtifacts = true; controller.html.open({ html: '<button onclick="document.body.textContent=\'Clicked\'">Clock</button>', interactive: true });
    equal(controller.root.querySelector('.vn-artifact iframe').getAttribute('sandbox'), 'allow-scripts'); controller.html.close();
});
await check('interactive HTML runs in an opaque origin without app or storage access', async () => {
    let received;
    const listener = event => { if (event.data?.vnSandboxTest) received = event; };
    window.addEventListener('message', listener);
    try {
        controller.html.open({ interactive: true, html: `<script>let denied=0;try{parent.document.body.dataset.compromised='yes'}catch{denied++}try{localStorage.setItem('test','x')}catch{denied++}parent.postMessage({vnSandboxTest:true,denied},'*')</script><p>Isolated script</p>` });
        const frame = controller.root.querySelector('.vn-artifact iframe');
        await pause(200); assert(received); assert(received.source === frame.contentWindow); equal(received.origin, 'null'); equal(received.data.denied, 2); assert(!document.body.dataset.compromised);
    } finally { window.removeEventListener('message', listener); controller.html.close(); }
});
await check('reveal is deliberate, non-mutating, and closes on generation', async () => {
    controller.close(); const original = JSON.stringify(context.chat);
    controller.reveal.toggle(0); assert(controller.reveal.dialog.textContent.includes('SECRET_CANONICAL')); equal(JSON.stringify(context.chat), original);
    emit('GENERATION_STARTED', 'normal'); assert(!controller.reveal.dialog); controller.reveal.toggle(0); assert(!controller.reveal.dialog);
    await controller.open(0); assert(controller.root.querySelector('.vn-status').textContent.includes('Waiting')); assert(!controller.root.textContent.includes('SECRET_CANONICAL'));
    emit('GENERATION_ENDED'); await pause(100);
});
await check('swipe and edit use selected message instead of last chat entry', async () => {
    context.chat[0].mes = 'SECRET_ALT\n/////\n#BACKGROUND outside\nNARRATION\nAlternative'; context.chat[0].swipe_id = 1;
    emit('MESSAGE_SWIPED', 0); await pause(100);
    assert(controller.root.querySelector('.vn-text').textContent.includes('Alternative')); equal(Object.keys(controller.playback.restore().beat.state.characters).length, 0);
    context.chat[0].mes = 'SECRET_ALT\n/////\nNARRATION\nEdited'; emit('MESSAGE_UPDATED', 0); await pause(100);
    assert(controller.root.querySelector('.vn-text').textContent.includes('Edited'));
});
await check('chat switches clear stage, background, audio and reveal', async () => {
    context.chatId = 'B'; context.chat = [{ mes: 'UNAVAILABLE_HIDDEN_CANONICAL' }]; mountChat(); emit('CHAT_CHANGED'); await pause(100);
    equal(controller.root.querySelectorAll('.vn-character').length, 0); equal(controller.audio.sources.size, 0);
    equal(controller.root.querySelector('.vn-background').style.backgroundImage, ''); assert(!controller.root.textContent.includes('UNAVAILABLE_HIDDEN_CANONICAL'));
    await controller.action('transcript'); assert(!controller.root.querySelector('.vn-panel-content').textContent.includes('Edited')); await controller.action('close-panel');
});
await check('refresh reconstruction, DOM remount, reinitialization and disable', async () => {
    context.chat = [{ mes: initial, swipe_id: 0 }]; mountChat();
    controller.dispose(); controller = new VNController(createHost(() => context, { localContent: false }), new URL('../', import.meta.url), inventory); controller.audio.audioFactory = () => new FakeAudio();
    await controller.open(0); await pause(100); equal(controller.root.querySelectorAll('.vn-character').length, 4);
    equal(document.querySelectorAll('#vnplus-overlay').length, 1); equal(document.querySelectorAll('#vnplus-settings').length, 1);
    mountChat(); await pause(150); equal(document.querySelectorAll('.vn-message-tools').length, 1); assert([...listeners.values()].every(set => set.size === 1));
    controller.settings.enabled = false; controller.settingsChanged('enabled'); assert(controller.root.hidden); equal(document.querySelectorAll('.vn-message-tools').length, 0);
    controller.settings.enabled = true; controller.settingsChanged('enabled'); await controller.open(0);
});
await check('missing assets, property styling and reduced motion remain readable', async () => {
    context.chat[0].mes = 'SECRET\n/////\n#BACKGROUND unavailable_art\nUnknown: "Still readable." [excited]';
    await controller.open(0); await pause(300);
    assert(controller.root.querySelector('.vn-text').textContent.includes('Still readable')); assert(controller.root.classList.contains('vn-reduced-motion'));
    assert(controller.root.querySelector('.vn-no-sprite'));
});
await check('narrator labels stay readable without a bust or reserved stage slot', async () => {
    context.chat[0].mes = 'SECRET\n/////\n#ENTER Narrator\n#ENTER Nina\nNarrator: "The door opens." [calm]\nNina: "Hello."\nNarration: A moment passes.';
    await controller.open(0); await pause(100);
    equal(controller.root.querySelectorAll('.vn-character').length, 1);
    assert(!controller.root.querySelector('[data-character="narrator"]'));
    equal(controller.playback.timeline.maxSlots, 1); equal(controller.playback.restore().beat.token.type, 'narration');
    equal(controller.root.querySelector('.vn-speaker').textContent, 'Narration'); assert(controller.root.querySelector('.vn-text').textContent.includes('The door opens.'));
    await controller.action('next'); await controller.action('next'); await pause(50);
    equal(controller.root.querySelectorAll('.vn-character').length, 1); equal(controller.playback.restore().beat.state.speaker, null);
    await controller.action('back'); await pause(50); equal(controller.root.querySelectorAll('.vn-character').length, 1);
});
await check('textbox image-only option keeps artwork and removes every panel decoration', async () => {
    const keys = ['characters', 'dialogueBoxImageOnly', 'dialogueBoxTexture', 'showBoxChrome', 'showBoxBackground'];
    const previous = Object.fromEntries(keys.map(key => [key, controller.settings[key]]));
    try {
        Object.assign(controller.settings, { characters: { ashley: { boxTexture: 'shared/box_texture.png', boxColor: '#ff00ff', nameplateBackground: '#00ff00' } },
            dialogueBoxImageOnly: false, dialogueBoxTexture: 'shared/box_texture.png', showBoxChrome: true, showBoxBackground: true });
        context.chat[0].mes = 'SECRET\n/////\nAshley: "Artwork only."\nNarrator: "Still only artwork."'; await controller.open(0);
        const box = controller.root.querySelector('.vn-dialogue'), toggle = controller.settingsPanel.querySelector('[data-setting="dialogueBoxImageOnly"]');
        assert(!box.classList.contains('vn-image-only')); toggle.checked = true; toggle.dispatchEvent(new Event('change')); await pause(30);
        equal(context.extensionSettings.visual_novel_plus.dialogueBoxImageOnly, true);
        const checkArtwork = () => {
            const css = getComputedStyle(box); assert(box.classList.contains('vn-image-only')); assert(css.backgroundImage.includes('shared/box_texture.png'));
            equal(css.backgroundColor, 'rgba(0, 0, 0, 0)'); equal(css.borderTopWidth, '0px'); equal(css.borderRadius, '0px'); equal(css.boxShadow, 'none'); equal(css.backdropFilter, 'none');
            equal(getComputedStyle(box, '::before').display, 'none'); equal(getComputedStyle(box.querySelector('.vn-speaker')).backgroundColor, 'rgba(0, 0, 0, 0)');
        };
        checkArtwork(); controller.settings.showBoxBackground = false; controller.settingsChanged('showBoxBackground'); await pause(30); checkArtwork();
        await controller.action('next'); await pause(30); checkArtwork();
        await controller.action('back'); await pause(30); checkArtwork();
        controller.settings.characters.ashley.boxImageOnly = false; controller.settings.showBoxBackground = true; controller.settingsChanged('characters'); await pause(100);
        assert(!box.classList.contains('vn-image-only')); equal(getComputedStyle(box).backgroundColor, 'rgb(255, 0, 255)');
        controller.settings.characters.ashley = { boxTexture: '' }; controller.settings.dialogueBoxTexture = ''; controller.settingsChanged('characters'); await pause(100);
        assert(!box.classList.contains('vn-image-only')); equal(getComputedStyle(box).backgroundImage, 'none'); assert(parseFloat(getComputedStyle(box).borderTopWidth) > 0);
    } finally {
        Object.assign(controller.settings, previous); controller.settingsChanged('characters');
        const toggle = controller.settingsPanel.querySelector('[data-setting="dialogueBoxImageOnly"]'); if (toggle) toggle.checked = previous.dialogueBoxImageOnly;
    }
});
await check('unknown speakers acquire property colors before rendering and known names never scaffold again', async () => {
    const previous = { characters: controller.settings.characters, automatic: controller.settings.autoCreateCharacters };
    const environment = controller.environment; let requests = 0;
    controller.settings.autoCreateCharacters = true;
    controller.settings.characters = { known_test: { displayName: 'Known Test', aliases: ['Known'], textColor: '#112233' } };
    controller.host.scaffoldCharacters = async input => {
        requests++; equal(input.environment, environment.id); equal(input.names, ['Mara Test', 'Resident Test', '???']);
        return { characters: [
            { name: 'Mara Test', id: 'mara_test', created: true, properties: { displayName: 'Mara Test', textColor: '#edb582', color: '#edb582', voiceId: '' } },
            { name: 'Resident Test', id: 'existing_test', created: false, properties: { displayName: 'Existing Test', aliases: ['Resident Test'], textColor: '#90d6a7' } },
            { name: '???', id: 'mystery_test', created: true, properties: { displayName: '???', textColor: '#c6d97d', voiceId: '' } },
        ] };
    };
    try {
        context.chat[0].mes = 'SECRET\n/////\n#ENTER Enter Only\n#ENTER Narrator\nMara Test: "First line."\nKnown: "Known alias."\nResident Test: "Found on disk."\n???: "A mystery."\nNarrator: "No body."';
        await controller.open(0); await pause(50); equal(requests, 1);
        equal(controller.root.querySelector('.vn-dialogue').style.getPropertyValue('--vn-text-color'), '#edb582');
        assert(controller.registry.knows('Mara Test')); equal(controller.registry.identify('Resident Test'), 'existing_test');
        assert(controller.settingsPanel.querySelector('[data-character-folders-status]').textContent.includes('Created 2')); equal(controller.registry.identify('???'), 'mystery_test');
        equal(controller.speech.prepared.segments.length, 0); assert(controller.root.querySelector('.vn-content-notice').hidden);
        await controller.open(0); equal(requests, 1);
        context.chat[0].mes += '\nAnother moment passes.'; await controller.open(0); equal(requests, 1);
        controller.settings.autoCreateCharacters = false; context.chat[0].mes = 'SECRET\n/////\nNo Scaffold: "Leave me alone."'; await controller.open(0); equal(requests, 1);
    } finally {
        delete controller.host.scaffoldCharacters; delete environment.inventory.characters.mara_test; delete environment.inventory.characters.existing_test; delete environment.inventory.characters.mystery_test;
        controller.settings.characters = previous.characters; controller.settings.autoCreateCharacters = previous.automatic;
    }
});
await check('folder bridge failures stay readable and stale responses cannot enter another environment', async () => {
    const initialEnvironment = controller.environment.id, automatic = controller.settings.autoCreateCharacters;
    controller.settings.autoCreateCharacters = true;
    try {
        controller.host.scaffoldCharacters = async () => { throw new Error('Restart SillyTavern to load the folder bridge.'); };
        context.chat[0].mes = 'SECRET\n/////\nNew Failure Test: "Still readable."'; await controller.open(0);
        assert(controller.root.querySelector('.vn-text').textContent.includes('Still readable.'));
        assert(!controller.root.querySelector('.vn-content-notice').hidden); assert(controller.root.querySelector('.vn-content-notice').textContent.includes('Restart'));
        let resolve; controller.host.scaffoldCharacters = () => new Promise(done => resolve = done);
        context.chat[0].mes = 'SECRET\n/////\nLate Character Test: "Old world."'; const pending = controller.open(0);
        await eventually(() => !!resolve);
        context.chat[0].mes = 'SECRET\n/////\nNARRATION\nA different world.';
        await controller.selectEnvironment(initialEnvironment === 'harry-potter' ? 're-zero' : 'harry-potter');
        resolve({ characters: [{ id: 'late_character_test', properties: { displayName: 'Late Character Test', textColor: '#abcdef' }, created: true }] });
        await pending; assert(!controller.registry.properties.has('late_character_test')); assert(!controller.root.querySelector('[data-character="late_character_test"]'));
        assert(controller.root.querySelector('.vn-content-notice').hidden);
    } finally { delete controller.host.scaffoldCharacters; controller.settings.autoCreateCharacters = automatic; await controller.selectEnvironment(initialEnvironment); }
});
await check('obsolete async background and sprite requests cannot overwrite new scene', async () => {
    const originalBackground = controller.resolver.background, originalSprite = controller.resolver.sprite;
    let resolveBackground, resolveSprite;
    controller.resolver.background = name => name === 'delayed' ? new Promise(resolve => resolveBackground = resolve) : originalBackground.call(controller.resolver, name);
    const oldState = { ...controller.playback.restore().beat.state, background: 'delayed' };
    const old = controller.stage.render(oldState, 1); await pause(10);
    const newState = { ...oldState, background: 'kitchen', characters: {} }; await controller.stage.render(newState, 1);
    resolveBackground(controller.resolver.url('backgrounds/street.png')); await old;
    assert(controller.root.querySelector('.vn-background').style.backgroundImage.includes('kitchen'));
    controller.resolver.sprite = () => new Promise(resolve => resolveSprite = resolve);
    const pending = controller.stage.render({ ...newState, characters: { ghost: { id: 'ghost', name: 'Ghost', expression: 'default', slot: 0 } } }, 1); await pause(10);
    await controller.stage.render(newState, 1); resolveSprite(controller.resolver.url('characters/nina/default.webp')); await pending;
    equal(controller.root.querySelectorAll('.vn-character').length, 0);
    controller.resolver.background = originalBackground; controller.resolver.sprite = originalSprite;
});
await check('breathing, expression interpolation and blink images clean up on reduced motion', async () => {
    const until = async predicate => { for (let i = 0; i < 150; i++) { if (predicate()) return; await pause(20); } throw new Error('Sprite animation did not become ready'); };
    controller.settings.reducedMotion = false; controller.settings.expressionTransition = 400;
    controller.settings.characters.nina = { blink: { image: 'happy.webp', duration: 90 }, breathing: { centerX: .42, centerY: .58 } };
    context.chat[0].mes = 'SECRET\n/////\nNINA: "First expression" [default]\nNINA: "Second expression" [happy]';
    await controller.open(0);
    const node = controller.root.querySelector('[data-character="nina"]'), animator = controller.stage.sprites;
    await until(() => animator.records.get(node)?.frame?.querySelector('.vn-sprite-blink'));
    let record = animator.records.get(node);
    assert(record.frame.classList.contains('vn-sprite-meshed')); assert(record.frame.querySelector('canvas'));
    assert(animator.mesh.gl); equal(record.breath.centerX, .42); equal(record.breath.centerY, .58);
    const phase = record.inhale, vertices = [...animator.mesh.mesh.positions];
    await until(() => record.inhale !== phase && vertices.some((value, index) => value !== animator.mesh.mesh.positions[index]));
    animator.blink(node); assert(record.frame.querySelector('.vn-sprite-open').hidden); assert(!record.frame.querySelector('.vn-sprite-blink').hidden);
    assert(animator.mesh.surfaces.get(record.frame).image === record.frame.querySelector('.vn-sprite-blink'));
    await pause(120); assert(!record.frame.querySelector('.vn-sprite-open').hidden); assert(record.frame.querySelector('.vn-sprite-blink').hidden);
    animator.blink(node); await controller.action('next'); await until(() => node.dataset.expression === 'happy');
    record = animator.records.get(node); equal(record.visual.querySelectorAll('.vn-sprite-frame').length, 2); assert(record.animations.size > 0);
    assert(!record.frame.querySelector('.vn-sprite-open').hidden);
    await controller.action('back'); await until(() => node.dataset.expression === 'default');
    await until(() => record.visual.querySelectorAll('.vn-sprite-frame').length === 1 && record.animations.size === 0);
    equal(record.visual.querySelectorAll('.vn-sprite-frame').length, 1); equal(record.animations.size, 0);
    equal(animator.mesh.surfaces.size, 1);
    const panel = controller.settingsPanel;
    panel.querySelector('[aria-label="Breathing center character"]').value = 'Nina';
    const centers = [...panel.querySelectorAll('label')].filter(label => label.textContent.startsWith('Breathing center ')).map(label => label.querySelector('input'));
    centers[0].value = '.35'; centers[1].value = '.55';
    const cursor = controller.playback.cursor, frame = record.frame;
    [...panel.querySelectorAll('button')].find(button => button.textContent === 'Apply breathing center').click();
    await until(() => record.breath.centerX === .35 && record.breath.centerY === .55);
    equal(controller.playback.cursor, cursor); assert(record.frame === frame); assert(animator.records.get(node) === record);
    equal(controller.settings.characters.nina.blink.duration, 90); equal(controller.settings.characters.nina.breathing.centerX, .35);
    assert(panel.querySelector('[aria-label="Character registry JSON"]').value.includes('"centerY": 0.55'));
    [...panel.querySelectorAll('button')].find(button => button.textContent === 'Load breathing center').click();
    await pause(50); equal(centers.map(input => Number(input.value)), [.35, .55]);
    controller.settings.reducedMotion = true; controller.present(controller.playback.restore()); await pause(30);
    assert(!record.breath); equal(record.blinkTimer, null); equal(record.openTimer, null); equal(animator.mesh.surfaces.size, 0); assert(!record.frame.querySelector('canvas')); equal(animator.frameId, null);
    controller.settings.expressionTransition = 280; delete controller.settings.characters.nina;
});
await check('GPU mesh has no triangle seams, preserves alpha/orientation, and releases resources', async () => {
    const renderer = new SpriteMeshRenderer(), source = document.createElement('canvas'); source.width = 128; source.height = 192;
    const context = source.getContext('2d'); context.fillStyle = 'rgba(255,80,32,.5)'; context.fillRect(0, 0, 128, 192);
    const image = new Image(); image.className = 'vn-sprite-open'; image.alt = 'Mesh fixture'; image.src = source.toDataURL(); await image.decode();
    const frame = document.createElement('div'); frame.className = 'vn-sprite-frame'; frame.style.cssText = 'position:fixed;left:0;top:0;bottom:auto;width:173.4px;height:240.8px;'; frame.append(image); document.body.append(frame);
    try {
        assert(renderer.enable(frame));
        for (const inhale of [0, .071, .324, .777, 1]) {
            assert(renderer.draw(frame, breathingConfig({ breathing: { amount: 5, centerX: .43, centerY: .57 } }), inhale));
            const surface = renderer.surfaces.get(frame), width = surface.canvas.width, height = surface.canvas.height;
            const data = surface.context.getImageData(0, 0, width, height).data;
            for (let y = Math.ceil(height * .1); y < height * .9; y++) for (let x = Math.ceil(width * .2); x < width * .8; x++) {
                const i = (y * width + x) * 4;
                assert(Math.abs(data[i + 3] - 128) <= 2, `Triangle seam at ${x},${y}, phase ${inhale}: alpha ${data[i + 3]}`);
                assert(data[i] >= 253 && Math.abs(data[i + 1] - 80) <= 2 && Math.abs(data[i + 2] - 32) <= 2, 'Premultiplied texture color changed');
            }
        }
        const ctx = source.getContext('2d'); ctx.clearRect(0,0,128,192); ctx.fillStyle = '#00ff00'; ctx.fillRect(0,0,128,192); ctx.fillStyle = '#ff0000'; ctx.fillRect(0,0,128,24); ctx.fillStyle = '#0000ff'; ctx.fillRect(0,168,128,24);
        const closed = new Image(); closed.className = 'vn-sprite-blink'; closed.src = source.toDataURL(); await closed.decode(); frame.append(closed); image.hidden = true;
        assert(renderer.draw(frame, breathingConfig({}), .5));
        const surface = renderer.surfaces.get(frame), sample = y => [...surface.context.getImageData(Math.floor(surface.canvas.width/2), Math.floor(surface.canvas.height*y),1,1).data];
        equal(sample(.05), [255,0,0,255]); equal(sample(.95), [0,0,255,255]); equal(sample(.5), [0,255,0,255]);
        renderer.canvas.dispatchEvent(new Event('webglcontextlost')); equal(renderer.surfaces.size, 0); assert(!frame.classList.contains('vn-sprite-meshed')); assert(!renderer.enable(frame));
    } finally { renderer.dispose(); frame.remove(); }
});
await check('freestyle narration and internal thoughts preserve identity, styling, transcript and silent playback', async () => {
    const originalSFX = controller.audio.sfx, originalSounds = controller.settings.characterSounds;
    const originalNina = controller.settings.characters.nina, sounds = [];
    controller.audio.sfx = async (name, character) => { sounds.push({ name, character }); };
    controller.settings.characterSounds = true; controller.settings.characters.nina = { sound: 'thought-voice.ogg' };
    controller.settings.reducedMotion = true; controller.settings.typewriterEffect = false;
    context.chat[0].mes = 'SECRET_THOUGHT_CANONICAL\n/////\nYou hear footsteps.\nNina: "(I should keep this to myself.)" [happy]\n#SFX door\nNina: "Hello (again)." [happy]\nNina: (Perhaps tomorrow.) [happy]\nNARRATION\nYou turn around.';
    const originalChat = JSON.stringify(context.chat);
    try {
        await controller.open(0);
        const text = controller.root.querySelector('.vn-text'), speaker = controller.root.querySelector('.vn-speaker');
        equal(speaker.textContent, 'Narration'); assert(text.textContent.includes('You hear footsteps.')); equal(sounds.length, 0);
        await controller.action('next');
        assert(text.classList.contains('vn-thought')); equal(getComputedStyle(text).fontStyle, 'italic');
        equal(speaker.textContent, 'Nina · thoughts'); equal(text.textContent, '"(I should keep this to myself.)"');
        equal(controller.playback.restore().beat.state.characters.nina.expression, 'happy'); equal(sounds.length, 0);
        await controller.action('transcript');
        const transcript = controller.root.querySelector('.vn-panel-content');
        assert(transcript.textContent.includes('Nina (thoughts): "(I should keep this to myself.)"'));
        assert(transcript.querySelector('p.vn-thought')); assert(!transcript.textContent.includes('SECRET_THOUGHT_CANONICAL'));
        await controller.action('close-panel'); await controller.action('next');
        assert(!text.classList.contains('vn-thought')); equal(speaker.textContent, 'Nina');
        equal(sounds.map(sound => sound.name), ['door', 'thought-voice.ogg']); equal(sounds[1].character, 'nina');
        await controller.action('next'); assert(text.classList.contains('vn-thought')); equal(sounds.length, 2);
        await controller.action('back'); assert(!text.classList.contains('vn-thought')); equal(sounds.length, 2);
        await controller.action('next'); assert(text.classList.contains('vn-thought')); equal(sounds.length, 2);
        await controller.action('next'); equal(speaker.textContent, 'Narration'); assert(!text.classList.contains('vn-thought'));
        await controller.action('replay'); await controller.action('next'); assert(text.classList.contains('vn-thought')); equal(sounds.length, 2);
        equal(JSON.stringify(context.chat), originalChat); assert(!controller.root.textContent.includes('SECRET_THOUGHT_CANONICAL'));
    } finally {
        controller.audio.sfx = originalSFX; controller.settings.characterSounds = originalSounds;
        if (originalNina === undefined) delete controller.settings.characters.nina; else controller.settings.characters.nina = originalNina;
    }
});
await check('click/keyboard progression, typewriter skip and auto advance use live controls', async () => {
    context.chat[0].mes = 'SECRET\n/////\nNARRATION\nFirst paragraph\nNARRATION\nSecond paragraph'; await controller.open(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); equal(controller.playback.position, 1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); equal(controller.playback.position, 0);
    controller.settings.reducedMotion = false; controller.settings.typewriterEffect = true; controller.settings.typewriterSpeed = 100;
    await controller.action('replay'); assert(controller.dialogue.typing);
    controller.root.querySelector('.vn-dialogue').click(); assert(!controller.dialogue.typing); equal(controller.playback.position, 0);
    controller.settings.typewriterEffect = false; controller.settings.reducedMotion = true; controller.settings.autoAdvance = true; controller.settings.autoAdvanceDelay = 30;
    controller.present(controller.playback.restore()); await pause(100); assert(!controller.root.querySelector('.vn-reply').hidden);
    controller.settings.autoAdvance = false; clearTimeout(controller.autoTimer);
});
await check('reply, retry, exit and resume delegate to normal host controls', async () => {
    await controller.action('reply'); controller.root.querySelector('#vnplus-reply').value = 'Test reply'; await controller.action('send'); equal(sends, 1);
    await controller.action('retry'); equal(retries, 1);
    controller.close(); assert(controller.root.hidden); await controller.open(0); assert(!controller.root.hidden);
});
await check('missing artwork uses a bust silhouette, ST theme overrides apply, and only intense tags shake', async () => {
    const previous = { characters: controller.settings.characters, themeColors: controller.settings.themeColors, font: controller.settings.dialogueFont,
        text: controller.settings.textColor, narration: controller.settings.narrationColor, motion: controller.settings.reducedMotion };
    const properties = { '--SmartThemeBodyColor': '#e0e8df', '--SmartThemeQuoteColor': '#83b68c', '--SmartThemeBlurTintColor': '#223128', '--SmartThemeBorderColor': '#536859', '--mainFontFamily': 'monospace' };
    const styles = Object.fromEntries(Object.keys(properties).map(key => [key, document.documentElement.style.getPropertyValue(key)]));
    try {
        for (const [key, value] of Object.entries(properties)) document.documentElement.style.setProperty(key, value);
        controller.settings.characters = {}; controller.settings.themeColors = {}; controller.settings.dialogueFont = '';
        controller.settings.textColor = ''; controller.settings.narrationColor = ''; controller.settings.reducedMotion = false;
        controller.settings.textEffects = true; controller.settings.typewriterEffect = false;
        context.chat[0].mes = 'PRIVATE\n/////\n#TEXT jitter\nUnknown: "Calm." [nervous]\nUnknown: "Intense!" [rage]\nYou hear footsteps.';
        await controller.open(0); await eventually(() => controller.root.querySelector('.vn-no-sprite svg'));
        const silhouette = controller.root.querySelector('.vn-no-sprite .vn-missing-bust');
        assert(silhouette.querySelector('path')); assert(silhouette.querySelector('svg').getAttribute('aria-label').includes('Unknown'));
        assert(silhouette.getBoundingClientRect().height > 100);
        const text = controller.root.querySelector('.vn-text'); assert(!text.classList.contains('vn-text-jitter'));
        equal(getComputedStyle(text).color, 'rgb(224, 232, 223)'); equal(getComputedStyle(text).fontFamily, 'monospace');
        equal(getComputedStyle(controller.root.querySelector('.vn-world')).backgroundImage, 'none');
        const panelOverride = controller.settingsPanel.querySelector('[data-theme-color="panel"]'); panelOverride.value = '#203040'; panelOverride.dispatchEvent(new Event('change'));
        equal(controller.root.style.getPropertyValue('--vn-panel'), '#203040'); equal(context.extensionSettings.visual_novel_plus.themeColors.panel, '#203040');
        await controller.action('next'); assert(text.classList.contains('vn-text-jitter'));
        await controller.action('next'); assert(!text.classList.contains('vn-text-jitter'));
        assert(!controller.settingsPanel.querySelector('[data-setting="typewriterJitter"]'));
    } finally {
        for (const [key, value] of Object.entries(styles)) if (value) document.documentElement.style.setProperty(key, value); else document.documentElement.style.removeProperty(key);
        Object.assign(controller.settings, { characters: previous.characters, themeColors: previous.themeColors, dialogueFont: previous.font, textColor: previous.text, narrationColor: previous.narration, reducedMotion: previous.motion });
        controller.settingsChanged('themeColors');
    }
});
await check('Fish settings use property voices, protect credentials and connect cached clips to final dialogue', async () => {
    const originalRequest = controller.host.request, originalCharacters = controller.settings.characters, originalSettings = structuredClone(controller.settings.tts);
    const originalFactory = controller.speech.audioFactory; let syntheses = 0, keys = 0;
    const originalCharacterSounds = controller.settings.characterSounds, originalSFX = controller.audio.sfx; let legacySounds = 0;
    controller.settings.characterSounds = true; controller.audio.sfx = async () => { legacySounds++; };
    const samples = Float32Array.from({ length: Math.round(SAMPLE_RATE * 1.5) }, (_, i) => .06 * Math.sin(2 * Math.PI * 240 * i / SAMPLE_RATE));
    const bytes = wavBytes(samples); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    const payload = { audio_base64: btoa(binary), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: [
        { text: 'Hello', start: .1, end: .3 }, { text: 'world', start: .3, end: .5 }, { text: 'Good', start: .8, end: 1 }, { text: 'morning', start: 1, end: 1.2 },
    ] } };
    controller.host.request = async (url, options = {}) => {
        if (url.endsWith('/status')) return Response.json({ configured: true });
        if (url.endsWith('/secret')) { equal(JSON.parse(options.body).value, 'FAKE_BROWSER_KEY'); keys++; return Response.json({ configured: true }); }
        syntheses++; const request = JSON.parse(options.body); equal(request.model, 's2.1-pro-free'); equal(request.body.reference_id, ['voice-nina', 'voice-ashley']);
        assert(request.body.text.includes('[curious] Hello world.')); assert(!request.body.text.includes('Keep quiet')); assert(!request.body.text.includes('PRIVATE')); assert(!request.body.text.includes('Silent'));
        const data = new TextEncoder().encode(`data: ${JSON.stringify(payload)}\r\n\r\n`); let offset = 0;
        return new Response(new ReadableStream({ pull(stream) { if (offset >= data.length) return stream.close(); stream.enqueue(data.slice(offset, offset + 4093)); offset += 4093; } }), { headers: { 'Content-Type': 'text/event-stream' } });
    };
    controller.settings.tts.enabled = true; controller.settings.tts.processing = true; controller.speech.audioFactory = () => new FakeAudio();
    controller.settings.characters = { nina: { voiceId: 'voice-nina' }, ashley: { voiceId: 'https://fish.audio/m/voice-ashley/' } };
    context.chat[0].mes = 'PRIVATE\n/////\nUnknown: "Silent."\nNina: "(Keep quiet.)" [nervous]\nNina: "Hello world." [curious]\nAshley: "Good morning." [happy]\n\nYou take a breath.';
    const stored = JSON.stringify(context.chat);
    try {
        await controller.open(0); const panel = controller.speechSettingsPanel;
        panel.keyInput.value = 'FAKE_BROWSER_KEY'; [...panel.node.querySelectorAll('button')].find(button => button.textContent === 'Save API key').click();
        await eventually(() => keys === 1 && panel.keyInput.value === '');
        await controller.prepareSpeech(); equal(controller.speech.prepared.segments.length, 2); equal(syntheses, 0);
        equal(panel.node.querySelectorAll('.vn-speech-segment').length, 2);
        assert(!JSON.stringify(controller.settings).includes('FAKE_BROWSER_KEY')); assert(!controller.messages.join(' ').includes('FAKE_BROWSER_KEY'));
        await controller.action('speech'); assert(controller.root.querySelector('.vn-panel-title').textContent.includes('Fish')); await controller.action('close-panel');
        const job = await controller.speech.generate(); equal(job.status, 'complete'); equal(syntheses, 1); equal(job.chapters[0].clips.filter(clip => clip.review).length, 0);
        assert(job.chapters[0].processed.results.size === 2); assert(job.chapters[0].processed.results.values().next().value.notes.some(note => note.includes('Denoising skipped')));
        await controller.action('next'); assert(!controller.speech.audio); // Thought remains mute.
        await controller.action('next'); await eventually(() => controller.speech.audio?.src.startsWith('blob:'));
        const ninaAudio = controller.speech.audio; assert(!ninaAudio.paused);
        await controller.action('next'); await eventually(() => controller.speech.audio && controller.speech.audio !== ninaAudio); assert(ninaAudio.paused);
        await controller.action('next'); assert(!controller.speech.audio); equal(syntheses, 1);
        await controller.speech.generate(); equal(syntheses, 1); equal(JSON.stringify(context.chat), stored);
        equal(legacySounds, 0);
        emit('GENERATION_STARTED', 'normal'); let rejected = false; try { await controller.prepareSpeech(); } catch { rejected = true; } assert(rejected); equal(syntheses, 1);
        emit('GENERATION_ENDED'); await eventually(() => !controller.busy && controller.speech.prepared?.segments.length === 2);
        context.chat[0].mes = 'PRIVATE_EDIT\n/////\nNina: "Changed."'; context.chat[0].swipe_id++;
        emit('MESSAGE_SWIPED', 0); await eventually(() => controller.root.querySelector('.vn-text').textContent.includes('Changed.'));
        assert(!controller.speech.job); assert(!controller.speech.audio); equal(syntheses, 1);
    } finally {
        controller.host.request = originalRequest; controller.settings.characters = originalCharacters; controller.settings.tts = originalSettings;
        controller.speech.audioFactory = originalFactory; controller.speech.clearScene(); controller.settingsChanged('speech');
        controller.settings.characterSounds = originalCharacterSounds; controller.audio.sfx = originalSFX;
    }
});
await check('dialogue follows the real voice clock through startup, pauses, skip and auto advance', async () => {
    const previous = { tts: controller.settings.tts, characters: controller.settings.characters, writer: controller.settings.typewriterEffect, speed: controller.settings.typewriterSpeed,
        reduced: controller.settings.reducedMotion, automatic: controller.settings.autoAdvance, delay: controller.settings.autoAdvanceDelay, samples: controller.speech.clipSamples, factory: controller.speech.audioFactory };
    let release;
    try {
        Object.assign(controller.settings, { typewriterEffect: true, typewriterSpeed: 2, reducedMotion: false, autoAdvance: false });
        controller.settings.tts = { ...previous.tts, enabled: true, autoPlay: true, syncText: true }; controller.settings.characters = { nina: { voiceId: 'clock-test-voice' } };
        context.chat[0].mes = 'SECRET\n/////\nNina: "Hello, world!"\nNARRATION\nAfter speech.'; await controller.open(0); await controller.prepareSpeech();
        const line = controller.speech.prepared.segments[0];
        controller.speech.job = { plan: [{}], chapters: [{ duration: 2, clips: [{ id: line.id, first: 0, last: 1, start: 0, end: 2 }], words: [
            { text: 'Hello', start: .3, end: .7 }, { text: 'world', start: 1.3, end: 1.7 },
        ] }] };
        controller.speech.clipSamples = () => new Promise(resolve => release = resolve);
        controller.speech.audioFactory = () => ({ currentTime: 0, paused: true, async play() { this.paused = false; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} });
        const visible = () => controller.dialogue.letters.filter(letter => letter.style.visibility !== 'hidden').map(letter => letter.textContent).join('');
        await controller.action('replay'); await pause(100); equal(visible(), ''); assert(controller.dialogue.typing);
        release(new Float32Array(SAMPLE_RATE * 2)); await eventually(() => controller.speech.audio && !controller.speech.starting, 'Initial voice did not start');
        const playback = controller.speech.playback, audio = controller.speech.audio; await pause(40); equal(visible(), '');
        audio.currentTime = .31; await eventually(() => visible() === '"Hello, ', 'First word did not follow voice');
        audio.paused = true; await pause(120); equal(visible(), '"Hello, ');
        controller.settings.autoAdvance = true; controller.settings.autoAdvanceDelay = 80;
        audio.paused = false; audio.currentTime = 1.31; await eventually(() => visible() === '"Hello, world!"\n', 'Final word did not follow voice');
        await pause(120); equal(controller.playback.position, 0); assert(!controller.dialogue.typing);
        audio.onended(); equal(playback.status, 'ended'); await eventually(() => controller.playback.position === 1, 'Auto advance did not follow voice completion');
        controller.settings.autoAdvance = false; clearTimeout(controller.autoTimer);
        controller.speech.clipSamples = async () => new Float32Array(SAMPLE_RATE * 2);
        await controller.action('replay'); await eventually(() => controller.speech.audio && !controller.speech.starting, 'Replayed voice did not start');
        const skippedAudio = controller.speech.audio; assert(controller.dialogue.skip()); equal(visible(), '"Hello, world!"\n'); assert(!skippedAudio.paused);
        await controller.action('next'); assert(skippedAudio.paused); assert(controller.root.querySelector('.vn-text').textContent.includes('After speech.'));
    } finally {
        controller.speech.clearScene(); controller.dialogue.cancel(); clearTimeout(controller.autoTimer);
        Object.assign(controller.settings, { tts: previous.tts, characters: previous.characters, typewriterEffect: previous.writer, typewriterSpeed: previous.speed, reducedMotion: previous.reduced, autoAdvance: previous.automatic, autoAdvanceDelay: previous.delay });
        controller.speech.clipSamples = previous.samples; controller.speech.audioFactory = previous.factory;
    }
});
await check('voice-timed text falls back on playback failure and respects reduced motion and opt-out', async () => {
    const previous = { writer: controller.settings.typewriterEffect, speed: controller.settings.typewriterSpeed, reduced: controller.settings.reducedMotion, sync: controller.settings.tts.syncText };
    const token = { type: 'dialogue', character: 'Nina', text: '"Hello."', emotion: 'default' };
    const playback = () => ({ status: 'loading', audio: null, clip: { first: 0, last: 0, start: 0, end: 1 }, words: [{ text: 'Hello', start: .2, end: .6 }] });
    const visible = () => controller.dialogue.letters.filter(letter => letter.style.visibility !== 'hidden').map(letter => letter.textContent).join('');
    try {
        Object.assign(controller.settings, { typewriterEffect: true, typewriterSpeed: 2, reducedMotion: false }); controller.settings.tts.syncText = true;
        const failed = playback(); await controller.dialogue.render(token, {}, 'normal', () => {}, false, failed); equal(visible(), '');
        failed.status = 'failed'; await eventually(() => visible() === token.text && !controller.dialogue.typing);
        await controller.dialogue.render(token, {}, 'normal', () => {}, false, { ...playback(), words: [] }); assert(visible().length > 0);
        controller.settings.reducedMotion = true; await controller.dialogue.render(token, {}, 'normal', () => {}, false, playback()); equal(visible(), token.text); assert(!controller.dialogue.typing);
        controller.settings.reducedMotion = false; controller.settings.tts.syncText = false;
        await controller.dialogue.render(token, {}, 'normal', () => {}, false, playback()); assert(visible().length > 0);
    } finally {
        controller.dialogue.cancel(); Object.assign(controller.settings, { typewriterEffect: previous.writer, typewriterSpeed: previous.speed, reducedMotion: previous.reduced }); controller.settings.tts.syncText = previous.sync;
    }
});
await check('voice preparation discovers unindexed player aliases, canonical voices and edited IDs without generating audio', async () => {
    const previous = { characters: controller.settings.characters, automatic: controller.settings.autoCreateCharacters, discover: controller.registry.discover };
    let voice = 'discovered-jason-voice', discoveries = 0;
    controller.settings.characters = { jason: { displayName: 'Jason', assetFolder: 'andrew' } }; controller.settings.autoCreateCharacters = false;
    controller.registry.discover = async () => { discoveries++; return { characters: [{ id: 'jason_weber', properties: { displayName: 'Jason', aliases: ['Jason Weber', 'J. Weber'], voiceId: voice } }] }; };
    try {
        context.chat[0].mes = 'SECRET\n/////\nJason: "First."\nJason Weber: "Second."\nJ. Weber: "Third."';
        await controller.open(0); await controller.prepareSpeech();
        equal(controller.speech.prepared.segments.map(segment => segment.character), ['jason_weber', 'jason_weber', 'jason_weber']);
        assert(controller.speech.prepared.segments.every(segment => segment.voice === voice));
        equal(controller.playback.restore().beat.state.characters.jason_weber.slot, 0);
        voice = 'edited-jason-voice'; await controller.prepareSpeech(); assert(discoveries >= 3);
        assert(controller.speech.prepared.segments.every(segment => segment.voice === voice)); assert(!controller.speech.job);
    } finally {
        controller.settings.characters = previous.characters; controller.settings.autoCreateCharacters = previous.automatic; controller.registry.discover = previous.discover;
        controller.registry.properties.delete('jason_weber'); controller.registry.knownProperties.delete('jason_weber'); controller.registry.discoveredIds.clear(); controller.speech.clearScene();
    }
});
await check('MP3 export is real decodable audio and finishing keeps original sample timing', async () => {
    const original = Float32Array.from({ length: SAMPLE_RATE }, (_, i) => .1 * Math.sin(2 * Math.PI * 440 * i / SAMPLE_RATE));
    const before = original.slice(), mp3 = await encodeMP3(original, 128), decoded = await decodeChapter(mp3);
    assert(mp3.length > 1000); assert(String.fromCharCode(...mp3.slice(0, 4)) !== 'RIFF');
    assert(decoded.length >= SAMPLE_RATE * .95 && decoded.length < SAMPLE_RATE * 1.2);
    assert(decoded.some(sample => Math.abs(sample) > .02)); equal([...original], [...before]);
});
await check('descriptive background and emotion keywords render existing art without changing chat text', async () => {
    const message = 'SECRET\n/////\n#BACKGROUND kitchen image\nNina: "Found it." [joyful]';
    context.chat[0].mes = message; await controller.open(0);
    await eventually(() => controller.root.querySelector('.vn-background').style.backgroundImage.includes('kitchen.png'), 'Keyword background did not render');
    await eventually(() => [...controller.root.querySelectorAll('[data-character="nina"] img')].some(image => image.src.endsWith('/happy.webp') || image.src.endsWith('/smile.webp')), 'Keyword expression did not render');
    equal(context.chat[0].mes, message);
    assert([...controller.resolver.diagnostics.values()].some(result => result.method === 'keywords' && result.requested === 'kitchen image'));
});
await check('music ambience and SFX keyword requests attach the resolved files to playback', async () => {
    await controller.audio.unlock();
    const message = 'SECRET\n/////\n#MUSIC woods music\n#AMBIENT roadway sounds\n#SFX glass smashing\nNARRATION\nListen.';
    context.chat[0].mes = message; await controller.open(0);
    await eventually(() => controller.audio.channels.music.audio?.src.endsWith('/forest.mp3'), 'Keyword music did not load');
    await eventually(() => controller.audio.channels.ambient.audio?.src.endsWith('/traffic_noise.mp3'), 'Keyword ambience did not load');
    await eventually(() => [...controller.audio.sources].some(source => /glass_shatter\.(?:ogg|mp3)$/.test(source.src)), 'Keyword SFX did not play');
    equal(context.chat[0].mes, message);
});
await check('background and music inherit earlier POV commands and history edits preserve the current paragraph', async () => {
    context.chat = [
        { mes: 'CANONICAL_SECRET\n/////\n#BACKGROUND kitchen\n#MUSIC buzz slowed\n#SFX door\n#ENTER Ashley' },
        { mes: '/////\n#BACKGROUND user\n#MUSIC user', is_user: true },
        { mes: '#BACKGROUND canonical_secret\n#MUSIC canonical_secret\n/////\n#BACKGROUND street\nEarlier.' },
        { mes: 'SECRET\n/////\nFirst.\nNARRATION\nSecond.' },
    ];
    mountChat();
    const original = JSON.stringify(context.chat), sfx = controller.audio.sfx; let oldEffects = 0;
    controller.audio.sfx = async () => oldEffects++;
    try {
        await controller.open(3);
        await eventually(() => controller.root.querySelector('.vn-background').style.backgroundImage.includes('street'));
        await eventually(() => controller.audio.channels.music.audio?.src.endsWith('/buzz.mp3'));
        equal(controller.audio.channels.music.audio.playbackRate, .75); equal(controller.root.querySelectorAll('.vn-character').length, 0);
        equal(oldEffects, 0); equal(JSON.stringify(context.chat), original);
        await controller.action('next'); equal(controller.playback.position, 1);
        context.chat[2].mes = 'SECRET\n/////\n#BACKGROUND kitchen\n#MUSIC club\nEdited history.';
        emit('MESSAGE_UPDATED', 2);
        await eventually(() => controller.root.querySelector('.vn-background').style.backgroundImage.includes('kitchen') && controller.audio.channels.music.audio?.src.endsWith('/club.mp3'));
        equal(controller.playback.position, 1); assert(controller.root.querySelector('.vn-text').textContent.includes('Second.')); equal(oldEffects, 0);
    } finally { controller.audio.sfx = sfx; }
});
await check('a fresh controller restores media from history and explicit clears and chat switches stop inheritance', async () => {
    controller.dispose(); controller = new VNController(createHost(() => context, { localContent: false }), new URL('../', import.meta.url), inventory);
    controller.audio.audioFactory = () => new FakeAudio(); await controller.open(3);
    await eventually(() => controller.root.querySelector('.vn-background').style.backgroundImage.includes('kitchen') && controller.audio.channels.music.audio?.src.endsWith('/club.mp3'));
    context.chat[2].mes = 'SECRET\n/////\n#BACKGROUND CLEAR\n#MUSIC STOP\nStopped.';
    emit('MESSAGE_SWIPED', 2);
    await eventually(() => controller.playback.restore().beat.state.background === null && controller.playback.restore().beat.state.music === null);
    equal(controller.root.querySelector('.vn-background').style.backgroundImage, ''); assert(!controller.audio.channels.music.audio);
    context.chatId = 'history-isolated'; context.chat = [{ mes: 'SECRET\n/////\nA different chat.' }]; mountChat(); emit('CHAT_CHANGED');
    await eventually(() => controller.parsed && controller.root.querySelector('.vn-text').textContent.includes('A different chat.'));
    equal(controller.root.querySelector('.vn-background').style.backgroundImage, ''); assert(!controller.audio.channels.music.audio);
});
controller.dispose();
document.querySelector('#test-status').textContent = `${passes} passed · ${failures} failed`;
document.body.dataset.testStatus = failures ? 'failed' : 'passed';
