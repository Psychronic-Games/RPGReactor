/**
 * DatabaseSkillEditor - Editor for managing skill database entries
 * Handles display and editing of skill properties including costs, damage, effects, and general settings
 */

class DatabaseSkillEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this.currentSkill = null;
        this.effectsClipboard = null;
        this.effectEditor = new DatabaseEffectEditor(databaseManager, commonUI);
    }

    showSkillDetail(container, skill) {
        this.currentSkill = skill;

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.height = '100%';
        wrapper.style.padding = '16px';
        wrapper.style.position = 'relative';

        // Lookup arrays
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const scopeNames = ['None', 'One Enemy', 'All Enemies', '3 Random', '4 Random', '2 Random', '1 Random',
                           'One Ally', 'All Allies', 'One Ally (Dead)', 'All Allies (Dead)', 'User'].map(tt);
        const occasionNames = ['Always', 'Battle Only', 'Menu Only', 'Never'].map(tt);
        const damageTypeNames = ['None', 'HP Damage', 'MP Damage', 'HP Recover', 'MP Recover', 'HP Drain', 'MP Drain'].map(tt);
        const hitTypeNames = ['Certain', 'Physical', 'Magical'].map(tt);

        // Get skill types from system data
        const skillTypeNames = this.databaseManager.getSystem()?.skillTypes || [];

        // Get elements from system data
        const elementNames = this.databaseManager.getSystem()?.elements || [];

        // ── General Section ──
        const generalWrapper = document.createElement('div');
        generalWrapper.style.marginBottom = '16px';

        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content" style="display: flex; gap: 16px;">
                <div style="display: flex; flex-direction: column; align-items: center; min-width: 60px;">
                    <label class="database-field-label" style="margin-bottom: 4px;">Icon:</label>
                    <div id="skill-icon-container-${skill.id}"></div>
                </div>
                <div style="flex: 1;">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="database-field-label">Name:</label>
                            <input type="text" class="database-field-value" value="${skill.name || ''}" data-field="name" data-skill-id="${skill.id}">
                        </div>
                    </div>
                    <div class="form-row">
                        <label class="database-field-label">Description:</label>
                    </div>
                    <div class="form-row">
                        <textarea class="database-field-value" rows="2" style="width: 100%;" data-field="description" data-skill-id="${skill.id}">${skill.description || ''}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group-fixed">
                            <label class="database-field-label">Skill Type:</label>
                            <select class="database-field-value" style="width: 150px;" data-field="stypeId" data-skill-id="${skill.id}">
                                ${skillTypeNames.map((name, idx) => idx > 0 && name ? `<option value="${idx}" ${skill.stypeId === idx ? 'selected' : ''}>${name}</option>` : '').join('')}
                            </select>
                        </div>
                        <div class="form-group-fixed">
                            <label class="database-field-label">Scope:</label>
                            <select class="database-field-value" style="width: 150px;" data-field="scope" data-skill-id="${skill.id}">
                                ${scopeNames.map((name, idx) => `<option value="${idx}" ${skill.scope === idx ? 'selected' : ''}>${name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group-fixed">
                            <label class="database-field-label">Occasion:</label>
                            <select class="database-field-value" style="width: 120px;" data-field="occasion" data-skill-id="${skill.id}">
                                ${occasionNames.map((name, idx) => `<option value="${idx}" ${skill.occasion === idx ? 'selected' : ''}>${name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;
        generalWrapper.appendChild(generalSection);
        wrapper.appendChild(generalWrapper);

        // Add icon to the designated container after the DOM is ready
        setTimeout(() => {
            const iconContainer = document.getElementById(`skill-icon-container-${skill.id}`);
            if (iconContainer) {
                this.parentEditor.addDatabasePreview(iconContainer, skill, 'skills');
            }
        }, 0);

        // Grid wrapper for sections below general
        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';

        // ── Invocation Section ──
        const invocationSection = document.createElement('div');
        invocationSection.className = 'database-section';
        invocationSection.innerHTML = `
            <div class="database-section-header">Invocation</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">MP Cost:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${skill.mpCost || 0}" data-field="mpCost" data-skill-id="${skill.id}">
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">TP Cost:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${skill.tpCost || 0}" data-field="tpCost" data-skill-id="${skill.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">TP Gain:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${skill.tpGain || 0}" data-field="tpGain" data-skill-id="${skill.id}">
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Speed:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${skill.speed || 0}" data-field="speed" data-skill-id="${skill.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Success Rate:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${skill.successRate != null ? skill.successRate : 100}" data-field="successRate" data-skill-id="${skill.id}">
                        <span style="color: var(--color-text-muted); margin-left: 4px;">%</span>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Repeats:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${skill.repeats != null ? skill.repeats : 1}" data-field="repeats" data-skill-id="${skill.id}" min="1">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Hit Type:</label>
                        <select class="database-field-value" style="width: 120px;" data-field="hitType" data-skill-id="${skill.id}">
                            ${hitTypeNames.map((name, idx) => `<option value="${idx}" ${skill.hitType === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Animation ID:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${skill.animationId || 0}" data-field="animationId" data-skill-id="${skill.id}">
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(invocationSection);

        // ── Message Section ──
        const messageSection = document.createElement('div');
        messageSection.className = 'database-section';
        messageSection.innerHTML = `
            <div class="database-section-header">Message</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Message 1:</label>
                        <input type="text" class="database-field-value" value="${skill.message1 || ''}" data-field="message1" data-skill-id="${skill.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Message 2:</label>
                        <input type="text" class="database-field-value" value="${skill.message2 || ''}" data-field="message2" data-skill-id="${skill.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Message 3:</label>
                        <input type="text" class="database-field-value" value="${skill.message3 || ''}" data-field="message3" data-skill-id="${skill.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Message 4:</label>
                        <input type="text" class="database-field-value" value="${skill.message4 || ''}" data-field="message4" data-skill-id="${skill.id}">
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(messageSection);

        // ── Damage Section ──
        const damage = skill.damage || { type: 0, elementId: -1, formula: '', variance: 20, critical: false };
        const damageSection = document.createElement('div');
        damageSection.className = 'database-section';
        damageSection.style.gridColumn = '1 / -1';
        damageSection.innerHTML = `
            <div class="database-section-header">Damage</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Type:</label>
                        <select class="database-field-value" style="width: 150px;" data-field="damage.type" data-skill-id="${skill.id}">
                            ${damageTypeNames.map((name, idx) => `<option value="${idx}" ${damage.type === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Element:</label>
                        <select class="database-field-value" style="width: 150px;" data-field="damage.elementId" data-skill-id="${skill.id}">
                            <option value="-1" ${damage.elementId === -1 ? 'selected' : ''}>${tt('Normal Attack')}</option>
                            ${elementNames.map((name, idx) => idx > 0 && name ? `<option value="${idx}" ${damage.elementId === idx ? 'selected' : ''}>${name}</option>` : '').join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Formula:</label>
                        <input type="text" class="database-field-value" style="font-family: monospace;" value="${damage.formula || ''}" data-field="damage.formula" data-skill-id="${skill.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Variance:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${damage.variance != null ? damage.variance : 20}" data-field="damage.variance" data-skill-id="${skill.id}">
                        <span style="color: var(--color-text-muted); margin-left: 4px;">%</span>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Critical:</label>
                        <input type="checkbox" ${damage.critical ? 'checked' : ''} data-field="damage.critical" data-skill-id="${skill.id}">
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(damageSection);

        // ── Effects Section ──
        const effectsSection = document.createElement('div');
        effectsSection.className = 'database-section';
        effectsSection.style.gridColumn = '1 / -1';
        effectsSection.innerHTML = `
            <div class="database-section-header">Effects</div>
            <div class="database-section-content">
                <table class="traits-table" id="skill-effects-table-${skill.id}">
                    <thead>
                        <tr>
                            <th style="width: 3px; padding: 0; border: none; background: transparent;"></th>
                            <th>Effect</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${skill.effects && skill.effects.length > 0 ?
                            skill.effects.map((effect, index) => `
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
            const effectsTable = document.getElementById(`skill-effects-table-${skill.id}`);
            if (effectsTable) {
                this.setupEffectInteraction(effectsTable, skill);
                this.setupEffectsContextMenu(effectsTable, skill);
            }
        }, 0);

        // ── Note Section ──
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.style.gridColumn = '1 / -1';
        noteSection.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-skill-id="${skill.id}">${skill.note || ''}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners for all editable fields
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-skill-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const skillId = parseInt(e.target.dataset.skillId);
                    let value;
                    if (e.target.type === 'checkbox') {
                        value = e.target.checked;
                    } else {
                        value = e.target.value;
                    }
                    this.updateSkillField(skillId, fieldName, value);
                });
            });
        }, 0);
    }

    updateSkillField(skillId, fieldName, value) {
        const skill = this.databaseManager.getSkill(skillId);
        if (!skill) return;

        // Handle nested damage fields (damage.type, damage.elementId, etc.)
        if (fieldName.startsWith('damage.')) {
            const subField = fieldName.split('.')[1];
            if (!skill.damage) {
                skill.damage = { type: 0, elementId: -1, formula: '', variance: 20, critical: false };
            }
            if (subField === 'formula') {
                skill.damage[subField] = value;
            } else if (subField === 'critical') {
                skill.damage[subField] = !!value;
            } else {
                // type, elementId, variance
                skill.damage[subField] = parseInt(value) || 0;
            }
            console.log(`Updated skill ${skillId} damage.${subField} to:`, skill.damage[subField]);
        }
        // Handle numeric fields
        else if (['stypeId', 'scope', 'occasion', 'mpCost', 'tpCost', 'tpGain',
                   'speed', 'successRate', 'repeats', 'hitType', 'animationId'].includes(fieldName)) {
            skill[fieldName] = parseInt(value) || 0;
            console.log(`Updated skill ${skillId} field ${fieldName} to:`, skill[fieldName]);
        }
        // Handle string fields (name, description, note, message1-4)
        else {
            skill[fieldName] = value;
            console.log(`Updated skill ${skillId} field ${fieldName} to:`, value);
        }

        this.databaseManager.updateSkill(skillId, skill);
    }

    setupEffectInteraction(table, skill) {
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

    setupEffectsContextMenu(table, skill) {
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
                { label: 'Add', action: () => this.addEffect(skill), enabled: true },
                { label: 'Edit', action: () => this.editEffect(skill, effectIndex), enabled: effectIndex !== null },
                { label: 'Cut', action: () => this.cutEffect(skill, effectIndex), enabled: effectIndex !== null },
                { label: 'Copy', action: () => this.copyEffect(skill, effectIndex), enabled: effectIndex !== null },
                { label: 'Paste', action: () => this.pasteEffect(skill), enabled: this.effectsClipboard !== null },
                { label: 'Delete', action: () => this.deleteEffect(skill, effectIndex), enabled: effectIndex !== null }
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

    addEffect(skill) {
        if (!skill.effects) skill.effects = [];

        this.effectEditor.showEffectEditorModal(skill, -1, (updatedEntry) => {
            this.databaseManager.updateSkill(updatedEntry.id, updatedEntry);
            this.refreshSkillDetail(updatedEntry);
        });
    }

    editEffect(skill, effectIndex) {
        if (effectIndex === null) return;

        this.effectEditor.showEffectEditorModal(skill, effectIndex, (updatedEntry) => {
            this.databaseManager.updateSkill(updatedEntry.id, updatedEntry);
            this.refreshSkillDetail(updatedEntry);
        });
    }

    cutEffect(skill, effectIndex) {
        if (effectIndex === null || !skill.effects) return;
        this.effectsClipboard = { ...skill.effects[effectIndex] };
        skill.effects.splice(effectIndex, 1);
        this.databaseManager.updateSkill(skill.id, skill);
        this.refreshSkillDetail(skill);
    }

    copyEffect(skill, effectIndex) {
        if (effectIndex === null || !skill.effects) return;
        this.effectsClipboard = { ...skill.effects[effectIndex] };
    }

    pasteEffect(skill) {
        if (!this.effectsClipboard) return;
        if (!skill.effects) skill.effects = [];
        skill.effects.push({ ...this.effectsClipboard });
        this.databaseManager.updateSkill(skill.id, skill);
        this.refreshSkillDetail(skill);
    }

    deleteEffect(skill, effectIndex) {
        if (effectIndex === null || !skill.effects) return;
        skill.effects.splice(effectIndex, 1);
        this.databaseManager.updateSkill(skill.id, skill);
        this.refreshSkillDetail(skill);
    }

    refreshSkillDetail(skill) {
        const container = document.querySelector('.database-detail-panel');
        if (container) {
            container.innerHTML = '';
            this.showSkillDetail(container, skill);
        }
    }
}
