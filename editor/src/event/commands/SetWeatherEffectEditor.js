/**
 * SetWeatherEffectEditor - Editor for Set Weather Effect event command (code 236)
 */
class SetWeatherEffectEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.weatherType = 'none';
        this.power = 5;
        this.duration = 60;
        this.wait = true;
    }

    /**
     * Show editor for a set weather effect command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 236) {
            const params = command.parameters;
            this.weatherType = params[0] !== undefined ? params[0] : 'none';
            this.power = params[1] !== undefined ? params[1] : 5;
            this.duration = params[2] !== undefined ? params[2] : 60;
            this.wait = params[3] !== undefined ? params[3] : true;
        } else {
            this.weatherType = 'none';
            this.power = 5;
            this.duration = 60;
            this.wait = true;
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
        this.modal.className = 'set-weather-effect-editor-modal';
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
        container.className = 'set-weather-effect-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 450px;
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
     * Render modal content
     */
    renderContent() {
        const container = this.modal.querySelector('.set-weather-effect-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Set Weather Effect</h3>
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

        // Weather type dropdown
        const typeRow = document.createElement('div');
        typeRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const typeLabel = document.createElement('span');
        typeLabel.textContent = 'Type:';
        typeLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const typeSelect = document.createElement('select');
        typeSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;

        const weatherOptions = [
            { value: 'none', text: 'None' },
            { value: 'rain', text: 'Rain' },
            { value: 'storm', text: 'Storm' },
            { value: 'snow', text: 'Snow' }
        ];

        weatherOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = window.I18n ? window.I18n.tText(opt.text) : opt.text;
            option.selected = (this.weatherType === opt.value);
            typeSelect.appendChild(option);
        });

        typeSelect.addEventListener('change', (e) => {
            this.weatherType = e.target.value;
        });

        typeRow.appendChild(typeLabel);
        typeRow.appendChild(typeSelect);
        content.appendChild(typeRow);

        // Power slider
        content.appendChild(this.createSliderInput('Power:', this.power, 1, 9, (val) => { this.power = val; }));

        // Duration
        const durationRow = document.createElement('div');
        durationRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const durationLabel = document.createElement('span');
        durationLabel.textContent = 'Duration:';
        durationLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

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
        waitCheckbox.id = 'weather-effect-wait';
        waitCheckbox.checked = this.wait;
        waitCheckbox.addEventListener('change', (e) => {
            this.wait = e.target.checked;
        });

        const waitLabel = document.createElement('label');
        waitLabel.htmlFor = 'weather-effect-wait';
        waitLabel.textContent = 'Wait for Completion';
        waitLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';

        waitRow.appendChild(waitCheckbox);
        waitRow.appendChild(waitLabel);
        content.appendChild(waitRow);

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
            code: 236,
            indent: 0,
            parameters: [
                this.weatherType,
                this.power,
                this.duration,
                this.wait
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
    module.exports = SetWeatherEffectEditor;
}
