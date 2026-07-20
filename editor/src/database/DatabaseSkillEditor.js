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

        // Weapon types for the required-weapon selects
        const weaponTypeNames = this.databaseManager.getSystem()?.weaponTypes || [];

        // Animation picker: -1 = Normal Attack, 0 = None; opens AnimationPickerModal
        const animations = this.databaseManager.getAnimations ? this.databaseManager.getAnimations() : [];
        const animationLabel = (current) => AnimationPickerModal.label(animations, current);

        // ── General Section ──
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">${tt('General')}</div>
            <div class="database-section-content"><div class="db-general-grid">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
                    <label style="font-size: 11px; color: var(--color-text-muted); font-weight: 600;">${tt('Icon')}</label>
                    <div id="skill-icon-container-${skill.id}"></div>
                </div>
                <div class="db-form db-fill">
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>${tt('Name')}</label>
                            <input type="text" class="database-field-value" value="${rrEscapeHtml(skill.name)}" data-field="name" data-skill-id="${skill.id}">
                        </span>
                    </div>

                    <div class="db-row-cols db-row-grow">
                        <span class="db-col">
                            <label>${tt('Description')}</label>
                            <textarea class="database-field-value" rows="2" data-field="description" data-skill-id="${skill.id}">${rrEscapeHtml(skill.description)}</textarea>
                        </span>
                    </div>

                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>${tt('Skill Type')}</label>
                            <select class="database-field-value" data-field="stypeId" data-skill-id="${skill.id}">
                                ${skillTypeNames.map((name, idx) => idx > 0 && name ? `<option value="${idx}" ${skill.stypeId === idx ? 'selected' : ''}>${rrEscapeHtml(name)}</option>` : '').join('')}
                            </select>
                        </span>
                        <span class="db-col">
                            <label>${tt('Scope')}</label>
                            <select class="database-field-value" data-field="scope" data-skill-id="${skill.id}">
                                ${scopeNames.map((name, idx) => `<option value="${idx}" ${skill.scope === idx ? 'selected' : ''}>${name}</option>`).join('')}
                            </select>
                        </span>
                        <span class="db-col">
                            <label>${tt('Occasion')}</label>
                            <select class="database-field-value" data-field="occasion" data-skill-id="${skill.id}">
                                ${occasionNames.map((name, idx) => `<option value="${idx}" ${skill.occasion === idx ? 'selected' : ''}>${name}</option>`).join('')}
                            </select>
                        </span>
                    </div>
                </div></div>
            </div>
        `;
        // General flows into the two-column grid with the other sections

        // Add icon to the designated container after the DOM is ready
        setTimeout(() => {
            const iconContainer = document.getElementById(`skill-icon-container-${skill.id}`);
            if (iconContainer) {
                this.parentEditor.addDatabasePreview(iconContainer, skill, 'skills');
            }
        }, 0);

        // Grid wrapper for all sections
        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';
        gridWrapper.appendChild(generalSection);

        // ── Invocation Section ──
        const invocationSection = document.createElement('div');
        invocationSection.className = 'database-section';
        invocationSection.innerHTML = `
            <div class="database-section-header">${tt('Invocation')}</div>
            <div class="database-section-content">
                <div class="db-form">
                    <div class="db-row-pair">
                        <label>${tt('MP Cost')}</label>
                        <input type="number" class="database-field-value" value="${rrEscapeHtml(skill.mpCost || 0)}" data-field="mpCost" data-skill-id="${skill.id}">
                        <label>${tt('TP Cost')}</label>
                        <input type="number" class="database-field-value" value="${rrEscapeHtml(skill.tpCost || 0)}" data-field="tpCost" data-skill-id="${skill.id}">
                    </div>
                    <div class="db-row-pair">
                        <label>${tt('TP Gain')}</label>
                        <input type="number" class="database-field-value" value="${rrEscapeHtml(skill.tpGain || 0)}" data-field="tpGain" data-skill-id="${skill.id}">
                        <label>${tt('Speed')}</label>
                        <input type="number" class="database-field-value" value="${rrEscapeHtml(skill.speed || 0)}" data-field="speed" data-skill-id="${skill.id}">
                    </div>
                    <div class="db-row-pair">
                        <label>${tt('Success %')}</label>
                        <input type="number" class="database-field-value" value="${rrEscapeHtml(skill.successRate != null ? skill.successRate : 100)}" data-field="successRate" data-skill-id="${skill.id}">
                        <label>${tt('Repeats')}</label>
                        <input type="number" class="database-field-value" value="${rrEscapeHtml(skill.repeats != null ? skill.repeats : 1)}" data-field="repeats" data-skill-id="${skill.id}" min="1" max="${globalThis.RR_LIMITS?.ACTION_REPEATS || 100}">
                    </div>
                    <div class="db-row-pair">
                        <label>${tt('Hit Type')}</label>
                        <select class="database-field-value" data-field="hitType" data-skill-id="${skill.id}">
                            ${hitTypeNames.map((name, idx) => `<option value="${idx}" ${skill.hitType === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                        <label>${tt('Animation')}</label>
                        <span style="display: flex; min-width: 0;">
                            <button type="button" class="database-field-value db-anim-picker" data-target-field="animationId" data-allow-normal-attack="1" data-rr-i18n-skip>${rrEscapeHtml(animationLabel(skill.animationId || 0))}</button>
                            <input type="hidden" value="${rrEscapeHtml(skill.animationId || 0)}" data-field="animationId" data-skill-id="${skill.id}">
                        </span>
                    </div>
                    <div class="db-row-pair">
                        <label>${tt('Req. Weapon 1')}</label>
                        <select class="database-field-value" data-field="requiredWtypeId1" data-skill-id="${skill.id}">
                            <option value="0" ${!skill.requiredWtypeId1 ? 'selected' : ''}>${tt('None')}</option>
                            ${weaponTypeNames.map((name, idx) => idx > 0 && name ? `<option value="${idx}" ${skill.requiredWtypeId1 === idx ? 'selected' : ''}>${rrEscapeHtml(name)}</option>` : '').join('')}
                        </select>
                        <label>${tt('Req. Weapon 2')}</label>
                        <select class="database-field-value" data-field="requiredWtypeId2" data-skill-id="${skill.id}">
                            <option value="0" ${!skill.requiredWtypeId2 ? 'selected' : ''}>${tt('None')}</option>
                            ${weaponTypeNames.map((name, idx) => idx > 0 && name ? `<option value="${idx}" ${skill.requiredWtypeId2 === idx ? 'selected' : ''}>${rrEscapeHtml(name)}</option>` : '').join('')}
                        </select>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(invocationSection);

        // ── Message Section ──
        const messageSection = document.createElement('div');
        messageSection.className = 'database-section';
        messageSection.innerHTML = `
            <div class="database-section-header">${tt('Message')}</div>
            <div class="database-section-content">
                <div class="db-form">
                    <label>${tt('Message 1')}</label>
                    <input type="text" class="database-field-value" value="${rrEscapeHtml(skill.message1)}" data-field="message1" data-skill-id="${skill.id}">
                    <label>${tt('Message 2')}</label>
                    <input type="text" class="database-field-value" value="${rrEscapeHtml(skill.message2)}" data-field="message2" data-skill-id="${skill.id}">
                    <label>${tt('Message 3')}</label>
                    <input type="text" class="database-field-value" value="${rrEscapeHtml(skill.message3)}" data-field="message3" data-skill-id="${skill.id}">
                    <label>${tt('Message 4')}</label>
                    <input type="text" class="database-field-value" value="${rrEscapeHtml(skill.message4)}" data-field="message4" data-skill-id="${skill.id}">
                </div>
            </div>
        `;
        gridWrapper.appendChild(messageSection);

        // ── Damage Section ──
        const damage = skill.damage || { type: 0, elementId: -1, formula: '', variance: 20, critical: false };
        const damageSection = document.createElement('div');
        damageSection.className = 'database-section';
        damageSection.innerHTML = `
            <div class="database-section-header">${tt('Damage')}</div>
            <div class="database-section-content">
                <div class="db-form">
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>${tt('Formula')}</label>
                            <input type="text" class="database-field-value" style="font-family: monospace;" value="${rrEscapeHtml(damage.formula || '')}" data-field="damage.formula" data-skill-id="${skill.id}">
                        </span>
                    </div>
                    <div class="db-row-cols">
                        <span class="db-col">
                            <label>${tt('Type')}</label>
                            <select class="database-field-value" data-field="damage.type" data-skill-id="${skill.id}">
                                ${damageTypeNames.map((name, idx) => `<option value="${idx}" ${damage.type === idx ? 'selected' : ''}>${name}</option>`).join('')}
                            </select>
                        </span>
                        <span class="db-col">
                            <label>${tt('Element')}</label>
                            <select class="database-field-value" data-field="damage.elementId" data-skill-id="${skill.id}">
                                <option value="-1" ${damage.elementId === -1 ? 'selected' : ''}>${tt('Normal Attack')}</option>
                                ${elementNames.map((name, idx) => idx > 0 && name ? `<option value="${idx}" ${damage.elementId === idx ? 'selected' : ''}>${rrEscapeHtml(name)}</option>` : '').join('')}
                            </select>
                        </span>
                        <span class="db-col">
                            <label>${tt('Variance %')}</label>
                            <input type="number" class="database-field-value" value="${rrEscapeHtml(damage.variance != null ? damage.variance : 20)}" data-field="damage.variance" data-skill-id="${skill.id}">
                        </span>
                        <span class="db-col">
                            <label>${tt('Critical')}</label>
                            <input type="checkbox" class="system-checkbox" ${damage.critical ? 'checked' : ''} data-field="damage.critical" data-skill-id="${skill.id}">
                        </span>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(damageSection);

        // ── Effects Section ──
        const effectsSection = document.createElement('div');
        effectsSection.className = 'database-section';
        effectsSection.innerHTML = `
            <div class="database-section-header">${tt('Effects')}</div>
            <div class="database-section-content">
                <table class="traits-table" id="skill-effects-table-${skill.id}">
                    <thead>
                        <tr>
                            <th style="width: 3px; padding: 0; border: none; background: transparent;"></th>
                            <th>${tt('Effect')}</th>
                            <th>${tt('Value')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${skill.effects && skill.effects.length > 0 ?
                            skill.effects.map((effect, index) => `
                                <tr class="effect-row" data-effect-index="${index}">
                                    <td class="effect-indicator" style="width: 3px; padding: 0; border: none; background: transparent;"></td>
                                    <td>${rrEscapeHtml(DatabaseEffectEditor.getEffectName(effect.code))}</td>
                                    <td>${rrEscapeHtml(DatabaseEffectEditor.getEffectValue(effect, this.databaseManager))}</td>
                                </tr>
                            `).join('') :
                            `<tr><td style="width: 3px; padding: 0; border: none; background: transparent;"></td><td colspan="2" style="text-align: center; color: var(--color-text-muted); font-style: italic; padding: 12px;">${tt('No effects')}</td></tr>`}
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
        noteSection.innerHTML = `
            <div class="database-section-header">${tt('Note')}</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-skill-id="${skill.id}">${rrEscapeHtml(skill.note)}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners for all editable fields
        setTimeout(() => {
            AnimationPickerModal.bindTriggers(container, this.databaseManager, this.projectManager);
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
                    const normalized = this.updateSkillField(skillId, fieldName, value);
                    if (normalized !== undefined && e.target.type === 'number') e.target.value = String(normalized);
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
                   'speed', 'successRate', 'repeats', 'hitType', 'animationId',
                   'requiredWtypeId1', 'requiredWtypeId2'].includes(fieldName)) {
            skill[fieldName] = parseInt(value) || 0;
            if (fieldName === 'repeats') {
                skill[fieldName] = Math.max(1, Math.min(globalThis.RR_LIMITS?.ACTION_REPEATS || 100, skill[fieldName]));
            }
            console.log(`Updated skill ${skillId} field ${fieldName} to:`, skill[fieldName]);
        }
        // Handle string fields (name, description, note, message1-4)
        else {
            skill[fieldName] = value;
            console.log(`Updated skill ${skillId} field ${fieldName} to:`, value);
        }

        this.databaseManager.updateSkill(skillId, skill);
        return fieldName.startsWith('damage.') ? skill.damage[fieldName.split('.')[1]] : skill[fieldName];
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
            const tt = text => window.I18n ? window.I18n.tText(text) : text;

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
                { label: 'Paste', action: () => this.pasteEffect(skill), enabled: true },
                { label: 'Delete', action: () => this.deleteEffect(skill, effectIndex), enabled: effectIndex !== null }
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

    async cutEffect(skill, effectIndex) {
        if (effectIndex === null || !skill.effects) return;
        const target = DatabaseRowClipboard.capturePasteTarget(this.parentEditor, this.projectManager, this.databaseManager, skill.effects, effectIndex);
        const payload = this.copyEffect(skill, effectIndex);
        if (!await DatabaseRowClipboard.confirmCut(payload)) return;
        if (this.currentSkill !== skill
            || !DatabaseRowClipboard.isPasteTargetCurrent(target, this.parentEditor, this.projectManager, this.databaseManager, skill.effects)) return;
        skill.effects.splice(effectIndex, 1);
        this.databaseManager.updateSkill(skill.id, skill);
        this.refreshSkillDetail(skill);
    }

    copyEffect(skill, effectIndex) {
        if (effectIndex === null || !skill.effects) return;
        this.effectsClipboard = DatabaseRowClipboard.write('effect', skill.effects[effectIndex], this.databaseManager);
        return this.effectsClipboard;
    }

    async pasteEffect(skill) {
        const target = DatabaseRowClipboard.capturePasteTarget(this.parentEditor, this.projectManager, this.databaseManager, skill.effects);
        const result = await DatabaseRowClipboard.read('effect', this.databaseManager, this.effectsClipboard);
        if (this.currentSkill !== skill
            || !DatabaseRowClipboard.isPasteTargetCurrent(target, this.parentEditor, this.projectManager, this.databaseManager, skill.effects)) return;
        if (result.error) {
            DatabaseRowClipboard.showError(result);
            return;
        }
        if (!skill.effects) skill.effects = [];
        skill.effects.push(result.row);
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
