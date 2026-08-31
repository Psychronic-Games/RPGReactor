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
        topRow.className = 'database-enemy-top-row';
        topRow.style.cssText = 'display: flex; gap: 16px; margin-bottom: 16px;';

        // General Settings
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        // Parameters carries nine rows of label + value and needs the room;
        // General and Drop Items each give up a little. Below the 900px
        // container breakpoint the stylesheet wraps the sections instead.
        generalSection.style.flex = '0.9 1 0';
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

        if (typeof RRDatabase3DBindings !== 'undefined') {
            RRDatabase3DBindings.attachRow(generalSection.querySelector('.database-section-content'), {
                projectManager: this.projectManager,
                section: 'enemies',
                id: enemy.id
            });
        }

        // Parameters Section
        const paramRows = this.parameterRows(enemy);
        const paramsSection = document.createElement('div');
        paramsSection.className = 'database-section';
        paramsSection.style.flex = '1.6 1 0';
        paramsSection.style.minWidth = '0';
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
                        ${paramRows.map(row => `
                            <tr>
                                <td>${row.label}</td>
                                <td>
                                    <input type="number"
                                           class="database-field-value database-field-value-small enemy-param-input"
                                           value="${this.escapeHTML(row.value)}"
                                           min="0"
                                           data-field="${row.field}"
                                           ${row.index === null ? '' : `data-param-index="${row.index}"`}
                                           data-enemy-id="${enemy.id}"
                                           style="width: ${this.paramInputWidth(row.value)}; background: var(--color-bg-panel);">
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
        dropItemsSection.style.flex = '0.9 1 0';
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
        actionsSection.setAttribute('tabindex', '0');
        actionsSection.style.outline = 'none';
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
                <div class="action-action-buttons">
                    <button class="action-btn-add rr-btn-chip">${tt('Add')}</button>
                    <button class="action-btn-edit rr-btn-chip" disabled>${tt('Edit')}</button>
                    <button class="action-btn-delete rr-btn-chip" disabled>${tt('Delete')}</button>
                </div>
            </div>
        `;
        wrapper.appendChild(actionsSection);

        // Setup action interaction after DOM is ready
        setTimeout(() => {
            const actionsTable = document.getElementById(`enemy-actions-table-${enemy.id}`);
            if (actionsTable) {
                this.setupActionInteraction(actionsTable, enemy);
                this.setupActionsContextMenu(actionsTable, enemy);
                this.setupActionButtons(actionsSection, actionsTable, enemy);
                this.setupActionKeyboardShortcuts(actionsSection, actionsTable, enemy);
                this.updateActionButtonStates(actionsSection, actionsTable);
            }
        }, 0);

        // Traits + Note row (side by side)
        const traitsNoteRow = document.createElement('div');
        traitsNoteRow.className = 'database-enemy-bottom-row';
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
                            <th colspan="2">${tt('Type')}</th>
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
                <div class="trait-action-buttons">
                    <button class="trait-btn-add rr-btn-chip">${tt('Add')}</button>
                    <button class="trait-btn-edit rr-btn-chip" disabled>${tt('Edit')}</button>
                    <button class="trait-btn-copy rr-btn-chip" disabled>${tt('Copy')}</button>
                    <button class="trait-btn-paste rr-btn-chip">${tt('Paste')}</button>
                    <button class="trait-btn-delete rr-btn-chip" disabled>${tt('Delete')}</button>
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
                <textarea class="database-field-value" style="width: 100%; flex: 1 1 auto; min-height: 60px; resize: vertical;" data-field="note" data-enemy-id="${enemy.id}">${this.escapeHTML(enemy.note || '')}</textarea>
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
            this.setupDropRateListeners(enemy);
            this.setupParamInputListeners(enemy);
        }, 0);
    }

    // ==========================================
    // PARAMETERS
    // ==========================================

    /**
     * The rows of the Parameters table. Max TP is the third resource pool,
     * so it reads under Max HP and Max MP; it is a row of the table but not a
     * parameter: no param index, its own field, and so never a ninth entry in
     * the eight-slot `params` array every engine loop indexes by paramId.
     */
    parameterRows(enemy) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const params = (enemy && enemy.params) || [0, 0, 0, 0, 0, 0, 0, 0];
        const rows = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck']
            .map((name, idx) => ({ label: tt(name), value: params[idx] || 0, field: 'params', index: idx }));
        rows.splice(2, 0, { label: tt('Max TP'), value: this.enemyMaxTp(enemy), field: 'maxTp', index: null });
        return rows;
    }

    /**
     * An enemy that was never given a Max TP has no `maxTp` key, and the
     * runtime falls back to Game_BattlerBase's 100 for it; the box shows
     * that same 100 and writes nothing until the value is changed.
     */
    enemyMaxTp(enemy) {
        const raw = enemy ? enemy.maxTp : undefined;
        const authored = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '');
        const stored = authored ? Number(raw) : NaN;
        return Number.isFinite(stored) ? Math.max(0, stored) : DatabaseEnemyEditor.DEFAULT_MAX_TP;
    }

    /**
     * A value box sized to the number it holds, in `ch` (a digit in the
     * field's own font) plus the chrome beside the digits: 12px of input
     * padding, the wrapper's 1px borders and the 22px themed stepper, with
     * the remainder slack so the caret never sits against the arrows. Two
     * digits is the floor, nine the ceiling.
     */
    paramInputWidth(value) {
        const digits = String(value ?? '').replace(/[^0-9]/g, '').length;
        return `calc(${Math.min(9, Math.max(2, digits))}ch + 48px)`;
    }

    /**
     * NumberSteppers wraps every number field: it moves the field's width onto
     * the `.rr-number-stepper` wrapper and leaves the input flexing to fill
     * whatever the wrapper is. A width written to the input is therefore
     * ignored, and the box stays at the size it was first rendered at while
     * the digits typed into it run past the edge. Size whichever element
     * actually owns the box, resolved on each pass because the wrapper is
     * added by an observer rather than by this render.
     */
    setupParamInputListeners(enemy) {
        document.querySelectorAll(`.enemy-param-input[data-enemy-id="${enemy.id}"]`).forEach(input => {
            const resize = () => {
                const box = input.closest('.rr-number-stepper') || input;
                box.style.width = this.paramInputWidth(input.value);
            };
            input.addEventListener('input', resize);
            resize();
        });
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
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 4px; flex: 0 0 auto;">
                                <label class="database-field-label" style="font-size: 11px;">${tt('Kind:')}</label>
                                <select class="database-field-value" style="width: 90px; font-size: 11px;"
                                        data-field="dropItems" data-drop-index="${i}" data-drop-field="kind" data-enemy-id="${enemy.id}">
                                    <option value="0" ${drop.kind === 0 ? 'selected' : ''}>${tt('None')}</option>
                                    <option value="1" ${drop.kind === 1 ? 'selected' : ''}>${tt('Item')}</option>
                                    <option value="2" ${drop.kind === 2 ? 'selected' : ''}>${tt('Weapon')}</option>
                                    <option value="3" ${drop.kind === 3 ? 'selected' : ''}>${tt('Armor')}</option>
                                </select>
                            </div>
                            <div style="display: ${drop.kind === 0 ? 'none' : 'flex'}; align-items: center; gap: 4px; flex: 1 1 140px; min-width: 140px;" id="enemy-drop-dataid-wrapper-${enemy.id}-${i}">
                                <label class="database-field-label" style="font-size: 11px;">${tt('Item:')}</label>
                                <select class="database-field-value" style="flex: 1 1 auto; min-width: 0; font-size: 11px;"
                                        data-field="dropItems" data-drop-index="${i}" data-drop-field="dataId" data-enemy-id="${enemy.id}"
                                        id="enemy-drop-dataid-${enemy.id}-${i}">
                                    ${this.getDropDataIdOptions(drop.kind, drop.dataId)}
                                </select>
                            </div>
                        </div>
                        <div style="display: ${drop.kind === 0 ? 'none' : 'flex'}; align-items: center; gap: 4px;" id="enemy-drop-denom-wrapper-${enemy.id}-${i}">
                            <label class="database-field-label" style="font-size: 11px;">1 /</label>
                            <input type="number" class="database-field-value database-field-value-small" style="width: 60px; font-size: 11px;"
                                   value="${drop.denominator || 1}" min="1"
                                   data-field="dropItems" data-drop-index="${i}" data-drop-field="denominator" data-enemy-id="${enemy.id}">
                            <span class="database-field-label" id="enemy-drop-rate-${enemy.id}-${i}" data-rr-i18n-skip
                                  style="font-size: 11px; color: var(--color-text-muted); min-width: 46px;">${this.formatDropRate(drop.denominator)}</span>
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

    /**
     * The chance a `1 / X` denominator is, shown beside it. Trailing zeros
     * are dropped: 1/1 reads 100%, 1/3 reads 33.333%.
     */
    formatDropRate(denominator) {
        const denom = Math.max(1, parseInt(denominator, 10) || 1);
        const percent = 100 / denom;
        const text = percent >= 100 ? '100' : percent.toFixed(3).replace(/\.?0+$/, '');
        return `${text}%`;
    }

    /**
     * The readout carries `data-rr-i18n-skip` and must keep it: the i18n
     * pass treats every `.database-field-label` as static copy and rewrites
     * it back to the first text it saw on each later DOM change.
     */
    setupDropRateListeners(enemy) {
        for (let i = 0; i < 3; i++) {
            const input = document.querySelector(`input[data-drop-index="${i}"][data-drop-field="denominator"][data-enemy-id="${enemy.id}"]`);
            const readout = document.getElementById(`enemy-drop-rate-${enemy.id}-${i}`);
            if (!input || !readout) continue;
            input.addEventListener('input', () => { readout.textContent = this.formatDropRate(input.value); });
        }
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
                    // 'flex', not '': clearing the inline display drops the
                    // row to block and re-flows the controls it holds.
                    if (dataIdWrapper) dataIdWrapper.style.display = 'flex';
                    if (denomWrapper) denomWrapper.style.display = 'flex';
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

    conditionTypeCatalog() {
        return [
            { id: 1, label: 'Turn', fields: [
                { param: 1, label: 'Start', value: 1 },
                { param: 2, label: 'Interval', value: 0 }
            ] },
            { id: 2, label: 'HP', percent: true, fields: [
                { param: 1, label: 'Minimum', value: 0 },
                { param: 2, label: 'Maximum', value: 1 }
            ] },
            { id: 3, label: 'MP', percent: true, fields: [
                { param: 1, label: 'Minimum', value: 0 },
                { param: 2, label: 'Maximum', value: 1 }
            ] },
            { id: 7, label: 'TP', percent: true, fields: [
                { param: 1, label: 'Minimum', value: 0 },
                { param: 2, label: 'Maximum', value: 1 }
            ] },
            { id: 4, label: 'User State', fields: [
                { param: 1, kind: 'state', value: 1 }
            ] },
            // "Lacks" rows of their own rather than a "not" box: an action can
            // then require both at once - enraged, but not silenced.
            { id: 9, label: 'User Lacks State', fields: [
                { param: 1, kind: 'state', value: 1 }
            ] },
            { id: 8, label: 'Target State', fields: [
                { param: 1, kind: 'state', value: 1 }
            ] },
            { id: 10, label: 'Target Lacks State', fields: [
                { param: 1, kind: 'state', value: 1 }
            ] },
            { id: 5, label: 'Party Level', fields: [
                { param: 1, label: 'Minimum', value: 1 }
            ] },
            { id: 6, label: 'Switch', fields: [
                { param: 1, kind: 'switch', value: 1 }
            ] }
        ];
    }

    actionConditions(action) {
        if (Array.isArray(action?.conditions)) {
            return action.conditions
                .filter(condition => Number.isInteger(condition?.type) && condition.type > 0)
                .map(condition => ({
                    type: condition.type,
                    param1: Number(condition.param1) || 0,
                    param2: Number(condition.param2) || 0
                }));
        }
        const type = Number(action?.conditionType) || 0;
        if (type <= 0) return [];
        return [{
            type,
            param1: Number(action?.conditionParam1) || 0,
            param2: Number(action?.conditionParam2) || 0
        }];
    }

    setActionConditions(action, conditions) {
        action.conditions = conditions;
        const first = conditions[0];
        action.conditionType = first ? first.type : 0;
        action.conditionParam1 = first ? first.param1 : 0;
        action.conditionParam2 = first ? first.param2 : 0;
    }

    mergeEditedActionConditions(action, editedConditions) {
        const catalogIds = new Set(this.conditionTypeCatalog().map(type => type.id));
        const editedByType = new Map(editedConditions.map(condition => [condition.type, condition]));
        if (!Array.isArray(action?.conditions)) {
            const legacyType = action?.conditionType;
            if (Number.isInteger(legacyType) && legacyType > 0 && !catalogIds.has(legacyType)) {
                return [{
                    type: action.conditionType,
                    param1: action.conditionParam1,
                    param2: action.conditionParam2
                }, ...editedConditions];
            }
            return editedConditions;
        }
        const emitted = new Set();
        const merged = [];

        for (const condition of action.conditions) {
            const type = condition?.type;
            if (!Number.isInteger(type) || !catalogIds.has(type)) {
                merged.push(condition);
            } else if (editedByType.has(type)) {
                if (emitted.has(type)) {
                    merged.push(condition);
                } else {
                    merged.push({ ...condition, ...editedByType.get(type) });
                    emitted.add(type);
                }
            }
        }
        for (const condition of editedConditions) {
            if (!emitted.has(condition.type)) merged.push(condition);
        }
        return merged;
    }

    conditionStateName(stateId) {
        const states = this.databaseManager.getStates() || [];
        const state = states.find(entry => entry && entry.id === stateId);
        return state ? state.name : `#${stateId}`;
    }

    describeRateCondition(label, condition) {
        return `${label} ${this.formatConditionPercent(condition.param1)}% ~ ${this.formatConditionPercent(condition.param2)}%`;
    }

    describeCondition(condition) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        switch (condition.type) {
            case 1:
                return condition.param2 > 0
                    ? `${tt('Turn')} ${condition.param1} + ${condition.param2}n`
                    : `${tt('Turn')} ${condition.param1}`;
            case 2:
                return this.describeRateCondition(tt('HP'), condition);
            case 3:
                return this.describeRateCondition(tt('MP'), condition);
            case 7:
                return this.describeRateCondition(tt('TP'), condition);
            case 4:
                return `${tt('User State')}: ${this.conditionStateName(condition.param1)}`;
            case 8:
                return `${tt('Target State')}: ${this.conditionStateName(condition.param1)}`;
            case 9:
                return `${tt('User Lacks State')}: ${this.conditionStateName(condition.param1)}`;
            case 10:
                return `${tt('Target Lacks State')}: ${this.conditionStateName(condition.param1)}`;
            case 5:
                return `${tt('Party Lv')} >= ${condition.param1}`;
            case 6:
                return `${tt('Switch')} #${condition.param1} ${tt('ON')}`;
            default:
                return tt('Unknown');
        }
    }

    describeConditions(action) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (Array.isArray(action?.conditions)) {
            if (action.conditions.length === 0) return tt('Always');
            return action.conditions
                .map(condition => {
                    const type = condition?.type;
                    if (!Number.isInteger(type) || type <= 0) return tt('Unknown');
                    return this.describeCondition({
                        type,
                        param1: Number(condition.param1) || 0,
                        param2: Number(condition.param2) || 0
                    });
                })
                .join(` ${tt('and')} `);
        }
        const conditions = this.actionConditions(action);
        if (conditions.length === 0) return tt('Always');
        return conditions
            .map(condition => this.describeCondition(condition))
            .join(` ${tt('and')} `);
    }

    buildActionsHTML(enemy) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;

        if (!enemy.actions || enemy.actions.length === 0) {
            return `<tr><td colspan="4" style="text-align: center; color: var(--color-text-muted);">${tt('No action patterns (right-click to add)')}</td></tr>`;
        }

        return enemy.actions.map((action, index) => {
            const skills = this.databaseManager.getSkills() || [];
            const skill = skills.find(s => s && s.id === action.skillId);
            const skillName = skill ? skill.name : `${tt('Skill')} #${action.skillId}`;

            return `
                <tr class="action-row" data-action-index="${index}">
                    <td class="action-indicator" style="width: 3px; padding: 0; border: none; background: transparent;"></td>
                    <td>${this.escapeHTML(skillName)}</td>
                    <td>${this.escapeHTML(this.describeConditions(action))}</td>
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
                table.closest('.database-section')?.focus();
                this.updateActionButtonStates(table.closest('.database-section'), table);
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

    formatConditionPercent(value) {
        return Math.round((Number(value) || 0) * 10000) / 100;
    }

    setupActionButtons(section, table, enemy) {
        section.querySelector('.action-btn-add').addEventListener('click', () => this.addAction(enemy));
        section.querySelector('.action-btn-edit').addEventListener('click', () => {
            const index = this.getSelectedActionIndex(table);
            if (index !== null) this.editAction(enemy, index);
        });
        section.querySelector('.action-btn-delete').addEventListener('click', () => {
            const index = this.getSelectedActionIndex(table);
            if (index !== null) this.deleteAction(enemy, index);
        });
    }

    getSelectedActionIndex(table) {
        const selected = table.querySelector('.action-row.selected');
        return selected ? parseInt(selected.dataset.actionIndex) : null;
    }

    updateActionButtonStates(section, table) {
        if (!section) return;
        const enabled = this.getSelectedActionIndex(table) !== null;
        section.querySelector('.action-btn-edit').disabled = !enabled;
        section.querySelector('.action-btn-delete').disabled = !enabled;
    }

    setupActionKeyboardShortcuts(section, table, enemy) {
        section.addEventListener('keydown', event => {
            if (event.target !== section) return;
            const index = this.getSelectedActionIndex(table);
            if (index === null || (event.key !== 'Enter' && event.key !== 'Delete')) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key === 'Enter') this.editAction(enemy, index);
            else this.deleteAction(enemy, index);
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
        const firstSkill = (this.databaseManager.getSkills() || []).find(skill => skill && skill.id > 0);
        const draft = { skillId: firstSkill?.id || 1, conditionType: 0, conditionParam1: 0, conditionParam2: 0, conditions: [], rating: 5 };
        this.showActionEditorModal(enemy, -1, draft);
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

    getConditionStateOptions(selectedId) {
        const states = (this.databaseManager.getStates() || [])
            .filter(state => state && state.id > 0);
        const options = states.map(state =>
            `<option value="${state.id}" ${state.id === selectedId ? 'selected' : ''}>#${state.id} ${this.escapeHTML(state.name || '')}</option>`);
        if (selectedId > 0 && !states.some(state => state.id === selectedId)) {
            options.unshift(`<option value="${selectedId}" selected>#${selectedId}</option>`);
        }
        return options.join('');
    }

    getConditionSwitchOptions(selectedId) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const names = this.databaseManager.getSystem()?.switches || [];
        const options = [];
        for (let id = 1; id < names.length; id++) {
            const name = String(names[id] || '').trim()
                || `${tt('Switch')} ${String(id).padStart(4, '0')}`;
            options.push(`<option value="${id}" ${id === selectedId ? 'selected' : ''}>#${id} ${this.escapeHTML(name)}</option>`);
        }
        if (selectedId > 0 && selectedId >= names.length) {
            options.unshift(`<option value="${selectedId}" selected>#${selectedId}</option>`);
        }
        return options.join('');
    }

    buildConditionFieldsHTML(type, condition) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const fieldStyle = 'padding: 4px 6px; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 12px; box-sizing: border-box;';
        const captionStyle = 'font-size: 11px; color: var(--color-text-muted);';

        return type.fields.map(field => {
            const stored = condition && (field.param === 2 ? condition.param2 : condition.param1);
            const raw = condition ? stored : field.value;
            const attrs = `class="action-cond-field" data-cond-type="${type.id}" data-cond-param="${field.param}"`;

            if (field.kind === 'state') {
                return `<select ${attrs} style="${fieldStyle} flex: 1; min-width: 0;">${this.getConditionStateOptions(Number(raw) || 1)}</select>`;
            }
            if (field.kind === 'switch') {
                return `
                    <select ${attrs} style="${fieldStyle} flex: 1; min-width: 0;">${this.getConditionSwitchOptions(Number(raw) || 1)}</select>
                    <span style="${captionStyle}">${tt('ON')}</span>`;
            }

            const shown = type.percent ? this.formatConditionPercent(raw) : (Number(raw) || 0);
            const range = type.percent ? 'min="0" max="100" step="0.01"' : 'min="0" step="1"';
            return `
                <span style="display: flex; align-items: center; gap: 4px;">
                    <span style="${captionStyle}">${tt(field.label)}</span>
                    <input type="number" ${attrs} value="${shown}" ${range} style="${fieldStyle} width: 76px;">
                    ${type.percent ? `<span style="${captionStyle}">%</span>` : ''}
                </span>`;
        }).join('');
    }

    buildConditionRowsHTML(conditions) {
        return this.conditionTypeCatalog().map(type => {
            const tt = text => window.I18n ? window.I18n.tText(text) : text;
            const condition = conditions.find(entry => entry.type === type.id);
            return `
                <div class="action-cond-row" data-cond-type="${type.id}" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <input type="checkbox" class="action-cond-toggle" data-cond-type="${type.id}" ${condition ? 'checked' : ''}>
                    <label style="min-width: 92px; flex-shrink: 0; font-size: 12px;">${tt(type.label)}</label>
                    ${this.buildConditionFieldsHTML(type, condition)}
                </div>`;
        }).join('');
    }

    syncConditionRowStates(modal) {
        modal.querySelectorAll('.action-cond-row').forEach(row => {
            const checked = row.querySelector('.action-cond-toggle')?.checked;
            row.style.opacity = checked ? '1' : '0.5';
            row.querySelectorAll('.action-cond-field').forEach(field => {
                field.disabled = !checked;
            });
        });
    }

    readConditionsFromModal(modal) {
        const conditions = [];
        for (const type of this.conditionTypeCatalog()) {
            const toggle = modal.querySelector(`.action-cond-toggle[data-cond-type="${type.id}"]`);
            if (!toggle?.checked) continue;

            const read = param => {
                const field = modal.querySelector(`.action-cond-field[data-cond-type="${type.id}"][data-cond-param="${param}"]`);
                const value = field ? parseFloat(field.value) : NaN;
                if (!Number.isFinite(value)) return 0;
                return type.percent
                    ? Math.min(1, Math.max(0, Math.round(value * 100) / 10000))
                    : Math.max(0, Math.round(value));
            };
            conditions.push({ type: type.id, param1: read(1), param2: read(2) });
        }
        return conditions;
    }

    showActionEditorModal(enemy, actionIndex, action) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const draft = { ...action };
        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';
        overlay.style.zIndex = '10001';

        const modal = document.createElement('div');
        modal.className = 'rr-modal';
        modal.style.cssText = 'width: min(560px, calc(100vw - 24px));';

        const skills = this.databaseManager.getSkills() || [];
        const skillOptions = skills
            .filter(s => s && s.id > 0)
            .map(s => `<option value="${s.id}" ${s.id === draft.skillId ? 'selected' : ''}>#${s.id} ${this.escapeHTML(s.name || '')}</option>`)
            .join('');

        const inputStyle = 'width: 100%; padding: 6px; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); border-radius: 3px; font-size: 12px; box-sizing: border-box;';

        modal.innerHTML = `
            <div class="rr-modal-header">
                <div class="rr-modal-title">${tt(actionIndex >= 0 ? 'Edit Action Pattern' : 'Add Action Pattern')}</div>
                <button class="rr-modal-close action-edit-close" type="button">&times;</button>
            </div>
            <div class="rr-modal-body">
                <div>
                    <label class="database-field-label" style="display: block; margin-bottom: 4px;">${tt('Skill:')}</label>
                    <select id="action-edit-skill" style="${inputStyle}">${skillOptions}</select>
                </div>
                <div>
                    <label class="database-field-label" style="display: block; margin-bottom: 4px;">${tt('Conditions')}</label>
                    <div id="action-edit-conditions" style="display: flex; flex-direction: column; gap: 6px; padding: 8px; background: var(--color-bg-input); border: 1px solid var(--color-border); border-radius: 4px;">
                        ${this.buildConditionRowsHTML(this.actionConditions(action))}
                    </div>
                    <div style="margin-top: 4px; font-size: 11px; color: var(--color-text-muted);">
                        ${tt('Every checked condition must be met. With none checked the action is always available.')}
                    </div>
                </div>
                <div>
                    <label class="database-field-label" style="display: block; margin-bottom: 4px;">${tt('Rating (1-9):')}</label>
                    <input type="number" id="action-edit-rating" value="${draft.rating || 5}" min="1" max="9" style="${inputStyle}">
                </div>
            </div>
        `;

        modal.querySelectorAll('.action-cond-toggle').forEach(toggle => {
            toggle.addEventListener('change', () => this.syncConditionRowStates(modal));
        });
        this.syncConditionRowStates(modal);

        const btnRow = document.createElement('div');
        btnRow.className = 'rr-modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => overlay.remove());

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.className = 'rr-button-primary';
        okBtn.addEventListener('click', () => {
            draft.skillId = parseInt(modal.querySelector('#action-edit-skill').value) || 1;
            const editedConditions = this.readConditionsFromModal(modal);
            this.setActionConditions(
                draft,
                this.mergeEditedActionConditions(action, editedConditions)
            );
            draft.rating = Math.max(1, Math.min(9, parseInt(modal.querySelector('#action-edit-rating').value) || 5));

            if (!enemy.actions) enemy.actions = [];
            if (actionIndex >= 0) enemy.actions[actionIndex] = draft;
            else enemy.actions.push(draft);
            this.databaseManager.updateEnemy(enemy.id, enemy);
            overlay.remove();
            this.refreshEnemyDetail(enemy);
        });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        modal.querySelector('.action-edit-close')?.addEventListener('click', () => overlay.remove());
        // A click on the backdrop no longer closes the dialog: close deliberately.
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
        else if (fieldName === 'maxTp') {
            // Beside exp and gold, never in params: that array is indexed by
            // paramId and has exactly eight entries.
            enemy.maxTp = Math.max(0, parseInt(value) || 0);
        }
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

        // Search for battler image across directories
        const searchDirs = ['enemies', 'sv_enemies', 'characters'];
        let imagePath = null;
        for (const dir of searchDirs) {
            const battlerFile = RRAssetFiles.findImage(path.join(project.path, 'img', dir), battlerName);
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
        const fileMap = new Map(); // reference -> directory (first directory wins for preview)
        for (const dir of searchDirs) {
            const dirPath = path.join(project.path, 'img', dir);
            try {
                if (fs.existsSync(dirPath)) {
                    RRAssetFiles.listImageReferences(dirPath).forEach(reference => {
                        if (!fileMap.has(reference)) fileMap.set(reference, dirPath);
                    });
                }
            } catch (e) {
                console.error(`Error reading ${dir} folder:`, e);
            }
        }

        const files = Array.from(fileMap.keys()).sort();

        this.parentEditor.showImagePicker(tt('Select Enemy Battler'), files, (selectedFile) => {
            enemy.battlerName = selectedFile;
            this.databaseManager.updateEnemy(enemy.id, enemy);
            this.parentEditor?.updateStatus?.(tt('Enemy battler updated'));
            this.refreshEnemyDetail(enemy);
            this.parentEditor?.refreshListIcon?.(enemy, 'enemies');
        }, (fileName) => {
            const dirPath = fileMap.get(fileName);
            return dirPath ? RRAssetFiles.imageUrlFor(dirPath, fileName) : '';
        }, enemy.battlerName, { allowNone: true });
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

// What Game_BattlerBase.prototype.maxTp returns for an enemy that carries no
// maxTp of its own.
DatabaseEnemyEditor.DEFAULT_MAX_TP = 100;
