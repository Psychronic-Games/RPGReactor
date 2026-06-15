/**
 * DatabaseActorEditor - Actor-specific database editor
 * Handles rendering and editing of Actor entries
 */
class DatabaseActorEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor; // Reference to main editor for addDatabasePreview, etc.
        this.currentProject = projectManager.getCurrentProject();
        this.traitEditor = new DatabaseTraitEditor(databaseManager, commonUI);
        this.traitsClipboard = null;
    }

    /**
     * Show actor detail view
     */
    showActorDetail(container, actor) {
        // Create a wrapper for better layout
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%; padding: 16px; overflow-y: auto;';

        // ROW 1: General Settings (left) + Images (right)
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 16px;';

        // General Settings Section
        const generalSection = this.createGeneralSettingsSection(actor);
        topRow.appendChild(generalSection);

        // Images Section
        const imagesSection = this.createImagesSection(actor);
        topRow.appendChild(imagesSection);

        wrapper.appendChild(topRow);

        // ROW 2: Traits (left) + Equipment (right)
        const middleRow = document.createElement('div');
        middleRow.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px;';

        // Traits Section
        const traitsSection = this.createTraitsSection(actor);
        middleRow.appendChild(traitsSection);

        // Equipment Section
        const equipmentSection = this.createEquipmentSection(actor);
        middleRow.appendChild(equipmentSection);

        wrapper.appendChild(middleRow);

        // ROW 3: Note (full width)
        const noteSection = this.createNoteSection(actor);
        noteSection.style.marginTop = '16px';
        wrapper.appendChild(noteSection);

        // Add wrapper to container
        container.appendChild(wrapper);

        // Add event listeners
        this.attachEventListeners(container, actor);
    }

    /**
     * Create Images section
     */
    createImagesSection(actor) {
        const imagesSection = document.createElement('div');
        imagesSection.className = 'database-section';
        imagesSection.style.display = 'flex';
        imagesSection.style.flexDirection = 'column';

        const imagesContent = document.createElement('div');
        imagesContent.className = 'database-section-content';
        imagesContent.style.flex = '1';

        imagesSection.innerHTML = '<div class="database-section-header">Images</div>';
        imagesSection.appendChild(imagesContent);

        // Add previews (delegates to parent editor)
        this.parentEditor.addDatabasePreview(imagesContent, actor, 'actors');

        return imagesSection;
    }

    /**
     * Create General Settings section
     */
    createGeneralSettingsSection(actor) {
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';

        // Get all classes for dropdown
        const allClasses = this.databaseManager.getClasses();
        const classOptions = allClasses.map(cls =>
            `<option value="${cls.id}" ${cls.id === actor.classId ? 'selected' : ''}>#${cls.id} ${cls.name}</option>`
        ).join('');

        generalSection.innerHTML = `
            <div class="database-section-header">General Settings</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Name:</label>
                        <input type="text" class="database-field-value" value="${actor.name || ''}" data-field="name" data-actor-id="${actor.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Nickname:</label>
                        <input type="text" class="database-field-value" value="${actor.nickname || ''}" data-field="nickname" data-actor-id="${actor.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Class:</label>
                        <select class="database-field-value" data-field="classId" data-actor-id="${actor.id}">
                            ${classOptions}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Initial Level:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${actor.initialLevel || 1}" data-field="initialLevel" data-actor-id="${actor.id}">
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Max Level:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${actor.maxLevel || 99}" data-field="maxLevel" data-actor-id="${actor.id}">
                    </div>
                </div>
                <div class="form-row">
                    <label class="database-field-label">Profile:</label>
                </div>
                <div class="form-row">
                    <textarea class="database-field-value" rows="3" style="width: 100%;" data-field="profile" data-actor-id="${actor.id}">${actor.profile || ''}</textarea>
                </div>
            </div>
        `;
        return generalSection;
    }

    /**
     * Create Equipment section.
     *
     * Slots are derived from the actor's class + actor traits — slots sealed
     * by TRAIT_EQUIP_SEAL (code 54) are hidden, and each dropdown is filtered
     * to only items the actor's class+actor TRAIT_EQUIP_WTYPE/ATYPE allow. A
     * slot with no compatible items shows a "(no compatible items)" note.
     */
    createEquipmentSection(actor) {
        const equipmentSection = document.createElement('div');
        equipmentSection.className = 'database-section';

        const systemData = this.databaseManager.getSystem() || {};
        const equipTypes = systemData.equipTypes || [];
        const weaponTypes = systemData.weaponTypes || [];
        const armorTypes = systemData.armorTypes || [];

        const allowedWtypes = this.getActorAllowedWtypeIds(actor);
        const allowedAtypes = this.getActorAllowedAtypeIds(actor);
        const sealedEtypes = this.getActorSealedEtypeIds(actor);
        const equipSlots = this.getActorEquipSlots(actor)
            .map((etypeId, idx) => ({ etypeId, slotIndex: idx }))
            // Hide slots whose equipType has no name (unnamed/placeholder rows in System.equipTypes).
            .filter(s => typeof equipTypes[s.etypeId] === 'string' && equipTypes[s.etypeId].trim() !== '')
            .filter(s => !sealedEtypes.has(s.etypeId));

        // Pad actor.equips to cover all slots if System grew since the actor was created.
        if (!actor.equips) actor.equips = [];
        const maxIdx = equipSlots.reduce((m, s) => Math.max(m, s.slotIndex), -1);
        while (actor.equips.length <= maxIdx) actor.equips.push(0);

        const actorClass = this.databaseManager.getClass(actor.classId);
        const sourceLabel = actorClass
            ? `Filtered by class: <span style="color: var(--color-accent-bright); font-weight: 600;">${actorClass.name}</span>`
            : 'Filtered by actor traits';

        let equipmentHTML = '';
        equipSlots.forEach(({ etypeId, slotIndex }) => {
            const equipId = actor.equips[slotIndex] || 0;
            const slotName = equipTypes[etypeId] || `Slot ${slotIndex}`;

            let options = '<option value="0">(None)</option>';
            let compatibleCount = 0;

            if (etypeId === 1) {
                const weapons = this.databaseManager.getWeapons();
                weapons.forEach(weapon => {
                    if (!weapon || !allowedWtypes.has(weapon.wtypeId)) return;
                    compatibleCount++;
                    const weaponType = weaponTypes[weapon.wtypeId] || 'Weapon';
                    const selected = weapon.id === equipId ? 'selected' : '';
                    options += `<option value="${weapon.id}" ${selected}>${weapon.name} (${weaponType})</option>`;
                });
            } else {
                const armors = this.databaseManager.getArmors();
                armors.forEach(armor => {
                    if (!armor || armor.etypeId !== etypeId) return;
                    if (!allowedAtypes.has(armor.atypeId)) return;
                    compatibleCount++;
                    const armorType = armorTypes[armor.atypeId] || 'Armor';
                    const selected = armor.id === equipId ? 'selected' : '';
                    options += `<option value="${armor.id}" ${selected}>${armor.name} (${armorType})</option>`;
                });
            }

            // If something is currently equipped but no longer compatible, surface it as a stale option.
            const equippedIsKnown = options.includes(`value="${equipId}" selected`);
            if (equipId > 0 && !equippedIsKnown) {
                const stale = etypeId === 1
                    ? this.databaseManager.getWeapons().find(w => w && w.id === equipId)
                    : this.databaseManager.getArmors().find(a => a && a.id === equipId);
                if (stale) {
                    options += `<option value="${equipId}" selected style="color: var(--color-warning);">${stale.name} (incompatible)</option>`;
                }
            }

            const emptyHint = compatibleCount === 0
                ? `<div style="font-size: 10px; color: var(--color-text-muted); margin-top: 3px;">(no compatible items)</div>`
                : '';

            equipmentHTML += `
                <tr>
                    <td style="width: 120px;">${slotName}</td>
                    <td>
                        <select class="database-field-value equipment-select"
                                data-actor-id="${actor.id}"
                                data-slot-index="${slotIndex}"
                                style="width: 100%;">
                            ${options}
                        </select>
                        ${emptyHint}
                    </td>
                </tr>
            `;
        });

        equipmentSection.innerHTML = `
            <div class="database-section-header">Equipment</div>
            <div class="database-section-content">
                <div style="font-size: 10px; color: var(--color-text-muted); padding: 4px 8px 8px;">${sourceLabel}</div>
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>Slot</th>
                            <th>Item</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${equipmentHTML || '<tr><td colspan="2" style="text-align: center; color: var(--color-text-muted);">No equipment slots available</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
        return equipmentSection;
    }

    /**
     * Collect trait dataIds from the actor + their class.
     */
    _collectTraitDataIds(actor, traitCode) {
        const result = new Set();
        const collect = (traits) => {
            if (!traits) return;
            for (const t of traits) {
                if (t.code === traitCode) result.add(t.dataId);
            }
        };
        collect(actor.traits);
        const actorClass = this.databaseManager.getClass(actor.classId);
        if (actorClass) collect(actorClass.traits);
        return result;
    }

    /**
     * Allowed weapon types (TRAIT_EQUIP_WTYPE = code 51) from actor + class.
     */
    getActorAllowedWtypeIds(actor) {
        return this._collectTraitDataIds(actor, 51);
    }

    /**
     * Allowed armor types (TRAIT_EQUIP_ATYPE = code 52) from actor + class.
     */
    getActorAllowedAtypeIds(actor) {
        return this._collectTraitDataIds(actor, 52);
    }

    /**
     * Sealed equipment slot etypeIds (TRAIT_EQUIP_SEAL = code 54) from actor + class.
     */
    getActorSealedEtypeIds(actor) {
        return this._collectTraitDataIds(actor, 54);
    }

    /**
     * Create Traits section with interactive table and context menu
     */
    createTraitsSection(actor) {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.setAttribute('data-actor-id', actor.id);
        section.setAttribute('tabindex', '0');
        section.style.outline = 'none';

        const traitsHTML = actor.traits && actor.traits.length > 0 ?
            actor.traits.map((trait, index) => `
                <tr class="trait-row" data-trait-index="${index}" data-actor-id="${actor.id}"
                    style="cursor: pointer; transition: all 0.15s ease;">
                    <td class="trait-indicator" style="width: 3px; padding: 0; border: none; background: transparent;"></td>
                    <td>${this.commonUI.getTraitName(trait.code)}</td>
                    <td>${this.commonUI.getTraitValue(trait)}</td>
                </tr>
            `).join('') :
            '<tr><td colspan="3" style="text-align: center; color: var(--color-text-muted);">No traits</td></tr>';

        section.innerHTML = `
            <div class="database-section-header">Traits</div>
            <div class="database-section-content">
                <table class="traits-table" id="actor-traits-table-${actor.id}">
                    <thead>
                        <tr>
                            <th style="width: 3px; padding: 0; border: none; background: transparent;"></th>
                            <th>Type</th>
                            <th>Content</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${traitsHTML}
                    </tbody>
                </table>
                <div class="trait-action-buttons" style="display: flex; gap: 6px; margin-top: 8px;">
                    <button class="trait-btn-add" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-strong); border-radius: 4px; cursor: pointer; font-size: 12px;">Add</button>
                    <button class="trait-btn-edit" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>Edit</button>
                    <button class="trait-btn-copy" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>Copy</button>
                    <button class="trait-btn-paste" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: ${this.traitsClipboard ? 'var(--color-text-strong)' : 'var(--color-text-dim)'}; border-radius: 4px; cursor: ${this.traitsClipboard ? 'pointer' : 'default'}; font-size: 12px;" ${this.traitsClipboard ? '' : 'disabled'}>Paste</button>
                    <button class="trait-btn-delete" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>Delete</button>
                </div>
            </div>
        `;

        // Add context menu handling, interaction effects, button wiring, and keyboard shortcuts
        setTimeout(() => {
            const table = document.getElementById(`actor-traits-table-${actor.id}`);
            if (table) {
                this.setupTraitsContextMenu(table, actor);
                this.setupTraitInteraction(table);
                this.setupTraitActionButtons(section, table, actor);
                this.setupTraitKeyboardShortcuts(section, table, actor);
            }
        }, 0);

        return section;
    }

    /**
     * Setup hover/click interaction effects on trait rows
     */
    setupTraitInteraction(table) {
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('.trait-row');

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const indicator = row.querySelector('.trait-indicator');
            const contentCells = Array.from(cells).slice(1);

            // Hover effect
            row.addEventListener('mouseenter', () => {
                if (indicator) {
                    indicator.style.setProperty('background-color', 'var(--color-accent-bright)', 'important');
                }
                contentCells.forEach(cell => {
                    cell.style.setProperty('background-color', 'var(--color-bg-panel)', 'important');
                });
            });

            row.addEventListener('mouseleave', () => {
                if (!row.classList.contains('trait-selected')) {
                    if (indicator) {
                        indicator.style.setProperty('background-color', 'transparent', 'important');
                    }
                    contentCells.forEach(cell => {
                        cell.style.setProperty('background-color', '', 'important');
                    });
                }
            });

            // Click to select
            row.addEventListener('click', (e) => {
                if (e.button !== 0) return;

                // Deselect all other rows
                rows.forEach(r => {
                    r.classList.remove('trait-selected');
                    const rIndicator = r.querySelector('.trait-indicator');
                    const rCells = Array.from(r.querySelectorAll('td')).slice(1);
                    if (rIndicator) rIndicator.style.setProperty('background-color', 'transparent', 'important');
                    rCells.forEach(cell => cell.style.setProperty('background-color', '', 'important'));
                });

                // Select this row
                row.classList.add('trait-selected');
                if (indicator) indicator.style.setProperty('background-color', 'var(--color-accent-bright)', 'important');
                contentCells.forEach(cell => cell.style.setProperty('background-color', 'var(--color-bg-panel)', 'important'));

                // Focus the section so keyboard shortcuts work here instead of on the list
                const section = table.closest('.database-section');
                if (section) section.focus();

                // Update action button states
                this.updateTraitButtonStates(section);
            });

            // Double-click to edit
            row.addEventListener('dblclick', () => {
                const traitIndex = parseInt(row.dataset.traitIndex);
                const actorId = parseInt(row.dataset.actorId);
                const actor = this.databaseManager.getActor(actorId);
                if (actor) {
                    this.editTrait(actor, traitIndex);
                }
            });
        });
    }

    /**
     * Wire up the Add/Edit/Copy/Paste/Delete buttons below the traits table
     */
    setupTraitActionButtons(section, table, actor) {
        const btnAdd = section.querySelector('.trait-btn-add');
        const btnEdit = section.querySelector('.trait-btn-edit');
        const btnCopy = section.querySelector('.trait-btn-copy');
        const btnPaste = section.querySelector('.trait-btn-paste');
        const btnDelete = section.querySelector('.trait-btn-delete');

        // Hover styling for enabled buttons
        [btnAdd, btnEdit, btnCopy, btnPaste, btnDelete].forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                if (!btn.disabled) btn.style.background = 'var(--color-accent-tint-25)';
            });
            btn.addEventListener('mouseleave', () => {
                if (!btn.disabled) btn.style.background = 'var(--color-border-subtle)';
            });
        });

        btnAdd.addEventListener('click', () => this.addTrait(actor));

        btnEdit.addEventListener('click', () => {
            const idx = this.getSelectedTraitIndex(table);
            if (idx !== null) this.editTrait(actor, idx);
        });

        btnCopy.addEventListener('click', () => {
            const idx = this.getSelectedTraitIndex(table);
            if (idx !== null) {
                this.copyTrait(actor, idx);
                this.updateTraitButtonStates(section);
            }
        });

        btnPaste.addEventListener('click', () => {
            const idx = this.getSelectedTraitIndex(table);
            this.pasteTrait(actor, idx);
        });

        btnDelete.addEventListener('click', () => {
            const idx = this.getSelectedTraitIndex(table);
            if (idx !== null) this.deleteTrait(actor, idx);
        });
    }

    /**
     * Get the currently selected trait index from the table
     */
    getSelectedTraitIndex(table) {
        const selected = table.querySelector('.trait-row.trait-selected');
        return selected ? parseInt(selected.dataset.traitIndex) : null;
    }

    /**
     * Enable/disable action buttons based on current selection
     */
    updateTraitButtonStates(section) {
        if (!section) return;
        const table = section.querySelector('.traits-table');
        const hasSelection = table && table.querySelector('.trait-row.trait-selected');
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

    /**
     * Setup keyboard shortcuts on the traits section.
     * When the section has focus (after clicking a trait row), Ctrl+C/X/V and Delete
     * operate on traits and stop propagation so the parent list handler doesn't fire.
     */
    setupTraitKeyboardShortcuts(section, table, actor) {
        section.addEventListener('keydown', (e) => {
            const idx = this.getSelectedTraitIndex(table);

            // Delete key - delete selected trait
            if (e.key === 'Delete' && idx !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.deleteTrait(actor, idx);
                return;
            }

            // Enter key - edit selected trait
            if (e.key === 'Enter' && idx !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.editTrait(actor, idx);
                return;
            }

            if (!e.ctrlKey && !e.metaKey) return;

            if (e.key === 'c' && idx !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.copyTrait(actor, idx);
                this.updateTraitButtonStates(section);
            } else if (e.key === 'x' && idx !== null) {
                e.preventDefault();
                e.stopPropagation();
                this.cutTrait(actor, idx);
            } else if (e.key === 'v' && this.traitsClipboard) {
                e.preventDefault();
                e.stopPropagation();
                this.pasteTrait(actor, idx);
            }
        });
    }

    /**
     * Setup right-click context menu for traits table
     */
    setupTraitsContextMenu(table, actor) {
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        tbody.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            // Remove any existing context menu
            const existing = document.getElementById('traits-context-menu');
            if (existing) existing.remove();

            const row = e.target.closest('.trait-row');
            const traitIndex = row ? parseInt(row.dataset.traitIndex) : null;

            const menu = document.createElement('div');
            menu.id = 'traits-context-menu';
            menu.style.cssText = `
                position: fixed;
                left: ${e.clientX}px;
                top: ${e.clientY}px;
                background: var(--color-bg-menubar);
                border: 1px solid var(--color-accent-bright);
                border-radius: 4px;
                padding: 4px 0;
                z-index: 10000;
                min-width: 150px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            `;

            const menuItems = [
                { label: 'Add', action: () => this.addTrait(actor), disabled: false },
                { label: 'Edit', action: () => this.editTrait(actor, traitIndex), disabled: traitIndex === null },
                { label: 'Cut', action: () => this.cutTrait(actor, traitIndex), disabled: traitIndex === null },
                { label: 'Copy', action: () => this.copyTrait(actor, traitIndex), disabled: traitIndex === null },
                { label: 'Paste', action: () => this.pasteTrait(actor, traitIndex), disabled: !this.traitsClipboard },
                { label: 'Delete', action: () => this.deleteTrait(actor, traitIndex), disabled: traitIndex === null },
                { divider: true },
                { label: 'Select All', action: () => this.selectAllTraits(actor) }
            ];

            menuItems.forEach(item => {
                if (item.divider) {
                    const divider = document.createElement('div');
                    divider.style.cssText = 'height: 1px; background: var(--color-bg-button-hover); margin: 4px 0;';
                    menu.appendChild(divider);
                    return;
                }

                const menuItem = document.createElement('div');
                menuItem.style.cssText = `
                    padding: 6px 16px;
                    color: ${item.disabled ? 'var(--color-text-dim)' : 'var(--color-text-strong)'};
                    cursor: ${item.disabled ? 'default' : 'pointer'};
                    font-size: 13px;
                    transition: background 0.15s;
                `;
                menuItem.textContent = item.label;

                if (!item.disabled) {
                    menuItem.addEventListener('mouseenter', () => {
                        menuItem.style.background = 'var(--color-accent-tint-25)';
                    });
                    menuItem.addEventListener('mouseleave', () => {
                        menuItem.style.background = 'transparent';
                    });
                    menuItem.addEventListener('click', () => {
                        menu.remove();
                        item.action();
                    });
                }

                menu.appendChild(menuItem);
            });

            document.body.appendChild(menu);

            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            setTimeout(() => document.addEventListener('click', closeMenu), 0);
        });
    }

    /**
     * Add a new trait to the actor
     */
    addTrait(actor) {
        if (!actor.traits) actor.traits = [];

        this.traitEditor.showTraitEditorModal(actor, -1, (updatedEntry) => {
            this.databaseManager.updateActor(updatedEntry.id, updatedEntry);
            this.refreshActorDetail(updatedEntry);
        });
    }

    /**
     * Edit an existing trait
     */
    editTrait(actor, traitIndex) {
        if (traitIndex === null) return;

        this.traitEditor.showTraitEditorModal(actor, traitIndex, (updatedEntry) => {
            this.databaseManager.updateActor(updatedEntry.id, updatedEntry);
            this.refreshActorDetail(updatedEntry);
        });
    }

    /**
     * Cut a trait (copy + delete)
     */
    cutTrait(actor, traitIndex) {
        this.copyTrait(actor, traitIndex);
        this.deleteTrait(actor, traitIndex);
    }

    /**
     * Copy a trait to clipboard
     */
    copyTrait(actor, traitIndex) {
        if (traitIndex === null) return;
        const trait = actor.traits[traitIndex];
        if (!trait) return;

        this.traitsClipboard = JSON.parse(JSON.stringify(trait));
    }

    /**
     * Paste a trait from clipboard
     */
    pasteTrait(actor, traitIndex) {
        if (!this.traitsClipboard) return;

        const newTrait = JSON.parse(JSON.stringify(this.traitsClipboard));

        if (traitIndex !== null) {
            actor.traits.splice(traitIndex + 1, 0, newTrait);
        } else {
            actor.traits.push(newTrait);
        }

        this.databaseManager.updateActor(actor.id, actor);
        this.refreshActorDetail(actor);
    }

    /**
     * Delete a trait
     */
    deleteTrait(actor, traitIndex) {
        if (traitIndex === null) return;

        actor.traits.splice(traitIndex, 1);
        this.databaseManager.updateActor(actor.id, actor);
        this.refreshActorDetail(actor);
    }

    /**
     * Select all traits
     */
    selectAllTraits(actor) {
        console.log('Select all traits');
    }

    /**
     * Refresh the actor detail view after changes
     */
    refreshActorDetail(actor) {
        const container = document.querySelector('.database-detail');
        if (container) {
            container.innerHTML = '';
            this.showActorDetail(container, actor);
        }
    }

    /**
     * Create Note section
     */
    createNoteSection(actor) {
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="5" style="width: 100%;" data-field="note" data-actor-id="${actor.id}">${actor.note || ''}</textarea>
            </div>
        `;
        return noteSection;
    }

    /**
     * Attach event listeners for editing
     */
    attachEventListeners(container, actor) {
        setTimeout(() => {
            // Equipment changes
            const equipSelects = container.querySelectorAll('.equipment-select');
            equipSelects.forEach(select => {
                select.addEventListener('change', (e) => {
                    const actorId = parseInt(e.target.dataset.actorId);
                    const slotIndex = parseInt(e.target.dataset.slotIndex);
                    const newEquipId = parseInt(e.target.value);
                    this.changeActorEquipment(actorId, slotIndex, newEquipId);
                });
            });

            // Field changes
            const editableFields = container.querySelectorAll('[data-field]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const actorId = parseInt(e.target.dataset.actorId || actor.id);
                    const value = e.target.value;
                    this.updateActorField(actorId, fieldName, value);
                });
            });
        }, 0);
    }

    /**
     * Get equipment slots for an actor
     */
    getActorEquipSlots(actor) {
        const system = this.databaseManager.getSystem();
        if (!system || !system.equipTypes) {
            return [1, 2, 3, 4, 5];
        }

        const slots = [];
        for (let i = 1; i < system.equipTypes.length; i++) {
            slots.push(i);
        }

        // Check for dual-wield trait
        if (slots.length >= 2 && this.isDualWield(actor)) {
            slots[1] = 1; // Change second slot to Weapon
        }

        return slots;
    }

    /**
     * Check if actor has dual-wield trait
     */
    isDualWield(actor) {
        if (actor.traits) {
            for (const trait of actor.traits) {
                if (trait.code === 55 && trait.dataId === 1) {
                    return true;
                }
            }
        }

        const actorClass = this.databaseManager.getClass(actor.classId);
        if (actorClass && actorClass.traits) {
            for (const trait of actorClass.traits) {
                if (trait.code === 55 && trait.dataId === 1) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Change actor equipment
     */
    changeActorEquipment(actorId, slotIndex, equipId) {
        const actor = this.databaseManager.getActor(actorId);
        if (!actor) return;

        actor.equips[slotIndex] = equipId;
        this.databaseManager.updateActor(actorId, actor);
        console.log(`Changed actor ${actorId} slot ${slotIndex} to equipment ${equipId}`);

        this.commonUI.updateStatus('Equipment changed');
    }

    /**
     * Update actor field
     */
    updateActorField(actorId, fieldName, value) {
        const actor = this.databaseManager.getActor(actorId);
        if (!actor) return;

        // Handle different field types
        if (fieldName === 'initialLevel' || fieldName === 'maxLevel' || fieldName === 'classId') {
            actor[fieldName] = parseInt(value);
        } else {
            actor[fieldName] = value;
        }

        this.databaseManager.updateActor(actorId, actor);
        console.log(`Updated actor ${actorId} field ${fieldName} to ${value}`);

        this.commonUI.updateStatus(`${fieldName} updated`);
    }
}
