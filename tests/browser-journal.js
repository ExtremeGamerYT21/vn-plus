export async function runJournalChecks({ check, assert, equal, eventually, context, mountChat, emit, makeController }) {
    const journal = (id = 'first-wand', text = 'My wand chose me today.') => '\n```vnplus-journal\n' + JSON.stringify({ entries: [{ id, title: 'My first wand', text }] }) + '\n```';
    const first = 'CANONICAL_SECRET\n/////\n[3 August 1991 | Before First Year | 12:26 p.m. | Summer | Shop]\nYou find the right wand.' + journal();
    context.chatId = 'journal-browser'; context.chat = [{ mes: first, extra: { unrelated: 'keep' } }, { mes: 'PRIVATE\n/////\n#ARTIFACT diary' }]; mountChat();
    const controller = makeController(), environment = controller.environment.id, originalGenerate = context.generate;
    let calls = 0, frame, messages = [];
    context.generate = async () => { calls++; throw new Error('Journal collection must not generate.'); };
    const readDerived = index => { const root = context.chat[index]?.extra?.vn_plus; return root?.revisions?.[root.revision]?.journals?.[environment]; };
    const html = await fetch('../examples/diary.html').then(response => response.text());
    const probe = `<script>VNPlus.ready.then(async()=>{
        const report = async tag => parent.postMessage({journalFixture:true,tag,snapshot:await VNPlus.read(),text:document.querySelector('#entries')?.textContent},'*');
        window.addEventListener('message',event=>{if(event.source===parent && event.data?.journalRead) report(event.data.journalRead);});
        await report('ready');
    });</script>`;
    const listen = event => { if (event.data?.journalFixture && (event.source === frame?.contentWindow || event.source === controller.root.querySelector('iframe')?.contentWindow)) messages.push(event.data); };
    window.addEventListener('message', listen);
    const open = async () => {
        messages = []; frame = null; controller.settings.interactiveArtifacts = true; controller.settings.typewriterEffect = false;
        controller.html.readLocal = controller.visuals.readLocal = async () => html + probe;
        await controller.open(context.chat.length - 1);
        await eventually(() => { frame = controller.root.querySelector('iframe'); return frame && messages.some(item => item.tag === 'ready'); });
        return messages.find(item => item.tag === 'ready');
    };
    const read = async () => {
        const tag = crypto.randomUUID(); frame.contentWindow.postMessage({ journalRead: tag }, '*');
        await eventually(() => messages.some(item => item.tag === tag)); return messages.find(item => item.tag === tag);
    };
    try {
        await check('POV journal deltas collect while VN is closed without generation or changes to source text', async () => {
            await eventually(() => readDerived(0)); assert(controller.root.hidden); equal(calls, 0);
            equal(context.chat[0].mes, first); equal(context.chat[0].extra.unrelated, 'keep'); equal(readDerived(0).entries[0].id, 'first-wand');
            assert(!controller.audio.channels.music.audio); assert(!controller.audio.channels.ambient.audio);
        });
        await check('the real diary template reconstructs transformer entries from previous messages through its sandbox API', async () => {
            const report = await open(); equal(report.snapshot.data.entries.length, 1); equal(report.snapshot.data.entries[0].text, 'My wand chose me today.');
            assert(report.text.includes('My first wand')); equal(report.snapshot.data.entries[0].when, '3 August 1991 · 12:26 p.m.');
            assert(!controller.root.querySelector('.vn-text').textContent.includes('vnplus-journal'));
        });
        await check('repeated context events cannot duplicate journal entries or expire them with the cast window', async () => {
            controller.close();
            for (let i = 0; i < 4; i++) context.chat.push({ mes: 'PRIVATE\n/////\nAnother ordinary moment.' });
            context.chat.push({ mes: 'PRIVATE\n/////\n#ARTIFACT diary' }); mountChat(); emit('MESSAGE_RECEIVED', context.chat.length - 1);
            await controller.refreshContext(); await controller.refreshContext();
            const report = await open(); equal(report.snapshot.data.entries.length, 1); equal(calls, 0);
        });
        await check('streaming journal metadata is withheld until finalization and stays out of VN prose and transcript', async () => {
            controller.close(); context.chat.push({ mes: 'PRIVATE\n/////\nJason: "I found it."\n```vnplus-journal\n{"entries":' }); mountChat();
            emit('GENERATION_STARTED', 'normal', {}, false); emit('MESSAGE_RECEIVED', context.chat.length - 1); await controller.refreshContext();
            assert(!readDerived(context.chat.length - 1));
            context.chat.at(-1).mes = 'PRIVATE\n/////\nJason: "I found it."' + journal('important-map', 'I found a map that changes everything.');
            emit('GENERATION_ENDED'); await controller.refreshContext(); await eventually(() => readDerived(context.chat.length - 1));
            await controller.open(context.chat.length - 1); assert(!controller.root.querySelector('.vn-text').textContent.includes('entries'));
            await controller.action('transcript'); assert(!controller.root.querySelector('.vn-panel-content').textContent.includes('vnplus-journal')); equal(calls, 0);
        });
        await check('an independent diary receives the current scene delta only after playback reaches its end', async () => {
            controller.close(); context.chatId = 'journal-boundary'; context.chat = [{ mes: 'PRIVATE\n/////\n#VISUAL diary\nJason: "My first wand."' + journal() }]; mountChat(); emit('CHAT_CHANGED');
            await controller.refreshContext(); const before = await open(); equal(before.snapshot.data.entries || [], []);
            const original = frame; await controller.action('next'); assert(!controller.root.querySelector('.vn-reply').hidden);
            equal(controller.root.querySelector('.vn-visual iframe'), original);
            const after = await read(); equal(after.snapshot.data.entries[0].id, 'first-wand'); equal(calls, 0);
        });
        await check('the Diary toolbar opens the built-in template without a script command and closes without advancing', async () => {
            const position = controller.playback.position; messages = []; frame = null;
            controller.root.querySelector('[data-action="diary"]').click();
            await eventually(() => { frame = controller.root.querySelector('.vn-artifact iframe'); return frame && messages.some(item => item.tag === 'ready'); });
            const result = messages.find(item => item.tag === 'ready'); equal(result.snapshot.data.entries[0].id, 'first-wand');
            await controller.action('close-artifact'); equal(controller.playback.position, position); assert(!controller.html.active); equal(calls, 0);
        });
    } finally { controller.dispose(); context.generate = originalGenerate; window.removeEventListener('message', listen); }
}
