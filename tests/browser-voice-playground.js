import { wavBytes } from '../core/speech-pcm.js';

export async function runVoicePlaygroundChecks({ check, assert, equal, eventually }) {
    const samples = Float32Array.from({ length: 44100 }, (_, index) => .2 * Math.sin(2 * Math.PI * 110 * index / 44100)), bytes = wavBytes(samples);
    let binary = ''; for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
    const html = await (await fetch('../playground/index.html')).text(), frame = document.createElement('iframe');
    const bootstrap = `<base href="${new URL('../playground/', import.meta.url).href}"><script>
        const nativeFetch = window.fetch.bind(window); window.playgroundRequests = []; window.failPraat = false;
        window.fetch = async (url, options = {}) => {
            const path = String(url); if (!path.startsWith('/api/plugins/vn-plus-tts/') && path !== '/csrf-token') return nativeFetch(url, options);
            window.playgroundRequests.push(path);
            if (path === '/csrf-token') return Response.json({ token: 'TEST' });
            if (path.endsWith('/praat/status')) return Response.json({ available: true, version: 'test' });
            if (path.endsWith('/status')) return Response.json({ configured: true });
            if (path.endsWith('/synthesize')) return new Response('data: '+JSON.stringify({audio_base64:${JSON.stringify(btoa(binary))}})+'\\n\\n');
            if (window.failPraat) return Response.json({error:'Simulated Praat failure'},{status:503});
            const body = JSON.parse(options.body), count = atob(body.pcm).length / 4;
            const hz = 110 * 2 ** (body.settings.pitchSemitones / 12), output = new Float32Array(count);
            for (let i=0;i<count;i++) output[i]=.2*Math.sin(2*Math.PI*hz*i/44100);
            return new Response(output.buffer,{headers:{'X-VN-Praat-Note':'Praat: test transformation applied.'}});
        };
    </script>`;
    frame.srcdoc = html.replace('<head>', '<head>' + bootstrap); frame.style.cssText = 'width:100%;height:1000px;border:0'; document.body.append(frame);
    let doc, win;
    try {
        await check('standalone voice workbench generates one sample and displays measured original and processed pitch', async () => {
            await eventually(() => frame.contentDocument?.querySelector('#fish-status')?.textContent === 'Fish key saved');
            doc = frame.contentDocument; win = frame.contentWindow;
            doc.querySelector('#voice-id').value = 'test-voice'; doc.querySelector('#sample-text').value = 'Hello there.';
            doc.querySelector('#auto-apply').checked = true; doc.querySelector('#pitch').value = '4'; doc.querySelector('#formants').value = '1.15'; doc.querySelector('#pitch-range').value = '1';
            doc.querySelector('#source-form').requestSubmit();
            await eventually(() => doc.querySelector('#status').textContent.startsWith('Praat applied.'));
            equal(win.playgroundRequests.filter(path => path.endsWith('/synthesize')).length, 1);
            assert(Math.abs(parseFloat(doc.querySelector('#original-pitch').textContent) - 110) < 3);
            assert(Math.abs(parseFloat(doc.querySelector('#processed-pitch').textContent) - 139) < 3);
            assert(!doc.querySelector('#download-processed').disabled);
        });
        await check('workbench sliders reprocess the same sample, support A/B listening and export character properties', async () => {
            const slider = doc.querySelector('#pitch'); slider.value = '7'; slider.dispatchEvent(new win.Event('input', { bubbles: true }));
            await eventually(() => Math.abs(parseFloat(doc.querySelector('#processed-pitch').textContent) - 165) < 3 && !doc.querySelector('#apply').disabled);
            equal(win.playgroundRequests.filter(path => path.endsWith('/synthesize')).length, 1);
            const properties = JSON.parse(doc.querySelector('#properties').value); equal(properties.voiceId, 'test-voice'); equal(properties.ttsYoungify.pitchSemitones, 7);
            doc.querySelector('#listen-original').click(); equal(doc.querySelector('#listen-original').getAttribute('aria-pressed'), 'true'); equal(doc.querySelector('#playing-label').textContent, 'Original');
            doc.querySelector('#listen-processed').click(); equal(doc.querySelector('#playing-label').textContent, 'Processed');
        });
        await check('workbench processing errors preserve the playable original without pretending the new effect succeeded', async () => {
            win.failPraat = true; const slider = doc.querySelector('#pitch'); slider.value = '8'; slider.dispatchEvent(new win.Event('input', { bubbles: true }));
            await eventually(() => doc.querySelector('#status').dataset.phase === 'error');
            assert(doc.querySelector('#status').textContent.includes('Simulated Praat failure')); assert(doc.querySelector('#listen-processed').disabled);
            assert(!doc.querySelector('#listen-original').disabled); assert(!doc.querySelector('#download-original').disabled);
            equal(win.playgroundRequests.filter(path => path.endsWith('/synthesize')).length, 1);
        });
    } finally { frame.remove(); }
}
