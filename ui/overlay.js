import { STAGE_LAYOUT_OPTIONS } from '../core/stage-layout.js';

export function createOverlay() {
    const root = document.createElement('section'); root.id = 'vnplus-overlay'; root.className = 'vnplus-ui'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Visual Novel Plus');
    root.innerHTML = `
      <div class="vn-world"><div class="vn-background"></div><div class="vn-stage"></div><div class="vn-tint"></div><div class="vn-darkness"></div></div>
      <div class="vn-flash"></div>
      <header class="vn-top"><div><span class="vn-brand">VN<span>+</span></span><span class="vn-scene-label">PLAYER PERSPECTIVE</span></div>
        <nav aria-label="Scene tools"><select class="vn-environment-picker" aria-label="VN content environment" data-environment-picker title="Choose this scene's character artwork, backgrounds and audio"></select><select class="vn-layout-picker" aria-label="VN bust layout" data-layout-picker></select><button data-action="transcript">Transcript</button><button data-action="debug">Inspect</button><button data-action="mute-music" aria-pressed="false">Mute music</button><button data-action="exit">Exit VN</button></nav></header>
      <div class="vn-status" role="status" hidden></div>
      <div class="vn-dialogue" tabindex="0" role="button" aria-label="Advance dialogue">
        <div class="vn-speaker">Narration</div><div class="vn-text"></div><div class="vn-dialogue-foot"><span class="vn-position"></span><span>Click to continue <b>▾</b></span></div>
      </div>
      <nav class="vn-controls" aria-label="Playback"><button data-action="back" title="Left arrow">← Back</button><button data-action="next" title="Space / Right arrow">Continue →</button><button data-action="replay">Replay</button><button data-action="skip">Skip viewed</button><button data-action="auto" aria-pressed="false">Auto</button><button data-action="reply">Reply</button></nav>
      <div class="vn-reply" hidden><label for="vnplus-reply">Your response</label><textarea id="vnplus-reply" rows="3" placeholder="Write your reply…"></textarea><div><button data-action="send">Send</button><button data-action="retry">Retry response</button><button data-action="close-reply">Resume scene</button></div><p class="vn-reply-status" role="status"></p></div>
      <div class="vn-artifact" hidden><section role="dialog" aria-modal="true" aria-label="Scene artifact"><header><span>Scene artifact</span><button data-action="close-artifact">Close & continue</button></header><div class="vn-artifact-content"></div></section></div>
      <div class="vn-panel" hidden><section role="dialog" aria-label="Scene information"><header><span class="vn-panel-title"></span><button data-action="close-panel">Close</button></header><div class="vn-panel-content"></div></section></div>`;
    for (const { value, label } of STAGE_LAYOUT_OPTIONS) {
        const option = document.createElement('option'); option.value = value; option.textContent = label; root.querySelector('[data-layout-picker]').append(option);
    }
    document.body.append(root); return root;
}
