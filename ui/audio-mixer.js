import { createVolumeSlider, syncVolumeSlider } from './volume-control.js';

export class AudioMixer {
    constructor(settings, change) {
        this.settings = settings; this.node = document.createElement('div'); this.node.className = 'vn-audio-mixer';
        for (const [key, label] of [['voice', 'Voice volume'], ['music', 'Music volume'], ['ambient', 'Ambience volume'], ['sfx', 'SFX volume']]) {
            this.node.append(createVolumeSlider(label, () => this.read(key), value => {
                if (key === 'voice') settings.tts.volume = value; else settings[`${key}Volume`] = value;
                change(key === 'voice' ? 'speechVolume' : `${key}Volume`);
            }, 'mixerVolume', key));
        }
        const actions = document.createElement('div'); actions.className = 'vn-settings-actions';
        this.voiceMute = document.createElement('button'); this.voiceMute.type = 'button'; this.voiceMute.dataset.mixerMute = 'voice';
        this.voiceMute.addEventListener('click', () => { settings.tts.muted = !settings.tts.muted; change('speechVolume'); });
        this.musicMute = document.createElement('button'); this.musicMute.type = 'button'; this.musicMute.dataset.mixerMute = 'music';
        this.musicMute.addEventListener('click', () => { settings.musicMuted = !settings.musicMuted; change('musicMuted'); });
        actions.append(this.voiceMute, this.musicMute); this.node.append(actions);
        const hint = document.createElement('p'); hint.className = 'vn-hint'; hint.textContent = 'Changes apply immediately and are saved. Muting keeps your chosen volume; voices and music continue at their current position.';
        this.node.append(hint); this.refresh();
    }
    read(key) { return key === 'voice' ? this.settings.tts.volume : this.settings[`${key}Volume`]; }
    refresh() {
        for (const input of this.node.querySelectorAll('[data-mixer-volume]')) syncVolumeSlider(input, this.read(input.dataset.mixerVolume));
        for (const [button, muted, label] of [[this.voiceMute, this.settings.tts.muted, 'voice'], [this.musicMute, this.settings.musicMuted, 'music']]) {
            button.textContent = `${muted ? 'Unmute' : 'Mute'} ${label}`; button.setAttribute('aria-pressed', String(!!muted));
        }
    }
}
