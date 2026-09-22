/**
 * LegacyImportDialog - File › Import Project…: an RPG Maker 2000/2003
 * project becomes a new RPG Reactor project. The dialog takes the source
 * folder (the one holding RPG_RT.ldb), where to create the new project
 * and its name, and the text encoding when the ini does not say; runs the
 * importer in a worker so the editor keeps painting while pictures and
 * audio copy; shows the importer's own log; and offers to open the result.
 * RPG Maker XP and VX Ace projects are recognised and declined for now.
 */
(function (root) {
    'use strict';

    const ENCODINGS = [['', 'Automatic'], ['1252', 'Windows-1252 (Western European)'], ['932', 'Shift_JIS (Japanese)'], ['949', 'EUC-KR (Korean)'], ['936', 'GBK (Simplified Chinese)'], ['950', 'Big5 (Traditional Chinese)'], ['1251', 'Windows-1251 (Cyrillic)'], ['1250', 'Windows-1250 (Central European)']];

    /** What kind of RPG Maker project a folder holds, by its marker file. */
    function detect(fs, path, folder) {
        if (!folder || !fs.existsSync(folder)) return null;
        const names = new Set(fs.readdirSync(folder).map(n => n.toLowerCase()));
        if (names.has('rpg_rt.ldb')) return '2003';
        if (Array.from(names).some(n => n.endsWith('.rxproj'))) return 'xp';
        if (Array.from(names).some(n => n.endsWith('.rvproj2'))) return 'ace';
        if (Array.from(names).some(n => n.endsWith('.rvproj'))) return 'vx';
        return null;
    }

    function appRootOf(path) {
        const candidates = [];
        try { candidates.push(process.cwd()); } catch (_) { /* browser */ }
        try { if (typeof process !== 'undefined' && process.mainModule) candidates.push(path.dirname(process.mainModule.filename)); } catch (_) { /* no main module */ }
        const fs = require('fs');
        for (const c of candidates) {
            if (fs.existsSync(path.join(c, 'build-scripts', 'legacy-import-worker.js'))) return c;
            if (fs.existsSync(path.join(c, 'editor', 'build-scripts', 'legacy-import-worker.js'))) return path.join(c, 'editor');
        }
        return candidates[0] || '.';
    }

    /**
     * Show the dialog. `openProject(destination)` is called when the user
     * chooses to open the imported project. Resolves when the dialog closes.
     */
    function show({ openProject } = {}) {
        const tt = text => (root.I18n ? root.I18n.tText(text) : text);
        if (typeof nw === 'undefined' || typeof require !== 'function') {
            alert(tt('Importing a project needs the desktop editor.'));
            return Promise.resolve(null);
        }
        const fs = require('fs'), path = require('path'), os = require('os');
        const appRoot = appRootOf(path);
        const previouslyFocused = document.activeElement;

        const overlay = document.createElement('div');
        overlay.id = 'rr-legacy-import-dialog';
        overlay.className = 'rr-modal-overlay';
        const modal = document.createElement('div');
        modal.className = 'rr-modal';
        modal.style.width = 'min(640px, 92vw)';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'rr-legacy-import-title');

        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const titleEl = document.createElement('div');
        titleEl.id = 'rr-legacy-import-title';
        titleEl.className = 'rr-modal-title';
        titleEl.textContent = tt('Import Project');
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'rr-modal-close';
        closeButton.setAttribute('aria-label', tt('Cancel'));
        closeButton.textContent = '×';
        header.append(titleEl, closeButton);

        const body = document.createElement('div');
        body.className = 'rr-modal-body';
        body.style.cssText = 'display:grid;grid-template-columns:max-content 1fr auto;column-gap:10px;row-gap:8px;align-items:center;';
        const label = (text, forId) => { const l = document.createElement('label'); l.setAttribute('for', forId); l.style.cssText = 'color:var(--color-text);font-size:13px;'; l.textContent = text; return l; };
        const input = (id, readOnly) => { const i = document.createElement('input'); i.type = 'text'; i.id = id; i.readOnly = !!readOnly; i.setAttribute('autocomplete', 'off'); i.setAttribute('spellcheck', 'false'); i.style.cssText = 'width:100%;box-sizing:border-box;padding:7px 10px;font-size:13px;color:var(--color-text);background:var(--color-bg-input, var(--color-bg-deep));border:1px solid var(--color-border);border-radius:var(--radius-sm, 4px);'; return i; };
        const button = (id, text, cls) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = cls || 'rr-btn-secondary'; b.textContent = text; return b; };
        const hint = (text) => { const d = document.createElement('div'); d.style.cssText = 'grid-column:2 / span 2;color:var(--color-text-muted);font-size:12px;margin-top:-4px;'; d.textContent = text; return d; };

        const sourceInput = input('rr-legacy-import-source', true);
        const sourceBrowse = button('rr-legacy-import-source-browse', tt('Browse…'));
        const parentInput = input('rr-legacy-import-parent', true);
        const parentBrowse = button('rr-legacy-import-parent-browse', tt('Browse…'));
        const nameInput = input('rr-legacy-import-name', false);
        const encodingSelect = document.createElement('select');
        encodingSelect.id = 'rr-legacy-import-encoding';
        encodingSelect.style.cssText = 'width:100%;box-sizing:border-box;padding:6px 8px;font-size:13px;color:var(--color-text);background:var(--color-bg-input, var(--color-bg-deep));border:1px solid var(--color-border);border-radius:var(--radius-sm, 4px);';
        for (const [value, text] of ENCODINGS) { const o = document.createElement('option'); o.value = value; o.textContent = value ? text : tt('Automatic'); encodingSelect.appendChild(o); }
        const languageSelect = document.createElement('select');
        languageSelect.id = 'rr-legacy-import-language';
        languageSelect.style.cssText = encodingSelect.style.cssText;
        const fillLanguages = (source) => {
            languageSelect.innerHTML = '';
            const original = document.createElement('option'); original.value = ''; original.textContent = tt('Original text'); languageSelect.appendChild(original);
            let names = [];
            try { names = require(path.join(appRoot, 'src', 'legacy', 'LegacyImporter.js')).languages(source); } catch (_) { names = []; }
            for (const n of names) { const o = document.createElement('option'); o.value = n; o.textContent = n; languageSelect.appendChild(o); }
            languageSelect.disabled = names.length === 0;
        };
        const spacer = () => document.createElement('div');

        body.append(label(tt('Source folder'), sourceInput.id), sourceInput, sourceBrowse, hint(tt('The folder that holds RPG_RT.ldb.')));
        body.append(label(tt('Create in'), parentInput.id), parentInput, parentBrowse);
        body.append(label(tt('Project name'), nameInput.id), nameInput, spacer());
        body.append(label(tt('Text encoding'), encodingSelect.id), encodingSelect, spacer(), hint(tt('Leave on Automatic unless names and messages come out garbled.')));
        body.append(label(tt('Language'), languageSelect.id), languageSelect, spacer(), hint(tt('A translation the game ships in its Language folder, baked into every text.')));
        fillLanguages('');

        const errorEl = document.createElement('div');
        errorEl.setAttribute('role', 'alert');
        errorEl.style.cssText = 'grid-column:1 / -1;color:var(--color-danger-bright, #e5484d);font-size:12px;min-height:1.2em;';
        const logEl = document.createElement('pre');
        logEl.id = 'rr-legacy-import-log';
        logEl.style.cssText = 'grid-column:1 / -1;margin:0;max-height:200px;overflow:auto;padding:8px 10px;font-size:12px;line-height:1.4;color:var(--color-text);background:var(--color-bg-deep);border:1px solid var(--color-border);border-radius:var(--radius-sm, 4px);white-space:pre-wrap;display:none;';
        body.append(errorEl, logEl);

        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        const cancelButton = button('rr-legacy-import-cancel', tt('Cancel'));
        const openButton = button('rr-legacy-import-open', tt('Open project'), 'rr-button-primary');
        openButton.style.display = 'none';
        const importButton = button('rr-legacy-import-run', tt('Import'), 'rr-button-primary');
        footer.append(cancelButton, openButton, importButton);
        modal.append(header, body, footer);
        overlay.appendChild(modal);

        parentInput.value = (() => { try { return localStorage.getItem('rrLegacyImportParent') || os.homedir(); } catch (_) { return os.homedir(); } })();

        return new Promise(resolve => {
            let settled = false, worker = null, destination = null;
            const finish = value => {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', handleKeyDown, true);
                if (worker) { try { worker.terminate(); } catch (_) { /* gone */ } }
                overlay.remove();
                if (previouslyFocused && previouslyFocused.isConnected !== false && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
                resolve(value);
            };
            const browse = (target, onPick) => {
                const chooser = document.createElement('input');
                chooser.type = 'file';
                chooser.setAttribute('nwdirectory', '');
                if (target.value && fs.existsSync(target.value)) chooser.setAttribute('nwworkingdir', target.value);
                chooser.addEventListener('change', () => { const picked = chooser.files?.[0]?.path || chooser.value; if (picked) { target.value = picked; errorEl.textContent = ''; if (onPick) onPick(picked); } });
                chooser.click();
            };
            sourceBrowse.addEventListener('click', () => browse(sourceInput, picked => {
                const kind = detect(fs, path, picked);
                if (!nameInput.value.trim()) nameInput.value = path.basename(picked).replace(/[\\/:*?"<>|]/g, '_') + ' (Reactor)';
                fillLanguages(picked);
                if (kind === 'xp' || kind === 'ace' || kind === 'vx') errorEl.textContent = tt('RPG Maker XP and VX Ace projects are not supported yet.');
                else if (!kind) errorEl.textContent = tt('Not an RPG Maker 2000/2003 project: no RPG_RT.ldb here.');
            }));
            parentBrowse.addEventListener('click', () => browse(parentInput, picked => { try { localStorage.setItem('rrLegacyImportParent', picked); } catch (_) { /* private mode */ } }));
            const log = (message) => { logEl.style.display = 'block'; logEl.textContent += message + '\n'; logEl.scrollTop = logEl.scrollHeight; };
            const start = () => {
                const source = sourceInput.value.trim(), parent = parentInput.value.trim(), name = nameInput.value.trim();
                const kind = detect(fs, path, source);
                if (!source || !kind) { errorEl.textContent = tt('Not an RPG Maker 2000/2003 project: no RPG_RT.ldb here.'); return; }
                if (kind !== '2003') { errorEl.textContent = tt('RPG Maker XP and VX Ace projects are not supported yet.'); return; }
                if (!parent || !fs.existsSync(parent)) { errorEl.textContent = tt('Choose a folder to create the project in.'); return; }
                if (!name || /[\\/:*?"<>|\0-\x1f]/.test(name) || /^\.|[. ]$/.test(name)) { errorEl.textContent = tt('Project name must be a safe single folder name.'); return; }
                destination = path.join(parent, name);
                if (fs.existsSync(destination) && fs.readdirSync(destination).length) { errorEl.textContent = tt('That folder already exists and is not empty.'); return; }
                errorEl.textContent = '';
                logEl.textContent = '';
                for (const el of [sourceBrowse, parentBrowse, nameInput, encodingSelect, languageSelect, importButton]) el.disabled = true;
                importButton.textContent = tt('Importing…');
                let workerPath = path.join(appRoot, 'build-scripts', 'legacy-import-worker.js');
                try {
                    const { Worker } = require('worker_threads');
                    worker = new Worker(workerPath, { workerData: { source, destination, options: { encoding: encodingSelect.value || undefined, language: languageSelect.value || undefined } } });
                    worker.on('message', msg => {
                        if (msg.type === 'log') log(msg.message);
                        else if (msg.type === 'done') {
                            worker = null;
                            importButton.style.display = 'none';
                            if (msg.success) {
                                cancelButton.textContent = tt('Close');
                                openButton.style.display = '';
                                openButton.focus();
                            } else {
                                errorEl.textContent = `${tt('Import failed:')} ${msg.error}`;
                                for (const el of [sourceBrowse, parentBrowse, nameInput, encodingSelect, importButton]) el.disabled = false;
                                importButton.style.display = '';
                                importButton.textContent = tt('Import');
                            }
                        }
                    });
                    worker.on('error', err => { errorEl.textContent = `${tt('Import failed:')} ${err.message || err}`; importButton.disabled = false; importButton.textContent = tt('Import'); worker = null; });
                } catch (error) {
                    errorEl.textContent = `${tt('Import failed:')} ${error.message || error}`;
                    importButton.disabled = false; importButton.textContent = tt('Import');
                }
            };
            const handleKeyDown = event => {
                if (event.key === 'Escape') { event.preventDefault(); finish(null); }
                else if (event.key === 'Enter' && event.target === nameInput) { event.preventDefault(); start(); }
            };
            nameInput.addEventListener('input', () => { errorEl.textContent = ''; });
            closeButton.addEventListener('click', () => finish(null));
            cancelButton.addEventListener('click', () => finish(null));
            importButton.addEventListener('click', start);
            openButton.addEventListener('click', () => { const d = destination; finish(d); if (openProject) openProject(d); });
            document.addEventListener('keydown', handleKeyDown, true);
            document.body.appendChild(overlay);
            root.RRKeyboardNavigation?.modal(overlay, { container: () => modal });
            sourceBrowse.focus();
        });
    }

    const api = { show, detect, ENCODINGS };
    root.RRLegacyImportDialog = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
