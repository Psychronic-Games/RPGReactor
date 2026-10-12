/** A voice clip and lip animation addressed to a 3D character. */
class SpeakModel3DEditor extends (typeof PlayModelEffectEditor !== 'undefined'
    ? PlayModelEffectEditor : require('./PlayModelEffectEditor.js')) {
    static build(values, indent = 0) {
        const number = (key, fallback, min, max) => {
            const value = Number(values[key] ?? fallback);
            return String(Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback)));
        };
        return { code: 357, indent, parameters: ['RPGReactor', 'SpeakModel3D', 'Speak 3D Dialogue', {
            operation: values.operation === 'stop' ? 'stop' : 'speak', target: String(values.target ?? 0),
            audio: String(values.audio || ''),
            volume: number('volume', 90, 0, 100), pitch: number('pitch', 100, 50, 150), pan: number('pan', 0, -100, 100),
            wait: String(values.wait !== false && values.wait !== 'false')
        }] };
    }

    show(command, callback) {
        const args = SpeakModel3DEditor.build(command?.parameters?.[3] || {}).parameters[3];
        const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay rr-speech-overlay rr-command-editor-modal'; modal.style.zIndex = '21000';
        const targets = [['0', 'This Event'], ['-1', 'Player']];
        const count = Math.max(3, (window.reactor?.databaseManager?.data?.system?.partyMembers?.length || 1) - 1);
        for (let i = 0; i < count; i++) targets.push([String(-2 - i), this._t('Follower') + ' ' + (i + 1)]);
        for (const event of this.mapEvents()) targets.push([String(event.id), String(event.id).padStart(3, '0') + ': ' + event.name]);
        if (!targets.some(([value]) => value === args.target)) targets.push([args.target, args.target]);
        const control = 'width:100%;min-width:0;box-sizing:border-box;padding:7px 8px;background:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:4px;font:inherit;';
        const levels = { volume: Number(args.volume), pitch: Number(args.pitch), pan: Number(args.pan) };
        let closed = false;
        modal.innerHTML = `<div class="rr-modal rr-speech-modal" role="dialog" aria-modal="true" aria-label="${this._t('Speak 3D Dialogue')}">
            <div class="rr-modal-header"><div class="rr-modal-title">${this._t('Speak 3D Dialogue')}</div></div>
            <div class="rr-modal-body" style="display:flex;flex-direction:column;gap:10px;">
                <label>${this._t('Action')}<select class="speech-operation" style="${control}"><option value="speak">${this._t('Speak')}</option><option value="stop">${this._t('Stop speaking')}</option></select></label>
                <label>${this._t('Target')}<select class="speech-target" style="${control}">${targets.map(([value, label]) => `<option value="${escape(value)}">${escape(this._t(label))}</option>`).join('')}</select></label>
                <div class="speech-fields" style="display:flex;flex-direction:column;gap:10px;">
                    <label>${this._t('Voice clip (audio/se)')}<div style="display:flex;gap:6px;"><input class="speech-audio" style="${control}" value="${escape(args.audio)}"><button type="button" class="rr-btn-secondary speech-browse">${this._t('Browse…')}</button></div></label>

                    <label><input type="checkbox" class="speech-wait"${args.wait === 'true' ? ' checked' : ''}> ${this._t('Wait for voice to finish')}</label>
                    <div style="color:var(--color-text-muted);font-size:12px;">${this._t('The voice waveform drives the jaw or lips. Set face points in 3D Models for a model without a mouth rig. Dialogue uses the normal message window.')}</div>
                </div>
            </div>
            <div class="rr-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;"><button type="button" class="rr-btn-secondary speech-cancel">${this._t('Cancel')}</button><button type="button" class="rr-button-primary speech-ok">${this._t('OK')}</button></div>
        </div>`;
        document.body.appendChild(modal);
        const q = selector => modal.querySelector(selector);
        q('.speech-operation').value = args.operation; q('.speech-target').value = args.target;
        const sync = () => { q('.speech-fields').style.display = q('.speech-operation').value === 'stop' ? 'none' : 'flex'; };
        q('.speech-operation').addEventListener('change', sync); sync();
        q('.speech-browse').addEventListener('click', () => {
            const project = this._project();
            if (!project?.path || typeof RRAudioPickerModal === 'undefined') return;
            const fs = require('fs'), path = require('path'), folder = path.join(project.path, 'audio', 'se');
            const files = fs.existsSync(folder) ? RRAssetFiles.listUnique(folder, RRAssetFiles.AUDIO_EXTENSIONS) : [];
            RRAudioPickerModal.open({ title: this._t('Voice clip'), folderLabel: 'SE', files,
                selected: q('.speech-audio').value, levels: { ...levels }, loopDefault: false, zIndex: 21010,
                onOk: result => {
                    if (closed || !modal.isConnected || !result) return;
                    for (const key of ['volume', 'pitch', 'pan']) levels[key] = result[key] ?? levels[key];
                    q('.speech-audio').value = result.name || '';
                } });
        });
        const close = result => { if (closed) return; closed = true; modal.remove(); callback(result); };
        modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(null); }
        });
        q('.speech-cancel').addEventListener('click', () => close(null));
        q('.speech-ok').addEventListener('click', () => {
            const values = { ...levels };
            for (const key of ['operation', 'target', 'audio']) values[key] = q('.speech-' + key).value;
            values.wait = q('.speech-wait').checked;
            close(SpeakModel3DEditor.build(values, command?.indent || 0));
        });
    }
}
if (typeof module !== 'undefined' && module.exports) module.exports = SpeakModel3DEditor;
