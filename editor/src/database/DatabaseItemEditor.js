/**
 * DatabaseItemEditor - Editor for managing item database entries
 * Handles display and editing of item properties including type, effects, damage, and general settings
 */

class DatabaseItemEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this.currentItem = null;
        this.effectsClipboard = null;
        this.effectEditor = new DatabaseEffectEditor(databaseManager, commonUI);
    }

    showItemDetail(container, item) {
        this.currentItem = item;

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.height = '100%';
        wrapper.style.padding = '16px';
        wrapper.style.position = 'relative';

        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const scopeNames = ['None', 'One Enemy', 'All Enemies', '3 Random', '4 Random', '2 Random', '1 Random',
                           'One Ally', 'All Allies', 'One Ally (Dead)', 'All Allies (Dead)', 'User'].map(tt);
        const occasionNames = ['Always', 'Battle Only', 'Menu Only', 'Never'].map(tt);
        const hitTypeNames = ['Certain', 'Physical', 'Magical'].map(tt);
        const damageTypeNames = ['None', 'HP Damage', 'MP Damage', 'HP Recover', 'MP Recover', 'HP Drain', 'MP Drain'].map(tt);

        // Get system elements for the damage element dropdown
        const systemData = this.databaseManager.getSystem();
        const elements = systemData ? systemData.elements || [] : [];

        // Animation picker: -1 = Normal Attack, 0 = None; opens AnimationPickerModal
        const animations = this.databaseManager.getAnimations ? this.databaseManager.getAnimations() : [];
        const animationLabel = (current) => AnimationPickerModal.label(animations, current);

        // --- General Settings ---
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content"><div class="db-general-grid">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
                    <label style="font-size: 11px; color: var(--color-text-muted); font-weight: 600;">Icon</label>
                    <div id="item-icon-container-${item.id}"></div>
                </div>
                <div class="db-form db-fill">
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>Name</label>
                            <input type="text" class="database-field-value" value="${item.name || ''}" data-field="name" data-item-id="${item.id}">
                        </span>
                    </div>
                    <div class="db-row-cols db-row-grow">
                        <span class="db-col">
                            <label>Description</label>
                            <textarea class="database-field-value" rows="2" data-field="description" data-item-id="${item.id}">${item.description || ''}</textarea>
                        </span>
                    </div>
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>${tt('Item Type')}</label>
                            <select class="database-field-value" data-field="itypeId" data-item-id="${item.id}">
                                <option value="1" ${item.itypeId === 1 ? 'selected' : ''}>${tt('Regular Item')}</option>
                                <option value="2" ${item.itypeId === 2 ? 'selected' : ''}>${tt('Key Item')}</option>
                            </select>
                        </span>
                        <span class="db-col">
                            <label>Price</label>
                            <input type="number" class="database-field-value" value="${item.price || 0}" data-field="price" data-item-id="${item.id}">
                        </span>
                        <span class="db-col">
                            <label>Scope</label>
                            <select class="database-field-value" data-field="scope" data-item-id="${item.id}">
                                ${scopeNames.map((name, idx) => `<option value="${idx}" ${item.scope === idx ? 'selected' : ''}>${name}</option>`).join('')}
                            </select>
                        </span>
                        <span class="db-col">
                            <label>Occasion</label>
                            <select class="database-field-value" data-field="occasion" data-item-id="${item.id}">
                                ${occasionNames.map((name, idx) => `<option value="${idx}" ${item.occasion === idx ? 'selected' : ''}>${name}</option>`).join('')}
                            </select>
                        </span>
                    </div>
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>Consumable</label>
                            <span style="display: flex; align-items: center; gap: 8px;">
                                <input type="checkbox" class="system-checkbox" ${item.consumable ? 'checked' : ''} data-field="consumable" data-item-id="${item.id}">
                                <span style="color: var(--color-text-muted); font-size: 11px;">${tt('Item is removed from inventory after use')}</span>
                            </span>
                        </span>
                    </div>
                </div></div>
            </div>
        `;
        // General flows into the two-column grid with the other sections

        // Add icon to the designated container after the DOM is ready
        setTimeout(() => {
            const iconContainer = document.getElementById(`item-icon-container-${item.id}`);
            if (iconContainer) {
                this.parentEditor.addDatabasePreview(iconContainer, item, 'items');
            }
        }, 0);

        // Grid wrapper for all sections
        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';
        gridWrapper.appendChild(generalSection);

        // --- Invocation Section ---
        const invocationSection = document.createElement('div');
        invocationSection.className = 'database-section';
        invocationSection.innerHTML = `
            <div class="database-section-header">Invocation</div>
            <div class="database-section-content">
                <div class="db-form">
                    <div class="db-row-pair">
                        <label>Speed</label>
                        <input type="number" class="database-field-value" value="${item.speed || 0}" data-field="speed" data-item-id="${item.id}">
                        <label>Success %</label>
                        <input type="number" class="database-field-value" value="${item.successRate != null ? item.successRate : 100}" data-field="successRate" data-item-id="${item.id}">
                    </div>
                    <div class="db-row-pair">
                        <label>Repeats</label>
                        <input type="number" class="database-field-value" value="${item.repeats || 1}" min="1" data-field="repeats" data-item-id="${item.id}">
                        <label>TP Gain</label>
                        <input type="number" class="database-field-value" value="${item.tpGain || 0}" data-field="tpGain" data-item-id="${item.id}">
                    </div>
                    <div class="db-row-pair">
                        <label>Hit Type</label>
                        <select class="database-field-value" data-field="hitType" data-item-id="${item.id}">
                            ${hitTypeNames.map((name, idx) => `<option value="${idx}" ${item.hitType === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                        <label>${tt('Animation')}</label>
                        <span style="display: flex; min-width: 0;">
                            <button type="button" class="database-field-value db-anim-picker" data-target-field="animationId" data-allow-normal-attack="1" data-rr-i18n-skip>${animationLabel(item.animationId || 0)}</button>
                            <input type="hidden" value="${item.animationId || 0}" data-field="animationId" data-item-id="${item.id}">
                        </span>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(invocationSection);

        // --- Damage Section ---
        const damage = item.damage || { type: 0, elementId: -1, formula: '0', variance: 20, critical: false };
        const damageSection = document.createElement('div');
        damageSection.className = 'database-section';
        damageSection.innerHTML = `
            <div class="database-section-header">Damage</div>
            <div class="database-section-content">
                <div class="db-form">
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>Formula</label>
                            <input type="text" class="database-field-value" style="font-family: monospace;" value="${damage.formula || '0'}" data-field="damage.formula" data-item-id="${item.id}">
                        </span>
                    </div>
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>Type</label>
                            <select class="database-field-value" data-field="damage.type" data-item-id="${item.id}">
                                ${damageTypeNames.map((name, idx) => `<option value="${idx}" ${damage.type === idx ? 'selected' : ''}>${name}</option>`).join('')}
                            </select>
                        </span>
                        <span class="db-col">
                            <label>Element</label>
                            <select class="database-field-value" data-field="damage.elementId" data-item-id="${item.id}">
                                <option value="-1" ${damage.elementId === -1 ? 'selected' : ''}>${tt('Normal Attack')}</option>
                                ${elements.map((name, idx) => idx > 0 && name ? `<option value="${idx}" ${damage.elementId === idx ? 'selected' : ''}>${name}</option>` : '').join('')}
                            </select>
                        </span>
                        <span class="db-col">
                            <label>Variance %</label>
                            <input type="number" class="database-field-value" value="${damage.variance != null ? damage.variance : 20}" data-field="damage.variance" data-item-id="${item.id}">
                        </span>
                        <span class="db-col">
                            <label>Critical</label>
                            <input type="checkbox" class="system-checkbox" ${damage.critical ? 'checked' : ''} data-field="damage.critical" data-item-id="${item.id}">
                        </span>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(damageSection);

        // --- Effects Section ---
        const effectsSection = document.createElement('div');
        effectsSection.className = 'database-section';
        effectsSection.innerHTML = `
            <div class="database-section-header">Effects</div>
            <div class="database-section-content">
                <table class="traits-table" id="item-effects-table-${item.id}">
                    <thead>
                        <tr>
                            <th style="width: 3px; padding: 0; border: none; background: transparent;"></th>
                            <th>Effect</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${item.effects && item.effects.length > 0 ?
                            item.effects.map((effect, index) => `
                                <tr class="effect-row" data-effect-index="${index}">
                                    <td class="effect-indicator" style="width: 3px; padding: 0; border: none; background: transparent;"></td>
                                    <td>${DatabaseEffectEditor.getEffectName(effect.code)}</td>
                                    <td>${DatabaseEffectEditor.getEffectValue(effect, this.databaseManager)}</td>
                                </tr>
                            `).join('') :
                            '<tr><td style="width: 3px; padding: 0; border: none; background: transparent;"></td><td colspan="2" style="text-align: center; color: var(--color-text-muted); font-style: italic; padding: 12px;">No effects</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
        gridWrapper.appendChild(effectsSection);

        // Setup effect interaction after DOM is ready
        setTimeout(() => {
            const effectsTable = document.getElementById(`item-effects-table-${item.id}`);
            if (effectsTable) {
                this.setupEffectInteraction(effectsTable, item);
                this.setupEffectsContextMenu(effectsTable, item);
            }
        }, 0);

        // --- Note Section ---
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-item-id="${item.id}">${item.note || ''}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners for all editable fields
        setTimeout(() => {
            AnimationPickerModal.bindTriggers(container, this.databaseManager, this.projectManager);
            const editableFields = container.querySelectorAll('[data-item-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const itemId = parseInt(e.target.dataset.itemId);
                    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                    this.updateItemField(itemId, fieldName, value);
                });
            });
        }, 0);
    }

    updateItemField(itemId, fieldName, value) {
        const item = this.databaseManager.getItem(itemId);
        if (!item) return;

        // Handle nested damage fields (e.g. "damage.type", "damage.formula")
        if (fieldName.startsWith('damage.')) {
            const subField = fieldName.split('.')[1];
            if (!item.damage) {
                item.damage = { type: 0, elementId: -1, formula: '0', variance: 20, critical: false };
            }
            // Boolean sub-fields
            if (subField === 'critical') {
                item.damage[subField] = !!value;
            }
            // String sub-fields
            else if (subField === 'formula') {
                item.damage[subField] = value;
            }
            // Numeric sub-fields
            else {
                item.damage[subField] = parseInt(value) || 0;
            }
            console.log(`Updated item ${itemId} damage.${subField} to:`, item.damage[subField]);
        }
        // Handle boolean fields
        else if (fieldName === 'consumable') {
            item[fieldName] = !!value;
            console.log(`Updated item ${itemId} field ${fieldName} to:`, item[fieldName]);
        }
        // Handle numeric fields
        else if (['itypeId', 'price', 'scope', 'occasion', 'speed', 'successRate', 'repeats', 'hitType', 'animationId', 'tpGain'].includes(fieldName)) {
            item[fieldName] = parseInt(value) || 0;
            console.log(`Updated item ${itemId} field ${fieldName} to:`, item[fieldName]);
        }
        // Handle string fields (name, description, note)
        else {
            item[fieldName] = value;
            console.log(`Updated item ${itemId} field ${fieldName} to:`, value);
        }

        this.databaseManager.updateItem(itemId, item);
    }

    setupEffectInteraction(table, item) {
        const rows = table.querySelectorAll('.effect-row');

        rows.forEach(row => {
            const indicator = row.querySelector('.effect-indicator');
            const contentCells = Array.from(row.querySelectorAll('td:not(.effect-indicator)'));

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
                    const ind = r.querySelector('.effect-indicator');
                    if (ind) ind.style.setProperty('background-color', 'transparent', 'important');
                    const cells = Array.from(r.querySelectorAll('td:not(.effect-indicator)'));
                    cells.forEach(cell => cell.style.setProperty('background-color', '', 'important'));
                });

                row.classList.add('selected');
                if (indicator) {
                    indicator.style.setProperty('background-color', 'var(--color-accent-bright)', 'important');
                }
                contentCells.forEach(cell => {
                    cell.style.setProperty('background-color', 'var(--color-bg-panel)', 'important');
                });
            });
        });
    }

    setupEffectsContextMenu(table, item) {
        table.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            const row = e.target.closest('.effect-row');
            const effectIndex = row ? parseInt(row.dataset.effectIndex) : null;

            const existingMenu = document.getElementById('effects-context-menu');
            if (existingMenu) existingMenu.remove();

            const menu = document.createElement('div');
            menu.id = 'effects-context-menu';
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
                { label: 'Add', action: () => this.addEffect(item), enabled: true },
                { label: 'Edit', action: () => this.editEffect(item, effectIndex), enabled: effectIndex !== null },
                { label: 'Cut', action: () => this.cutEffect(item, effectIndex), enabled: effectIndex !== null },
                { label: 'Copy', action: () => this.copyEffect(item, effectIndex), enabled: effectIndex !== null },
                { label: 'Paste', action: () => this.pasteEffect(item), enabled: this.effectsClipboard !== null },
                { label: 'Delete', action: () => this.deleteEffect(item, effectIndex), enabled: effectIndex !== null }
            ];

            menuItems.forEach(menuItemDef => {
                const menuItem = document.createElement('div');
                menuItem.textContent = menuItemDef.label;
                menuItem.style.cssText = `
                    padding: 8px 16px;
                    cursor: ${menuItemDef.enabled ? 'pointer' : 'not-allowed'};
                    color: ${menuItemDef.enabled ? 'var(--color-text-strong)' : 'var(--color-text-dim)'};
                    transition: background 0.1s;
                `;

                if (menuItemDef.enabled) {
                    menuItem.addEventListener('mouseenter', () => {
                        menuItem.style.background = 'var(--color-border)';
                    });
                    menuItem.addEventListener('mouseleave', () => {
                        menuItem.style.background = 'transparent';
                    });
                    menuItem.addEventListener('click', () => {
                        menuItemDef.action();
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

    addEffect(item) {
        if (!item.effects) item.effects = [];

        this.effectEditor.showEffectEditorModal(item, -1, (updatedEntry) => {
            this.databaseManager.updateItem(updatedEntry.id, updatedEntry);
            this.refreshItemDetail(updatedEntry);
        });
    }

    editEffect(item, effectIndex) {
        if (effectIndex === null) return;

        this.effectEditor.showEffectEditorModal(item, effectIndex, (updatedEntry) => {
            this.databaseManager.updateItem(updatedEntry.id, updatedEntry);
            this.refreshItemDetail(updatedEntry);
        });
    }

    cutEffect(item, effectIndex) {
        if (effectIndex === null || !item.effects) return;
        this.effectsClipboard = { ...item.effects[effectIndex] };
        item.effects.splice(effectIndex, 1);
        this.databaseManager.updateItem(item.id, item);
        this.refreshItemDetail(item);
    }

    copyEffect(item, effectIndex) {
        if (effectIndex === null || !item.effects) return;
        this.effectsClipboard = { ...item.effects[effectIndex] };
    }

    pasteEffect(item) {
        if (!this.effectsClipboard) return;
        if (!item.effects) item.effects = [];
        item.effects.push({ ...this.effectsClipboard });
        this.databaseManager.updateItem(item.id, item);
        this.refreshItemDetail(item);
    }

    deleteEffect(item, effectIndex) {
        if (effectIndex === null || !item.effects) return;
        item.effects.splice(effectIndex, 1);
        this.databaseManager.updateItem(item.id, item);
        this.refreshItemDetail(item);
    }

    refreshItemDetail(item) {
        const container = document.querySelector('.database-detail-panel');
        if (container) {
            container.innerHTML = '';
            this.showItemDetail(container, item);
        } else {
            console.warn('DatabaseItemEditor.refreshItemDetail - Could not find detail panel container!');
        }
    }
}
