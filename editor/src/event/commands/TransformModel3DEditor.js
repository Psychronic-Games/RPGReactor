/**
 * TransformModel3DEditor - the Reactor "Transform 3D Model" event command.
 *
 * Saved as a stock plugin command (code 357, plugin "RPGReactor", command
 * "TransformModel3D"), so the data stays loadable everywhere. An offset in
 * tiles, a turn in degrees and a scale (one number, or one per axis) laid
 * over the model's placed pose, eased there over a number of frames.
 */
class TransformModel3DEditor {
    _t(key, params) {
        return window.I18n ? window.I18n.t(key, params) : key;
    }

    _tx(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    mapEvents() {
        const map = window.reactor && window.reactor.eventManager && window.reactor.eventManager.currentMap;
        const events = [];
        for (const event of (map && map.events) || []) {
            if (event) events.push({ id: event.id, name: event.name || '' });
        }
        return events;
    }

    /** Props stand in the map as events past PROP_EVENT_BASE. */
    mapProps() {
        const map = window.reactor && window.reactor.eventManager && window.reactor.eventManager.currentMap;
        const props = map && map.reactor3d && Array.isArray(map.reactor3d.props) ? map.reactor3d.props : [];
        const base = typeof Reactor3D !== 'undefined' && Reactor3D.PROP_EVENT_BASE ? Reactor3D.PROP_EVENT_BASE : 10000;
        return props.map(prop => ({ id: base + prop.id, label: `#${prop.id} ${String(prop.name || '').split('/').pop()}` }));
    }

    /** The command an argument object builds, for saving and for tests. */
    static build(args, indent = 0) {
        const number = (value, fallback = 0) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? String(Math.round(parsed * 1000) / 1000) : String(fallback);
        };
        const scale = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed > 0 ? String(Math.round(parsed * 1000) / 1000) : '1';
        };
        const proportional = args.proportional !== false && String(args.proportional) !== 'false';
        const uniform = scale(args.scale);
        return {
            code: 357,
            indent: indent || 0,
            parameters: [
                'RPGReactor',
                'TransformModel3D',
                'Transform 3D Model',
                {
                    target: String(Math.round(Number(args.target) || 0)),
                    offsetX: number(args.offsetX), offsetY: number(args.offsetY), offsetZ: number(args.offsetZ),
                    yaw: number(args.yaw), pitch: number(args.pitch), roll: number(args.roll),
                    proportional: proportional ? 'true' : 'false',
                    scaleX: proportional ? uniform : scale(args.scaleX),
                    scaleY: proportional ? uniform : scale(args.scaleY),
                    scaleZ: proportional ? uniform : scale(args.scaleZ),
                    duration: String(Math.max(0, Math.min(6000, Math.round(Number(args.duration) || 0)))),
                    wait: args.wait ? 'true' : 'false'
                }
            ]
        };
    }

    show(command, callback) {
        const args = (command && command.parameters && command.parameters[3]) || {};
        const value = (key, fallback) => (args[key] === undefined || args[key] === null || args[key] === '' ? fallback : String(args[key]));
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const target = value('target', '0');
        const proportional = String(args.proportional) !== 'false';
        const events = this.mapEvents();
        const props = this.mapProps();

        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay';
        modal.style.zIndex = '21000';
        const row = (key, label, min, max, step, current, unit) => `
            <div style="display:grid;grid-template-columns:70px 1fr 74px;gap:8px;align-items:center;font-size:12px;color:var(--color-text);">
                <span>${escape(label)}</span>
                <input type="range" class="tm3d-slider" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${escape(current)}" style="width:100%;min-width:0;">
                <input type="number" class="tm3d-num" data-key="${key}" data-no-stepper step="${step}" value="${escape(current)}" title="${escape(unit)}"
                    style="width:100%;box-sizing:border-box;padding:4px 6px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;">
            </div>`;
        const targetOptions = [['0', this._t('cam3d.thisEvent')], ['-1', this._tx('Player')]]
            .concat(events.map(event => [String(event.id), String(event.id).padStart(3, '0') + (event.name ? ': ' + event.name : '')]))
            .concat(props.map(prop => [String(prop.id), `${this._tx('Prop')} ${prop.label}`]))
            .map(([id, label]) => `<option value="${id}"${id === target ? ' selected' : ''}>${escape(label)}</option>`).join('');
        modal.innerHTML = `
            <div class="rr-modal" style="width:min(520px,92vw);display:flex;flex-direction:column;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${escape(window.I18n && window.I18n.tEventCommandName
                        ? window.I18n.tEventCommandName('Transform 3D Model') : 'Transform 3D Model')}</div>
                    <button type="button" class="rr-modal-close tm3d-cancel">&times;</button>
                </div>
                <div class="rr-modal-body" style="display:flex;flex-direction:column;gap:8px;">
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);">
                        <span style="flex:0 0 70px;">${escape(this._tx('3D Model'))}</span>
                        <select class="tm3d-target" style="flex:1;min-width:0;">${targetOptions}</select>
                    </label>
                    <div style="font-size:11px;font-weight:700;color:var(--color-text-strong);margin-top:4px;">${escape(this._tx('Offset'))}</div>
                    ${row('offsetX', 'X', -8, 8, 0.05, value('offsetX', '0'), this._tx('tiles'))}
                    ${row('offsetY', 'Y', -8, 8, 0.05, value('offsetY', '0'), this._tx('tiles'))}
                    ${row('offsetZ', 'Z', -8, 8, 0.05, value('offsetZ', '0'), this._tx('tiles'))}
                    <div style="font-size:11px;font-weight:700;color:var(--color-text-strong);margin-top:4px;">${escape(this._tx('Rotate'))}</div>
                    ${row('yaw', this._tx('Yaw'), -180, 180, 1, value('yaw', '0'), '°')}
                    ${row('pitch', this._tx('Pitch'), -180, 180, 1, value('pitch', '0'), '°')}
                    ${row('roll', this._tx('Roll'), -180, 180, 1, value('roll', '0'), '°')}
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
                        <span style="font-size:11px;font-weight:700;color:var(--color-text-strong);">${escape(this._tx('Scale'))}</span>
                        <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--color-text);cursor:pointer;">
                            <input type="checkbox" class="tm3d-proportional"${proportional ? ' checked' : ''}> ${escape(this._t('r3dcard.proportional'))}</label>
                    </div>
                    <div class="tm3d-scale-uniform">${row('scale', this._tx('Scale'), 0.1, 4, 0.01, value('scaleX', '1'), '×')}</div>
                    <div class="tm3d-scale-axes" style="display:${proportional ? 'none' : 'block'};">
                        ${row('scaleX', 'X', 0.1, 4, 0.01, value('scaleX', '1'), '×')}
                        ${row('scaleY', 'Y', 0.1, 4, 0.01, value('scaleY', '1'), '×')}
                        ${row('scaleZ', 'Z', 0.1, 4, 0.01, value('scaleZ', '1'), '×')}
                    </div>
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);margin-top:4px;">
                        <span style="flex:0 0 70px;">${escape(this._t('cam3d.duration'))}</span>
                        <input type="number" class="tm3d-duration" data-no-stepper min="0" max="6000" step="1" value="${escape(value('duration', '60'))}"
                            style="flex:1;min-width:0;padding:4px 6px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;">
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);cursor:pointer;">
                        <input type="checkbox" class="tm3d-wait"${String(args.wait) === 'true' ? ' checked' : ''}> ${escape(this._t('cam3d.wait'))}</label>
                </div>
                <div class="rr-modal-footer">
                    <button type="button" class="rr-btn-secondary tm3d-cancel">${escape(this._t('common.cancel'))}</button>
                    <button type="button" class="rr-button-primary tm3d-ok">${escape(this._t('common.ok'))}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const q = selector => modal.querySelector(selector);
        modal.querySelectorAll('.tm3d-slider').forEach(slider => slider.addEventListener('input', () => {
            const num = modal.querySelector(`.tm3d-num[data-key="${slider.dataset.key}"]`);
            if (num) num.value = slider.value;
        }));
        modal.querySelectorAll('.tm3d-num').forEach(num => num.addEventListener('change', () => {
            const slider = modal.querySelector(`.tm3d-slider[data-key="${num.dataset.key}"]`);
            if (slider) slider.value = num.value;
        }));
        const proportionalBox = q('.tm3d-proportional');
        const showScale = () => {
            q('.tm3d-scale-uniform').style.display = proportionalBox.checked ? 'block' : 'none';
            q('.tm3d-scale-axes').style.display = proportionalBox.checked ? 'none' : 'block';
        };
        proportionalBox.addEventListener('change', showScale);
        showScale();
        const close = () => { if (modal.parentNode) modal.parentNode.removeChild(modal); };
        modal.querySelectorAll('.tm3d-cancel').forEach(button => button.addEventListener('click', () => { close(); callback(null); }));
        const numberOf = key => modal.querySelector(`.tm3d-num[data-key="${key}"]`).value;
        q('.tm3d-ok').addEventListener('click', () => {
            const result = TransformModel3DEditor.build({
                target: q('.tm3d-target').value,
                offsetX: numberOf('offsetX'), offsetY: numberOf('offsetY'), offsetZ: numberOf('offsetZ'),
                yaw: numberOf('yaw'), pitch: numberOf('pitch'), roll: numberOf('roll'),
                proportional: proportionalBox.checked,
                scale: numberOf('scale'), scaleX: numberOf('scaleX'), scaleY: numberOf('scaleY'), scaleZ: numberOf('scaleZ'),
                duration: q('.tm3d-duration').value,
                wait: q('.tm3d-wait').checked
            }, (command && command.indent) || 0);
            close();
            callback(result);
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TransformModel3DEditor;
}
