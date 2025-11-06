/**
 * DatabaseActorEditor - Actor-specific database editor
 * Handles rendering and editing of Actor entries
 */
class DatabaseActorEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor; // Reference to main editor for addDatabasePreview, etc.
        this.currentProject = projectManager.getCurrentProject();
    }

    /**
     * Show actor detail view
     */
    showActorDetail(container, actor) {
        // Get class name
        const actorClass = this.databaseManager.getClass(actor.classId);
        const className = actorClass ? actorClass.name : `Class #${actor.classId}`;

        // Create a wrapper for better layout
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.height = '100%';

        // Images Section (TOP ROW - Full Width)
        const imagesSection = document.createElement('div');
        imagesSection.className = 'database-section';
        imagesSection.style.borderBottom = '2px solid #007acc';
        const imagesContent = document.createElement('div');
        imagesContent.className = 'database-section-content';

        imagesSection.innerHTML = '<div class="database-section-header">Images</div>';
        imagesSection.appendChild(imagesContent);

        // Add previews (delegates to parent editor)
        this.parentEditor.addDatabasePreview(imagesContent, actor, 'actors');

        wrapper.appendChild(imagesSection);

        // Create grid wrapper for remaining sections (below images)
        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'database-sections-grid';
        gridWrapper.style.padding = '16px';
        gridWrapper.style.overflowX = 'hidden';

        // General Settings Section
        const generalSection = this.createGeneralSettingsSection(actor);
        gridWrapper.appendChild(generalSection);

        // Equipment Section
        const equipmentSection = this.createEquipmentSection(actor);
        gridWrapper.appendChild(equipmentSection);

        // Traits Section
        const traitsSection = this.createTraitsSection(actor);
        gridWrapper.appendChild(traitsSection);

        // Note Section
        const noteSection = this.createNoteSection(actor);
        gridWrapper.appendChild(noteSection);

        // Add wrapper to container
        wrapper.appendChild(gridWrapper);
        container.appendChild(wrapper);

        // Add event listeners
        this.attachEventListeners(container, actor);
    }

    /**
     * Create General Settings section
     */
    createGeneralSettingsSection(actor) {
        const generalSection = document.createElement('div');
        generalSection.className = 'database-section';

        // Get all classes for dropdown
        const allClasses = this.databaseManager.getClasses();
        const classOptions = allClasses.map(cls =>
            `<option value="${cls.id}" ${cls.id === actor.classId ? 'selected' : ''}>#${cls.id} ${cls.name}</option>`
        ).join('');

        generalSection.innerHTML = `
            <div class="database-section-header">General Settings</div>
            <div class="database-section-content">
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Name:</label>
                        <input type="text" class="database-field-value" value="${actor.name || ''}" data-field="name" data-actor-id="${actor.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Nickname:</label>
                        <input type="text" class="database-field-value" value="${actor.nickname || ''}" data-field="nickname" data-actor-id="${actor.id}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="database-field-label">Class:</label>
                        <select class="database-field-value" data-field="classId" data-actor-id="${actor.id}">
                            ${classOptions}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group-fixed">
                        <label class="database-field-label">Initial Level:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${actor.initialLevel || 1}" data-field="initialLevel" data-actor-id="${actor.id}">
                    </div>
                    <div class="form-group-fixed">
                        <label class="database-field-label">Max Level:</label>
                        <input type="number" class="database-field-value database-field-value-small" value="${actor.maxLevel || 99}" data-field="maxLevel" data-actor-id="${actor.id}">
                    </div>
                </div>
                <div class="form-row">
                    <label class="database-field-label">Profile:</label>
                </div>
                <div class="form-row">
                    <textarea class="database-field-value" rows="3" style="width: 100%;" data-field="profile" data-actor-id="${actor.id}">${actor.profile || ''}</textarea>
                </div>
            </div>
        `;
        return generalSection;
    }

    /**
     * Create Equipment section
     */
    createEquipmentSection(actor) {
        const equipmentSection = document.createElement('div');
        equipmentSection.className = 'database-section';

        // Get equipment configuration
        const systemData = this.databaseManager.getSystem() || {};
        const equipTypes = systemData.equipTypes || [];
        const weaponTypes = systemData.weaponTypes || [];
        const armorTypes = systemData.armorTypes || [];
        const equipSlots = this.getActorEquipSlots(actor);

        // Build equipment list
        let equipmentHTML = '';
        if (actor.equips && actor.equips.length > 0) {
            actor.equips.forEach((equipId, slotIndex) => {
                const etypeId = equipSlots[slotIndex];
                const slotName = equipTypes[etypeId] || `Slot ${slotIndex}`;

                let options = '<option value="0">(None)</option>';

                if (etypeId === 1) {
                    // Weapon slot
                    const weapons = this.databaseManager.getWeapons();
                    weapons.forEach(weapon => {
                        if (weapon) {
                            const weaponType = weaponTypes[weapon.wtypeId] || 'Weapon';
                            const selected = weapon.id === equipId ? 'selected' : '';
                            options += `<option value="${weapon.id}" ${selected}>${weapon.name} (${weaponType})</option>`;
                        }
                    });
                } else {
                    // Armor slot
                    const armors = this.databaseManager.getArmors();
                    armors.forEach(armor => {
                        if (armor && armor.etypeId === etypeId) {
                            const armorType = armorTypes[armor.atypeId] || 'Armor';
                            const selected = armor.id === equipId ? 'selected' : '';
                            options += `<option value="${armor.id}" ${selected}>${armor.name} (${armorType})</option>`;
                        }
                    });
                }

                equipmentHTML += `
                    <tr>
                        <td style="width: 120px;">${slotName}</td>
                        <td>
                            <select class="database-field-value equipment-select"
                                    data-actor-id="${actor.id}"
                                    data-slot-index="${slotIndex}"
                                    style="width: 100%;">
                                ${options}
                            </select>
                        </td>
                    </tr>
                `;
            });
        }

        equipmentSection.innerHTML = `
            <div class="database-section-header">Equipment</div>
            <div class="database-section-content">
                <table class="traits-table">
                    <thead>
                        <tr>
                            <th>Slot</th>
                            <th>Item</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${equipmentHTML || '<tr><td colspan="2" style="text-align: center; color: #999;">No equipment</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
        return equipmentSection;
    }

    /**
     * Create Traits section
     */
    createTraitsSection(actor) {
        const traitsSection = document.createElement('div');
        traitsSection.className = 'database-section';
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
                        ${actor.traits && actor.traits.length > 0 ?
                            actor.traits.map(trait => `
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
        return traitsSection;
    }

    /**
     * Create Note section
     */
    createNoteSection(actor) {
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" rows="5" style="width: 100%;" data-field="note" data-actor-id="${actor.id}">${actor.note || ''}</textarea>
            </div>
        `;
        return noteSection;
    }

    /**
     * Attach event listeners for editing
     */
    attachEventListeners(container, actor) {
        setTimeout(() => {
            // Equipment changes
            const equipSelects = container.querySelectorAll('.equipment-select');
            equipSelects.forEach(select => {
                select.addEventListener('change', (e) => {
                    const actorId = parseInt(e.target.dataset.actorId);
                    const slotIndex = parseInt(e.target.dataset.slotIndex);
                    const newEquipId = parseInt(e.target.value);
                    this.changeActorEquipment(actorId, slotIndex, newEquipId);
                });
            });

            // Field changes
            const editableFields = container.querySelectorAll('[data-field]');
            editableFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const fieldName = e.target.dataset.field;
                    const actorId = parseInt(e.target.dataset.actorId || actor.id);
                    const value = e.target.value;
                    this.updateActorField(actorId, fieldName, value);
                });
            });
        }, 0);
    }

    /**
     * Get equipment slots for an actor
     */
    getActorEquipSlots(actor) {
        const system = this.databaseManager.getSystem();
        if (!system || !system.equipTypes) {
            return [1, 2, 3, 4, 5];
        }

        const slots = [];
        for (let i = 1; i < system.equipTypes.length; i++) {
            slots.push(i);
        }

        // Check for dual-wield trait
        if (slots.length >= 2 && this.isDualWield(actor)) {
            slots[1] = 1; // Change second slot to Weapon
        }

        return slots;
    }

    /**
     * Check if actor has dual-wield trait
     */
    isDualWield(actor) {
        if (actor.traits) {
            for (const trait of actor.traits) {
                if (trait.code === 55 && trait.dataId === 1) {
                    return true;
                }
            }
        }

        const actorClass = this.databaseManager.getClass(actor.classId);
        if (actorClass && actorClass.traits) {
            for (const trait of actorClass.traits) {
                if (trait.code === 55 && trait.dataId === 1) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Change actor equipment
     */
    changeActorEquipment(actorId, slotIndex, equipId) {
        const actor = this.databaseManager.getActor(actorId);
        if (!actor) return;

        actor.equips[slotIndex] = equipId;
        this.databaseManager.updateActor(actorId, actor);
        console.log(`Changed actor ${actorId} slot ${slotIndex} to equipment ${equipId}`);

        this.commonUI.updateStatus('Equipment changed');
    }

    /**
     * Update actor field
     */
    updateActorField(actorId, fieldName, value) {
        const actor = this.databaseManager.getActor(actorId);
        if (!actor) return;

        // Handle different field types
        if (fieldName === 'initialLevel' || fieldName === 'maxLevel' || fieldName === 'classId') {
            actor[fieldName] = parseInt(value);
        } else {
            actor[fieldName] = value;
        }

        this.databaseManager.updateActor(actorId, actor);
        console.log(`Updated actor ${actorId} field ${fieldName} to ${value}`);

        this.commonUI.updateStatus(`${fieldName} updated`);
    }
}
