/** Navigation is independent of DOM, audio, and SillyTavern. */
export class Playback {
    constructor(timeline, seen = new Set()) {
        this.timeline = timeline; this.seen = seen; this.fired = new Set(); this.cursor = -1; this.position = -1;
        const reached = Math.max(-1, ...seen);
        this.markThrough(reached);
    }
    markThrough(cursor) {
        for (let i = 0; i <= cursor; i++) {
            this.fired.add(i);
            for (const command of this.timeline.beats[i]?.attached || []) this.fired.add(command.index);
        }
    }
    forward() {
        const target = this.timeline.views[this.position + 1] ?? this.timeline.beats.length;
        const effects = [];
        for (let i = this.cursor + 1; i < Math.min(target + 1, this.timeline.beats.length); i++) {
            if (!this.fired.has(i)) { effects.push(...this.timeline.beats[i].oneShots); this.fired.add(i); }
        }
        const attached = (this.timeline.beats[target]?.attached || []).map(command => {
            const oneShots = this.fired.has(command.index) ? [] : command.oneShots;
            this.fired.add(command.index); return { ...command, oneShots };
        });
        this.cursor = Math.min(target, this.timeline.beats.length - 1);
        this.position++;
        const done = target >= this.timeline.beats.length;
        const beat = this.timeline.beats[this.cursor] || null;
        const previouslySeen = this.seen.has(this.cursor);
        this.seen.add(this.cursor);
        return { beat, effects, attached, done, previouslySeen, forward: true, replaying: this.replaying };
    }
    back() {
        if (this.position <= 0) return null;
        this.position = Math.min(this.position - 1, this.timeline.views.length - 1);
        this.cursor = this.timeline.views[this.position];
        return { beat: this.timeline.beats[this.cursor], effects: [], done: false, forward: false };
    }
    replay() { this.cursor = -1; this.position = -1; this.fired.clear(); this.replaying = true; return this.forward(); }
    resume(position) {
        this.position = Math.max(0, Math.min(this.timeline.views.length, Math.floor(Number(position) || 0)));
        this.cursor = this.timeline.views[this.position] ?? this.timeline.beats.length - 1;
        this.markThrough(this.cursor);
        this.seen.add(this.cursor); return this.restore();
    }
    skipViewed() {
        let result = this.forward();
        while (!result.done && result.previouslySeen && this.seen.has(this.timeline.views[this.position + 1])) result = this.forward();
        // Skipping viewed content restores the destination, never replays intervening SFX.
        return { ...result, effects: [], attached: [] };
    }
    restore() { return { beat: this.timeline.beats[this.cursor] || null, effects: [], done: this.position >= this.timeline.views.length, forward: false }; }
}
