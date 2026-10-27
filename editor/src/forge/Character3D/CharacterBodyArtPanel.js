/**
 * The 3D Character Builder's Body art tab (Character3DBuilder.prototype):
 * one-click looks, a short list of tattoos, paint, scars and implants with
 * the chosen one's design under it (pictures of the designs, a project
 * picture of your own, where it goes and a few sliders), piercings by
 * picture, and cybernetics: limbs, an eye, face implants, and the cyber
 * tails, wings, horns and ears from Body. Everything saves in the recipe's
 * `bodyArt` (RRCharacterBodyArt) and opens again editable.
 */
(function() {
    'use strict';
    if (typeof Character3DBuilder === 'undefined' || typeof RRCharacterBodyArt === 'undefined') return;
    const A = RRCharacterBodyArt, M = A.motifs, P = Character3DBuilder.prototype;
    const esc = s => (typeof rrEscapeHtml === 'function' ? rrEscapeHtml(String(s)) : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const DEFAULT_REGION = { tattoo: 'forearm', paint: 'face', scar: 'face', implant: 'forearm' };
    const SWATCH = {
        tattoo: ['#121316', '#1f3c78', '#8c1c1c', '#1d5c34', '#5a2a6e', '#38e6ff'],
        paint: ['#16161a', '#e9e3d3', '#9e1b1b', '#1f3c78', '#d9b23c', '#38e6ff'],
        scar: ['#d9a79c', '#c98e86', '#e8cfc4', '#a8605a'],
        implant: ['#38e6ff', '#ff3df0', '#7cff6a', '#ffb23a', '#ffffff']
    };

    /** A small picture (data URL) of RGBA bytes, kept by key. */
    P._artMini = function(key, size, make) {
        this._artMinis = this._artMinis || new Map();
        if (this._artMinis.has(key)) return this._artMinis.get(key);
        let url = '';
        try {
            const data = make(), c = document.createElement('canvas');
            c.width = c.height = size;
            c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), size, size), 0, 0);
            url = c.toDataURL('image/png');
        } catch (error) { url = ''; }
        if (this._artMinis.size > 300) this._artMinis.clear();
        this._artMinis.set(key, url);
        return url;
    };
    P._artLayerThumb = function(l) {
        if (l.motif === 'picture') return this._artPictureUrl(l.picture);
        return this._artMini(JSON.stringify([l.motif, l.seed, l.text, l.color, l.color2, l.kind]), 64, () => A.layerPreview(l, 64));
    };
    P._artPictureUrl = function(name) {
        const project = this._project(), assets = window.RRAssetFiles;
        if (!name || !project || !assets) return '';
        try { return assets.imageUrlFor(require('path').join(project.path, 'img', 'pictures'), name); } catch (error) { return ''; }
    };

    /** Piercing spots as little drawings: an ear or a face, the spot marked. */
    const SPOT_ICON = {
        lobe: ['ear', 9, 20], helix: ['ear', 15, 4], industrial: ['ear', 12, 4, 'bar'], tragus: ['ear', 7, 11],
        nostril: ['face', 14.5, 14], septum: ['face', 12, 15.5], eyebrow: ['face', 16, 6.5, 'bar'], lip: ['face', 14, 18.5], labret: ['face', 12, 20.5], bridge: ['face', 12, 9, 'hbar']
    };
    P._spotIcon = function(id, active) {
        const [kind, x, y, bar] = SPOT_ICON[id] || ['face', 12, 12];
        const line = active ? '#ffd27a' : '#c9ccd2', mark = active ? '#ffb23a' : '#e8ecf0';
        const base = kind === 'ear'
            ? `<path d="M8 21c-2-1-3-4-2-6 1-1 2-2 2-4 0-5 3-8 7-8s6 3 6 7c0 3-2 4-3 6-1 1-1 3-2 4-1 2-4 2-8 1z" fill="none" stroke="${line}" stroke-width="1.4"/><path d="M11 12c0-3 2-5 4-5s3 2 3 4" fill="none" stroke="${line}" stroke-width="1"/>`
            : `<ellipse cx="12" cy="12" rx="8" ry="10.5" fill="none" stroke="${line}" stroke-width="1.4"/><path d="M7.5 9h3M13.5 9h3M12 10v5M10.5 15h3M9.5 18.5c1.5 1 3.5 1 5 0" stroke="${line}" stroke-width="1" fill="none"/>`;
        const shape = bar === 'bar' ? `<path d="M${x - 1.5} ${y - 2.5}l3 5" stroke="${mark}" stroke-width="1.2"/><circle cx="${x - 1.5}" cy="${y - 2.5}" r="1.3" fill="${mark}"/><circle cx="${x + 1.5}" cy="${y + 2.5}" r="1.3" fill="${mark}"/>`
            : bar === 'hbar' ? `<path d="M${x - 3} ${y}h6" stroke="${mark}" stroke-width="1.2"/><circle cx="${x - 3}" cy="${y}" r="1.3" fill="${mark}"/><circle cx="${x + 3}" cy="${y}" r="1.3" fill="${mark}"/>`
                : `<circle cx="${x}" cy="${y + 1.6}" r="2.2" fill="none" stroke="${mark}" stroke-width="1.2"/><circle cx="${x}" cy="${y}" r="1" fill="${mark}"/>`;
        return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#3a3d44"/>${base}${shape}</svg>`);
    };

    P._bodyArtTab = function() {
        const r = this.recipe, art = r.bodyArt || A.normalize({}), layers = art.layers;
        this._loadArtPictures();
        const sel = this.artLayer = Math.max(0, Math.min(layers.length - 1, this.artLayer || 0));
        let html = this._section('Looks') + `<p class="rr-c3d-note">${this._t('A look to start from: everything in it stays editable below.')}</p>`
            + `<div class="rr-c3d-tiles">${A.PRESETS.map(p => this._tile('art-preset', p.id, p.label, 'artpreset', false)).join('')}</div>`;
        // The painted layers: a short list, the chosen one's design under it.
        html += this._section('Tattoos, paint and scars') + `<div class="rr-prop-layers">${layers.map((l, k) => {
            const m = M.BY_ID.get(l.motif), reg = A.REGION_BY_ID.get(l.region);
            const name = (l.motif === 'picture' ? (l.picture || this._t('Picture')) : this._t(m ? m.label : l.motif)) + ' · ' + this._t(reg.label) + (l.side === 'both' ? ' ×2' : '');
            const thumb = this._artLayerThumb(l);
            return `<div class="rr-prop-layer${k === sel ? ' is-active' : ''}" data-act="art-select" data-id="${k}">${thumb ? `<img src="${thumb}" alt="" style="width:26px;height:26px;flex:0 0 26px">` : '<span style="width:26px"></span>'}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</span>`
                + `<button class="rr-c3d-clear" data-act="art-up" data-id="${k}" title="${this._t('Move up')}"${k ? '' : ' disabled'}>▲</button><button class="rr-c3d-clear" data-act="art-down" data-id="${k}" title="${this._t('Move down')}"${k < layers.length - 1 ? '' : ' disabled'}>▼</button><button class="rr-c3d-remove" data-act="art-remove" data-id="${k}" title="${this._t('Remove')}">✕</button></div>`;
        }).join('')}</div>`;
        const full = layers.length >= A.MAX_LAYERS ? ' disabled' : '';
        html += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">${A.KINDS.map(([kind, label]) => `<button class="rr-btn-chip" style="flex:1 1 0;min-width:0" data-act="art-add" data-id="${kind}"${full}>＋ ${this._t(label)}</button>`).join('')}</div>`;
        if (!layers.length) html += `<p class="rr-c3d-note">${this._t('Add a tattoo, paint, a scar or an implant, or start from a look above.')}</p>`;
        if (layers.length) html += this._artLayerControls(layers[sel], sel);
        html += this._artPiercings(art);
        html += this._artCyber(art);
        return html;
    };

    P._artLayerControls = function(l, i) {
        const base = `bodyArt.layers.${i}`, m = M.BY_ID.get(l.motif), reg = A.REGION_BY_ID.get(l.region);
        let html = this._section('Design');
        // The designs of this kind as pictures; for tattoos and paint a picture of your own last.
        const designs = M.MOTIFS.filter(x => x.kind === l.kind && !x.hidden);
        html += `<div class="rr-c3d-tiles">${designs.map(x => {
            const url = this._artMini(JSON.stringify(['tile', x.id, l.color, l.color2, l.kind]), 64, () => A.layerPreview(Object.assign({}, l, { motif: x.id, seed: 1, text: x.text ? (l.text || (x.id === 'script' ? 'Fortune' : '')) : '' }), 64));
            return `<button class="rr-c3d-tile rr-c3d-thumbtile${x.id === l.motif ? ' is-active' : ''}" data-act="art-motif" data-id="${x.id}" title="${esc(this._t(x.label))}"><span class="rr-c3d-thumb">${url ? `<img src="${url}" alt="">` : ''}</span><span class="rr-c3d-tile-label">${esc(this._t(x.label))}</span></button>`;
        }).join('')}${l.kind === 'tattoo' || l.kind === 'paint' ? (() => {
            const own = l.picture ? this._artPictureUrl(l.picture) : '';
            return `<button class="rr-c3d-tile rr-c3d-thumbtile rr-prop-owntile${l.motif === 'picture' ? ' is-active' : ''}" data-act="art-picture" title="${esc(this._t('Choose a picture'))}"><span class="rr-c3d-thumb">${own ? `<img src="${esc(own)}" alt="">` : '<span class="rr-prop-ownmark">＋</span>'}</span><span class="rr-c3d-tile-label">${this._t('Your picture')}</span></button>`;
        })() : ''}</div>`;
        if (l.motif === 'picture') html += `<div class="rr-c3d-row rr-prop-picturerow"><span class="rr-c3d-label">${this._t('Picture')}</span><span class="rr-prop-picturename">${l.picture ? `<img class="rr-prop-pictureimg" src="${esc(this._artPictureUrl(l.picture))}" alt="">` : ''}${esc(l.picture || this._t('None'))}</span><button class="rr-btn-chip" data-act="art-picture">${this._t('Choose…')}</button></div>`;
        if (m && m.text) html += `<label class="rr-c3d-row"><span class="rr-c3d-label">${this._t(l.motif === 'barcode' ? 'Number' : 'Words')}</span><input type="text" class="rr-input" data-path="${base}.text" maxlength="24" value="${esc(l.text)}" placeholder="${esc(this._t(l.motif === 'barcode' ? '1977' : 'Fortune'))}"></label>`;
        html += this._select(`${base}.region`, 'Where', A.REGIONS.map(x => [x.id, x.label]));
        html += this._select(`${base}.side`, 'Side', reg.sided ? A.SIDES : A.CENTER_SIDES);
        html += this._select(`${base}.style`, 'Style', A.STYLES[l.kind]);
        const sw = SWATCH[l.kind];
        if (l.kind === 'scar') html += this._color(`${base}.color`, 'Color', sw, true);
        else {
            html += this._color(`${base}.color`, l.kind === 'implant' ? 'Glow color' : l.kind === 'paint' ? 'Paint color' : 'Ink', sw, true);
            if (l.kind === 'tattoo' && l.motif !== 'picture' && (l.style === 'color' || l.style === 'glow')) html += this._color(`${base}.color2`, 'Fill color', ['#b3202c', '#2f7a4a', '#1f3c78', '#d9b23c', '#d9531e', '#38e6ff'], true);
        }
        if (m && (m.band || m.sleeve) && reg.proj !== 'plane' && !reg.sleeve) html += this._check(`${base}.band`, 'Band around');
        html += this._slider({ path: `${base}.size`, label: 'Size', natural: [0.4, 1.8], extreme: [0.2, 3], format: 'x' })
            + this._slider({ path: `${base}.rotate`, label: 'Turn', natural: [-180, 180], step: 1, format: 'deg' })
            + this._slider({ path: `${base}.around`, label: reg.proj === 'plane' ? 'Across' : 'Around', natural: [-1, 1], format: 'signed' })
            + this._slider({ path: `${base}.along`, label: 'Up and down', natural: [-1, 1], format: 'signed' })
            + this._slider({ path: `${base}.amount`, label: 'Strength', natural: [0, 1] });
        if (l.motif !== 'picture' && l.motif !== 'script') html += `<div class="rr-c3d-row"><span class="rr-c3d-label"></span><button class="rr-btn-chip" data-act="art-vary" title="${this._t('Another take on the same design')}">🎲 ${this._t('Vary')}</button></div>`;
        return html;
    };

    P._artPiercings = function(art) {
        let html = this._section('Piercings') + `<div class="rr-c3d-tiles rr-prop-tiles5">${A.PIERCING_SPOTS.map(s => {
            const on = art.piercings.some(p => p.spot === s.id);
            return `<button class="rr-c3d-tile rr-c3d-thumbtile${on ? ' is-active' : ''}" data-act="art-pierce" data-id="${s.id}" title="${esc(this._t(s.label))}"><span class="rr-c3d-thumb"><img src="${this._spotIcon(s.id, on)}" alt=""></span><span class="rr-c3d-tile-label">${esc(this._t(s.label))}</span></button>`;
        }).join('')}</div>`;
        const items = art.piercings.map((p, i) => {
            const spot = A.PIERCING_SPOTS.find(s => s.id === p.spot);
            let h = '';
            if (spot.sided) h += this._select(`bodyArt.piercings.${i}.side`, 'Side', A.SIDES);
            h += this._select(`bodyArt.piercings.${i}.style`, 'Style', A.PIERCING_STYLES) + this._select(`bodyArt.piercings.${i}.metal`, 'Metal', A.METALS.map(m => [m.id, m.label]));
            return { id: i, label: spot.label, html: h };
        });
        return html + (items.length ? this._cards(items, 'art-pierce-remove') : '');
    };

    P._artCyber = function(art) {
        let html = this._section('Cybernetics');
        const free = A.LIMBS.find(([id]) => !art.limbs.some(l => A.limbChain(l.limb).some(c => A.limbChain(id).includes(c))));
        const items = art.limbs.map((l, i) => {
            const base = `bodyArt.limbs.${i}`;
            let h = this._select(`${base}.limb`, 'Limb', A.LIMBS) + this._select(`${base}.mode`, 'Fitting', A.LIMB_MODES);
            h += `<div class="rr-c3d-tiles">${A.CYBER_STYLES.map(s => this._tile('art-cyber-style', s.id, s.label, 'cyberstyle', s.id === l.style, ` data-index="${i}"`)).join('')}</div>`;
            const st = A.CYBER_BY_ID.get(l.style);
            h += this._color(`${base}.color`, 'Color', [st.base, '#e4e7ea', '#4b5341', '#8a6d4c', '#1b2030', '#7a1d22'], true) + this._color(`${base}.color2`, 'Second color', [st.trim, '#c9ccd0', '#2b2e2c', '#c4a265'], true)
                + this._color(`${base}.glow`, 'Glow color', [st.glow, '#38e6ff', '#ff3df0', '#ff9a3a', '#7cff6a'], true)
                + this._slider({ path: `${base}.glowAmount`, label: 'Glow', natural: [0, 1] }) + this._slider({ path: `${base}.wear`, label: 'Wear', natural: [0, 1] });
            return { id: i, label: A.LIMBS.find(x => x[0] === l.limb)[1], html: h };
        });
        html += items.length ? this._cards(items, 'art-limb-remove') : `<p class="rr-c3d-note">${this._t('A cyber arm, hand or leg: replaced outright or plated over the skin.')}</p>`;
        if (free && art.limbs.length < A.MAX_LIMBS) html += `<button class="rr-btn-chip rr-c3d-addbtn" data-act="art-limb-add">＋ ${this._t('Cyber limb')}</button>`;
        html += `<div class="rr-c3d-subhead">${this._t('Eye and face')}</div>`
            + this._select('bodyArt.eye.side', 'Cyber eye', [['none', 'None'], ['left', 'Left'], ['right', 'Right']]);
        if (art.eye.side !== 'none') html += this._select('bodyArt.eye.style', 'Eye style', A.EYE_STYLES) + this._select('bodyArt.eye.cyber', 'Finish', A.CYBER_STYLES.map(s => [s.id, s.label])) + this._color('bodyArt.eye.glow', 'Glow color', ['#38e6ff', '#ff3d3d', '#7cff6a', '#ffb23a'], true);
        html += this._select('bodyArt.face.studs', 'Implant studs', A.FACE_STUDS) + this._select('bodyArt.face.plate', 'Implant plate', A.FACE_PLATES);
        if (art.face.studs !== 'none' || art.face.plate !== 'none') html += this._select('bodyArt.face.side', 'Side', A.SIDES) + this._select('bodyArt.face.style', 'Finish', A.CYBER_STYLES.map(s => [s.id, s.label])) + this._color('bodyArt.face.glow', 'Glow color', ['#38e6ff', '#ff3df0', '#ff9a3a'], true);
        // The cyber variants of the species features, here as well as in Body.
        html += `<div class="rr-c3d-subhead">${this._t('Cyber tail, wings, horns and ears')}</div>` + ['tail', 'wings', 'horns', 'ears'].map(key => this._bodyFeature(key)).join('');
        return html;
    };

    /** The tab's buttons; true when the button was one of them. */
    P._bodyArtAct = function(act, b) {
        const r = JSON.parse(JSON.stringify(this.recipe)), art = r.bodyArt = A.normalize(r.bodyArt), k = +b.dataset.id;
        const done = () => { this._replace(r); };
        if (act === 'art-preset') { const p = A.preset(b.dataset.id); if (p) { r.bodyArt = p; this.artLayer = 0; done(); } return true; }
        if (act === 'art-add') {
            const kind = b.dataset.id, first = M.MOTIFS.find(m => m.kind === kind && !m.hidden);
            art.layers.push(A.normalizeLayer({ kind, motif: first.id, region: DEFAULT_REGION[kind], side: A.REGION_BY_ID.get(DEFAULT_REGION[kind]).sided ? 'left' : 'center', style: A.STYLES[kind][0][0], seed: 1 + Math.floor(Math.random() * 999) }));
            this.artLayer = art.layers.length - 1; done(); return true;
        }
        if (act === 'art-select') { this.artLayer = k; this._renderPanel(); return true; }
        if (act === 'art-remove') { art.layers.splice(k, 1); this.artLayer = Math.max(0, k - 1); done(); return true; }
        if (act === 'art-up' && k > 0) { [art.layers[k - 1], art.layers[k]] = [art.layers[k], art.layers[k - 1]]; this.artLayer = k - 1; done(); return true; }
        if (act === 'art-down' && k < art.layers.length - 1) { [art.layers[k + 1], art.layers[k]] = [art.layers[k], art.layers[k + 1]]; this.artLayer = k + 1; done(); return true; }
        const l = art.layers[this.artLayer || 0];
        if (act === 'art-motif' && l) { l.motif = b.dataset.id; if (M.BY_ID.get(l.motif)?.text && !l.text) l.text = l.motif === 'barcode' ? '1977' : 'Fortune'; done(); return true; }
        if (act === 'art-vary' && l) { l.seed = 1 + Math.floor(Math.random() * 9998); done(); return true; }
        if (act === 'art-picture' && l) { this._chooseArtPicture(this.artLayer || 0); return true; }
        if (act === 'art-pierce') {
            const id = b.dataset.id, spot = A.PIERCING_SPOTS.find(s => s.id === id);
            if (art.piercings.some(p => p.spot === id)) art.piercings = art.piercings.filter(p => p.spot !== id);
            else art.piercings.push({ spot: id, side: spot.sided ? 'left' : 'center', metal: 'steel', style: spot.style });
            done(); return true;
        }
        if (act === 'art-pierce-remove') { art.piercings.splice(k, 1); done(); return true; }
        if (act === 'art-limb-add') {
            const free = A.LIMBS.find(([id]) => !art.limbs.some(x => A.limbChain(x.limb).some(c => A.limbChain(id).includes(c))));
            if (free) art.limbs.push(A.normalizeLimb({ limb: free[0], style: 'sleek' }));
            done(); return true;
        }
        if (act === 'art-limb-remove') { art.limbs.splice(k, 1); done(); return true; }
        if (act === 'art-cyber-style') { const i = +b.dataset.index; if (art.limbs[i]) { art.limbs[i].style = b.dataset.id; art.limbs[i].color = ''; art.limbs[i].color2 = ''; art.limbs[i].glow = ''; } done(); return true; }
        return false;
    };

    /** A project picture for a layer (img/pictures); the recipe keeps its name only. */
    P._chooseArtPicture = function(index) {
        const project = this._project(), assets = window.RRAssetFiles, picker = window.reactor?.databaseEditorUI;
        if (!project || !assets || !picker?.showImagePicker) return;
        const folder = require('path').join(project.path, 'img', 'pictures'), files = assets.listImageReferences(folder);
        if (!files.length) { RRDialog.alert(this._t('No pictures in img/pictures yet. Add one there to use it here.'), { title: this._t('Body art') }); return; }
        const current = this.recipe.bodyArt.layers[index];
        picker.showImagePicker(this._t('Choose a picture'), files, name => {
            if (!name || this._project()?.path !== project.path || !assets.findImage(folder, name)) return;
            const r = JSON.parse(JSON.stringify(this.recipe)), l = r.bodyArt.layers[index];
            if (!l) return;
            Object.assign(l, { motif: 'picture', picture: name });
            if (l.kind !== 'tattoo' && l.kind !== 'paint') l.kind = 'tattoo';
            this._artFailed?.delete(name);
            this._replace(r);
        }, name => assets.imageUrlFor(folder, name), current && current.picture || undefined, { selectButtonLabel: this._t('Use This Picture'), zIndex: 10500 });
    };

    /** The layers' project pictures decoded (at most 512 on a side), shared by the view and Save. */
    P._loadArtPictures = function() {
        const project = this._project(), assets = window.RRAssetFiles;
        if (!project || !assets) return Promise.resolve();
        if (this._artProject !== project.path) { this._artProject = project.path; this._artPictures = new Map(); this._artPending = new Map(); this._artFailed = new Set(); }
        const folder = require('path').join(project.path, 'img', 'pictures');
        for (const l of (this.recipe.bodyArt && this.recipe.bodyArt.layers) || []) {
            const name = l.motif === 'picture' && l.picture;
            if (!name || this._artPictures.has(name) || this._artPending.has(name) || this._artFailed.has(name)) continue;
            if (!assets.findImage(folder, name)) { this._artFailed.add(name); continue; }
            const pictures = this._artPictures, img = new Image();
            const ready = new Promise(resolve => {
                img.onload = () => {
                    this._artPending.delete(name);
                    try {
                        const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
                        const c = document.createElement('canvas'); c.width = w; c.height = h;
                        const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
                        pictures.set(name, { width: w, height: h, data: new Uint8Array(g.getImageData(0, 0, w, h).data.buffer) });
                        this._queueRebuild();
                    } catch (error) { this._artFailed.add(name); }
                    resolve();
                };
                img.onerror = () => { this._artPending.delete(name); this._artFailed.add(name); this._status(this._t('{name} could not be opened.', { name }), 'error'); resolve(); };
            });
            this._artPending.set(name, ready);
            try { img.src = assets.imageUrlFor(folder, name); } catch (error) { img.onerror(); }
        }
        return Promise.all(this._artPending.values());
    };

    /** A painted skin back from the painter worker: its picture, relief, glow and the art's finer charts. */
    P._unpackSkin = function(d) {
        const pic = q => (q ? { width: q.width, height: q.height, data: new Uint8Array(q.data), name: q.name } : undefined);
        const out = Object.assign(pic(d), { name: 'skin.png' });
        if (d.normal) out.normal = pic(d.normal);
        if (d.emissive) out.emissive = pic(d.emissive);
        if (d.detail) { out.detail = pic(d.detail); if (d.detail.normal) out.detail.normal = pic(d.detail.normal); if (d.detail.emissive) out.detail.emissive = pic(d.detail.emissive); out.detail.layout = d.detail.layout; }
        return out;
    };

    /** Thumbnails of looks and cyber styles on the character as it is. */
    P._artThumbRecipe = function(item) {
        const r = this.recipe, base = Object.assign({}, r, { outfit: [], props: [] });
        if (item.kind === 'artpreset') return { recipe: Object.assign(base, { bodyArt: A.preset(item.id) || {} }), frame: 'torso' };
        if (item.kind === 'cyberstyle') {
            const art = A.normalize(r.bodyArt), limb = art.limbs[0] || { limb: 'armL' };
            return { recipe: Object.assign(base, { bodyArt: { limbs: [Object.assign({}, limb, { style: item.id, color: '', color2: '', glow: '' })] } }), frame: 'body' };
        }
        return null;
    };
})();
