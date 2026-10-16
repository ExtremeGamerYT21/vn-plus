export async function runDialogueSizeChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const paragraph = 'The shopkeeper studied the cloth carefully while footsteps echoed outside the open doorway. '.repeat(5).trim();
    context.chatId = 'dialogue-growth';
    context.chat = [{ mes: `PRIVATE\n/////\n#MUSIC buzz\nNina: "Short."\nNina: "${paragraph}"\nNina: "Short again."` }]; mountChat();
    const controller = makeController();
    Object.assign(controller.settings, { autoAdvance: false, environmentCss: false, typewriterEffect: false, reducedMotion: true, autoCreateCharacters: false, dialogueFont: '', textScale: 1.15, dialogueBoxHeight: 240, dialogueBoxWidth: 40 });
    controller.settings.tts.enabled = false; controller.settings.tts.autoGenerate = false;
    const box = controller.root.querySelector('.vn-dialogue'), shell = controller.root.querySelector('.vn-dialogue-shell'), controls = controller.root.querySelector('.vn-controls'), header = controller.root.querySelector('.vn-top');
    const fit = () => box.scrollHeight <= box.clientHeight + 1;
    const inside = () => {
        assert(box.getBoundingClientRect().top >= header.getBoundingClientRect().bottom + 10);
        assert(box.getBoundingClientRect().bottom <= controls.getBoundingClientRect().top + 1);
        assert(controls.getBoundingClientRect().bottom <= innerHeight);
    };
    try {
        await check('dialogue widens for long text at the same height and restores its normal width for short lines', async () => {
            await controller.open(0); await eventually(() => controller.audio.channels.music.audio && controller.root.style.getPropertyValue('--vn-dialogue-max-height'));
            const initial = box.getBoundingClientRect(), music = controller.audio.channels.music.audio;
            equal([...controls.querySelectorAll('button')].map(button => button.dataset.action), ['back', 'next', 'auto', 'reply']);
            assert(!controller.settingsPanel.textContent.includes('Replay selected'));
            await controller.action('next'); await eventually(() => fit() && box.getBoundingClientRect().width > initial.width + 20);
            equal(box.getBoundingClientRect().height, initial.height); assert(box.getBoundingClientRect().width <= innerWidth * .94 + 1); inside();
            equal(getComputedStyle(box).scrollbarWidth, 'none'); equal(getComputedStyle(box, '::-webkit-scrollbar').display, 'none');
            assert(controller.audio.channels.music.audio === music); equal(controller.playback.position, 1);
            await controller.action('next'); await eventually(() => box.getBoundingClientRect().width <= initial.width + 1);
            equal(box.getBoundingClientRect().height, initial.height); inside();
        });
        await check('the parchment expands horizontally and reserves the full width before typewriter or voice reveal', async () => {
            controller.settings.environmentCss = true;
            controller.environmentStyle.read = () => fetch('../examples/harry-potter/dialogue.css').then(response => response.text());
            controller.environmentStyle.readSettings = async () => null; await controller.loadEnvironmentStyle();
            await eventually(() => controller.root.style.getPropertyValue('--vn-dialogue-auto-width') === '');
            const initial = box.getBoundingClientRect();
            await controller.action('back'); await eventually(() => fit() && box.getBoundingClientRect().width > initial.width + 1);
            equal(box.getBoundingClientRect().height, initial.height);
            inside(); equal(getComputedStyle(shell).display, 'flex');
            assert(controls.getBoundingClientRect().bottom <= shell.getBoundingClientRect().bottom + 1);
            Object.assign(controller.settings, { typewriterEffect: true, reducedMotion: false });
            await controller.dialogue.render({ type: 'dialogue', character: 'Nina', text: paragraph });
            assert(controller.dialogue.typing); const height = box.getBoundingClientRect().height, width = box.getBoundingClientRect().width;
            controller.dialogue.skip(); equal(box.getBoundingClientRect().height, height); equal(box.getBoundingClientRect().width, width); assert(fit());
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
