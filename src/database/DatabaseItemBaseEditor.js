/**
 * DatabaseItemBaseEditor - Base class for item-like editors (Skills, Items, Weapons, Armors)
 * Provides common UI patterns for items with icons
 */
class DatabaseItemBaseEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
    }

    /**
     * Create standard icon section
     */
    createIconSection(entry, type) {
        const iconSection = document.createElement('div');
        iconSection.className = 'database-section';
        iconSection.style.borderBottom = '2px solid #007acc';
        iconSection.innerHTML = '<div class="database-section-header">Icon</div>';
        const iconContent = document.createElement('div');
        iconContent.className = 'database-section-content';
        iconContent.style.textAlign = 'center';
        this.parentEditor.addDatabasePreview(iconContent, entry, type);
        iconSection.appendChild(iconContent);
        return iconSection;
    }

    /**
     * Create standard name and description section
     */
    createNameDescriptionSection(entry, dataAttr) {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.innerHTML = `
            <div class="database-section-header">General</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Name:</label>
                        <input type="text" class="database-field-value" value="${entry.name || ''}" data-field="name" data-${dataAttr}="${entry.id}">
                    </div>
                </div>
                <div class="form-row">
                    <label class="database-field-label">Description:</label>
                </div>
                <div class="form-row">
                    <textarea class="database-field-value" rows="2" style="width: 100%;" data-field="description" data-${dataAttr}="${entry.id}">${entry.description || ''}</textarea>
                </div>
            </div>
        `;
        return section;
    }

    /**
     * Create standard note section
     */
    createNoteSection(entry, dataAttr) {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.gridColumn = '1 / -1';
        section.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="5" style="width: 100%;" data-field="note" data-${dataAttr}="${entry.id}">${entry.note || ''}</textarea>
            </div>
        `;
        return section;
    }

    /**
     * Create traits section
     */
    createTraitsSection(entry) {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.gridColumn = '1 / -1';
        section.innerHTML = `
            <div class="database-section-header">Traits & Effects</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Content</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entry.traits && entry.traits.length > 0 ?
                            entry.traits.map(trait => `
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
}
