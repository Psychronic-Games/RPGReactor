/**
 * DatabaseClassEditor - Class-specific database editor
 */
class DatabaseClassEditor {
    constructor(databaseManager, projectManager, commonUI) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
    }

    showClassDetail(container, classEntry) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.height = '100%';

        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';
        gridWrapper.style.padding = '16px';
        gridWrapper.style.overflowX = 'hidden';

        gridWrapper.appendChild(this.createGeneralSection(classEntry));
        gridWrapper.appendChild(this.createTraitsSection(classEntry));
        gridWrapper.appendChild(this.createLearningsSection(classEntry));
        gridWrapper.appendChild(this.createNoteSection(classEntry));

        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        this.attachEventListeners(container, classEntry);
    }

    createGeneralSection(classEntry) {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.innerHTML = `
            <div class="database-section-header">General Settings</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Name:</label>
                        <input type="text" class="database-field-value" value="${classEntry.name || ''}" data-field="name" data-class-id="${classEntry.id}">
                    </div>
                </div>
                <div class="form-row">
                    <label class="database-field-label">Experience Curve:</label>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Basis:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${classEntry.expParams ? classEntry.expParams[0] : 30}" readonly>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Extra:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${classEntry.expParams ? classEntry.expParams[1] : 20}" readonly>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Accel A:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${classEntry.expParams ? classEntry.expParams[2] : 30}" readonly>
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Accel B:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${classEntry.expParams ? classEntry.expParams[3] : 30}" readonly>
                    </div>
                </div>
            </div>
        `;
        return section;
    }

    createTraitsSection(classEntry) {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.innerHTML = `
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
                        ${classEntry.traits && classEntry.traits.length > 0 ?
                            classEntry.traits.map(trait => `
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
        return section;
    }

    createLearningsSection(classEntry) {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.gridColumn = '1 / -1';

        const skills = this.databaseManager.getSkills();
        const learningsHTML = classEntry.learnings && classEntry.learnings.length > 0 ?
            classEntry.learnings.map(learning => {
                const skill = skills.find(s => s && s.id === learning.skillId);
                const skillName = skill ? skill.name : `Skill #${learning.skillId}`;
                return `
                    <tr>
                        <td style="width: 80px; text-align: center;">Level ${learning.level}</td>
                        <td>${skillName}</td>
                        <td style="width: 100px; text-align: right; color: #999;">#${learning.skillId}</td>
                    </tr>
                `;
            }).join('') :
            '<tr><td colspan="3" style="text-align: center; color: #999;">No skills learned</td></tr>';

        section.innerHTML = `
            <div class="database-section-header">Skills Learned by Level</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>Level</th>
                            <th>Skill</th>
                            <th>ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${learningsHTML}
                    </tbody>
                </table>
            </div>
        `;
        return section;
    }

    createNoteSection(classEntry) {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.gridColumn = '1 / -1';
        section.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="5" style="width: 100%;" data-field="note" data-class-id="${classEntry.id}">${classEntry.note || ''}</textarea>
            </div>
        `;
        return section;
    }

    attachEventListeners(container, classEntry) {
        setTimeout(() => {
            const editableFields = container.querySelectorAll('[data-field]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const classId = parseInt(e.target.dataset.classId);
                    const value = e.target.value;
                    this.updateClassField(classId, fieldName, value);
                });
            });
        }, 0);
    }

    updateClassField(classId, fieldName, value) {
        const classEntry = this.databaseManager.getClass(classId);
        if (!classEntry) return;

        classEntry[fieldName] = value;
        this.databaseManager.updateClass(classId, classEntry);
        console.log(`Updated class ${classId} field ${fieldName} to:`, value);

        this.commonUI.updateStatus(`${fieldName} updated`);
    }
}
