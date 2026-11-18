/**
 * RRFolderPicker - choosing a folder (Open Project, New Project, Save As, Deploy, Export, Import).
 *
 * NW.js 0.117 and later close the whole editor the moment a folder is chosen through <input nwdirectory>:
 * Chromium 154 made a check fatal ("Check failed: !base_dir.empty()" in file_chooser_impl.cc) and NW.js's folder
 * picker leaves that folder empty (nwjs/nw.js#8393, open on 0.120.0). The owner hit it on 2026-11-17, opening the
 * Demo after the editor moved to 0.120. So the editor browses folders itself, with Node's fs, in one of its own
 * dialogs, and does what the systems' folder dialogs did (owner: "feature parity on all OS's"):
 *
 *   - a folder tree on the left (an arrow opens a folder's folders; the folder shown is opened down to and marked),
 *     rooted at the system's own places: home, desktop, documents, downloads, pictures, music, videos, where the system keeps
 *     them (Linux: ~/.config/user-dirs.dirs; Windows: the registry's User Shell Folders, so a Documents moved to
 *     OneDrive is found; macOS: iCloud Drive too), the user's bookmarks (GTK's and KDE's Places), recent folders,
 *     and the drives (Windows), mounted disks (Linux, /proc/mounts) or volumes (macOS);
 *   - back, forward, up, refresh; a clickable path; a typed path with ~ and %VAR%/$VAR and Tab completion;
 *   - name and modified date, sorted by either; hidden folders on request (Ctrl+H), the system's hidden ones left out;
 *   - New Folder, Rename (F2), Show in File Manager (right click); a folder dragged in from the file manager;
 *   - a window that resizes; folders holding a project marked.
 *
 *   const folder = await RRFolderPicker.pick({ title: 'Open Project', startIn: os.homedir() });   // '' when cancelled
 *
 * Double click (or Enter) goes into a folder; Select Folder takes the highlighted folder, or the one shown.
 */
(function (root) {
    'use strict';

    const tt = text => (root.I18n && typeof root.I18n.tText === 'function') ? root.I18n.tText(text) : text;
    const LAST_KEY = 'rrFolderPicker.last';
    const RECENT_KEY = 'rrFolderPicker.recent';
    const VIEW_KEY = 'rrFolderPicker.view';
    const RECENT_MAX = 8;
    const SKIP = new Set(['$recycle.bin', 'system volume information', '$windows.~bt', '$windows.~ws', 'lost+found']);
    // Folders Windows marks hidden or system: the old junctions in a profile, and the system's own at a drive's root.
    const WINDOWS_HIDDEN = new Set(['appdata', 'application data', 'local settings', 'my documents', 'cookies', 'nethood', 'printhood',
        'recent', 'sendto', 'start menu', 'templates', 'documents and settings', 'programdata', 'recovery', 'config.msi',
        '$winreagent', '$sysreset', 'msocache', 'boot', '$getcurrent']);
    // What the Finder leaves out at a Mac's root.
    const MAC_ROOT_HIDDEN = new Set(['bin', 'cores', 'dev', 'etc', 'private', 'sbin', 'tmp', 'usr', 'var', 'opt', 'volumes', 'system']);
    // RPG Maker MZ's and MV's markers, and the data every project has (ProjectManager.loadProject reads it).
    const PROJECT_FILES = ['game.rmmzproject', 'Game.rpgproject', 'game.rpgproject', path => path.join('data', 'System.json')];

    // Line icons in the editor's style (16 px, the text colour, round strokes), not emoji.
    const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
    const ICONS = {
        folder: `<path d="M1.75 4.25a1 1 0 0 1 1-1h3.3l1.5 1.5h5.7a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z" ${STROKE}/>`,
        project: `<path d="M1.75 4.25a1 1 0 0 1 1-1h3.3l1.5 1.5h5.7a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z" ${STROKE}/><path d="M8 7.2l.8 1.6 1.7.25-1.25 1.2.3 1.7L8 11.15l-1.55.8.3-1.7-1.25-1.2 1.7-.25z" fill="currentColor"/>`,
        home: `<path d="M2.25 7.5L8 2.75l5.75 4.75M3.75 6.5v6.75h3.25V9.75h2v3.5h3.25V6.5" ${STROKE}/>`,
        desktop: `<rect x="1.75" y="2.5" width="12.5" height="8.5" rx="1" ${STROKE}/><path d="M5.75 13.75h4.5M8 11v2.75" ${STROKE}/>`,
        documents: `<path d="M3.75 1.75h5.5l3 3v9.5h-8.5z M9.25 1.75v3h3M6 8h4M6 10.5h4" ${STROKE}/>`,
        downloads: `<path d="M8 2.25v7.5M4.75 6.75L8 10l3.25-3.25M2.5 11.25v2.25h11v-2.25" ${STROKE}/>`,
        pictures: `<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1" ${STROKE}/><circle cx="5.5" cy="6.25" r="1.25" ${STROKE}/><path d="M2 12l3.5-3.5 2.5 2.5 2-2 4 4" ${STROKE}/>`,
        music: `<path d="M6 12.25V3.5l7-1.5v8.75" ${STROKE}/><circle cx="4.25" cy="12.25" r="1.75" ${STROKE}/><circle cx="11.25" cy="10.75" r="1.75" ${STROKE}/>`,
        videos: `<rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1" ${STROKE}/><path d="M6.5 5.75v4.5L10.25 8z" fill="currentColor"/>`,
        cloud: `<path d="M4.5 12.75h7a2.9 2.9 0 0 0 .4-5.8 4 4 0 0 0-7.7 1.1A2.4 2.4 0 0 0 4.5 12.75z" ${STROKE}/>`,
        bookmark: `<path d="M4.25 1.75h7.5v12.5L8 11.5l-3.75 2.75z" ${STROKE}/>`,
        recent: `<circle cx="8" cy="8" r="6.25" ${STROKE}/><path d="M8 4.5V8l2.5 1.5" ${STROKE}/>`,
        drive: `<rect x="1.75" y="4.75" width="12.5" height="6.5" rx="1.25" ${STROKE}/><path d="M4 8h4" ${STROKE}/><circle cx="11.5" cy="8" r=".9" fill="currentColor"/>`,
        chevron: `<path d="M6 3.75L10.25 8 6 12.25" ${STROKE}/>`,
        back: `<path d="M13 8H3M7.25 3.75L3 8l4.25 4.25" ${STROKE}/>`,
        forward: `<path d="M3 8h10M8.75 3.75L13 8l-4.25 4.25" ${STROKE}/>`,
        up: `<path d="M8 13V3M3.75 7.25L8 3l4.25 4.25" ${STROKE}/>`,
        refresh: `<path d="M13.25 8a5.25 5.25 0 1 1-1.55-3.7M13.25 2.5v3.25H10" ${STROKE}/>`
    };
    const iconSvg = name => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.folder}</svg>`;

    const nodePath = () => require('path');
    const nodeFs = () => require('fs');
    const nodeOs = () => require('os');
    const defaults = options => ({
        fs: options.fs || nodeFs(), path: options.path || nodePath(), os: options.os || nodeOs(),
        platform: options.platform || process.platform, env: options.env || process.env
    });

    /** True when `dir` holds an RPG Maker or Reactor project. */
    function isProject(fs, path, dir) {
        for (const item of PROJECT_FILES) {
            const name = typeof item === 'function' ? item(path) : item;
            try { if (fs.existsSync(path.join(dir, name))) return true; } catch (error) { /* unreadable: not a project */ }
        }
        return false;
    }

    /** True for a folder the system's own dialog leaves out unless hidden ones are shown. */
    function isHidden(name, dir, { platform = process.platform, home = '', path = nodePath() } = {}) {
        const lower = name.toLowerCase();
        if (name.startsWith('.')) return true;
        if (platform === 'win32') return WINDOWS_HIDDEN.has(lower) || lower.startsWith('$');
        if (platform === 'darwin') {
            if (path.dirname(path.join(dir, name)) === '/' && MAC_ROOT_HIDDEN.has(lower)) return true;
            if (home && dir === home && lower === 'library') return true;
        }
        return false;
    }

    /**
     * The folders inside `dir`: [{ name, path, project, modified, hidden }], by name. Recycle bins and the like are
     * never listed; hidden folders only with `showHidden`. Throws when `dir` can't be read.
     */
    function listFolders(dir, options = {}) {
        const { fs, path, os, platform } = defaults(options);
        const home = options.home != null ? options.home : os.homedir();
        const out = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const name = entry.name;
            if (SKIP.has(name.toLowerCase())) continue;
            const hidden = isHidden(name, dir, { platform, home, path });
            if (hidden && !options.showHidden) continue;
            const full = path.join(dir, name);
            let folder = entry.isDirectory(), modified = 0;
            if (folder || entry.isSymbolicLink()) {
                try { const stat = fs.statSync(full); folder = stat.isDirectory(); modified = stat.mtimeMs || 0; } catch (error) { /* a broken link: left out */ if (!entry.isDirectory()) folder = false; }
            }
            if (folder) out.push({ name, path: full, project: options.projects === false ? false : isProject(fs, path, full), modified, hidden });
        }
        return sortFolders(out, 'name');
    }

    /** By name (numbers in order, case aside) or by modified date; descending flips it. */
    function sortFolders(list, by = 'name', descending = false) {
        const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
        const compare = by === 'modified' ? ((a, b) => (a.modified - b.modified) || byName(a, b)) : byName;
        return list.slice().sort((a, b) => descending ? compare(b, a) : compare(a, b));
    }

    /** A typed path made whole: ~ for home, %VAR% (Windows) and $VAR or ${VAR}, a bare drive letter as its root. */
    function expandPath(text, options = {}) {
        const { path, os, platform, env } = defaults(options);
        let value = String(text || '').trim().replace(/^["']|["']$/g, '');
        if (!value) return '';
        if (value === '~' || /^~[\\/]/.test(value)) value = os.homedir() + value.slice(1);
        const lookup = name => { const key = Object.keys(env).find(k => platform === 'win32' ? k.toLowerCase() === name.toLowerCase() : k === name); return key != null ? env[key] : null; };
        value = value.replace(/%([^%\\/]+)%/g, (whole, name) => { const v = lookup(name); return v != null ? v : whole; });
        value = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (whole, a, b) => { const v = lookup(a || b); return v != null ? v : whole; });
        if (platform === 'win32' && /^[A-Za-z]:$/.test(value)) value += '\\';
        return path.resolve(value);
    }

    /** ~/.config/user-dirs.dirs read: { DESKTOP, DOCUMENTS, DOWNLOAD, PICTURES, MUSIC, VIDEOS, ... } as paths. */
    function xdgUserDirs(text, home) {
        const out = {};
        for (const line of String(text || '').split('\n')) {
            const m = /^\s*XDG_([A-Z]+)_DIR\s*=\s*"(.*)"\s*$/.exec(line);
            if (!m) continue;
            const value = m[2].replace(/^\$HOME/, home).replace(/\\"/g, '"');
            if (value && value !== home && value !== home + '/') out[m[1]] = value;
        }
        return out;
    }

    const fileUrlPath = url => { try { return decodeURIComponent(String(url).replace(/^file:\/\/(localhost)?/, '')); } catch (error) { return ''; } };

    /** GTK's bookmarks (~/.config/gtk-3.0/bookmarks): "file:///path Optional label" per line; other kinds left out. */
    function gtkBookmarks(text, path = nodePath()) {
        const out = [];
        for (const line of String(text || '').split('\n')) {
            const m = /^(file:\/\/\S+)(?:\s+(.*))?$/.exec(line.trim());
            if (!m) continue;
            const dir = fileUrlPath(m[1]);
            if (dir) out.push({ label: (m[2] || '').trim() || path.basename(dir) || dir, path: dir });
        }
        return out;
    }

    /** KDE's Places (~/.local/share/user-places.xbel): its local folders, less those hidden from its panel. */
    function kdePlaces(text, path = nodePath()) {
        const out = [];
        const entity = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
        for (const m of String(text || '').matchAll(/<bookmark\s+href="(file:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/bookmark>/g)) {
            if (/<IsHidden>\s*true\s*<\/IsHidden>/i.test(m[2])) continue;
            const dir = fileUrlPath(entity(m[1]));
            const title = /<title>([\s\S]*?)<\/title>/.exec(m[2]);
            if (dir) out.push({ label: title ? entity(title[1]).trim() || path.basename(dir) : path.basename(dir) || dir, path: dir });
        }
        return out;
    }

    // The registry names of Windows' known folders, as `reg query` prints them.
    const WINDOWS_FOLDERS = { Desktop: 'Desktop', Personal: 'Documents', '{374DE290-123F-4565-9164-39C4925E467B}': 'Downloads',
        'My Pictures': 'Pictures', 'My Music': 'Music', 'My Video': 'Videos' };

    /** `reg query ...\User Shell Folders` read: { Desktop, Documents, Downloads, Pictures, Music, Videos } with %VAR% expanded. */
    function windowsKnownFolders(text, env = {}) {
        const out = {};
        const lookup = name => { const key = Object.keys(env).find(k => k.toLowerCase() === name.toLowerCase()); return key != null ? env[key] : null; };
        for (const line of String(text || '').split(/\r?\n/)) {
            const m = /^\s+(.+?)\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/.exec(line);
            if (!m || !WINDOWS_FOLDERS[m[1]]) continue;
            out[WINDOWS_FOLDERS[m[1]]] = m[2].replace(/%([^%]+)%/g, (whole, name) => { const v = lookup(name); return v != null ? v : whole; });
        }
        return out;
    }

    let windowsFoldersCache = null;
    function readWindowsFolders(env) {
        if (windowsFoldersCache) return windowsFoldersCache;
        try {
            const text = require('child_process').execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'],
                { encoding: 'utf8', windowsHide: true, timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] });
            windowsFoldersCache = windowsKnownFolders(text, env);
        } catch (error) { windowsFoldersCache = {}; }
        return windowsFoldersCache;
    }

    function readText(fs, file) { try { return String(fs.readFileSync(file, 'utf8')); } catch (error) { return ''; } }

    /**
     * The places beside the list: [{ group, label, path }], group one of 'places', 'bookmarks', 'recent', 'drives'.
     * options.knownFolders (Windows) and options.recent stand in for the registry and the stored list in tests.
     */
    function places(options = {}) {
        const { fs, path, os, platform, env } = defaults(options);
        const out = [];
        const exists = dir => { try { return !!dir && fs.statSync(dir).isDirectory(); } catch (error) { return false; } };
        const add = (group, label, dir, icon) => { if (exists(dir) && !out.some(place => place.path === dir)) out.push({ group, label, path: dir, icon: icon || ({ bookmarks: 'bookmark', recent: 'recent', drives: 'drive' })[group] || 'folder' }); };
        const home = os.homedir();
        add('places', tt('Home Folder'), home, 'home');
        const standard = [['Desktop', 'DESKTOP'], ['Documents', 'DOCUMENTS'], ['Downloads', 'DOWNLOAD'], ['Pictures', 'PICTURES'], ['Music', 'MUSIC'], ['Videos', 'VIDEOS']];
        if (platform === 'win32') {
            const known = options.knownFolders || readWindowsFolders(env);
            for (const [name] of standard) add('places', tt(name), known[name] || path.join(home, name), name.toLowerCase());
            if (env.OneDrive) add('places', 'OneDrive', env.OneDrive, 'cloud');
        } else if (platform === 'darwin') {
            for (const [name] of standard) add('places', tt(name), path.join(home, name === 'Videos' ? 'Movies' : name), name.toLowerCase());
            add('places', 'iCloud Drive', path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'), 'cloud');
        } else {
            const xdg = xdgUserDirs(readText(fs, path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'user-dirs.dirs')), home);
            for (const [name, key] of standard) add('places', tt(name), xdg[key] || path.join(home, name), name.toLowerCase());
            const marks = [...gtkBookmarks(readText(fs, path.join(home, '.config', 'gtk-3.0', 'bookmarks')), path),
                ...kdePlaces(readText(fs, path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'user-places.xbel')), path)];
            for (const mark of marks) add('bookmarks', mark.label, mark.path);
        }
        for (const dir of options.recent || readRecent()) add('recent', path.basename(dir) || dir, dir);
        if (platform === 'win32') {
            for (let code = 65; code <= 90; code++) add('drives', String.fromCharCode(code) + ':', String.fromCharCode(code) + ':\\');
            return out;
        }
        add('drives', '/', '/');
        // Linux: the disks actually mounted under /mnt, /media and /run/media (from /proc/mounts), not every folder there.
        if (platform === 'linux') {
            let table = null;
            try { table = String(fs.readFileSync('/proc/mounts', 'utf8')); } catch (error) { /* no /proc: the folders below */ }
            if (table != null) {
                const points = table.split('\n').map(line => (line.split(' ')[1] || '').replace(/\\(\d{3})/g, (m, code) => String.fromCharCode(parseInt(code, 8))))
                    .filter(point => /^\/(mnt|media|run\/media)\/./.test(point)).sort();
                for (const point of points) add('drives', path.basename(point), point);
                return out;
            }
        }
        const mounts = platform === 'darwin' ? ['/Volumes'] : ['/mnt', '/media', env.USER ? '/media/' + env.USER : '', env.USER ? '/run/media/' + env.USER : ''];
        for (const base of mounts) {
            if (!base || !exists(base)) continue;
            let names = [];
            try { names = fs.readdirSync(base); } catch (error) { continue; }
            for (const name of names.sort()) if (!name.startsWith('.') && name !== env.USER) add('drives', name, path.join(base, name));
        }
        return out;
    }

    /** The folders from the root down to `dir`, each { label, path }: the clickable path above the list. */
    function crumbs(dir, path = nodePath()) {
        const out = [];
        for (let at = dir; ; at = path.dirname(at)) {
            const base = path.basename(at);
            out.unshift({ label: base || at.replace(/[\\/]+$/, '') || at, path: at });
            if (path.dirname(at) === at) break;
        }
        return out;
    }

    /** Folders a typed path could go on to: the folders of its parent whose names begin with its last part. */
    function completions(text, options = {}) {
        const { path, platform } = defaults(options);
        const typed = String(text || '');
        if (!typed) return [];
        const full = expandPath(typed, options);
        const endsInSep = /[\\/]$/.test(typed);
        const parent = endsInSep ? full : path.dirname(full);
        const start = endsInSep ? '' : path.basename(full);
        const fold = s => platform === 'linux' ? s : s.toLowerCase();
        let listed;
        try { listed = listFolders(parent, options); } catch (error) { return []; }
        return listed.filter(folder => fold(folder.name).startsWith(fold(start))).map(folder => folder.path);
    }

    /** The longest start the paths share (Tab completes that far). */
    function commonStart(paths, platform = process.platform) {
        if (!paths.length) return '';
        let start = paths[0];
        for (const p of paths.slice(1)) {
            let i = 0;
            while (i < start.length && i < p.length && (platform === 'linux' ? start[i] === p[i] : start[i].toLowerCase() === p[i].toLowerCase())) i++;
            start = start.slice(0, i);
        }
        return start;
    }

    /** Where the browser opens: the folder asked for, or the nearest one above it that exists, or the last one used, or home. */
    function startFolder(startIn, options = {}) {
        const { fs, path, os } = defaults(options);
        const exists = dir => { try { return !!dir && fs.statSync(dir).isDirectory(); } catch (error) { return false; } };
        for (let dir of [startIn, options.last]) {
            if (!dir) continue;
            dir = path.resolve(String(dir));
            for (;;) {
                if (exists(dir)) return dir;
                const up = path.dirname(dir);
                if (up === dir) break;
                dir = up;
            }
        }
        return os.homedir();
    }

    const storage = () => { try { return root.localStorage || null; } catch (error) { return null; } };
    function readStored(key, fallback) { try { const s = storage(); const v = s && s.getItem(key); return v ? JSON.parse(v) : fallback; } catch (error) { return fallback; } }
    function writeStored(key, value) { try { const s = storage(); if (s) s.setItem(key, JSON.stringify(value)); } catch (error) { /* a convenience only */ } }
    function readLast() { try { const s = storage(); return (s && s.getItem(LAST_KEY)) || ''; } catch (error) { return ''; } }
    function readRecent() { const list = readStored(RECENT_KEY, []); return Array.isArray(list) ? list.filter(item => typeof item === 'string') : []; }
    /** The recent folders with `dir` first, at most eight. */
    function withRecent(list, dir) { return [dir, ...list.filter(item => item !== dir)].slice(0, RECENT_MAX); }
    function remember(dir) {
        try { const s = storage(); if (s) s.setItem(LAST_KEY, dir); } catch (error) { /* a convenience only */ }
        writeStored(RECENT_KEY, withRecent(readRecent(), dir));
    }

    const STYLE = `
.rr-folder-picker { width: 820px; height: min(640px, 86vh); min-width: 520px; min-height: 380px; resize: both; overflow: hidden; }
.rr-folder-picker .rr-modal-body { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; padding: 10px 14px; }
.rr-folder-picker-bar { display: flex; gap: 4px; }
.rr-folder-picker-bar button { min-width: 32px; padding: 0 8px; }
.rr-folder-picker-bar input { flex: 1; min-width: 0; font-family: var(--font-mono, monospace); }
.rr-folder-picker-crumbs { display: flex; flex-wrap: nowrap; gap: 2px; overflow: hidden; align-items: center; min-height: 22px; }
.rr-folder-picker-crumb { background: none; border: none; color: var(--color-text-muted); padding: 2px 6px; border-radius: 3px; cursor: pointer; white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
.rr-folder-picker-crumb:hover { background: var(--color-bg-hover); color: var(--color-text); }
.rr-folder-picker-crumb.current { color: var(--color-text-strong); }
.rr-folder-picker-sep { color: var(--color-text-dim); font-size: 11px; }
.rr-folder-picker-main { display: flex; gap: 8px; flex: 1; min-height: 0; }
.rr-folder-picker-places, .rr-folder-picker-list { overflow: auto; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg-deep); }
.rr-folder-picker-places { width: 240px; flex: none; padding: 4px 0; outline: none; }
.rr-folder-picker-places .rr-folder-picker-place { gap: 4px; padding-top: 3px; padding-bottom: 3px; }
.rr-folder-tree-twisty { width: 14px; height: 14px; flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--color-text-dim); cursor: pointer; transition: transform 0.12s ease; }
.rr-folder-tree-twisty svg { width: 12px; height: 12px; }
.rr-folder-tree-twisty.open { transform: rotate(90deg); }
.rr-folder-tree-twisty.empty { visibility: hidden; }
.rr-folder-tree-twisty:hover { color: var(--color-text-strong); }
.rr-folder-picker-places:focus-visible .rr-folder-picker-place.active { outline: 1px solid var(--color-accent-border-strong); outline-offset: -1px; }
.rr-folder-picker-group { padding: 8px 10px 2px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-dim); }
.rr-folder-picker-list { flex: 1; min-width: 0; outline: none; display: flex; flex-direction: column; }
.rr-folder-picker-list:focus-visible { border-color: var(--color-accent-border-strong); }
.rr-folder-picker-head { display: flex; position: sticky; top: 0; background: var(--color-bg-panel); border-bottom: 1px solid var(--color-border-subtle); z-index: 1; }
.rr-folder-picker-head button { background: none; border: none; color: var(--color-text-muted); font-size: 12px; padding: 4px 10px; text-align: left; cursor: pointer; }
.rr-folder-picker-head button:hover { color: var(--color-text); }
.rr-folder-picker-head .name { flex: 1; padding-left: 34px; }
.rr-folder-picker-head .modified, .rr-folder-picker-modified { width: 150px; flex: none; }
.rr-folder-picker-rows { flex: 1; }
.rr-folder-picker-row, .rr-folder-picker-place { display: flex; align-items: center; gap: 8px; padding: 4px 10px; cursor: default; white-space: nowrap; overflow: hidden; color: var(--color-text); user-select: none; }
.rr-folder-picker-row:hover, .rr-folder-picker-place:hover { background: var(--color-bg-hover); }
.rr-folder-picker-row.selected { background: var(--color-bg-selected); color: var(--color-text-strong); }
.rr-folder-picker-row.hidden-folder .rr-folder-picker-name, .rr-folder-picker-place.hidden-folder .rr-folder-picker-name { opacity: 0.6; }
.rr-folder-picker-place.current { background: var(--color-bg-selected); color: var(--color-text-strong); }
.rr-folder-picker-icon { flex: none; width: 16px; height: 16px; display: inline-flex; color: var(--color-text-muted); }
.rr-folder-picker-icon svg, .rr-folder-tree-twisty svg, .rr-folder-picker-tool svg { display: block; }
.rr-folder-picker-row .rr-folder-picker-icon { color: var(--color-accent); }
.rr-folder-picker-row.project .rr-folder-picker-icon { color: var(--color-accent-bright); }
.rr-folder-picker-place.current .rr-folder-picker-icon, .rr-folder-picker-row.selected .rr-folder-picker-icon { color: var(--color-accent-bright); }
.rr-folder-picker-tool { display: inline-flex; align-items: center; justify-content: center; }
.rr-folder-picker-tool:disabled { opacity: 0.4; }
.rr-folder-picker-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.rr-folder-picker-modified { color: var(--color-text-muted); font-size: 12px; text-align: left; padding-left: 10px; }
.rr-folder-picker-tag { flex: none; font-size: 11px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--color-accent-border); color: var(--color-accent-bright); }
.rr-folder-picker-note { padding: 12px; color: var(--color-text-muted); }
.rr-folder-picker-chosen { color: var(--color-text-muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }
.rr-folder-picker.dropping .rr-folder-picker-list { border-color: var(--color-accent-bright); }
.rr-folder-picker .rr-modal-footer { justify-content: space-between; align-items: center; }
.rr-folder-picker-footer-left, .rr-folder-picker-footer-right { display: flex; gap: 12px; align-items: center; }
.rr-folder-picker-footer-left label { display: flex; gap: 6px; align-items: center; color: var(--color-text-muted); font-size: 12px; }
`;

    function addStyle(doc) {
        if (doc.getElementById('rr-folder-picker-style')) return;
        const style = doc.createElement('style');
        style.id = 'rr-folder-picker-style';
        style.textContent = STYLE;
        doc.head.appendChild(style);
    }

    /** A dialog asked from an open modal <dialog> goes inside it, or it could neither be seen nor answered. */
    function hostFor(doc) {
        const open = Array.from(doc.querySelectorAll('dialog[open]'));
        for (let index = open.length - 1; index >= 0; index--) {
            try { if (open[index].matches(':modal')) return open[index]; } catch (error) { /* no :modal */ }
        }
        return doc.body;
    }

    // Keys reach the window's capturing listeners first, and the application's shortcuts listen there. This one
    // is added when the file loads, ahead of them: while the browser is up it takes every key (Delete, Ctrl+S and
    // the rest wait), except Tab (the focus trap's, or completion in the path), F11 and F12. A question or a menu
    // shown on top of it (New Folder's name, the right-click menu) has its keys.
    let onScreen = null;
    if (typeof root.addEventListener === 'function') {
        root.addEventListener('keydown', event => { if (onScreen) onScreen(event); }, true);
    }

    let open = null;

    /** Ask the author for a folder. Resolves to its path, or '' when they cancel. One browser at a time. */
    function pick(options = {}) {
        if (open) return Promise.resolve('');
        open = new Promise(resolve => show(options, resolve)).finally(() => { open = null; });
        return open;
    }

    function show(options, resolve) {
        const doc = root.document;
        const fs = nodeFs(), path = nodePath(), os = nodeOs();
        const platform = process.platform;
        addStyle(doc);
        let current = startFolder(options.startIn, { last: readLast() });
        let folders = [];
        let selected = -1;
        const view = Object.assign({ sort: 'name', descending: false, showHidden: false }, readStored(VIEW_KEY, {}));
        const history = { back: [], forward: [] };
        const language = (root.I18n && typeof root.I18n.currentLanguage === 'function' && root.I18n.currentLanguage()) || undefined;
        let dateFormat;
        try { dateFormat = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }); } catch (error) { dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }

        const el = (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
        const button = (text, className, title, icon) => { const node = el('button', className, icon ? null : text); if (icon) node.innerHTML = iconSvg(icon); node.type = 'button'; if (title) { node.title = title; node.setAttribute('aria-label', title); } return node; };

        const icon = name => { const span = el('span', 'rr-folder-picker-icon'); span.innerHTML = iconSvg(name); return span; };
        const overlay = el('div', 'rr-modal-overlay rr-folder-picker-overlay');
        overlay.id = 'rr-folder-picker';
        const modal = el('div', 'rr-modal rr-folder-picker');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        const header = el('div', 'rr-modal-header');
        const title = el('div', 'rr-modal-title', options.title || tt('Choose a folder'));
        const close = button('×', 'rr-modal-close', tt('Cancel'));
        header.append(title, close);

        const body = el('div', 'rr-modal-body');
        const bar = el('div', 'rr-folder-picker-bar');
        const backButton = button('', 'rr-btn-secondary rr-folder-picker-tool', tt('Go back') + ' (Alt+←)', 'back');
        const forwardButton = button('', 'rr-btn-secondary rr-folder-picker-tool', tt('Go forward') + ' (Alt+→)', 'forward');
        const up = button('', 'rr-btn-secondary rr-folder-picker-tool', tt('Up one folder') + ' (Alt+↑)', 'up');
        const refresh = button('', 'rr-btn-secondary rr-folder-picker-tool', tt('Refresh') + ' (F5)', 'refresh');
        const field = el('input', 'rr-input');
        field.type = 'text';
        field.spellcheck = false;
        field.setAttribute('autocomplete', 'off');
        const suggestions = el('datalist');
        suggestions.id = 'rr-folder-picker-suggestions';
        field.setAttribute('list', suggestions.id);
        bar.append(backButton, forwardButton, up, refresh, field, suggestions);
        const crumbRow = el('div', 'rr-folder-picker-crumbs');
        const main = el('div', 'rr-folder-picker-main');
        const placeList = el('div', 'rr-folder-picker-places');
        placeList.tabIndex = 0;
        placeList.setAttribute('role', 'tree');
        const list = el('div', 'rr-folder-picker-list');
        list.tabIndex = 0;
        list.setAttribute('role', 'listbox');
        const head = el('div', 'rr-folder-picker-head');
        const nameHead = button(tt('Name'), 'name');
        const modifiedHead = button(tt('Date modified'), 'modified');
        head.append(nameHead, modifiedHead);
        const rows = el('div', 'rr-folder-picker-rows');
        list.append(head, rows);
        main.append(placeList, list);
        const chosen = el('div', 'rr-folder-picker-chosen');
        body.append(bar, crumbRow, main, chosen);

        const footer = el('div', 'rr-modal-footer');
        const left = el('div', 'rr-folder-picker-footer-left');
        const makeFolder = button(tt('New Folder'), 'rr-btn-secondary', tt('New Folder') + ' (Ctrl+Shift+N)');
        const hiddenLabel = el('label');
        const hiddenBox = el('input');
        hiddenBox.type = 'checkbox';
        hiddenBox.checked = !!view.showHidden;
        hiddenLabel.append(hiddenBox, doc.createTextNode(tt('Show hidden folders')));
        hiddenLabel.title = 'Ctrl+H';
        left.append(makeFolder, hiddenLabel);
        const right = el('div', 'rr-folder-picker-footer-right');
        const cancelButton = button(tt('Cancel'), 'rr-btn-secondary');
        const ok = button(tt('Select Folder'), 'rr-button-primary');
        right.append(cancelButton, ok);
        footer.append(left, right);
        modal.append(header, body, footer);
        overlay.appendChild(modal);

        const target = () => (selected >= 0 && folders[selected]) ? folders[selected].path : current;
        const showChosen = () => { chosen.textContent = '‎' + target(); chosen.title = target(); };
        const rowsList = () => Array.from(rows.querySelectorAll('.rr-folder-picker-row'));

        const select = (index, scroll = true) => {
            selected = folders.length ? Math.max(-1, Math.min(folders.length - 1, index)) : -1;
            rowsList().forEach((row, i) => row.classList.toggle('selected', i === selected));
            if (scroll && selected >= 0) rowsList()[selected]?.scrollIntoView?.({ block: 'nearest' });
            showChosen();
            reveal(target());
        };

        // The tree on the left. Each place is a root; its arrow opens the folders in it, read the first time. The
        // folder shown (or highlighted in the list) is opened down to and marked, in the root it was reached from.
        const within = (parent, child) => { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
        const same = (a, b) => path.relative(a, b) === '';
        const rootsOf = () => Array.from(placeList.children).filter(child => child._dir != null);
        let treeCurrent = null;   // the node marked: the folder shown or highlighted
        let treeActive = null;    // the node the keyboard is on
        let treeHint = null;      // the node just clicked: marked as it is, not looked for again

        const makeNode = (label, dir, depth, group, iconName) => {
            const node = el('div', 'rr-folder-tree-node');
            const row = el('div', 'rr-folder-picker-place');
            row.style.paddingLeft = (4 + depth * 14) + 'px';
            row.setAttribute('role', 'treeitem');
            row.setAttribute('aria-expanded', 'false');
            row.title = dir;
            const twisty = el('span', 'rr-folder-tree-twisty');
            twisty.innerHTML = iconSvg('chevron');
            row.append(twisty, icon(iconName || 'folder'), el('span', 'rr-folder-picker-name', label));
            const kids = el('div', 'rr-folder-tree-children');
            kids.setAttribute('role', 'group');
            kids.hidden = true;
            node.append(row, kids);
            Object.assign(node, { _dir: dir, _depth: depth, _group: group, _loaded: false, _row: row, _kids: kids, _twisty: twisty });
            twisty.addEventListener('click', event => { event.stopPropagation(); setActive(node); toggleNode(node); });
            twisty.addEventListener('dblclick', event => event.stopPropagation());
            row.addEventListener('click', () => { setActive(node); if (!same(dir, current)) { treeHint = node; go(dir); } else markNode(node); });
            row.addEventListener('dblclick', () => toggleNode(node));
            return node;
        };
        const expandNode = node => {
            if (!node._loaded) {
                node._loaded = true;
                let inside = [];
                try { inside = listFolders(node._dir, { fs, path, os, platform, showHidden: view.showHidden, projects: false }); } catch (error) { /* unreadable: nothing to open */ }
                for (const folder of inside) node._kids.appendChild(makeNode(folder.name, folder.path, node._depth + 1, 'folder'));
                if (!inside.length) node._twisty.classList.add('empty');
                Array.from(node._kids.children).forEach(child => markLeaf(child));
            }
            if (!node._kids.children.length) return;
            node._kids.hidden = false;
            node._twisty.classList.add('open');
            node._row.setAttribute('aria-expanded', 'true');
        };
        // A folder with no folders in it loses its arrow, found without holding the window up: the first folder in it
        // ends the look, and a folder nothing can be read from keeps its arrow.
        const markLeaf = async node => {
            let dir = null;
            try {
                dir = await fs.promises.opendir(node._dir);
                for await (const entry of dir) {
                    if (SKIP.has(entry.name.toLowerCase())) continue;
                    if (!view.showHidden && isHidden(entry.name, node._dir, { platform, home: os.homedir(), path })) continue;
                    if (entry.isDirectory() || entry.isSymbolicLink()) return;
                }
                if (!node._loaded) node._twisty.classList.add('empty');
            } catch (error) { /* unreadable: keep the arrow */ }
            finally { if (dir) { try { await dir.close(); } catch (error) { /* closed when read through */ } } }
        };
        const collapseNode = node => {
            if (!node._kids.children.length) return;
            node._kids.hidden = true;
            node._twisty.classList.remove('open');
            node._row.setAttribute('aria-expanded', 'false');
        };
        const toggleNode = node => { if (node._kids.hidden || !node._loaded) expandNode(node); else collapseNode(node); };
        const markNode = node => {
            if (treeCurrent) treeCurrent._row.classList.remove('current');
            treeCurrent = node || null;
            if (node) { node._row.classList.add('current'); node._row.scrollIntoView?.({ block: 'nearest' }); }
        };
        const setActive = node => {
            if (treeActive) treeActive._row.classList.remove('active');
            treeActive = node || null;
            if (node) { node._row.classList.add('active'); node._row.scrollIntoView?.({ block: 'nearest' }); }
        };
        const rootOf = node => { while (node && node.parentElement !== placeList) node = node.parentElement.closest('.rr-folder-tree-node'); return node; };
        /** Open the tree down to `dir` and mark it. Stays in the root already in use when it holds `dir`; otherwise the
         *  nearest root that holds it (places, bookmarks and drives before recent folders). */
        const reveal = dir => {
            if (treeHint && same(treeHint._dir, dir)) { const hinted = treeHint; treeHint = null; markNode(hinted); return; }
            treeHint = null;
            const inUse = treeCurrent && rootOf(treeCurrent);
            let node = inUse && within(inUse._dir, dir) ? inUse : null;
            if (!node) {
                const holding = rootsOf().filter(root => within(root._dir, dir));
                const pickFrom = holding.some(root => root._group !== 'recent') ? holding.filter(root => root._group !== 'recent') : holding;
                node = pickFrom.sort((a, b) => b._dir.length - a._dir.length)[0] || null;
            }
            while (node && !same(node._dir, dir)) {
                expandNode(node);
                let next = Array.from(node._kids.children).find(child => within(child._dir, dir));
                if (!next) {
                    // A hidden folder on the way (~/.cache with hidden folders off): shown in the tree all the same, dimmed.
                    const step = path.join(node._dir, path.relative(node._dir, dir).split(/[\\/]/)[0]);
                    let isFolder = false;
                    try { isFolder = fs.statSync(step).isDirectory(); } catch (error) { /* gone */ }
                    if (!isFolder) break;
                    next = makeNode(path.basename(step), step, node._depth + 1, 'folder');
                    next._row.classList.add('hidden-folder');
                    const after = Array.from(node._kids.children).find(child => child._dir.localeCompare(step, undefined, { sensitivity: 'base', numeric: true }) > 0);
                    node._kids.insertBefore(next, after || null);
                    node._twisty.classList.remove('empty');
                    node._twisty.classList.add('open');
                    node._kids.hidden = false;
                }
                node = next;
            }
            markNode(node);
        };
        /** The tree drawn again (after a refresh, a new or renamed folder, hidden folders shown): what was open stays open. */
        const drawPlaces = () => {
            const open = new Set(Array.from(placeList.querySelectorAll('.rr-folder-tree-node')).filter(node => node._loaded && !node._kids.hidden).map(node => node._dir));
            const activeDir = treeActive && treeActive._dir;
            placeList.textContent = '';
            treeCurrent = treeActive = null;
            const headings = { bookmarks: tt('Bookmarks'), recent: tt('Recent'), drives: tt('Drives') };
            let group = 'places';
            for (const place of places()) {
                if (place.group !== group) { group = place.group; if (headings[group]) placeList.appendChild(el('div', 'rr-folder-picker-group', headings[group])); }
                { const rootNode = makeNode(place.label, place.path, 0, place.group, place.icon); placeList.appendChild(rootNode); markLeaf(rootNode); }
            }
            const reopen = node => { if (open.has(node._dir)) { expandNode(node); Array.from(node._kids.children).forEach(reopen); } if (activeDir && node._dir === activeDir && !treeActive) setActive(node); };
            rootsOf().forEach(reopen);
        };
        const visibleNodes = () => Array.from(placeList.querySelectorAll('.rr-folder-tree-node')).filter(node => !node.parentElement.closest('.rr-folder-tree-children[hidden]'));
        const treeKey = event => {
            const key = event.key;
            const nodes = visibleNodes();
            const at = treeActive && nodes.includes(treeActive) ? treeActive : (treeCurrent && nodes.includes(treeCurrent) ? treeCurrent : nodes[0]);
            if (!at) return;
            const index = nodes.indexOf(at);
            const move = node => { if (node) { event.preventDefault(); setActive(node); } };
            if (key === 'ArrowDown') move(nodes[index + 1]);
            else if (key === 'ArrowUp') move(nodes[index - 1] || nodes[0]);
            else if (key === 'Home') move(nodes[0]);
            else if (key === 'End') move(nodes[nodes.length - 1]);
            else if (key === 'ArrowRight') {
                event.preventDefault();
                if (!at._loaded || at._kids.hidden) { expandNode(at); setActive(at); } else move(at._kids.children[0]);
            } else if (key === 'ArrowLeft') {
                event.preventDefault();
                if (at._loaded && !at._kids.hidden && at._kids.children.length) collapseNode(at);
                else move(at.parentElement.closest('.rr-folder-tree-node'));
            } else if (key === 'Enter' || key === ' ') {
                event.preventDefault();
                if (!same(at._dir, current)) { treeHint = at; go(at._dir); } else markNode(at);
            }
        };

        const drawCrumbs = () => {
            crumbRow.textContent = '';
            const all = crumbs(current, path);
            all.forEach((crumb, index) => {
                if (index) crumbRow.appendChild(el('span', 'rr-folder-picker-sep', '›'));
                const item = button(crumb.label, 'rr-folder-picker-crumb' + (index === all.length - 1 ? ' current' : ''), crumb.path);
                item.tabIndex = -1;
                item.addEventListener('click', () => go(crumb.path));
                crumbRow.appendChild(item);
            });
            crumbRow.scrollLeft = crumbRow.scrollWidth;
        };

        const drawHead = () => {
            const mark = by => view.sort === by ? (view.descending ? ' ▾' : ' ▴') : '';
            nameHead.textContent = tt('Name') + mark('name');
            modifiedHead.textContent = tt('Date modified') + mark('modified');
        };

        const drawRows = highlight => {
            rows.textContent = '';
            folders.forEach((folder, index) => {
                const row = el('div', 'rr-folder-picker-row' + (folder.hidden ? ' hidden-folder' : '') + (folder.project ? ' project' : ''));
                row.setAttribute('role', 'option');
                row.append(icon(folder.project ? 'project' : 'folder'), el('span', 'rr-folder-picker-name', folder.name));
                if (folder.project) row.append(el('span', 'rr-folder-picker-tag', tt('Project')));
                row.append(el('span', 'rr-folder-picker-modified', folder.modified ? dateFormat.format(new Date(folder.modified)) : ''));
                row.title = folder.path;
                row.addEventListener('click', () => select(index, false));
                row.addEventListener('dblclick', () => go(folder.path));
                row.addEventListener('contextmenu', event => { event.preventDefault(); select(index, false); menu(event, folder); });
                rows.appendChild(row);
            });
            if (!folders.length) rows.appendChild(el('div', 'rr-folder-picker-note', tt('This folder has no folders in it.')));
            drawHead();
            select(highlight ? folders.findIndex(folder => folder.path === highlight) : -1);
        };

        /** Show `dir`. Returns false (and stays) when it can't be read. `remember` false for Back/Forward/Refresh. */
        const go = (dir, highlight, record = true) => {
            const next = path.resolve(dir);
            let found;
            try { found = listFolders(next, { fs, path, os, platform, showHidden: view.showHidden }); }
            catch (error) {
                rows.textContent = '';
                rows.appendChild(el('div', 'rr-folder-picker-note', tt("This folder can't be read.") + ' ' + (error.code || error.message || '')));
                folders = []; selected = -1;
                field.value = current;
                return false;
            }
            if (record && next !== current) { history.back.push(current); history.forward = []; }
            current = next;
            folders = sortFolders(found, view.sort, view.descending);
            field.value = current;
            suggestions.textContent = '';
            up.disabled = path.dirname(current) === current;
            backButton.disabled = !history.back.length;
            forwardButton.disabled = !history.forward.length;
            drawCrumbs();
            drawRows(highlight);
            return true;
        };

        const goUp = () => { const parent = path.dirname(current); if (parent !== current) go(parent, current); };
        const goBack = () => { if (!history.back.length) return; const to = history.back.pop(); history.forward.push(current); const from = current; if (!go(to, from, false)) history.forward.pop(); else backButton.disabled = !history.back.length; };
        const goForward = () => { if (!history.forward.length) return; const to = history.forward.pop(); history.back.push(current); if (!go(to, null, false)) history.back.pop(); };
        const reload = () => { const keep = selected >= 0 ? folders[selected].path : null; drawPlaces(); go(current, keep, false); };
        const sortBy = by => { view.descending = view.sort === by ? !view.descending : false; view.sort = by; writeStored(VIEW_KEY, view); reload(); };
        const setHidden = value => { view.showHidden = !!value; hiddenBox.checked = view.showHidden; writeStored(VIEW_KEY, view); reload(); };

        const typedGo = () => {
            const typed = expandPath(field.value, { path, os, platform });
            if (!typed) return;
            let isFolder = false;
            try { isFolder = fs.statSync(typed).isDirectory(); } catch (error) { /* not there */ }
            // A file typed or pasted: its folder, with nothing highlighted.
            if (!isFolder && fs.existsSync(typed)) { if (go(path.dirname(typed))) list.focus(); return; }
            if (go(typed)) list.focus();
        };

        const complete = () => {
            const found = completions(field.value, { fs, path, os, platform, showHidden: view.showHidden });
            if (!found.length) return false;
            const start = found.length === 1 ? found[0] + path.sep : commonStart(found, platform);
            if (start.length <= expandPath(field.value, { path, os, platform }).length && found.length > 1) return false;
            field.value = start;
            field.setSelectionRange(start.length, start.length);
            return true;
        };
        let suggestTimer = 0;
        field.addEventListener('input', () => {
            clearTimeout(suggestTimer);
            suggestTimer = setTimeout(() => {
                suggestions.textContent = '';
                for (const dir of completions(field.value, { fs, path, os, platform, showHidden: view.showHidden }).slice(0, 50)) {
                    const option = el('option'); option.value = dir; suggestions.appendChild(option);
                }
            }, 120);
        });

        const newFolder = async () => {
            const dialog = root.RRDialog;
            if (!dialog) return;
            const name = await dialog.prompt(tt('Folder name'), { title: tt('New Folder'), validate: text => nameProblem(text) });
            if (!name) { list.focus(); return; }
            const made = path.join(current, String(name).trim());
            try { fs.mkdirSync(made); }
            catch (error) { await dialog.alert(String(error.message || error), { title: tt('New Folder'), kind: 'error' }); return; }
            drawPlaces();
            go(current, made, false);
            list.focus();
        };
        const rename = async folder => {
            const dialog = root.RRDialog;
            if (!dialog || !folder) return;
            const name = await dialog.prompt(tt('Folder name'), { title: tt('Rename'), value: folder.name, validate: text => String(text).trim() === folder.name ? '' : nameProblem(text) });
            if (!name || String(name).trim() === folder.name) { list.focus(); return; }
            const renamed = path.join(current, String(name).trim());
            try { fs.renameSync(folder.path, renamed); }
            catch (error) { await dialog.alert(String(error.message || error), { title: tt('Rename'), kind: 'error' }); return; }
            drawPlaces();
            go(current, renamed, false);
            list.focus();
        };
        const nameProblem = text => {
            const value = String(text).trim();
            if (!value || /[\\/:*?"<>|\u0000-\u001f]/.test(value) || value === '.' || value === '..' || /[. ]$/.test(value) && platform === 'win32') return tt("That name can't be used for a folder.");
            return fs.existsSync(path.join(current, value)) ? tt('That name is taken.') : '';
        };
        const showInFileManager = dir => { try { if (typeof nw !== 'undefined' && nw.Shell) nw.Shell.showItemInFolder(dir); } catch (error) { /* no shell */ } };
        const menu = (event, folder) => {
            const contextMenu = root.RRContextMenu;
            if (!contextMenu) return;
            contextMenu.show(event.clientX, event.clientY, [
                { label: tt('New Folder'), shortcut: 'Ctrl+Shift+N', action: newFolder },
                { label: tt('Rename'), shortcut: 'F2', enabled: !!folder, action: () => rename(folder) },
                { separator: true },
                { label: tt('Show in File Manager'), action: () => showInFileManager(folder ? folder.path : current) }
            ]);
            const shown = doc.querySelector('.rr-context-menu');
            if (shown) shown.style.zIndex = '10700';
        };

        let settled = false;
        const keys = root.RRKeyboardNavigation && root.RRKeyboardNavigation.modal
            ? root.RRKeyboardNavigation.modal(overlay, { onEscape: () => finish(''), initialFocus: () => list }) : null;
        const finish = value => {
            if (settled) return;
            settled = true;
            if (onScreen === onKey) onScreen = null;
            clearTimeout(suggestTimer);
            overlay.remove();
            if (keys) { keys.leave(); keys.dispose(); }
            if (value) remember(value);
            resolve(value || '');
        };
        const accept = () => {
            const dir = target();
            try { if (fs.statSync(dir).isDirectory()) { finish(dir); return; } } catch (error) { /* gone meanwhile */ }
            reload();
        };

        const onKey = event => {
            // A question or a menu shown on top answers its own keys.
            if (doc.getElementById('rr-themed-dialog') || doc.querySelector('.rr-context-menu')) return;
            const key = event.key;
            const ctrl = event.ctrlKey || event.metaKey;
            if (key === 'Tab' && event.target === field && !event.shiftKey && !ctrl && !event.altKey) {
                if (complete()) { event.preventDefault(); event.stopImmediatePropagation(); }
                return;
            }
            if (key === 'Tab' || key === 'F11' || key === 'F12') return;
            event.stopImmediatePropagation();
            if (key === 'Escape') { event.preventDefault(); if (!event.repeat) finish(''); return; }
            if (key === 'F5' || (ctrl && /^r$/i.test(key))) { event.preventDefault(); reload(); return; }
            if ((ctrl && /^l$/i.test(key)) || (event.altKey && /^d$/i.test(key))) { event.preventDefault(); field.focus(); field.select(); return; }
            if (ctrl && /^h$/i.test(key)) { event.preventDefault(); setHidden(!view.showHidden); return; }
            if (ctrl && event.shiftKey && /^n$/i.test(key)) { event.preventDefault(); newFolder(); return; }
            if (event.altKey && key === 'ArrowLeft') { event.preventDefault(); goBack(); return; }
            if (event.altKey && key === 'ArrowRight') { event.preventDefault(); goForward(); return; }
            if (event.altKey && key === 'ArrowUp') { event.preventDefault(); goUp(); return; }
            // Open, New, Save and the rest of the editor's shortcuts wait; the browser does not act on them either.
            if (ctrl && /^[nos]$/i.test(key)) { event.preventDefault(); return; }
            if (event.target === field) {
                if (key === 'Enter' && !event.isComposing) { event.preventDefault(); typedGo(); }
                return;
            }
            if (event.target === hiddenBox) return;
            if (placeList.contains(event.target)) { if (!ctrl && !event.altKey) treeKey(event); return; }
            const onButton = event.target && event.target.tagName === 'BUTTON';
            if (key === 'Enter') {
                if (onButton || event.repeat) return;   // the focused button is pressed by the browser
                event.preventDefault();
                if (selected >= 0) go(folders[selected].path); else accept();
                return;
            }
            if (onButton) return;
            if (key === 'F2') { event.preventDefault(); if (selected >= 0) rename(folders[selected]); }
            else if (key === 'ArrowDown') { event.preventDefault(); select(selected + 1); }
            else if (key === 'ArrowUp') { event.preventDefault(); select(selected <= 0 ? 0 : selected - 1); }
            else if (key === 'Home') { event.preventDefault(); select(0); }
            else if (key === 'End') { event.preventDefault(); select(folders.length - 1); }
            else if (key === 'PageDown' || key === 'PageUp') { event.preventDefault(); select(selected + (key === 'PageDown' ? 10 : -10)); }
            else if (key === 'ArrowRight') { if (selected >= 0) { event.preventDefault(); go(folders[selected].path); } }
            else if (key === 'Backspace' || key === 'ArrowLeft') { event.preventDefault(); goUp(); }
            else if (key === 'ContextMenu' || (event.shiftKey && key === 'F10')) {
                event.preventDefault();
                const row = rowsList()[selected] || list;
                const box = row.getBoundingClientRect();
                menu({ clientX: box.left + 24, clientY: box.bottom }, folders[selected] || null);
            }
            else if (key.length === 1 && !ctrl && !event.altKey) {
                // A letter jumps to the next folder starting with it.
                const letter = key.toLowerCase();
                const order = folders.map((folder, index) => index).filter(index => folders[index].name.toLowerCase().startsWith(letter));
                if (order.length) select(order.find(index => index > selected) ?? order[0]);
            }
        };

        close.addEventListener('click', () => finish(''));
        cancelButton.addEventListener('click', () => finish(''));
        ok.addEventListener('click', accept);
        up.addEventListener('click', goUp);
        backButton.addEventListener('click', goBack);
        forwardButton.addEventListener('click', goForward);
        refresh.addEventListener('click', reload);
        nameHead.addEventListener('click', () => sortBy('name'));
        modifiedHead.addEventListener('click', () => sortBy('modified'));
        hiddenBox.addEventListener('change', () => setHidden(hiddenBox.checked));
        makeFolder.addEventListener('click', newFolder);
        rows.addEventListener('mousedown', event => { if (event.target === rows) select(-1); });
        list.addEventListener('contextmenu', event => { if (event.target === rows || event.target === list) { event.preventDefault(); select(-1); menu(event, null); } });
        // A folder (or a file in it) dragged in from the file manager.
        let dragDepth = 0;
        modal.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; modal.classList.add('dropping'); });
        modal.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; modal.classList.remove('dropping'); } });
        modal.addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'link'; });
        modal.addEventListener('drop', event => {
            event.preventDefault();
            dragDepth = 0; modal.classList.remove('dropping');
            const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
            const dropped = file && file.path;
            if (!dropped) return;
            let isFolder = false;
            try { isFolder = fs.statSync(dropped).isDirectory(); } catch (error) { return; }
            if (isFolder) go(path.dirname(dropped) === dropped ? dropped : path.dirname(dropped), dropped);
            else go(path.dirname(dropped));
            list.focus();
        });

        hostFor(doc).appendChild(overlay);
        onScreen = onKey;
        drawPlaces();
        if (!go(current, null, false)) go(os.homedir(), null, false);
        if (keys) keys.enter(list); else list.focus();
    }

    const api = { pick, listFolders, sortFolders, places, startFolder, isProject, isHidden, expandPath, xdgUserDirs, gtkBookmarks, kdePlaces,
        windowsKnownFolders, crumbs, completions, commonStart, withRecent };
    root.RRFolderPicker = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
