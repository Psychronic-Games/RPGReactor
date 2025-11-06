/**
 * DatabaseWeaponEditor - Editor for managing weapon database entries
 * Handles display and editing of weapon properties including parameters, traits, and general settings
 */

class DatabaseWeaponEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
    }

    showWeaponDetail(container, weapon) {
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
        this.parentEditor.addDatabasePreview(iconContent, weapon, 'weapons');
        iconSection.appendChild(iconContent);
        wrapper.appendChild(iconSection);

        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';
        gridWrapper.style.padding = '16px';

        const weaponTypeNames = ['', 'Dagger', 'Sword', 'Flail', 'Axe', '', 'Staff', 'Bow', 'Crossbow', '', 'Claw', 'Glove', 'Spear'];

        // General Settings
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Name:</label>
                        <input type="text" class="database-field-value" value="${weapon.name || ''}" data-field="name" data-weapon-id="${weapon.id}">
                    </div>
                </div>
                <div class="form-row">
                    <label class="database-field-label">Description:</label>
                </div>
                <div class="form-row">
                    <textarea class="database-field-value" rows="2" style="width: 100%;" data-field="description" data-weapon-id="${weapon.id}">${weapon.description || ''}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Weapon Type:</label>
                        <select class="database-field-value" style="width: 120px;" readonly disabled>
                            ${weaponTypeNames.map((name, idx) => idx > 0 && name ? `<option value="${idx}" ${weapon.wtypeId === idx ? 'selected' : ''}>${name}</option>` : '').join('')}
                        </select>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Price:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${weapon.price || 0}" readonly>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(generalSection);

        // Parameters Section
        const params = weapon.params || [0,0,0,0,0,0,0,0];
        const paramNames = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
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
                                <td>${params[idx] > 0 ? '+' : ''}${params[idx]}</td>
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
                        ${weapon.traits && weapon.traits.length > 0 ?
                            weapon.traits.map(trait => `
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
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-weapon-id="${weapon.id}">${weapon.note || ''}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-weapon-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const weaponId = parseInt(e.target.dataset.weaponId);
                    const value = e.target.value;
                    this.updateWeaponField(weaponId, fieldName, value);
                });
            });
        }, 0);
    }

    updateWeaponField(weaponId, fieldName, value) {
        const weapon = this.databaseManager.getWeapon(weaponId);
        if (!weapon) return;

        weapon[fieldName] = value;
        this.databaseManager.updateWeapon(weaponId, weapon);
        console.log(`Updated weapon ${weaponId} field ${fieldName} to:`, value);
    }
}
