/**
 * MapImageLayersEditor - the Image Layers list in Map Properties.
 *
 * A map image layer is a picture from img/parallaxes locked to the map: painted
 * ground drawn over the lower tiles and under every character, or light,
 * canopy or sky drawn over everything ($dataMap.rrImageLayers, drawn by the
 * runtime's Spriteset_Map and the editor's map view). Imports of parallax-mapped
 * games write them; here an author sees, changes, adds and removes them like
 * any other map setting.
 *
 *   RRMapImageLayersEditor.mount(container, { pickImage })
 *   .load(layers)   .read() → array (empty when there are none)
 */
(function (root) {
    'use strict';
    const tt = (text) => (root.I18n ? root.I18n.tText(text) : text);
    const inputStyle = 'width: 100%; box-sizing: border-box; padding: 4px 6px; background-color: var(--color-bg-input); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 11px;';

    let list = null, options = {}, rows = [];

    function mount(container, opts = {}) {
        options = opts;
        container.innerHTML = `
            <div class="lit-section-header map-props-card-header">
                <span>${rrEscapeHtml(tt('Image Layers'))}</span>
                <button type="button" class="map-props-btn primary rr-image-layer-add" style="padding: 3px 12px; font-size: 11px;">${rrEscapeHtml(tt('Add'))}</button>
            </div>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 6px;">${rrEscapeHtml(tt('Pictures locked to the map: painted ground under the characters, or light and canopy over everything.'))}</div>
            <div style="display: grid; grid-template-columns: 2fr 1.4fr 0.8fr 0.8fr auto; gap: 6px; padding: 4px 6px; background-color: var(--color-bg-surface); border-radius: 3px; font-size: 11px; color: var(--color-text-muted); font-weight: 600;">
                <div>${rrEscapeHtml(tt('Image'))}</div><div>${rrEscapeHtml(tt('Position'))}</div><div>${rrEscapeHtml(tt('Variable'))}</div><div>${rrEscapeHtml(tt('Switch'))}</div><div style="width: 20px;"></div>
            </div>
            <div class="rr-image-layer-list" style="max-height: 180px; overflow-y: auto;"></div>`;
        list = container.querySelector('.rr-image-layer-list');
        container.querySelector('.rr-image-layer-add').addEventListener('click', () => { rows.push({ name: '', layer: 'ground' }); render(); });
    }

    function render() {
        if (!list) return;
        list.innerHTML = '';
        rows.forEach((row, index) => {
            const el = document.createElement('div');
            el.className = 'rr-image-layer-row';
            el.style.cssText = 'display: grid; grid-template-columns: 2fr 1.4fr 0.8fr 0.8fr auto; gap: 6px; align-items: center; padding: 3px 6px;';
            el.innerHTML = `
                <button type="button" class="map-props-btn rr-image-layer-name" style="padding: 4px 6px; font-size: 11px; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${rrEscapeHtml(row.name)}">${rrEscapeHtml(row.name || tt('(None)'))}</button>
                <select class="rr-image-layer-position" style="${inputStyle}">
                    <option value="ground"${row.layer !== 'over' ? ' selected' : ''}>${rrEscapeHtml(tt('Under characters'))}</option>
                    <option value="over"${row.layer === 'over' ? ' selected' : ''}>${rrEscapeHtml(tt('Over everything'))}</option>
                </select>
                <input type="number" min="0" class="rr-image-layer-variable" value="${rrEscapeHtml(row.variable || 0)}" style="${inputStyle}" aria-label="${rrEscapeHtml(tt('Variable'))}">
                <input type="number" min="0" class="rr-image-layer-switch" value="${rrEscapeHtml(row.switch || 0)}" style="${inputStyle}" aria-label="${rrEscapeHtml(tt('Switch'))}">
                <button type="button" class="map-props-btn rr-image-layer-remove" style="padding: 2px 7px; font-size: 12px;" aria-label="${rrEscapeHtml(tt('Remove'))}">×</button>`;
            el.querySelector('.rr-image-layer-name').addEventListener('click', () => {
                if (typeof options.pickImage === 'function') options.pickImage(row.name, (name) => { row.name = name || ''; render(); });
            });
            el.querySelector('.rr-image-layer-position').addEventListener('change', (e) => { row.layer = e.target.value; });
            el.querySelector('.rr-image-layer-variable').addEventListener('change', (e) => { row.variable = Math.max(0, Math.floor(Number(e.target.value) || 0)); });
            el.querySelector('.rr-image-layer-switch').addEventListener('change', (e) => { row.switch = Math.max(0, Math.floor(Number(e.target.value) || 0)); });
            el.querySelector('.rr-image-layer-remove').addEventListener('click', () => { rows.splice(index, 1); render(); });
            list.appendChild(el);
        });
    }

    function load(layers) {
        rows = (Array.isArray(layers) ? layers : []).filter(Boolean).map(l => Object.assign({}, l, { loadedName: l.name }));
        render();
    }

    /**
     * The layers as the map stores them. A variable's variant name keeps the
     * import's pattern when the image is unchanged; a newly chosen image gets
     * the GDS pattern ("43_Ground" → "43-%1_Ground") when it has a map-id prefix.
     */
    function read() {
        return rows.filter(r => r.name).map(r => {
            const out = { name: r.name, layer: r.layer === 'over' ? 'over' : 'ground' };
            if (r.variable) {
                out.variable = r.variable;
                const m = /^(\d+)(_.*)$/.exec(r.name);
                out.variantName = r.variantName && r.name === r.loadedName ? r.variantName : (m ? `${m[1]}-%1${m[2]}` : r.name);
            }
            if (r.switch) out.switch = r.switch;
            if (typeof r.opacity === 'number') out.opacity = r.opacity;
            if (r.blendMode) out.blendMode = r.blendMode;
            return out;
        });
    }

    const api = { mount, load, read };
    root.RRMapImageLayersEditor = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
