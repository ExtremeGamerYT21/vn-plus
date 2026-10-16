export async function runMediaHistoryChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const assistant = pov => ({ mes: `PRIVATE\n/////\n${pov}` });
    context.chatId = 'deep-media-history';
    context.chat = Array.from({ length: 90 }, () => assistant('Quiet.'));
    context.chat[0] = assistant('#BACKGROUND kitchen\n#SFX door');
    context.chat[8] = assistant('#MUSIC buzz slowed');
    context.chat[24] = assistant('#BACKGROUND street');
    context.chat[48] = assistant('#SCENE RESET\n#BACKGROUND CLEAR\n#MUSIC STOP\nQuiet.');
    context.chat[70] = { ...assistant('#BACKGROUND rejected\n#MUSIC rejected'), is_user: true };
    context.chat[71] = { mes: '#BACKGROUND canonical_secret\n#MUSIC canonical_secret' };
    context.chat.push(assistant('Nina: "The current turn has no media commands." [happy]')); mountChat();
    const controller = makeController();
    Object.assign(controller.settings, { autoCreateCharacters: false, typewriterEffect: false, autoAdvance: false, reducedMotion: true, spriteBreathing: false, sceneLightEnabled: false });
    controller.settings.tts.enabled = false; controller.settings.tts.autoGenerate = false;
    let music, plays, historicalEffects = 0;
    controller.audio.sfx = async () => historicalEffects++;
    try {
        await check('cold open recovers independent background and music from deep history across scene resets and retired clears', async () => {
            const original = context.chat.map(message => message.mes);
            await controller.audio.unlock(); await controller.open();
            await eventually(() => controller.stage.backgroundUrl?.endsWith('/street.png') && controller.audio.channels.music.audio?.src.endsWith('/buzz.mp3'));
            music = controller.audio.channels.music.audio; plays = music.plays;
            equal(music.playbackRate, .75); equal(historicalEffects, 0); equal(context.chat.map(message => message.mes), original);
            equal(controller.playback.restore().beat.state.background, 'street'); equal(controller.playback.restore().beat.state.music.name, 'buzz');
        });
        await check('command-free turns and fade black reuse the inherited media without restarting the player', async () => {
            context.chat.push(assistant('#SCENE RESET\n#BACKGROUND NONE\n#MUSIC STOP\n#FADE BLACK\nDark.\n#FADE IN\nNARRATION\nVisible again.')); mountChat();
            await controller.open(); await eventually(() => controller.root.classList.contains('vn-black'));
            assert(controller.audio.channels.music.audio === music); equal(music.plays, plays);
            equal(controller.stage.backgroundUrl.split('/').at(-1), 'street.png');
            await controller.action('next'); assert(!controller.root.classList.contains('vn-black'));
            assert(controller.audio.channels.music.audio === music); equal(music.plays, plays); equal(historicalEffects, 0);
            await eventually(() => controller.playbackVariables.background?.name === 'street' && controller.playbackVariables.music?.name === 'buzz');
        });
        await check('earlier media edits refresh fallback at the same paragraph and closed context agrees with playback', async () => {
            const position = controller.playback.position;
            context.chat[24] = assistant('#BACKGROUND kitchen'); context.chat[8] = assistant('#MUSIC club');
            await controller.open();
            await eventually(() => controller.stage.backgroundUrl?.endsWith('/kitchen.png') && controller.audio.channels.music.audio?.src.endsWith('/club.mp3'));
            equal(controller.playback.position, position); assert(controller.root.querySelector('.vn-text').textContent.includes('Visible again.'));
            controller.close();
            await eventually(() => controller.sharedVariables.background.name === 'kitchen' && controller.sharedVariables.music.name === 'club');
            equal(controller.sharedVariables.active, false); equal(historicalEffects, 0);
        });
    } finally { controller.dispose(); }
}
