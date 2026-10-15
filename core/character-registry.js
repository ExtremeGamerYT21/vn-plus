export const slug = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_'-]/gu, '');
export const characterNameKey = value => {
    const raw = typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : '';
    return slug(raw) || (raw ? `literal:${raw}` : '');
};
export const isNarratorName = value => ['narrator', 'narration'].includes(slug(value));
const aliases = value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : typeof value === 'string' ? [value] : [];
export const EMOTION_ALIASES = { neutral: 'default', normal: 'default', mad: 'angry', furious: 'rage', annoyed: 'angry', joy: 'happy', excited: 'happy', cheerful: 'happy', depressed: 'sad', upset: 'sad', shocked: 'surprised', startled: 'surprised', shy: 'embarrassed', flustered: 'embarrassed', anxious: 'nervous', worried: 'nervous', terrified: 'scared', afraid: 'scared', loving: 'love', weeping: 'crying', amused: 'laughing', sleepy: 'tired' };

export class CharacterRegistry {
    constructor(resolver, settings) { this.resolver = resolver; this.settings = settings; this.properties = new Map(); this.knownProperties = new Set(); }
    entries() { return Object.entries(this.settings.characters || {}).map(([id, props]) => ({ ...props, id: slug(id) })); }
    identify(name) {
        const key = slug(name);
        const identity = characterNameKey(name), matches = alias => !!identity && characterNameKey(alias) === identity;
        const configured = this.entries().find(entry => [entry.id, entry.displayName, ...aliases(entry.aliases)].some(matches));
        if (configured) return configured.id;
        for (const [id, props] of this.properties) if ([props.displayName, ...aliases(props.aliases)].some(matches)) return id;
        if ([this.settings.playerName, ...(this.settings.playerAliases || [])].some(matches)) return slug(this.settings.playerName);
        return key || 'unknown';
    }
    isPlayer(id) { return this.identify(id) === this.identify(this.settings.playerName); }
    isNarrator(name) { const id = this.identify(name); return isNarratorName(name) || isNarratorName(id) || isNarratorName(this.get(id).displayName); }
    knows(name) {
        const id = this.identify(name);
        return this.isNarrator(name) || this.isPlayer(id) || this.entries().some(entry => entry.id === id) || Object.hasOwn(this.resolver.inventory.characters || {}, id) || this.knownProperties.has(id);
    }
    acceptCharacter(entry) {
        const properties = { ...entry.properties };
        if (entry.name) properties.aliases = [...new Set([...aliases(properties.aliases), entry.name])];
        this.properties.set(entry.id, properties); this.knownProperties.add(entry.id);
    }
    get(id) { return { ...(this.properties.get(id) || {}), ...(this.entries().find(entry => entry.id === id) || {}) }; }
    async prepare(names) {
        // Inventory makes property aliases discoverable without directory listing APIs.
        const ids = new Set([...Object.keys(this.resolver.inventory.characters || {}), ...this.entries().map(entry => entry.id), ...names.map(slug)]);
        await Promise.all([...ids].map(async id => {
            if (this.properties.has(id)) return;
            const value = await this.resolver.json(`characters/${id}/properties.json`);
            if (value && typeof value === 'object' && !Array.isArray(value)) this.knownProperties.add(id);
            this.properties.set(id, value && typeof value === 'object' ? value : {});
        }));
    }
    expressionCandidates(id, emotion) {
        const props = this.get(id), exact = slug(emotion) || 'default';
        const local = Object.entries(props.expressionAliases || {}).find(([key]) => slug(key) === exact)?.[1];
        return [...new Set([exact, ...aliases(local), EMOTION_ALIASES[exact], props.defaultExpression, 'default'].filter(Boolean).map(slug))];
    }
}
