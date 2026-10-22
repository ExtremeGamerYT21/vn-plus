export function localBridge(fetcher = fetch) {
    let token = null;
    return async (path, options = {}) => {
        const headers = new Headers(options.headers);
        if (options.method && options.method !== 'GET') {
            if (!token) {
                const csrf = await fetcher('/csrf-token', { credentials: 'same-origin', signal: options.signal });
                if (!csrf.ok) throw new Error('Sign in to SillyTavern in this browser first.');
                token = (await csrf.json()).token;
                if (typeof token !== 'string') throw new Error('SillyTavern did not provide a request token. Reload the page and try again.');
            }
            headers.set('X-CSRF-Token', token);
        }
        const response = await fetcher(`/api/plugins/vn-plus-tts/${path}`, { ...options, headers, credentials: 'same-origin' });
        if (!response.ok) {
            let message; try { message = (await response.json()).error; } catch { /* missing bridge */ }
            if (response.status === 403) token = null;
            throw new Error(message || (response.status === 404 ? 'Update the VN+ server bridge and restart SillyTavern.' : `Local bridge request failed (${response.status}). Sign in to SillyTavern if needed.`));
        }
        return response;
    };
}
