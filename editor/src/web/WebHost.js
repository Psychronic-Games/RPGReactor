(function () {
    'use strict';

    const DB_NAME = 'RPGReactorWeb';
    const DB_VERSION = 1;
    const STORE_NAME = 'files';
    const PROJECT_ROOT = '/project';
    document.documentElement.classList.add('rr-web');

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
            throw new Error(`Path is outside the Reactor One web project: ${filePath}`);
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
        const pending = new Set();

        for (const entry of manifest.files || []) entries.set(entry.path, { ...entry });
        entries.set('', { path: '', type: 'directory', size: 0 });

        const ensureParents = relativePath => {
            const parts = relativePath.split('/');
            parts.pop();
            let current = '';
            for (const part of parts) {
                current = current ? `${current}/${part}` : part;
                if (!entries.has(current)) entries.set(current, { path: current, type: 'directory', size: 0 });
            }
        };

        const persist = (relativePath, data) => {
            const operation = new Promise((resolve, reject) => {
                const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({
                    path: relativePath,
                    data,
                    updatedAt: Date.now(),
                });
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            });
            pending.add(operation);
            operation.finally(() => pending.delete(operation));
        };

        const fs = {
            existsSync(filePath) {
                try { return entries.has(projectRelative(filePath)); } catch { return false; }
            },
            readFileSync(filePath, encoding) {
                const relativePath = projectRelative(filePath);
                if (!contents.has(relativePath)) {
                    throw new Error(`Web project file is not preloaded for synchronous access: ${relativePath}`);
                }
                const data = contents.get(relativePath);
                if (encoding || typeof data === 'string') return typeof data === 'string' ? data : new TextDecoder().decode(data);
                return data;
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
                });
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
                if (!entry) throw new Error(`File not found: ${filePath}`);
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
                const operation = new Promise((resolve, reject) => {
                    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(relativePath);
                    request.onsuccess = resolve;
                    request.onerror = () => reject(request.error);
                });
                pending.add(operation);
                operation.finally(() => pending.delete(operation));
            },
            rmSync(filePath, options = {}) {
                const relativePath = projectRelative(filePath);
                if (options.recursive) {
                    for (const key of [...entries.keys()]) {
                        if (key === relativePath || key.startsWith(`${relativePath}/`)) this.unlinkSync(`${PROJECT_ROOT}/${key}`);
                    }
                } else this.unlinkSync(filePath);
            },
            copyFileSync(source, destination) {
                this.writeFileSync(destination, this.readFileSync(source));
            },
            realpathSync(filePath) { return normalizePath(filePath); },
            async flush() { await Promise.all([...pending]); },
            _applyStored(record) {
                ensureParents(record.path);
                contents.set(record.path, record.data);
                entries.set(record.path, {
                    path: record.path,
                    type: 'file',
                    size: typeof record.data === 'string' ? new Blob([record.data]).size : record.data.byteLength,
                    updatedAt: record.updatedAt,
                });
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
        toolbar.innerHTML = '<span>Reactor One - Browser Playtest</span>';
        const close = document.createElement('button');
        close.textContent = 'Close Playtest';
        close.className = 'graphic-selector-button';
        close.onclick = () => {
            modal.style.display = 'none';
            const frame = modal.querySelector('iframe');
            if (frame) frame.src = 'about:blank';
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

    async function writeDirectoryFile(rootHandle, relativePath, blob) {
        const parts = normalizePath(relativePath).split('/').filter(part => part && part !== '..');
        const fileName = parts.pop();
        let directory = rootHandle;
        for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true });
        const fileHandle = await directory.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
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
        version: '0.94.4',
        projectRoot: PROJECT_ROOT,
        fs: null,
        path: createPathApi(),
        db: null,
        manifest: null,
        async initialize() {
            const response = await fetch('web/project-manifest.json');
            if (!response.ok) throw new Error(`Could not load Reactor One manifest (${response.status})`);
            this.manifest = await response.json();
            this.version = this.manifest.editorVersion || this.version;
            this.db = await openDatabase();
            this.fs = createFileSystem(this.manifest, this.db);
            for (const record of await readStoredFiles(this.db)) this.fs._applyStored(record);
            window.RPGReactorHost = this;
            window.RPGReactorAssetUrl = filePath => this.assetUrl(filePath);
            installFileUrlBridge(this);
            window.require = moduleName => {
                if (moduleName === 'fs') return this.fs;
                if (moduleName === 'path') return this.path;
                if (moduleName === 'url') return { pathToFileURL: filePath => ({ href: this.assetUrl(filePath) }) };
                throw new Error(`Node module "${moduleName}" is unavailable in RPG Reactor Web.`);
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
        async saveFile({ data, projectPath = null, suggestedName = 'download.bin', mimeType = 'application/octet-stream' }) {
            const blob = await valueToBlob(data, mimeType);
            if (projectPath) {
                this.fs.writeFileSync(projectPath, new Uint8Array(await blob.arrayBuffer()));
                await this.flush();
                return { path: projectPath, project: true };
            }

            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({ suggestedName });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    return { path: handle.name, project: false };
                } catch (error) {
                    if (error.name === 'AbortError') return null;
                    if (error.name !== 'SecurityError' && error.name !== 'NotAllowedError') throw error;
                }
            }

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
        async saveFiles({ files, projectRoot = null, suggestedDirectoryName = 'RPG Reactor Export' }) {
            if (projectRoot) {
                for (const file of files) {
                    const blob = await valueToBlob(file.data, file.mimeType);
                    this.fs.writeFileSync(normalizePath(`${projectRoot}/${file.path}`), new Uint8Array(await blob.arrayBuffer()));
                }
                await this.flush();
                return { path: projectRoot, project: true };
            }
            if (files.length === 1) {
                const file = files[0];
                return this.saveFile({ data: file.data, suggestedName: file.path, mimeType: file.mimeType });
            }
            if (!window.showDirectoryPicker) {
                throw new Error('This export contains multiple files. Use a browser with directory picker support or open a project first.');
            }
            let directory;
            try {
                directory = await window.showDirectoryPicker({ id: suggestedDirectoryName, mode: 'readwrite' });
            } catch (error) {
                if (error.name === 'AbortError') return null;
                throw error;
            }
            for (const file of files) {
                await writeDirectoryFile(directory, file.path, await valueToBlob(file.data, file.mimeType));
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
            alert(`${feature} is available in the desktop edition of RPG Reactor. Browser edits are saved in this browser.`);
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
            message.textContent = 'Reactor One edits are saved in this browser';
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.className = 'graphic-selector-button';
            reset.textContent = 'Reset';
            reset.style.cssText = 'padding:2px 6px;font-size:10px;';
            reset.onclick = () => {
                if (confirm('Reset Reactor One and discard all browser-saved edits?')) this.resetProject();
            };
            banner.append(message, reset);
            document.body.appendChild(banner);
        },
    };
})();
