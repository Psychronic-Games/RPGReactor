/**
 * DatabaseArmorEditor - Editor for managing armor database entries
 * Handles display and editing of armor properties including parameters, traits, and general settings
 */

class DatabaseArmorEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
    }

    showArmorDetail(container, armor) {
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
        this.parentEditor.addDatabasePreview(iconContent, armor, 'armors');
        iconSection.appendChild(iconContent);
        wrapper.appendChild(iconSection);

        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';
        gridWrapper.style.padding = '16px';

        const armorTypeNames = ['', 'General Armor', 'Magic Armor', 'Light Armor', 'Heavy Armor', 'Small Shield', 'Large Shield'];
        const equipTypeNames = ['', 'Weapon', 'Shield', 'Head', 'Body', 'Accessory'];

        // General Settings
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Name:</label>
                        <input type="text" class="database-field-value" value="${armor.name || ''}" data-field="name" data-armor-id="${armor.id}">
                    </div>
                </div>
                <div class="form-row">
                    <label class="database-field-label">Description:</label>
                </div>
                <div class="form-row">
                    <textarea class="database-field-value" rows="2" style="width: 100%;" data-field="description" data-armor-id="${armor.id}">${armor.description || ''}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Armor Type:</label>
                        <select class="database-field-value" style="width: 140px;" readonly disabled>
                            ${armorTypeNames.map((name, idx) => idx > 0 ? `<option value="${idx}" ${armor.atypeId === idx ? 'selected' : ''}>${name}</option>` : '').join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Equip Type:</label>
                        <select class="database-field-value" style="width: 120px;" readonly disabled>
                            ${equipTypeNames.map((name, idx) => idx > 0 ? `<option value="${idx}" ${armor.etypeId === idx ? 'selected' : ''}>${name}</option>` : '').join('')}
                        </select>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Price:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${armor.price || 0}" readonly>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(generalSection);

        // Parameters Section
        const params = armor.params || [0,0,0,0,0,0,0,0];
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
                        ${armor.traits && armor.traits.length > 0 ?
                            armor.traits.map(trait => `
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
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-armor-id="${armor.id}">${armor.note || ''}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-armor-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const armorId = parseInt(e.target.dataset.armorId);
                    const value = e.target.value;
                    this.updateArmorField(armorId, fieldName, value);
                });
            });
        }, 0);
    }

    updateArmorField(armorId, fieldName, value) {
        const armor = this.databaseManager.getArmor(armorId);
        if (!armor) return;

        armor[fieldName] = value;
        this.databaseManager.updateArmor(armorId, armor);
        console.log(`Updated armor ${armorId} field ${fieldName} to:`, value);
    }
}
