/**
 * ForgeWorkshop - the Forge's page for the Steam Workshop: share the project itself, or a design kept with Save
 * Design (a character from the 3D Character Builder, a prop from the Prop Builder); add the designs this account
 * subscribes to into the project, where they open from the builder's Open like any other design (in the "Workshop"
 * group), and open a subscribed project as a new project of one's own.
 *
 * Steam itself is RRSteam (src/steam/SteamBridge.js); what an item holds on disk is RRWorkshopItems
 * (src/steam/WorkshopItems.js) for a design and RRWorkshopProjects (src/steam/WorkshopProjects.js) for a project.
 * Without Steam the page still lists what can be shared, and says what it needs.
 */
class ForgeWorkshop {
    constructor() {
        this.projectController = null;
        this.projectPath = null;
        this.root = null;
        this.tab = 'share';
        this.selected = null;
        this.busy = false;
        this._ownership = null;
    }

    _t(text, params) {
        const tr = window.I18n ? window.I18n.tText(text) : text;
        return params ? tr.replace(/\{(\w+)\}/g, (token, key) => Object.hasOwn(params, key) ? String(params[key]) : token) : tr;
    }

    _esc(value) { return rrEscapeHtml(value); }

    renderInto(containerEl, projectController) {
        this.projectController = projectController;
        this.root = containerEl;
        const project = projectController?.getCurrentProject?.() || projectController?.currentProject;
        if (this.projectPath !== (project?.path || null)) this.selected = null;
        this.projectPath = project?.path || null;
        this._ownership = this.projectPath && projectController.captureProjectOwnership ? projectController.captureProjectOwnership() : null;
        if (!this.projectPath) {
            this.root.innerHTML = `<div class="rr-workshop-empty">${this._esc(this._t('Open a project to use Forge tools.'))}</div>`;
            return;
        }
        this._render();
    }

    detach() {}

    /** An upload in progress would be cut off by leaving the page. */
    holdsWork() { return this.busy; }

    _steamNote() {
        const steam = window.RRSteam;
        if (steam && steam.available()) {
            const name = steam.playerName();
            return { ok: true, text: name ? this._t('Signed in to Steam as {name}.', { name }) : this._t('Connected to Steam.') };
        }
        const reason = steam ? steam.reason() : 'not-desktop';
        if (reason === 'not-desktop') return { ok: false, text: this._t('The Steam Workshop needs the desktop editor.') };
        if (reason === 'init-failed') return { ok: false, text: this._t('RPG Reactor could not connect to Steam. Make sure Steam is running and you are signed in, then open RPG Reactor from Steam again.') };
        return { ok: false, text: this._t('Open RPG Reactor from Steam to share on the Steam Workshop and add what others have shared.') };
    }

    _render() {
        const note = this._steamNote();
        this.root.innerHTML = `
            <div class="rr-workshop">
                <div class="rr-workshop-status${note.ok ? ' is-ok' : ''}">${this._esc(note.text)}</div>
                <div class="rr-workshop-bar rr-plugin-tabs" role="tablist">
                    <button type="button" role="tab" aria-selected="${this.tab === 'share'}" class="rr-plugin-tab rr-workshop-tab${this.tab === 'share' ? ' is-active' : ''}" data-tab="share">${this._esc(this._t('Share'))}</button>
                    <button type="button" role="tab" aria-selected="${this.tab === 'subscribed'}" class="rr-plugin-tab rr-workshop-tab${this.tab === 'subscribed' ? ' is-active' : ''}" data-tab="subscribed">${this._esc(this._t('From the Workshop'))}</button>
                    <span class="rr-workshop-spacer"></span>
                    <button type="button" class="rr-button" data-act="browse">${this._esc(this._t('Browse the Workshop'))}</button>
                </div>
                <div class="rr-workshop-body"></div>
                <div class="rr-workshop-line" role="status"></div>
            </div>`;
        this.root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
            if (this.busy || this.tab === b.dataset.tab) return;
            this.tab = b.dataset.tab;
            this._render();
        }));
        this.root.querySelector('[data-act="browse"]').addEventListener('click', () => window.RRSteam && window.RRSteam.openWorkshop());
        if (this.tab === 'share') this._renderShare(); else this._renderSubscribed();
    }

    _line(text, kind = '') {
        const el = this.root && this.root.querySelector('.rr-workshop-line');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'rr-workshop-line' + (kind ? ' is-' + kind : '');
    }

    _kindLabel(kind) { return kind === 'project' ? this._t('Project') : kind === 'character3d' ? this._t('Character') : this._t('Prop'); }

    /** The project as a thing to share: the first card. Its name is the game's title. */
    _projectEntry() {
        const title = this.projectController?.databaseManager?.data?.system?.gameTitle;
        return { kind: 'project', group: '', name: String(title || '').trim() || require('path').basename(this.projectPath), file: '', picture: this._titlePicture() };
    }

    /** The project's title screen picture, if it has one: the project's card and its Workshop preview. */
    _titlePicture() {
        try {
            const path = require('path'), fs = require('fs');
            const system = JSON.parse(fs.readFileSync(path.join(this.projectPath, 'data', 'System.json'), 'utf8'));
            const name = String(system.title1Name || '');
            if (!name || /[\\/]|\.\./.test(name)) return '';
            for (const ext of ['.png', '.jpg', '.webp']) {
                const file = path.join(this.projectPath, 'img', 'titles1', name + ext);
                if (fs.existsSync(file)) return file;
            }
        } catch (_) {}
        return '';
    }

    /** A 640 x 360 JPEG of `file` at `out` (a Workshop preview must be under 1 MB). Answers `out`, or '' when it can't be drawn. */
    async _preview(file, out) {
        if (!file) return '';
        try {
            const image = new Image();
            image.src = RRForgeDesigns.picture(file);
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = 640; canvas.height = 360;
            const scale = Math.max(640 / image.naturalWidth, 360 / image.naturalHeight);
            const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
            canvas.getContext('2d').drawImage(image, (640 - w) / 2, (360 - h) / 2, w, h);
            const data = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
            require('fs').writeFileSync(out, Buffer.from(data, 'base64'));
            return out;
        } catch (error) {
            console.warn('[ForgeWorkshop] preview', error);
            return '';
        }
    }

    // ── Share ────────────────────────────────────────────────────────────────

    _renderShare() {
        const body = this.root.querySelector('.rr-workshop-body');
        // The project first, then the designs Save Design kept.
        const designs = [this._projectEntry()].concat(RRWorkshopItems.listDesigns(this.projectPath));
        const published = RRWorkshopItems.readPublished(this.projectPath).items;
        const key = this.selected && RRWorkshopItems.designKey(this.selected);
        if (key && !designs.some(d => RRWorkshopItems.designKey(d) === key)) this.selected = null;
        body.innerHTML = `<div class="rr-workshop-split"><div class="rr-workshop-grid"></div><div class="rr-workshop-form"></div></div>`;
        const grid = body.querySelector('.rr-workshop-grid');
        designs.forEach((design, index) => {
            const shared = published[RRWorkshopItems.designKey(design)];
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'rr-workshop-card' + (key === RRWorkshopItems.designKey(design) ? ' is-active' : '');
            card.dataset.index = String(index);
            const src = design.picture ? RRForgeDesigns.picture(design.picture) : '';
            card.innerHTML = `${src ? `<img src="${src}" alt="">` : '<span class="rr-workshop-nopic">?</span>'}
                <span class="rr-workshop-card-name"></span><span class="rr-workshop-card-sub"></span>${shared ? `<span class="rr-workshop-badge">${this._esc(this._t('Shared'))}</span>` : ''}`;
            card.querySelector('.rr-workshop-card-name').textContent = design.name;
            card.querySelector('.rr-workshop-card-sub').textContent = this._kindLabel(design.kind) + (design.group ? ' · ' + design.group : '');
            card.addEventListener('click', () => {
                if (this.busy) return;
                this.selected = design;
                grid.querySelectorAll('.rr-workshop-card').forEach(c => c.classList.toggle('is-active', c === card));
                this._renderForm(body.querySelector('.rr-workshop-form'), design, published[RRWorkshopItems.designKey(design)]);
            });
            grid.appendChild(card);
        });
        const form = body.querySelector('.rr-workshop-form');
        if (this.selected) this._renderForm(form, this.selected, published[key]);
        else form.innerHTML = `<div class="rr-workshop-hint">${this._esc(this._t('Pick the project or a design to share it.'))}</div>`
            + (designs.length === 1 ? `<div class="rr-workshop-hint">${this._esc(this._t('Save Design in the Character Builder or the Prop Builder keeps a design here to share too.'))}</div>` : '');
    }

    _renderForm(form, design, shared) {
        const steam = window.RRSteam, online = !!(steam && steam.available());
        const vis = [['public', this._t('Public')], ['friends', this._t('Friends Only')], ['unlisted', this._t('Unlisted')], ['private', this._t('Private')]];
        form.innerHTML = `
            <label class="rr-workshop-field"><span>${this._esc(this._t('Title'))}</span><input class="rr-input" data-f="title" maxlength="128"></label>
            <label class="rr-workshop-field"><span>${this._esc(this._t('Description'))}</span><textarea class="rr-input" data-f="description" rows="5" maxlength="8000"></textarea></label>
            <label class="rr-workshop-field"><span>${this._esc(this._t('Who can see it'))}</span><select class="rr-select" data-f="visibility">${vis.map(([v, label]) => `<option value="${v}">${this._esc(label)}</option>`).join('')}</select></label>
            ${shared ? `<label class="rr-workshop-field"><span>${this._esc(this._t('What changed'))}</span><input class="rr-input" data-f="changeNote" maxlength="400"></label>` : ''}
            ${design.kind === 'project' ? `<p class="rr-workshop-hint">${this._esc(this._t('Shares the project\'s maps, database, pictures, audio, models and plugins. Saves and the engine files stay here; RPG Reactor adds its own engine when someone opens it.'))}</p>` : ''}
            <p class="rr-workshop-terms">${this._esc(this._t(design.kind === 'project' ? 'By sharing this project you agree to the Steam Workshop terms.' : 'By sharing this design you agree to the Steam Workshop terms.'))} <button type="button" class="rr-workshop-link" data-act="terms">${this._esc(this._t('Steam Workshop terms'))}</button></p>
            <div class="rr-workshop-actions">
                <button type="button" class="rr-button rr-button-primary" data-act="publish"${online ? '' : ' disabled'}>${this._esc(shared ? this._t('Update on the Workshop') : this._t('Share on the Workshop'))}</button>
                ${shared ? `<button type="button" class="rr-button" data-act="view">${this._esc(this._t('View on Steam'))}</button>` : ''}
            </div>`;
        form.querySelector('[data-f="title"]').value = (shared && shared.title) || design.name;
        form.querySelector('[data-f="description"]').value = (shared && shared.description) || '';
        form.querySelector('[data-f="visibility"]').value = (shared && shared.visibility) || 'public';
        form.querySelector('[data-act="terms"]').addEventListener('click', () => steam && steam.openAgreement());
        const view = form.querySelector('[data-act="view"]');
        if (view) view.addEventListener('click', () => steam && steam.openItem(shared.id));
        form.querySelector('[data-act="publish"]').addEventListener('click', () => this._publish(design, shared, form));
    }

    async _publish(design, shared, form) {
        if (this.busy) return;
        const steam = window.RRSteam;
        if (!steam || !steam.available()) return;
        const value = f => { const el = form.querySelector(`[data-f="${f}"]`); return el ? el.value.trim() : ''; };
        const title = value('title') || design.name, description = value('description'), visibility = value('visibility') || 'public';
        const path = require('path'), fs = require('fs');
        let staged = null;
        this.busy = true;
        form.querySelectorAll('button, input, textarea, select').forEach(el => { el.disabled = true; });
        try {
            if (this._ownership) this.projectController.verifyProjectOwnership(this._ownership, { requireWrite: true });
            const stageRoot = path.join(typeof nw !== 'undefined' && nw.App && nw.App.dataPath ? nw.App.dataPath : require('os').tmpdir(), 'workshop-upload');
            if (design.kind === 'project') {
                this._line(this._t('Preparing {name}...', { name: design.name }));
                await new Promise(resolve => setTimeout(resolve, 30));
                staged = RRWorkshopProjects.stage(stageRoot, this.projectPath, { title });
                staged.previewPath = await this._preview(design.picture, path.join(staged.folder, 'preview.jpg'));
            } else {
                staged = RRWorkshopItems.stage(stageRoot, this.projectPath, design);
            }
            const entry = { id: shared ? shared.id : '', title, description, visibility };
            this._line(this._t('Uploading {name}...', { name: design.name }));
            const result = await steam.publish({
                itemId: entry.id || null, title, description, visibility,
                changeNote: value('changeNote'), contentPath: staged.contentPath, previewPath: staged.previewPath,
                tags: [design.kind === 'project' ? RRWorkshopProjects.TAG : RRWorkshopItems.KINDS[design.kind].tag]
            }, {
                // Noted at once: a failed upload is tried again as an update of this item, not as a new one.
                onCreated: id => { entry.id = id; RRWorkshopItems.writePublished(this.projectPath, design, Object.assign({}, entry, { at: new Date().toISOString() })); },
                onProgress: p => { if (p.total > 0) this._line(this._t('Uploading {name}... {percent}%', { name: design.name, percent: Math.round(p.done / p.total * 100) })); }
            });
            entry.id = result.itemId;
            RRWorkshopItems.writePublished(this.projectPath, design, Object.assign({}, entry, { at: new Date().toISOString() }));
            window.RRAchievements?.earn('WORKSHOP_SHARE');
            this._line(this._t('{name} is on the Steam Workshop.', { name: title }), 'ok');
            if (result.needsAgreement && typeof RRDialog !== 'undefined') {
                const go = await RRDialog.confirm(this._t('The design is uploaded, but Steam keeps it hidden until you accept the Steam Workshop terms.'),
                    { title: this._t('Steam Workshop'), ok: this._t('Steam Workshop terms') });
                if (go) steam.openAgreement();
            }
        } catch (error) {
            console.error('[ForgeWorkshop] publish', error);
            this._line(this._t('{name} could not be shared: {error}', { name: design.name, error: (error && error.message) || String(error) }), 'error');
        } finally {
            if (staged) try { fs.rmSync(staged.folder, { recursive: true, force: true }); } catch (_) {}
            this.busy = false;
            if (this.root && this.root.isConnected && this.tab === 'share') {
                const line = this.root.querySelector('.rr-workshop-line'), keep = line ? [line.textContent, line.className] : null;
                this._renderShare();
                if (keep) { line.textContent = keep[0]; line.className = keep[1]; }
            }
        }
    }

    // ── From the Workshop ────────────────────────────────────────────────────

    async _renderSubscribed() {
        const body = this.root.querySelector('.rr-workshop-body');
        const steam = window.RRSteam;
        if (!steam || !steam.available()) {
            body.innerHTML = `<div class="rr-workshop-empty">${this._esc(this._t('Designs you subscribe to on the Steam Workshop show here when RPG Reactor is opened from Steam.'))}</div>`;
            return;
        }
        body.innerHTML = `<div class="rr-workshop-subbar"><button type="button" class="rr-button" data-act="refresh">${this._esc(this._t('Refresh'))}</button></div><div class="rr-workshop-list"></div>`;
        body.querySelector('[data-act="refresh"]').addEventListener('click', () => this._renderSubscribed());
        const list = body.querySelector('.rr-workshop-list');
        let items = [];
        try { items = steam.subscribed(); } catch (error) { this._line(String(error && error.message || error), 'error'); }
        if (!items.length) {
            list.innerHTML = `<div class="rr-workshop-empty">${this._esc(this._t('You have not subscribed to anything yet. Browse the Workshop and press Subscribe on the designs and projects you want.'))}</div>`;
            return;
        }
        let info = {};
        try { info = await steam.details(items.map(i => i.id)); } catch (error) { console.warn('[ForgeWorkshop] details', error); }
        if (!list.isConnected) return;
        for (const item of items) list.appendChild(this._subscribedRow(item, info[item.id] || {}));
    }

    _subscribedRow(item, info) {
        const steam = window.RRSteam;
        const row = document.createElement('div');
        row.className = 'rr-workshop-row';
        // A shared project, else a design.
        const project = item.installed ? RRWorkshopProjects.readItem(item.folder) : null;
        const read = !item.installed ? null : project || RRWorkshopItems.readItem(item.folder);
        const ok = read && !(read instanceof Error);
        let src = ok && read.preview ? RRForgeDesigns.picture(read.preview) : '';
        if (!src && /^https:\/\//.test(info.previewUrl || '')) src = info.previewUrl;
        const status = !item.installed ? (item.downloading ? this._t('Downloading...') : this._t('Not downloaded yet.'))
            : ok ? this._kindLabel(read.kind) : this._readError(read);
        row.innerHTML = `${src ? `<img alt="">` : '<span class="rr-workshop-nopic">?</span>'}
            <div class="rr-workshop-row-text"><div class="rr-workshop-row-title"></div><div class="rr-workshop-row-sub"></div></div>
            <div class="rr-workshop-actions">
                ${ok && read.kind === 'project' ? `<button type="button" class="rr-button rr-button-primary" data-act="open">${this._esc(this._t('Open as New Project'))}</button>` : ''}
                ${ok && read.kind !== 'project' ? `<button type="button" class="rr-button rr-button-primary" data-act="add">${this._esc(this._t('Add to Project'))}</button>` : ''}
                ${!item.installed ? `<button type="button" class="rr-button" data-act="download">${this._esc(this._t('Download'))}</button>` : ''}
                <button type="button" class="rr-button" data-act="view">${this._esc(this._t('View on Steam'))}</button>
                <button type="button" class="rr-button" data-act="unsubscribe">${this._esc(this._t('Unsubscribe'))}</button>
            </div>`;
        if (src) row.querySelector('img').src = src;
        row.querySelector('.rr-workshop-row-title').textContent = info.title || (ok ? read.name : item.id);
        row.querySelector('.rr-workshop-row-sub').textContent = status;
        const on = (act, fn) => { const b = row.querySelector(`[data-act="${act}"]`); if (b) b.addEventListener('click', fn); };
        on('view', () => steam.openItem(item.id));
        on('download', () => { steam.download(item.id); this._line(this._t('Steam is downloading it. Press Refresh in a moment.')); });
        on('unsubscribe', async () => {
            try { await steam.unsubscribe(item.id); row.remove(); } catch (error) { this._line(String(error && error.message || error), 'error'); }
        });
        on('add', () => this._add(read));
        on('open', () => this._openProject(read));
        return row;
    }

    /** Why a subscribed item can't be used, in the editor's language (RRWorkshopItems.readItem answers in English). */
    _readError(error) {
        if (/project needs a newer/.test(error.message)) return this._t('This project needs a newer RPG Reactor.');
        if (/project/.test(error.message)) return this._t('This Workshop item is not a project RPG Reactor can open.');
        return /newer/.test(error.message) ? this._t('This design needs a newer RPG Reactor.') : this._t('This Workshop item is not a Forge design.');
    }

    /**
     * A subscribed project, copied into a folder of the user's choosing as a project of their own (its plugins
     * turned off), given the editor's engine, and opened.
     */
    async _openProject(item) {
        if (this.busy) return;
        const pc = this.projectController, pm = pc?.projectManager;
        if (!pc || !pm || typeof RRFolderPicker === 'undefined') return;
        const title = this._t('Open as New Project');
        const go = await RRDialog.confirm(this._t('{name} is someone else\'s project. Its plugins come in turned off: turn on the ones you trust in the Plugin Manager. Its events can run scripts when you playtest, as in any game you download.', { name: item.name }),
            { title: this._t('Open as New Project'), ok: this._t('Choose a Folder') });
        if (!go || !await pc.confirmUnsavedChanges()) return;
        const base = await RRFolderPicker.pick({ title, startIn: require('os').homedir() });
        if (!base) return;
        const path = require('path'), fs = require('fs');
        let name = item.name, destination = path.join(base, name);
        for (let n = 2; fs.existsSync(destination); n++) destination = path.join(base, name = `${item.name} ${n}`);
        this.busy = true;
        this._line(this._t('Copying {name}...', { name }));
        try {
            await new Promise(resolve => setTimeout(resolve, 30));
            RRWorkshopProjects.copyInto(item, destination);
            if (!fs.existsSync(path.join(destination, 'project.rpgreactor')) && !fs.existsSync(path.join(destination, 'game.rmmzproject')) && !fs.existsSync(path.join(destination, 'Game.rpgproject'))) {
                (window.RRWriteFileAtomicSync || ((io, file, text) => io.writeFileSync(file, text)))(fs, path.join(destination, 'project.rpgreactor'), JSON.stringify({ name, engine: 'RPG Reactor' }, null, 2) + '\n');
            }
            fs.writeFileSync(path.join(destination, 'index.html'), pm.getStarterIndexHtml(name, { mvCompat: item.mvCompat }));
            const installed = await pm.installReactorRuntime(destination, name);
            if (!installed.ok) throw new Error(installed.error);
            this.busy = false;
            await pc.openProjectAtPath(destination);
        } catch (error) {
            console.error('[ForgeWorkshop] open project', error);
            this._line(this._t('{name} could not be opened: {error}', { name: item.name, error: (error && error.message) || String(error) }), 'error');
        } finally {
            this.busy = false;
        }
    }

    _add(item) {
        try {
            if (this._ownership) this.projectController.verifyProjectOwnership(this._ownership, { requireWrite: true });
            const added = RRWorkshopItems.importItem(this.projectPath, item);
            window.RRAchievements?.earn('WORKSHOP_ADD');
            const builder = window.I18n ? window.I18n.t(added.kind === 'character3d' ? 'menu.character3dBuilder' : 'menu.propBuilder') : added.kind;
            this._line(this._t('{name} is in the project. Open it from Open in the {builder}, in the Workshop group.', { name: added.name, builder }), 'ok');
        } catch (error) {
            console.error('[ForgeWorkshop] add', error);
            this._line(this._t('{name} could not be added: {error}', { name: item.name, error: (error && error.message) || String(error) }), 'error');
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = ForgeWorkshop;
