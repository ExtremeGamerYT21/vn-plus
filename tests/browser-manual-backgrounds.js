import { DEFAULT_ENVIRONMENT } from '../core/content-environments.js';

export async function runManualBackgroundChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    async function fixture(id, source) {
        context.chatId = id; context.chat = [{ mes: `PRIVATE\n/////\n${source}` }]; mountChat();
        const controller = makeController();
        Object.assign(controller.settings, { automaticPlayback: false, autoAdvance: false, autoCreateCharacters: false, typewriterEffect: false });
        Object.assign(controller.settings.tts, { enabled: false, autoGenerate: false });
        await controller.selectEnvironment(DEFAULT_ENVIRONMENT); await controller.open(0);
        return controller;
    }
    async function choose(controller, path = 'backgrounds/kitchen.png') {
        await controller.action('background');
        const select = controller.root.querySelector('[aria-label="Background image"]');
        select.value = path; select.dispatchEvent(new Event('change', { bubbles: true }));
        const button = [...controller.root.querySelectorAll('.vn-background-picker button')].find(node => node.textContent === 'Apply background');
        button.click(); await eventually(() => controller.root.querySelector('.vn-panel').hidden);
        await eventually(() => controller.stage.backgroundUrl === controller.resolver.url(path));
    }
    const reset = async controller => {
        await controller.action('background');
        [...controller.root.querySelectorAll('.vn-background-picker button')].find(node => node.textContent === 'Use scripted background').click();
        await eventually(() => controller.root.querySelector('.vn-panel').hidden && !controller.manualBackground.value);
    };
    const upload = (controller, file) => {
        const transfer = new DataTransfer(); transfer.items.add(file);
        const input = controller.root.querySelector('[aria-label="Choose background from computer"]');
        input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    await check('the Background tool reveals a black scene without replaying speech changing position or rewriting source', async () => {
        const controller = await fixture('manual-background-black', '#BACKGROUND missing_manual_fixture\n#MUSIC buzz\n#FADE BLACK\nNina: "First."\nNina: "Second."\n#FADE IN\n#BACKGROUND street\nNina: "Third."');
        try {
            assert(controller.root.classList.contains('vn-black'));
            const source = context.chat[0].mes, position = controller.playback.position;
            await eventually(() => !!controller.audio.channels.music.audio); const music = controller.audio.channels.music.audio;
            let voices = 0; controller.speech.playBeat = () => { voices++; return null; };
            await choose(controller);
            assert(!controller.root.classList.contains('vn-black'));
            equal(controller.playback.position, position); equal(voices, 0); equal(context.chat[0].mes, source);
            assert(controller.audio.channels.music.audio === music);
            equal(controller.root.querySelector('[data-action="background"]').getAttribute('aria-pressed'), 'true');
            await eventually(() => controller.playbackVariables.background?.manual === true);
            equal(controller.playbackVariables.background.name, 'kitchen.png');
            await controller.action('next'); equal(controller.manualBackground.value.name, 'kitchen.png');
            controller.applyLayout(); await eventually(() => controller.stage.backgroundUrl === controller.resolver.url('backgrounds/kitchen.png'));
            await controller.action('next'); await eventually(() => !controller.manualBackground.value && controller.stage.backgroundUrl?.endsWith('/backgrounds/street.png'));
            equal(controller.root.querySelector('[data-action="background"]').getAttribute('aria-pressed'), 'false');
            equal(context.chat[0].mes, source);
        } finally { controller.dispose(); }
    });
    await check('background filtering previews only matching environment files and reset restores the script', async () => {
        const controller = await fixture('manual-background-reset', '#BACKGROUND street\nYou wait.');
        try {
            await controller.action('background');
            const search = controller.root.querySelector('[aria-label="Filter backgrounds"]'); search.value = 'kitchen'; search.dispatchEvent(new Event('input', { bubbles: true }));
            const options = [...controller.root.querySelector('[aria-label="Background image"]').options];
            assert(options.length > 0 && options.every(option => option.textContent.toLowerCase().includes('kitchen')));
            await choose(controller); await reset(controller);
            await eventually(() => controller.stage.backgroundUrl?.endsWith('/backgrounds/street.png'));
            assert(!controller.playbackVariables.background.manual);
        } finally { controller.dispose(); }
    });
    await check('a local background image renders immediately with temporary playback metadata and is released on reset', async () => {
        const controller = await fixture('manual-background-upload', '#BACKGROUND street\nYou wait.'), revoked = [], revoke = URL.revokeObjectURL;
        URL.revokeObjectURL = url => { revoked.push(url); revoke.call(URL, url); };
        try {
            const image = await (await fetch(controller.resolver.url('backgrounds/kitchen.png'))).blob();
            await controller.action('background'); upload(controller, new File([image], 'chosen-local.png', { type: 'image/png' }));
            await eventually(() => controller.manualBackground.value?.temporary && controller.root.querySelector('.vn-panel').hidden);
            const url = controller.manualBackground.value.url;
            await eventually(() => controller.stage.backgroundUrl === url && controller.playbackVariables.background?.temporary);
            assert(url.startsWith('blob:')); equal(controller.playbackVariables.background.asset, null);
            await reset(controller); assert(revoked.includes(url)); equal(controller.playback.position, 0);
        } finally { controller.dispose(); URL.revokeObjectURL = revoke; }
    });
    await check('an invalid local image keeps the selected background and reports the problem in the picker', async () => {
        const controller = await fixture('manual-background-invalid', '#BACKGROUND street\nYou wait.');
        try {
            await choose(controller); await controller.action('background');
            upload(controller, new File(['<html>not an image</html>'], 'invalid.html', { type: 'text/html' }));
            await eventually(() => controller.root.querySelector('.vn-background-picker [role="status"]').textContent.includes('Choose an image file'));
            upload(controller, new File(['invalid PNG data'], 'invalid.png', { type: 'image/png' }));
            await eventually(() => controller.root.querySelector('.vn-background-picker [role="status"]').textContent.includes('could not be loaded'));
            equal(controller.manualBackground.value.name, 'kitchen.png'); assert(!controller.root.querySelector('.vn-panel').hidden);
            equal(controller.stage.backgroundUrl, controller.resolver.url('backgrounds/kitchen.png'));
        } finally { controller.dispose(); }
    });
    await check('a late scripted background resolution cannot overwrite a manually applied replacement', async () => {
        const controller = await fixture('manual-background-late', 'You wait.');
        const original = controller.resolver.background.bind(controller.resolver); let release;
        controller.resolver.background = name => name === 'delayed' ? new Promise(resolve => release = resolve) : original(name);
        try {
            context.chat[0].mes = 'PRIVATE\n/////\n#BACKGROUND delayed\nYou wait.'; await controller.open(0); await eventually(() => !!release);
            await choose(controller); release(controller.resolver.url('backgrounds/street.png'));
            await new Promise(resolve => setTimeout(resolve, 100));
            equal(controller.stage.backgroundUrl, controller.resolver.url('backgrounds/kitchen.png'));
        } finally { release?.(null); controller.dispose(); }
    });
    await check('switching chats or environments clears manual background recovery instead of carrying it into another story', async () => {
        const controller = await fixture('manual-background-scope', '#BACKGROUND street\nYou wait.');
        try {
            await choose(controller); context.chatId = 'manual-background-other-chat'; await controller.open(0);
            equal(controller.manualBackground.value, null);
            await choose(controller); await controller.selectEnvironment('re-zero'); equal(controller.manualBackground.value, null);
        } finally { await controller.selectEnvironment(DEFAULT_ENVIRONMENT); controller.dispose(); }
    });
}
