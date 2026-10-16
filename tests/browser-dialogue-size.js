export async function runDialogueSizeChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const paragraph = Array.from({ length: 12 }, (_, index) => `A complete line of dialogue ${index + 1}.`).join('\n');
    context.chatId = 'dialogue-growth';
    context.chat = [{ mes: `PRIVATE\n/////\n#MUSIC buzz\nNina: "Short."\nNina: "${paragraph}"\nNina: "Short again."` }]; mountChat();
    const controller = makeController();
    Object.assign(controller.settings, { autoAdvance: false, environmentCss: false, typewriterEffect: false, reducedMotion: true, autoCreateCharacters: false, dialogueFont: '', textScale: 1.15, dialogueBoxHeight: 180 });
    controller.settings.tts.enabled = false; controller.settings.tts.autoGenerate = false;
    const box = controller.root.querySelector('.vn-dialogue'), shell = controller.root.querySelector('.vn-dialogue-shell'), controls = controller.root.querySelector('.vn-controls'), header = controller.root.querySelector('.vn-top');
    const fit = () => box.scrollHeight <= box.clientHeight + 1;
    const inside = () => {
        assert(box.getBoundingClientRect().top >= header.getBoundingClientRect().bottom + 10);
        assert(box.getBoundingClientRect().bottom <= controls.getBoundingClientRect().top + 1);
        assert(controls.getBoundingClientRect().bottom <= innerHeight);
    };
    try {
        await check('dialogue grows past the old half-screen cap and shrinks for short text without a scrollbar', async () => {
            await controller.open(0); await eventually(() => controller.audio.channels.music.audio && controller.root.style.getPropertyValue('--vn-dialogue-max-height'));
            const initial = box.getBoundingClientRect().height, music = controller.audio.channels.music.audio;
            await controller.action('next'); await eventually(() => fit() && box.getBoundingClientRect().height > initial + 100);
            assert(box.getBoundingClientRect().height > innerHeight * .48); inside();
            equal(getComputedStyle(box).scrollbarWidth, 'none'); equal(getComputedStyle(box, '::-webkit-scrollbar').display, 'none');
            assert(controller.audio.channels.music.audio === music); equal(controller.playback.position, 1);
            await controller.action('next'); await eventually(() => box.getBoundingClientRect().height < initial + 1); inside();
        });
        await check('the parchment grows around long dialogue and buttons while typewriter reveal reserves its full height', async () => {
            controller.settings.environmentCss = true;
            controller.environmentStyle.read = () => fetch('../examples/harry-potter/dialogue.css').then(response => response.text());
            controller.environmentStyle.readSettings = async () => null; await controller.loadEnvironmentStyle();
            await controller.action('back'); await eventually(() => fit() && box.getBoundingClientRect().height > innerHeight * .4);
            inside(); equal(getComputedStyle(shell).display, 'flex');
            assert(controls.getBoundingClientRect().bottom <= shell.getBoundingClientRect().bottom + 1);
            Object.assign(controller.settings, { typewriterEffect: true, reducedMotion: false });
            await controller.dialogue.render({ type: 'dialogue', character: 'Nina', text: paragraph });
            assert(controller.dialogue.typing); const height = box.getBoundingClientRect().height;
            controller.dialogue.skip(); equal(box.getBoundingClientRect().height, height); assert(fit());
        });
        await check('toolbar resizing updates available text height and oversized passages retain hidden-bar scrolling and reset on navigation', async () => {
            const previous = controller.root.style.getPropertyValue('--vn-dialogue-max-height');
            header.style.paddingBlock = '50px';
            await eventually(() => parseFloat(controller.root.style.getPropertyValue('--vn-dialogue-max-height')) < parseFloat(previous));
            header.style.paddingBlock = ''; await eventually(() => controller.root.style.getPropertyValue('--vn-dialogue-max-height') === previous);
            Object.assign(controller.settings, { typewriterEffect: false, reducedMotion: true });
            await controller.dialogue.render({ type: 'narration', text: `${paragraph}\n`.repeat(15) });
            assert(!fit()); inside(); box.scrollTop = box.scrollHeight; assert(box.scrollTop > 0);
            equal(getComputedStyle(box).scrollbarWidth, 'none');
            await controller.action('next'); equal(box.scrollTop, 0); assert(fit());
            equal(context.chat[0].mes, `PRIVATE\n/////\n#MUSIC buzz\nNina: "Short."\nNina: "${paragraph}"\nNina: "Short again."`);
        });
    } finally { controller.dispose(); }
}
