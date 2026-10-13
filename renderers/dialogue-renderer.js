import { EMOTION_FLAIR } from './emotion-flair.js';

/** Small, safe emphasis renderer. Text is always inserted with text nodes. */
export function appendEmphasis(container, text, letters = []) {
    for (const part of text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g)) {
        let parent = container, value = part;
        if (/^\*\*.*\*\*$/s.test(part)) { parent = document.createElement('strong'); value = part.slice(2, -2); container.append(parent); }
        else if (/^(\*.*\*|_.*_)$/s.test(part)) { parent = document.createElement('em'); value = part.slice(1, -1); container.append(parent); }
        for (const char of value) { const span = document.createElement('span'); span.textContent = char; parent.append(span); letters.push(span); }
    }
    return letters;
}

export class DialogueRenderer {
    constructor(root, resolver, settings) { this.root = root; this.resolver = resolver; this.settings = settings; this.generation = 0; this.timer = null; this.typing = false; this.letters = []; }
    cancel() { this.generation++; clearTimeout(this.timer); this.timer = null; this.typing = false; }
    async render(token, props = {}, effect = 'normal', onDone = () => {}, instant = false) {
        this.cancel(); const generation = this.generation;
        const box = this.root.querySelector('.vn-dialogue'), text = box.querySelector('.vn-text');
        box.querySelector('.vn-speaker').textContent = token.type === 'dialogue' ? (props.displayName || token.character) : 'Narration';
        const color = (value, fallback) => CSS.supports('color', value || '') ? value : fallback;
        box.style.setProperty('--vn-accent', color(props.color, '#baabef'));
        box.style.setProperty('--vn-name-color', color(props.nameplateColor || props.color, '#baabef'));
        box.style.setProperty('--vn-border-color', color(props.borderColor || props.color, '#baabef88'));
        box.style.backgroundColor = props.boxColor ? color(props.boxColor, '') : '';
        box.querySelector('.vn-speaker').style.backgroundColor = color(props.nameplateBackground, 'transparent');
        box.style.setProperty('--vn-text-color', color(token.type === 'narration' ? props.narrationColor || this.settings.narrationColor : props.textColor || this.settings.textColor, '#f4f1fa'));
        box.style.setProperty('--vn-box-opacity', this.settings.overlayOpacity);
        box.style.width = `min(${this.settings.dialogueBoxWidth}vw, 94vw)`;
        box.style.minHeight = `${this.settings.dialogueBoxHeight}px`;
        box.classList.toggle('vn-no-chrome', !this.settings.showBoxChrome);
        box.classList.toggle('vn-no-panel', !this.settings.showBoxBackground);
        const texture = this.resolver.url(`characters/${props.boxTexture || this.settings.dialogueBoxTexture}`);
        box.style.backgroundImage = texture && (props.boxTexture || this.settings.dialogueBoxTexture) ? `url("${texture}")` : '';
        const flair = this.settings.textEffects ? EMOTION_FLAIR[token.emotion] || {} : {};
        text.style.fontSize = `${this.settings.textScale * (flair.fontScale || 1) * (props.voiceScale || 1)}em`;
        text.style.letterSpacing = `${this.settings.letterSpacing}px`;
        text.style.fontFamily = this.resolver.fontFamily(props.font || this.settings.dialogueFont);
        text.className = 'vn-text';
        if (!this.settings.reducedMotion && this.settings.textEffects) {
            if (flair.shake && flair.shake !== 'none' || ['shake', 'jitter'].includes(effect) || this.settings.typewriterJitter) text.classList.add('vn-text-jitter');
            if (effect === 'whisper') text.classList.add('vn-whisper');
            if (effect === 'shout') text.classList.add('vn-shout');
        }
        text.replaceChildren(); this.letters = appendEmphasis(text, token.text || '');
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
        tick(); return flair;
    }
    skip() { if (this.typing) { this.complete?.(); return true; } return false; }
}
