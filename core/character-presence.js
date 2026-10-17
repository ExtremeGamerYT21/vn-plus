export const SILENT_BEAT_GRACE = 4;
export const QUIET_FADE_BEATS = 4;
export const characterPresent = character => character.present !== false;
export const characterSilence = character => Math.max(0, Math.min(SILENT_BEAT_GRACE + QUIET_FADE_BEATS, Number(character.silentBeats) || 0));

/** Beat-based inactivity is reproducible on refresh and backward navigation. */
export function quietPresentation(character, speaker, settings) {
    const quiet = character.id === speaker ? 0 : Math.max(0, characterSilence(character) - SILENT_BEAT_GRACE);
    return { quiet, retreat: quiet ? Math.min(14, quiet * 3.5) : 0,
        brightness: quiet ? 1 - (1 - Math.max(.12, Math.min(1, Number(settings.inactiveBrightness) || .45))) * quiet / QUIET_FADE_BEATS : 1 };
}
