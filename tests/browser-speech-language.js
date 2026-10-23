import { speechTokens } from '../core/speech-text.js';

export async function runLanguageVoiceChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    context.chatId = 'language-browser-voices';
    const source = 'PRIVATE\n/////\nHenry: "Do it as I say, ja?" [serious]\nHenry: "Ja, wir gehen jetzt nach Hause." [hurried]\nJason: "Ich bin gleich bereit."\nJason: "I understand, Dad."';
    context.chat = [{ mes: source }]; mountChat();
    const controller = makeController(), requests = [];
    Object.assign(controller.settings, { autoCreateCharacters: false, autoAdvance: false, typewriterEffect: false, reducedMotion: true,
        characters: { henry: { voiceId: 'henry-language-fixture' }, jason: { voiceId: 'jason-language-fixture' } } });
    Object.assign(controller.settings.tts, { enabled: true, autoGenerate: true, autoPlay: false, chapterSize: 6, splitChapters: false, parallelBatches: 3, narratorEnabled: false, isolateVoices: false });
    controller.speech.endpoint = async (path, options) => {
        if (path === 'status') return Response.json({ configured: true, maxParallelBatches: 5 });
        const request = JSON.parse(options.body); requests.push(request);
        const words = speechTokens(request.body.text).map((text, index) => ({ text, start: .1 + index * .1, end: .18 + index * .1 }));
        return new Response(`data: ${JSON.stringify({ audio_base64: btoa('fixture'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: words } })}\n\n`);
    };
    controller.speech.decode = async () => new Float32Array(44100 * 4);
    controller.speech.process = async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, samples: new Float32Array(4410), notes: [] }));
    try {
        await check('whole German lines generate together apart from English with language labels and intact VN text', async () => {
            await controller.open(0); await eventually(() => controller.speech.job?.status === 'complete');
            equal(requests.length, 3); equal(controller.speech.job.plan.map(chapter => chapter.language), ['en', 'de', 'en']);
            const german = controller.speech.job.plan[1];
            equal(german.body.reference_id, ['henry-language-fixture', 'jason-language-fixture']);
            assert(german.body.text.includes('<|speaker:0|>[in a hurry tone] Ja, wir gehen jetzt nach Hause.'));
            assert(german.body.text.includes('<|speaker:1|>Ich bin gleich bereit.')); assert(!german.body.text.includes('Ya'));
            assert(requests.some(request => request.body.text.includes('Do it as I say, ya?')));
            const labels = [...controller.voicePanel.segments.querySelectorAll('small')].map(node => node.textContent);
            equal(labels.filter(label => label.endsWith('German')).length, 2); equal(labels.filter(label => label.endsWith('English')).length, 2);
            assert([...controller.voicePanel.recordings.querySelectorAll('summary')].some(node => node.textContent.includes('Chapter 2 · German')));
            equal(controller.root.querySelector('.vn-text').textContent.trim(), '"Do it as I say, ja?"');
            await controller.action('next'); equal(controller.root.querySelector('.vn-text').textContent.trim(), '"Ja, wir gehen jetzt nach Hause."');
            assert(controller.speech.job.chapters.every(chapter => chapter.clips.every(clip => !clip.review)));
            equal(context.chat[0].mes, source);
        });
        await check('language batches preserve next-line readiness cache reuse and German-only selection', async () => {
            const badge = controller.root.querySelector('.vn-voice-ready'); await eventually(() => badge.dataset.state === 'ready');
            const original = controller.speech.job; await controller.speech.generate(); equal(requests.length, 3); assert(controller.speech.job === original);
            for (const segment of controller.speech.prepared.segments.filter(line => line.language === 'en')) controller.speech.include(segment.id, false);
            await controller.speech.generate(); equal(requests.length, 4); equal(controller.speech.job.plan.length, 1);
            equal(controller.speech.job.chapters[0].language, 'de'); equal(controller.speech.job.chapters[0].clips.length, 2);
            equal(context.chat[0].mes, source);
        });
    } finally { controller.dispose(); }
}
