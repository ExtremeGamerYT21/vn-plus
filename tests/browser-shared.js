import { DEFAULT_ENVIRONMENT } from '../core/content-environments.js';

export async function runSharedChecks({ check, assert, equal, eventually, context, mountChat, emit, makeController }) {
    let controller = makeController();
    await check('shared chat variables expose resolved media, hidden player emotion, time and actual tint without private dialogue', async () => {
        controller.settings.showPlayerBust = false;
        context.chatId = 'shared-state-A'; context.chat = [{ mes: '[3 August 1991 | Before First Year | 9:00 p.m. | Summer | Shop]\nCANONICAL_SHARED_SECRET\n/////\n#BACKGROUND kitchen\n#MUSIC buzz\n#AMBIENT outside_noise\n#TINT #123456\n#ENTER Ashley\nJason: "PRIVATE_SHARED_DIALOGUE" [sad]\nAshley: "Next." [happy]\n#EXIT Ashley\n#BACKGROUND street\nAfter the exit.' }];
        mountChat(); emit('CHAT_CHANGED'); await controller.open(0);
        await eventually(() => controller.playbackVariables.available && !controller.playbackState.pending);
        const value = JSON.parse(context.variables.local.get('vn_plus_playback'));
        equal(value.player.emotion, 'sad'); equal(value.player.present, false); equal(value.characters.map(character => character.id), ['ashley']);
        equal(value.timeOfDay, 'night'); equal(value.lighting.level, 1); equal(value.background.inside, true);
        equal(value.lighting.ambientColor, 'rgb(18, 52, 86)'); assert(value.background.asset.includes('kitchen.png')); assert(value.music.asset.includes('buzz.mp3'));
        equal(context.variables.local.get('vn_plus_player_emotion'), 'sad'); equal(context.variables.local.get('vn_plus_time'), '21:00');
        equal(context.chatMetadata.variables.unrelated, 'keep'); assert(!JSON.stringify(value).includes('PRIVATE_SHARED')); assert(!JSON.stringify(value).includes('CANONICAL_SHARED'));
    });
    await check('shared cast and emotions follow backward navigation and explicit exits', async () => {
        await controller.action('next'); await eventually(() => controller.playbackVariables.characters[0]?.emotion === 'happy');
        equal(controller.playbackVariables.speaker, 'ashley'); equal(controller.playbackVariables.player.emotion, 'sad');
        await controller.action('next'); await eventually(() => controller.playbackVariables.characters.length === 0);
        equal(controller.playbackVariables.background.name, 'street'); equal(controller.playbackVariables.lighting.level, 0);
        await controller.action('back'); await eventually(() => controller.playbackVariables.characters[0]?.emotion === 'happy');
        await controller.action('back'); await eventually(() => controller.playbackVariables.speaker === 'jason');
    });
    await check('shared snapshots publish mute, audio start, generation and closing while retaining the cached scene', async () => {
        let notification; const listener = event => { notification = event.detail; if (event.detail.player) event.detail.player.emotion = 'changed externally'; };
        document.addEventListener('vnplus:state-changed', listener);
        try {
            controller.audio.setMusicMuted(false); await controller.audio.unlock(); await eventually(() => controller.playbackVariables.music.playing);
            await controller.action('mute-music'); equal(controller.playbackVariables.music.muted, true); equal(controller.playbackVariables.player.emotion, 'sad'); assert(notification);
            emit('GENERATION_STARTED', 'normal', {}, false); equal(controller.playbackVariables.generating, true); equal(controller.playbackVariables.background.name, 'kitchen');
            controller.close(); equal(controller.playbackVariables.active, false); equal(controller.playbackVariables.music.playing, false); equal(controller.playbackVariables.background.name, 'kitchen');
            emit('GENERATION_STOPPED'); equal(controller.playbackVariables.generating, false);
            await controller.open(0); await eventually(() => controller.playbackVariables.active && controller.playbackVariables.music.loaded);
        } finally { document.removeEventListener('vnplus:state-changed', listener); }
    });
    await check('shared scene publication rejects obsolete async resolutions across chat switches', async () => {
        const resolver = controller.resolver, original = resolver.background, oldMetadata = context.chatMetadata;
        let release; resolver.background = () => new Promise(resolve => release = resolve);
        await controller.action('next'); assert(controller.playbackState.pending);
        context.chatId = 'shared-state-B'; context.chat = [{ mes: 'SECRET\n/////\nA fresh chat.' }];
        mountChat(); emit('CHAT_CHANGED');
        resolver.background = original; release(resolver.url('backgrounds/street.png'));
        await eventually(() => controller.playbackVariables.available && controller.playbackVariables.background.name === null);
        equal(JSON.parse(oldMetadata.variables.vn_plus).player.emotion, 'sad');
        equal(context.chatMetadata.variables.vn_plus_player_emotion, ''); equal(context.chatMetadata.variables.vn_plus_music, '');
        equal(controller.playbackVariables.characters, []); equal(context.chatMetadata.variables.unrelated, 'keep');
    });
    await check('shared publication rebinds when SillyTavern reloads metadata for the same chat', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(context, 'chatMetadata'), replacement = { variables: { unrelated: 'replacement' } };
        Object.defineProperty(context, 'chatMetadata', { configurable: true, get: () => replacement });
        try {
            emit('CHAT_LOADED');
            await eventually(() => replacement.variables.vn_plus_playback && JSON.parse(replacement.variables.vn_plus_playback).available);
            equal(replacement.variables.unrelated, 'replacement'); equal(controller.playbackVariables.background.name, null);
        } finally { Object.defineProperty(context, 'chatMetadata', descriptor); emit('CHAT_LOADED'); }
        await eventually(() => controller.playbackState.binding.current() && !controller.playbackState.pending);
    });
    await check('context is reconstructed after reinitialization and an environment change', async () => {
        controller.close();
        controller.dispose(); controller = makeController();
        equal(controller.sharedVariables.available, false); equal(controller.playbackVariables.active, false);
        await eventually(() => controller.sharedVariables.available && !controller.sharedVariables.updating);
        equal(controller.sharedVariables.background.name, null); equal(controller.sharedVariables.active, false);
        await controller.selectEnvironment(controller.environment.id === 'harry-potter' ? DEFAULT_ENVIRONMENT : 'harry-potter');
        equal(controller.sharedVariables.available, false);
        await eventually(() => controller.sharedVariables.available && !controller.sharedVariables.updating);
        equal(controller.sharedVariables.environment.id, controller.environment.id); equal(context.chatMetadata.variables.vn_plus_background, '');
    });
    await check('closed VN reconstructs current context instead of trusting a stored snapshot or accumulating every old speaker', async () => {
        await controller.selectEnvironment(DEFAULT_ENVIRONMENT);
        context.chatId = 'context-live'; context.chat = [
            { mes: '[3 August 1991 | Before First Year | 9:00 p.m. | Summer | Shop]\nPRIVATE_CONTEXT\n/////\n#BACKGROUND kitchen\n#MUSIC buzz\nAshley: "PRIVATE_OLD" [happy]\nJason: "Old." [sad]' },
            { mes: 'SECRET\n/////\nQuiet.' },
            { mes: 'SECRET\n/////\nNina: "Recent." [happy]' },
            { mes: 'SECRET\n/////\nQuiet again.' },
        ];
        context.chatMetadata.variables.vn_plus = JSON.stringify({ schemaVersion: 1, environment: { id: DEFAULT_ENVIRONMENT }, available: true, characters: [{ id: 'stale_person' }], background: { name: 'stale_background' } });
        mountChat(); emit('CHAT_CHANGED');
        equal(controller.sharedVariables.available, false); equal(controller.sharedVariables.updating, true);
        await eventually(() => controller.sharedVariables.available && !controller.sharedVariables.updating);
        const value = controller.sharedVariables;
        equal(value.basis, 'context'); equal(value.source.message, 3); equal(value.characters.map(character => character.id), ['nina']);
        equal(value.player.emotion, 'sad'); equal(value.background.name, 'kitchen'); equal(value.scene.time, '21:00');
        equal(value.active, false); equal(value.music.playing, false); assert(value.music.asset.endsWith('/buzz.mp3'));
        equal(controller.audio.sources.size, 0); equal(controller.stage.nodes.size, 0); assert(!JSON.stringify(value).includes('PRIVATE_')); assert(!JSON.stringify(value).includes('stale_person'));
    });
    await check('edits while VN is closed synchronously invalidate old variables and rebuild media time and emotion', async () => {
        context.chat[2].mes = '[3 August 1991 | Before First Year | 11:00 p.m. | Summer | Shop]\nSECRET\n/////\n#BACKGROUND street\n#MUSIC club\nNina: "Edited." [angry]';
        emit('MESSAGE_UPDATED', 2); equal(context.chatMetadata.variables.vn_plus_available, 'false');
        await eventually(() => controller.sharedVariables.available && controller.sharedVariables.background.name === 'street');
        equal(controller.sharedVariables.scene.time, '23:00'); equal(controller.sharedVariables.characters[0].emotion, 'angry');
        equal(controller.sharedVariables.music.name, 'club'); equal(controller.sharedVariables.lighting.level, 0); equal(controller.audio.sources.size, 0);
    });
    await check('historical playback has its own variables and opening without an index uses the latest context', async () => {
        const original = JSON.stringify(context.chat);
        await controller.open(0); await eventually(() => controller.playbackVariables.available && !controller.playbackState.pending);
        equal(controller.playbackVariables.background.name, 'kitchen'); equal(controller.playbackVariables.source.message, 0);
        equal(controller.sharedVariables.background.name, 'street'); equal(controller.sharedVariables.source.message, 3);
        equal(controller.sharedVariables.music.loaded, false);
        await controller.open(); await eventually(() => controller.playbackVariables.source?.message === 3 && !controller.playbackState.pending);
        equal(controller.playbackVariables.characters.map(character => character.id), ['nina']); equal(controller.playbackVariables.background.name, 'street');
        equal(JSON.stringify(context.chat), original); controller.close();
    });
    await check('completed generation updates context while closed but streaming text and past effects never run', async () => {
        const source = controller.sharedVariables.source.message, sfx = controller.audio.sfx; let effects = 0;
        controller.audio.sfx = async () => effects++;
        try {
            emit('GENERATION_STARTED', 'normal', {}, false);
            context.chat.push({ mes: 'SECRET\n/////\n#BACKGROUND kitchen\nNina: "Unfinished' }); emit('MESSAGE_RECEIVED', 4);
            equal(controller.sharedVariables.source.message, source); equal(controller.sharedVariables.generating, true);
            context.chat[4].mes = 'SECRET\n/////\n#BACKGROUND kitchen\n#MUSIC buzz\n#SFX door\nNina: "Finished." [sad]\n<div>PRIVATE_HTML</div>';
            emit('GENERATION_ENDED');
            await eventually(() => controller.sharedVariables.available && controller.sharedVariables.source.message === 4);
            equal(controller.sharedVariables.characters[0].emotion, 'sad'); equal(controller.sharedVariables.background.name, 'kitchen');
            equal(controller.sharedVariables.generating, false); equal(controller.sharedVariables.active, false); equal(effects, 0); equal(controller.audio.sources.size, 0); assert(!controller.html.active);
        } finally { controller.audio.sfx = sfx; }
    });
    await check('opening reconstructs context edits even when the editing extension emitted no event', async () => {
        context.chat[4].mes = 'SECRET\n/////\n#BACKGROUND street\n#MUSIC STOP\n#EXIT Nina\nChanged silently.';
        await controller.open(); await eventually(() => controller.sharedVariables.available && controller.sharedVariables.music.name === null);
        equal(controller.sharedVariables.background.name, 'street'); equal(controller.sharedVariables.characters, []); equal(controller.sharedVariables.source.message, 4);
        controller.close();
    });
    await check('deleting the latest response rebuilds closed context from the remaining selected messages', async () => {
        context.chat.pop(); mountChat(); emit('MESSAGE_DELETED');
        await eventually(() => controller.sharedVariables.available && controller.sharedVariables.source.message === 3);
        equal(controller.sharedVariables.music.name, 'club'); equal(controller.sharedVariables.characters[0].id, 'nina'); equal(controller.sharedVariables.scene.time, '23:00');
    });
    await check('the cast memory setting rebuilds closed context and supports persistent presence until exit', async () => {
        const input = controller.settingsPanel.querySelector('[data-setting="castMemoryTurns"]');
        input.value = '0'; input.dispatchEvent(new Event('change', { bubbles: true }));
        await eventually(() => controller.sharedVariables.available && controller.sharedVariables.characters.some(character => character.id === 'ashley'));
        equal(controller.settings.castMemoryTurns, 0); equal(controller.sharedVariables.active, false); equal(controller.audio.sources.size, 0);
        input.value = '3'; input.dispatchEvent(new Event('change', { bubbles: true }));
        await eventually(() => controller.sharedVariables.available && controller.sharedVariables.characters.length === 1);
        equal(controller.sharedVariables.characters[0].id, 'nina');
    });
    await check('obsolete context asset loads cannot write into another chat and a chat without POV has no stale state', async () => {
        const resolver = controller.contextResolver, original = resolver.background; let release;
        resolver.background = () => new Promise(resolve => release = resolve);
        context.chat.push({ mes: 'SECRET\n/////\n#BACKGROUND kitchen\nNew.' }); emit('MESSAGE_RECEIVED', 4);
        await eventually(() => release);
        context.chatId = 'context-empty'; context.chat = [{ mes: 'PRIVATE_NO_POV' }]; mountChat(); emit('CHAT_CHANGED');
        resolver.background = original; release(resolver.url('backgrounds/kitchen.png'));
        await eventually(() => controller.sharedVariables.basis === 'context' && !controller.sharedVariables.updating);
        equal(controller.sharedVariables.available, false); equal(controller.sharedVariables.characters, []); equal(controller.sharedVariables.background.name, null);
        equal(context.chatMetadata.variables.vn_plus_music, ''); equal(controller.audio.sources.size, 0);
    });
    controller.dispose();
}
