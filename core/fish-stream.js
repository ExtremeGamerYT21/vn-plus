/** SSE parser accepting arbitrary UTF-8, CRLF, comment and JSON fragmentation. */
export async function* sseEvents(body, signal) {
    const reader = body.getReader(), decoder = new TextDecoder(); let buffer = '', data = [], event = '';
    const line = value => {
        if (!value) { const result = data.length ? { event, data: data.join('\n') } : null; data = []; event = ''; return result; }
        if (value.startsWith(':')) return null;
        const colon = value.indexOf(':'), field = colon < 0 ? value : value.slice(0, colon);
        let content = colon < 0 ? '' : value.slice(colon + 1); if (content.startsWith(' ')) content = content.slice(1);
        if (field === 'data') data.push(content); else if (field === 'event') event = content;
        return null;
    };
    try {
        let done = false;
        while (!done) {
            if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
            const part = await reader.read(); done = part.done; buffer += decoder.decode(part.value, { stream: !done });
            if (buffer.length > 12 * 1024 * 1024) throw new Error('Fish stream event exceeds the local size limit.');
            let match;
            while ((match = /\r\n|\r|\n/.exec(buffer))) {
                if (!done && match[0] === '\r' && match.index === buffer.length - 1) break;
                const item = line(buffer.slice(0, match.index)); buffer = buffer.slice(match.index + match[0].length); if (item) yield item;
            }
        }
        if (buffer) { const item = line(buffer); if (item) yield item; }
        const final = line(''); if (final) yield final;
    } finally { try { await reader.cancel(); } catch { /* already closed */ } reader.releaseLock(); }
}
export async function collectFishStream(body, signal) {
    const audio = [], alignments = new Map(); let bytes = 0;
    for await (const event of sseEvents(body, signal)) {
        if (event.data === '[DONE]') continue;
        let payload; try { payload = JSON.parse(event.data); } catch { throw new Error('Fish returned an invalid timestamp stream.'); }
        if (event.event === 'error' || payload.error || payload.type === 'error' || payload.event === 'error' || Number(payload.status) >= 400) throw new Error('Fish reported a synthesis error. Completed chapters remain available.');
        if (payload.audio_base64) {
            let chunk; try { chunk = Uint8Array.from(atob(payload.audio_base64), char => char.charCodeAt(0)); } catch { throw new Error('Fish returned invalid audio data.'); }
            bytes += chunk.length; if (bytes > 80 * 1024 * 1024) throw new Error('Chapter audio exceeds the local size limit.'); audio.push(chunk);
        }
        if (payload.alignment) {
            const seq = Number(payload.chunk_seq), offset = Number(payload.chunk_audio_offset_sec);
            if (!Number.isInteger(seq) || seq < 0 || !Number.isFinite(offset) || offset < 0 || !Array.isArray(payload.alignment.segments)) throw new Error('Fish returned invalid alignment metadata.');
            alignments.set(seq, { offset, segments: payload.alignment.segments });
        }
    }
    if (!bytes) throw new Error('Fish returned empty audio.');
    const data = new Uint8Array(bytes); let cursor = 0; for (const chunk of audio) { data.set(chunk, cursor); cursor += chunk.length; }
    const words = [...alignments].sort(([a], [b]) => a - b).flatMap(([seq, snapshot]) => snapshot.segments.map(word => ({
        text: typeof word.text === 'string' ? word.text : '', start: Number(word.start) + snapshot.offset,
        end: Number(word.end) + snapshot.offset, chunk: seq,
    })));
    return { data, words };
}
