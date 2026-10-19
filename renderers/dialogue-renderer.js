import { dialogueEmotionStyle, letterVariations } from './dialogue-emotions.js';
import { speechRevealCues } from '../core/speech-reveal.js';
import { DialogueLayout } from './dialogue-layout.js';
import { dialogueDisplayText } from '../core/dialogue-text.js';

/** Small, safe emphasis renderer. Text is always inserted with text nodes. */
export function appendEmphasis(container, text, letters = [], keepWords = false) {
    for (const part of text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g)) {
        let parent = container, value = part;
        if (/^\*\*.*\*\*$/s.test(part)) { parent = document.createElement('strong'); value = part.slice(2, -2); container.append(parent); }
        else if (/^(\*.*\*|_.*_)$/s.test(part)) { parent = document.createElement('em'); value = part.slice(1, -1); container.append(parent); }
        for (const word of value.split(/(\s+)/u)) {
            let holder = parent;
            if (keepWords && /\S/u.test(word)) { holder = document.createElement('span'); holder.className = 'vn-text-word'; parent.append(holder); }
            for (const char of word) { const span = document.createElement('span'); span.className = /\s/u.test(char) ? 'vn-letter vn-space' : 'vn-letter'; span.textContent = char; holder.append(span); letters.push(span); }
        }
    }
    return letters;
}

export class DialogueRenderer {
    constructor(root, resolver, settings) { this.root = root; this.resolver = resolver; this.settings = settings; this.generation = 0; this.timer = null; this.typing = false; this.letters = []; this.layout = new DialogueLayout(root); }
    cancel() { this.generation++; clearTimeout(this.timer); this.timer = null; this.typing = false; }
    dispose() { this.cancel(); this.layout.dispose(); }
    async render(token, props = {}, effect = 'normal', onDone = () => {}, instant = false, playback = null) {
        this.cancel(); const generation = this.generation;
        const box = this.root.querySelector('.vn-dialogue'), text = box.querySelector('.vn-text');
        const speaker = token.type === 'dialogue' ? (props.displayName || token.character) : token.type === 'interaction' ? 'Interaction' : props.displayName || 'Narration';
        box.querySelector('.vn-speaker').textContent = token.thought ? `${speaker} · thoughts` : speaker;
        const color = (value, fallback) => CSS.supports('color', value || '') ? value : fallback;
        box.style.setProperty('--vn-accent', color(props.color, 'var(--vn-ui-accent)'));
        box.style.setProperty('--vn-name-color', color(props.nameplateColor || props.color, 'var(--vn-ui-accent)'));
        box.style.setProperty('--vn-border-color', color(props.borderColor || props.color, 'var(--vn-border)'));
        box.style.backgroundColor = props.boxColor ? color(props.boxColor, '') : '';
        box.querySelector('.vn-speaker').style.backgroundColor = color(props.nameplateBackground, 'transparent');
        box.style.setProperty('--vn-text-color', color(token.type === 'narration' ? props.textColor || props.narrationColor || this.settings.narrationColor : props.textColor || this.settings.textColor, token.type === 'narration' ? 'var(--vn-muted)' : 'var(--vn-ui-color)'));
        box.style.setProperty('--vn-box-opacity', this.settings.overlayOpacity);
        box.style.setProperty('--vn-dialogue-width', `min(${this.settings.dialogueBoxWidth}vw, 94vw)`);
        box.style.setProperty('--vn-dialogue-min-height', `${this.settings.dialogueBoxHeight}px`);
        box.classList.toggle('vn-no-chrome', !this.settings.showBoxChrome);
        box.classList.toggle('vn-no-panel', !this.settings.showBoxBackground);
        const texturePath = props.boxTexture || this.settings.dialogueBoxTexture;
        const texture = texturePath ? this.resolver.url(`characters/${texturePath}`) : null;
        box.style.backgroundImage = texture ? `url("${texture}")` : '';
        box.classList.toggle('vn-image-only', !!texture && (typeof props.boxImageOnly === 'boolean' ? props.boxImageOnly : this.settings.dialogueBoxImageOnly));
        const style = dialogueEmotionStyle(token, effect, this.settings), flair = style.flair;
        text.style.fontSize = `${this.settings.textScale * style.fontScale * (props.voiceScale || 1)}em`;
        text.style.letterSpacing = style.tracking ? `calc(${this.settings.letterSpacing}px + ${style.tracking}em)` : `${this.settings.letterSpacing}px`;
        text.style.fontFamily = this.resolver.fontFamily(props.font || this.settings.dialogueFont);
        text.className = 'vn-text';
        text.classList.toggle('vn-thought', !!token.thought);
        for (const [name, enabled] of Object.entries({ 'vn-text-jitter': style.jitter, 'vn-text-scatter': style.scatter, 'vn-text-love': style.glow, 'vn-whisper': style.whisper, 'vn-shout': style.shout })) text.classList.toggle(name, enabled);
        const visible = dialogueDisplayText(token.text);
        text.replaceChildren(); this.letters = appendEmphasis(text, visible, [], style.jitter || style.scatter);
        if (style.jitter || style.scatter) {
            const variations = letterVariations(this.letters.map(letter => letter.textContent).join(''));
            this.letters.forEach((letter, index) => {
                if (/\s/u.test(letter.textContent)) return; // Spaces keep their normal width and wrapping.
                const variation = variations[index];
                if (style.scatter) for (const key of ['x', 'y', 'angle']) letter.style.setProperty(`--vn-letter-${key}`, variation[key]);
                letter.style.setProperty('--vn-letter-duration', variation.duration); letter.style.setProperty('--vn-letter-delay', variation.delay);
            });
        }
        box.scrollTop = 0; this.layout.fit();
        const font = props.font || this.settings.dialogueFont;
        if (font) void this.resolver.font(font); // CSS family already chosen; no stale theme callback.
        const animated = !instant && this.settings.typewriterEffect && !this.settings.reducedMotion && this.settings.typewriterSpeed > 0;
        if (!animated) { onDone(); return flair; }
        this.letters.forEach(letter => letter.style.visibility = 'hidden');
        this.typing = true; let index = 0;
        this.complete = () => { if (generation !== this.generation) return; this.letters.forEach(letter => letter.style.visibility = ''); this.typing = false; clearTimeout(this.timer); onDone(); };
        const tick = () => {
            if (generation !== this.generation) return;
            const letter = this.letters[index++];
            if (!letter) { this.complete(); return; }
            letter.style.visibility = '';
            const delay = this.settings.typewriterSpeed * (flair.speedMult || 1) * (Number(props.voiceSpeed) || 1) + (/[.!?…]/.test(letter.textContent) ? flair.dotPause || 70 : 0);
            this.timer = setTimeout(tick, delay);
        };
        let cues = playback?.clip ? speechRevealCues(this.letters.map(letter => letter.textContent).join(''), playback.clip, playback.words) : null;
        if (this.settings.tts?.syncText !== false && !token.thought && playback && (!playback.clip || cues)) {
            let shown = 0;
            const follow = () => {
                if (generation !== this.generation || !this.typing) return;
                if (playback.status === 'failed') { index = shown; tick(); return; }
                if (['ended', 'cancelled'].includes(playback.status)) { this.complete(); return; }
                if (playback.status === 'playing') {
                    cues ??= speechRevealCues(this.letters.map(letter => letter.textContent).join(''), playback.clip, playback.words);
                    if (!cues) { index = shown; tick(); return; }
                    const time = playback.audio?.currentTime;
                    let through = 0;
                    if (Number.isFinite(time)) for (const cue of cues) { if (cue.at > time) break; through = cue.through; }
                    for (let i = Math.min(shown, through); i < Math.max(shown, through); i++) this.letters[i].style.visibility = i < through ? '' : 'hidden';
                    shown = through;
                    if (shown >= this.letters.length) { this.complete(); return; }
                }
                this.timer = setTimeout(follow, 20);
            };
            follow();
        } else tick();
        return flair;
    }
    skip() { if (this.typing) { this.complete?.(); return true; } return false; }
}
