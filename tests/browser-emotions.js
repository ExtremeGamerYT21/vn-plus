export async function runEmotionChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const source = 'PRIVATE\n/////\nNina: "A happy moment." [joy]\nNina: "A painful memory." [heartbroken]\nNina: "What was that?" [shocked]';
    context.chatId = 'ranked-emotions'; context.chat = [{ mes: source }]; mountChat();
    const controller = makeController(), blinks = [];
    Object.assign(controller.settings, { autoAdvance: false, typewriterEffect: false, reducedMotion: false, expressionTransition: 100, autoCreateCharacters: false });
    controller.settings.tts.enabled = false;
    controller.settings.characters = { nina: { blink: { enabled: true } } };
    controller.resolver.blinkSprite = async (id, emotions) => { blinks.push({ id, emotions }); return null; };
    let node;
    try {
        await check('ranked ST emotion tags render existing legacy bust art while retaining the story emotion', async () => {
            await controller.open(0);
            await eventually(() => { node = controller.stage.nodes.get('nina'); return node?.dataset.sprite?.endsWith('/happy.webp'); });
            equal(node.dataset.expression, 'joy');
            equal(controller.playback.restore().beat.state.characters.nina.expression, 'joy');
            const report = controller.resolver.diagnostics.get('emotion:nina:joy');
            equal(report.canonical, 'joy'); equal(report.rank, 1); equal(report.matched, 'happy.webp');
            equal(context.chat[0].mes, source);
        });
        await check('ranked fallbacks update and restore expressions without replacing the character body', async () => {
            await controller.action('next'); await eventually(() => node.dataset.sprite?.endsWith('/sad.webp'));
            equal(node.dataset.expression, 'heartbroken'); assert(controller.stage.nodes.get('nina') === node);
            await controller.action('back'); await eventually(() => node.dataset.sprite?.endsWith('/happy.webp'));
            assert(controller.stage.nodes.get('nina') === node);
            await controller.action('next'); await controller.action('next');
            await eventually(() => node.dataset.sprite?.endsWith('/surprise.webp'));
            equal(node.dataset.expression, 'shocked');
        });
        await check('blink lookup follows the selected fallback image rather than the original story tag', async () => {
            await eventually(() => blinks.some(entry => entry.emotions[0] === 'surprise'));
            assert(blinks.some(entry => entry.emotions[0] === 'happy')); assert(blinks.some(entry => entry.emotions[0] === 'sad'));
            assert(blinks.every(entry => entry.emotions.length === 1 && !['joy', 'heartbroken', 'shocked'].includes(entry.emotions[0])));
        });
        await check('a character override can supersede the master ranking while prose stays unchanged', async () => {
            controller.settings.characters.nina.expressionAliases = { joy: 'smile' };
            controller.sceneRevision = null; await controller.open(0); await controller.action('replay');
            await eventually(() => node.dataset.sprite?.endsWith('/smile.webp'));
            equal(controller.resolver.diagnostics.get('emotion:nina:joy').method, 'character-alias');
            equal(context.chat[0].mes, source);
        });
    } finally { controller.dispose(); }
}
