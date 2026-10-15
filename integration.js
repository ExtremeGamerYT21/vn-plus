/** Adapter checked against installed SillyTavern 1.19.0 source. */
export function createHost(getContext, { localContent = true } = {}) {
    return {
        context: getContext,
        request(url, options = {}) {
            if (!/^\/api\/plugins\/vn-plus-tts\/(status|secret|synthesize|characters(?:\/resolve)?)$/.test(url)) throw new Error('Invalid VN+ server route.');
            return fetch(url, { ...options, headers: { ...(getContext().getRequestHeaders?.() || { 'Content-Type': 'application/json' }), ...options.headers } });
        },
        ...(localContent ? { async resolveCharacters(input) {
            const response = await this.request('/api/plugins/vn-plus-tts/characters/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error('Live character aliases could not be loaded. Restart SillyTavern to load the updated VN+ server bridge; indexed properties remain available.');
            return response.json();
        }, async scaffoldCharacters(input) {
            const response = await this.request('/api/plugins/vn-plus-tts/characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
            if (!response.ok) {
                let detail; try { detail = await response.json(); } catch { /* older or missing bridge */ }
                throw new Error(detail?.error || 'Automatic character folders need the updated VN+ server bridge. Restart SillyTavern after updating VN+.');
            }
            return response.json();
        } } : {}),
        subscribe(name, callback) {
            const context = getContext(), event = (context.eventTypes || context.event_types)?.[name];
            if (!event || !context.eventSource) return () => {};
            context.eventSource.on(event, callback);
            return () => context.eventSource.removeListener(event, callback);
        },
        save(settings) { const context = getContext(); context.extensionSettings.visual_novel_plus = settings; context.saveSettingsDebounced(); },
        send(text) {
            const input = document.querySelector('#send_textarea'), button = document.querySelector('#send_but');
            if (!input || !button || button.disabled) throw new Error('SillyTavern send controls are unavailable. Exit VN and use the chat input.');
            if (input.value.trim() && input.value !== text) throw new Error('The normal chat input has a draft. Exit VN to review it before sending.');
            input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); button.click();
        },
        async retry(index) {
            const context = getContext();
            if (index !== context.chat.length - 1 || context.chat[index]?.is_user) throw new Error('Retry is available for the final assistant response. Select its swipe in normal chat to retry an older response.');
            if (!context.generate) throw new Error('SillyTavern regeneration API is unavailable.');
            await context.generate('regenerate');
        },
    };
}
