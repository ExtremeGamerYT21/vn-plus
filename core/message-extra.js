import { chatIdentity, latestAssistant } from './message-reader.js';
import { sharedVariables } from './shared-state.js';
import { appendJournal } from './journal-format.js';

export function messageRevision(message) {
    const text = String(message?.mes || ''); let a = 2166136261, b = 2246822507;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b ^ text.charCodeAt(i), 3266489909); }
    return `${text.length}-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => object(value) && Object.hasOwn(value, key) ? value[key] : undefined;
const uuid = () => crypto.randomUUID();
const keyPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;
export function jsonData(value) {
    const visit = (item, depth = 0) => {
        if (depth > 32) throw new Error('Artifact data is nested too deeply.');
        if (item === null || typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return;
        if (Array.isArray(item)) { item.forEach(child => visit(child, depth + 1)); return; }
        if (!object(item) || ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new Error('Artifact data must be JSON.');
        for (const [key, child] of Object.entries(item)) { if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Invalid artifact data key.'); visit(child, depth + 1); }
    };
    visit(value); const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).byteLength > 262144) throw new Error('An artifact value can be at most 256 KiB.');
    return JSON.parse(serialized);
}

export class MessageExtraStore {
    constructor(host) { this.host = host; }
    capture(index = latestAssistant(this.host.context())) {
        const context = this.host.context(), chat = context.chat, message = chat?.[index], identity = chatIdentity(context), raw = message?.mes, swipe = message?.swipe_id ?? 0;
        const revision = messageRevision(message), lineage = String(context.chatMetadata?.integrity || identity);
        const current = () => {
            const next = this.host.context(), id = next.getCurrentChatId?.() ?? next.chatId;
            return !!message && !message.is_user && !message.is_system && id != null && id !== '' && chatIdentity(next) === identity && next.chat === chat && next.chat[index] === message && message.mes === raw && (message.swipe_id ?? 0) === swipe;
        };
        const root = create => {
            if (!current()) throw new Error('The chat, message or swipe changed. Reopen the artifact.');
            let data = own(message.extra, 'vn_plus');
            if (!create) return data?.schemaVersion === 1 ? data : null;
            message.extra ??= {};
            if (!object(message.extra)) throw new Error('Invalid message extra metadata.');
            const clonedMessage = data && chat.some((other, at) => at !== index && own(other.extra, 'vn_plus')?.messageId === data.messageId);
            const clonedSwipe = data && message.swipe_info?.some((info, at) => at !== swipe && own(info?.extra, 'vn_plus')?.variantId === data.variantId);
            if (!data || clonedMessage || clonedSwipe) {
                data = { schemaVersion: 1, messageId: clonedMessage ? uuid() : data?.messageId || uuid(), variantId: uuid(), revisions: {} };
                message.extra.vn_plus = data;
            }
            if (data.schemaVersion !== 1 || !object(data.revisions)) throw new Error('Unsupported VN+ message metadata.');
            return data;
        };
        const record = create => {
            const data = root(create); if (!data) return null;
            if (create && !Object.hasOwn(data.revisions, revision)) data.revisions[revision] = { context: null, playback: null, variables: {}, events: [] };
            if (create) {
                data.revision = revision;
                for (const key of ['context', 'playback', 'variables']) data[key] = data.revisions[revision][key];
            }
            return own(data.revisions, revision) || null;
        };
        const sync = () => {
            // ST loads extra from swipe_info when selecting a swipe. Mirror only our namespace.
            const info = message.swipe_info?.[swipe];
            if (object(info)) { info.extra ??= {}; info.extra.vn_plus = structuredClone(message.extra.vn_plus); }
        };
        const changed = () => { sync(); this.persist(current); };
        return { index, revision, identity, lineage, current, message,
            read: kind => current() ? structuredClone(own(record(false), kind)) : undefined,
            write: (kind, value) => {
                if (!current()) return false;
                const next = jsonData(value), old = record(false);
                if (JSON.stringify(own(old, kind)) === JSON.stringify(next)) return true;
                record(true)[kind] = next; root(true)[kind] = next; changed(); return true;
            },
            mutate: callback => {
                if (!current()) throw new Error('The artifact timeline changed.');
                const draft = structuredClone(record(true)), result = callback(draft);
                root(true).revisions[revision] = draft; root(true); changed(); return result;
            },
            anchor: () => { const data = root(true); return { messageId: data.messageId, variantId: data.variantId, revision, message: index, swipe }; },
            flush: () => this.persist(current, true),
        };
    }
    persist(current, immediate = false) {
        if (!current()) return Promise.resolve();
        if (immediate) { clearTimeout(this.pending); this.pending = null; return this.host.saveChat?.() || Promise.resolve(); }
        if (this.pending) clearTimeout(this.pending);
        this.pending = setTimeout(() => { this.pending = null; if (current()) void this.host.saveChat?.(); }, 300);
    }
    dispose() { clearTimeout(this.pending); }
    syncJournal(index, environment, journal) {
        const binding = this.capture(index), previous = binding.read('journals') || {};
        if (JSON.stringify(own(previous, environment) || null) === JSON.stringify(journal)) return false;
        binding.mutate(record => {
            record.journals ??= {};
            if (journal) Object.defineProperty(record.journals, environment, { value: jsonData(journal), enumerable: true, configurable: true, writable: true });
            else delete record.journals[environment];
        });
        return true;
    }
    artifactSession({ index, beat, environment, id, scene, alive = () => true }) {
        if (!keyPattern.test(id)) throw new Error('Artifact ID must use letters, digits, underscores, dots or hyphens.');
        const thisStore = this, binding = this.capture(index), anchor = binding.anchor(), current = () => alive() && binding.current();
        const read = () => {
            if (!current()) throw new Error('This artifact session has expired.');
            const data = Object.create(null), context = this.host.context(), seen = new Set();
            for (let at = 0; at <= index; at++) {
                const message = context.chat[at], record = own(own(own(message?.extra, 'vn_plus'), 'revisions'), messageRevision(message));
                const journal = own(record?.journals, environment);
                const eligible = id === 'diary' && journal && (at < index || journal.beat <= beat);
                let journalApplied = false;
                for (const event of record?.events || []) {
                    if (eligible && !journalApplied && event.beat >= journal.beat) { appendJournal(data, journal); journalApplied = true; }
                    if (event.environment !== environment || event.artifact !== id || (at === index && event.beat > beat)) continue;
                    if (seen.has(event.id)) continue; seen.add(event.id);
                    if (event.op === 'set') data[event.key] = structuredClone(event.value);
                    else if (event.op === 'delete') delete data[event.key];
                    else if (event.op === 'push') { data[event.key] ??= []; if (Array.isArray(data[event.key])) data[event.key].push(structuredClone(event.value)); }
                }
                if (eligible && !journalApplied) appendJournal(data, journal);
            }
            const state = structuredClone(scene());
            return { anchor: { ...anchor, beat }, scene: state, variables: state?.available ? sharedVariables(state) : {}, data };
        };
        return { read, async request(method, args = {}) {
            if (method === 'read') return read();
            if (!current()) throw new Error('This artifact session has expired.');
            if (!['set', 'delete', 'push'].includes(method) || !object(args) || typeof args.key !== 'string' || !keyPattern.test(args.key)) throw new Error('Invalid artifact action or key.');
            if (index !== latestAssistant(thisStore.host.context())) throw new Error('Past messages are read-only. Create a SillyTavern branch here before writing.');
            const value = method !== 'delete' ? jsonData(args.value) : null;
            if (method === 'push') { const previous = read().data[args.key]; if (previous !== undefined && !Array.isArray(previous)) throw new Error('Only array values accept push.'); }
            binding.mutate(record => {
                // A copied branch starts its own future at the first write. The parent stays untouched.
                if (record.owner && record.owner !== binding.lineage) record.events = record.events.filter(event => event.beat <= beat);
                if (record.events.some(event => event.beat > beat)) throw new Error('Later artifact changes exist. Branch this scene before changing its past.');
                if (record.events.length >= 1000) throw new Error('This message already contains 1000 artifact changes. Continue in another message.');
                const event = { id: uuid(), artifact: id, environment, beat, op: method, key: args.key, ...(method !== 'delete' ? { value } : {}), scene: structuredClone(scene()?.scene || null) };
                if (new TextEncoder().encode(JSON.stringify([...record.events, event])).byteLength > 1048576) throw new Error('Artifact changes in one message can be at most 1 MiB.');
                record.owner = binding.lineage; record.events.push(event);
            });
            await binding.flush(); return read();
        } };
    }
}
