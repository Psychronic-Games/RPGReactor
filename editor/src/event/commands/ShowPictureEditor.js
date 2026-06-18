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
        this.pictureName = '';
        this.origin = 0; // 0=Upper Left, 1=Center
        this.designationType = 0; // 0=Direct, 1=Variable
        this.x = 0;
        this.y = 0;
        this.scaleX = 100;
        this.scaleY = 100;
        this.opacity = 255;
        this.blendMode = 0; // 0=Normal, 1=Additive, 2=Multiply, 3=Screen
    }

    /**
     * Show editor for a show picture command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 231) {
            const params = command.parameters;
            this.pictureId = params[0] || 1;
            this.pictureName = params[1] || '';
            this.origin = params[2] || 0;
            this.designationType = params[3] || 0;
            this.x = params[4] || 0;
            this.y = params[5] || 0;
            this.scaleX = params[6] || 100;
            this.scaleY = params[7] || 100;
            this.opacity = params[8] || 255;
            this.blendMode = params[9] || 0;
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

    /**
     * Render modal content
     */
    renderContent() {
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Show Picture</h3>
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
        content.appendChild(this.createNumberInput('Picture #:', 'pictureId', 1, 100));

        // Picture Name
        content.appendChild(this.createTextInput('Image:', 'pictureName', 'Enter picture filename'));

        // Origin
        content.appendChild(this.createOriginSection());

        // Position Type
        content.appendChild(this.createPositionTypeSection());

        // X and Y coordinates
        content.appendChild(this.createNumberInput('X:', 'x', -9999, 9999));
        content.appendChild(this.createNumberInput('Y:', 'y', -9999, 9999));

        // Scale
        content.appendChild(this.createNumberInput('Scale Width %:', 'scaleX', 0, 2000));
        content.appendChild(this.createNumberInput('Scale Height %:', 'scaleY', 0, 2000));

        // Opacity
        content.appendChild(this.createNumberInput('Opacity:', 'opacity', 0, 255));

        // Blend Mode
        content.appendChild(this.createBlendModeSection());

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
     * Create text input field
     */
    createTextInput(label, property, placeholder) {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = this[property];
        input.placeholder = placeholder;
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
        });

        section.appendChild(labelEl);
        section.appendChild(input);
        return section;
    }

    /**
     * Create origin selection section
     */
    createOriginSection() {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = 'Origin:';
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
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = 'Position:';
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
            this.designationType = parseInt(e.target.value);
        });

        section.appendChild(label);
        section.appendChild(select);
        return section;
    }

    /**
     * Create blend mode section
     */
    createBlendModeSection() {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = 'Blend Mode:';
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
            { value: 3, text: 'Screen' }
        ];

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = window.I18n ? window.I18n.tText(opt.text) : opt.text;
            option.selected = (this.blendMode === opt.value);
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            this.blendMode = parseInt(e.target.value);
        });

        section.appendChild(label);
        section.appendChild(select);
        return section;
    }

    /**
     * Build command from current data
     */
    buildCommand() {
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
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShowPictureEditor;
}
