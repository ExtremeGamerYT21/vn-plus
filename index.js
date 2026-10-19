import { VNController } from './controller.js';
import { createHost } from './integration.js';
import { AssetResolver } from './core/asset-resolver.js';
import { mergeContentInventories } from './core/content-inventory.js';

const SINGLETON = Symbol.for('visual-novel-plus.controller');
async function initialize() {
    const getContext = globalThis.SillyTavern?.getContext;
    if (!getContext) { console.error('[VN+] SillyTavern.getContext is unavailable. This extension requires the supported extension context API.'); return; }
    globalThis[SINGLETON]?.dispose();
    const base = new URL('./', import.meta.url);
    // Read ST's actual generation state as well as events, which other workflows may delay or omit.
    const core = await import(new URL('../../../../script.js', base).href).catch(() => null);
    const catalog = new AssetResolver(base);
    const [published, local] = await Promise.all([catalog.json('assets.json'), catalog.json('assets.local.json')]);
    const inventory = mergeContentInventories(published || {}, local || {}); catalog.dispose();
    globalThis[SINGLETON] = new VNController(createHost(() => getContext(), { generationActive: core?.isGenerating }), base, inventory);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else void initialize();
