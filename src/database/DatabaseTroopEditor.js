/**
 * DatabaseTroopEditor - Editor for managing troop database entries
 * Handles display and editing of troop properties including members and battle events
 */

class DatabaseTroopEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
    }

    showTroopDetail(container, troop) {
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
        generalSection.style.gridColumn = '1 / -1';
        generalSection.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Name:</label>
                        <input type="text" class="database-field-value" value="${troop.name || ''}" data-field="name" data-troop-id="${troop.id}">
                    </div>
                </div>
            </div>
        `;
        gridWrapper.appendChild(generalSection);

        // Members Section
        const membersSection = document.createElement('div');
        membersSection.className = 'database-section';
        membersSection.style.gridColumn = '1 / -1';

        const enemies = this.databaseManager.getEnemies();
        const membersHTML = troop.members && troop.members.length > 0 ?
            troop.members.map(member => {
                const enemy = enemies.find(e => e && e.id === member.enemyId);
                const enemyName = enemy ? enemy.name : `Enemy #${member.enemyId}`;
                return `
                    <tr>
                        <td>${enemyName}</td>
                        <td>(${member.x}, ${member.y})</td>
                        <td>${member.hidden ? 'Yes' : 'No'}</td>
                    </tr>
                `;
            }).join('') :
            '<tr><td colspan="3" style="text-align: center; color: #999;">No members</td></tr>';

        membersSection.innerHTML = `
            <div class="database-section-header">Members</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>Enemy</th>
                            <th>Position</th>
                            <th>Hidden</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${membersHTML}
                    </tbody>
                </table>
            </div>
        `;
        gridWrapper.appendChild(membersSection);

        // Battle Events Section
        const pagesSection = document.createElement('div');
        pagesSection.className = 'database-section';
        pagesSection.style.gridColumn = '1 / -1';
        pagesSection.innerHTML = `
            <div class="database-section-header">Battle Events</div>
            <div class="database-section-content">
                <p style="color: #999;">${troop.pages ? troop.pages.length : 0} event page(s) defined</p>
                <p style="color: #999; font-size: 11px;">Battle events can be edited in the advanced editor</p>
            </div>
        `;
        gridWrapper.appendChild(pagesSection);

        // Note Section
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.style.gridColumn = '1 / -1';
        noteSection.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="4" style="width: 100%;" data-field="note" data-troop-id="${troop.id}">${troop.note || ''}</textarea>
            </div>
        `;
        gridWrapper.appendChild(noteSection);

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-troop-id]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const troopId = parseInt(e.target.dataset.troopId);
                    const value = e.target.value;
                    this.updateTroopField(troopId, fieldName, value);
                });
            });
        }, 0);
    }

    updateTroopField(troopId, fieldName, value) {
        const troop = this.databaseManager.getTroop(troopId);
        if (!troop) return;

        troop[fieldName] = value;
        this.databaseManager.updateTroop(troopId, troop);
        console.log(`Updated troop ${troopId} field ${fieldName} to:`, value);
    }
}
