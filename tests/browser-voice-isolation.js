import { speechTokens } from '../core/speech-text.js';

export async function runVoiceIsolationChecks({ check, assert, equal, eventually, context, mountChat, makeController }) {
    context.chatId = 'voice-isolation-browser';
    const source = 'PRIVATE\n/////\nJason: "Copper river."\nRon: "Silent lantern."\nHarry: "Velvet cloud."\nLyra: "Amber dawn."\nJason: "Silver field."\nA clock ticks.';
    context.chat = [{ mes: source }]; mountChat();
    const controller = makeController(), requests = [];
    Object.assign(controller.settings, { autoCreateCharacters: false, autoAdvance: false, automaticPlayback: false, typewriterEffect: false });
    controller.settings.characters = { jason_weber: { aliases: ['Jason'], voiceId: 'isolate-jason' }, ron_weasley: { aliases: ['Ron'], voiceId: 'isolate-ron' },
        harry_potter: { aliases: ['Harry'], voiceId: 'isolate-harry' }, lyra_malfoy: { aliases: ['Lyra'], voiceId: 'isolate-lyra' }, narrator: { voiceId: 'isolate-story' } };
    Object.assign(controller.settings.tts, { enabled: true, autoGenerate: true, autoPlay: false, narratorEnabled: true, splitChapters: false, isolateVoices: true });
    controller.speech.endpoint = async (path, options) => {
        if (path === 'status') return Response.json({ configured: true, maxParallelBatches: 5 });
        const request = JSON.parse(options.body); requests.push(request);
        const words = speechTokens(request.body.text).map((text, index) => ({ text, start: .1 + index * .1, end: .18 + index * .1 }));
        return new Response(`data: ${JSON.stringify({ audio_base64: btoa('fixture'), chunk_seq: 0, chunk_audio_offset_sec: 0, alignment: { segments: words } })}\n\n`);
    };
    controller.speech.decode = async () => new Float32Array(44100 * 3);
    controller.speech.process = async chapter => chapter.clips.map(clip => ({ id: clip.id, samples: new Float32Array(4410), notes: [] }));
    try {
        await check('reported character pairs generate with separate voice references and expose the exact recorded request routing', async () => {
            await controller.open(0); await eventually(() => controller.speech.job?.status === 'complete');
            equal(requests.length, 5); assert(requests.every(request => request.body.reference_id.length === 1 && !request.body.text.includes('speaker:1')));
            equal(requests.map(request => request.body.reference_id[0]).sort(), ['isolate-harry', 'isolate-jason', 'isolate-lyra', 'isolate-ron', 'isolate-story']);
            const details = controller.voicePanel.recordings.querySelectorAll('.vn-voice-routing pre'); equal(details.length, 5);
            for (const detail of details) {
                const data = JSON.parse(detail.textContent); equal(data.reference_id.length, 1);
                assert(data.routing.every(route => route.voice === data.reference_id[route.speaker] && route.speaker === 0));
            }
            equal(controller.speechSettingsPanel.fields.get('isolateVoices').input.checked, true);
            assert(controller.speech.job.chapters.every(chapter => chapter.clips.every(clip => !clip.review)));
            equal(context.chat[0].mes, source);
        });
        await check('voice isolation controls stay synchronized and changing modes never substitutes the other mode’s cached recordings', async () => {
            const original = controller.speech.job, field = controller.speechSettingsPanel.fields.get('isolateVoices').input;
            field.checked = false; field.dispatchEvent(new Event('change', { bubbles: true }));
            await eventually(() => controller.speech.job?.status === 'complete' && controller.speech.job !== original);
            equal(requests.length, 7); equal(controller.voicePanel.fields.get('isolateVoices').input.checked, false);
            assert(requests.slice(5).some(request => request.body.reference_id.length === 4));
            const other = controller.voicePanel.fields.get('isolateVoices').input;
            other.checked = true; other.dispatchEvent(new Event('change', { bubbles: true }));
            await eventually(() => controller.speech.job === original);
            equal(requests.length, 7); equal(field.checked, true); equal(context.chat[0].mes, source);
        });
    } finally { controller.dispose(); }
}
