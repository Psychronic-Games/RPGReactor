class NwVersionPicker {
    constructor(input, menu) {
        this.input = input;
        this.menu = menu;
        this.versions = [];
        this.loading = null;
        this.activeIndex = -1;
        document.body.appendChild(menu);
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', menu.id);
        input.setAttribute('aria-expanded', 'false');
        input.addEventListener('focus', () => this.open(''));
        input.addEventListener('click', () => this.open(''));
        input.addEventListener('input', () => this.open(input.value));
        input.addEventListener('keydown', event => this._onKeyDown(event));
        document.addEventListener('mousedown', event => {
            if (event.target !== input && !menu.contains(event.target)) this.close();
        });
        window.addEventListener('resize', () => this.close());
    }

    _appRoot() {
        const fs = require('fs');
        const path = require('path');
        const candidates = [__dirname, path.resolve(__dirname, '..'), process.cwd()];
        return candidates.find(root => fs.existsSync(path.join(root, 'build-scripts', 'nw-runtime-utils.js'))) || __dirname;
    }

    _fetchJson(url) {
        const https = require('https');
        return new Promise((resolve, reject) => {
            const request = (target) => {
                const req = https.get(target, {
                    headers: { 'User-Agent': 'RPG-Reactor', Accept: 'application/json' },
                }, response => {
                    if (response.statusCode === 301 || response.statusCode === 302) {
                        const redirect = new URL(response.headers.location, target).toString();
                        response.resume();
                        request(redirect);
                        return;
                    }
                    if (response.statusCode !== 200) {
                        response.resume();
                        reject(new Error(`HTTP ${response.statusCode}`));
                        return;
                    }
                    let body = '';
                    response.setEncoding('utf8');
                    response.on('data', chunk => { body += chunk; });
                    response.on('end', () => {
                        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
                    });
                }).on('error', reject);
                req.setTimeout(30000, () => req.destroy(new Error('NW.js version request timed out.')));
            };
            request(url);
        });
    }

    async load() {
        if (this.versions.length) return this.versions;
        if (this.loading) return this.loading;
        this.loading = (async () => {
            const path = require('path');
            const appRoot = this._appRoot();
            const runtime = require(path.join(appRoot, 'build-scripts', 'nw-runtime-utils.js'));
            const manifest = await runtime.loadVersionManifest({
                cacheDirectories: runtime.cacheDirectories(appRoot),
                fetchManifest: url => this._fetchJson(url),
            });
            this.versions = (manifest.versions || [])
                .map(release => {
                    try { return { version: runtime.normalizeVersion(release.version), date: release.date || '' }; }
                    catch { return null; }
                })
                .filter(Boolean);
            if (!this.input.value && manifest.stable) this.input.value = runtime.normalizeVersion(manifest.stable);
            return this.versions;
        })();
        try {
            return await this.loading;
        } finally {
            this.loading = null;
        }
    }

    setEnabled(enabled) {
        this.input.disabled = !enabled;
        if (!enabled) this.close();
        if (enabled) {
            this.load().then(() => {
                this.input.focus();
                this.input.select();
            }).catch(error => {
                const tt = text => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
                this.input.placeholder = tt('Versions unavailable');
                console.warn('Could not load NW.js versions:', error);
            });
        }
    }

    open(query = '') {
        if (this.input.disabled) return;
        if (!this.versions.length) {
            this.load().then(() => this.open(query)).catch(() => {});
            return;
        }
        this._render(query);
        this.menu.hidden = false;
        this.input.setAttribute('aria-expanded', 'true');
        this._positionMenu();
    }

    close() {
        this.menu.hidden = true;
        this.activeIndex = -1;
        this.input.setAttribute('aria-expanded', 'false');
        this.input.removeAttribute('aria-activedescendant');
    }

    _render(query) {
        const needle = String(query || '').trim().toLowerCase().replace(/^v/, '');
        const matches = this.versions.filter(release =>
            !needle || release.version.includes(needle) || release.date.includes(needle));
        this.activeIndex = -1;
        const rows = matches.map((release, index) => {
            const row = document.createElement('div');
            row.id = `${this.menu.id}-option-${index}`;
            row.className = 'nw-version-option';
            row.dataset.version = release.version;
            row.setAttribute('role', 'option');
            row.innerHTML = '<span class="nw-version-number"></span><span class="nw-version-date"></span>';
            row.querySelector('.nw-version-number').textContent = release.version;
            row.querySelector('.nw-version-date').textContent = release.date;
            row.addEventListener('mousedown', () => this._select(release.version));
            return row;
        });
        if (!rows.length) {
            const tt = text => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
            const empty = document.createElement('div');
            empty.className = 'nw-version-message';
            empty.textContent = tt('No matching NW.js releases');
            rows.push(empty);
        }
        this.menu.replaceChildren(...rows);
        this.menu.scrollTop = 0;
    }

    _positionMenu() {
        const rect = this.input.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom - 8;
        const above = rect.top - 8;
        const openAbove = below < 150 && above > below;
        this.menu.style.left = `${Math.round(rect.left)}px`;
        this.menu.style.width = `${Math.round(rect.width)}px`;
        this.menu.style.maxHeight = `${Math.max(100, Math.min(220, openAbove ? above : below))}px`;
        this.menu.style.top = openAbove ? 'auto' : `${Math.round(rect.bottom + 3)}px`;
        this.menu.style.bottom = openAbove ? `${Math.round(window.innerHeight - rect.top + 3)}px` : 'auto';
    }

    _onKeyDown(event) {
        if (event.key === 'Escape') {
            this.close();
            return;
        }
        if (event.key === 'Tab') {
            this.close();
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
        if (this.menu.hidden) this.open(this.input.value);
        const options = [...this.menu.querySelectorAll('.nw-version-option')];
        if (!options.length) return;
        event.preventDefault();
        if (event.key === 'Enter') {
            if (this.activeIndex >= 0) this._select(options[this.activeIndex].dataset.version);
            return;
        }
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        this.activeIndex = Math.max(0, Math.min(options.length - 1,
            this.activeIndex < 0 ? (direction > 0 ? 0 : options.length - 1) : this.activeIndex + direction));
        options.forEach((option, index) => option.classList.toggle('is-active', index === this.activeIndex));
        const active = options[this.activeIndex];
        this.input.setAttribute('aria-activedescendant', active.id);
        active.scrollIntoView({ block: 'nearest' });
    }

    _select(version) {
        this.input.value = version;
        this.close();
        this.input.focus();
    }

    hasVersion(value) {
        const normalized = String(value || '').trim().replace(/^v/i, '');
        return this.versions.some(release => release.version === normalized);
    }
}

if (typeof window !== 'undefined') window.NwVersionPicker = NwVersionPicker;
if (typeof module !== 'undefined' && module.exports) module.exports = NwVersionPicker;
