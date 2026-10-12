/**
 * LightCommandEditor - the Reactor lighting event commands.
 *
 * Three commands, each saved as a stock plugin command (code 357, plugin
 * "RPGReactor") so the data stays loadable everywhere:
 *
 *   LightSwitch   { target, state }                 turn a light (or a #tag
 *                                                   of lights) on, off, or over
 *   TransformLight { target, x, y, height, yaw, pitch, radius, angle, width,
 *                    intensity, color, duration, wait, reset }
 *                                                   ease a light to new values;
 *                                                   an empty field is left as
 *                                                   authored, reset clears every
 *                                                   override
 *   AmbientLight  { intensity, color, duration, wait, reset }
 *                                                   ease the map's ambient light
 *
 * `target` is a light's id, or "#tag" for every light sharing that tag. The
 * dialog offers the current map's lights and tags, and keeps a free field for
 * a light on another map or one not placed yet.
 */
class LightCommandEditor {
    static COMMANDS = {
        LightSwitch: 'Switch Light',
        TransformLight: 'Transform Light',
        AmbientLight: 'Change Ambient Light'
    };

    /** The optional value fields of TransformLight, with their slider ranges. */
    static TRANSFORM_FIELDS = [
        { key: 'x', label: 'lightcmd.x', min: -50, max: 50, step: 0.05, fallback: 0 },
        { key: 'y', label: 'lightcmd.y', min: -50, max: 50, step: 0.05, fallback: 0 },
        { key: 'height', label: 'lightcmd.height', min: 0, max: 20, step: 0.05, fallback: 1 },
        { key: 'yaw', label: 'lightcmd.yaw', min: -180, max: 180, step: 1, fallback: 0 },
        { key: 'pitch', label: 'lightcmd.pitch', min: -90, max: 90, step: 1, fallback: 0 },
        { key: 'radius', label: 'lightcmd.radius', min: 0.1, max: 60, step: 0.1, fallback: 3 },
        { key: 'angle', label: 'lightcmd.angle', min: 1, max: 179, step: 1, fallback: 70 },
        { key: 'width', label: 'lightcmd.width', min: 0.005, max: 3, step: 0.005, fallback: 0.08 },
        { key: 'intensity', label: 'lightcmd.intensity', min: 0, max: 4, step: 0.05, fallback: 1 }
    ];

    static supports(name) {
        return Object.prototype.hasOwnProperty.call(LightCommandEditor.COMMANDS, String(name || ''));
    }

    _t(key, params) {
        return window.I18n ? window.I18n.t(key, params) : key;
    }

    static _t(key) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.t(key) : key;
    }

    /** The current map's lights, as `{ id, tag, type }`, for the picker. */
    mapLights() {
        const map = window.reactor && window.reactor.eventManager && window.reactor.eventManager.currentMap;
        const lights = map && map.reactor3d && Array.isArray(map.reactor3d.lights) ? map.reactor3d.lights : [];
        return lights.filter(light => light && light.id).map(light => ({
            id: String(light.id), tag: light.tag ? String(light.tag) : '', type: String(light.type || 'point')
        }));
    }

    /** A number as the runtime reads it, or '' for "leave as authored". */
    static _optional(value, min, max) {
        if (value === undefined || value === null || value === '') return '';
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return '';
        const bounded = Math.min(max, Math.max(min, parsed));
        return String(Math.round(bounded * 1000) / 1000);
    }

    static _colour(value) {
        const hex = String(value || '').replace('#', '').trim();
        return /^[0-9a-f]{6}$/i.test(hex) ? '#' + hex.toLowerCase() : '';
    }

    static _duration(value) {
        return String(Math.max(0, Math.min(6000, Math.round(Number(value) || 0))));
    }

    static _flag(value) {
        return value === true || String(value) === 'true' ? 'true' : 'false';
    }

    /** The command an argument object builds, for saving and for tests. */
    static build(name, args, indent = 0) {
        const label = LightCommandEditor.COMMANDS[name];
        if (!label) return null;
        const input = args || {};
        const target = String(input.target || '').trim();
        let saved;
        if (name === 'LightSwitch') {
            const state = ['on', 'off', 'toggle'].includes(String(input.state)) ? String(input.state) : 'on';
            saved = { target, state };
        } else if (name === 'TransformLight') {
            const reset = LightCommandEditor._flag(input.reset) === 'true';
            saved = { target };
            for (const field of LightCommandEditor.TRANSFORM_FIELDS) {
                saved[field.key] = reset ? '' : LightCommandEditor._optional(input[field.key], field.min, field.max);
            }
            saved.color = reset ? '' : LightCommandEditor._colour(input.color);
            saved.duration = LightCommandEditor._duration(input.duration);
            saved.wait = LightCommandEditor._flag(input.wait);
            saved.reset = reset ? 'true' : 'false';
        } else {
            const reset = LightCommandEditor._flag(input.reset) === 'true';
            saved = {
                intensity: reset ? '' : LightCommandEditor._optional(input.intensity, 0, 1),
                color: reset ? '' : LightCommandEditor._colour(input.color),
                duration: LightCommandEditor._duration(input.duration),
                wait: LightCommandEditor._flag(input.wait),
                reset: reset ? 'true' : 'false'
            };
        }
        return { code: 357, indent: indent || 0, parameters: ['RPGReactor', name, label, saved] };
    }

    /** One readable line for the command list. */
    static summary(name, args) {
        const a = args || {};
        const t = LightCommandEditor._t;
        const over = a.duration && Number(a.duration) > 0 ? ' · ' + Number(a.duration) + 'f' : '';
        if (name === 'LightSwitch') {
            const state = { on: t('lightcmd.on'), off: t('lightcmd.off'), toggle: t('lightcmd.toggle') }[a.state] || a.state || '';
            return `${a.target || '?'} → ${state}`;
        }
        const parts = [];
        if (String(a.reset) === 'true') {
            parts.push(t('lightcmd.reset'));
        } else {
            if (name === 'TransformLight') {
                for (const field of LightCommandEditor.TRANSFORM_FIELDS) {
                    if (a[field.key] !== undefined && a[field.key] !== '') {
                        const unit = field.key === 'yaw' || field.key === 'pitch' || field.key === 'angle' ? '°' : '';
                        parts.push(`${t(field.label).replace(/\s*\(.*\)$/, '')} ${a[field.key]}${unit}`);
                    }
                }
            } else if (a.intensity !== undefined && a.intensity !== '') {
                parts.push(`${t('lightcmd.ambientIntensity').replace(/\s*\(.*\)$/, '')} ${Math.round(Number(a.intensity) * 100)}%`);
            }
            if (a.color) parts.push(a.color);
        }
        const body = parts.length ? parts.join(', ') : t('lightcmd.unchanged');
        return (name === 'TransformLight' ? `${a.target || '?'}: ` : '') + body + over;
    }

    /**
     * `command` is the saved command when editing, or null for a new one —
     * the picker then passes the command's name as `nameHint`.
     */
    show(command, callback, nameHint) {
        const params = (command && command.parameters) || [];
        const name = LightCommandEditor.supports(params[1]) ? params[1] : nameHint;
        if (!LightCommandEditor.supports(name)) {
            callback(null);
            return;
        }
        const args = (command && command.parameters && command.parameters[3]) || {};
        const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const value = (key, fallback) => (args[key] === undefined || args[key] === null || args[key] === '' ? fallback : String(args[key]));
        const has = key => args[key] !== undefined && args[key] !== null && args[key] !== '';
        const title = window.I18n && window.I18n.tEventCommandName
            ? window.I18n.tEventCommandName(LightCommandEditor.COMMANDS[name]) : LightCommandEditor.COMMANDS[name];
        const inputStyle = 'box-sizing:border-box;padding:4px 6px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;';
        const labelStyle = 'display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);';

        const targetBlock = () => {
            const lights = this.mapLights();
            const tags = new Map();
            for (const light of lights) if (light.tag) tags.set(light.tag, (tags.get(light.tag) || 0) + 1);
            const options = [`<option value="">${escape(this._t('lightcmd.pickLight'))}</option>`]
                .concat(lights.map(light => `<option value="${escape(light.id)}">${escape(light.id)} · ${escape(light.type)}</option>`))
                .concat(Array.from(tags.entries()).sort().map(([tag, count]) => `<option value="#${escape(tag)}">#${escape(tag)} · ${count}</option>`))
                .join('');
            return `
                <label style="${labelStyle}">
                    <span style="flex:0 0 90px;">${escape(this._t('lightcmd.target'))}</span>
                    <input type="text" class="lc-target" value="${escape(value('target', ''))}" style="flex:1;min-width:0;${inputStyle}" spellcheck="false">
                </label>
                <label style="${labelStyle}">
                    <span style="flex:0 0 90px;"></span>
                    <select class="lc-pick" style="flex:1;min-width:0;">${options}</select>
                </label>
                <div style="font-size:11px;color:var(--color-text-muted);margin-left:98px;">${escape(this._t('lightcmd.targetHint'))}</div>`;
        };
        const optionalRow = (field, current, on) => `
            <div class="lc-row" data-key="${field.key}" style="display:grid;grid-template-columns:20px 110px 1fr 74px;gap:8px;align-items:center;font-size:12px;color:var(--color-text);">
                <input type="checkbox" class="lc-set" data-key="${field.key}" title="${escape(this._t('lightcmd.change'))}"${on ? ' checked' : ''}>
                <span>${escape(this._t(field.label))}</span>
                <input type="range" class="lc-slider" data-key="${field.key}" min="${field.min}" max="${field.max}" step="${field.step}" value="${escape(current)}" style="width:100%;min-width:0;"${on ? '' : ' disabled'}>
                <input type="number" class="lc-num" data-key="${field.key}" data-no-stepper min="${field.min}" max="${field.max}" step="${field.step}" value="${escape(current)}" style="width:100%;${inputStyle}"${on ? '' : ' disabled'}>
            </div>`;
        const colourRow = (current, on) => `
            <div class="lc-row" data-key="color" style="display:grid;grid-template-columns:20px 110px 1fr;gap:8px;align-items:center;font-size:12px;color:var(--color-text);">
                <input type="checkbox" class="lc-set" data-key="color" title="${escape(this._t('lightcmd.change'))}"${on ? ' checked' : ''}>
                <span>${escape(this._t('lightcmd.color'))}</span>
                <input type="color" class="lc-color" value="${escape(current)}" style="width:60px;height:24px;padding:0;border:1px solid var(--color-border-input);border-radius:3px;background:var(--color-bg-input);"${on ? '' : ' disabled'}>
            </div>`;
        const timingBlock = () => `
            <label style="${labelStyle}margin-top:4px;">
                <span style="flex:0 0 138px;">${escape(this._t('lightcmd.duration'))}</span>
                <input type="number" class="lc-duration" data-no-stepper min="0" max="6000" step="1" value="${escape(value('duration', '60'))}" style="flex:1;min-width:0;${inputStyle}">
            </label>
            <label style="${labelStyle}cursor:pointer;">
                <input type="checkbox" class="lc-wait"${String(args.wait) === 'true' ? ' checked' : ''}> ${escape(this._t('lightcmd.wait'))}</label>
            <label style="${labelStyle}cursor:pointer;">
                <input type="checkbox" class="lc-reset"${String(args.reset) === 'true' ? ' checked' : ''}> ${escape(this._t('lightcmd.reset'))}</label>`;

        let body = '';
        if (name === 'LightSwitch') {
            const state = value('state', 'on');
            body = targetBlock() + `
                <label style="${labelStyle}margin-top:4px;">
                    <span style="flex:0 0 90px;">${escape(this._t('lightcmd.state'))}</span>
                    <select class="lc-state" style="flex:1;min-width:0;">
                        ${['on', 'off', 'toggle'].map(key => `<option value="${key}"${key === state ? ' selected' : ''}>${escape(this._t('lightcmd.' + key))}</option>`).join('')}
                    </select>
                </label>`;
        } else if (name === 'TransformLight') {
            body = targetBlock() + '<div class="lc-values" style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">'
                + LightCommandEditor.TRANSFORM_FIELDS.map(field => optionalRow(field, value(field.key, String(field.fallback)), has(field.key))).join('')
                + colourRow(value('color', '#ffffff'), has('color'))
                + '</div>' + timingBlock();
        } else {
            const percent = { key: 'intensity', label: 'lightcmd.ambientIntensity', min: 0, max: 100, step: 1 };
            const current = has('intensity') ? String(Math.round(Number(args.intensity) * 100)) : '25';
            body = '<div class="lc-values" style="display:flex;flex-direction:column;gap:6px;">'
                + optionalRow(percent, current, has('intensity'))
                + colourRow(value('color', '#ffffff'), has('color'))
                + '</div>' + timingBlock();
        }

        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay rr-command-editor-modal';
        modal.style.zIndex = '21000';
        modal.innerHTML = `
            <div class="rr-modal" style="width:min(560px,92vw);display:flex;flex-direction:column;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${escape(title)}</div>
                    <button type="button" class="rr-modal-close lc-cancel">&times;</button>
                </div>
                <div class="rr-modal-body" style="display:flex;flex-direction:column;gap:8px;">${body}</div>
                <div class="rr-modal-footer">
                    <button type="button" class="rr-btn-secondary lc-cancel">${escape(this._t('common.cancel'))}</button>
                    <button type="button" class="rr-button-primary lc-ok">${escape(this._t('common.ok'))}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const q = selector => modal.querySelector(selector);
        const pick = q('.lc-pick');
        if (pick) {
            pick.addEventListener('change', () => {
                if (!pick.value) return;
                q('.lc-target').value = pick.value;
                pick.value = '';
            });
        }
        modal.querySelectorAll('.lc-slider').forEach(slider => slider.addEventListener('input', () => {
            const num = modal.querySelector(`.lc-num[data-key="${slider.dataset.key}"]`);
            if (num) num.value = slider.value;
        }));
        modal.querySelectorAll('.lc-num').forEach(num => num.addEventListener('change', () => {
            const slider = modal.querySelector(`.lc-slider[data-key="${num.dataset.key}"]`);
            if (slider) slider.value = num.value;
        }));
        const reset = q('.lc-reset');
        const syncRows = () => {
            const resetting = !!(reset && reset.checked);
            modal.querySelectorAll('.lc-row').forEach(row => {
                const set = row.querySelector('.lc-set');
                const on = !resetting && set.checked;
                set.disabled = resetting;
                row.querySelectorAll('.lc-slider, .lc-num, .lc-color').forEach(input => { input.disabled = !on; });
                row.style.opacity = resetting ? '0.45' : '1';
            });
        };
        modal.querySelectorAll('.lc-set').forEach(box => box.addEventListener('change', syncRows));
        if (reset) reset.addEventListener('change', syncRows);
        syncRows();
        const close = () => { if (modal.parentNode) modal.parentNode.removeChild(modal); };
        modal.querySelectorAll('.lc-cancel').forEach(button => button.addEventListener('click', () => { close(); callback(null); }));
        const optional = key => {
            const set = modal.querySelector(`.lc-set[data-key="${key}"]`);
            if (!set || !set.checked) return '';
            const input = modal.querySelector(`.lc-num[data-key="${key}"]`) || modal.querySelector('.lc-color');
            return input ? input.value : '';
        };
        q('.lc-ok').addEventListener('click', () => {
            let collected;
            if (name === 'LightSwitch') {
                collected = { target: q('.lc-target').value, state: q('.lc-state').value };
            } else if (name === 'TransformLight') {
                collected = { target: q('.lc-target').value };
                for (const field of LightCommandEditor.TRANSFORM_FIELDS) collected[field.key] = optional(field.key);
                collected.color = optional('color');
            } else {
                const percent = optional('intensity');
                collected = { intensity: percent === '' ? '' : Number(percent) / 100, color: optional('color') };
            }
            if (name !== 'LightSwitch') {
                collected.duration = q('.lc-duration').value;
                collected.wait = q('.lc-wait').checked;
                collected.reset = reset.checked;
            }
            const result = LightCommandEditor.build(name, collected, (command && command.indent) || 0);
            close();
            callback(result);
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LightCommandEditor;
}
