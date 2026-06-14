/**
 * DatabaseSystem1Editor - Editor for managing System 1 settings
 * Handles game configuration including title, parties, vehicles, battle settings, and audio
 */

class DatabaseSystem1Editor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
    }

    showSystem1Detail(container) {
        const system = this.databaseManager.getSystem();
        if (!system) {
            container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; margin-top: 100px;">System data not loaded</p>';
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow-y: auto;
        `;

        // Full-width title banner
        const titleBanner = document.createElement('div');
        titleBanner.style.cssText = `
            background-color: var(--color-bg-deep);
            padding: 14px 20px;
            border-bottom: 2px solid var(--color-accent-border-mid);
            font-size: 20px;
            font-weight: 600;
            color: var(--color-text-strong);
        `;
        titleBanner.textContent = 'System 1';
        wrapper.appendChild(titleBanner);

        // 3-column grid
        const columnsGrid = document.createElement('div');
        columnsGrid.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 0.8fr 1.2fr;
            gap: 16px;
            padding: 16px;
            flex: 1;
        `;

        // Column 1
        const column1 = this.createColumn1(system);
        columnsGrid.appendChild(column1);

        // Column 2
        const column2 = this.createColumn2(system);
        columnsGrid.appendChild(column2);

        // Column 3
        const column3 = this.createColumn3(system);
        columnsGrid.appendChild(column3);

        wrapper.appendChild(columnsGrid);

        container.appendChild(wrapper);

        // Add event listeners
        setTimeout(() => {
            // Title image picker button
            const titleImagePickerBtn = container.querySelector('.title-image-picker-btn');
            if (titleImagePickerBtn) {
                titleImagePickerBtn.addEventListener('click', () => {
                    this.showTitleImagePicker(system);
                });

                // Add hover effects
                titleImagePickerBtn.addEventListener('mouseenter', () => {
                    titleImagePickerBtn.style.backgroundColor = 'var(--color-accent-tint-35)';
                    titleImagePickerBtn.style.borderColor = 'var(--color-bg-deep)';
                });
                titleImagePickerBtn.addEventListener('mouseleave', () => {
                    titleImagePickerBtn.style.backgroundColor = 'var(--color-bg-panel)';
                    titleImagePickerBtn.style.borderColor = 'var(--color-text-dim)';
                });
            }

            // Checkboxes
            const checkboxes = container.querySelectorAll('.system-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.addEventListener('change', (e) => {
                    const field = e.target.dataset.field;
                    const value = e.target.checked;
                    if (field) {
                        system[field] = value;
                        console.log(`Updated ${field} to:`, value);
                    }
                });
            });

            // Radio buttons
            const radios = container.querySelectorAll('.system-radio');
            radios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const field = e.target.dataset.field;
                    const value = e.target.dataset.value;
                    if (field && value !== undefined) {
                        // Convert to appropriate type
                        if (value === 'true') {
                            system[field] = true;
                        } else if (value === 'false') {
                            system[field] = false;
                        } else {
                            system[field] = parseInt(value);
                        }
                        console.log(`Updated ${field} to:`, system[field]);
                    }
                });
            });

            // Music rows
            const musicRows = container.querySelectorAll('.music-row');
            musicRows.forEach(row => {
                row.addEventListener('click', () => {
                    const musicType = row.dataset.musicType;
                    this.showMusicPicker(system, musicType);
                });
                row.addEventListener('mouseenter', () => {
                    row.style.backgroundColor = 'var(--color-bg-button)';
                });
                row.addEventListener('mouseleave', () => {
                    row.style.backgroundColor = '';
                });
            });

            // Sound rows
            const soundRows = container.querySelectorAll('.sound-row');
            soundRows.forEach(row => {
                row.addEventListener('click', () => {
                    const soundIndex = parseInt(row.dataset.soundIndex);
                    this.showSoundPicker(system, soundIndex);
                });
                row.addEventListener('mouseenter', () => {
                    row.style.backgroundColor = 'var(--color-bg-button)';
                });
                row.addEventListener('mouseleave', () => {
                    row.style.backgroundColor = '';
                });
            });

            // Text fields (gameTitle, currencyUnit)
            const textFields = container.querySelectorAll('.system-text-field');
            textFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const sysField = e.target.dataset.systemField;
                    if (sysField) {
                        system[sysField] = e.target.value;
                        console.log(`Updated system.${sysField} to:`, e.target.value);
                    }
                });
            });

            // Starting Party management
            this.wirePartyListeners(container, system);

            // Window Tone sliders
            const toneSliders = container.querySelectorAll('.window-tone-slider');
            const tonePreview = container.querySelector('#system-window-tone-preview');
            const updateTonePreview = () => {
                if (tonePreview) {
                    const wt = system.windowTone || [0, 0, 0, 0];
                    const r = Math.max(0, Math.min(255, 128 + wt[0]));
                    const g = Math.max(0, Math.min(255, 128 + wt[1]));
                    const b = Math.max(0, Math.min(255, 128 + wt[2]));
                    const gray = wt[3] / 255;
                    // Apply gray desaturation
                    const avg = (r + g + b) / 3;
                    const fr = Math.round(r + (avg - r) * gray);
                    const fg = Math.round(g + (avg - g) * gray);
                    const fb = Math.round(b + (avg - b) * gray);
                    tonePreview.style.backgroundColor = `rgb(${fr}, ${fg}, ${fb})`;
                }
            };
            updateTonePreview();
            toneSliders.forEach(slider => {
                slider.addEventListener('input', (e) => {
                    const idx = parseInt(e.target.dataset.toneIdx);
                    const val = parseInt(e.target.value);
                    if (!system.windowTone) system.windowTone = [0, 0, 0, 0];
                    system.windowTone[idx] = val;
                    // Update value label
                    const valSpan = e.target.nextElementSibling;
                    if (valSpan) valSpan.textContent = val;
                    updateTonePreview();
                });
            });

            // Vehicle Change buttons
            const vehicleBtns = container.querySelectorAll('.vehicle-change-btn');
            vehicleBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const vehicle = btn.dataset.vehicle;
                    this.showVehicleImagePicker(system, vehicle, container);
                });
            });

            // Starting Position fields
            const posFields = container.querySelectorAll('.system-pos-field');
            posFields.forEach(field => {
                field.addEventListener('change', (e) => {
                    const target = e.target.dataset.posTarget;
                    const val = parseInt(e.target.value) || 0;
                    if (target.includes('.')) {
                        // Nested: e.g. "boat.startMapId"
                        const parts = target.split('.');
                        const vehicleKey = parts[0]; // "boat", "ship", "airship"
                        const prop = parts[1];        // "startMapId", "startX", "startY"
                        if (system[vehicleKey]) {
                            system[vehicleKey][prop] = val;
                            console.log(`Updated system.${vehicleKey}.${prop} to:`, val);
                        }
                    } else {
                        // Top-level: e.g. "startMapId", "startX", "startY"
                        system[target] = val;
                        console.log(`Updated system.${target} to:`, val);
                    }
                });
            });

            // Command Window Settings button
            const cmdWindowBtn = container.querySelector('.database-button');
            if (cmdWindowBtn && cmdWindowBtn.textContent.trim() === 'Command Window Settings') {
                cmdWindowBtn.addEventListener('click', () => {
                    this.showCommandWindowModal(system, container);
                });
            }

        }, 0);
    }

    createColumn1(system) {
        const column = document.createElement('div');
        column.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

        // Row 1: Game Title
        const gameTitleSection = this.createSection('Game Title', `
            <div class="form-row">
                <input type="text" class="database-field-value system-text-field" style="width: 100%;" value="${system.gameTitle || ''}" data-system-field="gameTitle">
            </div>
        `);
        column.appendChild(gameTitleSection);

        // Row 2: Starting Party (interactive)
        const actors = this.databaseManager.getActors() || [];
        const partyMembers = system.partyMembers || [];
        let partyListHTML = '<div id="system-party-list">';
        partyMembers.forEach((actorId, idx) => {
            const actor = this.databaseManager.getActor(actorId);
            partyListHTML += `<div class="party-member-row" style="display: flex; align-items: center; gap: 6px; padding: 3px 0;">
                <span style="color: var(--color-text); flex: 1; font-size: 12px;">${actor ? actor.name : 'Actor #' + actorId}</span>
                <button class="party-move-up" data-idx="${idx}" style="padding: 2px 6px; background: var(--color-bg-menubar); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 10px;" title="Move up">\u25B2</button>
                <button class="party-move-down" data-idx="${idx}" style="padding: 2px 6px; background: var(--color-bg-menubar); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 10px;" title="Move down">\u25BC</button>
                <button class="party-remove" data-idx="${idx}" style="padding: 2px 6px; background: var(--color-bg-menubar); color: #f44; border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 10px;" title="Remove">\u2715</button>
            </div>`;
        });
        if (partyMembers.length === 0) {
            partyListHTML += '<div style="color: var(--color-text-muted); font-size: 12px;">No party members</div>';
        }
        partyListHTML += '</div>';
        partyListHTML += `<div style="display: flex; gap: 6px; margin-top: 8px; align-items: center;">
            <select id="system-party-add-select" class="database-field-value" style="flex: 1; font-size: 12px;">
                ${actors.filter(a => a).map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
            </select>
            <button id="system-party-add-btn" style="padding: 4px 10px; background: var(--color-bg-menubar); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 11px;">Add</button>
        </div>`;

        const startingPartySection = this.createSection('Starting Party', partyListHTML);
        column.appendChild(startingPartySection);

        // Row 3: Currency & Window Tone
        const wt = system.windowTone || [0, 0, 0, 0];
        const currencySection = this.createSection('Currency & Display', `
            <div class="form-row">
                <label class="database-field-label">Currency Unit:</label>
                <input type="text" class="database-field-value system-text-field" style="width: 120px;" value="${system.currencyUnit || 'G'}" data-system-field="currencyUnit">
            </div>
            <div style="margin-top: 10px;">
                <label class="database-field-label" style="margin-bottom: 6px; display: block;">Window Tone:</label>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                    <span style="color: #f66; min-width: 14px; font-size: 11px;">R</span>
                    <input type="range" class="window-tone-slider" data-tone-idx="0" min="-255" max="255" value="${wt[0]}" style="flex: 1;">
                    <span class="window-tone-val" style="color: var(--color-text-muted); font-size: 11px; min-width: 30px; text-align: right;">${wt[0]}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                    <span style="color: #6f6; min-width: 14px; font-size: 11px;">G</span>
                    <input type="range" class="window-tone-slider" data-tone-idx="1" min="-255" max="255" value="${wt[1]}" style="flex: 1;">
                    <span class="window-tone-val" style="color: var(--color-text-muted); font-size: 11px; min-width: 30px; text-align: right;">${wt[1]}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                    <span style="color: #66f; min-width: 14px; font-size: 11px;">B</span>
                    <input type="range" class="window-tone-slider" data-tone-idx="2" min="-255" max="255" value="${wt[2]}" style="flex: 1;">
                    <span class="window-tone-val" style="color: var(--color-text-muted); font-size: 11px; min-width: 30px; text-align: right;">${wt[2]}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: var(--color-text-muted); min-width: 14px; font-size: 11px;">Gr</span>
                    <input type="range" class="window-tone-slider" data-tone-idx="3" min="0" max="255" value="${wt[3]}" style="flex: 1;">
                    <span class="window-tone-val" style="color: var(--color-text-muted); font-size: 11px; min-width: 30px; text-align: right;">${wt[3]}</span>
                </div>
                <div id="system-window-tone-preview" style="margin-top: 6px; height: 20px; border-radius: 3px; border: 1px solid var(--color-border);"></div>
            </div>
        `);
        column.appendChild(currencySection);

        // Row 4: Vehicle Images (with Change buttons)
        const vehicleImages = `
            <div class="form-row" style="display: flex; align-items: center; gap: 6px;">
                <label class="database-field-label" style="min-width: 50px;">Boat:</label>
                <input type="text" class="database-field-value" style="flex: 1;" value="${system.boat?.characterName || ''}" readonly>
                <button class="vehicle-change-btn rr-btn-chip" data-vehicle="boat">Change</button>
            </div>
            <div class="form-row" style="display: flex; align-items: center; gap: 6px; margin-top: 6px;">
                <label class="database-field-label" style="min-width: 50px;">Ship:</label>
                <input type="text" class="database-field-value" style="flex: 1;" value="${system.ship?.characterName || ''}" readonly>
                <button class="vehicle-change-btn rr-btn-chip" data-vehicle="ship">Change</button>
            </div>
            <div class="form-row" style="display: flex; align-items: center; gap: 6px; margin-top: 6px;">
                <label class="database-field-label" style="min-width: 50px;">Airship:</label>
                <input type="text" class="database-field-value" style="flex: 1;" value="${system.airship?.characterName || ''}" readonly>
                <button class="vehicle-change-btn rr-btn-chip" data-vehicle="airship">Change</button>
            </div>
        `;
        const vehicleSection = this.createSection('Vehicle Images', vehicleImages);
        column.appendChild(vehicleSection);

        // Row 5: Starting Positions (editable)
        const posField = (label, mapVal, xVal, yVal, prefix) => `
            <div class="form-row" style="margin-bottom: 6px;">
                <label class="database-field-label" style="min-width: 50px;">${label}:</label>
                <div style="display: flex; gap: 4px; align-items: center;">
                    <span style="color: var(--color-text-muted); font-size: 11px;">Map</span>
                    <input type="number" class="database-field-value system-pos-field" style="width: 50px; font-size: 11px;" value="${mapVal}" min="0" data-pos-target="${prefix}MapId">
                    <span style="color: var(--color-text-muted); font-size: 11px;">X</span>
                    <input type="number" class="database-field-value system-pos-field" style="width: 50px; font-size: 11px;" value="${xVal}" min="0" data-pos-target="${prefix}X">
                    <span style="color: var(--color-text-muted); font-size: 11px;">Y</span>
                    <input type="number" class="database-field-value system-pos-field" style="width: 50px; font-size: 11px;" value="${yVal}" min="0" data-pos-target="${prefix}Y">
                </div>
            </div>`;

        const startingPos =
            posField('Player', system.startMapId || 1, system.startX || 0, system.startY || 0, 'start') +
            posField('Boat', system.boat?.startMapId || 0, system.boat?.startX || 0, system.boat?.startY || 0, 'boat.start') +
            posField('Ship', system.ship?.startMapId || 0, system.ship?.startX || 0, system.ship?.startY || 0, 'ship.start') +
            posField('Airship', system.airship?.startMapId || 0, system.airship?.startX || 0, system.airship?.startY || 0, 'airship.start');

        const startingPosSection = this.createSection('Starting Positions', startingPos);
        column.appendChild(startingPosSection);

        return column;
    }

    createColumn2(system) {
        const column = document.createElement('div');
        column.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

        // Row 1: Title Screen
        const titleImageName = system.title1Name || '';
        const titleScreen = `
            <div class="form-row">
                <label class="database-field-label">Title Image:</label>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="text" class="database-field-value" style="flex: 1;" value="${titleImageName}" readonly>
                    <button class="title-image-picker-btn" style="padding: 6px 12px; background: var(--color-bg-panel); color: var(--color-text-strong); border: 1px solid var(--color-text-dim); border-radius: 4px; cursor: pointer; white-space: nowrap; transition: background-color 0.2s, border-color 0.2s;">
                        Choose Image
                    </button>
                </div>
            </div>
            <div class="form-row" style="margin-top: 8px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optDrawTitle ? 'checked' : ''} data-field="optDrawTitle">
                    Draw Game Title
                </label>
            </div>
            <div class="form-row" style="margin-top: 8px;">
                <button class="database-button" style="padding: 6px 12px; background: var(--color-bg-panel); color: var(--color-text-strong); border: 1px solid var(--color-text-dim); border-radius: 4px; cursor: pointer;">
                    Command Window Settings
                </button>
            </div>
        `;
        const titleScreenSection = this.createSection('Title Screen', titleScreen);
        column.appendChild(titleScreenSection);

        // Row 2: Battle Screen
        const battleView = system.optSideView ? 'sideView' : 'frontView';
        const battleScreen = `
            <div class="form-row">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); cursor: pointer;">
                    <input type="radio" class="system-radio" name="battleView" value="frontView" ${!system.optSideView ? 'checked' : ''} data-field="optSideView" data-value="false">
                    Front View
                </label>
            </div>
            <div class="form-row" style="margin-top: 4px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); cursor: pointer;">
                    <input type="radio" class="system-radio" name="battleView" value="sideView" ${system.optSideView ? 'checked' : ''} data-field="optSideView" data-value="true">
                    Side View
                </label>
            </div>
        `;
        const battleScreenSection = this.createSection('Battle Screen', battleScreen);
        column.appendChild(battleScreenSection);

        // Row 3: Battle System
        const battleSystem = `
            <div class="form-row">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); cursor: pointer;">
                    <input type="radio" class="system-radio" name="battleSystem" value="turn" ${system.battleSystem === 0 ? 'checked' : ''} data-field="battleSystem" data-value="0">
                    Turn-Based
                </label>
            </div>
            <div class="form-row" style="margin-top: 4px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); cursor: pointer;">
                    <input type="radio" class="system-radio" name="battleSystem" value="timeActive" ${system.battleSystem === 1 ? 'checked' : ''} data-field="battleSystem" data-value="1">
                    Time Progress (Active)
                </label>
            </div>
            <div class="form-row" style="margin-top: 4px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); cursor: pointer;">
                    <input type="radio" class="system-radio" name="battleSystem" value="timeWait" ${system.battleSystem === 2 ? 'checked' : ''} data-field="battleSystem" data-value="2">
                    Time Progress (Wait)
                </label>
            </div>
        `;
        const battleSystemSection = this.createSection('Battle System', battleSystem);
        column.appendChild(battleSystemSection);

        // Row 4: Options
        const options = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optTransparent ? 'checked' : ''} data-field="optTransparent">
                    Start Transparent
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optFollowers ? 'checked' : ''} data-field="optFollowers">
                    Show Followers
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optSlipDeath ? 'checked' : ''} data-field="optSlipDeath">
                    Slip Damage Death
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optFloorDeath ? 'checked' : ''} data-field="optFloorDeath">
                    Floor Damage Death
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optDisplayTp ? 'checked' : ''} data-field="optDisplayTp">
                    Display TP
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optExtraExp ? 'checked' : ''} data-field="optExtraExp">
                    EXP for Reserves
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optKeyItemsNumber ? 'checked' : ''} data-field="optKeyItemsNumber">
                    Show Key Item Count
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optAutosave ? 'checked' : ''} data-field="optAutosave">
                    Enable Autosave
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" data-field="optSplashScreen">
                    Show Splash Screen
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" data-field="optMessageSkip">
                    Enable Message Skip
                </label>
            </div>
        `;
        const optionsSection = this.createSection('Options', options);
        column.appendChild(optionsSection);

        return column;
    }

    createColumn3(system) {
        const column = document.createElement('div');
        column.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

        // Row 1: Music
        const musicTypes = ['title', 'battle', 'victory', 'defeat', 'gameOver', 'boat', 'ship', 'airship'];
        const musicLabels = ['Title', 'Battle', 'Victory', 'Defeat', 'Game Over', 'Boat', 'Ship', 'Airship'];

        let musicRows = '';
        musicTypes.forEach((type, idx) => {
            const bgm = system[`${type}Bgm`] || {};
            musicRows += `
                <tr class="music-row" data-music-type="${type}" style="cursor: pointer;">
                    <td>${musicLabels[idx]}</td>
                    <td>${bgm.name || '(None)'}</td>
                </tr>
            `;
        });

        const musicTable = `
            <table class="traits-table">
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Filename</th>
                    </tr>
                </thead>
                <tbody>
                    ${musicRows}
                </tbody>
            </table>
        `;
        const musicSection = this.createSection('Music', musicTable);
        column.appendChild(musicSection);

        // Row 2: Sound
        const soundTypes = ['cursor', 'ok', 'cancel', 'buzzer', 'equip', 'save', 'load', 'battleStart',
                           'escape', 'enemyAttack', 'enemyDamage', 'enemyCollapse', 'bossCollapse1',
                           'bossCollapse2', 'actorDamage', 'actorCollapse', 'recovery'];
        const soundLabels = ['Cursor', 'Ok', 'Cancel', 'Buzzer', 'Equip', 'Save', 'Load', 'Battle Start',
                            'Escape', 'Enemy Attack', 'Enemy Damage', 'Enemy Collapse', 'Boss Collapse 1',
                            'Boss Collapse 2', 'Actor Damage', 'Actor Collapse', 'Recovery'];

        let soundRows = '';
        soundTypes.forEach((type, idx) => {
            const se = system.sounds?.[idx] || {};
            soundRows += `
                <tr class="sound-row" data-sound-index="${idx}" style="cursor: pointer;">
                    <td>${soundLabels[idx]}</td>
                    <td>${se.name || '(None)'}</td>
                </tr>
            `;
        });

        const soundTable = `
            <table class="traits-table">
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Filename</th>
                    </tr>
                </thead>
                <tbody>
                    ${soundRows}
                </tbody>
            </table>
        `;
        const soundSection = this.createSection('Sound', soundTable);
        column.appendChild(soundSection);

        return column;
    }

    createSection(title, content) {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.innerHTML = `
            <div class="database-section-header">${title}</div>
            <div class="database-section-content">
                ${content}
            </div>
        `;
        return section;
    }

    wirePartyListeners(container, system) {
        const refreshParty = () => {
            const detailEl = document.getElementById('database-detail');
            if (detailEl) {
                detailEl.innerHTML = '';
                this.showSystem1Detail(detailEl);
            }
        };

        // Move up
        container.querySelectorAll('.party-move-up').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                if (idx > 0) {
                    const temp = system.partyMembers[idx];
                    system.partyMembers[idx] = system.partyMembers[idx - 1];
                    system.partyMembers[idx - 1] = temp;
                    refreshParty();
                }
            });
        });

        // Move down
        container.querySelectorAll('.party-move-down').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                if (idx < system.partyMembers.length - 1) {
                    const temp = system.partyMembers[idx];
                    system.partyMembers[idx] = system.partyMembers[idx + 1];
                    system.partyMembers[idx + 1] = temp;
                    refreshParty();
                }
            });
        });

        // Remove
        container.querySelectorAll('.party-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                system.partyMembers.splice(idx, 1);
                refreshParty();
            });
        });

        // Add
        const addBtn = container.querySelector('#system-party-add-btn');
        const addSelect = container.querySelector('#system-party-add-select');
        if (addBtn && addSelect) {
            addBtn.addEventListener('click', () => {
                const actorId = parseInt(addSelect.value);
                if (actorId) {
                    if (!system.partyMembers) system.partyMembers = [];
                    system.partyMembers.push(actorId);
                    refreshParty();
                }
            });
        }
    }

    showVehicleImagePicker(system, vehicleKey, container) {
        const path = require('path');
        const fs = require('fs');

        const project = this.projectManager.getCurrentProject();
        if (!project) { alert('No project loaded'); return; }

        const charactersPath = path.join(project.path, 'img', 'characters');
        if (!fs.existsSync(charactersPath)) { alert('Characters folder not found'); return; }

        const files = fs.readdirSync(charactersPath)
            .filter(f => f.endsWith('.png'))
            .map(f => f.replace('.png', ''));

        if (files.length === 0) { alert('No character images found'); return; }

        this.parentEditor.showImagePicker('Select Vehicle Image', files, (selectedFile) => {
            if (!system[vehicleKey]) {
                system[vehicleKey] = { characterName: '', characterIndex: 0, startMapId: 0, startX: 0, startY: 0 };
            }
            system[vehicleKey].characterName = selectedFile;

            const indexChoice = prompt('Enter character index (0-7) on the sprite sheet:', system[vehicleKey].characterIndex || '0');
            if (indexChoice !== null) {
                system[vehicleKey].characterIndex = parseInt(indexChoice);
            }

            // Refresh
            const detailEl = document.getElementById('database-detail');
            if (detailEl) {
                detailEl.innerHTML = '';
                this.showSystem1Detail(detailEl);
            }
        }, (fileName) => {
            return 'file://' + path.join(project.path, 'img', 'characters', fileName + '.png');
        });
    }

    showCommandWindowModal(system, container) {
        if (!system.titleCommandWindow) {
            system.titleCommandWindow = { background: 0, offsetX: 0, offsetY: 0 };
        }
        const tcw = system.titleCommandWindow;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex; justify-content: center; align-items: center;
            z-index: 2000;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 8px;
            width: 400px; padding: 0;
        `;

        modal.innerHTML = `
            <div style="background-color: var(--color-bg-panel); padding: 12px 16px; border-bottom: 1px solid var(--color-border); border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 16px; font-weight: 600; color: var(--color-text);">Command Window Settings</div>
                <button class="cmd-modal-close" style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer;">×</button>
            </div>
            <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div class="form-row">
                    <label class="database-field-label">Background:</label>
                    <select id="cmd-win-bg" class="database-field-value" style="width: 100%;">
                        <option value="0" ${tcw.background === 0 ? 'selected' : ''}>Window</option>
                        <option value="1" ${tcw.background === 1 ? 'selected' : ''}>Dim</option>
                        <option value="2" ${tcw.background === 2 ? 'selected' : ''}>Transparent</option>
                    </select>
                </div>
                <div class="form-row" style="display: flex; gap: 16px;">
                    <div>
                        <label class="database-field-label">Offset X:</label>
                        <input type="number" id="cmd-win-ox" class="database-field-value" style="width: 80px;" value="${tcw.offsetX || 0}">
                    </div>
                    <div>
                        <label class="database-field-label">Offset Y:</label>
                        <input type="number" id="cmd-win-oy" class="database-field-value" style="width: 80px;" value="${tcw.offsetY || 0}">
                    </div>
                </div>
            </div>
            <div style="padding: 12px 16px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 8px; background-color: var(--color-bg-panel);">
                <button class="cmd-modal-cancel rr-btn-secondary">Cancel</button>
                <button class="cmd-modal-ok" style="padding: 8px 16px; background: var(--color-accent); color: var(--color-bg-deep); border: 1px solid var(--color-accent); border-radius: 4px; cursor: pointer; font-weight: bold;">OK</button>
            </div>
        `;

        const close = () => document.body.removeChild(overlay);

        modal.querySelector('.cmd-modal-close').addEventListener('click', close);
        modal.querySelector('.cmd-modal-cancel').addEventListener('click', close);
        const cmdCancelBtn = modal.querySelector('.cmd-modal-cancel');
        cmdCancelBtn.addEventListener('mouseenter', () => { cmdCancelBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; cmdCancelBtn.style.borderColor = 'var(--color-accent)'; });
        cmdCancelBtn.addEventListener('mouseleave', () => { cmdCancelBtn.style.backgroundColor = 'var(--color-bg-button)'; cmdCancelBtn.style.borderColor = 'var(--color-border-input)'; });
        const cmdOkBtn = modal.querySelector('.cmd-modal-ok');
        cmdOkBtn.addEventListener('mouseenter', () => { cmdOkBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
        cmdOkBtn.addEventListener('mouseleave', () => { cmdOkBtn.style.backgroundColor = 'var(--color-accent)'; });
        modal.querySelector('.cmd-modal-ok').addEventListener('click', () => {
            tcw.background = parseInt(modal.querySelector('#cmd-win-bg').value);
            tcw.offsetX = parseInt(modal.querySelector('#cmd-win-ox').value) || 0;
            tcw.offsetY = parseInt(modal.querySelector('#cmd-win-oy').value) || 0;
            console.log('Updated titleCommandWindow:', tcw);
            close();
        });

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    updateSystemField(fieldName, value) {
        const system = this.databaseManager.getSystem();
        if (!system) return;

        system[fieldName] = value;
        console.log(`Updated system field ${fieldName} to:`, value);
    }

    showTitleImagePicker(system) {
        const path = require('path');
        const fs = require('fs');

        const project = this.projectManager.getCurrentProject();
        if (!project) {
            alert('No project loaded');
            return;
        }

        const titlesPath = path.join(project.path, 'img', 'titles1');

        // Check if directory exists
        if (!fs.existsSync(titlesPath)) {
            alert('titles1 folder not found');
            return;
        }

        // Read image files
        const files = fs.readdirSync(titlesPath).filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
        });

        // Create modal
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 8px;
            width: 900px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            background-color: var(--color-bg-panel);
            padding: 12px 16px;
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 8px 8px 0 0;
        `;
        header.innerHTML = `
            <div style="font-size: 16px; font-weight: 600; color: var(--color-text);">Select Title Image</div>
            <button style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">×</button>
        `;
        modal.appendChild(header);

        // Preview panel at top (widescreen)
        const previewPanel = document.createElement('div');
        previewPanel.style.cssText = `
            padding: 20px;
            border-bottom: 1px solid var(--color-border);
            display: flex;
            flex-direction: column;
            align-items: center;
            background-color: var(--color-bg-list-item);
            min-height: 580px;
        `;

        const previewImage = document.createElement('img');
        previewImage.style.cssText = `
            max-width: 100%;
            max-height: 560px;
            object-fit: contain;
            border: 1px solid var(--color-border);
            background-color: var(--color-bg-surface);
        `;

        const previewLabel = document.createElement('div');
        previewLabel.style.cssText = `
            margin-top: 12px;
            color: var(--color-text-muted);
            font-size: 12px;
            text-align: center;
        `;
        previewLabel.textContent = 'Preview';

        previewPanel.appendChild(previewImage);
        previewPanel.appendChild(previewLabel);
        modal.appendChild(previewPanel);

        // File list content
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 12px 16px;
            overflow-y: auto;
            max-height: 200px;
        `;

        let selectedFile = system.title1Name || '';

        // Function to update preview
        const updatePreview = (fileName) => {
            if (fileName) {
                // Find the actual file with extension
                const actualFile = files.find(f => path.basename(f, path.extname(f)) === fileName);
                if (actualFile) {
                    const fullPath = path.join(titlesPath, actualFile);
                    // Use file:// protocol for NW.js
                    previewImage.src = 'file://' + fullPath.replace(/\\/g, '/');
                    previewLabel.textContent = fileName;
                } else {
                    previewImage.src = '';
                    previewLabel.textContent = 'No preview';
                }
            } else {
                previewImage.src = '';
                previewLabel.textContent = 'No image selected';
            }
        };

        // Set initial preview
        updatePreview(selectedFile);

        files.forEach(file => {
            const fileNameWithoutExt = path.basename(file, path.extname(file));
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 6px 12px;
                margin: 2px 0;
                background-color: ${selectedFile === fileNameWithoutExt ? 'var(--color-accent-tint-15)' : 'var(--color-bg-list-item)'};
                border: 1px solid ${selectedFile === fileNameWithoutExt ? 'var(--color-accent-border-strong)' : 'var(--color-border)'};
                border-radius: 4px;
                cursor: pointer;
                color: var(--color-text);
                transition: background-color 0.2s, border-color 0.2s;
                font-size: 13px;
            `;
            item.textContent = fileNameWithoutExt;

            item.addEventListener('click', () => {
                selectedFile = fileNameWithoutExt;
                // Update preview
                updatePreview(selectedFile);
                // Update all items
                content.querySelectorAll('div').forEach(div => {
                    const itemFile = div.textContent;
                    div.style.backgroundColor = itemFile === selectedFile ? 'var(--color-accent-tint-15)' : 'var(--color-bg-list-item)';
                    div.style.borderColor = itemFile === selectedFile ? 'var(--color-accent-border-strong)' : 'var(--color-border)';
                });
            });

            item.addEventListener('mouseenter', () => {
                if (selectedFile !== fileNameWithoutExt) {
                    item.style.backgroundColor = 'var(--color-bg-button)';
                }
            });

            item.addEventListener('mouseleave', () => {
                if (selectedFile !== fileNameWithoutExt) {
                    item.style.backgroundColor = 'var(--color-bg-list-item)';
                }
            });

            content.appendChild(item);
        });

        modal.appendChild(content);

        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-panel);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.onclick = () => document.body.removeChild(overlay);

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = `
            padding: 8px 16px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: 1px solid var(--color-accent);
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            transition: background-color 0.2s;
        `;
        okBtn.onclick = () => {
            // Update system data
            system.title1Name = selectedFile;

            // Close modal
            document.body.removeChild(overlay);

            // Refresh the System 1 display
            const detailEl = document.getElementById('database-detail');
            if (detailEl) {
                detailEl.innerHTML = '';
                this.showSystem1Detail(detailEl);
            }

            console.log('Updated title1Name to:', selectedFile);
        };
        okBtn.onmouseenter = () => {
            okBtn.style.backgroundColor = 'var(--color-accent-muted)';
        };
        okBtn.onmouseleave = () => {
            okBtn.style.backgroundColor = 'var(--color-accent)';
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        modal.appendChild(footer);

        // Close button
        header.querySelector('button').onclick = () => document.body.removeChild(overlay);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    showMusicPicker(system, musicType) {
        const path = require('path');
        const fs = require('fs');

        const project = this.projectManager.getCurrentProject();
        if (!project) {
            alert('No project loaded');
            return;
        }

        const bgmPath = path.join(project.path, 'audio', 'bgm');
        const mePath = path.join(project.path, 'audio', 'me');

        // Determine which folder to use based on music type
        const audioPath = ['victory', 'defeat', 'gameOver'].includes(musicType) ? mePath : bgmPath;
        const folderName = ['victory', 'defeat', 'gameOver'].includes(musicType) ? 'ME' : 'BGM';

        if (!fs.existsSync(audioPath)) {
            alert(`${folderName} folder not found`);
            return;
        }

        // Read audio files
        const files = fs.readdirSync(audioPath).filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.ogg', '.m4a', '.mp3', '.wav'].includes(ext);
        });

        this.showAudioPickerModal(system, files, audioPath, musicType, 'bgm', folderName);
    }

    showSoundPicker(system, soundIndex) {
        const path = require('path');
        const fs = require('fs');

        const project = this.projectManager.getCurrentProject();
        if (!project) {
            alert('No project loaded');
            return;
        }

        const sePath = path.join(project.path, 'audio', 'se');

        if (!fs.existsSync(sePath)) {
            alert('SE folder not found');
            return;
        }

        // Read audio files
        const files = fs.readdirSync(sePath).filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.ogg', '.m4a', '.mp3', '.wav'].includes(ext);
        });

        this.showAudioPickerModal(system, files, sePath, soundIndex, 'se', 'SE');
    }

    showAudioPickerModal(system, files, audioPath, identifier, audioType, folderName) {
        const path = require('path');

        // Create modal
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 8px;
            width: 700px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            background-color: var(--color-bg-panel);
            padding: 12px 16px;
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-radius: 8px 8px 0 0;
        `;
        header.innerHTML = `
            <div style="font-size: 16px; font-weight: 600; color: var(--color-text);">Select ${folderName} File</div>
            <button style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">×</button>
        `;
        modal.appendChild(header);

        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px;
            overflow-y: auto;
            flex: 1;
        `;

        let selectedFile = '';
        let currentVolume = 90;
        let currentPitch = 100;
        let currentPan = 0;

        // Get current selection and parameters
        if (audioType === 'bgm') {
            const bgm = system[`${identifier}Bgm`] || {};
            selectedFile = bgm.name || '';
            currentVolume = bgm.volume !== undefined ? bgm.volume : 90;
            currentPitch = bgm.pitch !== undefined ? bgm.pitch : 100;
            currentPan = bgm.pan !== undefined ? bgm.pan : 0;
        } else {
            const se = system.sounds?.[identifier] || {};
            selectedFile = se.name || '';
            currentVolume = se.volume !== undefined ? se.volume : 90;
            currentPitch = se.pitch !== undefined ? se.pitch : 100;
            currentPan = se.pan !== undefined ? se.pan : 0;
        }

        // Create audio element and Web Audio context for playback
        const audioElement = document.createElement('audio');
        let audioContext = null;
        let sourceNode = null;
        let gainNode = null;
        let pannerNode = null;
        let currentlyPlaying = null;

        // Function to stop audio playback
        const stopAudio = () => {
            if (audioElement) {
                audioElement.pause();
                audioElement.currentTime = 0;
            }
            if (currentlyPlaying) {
                const playIcon = currentlyPlaying.querySelector('.play-icon');
                if (playIcon) {
                    playIcon.textContent = '▶';
                }
                currentlyPlaying = null;
            }
        };

        // Function to play audio file
        const playAudio = (fileName, playButton) => {
            if (!fileName) return;

            // If clicking the currently playing button, stop it
            if (currentlyPlaying === playButton) {
                stopAudio();
                return;
            }

            // Stop any currently playing audio
            stopAudio();

            // Find the actual file with extension
            const actualFile = files.find(f => path.basename(f, path.extname(f)) === fileName);
            if (!actualFile) return;

            const fullPath = path.join(audioPath, actualFile);
            audioElement.src = 'file://' + fullPath.replace(/\\/g, '/');

            // Initialize Web Audio API if not already done
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();

                // Create audio nodes once
                sourceNode = audioContext.createMediaElementSource(audioElement);
                gainNode = audioContext.createGain();
                pannerNode = audioContext.createStereoPanner();

                // Connect the nodes
                sourceNode.connect(gainNode);
                gainNode.connect(pannerNode);
                pannerNode.connect(audioContext.destination);
            }

            // Set audio parameters
            gainNode.gain.value = currentVolume / 100;
            pannerNode.pan.value = currentPan / 100;
            audioElement.playbackRate = currentPitch / 100;
            audioElement.preservesPitch = false; // Allow pitch to change with playback rate

            // Play the audio
            audioElement.play().then(() => {
                currentlyPlaying = playButton;
                const playIcon = playButton.querySelector('.play-icon');
                if (playIcon) {
                    playIcon.textContent = '■';
                }
            }).catch(err => {
                console.error('Error playing audio:', err);
            });

            // When audio ends, reset the button
            audioElement.onended = () => {
                stopAudio();
            };
        };

        // Add (None) option
        const noneItem = document.createElement('div');
        noneItem.className = 'file-item';
        noneItem.dataset.fileName = '';
        noneItem.style.cssText = `
            padding: 8px 12px;
            margin: 4px 0;
            background-color: ${selectedFile === '' ? 'var(--color-accent-tint-15)' : 'var(--color-bg-list-item)'};
            border: 1px solid ${selectedFile === '' ? 'var(--color-accent-border-strong)' : 'var(--color-border)'};
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--color-text);
            transition: background-color 0.2s, border-color 0.2s;
        `;
        noneItem.innerHTML = '<div style="flex: 1; cursor: pointer;">(None)</div>';

        noneItem.addEventListener('click', () => {
            selectedFile = '';
            stopAudio();
            content.querySelectorAll('.file-item').forEach(div => {
                const itemFile = div.dataset.fileName || '';
                div.style.backgroundColor = itemFile === selectedFile ? 'var(--color-accent-tint-15)' : 'var(--color-bg-list-item)';
                div.style.borderColor = itemFile === selectedFile ? 'var(--color-accent-border-strong)' : 'var(--color-border)';
            });
        });

        noneItem.addEventListener('dblclick', () => {
            selectedFile = '';
            okBtn.click();
        });

        noneItem.addEventListener('mouseenter', () => {
            if (selectedFile !== '') {
                noneItem.style.backgroundColor = 'var(--color-bg-button)';
            }
        });

        noneItem.addEventListener('mouseleave', () => {
            if (selectedFile !== '') {
                noneItem.style.backgroundColor = 'var(--color-bg-list-item)';
            }
        });

        content.appendChild(noneItem);

        files.forEach(file => {
            const fileNameWithoutExt = path.basename(file, path.extname(file));
            const item = document.createElement('div');
            item.className = 'file-item';
            item.dataset.fileName = fileNameWithoutExt;
            item.style.cssText = `
                padding: 8px 12px;
                margin: 4px 0;
                background-color: ${selectedFile === fileNameWithoutExt ? 'var(--color-accent-tint-15)' : 'var(--color-bg-list-item)'};
                border: 1px solid ${selectedFile === fileNameWithoutExt ? 'var(--color-accent-border-strong)' : 'var(--color-border)'};
                border-radius: 4px;
                display: flex;
                align-items: center;
                gap: 8px;
                color: var(--color-text);
                transition: background-color 0.2s, border-color 0.2s;
            `;

            // Play button
            const playBtn = document.createElement('button');
            playBtn.className = 'play-button';
            playBtn.style.cssText = `
                background: var(--color-bg-panel);
                border: 1px solid var(--color-text-dim);
                border-radius: 3px;
                color: var(--color-text-strong);
                cursor: pointer;
                padding: 4px 8px;
                font-size: 10px;
                min-width: 24px;
                transition: background-color 0.2s;
            `;
            playBtn.innerHTML = '<span class="play-icon">▶</span>';
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playAudio(fileNameWithoutExt, playBtn);
            });
            playBtn.addEventListener('mouseenter', () => {
                playBtn.style.backgroundColor = 'var(--color-bg-button)';
            });
            playBtn.addEventListener('mouseleave', () => {
                playBtn.style.backgroundColor = 'var(--color-bg-panel)';
            });

            // File name
            const fileName = document.createElement('div');
            fileName.style.cssText = 'flex: 1; cursor: pointer;';
            fileName.textContent = fileNameWithoutExt;
            item.addEventListener('click', () => {
                selectedFile = fileNameWithoutExt;
                stopAudio();
                content.querySelectorAll('.file-item').forEach(div => {
                    const itemFile = div.dataset.fileName || '';
                    div.style.backgroundColor = itemFile === selectedFile ? 'var(--color-accent-tint-15)' : 'var(--color-bg-list-item)';
                    div.style.borderColor = itemFile === selectedFile ? 'var(--color-accent-border-strong)' : 'var(--color-border)';
                });
            });

            item.addEventListener('dblclick', () => {
                selectedFile = fileNameWithoutExt;
                okBtn.click();
            });

            item.appendChild(playBtn);
            item.appendChild(fileName);

            item.addEventListener('mouseenter', () => {
                if (selectedFile !== fileNameWithoutExt) {
                    item.style.backgroundColor = 'var(--color-bg-button)';
                }
            });

            item.addEventListener('mouseleave', () => {
                if (selectedFile !== fileNameWithoutExt) {
                    item.style.backgroundColor = 'var(--color-bg-list-item)';
                }
            });

            content.appendChild(item);
        });

        modal.appendChild(content);

        // Progress/Seek Slider Panel
        const seekPanel = document.createElement('div');
        seekPanel.style.cssText = `
            padding: 8px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-surface);
        `;
        seekPanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span id="seek-current-time" style="color: var(--color-text-muted); font-size: 11px;">0:00</span>
                <span id="seek-duration" style="color: var(--color-text-muted); font-size: 11px;">0:00</span>
            </div>
            <input type="range" id="seek-slider" min="0" max="100" value="0"
                style="width: 100%; cursor: pointer;">
        `;
        const seekSlider = seekPanel.querySelector('#seek-slider');
        const seekCurrentTime = seekPanel.querySelector('#seek-current-time');
        const seekDuration = seekPanel.querySelector('#seek-duration');

        let isSeeking = false;

        seekSlider.addEventListener('mousedown', () => {
            isSeeking = true;
        });

        seekSlider.addEventListener('mouseup', () => {
            isSeeking = false;
        });

        seekSlider.addEventListener('input', (e) => {
            if (audioElement && audioElement.duration) {
                const percent = e.target.value;
                const time = (percent / 100) * audioElement.duration;
                audioElement.currentTime = time;

                // Update time display
                const formatTime = (seconds) => {
                    if (isNaN(seconds)) return '0:00';
                    const mins = Math.floor(seconds / 60);
                    const secs = Math.floor(seconds % 60);
                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                };
                seekCurrentTime.textContent = formatTime(time);
            }
        });

        // Update seek slider and time as audio plays
        audioElement.addEventListener('timeupdate', () => {
            if (!isSeeking && audioElement.duration) {
                const current = audioElement.currentTime;
                const duration = audioElement.duration;
                const percent = (current / duration) * 100;
                seekSlider.value = percent;

                const formatTime = (seconds) => {
                    if (isNaN(seconds)) return '0:00';
                    const mins = Math.floor(seconds / 60);
                    const secs = Math.floor(seconds % 60);
                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                };
                seekCurrentTime.textContent = formatTime(current);
            }
        });

        // Update duration when metadata loads
        audioElement.addEventListener('loadedmetadata', () => {
            const formatTime = (seconds) => {
                if (isNaN(seconds)) return '0:00';
                const mins = Math.floor(seconds / 60);
                const secs = Math.floor(seconds % 60);
                return `${mins}:${secs.toString().padStart(2, '0')}`;
            };
            seekDuration.textContent = formatTime(audioElement.duration);
        });

        modal.appendChild(seekPanel);

        // Audio Controls Panel
        const controlsPanel = document.createElement('div');
        controlsPanel.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-list-item);
        `;

        const controlsGrid = document.createElement('div');
        controlsGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
        `;

        // Volume control
        const volumeControl = document.createElement('div');
        volumeControl.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <label style="color: var(--color-text); font-size: 12px;">Volume:</label>
                <span id="volume-value" style="color: var(--color-text-muted); font-size: 12px;">${currentVolume}</span>
            </div>
            <input type="range" id="volume-slider" min="0" max="100" value="${currentVolume}"
                style="width: 100%; cursor: pointer;">
        `;
        const volumeSlider = volumeControl.querySelector('#volume-slider');
        const volumeValue = volumeControl.querySelector('#volume-value');
        volumeSlider.addEventListener('input', (e) => {
            currentVolume = parseInt(e.target.value);
            volumeValue.textContent = currentVolume;
            if (gainNode) {
                gainNode.gain.value = currentVolume / 100;
            }
        });
        controlsGrid.appendChild(volumeControl);

        // Pitch control
        const pitchControl = document.createElement('div');
        pitchControl.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <label style="color: var(--color-text); font-size: 12px;">Pitch:</label>
                <span id="pitch-value" style="color: var(--color-text-muted); font-size: 12px;">${currentPitch}%</span>
            </div>
            <input type="range" id="pitch-slider" min="50" max="150" value="${currentPitch}"
                style="width: 100%; cursor: pointer;">
        `;
        const pitchSlider = pitchControl.querySelector('#pitch-slider');
        const pitchValue = pitchControl.querySelector('#pitch-value');
        pitchSlider.addEventListener('input', (e) => {
            currentPitch = parseInt(e.target.value);
            pitchValue.textContent = currentPitch + '%';
            if (audioElement) {
                audioElement.playbackRate = currentPitch / 100;
                audioElement.preservesPitch = false; // Allow pitch to change
            }
        });
        controlsGrid.appendChild(pitchControl);

        // Pan control
        const panControl = document.createElement('div');
        panControl.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <label style="color: var(--color-text); font-size: 12px;">Pan:</label>
                <span id="pan-value" style="color: var(--color-text-muted); font-size: 12px;">${currentPan}</span>
            </div>
            <input type="range" id="pan-slider" min="-100" max="100" value="${currentPan}"
                style="width: 100%; cursor: pointer;">
        `;
        const panSlider = panControl.querySelector('#pan-slider');
        const panValue = panControl.querySelector('#pan-value');
        panSlider.addEventListener('input', (e) => {
            currentPan = parseInt(e.target.value);
            panValue.textContent = currentPan;
            if (pannerNode) {
                pannerNode.pan.value = currentPan / 100;
            }
        });
        controlsGrid.appendChild(panControl);

        controlsPanel.appendChild(controlsGrid);
        modal.appendChild(controlsPanel);

        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-panel);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.onclick = () => {
            stopAudio();
            document.body.removeChild(overlay);
        };

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = `
            padding: 8px 16px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: 1px solid var(--color-accent);
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            transition: background-color 0.2s;
        `;
        okBtn.onclick = () => {
            // Update system data with file name and audio parameters
            if (audioType === 'bgm') {
                if (!system[`${identifier}Bgm`]) {
                    system[`${identifier}Bgm`] = { name: '', volume: 90, pitch: 100, pan: 0 };
                }
                system[`${identifier}Bgm`].name = selectedFile;
                system[`${identifier}Bgm`].volume = currentVolume;
                system[`${identifier}Bgm`].pitch = currentPitch;
                system[`${identifier}Bgm`].pan = currentPan;
            } else {
                if (!system.sounds) {
                    system.sounds = [];
                }
                if (!system.sounds[identifier]) {
                    system.sounds[identifier] = { name: '', volume: 90, pitch: 100, pan: 0 };
                }
                system.sounds[identifier].name = selectedFile;
                system.sounds[identifier].volume = currentVolume;
                system.sounds[identifier].pitch = currentPitch;
                system.sounds[identifier].pan = currentPan;
            }

            // Stop audio before closing
            stopAudio();

            // Close modal
            document.body.removeChild(overlay);

            // Refresh the System 1 display
            const detailEl = document.getElementById('database-detail');
            if (detailEl) {
                detailEl.innerHTML = '';
                this.showSystem1Detail(detailEl);
            }

            console.log(`Updated ${audioType} ${identifier}:`, {
                name: selectedFile,
                volume: currentVolume,
                pitch: currentPitch,
                pan: currentPan
            });
        };
        okBtn.onmouseenter = () => {
            okBtn.style.backgroundColor = 'var(--color-accent-muted)';
        };
        okBtn.onmouseleave = () => {
            okBtn.style.backgroundColor = 'var(--color-accent)';
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        modal.appendChild(footer);

        // Close button
        header.querySelector('button').onclick = () => {
            stopAudio();
            document.body.removeChild(overlay);
        };

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }
}
