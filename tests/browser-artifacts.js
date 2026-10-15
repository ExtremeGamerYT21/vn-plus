export async function runArtifactChecks({ check, assert, equal, eventually, context, mountChat, emit, makeController }) {
    let controller = makeController(), frame, messages = [], saves = 0;
    const originalSave = context.saveChat; context.saveChat = async () => saves++;
    const listener = event => { if (event.source === frame?.contentWindow && event.data?.fixture === 'vn-extra') messages.push(event.data); };
    window.addEventListener('message', listener);
    const html = `<main><h1>Diary</h1><textarea aria-label="Entry"></textarea><button>Save</button><script>
    (async()=>{
        await VNPlus.ready;
        async function report(tag, action) {
            try {
                if (action?.op === 'set') await VNPlus.extra.set(action.key, action.value);
                if (action?.op === 'push') await VNPlus.extra.push(action.key, action.value);
                if (action?.op === 'delete') await VNPlus.extra.remove(action.key);
                if (action?.op === 'forge') parent.postMessage({type:'vnplus:set',key:'text',value:'FORGED'},'*');
                const result = await VNPlus.extra.read();
                let isolated=false; try { parent.document.body; } catch { isolated=true; }
                parent.postMessage({fixture:'vn-extra',tag,result,isolated},'*');
            } catch(error) { parent.postMessage({fixture:'vn-extra',tag,error:error.message},'*'); }
        }
        window.addEventListener('message',e=>{if(e.source===parent && e.data?.fixtureAction) void report(e.data.fixtureAction,e.data);});
        await report('ready');
    })();</script></main>`;
    const script = (id = 'diary') => `[3 August 1991 | Before First Year | 9:00 p.m. | Summer | Shop]\nSECRET_ARTIFACT_CANONICAL\n/////\n#BACKGROUND kitchen\n\`\`\`html interactive id=${id}\n${html}\n\`\`\``;
    const open = async index => {
        messages = []; controller.settings.interactiveArtifacts = true; await controller.open(index);
        frame = controller.root.querySelector('.vn-artifact iframe'); assert(frame);
        await eventually(() => messages.some(item => item.tag === 'ready'), 'Artifact did not receive its bridge');
        return messages.find(item => item.tag === 'ready');
    };
    let sequence = 0;
    const action = async args => {
        const tag = `action-${++sequence}`; frame.contentWindow.postMessage({ fixtureAction: tag, ...args }, '*');
        await eventually(() => messages.some(item => item.tag === tag), 'Artifact request did not finish');
        return messages.find(item => item.tag === tag);
    };
    try {
        await check('interactive artifacts read paragraph scene variables and persist data in extra without changing message text', async () => {
            controller.close(); context.chatId = 'artifact-main'; context.chat = [{ mes: script(), extra: { unrelated: 'keep' } }]; mountChat(); emit('CHAT_CHANGED');
            const original = context.chat[0].mes, ready = await open(0); assert(ready.isolated); equal(ready.result.data, {});
            const result = await action({ op: 'set', key: 'text', value: 'lol' }); assert(!result.error); equal(result.result.data.text, 'lol');
            await eventually(() => controller.playbackVariables.available && !controller.playbackState.pending);
            const current = await action({ op: 'read' }); equal(current.result.scene.scene.time, '21:00'); equal(current.result.variables.vn_plus_time, '21:00');
            equal(context.chat[0].mes, original); equal(context.chat[0].extra.unrelated, 'keep'); assert(saves > 0);
            await action({ op: 'push', key: 'entries', value: 'one' }); equal((await action({ op: 'push', key: 'entries', value: 'two' })).result.data.entries, ['one', 'two']);
            assert(!JSON.stringify(current.result).includes('SECRET_ARTIFACT_CANONICAL')); assert(!Object.keys(context.chatMetadata.variables).some(key => key.startsWith('vn_plus')));
        });
        await check('artifact data survives iframe closing, controller restart and chat JSON reload', async () => {
            controller.dispose(); context.chat = JSON.parse(JSON.stringify(context.chat)); controller = makeController();
            const ready = await open(0); equal(ready.result.data.text, 'lol');
            equal(context.chat[0].extra.vn_plus.playback.scene.time, '21:00');
        });
        await check('named artifacts inherit earlier values and historical messages cannot overwrite the current timeline', async () => {
            context.chat.push({ mes: script() }); mountChat(); emit('MESSAGE_RECEIVED', 1);
            equal((await open(1)).result.data.text, 'lol');
            equal((await action({ op: 'set', key: 'text', value: 'parent future' })).result.data.text, 'parent future');
            equal((await open(0)).result.data.text, 'lol'); const result = await action({ op: 'set', key: 'text', value: 'bad past' });
            assert(result.error.includes('Past messages')); equal((await open(1)).result.data.text, 'parent future');
        });
        await check('artifact branch writes are independent from the parent chat', async () => {
            const parent = JSON.stringify(context.chat);
            context.chat = JSON.parse(parent).slice(0, 1); context.chatId = 'artifact-branch'; mountChat(); emit('CHAT_CHANGED');
            equal((await open(0)).result.data.text, 'lol'); equal((await action({ op: 'set', key: 'text', value: 'branch diary' })).result.data.text, 'branch diary');
            context.chat = JSON.parse(parent); context.chatId = 'artifact-main'; mountChat(); emit('CHAT_CHANGED');
            equal((await open(1)).result.data.text, 'parent future');
        });
        await check('copied swipe metadata does not leak an alternative artifact history', async () => {
            const item = context.chat[1]; item.swipe_id = 0; item.swipes = [item.mes, item.mes];
            item.swipe_info = [{ extra: structuredClone(item.extra) }, { extra: structuredClone(item.extra) }];
            item.swipe_id = 1; item.extra = structuredClone(item.swipe_info[1].extra); emit('MESSAGE_SWIPED', 1);
            equal((await open(1)).result.data.text, 'lol'); await action({ op: 'set', key: 'text', value: 'alternate' });
            item.swipe_id = 0; item.extra = structuredClone(item.swipe_info[0].extra); emit('MESSAGE_SWIPED', 1);
            equal((await open(1)).result.data.text, 'parent future');
        });
        await check('ordinary iframe postMessages cannot impersonate the artifact capability channel', async () => {
            await action({ op: 'forge' }); equal((await action({ op: 'read' })).result.data.text, 'parent future');
            await action({ op: 'delete', key: 'text' }); assert(!Object.hasOwn((await action({ op: 'read' })).result.data, 'text'));
        });
        await check('artifact IDs isolate local data and named values do not expire with the recent cast', async () => {
            context.chat.push({ mes: script('watch') }); mountChat(); emit('MESSAGE_RECEIVED', 2);
            equal((await open(2)).result.data, {}); await action({ op: 'set', key: 'text', value: 'watch value' });
            for (let at = 0; at < 4; at++) context.chat.push({ mes: 'SECRET\n/////\nQuiet.' });
            context.chat.push({ mes: script() }); mountChat(); emit('MESSAGE_RECEIVED', context.chat.length - 1);
            equal((await open(context.chat.length - 1)).result.data.entries, ['one', 'two']); // append history survives; the watch's value is separate.
            await action({ op: 'set', key: 'permanent', value: 'remember me' });
            for (let at = 0; at < 4; at++) context.chat.push({ mes: 'SECRET\n/////\nQuiet.' });
            context.chat.push({ mes: script() }); mountChat(); emit('MESSAGE_RECEIVED', context.chat.length - 1);
            equal((await open(context.chat.length - 1)).result.data.permanent, 'remember me');
        });
        await check('environment-local artifact commands load HTML into the same scoped metadata bridge', async () => {
            const read = controller.html.readLocal; let requested;
            controller.html.readLocal = async id => { requested = id; return html; };
            try {
                context.chat.push({ mes: 'SECRET\n/////\n#ARTIFACT local_diary' }); mountChat(); emit('MESSAGE_RECEIVED', context.chat.length - 1);
                messages = []; await controller.open(context.chat.length - 1);
                await eventually(() => controller.root.querySelector('.vn-artifact iframe'));
                frame = controller.root.querySelector('.vn-artifact iframe');
                await eventually(() => messages.some(item => item.tag === 'ready'));
                equal(requested, 'local_diary'); equal((await action({ op: 'set', key: 'local', value: true })).result.data.local, true);
            } finally { controller.html.readLocal = read; }
        });
        await check('closing a local artifact cancels its pending load and cannot reopen a stale iframe', async () => {
            const read = controller.html.readLocal; let release, signal;
            controller.html.readLocal = (id, pendingSignal) => { signal = pendingSignal; return new Promise(resolve => release = resolve); };
            try {
                context.chat.push({ mes: 'SECRET\n/////\n#ARTIFACT pending_diary' }); mountChat(); emit('MESSAGE_RECEIVED', context.chat.length - 1);
                await controller.open(context.chat.length - 1); await eventually(() => release);
                controller.html.close(); assert(signal.aborted); release(html);
                await Promise.resolve(); await Promise.resolve(); equal(controller.root.querySelectorAll('.vn-artifact iframe').length, 0); assert(!controller.html.active);
            } finally { controller.html.readLocal = read; }
        });
    } finally { controller.dispose(); context.saveChat = originalSave; window.removeEventListener('message', listener); }
}
