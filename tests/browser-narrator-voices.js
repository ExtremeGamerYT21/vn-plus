import { speechTokens } from '../core/speech-text.js';

export async function runNarratorVoiceChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    context.chatId = 'isolated-narrator-voices';
    const source = 'PRIVATE\n/////\nThe hall is quiet.\nNina: "Hello."\nAshley: "Ready?"\nThe door opens.';
    context.chat = [{ mes: source }]; mountChat();
    const controller = makeController(), requests = [];
    Object.assign(controller.settings, { automaticPlayback: false, autoCreateCharacters: false, autoAdvance: false, typewriterEffect: false });
    Object.assign(controller.settings.characters, { narrator: { displayName: 'Storyteller', voiceId: 'story-test' }, nina: { voiceId: 'nina-test' }, ashley: { voiceId: 'ashley-test' } });
    Object.assign(controller.settings.tts, { enabled: true, autoGenerate: true, autoPlay: false, narratorEnabled: true, splitChapters: false, parallelBatches: 3 });
    controller.speech.endpoint = async (path, options) => {
        if (path === 'status') return Response.json({ configured: true, maxParallelBatches: 5 });
        const request = JSON.parse(options.body); requests.push(request);
        const words = speechTokens(request.body.text).map((text, index) => ({ text, start: .1 + index * .15, end: .2 + index * .15 }));
        return new Response(`data: ${JSON.stringify({ audio_base64: btoa('simulated'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: words } })}\n\n`);
    };
    controller.speech.decode = async () => new Float32Array(44100 * 2);
    controller.speech.process = async chapter => chapter.clips.filter(clip => !clip.review).map(clip => ({ id: clip.id, samples: new Float32Array(4410), notes: [] }));
    try {
        await check('narration and character voices use separate Fish requests and labeled recordings even without chapter splitting', async () => {
            await controller.open(0); await eventually(() => controller.speech.job?.status === 'complete');
            equal(requests.length, 2);
            equal(controller.speech.job.plan.map(chapter => chapter.kind), ['narration', 'dialogue']);
            equal(requests.filter(request => request.body.reference_id.includes('story-test')).map(request => request.body.reference_id), [['story-test']]);
            assert(requests.find(request => request.body.reference_id.includes('story-test')).body.text.includes('The door opens.'));
            const dialogue = requests.find(request => request.body.reference_id.includes('nina-test'));
            equal(dialogue.body.reference_id, ['nina-test', 'ashley-test']); assert(!/hall|door/.test(dialogue.body.text));
            const labels = [...controller.voicePanel.recordings.querySelectorAll('summary')].map(node => node.textContent).filter(text => text.startsWith('Chapter '));
            equal(labels.filter(text => text.includes('Narration')).length, 1); equal(labels.filter(text => text.includes('Dialogue')).length, 1);
            equal(controller.root.querySelector('.vn-speaker').textContent, 'Storyteller'); assert(!controller.stage.nodes.has('narrator'));
            await controller.action('next'); equal(controller.root.querySelector('.vn-speaker').textContent, 'Nina');
            await controller.action('next'); equal(controller.root.querySelector('.vn-speaker').textContent, 'Ashley');
            assert(controller.speech.job.chapters.every(chapter => chapter.clips.every(clip => !clip.review)));
            assert(controller.speech.job.chapters.every(chapter => chapter.offsetSamples === null));
            await controller.action('next'); equal(controller.root.querySelector('.vn-speaker').textContent, 'Storyteller');
            equal(controller.root.querySelector('.vn-text').textContent.trim(), 'The door opens.');
            assert((await controller.speech.sourceSamples()).length > 0);
            equal(context.chat[0].mes, source);
        });
        await check('narrator selection cannot leak its reference into dialogue and restoring the selection reuses the isolated cache', async () => {
            const cached = controller.speech.job;
            for (const line of controller.speech.prepared.segments.filter(line => line.character === 'narrator')) controller.speech.include(line.id, false);
            await controller.speech.generate(); equal(requests.length, 3); equal(controller.speech.job.plan.length, 1);
            equal(controller.speech.job.chapters[0].kind, 'dialogue'); equal(requests[2].body.reference_id, ['nina-test', 'ashley-test']);
            for (const line of controller.speech.prepared.segments.filter(line => line.character === 'narrator')) controller.speech.include(line.id, true);
            await controller.speech.generate(); equal(requests.length, 3); assert(controller.speech.job === cached);
            equal(context.chat[0].mes, source);
        });
        await check('characters without personal voices use the narrator reference while keeping their dialogue names and silent narration', async () => {
            controller.settings.tts.narratorEnabled = false;
            controller.settings.characters.nina.voiceId = '';
            const source = 'PRIVATE\n/////\nThe hall is quiet.\nNina: "Hello."\nAshley: "Ready?"\nVisitor: "Come here."\nVisitor: "(Keep quiet.)"';
            context.chat[0].mes = source; mountChat(); await controller.open(0);
            await eventually(() => controller.speech.job?.status === 'complete');
            const lines = controller.speech.prepared.segments, request = requests.at(-1);
            equal(lines.map(line => line.character), ['nina', 'ashley', 'visitor']);
            equal(lines.map(line => line.voice), ['story-test', 'ashley-test', 'story-test']);
            equal(request.body.reference_id, ['story-test', 'ashley-test']); assert(!/hall|Keep quiet/.test(request.body.text));
            equal(controller.root.querySelector('.vn-speaker').textContent, 'Storyteller'); await controller.action('next');
            equal(controller.root.querySelector('.vn-speaker').textContent, 'Nina'); assert(!controller.stage.nodes.has('narrator'));
            equal(context.chat[0].mes, source);
            controller.settings.tts.autoGenerate = false; controller.settings.characters.narrator.voiceId = '';
            await controller.prepareSpeech(); equal(controller.speech.prepared.segments.map(line => line.character), ['ashley']);
        });
    } finally { controller.dispose(); }
}
