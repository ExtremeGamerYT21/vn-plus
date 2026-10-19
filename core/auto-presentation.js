import { chatIdentity, latestAssistant, readMessage } from './message-reader.js';

/** Only fresh output may open a closed VN. Browsing/history changes remain preparation-only. */
export class AutoPresentation {
    constructor(context) { this.reset(context); }
    capture(context) {
        const index = latestAssistant(context), source = readMessage(context, index);
        return { identity: chatIdentity(context), messages: [...(context.chat || [])], message: context.chat?.[index], index,
            ready: source?.status === 'ready', raw: source?.raw, swipe: source?.swipe };
    }
    reset(context) { this.previous = this.capture(context); this.candidate = null; this.generation = null; this.suppressed = new WeakSet(); }
    observe(context) {
        const next = this.capture(context), previous = this.previous;
        if (next.identity !== previous.identity) { this.reset(context); return; }
        const appended = next.messages.length > previous.messages.length && previous.messages.every((message, index) => next.messages[index] === message)
            && next.message && !previous.messages.includes(next.message);
        const transformed = next.message && next.message === previous.message && next.swipe === previous.swipe && !previous.ready && next.ready && !this.suppressed.has(next.message);
        if (appended || transformed) this.candidate = { identity: next.identity, message: next.message, swipe: next.swipe };
        if (this.candidate && !next.messages.includes(this.candidate.message)) this.candidate = null;
        this.previous = next;
    }
    start(context) {
        this.observe(context); const { identity, message, raw, swipe } = this.previous;
        this.generation = { identity, message, raw, swipe }; this.candidate = null;
        if (message) this.suppressed.delete(message);
    }
    finish(context) {
        const generation = this.generation; this.observe(context); const next = this.previous;
        if (generation && generation.identity === next.identity && next.message && (generation.message !== next.message || generation.raw !== next.raw || generation.swipe !== next.swipe)) {
            this.candidate = { identity: next.identity, message: next.message, swipe: next.swipe };
        }
        this.generation = null;
    }
    suppress(context) {
        this.observe(context); if (this.previous.message) this.suppressed.add(this.previous.message);
        this.candidate = null; this.generation = null;
    }
    eligible(context, index) {
        this.observe(context); const candidate = this.candidate, source = readMessage(context, index);
        return !!candidate && candidate.identity === chatIdentity(context) && context.chat?.[index] === candidate.message && source?.swipe === candidate.swipe
            && !(context.chat || []).slice(index + 1).some(message => message.is_user);
    }
}
