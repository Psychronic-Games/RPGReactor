/**
 * The Steam event command - a Reactor command stored as an MZ plugin command (code 357, plugin "RPGReactor"), so a
 * stock MZ runtime ignores it. runtime/reactor_steam.js runs it.
 *
 *   SteamAchievement  unlock (or, for testing, lock again) one of the game's Steam achievements, by the API name it
 *                     was given in Steamworks > Stats & Achievements. The game's App ID is on Database › System 2.
 */
class SteamCommandEditor {
    static NAMES = ['SteamAchievement'];
    static LABELS = { SteamAchievement: 'Steam Achievement' };
    static ACTIONS = ['unlock', 'clear'];
    static API_NAME = /^[A-Za-z0-9_.-]{1,128}$/;

    constructor(databaseManager) {
        this.databaseManager = databaseManager;
    }

    static supports(name) {
        return SteamCommandEditor.NAMES.includes(name);
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    actionLabel(value) {
        return value === 'clear' ? this._t('Lock again (testing)') : this._t('Unlock');
    }

    show(command, callback) {
        const params = (command && command.parameters) || [];
        const args = (params[3] && typeof params[3] === 'object') ? params[3] : {};
        const escape = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const css = 'flex:1;padding:4px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;';
        const row = (label, inner) => `<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);"><span style="flex:0 0 110px;">${label}</span>${inner}</label>`;
        const body = row(this._t('API name'), `<input class="sc-api" spellcheck="false" autocomplete="off" style="${css}" placeholder="FIRST_WIN">`)
            + row(this._t('Action'), `<select class="sc-action" style="${css}">${SteamCommandEditor.ACTIONS.map(a => `<option value="${a}"${a === (args.action || 'unlock') ? ' selected' : ''}>${escape(this.actionLabel(a))}</option>`).join('')}</select>`)
            + `<div style="font-size:11px;color:var(--color-text-muted);line-height:1.5;">${escape(this._t('The API name the achievement has in Steamworks > Stats & Achievements. The game\'s Steam App ID is on Database > System 2.'))}</div>`;

        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay rr-command-editor-modal';
        modal.style.zIndex = '21000';
        const title = window.I18n && window.I18n.tEventCommandName ? window.I18n.tEventCommandName('Steam Achievement') : 'Steam Achievement';
        modal.innerHTML = `
            <div class="rr-modal" style="width:min(460px,90vw);display:flex;flex-direction:column;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${escape(title)}</div>
                    <button type="button" class="rr-modal-close sc-cancel">&times;</button>
                </div>
                <div class="rr-modal-body" style="display:flex;flex-direction:column;gap:10px;">${body}</div>
                <div class="rr-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;">
                    <button type="button" class="rr-btn-secondary sc-cancel">${window.I18n ? window.I18n.t('common.cancel') : 'Cancel'}</button>
                    <button type="button" class="rr-button-primary sc-ok">${window.I18n ? window.I18n.t('common.ok') : 'OK'}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const api = modal.querySelector('.sc-api'), ok = modal.querySelector('.sc-ok');
        api.value = String(args.api || '');
        const valid = () => SteamCommandEditor.API_NAME.test(api.value.trim());
        const update = () => { ok.disabled = !valid(); };
        api.addEventListener('input', update);
        update();
        api.focus();
        const close = () => { if (modal.parentNode) modal.parentNode.removeChild(modal); };
        modal.querySelectorAll('.sc-cancel').forEach(button => button.addEventListener('click', () => { close(); callback(null); }));
        ok.addEventListener('click', () => {
            if (!valid()) return;
            const built = { api: api.value.trim(), action: modal.querySelector('.sc-action').value };
            close();
            callback(SteamCommandEditor.build('SteamAchievement', built, (command && command.indent) || 0, this));
        });
    }

    /** One line for the event list ("Unlock: FIRST_WIN"). */
    static summary(name, args, editor = null) {
        args = args || {};
        const action = editor ? editor.actionLabel(args.action) : (args.action === 'clear' ? 'Lock again (testing)' : 'Unlock');
        return `${action}: ${args.api || ''}`;
    }

    /** The command as stored: params[2] keeps a readable label for other tools. */
    static build(name, args, indent = 0, editor = null) {
        const label = SteamCommandEditor.LABELS[name] || name;
        return { code: 357, indent, parameters: ['RPGReactor', name, `${label}: ${SteamCommandEditor.summary(name, args, editor)}`, args] };
    }
}

if (typeof globalThis !== 'undefined') globalThis.SteamCommandEditor = SteamCommandEditor;
if (typeof module !== 'undefined' && module.exports) module.exports = SteamCommandEditor;
