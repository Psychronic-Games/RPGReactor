/**
 * Character Creation as an event command: a mirror, a barber, a tailor, or the moment an
 * intro hands over to the player. Stored as an MZ plugin command (code 357, plugin
 * "RPGReactor"), read by runtime/reactor_character_creator.js.
 *
 *   once      skip it for a player who already has their character
 *   required  no way back: an intro that can't go on without one
 *   switchId  on when the player has their character, off when they backed out
 */
class CharacterCommandEditor {
    static NAMES = ['CharacterCreation'];
    static LABELS = { CharacterCreation: 'Character Creation' };

    static supports(name) {
        return CharacterCommandEditor.NAMES.includes(name);
    }

    static build(indent = 0, options = {}) {
        const args = {};
        if (options.once) args.once = true;
        if (options.required) args.required = true;
        if (Number(options.switchId) > 0) args.switchId = Number(options.switchId);
        return { code: 357, indent, parameters: ['RPGReactor', 'CharacterCreation', 'Character Creation', args] };
    }

    /** The project's switches as [id, label], with the one in use kept if it has no name. */
    switches() {
        const names = window.reactor?.databaseManager?.getSystem?.()?.switches || [];
        return names.map((name, id) => [id, String(id).padStart(4, '0') + (name ? ': ' + name : '')]).filter(([id]) => id > 0);
    }

    show(command, callback) {
        const args = (command && command.parameters && command.parameters[3]) || {};
        const indent = (command && command.indent) || 0;
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay rr-command-editor-modal';
        modal.style.zIndex = '21000';
        const row = (cls, checked, label) => `<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);cursor:pointer;">
            <input type="checkbox" class="system-checkbox ${cls}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
        modal.innerHTML = `
            <div class="rr-modal" style="width:min(460px,90vw);display:flex;flex-direction:column;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${window.I18n && window.I18n.tEventCommandName ? window.I18n.tEventCommandName('Character Creation') : 'Character Creation'}</div>
                    <button type="button" class="rr-modal-close ccc-cancel">&times;</button>
                </div>
                <div class="rr-modal-body" style="display:flex;flex-direction:column;gap:10px;">
                    ${row('ccc-once', !!args.once, tt('Only if the player has no character yet'))}
                    ${row('ccc-required', !!args.required, tt('The player must finish it'))}
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);">
                        <span>${tt('Switch set when it ends')}</span>
                        <select class="rr-select ccc-switch" style="flex:1;min-width:0;">
                            <option value="0">${tt('None')}</option>
                            ${this.switches().map(([id, label]) => `<option value="${id}" ${id === Number(args.switchId) ? 'selected' : ''}>${escape(label)}</option>`).join('')}
                        </select>
                    </label>
                </div>
                <div class="rr-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;">
                    <button type="button" class="rr-btn-secondary ccc-cancel">${window.I18n ? window.I18n.t('common.cancel') : 'Cancel'}</button>
                    <button type="button" class="rr-button-primary ccc-ok">${window.I18n ? window.I18n.t('common.ok') : 'OK'}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelectorAll('.ccc-cancel').forEach(button => button.addEventListener('click', () => { close(); callback(null); }));
        modal.querySelector('.ccc-ok').addEventListener('click', () => {
            const made = CharacterCommandEditor.build(indent, {
                once: modal.querySelector('.ccc-once').checked, required: modal.querySelector('.ccc-required').checked,
                switchId: modal.querySelector('.ccc-switch').value });
            close();
            callback(made);
        });
    }
}

if (typeof window !== 'undefined') window.CharacterCommandEditor = CharacterCommandEditor;
