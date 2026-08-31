(function () {
    'use strict';

    const DB_NAME = 'RPGReactorWeb';
    const DB_VERSION = 1;
    const STORE_NAME = 'files';
    const PROJECT_ROOT = '/project';
    document.documentElement.classList.add('rr-web');

    function tt(text, replacements = {}) {
        const translated = window.I18n && typeof window.I18n.tText === 'function'
            ? window.I18n.tText(text)
            : text;
        return Object.entries(replacements).reduce((result, [key, value]) => (
            result.split(`{${key}}`).join(String(value))
        ), translated);
    }

    // Editor code writes binary data through Node's Buffer — rig binaries,
    // zip and PNG exports, base64 decodes across the Forge generators. A
    // browser has none of it, so every such feature threw at the first
    // Buffer.from. This covers exactly the API surface the editor uses;
    // instances are real Uint8Arrays, which the fs shim and every consumer
    // already accept.
    if (typeof window.Buffer === 'undefined') {
        class WebBuffer extends Uint8Array {
            static from(value, encoding) {
                if (typeof value === 'string') {
                    const enc = String(encoding || 'utf8').toLowerCase();
                    if (enc === 'base64') {
                        const bin = atob(value);
                        const out = new WebBuffer(bin.length);
                        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
                        return out;
                    }
                    if (enc === 'hex') {
                        const out = new WebBuffer(value.length >> 1);
                        for (let i = 0; i < out.length; i++) out[i] = parseInt(value.substr(i * 2, 2), 16) || 0;
                        return out;
                    }
                    if (enc === 'latin1' || enc === 'binary' || enc === 'ascii') {
                        const out = new WebBuffer(value.length);
                        for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xff;
                        return out;
                    }
                    const bytes = new TextEncoder().encode(value);
                    const utf = new WebBuffer(bytes.length);
                    utf.set(bytes);
                    return utf;
                }
                if (value instanceof ArrayBuffer) {
                    const out = new WebBuffer(value.byteLength);
                    out.set(new Uint8Array(value));
                    return out;
                }
                if (ArrayBuffer.isView(value)) {
                    const out = new WebBuffer(value.byteLength);
                    out.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
                    return out;
                }
                return new WebBuffer(Uint8Array.from(value || []));
            }
            static alloc(size, fill) {
                const out = new WebBuffer(size);
                if (fill) out.fill(typeof fill === 'number' ? fill : 0);
                return out;
            }
            static allocUnsafe(size) { return new WebBuffer(size); }
            static concat(list, totalLength) {
                let total = totalLength;
                if (total === undefined) {
                    total = 0;
                    for (const item of list) total += item.length;
                }
                const out = new WebBuffer(total);
                let offset = 0;
                for (const item of list) {
                    if (offset >= total) break;
                    const chunk = item.length > total - offset ? item.subarray(0, total - offset) : item;
                    out.set(chunk, offset);
                    offset += chunk.length;
                }
                return out;
            }
            static isBuffer(value) { return value instanceof WebBuffer; }
            static byteLength(value, encoding) { return WebBuffer.from(value, encoding).length; }
            _view() { return new DataView(this.buffer, this.byteOffset, this.byteLength); }
            writeUInt8(v, o = 0) { this[o] = v & 0xff; return o + 1; }
            writeUInt16LE(v, o = 0) { this._view().setUint16(o, v, true); return o + 2; }
            writeUInt16BE(v, o = 0) { this._view().setUint16(o, v, false); return o + 2; }
            writeUInt32LE(v, o = 0) { this._view().setUint32(o, v >>> 0, true); return o + 4; }
            writeUInt32BE(v, o = 0) { this._view().setUint32(o, v >>> 0, false); return o + 4; }
            readUInt8(o = 0) { return this[o]; }
            readUInt16LE(o = 0) { return this._view().getUint16(o, true); }
            readUInt16BE(o = 0) { return this._view().getUint16(o, false); }
            readUInt32LE(o = 0) { return this._view().getUint32(o, true); }
            readUInt32BE(o = 0) { return this._view().getUint32(o, false); }
            write(string, offset, encoding) {
                const start = typeof offset === 'number' ? offset : 0;
                const enc = typeof offset === 'string' ? offset : encoding;
                const bytes = WebBuffer.from(string, enc);
                const length = Math.min(bytes.length, this.length - start);
                this.set(bytes.subarray(0, length), start);
                return length;
            }
            copy(target, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
                const chunk = this.subarray(sourceStart, sourceEnd);
                target.set(chunk, targetStart);
                return chunk.length;
            }
            slice(start, end) { return this.subarray(start, end); }
            equals(other) {
                if (!other || other.length !== this.length) return false;
                for (let i = 0; i < this.length; i++) if (this[i] !== other[i]) return false;
                return true;
            }
            toString(encoding, start = 0, end = this.length) {
                const sub = this.subarray(start, end);
                const enc = String(encoding || 'utf8').toLowerCase();
                if (enc === 'base64' || enc === 'latin1' || enc === 'binary' || enc === 'ascii') {
                    let bin = '';
                    for (let i = 0; i < sub.length; i += 0x8000) {
                        bin += String.fromCharCode.apply(null, sub.subarray(i, i + 0x8000));
                    }
                    return enc === 'base64' ? btoa(bin) : bin;
                }
                if (enc === 'hex') {
                    let out = '';
                    for (let i = 0; i < sub.length; i++) out += sub[i].toString(16).padStart(2, '0');
                    return out;
                }
                return new TextDecoder('utf-8').decode(sub);
            }
        }
        window.Buffer = WebBuffer;
    }

    function normalizePath(value) {
        const absolute = String(value || '').replace(/\\/g, '/').startsWith('/');
        const parts = [];
        for (const part of String(value || '').replace(/\\/g, '/').split('/')) {
            if (!part || part === '.') continue;
            if (part === '..') parts.pop();
            else parts.push(part);
        }
        return `${absolute ? '/' : ''}${parts.join('/')}` || (absolute ? '/' : '.');
    }

    function safeRelativePath(value) {
        const normalized = String(value || '').replace(/\\/g, '/');
        if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)
            || /[\0-\x1f\x7f<>:"|?*]/.test(normalized)) {
            throw new Error(tt('The export path is not safe.'));
        }
        const parts = normalized.split('/');
        if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))) {
            throw new Error(tt('The export path is not safe.'));
        }
        return parts.join('/');
    }

    function createPathApi() {
        return {
            sep: '/',
            join: (...parts) => normalizePath(parts.filter(Boolean).join('/')),
            resolve: (...parts) => normalizePath(`/${parts.filter(Boolean).join('/')}`),
            normalize: normalizePath,
            isAbsolute: value => String(value || '').replace(/\\/g, '/').startsWith('/'),
            basename(value, suffix = '') {
                const name = normalizePath(value).split('/').pop() || '';
                return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
            },
            dirname(value) {
                const normalized = normalizePath(value);
                const index = normalized.lastIndexOf('/');
                if (index <= 0) return normalized.startsWith('/') ? '/' : '.';
                return normalized.slice(0, index);
            },
            extname(value) {
                const name = this.basename(value);
                const index = name.lastIndexOf('.');
                return index > 0 ? name.slice(index) : '';
            },
            relative(from, to) {
                const fromParts = normalizePath(from).split('/').filter(Boolean);
                const toParts = normalizePath(to).split('/').filter(Boolean);
                while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
                    fromParts.shift();
                    toParts.shift();
                }
                return [...fromParts.map(() => '..'), ...toParts].join('/') || '';
            },
        };
    }

    function projectRelative(filePath) {
        const normalized = normalizePath(filePath);
        if (normalized === PROJECT_ROOT) return '';
        if (!normalized.startsWith(`${PROJECT_ROOT}/`)) {
            throw new Error(tt('Path is outside the Reactor One web project: {filePath}', { filePath }));
        }
        return normalized.slice(PROJECT_ROOT.length + 1);
    }

    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                    request.result.createObjectStore(STORE_NAME, { keyPath: 'path' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function readStoredFiles(db) {
        return new Promise((resolve, reject) => {
            const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    function createFileSystem(manifest, db) {
        const entries = new Map();
        const contents = new Map(Object.entries(manifest.mutable || {}));
        const bundledEntries = new Map();
        const bundledContents = new Map(contents);
        const storedPaths = new Set();
        const pending = new Set();

        for (const entry of manifest.files || []) entries.set(entry.path, { ...entry });
        entries.set('', { path: '', type: 'directory', size: 0 });
        for (const [entryPath, entry] of entries) bundledEntries.set(entryPath, { ...entry });

        const ensureParents = relativePath => {
            const parts = relativePath.split('/');
            parts.pop();
            let current = '';
            for (const part of parts) {
                current = current ? `${current}/${part}` : part;
                if (!entries.has(current)) entries.set(current, { path: current, type: 'directory', size: 0 });
            }
        };

        // A rejected write used to be dropped from `pending` by its own
        // .finally() before flush() ever awaited it, so a browser storage
        // failure — quota exceeded is the realistic one — left the in-memory
        // file updated, flush() reporting success, and nothing on disk. The
        // project silently reverted to its last persisted state on reload.
        // Record failures instead and let flush() surface them.
        const failures = [];
        const track = (operation, relativePath) => {
            pending.add(operation);
            operation
                .catch(error => {
                    failures.push({ path: relativePath, error });
                    console.error(`Web project write failed for ${relativePath}:`, error);
                })
                .finally(() => pending.delete(operation));
        };

        const persist = (relativePath, data) => {
            track(new Promise((resolve, reject) => {
                const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({
                    path: relativePath,
                    data,
                    updatedAt: Date.now(),
                });
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            }), relativePath);
        };

        const fs = {
            existsSync(filePath) {
                try { return entries.has(projectRelative(filePath)); } catch { return false; }
            },
            readFileSync(filePath, encoding) {
                const relativePath = projectRelative(filePath);
                if (!contents.has(relativePath)) {
                    // No synchronous byte source exists here: a sync XHR
                    // deadlocks against the service worker (it reads the same
                    // IndexedDB store the page writes; a blocked main thread
                    // can never finish its transaction). Binary consumers use
                    // readFileAsync; small sidecar JSON is preloaded.
                    throw new Error(tt('Web project file is not preloaded for synchronous access: {relativePath}', { relativePath }));
                }
                const data = contents.get(relativePath);
                if (encoding || typeof data === 'string') return typeof data === 'string' ? data : new TextDecoder().decode(data);
                return data;
            },
            async readFileAsync(filePath, encoding) {
                const relativePath = projectRelative(filePath);
                if (contents.has(relativePath)) return this.readFileSync(filePath, encoding);
                const entry = entries.get(relativePath);
                if (!entry || entry.type !== 'file') {
                    throw new Error(tt('File not found: {filePath}', { filePath }));
                }
                // The service worker overlays browser-saved edits, so this
                // fetch sees the same file a reload would.
                const url = new URL(`project/${relativePath.split('/').map(encodeURIComponent).join('/')}`, document.baseURI).href;
                const response = await fetch(url);
                if (!response.ok) throw new Error(tt('File not found: {filePath}', { filePath }));
                const bytes = new Uint8Array(await response.arrayBuffer());
                if (encoding) return new TextDecoder().decode(bytes);
                return bytes;
            },
            /**
             * Fetch every file under a directory into the sync cache, so
             * consumers built around readFileSync (the Effekseer loader
             * reads an effect and its textures synchronously mid-decode)
             * can run after one asynchronous warm-up.
             */
            async preloadForSync(dirPath) {
                const prefix = projectRelative(dirPath).replace(/\/+$/, '') + '/';
                const wanted = [];
                for (const [relativePath, entry] of entries) {
                    if (entry.type !== 'file') continue;
                    if (!relativePath.startsWith(prefix)) continue;
                    if (contents.has(relativePath)) continue;
                    wanted.push(relativePath);
                }
                await Promise.all(wanted.map(async relativePath => {
                    const url = new URL(`project/${relativePath.split('/').map(encodeURIComponent).join('/')}`, document.baseURI).href;
                    const response = await fetch(url);
                    if (!response.ok) return;
                    contents.set(relativePath, new Uint8Array(await response.arrayBuffer()));
                }));
                return wanted.length;
            },
            writeFileSync(filePath, data) {
                const relativePath = projectRelative(filePath);
                const stored = typeof data === 'string' ? data : new Uint8Array(data);
                ensureParents(relativePath);
                contents.set(relativePath, stored);
                entries.set(relativePath, {
                    path: relativePath,
                    type: 'file',
                    size: typeof stored === 'string' ? new Blob([stored]).size : stored.byteLength,
                    updatedAt: Date.now(),
                });
                storedPaths.add(relativePath);
                persist(relativePath, stored);
            },
            appendFileSync(filePath, data) {
                let current = '';
                try { current = this.readFileSync(filePath, 'utf8'); } catch {}
                this.writeFileSync(filePath, current + data);
            },
            mkdirSync(dirPath) {
                const relativePath = projectRelative(dirPath);
                ensureParents(`${relativePath}/placeholder`);
                entries.set(relativePath, { path: relativePath, type: 'directory', size: 0 });
            },
            readdirSync(dirPath, options = {}) {
                const relativePath = projectRelative(dirPath);
                const prefix = relativePath ? `${relativePath}/` : '';
                const children = new Map();
                for (const entry of entries.values()) {
                    if (!entry.path.startsWith(prefix) || entry.path === relativePath) continue;
                    const remainder = entry.path.slice(prefix.length);
                    if (!remainder || remainder.includes('/')) continue;
                    children.set(remainder, entry);
                }
                if (!options.withFileTypes) return [...children.keys()].sort();
                return [...children.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, entry]) => ({
                    name,
                    isDirectory: () => entry.type === 'directory',
                    isFile: () => entry.type === 'file',
                    isSymbolicLink: () => false,
                }));
            },
            statSync(filePath) {
                const relativePath = projectRelative(filePath);
                const entry = entries.get(relativePath);
                if (!entry) throw new Error(tt('File not found: {filePath}', { filePath }));
                return {
                    size: entry.size || 0,
                    mtimeMs: entry.updatedAt || 0,
                    isDirectory: () => entry.type === 'directory',
                    isFile: () => entry.type === 'file',
                    isSymbolicLink: () => false,
                };
            },
            unlinkSync(filePath) {
                const relativePath = projectRelative(filePath);
                entries.delete(relativePath);
                contents.delete(relativePath);
                storedPaths.delete(relativePath);
                track(new Promise((resolve, reject) => {
                    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(relativePath);
                    request.onsuccess = resolve;
                    request.onerror = () => reject(request.error);
                }), relativePath);
            },
            rmSync(filePath, options = {}) {
                const relativePath = projectRelative(filePath);
                if (options.recursive) {
                    for (const key of [...entries.keys()]) {
                        if (key === relativePath || key.startsWith(`${relativePath}/`)) this.unlinkSync(`${PROJECT_ROOT}/${key}`);
                    }
                } else this.unlinkSync(filePath);
            },
            rmdirSync(dirPath) {
                const relativePath = projectRelative(dirPath);
                const entry = entries.get(relativePath);
                if (!entry || entry.type !== 'directory') {
                    const error = new Error(tt('Not a directory: {dirPath}', { dirPath }));
                    error.code = 'ENOTDIR';
                    throw error;
                }
                if (this.readdirSync(dirPath).length) {
                    const error = new Error(tt('Directory is not empty: {dirPath}', { dirPath }));
                    error.code = 'ENOTEMPTY';
                    throw error;
                }
                entries.delete(relativePath);
            },
            copyFileSync(source, destination) {
                this.writeFileSync(destination, this.readFileSync(source));
            },
            realpathSync(filePath) { return normalizePath(filePath); },
            async flush() {
                // Settled, not all: a rejection is already recorded in
                // `failures`, and throwing here would hide the writes that did
                // succeed. Report afterwards so the caller cannot mistake a
                // failed save for a completed one.
                await Promise.allSettled([...pending]);
                if (failures.length === 0) return;
                const failed = failures.splice(0, failures.length);
                const names = failed.map(entry => entry.path).join(', ');
                const error = new Error(tt('Could not save to browser storage: {names}', { names }));
                error.failures = failed;
                throw error;
            },
            hasPendingWriteFailures() { return failures.length > 0; },
            hasStoredFile(filePath) { return storedPaths.has(projectRelative(filePath)); },
            restoreBundledFileSync(filePath) {
                const relativePath = projectRelative(filePath);
                const bundledEntry = bundledEntries.get(relativePath);
                if (bundledEntry) entries.set(relativePath, { ...bundledEntry });
                else entries.delete(relativePath);
                if (bundledContents.has(relativePath)) contents.set(relativePath, bundledContents.get(relativePath));
                else contents.delete(relativePath);
                storedPaths.delete(relativePath);
                track(new Promise((resolve, reject) => {
                    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(relativePath);
                    request.onsuccess = resolve;
                    request.onerror = () => reject(request.error);
                }), relativePath);
            },
            _entryIdentity(filePath) { return entries.get(projectRelative(filePath)) || null; },
            _applyStored(record) {
                ensureParents(record.path);
                contents.set(record.path, record.data);
                entries.set(record.path, {
                    path: record.path,
                    type: 'file',
                    size: typeof record.data === 'string' ? new Blob([record.data]).size : record.data.byteLength,
                    updatedAt: record.updatedAt,
                });
                storedPaths.add(record.path);
            },
        };
        return fs;
    }

    function createPlaytestModal() {
        let modal = document.getElementById('web-playtest-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'web-playtest-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.92);display:none;flex-direction:column;padding:14px;';
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;color:#fff;padding:0 0 10px;font:600 13px sans-serif;';
        const title = document.createElement('span');
        title.textContent = tt('Reactor One - Browser Playtest');
        toolbar.appendChild(title);
        const close = document.createElement('button');
        close.textContent = tt('Close Playtest');
        close.className = 'graphic-selector-button';
        close.onclick = () => {
            modal.style.display = 'none';
            const frame = modal.querySelector('iframe');
            if (frame) frame.src = 'about:blank';
            // Wake the editor back up. When the 3D view is enabled its own
            // loop renders and PIXI's ticker stays stopped, exactly as the
            // 3D view arranged it.
            const editor3d = window.reactor?.projectController?.mapEditor3D;
            if (editor3d) editor3d.suspended = false;
            if (!editor3d?.isEnabled?.()) window.reactor?.projectController?.app?.start?.();
        };
        toolbar.appendChild(close);
        const frame = document.createElement('iframe');
        frame.allow = 'autoplay; fullscreen; gamepad';
        frame.style.cssText = 'flex:1;width:100%;border:1px solid #555;background:#000;';
        modal.append(toolbar, frame);
        document.body.appendChild(modal);
        return modal;
    }

    async function valueToBlob(data, mimeType) {
        if (data instanceof Blob) return data.type || !mimeType ? data : data.slice(0, data.size, mimeType);
        if (typeof data === 'string' && data.startsWith('data:')) return fetch(data).then(response => response.blob());
        return new Blob([data], { type: mimeType || 'application/octet-stream' });
    }

    async function writeDirectoryFile(rootHandle, relativePath, blob, createdDirectories = null, destination = null, state = null) {
        const parts = safeRelativePath(relativePath).split('/');
        const fileName = parts.pop();
        let directory = destination?.directory || rootHandle;
        if (!destination) {
            for (const part of parts) {
                const parent = directory;
                try {
                    directory = await parent.getDirectoryHandle(part);
                } catch (error) {
                    if (error.name !== 'NotFoundError') throw error;
                    directory = await parent.getDirectoryHandle(part, { create: true });
                    createdDirectories?.push({ parent, name: part, handle: directory });
                }
            }
        }
        const fileHandle = destination?.handle
            || await directory.getFileHandle(fileName, { create: true });
        if (state) Object.assign(state, { directory, fileName, handle: fileHandle });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { directory, fileName, handle: fileHandle };
    }

    async function existingDirectoryFile(rootHandle, relativePath) {
        const parts = safeRelativePath(relativePath).split('/');
        const fileName = parts.pop();
        let directory = rootHandle;
        try {
            for (const part of parts) directory = await directory.getDirectoryHandle(part);
            const handle = await directory.getFileHandle(fileName);
            return { directory, fileName, handle, file: await handle.getFile() };
        } catch (error) {
            if (error.name === 'NotFoundError') return null;
            throw error;
        }
    }

    async function sameBlobBytes(left, right) {
        if (!left || !right || left.size !== right.size) return false;
        const leftBytes = new Uint8Array(await left.arrayBuffer());
        const rightBytes = new Uint8Array(await right.arrayBuffer());
        return leftBytes.every((value, index) => value === rightBytes[index]);
    }

    function bytesOf(value) {
        if (typeof value === 'string') return new TextEncoder().encode(value);
        return value instanceof Uint8Array ? value : new Uint8Array(value);
    }

    function sameBytes(left, right) {
        const a = bytesOf(left);
        const b = bytesOf(right);
        return a.length === b.length && a.every((value, index) => value === b[index]);
    }

    function installFileUrlBridge(host) {
        const rewrite = value => {
            if (typeof value !== 'string' || !value.startsWith('file://')) return value;
            try {
                return host.assetUrl(decodeURI(value.slice('file://'.length)));
            } catch {
                return value;
            }
        };

        const setAttribute = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function(name, value) {
            return setAttribute.call(this, name, String(name).toLowerCase() === 'src' ? rewrite(value) : value);
        };

        for (const prototype of [HTMLImageElement.prototype, HTMLMediaElement.prototype, HTMLSourceElement.prototype]) {
            const descriptor = Object.getOwnPropertyDescriptor(prototype, 'src');
            if (!descriptor?.set || !descriptor.get) continue;
            Object.defineProperty(prototype, 'src', {
                configurable: descriptor.configurable,
                enumerable: descriptor.enumerable,
                get: descriptor.get,
                set(value) { descriptor.set.call(this, rewrite(value)); },
            });
        }

        const NativeAudio = window.Audio;
        window.Audio = new Proxy(NativeAudio, {
            apply(target, thisArg, args) {
                if (args.length) args[0] = rewrite(args[0]);
                return Reflect.apply(target, thisArg, args);
            },
            construct(target, args, newTarget) {
                if (args.length) args[0] = rewrite(args[0]);
                return Reflect.construct(target, args, newTarget);
            },
        });

        const fetchRequest = window.fetch.bind(window);
        window.fetch = (input, options) => fetchRequest(typeof input === 'string' ? rewrite(input) : input, options);
        const xhrOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            return xhrOpen.call(this, method, rewrite(url), ...args);
        };
    }

    window.RPGReactorWebHost = {
        mode: 'web',
        version: '0.98.4',
        projectRoot: PROJECT_ROOT,
        fs: null,
        path: createPathApi(),
        db: null,
        manifest: null,
        async initialize() {
            const response = await fetch('web/project-manifest.json');
            if (!response.ok) throw new Error(tt('Could not load Reactor One manifest ({status})', { status: response.status }));
            this.manifest = await response.json();
            this.version = this.manifest.editorVersion || this.version;
            this.db = await openDatabase();
            this.fs = createFileSystem(this.manifest, this.db);
            const storedRecords = await readStoredFiles(this.db);
            for (const record of storedRecords) this.fs._applyStored(record);
            // Browser-saved edits shadow the bundled project, so a player
            // returning after an update keeps seeing the OLD Reactor One —
            // and its new content looks broken or missing. The bundle is
            // stamped by its manifest; when the stamp changes under stored
            // edits, offer the new version up front instead of silently
            // serving stale files.
            let bundleStamp = this.version + ':';
            {
                const text = JSON.stringify(this.manifest);
                let hash = 5381;
                for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
                bundleStamp += hash.toString(36);
            }
            let previousStamp = null;
            try { previousStamp = localStorage.getItem('rrWebBundleStamp'); } catch (error) { /* private mode */ }
            if (storedRecords.length && previousStamp && previousStamp !== bundleStamp
                && confirm(tt('This update ships a newer Reactor One than your browser-saved copy. Load the new version and discard your browser edits?'))) {
                try { localStorage.setItem('rrWebBundleStamp', bundleStamp); } catch (error) { /* best effort */ }
                await this.resetProject();
                return;
            }
            try { localStorage.setItem('rrWebBundleStamp', bundleStamp); } catch (error) { /* best effort */ }
            window.RPGReactorHost = this;
            if (window.RREncryptedAssets?.useFileSystem) {
                window.RREncryptedAssets.useFileSystem(this.fs, this.path, filePath => this.assetUrl(filePath));
                window.RPGReactorAssetUrl = window.RREncryptedAssets.resolveAssetUrl;
            } else {
                window.RPGReactorAssetUrl = filePath => this.assetUrl(filePath);
            }
            installFileUrlBridge(this);
            window.require = moduleName => {
                if (moduleName === 'fs') return this.fs;
                if (moduleName === 'path') return this.path;
                if (moduleName === 'url') return { pathToFileURL: filePath => ({ href: this.assetUrl(filePath) }) };
                throw new Error(tt('Node module "{moduleName}" is unavailable in RPG Reactor Web.', { moduleName }));
            };
            if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
            if ('serviceWorker' in navigator) {
                try {
                    await navigator.serviceWorker.register('service-worker.js', { scope: './' });
                    await navigator.serviceWorker.ready;
                    if (!navigator.serviceWorker.controller) {
                        await Promise.race([
                            new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })),
                            new Promise(resolve => setTimeout(resolve, 1000)),
                        ]);
                    }
                    if (!navigator.serviceWorker.controller && !sessionStorage.getItem('rr-web-sw-reload')) {
                        sessionStorage.setItem('rr-web-sw-reload', '1');
                        location.reload();
                        await new Promise(() => {});
                    }
                    if (navigator.serviceWorker.controller) sessionStorage.removeItem('rr-web-sw-reload');
                } catch (error) {
                    console.warn(`Edited playtest overlay is unavailable: ${error.name || 'Error'}: ${error.message || error}`);
                }
            }
        },
        assetUrl(filePath) {
            const relativePath = projectRelative(filePath).split('/').map(encodeURIComponent).join('/');
            return new URL(`project/${relativePath}`, document.baseURI).href;
        },
        async flush() { if (this.fs) await this.fs.flush(); },
        async saveFile({ data, projectPath = null, suggestedName = 'download.bin', mimeType = 'application/octet-stream', beforeWrite = null }) {
            const blob = await valueToBlob(data, mimeType);
            if (projectPath) {
                this.fs.writeFileSync(projectPath, new Uint8Array(await blob.arrayBuffer()));
                await this.flush();
                return { path: projectPath, project: true };
            }

            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({ suggestedName });
                    await beforeWrite?.();
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    return { path: handle.name, project: false };
                } catch (error) {
                    if (error.name === 'AbortError') return null;
                    if (error.name !== 'SecurityError' && error.name !== 'NotAllowedError') throw error;
                }
            }

            await beforeWrite?.();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = suggestedName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return { path: suggestedName, project: false, downloaded: true };
        },
        async saveFiles({ files, projectRoot = null, suggestedDirectoryName = 'RPG Reactor Export', confirmOverwrite = null, beforeWrite = null }) {
            if (projectRoot) {
                const root = normalizePath(projectRoot);
                const prepared = [];
                const targets = new Set();
                for (const file of files) {
                    const relativePath = safeRelativePath(file.path);
                    const blob = await valueToBlob(file.data, file.mimeType);
                    const target = normalizePath(`${root}/${relativePath}`);
                    if (targets.has(target)) throw new Error(tt('The export contains duplicate target paths.'));
                    targets.add(target);
                    const existed = this.fs.existsSync(target);
                    const previousValue = existed ? await this.fs.readFileAsync(target) : null;
                    prepared.push({
                        target,
                        data: new Uint8Array(await blob.arrayBuffer()),
                        existed,
                        hadStoredOverlay: existed && !!this.fs.hasStoredFile?.(target),
                        previous: typeof previousValue === 'string'
                            ? new TextEncoder().encode(previousValue)
                            : previousValue
                    });
                }
                const existingPaths = prepared.filter(item => item.existed).map(item => item.target);
                if (existingPaths.length) {
                    const allowed = confirmOverwrite
                        ? await confirmOverwrite(existingPaths)
                        : window.confirm(tt('{count} destination file(s) already exist. Replace them?', { count: existingPaths.length }));
                    if (!allowed) return null;
                }
                await beforeWrite?.();
                const written = [];
                const createdDirectories = new Map();
                try {
                    for (const item of prepared) {
                        const existsNow = this.fs.existsSync(item.target);
                        if (existsNow !== item.existed) {
                            throw new Error(tt('An export target changed before it could be written.'));
                        }
                        if (existsNow) {
                            const current = await this.fs.readFileAsync(item.target);
                            if (!sameBytes(current, item.previous)) {
                                throw new Error(tt('An export target changed before it could be written.'));
                            }
                        }
                        const relativeTarget = item.target.slice(root.length).replace(/^\/+/, '');
                        const parts = relativeTarget ? relativeTarget.split('/') : [];
                        parts.pop();
                        let parent = root;
                        const missingParents = [];
                        for (const part of parts) {
                            parent = normalizePath(`${parent}/${part}`);
                            if (!this.fs.existsSync(parent)) missingParents.push(parent);
                        }
                        this.fs.writeFileSync(item.target, item.data);
                        for (const directory of missingParents) {
                            if (!createdDirectories.has(directory)) {
                                createdDirectories.set(directory, this.fs._entryIdentity?.(directory));
                            }
                        }
                        written.push(item);
                    }
                    await this.flush();
                } catch (error) {
                    const rollbackErrors = [];
                    for (const item of written.reverse()) {
                        try {
                            if (!this.fs.existsSync(item.target)
                                || !sameBytes(await this.fs.readFileAsync(item.target), item.data)) {
                                throw new Error(tt('An export target changed before rollback could restore it.'));
                            }
                            if (item.existed && item.hadStoredOverlay) this.fs.writeFileSync(item.target, item.previous);
                            else if (item.existed) this.fs.restoreBundledFileSync(item.target);
                            else if (this.fs.existsSync(item.target)) this.fs.unlinkSync(item.target);
                        } catch (rollbackError) {
                            rollbackErrors.push(rollbackError);
                        }
                    }
                    for (const [directory, identity] of [...createdDirectories].sort(([a], [b]) => b.length - a.length)) {
                        try {
                            if (this.fs._entryIdentity?.(directory) !== identity) {
                                throw new Error(tt('An export directory changed before rollback could remove it.'));
                            }
                            if (identity && !this.fs.readdirSync(directory).length) {
                                this.fs.rmdirSync(directory);
                            }
                        } catch (rollbackError) {
                            if (rollbackError?.code !== 'ENOENT' && rollbackError?.code !== 'ENOTEMPTY') {
                                rollbackErrors.push(rollbackError);
                            }
                        }
                    }
                    try { await this.flush(); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
                    if (!rollbackErrors.length) throw error;
                    throw new Error(`${error.message} ${tt('Export rollback was incomplete:')} ${rollbackErrors.map(item => item.message).join('; ')}`);
                }
                return { path: root, project: true };
            }
            if (files.length === 1) {
                const file = files[0];
                return this.saveFile({
                    data: file.data,
                    suggestedName: file.path,
                    mimeType: file.mimeType,
                    beforeWrite
                });
            }
            if (!window.showDirectoryPicker) {
                throw new Error(tt('This export contains multiple files. Use a browser with directory picker support or open a project first.'));
            }
            let directory;
            try {
                directory = await window.showDirectoryPicker({ id: suggestedDirectoryName, mode: 'readwrite' });
            } catch (error) {
                if (error.name === 'AbortError') return null;
                throw error;
            }
            const existing = [];
            for (const file of files) {
                const found = await existingDirectoryFile(directory, file.path);
                if (found) existing.push({ path: file.path, ...found });
            }
            if (existing.length) {
                const allowed = confirmOverwrite
                    ? await confirmOverwrite(existing.map(item => item.path))
                    : window.confirm(tt('{count} destination file(s) already exist. Replace them?', { count: existing.length }));
                if (!allowed) return null;
            }
            for (const item of existing) {
                item.snapshot = new Blob([await item.file.arrayBuffer()], { type: item.file.type });
            }
            const existingByPath = new Map(existing.map(item => [normalizePath(item.path), item]));
            const prepared = [];
            const targets = new Set();
            for (const file of files) {
                const relativePath = safeRelativePath(file.path);
                const target = normalizePath(relativePath);
                if (targets.has(target)) throw new Error(tt('The export contains duplicate target paths.'));
                targets.add(target);
                prepared.push({ ...file, path: relativePath, blob: await valueToBlob(file.data, file.mimeType) });
            }
            const written = [];
            const createdDirectories = [];
            try {
                await beforeWrite?.();
                for (const file of prepared) {
                    const previous = existingByPath.get(normalizePath(file.path)) || null;
                    const current = await existingDirectoryFile(directory, file.path);
                    if ((!previous && current) || (previous && !current)
                        || (previous && current && previous.handle.isSameEntry
                            && !await previous.handle.isSameEntry(current.handle))
                        || (previous && current && (previous.file.size !== current.file.size
                            || previous.file.lastModified !== current.file.lastModified
                            || !await sameBlobBytes(previous.file, current.file)))) {
                        throw new Error(tt('An export target changed before it could be written.'));
                    }
                    const rollback = {
                        path: normalizePath(file.path), previous,
                        expected: file.blob, written: null
                    };
                    written.push(rollback);
                    rollback.written = await writeDirectoryFile(
                        directory, file.path, file.blob, createdDirectories, current, rollback);
                }
            } catch (error) {
                const rollbackErrors = [];
                for (const item of written.reverse()) {
                    try {
                        const current = await existingDirectoryFile(directory, item.path);
                        if (!current) {
                            if (!item.previous) continue;
                            throw new Error(tt('An export target changed before rollback could restore it.'));
                        }
                        if (item.handle?.isSameEntry && !await item.handle.isSameEntry(current.handle)) {
                            throw new Error(tt('An export target changed before rollback could restore it.'));
                        }
                        const containsExport = await sameBlobBytes(item.expected, current.file);
                        if (!containsExport) {
                            if (item.previous && await sameBlobBytes(item.previous.snapshot, current.file)) continue;
                            if (!item.previous && current.file.size === 0) {
                                if (typeof current.handle.remove === 'function') await current.handle.remove();
                                else await current.directory.removeEntry(current.fileName);
                                continue;
                            }
                            throw new Error(tt('An export target changed before rollback could restore it.'));
                        }
                        if (item.previous) {
                            await writeDirectoryFile(directory, item.path, item.previous.snapshot, null, current);
                        } else {
                            if (typeof current.handle.remove === 'function') await current.handle.remove();
                            else await current.directory.removeEntry(current.fileName);
                        }
                    } catch (rollbackError) {
                        if (rollbackError?.name !== 'NotFoundError' || item.previous) {
                            rollbackErrors.push(rollbackError);
                        }
                    }
                }
                for (const item of createdDirectories.reverse()) {
                    try {
                        const current = await item.parent.getDirectoryHandle(item.name);
                        if (item.handle.isSameEntry && !await item.handle.isSameEntry(current)) {
                            throw new Error(tt('An export directory changed before rollback could remove it.'));
                        }
                        if (typeof item.handle.remove === 'function') await item.handle.remove();
                        else await item.parent.removeEntry(item.name);
                    } catch (rollbackError) {
                        if (rollbackError?.name !== 'NotFoundError') rollbackErrors.push(rollbackError);
                    }
                }
                if (!rollbackErrors.length) throw error;
                throw new Error(`${error.message} ${tt('Export rollback was incomplete:')} ${rollbackErrors.map(item => item.message).join('; ')}`);
            }
            return { path: directory.name, project: false };
        },
        async openPlaytest(mode = 'test') {
            if (window.reactor?.projectController) await window.reactor.projectController.saveAll();
            await this.flush();
            const modal = createPlaytestModal();
            const frame = modal.querySelector('iframe');
            frame.src = `project/index.html?${mode}&rrSnapshot=${Date.now()}`;
            modal.style.display = 'flex';
            // The playtest runs in an iframe over the live editor; nothing
            // used to stop the editor's own rendering, so its PIXI app and
            // 3D view kept burning the same GPU the game needs. Sleep them
            // until the overlay closes.
            window.reactor?.projectController?.app?.stop?.();
            const editor3d = window.reactor?.projectController?.mapEditor3D;
            if (editor3d) editor3d.suspended = true;
            return true;
        },
        async resetProject() {
            await new Promise((resolve, reject) => {
                const request = this.db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear();
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            });
            location.reload();
        },
        unsupported(feature) {
            alert(tt('{feature} is available in the desktop edition of RPG Reactor. Browser edits are saved in this browser.', {
                feature: tt(feature),
            }));
        },
        applyBrowserUi() {
            for (const action of ['build-deployment', 'dist-editor', 'exit', 'new-project', 'open-project', 'close-project']) {
                const item = document.querySelector(`[data-action="${action}"]`);
                if (item) item.style.display = 'none';
            }
            const buildMenu = document.querySelector('[data-menu="build"]');
            if (buildMenu) buildMenu.style.display = 'none';
            const banner = document.createElement('div');
            banner.className = 'rr-web-save-banner';
            banner.style.cssText = 'position:fixed;right:12px;bottom:10px;z-index:9000;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 10px;border:1px solid var(--color-accent-border);border-radius:4px;background:var(--color-bg-panel);color:var(--color-text-muted);font-size:10px;box-shadow:var(--shadow-panel);';
            const message = document.createElement('span');
            message.textContent = tt('Reactor One edits are saved in this browser');
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.className = 'graphic-selector-button';
            reset.textContent = tt('Reset');
            reset.style.cssText = 'padding:2px 6px;font-size:10px;';
            reset.onclick = () => {
                if (confirm(tt('Reset Reactor One and discard all browser-saved edits?'))) this.resetProject();
            };
            banner.append(message, reset);
            document.body.appendChild(banner);
        },
    };
})();
