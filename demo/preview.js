import { VNController } from '../controller.js';
import { createHost } from '../integration.js';
import { DEFAULT_SETTINGS } from '../ui/settings.js';
import { splitMessage } from '../core/message-reader.js';
import { AssetResolver } from '../core/asset-resolver.js';
import { mergeContentInventories } from '../core/content-inventory.js';
const lightingDemo = new URLSearchParams(location.search).has('lighting');
const artifactDemo = new URLSearchParams(location.search).has('artifact');
const timingDemo = new URLSearchParams(location.search).has('timing');
const script = artifactDemo ? '[3 August 1991 | Diary preview | 12:26 p.m. | Summer | Shop]\n#BACKGROUND kitchen\n' + '```html interactive id=diary\n' + await fetch('../examples/diary.html').then(response => response.text()) + '\n```' : lightingDemo ? `[3 August 1991 | Lighting preview | 12:26 p.m. | Summer | Street]
#BACKGROUND street
Nina: "Outside at midday."
[3 August 1991 | Lighting preview | 11:00 p.m. | Summer | Street]
Nina: "The same street at night."
#BACKGROUND kitchen
Nina: "Inside, the lighting stays unchanged."`
    : await fetch('../environments/coffin-of-andy-and-leyley/scenes/demo.pov.txt').then(response => response.text());
const listeners = new Map();
const eventNames = ['GENERATION_STARTED','GENERATION_ENDED','GENERATION_STOPPED','MESSAGE_RECEIVED','MESSAGE_SWIPED','MESSAGE_UPDATED','MESSAGE_EDITED','MESSAGE_SWIPE_DELETED','CHARACTER_MESSAGE_RENDERED','MESSAGE_DELETED','CHAT_CHANGED','CHAT_LOADED','MORE_MESSAGES_LOADED','APP_READY'];
const context = {
    chat: [{ mes: `Ashley knows exactly who wrote the invitation. You have not discovered this yet.\n\n/////\n\n${script.replace('#ENTER Leyley', '#ENTER Leyley\n#ENTER Visitor')}`, swipe_id: 0 }],
    characterId: 0, chatId: 'preview', name1: 'Jason', extensionSettings: { visual_novel_plus: { ...structuredClone(DEFAULT_SETTINGS), ...(lightingDemo ? { typewriterEffect: false, reducedMotion: true } : {}), characters: { jason: { assetFolder: 'andrew', displayName: 'Jason', color: '#78c976', textColor: '#ecffed' } } } },
    saveSettingsDebounced() {}, async saveChat() {}, eventTypes: Object.fromEntries(eventNames.map(name => [name, name])),
    eventSource: { on(name, callback) { const set = listeners.get(name) || new Set(); set.add(callback); listeners.set(name, set); }, removeListener(name, callback) { listeners.get(name)?.delete(callback); } },
    async generate() { document.querySelector('#demo-result').textContent = 'Retry delegated to the simulated host. No model call was made.'; },
};
document.querySelector('#chat').innerHTML = '<div class="mes" mesid="0"><div class="mes_block"><div class="mes_buttons"></div><div class="mes_text"></div></div></div>';
document.querySelector('.mes_text').textContent = splitMessage(context.chat[0].mes).pov;
document.querySelector('#send_but').addEventListener('click', () => { document.querySelector('#demo-result').textContent = `Simulated reply: ${document.querySelector('#send_textarea').value}`; document.querySelector('#send_textarea').value = ''; });
const catalog = new AssetResolver(new URL('../', import.meta.url));
const [published, local] = await Promise.all([catalog.json('assets.json'), catalog.json('assets.local.json')]);
const inventory = mergeContentInventories(published || {}, local || {}); catalog.dispose();
context.extensionSettings.visual_novel_plus.interactiveArtifacts = artifactDemo || timingDemo;
if (timingDemo) context.chat[0].mes = `Private canonical text.\n/////\n[3 August 1991 | Before First Year | 12:26 p.m. | Summer | Shop]
#BACKGROUND kitchen
#VISUAL see_watch
You pull out your pocket watch and inspect it.
Henry: "Jason! We're leaving!" [calling]
#VISUAL CLOSE see_watch [hurried]
You turn toward your father.
Henry: "There is still time to catch the train." [normal]`;
if (timingDemo) document.querySelector('.mes_text').textContent = splitMessage(context.chat[0].mes).pov;
const controller = new VNController(createHost(() => context, { localContent: false }), new URL('../', import.meta.url), inventory);
if (timingDemo) controller.visuals.readLocal = async () => fetch('../examples/watch.html').then(response => response.text());
if (new URLSearchParams(location.search).has('css')) {
    controller.environmentStyle.read = async () => fetch('../examples/dialogue.css').then(response => response.text());
    await controller.loadEnvironmentStyle();
}
await controller.open(0);
