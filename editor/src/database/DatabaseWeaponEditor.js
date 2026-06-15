/**
 * DatabaseWeaponEditor - Editor for managing weapon database entries
 * Handles display and editing of weapon properties including parameters, traits, and general settings
 */

class DatabaseWeaponEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this.currentWeapon = null;
        this.traitsClipboard = null;
        this.traitEditor = new DatabaseTraitEditor(databaseManager, commonUI);
    }

    showWeaponDetail(container, weapon) {
        this.currentWeapon = weapon;

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.height = '100%';
        wrapper.style.padding = '16px';
        wrapper.style.position = 'relative';

        // Get weapon types from system data
        const weaponTypeNames = this.databaseManager.getSystem()?.weaponTypes || [];

        // General Settings
        const generalWrapper = document.createElement('div');
        generalWrapper.style.marginBottom = '16px';

        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content" style="display: flex; gap: 16px;">
                <div style="display: flex; flex-direction: column; align-items: center; min-width: 60px;">
                    <label class="database-field-label" style="margin-bottom: 4px;">Icon:</label>
                    <div id="weapon-icon-container-${weapon.id}"></div>
                </div>
                <div style="flex: 1;">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="database-field-label">Name:</label>
                            <input type="text" class="database-field-value" value="${weapon.name || ''}" data-field="name" data-weapon-id="${weapon.id}">
                        </div>
                    </div>
                    <div class="form-row">
                        <label class="database-field-label">Description:</label>
                    </div>
                    <div class="form-row">
                        <textarea class="database-field-value" rows="2" style="width: 100%;" data-field="description" data-weapon-id="${weapon.id}">${weapon.description || ''}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group-fixed">
                            <label class="database-field-label">Weapon Type:</label>
                            <select class="database-field-value" style="width: 150px;" data-field="wtypeId" data-weapon-id="${weapon.id}">
                                ${weaponTypeNames.map((name, idx) => idx > 0 && name ? `<option value="${idx}" ${weapon.wtypeId === idx ? 'selected' : ''}>${name}</option>` : '').join('')}
                            </select>
                        </div>
                        <div class="form-group-fixed">
                            <label class="database-field-label">Price:</label>
                            <input type="number" class="database-field-value database-field-value-small" value="${weapon.price || 0}" data-field="price" data-weapon-id="${weapon.id}">
                        </div>
                    </div>
                </div>
            </div>
        `;
        generalWrapper.appendChild(generalSection);
        wrapper.appendChild(generalWrapper);

        // Add icon to the designated container after the DOM is ready
        setTimeout(() => {
            const iconContainer = document.getElementById(`weapon-icon-container-${weapon.id}`);
            if (iconContainer) {
                this.parentEditor.addDatabasePreview(iconContainer, weapon, 'weapons');
            }
        }, 0);

        // Grid wrapper for sections below general
        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';

        // Parameters Section
        const params = weapon.params || [0,0,0,0,0,0,0,0];
        const paramNames = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
        const paramsSection = document.createElement('div');
        paramsSection.className = 'database-section';
        paramsSection.innerHTML = `
            <div class="database-section-header">Parameters</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>Parameter</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${paramNames.map((name, idx) => `
                            <tr>
                                <td>${name}</td>
                                <td>
                                    <input type="number"
                                           class="database-field-value database-field-value-small"
                                           value="${params[idx] || 0}"
                                           data-field="params"
                                           data-param-index="${idx}"
                                           data-weapon-id="${weapon.id}"
                                           style="width: 80px; background: var(--color-bg-panel);">
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        gridWrapper.appendChild(paramsSection);

        // Traits Section
        const traitsSection = document.createElement('div');
        traitsSection.className = 'database-section';
        traitsSection.setAttribute('tabindex', '0');
        traitsSection.style.outline = 'none';
        traitsSection.innerHTML = `
            <div class="database-section-header">Traits</div>
            <div class="database-section-content">
                <table class="traits-table" id="weapon-traits-table-${weapon.id}">
                    <thead>
                        <tr>
                            <th style="width: 3px; padding: 0; border: none; background: transparent;"></th>
                            <th>Type</th>
                            <th>Content</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${weapon.traits && weapon.traits.length > 0 ?
                            weapon.traits.map((trait, index) => `
                                <tr class="trait-row" data-trait-index="${index}">
                                    <td class="trait-indicator" style="width: 3px; padding: 0; border: none; background: transparent;"></td>
                                    <td>${this.commonUI.getTraitName(trait.code)}</td>
                                    <td>${this.commonUI.getTraitValue(trait)}</td>
                                </tr>
                            `).join('') :
                            '<tr><td style="width: 3px; padding: 0; border: none; background: transparent;"></td><td colspan="2" style="text-align: center; color: var(--color-text-muted); font-style: italic; padding: 12px;">No traits</td></tr>'}
                    </tbody>
                </table>
                <div class="trait-action-buttons" style="display: flex; gap: 6px; margin-top: 8px;">
                    <button class="trait-btn-add" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-strong); border-radius: 4px; cursor: pointer; font-size: 12px;">Add</button>
                    <button class="trait-btn-edit" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>Edit</button>
                    <button class="trait-btn-copy" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>Copy</button>
                    <button class="trait-btn-paste" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>Paste</button>
                    <button class="trait-btn-delete" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>Delete</button>
                </div>
            </div>
        `;
        gridWrapper.appendChild(traitsSection);

        // Setup trait interaction after DOM is ready
        setTimeout(() => {
            const traitsTable = document.getElementById(`weapon-traits-table-${weapon.id}`);
            if (traitsTable) {
                this.setupTraitInteraction(traitsTable, weapon);
                this.setupTraitsContextMenu(traitsTable, weapon);
                this.setupTraitActionButtons(traitsSection, traitsTable, weapon);
                this.setupTraitKeyboardShortcuts(traitsSection, traitsTable, weapon);
            }
        }, 0);

        // Note Section
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-weapon-id="${weapon.id}">${weapon.note || ''}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-weapon-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const weaponId = parseInt(e.target.dataset.weaponId);
                    const paramIndex = e.target.dataset.paramIndex;
                    const value = e.target.value;
                    this.updateWeaponField(weaponId, fieldName, value, paramIndex);
                });
            });
        }, 0);
    }

    updateWeaponField(weaponId, fieldName, value, paramIndex = null) {
        const weapon = this.databaseManager.getWeapon(weaponId);
        if (!weapon) return;

        // Handle special case for parameters array
        if (fieldName === 'params' && paramIndex !== null) {
            if (!weapon.params) weapon.params = [0,0,0,0,0,0,0,0];
            weapon.params[parseInt(paramIndex)] = parseInt(value) || 0;
            console.log(`Updated weapon ${weaponId} param[${paramIndex}] to:`, value);
        }
        // Handle numeric fields
        else if (fieldName === 'price' || fieldName === 'wtypeId') {
            weapon[fieldName] = parseInt(value) || 0;
            console.log(`Updated weapon ${weaponId} field ${fieldName} to:`, value);
        }
        // Handle string fields
        else {
            weapon[fieldName] = value;
            console.log(`Updated weapon ${weaponId} field ${fieldName} to:`, value);
        }

        this.databaseManager.updateWeapon(weaponId, weapon);
    }

    setupTraitInteraction(table, weapon) {
        const rows = table.querySelectorAll('.trait-row');

        rows.forEach(row => {
            const indicator = row.querySelector('.trait-indicator');
            const contentCells = Array.from(row.querySelectorAll('td:not(.trait-indicator)'));

            row.addEventListener('mouseenter', () => {
                if (indicator) {
                    indicator.style.setProperty('background-color', 'var(--color-accent-bright)', 'important');
                }
                contentCells.forEach(cell => {
                    cell.style.setProperty('background-color', 'var(--color-bg-panel)', 'important');
                });
            });

            row.addEventListener('mouseleave', () => {
                if (indicator && !row.classList.contains('selected')) {
                    indicator.style.setProperty('background-color', 'transparent', 'important');
                }
                if (!row.classList.contains('selected')) {
                    contentCells.forEach(cell => {
                        cell.style.setProperty('background-color', '', 'important');
                    });
                }
            });

            row.addEventListener('click', () => {
                rows.forEach(r => {
                    r.classList.remove('selected');
                    const ind = r.querySelector('.trait-indicator');
                    if (ind) ind.style.setProperty('background-color', 'transparent', 'important');
                    const cells = Array.from(r.querySelectorAll('td:not(.trait-indicator)'));
                    cells.forEach(cell => cell.style.setProperty('background-color', '', 'important'));
                });

                row.classList.add('selected');
                if (indicator) {
                    indicator.style.setProperty('background-color', 'var(--color-accent-bright)', 'important');
                }
                contentCells.forEach(cell => {
                    cell.style.setProperty('background-color', 'var(--color-bg-panel)', 'important');
                });

                const section = table.closest('.database-section');
                if (section) section.focus();
                this.updateTraitButtonStates(section);
            });

            row.addEventListener('dblclick', () => {
                const traitIndex = parseInt(row.dataset.traitIndex);
                this.editTrait(weapon, traitIndex);
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

    setupTraitsContextMenu(table, weapon) {
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
                { label: 'Add', action: () => this.addTrait(weapon), enabled: true },
                { label: 'Edit', action: () => this.editTrait(weapon, traitIndex), enabled: traitIndex !== null },
                { label: 'Cut', action: () => this.cutTrait(weapon, traitIndex), enabled: traitIndex !== null },
                { label: 'Copy', action: () => this.copyTrait(weapon, traitIndex), enabled: traitIndex !== null },
                { label: 'Paste', action: () => this.pasteTrait(weapon), enabled: this.traitsClipboard !== null },
                { label: 'Delete', action: () => this.deleteTrait(weapon, traitIndex), enabled: traitIndex !== null },
                { label: 'Select All', action: () => this.selectAllTraits(weapon), enabled: true }
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
                    menuItem.addEventListener('mouseenter', () => {
                        menuItem.style.background = 'var(--color-border)';
                    });
                    menuItem.addEventListener('mouseleave', () => {
                        menuItem.style.background = 'transparent';
                    });
                    menuItem.addEventListener('click', () => {
                        item.action();
                        menu.remove();
                    });
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

    addTrait(weapon) {
        console.log('DatabaseWeaponEditor.addTrait - Adding new trait to weapon:', weapon.id);
        console.log('DatabaseWeaponEditor.addTrait - Current traits:', weapon.traits);

        // Initialize traits array if needed
        if (!weapon.traits) weapon.traits = [];

        // Open trait editor for a new trait (index -1)
        console.log('DatabaseWeaponEditor.addTrait - Opening editor for new trait');

        this.traitEditor.showTraitEditorModal(weapon, -1, (updatedEntry) => {
            console.log('DatabaseWeaponEditor.addTrait - Callback received entry:', updatedEntry);
            console.log('DatabaseWeaponEditor.addTrait - Entry traits:', updatedEntry.traits);

            this.databaseManager.updateWeapon(updatedEntry.id, updatedEntry);
            console.log('DatabaseWeaponEditor.addTrait - Updated weapon in database');

            this.refreshWeaponDetail(updatedEntry);
            console.log('DatabaseWeaponEditor.addTrait - Refreshed weapon detail');
        });
    }

    editTrait(weapon, traitIndex) {
        if (traitIndex === null) return;

        this.traitEditor.showTraitEditorModal(weapon, traitIndex, (updatedEntry) => {
            this.databaseManager.updateWeapon(updatedEntry.id, updatedEntry);
            this.refreshWeaponDetail(updatedEntry);
        });
    }

    cutTrait(weapon, traitIndex) {
        if (traitIndex === null || !weapon.traits) return;
        this.traitsClipboard = { ...weapon.traits[traitIndex] };
        weapon.traits.splice(traitIndex, 1);
        this.databaseManager.updateWeapon(weapon.id, weapon);
        this.refreshWeaponDetail(weapon);
    }

    copyTrait(weapon, traitIndex) {
        if (traitIndex === null || !weapon.traits) return;
        this.traitsClipboard = { ...weapon.traits[traitIndex] };
    }

    pasteTrait(weapon) {
        if (!this.traitsClipboard) return;
        if (!weapon.traits) weapon.traits = [];
        weapon.traits.push({ ...this.traitsClipboard });
        this.databaseManager.updateWeapon(weapon.id, weapon);
        this.refreshWeaponDetail(weapon);
    }

    deleteTrait(weapon, traitIndex) {
        if (traitIndex === null || !weapon.traits) return;
        weapon.traits.splice(traitIndex, 1);
        this.databaseManager.updateWeapon(weapon.id, weapon);
        this.refreshWeaponDetail(weapon);
    }

    selectAllTraits(weapon) {
        console.log('Select all traits');
    }

    refreshWeaponDetail(weapon) {
        console.log('DatabaseWeaponEditor.refreshWeaponDetail - Refreshing weapon:', weapon.id);
        console.log('DatabaseWeaponEditor.refreshWeaponDetail - Weapon traits:', weapon.traits);

        const container = document.querySelector('.database-detail-panel');
        if (container) {
            console.log('DatabaseWeaponEditor.refreshWeaponDetail - Found container, clearing and rebuilding');
            container.innerHTML = '';
            this.showWeaponDetail(container, weapon);
            console.log('DatabaseWeaponEditor.refreshWeaponDetail - Detail rebuilt');
        } else {
            console.warn('DatabaseWeaponEditor.refreshWeaponDetail - Could not find detail panel container!');
        }
    }
}
