/**
 * MovePictureEditor - Editor for Move Picture event command (code 232)
 */
class MovePictureEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.pictureId = 1;
        this.pictureIdSource = 'direct';
        this.origin = 0; // 0=Upper Left, 1=Center
        this.designationType = 0; // 0=Direct, 1=Variable
        this.x = 0;
        this.y = 0;
        this.scaleX = 100;
        this.scaleY = 100;
        this.opacity = 255;
        this.blendMode = 0; // 0=Normal, 1=Additive, 2=Multiply, 3=Screen
        this.duration = 60;
        this.durationSource = 'fixed';
        this.wait = true;
        this.easing = 0; // 0=Constant Speed, 1=Slow Start, 2=Slow End, 3=Slow Start/End
        this.angleMode = 'keep';
        this.angle = 0;
        this.anchorMode = 'keep';
        this.anchorX = 0;
        this.anchorY = 0;
        this.waveMode = 'keep';
        this.waveAmplitudeX = 0;
        this.waveAmplitudeY = 0;
        this.wavePeriod = 60;
        this.wavePhase = 0;
        this.commandContext = null;
        this.quickSettingEditor = null;
    }

    /**
     * Show editor for a move picture command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback, context = null) {
        if (command && command.code === 355 && !this.parseExtendedCommand(command)) return false;
        this.callback = callback;
        this.commandContext = context;

        if (command && command.code === 232) {
            const params = command.parameters;
            this.pictureId = params[0] !== undefined ? params[0] : 1;
            // params[1] is unused
            this.origin = params[2] !== undefined ? params[2] : 0;
            this.designationType = params[3] !== undefined ? params[3] : 0;
            this.x = params[4] !== undefined ? params[4] : 0;
            this.y = params[5] !== undefined ? params[5] : 0;
            this.scaleX = params[6] !== undefined ? params[6] : 100;
            this.scaleY = params[7] !== undefined ? params[7] : 100;
            this.opacity = params[8] !== undefined ? params[8] : 255;
            this.blendMode = params[9] !== undefined ? params[9] : 0;
            this.duration = params[10] !== undefined ? params[10] : 60;
            this.wait = params[11] !== undefined ? params[11] : true;
            this.easing = params[12] !== undefined ? params[12] : 0;
            this.resetExtensions();
        } else if (this.loadExtendedCommand(command)) {
            // Extended values were loaded by loadExtendedCommand.
        } else {
            this.pictureId = 1;
            this.origin = 0;
            this.designationType = 0;
            this.x = 0;
            this.y = 0;
            this.scaleX = 100;
            this.scaleY = 100;
            this.opacity = 255;
            this.blendMode = 0;
            this.duration = 60;
            this.wait = true;
            this.easing = 0;
            this.resetExtensions();
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    resetExtensions() {
        this.pictureIdSource = 'direct';
        this.durationSource = 'fixed';
        this.angleMode = 'keep';
        this.angle = 0;
        this.anchorMode = 'keep';
        this.anchorX = 0;
        this.anchorY = 0;
        this.waveMode = 'keep';
        this.waveAmplitudeX = 0;
        this.waveAmplitudeY = 0;
        this.wavePeriod = 60;
        this.wavePhase = 0;
    }

    getCodec() {
        if (typeof globalThis !== 'undefined' && globalThis.ReactorEventCommandCodec) {
            return globalThis.ReactorEventCommandCodec;
        }
        if (typeof require === 'function') {
            try { return require('./ReactorEventCommandCodec.js'); } catch (_) { return null; }
        }
        return null;
    }

    parseExtendedCommand(command) {
        if (!command || command.code !== 355) return null;
        const codec = this.getCodec();
        if (!codec || typeof codec.parseCommand !== 'function') return null;
        try {
            const parsed = codec.parseCommand(command, 'picture');
            const data = parsed && (parsed.data || parsed);
            const body = data && typeof codec.createPictureBody === 'function'
                ? codec.createPictureBody(data) : '';
            return data && this.isExtendedDataValid(data) && parsed.body === body ? data : null;
        } catch (_) {
            return null;
        }
    }

    isExtendedDataValid(data) {
        const ref = (value, allowDirectZero = false) => value
            && ['direct', 'variable'].includes(value.source)
            && Number.isInteger(value.value)
            && value.value >= (allowDirectZero && value.source === 'direct' ? 0 : 1);
        const finite = value => typeof value === 'number' && Number.isFinite(value);
        const position = data.position;
        return data.operation === 'move'
            && ref(data.pictureId) && ref(data.duration, true)
            && [0, 1].includes(data.origin)
            && position && ['direct', 'variable'].includes(position.source)
            && Number.isInteger(position.x) && Number.isInteger(position.y)
            && (position.source !== 'variable' || (position.x >= 1 && position.y >= 1
                && position.x <= this.getVariableMaximum() && position.y <= this.getVariableMaximum()))
            && finite(data.scaleX) && finite(data.scaleY) && finite(data.opacity)
            && (data.blend === 'overlay' || [0, 1, 2, 3].includes(data.blend))
            && typeof data.wait === 'boolean' && [0, 1, 2, 3].includes(data.easing)
            && data.angle && ['keep', 'set', 'tween'].includes(data.angle.mode) && finite(data.angle.value)
            && data.anchor && ['keep', 'off', 'replace'].includes(data.anchor.mode)
            && finite(data.anchor.x) && finite(data.anchor.y)
            && data.wave && ['keep', 'off', 'replace'].includes(data.wave.mode)
            && finite(data.wave.amplitudeX) && finite(data.wave.amplitudeY)
            && finite(data.wave.period) && data.wave.period > 0 && finite(data.wave.phase);
    }

    acceptsCommand(command) {
        return !!(command && (command.code === 232 || this.parseExtendedCommand(command)));
    }

    loadExtendedCommand(command) {
        const data = this.parseExtendedCommand(command);
        if (!data || !data.pictureId || !data.position || !data.duration) return false;
        this.pictureIdSource = data.pictureId.source === 'variable' ? 'variable' : 'direct';
        this.pictureId = Number(data.pictureId.value) || 1;
        this.origin = Number(data.origin) === 1 ? 1 : 0;
        this.designationType = data.position.source === 'variable' ? 1 : 0;
        this.x = Number(data.position.x) || 0;
        this.y = Number(data.position.y) || 0;
        this.scaleX = Number.isFinite(Number(data.scaleX)) ? Number(data.scaleX) : 100;
        this.scaleY = Number.isFinite(Number(data.scaleY)) ? Number(data.scaleY) : 100;
        this.opacity = Number.isFinite(Number(data.opacity)) ? Number(data.opacity) : 255;
        this.blendMode = data.blend === 'overlay' ? 'overlay' : Number(data.blend) || 0;
        this.durationSource = data.duration.source === 'variable' ? 'variable' : 'fixed';
        this.duration = Number.isFinite(Number(data.duration.value)) ? Number(data.duration.value) : 1;
        this.wait = data.wait !== false;
        this.easing = Number(data.easing) || 0;
        this.angleMode = ['keep', 'set', 'tween'].includes(data.angle?.mode) ? data.angle.mode : 'keep';
        this.angle = data.angle ? Number(data.angle.value) || 0 : 0;
        this.anchorMode = ['keep', 'off', 'replace'].includes(data.anchor?.mode) ? data.anchor.mode : 'keep';
        this.anchorX = data.anchor ? Number(data.anchor.x) || 0 : 0;
        this.anchorY = data.anchor ? Number(data.anchor.y) || 0 : 0;
        this.waveMode = ['keep', 'off', 'replace'].includes(data.wave?.mode) ? data.wave.mode : 'keep';
        this.waveAmplitudeX = data.wave ? Number(data.wave.amplitudeX) || 0 : 0;
        this.waveAmplitudeY = data.wave ? Number(data.wave.amplitudeY) || 0 : 0;
        this.wavePeriod = data.wave && Number(data.wave.period) > 0 ? Number(data.wave.period) : 60;
        this.wavePhase = data.wave ? Number(data.wave.phase) || 0 : 0;
        return true;
    }

    getVariableMaximum() {
        const system = this.databaseManager && this.databaseManager.getSystem
            ? this.databaseManager.getSystem()
            : this.databaseManager?.data?.system;
        return Array.isArray(system?.variables)
            ? Math.max(1, system.variables.length - 1)
            : 9999;
    }

    normalizePositionValues() {
        if (this.designationType !== 1) return { x: this.x, y: this.y };
        const maximum = this.getVariableMaximum();
        const variableId = value => {
            const number = Number(value);
            return Math.max(1, Math.min(maximum, Number.isFinite(number) ? Math.trunc(number) : 1));
        };
        return { x: variableId(this.x), y: variableId(this.y) };
    }

    setDesignationType(value) {
        this.designationType = Number(value) === 1 ? 1 : 0;
        if (this.designationType === 1) {
            const position = this.normalizePositionValues();
            this.x = position.x;
            this.y = position.y;
        }
    }

    findPreviousPictureState(commands, index, pictureId = this.pictureId) {
        let state = null;
        const end = Math.max(0, Math.min(Number(index) || 0, Array.isArray(commands) ? commands.length : 0));
        for (let i = 0; i < end; i++) {
            const command = commands[i];
            const params = command?.parameters || [];
            const tagged = this.parseExtendedCommand(command)
                || this.parseAnyPictureCommand(command);
            if (tagged) {
                const id = tagged.pictureId;
                if (!id || id.source !== 'direct') {
                    state = null;
                    continue;
                }
                if (tagged.operation === 'erase') {
                    if (tagged.mode === 'all') state = null;
                    else if (tagged.mode === 'one' && Number(id.value) === Number(pictureId)) state = null;
                    else if (tagged.mode === 'range') {
                        const endId = tagged.endPictureId;
                        if (!endId || endId.source !== 'direct') state = null;
                        else if (Number(pictureId) >= Math.min(Number(id.value), Number(endId.value))
                            && Number(pictureId) <= Math.max(Number(id.value), Number(endId.value))) state = null;
                    }
                    continue;
                }
                if (Number(id.value) !== Number(pictureId)) continue;
                if (tagged.position?.source !== 'direct') {
                    state = null;
                    continue;
                }
                if (tagged.operation === 'show') {
                    state = this.stateFromTaggedShow(tagged);
                } else if (tagged.operation === 'move' && state) {
                    state = { ...state, ...this.stateFromTaggedMove(tagged) };
                }
                continue;
            }
            if (Number(params[0]) !== Number(pictureId)) continue;

            if (command.code === 231) {
                state = {
                    pictureName: params[1] || '',
                    origin: Number(params[2]) || 0,
                    designationType: Number(params[3]) || 0,
                    x: Number(params[4]) || 0,
                    y: Number(params[5]) || 0,
                    scaleX: params[6] !== undefined ? Number(params[6]) : 100,
                    scaleY: params[7] !== undefined ? Number(params[7]) : 100,
                    opacity: params[8] !== undefined ? Number(params[8]) : 255,
                    blendMode: Number(params[9]) || 0
                };
            } else if (command.code === 232 && state) {
                state = {
                    ...state,
                    origin: Number(params[2]) || 0,
                    designationType: Number(params[3]) || 0,
                    x: Number(params[4]) || 0,
                    y: Number(params[5]) || 0,
                    scaleX: params[6] !== undefined ? Number(params[6]) : 100,
                    scaleY: params[7] !== undefined ? Number(params[7]) : 100,
                    opacity: params[8] !== undefined ? Number(params[8]) : 255,
                    blendMode: Number(params[9]) || 0
                };
            } else if (command.code === 235) {
                state = null;
            }
        }
        return state;
    }

    parseAnyPictureCommand(command) {
        if (!command || command.code !== 355) return null;
        const codec = this.getCodec();
        if (!codec) return null;
        try {
            const parsed = codec.parseCommand(command, 'picture');
            const data = parsed && (parsed.data || parsed);
            const body = data && typeof codec.createPictureBody === 'function'
                ? codec.createPictureBody(data) : '';
            if (!data || parsed.body !== body) return null;
            if (data.operation === 'move') return this.isExtendedDataValid(data) ? data : null;
            if (data.operation === 'show') {
                const ShowEditor = typeof ShowPictureEditor !== 'undefined'
                    ? ShowPictureEditor : require('./ShowPictureEditor.js');
                return new ShowEditor().isExtendedDataValid(data) ? data : null;
            }
            if (data.operation === 'erase') {
                const EraseEditor = typeof ErasePictureEditor !== 'undefined'
                    ? ErasePictureEditor : require('./ErasePictureEditor.js');
                return new EraseEditor().isExtendedDataValid(data) ? data : null;
            }
            return null;
        } catch (_) {
            return null;
        }
    }

    stateFromTaggedShow(data) {
        return {
            pictureName: data.name || '',
            origin: Number(data.origin) || 0,
            designationType: 0,
            x: Number(data.position.x) || 0,
            y: Number(data.position.y) || 0,
            scaleX: Number(data.scaleX),
            scaleY: Number(data.scaleY),
            opacity: Number(data.opacity),
            blendMode: data.blend === 'overlay' ? 'overlay' : Number(data.blend) || 0
        };
    }

    stateFromTaggedMove(data) {
        return {
            origin: Number(data.origin) || 0,
            designationType: 0,
            x: Number(data.position.x) || 0,
            y: Number(data.position.y) || 0,
            scaleX: Number(data.scaleX),
            scaleY: Number(data.scaleY),
            opacity: Number(data.opacity),
            blendMode: data.blend === 'overlay' ? 'overlay' : Number(data.blend) || 0
        };
    }

    getQuickSettingEditor() {
        if (!this.quickSettingEditor) {
            const EditorClass = typeof ShowPictureEditor !== 'undefined'
                ? ShowPictureEditor
                : require('./ShowPictureEditor.js');
            this.quickSettingEditor = new EditorClass(this.databaseManager, this.projectController);
        }
        return this.quickSettingEditor;
    }

    syncPictureField(property) {
        const field = this.modal?.querySelector(`[data-picture-property="${property}"]`);
        if (field) field.value = this[property];
    }

    applyQuickSettingValues(values) {
        this.origin = values.origin;
        this.x = values.x;
        this.y = values.y;
        this.scaleX = values.scaleX;
        this.scaleY = values.scaleY;
        this.opacity = values.opacity;
        if (values.duration !== undefined) this.duration = values.duration;
        this.designationType = 0;
        for (const property of ['origin', 'designationType', 'x', 'y', 'scaleX', 'scaleY', 'opacity', 'duration']) {
            this.syncPictureField(property);
        }
    }

    openQuickSetting() {
        const editor = this.getQuickSettingEditor();
        const context = this.commandContext || {};
        const startState = this.findPreviousPictureState(context.commands, context.index, this.pictureId);
        editor.pictureName = startState?.pictureName || '';
        const asset = startState ? editor.getPictureAsset() : null;
        editor.openQuickSetting({
            asset,
            allowEmpty: true,
            startState: startState?.designationType === 0 ? startState : null,
            targetState: this,
            duration: this.duration,
            showDuration: true,
            easing: this.easing,
            onApply: values => this.applyQuickSettingValues(values)
        });
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'move-picture-editor-modal';
        this.modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 10005;
            justify-content: center;
            align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'move-picture-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 500px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Create a labeled slider + number input
     */
    createSliderInput(label, value, min, max, onChange) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const labelEl = document.createElement('span');
        labelEl.textContent = tt(label);
        labelEl.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.value = value;
        slider.style.cssText = 'flex: 1;';

        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.min = min;
        numInput.max = max;
        numInput.value = value;
        numInput.style.cssText = 'padding:4px 6px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; width:60px;';

        slider.addEventListener('input', (e) => {
            numInput.value = e.target.value;
            onChange(parseInt(e.target.value));
        });

        numInput.addEventListener('input', (e) => {
            slider.value = e.target.value;
            onChange(parseInt(e.target.value) || 0);
        });

        section.appendChild(labelEl);
        section.appendChild(slider);
        section.appendChild(numInput);
        return section;
    }

    /**
     * Create number input field
     */
    createNumberInput(label, property, min, max) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const labelEl = document.createElement('span');
        labelEl.textContent = tt(label);
        labelEl.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const input = document.createElement('input');
        input.type = 'number';
        input.dataset.pictureProperty = property;
        input.min = min;
        input.max = max;
        if (this.designationType === 1 && (property === 'x' || property === 'y')) input.step = 1;
        if (property === 'anchorX' || property === 'anchorY') input.step = 'any';
        input.value = this[property];
        input.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;
        input.addEventListener('input', (e) => {
            this[property] = Number(e.target.value) || 0;
        });

        section.appendChild(labelEl);
        section.appendChild(input);
        return section;
    }

    /**
     * Create dropdown select field
     */
    createSelectInput(label, property, options) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const labelEl = document.createElement('span');
        labelEl.textContent = tt(label);
        labelEl.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const select = document.createElement('select');
        select.dataset.pictureProperty = property;
        select.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = window.I18n ? window.I18n.tText(opt.text) : opt.text;
            option.selected = (this[property] === opt.value);
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            const option = options.find(item => String(item.value) === e.target.value);
            this[property] = option ? option.value : e.target.value;
            if (property === 'designationType') this.setDesignationType(this[property]);
            if (property === 'pictureIdSource' || property === 'durationSource'
                || property === 'designationType') this.renderContent();
        });

        section.appendChild(labelEl);
        section.appendChild(select);
        return section;
    }

    /**
     * Render modal content
     */
    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.move-picture-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top-left-radius: 6px;
            border-top-right-radius: 6px;
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Move Picture')}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">\u00d7</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            overflow-y: auto;
            flex: 1;
        `;

        // Picture ID and visual placement/animation preview
        content.appendChild(this.createSelectInput('Picture ID Source:', 'pictureIdSource', [
            { value: 'direct', text: 'Direct' },
            { value: 'variable', text: 'Variable' }
        ]));
        const pictureRow = this.createNumberInput(
            this.pictureIdSource === 'variable' ? 'Variable:' : 'Picture Number:',
            'pictureId', 1, 9999);
        const quickSettingButton = document.createElement('button');
        quickSettingButton.type = 'button';
        quickSettingButton.textContent = tt('Quick Setting');
        quickSettingButton.style.cssText = 'flex: 0 0 auto; padding: 6px 12px; background: var(--color-bg-button); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 12px;';
        quickSettingButton.addEventListener('click', () => this.openQuickSetting());
        pictureRow.appendChild(quickSettingButton);
        content.appendChild(pictureRow);

        // Origin
        content.appendChild(this.createSelectInput('Origin:', 'origin', [
            { value: 0, text: 'Upper Left' },
            { value: 1, text: 'Center' }
        ]));

        // Position type
        content.appendChild(this.createSelectInput('Position:', 'designationType', [
            { value: 0, text: 'Direct Designation' },
            { value: 1, text: 'Designation with Variables' }
        ]));

        // X and Y coordinates
        const positionMinimum = this.designationType === 1 ? 1 : -9999;
        const positionMaximum = this.designationType === 1 ? this.getVariableMaximum() : 9999;
        content.appendChild(this.createNumberInput('X:', 'x', positionMinimum, positionMaximum));
        content.appendChild(this.createNumberInput('Y:', 'y', positionMinimum, positionMaximum));

        // Scale
        content.appendChild(this.createNumberInput('Scale Width %:', 'scaleX', -2000, 2000));
        content.appendChild(this.createNumberInput('Scale Height %:', 'scaleY', -2000, 2000));

        // Opacity
        content.appendChild(this.createNumberInput('Opacity:', 'opacity', 0, 255));

        // Blend Mode
        content.appendChild(this.createSelectInput('Blend Mode:', 'blendMode', [
            { value: 0, text: 'Normal' },
            { value: 1, text: 'Additive' },
            { value: 2, text: 'Multiply' },
            { value: 3, text: 'Screen' },
            { value: 'overlay', text: 'Overlay (Reactor)' }
        ]));

        // Duration
        content.appendChild(this.createSelectInput('Duration Source:', 'durationSource', [
            { value: 'fixed', text: 'Fixed' },
            { value: 'variable', text: 'Variable' }
        ]));
        const durationRow = document.createElement('div');
        durationRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const durationLabel = document.createElement('span');
        durationLabel.textContent = tt(this.durationSource === 'variable' ? 'Variable:' : 'Frames:');
        durationLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const durationInput = document.createElement('input');
        durationInput.type = 'number';
        durationInput.dataset.pictureProperty = 'duration';
        durationInput.min = 1;
        durationInput.max = 999;
        durationInput.value = this.duration;
        durationInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 80px;
        `;
        durationInput.addEventListener('input', (e) => {
            this.duration = parseInt(e.target.value) || 1;
        });

        const durationUnit = document.createElement('span');
        durationUnit.textContent = this.durationSource === 'fixed' ? tt('frames') : '';
        durationUnit.style.cssText = 'color: var(--color-text-muted); font-size: 12px;';

        durationRow.appendChild(durationLabel);
        durationRow.appendChild(durationInput);
        durationRow.appendChild(durationUnit);
        content.appendChild(durationRow);

        // Wait checkbox
        const waitRow = document.createElement('div');
        waitRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const waitCheckbox = document.createElement('input');
        waitCheckbox.type = 'checkbox';
        waitCheckbox.id = 'move-picture-wait';
        waitCheckbox.checked = this.wait;
        waitCheckbox.addEventListener('change', (e) => {
            this.wait = e.target.checked;
        });

        const waitLabel = document.createElement('label');
        waitLabel.htmlFor = 'move-picture-wait';
        waitLabel.textContent = tt('Wait for Completion');
        waitLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';

        waitRow.appendChild(waitCheckbox);
        waitRow.appendChild(waitLabel);
        content.appendChild(waitRow);

        // Easing
        content.appendChild(this.createSelectInput('Easing:', 'easing', [
            { value: 0, text: 'Constant Speed' },
            { value: 1, text: 'Slow Start' },
            { value: 2, text: 'Slow End' },
            { value: 3, text: 'Slow Start/End' }
        ]));

        content.appendChild(this.createAdvancedSection());

        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-panel);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.style.cssText = `
            padding: 6px 20px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);
    }

    createAdvancedSection() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const details = document.createElement('details');
        details.style.cssText = 'border: 1px solid var(--color-border); border-radius: 4px; padding: 8px 10px;';
        const summary = document.createElement('summary');
        summary.textContent = tt('Advanced Reactor Runtime');
        summary.style.cssText = 'color: var(--color-text-strong); cursor: pointer; font-size: 13px; font-weight: bold;';
        details.appendChild(summary);
        const controls = document.createElement('div');
        controls.style.cssText = 'display: flex; flex-direction: column; gap: 9px; padding-top: 10px;';
        controls.appendChild(this.createSelectInput('Angle:', 'angleMode', [
            { value: 'keep', text: 'Keep' },
            { value: 'set', text: 'Set' },
            { value: 'tween', text: 'Tween' }
        ]));
        controls.appendChild(this.createNumberInput('Angle (degrees):', 'angle', -36000, 36000));
        controls.appendChild(this.createSelectInput('Custom Anchor:', 'anchorMode', [
            { value: 'keep', text: 'Keep' },
            { value: 'off', text: 'Off' },
            { value: 'replace', text: 'Replace' }
        ]));
        controls.appendChild(this.createNumberInput('Anchor X:', 'anchorX', -10, 10));
        controls.appendChild(this.createNumberInput('Anchor Y:', 'anchorY', -10, 10));
        controls.appendChild(this.createSelectInput('Sine Wave:', 'waveMode', [
            { value: 'keep', text: 'Keep' },
            { value: 'off', text: 'Off' },
            { value: 'replace', text: 'Replace' }
        ]));
        controls.appendChild(this.createNumberInput('Wave amplitude X:', 'waveAmplitudeX', -9999, 9999));
        controls.appendChild(this.createNumberInput('Wave amplitude Y:', 'waveAmplitudeY', -9999, 9999));
        controls.appendChild(this.createNumberInput('Wave period:', 'wavePeriod', 1, 99999));
        controls.appendChild(this.createNumberInput('Wave phase (degrees):', 'wavePhase', -36000, 36000));
        details.appendChild(controls);
        return details;
    }

    /**
     * Build command from current data
     */
    buildCommand() {
        const position = this.normalizePositionValues();
        this.x = position.x;
        this.y = position.y;
        const extended = this.pictureIdSource === 'variable'
            || this.durationSource === 'variable'
            || this.blendMode === 'overlay'
            || this.angleMode !== 'keep'
            || this.anchorMode !== 'keep'
            || this.waveMode !== 'keep';
        if (extended) {
            const payload = {
                operation: 'move',
                pictureId: { source: this.pictureIdSource, value: this.pictureId },
                origin: this.origin,
                position: { source: this.designationType === 1 ? 'variable' : 'direct', x: this.x, y: this.y },
                scaleX: this.scaleX,
                scaleY: this.scaleY,
                opacity: this.opacity,
                blend: this.blendMode,
                duration: { source: this.durationSource === 'variable' ? 'variable' : 'direct', value: this.duration },
                wait: this.wait,
                easing: this.easing,
                angle: { mode: this.angleMode, value: this.angle },
                anchor: { mode: this.anchorMode, x: this.anchorX, y: this.anchorY },
                wave: {
                    mode: this.waveMode,
                    amplitudeX: this.waveAmplitudeX,
                    amplitudeY: this.waveAmplitudeY,
                    period: this.wavePeriod,
                    phase: this.wavePhase
                }
            };
            const codec = this.getCodec();
            if (!codec || typeof codec.createScriptCommand !== 'function') {
                throw new Error('ReactorEventCommandCodec is unavailable');
            }
            const body = codec.createPictureBody(payload);
            return codec.createScriptCommand('picture', payload, body);
        }
        return {
            code: 232,
            indent: 0,
            parameters: [
                this.pictureId,
                0,
                this.origin,
                this.designationType,
                this.x,
                this.y,
                this.scaleX,
                this.scaleY,
                this.opacity,
                this.blendMode,
                this.duration,
                this.wait,
                this.easing
            ]
        };
    }

    /**
     * Save and return command
     */
    save() {
        if (this.callback) {
            const command = this.buildCommand();
            this.callback(command);
        }
        this.close();
    }

    /**
     * Close modal
     */
    close() {
        if (this.quickSettingEditor) this.quickSettingEditor.closeQuickSetting();
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MovePictureEditor;
}
