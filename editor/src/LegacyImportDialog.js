/**
 * LegacyImportDialog - File › Import Project…: an RPG Maker 2000/2003
 * project becomes a new RPG Reactor project. The dialog takes the source
 * folder (the one holding RPG_RT.ldb), where to create the new project
 * and its name, and the text encoding when the ini does not say; runs the
 * importer in a worker so the editor keeps painting while pictures and
 * audio copy; shows the importer's own log; and offers to open the result.
 * The folder is identified as soon as it is picked (2000, 2003, XP, VX, VX
 * Ace, MV, MZ or a Reactor project, with its title and map count); only
 * 2000 and 2003 import for now. The import runs with a progress bar and a
 * console of the importer's stages, warnings and summary.
 */
(function (root) {
    'use strict';

    const ENCODINGS = [['', 'Automatic'], ['1252', 'Windows-1252 (Western European)'], ['932', 'Shift_JIS (Japanese)'], ['949', 'EUC-KR (Korean)'], ['936', 'GBK (Simplified Chinese)'], ['950', 'Big5 (Traditional Chinese)'], ['1251', 'Windows-1251 (Cyrillic)'], ['1250', 'Windows-1250 (Central European)']];

    /** The importer's probe, when the module can be loaded: engine, title, maps, languages. */
    function probeOf(path, appRoot, folder) {
        try { return require(path.join(appRoot, 'src', 'legacy', 'LegacyImporter.js')).probe(folder); } catch (_) { return null; }
    }

    /** The kinds of game the importer converts. */
    const IMPORTABLE = new Set(['2000', '2003', 'xp', 'vx', 'ace']);

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

    /** Whether an editor has the project in `folder` open: its lock file names a running process. */
    function projectOpenAt(fs, path, folder) {
        const open = root.reactor?.projectController?.currentProject?.path;
        if (open && path.resolve(open) === path.resolve(folder)) return true;
        let lock;
        try { lock = JSON.parse(fs.readFileSync(path.join(folder, '.rpgreactor.lock'), 'utf8')); } catch (_) { return false; }
        const pid = lock && lock.pid;
        if (!pid) return false;
        try { process.kill(pid, 0); } catch (error) { if (error?.code !== 'EPERM') return false; }
        // A lock written before this boot belongs to nobody, whoever holds its pid now (ProjectController.projectLockOwnerLives).
        try {
            const bootedAt = Date.now() - require('os').uptime() * 1000, openedAt = Date.parse(lock.openedAt);
            if (Number.isFinite(openedAt) && Number.isFinite(bootedAt) && openedAt < bootedAt - 10000) return false;
        } catch (_) { /* no uptime to read: the pid's word stands */ }
        return true;
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
            return RRDialog.alert(tt('Importing a project needs the desktop editor.'), { title: tt('Import Project') }).then(() => null);
        }
        const fs = require('fs'), path = require('path'), os = require('os');
        const appRoot = appRootOf(path);
        const previouslyFocused = document.activeElement;

        const overlay = document.createElement('div');
        overlay.id = 'rr-legacy-import-dialog';
        overlay.className = 'rr-modal-overlay';
        const modal = document.createElement('div');
        modal.className = 'rr-modal';
        modal.style.width = 'min(720px, 94vw)';
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
        body.className = 'rr-modal-body rr-accent-scrollbar';
        body.style.cssText = 'display:grid;grid-template-columns:max-content 1fr auto;column-gap:10px;row-gap:8px;align-items:center;';
        const label = (text, forId) => { const l = document.createElement('label'); l.setAttribute('for', forId); l.style.cssText = 'color:var(--color-text);font-size:13px;'; l.textContent = text; return l; };
        const input = (id, readOnly) => { const i = document.createElement('input'); i.type = 'text'; i.id = id; i.readOnly = !!readOnly; i.setAttribute('autocomplete', 'off'); i.setAttribute('spellcheck', 'false'); i.style.cssText = 'width:100%;box-sizing:border-box;padding:7px 10px;font-size:13px;color:var(--color-text);background:var(--color-bg-input, var(--color-bg-deep));border:1px solid var(--color-border);border-radius:var(--radius-sm, 4px);'; return i; };
        const button = (id, text, cls) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = cls || 'rr-btn-secondary'; b.textContent = text; return b; };
        // A button's text is re-applied by the i18n pass from its English source, so the source moves with it.
        const setLabel = (el, english) => { el.setAttribute('data-i18n-text-source', english); el.textContent = tt(english); };
        const hint = (text) => { const d = document.createElement('div'); d.style.cssText = 'grid-column:2 / span 2;color:var(--color-text-muted);font-size:12px;margin-top:-4px;'; d.textContent = text; return d; };

        const sourceInput = input('rr-legacy-import-source', true);
        const sourceBrowse = button('rr-legacy-import-source-browse', tt('Browse…'));
        const parentInput = input('rr-legacy-import-parent', true);
        const parentBrowse = button('rr-legacy-import-parent-browse', tt('Browse…'));
        const nameInput = input('rr-legacy-import-name', false);
        const rtpInput = input('rr-legacy-import-rtp', true);
        const rtpBrowse = button('rr-legacy-import-rtp-browse', tt('Browse…'));
        // One Browse: a folder and a file need different system dialogs, so it asks which.
        rtpBrowse.setAttribute('aria-haspopup', 'menu');
        const rtpButtons = rtpBrowse;
        // The field shows the RTP this game will use: found afresh for each game picked, or the author's choice.
        // Nothing is kept between imports; a folder chosen here is also looked in for other games until the dialog closes.
        try { localStorage.removeItem('rrLegacyImportRtp'); localStorage.removeItem('rrLegacyImportRtps'); } catch (_) { /* private mode */ }
        let chosenRtps = [];
        const knownRtps = () => chosenRtps;
        const rememberRtp = (folder, keep) => { chosenRtps = [...(keep ? [folder] : []), ...chosenRtps.filter(f => f !== folder)]; };
        // 'auto': the best RTP found for the game; 'chosen': the author's pick; 'none': cleared, import without one.
        let rtpMode = 'auto';
        const encodingSelect = document.createElement('select');
        encodingSelect.id = 'rr-legacy-import-encoding';
        encodingSelect.style.cssText = 'width:100%;box-sizing:border-box;padding:6px 8px;font-size:13px;color:var(--color-text);background:var(--color-bg-input, var(--color-bg-deep));border:1px solid var(--color-border);border-radius:var(--radius-sm, 4px);';
        for (const [value, text] of ENCODINGS) { const o = document.createElement('option'); o.value = value; o.textContent = tt(value ? text : 'Automatic'); encodingSelect.appendChild(o); }
        const languageSelect = document.createElement('select');
        languageSelect.id = 'rr-legacy-import-language';
        languageSelect.style.cssText = encodingSelect.style.cssText;
        const fillLanguages = (names) => {
            languageSelect.innerHTML = '';
            const original = document.createElement('option'); original.value = ''; original.textContent = tt('Original text'); languageSelect.appendChild(original);
            names = Array.isArray(names) ? names : [];
            for (const n of names) { const o = document.createElement('option'); o.value = n; o.textContent = n; languageSelect.appendChild(o); }
            languageSelect.disabled = names.length === 0;
        };
        const spacer = () => document.createElement('div');

        const detectedEl = document.createElement('div');
        detectedEl.id = 'rr-legacy-import-detected';
        detectedEl.setAttribute('aria-live', 'polite');
        detectedEl.style.cssText = 'grid-column:2 / span 2;display:flex;align-items:center;gap:8px;min-height:24px;font-size:13px;color:var(--color-text-muted);';
        detectedEl.textContent = '—';
        body.append(label(tt('Source folder'), sourceInput.id), sourceInput, sourceBrowse, hint(tt('The game\'s folder: RPG_RT.ldb for 2000/2003, a Data folder or game archive for XP, VX and VX Ace.')));
        body.append(label(tt('Detected'), detectedEl.id), detectedEl);
        body.append(label(tt('Create in'), parentInput.id), parentInput, parentBrowse);
        body.append(label(tt('Project name'), nameInput.id), nameInput, spacer());
        body.append(label(tt('Text encoding'), encodingSelect.id), encodingSelect, spacer(), hint(tt('Leave on Automatic unless names and messages come out garbled.')));
        body.append(label(tt('Language'), languageSelect.id), languageSelect, spacer(), hint(tt('A translation the game ships in its Language folder, baked into every text.')));
        rtpInput.placeholder = tt('Drop an RTP folder, installer or archive here');
        body.append(label(tt('RTP folder'), rtpInput.id), rtpInput, rtpButtons, hint(tt('For 2000/2003 games that use RPG Maker\'s standard files: a folder, an RTP installer (.exe) or an archive (.zip, .rar). One already on this computer is found without it.')));
        // Shown when the picked game takes files from the RTP and none can be found.
        const rtpMissing = document.createElement('div');
        rtpMissing.id = 'rr-legacy-import-rtp-missing';
        rtpMissing.setAttribute('role', 'status');
        rtpMissing.style.cssText = `grid-column:2 / span 2;display:none;align-items:center;gap:10px;font-size:12px;color:${'var(--color-warning-text, var(--color-warning, #d9a441))'};`;
        const rtpMissingText = document.createElement('span');
        rtpMissingText.textContent = tt('This game uses RPG Maker\'s RTP, which was not found. Choose its folder, or the import will lack the standard graphics, sounds and font.');
        const rtpGet = button('rr-legacy-import-rtp-get', tt('Download the RTP'));
        rtpGet.style.flex = 'none';
        rtpMissing.append(rtpMissingText, rtpGet);
        // Files only Don Miguel's RTP Addon has: the official RTP cannot stand in for them.
        const rtpAddon = document.createElement('div');
        rtpAddon.id = 'rr-legacy-import-rtp-addon';
        rtpAddon.style.cssText = rtpMissing.style.cssText;
        body.append(rtpMissing, rtpAddon);
        fillLanguages([]);

        const errorEl = document.createElement('div');
        errorEl.setAttribute('role', 'alert');
        errorEl.style.cssText = 'grid-column:1 / -1;color:var(--color-danger-bright, #e5484d);font-size:12px;min-height:1.2em;';
        // The console: a progress bar over the importer's own lines, coloured by level.
        const consoleEl = document.createElement('div');
        consoleEl.style.cssText = 'grid-column:1 / -1;display:flex;flex-direction:column;gap:6px;margin-top:4px;';
        const consoleHead = document.createElement('div');
        consoleHead.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;';
        const consoleTitle = document.createElement('span');
        consoleTitle.style.cssText = 'color:var(--color-text);font-size:13px;font-weight:600;';
        consoleTitle.textContent = tt('Import Log');
        const elapsedEl = document.createElement('span');
        elapsedEl.style.cssText = 'color:var(--color-text-muted);font-size:12px;font-variant-numeric:tabular-nums;';
        consoleHead.append(consoleTitle, elapsedEl);
        const progressRow = document.createElement('div');
        progressRow.style.cssText = 'display:none;justify-content:space-between;gap:12px;font-size:12px;';
        const statusEl = document.createElement('span');
        statusEl.id = 'rr-legacy-import-status';
        statusEl.style.cssText = 'color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;';
        const percentEl = document.createElement('span');
        percentEl.style.cssText = 'color:var(--color-text-muted);font-variant-numeric:tabular-nums;';
        progressRow.append(statusEl, percentEl);
        const track = document.createElement('div');
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.style.cssText = 'display:none;height:10px;background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:4px;overflow:hidden;';
        const bar = document.createElement('div');
        bar.id = 'rr-legacy-import-bar';
        bar.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg, var(--color-accent-deep), var(--color-accent-hover));transition:width 0.2s ease;';
        track.appendChild(bar);
        const logEl = document.createElement('div');
        logEl.id = 'rr-legacy-import-log';
        logEl.className = 'audio-scroll';
        logEl.style.cssText = 'height:220px;overflow-y:auto;padding:8px 10px;font-family:Consolas, Monaco, monospace;font-size:12px;line-height:1.45;color:var(--color-text);background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:4px;white-space:pre-wrap;word-wrap:break-word;';
        const ready = document.createElement('div');
        ready.style.color = 'var(--color-text-muted)';
        ready.textContent = tt('Ready to import.');
        logEl.appendChild(ready);
        consoleEl.append(consoleHead, progressRow, track, logEl);
        body.append(errorEl, consoleEl);
        const LEVEL_COLOURS = {
            stage: 'var(--color-accent-hover)',
            info: 'var(--color-text)',
            warn: 'var(--color-warning-text, var(--color-warning, #d9a441))',
            done: 'var(--color-success, #1db954)',
            error: 'var(--color-danger-bright, #e5484d)'
        };

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
            let settled = false, worker = null, destination = null, created = false;
            // An import stopped part way: its converters (FFmpeg, FluidSynth) first, then the worker;
            // a folder this import created is removed, one it imported into again is left as it is.
            const stopImport = () => {
                const w = worker;
                worker = null;
                if (!w) return;
                const partial = created ? destination : null;
                let ended = false;
                const end = () => {
                    if (ended) return;
                    ended = true;
                    Promise.resolve(w.terminate()).catch(() => {}).then(() => { if (partial) { try { fs.rmSync(partial, { recursive: true, force: true }); } catch (_) { /* in use */ } } });
                };
                w.on('message', msg => { if (msg && msg.type === 'cancelled') end(); });
                setTimeout(end, 2000);
                try { w.postMessage({ type: 'cancel' }); } catch (_) { end(); }
            };
            const finish = value => {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', handleKeyDown, true);
                stopImport();
                clearInterval(clock);
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
            let probed = null;
            const showDetected = (info) => {
                detectedEl.textContent = '';
                if (!info || !info.kind) { detectedEl.textContent = '—'; return; }
                const badge = document.createElement('span');
                const importable = IMPORTABLE.has(info.kind);
                badge.textContent = info.engine;
                badge.style.cssText = `padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;border:1px solid ${importable ? 'var(--color-success-border, var(--color-accent-border))' : 'var(--color-warning-border, var(--color-border))'};color:${importable ? 'var(--color-success, var(--color-accent))' : LEVEL_COLOURS.warn};`;
                const text = document.createElement('span');
                text.style.cssText = 'color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;';
                const parts = [info.title ? `“${info.title}”` : ''];
                if (info.maps) parts.push(`${info.maps} ${tt('maps')}`);
                if (info.packed) parts.push(tt('packed'));
                text.textContent = parts.filter(Boolean).join(' · ');
                detectedEl.append(badge, text);
            };
            const reason = (info) => {
                if (!info || !info.kind) return tt('Not an RPG Maker game folder: no RPG_RT.ldb, Data folder or game archive here.');
                if (info.kind === 'reactor') return tt('Already an RPG Reactor project: open it with File › Open Project.');
                if (info.kind === 'mv' || info.kind === 'mz') return tt('RPG Maker MV and MZ projects open directly: use File › Open Project.');
                return '';
            };
            sourceBrowse.addEventListener('click', () => browse(sourceInput, picked => {
                probed = probeOf(path, appRoot, picked) || { kind: detect(fs, path, picked), engine: '', title: '', maps: 0, languages: [] };
                // The name follows the picked game until the author types their own.
                if (!nameInput.value.trim() || nameInput.dataset.auto === 'true') {
                    nameInput.value = (probed.title || path.basename(picked)).replace(/[\\/:*?"<>|]/g, '_').trim() + ' (Reactor)';
                    nameInput.dataset.auto = 'true';
                }
                showDetected(probed);
                fillLanguages(probed.languages);
                errorEl.textContent = reason(probed);
                rtpMode = 'auto';
                updateRtp();
            }));
            parentBrowse.addEventListener('click', () => browse(parentInput, picked => { try { localStorage.setItem('rrLegacyImportParent', picked); } catch (_) { /* private mode */ } }));
            // A 2000/2003 game that takes files from the RTP: fill the folder when one is found, say so when none is.
            const rtpNeeded = () => !!(probed && (probed.kind === '2000' || probed.kind === '2003') && probed.needsRtp);
            const importer = () => require(path.join(appRoot, 'src', 'legacy', 'LegacyImporter.js'));
            const rtpManager = () => require(path.join(appRoot, 'src', 'legacy', 'RtpManager.js'));
            const rtpFound = () => {
                if (!rtpNeeded()) return true;
                if (rtpMode === 'none') return false;
                try { return !!importer().findRtp(probed.engine, { rtpPath: rtpInput.value || undefined, source: sourceInput.value, referenced: probed.rtpRefs, known: knownRtps() }); } catch (_) { return !!rtpInput.value; }
            };
            const missingText = () => rtpMode === 'none'
                ? tt('No RTP: the import will lack the standard graphics, sounds and font.')
                : tt('This game uses RPG Maker\'s RTP, which was not found. Choose its folder, or the import will lack the standard graphics, sounds and font.');
            const updateRtp = () => {
                // The RTP on this computer that answers to most of the game's names, unless one was chosen or cleared.
                if (rtpMode === 'auto') {
                    let found = null;
                    if (rtpNeeded()) { try { found = importer().findRtp(probed.engine, { source: sourceInput.value, referenced: probed.rtpRefs, known: knownRtps() }); } catch (_) { /* importer unavailable */ } }
                    rtpInput.value = found || '';
                } else if (rtpMode === 'none') rtpInput.value = '';
                const found = rtpFound();
                rtpMissing.style.display = found ? 'none' : 'flex';
                if (!rtpBusy) rtpMissingText.textContent = missingText();
                // Files only Don Miguel's RTP Addon has, when the chosen RTP lacks them.
                const addon = rtpNeeded() && probed.rtpUse ? probed.rtpUse.addon : [];
                const folder = found ? (rtpInput.value || '') : '';
                const lacking = addon.filter(ref => { const [sub, name] = ref.split('/'); try { return !fs.readdirSync(path.join(folder, sub)).some(f => f.replace(/\.[^.]+$/, '').toLowerCase() === name.toLowerCase()); } catch (_) { return true; } });
                rtpAddon.textContent = lacking.length ? `${tt('This game also uses files from Don Miguel\'s RTP Addon, which the official RTP does not have:')} ${lacking.join(', ')}` : '';
                rtpAddon.style.display = rtpAddon.textContent ? 'flex' : 'none';
            };
            // Download, unpack or locate an RTP while the rest of the dialog waits.
            let rtpBusy = false;
            const rtpTask = async (work, failure) => {
                if (rtpBusy) return;
                rtpBusy = true;
                for (const el of [rtpGet, rtpBrowse, importButton]) el.disabled = true;
                rtpMissing.style.display = 'flex';
                const progress = (fraction, status) => { rtpMissingText.textContent = `${tt(/^Unpacking/.test(status) ? 'Unpacking the RTP…' : 'Downloading the RTP…')} ${Math.round(fraction * 100)}%`; };
                try {
                    const folder = await work(progress);
                    rtpInput.value = folder;
                    rtpMode = 'chosen';
                    rememberRtp(folder, true);
                    rtpBusy = false;
                    updateRtp();
                } catch (error) {
                    rtpBusy = false;
                    rtpMissing.style.display = 'flex';
                    rtpMissingText.textContent = `${failure} ${error && error.message ? error.message : error}`;
                } finally {
                    for (const el of [rtpGet, rtpBrowse, importButton]) el.disabled = false;
                }
            };
            // Whatever the author points at: an RTP folder, a folder holding one or its installer, an installer or archive.
            const useRtp = (target) => rtpTask(progress => rtpManager().rtpFrom(target, progress), tt('No RTP there:'));
            const pickRtpFolder = () => {
                const chooser = document.createElement('input');
                chooser.type = 'file';
                chooser.setAttribute('nwdirectory', '');
                if (rtpInput.value && fs.existsSync(rtpInput.value)) chooser.setAttribute('nwworkingdir', rtpInput.value);
                chooser.addEventListener('change', () => { const picked = chooser.files?.[0]?.path || chooser.value; if (picked) useRtp(picked); });
                chooser.click();
            };
            const pickRtpFile = () => {
                const chooser = document.createElement('input');
                chooser.type = 'file';
                chooser.accept = '.exe,.zip,.rar';
                chooser.addEventListener('change', () => { const picked = chooser.files?.[0]?.path || chooser.value; if (picked) useRtp(picked); });
                chooser.click();
            };
            // Import without an RTP; a folder cleared is no longer offered for later games.
            const clearRtp = () => {
                if (rtpMode === 'chosen' && rtpInput.value) rememberRtp(rtpInput.value, false);
                rtpMode = 'none';
                updateRtp();
            };
            rtpBrowse.addEventListener('click', () => {
                if (rtpBusy) return;
                const r = rtpBrowse.getBoundingClientRect();
                const menu = window.RRContextMenu && window.RRContextMenu.show(r.left, r.bottom + 2, [
                    { label: tt('RTP Folder…'), action: pickRtpFolder },
                    { label: tt('Installer or Archive…'), action: pickRtpFile },
                    { separator: true },
                    { label: tt('Clear'), enabled: !!rtpInput.value, action: clearRtp }
                ]);
                if (menu) menu.style.zIndex = '10600';   // above this dialog
                else pickRtpFolder();
            });
            for (const target of [rtpInput, rtpButtons]) {
                target.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; rtpInput.style.borderColor = 'var(--color-accent)'; });
                target.addEventListener('dragleave', () => { rtpInput.style.borderColor = ''; });
                target.addEventListener('drop', (e) => {
                    e.preventDefault();
                    rtpInput.style.borderColor = '';
                    const dropped = e.dataTransfer.files && e.dataTransfer.files[0] && e.dataTransfer.files[0].path;
                    if (dropped) useRtp(dropped);
                });
            }
            // Download RPG Maker's official RTP and unpack the installer's files, nothing installed.
            rtpGet.addEventListener('click', () => { if (probed) rtpTask(progress => rtpManager().fetchOfficial(probed.engine, progress), tt('RTP download failed:')); });
            const log = (message, level = 'info') => {
                const line = document.createElement('div');
                line.textContent = message;
                line.style.color = LEVEL_COLOURS[level] || LEVEL_COLOURS.info;
                if (level === 'stage' || level === 'done' || level === 'error') line.style.fontWeight = '600';
                logEl.appendChild(line);
                logEl.scrollTop = logEl.scrollHeight;
            };
            let startedAt = 0, clock = null;
            const tick = () => { const s = Math.floor((Date.now() - startedAt) / 1000); elapsedEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
            const setProgress = (fraction, status, state) => {
                const pct = Math.max(0, Math.min(100, fraction * 100));
                progressRow.style.display = 'flex';
                track.style.display = 'block';
                bar.style.width = `${pct}%`;
                track.setAttribute('aria-valuenow', String(Math.round(pct)));
                percentEl.textContent = `${Math.round(pct)}%`;
                if (status) { statusEl.textContent = status; statusEl.title = status; }
                bar.style.background = state === 'done' ? 'linear-gradient(90deg, #16825d, var(--color-success, #1db954))'
                    : state === 'error' ? 'var(--color-danger-bright, #e5484d)'
                    : 'linear-gradient(90deg, var(--color-accent-deep), var(--color-accent-hover))';
            };
            const start = async () => {
                const source = sourceInput.value.trim(), parent = parentInput.value.trim(), name = nameInput.value.trim();
                const info = source ? (probed && sourceInput.value === source ? probed : (probeOf(path, appRoot, source) || { kind: detect(fs, path, source) })) : null;
                if (!info || !IMPORTABLE.has(info.kind)) { errorEl.textContent = reason(info); return; }
                if (!parent || !fs.existsSync(parent)) { errorEl.textContent = tt('Choose a folder to create the project in.'); return; }
                if (!name || /[\\/:*?"<>|\0-\x1f]/.test(name) || /^\.|[. ]$/.test(name)) { errorEl.textContent = tt('Project name must be a safe single folder name.'); return; }
                destination = path.join(parent, name);
                created = !fs.existsSync(destination);
                // A folder already there (an earlier or interrupted import) is imported into again, in place, when the author agrees.
                const force = fs.existsSync(destination) && fs.readdirSync(destination).length > 0;
                // Never over a project open in an editor, this one included: its lock names a live process.
                if (force && projectOpenAt(fs, path, destination)) { errorEl.textContent = tt('That folder already exists and is not empty.'); return; }
                if (force && !(await RRDialog.confirm(`${tt('That folder already exists and is not empty.')} ${tt('Import into it again? Files already there are overwritten.')}`,
                    { title: tt('Import Project'), ok: tt('Overwrite'), danger: true }))) return;
                if (!rtpFound() && !(await RRDialog.confirm(`${rtpMissingText.textContent} ${tt('Import without the RTP?')}`,
                    { title: tt('Import Project'), ok: tt('Import') }))) return;
                // Closed, or an import started, while a question was up.
                if (settled || worker) return;
                errorEl.textContent = '';
                logEl.textContent = '';
                startedAt = Date.now(); tick(); clock = setInterval(tick, 1000);
                setProgress(0, tt('Importing…'));
                const setBusy = busy => {
                    for (const el of [sourceBrowse, parentBrowse, rtpBrowse, rtpGet, nameInput, encodingSelect, importButton]) el.disabled = busy;
                    // A source with no translations keeps the language list off.
                    languageSelect.disabled = busy || languageSelect.options.length <= 1;
                };
                const failed = message => {
                    errorEl.textContent = `${tt('Import failed:')} ${message}`;
                    log(`${tt('Import failed:')} ${message}`, 'error');
                    setProgress(Number(bar.style.width.replace('%', '')) / 100 || 0, tt('Import failed:').replace(/:$/, ''), 'error');
                    clearInterval(clock);
                    worker = null;
                    setBusy(false);
                    importButton.style.display = '';
                    setLabel(importButton, 'Import');
                };
                setBusy(true);
                setLabel(importButton, 'Importing…');
                let workerPath = path.join(appRoot, 'build-scripts', 'legacy-import-worker.js');
                try {
                    const { Worker } = require('worker_threads');
                    const w = worker = new Worker(workerPath, { workerData: { source, destination, options: { force, encoding: encodingSelect.value || undefined, language: languageSelect.value || undefined, rtpPath: rtpInput.value || undefined, noRtp: rtpMode === 'none' || undefined } } });
                    worker.on('message', msg => {
                        if (msg.type === 'log') log(msg.message, msg.level);
                        else if (msg.type === 'progress') setProgress(msg.fraction, msg.status);
                        else if (msg.type === 'done') {
                            worker = null;
                            importButton.style.display = 'none';
                            if (msg.success) {
                                clearInterval(clock); tick();
                                setProgress(1, tt('Import complete.'), 'done');
                                setLabel(cancelButton, 'Close');
                                openButton.style.display = '';
                                openButton.focus();
                            } else failed(msg.error);
                        }
                    });
                    worker.on('error', err => failed(err.message || err));
                    // A worker that ends without its 'done' (killed, out of memory) would leave the dialog importing forever.
                    worker.on('exit', code => { if (worker === w && !settled) failed(tt('The import worker stopped (exit code {code}).').replace('{code}', String(code))); });
                } catch (error) {
                    failed(error.message || error);
                }
            };
            // Closing while an import runs stops it, so it asks first.
            const close = async () => {
                if (worker && !(await RRDialog.confirm(tt('Stop the import?'), { title: tt('Import Project'), ok: tt('Stop Import'), danger: true }))) return;
                finish(null);
            };
            const handleKeyDown = event => {
                if (event.key === 'Escape' && window.RRContextMenu && window.RRContextMenu.isOpen()) return;   // the menu closes first
                if (event.key === 'Escape') { event.preventDefault(); close(); }
                else if (event.key === 'Enter' && event.target === nameInput) { event.preventDefault(); start(); }
            };
            nameInput.addEventListener('input', () => { errorEl.textContent = ''; nameInput.dataset.auto = 'false'; });
            closeButton.addEventListener('click', close);
            cancelButton.addEventListener('click', close);
            importButton.addEventListener('click', start);
            openButton.addEventListener('click', () => { const d = destination; finish(d); if (openProject) openProject(d); });
            document.addEventListener('keydown', handleKeyDown, true);
            document.body.appendChild(overlay);
            root.RRKeyboardNavigation?.modal(overlay, { container: () => modal });
            sourceBrowse.focus();
        });
    }

    const api = { show, detect, projectOpenAt, ENCODINGS };
    root.RRLegacyImportDialog = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
