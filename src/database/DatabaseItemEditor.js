/**
 * DatabaseItemEditor - Editor for managing item database entries
 * Handles display and editing of item properties including type, effects, and general settings
 */

class DatabaseItemEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
    }

    showItemDetail(container, item) {
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
        this.parentEditor.addDatabasePreview(iconContent, item, 'items');
        iconSection.appendChild(iconContent);
        wrapper.appendChild(iconSection);

        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';
        gridWrapper.style.padding = '16px';

        const scopeNames = ['None', 'One Enemy', 'All Enemies', '3 Random', '4 Random', '2 Random', '1 Random',
                           'One Ally', 'All Allies', 'One Ally (Dead)', 'All Allies (Dead)', 'User'];
        const occasionNames = ['Always', 'Battle Only', 'Menu Only', 'Never'];
        const itemTypeNames = ['', 'Regular Item', 'Key Item'];

        // General Settings
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Name:</label>
                        <input type="text" class="database-field-value" value="${item.name || ''}" data-field="name" data-item-id="${item.id}">
                    </div>
                </div>
                <div class="form-row">
                    <label class="database-field-label">Description:</label>
                </div>
                <div class="form-row">
                    <textarea class="database-field-value" rows="2" style="width: 100%;" data-field="description" data-item-id="${item.id}">${item.description || ''}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Item Type:</label>
                        <select class="database-field-value" style="width: 120px;" readonly disabled>
                            ${itemTypeNames.map((name, idx) => idx > 0 ? `<option value="${idx}" ${item.itypeId === idx ? 'selected' : ''}>${name}</option>` : '').join('')}
                        </select>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Price:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${item.price || 0}" readonly>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Consumable:</label>
                        <input type="checkbox" ${item.consumable ? 'checked' : ''} disabled>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Scope:</label>
                        <select class="database-field-value" style="width: 150px;" readonly disabled>
                            ${scopeNames.map((name, idx) => `<option value="${idx}" ${item.scope === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Occasion:</label>
                        <select class="database-field-value" style="width: 120px;" readonly disabled>
                            ${occasionNames.map((name, idx) => `<option value="${idx}" ${item.occasion === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(generalSection);

        // Effects Section
        const effectsSection = document.createElement('div');
        effectsSection.className = 'database-section';

        const effectNames = {
            11: 'HP Recovery', 12: 'MP Recovery', 13: 'TP Gain',
            21: 'Add State', 22: 'Remove State',
            31: 'Add Buff', 32: 'Add Debuff', 33: 'Remove Buff', 34: 'Remove Debuff',
            41: 'Special Effect', 42: 'Grow', 43: 'Learn Skill', 44: 'Common Event'
        };

        const effectsHTML = item.effects && item.effects.length > 0 ?
            item.effects.map(effect => {
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
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-item-id="${item.id}">${item.note || ''}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-item-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const itemId = parseInt(e.target.dataset.itemId);
                    const value = e.target.value;
                    this.updateItemField(itemId, fieldName, value);
                });
            });
        }, 0);
    }

    updateItemField(itemId, fieldName, value) {
        const item = this.databaseManager.getItem(itemId);
        if (!item) return;

        item[fieldName] = value;
        this.databaseManager.updateItem(itemId, item);
        console.log(`Updated item ${itemId} field ${fieldName} to:`, value);
    }
}
