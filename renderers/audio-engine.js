const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));

export class AudioEngine {
    constructor(resolver, settings, report = () => {}, audioFactory = () => new Audio()) {
        this.resolver = resolver; this.settings = settings; this.report = report; this.audioFactory = audioFactory;
        this.channels = { music: {}, ambient: {} }; this.sources = new Set(); this.musicSources = new Set(); this.timers = new Map(); this.unlocked = false; this.epoch = 0; this.sfxEpoch = 0;
        this.suspended = false; this.resumeSources = new Set(); this.fades = new Map();
    }
    async unlock() {
        this.unlocked = true;
        for (const channel of Object.values(this.channels)) if (channel.audio?.paused) await this.play(channel.audio);
    }
    async play(audio) {
        if (!this.unlocked) return;
        if (this.suspended) { this.resumeSources.add(audio); return; }
        try { await audio.play(); if (this.suspended && this.sources.has(audio)) { this.resumeSources.add(audio); audio.pause(); } } catch (error) { this.report(`Audio waiting for browser permission: ${error.message}`); }
        this.onChange?.();
    }
    setSuspended(value) {
        if (this.suspended === !!value) return; this.suspended = !!value;
        if (this.suspended) {
            this.sfxEpoch++;
            for (const audio of this.sources) { if (!audio.loop) this.stop(audio); else { if (!audio.paused) this.resumeSources.add(audio); audio.pause(); } }
        }
        else { const sources = [...this.resumeSources]; this.resumeSources.clear(); for (const audio of sources) if (this.sources.has(audio)) void this.play(audio); }
        this.onChange?.();
    }
    finishLoopFades() {
        const current = new Set(Object.values(this.channels).map(channel => channel.audio).filter(Boolean));
        for (const audio of [...this.sources]) if (audio.loop && !current.has(audio)) this.stop(audio);
        for (const channel of Object.values(this.channels)) if (channel.audio) {
            clearInterval(this.timers.get(channel.audio)); this.timers.delete(channel.audio); this.fades.delete(channel.audio);
            channel.audio.volume = clamp(channel.volume);
        }
    }
    stop(audio) { if (!audio) return; clearInterval(this.timers.get(audio)); this.timers.delete(audio); this.fades.delete(audio); this.resumeSources.delete(audio); audio.pause(); audio.removeAttribute?.('src'); audio.load?.(); this.sources.delete(audio); this.musicSources.delete(audio); }
    setVolume(kind, value) {
        if (!['music', 'ambient', 'sfx'].includes(kind)) return;
        const channel = this.channels[kind], previous = channel?.volume ?? clamp(this.settings[`${kind}Volume`]), volume = clamp(value);
        this.settings[`${kind}Volume`] = volume; if (channel) channel.volume = volume;
        for (const audio of this.sources) {
            if (kind === 'sfx' ? audio.loop : !audio.loop || this.musicSources.has(audio) !== (kind === 'music')) continue;
            const fade = this.fades.get(audio);
            if (fade) {
                fade.initial = previous > 0 ? clamp(fade.initial * volume / previous) : 0;
                fade.target = fade.remove ? 0 : volume;
                const fraction = Math.min(1, (performance.now() - fade.start) / fade.duration);
                audio.volume = clamp(fade.initial + (fade.target - fade.initial) * fraction);
            } else audio.volume = volume;
        }
        this.onChange?.();
    }
    setMusicMuted(muted) {
        this.settings.musicMuted = !!muted;
        // Also silence fading tracks; volume ramps continue normally underneath.
        for (const audio of this.musicSources) audio.muted = !!muted;
        this.onChange?.();
    }
    fade(audio, target, duration, remove = false) {
        clearInterval(this.timers.get(audio)); this.timers.delete(audio); this.fades.delete(audio);
        if (!duration) { audio.volume = target; if (remove) this.stop(audio); return; }
        const fade = { start: performance.now(), initial: audio.volume, target, duration, remove }; this.fades.set(audio, fade);
        const timer = setInterval(() => {
            const fraction = Math.min(1, (performance.now() - fade.start) / fade.duration);
            audio.volume = clamp(fade.initial + (fade.target - fade.initial) * fraction);
            if (fraction === 1) { clearInterval(timer); this.timers.delete(audio); this.fades.delete(audio); if (fade.remove) this.stop(audio); }
        }, 25);
        this.timers.set(audio, timer);
    }
    sync(state) { return Promise.all([this.setChannel('music', state.music), this.setChannel('ambient', state.ambient)]); }
    async setChannel(kind, track) {
        const channel = this.channels[kind], key = track ? `${track.name}:${track.rate}` : '';
        if (kind === 'music') this.setMusicMuted(this.settings.musicMuted);
        const volume = clamp(this.settings[`${kind}Volume`]);
        if (key === channel.key) {
            if (channel.volume !== volume && channel.audio) this.fade(channel.audio, volume, this.settings.crossfadeDuration);
            channel.volume = volume; return;
        }
        // Rate-only changes never restart a track.
        if (track && channel.loadedName === track.name && channel.audio) {
            channel.key = key; channel.track = track; channel.audio.playbackRate = track.rate;
            if (channel.volume !== volume) this.fade(channel.audio, volume, this.settings.crossfadeDuration); channel.volume = volume; return;
        }
        const previousVolume = channel.volume;
        channel.key = key; channel.track = track; channel.volume = volume; const request = (channel.request || 0) + 1; channel.request = request;
        if (!track) { if (channel.audio) this.fade(channel.audio, 0, this.settings.crossfadeDuration, true); channel.audio = null; return; }
        const epoch = this.epoch, url = await this.resolver.audio(kind, track.name);
        if (epoch !== this.epoch || request !== channel.request || key !== channel.key) return;
        if (!url) { if (channel.audio) this.fade(channel.audio, 0, this.settings.crossfadeDuration, true); channel.audio = null; this.report(`Missing ${kind}: ${track.name}`); return; }
        if (channel.audio && channel.url === url) {
            channel.loadedName = track.name; channel.audio.playbackRate = track.rate;
            if (previousVolume !== volume) this.fade(channel.audio, volume, this.settings.crossfadeDuration);
            return;
        }
        const previous = channel.audio, audio = this.audioFactory();
        audio.src = url; audio.loop = true; audio.volume = 0; audio.playbackRate = track.rate;
        audio.muted = kind === 'music' && !!this.settings.musicMuted;
        if (kind === 'music') this.musicSources.add(audio);
        audio.preservesPitch = false; channel.audio = audio; channel.loadedName = track.name; channel.url = url; this.sources.add(audio);
        for (const event of ['playing', 'pause', 'ended', 'error']) audio.addEventListener?.(event, () => this.onChange?.());
        // Keep at most current + fading source per channel during rapid navigation.
        if (channel.fading && channel.fading !== previous) this.stop(channel.fading);
        channel.fading = previous;
        if (previous) this.fade(previous, 0, this.settings.crossfadeDuration, true);
        void this.play(audio); this.fade(audio, clamp(this.settings[`${kind}Volume`]), this.settings.crossfadeDuration);
    }
    async sfx(name, character = null) {
        const epoch = this.sfxEpoch;
        const url = character ? await this.resolver.voice(character, name) : await this.resolver.audio('sfx', name);
        if (epoch !== this.sfxEpoch || !url || !this.unlocked || this.suspended || this.sources.size > 32) return;
        const audio = this.audioFactory(); audio.src = url; audio.volume = clamp(this.settings.sfxVolume); this.sources.add(audio);
        audio.onended = () => this.stop(audio); audio.onerror = () => this.stop(audio);
        try { await audio.play(); if (this.suspended || epoch !== this.sfxEpoch) this.stop(audio); } catch { this.stop(audio); }
    }
    cancelOneShots() { this.sfxEpoch++; for (const audio of [...this.sources]) if (!audio.loop) this.stop(audio); }
    cancelPending() {
        this.epoch++;
        for (const channel of Object.values(this.channels)) {
            channel.request = (channel.request || 0) + 1;
            channel.key = channel.audio ? `${channel.loadedName}:${channel.audio.playbackRate}` : undefined;
            channel.track = channel.audio ? { name: channel.loadedName, rate: channel.audio.playbackRate } : null;
        }
    }
    close() { this.epoch++; this.sfxEpoch++; for (const audio of [...this.sources]) this.stop(audio); this.channels = { music: {}, ambient: {} }; }
}
