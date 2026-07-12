/**
 * DatabaseArmorEditor - Editor for managing armor database entries
 * Handles display and editing of armor properties including parameters, traits, and general settings
 */

class DatabaseArmorEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this.currentArmor = null;
        this.traitsClipboard = null;
        this.traitEditor = new DatabaseTraitEditor(databaseManager, commonUI);
    }

    showArmorDetail(container, armor) {
        this.currentArmor = armor;

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.height = '100%';
        wrapper.style.padding = '16px';
        wrapper.style.position = 'relative';

        const tt = text => window.I18n ? window.I18n.tText(text) : text;

        // Get armor types and equip types from system data
        const armorTypeNames = this.databaseManager.getSystem()?.armorTypes || [];
        const equipTypeNames = this.databaseManager.getSystem()?.equipTypes || [];

        // General Settings
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content"><div class="db-general-grid">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
                    <label style="font-size: 11px; color: var(--color-text-muted); font-weight: 600;">Icon</label>
                    <div id="armor-icon-container-${armor.id}"></div>
                </div>
                <div class="db-form db-fill">
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>Name</label>
                            <input type="text" class="database-field-value" value="${armor.name || ''}" data-field="name" data-armor-id="${armor.id}">
                        </span>
                    </div>
                    <div class="db-row-cols db-row-grow">
                        <span class="db-col">
                            <label>Description</label>
                            <textarea class="database-field-value" rows="2" data-field="description" data-armor-id="${armor.id}">${armor.description || ''}</textarea>
                        </span>
                    </div>
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>${tt('Armor Type')}</label>
                            <select class="database-field-value" data-field="atypeId" data-armor-id="${armor.id}">
                                ${armorTypeNames.map((name, idx) => idx > 0 && name ? `<option value="${idx}" ${armor.atypeId === idx ? 'selected' : ''}>${name}</option>` : '').join('')}
                            </select>
                        </span>
                        <span class="db-col">
                            <label>${tt('Equip Type')}</label>
                            <select class="database-field-value" data-field="etypeId" data-armor-id="${armor.id}">
                                ${equipTypeNames.map((name, idx) => idx > 0 && name ? `<option value="${idx}" ${armor.etypeId === idx ? 'selected' : ''}>${name}</option>` : '').join('')}
                            </select>
                        </span>
                        <span class="db-col">
                            <label>Price</label>
                            <input type="number" class="database-field-value" value="${armor.price || 0}" data-field="price" data-armor-id="${armor.id}">
                        </span>
                    </div>
                </div></div>
            </div>
        `;
        // General flows into the two-column grid with the other sections

        // Add icon to the designated container after the DOM is ready
        setTimeout(() => {
            const iconContainer = document.getElementById(`armor-icon-container-${armor.id}`);
            if (iconContainer) {
                this.parentEditor.addDatabasePreview(iconContainer, armor, 'armors');
            }
        }, 0);

        // Grid wrapper for sections below general
        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';
        gridWrapper.appendChild(generalSection);

        // Parameters Section
        const params = armor.params || [0,0,0,0,0,0,0,0];
        const paramNames = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'].map(name => window.I18n ? window.I18n.tText(name) : name);
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
                                           data-armor-id="${armor.id}"
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
                <table class="traits-table" id="armor-traits-table-${armor.id}">
                    <thead>
                        <tr>
                            <th style="width: 3px; padding: 0; border: none; background: transparent;"></th>
                            <th>Type</th>
                            <th>Content</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${armor.traits && armor.traits.length > 0 ?
                            armor.traits.map((trait, index) => `
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
            const traitsTable = document.getElementById(`armor-traits-table-${armor.id}`);
            if (traitsTable) {
                this.setupTraitInteraction(traitsTable, armor);
                this.setupTraitsContextMenu(traitsTable, armor);
                this.setupTraitActionButtons(traitsSection, traitsTable, armor);
                this.setupTraitKeyboardShortcuts(traitsSection, traitsTable, armor);
            }
        }, 0);

        // Note Section
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-armor-id="${armor.id}">${armor.note || ''}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-armor-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const armorId = parseInt(e.target.dataset.armorId);
                    const paramIndex = e.target.dataset.paramIndex;
                    const value = e.target.value;
                    this.updateArmorField(armorId, fieldName, value, paramIndex);
                });
            });
        }, 0);
    }

    updateArmorField(armorId, fieldName, value, paramIndex = null) {
        const armor = this.databaseManager.getArmor(armorId);
        if (!armor) return;

        // Handle special case for parameters array
        if (fieldName === 'params' && paramIndex !== null) {
            if (!armor.params) armor.params = [0,0,0,0,0,0,0,0];
            armor.params[parseInt(paramIndex)] = parseInt(value) || 0;
            console.log(`Updated armor ${armorId} param[${paramIndex}] to:`, value);
        }
        // Handle numeric fields
        else if (fieldName === 'price' || fieldName === 'atypeId' || fieldName === 'etypeId') {
            armor[fieldName] = parseInt(value) || 0;
            console.log(`Updated armor ${armorId} field ${fieldName} to:`, value);
        }
        // Handle string fields
        else {
            armor[fieldName] = value;
            console.log(`Updated armor ${armorId} field ${fieldName} to:`, value);
        }

        this.databaseManager.updateArmor(armorId, armor);
    }

    setupTraitInteraction(table, armor) {
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
                this.editTrait(armor, traitIndex);
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

    setupTraitsContextMenu(table, armor) {
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
                { label: 'Add', action: () => this.addTrait(armor), enabled: true },
                { label: 'Edit', action: () => this.editTrait(armor, traitIndex), enabled: traitIndex !== null },
                { label: 'Cut', action: () => this.cutTrait(armor, traitIndex), enabled: traitIndex !== null },
                { label: 'Copy', action: () => this.copyTrait(armor, traitIndex), enabled: traitIndex !== null },
                { label: 'Paste', action: () => this.pasteTrait(armor), enabled: this.traitsClipboard !== null },
                { label: 'Delete', action: () => this.deleteTrait(armor, traitIndex), enabled: traitIndex !== null },
                { label: 'Select All', action: () => this.selectAllTraits(armor), enabled: true }
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

    addTrait(armor) {
        console.log('DatabaseArmorEditor.addTrait - Adding new trait to armor:', armor.id);
        console.log('DatabaseArmorEditor.addTrait - Current traits:', armor.traits);

        // Initialize traits array if needed
        if (!armor.traits) armor.traits = [];

        // Open trait editor for a new trait (index -1)
        console.log('DatabaseArmorEditor.addTrait - Opening editor for new trait');

        this.traitEditor.showTraitEditorModal(armor, -1, (updatedEntry) => {
            console.log('DatabaseArmorEditor.addTrait - Callback received entry:', updatedEntry);
            console.log('DatabaseArmorEditor.addTrait - Entry traits:', updatedEntry.traits);

            this.databaseManager.updateArmor(updatedEntry.id, updatedEntry);
            console.log('DatabaseArmorEditor.addTrait - Updated armor in database');

            this.refreshArmorDetail(updatedEntry);
            console.log('DatabaseArmorEditor.addTrait - Refreshed armor detail');
        });
    }

    editTrait(armor, traitIndex) {
        if (traitIndex === null) return;

        this.traitEditor.showTraitEditorModal(armor, traitIndex, (updatedEntry) => {
            this.databaseManager.updateArmor(updatedEntry.id, updatedEntry);
            this.refreshArmorDetail(updatedEntry);
        });
    }

    cutTrait(armor, traitIndex) {
        if (traitIndex === null || !armor.traits) return;
        this.traitsClipboard = { ...armor.traits[traitIndex] };
        armor.traits.splice(traitIndex, 1);
        this.databaseManager.updateArmor(armor.id, armor);
        this.refreshArmorDetail(armor);
    }

    copyTrait(armor, traitIndex) {
        if (traitIndex === null || !armor.traits) return;
        this.traitsClipboard = { ...armor.traits[traitIndex] };
    }

    pasteTrait(armor) {
        if (!this.traitsClipboard) return;
        if (!armor.traits) armor.traits = [];
        armor.traits.push({ ...this.traitsClipboard });
        this.databaseManager.updateArmor(armor.id, armor);
        this.refreshArmorDetail(armor);
    }

    deleteTrait(armor, traitIndex) {
        if (traitIndex === null || !armor.traits) return;
        armor.traits.splice(traitIndex, 1);
        this.databaseManager.updateArmor(armor.id, armor);
        this.refreshArmorDetail(armor);
    }

    selectAllTraits(armor) {
        console.log('Select all traits');
    }

    refreshArmorDetail(armor) {
        console.log('DatabaseArmorEditor.refreshArmorDetail - Refreshing armor:', armor.id);
        console.log('DatabaseArmorEditor.refreshArmorDetail - Armor traits:', armor.traits);

        const container = document.querySelector('.database-detail-panel');
        if (container) {
            console.log('DatabaseArmorEditor.refreshArmorDetail - Found container, clearing and rebuilding');
            container.innerHTML = '';
            this.showArmorDetail(container, armor);
            console.log('DatabaseArmorEditor.refreshArmorDetail - Detail rebuilt');
        } else {
            console.warn('DatabaseArmorEditor.refreshArmorDetail - Could not find detail panel container!');
        }
    }
}
