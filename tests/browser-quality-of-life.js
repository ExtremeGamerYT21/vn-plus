export async function runQualityOfLifeChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    context.chatId = 'qol'; context.chat = [{ mes: 'PRIVATE_CANONICAL' }]; mountChat();
    const controller = makeController(), status = controller.root.querySelector('.vn-status');
    Object.assign(controller.settings, { autoCreateCharacters: false, autoAdvance: false, typewriterEffect: false, reducedMotion: true, crossfadeDuration: 0, musicMuted: false, characters: {} });
    Object.assign(controller.settings.tts, { enabled: false, autoGenerate: false, muted: false });
    const set = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
    const nextSource = text => { context.chat[0].mes = `PRIVATE_CANONICAL\n/////\n${text}`; mountChat(); };
    try {
        await check('missing POV shows an accessible themed waiting screen and manual checking recovers without leaving VN', async () => {
            await controller.open(0); equal(status.dataset.phase, 'pov'); assert(!status.hidden); assert(status.querySelector('.vn-loading-card'));
            equal(controller.root.getAttribute('aria-busy'), 'true'); assert(controller.root.querySelector('[data-action=next]').disabled);
            assert(!controller.root.textContent.includes('PRIVATE_CANONICAL')); equal(getComputedStyle(status.querySelector('.vn-loading-spinner')).animationName, 'none');
            await controller.action('next'); assert(!status.hidden);
            nextSource('Nina: "Ready now."'); status.querySelector('[data-action=check-pov]').click();
            await eventually(() => status.hidden && controller.root.querySelector('.vn-text').textContent.includes('Ready now.'));
            assert(!controller.root.hasAttribute('aria-busy')); assert(!controller.root.querySelector('[data-action=reply]').disabled);
        });
        await check('unfinished POV stays on the loading screen and silent transformer completion opens the scene automatically', async () => {
            nextSource('Nina: "Still being written'); await controller.open(0); equal(status.dataset.phase, 'pov'); assert(!status.hidden);
            nextSource('Nina: "Finished transforming."'); controller.sourceMonitor.wake();
            await eventually(() => status.hidden && controller.root.querySelector('.vn-text').textContent.includes('Finished transforming.'));
        });
        await check('generation and an empty chat have distinct waiting states with blocked stale navigation', async () => {
            controller.beginGeneration(); equal(status.dataset.phase, 'generating'); assert(status.querySelector('button').disabled);
            await controller.action('next'); assert(!status.hidden);
            controller.busy = false; context.chat = []; mountChat(); await controller.open(); equal(status.dataset.phase, 'empty');
            equal(controller.root.getAttribute('aria-busy'), 'false'); assert(!status.querySelector('button').disabled);
            context.chat = [{ mes: 'PRIVATE_CANONICAL\n/////\n#MUSIC buzz\n#AMBIENT outside_noise\nNina: "Adjust the audio."\nNina: "Next line."' }]; mountChat();
        });
        await check('quick mixer applies live voice music ambience and SFX percentages without replay or navigation', async () => {
            await controller.audio.unlock(); await controller.open(0); await eventually(() => controller.audio.channels.music.audio && controller.audio.channels.ambient.audio);
            const music = controller.audio.channels.music.audio, ambient = controller.audio.channels.ambient.audio; music.currentTime = 27;
            const voice = { plays: 0, paused: true, currentTime: .4, async play() { this.plays++; this.paused = false; }, pause() { this.paused = true; }, removeAttribute() {}, load() {} };
            controller.speech.audioFactory = () => voice; await controller.speech.beginAudio(new Float32Array(4410), {});
            const position = controller.playback.position, plays = music.plays; let reconfigured = 0;
            controller.speech.configurationChanged = () => { reconfigured++; };
            await controller.action('audio'); const mixer = controller.audioMixer.node;
            for (const [key, value] of [['voice', .31], ['music', .19], ['ambient', .12], ['sfx', .07]]) set(mixer.querySelector(`[data-mixer-volume="${key}"]`), value);
            equal(voice.volume, .31); equal(music.volume, .19); equal(ambient.volume, .12); equal(controller.settings.sfxVolume, .07);
            equal(voice.currentTime, .4); equal(voice.plays, 1); equal(music.currentTime, 27); equal(music.plays, plays); equal(controller.playback.position, position); equal(reconfigured, 0);
            equal(mixer.querySelector('[data-mixer-volume=voice]').getAttribute('aria-valuetext'), '31%');
            equal(controller.settingsPanel.querySelector('[data-speech-setting=volume]').value, '0.31');
            equal(context.extensionSettings.visual_novel_plus.musicVolume, .19);
            const input = mixer.querySelector('input'); input.focus();
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); equal(controller.playback.position, position);
            const close = controller.root.querySelector('.vn-panel [data-action=close-panel]'); close.focus();
            const tab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }); close.dispatchEvent(tab);
            assert(tab.defaultPrevented); assert(document.activeElement === mixer.querySelector('[data-mixer-mute=music]'));
        });
        await check('settings sliders and mute switches synchronize both voice panels and retain chosen levels', async () => {
            const mixer = controller.audioMixer.node, music = controller.audio.channels.music.audio, voice = controller.speech.audio;
            set(controller.settingsPanel.querySelector('[data-setting=musicVolume]'), .41);
            set(controller.settingsPanel.querySelector('[data-speech-setting=volume]'), .23);
            equal(music.volume, .41); equal(voice.volume, .23); equal(mixer.querySelector('[data-mixer-volume=music]').value, '0.41');
            equal(controller.voicePanel.node.querySelector('[data-speech-setting=volume]').value, '0.23');
            mixer.querySelector('[data-mixer-mute=voice]').click(); mixer.querySelector('[data-mixer-mute=music]').click();
            assert(voice.muted && music.muted); equal(voice.volume, .23); equal(music.volume, .41);
            assert(controller.settingsPanel.querySelector('[data-setting=musicMuted]').checked); assert(context.extensionSettings.visual_novel_plus.tts.muted);
            mixer.querySelector('[data-mixer-mute=voice]').click(); await controller.action('mute-music');
            assert(!voice.muted && !music.muted); equal(voice.plays, 1); equal(voice.volume, .23);
            await controller.action('close-panel');
        });
        await check('scene preparation errors offer a working retry and closing clears loading state', async () => {
            const prepare = controller.registry.prepare; controller.registry.prepare = async () => { throw new Error('fixture unavailable'); };
            nextSource('Nina: "Retry recovered."'); await controller.open(0); equal(status.dataset.phase, 'error'); assert(!status.hidden); assert(!status.querySelector('button').disabled);
            controller.registry.prepare = prepare; status.querySelector('button').click();
            await eventually(() => status.hidden && controller.root.querySelector('.vn-text').textContent.includes('Retry recovered.'));
            nextSource(''); await controller.open(0); assert(!status.hidden); controller.close(); assert(status.hidden); assert(!controller.root.hasAttribute('aria-busy'));
        });
    } finally { controller.dispose(); }
}
