/**
 * SetMovementRouteEditor - Two-panel editor for Set Movement Route (code 205)
 *
 * Left panel:  character dropdown, command list, action buttons, options
 * Right panel: 3-column grid of all 45 movement commands
 *
 * Supports multi-select (Ctrl+click, Shift+click), reorder (Up/Down),
 * and clipboard (Ctrl+X/C/V).
 */
class SetMovementRouteEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.characterId = -1; // -1 = Player, 0 = This Event, >0 = Event ID
        this.moveRoute = {
            repeat: true,
            skippable: false,
            wait: false,
            list: [{ code: 0 }]
        };
        this.selectedIndices = new Set();
        this.lastClickedIndex = -1;
        this.clipboard = [];
        this.commandListEl = null;
        this.inlineDialog = null;
    }

    // ----------------------------------------------------------------
    //  Lifecycle
    // ----------------------------------------------------------------

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 205) {
            const params = command.parameters;
            this.characterId = (params[0] != null) ? params[0] : -1;
            this.moveRoute = params[1]
                ? JSON.parse(JSON.stringify(params[1]))
                : { repeat: true, skippable: false, wait: false, list: [{ code: 0 }] };
        } else {
            this.characterId = -1;
            this.moveRoute = {
                repeat: true,
                skippable: false,
                wait: false,
                list: [{ code: 0 }]
            };
        }

        // Ensure list invariant: must end with code 0
        if (!this.moveRoute.list || this.moveRoute.list.length === 0) {
            this.moveRoute.list = [{ code: 0 }];
        }
        const last = this.moveRoute.list[this.moveRoute.list.length - 1];
        if (!last || last.code !== 0) {
            this.moveRoute.list.push({ code: 0 });
        }

        this.selectedIndices = new Set();
        this.lastClickedIndex = -1;

        if (!this.modal) {
            this.createModal();
        }
        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'set-movement-route-editor-modal';
        this.modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 10005;
            justify-content: center;
            align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'set-movement-route-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 950px;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        this.modal.appendChild(container);

        // Close on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        // Keyboard shortcuts (bubble from children)
        this.modal.addEventListener('keydown', (e) => {
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            const ctrl = e.ctrlKey || e.metaKey;

            if (e.key === 'Delete' && this.selectedIndices.size > 0) {
                this.deleteSelected();
                e.preventDefault();
            } else if (ctrl && e.key === 'a') {
                this.selectAll();
                e.preventDefault();
            } else if (ctrl && e.key === 'x') {
                this.cutSelected();
                e.preventDefault();
            } else if (ctrl && e.key === 'c') {
                this.copySelected();
                e.preventDefault();
            } else if (ctrl && e.key === 'v') {
                this.pasteClipboard();
                e.preventDefault();
            }
        });

        document.body.appendChild(this.modal);
    }

    // ----------------------------------------------------------------
    //  Content rendering
    // ----------------------------------------------------------------

    renderContent() {
        const container = this.modal.querySelector('.set-movement-route-container');
        container.innerHTML = '';

        // ---- Header ----
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 6px 6px 0 0;
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Set Movement Route</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">&#215;</button>
        `;
        header.querySelector('.close-btn').addEventListener('click', () => this.close());
        container.appendChild(header);

        // ---- Body (two panels) ----
        const body = document.createElement('div');
        body.style.cssText = `
            display: flex;
            flex: 1;
            overflow: hidden;
            min-height: 0;
        `;
        this.renderLeftPanel(body);
        this.renderRightPanel(body);
        container.appendChild(body);

        // ---- Footer ----
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-panel);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        `;

        const cancelBtn = this._btn('Cancel', 'var(--color-bg-button)', 'var(--color-text)', '1px solid var(--color-border-input)');
        cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; cancelBtn.style.borderColor = 'var(--color-accent)'; });
        cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.backgroundColor = 'var(--color-bg-button)'; cancelBtn.style.borderColor = 'var(--color-border-input)'; });
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = this._btn('OK', 'var(--color-accent)', 'var(--color-bg-deep)', 'none');
        okBtn.style.fontWeight = 'bold';
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);
    }

    // ----------------------------------------------------------------
    //  Left panel
    // ----------------------------------------------------------------

    renderLeftPanel(parent) {
        const panel = document.createElement('div');
        panel.style.cssText = `
            width: 320px;
            display: flex;
            flex-direction: column;
            padding: 12px;
            gap: 10px;
            border-right: 1px solid var(--color-border);
            overflow-y: auto;
        `;

        this.renderCharacterDropdown(panel);
        this.renderCommandListSection(panel);
        this.renderActionButtons(panel);
        this.renderOptions(panel);

        parent.appendChild(panel);
    }

    renderCharacterDropdown(parent) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const label = document.createElement('span');
        label.textContent = 'Character:';
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 72px;';

        const select = document.createElement('select');
        select.style.cssText = `
            flex: 1;
            padding: 5px 8px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
        `;

        select.appendChild(this._option('-1', 'Player', this.characterId === -1));
        select.appendChild(this._option('0', 'This Event', this.characterId === 0));

        const events = this._getEventOptions();
        events.forEach(ev => {
            select.appendChild(this._option(
                String(ev.id),
                `${String(ev.id).padStart(3, '0')}: ${ev.name}`,
                this.characterId === ev.id
            ));
        });

        select.addEventListener('change', (e) => {
            this.characterId = parseInt(e.target.value);
        });

        row.appendChild(label);
        row.appendChild(select);
        parent.appendChild(row);
    }

    renderCommandListSection(parent) {
        const title = document.createElement('div');
        title.textContent = 'Movement Commands:';
        title.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        parent.appendChild(title);

        this.commandListEl = document.createElement('div');
        this.commandListEl.style.cssText = `
            background-color: var(--color-bg-list-item);
            border: 1px solid var(--color-border);
            border-radius: 3px;
            min-height: 200px;
            max-height: 320px;
            overflow-y: auto;
            flex: 1;
        `;
        this.commandListEl.setAttribute('tabindex', '0');
        this.refreshCommandList();
        parent.appendChild(this.commandListEl);
    }

    refreshCommandList() {
        if (!this.commandListEl) return;
        this.commandListEl.innerHTML = '';

        const commandCount = this.moveRoute.list.length - 1; // exclude end marker

        if (commandCount === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'color: var(--color-text-dim); text-align: center; padding: 20px; font-size: 12px;';
            empty.textContent = 'No commands added yet';
            this.commandListEl.appendChild(empty);
            return;
        }

        for (let i = 0; i < commandCount; i++) {
            const cmd = this.moveRoute.list[i];
            const selected = this.selectedIndices.has(i);

            const item = document.createElement('div');
            item.style.cssText = `
                padding: 4px 8px;
                color: ${selected ? 'var(--color-text-strong)' : 'var(--color-text)'};
                background-color: ${selected ? 'var(--color-bg-selected)' : 'transparent'};
                font-size: 12px;
                cursor: pointer;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-family: monospace;
                user-select: none;
            `;
            item.textContent = this.getCommandText(cmd);

            const idx = i;
            item.addEventListener('click', (e) => {
                this._handleListClick(idx, e);
            });
            item.addEventListener('dblclick', () => {
                this.editCommand(idx);
            });

            item.addEventListener('mouseenter', () => {
                if (!this.selectedIndices.has(idx)) item.style.backgroundColor = 'var(--color-bg-list-item)';
            });
            item.addEventListener('mouseleave', () => {
                if (!this.selectedIndices.has(idx)) item.style.backgroundColor = 'transparent';
            });

            this.commandListEl.appendChild(item);
        }
    }

    _handleListClick(idx, e) {
        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;

        if (shift && this.lastClickedIndex >= 0) {
            // Range select
            const from = Math.min(this.lastClickedIndex, idx);
            const to = Math.max(this.lastClickedIndex, idx);
            if (!ctrl) this.selectedIndices.clear();
            for (let i = from; i <= to; i++) {
                this.selectedIndices.add(i);
            }
        } else if (ctrl) {
            // Toggle individual
            if (this.selectedIndices.has(idx)) {
                this.selectedIndices.delete(idx);
            } else {
                this.selectedIndices.add(idx);
            }
            this.lastClickedIndex = idx;
        } else {
            // Single select
            this.selectedIndices.clear();
            this.selectedIndices.add(idx);
            this.lastClickedIndex = idx;
        }

        this.refreshCommandList();
        // Keep focus on the list for keyboard shortcuts
        this.commandListEl.focus();
    }

    renderActionButtons(parent) {
        // Row 1: Delete, Up, Down
        const row1 = document.createElement('div');
        row1.style.cssText = 'display: flex; gap: 6px;';

        const deleteBtn = this._btn('Delete', 'var(--color-bg-panel)', 'var(--color-text)', '1px solid var(--color-border-input)');
        deleteBtn.style.flex = '1';
        deleteBtn.addEventListener('click', () => this.deleteSelected());

        const upBtn = this._btn('Up', 'var(--color-bg-panel)', 'var(--color-text)', '1px solid var(--color-border-input)');
        upBtn.style.flex = '1';
        upBtn.addEventListener('click', () => this.moveSelectedUp());

        const downBtn = this._btn('Down', 'var(--color-bg-panel)', 'var(--color-text)', '1px solid var(--color-border-input)');
        downBtn.style.flex = '1';
        downBtn.addEventListener('click', () => this.moveSelectedDown());

        row1.appendChild(deleteBtn);
        row1.appendChild(upBtn);
        row1.appendChild(downBtn);
        parent.appendChild(row1);

        // Row 2: Cut, Copy, Paste
        const row2 = document.createElement('div');
        row2.style.cssText = 'display: flex; gap: 6px;';

        const cutBtn = this._btn('Cut', 'var(--color-bg-panel)', 'var(--color-text)', '1px solid var(--color-border-input)');
        cutBtn.style.flex = '1';
        cutBtn.addEventListener('click', () => this.cutSelected());

        const copyBtn = this._btn('Copy', 'var(--color-bg-panel)', 'var(--color-text)', '1px solid var(--color-border-input)');
        copyBtn.style.flex = '1';
        copyBtn.addEventListener('click', () => this.copySelected());

        const pasteBtn = this._btn('Paste', 'var(--color-bg-panel)', 'var(--color-text)', '1px solid var(--color-border-input)');
        pasteBtn.style.flex = '1';
        pasteBtn.addEventListener('click', () => this.pasteClipboard());

        row2.appendChild(cutBtn);
        row2.appendChild(copyBtn);
        row2.appendChild(pasteBtn);
        parent.appendChild(row2);
    }

    renderOptions(parent) {
        const section = document.createElement('div');
        section.style.cssText = `
            display: flex; flex-direction: column; gap: 4px;
            padding: 8px; background-color: var(--color-bg-list-item); border-radius: 3px;
        `;

        const title = document.createElement('div');
        title.textContent = 'Options:';
        title.style.cssText = 'color: var(--color-text); font-size: 12px; font-weight: bold; margin-bottom: 2px;';
        section.appendChild(title);

        section.appendChild(this._checkbox('Repeat Movements', this.moveRoute.repeat,
            (v) => this.moveRoute.repeat = v));
        section.appendChild(this._checkbox('Skip If Cannot Move', this.moveRoute.skippable,
            (v) => this.moveRoute.skippable = v));
        section.appendChild(this._checkbox('Wait for Completion', this.moveRoute.wait,
            (v) => this.moveRoute.wait = v));

        parent.appendChild(section);
    }

    // ----------------------------------------------------------------
    //  Right panel — 3-column button grid
    // ----------------------------------------------------------------

    renderRightPanel(parent) {
        const panel = document.createElement('div');
        panel.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 12px;
            overflow-y: auto;
        `;

        const title = document.createElement('div');
        title.textContent = 'Movement Commands';
        title.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold; margin-bottom: 8px;';
        panel.appendChild(title);

        const grid = document.createElement('div');
        grid.style.cssText = 'display: flex; gap: 6px; flex: 1;';

        const defs = this._buttonDefs();
        grid.appendChild(this._renderColumn(defs.column1));
        grid.appendChild(this._renderColumn(defs.column2));
        grid.appendChild(this._renderColumn(defs.column3));

        panel.appendChild(grid);
        parent.appendChild(panel);
    }

    _renderColumn(buttons) {
        const col = document.createElement('div');
        col.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 3px;';

        buttons.forEach(btn => {
            const el = document.createElement('button');
            el.textContent = btn.label;
            el.style.cssText = `
                padding: 5px 4px;
                background-color: var(--color-bg-input);
                color: var(--color-text);
                border: 1px solid var(--color-border);
                border-radius: 3px;
                cursor: pointer;
                font-size: 11px;
                text-align: center;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                transition: background-color 0.1s;
            `;
            el.addEventListener('mouseenter', () => el.style.backgroundColor = 'var(--color-border)');
            el.addEventListener('mouseleave', () => el.style.backgroundColor = 'var(--color-bg-input)');
            el.addEventListener('click', () => this._handleGridClick(btn.code));
            col.appendChild(el);
        });

        return col;
    }

    // ----------------------------------------------------------------
    //  Command management
    // ----------------------------------------------------------------

    _handleGridClick(code) {
        if (this._needsParams(code)) {
            this._openParamDialog(code, null, (params) => {
                this._addCommand(code, params);
            });
        } else {
            this._addCommand(code);
        }
    }

    _addCommand(code, parameters) {
        const cmd = { code };
        if (parameters) cmd.parameters = parameters;

        // Insert after the highest selected index, or at end (before code 0)
        let insertAt;
        if (this.selectedIndices.size > 0) {
            insertAt = Math.max(...this.selectedIndices) + 1;
        } else {
            insertAt = this.moveRoute.list.length - 1;
        }

        this.moveRoute.list.splice(insertAt, 0, cmd);
        this.selectedIndices.clear();
        this.selectedIndices.add(insertAt);
        this.lastClickedIndex = insertAt;
        this.refreshCommandList();
    }

    /** Get sorted array of selected indices */
    _sortedSelection() {
        return [...this.selectedIndices].sort((a, b) => a - b);
    }

    selectAll() {
        const count = this.moveRoute.list.length - 1;
        this.selectedIndices.clear();
        for (let i = 0; i < count; i++) {
            this.selectedIndices.add(i);
        }
        this.refreshCommandList();
    }

    deleteSelected() {
        if (this.selectedIndices.size === 0) return;

        // Remove in descending order to preserve indices
        const sorted = this._sortedSelection().reverse();
        for (const idx of sorted) {
            if (idx < this.moveRoute.list.length - 1) { // don't remove end marker
                this.moveRoute.list.splice(idx, 1);
            }
        }

        // Select the item at the position of the first deleted, or last item
        const firstDeleted = Math.min(...sorted);
        const maxIdx = this.moveRoute.list.length - 2;
        this.selectedIndices.clear();
        if (maxIdx >= 0) {
            const newSel = Math.min(firstDeleted, maxIdx);
            this.selectedIndices.add(newSel);
            this.lastClickedIndex = newSel;
        } else {
            this.lastClickedIndex = -1;
        }
        this.refreshCommandList();
    }

    moveSelectedUp() {
        if (this.selectedIndices.size === 0) return;
        const sorted = this._sortedSelection();
        if (sorted[0] <= 0) return; // already at top

        const list = this.moveRoute.list;
        const newSelected = new Set();

        for (const i of sorted) {
            [list[i - 1], list[i]] = [list[i], list[i - 1]];
            newSelected.add(i - 1);
        }

        this.selectedIndices = newSelected;
        this.lastClickedIndex = Math.max(this.lastClickedIndex - 1, 0);
        this.refreshCommandList();
    }

    moveSelectedDown() {
        if (this.selectedIndices.size === 0) return;
        const sorted = this._sortedSelection();
        const maxIdx = this.moveRoute.list.length - 2;
        if (sorted[sorted.length - 1] >= maxIdx) return; // already at bottom

        const list = this.moveRoute.list;
        const newSelected = new Set();

        // Iterate in reverse so swaps don't interfere
        for (let j = sorted.length - 1; j >= 0; j--) {
            const i = sorted[j];
            [list[i], list[i + 1]] = [list[i + 1], list[i]];
            newSelected.add(i + 1);
        }

        this.selectedIndices = newSelected;
        this.lastClickedIndex = Math.min(this.lastClickedIndex + 1, maxIdx);
        this.refreshCommandList();
    }

    cutSelected() {
        if (this.selectedIndices.size === 0) return;
        this.copySelected();
        this.deleteSelected();
    }

    copySelected() {
        if (this.selectedIndices.size === 0) return;
        const sorted = this._sortedSelection();
        this.clipboard = sorted.map(i =>
            JSON.parse(JSON.stringify(this.moveRoute.list[i]))
        );
    }

    pasteClipboard() {
        if (this.clipboard.length === 0) return;

        // Insert after highest selected, or at end
        let insertAt;
        if (this.selectedIndices.size > 0) {
            insertAt = Math.max(...this.selectedIndices) + 1;
        } else {
            insertAt = this.moveRoute.list.length - 1;
        }

        const copies = this.clipboard.map(c => JSON.parse(JSON.stringify(c)));
        this.moveRoute.list.splice(insertAt, 0, ...copies);

        // Select the pasted commands
        this.selectedIndices.clear();
        for (let i = 0; i < copies.length; i++) {
            this.selectedIndices.add(insertAt + i);
        }
        this.lastClickedIndex = insertAt + copies.length - 1;
        this.refreshCommandList();
    }

    editCommand(index) {
        const cmd = this.moveRoute.list[index];
        if (!cmd || !this._needsParams(cmd.code)) return;

        this._openParamDialog(cmd.code, cmd.parameters, (params) => {
            this.moveRoute.list[index].parameters = params;
            this.refreshCommandList();
        });
    }

    // ----------------------------------------------------------------
    //  Parameter dialogs — router
    // ----------------------------------------------------------------

    _needsParams(code) {
        return [14, 15, 27, 28, 29, 30, 41, 42, 43, 44, 45].includes(code);
    }

    _openParamDialog(code, existing, callback) {
        switch (code) {
            case 14: return this._dlgJump(existing, callback);
            case 15: return this._dlgWait(existing, callback);
            case 27: // fall through
            case 28: return this._dlgSwitch(code, existing, callback);
            case 29: return this._dlgSpeed(existing, callback);
            case 30: return this._dlgFreq(existing, callback);
            case 41: return this._dlgImage(existing, callback);
            case 42: return this._dlgOpacity(existing, callback);
            case 43: return this._dlgBlend(existing, callback);
            case 44: return this._dlgPlaySE(existing, callback);
            case 45: return this._dlgScript(existing, callback);
        }
    }

    // ----------------------------------------------------------------
    //  Inline dialog helper
    // ----------------------------------------------------------------

    _createDialog(title, width) {
        this._closeDialog();

        const overlay = document.createElement('div');
        overlay.className = 'movement-inline-dialog-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.4); z-index: 10006;
            display: flex; justify-content: center; align-items: center;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 6px;
            width: ${width}px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            display: flex; flex-direction: column;
        `;

        // Title bar
        const titleBar = document.createElement('div');
        titleBar.style.cssText = `
            padding: 10px 14px; background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border); border-radius: 6px 6px 0 0;
        `;
        titleBar.innerHTML = `<span style="color: var(--color-text-strong); font-size: 14px;">${title}</span>`;
        dialog.appendChild(titleBar);

        // Content
        const content = document.createElement('div');
        content.style.cssText = 'padding: 14px; display: flex; flex-direction: column; gap: 10px;';
        dialog.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 10px 14px; border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-panel);
            display: flex; justify-content: flex-end; gap: 8px;
        `;
        const cancelBtn = this._btn('Cancel', 'var(--color-bg-button)', 'var(--color-text)', '1px solid var(--color-border-input)');
        cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; cancelBtn.style.borderColor = 'var(--color-accent)'; });
        cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.backgroundColor = 'var(--color-bg-button)'; cancelBtn.style.borderColor = 'var(--color-border-input)'; });
        const okBtn = this._btn('OK', 'var(--color-accent)', 'var(--color-bg-deep)', 'none');
        okBtn.style.fontWeight = 'bold';
        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        dialog.appendChild(footer);

        overlay.appendChild(dialog);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this._closeDialog();
        });
        document.body.appendChild(overlay);
        this.inlineDialog = overlay;

        return { content, okBtn, cancelBtn };
    }

    _closeDialog() {
        if (this.inlineDialog && this.inlineDialog.parentNode) {
            this.inlineDialog.parentNode.removeChild(this.inlineDialog);
        }
        this.inlineDialog = null;
    }

    // ----------------------------------------------------------------
    //  Specific parameter dialogs — inline
    // ----------------------------------------------------------------

    _dlgJump(existing, callback) {
        const { content, okBtn, cancelBtn } = this._createDialog('Jump', 300);
        const x = existing ? existing[0] : 0;
        const y = existing ? existing[1] : 0;

        content.appendChild(this._labeledInput('X Offset:', 'number', x, 'dlg-x'));
        content.appendChild(this._labeledInput('Y Offset:', 'number', y, 'dlg-y'));

        okBtn.addEventListener('click', () => {
            const xv = parseInt(content.querySelector('#dlg-x').value) || 0;
            const yv = parseInt(content.querySelector('#dlg-y').value) || 0;
            this._closeDialog();
            callback([xv, yv]);
        });
        cancelBtn.addEventListener('click', () => this._closeDialog());
    }

    _dlgWait(existing, callback) {
        const { content, okBtn, cancelBtn } = this._createDialog('Wait', 300);
        const frames = existing ? existing[0] : 60;

        content.appendChild(this._labeledInput('Frames:', 'number', frames, 'dlg-frames', { min: 1 }));

        okBtn.addEventListener('click', () => {
            const v = parseInt(content.querySelector('#dlg-frames').value) || 60;
            this._closeDialog();
            callback([v]);
        });
        cancelBtn.addEventListener('click', () => this._closeDialog());
    }

    _dlgSpeed(existing, callback) {
        const { content, okBtn, cancelBtn } = this._createDialog('Change Speed', 300);
        const speed = existing ? existing[0] : 4;

        const options = [
            { value: 1, text: '1: x8 Slower' },
            { value: 2, text: '2: x4 Slower' },
            { value: 3, text: '3: x2 Slower' },
            { value: 4, text: '4: Normal' },
            { value: 5, text: '5: x2 Faster' },
            { value: 6, text: '6: x4 Faster' },
        ];
        content.appendChild(this._labeledSelect('Speed:', options, speed, 'dlg-speed'));

        okBtn.addEventListener('click', () => {
            this._closeDialog();
            callback([parseInt(content.querySelector('#dlg-speed').value)]);
        });
        cancelBtn.addEventListener('click', () => this._closeDialog());
    }

    _dlgFreq(existing, callback) {
        const { content, okBtn, cancelBtn } = this._createDialog('Change Frequency', 300);
        const freq = existing ? existing[0] : 3;

        const options = [
            { value: 1, text: '1: Lowest' },
            { value: 2, text: '2: Lower' },
            { value: 3, text: '3: Normal' },
            { value: 4, text: '4: Higher' },
            { value: 5, text: '5: Highest' },
        ];
        content.appendChild(this._labeledSelect('Frequency:', options, freq, 'dlg-freq'));

        okBtn.addEventListener('click', () => {
            this._closeDialog();
            callback([parseInt(content.querySelector('#dlg-freq').value)]);
        });
        cancelBtn.addEventListener('click', () => this._closeDialog());
    }

    _dlgOpacity(existing, callback) {
        const { content, okBtn, cancelBtn } = this._createDialog('Change Opacity', 300);
        const opacity = existing ? existing[0] : 255;

        content.appendChild(this._labeledInput('Opacity:', 'number', opacity, 'dlg-opacity',
            { min: 0, max: 255 }));

        const hint = document.createElement('div');
        hint.style.cssText = 'color: var(--color-text-muted); font-size: 11px;';
        hint.textContent = 'Range: 0 (transparent) to 255 (opaque)';
        content.appendChild(hint);

        okBtn.addEventListener('click', () => {
            let v = parseInt(content.querySelector('#dlg-opacity').value);
            v = Math.max(0, Math.min(255, v || 0));
            this._closeDialog();
            callback([v]);
        });
        cancelBtn.addEventListener('click', () => this._closeDialog());
    }

    _dlgBlend(existing, callback) {
        const { content, okBtn, cancelBtn } = this._createDialog('Change Blend Mode', 300);
        const mode = existing ? existing[0] : 0;

        const options = [
            { value: 0, text: 'Normal' },
            { value: 1, text: 'Additive' },
            { value: 2, text: 'Multiply' },
            { value: 3, text: 'Screen' },
        ];
        content.appendChild(this._labeledSelect('Blend Mode:', options, mode, 'dlg-blend'));

        okBtn.addEventListener('click', () => {
            this._closeDialog();
            callback([parseInt(content.querySelector('#dlg-blend').value)]);
        });
        cancelBtn.addEventListener('click', () => this._closeDialog());
    }

    _dlgScript(existing, callback) {
        const { content, okBtn, cancelBtn } = this._createDialog('Script', 450);
        const code = existing ? existing[0] : '';

        const label = document.createElement('span');
        label.textContent = 'Script:';
        label.style.cssText = 'color: var(--color-text); font-size: 12px;';
        content.appendChild(label);

        const textarea = document.createElement('textarea');
        textarea.id = 'dlg-script';
        textarea.value = code;
        textarea.style.cssText = `
            width: 100%; min-height: 120px; padding: 8px;
            background: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input);
            border-radius: 3px; font-size: 12px; font-family: monospace;
            resize: vertical; box-sizing: border-box;
        `;
        content.appendChild(textarea);

        okBtn.addEventListener('click', () => {
            this._closeDialog();
            callback([textarea.value]);
        });
        cancelBtn.addEventListener('click', () => this._closeDialog());
    }

    // ----------------------------------------------------------------
    //  Specific parameter dialogs — external pickers
    // ----------------------------------------------------------------

    _dlgSwitch(code, existing, callback) {
        const currentId = existing ? existing[0] : 1;
        const picker = new SwitchVariablePicker(this.databaseManager, this.projectController);
        picker.show('switch', currentId, (id) => {
            callback([id]);
        });
        // Raise above our modal (10005) and any inline dialog (10006)
        if (picker.modal) {
            picker.modal.style.zIndex = '10007';
        }
    }

    _dlgImage(existing, callback) {
        const name = existing ? existing[0] : '';
        const index = existing ? existing[1] : 0;
        const picker = new CharacterGraphicPicker(this.projectController);
        picker.show(name, index, 0, 2, (result) => {
            callback([result.characterName, result.characterIndex]);
        });
    }

    _dlgPlaySE(existing, callback) {
        const { content, okBtn, cancelBtn } = this._createDialog('Play SE', 400);
        const se = (existing && existing[0])
            ? existing[0]
            : { name: '', volume: 90, pitch: 100, pan: 0 };

        // Load SE file list from project
        let seFiles = [];
        try {
            const fs = require('fs');
            const pathMod = require('path');
            const project = this.projectController.getCurrentProject
                ? this.projectController.getCurrentProject()
                : this.projectController.currentProject;
            if (project && project.path) {
                const sePath = pathMod.join(project.path, 'audio', 'se');
                if (fs.existsSync(sePath)) {
                    seFiles = fs.readdirSync(sePath)
                        .filter(f => /\.(ogg|m4a|wav|mp3)$/i.test(f))
                        .map(f => f.replace(/\.(ogg|m4a|wav|mp3)$/i, ''))
                        .sort();
                }
            }
        } catch (e) { /* no project or folder */ }

        // File dropdown
        const fileOptions = [{ value: '', text: '(None)' }]
            .concat(seFiles.map(f => ({ value: f, text: f })));
        content.appendChild(this._labeledSelect('File:', fileOptions, se.name, 'dlg-se-file'));

        // Volume slider
        content.appendChild(this._labeledRange('Volume:', 0, 100, se.volume, 'dlg-se-vol'));

        // Pitch slider
        content.appendChild(this._labeledRange('Pitch:', 50, 150, se.pitch, 'dlg-se-pitch'));

        // Pan slider
        content.appendChild(this._labeledRange('Pan:', -100, 100, se.pan, 'dlg-se-pan'));

        okBtn.addEventListener('click', () => {
            const result = {
                name: content.querySelector('#dlg-se-file').value,
                volume: parseInt(content.querySelector('#dlg-se-vol').value),
                pitch: parseInt(content.querySelector('#dlg-se-pitch').value),
                pan: parseInt(content.querySelector('#dlg-se-pan').value),
            };
            this._closeDialog();
            callback([result]);
        });
        cancelBtn.addEventListener('click', () => this._closeDialog());
    }

    // ----------------------------------------------------------------
    //  Command display text
    // ----------------------------------------------------------------

    getCommandText(cmd) {
        const NAMES = {
            1: 'Move Down', 2: 'Move Left', 3: 'Move Right', 4: 'Move Up',
            5: 'Move Lower Left', 6: 'Move Lower Right',
            7: 'Move Upper Left', 8: 'Move Upper Right',
            9: 'Move at Random', 10: 'Move toward Player',
            11: 'Move away from Player', 12: '1 Step Forward', 13: '1 Step Backward',
            14: 'Jump', 15: 'Wait',
            16: 'Turn Down', 17: 'Turn Left', 18: 'Turn Right', 19: 'Turn Up',
            20: 'Turn 90\u00B0 Right', 21: 'Turn 90\u00B0 Left', 22: 'Turn 180\u00B0',
            23: 'Turn 90\u00B0 Right or Left', 24: 'Turn at Random',
            25: 'Turn toward Player', 26: 'Turn away from Player',
            27: 'Switch ON', 28: 'Switch OFF',
            29: 'Change Speed', 30: 'Change Frequency',
            31: 'Walking Anim ON', 32: 'Walking Anim OFF',
            33: 'Stepping Anim ON', 34: 'Stepping Anim OFF',
            35: 'Direction Fix ON', 36: 'Direction Fix OFF',
            37: 'Through ON', 38: 'Through OFF',
            39: 'Transparent ON', 40: 'Transparent OFF',
            41: 'Change Image', 42: 'Change Opacity',
            43: 'Change Blend Mode', 44: 'Play SE', 45: 'Script',
        };

        const name = NAMES[cmd.code] || `Unknown (${cmd.code})`;
        const p = cmd.parameters;
        if (!p) return name;

        switch (cmd.code) {
            case 14: return `${name}: ${p[0]}, ${p[1]}`;
            case 15: return `${name}: ${p[0]} frames`;
            case 27:
            case 28: {
                const sn = this._switchName(p[0]);
                return sn ? `${name}: [${p[0]}] ${sn}` : `${name}: [${p[0]}]`;
            }
            case 29: {
                const s = { 1: 'x8 Slower', 2: 'x4 Slower', 3: 'x2 Slower',
                             4: 'Normal', 5: 'x2 Faster', 6: 'x4 Faster' };
                return `${name}: ${s[p[0]] || p[0]}`;
            }
            case 30: {
                const f = { 1: 'Lowest', 2: 'Lower', 3: 'Normal', 4: 'Higher', 5: 'Highest' };
                return `${name}: ${f[p[0]] || p[0]}`;
            }
            case 41: return `${name}: ${p[0] || '(none)'} [${p[1]}]`;
            case 42: return `${name}: ${p[0]}`;
            case 43: {
                const b = { 0: 'Normal', 1: 'Additive', 2: 'Multiply', 3: 'Screen' };
                return `${name}: ${b[p[0]] || p[0]}`;
            }
            case 44: {
                const se = p[0];
                return (se && se.name) ? `${name}: ${se.name}` : `${name}: (none)`;
            }
            case 45: {
                const src = String(p[0] || '');
                return `${name}: ${src.length > 30 ? src.substring(0, 30) + '...' : src}`;
            }
            default: return name;
        }
    }

    // ----------------------------------------------------------------
    //  Button definitions (3 columns × 15 rows)
    // ----------------------------------------------------------------

    _buttonDefs() {
        return {
            column1: [
                { code: 1,  label: 'Move Down' },
                { code: 2,  label: 'Move Left' },
                { code: 3,  label: 'Move Right' },
                { code: 4,  label: 'Move Up' },
                { code: 5,  label: 'Move Lower L' },
                { code: 6,  label: 'Move Lower R' },
                { code: 7,  label: 'Move Upper L' },
                { code: 8,  label: 'Move Upper R' },
                { code: 9,  label: 'Move Random' },
                { code: 10, label: 'Move toward' },
                { code: 11, label: 'Move away' },
                { code: 12, label: '1 Step Forward' },
                { code: 13, label: '1 Step Back' },
                { code: 14, label: 'Jump...' },
                { code: 15, label: 'Wait...' },
            ],
            column2: [
                { code: 16, label: 'Turn Down' },
                { code: 17, label: 'Turn Left' },
                { code: 18, label: 'Turn Right' },
                { code: 19, label: 'Turn Up' },
                { code: 20, label: 'Turn 90\u00B0 R' },
                { code: 21, label: 'Turn 90\u00B0 L' },
                { code: 22, label: 'Turn 180\u00B0' },
                { code: 23, label: 'Turn 90\u00B0 R/L' },
                { code: 24, label: 'Turn Random' },
                { code: 25, label: 'Turn toward' },
                { code: 26, label: 'Turn away' },
                { code: 27, label: 'Switch ON...' },
                { code: 28, label: 'Switch OFF...' },
                { code: 29, label: 'Change Speed...' },
                { code: 30, label: 'Change Freq...' },
            ],
            column3: [
                { code: 31, label: 'Walk Anim ON' },
                { code: 32, label: 'Walk Anim OFF' },
                { code: 33, label: 'Step Anim ON' },
                { code: 34, label: 'Step Anim OFF' },
                { code: 35, label: 'Dir Fix ON' },
                { code: 36, label: 'Dir Fix OFF' },
                { code: 37, label: 'Through ON' },
                { code: 38, label: 'Through OFF' },
                { code: 39, label: 'Transparent ON' },
                { code: 40, label: 'Transparent OFF' },
                { code: 41, label: 'Change Image...' },
                { code: 42, label: 'Change Opacity...' },
                { code: 43, label: 'Change Blend...' },
                { code: 44, label: 'Play SE...' },
                { code: 45, label: 'Script...' },
            ],
        };
    }

    // ----------------------------------------------------------------
    //  Helpers
    // ----------------------------------------------------------------

    _getEventOptions() {
        try {
            const events = this.projectController.eventManager.currentMap.events;
            if (events && Array.isArray(events)) {
                return events
                    .filter(e => e && e.id)
                    .map(e => ({
                        id: e.id,
                        name: e.name || `Event ${String(e.id).padStart(3, '0')}`,
                    }));
            }
        } catch (e) { /* no map data */ }
        // Fallback
        const opts = [];
        for (let i = 1; i <= 20; i++) {
            opts.push({ id: i, name: `Event ${String(i).padStart(3, '0')}` });
        }
        return opts;
    }

    _switchName(id) {
        try {
            const sys = this.databaseManager.getSystem();
            if (sys && sys.switches && sys.switches[id]) {
                const n = sys.switches[id].trim();
                if (n) return n;
            }
        } catch (e) { /* */ }
        return '';
    }

    /** Create a styled button */
    _btn(text, bg, fg, border) {
        const b = document.createElement('button');
        b.textContent = text;
        b.style.cssText = `
            padding: 6px 16px;
            background-color: ${bg};
            color: ${fg};
            border: ${border};
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        `;
        return b;
    }

    /** Create an <option> element */
    _option(value, text, selected) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = text;
        if (selected) o.selected = true;
        return o;
    }

    /** Create a labeled checkbox row */
    _checkbox(label, checked, onChange) {
        const row = document.createElement('label');
        row.style.cssText = 'display: flex; align-items: center; gap: 6px; color: var(--color-text); font-size: 12px; cursor: pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        cb.addEventListener('change', () => onChange(cb.checked));
        row.appendChild(cb);
        row.appendChild(document.createTextNode(label));
        return row;
    }

    /** Create a labeled input row for dialogs */
    _labeledInput(label, type, value, id, attrs) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const lbl = document.createElement('span');
        lbl.textContent = label;
        lbl.style.cssText = 'color: var(--color-text); font-size: 12px; min-width: 70px;';

        const input = document.createElement('input');
        input.type = type;
        input.value = value;
        input.id = id;
        input.style.cssText = `
            flex: 1; padding: 5px; background: var(--color-bg-input); color: var(--color-text);
            border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px;
        `;
        if (attrs) {
            Object.entries(attrs).forEach(([k, v]) => input.setAttribute(k, v));
        }

        row.appendChild(lbl);
        row.appendChild(input);
        return row;
    }

    /** Create a labeled <select> row for dialogs */
    _labeledSelect(label, options, selectedValue, id) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const lbl = document.createElement('span');
        lbl.textContent = label;
        lbl.style.cssText = 'color: var(--color-text); font-size: 12px; min-width: 70px;';

        const sel = document.createElement('select');
        sel.id = id;
        sel.style.cssText = `
            flex: 1; padding: 5px; background: var(--color-bg-input); color: var(--color-text);
            border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px;
        `;
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = (opt.value != null) ? opt.value : opt.text;
            o.textContent = opt.text;
            if (String(opt.value) === String(selectedValue)) o.selected = true;
            sel.appendChild(o);
        });

        row.appendChild(lbl);
        row.appendChild(sel);
        return row;
    }

    /** Create a labeled range slider row for dialogs */
    _labeledRange(label, min, max, value, id) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const lbl = document.createElement('span');
        lbl.textContent = label;
        lbl.style.cssText = 'color: var(--color-text); font-size: 12px; min-width: 70px;';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.value = value;
        slider.id = id;
        slider.style.cssText = 'flex: 1;';

        const display = document.createElement('span');
        display.style.cssText = 'color: var(--color-text); font-size: 12px; min-width: 36px; text-align: right;';
        display.textContent = value;
        slider.addEventListener('input', () => display.textContent = slider.value);

        row.appendChild(lbl);
        row.appendChild(slider);
        row.appendChild(display);
        return row;
    }

    // ----------------------------------------------------------------
    //  Save / Close
    // ----------------------------------------------------------------

    buildCommand() {
        return {
            code: 205,
            indent: 0,
            parameters: [this.characterId, this.moveRoute],
        };
    }

    save() {
        if (this.callback) {
            this.callback(this.buildCommand());
        }
        this.close();
    }

    close() {
        this._closeDialog();
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SetMovementRouteEditor;
}
