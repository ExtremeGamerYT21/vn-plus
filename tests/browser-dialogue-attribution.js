import { chapterRequests } from '../core/speech-segments.js';

export async function runDialogueAttributionChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    const raw = 'PRIVATE\n/////\nNina: "Two millimetres," she repeated. [flat]\nYou straighten up.';
    context.chatId = 'dialogue-attribution'; context.chat = [{ mes: raw }]; mountChat();
    const controller = makeController();
    Object.assign(controller.settings, { reducedMotion: true, typewriterEffect: false, autoAdvance: false, autoCreateCharacters: false });
    controller.settings.characters.nina = { ...(controller.settings.characters.nina || {}), voiceId: 'nina-test' };
    controller.settings.tts.enabled = false; controller.settings.tts.autoGenerate = false; controller.settings.tts.narratorEnabled = false;
    try {
        await check('trailing speech attribution is absent from displayed dialogue transcript and the prepared Fish prompt', async () => {
            await controller.open(0);
            await eventually(() => controller.root.querySelector('.vn-text').textContent === '"Two millimetres,"');
            equal(controller.playback.restore().beat.token.emotion, 'flat');
            const segments = controller.speech.prepared.segments; equal(segments.length, 1); equal(segments[0].text, 'Two millimetres,');
            assert(!chapterRequests(segments, controller.settings.tts)[0].body.text.includes('she repeated'));
            controller.panel('transcript'); const panel = controller.root.querySelector('.vn-panel');
            assert(panel.textContent.includes('Two millimetres,')); assert(!panel.textContent.includes('she repeated'));
            panel.hidden = true; await controller.action('next');
            await eventually(() => controller.root.querySelector('.vn-text').textContent.includes('You straighten up.'));
            equal(context.chat[0].mes, raw);
        });
    } finally { controller.dispose(); }
}
