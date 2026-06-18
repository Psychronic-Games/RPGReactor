/**
 * DatabaseStateEditor - Editor for managing state database entries
 * Handles display and editing of state properties including duration, restrictions, traits, and messages
 */

class DatabaseStateEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this.traitEditor = new DatabaseTraitEditor(databaseManager, commonUI);
        this.traitsClipboard = null;
    }

    showStateDetail(container, state) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.height = '100%';
        wrapper.style.padding = '16px';
        wrapper.style.overflowY = 'auto';

        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const restrictionNames = ['None', 'Attack Enemy', 'Attack Anyone', 'Attack Ally', 'Cannot Move'].map(tt);
        const removalNames = ['None', 'End of Action', 'End of Turn'].map(tt);

        // General Settings with icon
        const generalWrapper = document.createElement('div');
        generalWrapper.style.marginBottom = '16px';

        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content" style="display: flex; gap: 16px;">
                <div style="display: flex; flex-direction: column; align-items: center; min-width: 60px;">
                    <label class="database-field-label" style="margin-bottom: 4px;">Icon:</label>
                    <div id="state-icon-container-${state.id}" style="cursor: pointer;" title="Click to change icon"></div>
                </div>
                <div style="flex: 1;">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="database-field-label">Name:</label>
                            <input type="text" class="database-field-value" value="${this.escapeHTML(state.name || '')}" data-field="name" data-state-id="${state.id}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group-fixed">
                            <label class="database-field-label">Priority:</label>
                            <input type="number" class="database-field-value database-field-value-small" value="${state.priority != null ? state.priority : 50}" min="0" max="100" data-field="priority" data-state-id="${state.id}">
                        </div>
                        <div class="form-group-fixed">
                            <label class="database-field-label">Restriction:</label>
                            <select class="database-field-value" style="width: 150px;" data-field="restriction" data-state-id="${state.id}">
                                ${restrictionNames.map((name, idx) => `<option value="${idx}" ${state.restriction === idx ? 'selected' : ''}>${name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;
        generalWrapper.appendChild(generalSection);
        wrapper.appendChild(generalWrapper);

        // Add icon to the designated container after DOM ready
        setTimeout(() => {
            const iconContainer = document.getElementById(`state-icon-container-${state.id}`);
            if (iconContainer) {
                this.parentEditor.addDatabasePreview(iconContainer, state, 'skills');
                iconContainer.onclick = () => {
                    this.parentEditor.selectIcon(state, 'states');
                };
            }
        }, 0);

        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';

        // Duration Settings
        const durationSection = document.createElement('div');
        durationSection.className = 'database-section';
        const showTurns = (state.autoRemovalTiming || 0) > 0;
        durationSection.innerHTML = `
            <div class="database-section-header">Duration</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Auto-Remove:</label>
                        <select class="database-field-value" style="width: 130px;" data-field="autoRemovalTiming" data-state-id="${state.id}" id="state-auto-remove-${state.id}">
                            ${removalNames.map((name, idx) => `<option value="${idx}" ${state.autoRemovalTiming === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div id="state-turns-row-${state.id}" style="${showTurns ? '' : 'display: none;'}">
                    <div class="form-row">
                        <div class="form-group-fixed">
                            <label class="database-field-label">Min Turns:</label>
                            <input type="number" class="database-field-value database-field-value-small" value="${state.minTurns || 1}" min="1" data-field="minTurns" data-state-id="${state.id}">
                        </div>
                        <div class="form-group-fixed">
                            <label class="database-field-label">Max Turns:</label>
                            <input type="number" class="database-field-value database-field-value-small" value="${state.maxTurns || 1}" min="1" data-field="maxTurns" data-state-id="${state.id}">
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label" style="width: auto;">Remove by Damage:</label>
                        <input type="checkbox" class="system-checkbox" ${state.removeByDamage ? 'checked' : ''} data-field="removeByDamage" data-state-id="${state.id}" id="state-rbd-${state.id}">
                    </div>
                </div>
                <div id="state-chance-row-${state.id}" style="${state.removeByDamage ? '' : 'display: none;'}">
                    <div class="form-row" style="margin-left: 20px;">
                        <div class="form-group-fixed">
                            <label class="database-field-label">Chance by Damage:</label>
                            <input type="number" class="database-field-value database-field-value-small" value="${state.chanceByDamage != null ? state.chanceByDamage : 100}" min="0" max="100" data-field="chanceByDamage" data-state-id="${state.id}">
                            <span style="color: var(--color-text-muted); margin-left: 4px;">%</span>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label" style="width: auto;">Remove at Battle End:</label>
                        <input type="checkbox" class="system-checkbox" ${state.removeAtBattleEnd ? 'checked' : ''} data-field="removeAtBattleEnd" data-state-id="${state.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label" style="width: auto;">Remove by Walking:</label>
                        <input type="checkbox" class="system-checkbox" ${state.removeByWalking ? 'checked' : ''} data-field="removeByWalking" data-state-id="${state.id}" id="state-rbw-${state.id}">
                    </div>
                </div>
                <div id="state-steps-row-${state.id}" style="${state.removeByWalking ? '' : 'display: none;'}">
                    <div class="form-row" style="margin-left: 20px;">
                        <div class="form-group-fixed">
                            <label class="database-field-label">Steps to Remove:</label>
                            <input type="number" class="database-field-value database-field-value-small" value="${state.stepsToRemove || 100}" min="0" data-field="stepsToRemove" data-state-id="${state.id}">
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label" style="width: auto;">Remove by Restriction:</label>
                        <input type="checkbox" class="system-checkbox" ${state.removeByRestriction ? 'checked' : ''} data-field="removeByRestriction" data-state-id="${state.id}">
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(durationSection);

        // Messages Section
        const messagesSection = document.createElement('div');
        messagesSection.className = 'database-section';
        messagesSection.innerHTML = `
            <div class="database-section-header">Messages</div>
            <div class="database-section-content">
                <div class="form-row" style="margin-bottom: 8px;">
                    <label class="database-field-label" style="min-width: 140px;">Actor Afflicted:</label>
                    <input type="text" class="database-field-value" style="flex: 1;" value="${this.escapeHTML(state.message1 || '')}" data-field="message1" data-state-id="${state.id}">
                </div>
                <div class="form-row" style="margin-bottom: 8px;">
                    <label class="database-field-label" style="min-width: 140px;">Enemy Afflicted:</label>
                    <input type="text" class="database-field-value" style="flex: 1;" value="${this.escapeHTML(state.message2 || '')}" data-field="message2" data-state-id="${state.id}">
                </div>
                <div class="form-row" style="margin-bottom: 8px;">
                    <label class="database-field-label" style="min-width: 140px;">State Persists:</label>
                    <input type="text" class="database-field-value" style="flex: 1;" value="${this.escapeHTML(state.message3 || '')}" data-field="message3" data-state-id="${state.id}">
                </div>
                <div class="form-row">
                    <label class="database-field-label" style="min-width: 140px;">State Removed:</label>
                    <input type="text" class="database-field-value" style="flex: 1;" value="${this.escapeHTML(state.message4 || '')}" data-field="message4" data-state-id="${state.id}">
                </div>
            </div>
        `;
        gridWrapper.appendChild(messagesSection);

        // Traits Section
        const traitsSection = document.createElement('div');
        traitsSection.className = 'database-section';
        traitsSection.style.gridColumn = '1 / -1';
        traitsSection.setAttribute('tabindex', '0');
        traitsSection.style.outline = 'none';
        traitsSection.innerHTML = `
            <div class="database-section-header">Traits</div>
            <div class="database-section-content">
                ${this.buildTraitsTable(state)}
            </div>
        `;
        gridWrapper.appendChild(traitsSection);

        // Note Section
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.style.gridColumn = '1 / -1';
        noteSection.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-state-id="${state.id}">${state.note || ''}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners
        setTimeout(() => {
            this.attachFieldListeners(container, state);
            this.attachTraitListeners(container, state);
        }, 0);
    }

    // ==========================================
    // TRAIT TABLE BUILDER
    // ==========================================

    buildTraitsTable(state) {
        return `
            <table class="traits-table" id="state-traits-table-${state.id}">
                <thead>
                    <tr>
                        <th style="width: 4px; padding: 0;"></th>
                        <th>Type</th>
                        <th>Content</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.traits && state.traits.length > 0 ?
                        state.traits.map((trait, idx) => `
                            <tr class="trait-row" data-trait-index="${idx}" style="cursor: pointer;">
                                <td class="trait-indicator" style="width: 4px; padding: 0; background-color: transparent; transition: background-color 0.1s;"></td>
                                <td>${this.commonUI.getTraitName(trait.code)}</td>
                                <td>${this.commonUI.getTraitValue(trait)}</td>
                            </tr>
                        `).join('') :
                        '<tr><td style="width: 3px; padding: 0; border: none; background: transparent;"></td><td colspan="2" style="text-align: center; color: var(--color-text-muted); font-style: italic; padding: 12px;">No traits (right-click to add)</td></tr>'}
                </tbody>
            </table>
            <div class="trait-action-buttons" style="display: flex; gap: 6px; margin-top: 8px;">
                <button class="trait-btn-add" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-strong); border-radius: 4px; cursor: pointer; font-size: 12px;">Add</button>
                <button class="trait-btn-edit" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>Edit</button>
                <button class="trait-btn-copy" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>Copy</button>
                <button class="trait-btn-paste" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>Paste</button>
                <button class="trait-btn-delete" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>Delete</button>
            </div>
        `;
    }

    // ==========================================
    // FIELD LISTENERS
    // ==========================================

    attachFieldListeners(container, state) {
        // Text, number, and textarea inputs
        const editableFields = container.querySelectorAll('[data-state-id]');
        editableFields.forEach(field => {
            const eventType = (field.tagName === 'SELECT' || field.type === 'checkbox') ? 'change' : 'change';
            field.addEventListener(eventType, (e) => {
                const fieldName = e.target.dataset.field;
                const stateId = parseInt(e.target.dataset.stateId);
                if (!fieldName) return;

                let value;
                if (e.target.type === 'checkbox') {
                    value = e.target.checked;
                } else if (e.target.type === 'number') {
                    value = parseInt(e.target.value) || 0;
                } else if (e.target.tagName === 'SELECT') {
                    value = parseInt(e.target.value);
                } else {
                    value = e.target.value;
                }

                this.updateStateField(stateId, fieldName, value);

                // Toggle conditional visibility
                if (fieldName === 'autoRemovalTiming') {
                    const turnsRow = document.getElementById(`state-turns-row-${stateId}`);
                    if (turnsRow) turnsRow.style.display = value > 0 ? '' : 'none';
                }
                if (fieldName === 'removeByDamage') {
                    const chanceRow = document.getElementById(`state-chance-row-${stateId}`);
                    if (chanceRow) chanceRow.style.display = value ? '' : 'none';
                }
                if (fieldName === 'removeByWalking') {
                    const stepsRow = document.getElementById(`state-steps-row-${stateId}`);
                    if (stepsRow) stepsRow.style.display = value ? '' : 'none';
                }
            });
        });
    }

    // ==========================================
    // TRAIT INTERACTION & CRUD
    // ==========================================

    attachTraitListeners(container, state) {
        const table = container.querySelector(`#state-traits-table-${state.id}`);
        if (!table) return;

        const section = table.closest('.database-section');
        this.setupTraitInteraction(table, state);
        this.setupTraitsContextMenu(table, state);
        if (section) {
            this.setupTraitActionButtons(section, table, state);
            this.setupTraitKeyboardShortcuts(section, table, state);
        }
    }

    setupTraitInteraction(table, state) {
        const rows = table.querySelectorAll('.trait-row');

        rows.forEach(row => {
            const indicator = row.querySelector('.trait-indicator');
            const contentCells = Array.from(row.querySelectorAll('td:not(.trait-indicator)'));

            row.addEventListener('mouseenter', () => {
                if (indicator) indicator.style.setProperty('background-color', 'var(--color-accent-bright)', 'important');
                contentCells.forEach(cell => cell.style.setProperty('background-color', 'var(--color-bg-panel)', 'important'));
            });

            row.addEventListener('mouseleave', () => {
                if (indicator && !row.classList.contains('selected')) {
                    indicator.style.setProperty('background-color', 'transparent', 'important');
                }
                if (!row.classList.contains('selected')) {
                    contentCells.forEach(cell => cell.style.setProperty('background-color', '', 'important'));
                }
            });

            row.addEventListener('click', () => {
                rows.forEach(r => {
                    r.classList.remove('selected');
                    const ind = r.querySelector('.trait-indicator');
                    if (ind) ind.style.setProperty('background-color', 'transparent', 'important');
                    Array.from(r.querySelectorAll('td:not(.trait-indicator)')).forEach(cell =>
                        cell.style.setProperty('background-color', '', 'important'));
                });
                row.classList.add('selected');
                if (indicator) indicator.style.setProperty('background-color', 'var(--color-accent-bright)', 'important');
                contentCells.forEach(cell => cell.style.setProperty('background-color', 'var(--color-bg-panel)', 'important'));

                const section = table.closest('.database-section');
                if (section) section.focus();
                this.updateTraitButtonStates(section);
            });

            // Double-click to edit
            row.addEventListener('dblclick', () => {
                const traitIndex = parseInt(row.dataset.traitIndex);
                this.editTrait(state, traitIndex);
            });
        });
    }

    setupTraitActionButtons(section, table, entry) {
        const btnAdd = section.querySelector('.trait-btn-add');
        const btnEdit = section.querySelector('.trait-btn-edit');
        const btnCopy = section.querySelector('.trait-btn-copy');
        const btnPaste = section.querySelector('.trait-btn-paste');
        const btnDelete = section.querySelector('.trait-btn-delete');

        [btnAdd, btnEdit, btnCopy, btnPaste, btnDelete].forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                if (!btn.disabled) btn.style.background = 'var(--color-accent-tint-25)';
            });
            btn.addEventListener('mouseleave', () => {
                if (!btn.disabled) btn.style.background = 'var(--color-border-subtle)';
            });
        });

        btnAdd.addEventListener('click', () => this.addTrait(entry));
        btnEdit.addEventListener('click', () => {
            const idx = this.getSelectedTraitIndex(table);
            if (idx !== null) this.editTrait(entry, idx);
        });
        btnCopy.addEventListener('click', () => {
            const idx = this.getSelectedTraitIndex(table);
            if (idx !== null) {
                this.copyTrait(entry, idx);
                this.updateTraitButtonStates(section);
            }
        });
        btnPaste.addEventListener('click', () => {
            this.pasteTrait(entry);
        });
        btnDelete.addEventListener('click', () => {
            const idx = this.getSelectedTraitIndex(table);
            if (idx !== null) this.deleteTrait(entry, idx);
        });
    }

    getSelectedTraitIndex(table) {
        const selected = table.querySelector('.trait-row.selected');
        return selected ? parseInt(selected.dataset.traitIndex) : null;
    }

    updateTraitButtonStates(section) {
        if (!section) return;
        const table = section.querySelector('.traits-table');
        const hasSelection = table && table.querySelector('.trait-row.selected');
        const hasClipboard = !!this.traitsClipboard;

        const setBtn = (btn, enabled) => {
            if (!btn) return;
            btn.disabled = !enabled;
            btn.style.color = enabled ? 'var(--color-text-strong)' : 'var(--color-text-dim)';
            btn.style.cursor = enabled ? 'pointer' : 'default';
        };

        setBtn(section.querySelector('.trait-btn-edit'), hasSelection);
        setBtn(section.querySelector('.trait-btn-copy'), hasSelection);
        setBtn(section.querySelector('.trait-btn-paste'), hasClipboard);
        setBtn(section.querySelector('.trait-btn-delete'), hasSelection);
    }

    setupTraitKeyboardShortcuts(section, table, entry) {
        section.addEventListener('keydown', (e) => {
            const idx = this.getSelectedTraitIndex(table);

            if (e.key === 'Delete' && idx !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.deleteTrait(entry, idx);
                return;
            }

            if (e.key === 'Enter' && idx !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.editTrait(entry, idx);
                return;
            }

            if (!e.ctrlKey && !e.metaKey) return;

            if (e.key === 'c' && idx !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.copyTrait(entry, idx);
                this.updateTraitButtonStates(section);
            } else if (e.key === 'x' && idx !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.cutTrait(entry, idx);
            } else if (e.key === 'v' && this.traitsClipboard) {
                e.preventDefault();
                e.stopPropagation();
                this.pasteTrait(entry);
            }
        });
    }

    setupTraitsContextMenu(table, state) {
        table.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            const row = e.target.closest('.trait-row');
            const traitIndex = row ? parseInt(row.dataset.traitIndex) : null;

            const existingMenu = document.getElementById('traits-context-menu');
            if (existingMenu) existingMenu.remove();

            const menu = document.createElement('div');
            menu.id = 'traits-context-menu';
            menu.style.cssText = `
                position: fixed;
                left: ${e.clientX}px;
                top: ${e.clientY}px;
                background: var(--color-bg-menubar);
                border: 1px solid var(--color-border);
                border-radius: 4px;
                padding: 4px 0;
                z-index: 10000;
                min-width: 150px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
            `;

            const menuItems = [
                { label: 'Add', action: () => this.addTrait(state), enabled: true },
                { label: 'Edit', action: () => this.editTrait(state, traitIndex), enabled: traitIndex !== null },
                { label: 'Cut', action: () => this.cutTrait(state, traitIndex), enabled: traitIndex !== null },
                { label: 'Copy', action: () => this.copyTrait(state, traitIndex), enabled: traitIndex !== null },
                { label: 'Paste', action: () => this.pasteTrait(state), enabled: this.traitsClipboard !== null },
                { label: 'Delete', action: () => this.deleteTrait(state, traitIndex), enabled: traitIndex !== null },
            ];

            menuItems.forEach(item => {
                const menuItem = document.createElement('div');
                menuItem.textContent = item.label;
                menuItem.style.cssText = `
                    padding: 8px 16px;
                    cursor: ${item.enabled ? 'pointer' : 'not-allowed'};
                    color: ${item.enabled ? 'var(--color-text-strong)' : 'var(--color-text-dim)'};
                    transition: background 0.1s;
                `;

                if (item.enabled) {
                    menuItem.addEventListener('mouseenter', () => { menuItem.style.background = 'var(--color-border)'; });
                    menuItem.addEventListener('mouseleave', () => { menuItem.style.background = 'transparent'; });
                    menuItem.addEventListener('click', () => { item.action(); menu.remove(); });
                }

                menu.appendChild(menuItem);
            });

            document.body.appendChild(menu);

            const closeMenu = () => {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            };
            setTimeout(() => document.addEventListener('click', closeMenu), 0);
        });
    }

    addTrait(state) {
        if (!state.traits) state.traits = [];

        this.traitEditor.showTraitEditorModal(state, -1, (updatedEntry) => {
            this.databaseManager.updateState(updatedEntry.id, updatedEntry);
            this.refreshStateDetail(updatedEntry);
        });
    }

    editTrait(state, traitIndex) {
        if (traitIndex === null) return;

        this.traitEditor.showTraitEditorModal(state, traitIndex, (updatedEntry) => {
            this.databaseManager.updateState(updatedEntry.id, updatedEntry);
            this.refreshStateDetail(updatedEntry);
        });
    }

    cutTrait(state, traitIndex) {
        if (traitIndex === null || !state.traits) return;
        this.traitsClipboard = { ...state.traits[traitIndex] };
        state.traits.splice(traitIndex, 1);
        this.databaseManager.updateState(state.id, state);
        this.refreshStateDetail(state);
    }

    copyTrait(state, traitIndex) {
        if (traitIndex === null || !state.traits) return;
        this.traitsClipboard = { ...state.traits[traitIndex] };
    }

    pasteTrait(state) {
        if (!this.traitsClipboard) return;
        if (!state.traits) state.traits = [];
        state.traits.push({ ...this.traitsClipboard });
        this.databaseManager.updateState(state.id, state);
        this.refreshStateDetail(state);
    }

    deleteTrait(state, traitIndex) {
        if (traitIndex === null || !state.traits) return;
        state.traits.splice(traitIndex, 1);
        this.databaseManager.updateState(state.id, state);
        this.refreshStateDetail(state);
    }

    // ==========================================
    // FIELD UPDATE
    // ==========================================

    updateStateField(stateId, fieldName, value) {
        const state = this.databaseManager.getState(stateId);
        if (!state) return;

        state[fieldName] = value;
        this.databaseManager.updateState(stateId, state);
    }

    // ==========================================
    // REFRESH
    // ==========================================

    refreshStateDetail(state) {
        const container = document.querySelector('.database-detail-panel');
        if (container) {
            container.innerHTML = '';
            this.showStateDetail(container, state);
        }
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
