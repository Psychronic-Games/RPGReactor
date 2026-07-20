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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const iconSection = document.createElement('div');
        iconSection.className = 'database-section';
        iconSection.style.borderBottom = '2px solid var(--color-link)';
        iconSection.innerHTML = `<div class="database-section-header">${tt('Icon')}</div>`;
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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'database-section';
        section.innerHTML = `
            <div class="database-section-header">${tt('General')}</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">${tt('Name:')}</label>
                        <input type="text" class="database-field-value" value="${rrEscapeHtml(entry.name)}" data-field="name" data-${dataAttr}="${entry.id}">
                    </div>
                </div>
                <div class="form-row">
                    <label class="database-field-label">${tt('Description:')}</label>
                </div>
                <div class="form-row">
                    <textarea class="database-field-value" rows="2" style="width: 100%;" data-field="description" data-${dataAttr}="${entry.id}">${rrEscapeHtml(entry.description)}</textarea>
                </div>
            </div>
        `;
        return section;
    }

    /**
     * Create standard note section
     */
    createNoteSection(entry, dataAttr) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.gridColumn = '1 / -1';
        section.innerHTML = `
            <div class="database-section-header">${tt('Note')}</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="5" style="width: 100%;" data-field="note" data-${dataAttr}="${entry.id}">${rrEscapeHtml(entry.note)}</textarea>
            </div>
        `;
        return section;
    }

    /**
     * Create traits section
     */
    createTraitsSection(entry) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.gridColumn = '1 / -1';
        section.innerHTML = `
            <div class="database-section-header">${tt('Traits & Effects')}</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>${tt('Type')}</th>
                            <th>${tt('Content')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entry.traits && entry.traits.length > 0 ?
                            entry.traits.map(trait => `
                                <tr>
                                    <td>${rrEscapeHtml(this.commonUI.getTraitName(trait.code))}</td>
                                    <td>${rrEscapeHtml(this.commonUI.getTraitValue(trait))}</td>
                                </tr>
                            `).join('') :
                            `<tr><td colspan="2" style="text-align: center; color: var(--color-text-muted);">${tt('No traits')}</td></tr>`}
                    </tbody>
                </table>
            </div>
        `;
        return section;
    }
}
