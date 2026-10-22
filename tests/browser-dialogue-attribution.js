import { chapterRequests } from '../core/speech-segments.js';
import { inlinePassage, inlineDialogue, inlineNarration } from './inline-narration-fixture.js';

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
    await check('mixed quoted paragraphs display and voice their narration separately while character fragments remain one utterance', async () => {
        const raw = `PRIVATE\n/////\nProfessor: ${inlinePassage} [stern]`;
        context.chatId = 'inline-narration'; context.chat = [{ mes: raw }]; mountChat();
        const mixed = makeController();
        Object.assign(mixed.settings, { reducedMotion: true, typewriterEffect: false, autoAdvance: false, autoCreateCharacters: false });
        mixed.settings.characters.professor = { displayName: 'Professor', voiceId: 'professor-test' };
        mixed.settings.characters.narrator = { displayName: 'Storyteller', voiceId: 'story-test' };
        Object.assign(mixed.settings.tts, { enabled: false, autoGenerate: false, narratorEnabled: true });
        try {
            await mixed.open(0);
            const plan = chapterRequests(mixed.speech.prepared.segments, mixed.settings.tts), dialogue = plan.find(chapter => chapter.kind === 'dialogue');
            equal(dialogue.body.text.match(/<\|speaker:/g).length, 1); assert(!/says|desk|drops/.test(dialogue.body.text));
            equal(plan.find(chapter => chapter.kind === 'narration').body.reference_id, ['story-test']);
            const texts = inlineDialogue.flatMap((text, index) => index < inlineNarration.length ? [text, inlineNarration[index]] : [text]);
            for (const [index, text] of texts.entries()) {
                if (index) await mixed.action('next');
                equal(mixed.root.querySelector('.vn-text').textContent, text);
                equal(mixed.root.querySelector('.vn-speaker').textContent, index % 2 ? 'Storyteller' : 'Professor');
            }
            mixed.panel('transcript'); assert(mixed.root.querySelector('.vn-panel').textContent.includes(inlineNarration[1]));
            equal(context.chat[0].mes, raw);
        } finally { mixed.dispose(); }
    });
}
