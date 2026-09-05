/**
 * ProjectTools - Forge host for HTML authoring tools that live inside a project.
 *
 * Why this exists: some authoring tools ship with a *plugin* rather than with the
 * editor. Their HTML belongs to the plugin author, so the engine must not carry a
 * copy of it. This tool ships the frame, never the content: it discovers HTML files
 * in the open project, and runs the one the user picks.
 *
 * ── Security model (measured, not assumed) ────────────────────────────────────
 * The editor window is NW.js app content and therefore HAS Node: `require` is a
 * function and `nw` is an object in the top frame. A probe run under
 * nwjs-sdk-v0.115.0 established what child frames get:
 *
 *   frame configuration                     require/process/nw/Buffer   parent DOM
 *   sandbox="allow-scripts"                 undefined                  BLOCKED
 *   sandbox="allow-scripts allow-same-origin"  undefined               reachable
 *   no sandbox attribute                    undefined                  reachable
 *
 * So NW does not inject Node into child frames -- but a frame that can reach the
 * parent document can simply use the PARENT's `require`. Blocking that climb is the
 * whole game, and only `allow-scripts` *without* `allow-same-origin` does it: the
 * frame gets an opaque origin ("null") and `window.parent.document` throws.
 *
 * Consequently this host:
 *   - always uses sandbox="allow-scripts", and NEVER adds allow-same-origin;
 *   - loads the tool through `srcdoc`, so the frame never holds a file:// origin;
 *   - talks to the tool only through postMessage, validating every inbound message;
 *   - asks the user to confirm before running a tool, naming the file.
 *
 * Editing that sandbox attribute re-opens arbitrary code execution with filesystem
 * access for any project a user opens. Do not "simplify" it.
 *
 * ── Tool contract ─────────────────────────────────────────────────────────────
 * A tool is a single self-contained .html file in one of the scanned folders. It
 * receives data instead of asking for a folder, and saves through the host:
 *
 *   window.addEventListener('message', (e) => {
 *       if (e.data.type === 'reactor:init') {
 *           // e.data.data      -> { 'Enemies.json': [...], 'States.json': [...], ... }
 *           // e.data.projectName
 *       }
 *   });
 *   parent.postMessage({ type: 'reactor:ready' }, '*');                 // request data
 *   parent.postMessage({ type: 'reactor:save', file: 'Enemies.json',
 *                        data: enemies }, '*');                          // write back
 *   parent.postMessage({ type: 'reactor:image',
 *                        path: 'sv_enemies/Bat' }, '*');                 // -> data URL
 *
 * The host only ever reads and writes the database files it whitelists below, and
 * serves images only from under the project's img/ folder, so a tool cannot reach
 * the rest of the project through this channel.
 */
class ProjectTools {

    // Folders scanned for tools, relative to the project root. First match wins.
    static TOOL_FOLDERS = ['forge/tools', 'utilitis', 'utilities', 'tools'];

    // The only files a hosted tool may read or write. Anything else is refused.
    static ALLOWED_FILES = [
        'Actors.json', 'Classes.json', 'Skills.json', 'Items.json', 'Weapons.json',
        'Armors.json', 'Enemies.json', 'Troops.json', 'States.json', 'Animations.json',
        'Tilesets.json', 'CommonEvents.json', 'System.json'
    ];

    constructor() {
        this.projectController = null;
        this.projectPath = null;
        this.root = null;
        this.frame = null;
        this.activeTool = null;
        this._messageHandler = null;
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    _escapeHtml(value) {
        if (typeof globalThis.rrEscapeHtml === 'function') return globalThis.rrEscapeHtml(value);
        return require('../../utils/HtmlEscape.js')(value);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    renderInto(containerEl, projectController) {
        this.projectController = projectController;
        this.root = containerEl;
        if (!this._syncProjectPath()) {
            this.root.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--color-text-muted); font-size: 12px;">${this._t('Open a project to use Forge tools.')}</div>`;
            return;
        }
        this._renderList();
    }

    detach() {
        this._closeTool();
    }

    _syncProjectPath() {
        const project = this.projectController?.getCurrentProject?.() || this.projectController?.currentProject;
        this.projectPath = project?.path || null;
        return this.projectPath;
    }

    // ── Discovery ─────────────────────────────────────────────────────────────

    /** Returns [{ name, relPath, absPath, folder }] for every .html found. */
    _discoverTools() {
        const fs = require('fs');
        const path = require('path');
        const found = [];
        for (const folder of ProjectTools.TOOL_FOLDERS) {
            const dir = path.join(this.projectPath, folder);
            let entries;
            try {
                if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
                entries = fs.readdirSync(dir);
            } catch { continue; }
            for (const entry of entries) {
                if (!/\.html?$/i.test(entry)) continue;
                const absPath = path.join(dir, entry);
                try { if (!fs.statSync(absPath).isFile()) continue; } catch { continue; }
                found.push({
                    name: entry.replace(/\.html?$/i, ''),
                    relPath: `${folder}/${entry}`,
                    absPath,
                    folder
                });
            }
        }
        return found.sort((a, b) => a.name.localeCompare(b.name));
    }

    // ── List view ─────────────────────────────────────────────────────────────

    _renderList() {
        const tools = this._discoverTools();
        const esc = (s) => this._escapeHtml(s);

        if (!tools.length) {
            this.root.innerHTML = `
                <div style="padding: 40px; max-width: 640px; margin: 0 auto; color: var(--color-text-muted); font-size: 12px; line-height: 1.7;">
                    <div style="font-size: 13px; color: var(--color-text); margin-bottom: 10px;">${esc(this._t('No project tools found.'))}</div>
                    <div>${esc(this._t('Place a self-contained .html tool in one of these project folders:'))}</div>
                    <ul style="margin: 8px 0 0 18px; padding: 0;">
                        ${ProjectTools.TOOL_FOLDERS.map(f => `<li><code>${esc(f)}/</code></li>`).join('')}
                    </ul>
                </div>`;
            return;
        }

        this.root.innerHTML = `
            <div style="padding: 24px; max-width: 760px; margin: 0 auto;">
                <div style="background: var(--color-bg-input); border: 1px solid var(--color-border); border-left: 3px solid var(--color-warning, #e0af68); padding: 12px 14px; margin-bottom: 18px; font-size: 12px; line-height: 1.6; color: var(--color-text-muted);">
                    <strong style="color: var(--color-text);">${esc(this._t('Tools run code from this project.'))}</strong><br>
                    ${esc(this._t('A tool runs sandboxed with no file access, and can only read and write database files through the editor. Only run tools you trust.'))}
                </div>
                <div id="pt-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
            </div>`;

        const list = this.root.querySelector('#pt-list');
        for (const tool of tools) {
            // Built with DOM nodes rather than innerHTML: the name and path come from
            // whatever files a project happens to contain, so textContent is the
            // safest way to put them on screen.
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; background:var(--color-bg-input); border:1px solid var(--color-border);';
            const info = document.createElement('div');
            info.style.cssText = 'min-width:0;';
            const nameEl = document.createElement('div');
            nameEl.style.cssText = 'font-size:13px; color:var(--color-text); overflow:hidden; text-overflow:ellipsis;';
            nameEl.textContent = tool.name;
            const pathEl = document.createElement('code');
            pathEl.style.cssText = 'font-size:11px; color:var(--color-text-muted); margin-top:2px; display:block;';
            pathEl.textContent = tool.relPath;
            info.appendChild(nameEl);
            info.appendChild(pathEl);
            row.appendChild(info);
            const btn = document.createElement('button');
            btn.className = 'rr-button';
            btn.textContent = this._t('Run');
            btn.style.cssText = 'flex:none; padding:6px 18px; cursor:pointer;';
            btn.addEventListener('click', () => this._confirmAndOpen(tool));
            row.appendChild(btn);
            list.appendChild(row);
        }
    }

    _confirmAndOpen(tool) {
        const message = `${this._t('Run this project tool?')}\n\n${tool.relPath}\n\n${this._t('A tool runs sandboxed with no file access, and can only read and write database files through the editor. Only run tools you trust.')}`;
        if (!window.confirm(message)) return;
        this._openTool(tool);
    }

    // ── Hosting ───────────────────────────────────────────────────────────────

    _openTool(tool) {
        let html;
        try {
            html = require('fs').readFileSync(tool.absPath, 'utf8');
        } catch (err) {
            alert(`${this._t('Could not read the tool file.')}\n\n${tool.relPath}\n${err.message}`);
            return;
        }

        this.activeTool = tool;
        this.root.innerHTML = '';

        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 12px; border-bottom:1px solid var(--color-border); background:var(--color-bg-toolbar); flex:none;';
        const back = document.createElement('button');
        back.className = 'rr-button';
        back.textContent = this._t('Back to tools');
        back.style.cssText = 'padding:4px 12px; cursor:pointer;';
        back.addEventListener('click', () => { this._closeTool(); this._renderList(); });
        const label = document.createElement('div');
        label.style.cssText = 'font-size:11px; color:var(--color-text-muted); overflow:hidden; text-overflow:ellipsis;';
        label.textContent = tool.relPath;
        bar.appendChild(back);
        bar.appendChild(label);

        // SECURITY: allow-scripts ONLY. Adding allow-same-origin would let the tool
        // reach window.parent and use the editor's own require(). See header.
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.style.cssText = 'flex:1; width:100%; border:0; background:#fff; min-height:0;';
        frame.srcdoc = html;

        this.root.style.cssText += ';display:flex; flex-direction:column; height:100%;';
        this.root.appendChild(bar);
        this.root.appendChild(frame);
        this.frame = frame;

        this._messageHandler = (event) => this._onToolMessage(event);
        window.addEventListener('message', this._messageHandler);
    }

    _closeTool() {
        if (this._messageHandler) {
            window.removeEventListener('message', this._messageHandler);
            this._messageHandler = null;
        }
        if (this.frame && this.frame.parentNode) this.frame.parentNode.removeChild(this.frame);
        this.frame = null;
        this.activeTool = null;
    }

    // ── Bridge ────────────────────────────────────────────────────────────────

    _onToolMessage(event) {
        // Only the frame we opened may talk to us. A sandboxed frame has an opaque
        // origin, so identity is established by source, not by origin string.
        if (!this.frame || event.source !== this.frame.contentWindow) return;
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        switch (msg.type) {
            case 'reactor:ready': return this._sendInit();
            case 'reactor:save': return this._handleSave(msg);
            case 'reactor:image': return this._handleImage(msg);
            default: return;
        }
    }

    _post(message) {
        // Opaque origin: '*' is the only valid target, which is safe because the
        // payload is data the tool was granted at open time.
        if (this.frame && this.frame.contentWindow) this.frame.contentWindow.postMessage(message, '*');
    }

    _sendInit() {
        const fs = require('fs');
        const path = require('path');
        const data = {};
        const errors = [];
        for (const file of ProjectTools.ALLOWED_FILES) {
            const p = path.join(this.projectPath, 'data', file);
            try {
                if (fs.existsSync(p)) data[file] = JSON.parse(fs.readFileSync(p, 'utf8'));
            } catch (err) {
                errors.push(`${file}: ${err.message}`);
            }
        }
        const project = this.projectController?.getCurrentProject?.() || this.projectController?.currentProject;
        this._post({
            type: 'reactor:init',
            data,
            errors,
            projectName: project?.name || null,
            allowedFiles: ProjectTools.ALLOWED_FILES.slice()
        });
    }

    /**
     * Hand back one image from the project's img/ tree as a data URL.
     *
     * The tool names a path relative to img/ (e.g. "sv_enemies/Bat"). Everything
     * about that string is treated as hostile: it is normalised, forced to stay
     * under img/, and only allowed to resolve to a known image extension. The
     * frame never receives a filesystem path, only bytes it asked for by name.
     */
    _handleImage(msg) {
        const fs = require('fs');
        const path = require('path');
        const reply = (ok, extra) => this._post(Object.assign({ type: 'reactor:image', request: msg.path, ok }, extra || {}));

        const raw = String(msg.path || '');
        if (!raw || raw.includes('\0')) return reply(false, { error: 'Bad path' });

        const imgRoot = path.resolve(this.projectPath, 'img');
        const candidates = /\.[a-z0-9]+$/i.test(raw)
            ? [raw]
            : ['.png', '.jpg', '.jpeg', '.webp', '.gif'].map(ext => raw + ext);

        for (const rel of candidates) {
            const abs = path.resolve(imgRoot, rel);
            // Containment check: resolve() collapses any ".." before we compare.
            if (abs !== imgRoot && !abs.startsWith(imgRoot + path.sep)) continue;
            try {
                if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
                const ext = path.extname(abs).toLowerCase();
                const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext];
                if (!mime) continue;
                const b64 = fs.readFileSync(abs).toString('base64');
                return reply(true, { dataUrl: `data:${mime};base64,${b64}` });
            } catch { /* try the next candidate extension */ }
        }
        return reply(false, { error: 'Not found' });
    }

    _handleSave(msg) {
        const file = String(msg.file || '');
        if (!ProjectTools.ALLOWED_FILES.includes(file)) {
            this._post({ type: 'reactor:saved', file, ok: false, error: 'File not allowed' });
            return;
        }
        if (msg.data === undefined || msg.data === null) {
            this._post({ type: 'reactor:saved', file, ok: false, error: 'No data supplied' });
            return;
        }
        const confirmMsg = `${this._t('Save changes from this tool?')}\n\ndata/${file}`;
        if (!window.confirm(confirmMsg)) {
            this._post({ type: 'reactor:saved', file, ok: false, error: 'Cancelled' });
            return;
        }
        try {
            const fs = require('fs');
            const path = require('path');
            const target = path.join(this.projectPath, 'data', file);
            // Two spaces: the format DatabaseManager writes, so diffs stay readable.
            const json = JSON.stringify(msg.data, null, 2);
            const tmp = `${target}.tmp`;
            fs.writeFileSync(tmp, json, 'utf8');
            fs.renameSync(tmp, target);
            this._post({ type: 'reactor:saved', file, ok: true });
            alert(`data/${file}\n\n${this._t('Saved. Reload the project to see the change in the editor.')}`);
        } catch (err) {
            this._post({ type: 'reactor:saved', file, ok: false, error: err.message });
            alert(`${this._t('Could not save.')}\n\n${err.message}`);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = ProjectTools;
