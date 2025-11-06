/**
 * DatabaseEditorUI.js
 * Handles all database editing UI functionality for RPG Reactor
 * Extracted from main.js for better code organization
 */

class DatabaseEditorUI {
    constructor(databaseManager, project, callbacks = {}) {
        this.databaseManager = databaseManager;
        this.currentProject = project;
        this.callbacks = callbacks;

        // Animation preview state
        this.animationPreviews = {};

        // Initialize modular editors
        this.commonUI = new DatabaseCommonUI(databaseManager, { getCurrentProject: () => this.currentProject });
        this.actorEditor = new DatabaseActorEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.classEditor = new DatabaseClassEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI);
        this.skillEditor = new DatabaseSkillEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.itemEditor = new DatabaseItemEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.weaponEditor = new DatabaseWeaponEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.armorEditor = new DatabaseArmorEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.enemyEditor = new DatabaseEnemyEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.stateEditor = new DatabaseStateEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.animationEditor = new DatabaseAnimationEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.troopEditor = new DatabaseTroopEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.tilesetEditor = new DatabaseTilesetEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
    }

    /**
     * Update the current project reference
     */
    setCurrentProject(project) {
        this.currentProject = project;
    }

    /**
     * Update status message (calls back to main app)
     */
    updateStatus(message) {
        if (this.callbacks.updateStatus) {
            this.callbacks.updateStatus(message);
        }
    }

    /**
     * Open database viewer for a specific type
     */
    openDatabase(type) {
        if (!this.currentProject) {
            alert('Please load a project first');
            return;
        }

        console.log('Opening database:', type);

        // Get data based on type
        let data, title;
        switch(type) {
            case 'actors':
                data = this.databaseManager.getActors();
                title = 'Actors';
                break;
            case 'classes':
                data = this.databaseManager.getClasses();
                title = 'Classes';
                break;
            case 'skills':
                data = this.databaseManager.getSkills();
                title = 'Skills';
                break;
            case 'items':
                data = this.databaseManager.getItems();
                title = 'Items';
                break;
            case 'weapons':
                data = this.databaseManager.getWeapons();
                title = 'Weapons';
                break;
            case 'armors':
                data = this.databaseManager.getArmors();
                title = 'Armors';
                break;
            case 'enemies':
                data = this.databaseManager.getEnemies();
                title = 'Enemies';
                break;
            case 'troops':
                data = this.databaseManager.getTroops();
                title = 'Troops';
                break;
            case 'states':
                data = this.databaseManager.getStates();
                title = 'States';
                break;
            case 'animations':
                data = this.databaseManager.getAnimations();
                title = 'Animations';
                break;
            case 'tilesets':
                // Tilesets use custom editor within modal
                this.tilesetEditor.showTilesetEditor();
                return;
            case 'commonEvents':
                data = this.databaseManager.getCommonEvents();
                title = 'Common Events';
                break;
            case 'types': {
                // Update active nav item
                const navEl = document.getElementById('database-navigation');
                if (navEl) {
                    document.querySelectorAll('.database-nav-item').forEach(item => {
                        item.classList.remove('active');
                        if (item.dataset.type === 'types') {
                            item.classList.add('active');
                        }
                    });
                }
                // Types editor uses System.json - delegate to callback
                if (this.callbacks.showTypesEditor) {
                    this.callbacks.showTypesEditor();
                }
                return;
            }
            case 'terms': {
                // Update active nav item
                const navEl = document.getElementById('database-navigation');
                if (navEl) {
                    document.querySelectorAll('.database-nav-item').forEach(item => {
                        item.classList.remove('active');
                        if (item.dataset.type === 'terms') {
                            item.classList.add('active');
                        }
                    });
                }
                // Terms editor uses System.json - delegate to callback
                if (this.callbacks.showTermsEditor) {
                    this.callbacks.showTermsEditor();
                }
                return;
            }
            default:
                alert('Unknown database type: ' + type);
                return;
        }

        // Show database viewer
        this.showDatabaseViewer(title, data, type);
    }

    /**
     * Show the main database viewer with list and detail panels
     */
    showDatabaseViewer(title, data, type) {
        const viewer = document.getElementById('database-viewer');
        const navEl = document.getElementById('database-navigation');
        const titleEl = document.getElementById('database-viewer-title');
        const listEl = document.getElementById('database-list');
        const detailEl = document.getElementById('database-detail');

        // Set up navigation if not already done
        if (navEl && navEl.children.length === 0) {
            this.setupDatabaseNavigation();
        }

        // Update active nav item
        if (navEl) {
            document.querySelectorAll('.database-nav-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.type === type) {
                    item.classList.add('active');
                }
            });
        }

        titleEl.textContent = title;
        listEl.innerHTML = '';
        detailEl.innerHTML = '<p style="color: #999; text-align: center; margin-top: 100px;">Select an entry from the list</p>';

        // Populate list
        data.forEach((entry) => {
            const item = document.createElement('div');
            item.className = 'database-list-item';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = entry.name || 'Unnamed';

            const idSpan = document.createElement('span');
            idSpan.className = 'database-list-id';
            idSpan.textContent = `#${entry.id || '?'}`;

            item.appendChild(nameSpan);
            item.appendChild(idSpan);

            item.addEventListener('click', () => {
                // Remove selection from all items
                document.querySelectorAll('.database-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                // Show detail
                this.showDatabaseDetail(entry, type);
            });

            listEl.appendChild(item);
        });

        // Show viewer
        viewer.classList.add('active');

        // Set up close button
        const closeBtn = document.getElementById('database-close-btn');
        closeBtn.onclick = () => {
            // Also close tileset editor if it's open
            const tilesetEditorContainer = document.getElementById('tileset-editor-main-container');
            if (tilesetEditorContainer && tilesetEditorContainer.style.display !== 'none') {
                tilesetEditorContainer.style.display = 'none';
            }
            viewer.classList.remove('active');
        };

        // Don't close on background click - user must use X button
        // (Removed background click to prevent accidental closes)
    }

    /**
     * Setup the database navigation sidebar
     */
    setupDatabaseNavigation() {
        const navEl = document.getElementById('database-navigation');
        if (!navEl) return;

        navEl.innerHTML = '';

        const categories = [
            { name: 'Actors', type: 'actors' },
            { name: 'Classes', type: 'classes' },
            { name: 'Skills', type: 'skills' },
            { name: 'Items', type: 'items' },
            { name: 'Weapons', type: 'weapons' },
            { name: 'Armors', type: 'armors' },
            { name: 'Enemies', type: 'enemies' },
            { name: 'Troops', type: 'troops' },
            { name: 'States', type: 'states' },
            { name: 'Animations', type: 'animations' },
            { name: 'Tilesets', type: 'tilesets' },
            { name: 'Common Events', type: 'commonEvents' },
            { name: 'Types', type: 'types' },
            { name: 'Terms', type: 'terms' }
        ];

        categories.forEach(category => {
            const item = document.createElement('div');
            item.className = 'database-nav-item';
            item.textContent = category.name;
            item.dataset.type = category.type;

            item.addEventListener('click', () => {
                this.openDatabase(category.type);
            });

            navEl.appendChild(item);
        });
    }

    /**
     * Show detail view for a specific database entry
     */
    showDatabaseDetail(entry, type) {
        const detailEl = document.getElementById('database-detail');
        detailEl.innerHTML = '';

        // Delegate to modular editors
        if (type === 'actors') {
            this.actorEditor.showActorDetail(detailEl, entry);
        } else if (type === 'classes') {
            this.classEditor.showClassDetail(detailEl, entry);
        } else if (type === 'skills') {
            this.skillEditor.showSkillDetail(detailEl, entry);
        } else if (type === 'items') {
            this.itemEditor.showItemDetail(detailEl, entry);
        } else if (type === 'weapons') {
            this.weaponEditor.showWeaponDetail(detailEl, entry);
        } else if (type === 'armors') {
            this.armorEditor.showArmorDetail(detailEl, entry);
        } else if (type === 'enemies') {
            this.enemyEditor.showEnemyDetail(detailEl, entry);
        } else if (type === 'troops') {
            this.troopEditor.showTroopDetail(detailEl, entry);
        } else if (type === 'states') {
            this.stateEditor.showStateDetail(detailEl, entry);
        } else if (type === 'tilesets') {
            this.tilesetEditor.showTilesetDetail(detailEl, entry);
        } else if (type === 'animations') {
            this.animationEditor.showAnimationDetail(detailEl, entry);
        } else {
            // Generic display for other types
            this.showGenericDetail(detailEl, entry, type);
        }
    }

    /**
     * Show generic detail for database types without specialized editors
     */
    showGenericDetail(container, entry, type) {
        const wrapper = document.createElement('div');
        wrapper.style.padding = '16px';

        wrapper.innerHTML = `
            <h3>${entry.name || 'Entry #' + entry.id}</h3>
            <pre style="background: #1e1e1e; padding: 16px; border-radius: 4px; overflow: auto; max-height: 600px;">${JSON.stringify(entry, null, 2)}</pre>
        `;

        container.appendChild(wrapper);
    }

    /**
     * Get human-readable trait name from trait code
     */
    getTraitName(traitCode) {
        // Trait codes from RPG Maker MZ
        const traitNames = {
            11: 'Element Rate', 12: 'Debuff Rate', 13: 'State Rate', 14: 'State Resist',
            21: 'Parameter', 22: 'Ex-Parameter', 23: 'Sp-Parameter',
            31: 'Attack Element', 32: 'Attack State', 33: 'Attack Speed', 34: 'Attack Times+',
            41: 'Add Skill Type', 42: 'Seal Skill Type', 43: 'Add Skill', 44: 'Seal Skill',
            51: 'Equip Weapon', 52: 'Equip Armor', 53: 'Lock Equip', 54: 'Seal Equip', 55: 'Slot Type',
            61: 'Action Times+', 62: 'Special Flag', 63: 'Collapse Effect', 64: 'Party Ability'
        };
        return traitNames[traitCode] || `Trait ${traitCode}`;
    }

    /**
     * Get equipment slots for an actor (RPG Maker MZ compatible)
     */
    getActorEquipSlots(actor) {
        const system = this.databaseManager.getSystem();
        if (!system || !system.equipTypes) {
            return [1, 2, 3, 4, 5]; // Default slots
        }

        // Build slots array from equipTypes (skip index 0 which is empty)
        const slots = [];
        for (let i = 1; i < system.equipTypes.length; i++) {
            slots.push(i);
        }

        // Check for dual-wield trait (trait code 55, dataId 1)
        if (slots.length >= 2 && this.isDualWield(actor)) {
            slots[1] = 1; // Change second slot from Shield to Weapon
        }

        return slots;
    }

    /**
     * Check if actor has dual-wield trait
     */
    isDualWield(actor) {
        // Check actor's own traits
        if (actor.traits) {
            for (const trait of actor.traits) {
                if (trait.code === 55 && trait.dataId === 1) {
                    return true;
                }
            }
        }

        // Check class traits
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
     * Get formatted trait value based on trait type
     */
    getTraitValue(trait) {
        // Format trait value based on type
        if (trait.code === 21) { // Parameter
            const params = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
            const change = Math.round((trait.value - 1) * 100);
            return `${params[trait.dataId] || 'Param'} ${change >= 0 ? '+' : ''}${change}%`;
        } else if (trait.code === 22) { // Ex-Parameter
            const exParams = ['Hit Rate', 'Evasion', 'Critical Rate', 'Critical Evade', 'Magic Evade', 'Magic Reflect', 'Counter', 'HP Regen', 'MP Regen', 'TP Regen'];
            return `${exParams[trait.dataId] || 'ExParam'} +${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 23) { // Sp-Parameter
            const spParams = ['Target Rate', 'Guard Rate', 'Recovery Rate', 'Pharmacology', 'MP Cost Rate', 'TP Charge Rate', 'Physical Damage', 'Magical Damage', 'Floor Damage', 'Experience'];
            return `${spParams[trait.dataId] || 'SpParam'} ${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 11) { // Element Rate
            const elements = this.databaseManager.getSystem()?.elements || [];
            const elementName = elements[trait.dataId] || `Element ${trait.dataId}`;
            return `${elementName} ${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 12) { // Debuff Rate
            const params = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
            return `${params[trait.dataId] || 'Param'} Debuff ${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 13) { // State Rate
            const state = this.databaseManager.getState(trait.dataId);
            const stateName = state ? state.name : `State ${trait.dataId}`;
            return `${stateName} ${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 14) { // State Resist
            const state = this.databaseManager.getState(trait.dataId);
            const stateName = state ? state.name : `State ${trait.dataId}`;
            return `Resist ${stateName}`;
        } else if (trait.code === 31) { // Attack Element
            const elements = this.databaseManager.getSystem()?.elements || [];
            const elementName = elements[trait.dataId] || `Element ${trait.dataId}`;
            return `Attack Element: ${elementName}`;
        } else if (trait.code === 32) { // Attack State
            const state = this.databaseManager.getState(trait.dataId);
            const stateName = state ? state.name : `State ${trait.dataId}`;
            return `${stateName} ${Math.round(trait.value * 100)}% chance`;
        } else if (trait.code === 33) { // Attack Speed
            return `Attack Speed ${trait.value >= 0 ? '+' : ''}${trait.value}`;
        } else if (trait.code === 34) { // Attack Times
            return `Attack Times +${trait.value}`;
        } else if (trait.code === 41 || trait.code === 42) { // Skill Type Add/Seal
            const skillTypes = this.databaseManager.getSystem()?.skillTypes || [];
            const skillTypeName = skillTypes[trait.dataId] || `Skill Type ${trait.dataId}`;
            return trait.code === 41 ? `Add ${skillTypeName}` : `Seal ${skillTypeName}`;
        } else if (trait.code === 43 || trait.code === 44) { // Skill Add/Seal
            const skill = this.databaseManager.getSkill(trait.dataId);
            const skillName = skill ? skill.name : `Skill ${trait.dataId}`;
            return trait.code === 43 ? `Add ${skillName}` : `Seal ${skillName}`;
        } else if (trait.code === 51 || trait.code === 52) { // Weapon/Armor Type Equip
            if (trait.code === 51) {
                const weaponTypes = this.databaseManager.getSystem()?.weaponTypes || [];
                const weaponTypeName = weaponTypes[trait.dataId] || `Weapon Type ${trait.dataId}`;
                return `Equip ${weaponTypeName}`;
            } else {
                const armorTypes = this.databaseManager.getSystem()?.armorTypes || [];
                const armorTypeName = armorTypes[trait.dataId] || `Armor Type ${trait.dataId}`;
                return `Equip ${armorTypeName}`;
            }
        } else if (trait.code === 53) { // Lock Equip
            const equipTypes = this.databaseManager.getSystem()?.equipTypes || [];
            const equipTypeName = equipTypes[trait.dataId] || `Equip ${trait.dataId}`;
            return `Lock ${equipTypeName}`;
        } else if (trait.code === 54) { // Seal Equip
            const equipTypes = this.databaseManager.getSystem()?.equipTypes || [];
            const equipTypeName = equipTypes[trait.dataId] || `Equip ${trait.dataId}`;
            return `Seal ${equipTypeName}`;
        } else if (trait.code === 55) { // Slot Type
            return trait.dataId === 0 ? 'Normal Slot' : 'Dual Wield';
        } else if (trait.code === 61) { // Action Times
            return `Action Times +${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 62) { // Special Flag
            const flags = ['Auto Battle', 'Guard', 'Substitute', 'Preserve TP'];
            return flags[trait.dataId] || `Special Flag ${trait.dataId}`;
        } else if (trait.code === 63) { // Collapse Effect
            const effects = ['Boss Collapse', 'Instant Collapse', 'No Disappear'];
            return effects[trait.dataId] || `Collapse ${trait.dataId}`;
        } else if (trait.code === 64) { // Party Ability
            const abilities = ['Encounter Half', 'Encounter None', 'Cancel Surprise', 'Raise Preemptive', 'Gold Double', 'Drop Item Double'];
            return abilities[trait.dataId] || `Party Ability ${trait.dataId}`;
        } else {
            return `Data ${trait.dataId}, Value ${trait.value}`;
        }
    }

    // Note: The animation detail methods are very long - I'll include the key parts
    // Continue in next part due to length...
    addDatabasePreview(container, entry, type) {
        const preview = document.createElement('div');
        preview.className = 'database-preview';

        if (type === 'actors') {
            // Create container for character, face, and SV battler
            const graphicsContainer = document.createElement('div');
            graphicsContainer.className = 'graphics-grid';

            // Character sprite section
            const characterBox = document.createElement('div');
            characterBox.className = 'graphic-preview-box';

            const charLabel = document.createElement('div');
            charLabel.textContent = 'Character Sprite';
            charLabel.className = 'graphic-preview-label';
            characterBox.appendChild(charLabel);

            const charCanvasContainer = document.createElement('div');
            charCanvasContainer.className = 'graphic-canvas-container';
            charCanvasContainer.style.minHeight = '160px';

            if (entry.characterName) {
                // Show animated character sprite (same size as face for consistency)
                const canvas = document.createElement('canvas');
                canvas.width = 144;
                canvas.height = 144;
                canvas.className = 'sprite-preview';
                charCanvasContainer.appendChild(canvas);

                const ctx = canvas.getContext('2d');
                const img = new Image();

                // Use file:// protocol for NW.js
                const path = require('path');
                const imgPath = 'file://' + path.join(this.currentProject.path, 'img', 'characters', entry.characterName + '.png').replace(/\\/g, '/');

                console.log('Loading character sprite:', imgPath);

                img.onload = () => {
                // Check if this is a big character ($ or !$ prefix)
                const isBigCharacter = entry.characterName.startsWith('$') || entry.characterName.startsWith('!$');

                let characterWidth, characterHeight, col, row;

                if (isBigCharacter) {
                    // Big characters are single character per file (3 frames x 4 directions)
                    characterWidth = img.width / 3;
                    characterHeight = img.height / 4;
                    col = 0;
                    row = 0;
                } else {
                    // Normal sprites are 3 columns x 4 rows (8 characters per file)
                    characterWidth = img.width / 12; // 3 frames * 4 columns
                    characterHeight = img.height / 8; // 4 directions * 2 rows

                    // Get the specific character based on characterIndex (0-7)
                    const charCol = entry.characterIndex % 4;
                    const charRow = Math.floor(entry.characterIndex / 4);

                    col = charCol;
                    row = charRow;
                }

                // Animation frames: 1-0-1-2 pattern (standing-left-standing-right)
                const frames = [1, 0, 1, 2];
                let frameIndex = 0;

                const animate = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    let frameX, frameY, frameWidth, frameHeight;

                    if (isBigCharacter) {
                        // Big character: 3 frames horizontal, 4 directions vertical
                        frameWidth = characterWidth;
                        frameHeight = characterHeight;
                        frameX = frames[frameIndex] * characterWidth;
                        frameY = 0; // Down direction
                    } else {
                        // Normal character: each character is 3 frames wide
                        frameWidth = characterWidth;
                        frameHeight = characterHeight;
                        frameX = (col * 3 + frames[frameIndex]) * characterWidth;
                        frameY = (row * 4) * characterHeight; // Down direction
                    }

                    ctx.drawImage(
                        img,
                        frameX, frameY,
                        frameWidth, frameHeight,
                        0, 0,
                        canvas.width, canvas.height
                    );

                    frameIndex = (frameIndex + 1) % frames.length;
                };

                // Animate at ~8 FPS
                setInterval(animate, 125);
                animate();
            };
            img.onerror = (e) => {
                console.error('Failed to load character sprite:', imgPath, e);
                const errorMsg = document.createElement('span');
                errorMsg.style.color = '#999';
                errorMsg.style.fontSize = '11px';
                errorMsg.textContent = 'Image not found';
                charCanvasContainer.appendChild(errorMsg);
            };
            img.src = imgPath;
            } else {
                const noImageMsg = document.createElement('span');
                noImageMsg.style.color = '#999';
                noImageMsg.style.fontSize = '11px';
                noImageMsg.textContent = 'No image set';
                charCanvasContainer.appendChild(noImageMsg);
            }

            characterBox.appendChild(charCanvasContainer);

            // Add change character button
            const charButton = document.createElement('button');
            charButton.textContent = 'Change Sprite';
            charButton.className = 'graphic-selector-button';
            charButton.onclick = () => this.selectCharacterImage(entry);
            characterBox.appendChild(charButton);

            graphicsContainer.appendChild(characterBox);

            // Face graphic section
            const faceBox = document.createElement('div');
            faceBox.className = 'graphic-preview-box';

            const faceLabel = document.createElement('div');
            faceLabel.textContent = 'Face Graphic';
            faceLabel.className = 'graphic-preview-label';
            faceBox.appendChild(faceLabel);

            const faceCanvasContainer = document.createElement('div');
            faceCanvasContainer.className = 'graphic-canvas-container';
            faceCanvasContainer.style.minHeight = '160px';

            if (entry.faceName) {
                // Face graphics are 4x2 layout (8 faces per file)
                const faceCanvas = document.createElement('canvas');
                faceCanvas.width = 144;
                faceCanvas.height = 144;
                faceCanvas.className = 'sprite-preview';
                faceCanvasContainer.appendChild(faceCanvas);

                const faceCtx = faceCanvas.getContext('2d');
                const faceImg = new Image();

                const path = require('path');
                const faceImgPath = 'file://' + path.join(this.currentProject.path, 'img', 'faces', entry.faceName + '.png').replace(/\\/g, '/');

                console.log('Loading face graphic:', faceImgPath);

                faceImg.onload = () => {
                    // Face files are 4 columns x 2 rows (8 faces)
                    const faceWidth = faceImg.width / 4;
                    const faceHeight = faceImg.height / 2;

                    // Get position based on faceIndex (0-7)
                    const col = entry.faceIndex % 4;
                    const row = Math.floor(entry.faceIndex / 4);

                    faceCtx.drawImage(
                        faceImg,
                        col * faceWidth, row * faceHeight,
                        faceWidth, faceHeight,
                        0, 0,
                        faceCanvas.width, faceCanvas.height
                    );
                };
                faceImg.onerror = (e) => {
                    console.error('Failed to load face graphic:', faceImgPath, e);
                    const errorMsg = document.createElement('span');
                    errorMsg.style.color = '#999';
                    errorMsg.style.fontSize = '11px';
                    errorMsg.textContent = 'Image not found';
                    faceCanvasContainer.appendChild(errorMsg);
                };
                faceImg.src = faceImgPath;
            } else {
                const noFaceMsg = document.createElement('span');
                noFaceMsg.style.color = '#999';
                noFaceMsg.style.fontSize = '11px';
                noFaceMsg.textContent = 'No image set';
                faceCanvasContainer.appendChild(noFaceMsg);
            }

            faceBox.appendChild(faceCanvasContainer);

            // Add change face button
            const faceButton = document.createElement('button');
            faceButton.textContent = 'Change Face';
            faceButton.className = 'graphic-selector-button';
            faceButton.onclick = () => this.selectFaceImage(entry);
            faceBox.appendChild(faceButton);

            graphicsContainer.appendChild(faceBox);

            // SV Battler section
            const svBox = document.createElement('div');
            svBox.className = 'graphic-preview-box';

            const svLabel = document.createElement('div');
            svLabel.textContent = 'SV Battler';
            svLabel.className = 'graphic-preview-label';
            svBox.appendChild(svLabel);

            const svCanvasContainer = document.createElement('div');
            svCanvasContainer.className = 'graphic-canvas-container';
            svCanvasContainer.style.minHeight = '160px';

            if (entry.battlerName) {
                // Show SV battler sprite (same size as face for consistency)
                const svCanvas = document.createElement('canvas');
                svCanvas.width = 144;
                svCanvas.height = 144;
                svCanvas.className = 'sprite-preview';
                svCanvasContainer.appendChild(svCanvas);

                const svCtx = svCanvas.getContext('2d');
                const svImg = new Image();

                const path = require('path');
                const svImgPath = 'file://' + path.join(this.currentProject.path, 'img', 'sv_actors', entry.battlerName + '.png').replace(/\\/g, '/');

                console.log('Loading SV battler:', svImgPath);

                svImg.onload = () => {
                    // SV battlers are 9 frames (3x3) x 6 motions, each frame is typically 64x64
                    const frameWidth = svImg.width / 9;
                    const frameHeight = svImg.height / 6;

                    // Draw the idle stance (first frame of first motion)
                    svCtx.drawImage(
                        svImg,
                        0, 0,
                        frameWidth, frameHeight,
                        0, 0,
                        svCanvas.width, svCanvas.height
                    );
                };
                svImg.onerror = (e) => {
                    console.error('Failed to load SV battler:', svImgPath, e);
                    const errorMsg = document.createElement('span');
                    errorMsg.style.color = '#999';
                    errorMsg.style.fontSize = '11px';
                    errorMsg.textContent = 'Image not found';
                    svCanvasContainer.appendChild(errorMsg);
                };
                svImg.src = svImgPath;
            } else {
                const noSvMsg = document.createElement('span');
                noSvMsg.style.color = '#999';
                noSvMsg.style.fontSize = '11px';
                noSvMsg.textContent = 'No image set';
                svCanvasContainer.appendChild(noSvMsg);
            }

            svBox.appendChild(svCanvasContainer);

            // Add change SV battler button
            const svButton = document.createElement('button');
            svButton.textContent = 'Change Battler';
            svButton.className = 'graphic-selector-button';
            svButton.onclick = () => this.selectSVBattlerImage(entry);
            svBox.appendChild(svButton);

            graphicsContainer.appendChild(svBox);
            preview.appendChild(graphicsContainer);

        } else if ((type === 'items' || type === 'weapons' || type === 'armors' || type === 'skills') && entry.iconIndex !== undefined) {
            // Show item icon
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            canvas.className = 'icon-preview';
            preview.appendChild(canvas);

            const ctx = canvas.getContext('2d');
            const img = new Image();

            // Use file:// protocol for NW.js
            const path = require('path');
            const imgPath = 'file://' + path.join(this.currentProject.path, 'img', 'system', 'IconSet.png');

            console.log('Loading icon:', imgPath);

            img.onload = () => {
                // IconSet is 16 icons wide, each 32x32
                const iconsPerRow = 16;
                const iconSize = 32;

                const col = entry.iconIndex % iconsPerRow;
                const row = Math.floor(entry.iconIndex / iconsPerRow);

                ctx.drawImage(
                    img,
                    col * iconSize, row * iconSize,
                    iconSize, iconSize,
                    0, 0,
                    canvas.width, canvas.height
                );
            };
            img.onerror = (e) => {
                console.error('Failed to load icon:', imgPath, e);
                preview.innerHTML = '<span style="color: #999;">Icon not found</span>';
            };
            img.src = imgPath;

        } else {
            preview.innerHTML = '<span style="color: #999;">No preview available</span>';
        }

        container.appendChild(preview);
    }

    selectCharacterImage(actor) {
        if (typeof nw === 'undefined') {
            alert('Character selection requires NW.js');
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const charactersPath = path.join(this.currentProject.path, 'img', 'characters');

        try {
            const files = fs.readdirSync(charactersPath)
                .filter(f => f.endsWith('.png'))
                .map(f => f.replace('.png', ''));

            if (files.length === 0) {
                alert('No character images found in img/characters folder');
                return;
            }

            this.showImagePicker('Select Character Sprite', files, (selectedFile) => {
                actor.characterName = selectedFile;

                const indexChoice = prompt('Enter character index (0-7) on the sprite sheet:', actor.characterIndex || '0');
                if (indexChoice !== null) {
                    actor.characterIndex = parseInt(indexChoice);
                }

                this.showDatabaseDetail(actor, 'actors');
                this.updateStatus('Character sprite updated');
            }, (fileName) => {
                // Preview callback - show full sprite sheet
                return 'file://' + path.join(this.currentProject.path, 'img', 'characters', fileName + '.png');
            });
        } catch (error) {
            console.error('Error reading characters folder:', error);
            alert('Error reading characters folder');
        }
    }

    selectFaceImage(actor) {
        if (typeof nw === 'undefined') {
            alert('Face selection requires NW.js');
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const facesPath = path.join(this.currentProject.path, 'img', 'faces');

        try {
            const files = fs.readdirSync(facesPath)
                .filter(f => f.endsWith('.png'))
                .map(f => f.replace('.png', ''));

            if (files.length === 0) {
                alert('No face images found in img/faces folder');
                return;
            }

            this.showImagePicker('Select Face Graphic', files, (selectedFile) => {
                actor.faceName = selectedFile;

                const indexChoice = prompt('Enter face index (0-7) on the face sheet:', actor.faceIndex || '0');
                if (indexChoice !== null) {
                    actor.faceIndex = parseInt(indexChoice);
                }

                this.showDatabaseDetail(actor, 'actors');
                this.updateStatus('Face graphic updated');
            }, (fileName) => {
                return 'file://' + path.join(this.currentProject.path, 'img', 'faces', fileName + '.png');
            });
        } catch (error) {
            console.error('Error reading faces folder:', error);
            alert('Error reading faces folder');
        }
    }

    selectSVBattlerImage(actor) {
        if (typeof nw === 'undefined') {
            alert('SV Battler selection requires NW.js');
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const svActorsPath = path.join(this.currentProject.path, 'img', 'sv_actors');

        try {
            const files = fs.readdirSync(svActorsPath)
                .filter(f => f.endsWith('.png'))
                .map(f => f.replace('.png', ''));

            if (files.length === 0) {
                alert('No SV battler images found in img/sv_actors folder');
                return;
            }

            this.showImagePicker('Select SV Battler', files, (selectedFile) => {
                actor.battlerName = selectedFile;

                this.showDatabaseDetail(actor, 'actors');
                this.updateStatus('SV battler updated');
            }, (fileName) => {
                return 'file://' + path.join(this.currentProject.path, 'img', 'sv_actors', fileName + '.png');
            });
        } catch (error) {
            console.error('Error reading sv_actors folder:', error);
            alert('Error reading sv_actors folder');
        }
    }

    showImagePicker(title, files, onSelectCallback, getImagePathCallback) {
        const modal = document.getElementById('image-picker-modal');
        const titleEl = document.getElementById('image-picker-title');
        const listEl = document.getElementById('image-picker-list');
        const previewEl = document.getElementById('image-picker-preview');
        const closeBtn = document.getElementById('image-picker-close-btn');

        titleEl.textContent = title;
        listEl.innerHTML = '';
        previewEl.innerHTML = '<p style="color: #999; text-align: center;">Select an image to preview</p>';

        // Populate file list
        files.forEach((file) => {
            const item = document.createElement('div');
            item.style.cssText = 'padding: 10px 16px; cursor: pointer; border-bottom: 1px solid #2d2d30; font-size: 13px;';
            item.textContent = file;

            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = '#2a2a2a';
            });

            item.addEventListener('mouseleave', () => {
                if (!item.classList.contains('selected')) {
                    item.style.backgroundColor = '';
                }
            });

            item.addEventListener('click', () => {
                // Remove selection from all items
                Array.from(listEl.children).forEach(i => {
                    i.classList.remove('selected');
                    i.style.backgroundColor = '';
                });
                item.classList.add('selected');
                item.style.backgroundColor = '#094771';

                // Show preview
                const imagePath = getImagePathCallback(file);
                previewEl.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%;">
                        <div style="font-size: 14px; font-weight: 600; color: #007acc;">${file}</div>
                        <div style="background: #1a1d1e; border: 2px solid #3e3e42; border-radius: 8px; padding: 16px; max-width: 100%; overflow: auto;">
                            <img src="${imagePath}" style="image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; max-width: 100%; display: block;" />
                        </div>
                        <button id="image-picker-select-btn" style="background: linear-gradient(to bottom, #007acc 0%, #005a9e 100%); border: none; color: white; padding: 10px 24px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500;">Select This Image</button>
                    </div>
                `;

                // Add select button handler
                document.getElementById('image-picker-select-btn').addEventListener('click', () => {
                    modal.style.display = 'none';
                    onSelectCallback(file);
                });
            });

            listEl.appendChild(item);
        });

        // Show modal
        modal.style.display = 'flex';

        // Close button handler
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }

    /**
     * Show Types editor (Elements, Skill Types, Weapon Types, etc.)
     */
    showTypesEditor() {
        const system = this.databaseManager.getSystem();
        if (!system) {
            alert('System data not loaded');
            return;
        }

        const viewer = document.getElementById('database-viewer');
        viewer.classList.add('active');

        const titleEl = document.getElementById('database-viewer-title');
        titleEl.textContent = 'Types';

        const listEl = document.getElementById('database-list');
        const detailEl = document.getElementById('database-detail');

        listEl.innerHTML = `
            <div class="database-list-item" data-type="elements">Elements</div>
            <div class="database-list-item" data-type="skillTypes">Skill Types</div>
            <div class="database-list-item" data-type="weaponTypes">Weapon Types</div>
            <div class="database-list-item" data-type="armorTypes">Armor Types</div>
            <div class="database-list-item" data-type="equipTypes">Equipment Types</div>
        `;

        detailEl.innerHTML = '<p style="color: #999; text-align: center; margin-top: 100px;">Select a type category from the list</p>';

        // Add click handlers
        listEl.querySelectorAll('.database-list-item').forEach(item => {
            item.addEventListener('click', () => {
                listEl.querySelectorAll('.database-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                const typeCategory = item.dataset.type;
                this.showTypeDetail(system, typeCategory);
            });
        });
    }

    /**
     * Show detail for a specific type category
     */
    showTypeDetail(system, category) {
        const detailEl = document.getElementById('database-detail');
        const data = system[category] || [];

        let html = `<h3>${category}</h3><div class="database-section-content">`;
        data.forEach((value, index) => {
            html += `<div style="margin-bottom: 8px;">
                <span style="color: #888;">[${index}]</span>
                <input type="text" value="${value || ''}" style="width: 300px; background: #2d2d30; border: 1px solid #555; color: #ccc; padding: 4px;">
            </div>`;
        });
        html += '</div>';
        detailEl.innerHTML = html;
    }

    /**
     * Show Terms editor (Basic, Commands, Parameters)
     */
    showTermsEditor() {
        const system = this.databaseManager.getSystem();
        if (!system || !system.terms) {
            alert('Terms data not loaded');
            return;
        }

        const viewer = document.getElementById('database-viewer');
        viewer.classList.add('active');

        const titleEl = document.getElementById('database-viewer-title');
        titleEl.textContent = 'Terms';

        const listEl = document.getElementById('database-list');
        const detailEl = document.getElementById('database-detail');

        listEl.innerHTML = `
            <div class="database-list-item" data-category="basic">Basic</div>
            <div class="database-list-item" data-category="commands">Commands</div>
            <div class="database-list-item" data-category="params">Parameters</div>
        `;

        detailEl.innerHTML = '<p style="color: #999; text-align: center; margin-top: 100px;">Select a terms category from the list</p>';

        // Add click handlers
        listEl.querySelectorAll('.database-list-item').forEach(item => {
            item.addEventListener('click', () => {
                listEl.querySelectorAll('.database-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                const category = item.dataset.category;
                this.showTermDetail(system.terms, category);
            });
        });
    }

    /**
     * Show detail for a specific terms category
     */
    showTermDetail(terms, category) {
        const detailEl = document.getElementById('database-detail');
        const data = terms[category] || [];

        let html = `<h3>${category}</h3><div class="database-section-content">`;
        data.forEach((value, index) => {
            html += `<div style="margin-bottom: 8px;">
                <span style="color: #888;">[${index}]</span>
                <input type="text" value="${value || ''}" style="width: 300px; background: #2d2d30; border: 1px solid #555; color: #ccc; padding: 4px;">
            </div>`;
        });
        html += '</div>';
        detailEl.innerHTML = html;
    }

}

// Export for use in main.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseEditorUI;
}
