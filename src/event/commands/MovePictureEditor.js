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
        this.origin = 0; // 0=Upper Left, 1=Center
        this.designationType = 0; // 0=Direct, 1=Variable
        this.x = 0;
        this.y = 0;
        this.scaleX = 100;
        this.scaleY = 100;
        this.opacity = 255;
        this.blendMode = 0; // 0=Normal, 1=Additive, 2=Multiply, 3=Screen
        this.duration = 60;
        this.wait = true;
        this.easing = 0; // 0=Constant Speed, 1=Slow Start, 2=Slow End, 3=Slow Start/End
    }

    /**
     * Show editor for a move picture command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

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
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
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
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const labelEl = document.createElement('span');
        labelEl.textContent = label;
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
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = min;
        input.max = max;
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
            this[property] = parseInt(e.target.value) || 0;
        });

        section.appendChild(labelEl);
        section.appendChild(input);
        return section;
    }

    /**
     * Create dropdown select field
     */
    createSelectInput(label, property, options) {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

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

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            option.selected = (this[property] === opt.value);
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            this[property] = parseInt(e.target.value);
        });

        section.appendChild(labelEl);
        section.appendChild(select);
        return section;
    }

    /**
     * Render modal content
     */
    renderContent() {
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Move Picture</h3>
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

        // Picture ID
        content.appendChild(this.createNumberInput('Picture #:', 'pictureId', 1, 100));

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
        content.appendChild(this.createNumberInput('X:', 'x', -9999, 9999));
        content.appendChild(this.createNumberInput('Y:', 'y', -9999, 9999));

        // Scale
        content.appendChild(this.createNumberInput('Scale Width %:', 'scaleX', 0, 2000));
        content.appendChild(this.createNumberInput('Scale Height %:', 'scaleY', 0, 2000));

        // Opacity
        content.appendChild(this.createNumberInput('Opacity:', 'opacity', 0, 255));

        // Blend Mode
        content.appendChild(this.createSelectInput('Blend Mode:', 'blendMode', [
            { value: 0, text: 'Normal' },
            { value: 1, text: 'Additive' },
            { value: 2, text: 'Multiply' },
            { value: 3, text: 'Screen' }
        ]));

        // Duration
        const durationRow = document.createElement('div');
        durationRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const durationLabel = document.createElement('span');
        durationLabel.textContent = 'Duration:';
        durationLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const durationInput = document.createElement('input');
        durationInput.type = 'number';
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
        durationUnit.textContent = 'frames';
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
        waitLabel.textContent = 'Wait for Completion';
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
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
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
     * Build command from current data
     */
    buildCommand() {
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
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MovePictureEditor;
}
