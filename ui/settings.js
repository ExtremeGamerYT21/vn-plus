import { STAGE_LAYOUT_OPTIONS, normalizeStageLayout, SPRITE_FRAMING_OPTIONS, normalizeSpriteFraming } from '../core/stage-layout.js';
import { slug } from '../core/character-registry.js';
import { breathingConfig } from '../renderers/sprite-mesh.js';
import { DEFAULT_ENVIRONMENT, initializeContentProfiles } from '../core/content-environments.js';
import { INTENSE_EMOTIONS } from '../renderers/emotion-flair.js';
import { createThemeSettings } from './theme-settings.js';
import { SPEECH_DEFAULTS, speechSettings } from '../core/speech-segments.js';
import { LIGHT_DEFAULTS } from '../core/scene-light.js';

export const DEFAULT_SETTINGS = {
    ...LIGHT_DEFAULTS,
    enabled: true, automaticPlayback: false, environmentCss: true, playerName: 'Jason', playerAliases: [], showPlayerBust: true,
    layout: 'rows', spriteFraming: 'bust', stageLayoutVersion: 3, layouts: {}, displayMode: 'vn', bustScale: 1, bustHeight: 78, stageSpacing: 1, stageAlignment: 'bottom', inactiveBrightness: .45,
    rowSpacing: 8, rowRise: 6.5, rowDepthScale: .95,
    spriteBreathing: true, breathingAmount: 1.6, breathingDuration: 4200, expressionTransition: 280,
    spriteBlinking: true, blinkIntervalMin: 2800, blinkIntervalMax: 6500, blinkDuration: 130,
    typewriterEffect: true, typewriterSpeed: 22, autoAdvance: false, textEffects: true, screenEffects: true,
    dialogueSecondsPerCharacter: .1, narrationWordsPerMinute: 220,
    hurriedReactionSound: '', scaredReactionSound: '', lazyReactionSound: '', boredReactionSound: '', normalReactionSound: '',
    reducedMotion: false, overlayOpacity: .9, dialogueBoxWidth: 52, dialogueBoxHeight: 180, dialogueFont: '', textScale: 1.15,
    textColor: '', narrationColor: '', dialogueBoxTexture: '', dialogueBoxImageOnly: false, showBoxChrome: true, showBoxBackground: true,
    themeVersion: 1, themeColors: {}, intenseEmotions: INTENSE_EMOTIONS,
    tts: SPEECH_DEFAULTS,
    letterSpacing: 0, musicVolume: .5, musicMuted: false, ambientVolume: .4, sfxVolume: .8, crossfadeDuration: 800,
    interactiveArtifacts: false, characterSounds: true, missingAsset: 'placeholder', debug: false, characters: {},
    autoCreateCharacters: true, castMemoryTurns: 3,
    environment: DEFAULT_ENVIRONMENT, environmentProfiles: {},
};

export function loadSettings(context) {
    const previous = context.extensionSettings.visual_novel_plus || {};
    const settings = { ...structuredClone(DEFAULT_SETTINGS), ...previous };
    settings.spriteFraming = normalizeSpriteFraming(settings.spriteFraming);
    settings.layout = normalizeStageLayout(settings.layout); settings.stageLayoutVersion = 3;
    if (previous.reducedMotion === undefined && typeof matchMedia === 'function') settings.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (previous.playerNameOverride && !previous.playerName) settings.playerName = previous.playerNameOverride;
    delete settings.injectFormatHint;
    delete settings.autoAdvanceDelay;
    settings.playerAliases = Array.isArray(settings.playerAliases) ? settings.playerAliases : [];
    if (!settings.characters || typeof settings.characters !== 'object' || Array.isArray(settings.characters)) settings.characters = {};
    if (!previous.themeVersion) {
        if (settings.textColor === '#f4f1fa') settings.textColor = '';
        if (settings.narrationColor === '#ddd5ea') settings.narrationColor = '';
        if (settings.dialogueFont === 'faustina') settings.dialogueFont = '';
        for (const profile of Object.values(settings.environmentProfiles || {})) if (profile?.dialogueFont === 'faustina') profile.dialogueFont = '';
    }
    settings.themeVersion = 1; delete settings.typewriterJitter;
    settings.tts = speechSettings(settings.tts);
    settings.themeColors = settings.themeColors && typeof settings.themeColors === 'object' && !Array.isArray(settings.themeColors) ? settings.themeColors : {};
    settings.intenseEmotions = Array.isArray(settings.intenseEmotions) ? settings.intenseEmotions.filter(tag => typeof tag === 'string') : [...INTENSE_EMOTIONS];
    initializeContentProfiles(settings);
    return settings;
}

const FIELDS = {
    'Scene lighting': [['sceneLightEnabled', 'Enable 2D scene lighting', 'checkbox'], ['sceneLightNormalMaps', 'Use sprite normal and material maps', 'checkbox'], ['sceneLightHud', 'Light HUD and buttons', 'checkbox'], ['sceneLightIntensity', 'Light intensity', 'number', 0, 2], ['sceneLightAmbient', 'Ambient fill (readability)', 'number', 0, 1]],
    General: [['enabled', 'Enable Visual Novel+', 'checkbox'], ['automaticPlayback', 'Open completed responses automatically', 'checkbox'], ['playerName', 'Player identity', 'text'], ['playerAliases', 'Player aliases (comma separated)', 'aliases'], ['showPlayerBust', 'Hide player bust (first-person view)', 'inverse-checkbox'], ['castMemoryTurns', 'Cast memory (VN responses; 0 keeps until exit)', 'number', 0, 50], ['layout', 'Bust layout', STAGE_LAYOUT_OPTIONS], ['spriteFraming', 'Artwork framing', SPRITE_FRAMING_OPTIONS], ['displayMode', 'Default presentation', ['vn', 'cinematic', 'prose', 'black']]],
    Timing: [['autoAdvance', 'Auto: follow narrative timing', 'checkbox'], ['dialogueSecondsPerCharacter', 'Silent dialogue (seconds per character)', 'number', .01, 1], ['narrationWordsPerMinute', 'Narration reading speed (words/minute)', 'number', 60, 1000], ...['hurried', 'scared', 'lazy', 'bored', 'normal'].map(tag => [`${tag}ReactionSound`, `${tag}: optional reaction SFX name`, 'text'])],
    Presentation: [['typewriterEffect', 'Typewriter', 'checkbox'], ['typewriterSpeed', 'Typewriter delay (ms)', 'number', 0, 200], ['reducedMotion', 'Reduced motion', 'checkbox'], ['textEffects', 'Emotion text effects', 'checkbox'], ['intenseEmotions', 'Emotion tags that shake (comma separated)', 'aliases'], ['screenEffects', 'Screen effects', 'checkbox'], ['dialogueFont', 'Font name or CSS family stack', 'text'], ['textColor', 'Dialogue color override (empty inherits theme)', 'text'], ['narrationColor', 'Narration color override (empty inherits theme)', 'text'], ['textScale', 'Text scale', 'number', .6, 2], ['letterSpacing', 'Letter spacing (px)', 'number', -1, 5], ['dialogueBoxWidth', 'Dialogue width (% viewport)', 'number', 25, 94], ['dialogueBoxHeight', 'Dialogue minimum height (px)', 'number', 100, 450], ['overlayOpacity', 'Dialogue opacity', 'number', .1, 1], ['dialogueBoxTexture', 'Texture path under characters/', 'text'], ['dialogueBoxImageOnly', 'Textbox image only (no fill or frame)', 'checkbox'], ['showBoxChrome', 'Dialogue border and accent', 'checkbox'], ['showBoxBackground', 'Dialogue panel background', 'checkbox']],
    Characters: [['bustScale', 'Global bust scale', 'number', .2, 2], ['bustHeight', 'Bust height (% viewport)', 'number', 20, 100], ['stageSpacing', 'Stage spacing', 'number', .4, 1.2], ['rowSpacing', 'Row inward spacing (% viewport)', 'number', 3, 14], ['rowRise', 'Row depth rise (% viewport)', 'number', 1, 10], ['rowDepthScale', 'Scale per depth step', 'number', .8, 1], ['stageAlignment', 'Stage alignment', ['bottom', 'top']], ['inactiveBrightness', 'Inactive brightness', 'number', .2, 1], ['missingAsset', 'Missing sprite', ['placeholder', 'hide']], ['spriteBreathing', 'Breathing deformation', 'checkbox'], ['breathingAmount', 'Breathing amount (%)', 'number', 0, 5], ['breathingDuration', 'Breathing cycle (ms)', 'number', 1000, 20000], ['expressionTransition', 'Expression blend (ms)', 'number', 0, 2000], ['spriteBlinking', 'Blinking with alternative image', 'checkbox'], ['blinkIntervalMin', 'Blink interval minimum (ms)', 'number', 500, 30000], ['blinkIntervalMax', 'Blink interval maximum (ms)', 'number', 500, 60000], ['blinkDuration', 'Closed-eye duration (ms)', 'number', 60, 350]],
    Audio: [['musicMuted', 'Mute music (ambience/SFX stay audible)', 'checkbox'], ['musicVolume', 'Music volume', 'number', 0, 1], ['ambientVolume', 'Ambient volume', 'number', 0, 1], ['sfxVolume', 'SFX volume', 'number', 0, 1], ['crossfadeDuration', 'Crossfade (ms)', 'number', 0, 10000], ['characterSounds', 'Emotion / character sounds', 'checkbox']],
    'Artifacts & debugging': [['interactiveArtifacts', 'Allow isolated interactive HTML artifacts', 'checkbox'], ['debug', 'Debug logging', 'checkbox']],
};

export function createSettings(settings, callbacks) {
    const panel = document.createElement('div'); panel.id = 'vnplus-settings'; panel.className = 'vnplus-ui';
    const heading = document.createElement('h3'); heading.textContent = 'Visual Novel+'; panel.append(heading);
    const actions = document.createElement('div'); actions.className = 'vn-settings-actions';
    for (const [label, callback] of [['Enter / resume VN', callbacks.open], ['Replay selected', callbacks.replay], ['Inspect scene', callbacks.debug], ['Refresh assets', callbacks.refresh]]) {
        const button = document.createElement('button'); button.textContent = label; button.addEventListener('click', callback); actions.append(button);
    }
    panel.append(actions);
    panel.append(createThemeSettings(settings, callbacks.change));
    if (callbacks.speechPanel) panel.append(callbacks.speechPanel);
    for (const [group, fields] of Object.entries(FIELDS)) {
        const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = group; details.append(summary); details.open = group === 'General';
        const definitions = group === 'General' ? [['environment', 'Content environment', callbacks.environments || []], ...fields] : fields;
        for (const [key, label, type, min, max] of definitions) {
            const row = document.createElement('label'); row.className = 'vn-setting';
            const caption = document.createElement('span'); caption.textContent = label;
            const input = document.createElement(Array.isArray(type) ? 'select' : 'input'); input.dataset.setting = key;
            if (Array.isArray(type)) for (const value of type) { const option = document.createElement('option'); option.value = typeof value === 'string' ? value : value.value; option.textContent = typeof value === 'string' ? value : value.label; input.append(option); }
            else { input.type = type === 'aliases' ? 'text' : type === 'inverse-checkbox' ? 'checkbox' : type; if (type === 'number') { input.min = min; input.max = max; input.step = min === .01 ? '.01' : max <= 5 ? '.05' : '1'; } }
            if (type === 'inverse-checkbox') input.checked = !settings[key]; else if (type === 'checkbox') input.checked = !!settings[key]; else input.value = type === 'aliases' ? settings[key].join(', ') : settings[key];
            input.addEventListener('change', () => {
                let value = type === 'inverse-checkbox' ? !input.checked : type === 'checkbox' ? input.checked : type === 'number' ? Math.max(min, Math.min(max, Number(input.value))) : type === 'aliases' ? input.value.split(',').map(item => item.trim()).filter(Boolean) : input.value;
                if (type === 'number' && !Number.isFinite(value)) return;
                settings[key] = value; callbacks.change(key);
            });
            row.append(caption, input); details.append(row);
        }
        if (group === 'General') {
            const cssRow = document.createElement('label'); cssRow.className = 'vn-setting';
            const cssToggle = document.createElement('input'); cssToggle.type = 'checkbox'; cssToggle.checked = settings.environmentCss !== false; cssToggle.dataset.setting = 'environmentCss';
            cssToggle.addEventListener('change', () => { settings.environmentCss = cssToggle.checked; callbacks.change('environmentCss'); });
            cssRow.append(document.createTextNode('Apply environment CSS (dialogue / settings)'), cssToggle); details.append(cssRow);
            const cssStatus = document.createElement('p'); cssStatus.className = 'vn-hint'; cssStatus.dataset.environmentCssStatus = ''; cssStatus.role = 'status'; details.append(cssStatus);
            const hint = document.createElement('p'); hint.className = 'vn-hint'; hint.dataset.environmentStatus = ''; hint.role = 'status'; details.append(hint);
        }
        if (group === 'Presentation') {
            const hint = document.createElement('p'); hint.className = 'vn-hint'; hint.textContent = 'Textbox image only uses your character or global texture without a fill, frame, accent, shadow or blur. With no texture configured, the normal box remains. A character can override this with "boxImageOnly":true or false.'; details.append(hint);
        }
        if (group === 'Timing') {
            const hint = document.createElement('p'); hint.className = 'vn-hint'; hint.textContent = 'Auto uses prepared voice clips and their timestamps, or local dialogue/reading/action rules, then waits one full second after text, speech and reactions finish. Without a rule, continue manually. Visuals stay interactive during narration. Only a matching #VISUAL CLOSE enables an object inspection duration. Reaction tags use local aliases and patterns; no model is called.'; details.append(hint);
        }
        if (group === 'Scene lighting') {
            const hint = document.createElement('p'); hint.className = 'vn-hint'; hint.textContent = 'Uses a cached 2D light direction, story time outdoors and a warm overhead light indoors. Background properties can override light.position X/Y, color, intensity and ambient. Optional emotion_normal.png and emotion_material.png add surface shading; material RGB = occlusion, roughness, metallic. Artifacts receive lighting through VNPlus.getLighting() and onLighting().'; details.append(hint);
        }
        if (group === 'Characters') {
            const row = document.createElement('label'); row.className = 'vn-setting';
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = settings.autoCreateCharacters; checkbox.dataset.setting = 'autoCreateCharacters';
            checkbox.addEventListener('change', () => { settings.autoCreateCharacters = checkbox.checked; callbacks.change('autoCreateCharacters'); });
            row.append(document.createTextNode('Create folders for unknown speakers'), checkbox); details.append(row);
            const folderStatus = document.createElement('p'); folderStatus.className = 'vn-hint'; folderStatus.dataset.characterFoldersStatus = ''; folderStatus.role = 'status';
            folderStatus.textContent = 'New speakers get sprites/, properties.json and a saved random text color in this environment. Uses the VN+ server bridge; no Fish key is needed.'; details.append(folderStatus);
            const help = document.createElement('p'); help.className = 'vn-hint'; help.textContent = 'Registry overrides: JSON keyed by folder ID. Supports identity/expression aliases, colors, fonts, textures, scale/offsets, sounds, breathing and blink. Fish voice: "voiceId":"your-fish-voice-id". Omit voiceId to keep a character mute. Breathing center: "breathing":{"centerX":0.5,"centerY":0.62}. X runs left to right, Y top to bottom (0–1 over the full sprite image, including transparent padding). Missing blink artwork leaves eyes open. Image position: "offsetX":20 shifts right 20 px; "offsetY":-30 shifts up 30 px. Offsets and "bustScale" work with both bust and full-body framing.';
            const editor = document.createElement('textarea'); editor.rows = 8; editor.value = JSON.stringify(settings.characters, null, 2); editor.setAttribute('aria-label', 'Character registry JSON');
            const save = document.createElement('button'); save.textContent = 'Apply registry';
            const status = document.createElement('p'); status.role = 'status'; status.dataset.characterStatus = '';
            save.addEventListener('click', () => { try { const value = JSON.parse(editor.value); if (!value || Array.isArray(value) || typeof value !== 'object' || Object.values(value).some(props => !props || Array.isArray(props) || typeof props !== 'object')) throw new Error('Use an object of character property objects.'); settings.characters = value; callbacks.change('characters'); status.textContent = 'Registry saved.'; } catch (error) { status.textContent = error.message; } });
            const centerHelp = document.createElement('p'); centerHelp.className = 'vn-hint'; centerHelp.textContent = 'Set a breathing center for an individual character. X: 0 left, 1 right. Y: 0 top, 1 bottom. Default: (0.5, 0.62). Changes apply to the visible bust immediately.';
            const centerName = document.createElement('input'); centerName.placeholder = 'Character name or folder ID'; centerName.setAttribute('aria-label', 'Breathing center character');
            const centerFields = document.createElement('div'), centerCharacterRow = document.createElement('label'), centerCharacterCaption = document.createElement('span');
            centerCharacterRow.className = 'vn-setting'; centerCharacterCaption.textContent = 'Character'; centerCharacterRow.append(centerCharacterCaption, centerName); centerFields.append(centerCharacterRow);
            const centers = {};
            for (const [key, label, value] of [['centerX', 'Breathing center X', .5], ['centerY', 'Breathing center Y', .62]]) {
                const row = document.createElement('label'); row.className = 'vn-setting';
                const caption = document.createElement('span'); caption.textContent = label;
                const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = '1'; input.step = '.01'; input.value = value;
                row.append(caption, input); centerFields.append(row); centers[key] = input;
            }
            const loadCenter = document.createElement('button'); loadCenter.textContent = 'Load breathing center';
            const applyCenter = document.createElement('button'); applyCenter.textContent = 'Apply breathing center';
            const resolveCenterCharacter = async () => {
                if (!centerName.value.trim()) throw new Error('Enter a character name or folder ID.');
                return callbacks.properties ? callbacks.properties(centerName.value) : { id: slug(centerName.value), properties: settings.characters[slug(centerName.value)] || {} };
            };
            loadCenter.addEventListener('click', async () => {
                try {
                    const { id, properties } = await resolveCenterCharacter();
                    const config = breathingConfig(properties, settings); centers.centerX.value = config.centerX; centers.centerY.value = config.centerY;
                    centerName.value = id; status.textContent = `Breathing center loaded for ${id}.`;
                } catch (error) { status.textContent = error.message; }
            });
            applyCenter.addEventListener('click', async () => {
                try {
                    const values = Object.fromEntries(Object.entries(centers).map(([key, input]) => [key, input.value.trim() ? Number(input.value) : NaN]));
                    if (Object.values(values).some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Center X and Y must be between 0 and 1.');
                    const { id, properties } = await resolveCenterCharacter();
                    const breathing = properties.breathing === false ? { enabled: false } : properties.breathing || {};
                    settings.characters = { ...settings.characters, [id]: { ...settings.characters[id], breathing: { ...breathing, ...values } } };
                    editor.value = JSON.stringify(settings.characters, null, 2); callbacks.change('breathingCenter');
                    centerName.value = id; status.textContent = `Breathing center saved for ${id}.`;
                } catch (error) { status.textContent = error.message; }
            });
            centerFields.append(loadCenter, applyCenter);
            const previewRow = document.createElement('div'), name = document.createElement('input'), emotion = document.createElement('input'), preview = document.createElement('button'), image = document.createElement('img');
            name.placeholder = 'Character name'; name.setAttribute('aria-label', 'Preview character'); emotion.placeholder = 'Expression (default)'; emotion.setAttribute('aria-label', 'Preview expression'); preview.textContent = 'Preview sprite'; image.className = 'vn-sprite-preview'; image.hidden = true;
            preview.addEventListener('click', async () => { const url = await callbacks.preview(name.value, emotion.value || 'default'); image.hidden = !url; if (url) { image.src = url; image.alt = name.value; } status.textContent = url || 'No sprite resolved. A placeholder will be used.'; });
            previewRow.append(name, emotion, preview, image);
            const layouts = document.createElement('textarea'); layouts.rows = 3; layouts.value = JSON.stringify(settings.layouts); layouts.setAttribute('aria-label', 'Stage layout JSON');
            const layoutLabel = document.createElement('p'); layoutLabel.textContent = 'Optional slot percentages by cast size, e.g. {"4":[12,37,63,88]}';
            const layoutSave = document.createElement('button'); layoutSave.textContent = 'Apply layouts'; layoutSave.addEventListener('click', () => { try { const value = JSON.parse(layouts.value); if (!value || Array.isArray(value) || typeof value !== 'object' || Object.values(value).some(list => !Array.isArray(list) || list.some(x => !Number.isFinite(x) || x < 5 || x > 95))) throw new Error('Use arrays of positions between 5 and 95.'); settings.layouts = value; callbacks.change('layouts'); status.textContent = 'Layouts saved.'; } catch (error) { status.textContent = error.message; } });
            details.append(centerHelp, centerFields, help, editor, save, previewRow, layoutLabel, layouts, layoutSave, status);
        }
        panel.append(details);
    }
    const note = document.createElement('p'); note.className = 'vn-hint'; note.textContent = 'Reads the section after an exact ///// line. Set up the supplied display/context RegEx scripts separately. Interactive HTML and local artifacts use this opt-in and can save their own timeline data in message extra.'; panel.append(note);
    return panel;
}
