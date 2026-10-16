export const characterPresent = character => character.present !== false;
export const characterSilence = character => Math.max(0, Math.min(4, Number(character.silentBeats) || 0));

/** Beat-based inactivity is reproducible on refresh and backward navigation. */
export function quietPresentation(character, speaker, settings) {
    const quiet = character.id === speaker ? 0 : Math.max(1, characterSilence(character));
    return { quiet, retreat: quiet ? Math.min(14, quiet * 3.5) : 0,
        brightness: quiet ? 1 - (1 - Math.max(.12, Math.min(1, Number(settings.inactiveBrightness) || .45))) * quiet / 4 : 1 };
}
