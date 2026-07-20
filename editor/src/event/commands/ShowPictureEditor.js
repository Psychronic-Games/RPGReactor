/**
 * ShowPictureEditor - Editor for Show Picture event command (code 231)
 */
class ShowPictureEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.pictureId = 1;
        this.pictureIdSource = 'direct';
        this.pictureName = '';
        this.origin = 0; // 0=Upper Left, 1=Center
        this.designationType = 0; // 0=Direct, 1=Variable
        this.x = 0;
        this.y = 0;
        this.scaleX = 100;
        this.scaleY = 100;
        this.opacity = 255;
        this.blendMode = 0; // 0=Normal, 1=Additive, 2=Multiply, 3=Screen
        this.initialAngleEnabled = false;
        this.initialAngle = 0;
        this.customAnchorEnabled = false;
        this.anchorX = 0;
        this.anchorY = 0;
        this.waveEnabled = false;
        this.waveAmplitudeX = 0;
        this.waveAmplitudeY = 0;
        this.wavePeriod = 60;
        this.wavePhase = 0;
        this.quickSettingModal = null;
        this.quickSettingCleanup = null;
    }

    /**
     * Show editor for a show picture command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        if (command && command.code === 355 && !this.parseExtendedCommand(command)) return false;
        this.callback = callback;

        if (command && command.code === 231) {
            const params = command.parameters;
            this.pictureId = params[0] || 1;
            this.pictureName = params[1] || '';
            this.origin = params[2] || 0;
            this.designationType = params[3] || 0;
            this.x = params[4] || 0;
            this.y = params[5] || 0;
            this.scaleX = params[6] !== undefined ? params[6] : 100;
            this.scaleY = params[7] !== undefined ? params[7] : 100;
            this.opacity = params[8] !== undefined ? params[8] : 255;
            this.blendMode = params[9] || 0;
            this.resetExtensions();
        } else if (this.loadExtendedCommand(command)) {
            // Extended values were loaded by loadExtendedCommand.
        } else {
            this.pictureId = 1;
            this.pictureName = '';
            this.origin = 0;
            this.designationType = 0;
            this.x = 0;
            this.y = 0;
            this.scaleX = 100;
            this.scaleY = 100;
            this.opacity = 255;
            this.blendMode = 0;
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
        this.initialAngleEnabled = false;
        this.initialAngle = 0;
        this.customAnchorEnabled = false;
        this.anchorX = 0;
        this.anchorY = 0;
        this.waveEnabled = false;
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
        const ref = value => value && ['direct', 'variable'].includes(value.source)
            && Number.isInteger(value.value) && value.value >= 1;
        const finite = value => typeof value === 'number' && Number.isFinite(value);
        const position = data.position;
        const anchor = data.anchor;
        const wave = data.wave;
        return data.operation === 'show'
            && ref(data.pictureId)
            && typeof data.name === 'string'
            && [0, 1].includes(data.origin)
            && position && ['direct', 'variable'].includes(position.source)
            && Number.isInteger(position.x) && Number.isInteger(position.y)
            && (position.source !== 'variable' || (position.x >= 1 && position.y >= 1
                && position.x <= this.getVariableMaximum() && position.y <= this.getVariableMaximum()))
            && finite(data.scaleX) && finite(data.scaleY) && finite(data.opacity)
            && (data.blend === 'overlay' || [0, 1, 2, 3].includes(data.blend))
            && (data.angle === null || finite(data.angle))
            && (anchor === null || (finite(anchor.x) && finite(anchor.y)))
            && (wave === null || (finite(wave.amplitudeX) && finite(wave.amplitudeY)
                && finite(wave.period) && wave.period > 0 && finite(wave.phase)));
    }

    acceptsCommand(command) {
        return !!(command && (command.code === 231 || this.parseExtendedCommand(command)));
    }

    loadExtendedCommand(command) {
        const data = this.parseExtendedCommand(command);
        if (!data || !data.pictureId || !data.position) return false;
        this.pictureIdSource = data.pictureId.source === 'variable' ? 'variable' : 'direct';
        this.pictureId = Number(data.pictureId.value) || 1;
        this.pictureName = typeof data.name === 'string' ? data.name : '';
        this.origin = Number(data.origin) === 1 ? 1 : 0;
        this.designationType = data.position.source === 'variable' ? 1 : 0;
        this.x = Number(data.position.x) || 0;
        this.y = Number(data.position.y) || 0;
        this.scaleX = Number.isFinite(Number(data.scaleX)) ? Number(data.scaleX) : 100;
        this.scaleY = Number.isFinite(Number(data.scaleY)) ? Number(data.scaleY) : 100;
        this.opacity = Number.isFinite(Number(data.opacity)) ? Number(data.opacity) : 255;
        this.blendMode = data.blend === 'overlay' ? 'overlay' : Number(data.blend) || 0;
        this.initialAngleEnabled = data.angle !== null && data.angle !== undefined;
        this.initialAngle = this.initialAngleEnabled ? Number(data.angle) || 0 : 0;
        this.customAnchorEnabled = !!data.anchor;
        this.anchorX = data.anchor ? Number(data.anchor.x) || 0 : 0;
        this.anchorY = data.anchor ? Number(data.anchor.y) || 0 : 0;
        this.waveEnabled = !!data.wave;
        this.waveAmplitudeX = data.wave ? Number(data.wave.amplitudeX) || 0 : 0;
        this.waveAmplitudeY = data.wave ? Number(data.wave.amplitudeY) || 0 : 0;
        this.wavePeriod = data.wave && Number(data.wave.period) > 0 ? Number(data.wave.period) : 60;
        this.wavePhase = data.wave ? Number(data.wave.phase) || 0 : 0;
        return true;
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'show-picture-editor-modal';
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
        container.className = 'show-picture-container';
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

    getGameResolution() {
        const system = this.databaseManager && this.databaseManager.getSystem
            ? this.databaseManager.getSystem()
            : this.databaseManager?.data?.system;
        const advanced = system?.advanced || {};
        const width = Number(advanced.screenWidth);
        const height = Number(advanced.screenHeight);
        return {
            width: Number.isFinite(width) && width > 0 ? width : 816,
            height: Number.isFinite(height) && height > 0 ? height : 624
        };
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

    getQuickWorkspaceBounds() {
        const resolution = this.getGameResolution();
        return {
            minX: -resolution.width,
            maxX: resolution.width * 2,
            minY: -resolution.height,
            maxY: resolution.height * 2
        };
    }

    calculateQuickDialogWidth(viewportWidth, viewportHeight, chromeHeight) {
        const resolution = this.getGameResolution();
        const maxWidth = Math.max(1, viewportWidth - Math.min(48, viewportWidth * 0.06));
        const frameHeight = Math.max(80, viewportHeight * 0.94 - chromeHeight);
        return Math.min(maxWidth, frameHeight * resolution.width / resolution.height + 32);
    }

    pointerToQuickCoordinates(clientX, clientY, rect, bounds = null, clampToBounds = true) {
        const resolution = this.getGameResolution();
        const area = bounds || { minX: 0, maxX: resolution.width, minY: 0, maxY: resolution.height };
        const width = Math.max(1, Number(rect?.width) || 0);
        const height = Math.max(1, Number(rect?.height) || 0);
        const x = area.minX + (clientX - rect.left) * (area.maxX - area.minX) / width;
        const y = area.minY + (clientY - rect.top) * (area.maxY - area.minY) / height;
        return {
            x: Math.round(clampToBounds ? Math.max(area.minX, Math.min(area.maxX, x)) : x),
            y: Math.round(clampToBounds ? Math.max(area.minY, Math.min(area.maxY, y)) : y)
        };
    }

    calculateQuickPreviewGeometry(imageWidth, imageHeight, frameWidth, frameHeight, state = null, bounds = null) {
        const resolution = this.getGameResolution();
        const picture = state || this;
        const area = bounds || { minX: 0, maxX: resolution.width, minY: 0, maxY: resolution.height };
        const areaWidth = area.maxX - area.minX;
        const areaHeight = area.maxY - area.minY;
        const displayWidth = Math.abs(imageWidth * picture.scaleX / 100 * frameWidth / areaWidth);
        const displayHeight = Math.abs(imageHeight * picture.scaleY / 100 * frameHeight / areaHeight);
        const anchorX = (picture.x - area.minX) * frameWidth / areaWidth;
        const anchorY = (picture.y - area.minY) * frameHeight / areaHeight;
        return {
            width: displayWidth,
            height: displayHeight,
            left: anchorX - (picture.origin === 1 ? displayWidth / 2 : picture.scaleX < 0 ? displayWidth : 0),
            top: anchorY - (picture.origin === 1 ? displayHeight / 2 : picture.scaleY < 0 ? displayHeight : 0),
            anchorX,
            anchorY,
            opacity: Math.max(0, Math.min(255, picture.opacity)) / 255
        };
    }

    interpolateQuickPreviewState(start, target, progress, easing = 0) {
        const t = Math.max(0, Math.min(1, progress));
        const eased = easing === 1 ? t * t
            : easing === 2 ? 1 - (1 - t) * (1 - t)
                : easing === 3 ? (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t))
                    : t;
        const value = property => start[property] + (target[property] - start[property]) * eased;
        return {
            origin: target.origin,
            x: value('x'),
            y: value('y'),
            scaleX: value('scaleX'),
            scaleY: value('scaleY'),
            opacity: value('opacity')
        };
    }

    getPictureAsset() {
        const project = this.projectController?.getCurrentProject
            ? this.projectController.getCurrentProject()
            : this.projectController?.currentProject;
        if (!project?.path || !this.pictureName) return null;

        const path = require('path');
        const assetFiles = typeof RRAssetFiles !== 'undefined'
            ? RRAssetFiles
            : require('../../utils/AssetFiles.js');
        const pictureName = String(this.pictureName).replace(/\.png$/i, '');
        return assetFiles.find(path.join(project.path, 'img', 'pictures'), pictureName, ['.png']);
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
        this.designationType = 0;
        this.syncPictureField('origin');
        this.syncPictureField('x');
        this.syncPictureField('y');
        this.syncPictureField('scaleX');
        this.syncPictureField('scaleY');
        this.syncPictureField('opacity');
        this.syncPictureField('designationType');
    }

    closeQuickSetting() {
        if (this.quickSettingCleanup) this.quickSettingCleanup();
        this.quickSettingCleanup = null;
        if (this.quickSettingModal) this.quickSettingModal.remove();
        this.quickSettingModal = null;
    }

    openQuickSetting(options = {}) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const asset = options.asset === undefined ? this.getPictureAsset() : options.asset;
        if (!asset && !options.allowEmpty) {
            alert(tt(this.pictureName ? 'Image not found' : 'No image selected'));
            return;
        }

        this.closeQuickSetting();
        const resolution = this.getGameResolution();
        const bounds = this.getQuickWorkspaceBounds();
        const target = options.targetState || this;
        const draft = {
            origin: Number(target.origin) === 1 ? 1 : 0,
            x: Number(target.designationType) === 1 ? Math.round(resolution.width / 2) : Number(target.x) || 0,
            y: Number(target.designationType) === 1 ? Math.round(resolution.height / 2) : Number(target.y) || 0,
            scaleX: Number.isFinite(Number(target.scaleX)) ? Number(target.scaleX) : 100,
            scaleY: Number.isFinite(Number(target.scaleY)) ? Number(target.scaleY) : 100,
            opacity: Number.isFinite(Number(target.opacity)) ? Number(target.opacity) : 255,
            duration: Number.isFinite(Number(options.duration)) ? Number(options.duration) : 60
        };

        const overlay = document.createElement('div');
        overlay.className = 'show-picture-quick-setting-modal';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 10006;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 24px;
            box-sizing: border-box;
            background: rgba(0, 0, 0, 0.8);
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            width: 94vw;
            max-height: 94vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 7px;
            box-shadow: 0 6px 28px rgba(0, 0, 0, 0.6);
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            background: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
        `;
        const title = document.createElement('h3');
        title.textContent = tt('Quick Setting');
        title.style.cssText = 'margin: 0; color: var(--color-text-strong); font-size: 16px;';
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = '\u00d7';
        closeButton.style.cssText = 'width: 28px; height: 28px; padding: 0; border: 0; background: none; color: var(--color-text-strong); font-size: 22px; cursor: pointer;';
        header.appendChild(title);
        header.appendChild(closeButton);

        const body = document.createElement('div');
        body.style.cssText = 'min-height: 0; padding: 16px; overflow: auto; background: var(--color-bg-deep);';

        let animationFrame = 0;
        const controls = document.createElement('div');
        controls.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px 12px; margin-bottom: 12px; padding: 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px;';
        const controlInputs = {};
        const addControl = (labelText, property, type, min, max) => {
            const group = document.createElement('label');
            group.style.cssText = 'display: flex; flex-direction: column; gap: 4px; color: var(--color-text-muted); font-size: 11px;';
            const label = document.createElement('span');
            label.textContent = tt(labelText);
            const input = document.createElement(type === 'select' ? 'select' : 'input');
            input.style.cssText = 'min-width: 0; padding: 5px 7px; box-sizing: border-box; background: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px;';
            if (type === 'select') {
                for (const optionData of [{ value: 0, text: 'Upper Left' }, { value: 1, text: 'Center' }]) {
                    const option = document.createElement('option');
                    option.value = optionData.value;
                    option.textContent = tt(optionData.text);
                    input.appendChild(option);
                }
            } else {
                input.type = 'number';
                input.min = min;
                input.max = max;
            }
            input.value = draft[property];
            input.addEventListener('input', () => {
                cancelAnimation();
                const value = Number(input.value);
                if (Number.isFinite(value)) draft[property] = type === 'select' ? Math.trunc(value) : value;
                updatePreview();
            });
            controlInputs[property] = input;
            group.appendChild(label);
            group.appendChild(input);
            controls.appendChild(group);
        };
        addControl('Origin:', 'origin', 'select');
        addControl('X:', 'x', 'number', -9999, 9999);
        addControl('Y:', 'y', 'number', -9999, 9999);
        addControl('Scale Width %:', 'scaleX', 'number', -2000, 2000);
        addControl('Scale Height %:', 'scaleY', 'number', -2000, 2000);
        addControl('Opacity:', 'opacity', 'number', 0, 255);
        if (options.showDuration) addControl('Duration:', 'duration', 'number', 1, 999);

        const info = document.createElement('div');
        info.style.cssText = 'display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; color: var(--color-text-muted); font-size: 12px;';
        const resolutionText = document.createElement('span');
        resolutionText.textContent = `${resolution.width} x ${resolution.height}`;
        const coordinatesText = document.createElement('span');
        const updateCoordinatesText = () => {
            coordinatesText.textContent = `X: ${Math.round(draft.x)}   Y: ${Math.round(draft.y)}`;
        };
        updateCoordinatesText();
        info.appendChild(resolutionText);
        info.appendChild(coordinatesText);

        const frame = document.createElement('div');
        frame.className = 'show-picture-quick-setting-frame';
        frame.style.cssText = `
            position: relative;
            width: 100%;
            aspect-ratio: ${resolution.width} / ${resolution.height};
            overflow: hidden;
            touch-action: none;
            background-color: #090c11;
            border: 1px solid var(--color-border-input);
            box-sizing: border-box;
            box-shadow: inset 0 0 24px rgba(0,0,0,0.5);
        `;

        const screen = document.createElement('div');
        screen.style.cssText = `
            position: absolute;
            left: 33.333333%;
            top: 33.333333%;
            width: 33.333333%;
            height: 33.333333%;
            box-sizing: border-box;
            background-color: #151b23;
            background-image:
                linear-gradient(rgba(255,255,255,0.09) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.09) 1px, transparent 1px),
                linear-gradient(rgba(91,192,222,0.3) 1px, transparent 1px),
                linear-gradient(90deg, rgba(91,192,222,0.3) 1px, transparent 1px);
            background-size: 10% 10%, 10% 10%, 50% 50%, 50% 50%;
            border: 2px solid var(--color-accent);
            box-shadow: 0 0 12px rgba(91,192,222,0.18);
            pointer-events: none;
        `;

        const sprite = document.createElement('div');
        sprite.style.cssText = 'position: absolute; box-sizing: border-box; border: 1px dashed var(--color-accent); cursor: grab; user-select: none;';
        const image = document.createElement('img');
        image.alt = this.pictureName;
        image.draggable = false;
        image.style.cssText = 'display: block; width: 100%; height: 100%; pointer-events: none; user-select: none;';
        const anchor = document.createElement('div');
        anchor.style.cssText = `
            position: absolute;
            width: 12px;
            height: 12px;
            border: 2px solid var(--color-accent-bright);
            border-radius: 50%;
            background: var(--color-bg-deep);
            box-sizing: border-box;
            transform: translate(-50%, -50%);
            cursor: grab;
            z-index: 2;
        `;
        const emptyPreview = document.createElement('div');
        emptyPreview.textContent = tt('No image selected');
        emptyPreview.style.cssText = 'position: absolute; inset: 0; display: none; align-items: center; justify-content: center; color: var(--color-text-muted); font-size: 12px; pointer-events: none;';
        sprite.appendChild(image);
        frame.appendChild(screen);
        frame.appendChild(sprite);
        frame.appendChild(anchor);
        frame.appendChild(emptyPreview);
        body.appendChild(controls);
        body.appendChild(info);
        body.appendChild(frame);

        const footer = document.createElement('div');
        footer.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; background: var(--color-bg-panel); border-top: 1px solid var(--color-border);';
        const previewButton = document.createElement('button');
        previewButton.type = 'button';
        previewButton.textContent = tt('Preview');
        previewButton.style.cssText = 'display: none; margin-right: auto; padding: 6px 16px; background: var(--color-bg-button); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 12px;';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'rr-btn-secondary';
        cancelButton.textContent = tt('Cancel');
        const applyButton = document.createElement('button');
        applyButton.type = 'button';
        applyButton.textContent = tt('Apply');
        applyButton.style.cssText = 'padding: 6px 20px; background: var(--color-accent); color: var(--color-bg-deep); border: 0; border-radius: 3px; cursor: pointer; font-size: 12px; font-weight: bold;';
        footer.appendChild(previewButton);
        footer.appendChild(cancelButton);
        footer.appendChild(applyButton);

        dialog.appendChild(header);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        this.quickSettingModal = overlay;

        const cancelAnimation = () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
            animationFrame = 0;
        };
        const updatePreview = (pictureState = draft) => {
            const rect = frame.getBoundingClientRect();
            updateCoordinatesText();
            if (!asset) {
                sprite.style.display = 'none';
                anchor.style.display = 'none';
                emptyPreview.style.display = 'flex';
                return;
            }
            if (!rect.width || !rect.height || !image.naturalWidth || !image.naturalHeight) return;
            sprite.style.display = 'block';
            anchor.style.display = 'block';
            emptyPreview.style.display = 'none';
            const geometry = this.calculateQuickPreviewGeometry(
                image.naturalWidth,
                image.naturalHeight,
                rect.width,
                rect.height,
                pictureState,
                bounds
            );
            sprite.style.left = `${geometry.left}px`;
            sprite.style.top = `${geometry.top}px`;
            sprite.style.width = `${geometry.width}px`;
            sprite.style.height = `${geometry.height}px`;
            image.style.opacity = geometry.opacity;
            image.style.transform = `scale(${pictureState.scaleX < 0 ? -1 : 1}, ${pictureState.scaleY < 0 ? -1 : 1})`;
            anchor.style.left = `${geometry.anchorX}px`;
            anchor.style.top = `${geometry.anchorY}px`;
        };

        const playAnimation = () => {
            if (!asset || !options.startState) return;
            cancelAnimation();
            const startedAt = performance.now();
            const duration = Math.max(1, Number(draft.duration) || 1) * 1000 / 60;
            const tick = now => {
                const progress = Math.min(1, (now - startedAt) / duration);
                updatePreview(this.interpolateQuickPreviewState(
                    options.startState,
                    draft,
                    progress,
                    Number(options.easing) || 0
                ));
                if (progress < 1) animationFrame = requestAnimationFrame(tick);
                else animationFrame = 0;
            };
            animationFrame = requestAnimationFrame(tick);
        };
        if (asset && options.startState) {
            previewButton.style.display = '';
            previewButton.addEventListener('click', playAnimation);
        }

        let drag = null;
        const startDrag = event => {
            cancelAnimation();
            const rect = frame.getBoundingClientRect();
            drag = {
                pointer: this.pointerToQuickCoordinates(event.clientX, event.clientY, rect, bounds, false),
                x: draft.x,
                y: draft.y
            };
            frame.setPointerCapture?.(event.pointerId);
            sprite.style.cursor = 'grabbing';
            anchor.style.cursor = 'grabbing';
            event.preventDefault();
        };
        const moveDrag = event => {
            if (!drag) return;
            const rect = frame.getBoundingClientRect();
            const pointer = this.pointerToQuickCoordinates(event.clientX, event.clientY, rect, bounds, false);
            draft.x = Math.round(Math.max(-9999, Math.min(9999, drag.x + pointer.x - drag.pointer.x)));
            draft.y = Math.round(Math.max(-9999, Math.min(9999, drag.y + pointer.y - drag.pointer.y)));
            controlInputs.x.value = draft.x;
            controlInputs.y.value = draft.y;
            updatePreview();
        };
        const endDrag = event => {
            if (!drag) return;
            drag = null;
            frame.releasePointerCapture?.(event.pointerId);
            sprite.style.cursor = 'grab';
            anchor.style.cursor = 'grab';
        };

        const close = () => this.closeQuickSetting();
        closeButton.addEventListener('click', close);
        cancelButton.addEventListener('click', close);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) close();
        });
        sprite.addEventListener('pointerdown', startDrag);
        anchor.addEventListener('pointerdown', startDrag);
        frame.addEventListener('pointermove', moveDrag);
        frame.addEventListener('pointerup', endDrag);
        frame.addEventListener('pointercancel', endDrag);
        applyButton.addEventListener('click', () => {
            const values = {
                origin: draft.origin === 1 ? 1 : 0,
                x: Math.round(Math.max(-9999, Math.min(9999, draft.x))),
                y: Math.round(Math.max(-9999, Math.min(9999, draft.y))),
                scaleX: Math.max(-2000, Math.min(2000, draft.scaleX)),
                scaleY: Math.max(-2000, Math.min(2000, draft.scaleY)),
                opacity: Math.round(Math.max(0, Math.min(255, draft.opacity)))
            };
            if (options.showDuration) {
                values.duration = Math.round(Math.max(1, Math.min(999, draft.duration)));
            }
            if (options.onApply) options.onApply(values);
            else this.applyQuickSettingValues(values);
            close();
        });

        image.addEventListener('load', () => {
            updatePreview();
            if (options.startState) playAnimation();
        });
        if (asset) {
            image.src = (typeof RRAssetFiles !== 'undefined' ? RRAssetFiles : require('../../utils/AssetFiles.js')).toUrl(asset.absolutePath);
        } else {
            updatePreview();
        }
        const fitDialog = () => {
            const chromeHeight = header.offsetHeight
                + controls.offsetHeight
                + info.offsetHeight
                + footer.offsetHeight
                + 52;
            dialog.style.width = `${this.calculateQuickDialogWidth(
                window.innerWidth,
                window.innerHeight,
                chromeHeight
            )}px`;
            updatePreview();
        };
        const handleResize = () => {
            fitDialog();
            requestAnimationFrame(fitDialog);
        };
        window.addEventListener('resize', handleResize);
        this.quickSettingCleanup = () => {
            cancelAnimation();
            window.removeEventListener('resize', handleResize);
        };
        fitDialog();
        requestAnimationFrame(fitDialog);
    }

    /**
     * Render modal content
     */
    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.show-picture-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Show Picture')}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
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

        // Picture ID
        content.appendChild(this.createSelectInput('Picture ID Source:', 'pictureIdSource', [
            { value: 'direct', text: 'Direct' },
            { value: 'variable', text: 'Variable' }
        ]));
        content.appendChild(this.createNumberInput(
            this.pictureIdSource === 'variable' ? 'Variable:' : 'Picture Number:',
            'pictureId', 1, 9999));

        // Picture Name
        const imageRow = this.createTextInput('Image:', 'pictureName', 'Enter picture filename');
        const quickSettingButton = document.createElement('button');
        quickSettingButton.type = 'button';
        quickSettingButton.className = 'show-picture-quick-setting-btn';
        quickSettingButton.textContent = tt('Quick Setting');
        quickSettingButton.disabled = !this.pictureName;
        quickSettingButton.style.cssText = 'flex: 0 0 auto; padding: 6px 12px; background: var(--color-bg-button); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 12px;';
        quickSettingButton.addEventListener('click', () => this.openQuickSetting());
        imageRow.appendChild(quickSettingButton);
        content.appendChild(imageRow);

        // Origin
        content.appendChild(this.createOriginSection());

        // Position Type
        content.appendChild(this.createPositionTypeSection());

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
        content.appendChild(this.createBlendModeSection());

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
     * Create text input field
     */
    createTextInput(label, property, placeholder) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const labelEl = document.createElement('span');
        labelEl.textContent = tt(label);
        labelEl.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const input = document.createElement('input');
        input.type = 'text';
        input.dataset.pictureProperty = property;
        input.value = this[property];
        input.placeholder = tt(placeholder);
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
            this[property] = e.target.value;
            if (property === 'pictureName') {
                const button = this.modal?.querySelector('.show-picture-quick-setting-btn');
                if (button) button.disabled = !this.pictureName;
            }
        });

        section.appendChild(labelEl);
        section.appendChild(input);
        return section;
    }

    createSelectInput(label, property, options) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const labelEl = document.createElement('span');
        labelEl.textContent = tt(label);
        labelEl.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';
        const select = document.createElement('select');
        select.dataset.pictureProperty = property;
        select.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';
        for (const item of options) {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = tt(item.text);
            option.selected = this[property] === item.value;
            select.appendChild(option);
        }
        select.addEventListener('change', event => {
            this[property] = event.target.value;
            if (property === 'pictureIdSource') this.renderContent();
        });
        section.appendChild(labelEl);
        section.appendChild(select);
        return section;
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
        const checkbox = (label, property) => {
            const row = document.createElement('label');
            row.style.cssText = 'display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 13px;';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = this[property];
            input.addEventListener('change', event => { this[property] = event.target.checked; });
            row.appendChild(input);
            row.appendChild(document.createTextNode(tt(label)));
            return row;
        };
        controls.appendChild(checkbox('Set initial angle', 'initialAngleEnabled'));
        controls.appendChild(this.createNumberInput('Angle (degrees):', 'initialAngle', -36000, 36000));
        controls.appendChild(checkbox('Use custom anchor', 'customAnchorEnabled'));
        controls.appendChild(this.createNumberInput('Anchor X:', 'anchorX', -10, 10));
        controls.appendChild(this.createNumberInput('Anchor Y:', 'anchorY', -10, 10));
        controls.appendChild(checkbox('Set sine wave', 'waveEnabled'));
        controls.appendChild(this.createNumberInput('Wave amplitude X:', 'waveAmplitudeX', -9999, 9999));
        controls.appendChild(this.createNumberInput('Wave amplitude Y:', 'waveAmplitudeY', -9999, 9999));
        controls.appendChild(this.createNumberInput('Wave period:', 'wavePeriod', 1, 99999));
        controls.appendChild(this.createNumberInput('Wave phase (degrees):', 'wavePhase', -36000, 36000));
        details.appendChild(controls);
        return details;
    }

    /**
     * Create origin selection section
     */
    createOriginSection() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = tt('Origin:');
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const select = document.createElement('select');
        select.dataset.pictureProperty = 'origin';
        select.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;

        const options = [
            { value: 0, text: 'Upper Left' },
            { value: 1, text: 'Center' }
        ];

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = window.I18n ? window.I18n.tText(opt.text) : opt.text;
            option.selected = (this.origin === opt.value);
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            this.origin = parseInt(e.target.value);
        });

        section.appendChild(label);
        section.appendChild(select);
        return section;
    }

    /**
     * Create position type section
     */
    createPositionTypeSection() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = tt('Position:');
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const select = document.createElement('select');
        select.dataset.pictureProperty = 'designationType';
        select.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;

        const options = [
            { value: 0, text: 'Direct Designation' },
            { value: 1, text: 'Designation with Variables' }
        ];

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = window.I18n ? window.I18n.tText(opt.text) : opt.text;
            option.selected = (this.designationType === opt.value);
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            this.setDesignationType(parseInt(e.target.value));
            this.renderContent();
        });

        section.appendChild(label);
        section.appendChild(select);
        return section;
    }

    /**
     * Create blend mode section
     */
    createBlendModeSection() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = tt('Blend Mode:');
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const select = document.createElement('select');
        select.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;

        const options = [
            { value: 0, text: 'Normal' },
            { value: 1, text: 'Additive' },
            { value: 2, text: 'Multiply' },
            { value: 3, text: 'Screen' },
            { value: 'overlay', text: 'Overlay (Reactor)' }
        ];

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = window.I18n ? window.I18n.tText(opt.text) : opt.text;
            option.selected = (String(this.blendMode) === String(opt.value));
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            this.blendMode = e.target.value === 'overlay' ? 'overlay' : parseInt(e.target.value);
        });

        section.appendChild(label);
        section.appendChild(select);
        return section;
    }

    /**
     * Build command from current data
     */
    buildCommand() {
        const position = this.normalizePositionValues();
        this.x = position.x;
        this.y = position.y;
        const extended = this.pictureIdSource === 'variable'
            || this.blendMode === 'overlay'
            || this.initialAngleEnabled
            || this.customAnchorEnabled
            || this.waveEnabled;
        if (extended) {
            const payload = {
                operation: 'show',
                pictureId: { source: this.pictureIdSource, value: this.pictureId },
                name: this.pictureName,
                origin: this.origin,
                position: { source: this.designationType === 1 ? 'variable' : 'direct', x: this.x, y: this.y },
                scaleX: this.scaleX,
                scaleY: this.scaleY,
                opacity: this.opacity,
                blend: this.blendMode,
                angle: this.initialAngleEnabled ? this.initialAngle : null,
                anchor: this.customAnchorEnabled ? { x: this.anchorX, y: this.anchorY } : null,
                wave: this.waveEnabled ? {
                    amplitudeX: this.waveAmplitudeX,
                    amplitudeY: this.waveAmplitudeY,
                    period: this.wavePeriod,
                    phase: this.wavePhase
                } : null
            };
            const codec = this.getCodec();
            if (!codec || typeof codec.createScriptCommand !== 'function') {
                throw new Error('ReactorEventCommandCodec is unavailable');
            }
            const body = codec.createPictureBody(payload);
            return codec.createScriptCommand('picture', payload, body);
        }
        return {
            code: 231,
            indent: 0,
            parameters: [
                this.pictureId,
                this.pictureName,
                this.origin,
                this.designationType,
                this.x,
                this.y,
                this.scaleX,
                this.scaleY,
                this.opacity,
                this.blendMode
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
        this.closeQuickSetting();
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShowPictureEditor;
}
