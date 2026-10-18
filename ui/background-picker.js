import { backgroundChoices } from '../core/manual-background.js';

const element = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
async function readableImage(url) {
    const image = new Image(); image.src = url;
    try { await image.decode(); } catch { throw new Error('This image could not be loaded. Choose another background.'); }
}

export function backgroundPicker({ resolver, current, apply, reset }) {
    const root = element('div', '', 'vn-background-picker');
    root.append(element('p', 'Replace the current background immediately. The next scripted background or fade restores normal scene control.', 'vn-hint'));
    if (current) root.append(element('p', `Current replacement: ${current.name}`, 'vn-hint'));
    const choices = backgroundChoices(resolver), search = element('input'); search.type = 'search'; search.placeholder = 'Filter background names'; search.setAttribute('aria-label', 'Filter backgrounds');
    const select = element('select'); select.setAttribute('aria-label', 'Background image'); select.className = 'vn-environment-picker';
    const preview = element('img'); preview.alt = 'Selected background preview'; preview.className = 'vn-sprite-preview'; preview.style.maxWidth = '100%'; preview.style.maxHeight = '280px';
    const status = element('p', '', 'vn-hint'); status.role = 'status';
    const applyButton = element('button', 'Apply background'), resetButton = element('button', 'Use scripted background');
    applyButton.type = resetButton.type = 'button'; resetButton.disabled = !current;
    const row = (label, input) => { const node = element('label', '', 'vn-setting'); node.append(element('span', label), input); return node; };
    const updatePreview = () => { const choice = choices.find(value => value.path === select.value); preview.hidden = !choice; if (choice) preview.src = choice.url; else preview.removeAttribute('src'); applyButton.disabled = !choice; };
    const filter = () => {
        const previous = select.value || current?.path, query = search.value.trim().toLowerCase();
        select.replaceChildren();
        for (const choice of choices.filter(value => value.name.toLowerCase().includes(query))) { const option = element('option', choice.name); option.value = choice.path; select.append(option); }
        if ([...select.options].some(option => option.value === previous)) select.value = previous;
        select.disabled = !select.options.length; updatePreview();
    };
    const showError = error => { status.textContent = error.message; applyButton.disabled = !select.value; };
    applyButton.addEventListener('click', () => void (async () => {
        const choice = choices.find(value => value.path === select.value); if (!choice) return;
        applyButton.disabled = true; status.textContent = 'Loading background…';
        await readableImage(choice.url);
        const properties = await resolver.backgroundProperties(choice.url);
        await apply({ ...choice, properties });
    })().catch(showError));
    resetButton.addEventListener('click', () => void Promise.resolve().then(reset).catch(showError));
    search.addEventListener('input', filter); select.addEventListener('change', updatePreview);
    const file = element('input'); file.type = 'file'; file.accept = 'image/*'; file.setAttribute('aria-label', 'Choose background from computer');
    file.addEventListener('change', () => void (async () => {
        const image = file.files?.[0]; if (!image) return;
        if (!(image.type.startsWith('image/') || !image.type && /\.(?:png|jpe?g|webp|avif|gif|bmp|svg)$/i.test(image.name)) || image.size > 25 * 1024 * 1024) throw new Error('Choose an image file up to 25 MiB.');
        status.textContent = 'Loading background…'; const url = URL.createObjectURL(image);
        try { await readableImage(url); await apply({ name: image.name || 'Local background', url, temporary: true, properties: { inside: false } }); }
        catch (error) { URL.revokeObjectURL(url); throw error; }
    })().catch(showError));
    const actions = element('div', '', 'vn-settings-actions'); actions.append(applyButton, resetButton);
    root.append(row('Search', search), row('Environment background', select), preview, actions, row('Or choose an image', file),
        element('p', 'Images chosen from your computer stay in this tab only. Your chat text and authored files are unchanged.', 'vn-hint'), status);
    if (!choices.length) status.textContent = 'No backgrounds are indexed in this environment. Choose an image from your computer, or refresh assets after adding files.';
    filter(); return root;
}
