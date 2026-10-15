import { chatIdentity, latestAssistant, readMessage, sceneKey } from './core/message-reader.js';
import { parsePOV } from './core/vn-parser.js';
import { compileTimeline } from './core/scene-timeline.js';
import { inheritedScene, worldHistory, inheritedWorld } from './core/scene-history.js';
import { Playback } from './core/playback.js';
import { normalizeStageLayout } from './core/stage-layout.js';
import { contentEnvironments, activateContentProfile, saveContentProfile, CONTENT_PROFILE_KEYS } from './core/content-environments.js';
import { mergeContentInventories } from './core/content-inventory.js';
import { CharacterRegistry } from './core/character-registry.js';
import { AssetResolver } from './core/asset-resolver.js';
import { StageRenderer } from './renderers/stage-renderer.js';
import { DialogueRenderer } from './renderers/dialogue-renderer.js';
import { AudioEngine } from './renderers/audio-engine.js';
import { EffectsRenderer } from './renderers/effects-renderer.js';
import { HTMLRenderer } from './renderers/html-renderer.js';
import { EMOTION_FLAIR } from './renderers/emotion-flair.js';
import { createOverlay } from './ui/overlay.js';
import { bindControls } from './ui/controls.js';
import { createSettings, loadSettings } from './ui/settings.js';
import { OmniscientToggle } from './ui/omniscient-toggle.js';
import { applyTheme } from './core/theme.js';
import { SpeechEngine } from './renderers/speech-engine.js';
import { SpeechPanel } from './ui/speech-panel.js';
import { EnvironmentStyle } from './renderers/environment-style.js';

export class VNController {
    constructor(host, base, inventory = {}) {
        this.host = host; this.settings = loadSettings(host.context());
        this.base = base; this.inventory = inventory; this.catalogResolver = new AssetResolver(base);
        this.environments = contentEnvironments(inventory);
        this.environment = this.environments.find(entry => entry.id === this.settings.environment) || this.environments.find(entry => entry.id === inventory.defaultEnvironment) || this.environments[0];
        activateContentProfile(this.settings, this.environment.id);
        this.resolver = this.createContentResolver(this.environment); this.registry = this.createRegistry(this.resolver, this.environment);
        this.root = createOverlay(); this.stage = new StageRenderer(this.root, this.resolver, this.registry, this.settings);
        this.environmentStyle = new EnvironmentStyle(this.root);
        this.dialogue = new DialogueRenderer(this.root, this.resolver, this.settings); this.audio = new AudioEngine(this.resolver, this.settings, message => this.log(message));
        this.speech = new SpeechEngine(host, this.settings); this.speech.onEnded = () => this.scheduleAuto();
        const speechCallbacks = { prepare: () => this.prepareSpeech(), change: () => this.settingsChanged('speech') };
        this.speechSettingsPanel = new SpeechPanel(this.speech, speechCallbacks);
        this.voicePanel = new SpeechPanel(this.speech, speechCallbacks, { expanded: true }); applyTheme(this.root, this.settings);
        this.effects = new EffectsRenderer(this.root, this.settings); this.html = new HTMLRenderer(this.root, this.settings);
        this.reveal = new OmniscientToggle(host.context, () => this.busy || !this.settings.enabled);
        this.selected = latestAssistant(host.context()); this.chatId = chatIdentity(host.context());
        this.generation = 0; this.busy = false; this.seen = new Map(); this.disposers = []; this.messages = [];
        this.disposers.push(bindControls(this.root, { action: action => void this.action(action), unlock: () => void this.audio.unlock(), escape: () => this.escape(), layout: value => { this.settings.layout = normalizeStageLayout(value); this.settingsChanged('layout'); }, environment: value => void this.selectEnvironment(value) }));
        this.bindHost(); this.mount(); this.updateMusicButton(); this.updateLayoutControls(); this.updateEnvironmentControls();
        void this.loadEnvironmentStyle();
    }
    log(message) { this.messages.push(message); if (this.messages.length > 50) this.messages.shift(); if (this.settings.debug) console.debug('[VN+]', message); }
    get sceneVariables() { return structuredClone(this.stage.variables || {}); }
    mount() {
        const target = document.querySelector('#extensions_settings');
        if (target && !target.querySelector('#vnplus-settings')) {
            this.settingsPanel = createSettings(this.settings, {
                open: () => void this.open(), replay: () => void this.action('replay'), debug: () => void this.action('debug'),
                change: key => this.settingsChanged(key), refresh: () => void this.refreshAssets(),
                environments: this.environments.map(entry => ({ value: entry.id, label: entry.name })),
                speechPanel: this.speechSettingsPanel.node,
                preview: async (name, expression) => {
                    const registry = this.registry, resolver = this.resolver; await registry.prepare([name]);
                    if (resolver !== this.resolver) return null;
                    const id = registry.identify(name), url = await resolver.sprite(id, registry.expressionCandidates(id, expression), registry.get(id));
                    return resolver === this.resolver ? url : null;
                },
                properties: async name => {
                    const registry = this.registry; await registry.prepare([name]);
                    if (registry !== this.registry) throw new Error('Environment changed. Choose the character again.');
                    const id = registry.identify(name); return { id, properties: registry.get(id) };
                },
            });
            target.append(this.settingsPanel);
            applyTheme(this.settingsPanel, this.settings);
        }
        for (const node of document.querySelectorAll('#chat .mes[mesid]')) {
            const index = Number(node.getAttribute('mesid')), message = readMessage(this.host.context(), index);
            const existing = node.querySelector('.vn-message-tools');
            if (!this.settings.enabled || !message) { existing?.remove(); continue; }
            if (existing) { existing.querySelector('[data-vn-reveal]').disabled = this.busy || message.status !== 'ready'; continue; }
            const tools = document.createElement('span'); tools.className = 'vn-message-tools vnplus-ui';
            const play = document.createElement('button'); play.textContent = 'VN'; play.title = 'Play this response / selected swipe';
            play.addEventListener('click', () => { this.selected = Number(node.getAttribute('mesid')); void this.open(this.selected); });
            const reveal = document.createElement('button'); reveal.textContent = 'Reveal Omniscient'; reveal.dataset.vnReveal = ''; reveal.disabled = this.busy || message.status !== 'ready';
            reveal.addEventListener('click', () => this.reveal.toggle(Number(node.getAttribute('mesid'))));
            tools.append(play, reveal); (node.querySelector('.mes_buttons') || node.querySelector('.mes_block') || node).append(tools);
        }
    }
    bindHost() {
        const subscribe = (name, callback) => this.disposers.push(this.host.subscribe(name, callback));
        subscribe('GENERATION_STARTED', (type, options, dryRun) => {
            if (dryRun || ['quiet', 'impersonate'].includes(type)) return;
            this.busy = true; this.parsed = null; this.speech.clearScene(); this.reveal.close(); this.invalidate({ preserveWorld: this.canPreserveWorld() }); this.mount();
            if (!this.root.hidden) this.wait('Waiting for a completed player perspective…');
        });
        const completed = () => {
            this.busy = false; this.mount();
            if (!this.root.hidden || this.settings.automaticPlayback) {
                const index = this.pendingIndex ?? this.selected; this.pendingIndex = null;
                void this.open(index >= 0 ? index : latestAssistant(this.host.context()));
            }
        };
        subscribe('GENERATION_ENDED', completed); subscribe('GENERATION_STOPPED', completed);
        subscribe('MESSAGE_RECEIVED', index => {
            const message = readMessage(this.host.context(), Number(index)); if (!message) return;
            if (this.speech.prepared && this.speech.prepared.sourceId !== this.speechSceneId(message)) this.speech.clearScene();
            this.pendingIndex = Number(index);
            if (!this.busy) { this.selected = Number(index); this.pendingIndex = null; if (!this.root.hidden || this.settings.automaticPlayback) void this.open(this.selected); }
            this.mount();
        });
        for (const event of ['MESSAGE_SWIPED', 'MESSAGE_UPDATED', 'MESSAGE_EDITED', 'MESSAGE_SWIPE_DELETED', 'CHARACTER_MESSAGE_RENDERED']) subscribe(event, index => {
            this.reveal.close(); this.mount();
            const message = readMessage(this.host.context(), Number(index));
            if (Number(index) === this.selected && this.speech.prepared && (!message || this.speech.prepared.sourceId !== this.speechSceneId(message))) this.speech.clearScene();
            if (Number(index) === this.selected) { this.sceneRevision = null; if (!this.root.hidden && !this.busy) void this.open(this.selected); }
            else if (Number(index) < this.selected && !this.root.hidden && !this.busy) void this.open(this.selected);
        });
        subscribe('MESSAGE_DELETED', () => {
            this.speech.clearScene();
            this.reveal.close(); this.invalidate(); this.playback = null; this.parsed = null; this.sceneRevision = null;
            this.selected = latestAssistant(this.host.context()); this.mount(); if (!this.root.hidden) void this.open(this.selected);
        });
        for (const event of ['CHAT_CHANGED', 'CHAT_LOADED']) subscribe(event, () => {
            const identity = chatIdentity(this.host.context());
            if (identity === this.chatId && event === 'CHAT_LOADED') { this.mount(); if (!this.root.hidden && !this.busy) void this.open(this.selected); return; }
            this.chatId = identity; this.selected = latestAssistant(this.host.context()); this.busy = false; this.pendingIndex = null;
            this.speech.clearScene();
            this.reveal.close(); this.invalidate(); this.playback = null; this.parsed = null; this.sceneRevision = null; this.seen.clear(); this.mount();
            if (!this.root.hidden) void this.open(this.selected);
        });
        subscribe('MORE_MESSAGES_LOADED', () => { this.mount(); if (!this.root.hidden && !this.busy) void this.open(this.selected); }); subscribe('APP_READY', () => this.mount());
        this.observer = new MutationObserver(records => {
            if (records.some(record => {
                if (record.target.closest?.('.vnplus-ui')) return false;
                const nodes = [...record.addedNodes, ...record.removedNodes].filter(node => node.nodeType === 1 && !node.matches?.('.vnplus-ui'));
                return nodes.some(node => node.matches?.('#chat,.mes,#extensions_settings') || node.querySelector?.('#chat,.mes,#extensions_settings'));
            })) { clearTimeout(this.mountTimer); this.mountTimer = setTimeout(() => this.mount(), 60); }
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
    }
    settingsChanged(key) {
        if (key === 'environment') { void this.selectEnvironment(this.settings.environment); return; }
        if (CONTENT_PROFILE_KEYS.includes(key) || key === 'breathingCenter' || key === 'themeReset') saveContentProfile(this.settings, this.environment.id);
        if (key === 'themeReset') for (const name of ['dialogueFont', 'textColor', 'narrationColor']) { const input = this.settingsPanel?.querySelector(`[data-setting="${name}"]`); if (input) input.value = this.settings[name]; }
        this.host.save(this.settings); this.reveal.close(); this.mount();
        applyTheme(this.root, this.settings); if (this.settingsPanel) applyTheme(this.settingsPanel, this.settings);
        if (key === 'speech') { this.speech.configurationChanged(); return; }
        if (key === 'characters') this.speech.clearScene();
        this.updateLayoutControls();
        if (key === 'musicMuted') this.audio.setMusicMuted(this.settings.musicMuted);
        this.updateMusicButton();
        if (key === 'environmentCss') { void this.loadEnvironmentStyle(); return; }
        if (!this.settings.enabled) { this.close(); return; }
        if (key === 'musicMuted') return;
        if (key === 'layout' || key === 'breathingCenter') { this.applyLayout(); return; }
        if (['characters', 'showPlayerBust', 'playerName', 'playerAliases', 'displayMode', 'autoCreateCharacters'].includes(key)) { this.sceneRevision = null; if (!this.root.hidden) void this.open(this.selected); }
        else if (!this.root.hidden && this.playback) this.present(this.playback.restore());
    }
    async refreshAssets() {
        this.catalogResolver.cache.clear();
        const [published, local] = await Promise.all([this.catalogResolver.json('assets.json'), this.catalogResolver.json('assets.local.json')]);
        if (published || local) { this.inventory = mergeContentInventories(published || {}, local || {}); this.environments = contentEnvironments(this.inventory); }
        const id = this.environments.some(entry => entry.id === this.environment.id) ? this.environment.id : this.environments[0].id;
        await this.selectEnvironment(id, true);
    }
    createContentResolver(environment) { return new AssetResolver(new URL(environment.path ? `${environment.path}/` : './', this.base), environment.inventory, environment.id); }
    async loadEnvironmentStyle() {
        this.environmentStyleStatus = { status: 'loading' };
        const resolver = this.resolver, result = await this.environmentStyle.load(resolver, this.settings.environmentCss !== false);
        if (resolver !== this.resolver || result.status === 'cancelled') return;
        this.environmentStyleStatus = result;
        const status = this.settingsPanel?.querySelector('[data-environment-css-status]');
        if (status) status.textContent = result.status === 'loaded' ? 'Environment dialogue.css loaded. Refresh assets after editing it.' : result.status === 'error' ? `Environment CSS: ${result.error}` : result.status === 'disabled' ? 'Environment CSS is disabled.' : 'Optional environment dialogue.css is not present. Built-in styling is active.';
    }
    createRegistry(resolver, environment) {
        const discover = this.host.resolveCharacters ? () => this.host.resolveCharacters({ environment: environment.path ? environment.id : null }) : null;
        return new CharacterRegistry(resolver, this.settings, discover);
    }
    async selectEnvironment(id, force = false) {
        const next = this.environments.find(entry => entry.id === id);
        if (!next) { this.settings.environment = this.environment.id; this.updateEnvironmentControls(); return false; }
        if (next.id === this.environment.id && !force) { this.settings.environment = next.id; this.updateEnvironmentControls(); return false; }
        const message = readMessage(this.host.context(), this.selected);
        const resume = this.playback && message ? { key: sceneKey(this.host.context(), message), position: this.playback.position } : this.environmentResume;
        this.speech.clearScene(); this.invalidate(); this.resolver.dispose();
        activateContentProfile(this.settings, next.id, this.environment.id); this.environment = next;
        this.resolver = this.createContentResolver(next); this.registry = this.createRegistry(this.resolver, next);
        void this.loadEnvironmentStyle();
        this.stage.resolver = this.resolver; this.stage.registry = this.registry; this.stage.sprites.resolver = this.resolver;
        this.dialogue.resolver = this.resolver; this.audio.resolver = this.resolver;
        this.playback = null; this.sceneRevision = null; this.parsed = null; this.environmentResume = resume;
        this.updateEnvironmentControls(); this.syncContentSettings(); this.host.save(this.settings);
        if (!this.root.hidden) {
            if (this.busy) this.wait('Waiting for a completed player perspective…');
            else await this.open(this.selected);
        }
        return true;
    }
    updateEnvironmentControls() {
        for (const input of [this.root.querySelector('[data-environment-picker]'), this.settingsPanel?.querySelector('[data-setting="environment"]')]) {
            if (!input) continue;
            input.replaceChildren();
            for (const entry of this.environments) { const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.name; input.append(option); }
            input.value = this.environment.id;
        }
        this.root.dataset.environment = this.environment.id;
        const status = this.settingsPanel?.querySelector('[data-environment-status]');
        if (status) {
            const files = this.environment.inventory.files.length, characters = Object.keys(this.environment.inventory.characters || {}).length;
            status.textContent = files ? `${characters} characters · ${files} assets. ${this.environment.description}` : 'Ready for your artwork and audio. Add content to this environment’s folder, rebuild the inventory, then refresh assets.';
        }
    }
    syncContentSettings() {
        const panel = this.settingsPanel; if (!panel) return;
        for (const key of ['dialogueFont', 'dialogueBoxTexture']) { const input = panel.querySelector(`[data-setting="${key}"]`); if (input) input.value = this.settings[key]; }
        const editor = panel.querySelector('[aria-label="Character registry JSON"]'); if (editor) editor.value = JSON.stringify(this.settings.characters, null, 2);
        const preview = panel.querySelector('.vn-sprite-preview'); if (preview) { preview.hidden = true; preview.removeAttribute('src'); }
        for (const label of ['Preview character', 'Breathing center character']) { const input = panel.querySelector(`[aria-label="${label}"]`); if (input) input.value = ''; }
        const status = panel.querySelector('[data-character-status]'); if (status) status.textContent = `Editing ${this.environment.name}.`;
    }
    canPreserveWorld() { return !this.root.hidden && this.worldIdentity === JSON.stringify([chatIdentity(this.host.context()), this.environment.id]); }
    invalidate({ preserveWorld = false } = {}) {
        this.root.querySelector('.vn-content-notice').hidden = true;
        this.generation++; clearTimeout(this.autoTimer); this.speech.stop(); this.dialogue.cancel(); this.effects.clear(); this.html.close();
        if (preserveWorld) { this.stage.cancelPending(); this.audio.cancelPending(); this.audio.cancelOneShots(); }
        else { this.stage.clear(); this.audio.close(); this.worldIdentity = null; }
        this.root.querySelector('.vn-panel').hidden = true; this.root.querySelector('.vn-reply').hidden = true;
        this.transcriptArtifact = false;
    }
    wait(message) {
        this.root.querySelector('.vn-status').textContent = message; this.root.querySelector('.vn-status').hidden = false;
        this.root.querySelector('.vn-dialogue').hidden = true; this.root.querySelector('.vn-position').textContent = '';
        for (const action of ['next', 'back', 'skip']) this.root.querySelector(`[data-action="${action}"]`).disabled = true;
    }
    async open(index = this.selected) {
        if (!this.settings.enabled) return;
        this.updateMusicButton();
        this.updateLayoutControls();
        if (this.root.hidden) { this.previousFocus = document.activeElement; this.root.hidden = false; document.body.classList.add('vnplus-immersive'); this.root.querySelector('[data-action="exit"]').focus(); }
        this.reveal.close();
        const context = this.host.context(), identity = chatIdentity(context);
        if (identity !== this.chatId) { this.chatId = identity; this.sceneRevision = null; this.playback = null; this.seen.clear(); }
        this.selected = Number.isInteger(index) && index >= 0 ? index : latestAssistant(context);
        if (this.busy) { this.wait('Waiting for a completed player perspective…'); return; }
        const message = readMessage(context, this.selected);
        if (!message || message.status !== 'ready') { this.speech.clearScene(); this.invalidate(); this.sceneRevision = null; this.playback = null; this.parsed = null; this.parserErrors = []; this.wait('Player perspective is unavailable. A completed POV section after ///// is required.'); return; }
        if (this.speech.prepared && this.speech.prepared.sourceId !== this.speechSceneId(message)) this.speech.clearScene();
        const inherited = inheritedScene(context, message.index);
        const history = worldHistory(context, message.index);
        const sourceRevision = `${this.environment.id}:${identity}:${message.index}:${message.swipe}:${message.pov}`;
        const revision = JSON.stringify([sourceRevision, inherited, history]);
        if (this.sceneRevision === revision && this.playback) {
            try { this.speech.prepare(this.speechSceneId(message), this.playback.timeline, this.registry); } catch (error) { this.speech.clearScene(); this.speech.notify(error.message); }
            this.present(this.playback.restore()); return;
        }
        const historyPosition = this.sceneRevision && this.sceneSourceRevision === sourceRevision && this.playback ? this.playback.position : null;
        this.invalidate({ preserveWorld: this.canPreserveWorld() }); this.parsed = null; this.parserErrors = []; const generation = this.generation; this.wait('Preparing scene…');
        const parsed = parsePOV(message.pov);
        const names = [...history, ...parsed.tokens].filter(token => token.character || token.name === 'ENTER' || token.name === 'EXIT').map(token => token.character || token.args);
        await this.registry.prepare(names);
        if (generation !== this.generation || this.busy || this.root.hidden) return;
        if (this.registry.discoveryError) { this.characterFolderStatus(this.registry.discoveryError); this.log(this.registry.discoveryError); }
        const registry = this.registry, environment = this.environment;
        const unknown = [...new Set(parsed.tokens.filter(token => token.type === 'dialogue').map(token => token.character))].filter(name => !registry.knows(name));
        if (this.settings.autoCreateCharacters && this.host.scaffoldCharacters && unknown.length) {
            try {
                const result = await this.host.scaffoldCharacters({ environment: environment.path ? environment.id : null, names: unknown });
                if (generation !== this.generation || registry !== this.registry || this.busy || this.root.hidden) return;
                for (const entry of result.characters) {
                    registry.acceptCharacter(entry);
                    environment.inventory.characters ??= Object.create(null); environment.inventory.characters[entry.id] ??= { expressions: [] };
                }
                const count = result.characters.filter(entry => entry.created).length;
                this.characterFolderStatus(count ? `Created ${count} character folder(s) in ${environment.name}. Add artwork to their sprites folders; voiceId is blank (mute).` : 'Existing character folders and colors preserved.');
            } catch (error) {
                if (generation !== this.generation || registry !== this.registry || this.busy || this.root.hidden) return;
                this.characterFolderStatus(error.message, true); this.log(error.message);
            }
        }
        const seed = inheritedWorld(history, this.registry, this.settings, inherited.scene);
        const timeline = compileTimeline(parsed.tokens, this.registry, this.settings, seed), sourceKey = sceneKey(context, message), key = `${this.environment.id}:${sourceKey}`;
        try { this.speech.prepare(this.speechSceneId(message), timeline, this.registry); } catch (error) { this.speech.clearScene(); this.speech.notify(error.message); }
        if (!this.seen.has(key)) { if (this.seen.size >= 32) this.seen.delete(this.seen.keys().next().value); this.seen.set(key, new Set()); }
        this.playback = new Playback(timeline, this.seen.get(key)); this.sceneRevision = revision; this.sceneSourceRevision = sourceRevision; this.parsed = parsed; this.parserErrors = [...parsed.errors, ...timeline.errors];
        this.root.querySelector('.vn-scene-label').textContent = `PLAYER PERSPECTIVE · RESPONSE ${message.index + 1} · SWIPE ${message.swipe + 1}`;
        if (!timeline.views.length) { this.wait('No completed dialogue, narration, or artifact is available in this POV.'); return; }
        const resume = this.environmentResume; this.environmentResume = null;
        this.present(resume?.key === sourceKey ? this.playback.resume(resume.position) : historyPosition !== null ? this.playback.resume(historyPosition) : this.playback.forward());
    }
    characterFolderStatus(message, error = false) {
        const status = this.settingsPanel?.querySelector('[data-character-folders-status]'); if (status) status.textContent = message;
        const notice = this.root.querySelector('.vn-content-notice'); notice.textContent = message; notice.hidden = !error;
    }
    present(result) {
        if (!result || !result.beat || this.root.hidden || this.busy) return;
        clearTimeout(this.autoTimer); this.html.close(); this.dialogue.cancel(); this.effects.clear(); this.audio.cancelOneShots();
        this.root.querySelector('.vn-status').hidden = true; this.root.querySelector('.vn-reply').hidden = true;
        const { state, token } = result.beat;
        this.worldIdentity = JSON.stringify([chatIdentity(this.host.context()), this.environment.id]);
        const playback = this.speech.playBeat(result.done || token.type !== 'dialogue' || token.thought ? -1 : result.beat.index);
        void this.stage.render(state, this.playback.timeline.maxSlots).catch(error => this.log(error.message)); void this.audio.sync(state);
        for (const effect of result.effects) { if (effect.type === 'sfx') void this.audio.sfx(effect.name); else this.effects.trigger(effect); }
        this.root.querySelector('[data-action="back"]').disabled = this.playback.position <= 0;
        this.root.querySelector('[data-action="next"]').disabled = false; this.root.querySelector('[data-action="skip"]').disabled = false;
        this.root.querySelector('[data-action="auto"]').setAttribute('aria-pressed', String(this.settings.autoAdvance));
        this.root.querySelector('.vn-position').textContent = `${Math.min(this.playback.position + 1, this.playback.timeline.views.length)} / ${this.playback.timeline.views.length}`;
        const dialogue = this.root.querySelector('.vn-dialogue');
        if (result.done) { dialogue.hidden = true; this.showReply(); return; }
        if (token.type === 'artifact') { dialogue.hidden = true; this.html.open(token); return; }
        dialogue.hidden = false;
        const props = state.speaker ? this.registry.get(state.speaker) : {};
        void this.dialogue.render(token, props, state.textEffect, () => this.scheduleAuto(), !result.forward, playback);
        if (result.forward && (!result.previouslySeen || result.replaying) && token.type === 'dialogue') {
            const flair = this.settings.textEffects ? EMOTION_FLAIR[token.emotion] || {} : {};
            if (flair.screenFlash) this.effects.trigger({ type: 'flash', value: flair.screenFlash });
            const sound = props.sounds?.[token.emotion] || props.sound || flair.sound || token.emotion;
            if (this.settings.characterSounds && !token.thought && !this.settings.tts.enabled) void this.audio.sfx(sound, props.assetFolder || state.speaker);
        }
    }
    scheduleAuto() {
        clearTimeout(this.autoTimer);
        if (this.settings.autoAdvance && !this.dialogue.typing && !this.speech.speaking && !this.busy && !this.root.hidden && !this.html.active && this.root.querySelector('.vn-panel').hidden && this.root.querySelector('.vn-reply').hidden) this.autoTimer = setTimeout(() => void this.action('next'), this.settings.autoAdvanceDelay);
    }
    showReply() {
        clearTimeout(this.autoTimer); this.root.querySelector('.vn-reply').hidden = false;
        this.root.querySelector('[data-action="retry"]').disabled = this.busy || this.selected !== this.host.context().chat.length - 1;
        this.root.querySelector('#vnplus-reply').focus();
    }
    speechSceneId(message) { return `${this.environment.id}:${sceneKey(this.host.context(), message)}`; }
    async prepareSpeech() {
        if (this.busy) throw new Error('Wait for the finalized player perspective before preparing voices.');
        const message = readMessage(this.host.context(), this.selected), registry = this.registry;
        if (!message || message.status !== 'ready') throw new Error('Select a completed assistant response with a POV section.');
        const parsed = parsePOV(message.pov);
        if (parsed.errors.some(error => error.message.startsWith('Incomplete') || error.message.startsWith('Unclosed'))) throw new Error('The selected POV contains unfinished dialogue or artifacts. Wait for a completed response.');
        const history = worldHistory(this.host.context(), message.index);
        await registry.prepare([...history, ...parsed.tokens].filter(token => token.character || token.name === 'ENTER' || token.name === 'EXIT').map(token => token.character || token.args));
        if (registry.discoveryError) { this.characterFolderStatus(registry.discoveryError); this.log(registry.discoveryError); }
        const current = readMessage(this.host.context(), this.selected);
        if (this.busy || registry !== this.registry || !current || current.pov !== message.pov || current.swipe !== message.swipe || current.index !== message.index) throw new Error('The selected scene changed. Prepare its dialogue again.');
        const seed = inheritedWorld(history, registry, this.settings, inheritedScene(this.host.context(), message.index).scene);
        return this.speech.prepare(this.speechSceneId(message), compileTimeline(parsed.tokens, registry, this.settings, seed), registry);
    }
    panel(kind) {
        clearTimeout(this.autoTimer); this.dialogue.skip(); clearTimeout(this.autoTimer);
        const panel = this.root.querySelector('.vn-panel'), content = panel.querySelector('.vn-panel-content'); content.replaceChildren();
        panel.querySelector('.vn-panel-title').textContent = kind === 'debug' ? 'Scene inspector · POV only' : 'Player perspective transcript';
        if (kind === 'debug') {
            const pre = document.createElement('pre'); pre.textContent = JSON.stringify({ message: this.selected, swipe: readMessage(this.host.context(), this.selected)?.swipe, cursor: this.playback?.cursor, errors: this.parserErrors, tokens: this.parsed?.tokens, state: this.playback?.restore().beat?.state, variables: this.sceneVariables, assets: Object.fromEntries(this.resolver.diagnostics), audio: this.messages }, null, 2); content.append(pre);
        } else for (const token of this.parsed?.tokens || []) {
            if (token.type === 'command' || token.type === 'header') continue;
            const paragraph = document.createElement('p');
            if (token.type === 'artifact') { const button = document.createElement('button'); button.textContent = 'View scene artifact'; button.addEventListener('click', () => { panel.hidden = true; this.html.open(token); this.transcriptArtifact = true; }); paragraph.append(button); }
            else {
                paragraph.textContent = `${token.type === 'dialogue' ? `${token.character}${token.thought ? ' (thoughts)' : ''}: ` : ''}${token.text}`;
                paragraph.classList.toggle('vn-thought', !!token.thought);
            }
            content.append(paragraph);
        }
        panel.hidden = false; panel.querySelector('button').focus();
    }
    async action(action) {
        if (action === 'exit') { this.close(); return; }
        if (!this.settings.enabled) return;
        try {
            if (action === 'mute-music') {
                this.audio.setMusicMuted(!this.settings.musicMuted); this.host.save(this.settings); this.updateMusicButton();
                const input = this.settingsPanel?.querySelector('[data-setting="musicMuted"]'); if (input) input.checked = this.settings.musicMuted;
                return;
            }
            if (action === 'replay' && this.root.hidden) { await this.open(this.selected); if (this.playback && !this.busy) this.present(this.playback.replay()); return; }
            if (action === 'speech') {
                clearTimeout(this.autoTimer); this.dialogue.skip(); clearTimeout(this.autoTimer);
                const panel = this.root.querySelector('.vn-panel'); panel.querySelector('.vn-panel-title').textContent = 'Fish Audio voices';
                panel.querySelector('.vn-panel-content').replaceChildren(this.voicePanel.node); this.voicePanel.refresh(); panel.hidden = false;
                panel.querySelector('button').focus(); return;
            }
            if (action === 'debug' || action === 'transcript') { if (this.root.hidden) await this.open(this.selected); this.panel(action); return; }
            if (action === 'close-panel') { this.root.querySelector('.vn-panel').hidden = true; this.root.querySelector('.vn-dialogue').focus(); this.scheduleAuto(); return; }
            if (action === 'close-artifact') { this.html.close(); if (this.transcriptArtifact) { this.transcriptArtifact = false; this.panel('transcript'); } else if (this.playback && !this.busy) this.present(this.playback.forward()); return; }
            if (action === 'close-reply') { this.root.querySelector('.vn-reply').hidden = true; const result = this.playback?.restore(); if (result?.done) this.present(this.playback.back()); else this.present(result); return; }
            if (this.busy) return;
            if (action === 'reply') { this.dialogue.skip(); this.showReply(); return; }
            if (action === 'auto') { this.settings.autoAdvance = !this.settings.autoAdvance; this.host.save(this.settings); this.root.querySelector('[data-action="auto"]').setAttribute('aria-pressed', String(this.settings.autoAdvance)); this.scheduleAuto(); return; }
            if (action === 'send') { const input = this.root.querySelector('#vnplus-reply'); if (input.value.trim()) { this.host.send(input.value); input.value = ''; this.root.querySelector('.vn-reply-status').textContent = ''; } return; }
            if (action === 'retry') { await this.host.retry(this.selected); return; }
            if (!this.playback || this.html.active || !this.root.querySelector('.vn-panel').hidden || !this.root.querySelector('.vn-reply').hidden && action === 'next') return;
            if (action === 'next' && this.dialogue.skip()) return;
            const result = action === 'back' ? this.playback.back() : action === 'replay' ? this.playback.replay() : action === 'skip' ? this.playback.skipViewed() : action === 'next' ? this.playback.forward() : null;
            this.present(result);
        } catch (error) { this.log(error.message); this.root.querySelector('.vn-reply-status').textContent = error.message; }
    }
    escape() {
        if (this.html.active) void this.action('close-artifact');
        else if (!this.root.querySelector('.vn-panel').hidden) void this.action('close-panel');
        else if (!this.root.querySelector('.vn-reply').hidden && this.playback?.position < this.playback?.timeline.views.length) void this.action('close-reply');
        else this.close();
    }
    close() { this.invalidate(); this.root.hidden = true; document.body.classList.remove('vnplus-immersive'); this.reveal.close(); if (this.previousFocus?.isConnected) this.previousFocus.focus(); }
    updateMusicButton() {
        const button = this.root.querySelector('[data-action="mute-music"]');
        button.textContent = this.settings.musicMuted ? 'Unmute music' : 'Mute music'; button.setAttribute('aria-pressed', String(!!this.settings.musicMuted));
        button.title = 'Toggle music without stopping the track. Ambience and sound effects are independent.';
    }
    updateLayoutControls() {
        for (const input of [this.root.querySelector('[data-layout-picker]'), this.settingsPanel?.querySelector('[data-setting="layout"]')]) if (input) input.value = this.settings.layout;
    }
    applyLayout() {
        const state = this.playback?.restore().beat?.state;
        if (this.root.hidden || this.busy || !this.root.querySelector('.vn-status').hidden || !state) return;
        void this.stage.render(state, this.playback.timeline.maxSlots).catch(error => this.log(error.message));
    }
    dispose() {
        this.close(); this.stage.dispose(); this.observer.disconnect(); clearTimeout(this.mountTimer); this.disposers.forEach(dispose => dispose());
        this.root.remove(); this.settingsPanel?.remove(); document.querySelectorAll('.vn-message-tools').forEach(node => node.remove()); this.seen.clear();
        this.resolver.dispose(); this.catalogResolver.dispose();
        this.environmentStyle.dispose();
        this.speechSettingsPanel.dispose(); this.voicePanel.dispose(); this.speech.dispose();
    }
}
