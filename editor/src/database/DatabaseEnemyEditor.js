/**
 * DatabaseEnemyEditor - Editor for managing enemy database entries
 * Handles display and editing of enemy properties including parameters,
 * drop items, action patterns, and traits with full CRUD support.
 */

class DatabaseEnemyEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this.currentEnemy = null;
        this.traitsClipboard = null;
        this.traitEditor = new DatabaseTraitEditor(databaseManager, commonUI);
    }

    // ==========================================
    // MAIN DETAIL VIEW
    // ==========================================

    showEnemyDetail(container, enemy) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        this.currentEnemy = enemy;

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.height = '100%';
        wrapper.style.padding = '16px';
        wrapper.style.position = 'relative';

        // Top row: General + Parameters + Drop Items side by side
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display: flex; gap: 16px; margin-bottom: 16px;';

        // General Settings
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.style.flex = '1';
        generalSection.style.minWidth = '0';
        generalSection.innerHTML = `
            <div class="database-section-header">${tt('General')}</div>
            <div class="database-section-content">
                <div class="db-form" style="margin-bottom: 8px;">
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>${tt('Name')}</label>
                            <input type="text" class="database-field-value" value="${this.escapeHTML(enemy.name || '')}" data-field="name" data-enemy-id="${enemy.id}">
                        </span>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">${tt('Battler Image:')}</label>
                        <span class="database-field-value" style="display: inline-block; width: 150px; padding: 4px 6px; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); border-radius: 3px; color: var(--color-text); font-size: 12px; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${enemy.battlerName ? this.escapeHTML(enemy.battlerName) : tt('(None)')}</span>
                        <button id="enemy-change-battler-${enemy.id}" class="rr-btn-chip" style="vertical-align: middle;">${tt('Change...')}</button>
                    </div>
                </div>
                <div id="enemy-battler-preview-${enemy.id}" style="min-height: 100px; background: var(--color-bg-base); border: 1px solid var(--color-border); border-radius: 4px; display: flex; align-items: center; justify-content: center; margin: 4px 0 8px 0; overflow: hidden; padding: 8px;">
                    <span style="color: var(--color-border-input); font-size: 11px;">${tt('(No battler)')}</span>
                </div>
                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label class="database-field-label">${tt('Battler Hue:')}</label>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="range" id="enemy-hue-slider-${enemy.id}" min="0" max="360" value="${this.escapeHTML(enemy.battlerHue || 0)}" style="flex: 1; accent-color: var(--color-accent-bright);">
                            <input type="number" id="enemy-hue-number-${enemy.id}" class="database-field-value database-field-value-small" value="${this.escapeHTML(enemy.battlerHue || 0)}" min="0" max="360" data-field="battlerHue" data-enemy-id="${enemy.id}" style="width: 55px;">
                        </div>
                    </div>
                </div>
                <div class="db-form" style="margin-top: 8px;">
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>${tt('EXP')}</label>
                            <input type="number" class="database-field-value" value="${this.escapeHTML(enemy.exp || 0)}" min="0" data-field="exp" data-enemy-id="${enemy.id}">
                        </span>
                        <span class="db-col">
                            <label>${tt('Gold')}</label>
                            <input type="number" class="database-field-value" value="${this.escapeHTML(enemy.gold || 0)}" min="0" data-field="gold" data-enemy-id="${enemy.id}">
                        </span>
                    </div>
                </div>
            </div>
        `;
        topRow.appendChild(generalSection);

        // Parameters Section
        const params = enemy.params || [0, 0, 0, 0, 0, 0, 0, 0];
        const paramNames = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'].map(name => tt(name));
        const paramsSection = document.createElement('div');
        paramsSection.className = 'database-section';
        paramsSection.style.flexShrink = '0';
        paramsSection.innerHTML = `
            <div class="database-section-header">${tt('Parameters')}</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>${tt('Parameter')}</th>
                            <th>${tt('Value')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${paramNames.map((name, idx) => `
                            <tr>
                                <td>${name}</td>
                                <td>
                                    <input type="number"
                                           class="database-field-value database-field-value-small"
                                           value="${this.escapeHTML(params[idx] || 0)}"
                                           data-field="params"
                                           data-param-index="${idx}"
                                           data-enemy-id="${enemy.id}"
                                           style="width: 80px; background: var(--color-bg-panel);">
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        topRow.appendChild(paramsSection);

        // Drop Items Section (3 fixed slots)
        const dropItemsSection = document.createElement('div');
        dropItemsSection.className = 'database-section';
        dropItemsSection.style.flex = '1';
        dropItemsSection.style.minWidth = '0';
        dropItemsSection.innerHTML = `
            <div class="database-section-header">${tt('Drop Items')}</div>
            <div class="database-section-content">
                ${this.buildDropItemsHTML(enemy)}
            </div>
        `;
        topRow.appendChild(dropItemsSection);

        wrapper.appendChild(topRow);

        // Battler change button listener + preview + hue slider
        setTimeout(() => {
            const battlerBtn = document.getElementById(`enemy-change-battler-${enemy.id}`);
            if (battlerBtn) {
                battlerBtn.addEventListener('click', () => this.selectBattlerImage(enemy));
                battlerBtn.addEventListener('mouseenter', () => { battlerBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; });
                battlerBtn.addEventListener('mouseleave', () => { battlerBtn.style.backgroundColor = 'var(--color-bg-menubar)'; });
            }
            this.loadBattlerPreview(enemy);

            // Hue slider <-> number sync + live preview
            const hueSlider = document.getElementById(`enemy-hue-slider-${enemy.id}`);
            const hueNumber = document.getElementById(`enemy-hue-number-${enemy.id}`);
            const previewContainer = document.getElementById(`enemy-battler-preview-${enemy.id}`);

            if (hueSlider && hueNumber) {
                const applyHue = (val) => {
                    if (previewContainer) {
                        previewContainer.style.filter = val > 0 ? `hue-rotate(${val}deg)` : '';
                    }
                };

                hueSlider.addEventListener('input', () => {
                    hueNumber.value = hueSlider.value;
                    applyHue(parseInt(hueSlider.value));
                });
                hueSlider.addEventListener('change', () => {
                    hueNumber.value = hueSlider.value;
                    hueNumber.dispatchEvent(new Event('change', { bubbles: true }));
                });
                hueNumber.addEventListener('input', () => {
                    const v = Math.max(0, Math.min(360, parseInt(hueNumber.value) || 0));
                    hueSlider.value = v;
                    applyHue(v);
                });

                // Apply initial hue
                applyHue(parseInt(hueSlider.value));
            }
        }, 0);

        // Action Patterns Section
        const actionsSection = document.createElement('div');
        actionsSection.className = 'database-section';
        actionsSection.style.marginBottom = '16px';
        actionsSection.innerHTML = `
            <div class="database-section-header">${tt('Action Patterns')}</div>
            <div class="database-section-content">
                <table class="traits-table" id="enemy-actions-table-${enemy.id}">
                    <thead>
                        <tr>
                            <th style="width: 3px; padding: 0; border: none; background: transparent;"></th>
                            <th>${tt('Skill')}</th>
                            <th>${tt('Condition')}</th>
                            <th>${tt('Rating')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.buildActionsHTML(enemy)}
                    </tbody>
                </table>
            </div>
        `;
        wrapper.appendChild(actionsSection);

        // Setup action interaction after DOM is ready
        setTimeout(() => {
            const actionsTable = document.getElementById(`enemy-actions-table-${enemy.id}`);
            if (actionsTable) {
                this.setupActionInteraction(actionsTable, enemy);
                this.setupActionsContextMenu(actionsTable, enemy);
            }
        }, 0);

        // Traits + Note row (side by side)
        const traitsNoteRow = document.createElement('div');
        traitsNoteRow.style.cssText = 'display: flex; gap: 16px;';

        // Traits Section
        const traitsSection = document.createElement('div');
        traitsSection.className = 'database-section';
        traitsSection.style.flex = '1';
        traitsSection.style.minWidth = '0';
        traitsSection.setAttribute('tabindex', '0');
        traitsSection.style.outline = 'none';
        traitsSection.innerHTML = `
            <div class="database-section-header">${tt('Traits')}</div>
            <div class="database-section-content">
                <table class="traits-table" id="enemy-traits-table-${enemy.id}">
                    <thead>
                        <tr>
                            <th style="width: 3px; padding: 0; border: none; background: transparent;"></th>
                            <th>${tt('Type')}</th>
                            <th>${tt('Content')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${enemy.traits && enemy.traits.length > 0 ?
                            enemy.traits.map((trait, index) => `
                                <tr class="trait-row" data-trait-index="${index}">
                                    <td class="trait-indicator" style="width: 3px; padding: 0; border: none; background: transparent;"></td>
                                    <td>${this.escapeHTML(this.commonUI.getTraitName(trait.code))}</td>
                                    <td>${this.escapeHTML(this.commonUI.getTraitValue(trait))}</td>
                                </tr>
                            `).join('') :
                            `<tr><td style="width: 3px; padding: 0; border: none; background: transparent;"></td><td colspan="2" style="text-align: center; color: var(--color-text-muted); font-style: italic; padding: 12px;">${tt('No traits')}</td></tr>`}
                    </tbody>
                </table>
                <div class="trait-action-buttons" style="display: flex; gap: 6px; margin-top: 8px;">
                    <button class="trait-btn-add" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-strong); border-radius: 4px; cursor: pointer; font-size: 12px;">${tt('Add')}</button>
                    <button class="trait-btn-edit" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>${tt('Edit')}</button>
                    <button class="trait-btn-copy" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>${tt('Copy')}</button>
                    <button class="trait-btn-paste" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-strong); border-radius: 4px; cursor: pointer; font-size: 12px;">${tt('Paste')}</button>
                    <button class="trait-btn-delete" style="padding: 4px 12px; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-dim); border-radius: 4px; cursor: default; font-size: 12px;" disabled>${tt('Delete')}</button>
                </div>
            </div>
        `;
        traitsNoteRow.appendChild(traitsSection);

        // Note Section
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.style.flex = '1';
        noteSection.style.minWidth = '0';
        noteSection.style.display = 'flex';
        noteSection.style.flexDirection = 'column';
        noteSection.innerHTML = `
            <div class="database-section-header">${tt('Note')}</div>
            <div class="database-section-content" style="flex: 1; display: flex; flex-direction: column;">
                <textarea class="database-field-value" style="width: 100%; flex: 1; min-height: 60px; resize: vertical;" data-field="note" data-enemy-id="${enemy.id}">${this.escapeHTML(enemy.note || '')}</textarea>
            </div>
        `;
        traitsNoteRow.appendChild(noteSection);

        wrapper.appendChild(traitsNoteRow);

        // Setup trait interaction after DOM is ready
        setTimeout(() => {
            const traitsTable = document.getElementById(`enemy-traits-table-${enemy.id}`);
            if (traitsTable) {
                const traitsSect = traitsTable.closest('.database-section');
                this.setupTraitInteraction(traitsTable, enemy);
                this.setupTraitsContextMenu(traitsTable, enemy);
                if (traitsSect) {
                    this.setupTraitActionButtons(traitsSect, traitsTable, enemy);
                    this.setupTraitKeyboardShortcuts(traitsSect, traitsTable, enemy);
                    this.updateTraitButtonStates(traitsSect);
                }
            }
        }, 0);

        container.appendChild(wrapper);

        // Add event listeners for all editable fields
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-enemy-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const enemyId = parseInt(e.target.dataset.enemyId);
                    const paramIndex = e.target.dataset.paramIndex;
                    const dropIndex = e.target.dataset.dropIndex;
                    const dropField = e.target.dataset.dropField;
                    const value = e.target.value;
                    this.updateEnemyField(enemyId, fieldName, value, paramIndex, dropIndex, dropField);
                });
            });
            // Setup drop kind change listeners for show/hide behavior
            this.setupDropKindListeners(enemy);
        }, 0);
    }

    // ==========================================
    // DROP ITEMS
    // ==========================================

    buildDropItemsHTML(enemy) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (!enemy.dropItems) {
            enemy.dropItems = [
                { kind: 0, dataId: 1, denominator: 1 },
                { kind: 0, dataId: 1, denominator: 1 },
                { kind: 0, dataId: 1, denominator: 1 }
            ];
        }
        // Ensure exactly 3 slots
        while (enemy.dropItems.length < 3) {
            enemy.dropItems.push({ kind: 0, dataId: 1, denominator: 1 });
        }

        let html = '';
        for (let i = 0; i < 3; i++) {
            const drop = enemy.dropItems[i];
            html += `
                <div style="margin-bottom: 10px; padding: 8px; background: var(--color-bg-base); border: 1px solid var(--color-border); border-radius: 4px;">
                    <div style="font-size: 11px; color: var(--color-text-muted); margin-bottom: 4px;">${tt('Drop Slot')} ${i + 1}</div>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <label class="database-field-label" style="font-size: 11px;">${tt('Kind:')}</label>
                            <select class="database-field-value" style="width: 90px; font-size: 11px;"
                                    data-field="dropItems" data-drop-index="${i}" data-drop-field="kind" data-enemy-id="${enemy.id}">
                                <option value="0" ${drop.kind === 0 ? 'selected' : ''}>${tt('None')}</option>
                                <option value="1" ${drop.kind === 1 ? 'selected' : ''}>${tt('Item')}</option>
                                <option value="2" ${drop.kind === 2 ? 'selected' : ''}>${tt('Weapon')}</option>
                                <option value="3" ${drop.kind === 3 ? 'selected' : ''}>${tt('Armor')}</option>
                            </select>
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px; ${drop.kind === 0 ? 'display: none;' : ''}" id="enemy-drop-dataid-wrapper-${enemy.id}-${i}">
                            <label class="database-field-label" style="font-size: 11px;">${tt('Item:')}</label>
                            <select class="database-field-value" style="width: 150px; font-size: 11px;"
                                    data-field="dropItems" data-drop-index="${i}" data-drop-field="dataId" data-enemy-id="${enemy.id}"
                                    id="enemy-drop-dataid-${enemy.id}-${i}">
                                ${this.getDropDataIdOptions(drop.kind, drop.dataId)}
                            </select>
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px; ${drop.kind === 0 ? 'display: none;' : ''}" id="enemy-drop-denom-wrapper-${enemy.id}-${i}">
                            <label class="database-field-label" style="font-size: 11px;">1 /</label>
                            <input type="number" class="database-field-value database-field-value-small" style="width: 60px; font-size: 11px;"
                                   value="${drop.denominator || 1}" min="1"
                                   data-field="dropItems" data-drop-index="${i}" data-drop-field="denominator" data-enemy-id="${enemy.id}">
                        </div>
                    </div>
                </div>
            `;
        }
        return html;
    }

    getDropDataIdOptions(kind, selectedId) {
        let items = [];
        if (kind === 1) {
            items = this.databaseManager.getItems() || [];
        } else if (kind === 2) {
            items = this.databaseManager.getWeapons() || [];
        } else if (kind === 3) {
            items = this.databaseManager.getArmors() || [];
        }
        if (items.length === 0) return '';

        return items
            .filter(item => item && item.id > 0)
            .map(item => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>#${item.id} ${this.escapeHTML(item.name || '')}</option>`)
            .join('');
    }

    setupDropKindListeners(enemy) {
        for (let i = 0; i < 3; i++) {
            const kindSelect = document.querySelector(`select[data-drop-index="${i}"][data-drop-field="kind"][data-enemy-id="${enemy.id}"]`);
            if (!kindSelect) continue;

            kindSelect.addEventListener('change', (e) => {
                const newKind = parseInt(e.target.value);
                const dropIndex = parseInt(e.target.dataset.dropIndex);

                const dataIdWrapper = document.getElementById(`enemy-drop-dataid-wrapper-${enemy.id}-${dropIndex}`);
                const denomWrapper = document.getElementById(`enemy-drop-denom-wrapper-${enemy.id}-${dropIndex}`);
                const dataIdSelect = document.getElementById(`enemy-drop-dataid-${enemy.id}-${dropIndex}`);

                if (newKind === 0) {
                    if (dataIdWrapper) dataIdWrapper.style.display = 'none';
                    if (denomWrapper) denomWrapper.style.display = 'none';
                } else {
                    if (dataIdWrapper) dataIdWrapper.style.display = '';
                    if (denomWrapper) denomWrapper.style.display = '';
                    if (dataIdSelect) {
                        dataIdSelect.innerHTML = this.getDropDataIdOptions(newKind, 1);
                    }
                }
            });
        }
    }

    // ==========================================
    // ACTION PATTERNS
    // ==========================================

    buildActionsHTML(enemy) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const conditionNames = ['Always', 'Turn', 'HP', 'MP', 'State', 'Party Level', 'Switch'];

        if (!enemy.actions || enemy.actions.length === 0) {
            return `<tr><td colspan="4" style="text-align: center; color: var(--color-text-muted);">${tt('No action patterns (right-click to add)')}</td></tr>`;
        }

        return enemy.actions.map((action, index) => {
            const skills = this.databaseManager.getSkills() || [];
            const skill = skills.find(s => s && s.id === action.skillId);
            const skillName = skill ? skill.name : `${tt('Skill')} #${action.skillId}`;

            let condDesc = tt(conditionNames[action.conditionType] || 'Unknown');
            if (action.conditionType === 1) {
                condDesc = `${tt('Turn')} ${action.conditionParam1}a + ${action.conditionParam2}b`;
            } else if (action.conditionType === 2) {
                condDesc = `${tt('HP')} ${action.conditionParam1}% ~ ${action.conditionParam2}%`;
            } else if (action.conditionType === 3) {
                condDesc = `${tt('MP')} ${action.conditionParam1}% ~ ${action.conditionParam2}%`;
            } else if (action.conditionType === 4) {
                const states = this.databaseManager.getStates() || [];
                const state = states.find(s => s && s.id === action.conditionParam1);
                condDesc = `${tt('State')}: ${state ? state.name : '#' + action.conditionParam1}`;
            } else if (action.conditionType === 5) {
                condDesc = `${tt('Party Lv')} >= ${action.conditionParam1}`;
            } else if (action.conditionType === 6) {
                condDesc = `${tt('Switch')} #${action.conditionParam1} ${tt('ON')}`;
            }

            return `
                <tr class="action-row" data-action-index="${index}">
                    <td class="action-indicator" style="width: 3px; padding: 0; border: none; background: transparent;"></td>
                    <td>${this.escapeHTML(skillName)}</td>
                    <td>${this.escapeHTML(condDesc)}</td>
                    <td>${action.rating}</td>
                </tr>
            `;
        }).join('');
    }

    setupActionInteraction(table, enemy) {
        const rows = table.querySelectorAll('.action-row');

        rows.forEach(row => {
            const indicator = row.querySelector('.action-indicator');
            const contentCells = Array.from(row.querySelectorAll('td:not(.action-indicator)'));

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
                    const ind = r.querySelector('.action-indicator');
                    if (ind) ind.style.setProperty('background-color', 'transparent', 'important');
                    const cells = Array.from(r.querySelectorAll('td:not(.action-indicator)'));
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

            row.addEventListener('dblclick', () => {
                const actionIndex = parseInt(row.dataset.actionIndex);
                this.editAction(enemy, actionIndex);
            });
        });
    }

    setupActionsContextMenu(table, enemy) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        table.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            const row = e.target.closest('.action-row');
            const actionIndex = row ? parseInt(row.dataset.actionIndex) : null;

            const existingMenu = document.getElementById('actions-context-menu');
            if (existingMenu) existingMenu.remove();

            const menu = document.createElement('div');
            menu.id = 'actions-context-menu';
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
                { label: 'Add', action: () => this.addAction(enemy), enabled: true },
                { label: 'Edit', action: () => this.editAction(enemy, actionIndex), enabled: actionIndex !== null },
                { label: 'Delete', action: () => this.deleteAction(enemy, actionIndex), enabled: actionIndex !== null }
            ];

            menuItems.forEach(item => {
                const menuItem = document.createElement('div');
                menuItem.textContent = tt(item.label);
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

    addAction(enemy) {
        if (!enemy.actions) enemy.actions = [];

        const newAction = { skillId: 1, conditionType: 0, conditionParam1: 0, conditionParam2: 0, rating: 5 };
        enemy.actions.push(newAction);
        this.databaseManager.updateEnemy(enemy.id, enemy);
        this.refreshEnemyDetail(enemy);
    }

    editAction(enemy, actionIndex) {
        if (actionIndex === null || !enemy.actions || actionIndex >= enemy.actions.length) return;

        const action = enemy.actions[actionIndex];
        this.showActionEditorModal(enemy, actionIndex, action);
    }

    deleteAction(enemy, actionIndex) {
        if (actionIndex === null || !enemy.actions) return;
        enemy.actions.splice(actionIndex, 1);
        this.databaseManager.updateEnemy(enemy.id, enemy);
        this.refreshEnemyDetail(enemy);
    }

    showActionEditorModal(enemy, actionIndex, action) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex; align-items: center; justify-content: center;
            z-index: 10001;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 8px;
            padding: 20px; width: 450px; max-width: 90vw;
        `;

        const skills = this.databaseManager.getSkills() || [];
        const skillOptions = skills
            .filter(s => s && s.id > 0)
            .map(s => `<option value="${s.id}" ${s.id === action.skillId ? 'selected' : ''}>#${s.id} ${this.escapeHTML(s.name || '')}</option>`)
            .join('');

        const conditionTypes = ['Always', 'Turn', 'HP', 'MP', 'State', 'Party Level', 'Switch'];
        const conditionOptions = conditionTypes
            .map((name, idx) => `<option value="${idx}" ${idx === action.conditionType ? 'selected' : ''}>${tt(name)}</option>`)
            .join('');

        const inputStyle = 'width: 100%; padding: 6px; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 12px; box-sizing: border-box;';

        modal.innerHTML = `
            <h3 style="margin: 0 0 16px 0; color: var(--color-text-strong); font-size: 15px;">${tt('Edit Action Pattern')}</h3>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div>
                    <label class="database-field-label" style="display: block; margin-bottom: 4px;">${tt('Skill:')}</label>
                    <select id="action-edit-skill" style="${inputStyle}">${skillOptions}</select>
                </div>
                <div>
                    <label class="database-field-label" style="display: block; margin-bottom: 4px;">${tt('Condition Type:')}</label>
                    <select id="action-edit-condType" style="${inputStyle}">${conditionOptions}</select>
                </div>
                <div style="display: flex; gap: 12px;">
                    <div style="flex: 1;">
                        <label class="database-field-label" style="display: block; margin-bottom: 4px;">${tt('Param 1:')}</label>
                        <input type="number" id="action-edit-param1" value="${action.conditionParam1 || 0}" style="${inputStyle}">
                    </div>
                    <div style="flex: 1;">
                        <label class="database-field-label" style="display: block; margin-bottom: 4px;">${tt('Param 2:')}</label>
                        <input type="number" id="action-edit-param2" value="${action.conditionParam2 || 0}" style="${inputStyle}">
                    </div>
                </div>
                <div>
                    <label class="database-field-label" style="display: block; margin-bottom: 4px;">${tt('Rating (1-10):')}</label>
                    <input type="number" id="action-edit-rating" value="${action.rating || 5}" min="1" max="10" style="${inputStyle}">
                </div>
            </div>
        `;

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => overlay.remove());

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.style.cssText = 'padding: 8px 16px; background: var(--color-accent); border: 1px solid var(--color-accent); color: var(--color-bg-deep); border-radius: 4px; cursor: pointer; font-weight: bold;';
        okBtn.addEventListener('click', () => {
            action.skillId = parseInt(document.getElementById('action-edit-skill').value) || 1;
            action.conditionType = parseInt(document.getElementById('action-edit-condType').value) || 0;
            // HP/MP/state-chance condition params are fractional rates
            // (0.3 = 30%); parseInt collapsed them to 0 on every OK click.
            action.conditionParam1 = parseFloat(document.getElementById('action-edit-param1').value) || 0;
            action.conditionParam2 = parseFloat(document.getElementById('action-edit-param2').value) || 0;
            action.rating = Math.max(1, Math.min(10, parseInt(document.getElementById('action-edit-rating').value) || 5));

            enemy.actions[actionIndex] = action;
            this.databaseManager.updateEnemy(enemy.id, enemy);
            overlay.remove();
            this.refreshEnemyDetail(enemy);
        });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    // ==========================================
    // TRAITS (full CRUD, same as WeaponEditor)
    // ==========================================

    setupTraitInteraction(table, enemy) {
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
                if (!isNaN(traitIndex)) {
                    this.editTrait(enemy, traitIndex);
                }
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

        const setBtn = (btn, enabled) => {
            if (!btn) return;
            btn.disabled = !enabled;
            btn.style.color = enabled ? 'var(--color-text-strong)' : 'var(--color-text-dim)';
            btn.style.cursor = enabled ? 'pointer' : 'default';
        };

        setBtn(section.querySelector('.trait-btn-edit'), hasSelection);
        setBtn(section.querySelector('.trait-btn-copy'), hasSelection);
        setBtn(section.querySelector('.trait-btn-paste'), true);
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
            } else if (e.key === 'v') {
                e.preventDefault();
                e.stopPropagation();
                this.pasteTrait(entry);
            }
        });
    }

    setupTraitsContextMenu(table, enemy) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
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
                { label: 'Add', action: () => this.addTrait(enemy), enabled: true },
                { label: 'Edit', action: () => this.editTrait(enemy, traitIndex), enabled: traitIndex !== null },
                { label: 'Cut', action: () => this.cutTrait(enemy, traitIndex), enabled: traitIndex !== null },
                { label: 'Copy', action: () => this.copyTrait(enemy, traitIndex), enabled: traitIndex !== null },
                { label: 'Paste', action: () => this.pasteTrait(enemy), enabled: true },
                { label: 'Delete', action: () => this.deleteTrait(enemy, traitIndex), enabled: traitIndex !== null },
                { label: 'Select All', action: () => this.selectAllTraits(enemy), enabled: true }
            ];

            menuItems.forEach(item => {
                const menuItem = document.createElement('div');
                menuItem.textContent = tt(item.label);
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

    addTrait(enemy) {
        if (!enemy.traits) enemy.traits = [];

        this.traitEditor.showTraitEditorModal(enemy, -1, (updatedEntry) => {
            this.databaseManager.updateEnemy(updatedEntry.id, updatedEntry);
            this.refreshEnemyDetail(updatedEntry);
        });
    }

    editTrait(enemy, traitIndex) {
        if (traitIndex === null) return;

        this.traitEditor.showTraitEditorModal(enemy, traitIndex, (updatedEntry) => {
            this.databaseManager.updateEnemy(updatedEntry.id, updatedEntry);
            this.refreshEnemyDetail(updatedEntry);
        });
    }

    async cutTrait(enemy, traitIndex) {
        if (traitIndex === null || !enemy.traits) return;
        const target = DatabaseRowClipboard.capturePasteTarget(this.parentEditor, this.projectManager, this.databaseManager, enemy.traits, traitIndex);
        const payload = this.copyTrait(enemy, traitIndex);
        if (!await DatabaseRowClipboard.confirmCut(payload)) return;
        if (this.currentEnemy !== enemy
            || !DatabaseRowClipboard.isPasteTargetCurrent(target, this.parentEditor, this.projectManager, this.databaseManager, enemy.traits)) return;
        enemy.traits.splice(traitIndex, 1);
        this.databaseManager.updateEnemy(enemy.id, enemy);
        this.refreshEnemyDetail(enemy);
    }

    copyTrait(enemy, traitIndex) {
        if (traitIndex === null || !enemy.traits) return;
        this.traitsClipboard = DatabaseRowClipboard.write('trait', enemy.traits[traitIndex], this.databaseManager);
        return this.traitsClipboard;
    }

    async pasteTrait(enemy) {
        const target = DatabaseRowClipboard.capturePasteTarget(this.parentEditor, this.projectManager, this.databaseManager, enemy.traits);
        const result = await DatabaseRowClipboard.read('trait', this.databaseManager, this.traitsClipboard);
        if (this.currentEnemy !== enemy
            || !DatabaseRowClipboard.isPasteTargetCurrent(target, this.parentEditor, this.projectManager, this.databaseManager, enemy.traits)) return;
        if (result.error) {
            DatabaseRowClipboard.showError(result);
            return;
        }
        if (!enemy.traits) enemy.traits = [];
        enemy.traits.push(result.row);
        this.databaseManager.updateEnemy(enemy.id, enemy);
        this.refreshEnemyDetail(enemy);
    }

    deleteTrait(enemy, traitIndex) {
        if (traitIndex === null || !enemy.traits) return;
        enemy.traits.splice(traitIndex, 1);
        this.databaseManager.updateEnemy(enemy.id, enemy);
        this.refreshEnemyDetail(enemy);
    }

    selectAllTraits(enemy) {
        console.log('Select all traits');
    }

    // ==========================================
    // FIELD UPDATE HANDLER
    // ==========================================

    updateEnemyField(enemyId, fieldName, value, paramIndex = null, dropIndex = null, dropField = null) {
        const enemy = this.databaseManager.getEnemy(enemyId);
        if (!enemy) return;

        // Handle params array
        if (fieldName === 'params' && paramIndex !== null) {
            if (!enemy.params) enemy.params = [0, 0, 0, 0, 0, 0, 0, 0];
            enemy.params[parseInt(paramIndex)] = parseInt(value) || 0;
            console.log(`Updated enemy ${enemyId} param[${paramIndex}] to:`, value);
        }
        // Handle drop items
        else if (fieldName === 'dropItems' && dropIndex !== null && dropField !== null) {
            if (!enemy.dropItems) {
                enemy.dropItems = [
                    { kind: 0, dataId: 1, denominator: 1 },
                    { kind: 0, dataId: 1, denominator: 1 },
                    { kind: 0, dataId: 1, denominator: 1 }
                ];
            }
            const idx = parseInt(dropIndex);
            if (dropField === 'kind') {
                enemy.dropItems[idx].kind = parseInt(value) || 0;
                // Reset dataId when kind changes
                if (enemy.dropItems[idx].kind === 0) {
                    enemy.dropItems[idx].dataId = 1;
                    enemy.dropItems[idx].denominator = 1;
                } else {
                    enemy.dropItems[idx].dataId = 1;
                }
            } else if (dropField === 'dataId') {
                enemy.dropItems[idx].dataId = parseInt(value) || 1;
            } else if (dropField === 'denominator') {
                enemy.dropItems[idx].denominator = Math.max(1, parseInt(value) || 1);
            }
            console.log(`Updated enemy ${enemyId} dropItems[${idx}].${dropField} to:`, value);
        }
        // Handle numeric fields
        else if (fieldName === 'battlerHue' || fieldName === 'exp' || fieldName === 'gold') {
            enemy[fieldName] = parseInt(value) || 0;
            console.log(`Updated enemy ${enemyId} field ${fieldName} to:`, value);
        }
        // Handle string fields (name, note)
        else {
            enemy[fieldName] = value;
            console.log(`Updated enemy ${enemyId} field ${fieldName} to:`, value);
        }

        this.databaseManager.updateEnemy(enemyId, enemy);
    }

    // ==========================================
    // BATTLER PREVIEW
    // ==========================================

    loadBattlerPreview(enemy) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = document.getElementById(`enemy-battler-preview-${enemy.id}`);
        if (!container) return;

        const battlerName = enemy.battlerName;
        if (!battlerName) {
            container.innerHTML = `<span style="color: var(--color-border-input); font-size: 11px;">${tt('(No battler)')}</span>`;
            return;
        }

        const project = this.projectManager.getCurrentProject();
        if (!project) return;

        const path = require('path');
        const fs = require('fs');

        // Search for battler image across directories
        const searchDirs = ['enemies', 'sv_enemies', 'characters'];
        let imagePath = null;
        for (const dir of searchDirs) {
            const battlerFile = RRAssetFiles.find(path.join(project.path, 'img', dir), battlerName, ['.png']);
            if (battlerFile) {
                imagePath = RRAssetFiles.toUrl(battlerFile.absolutePath);
                break;
            }
        }

        if (!imagePath) {
            container.innerHTML = `<span style="color: var(--color-border-input); font-size: 11px;">${tt('(Image not found)')}</span>`;
            return;
        }

        // Detect charset-style battler
        const firstChar = RRAssetFiles.basename(battlerName).charAt(0);
        const isBigChar = RRAssetFiles.isBigCharacter(battlerName);
        const isCharBattler = (firstChar === '!' || firstChar === '$');

        const img = new Image();
        img.onload = () => {
            container.innerHTML = '';

            if (isCharBattler) {
                // Extract single frame using canvas
                let fw, fh;
                if (isBigChar) {
                    // Big character ($): 3 cols x 4 rows
                    fw = img.naturalWidth / 3;
                    fh = img.naturalHeight / 4;
                } else {
                    // Standard charset: 12 cols x 8 rows
                    fw = img.naturalWidth / 12;
                    fh = img.naturalHeight / 8;
                }

                const canvas = document.createElement('canvas');
                canvas.width = fw;
                canvas.height = fh;
                const ctx = canvas.getContext('2d');
                // Draw middle frame (index 1) of first row (down-facing)
                ctx.drawImage(img, fw, 0, fw, fh, 0, 0, fw, fh);

                canvas.style.cssText = 'max-width: 100%; max-height: 200px; image-rendering: pixelated; object-fit: contain;';
                container.appendChild(canvas);
            } else {
                // Standard enemy: show full image
                img.style.cssText = 'max-width: 100%; max-height: 200px; image-rendering: pixelated; object-fit: contain;';
                container.appendChild(img);
            }
        };
        img.onerror = () => {
            container.innerHTML = `<span style="color: var(--color-border-input); font-size: 11px;">${tt('(Failed to load)')}</span>`;
        };
        img.src = imagePath;
    }

    // ==========================================
    // BATTLER IMAGE SELECTION
    // ==========================================

    selectBattlerImage(enemy) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const project = this.projectManager.getCurrentProject();
        if (!project) {
            alert(tt('No project loaded'));
            return;
        }

        const path = require('path');
        const fs = require('fs');
        const searchDirs = ['enemies', 'sv_enemies', 'characters'];

        // Collect files from all battler directories
        const fileMap = new Map(); // name -> record (first directory wins for preview)
        for (const dir of searchDirs) {
            const dirPath = path.join(project.path, 'img', dir);
            try {
                if (fs.existsSync(dirPath)) {
                    RRAssetFiles.listUnique(dirPath, ['.png']).forEach(file => {
                        if (!fileMap.has(file.name)) fileMap.set(file.name, file);
                    });
                }
            } catch (e) {
                console.error(`Error reading ${dir} folder:`, e);
            }
        }

        const files = Array.from(fileMap.keys()).sort();

        if (files.length === 0) {
            alert(tt('No enemy battler images found in img/enemies, sv_enemies, or characters folders'));
            return;
        }

        this.parentEditor.showImagePicker(tt('Select Enemy Battler'), files, (selectedFile) => {
            enemy.battlerName = selectedFile;
            this.databaseManager.updateEnemy(enemy.id, enemy);
            this.parentEditor?.updateStatus?.(tt('Enemy battler updated'));
            this.refreshEnemyDetail(enemy);
        }, (fileName) => {
            const file = fileMap.get(fileName);
            return file ? RRAssetFiles.toUrl(file.absolutePath) : '';
        }, enemy.battlerName);
    }

    // ==========================================
    // REFRESH
    // ==========================================

    refreshEnemyDetail(enemy) {
        const container = document.getElementById('database-detail') || document.querySelector('.database-detail-panel');
        if (container) {
            container.innerHTML = '';
            this.showEnemyDetail(container, enemy);
        } else {
            console.warn('DatabaseEnemyEditor.refreshEnemyDetail - Could not find detail panel container!');
        }
    }

    // ==========================================
    // UTILITY
    // ==========================================

    escapeHTML(str) {
        return typeof rrEscapeHtml !== 'undefined'
            ? rrEscapeHtml(str)
            : require('../utils/HtmlEscape.js')(str);
    }
}
