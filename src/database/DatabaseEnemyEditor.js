/**
 * DatabaseEnemyEditor - Editor for managing enemy database entries
 * Handles display and editing of enemy properties including parameters, drop items, actions, and traits
 */

class DatabaseEnemyEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
    }

    showEnemyDetail(container, enemy) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.height = '100%';

        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';
        gridWrapper.style.padding = '16px';

        // General Settings
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Name:</label>
                        <input type="text" class="database-field-value" value="${enemy.name || ''}" data-field="name" data-enemy-id="${enemy.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Battler:</label>
                        <input type="text" class="database-field-value" style="width: 150px;" value="${enemy.battlerName || ''}" readonly>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Hue:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${enemy.battlerHue || 0}" readonly>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">EXP:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${enemy.exp || 0}" readonly>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Gold:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${enemy.gold || 0}" readonly>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(generalSection);

        // Parameters Section
        const params = enemy.params || [0,0,0,0,0,0,0,0];
        const paramNames = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
        const paramsSection = document.createElement('div');
        paramsSection.className = 'database-section';
        paramsSection.innerHTML = `
            <div class="database-section-header">Parameters</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>Stat</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${paramNames.map((name, idx) => `
                            <tr>
                                <td>${name}</td>
                                <td>${params[idx]}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        gridWrapper.appendChild(paramsSection);

        // Drop Items Section
        const dropSection = document.createElement('div');
        dropSection.className = 'database-section';
        dropSection.style.gridColumn = '1 / -1';

        const dropItemsHTML = enemy.dropItems && enemy.dropItems.length > 0 ?
            enemy.dropItems.filter(drop => drop.kind > 0).map(drop => {
                const kindNames = ['', 'Item', 'Weapon', 'Armor'];
                const chance = Math.round(1 / drop.denominator * 100);
                return `
                    <tr>
                        <td>${kindNames[drop.kind] || 'Unknown'}</td>
                        <td>#${drop.dataId}</td>
                        <td>1/${drop.denominator} (${chance}%)</td>
                    </tr>
                `;
            }).join('') :
            '<tr><td colspan="3" style="text-align: center; color: #999;">No drop items</td></tr>';

        dropSection.innerHTML = `
            <div class="database-section-header">Drop Items</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>ID</th>
                            <th>Chance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dropItemsHTML}
                    </tbody>
                </table>
            </div>
        `;
        gridWrapper.appendChild(dropSection);

        // Actions Section
        const actionsSection = document.createElement('div');
        actionsSection.className = 'database-section';
        actionsSection.style.gridColumn = '1 / -1';

        const conditionNames = ['Always', 'Turn', 'HP', 'MP', 'State', 'Party Level', 'Switch'];
        const actionsHTML = enemy.actions && enemy.actions.length > 0 ?
            enemy.actions.map(action => {
                const skills = this.databaseManager.getSkills();
                const skill = skills.find(s => s && s.id === action.skillId);
                const skillName = skill ? skill.name : `Skill #${action.skillId}`;
                return `
                    <tr>
                        <td>${skillName}</td>
                        <td>${conditionNames[action.conditionType] || 'Unknown'}</td>
                        <td>${action.rating}</td>
                    </tr>
                `;
            }).join('') :
            '<tr><td colspan="3" style="text-align: center; color: #999;">No actions</td></tr>';

        actionsSection.innerHTML = `
            <div class="database-section-header">Actions</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>Skill</th>
                            <th>Condition</th>
                            <th>Rating</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${actionsHTML}
                    </tbody>
                </table>
            </div>
        `;
        gridWrapper.appendChild(actionsSection);

        // Traits Section
        const traitsSection = document.createElement('div');
        traitsSection.className = 'database-section';
        traitsSection.style.gridColumn = '1 / -1';
        traitsSection.innerHTML = `
            <div class="database-section-header">Traits</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Content</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${enemy.traits && enemy.traits.length > 0 ?
                            enemy.traits.map(trait => `
                                <tr>
                                    <td>${this.commonUI.getTraitName(trait.code)}</td>
                                    <td>${this.commonUI.getTraitValue(trait)}</td>
                                </tr>
                            `).join('') :
                            '<tr><td colspan="2" style="text-align: center; color: #999;">No traits</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
        gridWrapper.appendChild(traitsSection);

        // Note Section
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.style.gridColumn = '1 / -1';
        noteSection.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-enemy-id="${enemy.id}">${enemy.note || ''}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-enemy-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const enemyId = parseInt(e.target.dataset.enemyId);
                    const value = e.target.value;
                    this.updateEnemyField(enemyId, fieldName, value);
                });
            });
        }, 0);
    }

    updateEnemyField(enemyId, fieldName, value) {
        const enemy = this.databaseManager.getEnemy(enemyId);
        if (!enemy) return;

        enemy[fieldName] = value;
        this.databaseManager.updateEnemy(enemyId, enemy);
        console.log(`Updated enemy ${enemyId} field ${fieldName} to:`, value);
    }
}
