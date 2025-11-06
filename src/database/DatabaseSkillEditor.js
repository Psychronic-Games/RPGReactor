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
    }

    showSkillDetail(container, skill) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.height = '100%';

        // Icon preview at top
        const iconSection = document.createElement('div');
        iconSection.className = 'database-section';
        iconSection.style.borderBottom = '2px solid #007acc';
        iconSection.innerHTML = '<div class="database-section-header">Icon</div>';
        const iconContent = document.createElement('div');
        iconContent.className = 'database-section-content';
        iconContent.style.textAlign = 'center';
        this.parentEditor.addDatabasePreview(iconContent, skill, 'skills');
        iconSection.appendChild(iconContent);
        wrapper.appendChild(iconSection);

        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';
        gridWrapper.style.padding = '16px';

        // Scope names
        const scopeNames = ['None', 'One Enemy', 'All Enemies', '3 Random', '4 Random', '2 Random', '1 Random',
                           'One Ally', 'All Allies', 'One Ally (Dead)', 'All Allies (Dead)', 'User'];
        const occasionNames = ['Always', 'Battle Only', 'Menu Only', 'Never'];
        const damageTypeNames = ['None', 'HP Damage', 'MP Damage', 'HP Recover', 'MP Recover', 'HP Drain', 'MP Drain'];
        const hitTypeNames = ['Certain', 'Physical', 'Magical'];

        // General Settings
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content">
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
                        <input type="number" class="database-field-value database-field-value-small" value="${skill.stypeId || 1}" readonly>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Scope:</label>
                        <select class="database-field-value" style="width: 150px;" readonly disabled>
                            ${scopeNames.map((name, idx) => `<option value="${idx}" ${skill.scope === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Occasion:</label>
                        <select class="database-field-value" style="width: 120px;" readonly disabled>
                            ${occasionNames.map((name, idx) => `<option value="${idx}" ${skill.occasion === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(generalSection);

        // Cost Section
        const costSection = document.createElement('div');
        costSection.className = 'database-section';
        costSection.innerHTML = `
            <div class="database-section-header">Cost</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">MP Cost:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${skill.mpCost || 0}" readonly>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">TP Cost:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${skill.tpCost || 0}" readonly>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">TP Gain:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${skill.tpGain || 0}" readonly>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(costSection);

        // Damage Section
        const damage = skill.damage || {};
        const damageSection = document.createElement('div');
        damageSection.className = 'database-section';
        damageSection.style.gridColumn = '1 / -1';
        damageSection.innerHTML = `
            <div class="database-section-header">Damage</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Type:</label>
                        <select class="database-field-value" style="width: 150px;" readonly disabled>
                            ${damageTypeNames.map((name, idx) => `<option value="${idx}" ${damage.type === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Element:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${damage.elementId || -1}" readonly>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Formula:</label>
                        <input type="text" class="database-field-value" style="font-family: monospace;" value="${damage.formula || ''}" readonly>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Variance:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${damage.variance || 20}" readonly>
                        <span style="color: #999; margin-left: 4px;">%</span>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Critical:</label>
                        <input type="checkbox" ${damage.critical ? 'checked' : ''} disabled>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(damageSection);

        // Effects Section
        const effectsSection = document.createElement('div');
        effectsSection.className = 'database-section';
        effectsSection.style.gridColumn = '1 / -1';

        const effectNames = {
            11: 'HP Recovery', 12: 'MP Recovery', 13: 'TP Gain',
            21: 'Add State', 22: 'Remove State',
            31: 'Add Buff', 32: 'Add Debuff', 33: 'Remove Buff', 34: 'Remove Debuff',
            41: 'Special Effect', 42: 'Grow', 43: 'Learn Skill', 44: 'Common Event'
        };

        const effectsHTML = skill.effects && skill.effects.length > 0 ?
            skill.effects.map(effect => {
                const name = effectNames[effect.code] || `Effect ${effect.code}`;
                let value = '';
                if (effect.code === 11 || effect.code === 12) {
                    value = `${effect.value1 > 0 ? '+' : ''}${effect.value1}% ${effect.value2 > 0 ? '+' : ''}${effect.value2}`;
                } else if (effect.code === 21 || effect.code === 22) {
                    value = `State #${effect.dataId} (${Math.round(effect.value1 * 100)}%)`;
                } else if (effect.code >= 31 && effect.code <= 34) {
                    const params = ['MaxHP', 'MaxMP', 'ATK', 'DEF', 'MATK', 'MDEF', 'AGI', 'LUK'];
                    value = `${params[effect.dataId] || effect.dataId} (${effect.value1} turns)`;
                } else {
                    value = `Data: ${effect.dataId}, Value: ${effect.value1}`;
                }
                return `
                    <tr>
                        <td>${name}</td>
                        <td>${value}</td>
                    </tr>
                `;
            }).join('') :
            '<tr><td colspan="2" style="text-align: center; color: #999;">No effects</td></tr>';

        effectsSection.innerHTML = `
            <div class="database-section-header">Effects</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>Effect</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${effectsHTML}
                    </tbody>
                </table>
            </div>
        `;
        gridWrapper.appendChild(effectsSection);

        // Note Section
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

        // Add event listeners
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-skill-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const skillId = parseInt(e.target.dataset.skillId);
                    const value = e.target.value;
                    this.updateSkillField(skillId, fieldName, value);
                });
            });
        }, 0);
    }

    updateSkillField(skillId, fieldName, value) {
        const skill = this.databaseManager.getSkill(skillId);
        if (!skill) return;

        skill[fieldName] = value;
        this.databaseManager.updateSkill(skillId, skill);
        console.log(`Updated skill ${skillId} field ${fieldName} to:`, value);
    }
}
