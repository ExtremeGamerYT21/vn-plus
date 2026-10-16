import { chatIdentity, latestAssistant, readMessage, sceneKey } from './core/message-reader.js';
import { parsePOV } from './core/vn-parser.js';
import { compileTimeline } from './core/scene-timeline.js';
import { Playback } from './core/playback.js';
import { normalizeStageLayout, normalizeSpriteFraming } from './core/stage-layout.js';
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
import { ChatStatePublisher, sceneSnapshot, audioState } from './core/shared-state.js';
import { contextEntries, contextNames, reduceContext } from './core/context-state.js';
import { sceneLighting } from './core/scene-context.js';
import { BeatScheduler, applyCommandState } from './core/narrative-timing.js';
import { VisualRenderer } from './renderers/visual-renderer.js';
import { collectJournals } from './core/journal-collector.js';

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
        const speechCallbacks = { prepare: () => this.prepareSpeech(), change: key => this.settingsChanged(key === 'parallelBatches' ? 'speechParallel' : 'speech') };
        this.speechSettingsPanel = new SpeechPanel(this.speech, speechCallbacks);
        this.voicePanel = new SpeechPanel(this.speech, speechCallbacks, { expanded: true }); applyTheme(this.root, this.settings);
        this.effects = new EffectsRenderer(this.root, this.settings); this.html = new HTMLRenderer(this.root, this.settings, (token, alive) => this.artifactSession(token, alive), (id, signal) => this.readArtifact(id, signal));
        this.timing = new BeatScheduler();
        this.visuals = new VisualRenderer(this.root, this.settings, (token, alive) => this.visualSession(token, alive), (id, signal) => this.readArtifact(id, signal));
        this.reveal = new OmniscientToggle(host.context, () => this.busy || !this.settings.enabled);
        this.selected = latestAssistant(host.context()); this.chatId = chatIdentity(host.context());
        this.generation = 0; this.busy = false; this.seen = new Map(); this.disposers = []; this.messages = [];
        this.disposers.push(this.speech.onChange(() => this.updateVoiceStatus()));
        this.playbackState = new ChatStatePublisher(host, value => this.root.dispatchEvent(new CustomEvent('vnplus:playback-changed', { bubbles: true, detail: value })), 'vn_plus_playback');
        this.playbackState.bind(this.environment);
        this.sharedState = new ChatStatePublisher(host, value => this.root.dispatchEvent(new CustomEvent('vnplus:state-changed', { bubbles: true, detail: value })));
        this.sharedState.bind(this.environment);
        this.contextResolver = this.createContentResolver(this.environment); this.contextRegistry = this.createRegistry(this.contextResolver, this.environment);
        this.audio.onChange = () => this.publishPlaybackActivity();
        this.disposers.push(bindControls(this.root, { action: action => void this.action(action), unlock: () => void this.audio.unlock(), escape: () => this.escape(), layout: value => { this.settings.layout = normalizeStageLayout(value); this.settingsChanged('layout'); }, framing: value => { this.settings.spriteFraming = normalizeSpriteFraming(value); this.settingsChanged('spriteFraming'); }, environment: value => void this.selectEnvironment(value) }));
        this.bindHost(); this.mount(); this.updateMusicButton(); this.updateLayoutControls(); this.updateFramingControls(); this.updateEnvironmentControls();
        void this.loadEnvironmentStyle();
        void this.refreshContext();
        this.sourceTimer = setInterval(() => this.checkSource(), 500);
    }
    sourceFingerprint(context = this.host.context()) {
        const message = readMessage(context, this.selected);
        return JSON.stringify([chatIdentity(context), this.followLatest ? latestAssistant(context) : null, this.selected, message?.swipe, message?.raw, contextEntries(context, this.selected)]);
    }
    checkSource() {
        if (this.disposed || this.root.hidden || this.busy || document.hidden) return;
        const context = this.host.context(), fingerprint = this.sourceFingerprint(context);
        if (fingerprint === this.observedSource) { this.settlingSource = null; return; }
        // Let a silent transformer finish replacing its output before preparing paid audio.
        if (this.settlingSource !== fingerprint) { this.settlingSource = fingerprint; return; }
        // Some transformers replace mes without emitting a SillyTavern event.
        // Keep following the latest response, while preserving deliberate history playback.
        const index = this.followLatest || chatIdentity(context) !== this.chatId ? latestAssistant(context) : this.selected;
        void this.open(index).catch(error => this.log(`POV refresh: ${error.message}`));
    }
    updateVoiceStatus() {
        const badge = this.root.querySelector('.vn-voice-ready'); if (!badge) return;
        const result = this.playback?.restore();
        const status = result && !result.done ? this.speech.lineStatus(result.beat.index, true) : null;
        badge.hidden = !status;
        if (!status) return;
        const labels = { ready: '✓ Next voice', generating: '◌ Next voice', pending: '○ Next voice', review: '! Voice review', failed: '! Voice unavailable' };
        badge.textContent = labels[status.state]; badge.dataset.state = status.state;
        badge.title = `${status.line.name}: ${status.line.text} (${status.state})`;
        badge.setAttribute('aria-label', `Next voiced line: ${status.state}. ${status.line.name}`);
    }
    log(message) { this.messages.push(message); if (this.messages.length > 50) this.messages.shift(); if (this.settings.debug) console.debug('[VN+]', message); }
    get sceneVariables() { return structuredClone(this.stage.variables || {}); }
    get sharedVariables() { return this.sharedState.snapshot; }
    get playbackVariables() { return this.playbackState.snapshot; }
    scheduleContextRefresh() {
        if (this.busy) { this.sharedState.update({ active: !this.root.hidden, generating: true, updating: false }); this.publishContextActivity(); return; }
        // Mark old output unavailable synchronously; coalesce host events before resolving assets.
        this.contextRevision = null; this.contextProjection = null; this.sharedState.bind(this.environment);
        this.sharedState.update({ active: !this.root.hidden, generating: this.busy, updating: !this.busy });
        clearTimeout(this.contextTimer);
        if (!this.busy && !this.disposed) this.contextTimer = setTimeout(() => void this.refreshContext(), 40);
    }
    async refreshContext() {
        if (this.disposed || this.busy) return;
        clearTimeout(this.contextTimer);
        try { collectJournals(this.host, this.environment.id); } catch (error) { this.log(`Journal collection: ${error.message}`); }
        const context = this.host.context(), entries = contextEntries(context), resolver = this.contextResolver, registry = this.contextRegistry, environment = this.environment;
        const revision = JSON.stringify([chatIdentity(context), environment.id, entries, this.settings.castMemoryTurns, this.settings.showPlayerBust, this.settings.playerName, this.settings.playerAliases, this.settings.characters, this.settings.displayMode]);
        if (revision === this.contextRevision && this.sharedState.binding?.current()) { this.publishContextActivity(); return; }
        this.contextRevision = revision; this.contextProjection = null;
        this.sharedState.bind(environment); this.sharedState.update({ active: !this.root.hidden, generating: this.busy, updating: true });
        const epoch = this.sharedState.begin();
        const current = () => !this.disposed && !this.busy && epoch === this.sharedState.epoch && resolver === this.contextResolver && this.sharedState.binding?.current();
        try {
            await registry.prepare(contextNames(entries));
            if (!current()) return;
            const state = reduceContext(entries, registry, this.settings);
            const [background, music, ambient] = await Promise.all([state.background ? resolver.background(state.background) : null,
                state.music ? resolver.audio('music', state.music.name) : null, state.ambient ? resolver.audio('ambient', state.ambient.name) : null]);
            const properties = background ? await resolver.backgroundProperties(background) : { inside: false };
            if (!current()) return;
            // Catch context edits even when another extension did not emit a host event.
            if (JSON.stringify(contextEntries(this.host.context())) !== JSON.stringify(entries)) { this.contextRevision = null; void this.refreshContext(); return; }
            const tint = document.createElement('span'); tint.hidden = true; tint.style.backgroundColor = CSS.supports('color', state.tint) ? state.tint : 'transparent';
            this.root.append(tint); const color = getComputedStyle(tint).backgroundColor; tint.remove();
            this.contextProjection = { state, registry, environment, available: entries.some(entry => entry.ready || entry.header),
                source: entries.length ? { message: entries.at(-1).index, swipe: entries.at(-1).swipe, beat: null, position: null } : null,
                urls: { background, music, ambient }, stage: { backgroundUrl: background, backgroundProperties: properties, variables: { lighting: sceneLighting(state.scene, properties.inside) },
                    appliedTint: state.tint, ambientColor: color === 'rgba(0, 0, 0, 0)' ? '#ffffff' : color } };
            this.sharedState.commit(this.contextSnapshot(), epoch);
        } catch (error) {
            if (!current()) return;
            this.contextRevision = null; this.sharedState.cancel(); this.sharedState.update({ available: false, updating: false }); this.log(`Context reconstruction: ${error.message}`);
        }
    }
    contextSnapshot() {
        const projection = this.contextProjection;
        if (!projection) return this.sharedState.snapshot;
        const channels = {};
        for (const kind of ['music', 'ambient']) channels[kind] = this.audio.channels[kind].url === projection.urls[kind] ? this.audio.channels[kind] : {};
        const value = sceneSnapshot({ ...projection, settings: this.settings, audio: { channels }, active: !this.root.hidden, generating: this.busy });
        value.available = projection.available; value.updating = false; value.basis = 'context';
        for (const kind of ['music', 'ambient']) { value[kind].asset = projection.urls[kind]; value[kind].rate = projection.state[kind]?.rate || 1; }
        return value;
    }
    publishContextActivity() { if (!this.disposed && this.contextProjection && !this.sharedState.pending) this.sharedState.update(this.contextSnapshot()); }
    publishPlaybackActivity() {
        this.publishContextActivity();
        if (this.playbackState.pending) return;
        const value = this.playbackState.snapshot;
        const patch = { active: !this.root.hidden, generating: this.busy };
        for (const kind of ['music', 'ambient']) if (value?.[kind]) {
            const current = audioState(value[kind], this.audio.channels[kind], kind === 'music' && this.settings.musicMuted, this.settings[`${kind}Volume`]);
            patch[kind] = { ...current, asset: current.asset || value[kind].asset };
        }
        this.playbackState.update(patch);
    }
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
        this.environmentStyle.setSettingsRoot(target?.querySelector('#vnplus-settings') || null);
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
        const contextEvents = new Set(['MESSAGE_RECEIVED', 'MESSAGE_SWIPED', 'MESSAGE_UPDATED', 'MESSAGE_EDITED', 'MESSAGE_SWIPE_DELETED', 'CHARACTER_MESSAGE_RENDERED', 'MESSAGE_DELETED', 'CHAT_CHANGED', 'CHAT_LOADED', 'MORE_MESSAGES_LOADED', 'APP_READY']);
        const subscribe = (name, callback) => this.disposers.push(this.host.subscribe(name, (...args) => {
            const changedChat = name === 'CHAT_CHANGED' || name === 'CHAT_LOADED';
            if (contextEvents.has(name) && !changedChat) this.scheduleContextRefresh();
            const result = callback(...args);
            if (changedChat) this.scheduleContextRefresh();
            return result;
        }));
        subscribe('GENERATION_STARTED', (type, options, dryRun) => {
            if (dryRun || ['quiet', 'impersonate'].includes(type)) return;
            this.sharedState.cancel(); this.sharedState.update({ generating: true, updating: false });
            this.busy = true; this.parsed = null; this.speech.clearScene(); this.reveal.close(); this.invalidate({ preserveWorld: this.canPreserveWorld() }); this.mount();
            if (!this.root.hidden) this.wait('Waiting for a completed player perspective…');
        });
        const completed = () => {
            this.busy = false; this.scheduleContextRefresh(); this.publishPlaybackActivity(); this.mount();
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
            if (identity === this.chatId && event === 'CHAT_LOADED') {
                if (!this.playbackState.binding?.current()) this.playbackState.bind(this.environment);
                this.mount(); if (!this.root.hidden && !this.busy) void this.open(this.selected); return;
            }
            this.chatId = identity; this.selected = latestAssistant(this.host.context()); this.busy = false; this.pendingIndex = null;
            this.speech.clearScene();
            this.reveal.close(); this.invalidate(); this.playback = null; this.parsed = null; this.sceneRevision = null; this.seen.clear(); this.mount();
            this.playbackState.bind(this.environment); this.publishPlaybackActivity();
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
        if (key.startsWith('sceneLight')) this.scheduleContextRefresh();
        if (['characters', 'showPlayerBust', 'playerName', 'playerAliases', 'displayMode', 'castMemoryTurns'].includes(key)) this.scheduleContextRefresh();
        if (key === 'environment') { void this.selectEnvironment(this.settings.environment); return; }
        if (CONTENT_PROFILE_KEYS.includes(key) || key === 'breathingCenter' || key === 'themeReset') saveContentProfile(this.settings, this.environment.id);
        if (key === 'themeReset') for (const name of ['dialogueFont', 'textColor', 'narrationColor']) { const input = this.settingsPanel?.querySelector(`[data-setting="${name}"]`); if (input) input.value = this.settings[name]; }
        this.host.save(this.settings); this.reveal.close(); this.mount();
        applyTheme(this.root, this.settings); if (this.settingsPanel) applyTheme(this.settingsPanel, this.settings);
        if (key === 'speechParallel') { this.speech.notify('Parallel voice batch setting saved. Applies to the next generation; current requests and recordings continue.'); return; }
        if (key === 'speech') {
            this.speech.configurationChanged();
            if (this.playback && this.parsed && !this.busy && !this.root.hidden) {
                const message = readMessage(this.host.context(), this.selected);
                try { this.speech.prepare(this.speechSceneId(message), this.playback.timeline, this.registry); this.speech.requestAutomatic(); this.present(this.playback.restore()); }
                catch (error) { this.speech.clearScene(); this.speech.notify(error.message); }
            }
            this.updateVoiceStatus(); return;
        }
        if (key === 'settingsCollapsed') return;
        if (['autoAdvance', 'autoAdvancePause', 'dialogueSecondsPerCharacter', 'narrationWordsPerMinute'].includes(key) || key.endsWith('ReactionSound')) { this.scheduleAuto(); return; }
        if (key === 'characters') this.speech.clearScene();
        this.updateLayoutControls(); this.updateFramingControls();
        if (key === 'musicMuted') this.audio.setMusicMuted(this.settings.musicMuted);
        this.updateMusicButton();
        if (key === 'environmentCss') { void this.loadEnvironmentStyle(); return; }
        if (!this.settings.enabled) { this.close(); return; }
        if (key === 'musicMuted') return;
        if (key === 'layout' || key === 'spriteFraming' || key === 'breathingCenter') { this.applyLayout(); return; }
        if (['characters', 'showPlayerBust', 'playerName', 'playerAliases', 'displayMode', 'castMemoryTurns', 'autoCreateCharacters'].includes(key)) { this.sceneRevision = null; if (!this.root.hidden) void this.open(this.selected); }
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
        if (status) status.textContent = result.status === 'loaded' ? `Environment ${result.files.join(' and ')} loaded. Refresh assets after editing.` : result.status === 'error' ? `Environment CSS: ${result.error}` : result.status === 'disabled' ? 'Environment CSS is disabled.' : 'Optional environment CSS is not present. Built-in styling is active.';
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
        this.contextProjection = null; this.sharedState.bind(next);
        this.playbackState.bind(next); this.publishPlaybackActivity();
        this.sharedState.cancel(); this.contextProjection = null; this.contextRevision = null; this.contextResolver.dispose();
        this.contextResolver = this.createContentResolver(next); this.contextRegistry = this.createRegistry(this.contextResolver, next);
        this.scheduleContextRefresh();
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
        this.playbackState.cancel(); this.playbackState.pending = true;
        this.root.querySelector('.vn-content-notice').hidden = true;
        this.generation++; this.timing.cancel(); this.speech.stop(); this.dialogue.cancel(); this.effects.clear(); this.html.close();
        if (preserveWorld) { this.stage.cancelPending(); this.audio.cancelPending(); this.audio.cancelOneShots(); }
        else { this.stage.clear(); this.audio.close(); this.visuals.clear(); this.worldIdentity = null; }
        this.root.querySelector('.vn-panel').hidden = true; this.root.querySelector('.vn-reply').hidden = true;
        this.transcriptArtifact = false; this.standaloneArtifact = false;
        this.playbackState.pending = false; this.publishPlaybackActivity();
    }
    wait(message) {
        this.root.querySelector('.vn-status').textContent = message; this.root.querySelector('.vn-status').hidden = false;
        this.root.querySelector('.vn-dialogue').hidden = true; this.root.querySelector('.vn-position').textContent = '';
        for (const action of ['next', 'back', 'skip']) this.root.querySelector(`[data-action="${action}"]`).disabled = true;
    }
    async open(index) {
        if (!this.settings.enabled) return;
        this.updateMusicButton();
        this.updateLayoutControls(); this.updateFramingControls();
        if (this.root.hidden) { this.previousFocus = document.activeElement; this.root.hidden = false; document.body.classList.add('vnplus-immersive'); this.root.querySelector('[data-action="exit"]').focus(); }
        this.reveal.close();
        const context = this.host.context(), identity = chatIdentity(context);
        if (identity !== this.chatId) { this.invalidate(); this.chatId = identity; this.sceneRevision = null; this.playback = null; this.seen.clear(); this.playbackState.bind(this.environment); }
        else if (!this.playbackState.binding?.current()) this.playbackState.bind(this.environment);
        void this.refreshContext();
        this.selected = Number.isInteger(index) && index >= 0 ? index : latestAssistant(context);
        this.followLatest = this.selected === latestAssistant(context);
        this.observedSource = this.sourceFingerprint(context);
        this.settlingSource = null;
        if (this.busy) { this.publishPlaybackActivity(); this.wait('Waiting for a completed player perspective…'); return; }
        const message = readMessage(context, this.selected);
        if (!message || message.status !== 'ready') { this.speech.clearScene(); this.invalidate(); this.sceneRevision = null; this.playback = null; this.parsed = null; this.parserErrors = []; this.wait('Player perspective is unavailable. A completed POV section after ///// is required.'); return; }
        if (this.speech.prepared && this.speech.prepared.sourceId !== this.speechSceneId(message)) this.speech.clearScene();
        const history = contextEntries(context, message.index);
        const sourceRevision = `${this.environment.id}:${identity}:${message.index}:${message.swipe}:${message.pov}`;
        const revision = JSON.stringify([sourceRevision, history, this.settings.castMemoryTurns]);
        if (this.sceneRevision === revision && this.playback) {
            try { this.speech.prepare(this.speechSceneId(message), this.playback.timeline, this.registry); } catch (error) { this.speech.clearScene(); this.speech.notify(error.message); }
            this.speech.requestAutomatic();
            this.present(this.playback.restore()); return;
        }
        const historyPosition = this.sceneRevision && this.sceneSourceRevision === sourceRevision && this.playback ? this.playback.position : null;
        this.invalidate({ preserveWorld: this.canPreserveWorld() }); this.parsed = null; this.parserErrors = []; const generation = this.generation; this.wait('Preparing scene…');
        const parsed = parsePOV(message.pov);
        const names = contextNames(history);
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
        const seed = reduceContext(history, this.registry, this.settings, { beforeLast: true });
        const timeline = compileTimeline(parsed.tokens, this.registry, this.settings, seed), sourceKey = sceneKey(context, message), key = `${this.environment.id}:${sourceKey}`;
        try { this.speech.prepare(this.speechSceneId(message), timeline, this.registry); } catch (error) { this.speech.clearScene(); this.speech.notify(error.message); }
        this.speech.requestAutomatic();
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
        this.timing.cancel(); this.html.close(); this.dialogue.cancel(); this.effects.clear(); this.audio.cancelOneShots();
        this.standaloneArtifact = false;
        this.root.querySelector('.vn-status').hidden = true; this.root.querySelector('.vn-reply').hidden = true;
        const { state, token } = result.beat;
        this.root.classList.toggle('vn-narrating', !result.done && (token.type === 'narration' || token.type === 'dialogue' && this.registry.isNarrator(token.character)));
        this.runtimeState = structuredClone(state);
        this.worldIdentity = JSON.stringify([chatIdentity(this.host.context()), this.environment.id]);
        const playback = this.speech.playBeat(result.done || token.thought ? -1 : result.beat.index);
        this.updateVoiceStatus();
        const source = { message: this.selected, swipe: readMessage(this.host.context(), this.selected)?.swipe ?? 0, beat: result.beat.index, position: this.playback.position };
        this.renderState(state, source);
        for (const effect of result.effects) { if (effect.type === 'sfx') void this.audio.sfx(effect.name); else this.effects.trigger(effect); }
        this.root.querySelector('[data-action="back"]').disabled = this.playback.position <= 0;
        this.root.querySelector('[data-action="next"]').disabled = false; this.root.querySelector('[data-action="skip"]').disabled = false;
        this.root.querySelector('[data-action="auto"]').setAttribute('aria-pressed', String(this.settings.autoAdvance));
        this.root.querySelector('.vn-position').textContent = `${Math.min(this.playback.position + 1, this.playback.timeline.views.length)} / ${this.playback.timeline.views.length}`;
        const dialogue = this.root.querySelector('.vn-dialogue');
        if (result.done) { dialogue.hidden = true; this.showReply(); return; }
        if (token.type === 'artifact') { dialogue.hidden = true; this.html.open(token); return; }
        dialogue.hidden = false;
        const props = token.type === 'narration' || token.type === 'dialogue' && this.registry.isNarrator(token.character)
            ? this.registry.get('narrator') : state.speaker ? this.registry.get(state.speaker) : {};
        void this.dialogue.render(token, props, state.textEffect, () => this.scheduleAuto(), !result.forward, playback);
        const generation = this.generation, cursor = this.playback.cursor, navigation = this.playback;
        this.timing.start({ token, settings: this.settings, playback, visualChecks: result.beat.visualChecks,
            commands: result.attached || result.beat.attached.map(command => ({ ...command, oneShots: [] })),
            valid: () => !this.disposed && !this.root.hidden && !this.busy && generation === this.generation && navigation === this.playback && cursor === this.playback.cursor && this.playbackState.binding?.current(),
            paused: () => this.html.active || !this.root.querySelector('.vn-panel').hidden || !this.root.querySelector('.vn-reply').hidden || document.hidden,
            canAdvance: () => !this.dialogue.typing && !this.speech.speaking,
            onCommand: (command, profile) => this.executeAttached(command, profile, source),
            onAdvance: () => this.present(this.playback.forward()),
        });
        if (result.forward && (!result.previouslySeen || result.replaying) && token.type === 'dialogue') {
            const flair = this.settings.textEffects ? EMOTION_FLAIR[token.emotion] || {} : {};
            if (flair.screenFlash) this.effects.trigger({ type: 'flash', value: flair.screenFlash });
            const sound = props.sounds?.[token.emotion] || props.sound || flair.sound || token.emotion;
            if (this.settings.characterSounds && !token.thought && !this.settings.tts.enabled) void this.audio.sfx(sound, props.assetFolder || state.speaker);
        }
    }
    renderState(state, source, profile) {
        if (!this.playbackState.binding?.current() || this.playbackState.binding.index !== this.selected) this.playbackState.bind(this.environment, this.selected);
        const sharedEpoch = this.playbackState.begin();
        this.visuals.sync(state.visuals, profile);
        void Promise.allSettled([this.stage.render(state, this.playback.timeline.maxSlots), this.audio.sync(state)]).then(results => {
            for (const result of results) if (result.status === 'rejected') this.log(result.reason?.message || String(result.reason));
            if (sharedEpoch !== this.playbackState.epoch || this.root.hidden || this.busy || !this.playbackState.binding?.current()) return;
            this.playbackState.commit({ ...sceneSnapshot({ state, source, registry: this.registry, settings: this.settings, environment: this.environment, stage: this.stage, audio: this.audio }), basis: 'playback', updating: false }, sharedEpoch);
            this.publishContextActivity();
        });
    }
    executeAttached(command, profile, source) {
        const before = this.playback.timeline.beats[command.index - 1].state;
        this.runtimeState = applyCommandState(this.runtimeState, before, command.state);
        this.renderState(this.runtimeState, source, profile);
        for (const effect of command.oneShots) { if (effect.type === 'sfx') void this.audio.sfx(effect.name); else this.effects.trigger(effect); }
        if (command.token.name === 'VISUAL' && /^CLOSE\s+/i.test(command.token.args)) {
            const sound = this.settings[`${profile.category}ReactionSound`]; if (sound) void this.audio.sfx(sound);
        }
    }
    visualSession(token, alive) {
        // An overlay follows the viewed paragraph; each request captures its own timeline anchor.
        return { request: async (method, args) => {
            const result = this.playback?.restore(), beat = result?.beat, position = this.playback?.position, generation = this.generation, index = this.selected, environment = this.environment.id;
            const current = () => alive() && !this.root.hidden && !this.disposed && !this.busy && generation === this.generation && index === this.selected && environment === this.environment.id && position === this.playback?.position && beat === this.playback?.restore().beat;
            if (!beat || !current()) throw new Error('The visual scene changed. Try again in the current scene.');
            const scene = await this.artifactScene({ ...beat, state: this.runtimeState || beat.state }, index);
            if (!current()) throw new Error('The visual scene changed. Try again in the current scene.');
            const session = this.host.extra.artifactSession({ index, beat: result.done ? this.playback.timeline.beats.length : beat.index, environment, id: token.id, alive: current, scene: () => scene });
            return session.request(method, args);
        } };
    }
    async readArtifact(id, signal) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(id)) throw new Error('Invalid local artifact ID.');
        let response = await fetch(this.resolver.url(`artifacts/${id}/index.html`), { signal, cache: 'no-store' });
        if (id === 'diary' && response.status === 404) response = await fetch(new URL('examples/diary.html', this.base), { signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`Add artifacts/${id}/index.html to this environment (HTTP ${response.status}).`);
        const html = await response.text(); if (new TextEncoder().encode(html).byteLength > 1048576) throw new Error('Local artifact HTML exceeds 1 MiB.');
        return html;
    }
    artifactSession(token, open = () => true) {
        if (token.standalone) return this.visualSession(token, open);
        const beat = this.playback?.timeline.beats.find(item => item.token === token);
        if (!beat) throw new Error('This artifact is not part of the selected scene.');
        const generation = this.generation, environment = this.environment.id, index = this.selected;
        const id = token.id || `item-${this.host.extra.capture(index).anchor().variantId}-${token.line}`;
        let point;
        void this.artifactScene(beat, index).then(value => point = value).catch(error => this.log(`Artifact scene: ${error.message}`));
        return this.host.extra.artifactSession({ index, beat: beat.index, environment, id,
            alive: () => open() && !this.disposed && !this.busy && generation === this.generation && index === this.selected && environment === this.environment.id,
            scene: () => {
                const value = this.playbackVariables;
                return value.source?.message === index && value.source?.beat === beat.index ? value : point || { available: false, updating: true, scene: structuredClone(beat.state.scene) };
            },
        });
    }
    async artifactScene(beat, index) {
        const resolver = this.resolver, registry = this.registry, environment = this.environment, state = beat.state;
        const [background, music, ambient] = await Promise.all([state.background ? resolver.background(state.background) : null, state.music ? resolver.audio('music', state.music.name) : null, state.ambient ? resolver.audio('ambient', state.ambient.name) : null]);
        const properties = background ? await resolver.backgroundProperties(background) : { inside: false };
        const tint = document.createElement('span'); tint.hidden = true; tint.style.backgroundColor = CSS.supports('color', state.tint) ? state.tint : 'transparent'; this.root.append(tint);
        const color = getComputedStyle(tint).backgroundColor; tint.remove();
        const value = sceneSnapshot({ state, registry, settings: this.settings, environment,
            source: { message: index, swipe: this.host.context().chat[index]?.swipe_id || 0, beat: beat.index, position: null },
            audio: { channels: { music: {}, ambient: {} } }, stage: { backgroundUrl: background, backgroundProperties: properties, variables: { lighting: sceneLighting(state.scene, properties.inside) }, appliedTint: state.tint, ambientColor: color === 'rgba(0, 0, 0, 0)' ? '#ffffff' : color } });
        value.music.asset = music; value.ambient.asset = ambient; value.basis = 'artifact'; value.updating = false; return value;
    }
    scheduleAuto() {
        this.root.querySelector('[data-action="auto"]').setAttribute('aria-pressed', String(this.settings.autoAdvance));
        const input = this.settingsPanel?.querySelector('[data-setting="autoAdvance"]'); if (input) input.checked = this.settings.autoAdvance;
        this.timing.wake();
    }
    showReply() {
        this.root.querySelector('.vn-reply').hidden = false;
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
        const history = contextEntries(this.host.context(), message.index);
        await registry.prepare(contextNames(history));
        if (registry.discoveryError) { this.characterFolderStatus(registry.discoveryError); this.log(registry.discoveryError); }
        const current = readMessage(this.host.context(), this.selected);
        if (this.busy || registry !== this.registry || !current || current.pov !== message.pov || current.swipe !== message.swipe || current.index !== message.index) throw new Error('The selected scene changed. Prepare its dialogue again.');
        const seed = reduceContext(history, registry, this.settings, { beforeLast: true });
        return this.speech.prepare(this.speechSceneId(message), compileTimeline(parsed.tokens, registry, this.settings, seed), registry);
    }
    panel(kind) {
        this.dialogue.skip();
        const panel = this.root.querySelector('.vn-panel'), content = panel.querySelector('.vn-panel-content'); content.replaceChildren();
        panel.querySelector('.vn-panel-title').textContent = kind === 'debug' ? 'Scene inspector · POV only' : 'Player perspective transcript';
        if (kind === 'debug') {
            const pre = document.createElement('pre'); pre.textContent = JSON.stringify({ message: this.selected, swipe: readMessage(this.host.context(), this.selected)?.swipe, cursor: this.playback?.cursor, errors: this.parserErrors, tokens: this.parsed?.tokens, state: this.playback?.restore().beat?.state, variables: this.sceneVariables, sharedVariables: this.sharedVariables, assets: Object.fromEntries(this.resolver.diagnostics), audio: this.messages }, null, 2); content.append(pre);
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
                this.dialogue.skip();
                const panel = this.root.querySelector('.vn-panel'); panel.querySelector('.vn-panel-title').textContent = 'Fish Audio voices';
                panel.querySelector('.vn-panel-content').replaceChildren(this.voicePanel.node); this.voicePanel.refresh(); panel.hidden = false;
                panel.querySelector('button').focus(); return;
            }
            if (action === 'debug' || action === 'transcript') { if (this.root.hidden) await this.open(this.selected); this.panel(action); return; }
            if (action === 'close-panel') { this.root.querySelector('.vn-panel').hidden = true; this.root.querySelector('.vn-dialogue').focus(); this.scheduleAuto(); return; }
            if (action === 'close-artifact') { this.html.close(); if (this.standaloneArtifact) { this.standaloneArtifact = false; this.scheduleAuto(); } else if (this.transcriptArtifact) { this.transcriptArtifact = false; this.panel('transcript'); } else if (this.playback && !this.busy) this.present(this.playback.forward()); return; }
            if (action === 'close-reply') { this.root.querySelector('.vn-reply').hidden = true; const result = this.playback?.restore(); if (result?.done) this.present(this.playback.back()); else this.present(result); return; }
            if (this.busy) return;
            if (action === 'diary') {
                if (this.root.hidden) await this.open(this.selected);
                if (!this.playback?.restore().beat) return;
                this.dialogue.skip(); this.standaloneArtifact = true; this.transcriptArtifact = false;
                this.html.open({ type: 'artifact', id: 'diary', local: true, interactive: true, standalone: true }); return;
            }
            if (action === 'reply') { this.dialogue.skip(); this.showReply(); return; }
            if (action === 'auto') { this.settings.autoAdvance = !this.settings.autoAdvance; this.host.save(this.settings); this.root.querySelector('[data-action="auto"]').setAttribute('aria-pressed', String(this.settings.autoAdvance)); this.scheduleAuto(); return; }
            if (action === 'send') { const input = this.root.querySelector('#vnplus-reply'); if (input.value.trim()) { this.host.send(input.value); input.value = ''; this.root.querySelector('.vn-reply-status').textContent = ''; } return; }
            if (action === 'retry') { await this.host.retry(this.selected); return; }
            if (!this.playback || this.html.active || !this.root.querySelector('.vn-panel').hidden || !this.root.querySelector('.vn-reply').hidden && action === 'next') return;
            if (action === 'next' && this.dialogue.skip()) return;
            if (action === 'next') this.timing.finishCommands();
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
    close() { this.root.hidden = true; this.invalidate(); document.body.classList.remove('vnplus-immersive'); this.reveal.close(); if (this.previousFocus?.isConnected) this.previousFocus.focus(); }
    updateMusicButton() {
        const button = this.root.querySelector('[data-action="mute-music"]');
        button.textContent = this.settings.musicMuted ? 'Unmute music' : 'Mute music'; button.setAttribute('aria-pressed', String(!!this.settings.musicMuted));
        button.title = 'Toggle music without stopping the track. Ambience and sound effects are independent.';
    }
    updateLayoutControls() {
        for (const input of [this.root.querySelector('[data-layout-picker]'), this.settingsPanel?.querySelector('[data-setting="layout"]')]) if (input) input.value = this.settings.layout;
    }
    updateFramingControls() {
        for (const input of [this.root.querySelector('[data-framing-picker]'), this.settingsPanel?.querySelector('[data-setting="spriteFraming"]')]) if (input) input.value = this.settings.spriteFraming;
    }
    applyLayout() {
        const state = this.playback?.restore().beat?.state;
        if (this.root.hidden || this.busy || !this.root.querySelector('.vn-status').hidden || !state) return;
        void this.stage.render(this.runtimeState || state, this.playback.timeline.maxSlots).catch(error => this.log(error.message));
    }
    dispose() {
        clearInterval(this.sourceTimer);
        clearTimeout(this.contextTimer); this.sharedState.cancel();
        this.close(); this.disposed = true; this.audio.onChange = null; this.stage.dispose(); this.observer.disconnect(); clearTimeout(this.mountTimer); this.disposers.forEach(dispose => dispose());
        this.root.remove(); this.settingsPanel?.remove(); document.querySelectorAll('.vn-message-tools').forEach(node => node.remove()); this.seen.clear();
        this.resolver.dispose(); this.catalogResolver.dispose();
        this.environmentStyle.dispose();
        this.contextResolver.dispose();
        this.host.extra.dispose();
        this.speechSettingsPanel.dispose(); this.voicePanel.dispose(); this.speech.dispose();
    }
}
