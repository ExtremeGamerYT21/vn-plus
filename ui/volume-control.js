let sequence = 0;
const level = value => Math.max(0, Math.min(1, Number(value) || 0));

export function syncVolumeSlider(input, value) {
    input.value = level(value);
    const text = `${Math.round(level(value) * 100)}%`;
    input.setAttribute('aria-valuetext', text);
    input.parentElement.querySelector('output').value = text;
}

export function createVolumeSlider(label, read, write, attribute, key) {
    const row = document.createElement('label'); row.className = 'vn-setting vn-volume-setting';
    const caption = document.createElement('span'); caption.textContent = label;
    const control = document.createElement('span'); control.className = 'vn-range-control';
    const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '1'; input.step = '.01';
    input.dataset[attribute] = key; input.setAttribute('aria-label', label);
    const output = document.createElement('output'); output.id = `vn-volume-${++sequence}`; input.setAttribute('aria-describedby', output.id);
    control.append(input, output); row.append(caption, control); syncVolumeSlider(input, read());
    const update = () => { const value = level(input.value); syncVolumeSlider(input, value); if (value !== read()) write(value); };
    input.addEventListener('input', update); input.addEventListener('change', update);
    return row;
}
