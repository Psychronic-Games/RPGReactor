/**
 * Play Model Animation — a Reactor event command. Stored as an MZ plugin
 * command (code 357, plugin "RPGReactor"), so the data stays loadable
 * everywhere and a stock MZ runtime simply ignores it. The runtime plays
 * the named action rule from the target's model.json.
 */
class PlayModelAnimationEditor {
    constructor(projectController) {
        this.projectController = projectController;
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    _project() {
        const pc = this.projectController;
        if (!pc) return (window.reactor && window.reactor.projectController
            && (window.reactor.projectController.getCurrentProject
                ? window.reactor.projectController.getCurrentProject()
                : window.reactor.projectController.currentProject)) || null;
        return pc.getCurrentProject ? pc.getCurrentProject() : pc.currentProject;
    }

    /** Every action rule name in the project's model sidecars. */
    actionNames() {
        const project = this._project();
        if (!project || !project.path) return [];
        const fs = require('fs');
        const path = require('path');
        const names = new Set();
        const root = path.join(project.path, '3d');
        if (!fs.existsSync(root)) return [];
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            try {
                const parsed = JSON.parse(fs.readFileSync(path.join(root, entry.name, 'model.json'), 'utf8'));
                for (const rule of parsed.animations || []) {
                    if (rule && rule.trigger === 'action' && rule.name) names.add(String(rule.name));
                }
            } catch (error) {
                // No sidecar or unreadable one: nothing to suggest.
            }
        }
        return Array.from(names).sort();
    }

    mapEvents() {
        const map = window.reactor && window.reactor.eventManager && window.reactor.eventManager.currentMap;
        const events = [];
        for (const event of (map && map.events) || []) {
            if (event) events.push({ id: event.id, name: event.name || '' });
        }
        return events;
    }

    show(command, callback) {
        const args = (command && command.parameters && command.parameters[3]) || {};
        const target = String(args.target != null ? args.target : '0');
        const animation = String(args.animation || '');

        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay';
        modal.style.zIndex = '21000';
        const events = this.mapEvents();
        const names = this.actionNames();
        const targetOptions = [
            ['0', this._t('This Event')],
            ['-1', this._t('Player')]
        ].concat(events.map(event => [String(event.id),
            String(event.id).padStart(3, '0') + (event.name ? ': ' + event.name : '')]));
        modal.innerHTML = `
            <div class="rr-modal" style="width:min(420px,90vw);display:flex;flex-direction:column;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${window.I18n && window.I18n.tEventCommandName
                        ? window.I18n.tEventCommandName('Play Model Animation') : 'Play Model Animation'}</div>
                    <button type="button" class="rr-modal-close pma-cancel">&times;</button>
                </div>
                <div class="rr-modal-body" style="display:flex;flex-direction:column;gap:10px;">
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);">
                        <span style="flex:0 0 90px;">${this._t('Target')}</span>
                        <select class="pma-target" style="flex:1;padding:4px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);">
                            ${targetOptions.map(([value, label]) =>
                                `<option value="${value}"${value === target ? ' selected' : ''}>${label}</option>`).join('')}
                        </select>
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);">
                        <span style="flex:0 0 90px;">${this._t('Animation')}</span>
                        <input type="text" class="pma-animation" list="pma-animation-names" value="${animation.replace(/"/g, '&quot;')}"
                            style="flex:1;padding:4px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);">
                        <datalist id="pma-animation-names">
                            ${names.map(name => `<option value="${name.replace(/"/g, '&quot;')}"></option>`).join('')}
                        </datalist>
                    </label>
                </div>
                <div class="rr-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;">
                    <button type="button" class="rr-btn-secondary pma-cancel">${window.I18n ? window.I18n.t('common.cancel') : 'Cancel'}</button>
                    <button type="button" class="rr-button-primary pma-ok">${window.I18n ? window.I18n.t('common.ok') : 'OK'}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const close = () => {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
        };
        modal.querySelectorAll('.pma-cancel').forEach(btn => btn.addEventListener('click', () => {
            close();
            callback(null);
        }));
        modal.querySelector('.pma-ok').addEventListener('click', () => {
            const result = {
                code: 357,
                indent: (command && command.indent) || 0,
                parameters: [
                    'RPGReactor',
                    'PlayModelAnimation',
                    'Play Model Animation',
                    {
                        target: modal.querySelector('.pma-target').value,
                        animation: modal.querySelector('.pma-animation').value.trim()
                    }
                ]
            };
            close();
            callback(result);
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlayModelAnimationEditor;
}
