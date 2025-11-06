/**
 * DatabaseStateEditor - Editor for managing state database entries
 * Handles display and editing of state properties including duration, restrictions, and traits
 */

class DatabaseStateEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
    }

    showStateDetail(container, state) {
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

        // Render state icon
        if (state.iconIndex !== undefined) {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            canvas.className = 'icon-preview';
            iconContent.appendChild(canvas);

            const ctx = canvas.getContext('2d');
            const img = new Image();
            const path = require('path');
            const currentProject = this.projectManager.getCurrentProject();
            const imgPath = 'file://' + path.join(currentProject.path, 'img', 'system', 'IconSet.png');

            img.onload = () => {
                const iconsPerRow = 16;
                const iconSize = 32;
                const col = state.iconIndex % iconsPerRow;
                const row = Math.floor(state.iconIndex / iconsPerRow);
                ctx.drawImage(img, col * iconSize, row * iconSize, iconSize, iconSize, 0, 0, canvas.width, canvas.height);
            };
            img.src = imgPath;
        }

        iconSection.appendChild(iconContent);
        wrapper.appendChild(iconSection);

        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';
        gridWrapper.style.padding = '16px';

        const restrictionNames = ['None', 'Attack Enemy', 'Attack Anyone', 'Attack Ally', 'Cannot Move'];
        const removalNames = ['None', 'End of Action', 'End of Turn'];

        // General Settings
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Name:</label>
                        <input type="text" class="database-field-value" value="${state.name || ''}" data-field="name" data-state-id="${state.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Priority:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${state.priority || 50}" readonly>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Restriction:</label>
                        <select class="database-field-value" style="width: 150px;" readonly disabled>
                            ${restrictionNames.map((name, idx) => `<option value="${idx}" ${state.restriction === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(generalSection);

        // Duration Settings
        const durationSection = document.createElement('div');
        durationSection.className = 'database-section';
        durationSection.innerHTML = `
            <div class="database-section-header">Duration</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Auto-Remove:</label>
                        <select class="database-field-value" style="width: 130px;" readonly disabled>
                            ${removalNames.map((name, idx) => `<option value="${idx}" ${state.autoRemovalTiming === idx ? 'selected' : ''}>${name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Min Turns:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${state.minTurns || 1}" readonly>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Max Turns:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${state.maxTurns || 1}" readonly>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label" style="width: auto;">Remove by Damage:</label>
                        <input type="checkbox" ${state.removeByDamage ? 'checked' : ''} disabled>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label" style="width: auto;">Remove at Battle End:</label>
                        <input type="checkbox" ${state.removeAtBattleEnd ? 'checked' : ''} disabled>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label" style="width: auto;">Remove by Walking:</label>
                        <input type="checkbox" ${state.removeByWalking ? 'checked' : ''} disabled>
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(durationSection);

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
                        ${state.traits && state.traits.length > 0 ?
                            state.traits.map(trait => `
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
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-state-id="${state.id}">${state.note || ''}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-state-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const stateId = parseInt(e.target.dataset.stateId);
                    const value = e.target.value;
                    this.updateStateField(stateId, fieldName, value);
                });
            });
        }, 0);
    }

    updateStateField(stateId, fieldName, value) {
        const state = this.databaseManager.getState(stateId);
        if (!state) return;

        state[fieldName] = value;
        this.databaseManager.updateState(stateId, state);
        console.log(`Updated state ${stateId} field ${fieldName} to:`, value);
    }
}
