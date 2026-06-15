/**
 * LoopEditor - Editor for Loop/Repeat Above event commands (codes 112/413)
 * Note: These commands don't need parameters, they're structural commands
 */
class LoopEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.commandType = 112; // 112=Loop, 413=Repeat Above
    }

    /**
     * Show editor for a loop command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        if (command && (command.code === 112 || command.code === 413)) {
            this.commandType = command.code;
        } else {
            this.commandType = 112;
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
        this.modal.className = 'loop-editor-modal';
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
        container.className = 'loop-container';
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
     * Render modal content
     */
    renderContent() {
        const container = this.modal.querySelector('.loop-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Loop Control</h3>
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
            gap: 16px;
        `;

        // Command type selection
        const typeSection = document.createElement('div');
        typeSection.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

        const loopOption = this.createLoopOption(
            112,
            'Loop',
            'Start a loop block. Commands inside will repeat until a "Break Loop" command is encountered.'
        );
        const repeatOption = this.createLoopOption(
            413,
            'Repeat Above',
            'Marks the end of a loop block. Execution jumps back to the corresponding "Loop" command.'
        );

        typeSection.appendChild(loopOption);
        typeSection.appendChild(repeatOption);
        content.appendChild(typeSection);

        // Info section
        const infoSection = document.createElement('div');
        infoSection.style.cssText = `
            padding: 12px;
            background-color: var(--color-bg-list-item);
            border-left: 3px solid var(--color-link);
            border-radius: 3px;
        `;
        infoSection.innerHTML = `
            <div style="color: var(--color-text); font-size: 12px; margin-bottom: 6px; font-weight: bold;">Loop Usage:</div>
            <div style="color: var(--color-text-muted); font-size: 11px; line-height: 1.6;">
                • <strong>Loop</strong>: Starts a repeating block of commands<br>
                • <strong>Repeat Above</strong>: Ends the loop and jumps back to the Loop command<br>
                • Use <strong>Break Loop</strong> (code 113) to exit a loop early<br>
                • Loops can be nested
            </div>
        `;
        content.appendChild(infoSection);

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
     * Create a loop option radio button
     */
    createLoopOption(code, label, description) {
        const option = document.createElement('div');
        option.style.cssText = `
            padding: 12px;
            background-color: ${this.commandType === code ? 'var(--color-bg-input)' : 'var(--color-bg-surface)'};
            border: 2px solid ${this.commandType === code ? 'var(--color-link)' : 'var(--color-border)'};
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        `;

        option.addEventListener('click', () => {
            this.commandType = code;
            this.renderContent();
        });

        option.addEventListener('mouseenter', () => {
            if (this.commandType !== code) {
                option.style.backgroundColor = 'var(--color-bg-list-item)';
                option.style.borderColor = 'var(--color-border-input)';
            }
        });

        option.addEventListener('mouseleave', () => {
            if (this.commandType !== code) {
                option.style.backgroundColor = 'var(--color-bg-surface)';
                option.style.borderColor = 'var(--color-border)';
            }
        });

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';

        const radio = document.createElement('div');
        radio.style.cssText = `
            width: 16px;
            height: 16px;
            border: 2px solid ${this.commandType === code ? 'var(--color-link)' : 'var(--color-text-dim)'};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        if (this.commandType === code) {
            const dot = document.createElement('div');
            dot.style.cssText = `
                width: 8px;
                height: 8px;
                background-color: var(--color-link);
                border-radius: 50%;
            `;
            radio.appendChild(dot);
        }

        const labelEl = document.createElement('div');
        labelEl.textContent = label;
        labelEl.style.cssText = 'color: var(--color-text-strong); font-size: 14px; font-weight: bold;';

        header.appendChild(radio);
        header.appendChild(labelEl);

        const desc = document.createElement('div');
        desc.textContent = description;
        desc.style.cssText = 'color: var(--color-text-muted); font-size: 11px; line-height: 1.5;';

        option.appendChild(header);
        option.appendChild(desc);

        return option;
    }

    /**
     * Build command from current data
     */
    buildCommand() {
        return {
            code: this.commandType,
            indent: 0,
            parameters: []
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
    module.exports = LoopEditor;
}
