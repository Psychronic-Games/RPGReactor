/**
 * Change 3D Camera — a Reactor event command.
 *
 * Stored as an MZ plugin command (code 357, plugin "RPGReactor", command
 * "ChangeCamera3D"), so the data stays loadable everywhere and a stock MZ
 * runtime ignores it. The runtime (`reactor_camera_3d.js`) moves the 3D map
 * camera to the chosen mode, eased over the duration. A blank number means
 * the mode's own value.
 */
class Camera3DEditor {
    constructor() {
        this.modes = ['fixed', 'topDown', 'isometric', 'thirdPerson', 'firstPerson'];
    }

    _t(key, params) {
        return window.I18n ? window.I18n.t(key, params) : key;
    }

    static modeLabelKey(mode) {
        return `cam3d.mode.${mode}`;
    }

    /** The mode defaults the runtime uses, for placeholders. */
    static modeDefaults(mode) {
        const table = {
            fixed: { pitch: 55, yaw: 0, fov: 30, distance: '' },
            topDown: { pitch: 89, yaw: 0, fov: 30, distance: '' },
            isometric: { pitch: 35.264, yaw: 45, fov: 15, distance: '' },
            thirdPerson: { pitch: 28, yaw: 0, fov: 45, distance: 6 },
            firstPerson: { pitch: 0, yaw: 0, fov: 70, distance: '' }
        };
        return table[mode] || table.fixed;
    }

    static normalizeMode(value) {
        const modes = ['fixed', 'topDown', 'isometric', 'thirdPerson', 'firstPerson'];
        const key = String(value || '').toLowerCase().replace(/[\s_-]/g, '');
        return modes.find(mode => mode.toLowerCase() === key) || 'fixed';
    }

    mapEvents() {
        const map = window.reactor && window.reactor.eventManager && window.reactor.eventManager.currentMap;
        const events = [];
        for (const event of (map && map.events) || []) {
            if (event) events.push({ id: event.id, name: event.name || '' });
        }
        return events;
    }

    /** The command an argument object builds, for saving and for tests. */
    static build(args, indent = 0) {
        const number = value => {
            if (value === '' || value === null || value === undefined) return '';
            const parsed = Number(value);
            return Number.isFinite(parsed) ? String(parsed) : '';
        };
        return {
            code: 357,
            indent: indent || 0,
            parameters: [
                'RPGReactor',
                'ChangeCamera3D',
                'Change 3D Camera',
                {
                    mode: Camera3DEditor.normalizeMode(args.mode),
                    pitch: number(args.pitch),
                    yaw: number(args.yaw),
                    distance: number(args.distance),
                    fov: number(args.fov),
                    focus: String(args.focus || 'auto'),
                    eventId: args.focus === 'event' ? number(args.eventId) || '0' : '0',
                    duration: String(Math.max(0, Math.min(6000, Math.round(Number(args.duration) || 0)))),
                    wait: args.wait ? 'true' : 'false',
                    keep: args.keep ? 'true' : 'false'
                }
            ]
        };
    }

    show(command, callback) {
        const args = (command && command.parameters && command.parameters[3]) || {};
        const mode = Camera3DEditor.normalizeMode(args.mode);
        const focus = ['auto', 'display', 'player', 'event'].includes(String(args.focus)) ? String(args.focus) : 'auto';
        const eventId = String(args.eventId || '0');
        const value = key => (args[key] === undefined || args[key] === null ? '' : String(args[key]));
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const events = this.mapEvents();

        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay';
        modal.style.zIndex = '21000';
        const row = (label, control, labelWidth = 120) => `
            <label style="display:flex;align-items:center;gap:8px;min-width:0;font-size:12px;color:var(--color-text);">
                <span style="flex:0 0 ${labelWidth}px;">${escape(label)}</span>${control}
            </label>`;
        // Themed step buttons stand in for the browser spinner.
        const input = (cls, current, placeholder, step = '1') =>
            `<div class="rr-number-stepper" style="flex:1;min-width:0;">
                <input type="number" step="${step}" class="${cls} rr-number-stepper-input" value="${escape(current)}" placeholder="${escape(placeholder)}"
                    style="flex:1;min-width:0;width:100%;box-sizing:border-box;padding:5px 6px;border:0;background:transparent;color:var(--color-text);">
                <div class="rr-number-stepper-buttons">
                    <button type="button" tabindex="-1" class="cam3d-step" data-direction="1" aria-label="+">&#9650;</button>
                    <button type="button" tabindex="-1" class="cam3d-step" data-direction="-1" aria-label="-">&#9660;</button>
                </div>
            </div>`;
        const modeOptions = this.modes.map(name =>
            `<option value="${name}"${name === mode ? ' selected' : ''}>${escape(this._t(Camera3DEditor.modeLabelKey(name)))}</option>`).join('');
        const focusOptions = [
            ['auto', this._t('cam3d.focus.auto')],
            ['display', this._t('cam3d.focus.display')],
            ['player', this._t('cam3d.focus.player')],
            ['event', this._t('cam3d.focus.event')]
        ].map(([name, label]) => `<option value="${name}"${name === focus ? ' selected' : ''}>${escape(label)}</option>`).join('');
        const eventOptions = [['0', this._t('cam3d.thisEvent')]]
            .concat(events.map(event => [String(event.id),
                String(event.id).padStart(3, '0') + (event.name ? ': ' + event.name : '')]))
            .map(([id, label]) => `<option value="${id}"${id === eventId ? ' selected' : ''}>${escape(label)}</option>`).join('');
        modal.innerHTML = `
            <div class="rr-modal" style="width:min(460px,92vw);display:flex;flex-direction:column;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${escape(window.I18n && window.I18n.tEventCommandName
                        ? window.I18n.tEventCommandName('Change 3D Camera') : 'Change 3D Camera')}</div>
                    <button type="button" class="rr-modal-close cam3d-cancel">&times;</button>
                </div>
                <div class="rr-modal-body" style="display:flex;flex-direction:column;gap:10px;">
                    ${row(this._t('cam3d.mode'), `<select class="cam3d-mode" style="flex:1;padding:4px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);">${modeOptions}</select>`)}
                    <div class="cam3d-hint" style="font-size:11px;color:var(--color-text-muted);line-height:1.4;margin-left:128px;"></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;">
                        ${row(this._t('cam3d.pitch'), input('cam3d-pitch', value('pitch'), ''), 70)}
                        ${row(this._t('cam3d.yaw'), input('cam3d-yaw', value('yaw'), ''), 70)}
                        ${row(this._t('cam3d.distance'), input('cam3d-distance', value('distance'), ''), 70)}
                        ${row(this._t('cam3d.fov'), input('cam3d-fov', value('fov'), ''), 70)}
                    </div>
                    <div style="font-size:11px;color:var(--color-text-muted);margin-left:128px;">${escape(this._t('cam3d.blankHint'))}</div>
                    ${row(this._t('cam3d.focus'), `<select class="cam3d-focus" style="flex:1;padding:4px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);">${focusOptions}</select>`)}
                    ${row(this._t('cam3d.event'), `<select class="cam3d-event" style="flex:1;padding:4px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);">${eventOptions}</select>`)}
                    ${row(this._t('cam3d.duration'), input('cam3d-duration', value('duration') || '0', '0', '1'))}
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);margin-left:128px;">
                        <input type="checkbox" class="cam3d-wait"${args.wait === 'true' || args.wait === true ? ' checked' : ''}>
                        <span>${escape(this._t('cam3d.wait'))}</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);margin-left:128px;">
                        <input type="checkbox" class="cam3d-keep"${args.keep === 'true' || args.keep === true ? ' checked' : ''}>
                        <span>${escape(this._t('cam3d.keep'))}</span>
                    </label>
                </div>
                <div class="rr-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;">
                    <button type="button" class="rr-btn-secondary cam3d-cancel">${escape(this._t('common.cancel'))}</button>
                    <button type="button" class="rr-button-primary cam3d-ok">${escape(this._t('common.ok'))}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const q = selector => modal.querySelector(selector);

        // Placeholders show what a blank field means for the chosen mode, and
        // the event row only matters when the focus is an event.
        const sync = () => {
            const chosen = Camera3DEditor.normalizeMode(q('.cam3d-mode').value);
            const defaults = Camera3DEditor.modeDefaults(chosen);
            q('.cam3d-pitch').placeholder = String(defaults.pitch);
            q('.cam3d-yaw').placeholder = String(defaults.yaw);
            q('.cam3d-distance').placeholder = defaults.distance === '' ? this._t('cam3d.auto') : String(defaults.distance);
            q('.cam3d-fov').placeholder = String(defaults.fov);
            q('.cam3d-hint').textContent = this._t(`cam3d.hint.${chosen}`);
            q('.cam3d-event').closest('label').style.display = q('.cam3d-focus').value === 'event' ? 'flex' : 'none';
        };
        modal.querySelectorAll('.cam3d-step').forEach(button => button.addEventListener('click', () => {
            const field = button.closest('.rr-number-stepper').querySelector('input');
            const direction = Number(button.dataset.direction) > 0 ? 1 : -1;
            // A blank field steps from the mode's own value, which the
            // placeholder shows, rather than from zero.
            if (field.value === '' && field.placeholder && Number.isFinite(Number(field.placeholder))) {
                field.value = field.placeholder;
            }
            try {
                direction > 0 ? field.stepUp() : field.stepDown();
            } catch (error) {
                field.value = (Number(field.value) || 0) + direction * (Number(field.step) || 1);
            }
            field.dispatchEvent(new Event('input', { bubbles: true }));
        }));
        q('.cam3d-mode').addEventListener('change', sync);
        q('.cam3d-focus').addEventListener('change', sync);
        sync();

        const close = () => {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
        };
        modal.querySelectorAll('.cam3d-cancel').forEach(btn => btn.addEventListener('click', () => {
            close();
            callback(null);
        }));
        q('.cam3d-ok').addEventListener('click', () => {
            const result = Camera3DEditor.build({
                mode: q('.cam3d-mode').value,
                pitch: q('.cam3d-pitch').value,
                yaw: q('.cam3d-yaw').value,
                distance: q('.cam3d-distance').value,
                fov: q('.cam3d-fov').value,
                focus: q('.cam3d-focus').value,
                eventId: q('.cam3d-event').value,
                duration: q('.cam3d-duration').value,
                wait: q('.cam3d-wait').checked,
                keep: q('.cam3d-keep').checked
            }, (command && command.indent) || 0);
            close();
            callback(result);
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Camera3DEditor;
}
