/**
 * ErasePictureEditor - Editor for Erase Picture event command (code 235)
 */
class ErasePictureEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.pictureId = 1;
        this.pictureIdSource = 'direct';
        this.eraseMode = 'one';
        this.endPictureId = 1;
        this.endPictureIdSource = 'direct';
    }

    /**
     * Show editor for an erase picture command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        if (command && command.code === 355 && !this.parseExtendedCommand(command)) return false;
        this.callback = callback;

        if (command && command.code === 235) {
            const params = command.parameters;
            this.pictureId = params[0] || 1;
            this.pictureIdSource = 'direct';
            this.eraseMode = 'one';
            this.endPictureId = this.pictureId;
            this.endPictureIdSource = 'direct';
        } else if (this.loadExtendedCommand(command)) {
            // Extended values were loaded by loadExtendedCommand.
        } else {
            this.pictureId = 1;
            this.pictureIdSource = 'direct';
            this.eraseMode = 'one';
            this.endPictureId = 1;
            this.endPictureIdSource = 'direct';
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
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
        return data.operation === 'erase'
            && ['one', 'range', 'all'].includes(data.mode)
            && ref(data.pictureId)
            && ref(data.endPictureId);
    }

    acceptsCommand(command) {
        return !!(command && (command.code === 235 || this.parseExtendedCommand(command)));
    }

    loadExtendedCommand(command) {
        const data = this.parseExtendedCommand(command);
        if (!data || !['one', 'range', 'all'].includes(data.mode)) return false;
        this.eraseMode = data.mode;
        this.pictureIdSource = data.pictureId?.source === 'variable' ? 'variable' : 'direct';
        this.pictureId = Number(data.pictureId?.value) || 1;
        this.endPictureIdSource = data.endPictureId?.source === 'variable' ? 'variable' : 'direct';
        this.endPictureId = Number(data.endPictureId?.value) || this.pictureId;
        return true;
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'erase-picture-editor-modal';
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
        container.className = 'erase-picture-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 350px;
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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.erase-picture-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Erase Picture')}</h3>
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
        `;

        content.appendChild(this.createSelectInput('Erase:', 'eraseMode', [
            { value: 'one', text: 'One' },
            { value: 'range', text: 'Range' },
            { value: 'all', text: 'All' }
        ]));
        if (this.eraseMode !== 'all') {
            content.appendChild(this.createSelectInput('Start ID Source:', 'pictureIdSource', [
                { value: 'direct', text: 'Direct' },
                { value: 'variable', text: 'Variable' }
            ]));
            content.appendChild(this.createNumberInput(
                this.pictureIdSource === 'variable' ? 'Variable:' : 'Picture Number:', 'pictureId'));
        }
        if (this.eraseMode === 'range') {
            content.appendChild(this.createSelectInput('End ID Source:', 'endPictureIdSource', [
                { value: 'direct', text: 'Direct' },
                { value: 'variable', text: 'Variable' }
            ]));
            content.appendChild(this.createNumberInput(
                this.endPictureIdSource === 'variable' ? 'Variable:' : 'Picture Number:', 'endPictureId'));
        }

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

    createSelectInput(label, property, options) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const labelEl = document.createElement('span');
        labelEl.textContent = tt(label);
        labelEl.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';
        const select = document.createElement('select');
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
            this.renderContent();
        });
        row.appendChild(labelEl);
        row.appendChild(select);
        return row;
    }

    createNumberInput(label, property) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const labelEl = document.createElement('span');
        labelEl.textContent = tt(label);
        labelEl.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 120px;';
        const input = document.createElement('input');
        input.type = 'number';
        input.min = 1;
        input.max = 9999;
        input.value = this[property];
        input.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 100px;';
        input.addEventListener('input', event => { this[property] = parseInt(event.target.value) || 1; });
        row.appendChild(labelEl);
        row.appendChild(input);
        return row;
    }

    /**
     * Build command from current data
     */
    buildCommand() {
        const stock = this.eraseMode === 'one' && this.pictureIdSource === 'direct';
        if (!stock) {
            const payload = {
                operation: 'erase',
                mode: this.eraseMode,
                pictureId: { source: this.pictureIdSource, value: this.pictureId },
                endPictureId: { source: this.endPictureIdSource, value: this.endPictureId }
            };
            const codec = this.getCodec();
            if (!codec || typeof codec.createScriptCommand !== 'function') {
                throw new Error('ReactorEventCommandCodec is unavailable');
            }
            const body = codec.createPictureBody(payload);
            return codec.createScriptCommand('picture', payload, body);
        }
        return {
            code: 235,
            indent: 0,
            parameters: [this.pictureId]
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
    module.exports = ErasePictureEditor;
}
