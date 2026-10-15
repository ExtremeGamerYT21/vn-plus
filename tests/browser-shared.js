import { DEFAULT_ENVIRONMENT } from '../core/content-environments.js';

export async function runSharedChecks({ check, assert, equal, eventually, context, mountChat, emit, makeController }) {
    let controller = makeController();
    await check('shared chat variables expose resolved media, hidden player emotion, time and actual tint without private dialogue', async () => {
        controller.settings.showPlayerBust = false;
        context.chatId = 'shared-state-A'; context.chat = [{ mes: '[3 August 1991 | Before First Year | 9:00 p.m. | Summer | Shop]\nCANONICAL_SHARED_SECRET\n/////\n#BACKGROUND kitchen\n#MUSIC buzz\n#AMBIENT outside_noise\n#TINT #123456\n#ENTER Ashley\nJason: "PRIVATE_SHARED_DIALOGUE" [sad]\nAshley: "Next." [happy]\n#EXIT Ashley\n#BACKGROUND street\nAfter the exit.' }];
        mountChat(); emit('CHAT_CHANGED'); await controller.open(0);
        await eventually(() => controller.sharedVariables.available && !controller.sharedState.pending);
        const value = JSON.parse(context.variables.local.get('vn_plus'));
        equal(value.player.emotion, 'sad'); equal(value.player.present, false); equal(value.characters.map(character => character.id), ['ashley']);
        equal(value.timeOfDay, 'night'); equal(value.lighting.level, 1); equal(value.background.inside, true);
        equal(value.lighting.ambientColor, 'rgb(18, 52, 86)'); assert(value.background.asset.includes('kitchen.png')); assert(value.music.asset.includes('buzz.mp3'));
        equal(context.variables.local.get('vn_plus_player_emotion'), 'sad'); equal(context.variables.local.get('vn_plus_time'), '21:00');
        equal(context.chatMetadata.variables.unrelated, 'keep'); assert(!JSON.stringify(value).includes('PRIVATE_SHARED')); assert(!JSON.stringify(value).includes('CANONICAL_SHARED'));
    });
    await check('shared cast and emotions follow backward navigation and explicit exits', async () => {
        await controller.action('next'); await eventually(() => controller.sharedVariables.characters[0]?.emotion === 'happy');
        equal(controller.sharedVariables.speaker, 'ashley'); equal(controller.sharedVariables.player.emotion, 'sad');
        await controller.action('next'); await eventually(() => controller.sharedVariables.characters.length === 0);
        equal(controller.sharedVariables.background.name, 'street'); equal(controller.sharedVariables.lighting.level, 0);
        await controller.action('back'); await eventually(() => controller.sharedVariables.characters[0]?.emotion === 'happy');
        await controller.action('back'); await eventually(() => controller.sharedVariables.speaker === 'jason');
    });
    await check('shared snapshots publish mute, audio start, generation and closing while retaining the cached scene', async () => {
        let notification; const listener = event => { notification = event.detail; event.detail.player.emotion = 'changed externally'; };
        document.addEventListener('vnplus:state-changed', listener);
        try {
            controller.audio.setMusicMuted(false); await controller.audio.unlock(); await eventually(() => controller.sharedVariables.music.playing);
            await controller.action('mute-music'); equal(controller.sharedVariables.music.muted, true); equal(controller.sharedVariables.player.emotion, 'sad'); assert(notification);
            emit('GENERATION_STARTED', 'normal', {}, false); equal(controller.sharedVariables.generating, true); equal(controller.sharedVariables.background.name, 'kitchen');
            controller.close(); equal(controller.sharedVariables.active, false); equal(controller.sharedVariables.music.playing, false); equal(controller.sharedVariables.background.name, 'kitchen');
            emit('GENERATION_STOPPED'); equal(controller.sharedVariables.generating, false);
            await controller.open(0); await eventually(() => controller.sharedVariables.active && controller.sharedVariables.music.loaded);
        } finally { document.removeEventListener('vnplus:state-changed', listener); }
    });
    await check('shared scene publication rejects obsolete async resolutions across chat switches', async () => {
        const resolver = controller.resolver, original = resolver.background, oldMetadata = context.chatMetadata;
        let release; resolver.background = () => new Promise(resolve => release = resolve);
        await controller.action('next'); assert(controller.sharedState.pending);
        context.chatId = 'shared-state-B'; context.chat = [{ mes: 'SECRET\n/////\nA fresh chat.' }];
        mountChat(); emit('CHAT_CHANGED');
        resolver.background = original; release(resolver.url('backgrounds/street.png'));
        await eventually(() => controller.sharedVariables.available && controller.sharedVariables.background.name === null);
        equal(JSON.parse(oldMetadata.variables.vn_plus).player.emotion, 'sad');
        equal(context.chatMetadata.variables.vn_plus_player_emotion, ''); equal(context.chatMetadata.variables.vn_plus_music, '');
        equal(controller.sharedVariables.characters, []); equal(context.chatMetadata.variables.unrelated, 'keep');
    });
    await check('shared publication rebinds when SillyTavern reloads metadata for the same chat', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(context, 'chatMetadata'), replacement = { variables: { unrelated: 'replacement' } };
        Object.defineProperty(context, 'chatMetadata', { configurable: true, get: () => replacement });
        try {
            emit('CHAT_LOADED');
            await eventually(() => replacement.variables.vn_plus && JSON.parse(replacement.variables.vn_plus).available);
            equal(replacement.variables.unrelated, 'replacement'); equal(controller.sharedVariables.background.name, null);
        } finally { Object.defineProperty(context, 'chatMetadata', descriptor); emit('CHAT_LOADED'); }
        await eventually(() => controller.sharedState.binding.current() && !controller.sharedState.pending);
    });
    await check('shared cache survives reinitialization but environment switching clears the previous environment', async () => {
        controller.close(); const before = context.variables.local.get('vn_plus');
        controller.dispose(); controller = makeController();
        equal(context.variables.local.get('vn_plus'), before); equal(controller.sharedVariables.active, false);
        await controller.selectEnvironment(controller.environment.id === 'harry-potter' ? DEFAULT_ENVIRONMENT : 'harry-potter');
        equal(controller.sharedVariables.available, false); equal(controller.sharedVariables.characters, []); equal(context.chatMetadata.variables.vn_plus_background, '');
    });
    controller.dispose();
}
