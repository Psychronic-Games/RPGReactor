/**
 * Scoped Wait — a Reactor event command (code 357, plugin "RPGReactor",
 * command ScopedWait). A BACKGROUND wait: the player keeps moving while the
 * event holds — until the target's last actions finish, a switch flips, a
 * variable compares true, or a set duration passes. A stock MZ runtime
 * ignores it.
 */
class WaitForModel3DEditor {
    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    mapEvents() {
        const map = window.reactor?.eventManager?.currentMap || null;
        const events = [];
        for (const event of (map && map.events) || []) {
            if (event) events.push({ id: event.id, name: event.name || '' });
        }
        return events;
    }

    /** "0007: Torch Lit" — the id and the database's name for it. */
    _entryLabel(kind, id) {
        const system = window.reactor?.databaseManager?.data?.system;
        const list = system ? (kind === 'switch' ? system.switches : system.variables) : null;
        const name = Array.isArray(list) && typeof list[id] === 'string' ? list[id] : '';
        return `${String(id).padStart(4, '0')}${name ? ': ' + name : ''}`;
    }

    _openPicker(kind, currentId, onPick) {
        if (typeof SwitchVariablePicker === 'undefined') return;
        const picker = new SwitchVariablePicker(window.reactor?.databaseManager, window.reactor?.projectController);
        picker.show(kind, currentId, id => onPick(Number(id) || 1));
        // Above the Scoped Wait modal, whatever the picker's own default.
        if (picker.modal) picker.modal.style.zIndex = '22000';
    }

    show(command, callback) {
        const args = (command && command.parameters && command.parameters[3]) || {};
        const target = String(args.target != null ? args.target : '0');
        const mode = ['duration', 'switch', 'variable'].indexOf(String(args.mode)) >= 0 ? String(args.mode) : 'actions';
        const duration = Math.max(0, Math.round(Number(args.duration) || 60));
        let switchId = Math.max(1, Math.round(Number(args.switchId) || 1));
        const switchValue = String(args.switchValue) !== 'false';
        let variableId = Math.max(1, Math.round(Number(args.variableId) || 1));
        const op = String(args.op || '>=');
        const value = Number(args.value) || 0;
        const resume = String(args.resume) !== 'false';
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const options = [
            ['0', this._t('This Event')],
            ['-1', this._t('Player')],
            ['all', this._t('Everything')]
        ].concat(this.mapEvents().map(event => [String(event.id),
            String(event.id).padStart(3, '0') + (event.name ? ': ' + event.name : '')]));
        // One shared grid: a label / radio column, then the controls, so
        // every row's fields sit on the same left edge.
        const control = 'padding:4px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;font-size:12px;';
        const rowStyle = 'display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;';
        const radioCell = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--color-text);';
        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay';
        modal.style.zIndex = '21000';
        modal.innerHTML = `
            <div class="rr-modal" style="width:min(460px,92vw);display:flex;flex-direction:column;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${window.I18n && window.I18n.tEventCommandName
                        ? window.I18n.tEventCommandName('Scoped Wait') : 'Scoped Wait'}</div>
                    <button type="button" class="rr-modal-close w3d-cancel">&times;</button>
                </div>
                <div class="rr-modal-body" style="display:flex;flex-direction:column;gap:10px;">
                    <div style="${rowStyle}">
                        <span style="font-size:12px;color:var(--color-text);">${this._t('Target')}</span>
                        <select class="w3d-target" style="${control}">
                            ${options.map(([optionValue, label]) =>
                                `<option value="${optionValue}"${optionValue === target ? ' selected' : ''}>${escape(label)}</option>`).join('')}
                        </select>
                    </div>
                    <div style="${rowStyle}">
                        <label style="${radioCell}"><input type="radio" name="w3d-mode" value="actions"${mode === 'actions' ? ' checked' : ''}> ${this._t('Last action')}</label>
                        <span></span>
                    </div>
                    <div style="${rowStyle}">
                        <label style="${radioCell}"><input type="radio" name="w3d-mode" value="duration"${mode === 'duration' ? ' checked' : ''}> ${this._t('Duration')}</label>
                        <span style="display:flex;align-items:center;gap:6px;">
                            <input type="number" class="w3d-duration" min="1" max="9999" step="1" value="${duration}" style="width:90px;${control}">
                            <span style="font-size:11px;color:var(--color-text-muted);">${this._t('frames')}</span>
                        </span>
                    </div>
                    <div style="${rowStyle}">
                        <label style="${radioCell}"><input type="radio" name="w3d-mode" value="switch"${mode === 'switch' ? ' checked' : ''}> ${this._t('Switch')}</label>
                        <span style="display:flex;align-items:center;gap:6px;">
                            <button type="button" class="w3d-switch-pick" style="flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:6px;cursor:pointer;${control}"><span class="w3d-switch-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escape(this._entryLabel('switch', switchId))}</span><span style="flex:0 0 auto;font-size:10px;color:var(--color-text-muted);">▾</span></button>
                            <select class="w3d-switch-value" style="width:80px;${control}">
                                <option value="true"${switchValue ? ' selected' : ''}>ON</option>
                                <option value="false"${switchValue ? '' : ' selected'}>OFF</option>
                            </select>
                        </span>
                    </div>
                    <div style="${rowStyle}">
                        <label style="${radioCell}"><input type="radio" name="w3d-mode" value="variable"${mode === 'variable' ? ' checked' : ''}> ${this._t('Variable')}</label>
                        <span style="display:flex;align-items:center;gap:6px;">
                            <button type="button" class="w3d-variable-pick" style="flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:6px;cursor:pointer;${control}"><span class="w3d-variable-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escape(this._entryLabel('variable', variableId))}</span><span style="flex:0 0 auto;font-size:10px;color:var(--color-text-muted);">▾</span></button>
                            <select class="w3d-op" style="width:64px;${control}">
                                ${['>=', '>', '=', '<', '<=', '!='].map(entry =>
                                    `<option value="${entry}"${entry === op ? ' selected' : ''}>${entry === '>=' ? '≥' : entry === '<=' ? '≤' : entry === '!=' ? '≠' : entry}</option>`).join('')}
                            </select>
                            <input type="number" class="w3d-value" step="1" value="${value}" style="width:90px;${control}">
                        </span>
                    </div>
                    <div style="${rowStyle}">
                        <span></span>
                        <label style="${radioCell}"><input type="checkbox" class="w3d-resume"${resume ? ' checked' : ''}> ${this._t('This event keeps moving')}</label>
                    </div>
                    <div style="${rowStyle}">
                        <span></span>
                        <span style="font-size:11px;color:var(--color-text-muted);">${this._t('The player keeps moving while this holds.')}</span>
                    </div>
                </div>
                <div class="rr-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;">
                    <button type="button" class="rr-btn-secondary w3d-cancel">${window.I18n ? window.I18n.t('common.cancel') : 'Cancel'}</button>
                    <button type="button" class="rr-button-primary w3d-ok">${window.I18n ? window.I18n.t('common.ok') : 'OK'}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const close = () => { if (modal.parentNode) modal.parentNode.removeChild(modal); };
        const arm = radioValue => {
            const radio = modal.querySelector(`input[name="w3d-mode"][value="${radioValue}"]`);
            if (radio) radio.checked = true;
        };
        for (const [selector, radioValue] of [['.w3d-duration', 'duration'], ['.w3d-switch-value', 'switch'], ['.w3d-op', 'variable'], ['.w3d-value', 'variable']]) {
            modal.querySelector(selector).addEventListener('focus', () => arm(radioValue));
        }
        modal.querySelector('.w3d-switch-pick').addEventListener('click', () => {
            arm('switch');
            this._openPicker('switch', switchId, id => {
                switchId = id;
                modal.querySelector('.w3d-switch-label').textContent = this._entryLabel('switch', id);
            });
        });
        modal.querySelector('.w3d-variable-pick').addEventListener('click', () => {
            arm('variable');
            this._openPicker('variable', variableId, id => {
                variableId = id;
                modal.querySelector('.w3d-variable-label').textContent = this._entryLabel('variable', id);
            });
        });
        modal.querySelectorAll('.w3d-cancel').forEach(btn => btn.addEventListener('click', () => { close(); callback(null); }));
        modal.querySelector('.w3d-ok').addEventListener('click', () => {
            const chosen = modal.querySelector('input[name="w3d-mode"]:checked');
            const result = {
                code: 357,
                indent: (command && command.indent) || 0,
                parameters: ['RPGReactor', 'ScopedWait', 'Scoped Wait', {
                    target: modal.querySelector('.w3d-target').value,
                    mode: chosen ? chosen.value : 'actions',
                    duration: String(Math.max(1, Math.round(Number(modal.querySelector('.w3d-duration').value) || 60))),
                    switchId: String(switchId),
                    switchValue: modal.querySelector('.w3d-switch-value').value,
                    variableId: String(variableId),
                    op: modal.querySelector('.w3d-op').value,
                    value: modal.querySelector('.w3d-value').value,
                    resume: modal.querySelector('.w3d-resume').checked ? 'true' : 'false'
                }]
            };
            close();
            callback(result);
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = WaitForModel3DEditor;
}
