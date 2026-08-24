/**
 * RecoverAllEditor - Editor for Recover All event command (code 314)
 */
class RecoverAllEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [actorSelect, actorId]
        this.actorSelect = 0; // 0=Fixed, 1=Variable
        this.actorId = 1;
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 314) {
            const params = command.parameters;
            this.actorSelect = params[0] || 0;
            // 0 means the entire party — Game_Interpreter.iterateActorId
            // branches on `param === 0` — and 0 is falsy, so `||` collapsed
            // every party-wide command onto actor 1.
            this.actorId = params[1] ?? 1;
        } else {
            this.actorSelect = 0;
            this.actorId = 1;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'recover-all-editor-modal';
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
        container.className = 'recover-all-container rr-modal';
        container.style.cssText = `width: min(450px, calc(100vw - 24px)); max-height: 92vh;`;

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        document.body.appendChild(this.modal);
    }

    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.recover-all-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Recover All')}</div>
            <button class="rr-modal-close close-btn" type="button">×</button>
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
            min-height: 0;
        `;

        // Actor selector
        content.appendChild(this.createActorSelector());

        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.className = 'rr-button-primary';
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);
    }

    createActorSelector() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border);';

        // Fixed actor radio
        const fixedRow = document.createElement('div');
        fixedRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const fixedRadio = document.createElement('input');
        fixedRadio.type = 'radio'; fixedRadio.name = 'actor-select-314'; fixedRadio.id = 'actor-fixed-314';
        fixedRadio.checked = (this.actorSelect === 0);
        fixedRadio.addEventListener('change', () => { this.actorSelect = 0; this.renderContent(); });
        const fixedLabel = document.createElement('label');
        fixedLabel.htmlFor = 'actor-fixed-314'; fixedLabel.textContent = tt('Fixed');
        fixedLabel.style.cssText = 'color: var(--color-text); cursor: pointer; min-width: 60px;';
        fixedRow.appendChild(fixedRadio); fixedRow.appendChild(fixedLabel);

        if (this.actorSelect === 0) {
            const select = document.createElement('select');
            select.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; flex:1;';
            const actors = this.databaseManager.data.actors || [];
            const partyOption = document.createElement('option');
            partyOption.value = 0;
            partyOption.textContent = tt('Entire Party');
            partyOption.selected = (this.actorId === 0);
            select.appendChild(partyOption);
            for (let i = 1; i < actors.length; i++) {
                if (!actors[i]) continue;
                const option = document.createElement('option');
                option.value = i; option.textContent = `${i.toString().padStart(4, '0')}: ${actors[i].name || tt('Unnamed')}`;
                option.selected = (this.actorId === i);
                select.appendChild(option);
            }
            select.addEventListener('change', (e) => { this.actorId = parseInt(e.target.value); });
            fixedRow.appendChild(select);
        }
        section.appendChild(fixedRow);

        // Variable radio
        const varRow = document.createElement('div');
        varRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const varRadio = document.createElement('input');
        varRadio.type = 'radio'; varRadio.name = 'actor-select-314'; varRadio.id = 'actor-variable-314';
        varRadio.checked = (this.actorSelect === 1);
        varRadio.addEventListener('change', () => { this.actorSelect = 1; this.renderContent(); });
        const varLabel = document.createElement('label');
        varLabel.htmlFor = 'actor-variable-314'; varLabel.textContent = tt('Variable');
        varLabel.style.cssText = 'color: var(--color-text); cursor: pointer; min-width: 60px;';
        varRow.appendChild(varRadio); varRow.appendChild(varLabel);

        if (this.actorSelect === 1) {
            const varInput = document.createElement('input');
            varInput.type = 'number'; varInput.min = 1; varInput.max = 9999; varInput.value = this.actorId || 1;
            varInput.style.cssText = 'padding:6px 10px; background-color:var(--color-bg-input); color:var(--color-text); border:1px solid var(--color-border-input); border-radius:3px; font-size:12px; width:80px;';
            varInput.addEventListener('input', (e) => { this.actorId = parseInt(e.target.value) || 1; });
            varRow.appendChild(varInput);
            const browseBtn = document.createElement('button');
            browseBtn.textContent = '...';
            browseBtn.className = 'rr-btn-browse';
            browseBtn.addEventListener('click', () => this.browseVariables('actorId'));
            varRow.appendChild(browseBtn);
        }
        section.appendChild(varRow);
        return section;
    }

    browseVariables(property) {
        const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
        picker.show('variable', this[property] || 1, (selectedId) => {
            if (selectedId) { this[property] = selectedId; this.renderContent(); }
        });
    }

    buildCommand() {
        return {
            code: 314,
            indent: 0,
            parameters: [this.actorSelect, this.actorId]
        };
    }

    save() {
        if (this.callback) {
            const command = this.buildCommand();
            this.callback(command);
        }
        this.close();
    }

    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecoverAllEditor;
}
