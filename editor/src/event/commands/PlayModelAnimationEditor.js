/**
 * Play Model Animation — a Reactor event command. Stored as an MZ plugin
 * command (code 357, plugin "RPGReactor"), so the data stays loadable
 * everywhere and a stock MZ runtime simply ignores it. The runtime plays
 * the named action rule from the target's model.json.
 *
 * The animation is chosen from the actions the target's model actually
 * declares: an event's model comes from the map sidecar (or its <r3d> note),
 * the player's from the starting party leader's actor binding in
 * Database.r3d.json. A target with no model lists every action in the
 * project, and a saved name the model no longer has stays selectable.
 */
class PlayModelAnimationEditor {
    constructor(projectController) {
        this.projectController = projectController;
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    _k(key, params) {
        return window.I18n ? window.I18n.t(key, params) : key;
    }

    _project() {
        const pc = this.projectController;
        if (!pc) return (window.reactor && window.reactor.projectController
            && (window.reactor.projectController.getCurrentProject
                ? window.reactor.projectController.getCurrentProject()
                : window.reactor.projectController.currentProject)) || null;
        return pc.getCurrentProject ? pc.getCurrentProject() : pc.currentProject;
    }

    /** The action rule names one model's model.json declares. */
    static modelActionNames(projectPath, modelName) {
        if (!projectPath || !modelName || typeof require !== 'function') return [];
        const fs = require('fs');
        const path = require('path');
        const file = path.join(projectPath, '3d', ...String(modelName).split('/'), 'model.json');
        try {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
            const names = [];
            for (const rule of parsed.animations || []) {
                if (rule && rule.trigger === 'action' && rule.name && names.indexOf(String(rule.name)) < 0) {
                    names.push(String(rule.name));
                }
            }
            return names;
        } catch (error) {
            return [];
        }
    }

    /** Every action rule name in the project's model sidecars. */
    actionNames() {
        const project = this._project();
        if (!project || !project.path) return [];
        const names = new Set();
        const models = typeof ModelGraphicPicker !== 'undefined' && ModelGraphicPicker.listModels
            ? ModelGraphicPicker.listModels(project.path).map(model => model.name)
            : [];
        for (const name of models) {
            for (const action of PlayModelAnimationEditor.modelActionNames(project.path, name)) names.add(action);
        }
        return Array.from(names).sort();
    }

    currentMap() {
        return window.reactor?.eventManager?.currentMap || null;
    }

    mapEvents() {
        const map = this.currentMap();
        const events = [];
        for (const event of (map && map.events) || []) {
            if (event) events.push({ id: event.id, name: event.name || '' });
        }
        return events;
    }

    /** The model names bound to an event: any page of the sidecar entry, else its note. */
    static eventModelNames(map, event) {
        const names = [];
        if (!map || !event) return names;
        const pages = map.reactor3d?.events?.[String(event.id)];
        if (pages && typeof pages === 'object') {
            for (const spec of Object.values(pages)) {
                if (spec && spec.name && names.indexOf(spec.name) < 0) names.push(String(spec.name));
            }
        }
        const note = typeof event.note === 'string' ? event.note : '';
        const block = note.match(/<\s*r3d\s*>([\s\S]*?)<\s*\/\s*r3d\s*>/i);
        const named = ((block ? block[1] : '').match(/model\s*\(\s*([^)\s]+)\s*\)/i)
            || note.match(/<\s*r3d\s*:\s*model\s*:\s*([^>\s]+)\s*>/i) || [])[1];
        if (named && names.indexOf(named) < 0) names.push(named);
        return names;
    }

    /** The actor character model the party leader shows, from Database.r3d.json. */
    playerModelNames() {
        const project = this._project();
        if (!project?.path || typeof RRDatabase3DBindings === 'undefined') return [];
        let bindings;
        try {
            bindings = RRDatabase3DBindings.read(project.path);
        } catch (error) {
            return [];
        }
        const actors = bindings?.actors || {};
        const slotName = entry => {
            if (!entry || typeof entry !== 'object') return '';
            const spec = entry.name ? entry : entry.character;
            return spec && spec.name ? String(spec.name) : '';
        };
        const system = window.reactor?.databaseManager?.data?.system;
        const leader = Array.isArray(system?.partyMembers) ? system.partyMembers[0] : null;
        const leaderModel = leader ? slotName(actors[String(leader)]) : '';
        if (leaderModel) return [leaderModel];
        const names = [];
        for (const entry of Object.values(actors)) {
            const name = slotName(entry);
            if (name && names.indexOf(name) < 0) names.push(name);
        }
        return names;
    }

    /** The models the chosen target shows ('0' this event, '-1' player, or an event id). */
    modelNamesForTarget(target) {
        const value = String(target);
        if (value === '-1') return this.playerModelNames();
        const map = this.currentMap();
        let event = null;
        if (value === '0') {
            const editor = window.reactor?.eventManager?.eventEditor;
            event = editor?.currentEvent || editor?.sourceEvent || null;
        } else {
            event = map?.events?.[Number(value)] || null;
        }
        return PlayModelAnimationEditor.eventModelNames(map, event);
    }

    /** { names, models, all }: the actions to offer for a target. */
    actionsForTarget(target) {
        const project = this._project();
        const models = this.modelNamesForTarget(target);
        const names = [];
        for (const model of models) {
            for (const action of PlayModelAnimationEditor.modelActionNames(project?.path, model)) {
                if (names.indexOf(action) < 0) names.push(action);
            }
        }
        if (models.length && names.length) return { names, models, all: false };
        return { names: this.actionNames(), models, all: true };
    }

    show(command, callback) {
        const args = (command && command.parameters && command.parameters[3]) || {};
        const target = String(args.target != null ? args.target : '0');
        const animation = String(args.animation || '');
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay';
        modal.style.zIndex = '21000';
        const events = this.mapEvents();
        const targetOptions = [
            ['0', this._t('This Event')],
            ['-1', this._t('Player')]
        ].concat(events.map(event => [String(event.id),
            String(event.id).padStart(3, '0') + (event.name ? ': ' + event.name : '')]));
        const control = 'flex:1;min-width:0;padding:4px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);';
        modal.innerHTML = `
            <div class="rr-modal" style="width:min(440px,90vw);display:flex;flex-direction:column;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${window.I18n && window.I18n.tEventCommandName
                        ? window.I18n.tEventCommandName('Play Model Animation') : 'Play Model Animation'}</div>
                    <button type="button" class="rr-modal-close pma-cancel">&times;</button>
                </div>
                <div class="rr-modal-body" style="display:flex;flex-direction:column;gap:10px;">
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);">
                        <span style="flex:0 0 90px;">${this._t('Target')}</span>
                        <select class="pma-target" style="${control}">
                            ${targetOptions.map(([value, label]) =>
                                `<option value="${value}"${value === target ? ' selected' : ''}>${escape(label)}</option>`).join('')}
                        </select>
                    </label>
                    <div class="pma-model" style="font-size:11px;color:var(--color-text-muted);margin-left:98px;"></div>
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);">
                        <span style="flex:0 0 90px;">${this._t('Animation')}</span>
                        <select class="pma-animation" style="${control}"></select>
                    </label>
                    <label class="pma-custom-row" style="display:none;align-items:center;gap:8px;font-size:12px;color:var(--color-text);">
                        <span style="flex:0 0 90px;"></span>
                        <input type="text" class="pma-custom" value="" style="${control}">
                    </label>
                </div>
                <div class="rr-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;">
                    <button type="button" class="rr-btn-secondary pma-cancel">${window.I18n ? window.I18n.t('common.cancel') : 'Cancel'}</button>
                    <button type="button" class="rr-button-primary pma-ok">${window.I18n ? window.I18n.t('common.ok') : 'OK'}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const q = selector => modal.querySelector(selector);
        const CUSTOM = ' custom';

        const syncCustom = () => {
            const custom = q('.pma-animation').value === CUSTOM;
            q('.pma-custom-row').style.display = custom ? 'flex' : 'none';
            if (custom) q('.pma-custom').focus();
        };
        // The list follows the target: its model's actions, with the saved
        // name kept even when the model no longer declares it.
        const fill = (chosen) => {
            const found = this.actionsForTarget(q('.pma-target').value);
            const select = q('.pma-animation');
            const options = found.names.slice();
            if (chosen && options.indexOf(chosen) < 0) options.unshift(chosen);
            select.innerHTML = options.map(name => {
                const missing = found.names.indexOf(name) < 0;
                const label = missing ? this._k('pma.notInModel', { name }) : name;
                return `<option value="${escape(name)}">${escape(label)}</option>`;
            }).join('') + `<option value="${escape(CUSTOM)}">${escape(this._k('pma.custom'))}</option>`;
            if (chosen && options.indexOf(chosen) >= 0) select.value = chosen;
            else select.value = options.length ? options[0] : CUSTOM;
            const model = q('.pma-model');
            model.textContent = found.models.length
                ? (found.all
                    ? this._k('pma.noActions', { model: found.models.join(', ') })
                    : this._k('pma.model', { model: found.models.join(', ') }))
                : this._k('pma.noModel');
            syncCustom();
        };
        q('.pma-target').addEventListener('change', () => fill(this.readAnimation(modal, CUSTOM)));
        q('.pma-animation').addEventListener('change', syncCustom);
        q('.pma-custom').value = animation;
        fill(animation);

        const close = () => {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
        };
        modal.querySelectorAll('.pma-cancel').forEach(btn => btn.addEventListener('click', () => {
            close();
            callback(null);
        }));
        q('.pma-ok').addEventListener('click', () => {
            const result = {
                code: 357,
                indent: (command && command.indent) || 0,
                parameters: [
                    'RPGReactor',
                    'PlayModelAnimation',
                    'Play Model Animation',
                    {
                        target: q('.pma-target').value,
                        animation: this.readAnimation(modal, CUSTOM)
                    }
                ]
            };
            close();
            callback(result);
        });
    }

    /** The chosen animation name: the dropdown's, or the custom field's. */
    readAnimation(modal, customValue) {
        const select = modal.querySelector('.pma-animation');
        if (!select) return '';
        if (select.value === customValue) return modal.querySelector('.pma-custom').value.trim();
        return select.value;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlayModelAnimationEditor;
}
