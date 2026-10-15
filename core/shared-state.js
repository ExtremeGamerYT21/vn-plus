import { sceneLighting } from './scene-context.js';

export const SHARED_STATE_KEY = 'vn_plus';

export function audioState(track, channel = {}, muted = false, volume = 0) {
    const audio = channel.audio;
    return { name: track?.name || null, asset: audio ? channel.url || null : null, rate: audio?.playbackRate || track?.rate || 1,
        loaded: !!audio, playing: !!audio && !audio.paused && !audio.ended && !audio.error, muted: !!muted, volume };
}

/** Export only scene data, never raw dialogue, character properties, or provider credentials. */
export function sceneSnapshot({ state, registry, settings, environment, stage, audio, source, active = true, generating = false }) {
    const characters = Object.values(state.characters).filter(character => !registry.isNarrator(character.id))
        .sort((a, b) => a.slot - b.slot).map(character => ({ id: character.id, name: character.name, emotion: character.expression,
            slot: character.slot, player: registry.isPlayer(character.id), speaking: character.id === state.speaker }));
    const playerId = registry.identify(settings.playerName), player = characters.find(character => character.id === playerId);
    return { schemaVersion: 1, available: true, active, generating, environment: { id: environment.id, name: environment.name }, source,
        scene: structuredClone(state.scene), timeOfDay: sceneLighting(state.scene, false).period, characters, speaker: state.speaker,
        player: { id: playerId, name: registry.get(playerId).displayName || settings.playerName, emotion: state.playerEmotion || player?.emotion || null, present: !!player },
        background: { name: state.background, asset: stage.backgroundUrl || null, inside: !!stage.variables?.lighting.inside, outside: !stage.variables?.lighting.inside },
        lighting: { ...sceneLighting(state.scene, !!stage.variables?.lighting.inside), ambientColor: stage.ambientColor || '#ffffff', tint: stage.appliedTint || 'transparent', tintOpacity: .28 },
        music: audioState(state.music, audio.channels.music, settings.musicMuted, settings.musicVolume),
        ambient: audioState(state.ambient, audio.channels.ambient, false, settings.ambientVolume),
        presentation: { mode: state.mode, black: state.black, camera: structuredClone(state.camera), textEffect: state.textEffect } };
}

/** Scalars are strings so ST's getvar macros and /getvar behave consistently. */
export function sharedVariables(value) {
    return {
        [SHARED_STATE_KEY]: JSON.stringify(value),
        vn_plus_available: String(value.available), vn_plus_updating: String(!!value.updating), vn_plus_active: String(value.active), vn_plus_generating: String(value.generating),
        vn_plus_environment: value.environment.id,
        vn_plus_characters: JSON.stringify(value.characters || []),
        vn_plus_player_emotion: value.player?.emotion || '', vn_plus_speaker: value.speaker || '',
        vn_plus_date: value.scene?.date || '', vn_plus_time: value.scene?.time || '', vn_plus_location: value.scene?.location || '',
        vn_plus_time_of_day: value.timeOfDay || 'unknown', vn_plus_background: value.background?.name || '',
        vn_plus_inside: value.available ? String(!!value.background?.inside) : '', vn_plus_outside: value.available ? String(!!value.background?.outside) : '',
        vn_plus_lighting_level: value.available && value.lighting ? String(value.lighting.level) : '', vn_plus_ambient_light_color: value.available ? value.lighting?.ambientColor || '' : '',
        vn_plus_music: value.music?.name || '', vn_plus_music_playing: String(!!value.music?.playing), vn_plus_ambient: value.ambient?.name || '',
    };
}

export class ChatStatePublisher {
    constructor(host, notify = () => {}, key = SHARED_STATE_KEY) { this.host = host; this.notify = notify; this.key = key; this.epoch = 0; }
    bind(environment) {
        this.epoch++; this.pending = false; this.binding = this.host.captureChatVariables?.();
        // Persisted output is never an input. Reconstruct from the currently selected chat swipes.
        this.value = { schemaVersion: 1, basis: this.key === SHARED_STATE_KEY ? 'context' : 'playback', available: false, updating: false, environment: { id: environment.id, name: environment.name }, source: null,
            scene: null, characters: [], speaker: null, player: null, background: null, lighting: null, music: null, ambient: null, presentation: null };
        this.value.active = false; this.value.generating = false;
        for (const kind of ['music', 'ambient']) if (this.value[kind]) { this.value[kind].playing = false; this.value[kind].loaded = false; }
        this.flush();
    }
    begin() { this.pending = true; return ++this.epoch; }
    commit(value, epoch) {
        if (epoch !== this.epoch || !this.binding?.current()) return false;
        this.pending = false; this.value = structuredClone(value); this.flush(); return true;
    }
    cancel() { this.epoch++; this.pending = false; }
    update(patch) { if (!this.value || this.pending) return; this.value = { ...this.value, ...structuredClone(patch) }; this.flush(); }
    flush() {
        const values = this.key === SHARED_STATE_KEY ? sharedVariables(this.value) : { [this.key]: JSON.stringify(this.value) };
        const changed = this.binding?.read(this.key) !== values[this.key];
        if (this.binding?.write(values) && changed) this.notify(structuredClone(this.value));
    }
    get snapshot() { return structuredClone(this.value); }
}
