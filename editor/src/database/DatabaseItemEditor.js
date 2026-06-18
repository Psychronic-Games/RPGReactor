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

        // --- General Settings ---
        const generalWrapper = document.createElement('div');
        generalWrapper.style.marginBottom = '16px';

        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content" style="display: grid; grid-template-columns: auto 1fr; gap: 18px; align-items: start;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
                    <label class="rr-form-label" style="font-size: 11px;">Icon</label>
                    <div id="item-icon-container-${item.id}"></div>
                </div>
                <div class="rr-form-grid">
                    <label>Name</label>
                    <input type="text" class="database-field-value" value="${item.name || ''}" data-field="name" data-item-id="${item.id}">

                    <div class="rr-form-full">
                        <label class="rr-form-label" style="display: block; text-align: left; margin-bottom: 4px;">Description</label>
                        <textarea class="database-field-value" rows="2" style="width: 100%; box-sizing: border-box;" data-field="description" data-item-id="${item.id}">${item.description || ''}</textarea>
                    </div>

                    <div class="rr-form-quad">
                        <label>Item Type</label>
                        <select class="database-field-value" data-field="itypeId" data-item-id="${item.id}">
                            <option value="1" ${item.itypeId === 1 ? 'selected' : ''}>${tt('Regular Item')}</option>
                            <option value="2" ${item.itypeId === 2 ? 'selected' : ''}>${tt('Key Item')}</option>
                        </select>
                        <label>Price</label>
                        <input type="number" class="database-field-value" value="${item.price || 0}" data-field="price" data-item-id="${item.id}">
                        <label>Scope</label>
                        <select class="database-field-value" data-field="scope" data-item-id="${item.id}">
                            ${scopeNames.map((name, idx) => `<option value="${idx}" ${item.scope === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                        <label>Occasion</label>
                        <select class="database-field-value" data-field="occasion" data-item-id="${item.id}">
                            ${occasionNames.map((name, idx) => `<option value="${idx}" ${item.occasion === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>

                    <label>Consumable</label>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" ${item.consumable ? 'checked' : ''} data-field="consumable" data-item-id="${item.id}">
                        <span style="color: var(--color-text-muted); font-size: 11px;">${tt('Item is removed from inventory after use')}</span>
                    </div>
                </div>
            </div>
        `;
        generalWrapper.appendChild(generalSection);
        wrapper.appendChild(generalWrapper);

        // Add icon to the designated container after the DOM is ready
        setTimeout(() => {
            const iconContainer = document.getElementById(`item-icon-container-${item.id}`);
            if (iconContainer) {
                this.parentEditor.addDatabasePreview(iconContainer, item, 'items');
            }
        }, 0);

        // Grid wrapper for sections below general
        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';

        // --- Invocation Section ---
        const invocationSection = document.createElement('div');
        invocationSection.className = 'database-section';
        invocationSection.innerHTML = `
            <div class="database-section-header">Invocation</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Speed:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${item.speed || 0}" data-field="speed" data-item-id="${item.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Success Rate:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${item.successRate != null ? item.successRate : 100}" data-field="successRate" data-item-id="${item.id}">
                        <span style="color: var(--color-text-muted); margin-left: 4px;">%</span>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Repeats:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${item.repeats || 1}" min="1" data-field="repeats" data-item-id="${item.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Hit Type:</label>
                        <select class="database-field-value" style="width: 150px;" data-field="hitType" data-item-id="${item.id}">
                            ${hitTypeNames.map((name, idx) => `<option value="${idx}" ${item.hitType === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Animation ID:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${item.animationId || 0}" data-field="animationId" data-item-id="${item.id}">
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
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Type:</label>
                        <select class="database-field-value" style="width: 150px;" data-field="damage.type" data-item-id="${item.id}">
                            ${damageTypeNames.map((name, idx) => `<option value="${idx}" ${damage.type === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Element:</label>
                        <select class="database-field-value" style="width: 150px;" data-field="damage.elementId" data-item-id="${item.id}">
                            <option value="-1" ${damage.elementId === -1 ? 'selected' : ''}>${tt('Normal Attack')}</option>
                            ${elements.map((name, idx) => idx > 0 && name ? `<option value="${idx}" ${damage.elementId === idx ? 'selected' : ''}>${name}</option>` : '').join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Formula:</label>
                        <input type="text" class="database-field-value" style="font-family: monospace;" value="${damage.formula || '0'}" data-field="damage.formula" data-item-id="${item.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Variance:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${damage.variance != null ? damage.variance : 20}" data-field="damage.variance" data-item-id="${item.id}">
                        <span style="color: var(--color-text-muted); margin-left: 4px;">%</span>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Critical:</label>
                        <input type="checkbox" ${damage.critical ? 'checked' : ''} data-field="damage.critical" data-item-id="${item.id}">
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(damageSection);

        // --- Effects Section ---
        const effectsSection = document.createElement('div');
        effectsSection.className = 'database-section';
        effectsSection.style.gridColumn = '1 / -1';
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
        noteSection.style.gridColumn = '1 / -1';
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
        else if (['itypeId', 'price', 'scope', 'occasion', 'speed', 'successRate', 'repeats', 'hitType', 'animationId'].includes(fieldName)) {
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
