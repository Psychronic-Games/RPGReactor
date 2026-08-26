/**
 * Call User Interface — a Reactor event command. Stored as an MZ plugin
 * command (code 357, plugin "RPGReactor"), so the data stays loadable
 * everywhere and a stock MZ runtime simply ignores it. The runtime opens the
 * chosen record from data/UserInterfaces.json as a scene over the map.
 */
class CallUserInterfaceEditor {
    constructor(databaseManager) {
        this.databaseManager = databaseManager;
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    /** Every authored interface as [id, label]. */
    interfaces() {
        const manager = this.databaseManager
            || (window.reactor && window.reactor.databaseManager) || null;
        const list = manager && manager.getUserInterfaces ? manager.getUserInterfaces() : [];
        const options = [];
        for (const entry of Array.isArray(list) ? list : []) {
            if (!entry || typeof entry !== 'object') continue;
            const id = Number(entry.id) || 0;
            if (id <= 0) continue;
            options.push([String(id), String(id).padStart(4, '0') + (entry.name ? ': ' + entry.name : '')]);
        }
        return options;
    }

    show(command, callback) {
        const args = (command && command.parameters && command.parameters[3]) || {};
        const current = String(args.interfaceId != null ? args.interfaceId : '');
        const options = this.interfaces();
        if (current && !options.some(([value]) => value === current)) {
            // Keep a reference to a deleted record visible rather than
            // silently retargeting the command.
            options.unshift([current, String(current).padStart(4, '0') + ': ' + this._t('(Missing)')]);
        }
        const selected = current || (options.length ? options[0][0] : '');

        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay';
        modal.style.zIndex = '21000';
        const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        modal.innerHTML = `
            <div class="rr-modal" style="width:min(420px,90vw);display:flex;flex-direction:column;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${window.I18n && window.I18n.tEventCommandName
                        ? window.I18n.tEventCommandName('Call User Interface') : 'Call User Interface'}</div>
                    <button type="button" class="rr-modal-close cui-cancel">&times;</button>
                </div>
                <div class="rr-modal-body" style="display:flex;flex-direction:column;gap:10px;">
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);">
                        <span style="flex:0 0 90px;">${this._t('Interface')}</span>
                        <select class="cui-interface" style="flex:1;padding:4px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);"${options.length ? '' : ' disabled'}>
                            ${options.length ? options.map(([value, label]) =>
                                `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(label)}</option>`).join('')
                                : `<option value="">${this._t('No user interfaces in the database yet')}</option>`}
                        </select>
                    </label>
                </div>
                <div class="rr-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;">
                    <button type="button" class="rr-btn-secondary cui-cancel">${window.I18n ? window.I18n.t('common.cancel') : 'Cancel'}</button>
                    <button type="button" class="rr-button-primary cui-ok"${options.length ? '' : ' disabled'}>${window.I18n ? window.I18n.t('common.ok') : 'OK'}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const close = () => {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
        };
        modal.querySelectorAll('.cui-cancel').forEach(btn => btn.addEventListener('click', () => {
            close();
            callback(null);
        }));
        modal.querySelector('.cui-ok').addEventListener('click', () => {
            const interfaceId = modal.querySelector('.cui-interface').value;
            if (!interfaceId) return;
            close();
            callback(CallUserInterfaceEditor.build(interfaceId, (command && command.indent) || 0));
        });
    }

    static build(interfaceId, indent = 0) {
        return {
            code: 357,
            indent,
            parameters: ['RPGReactor', 'CallUserInterface', 'Call User Interface', { interfaceId: String(interfaceId) }]
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CallUserInterfaceEditor;
}
