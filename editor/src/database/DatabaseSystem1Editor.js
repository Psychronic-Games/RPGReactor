/**
 * DatabaseSystem1Editor - Editor for managing System 1 settings
 * Handles game configuration including title, parties, vehicles, battle settings, and audio
 */

class DatabaseSystem1Editor {
    /**
     * System.json does not store these eight under a uniform `<type>Bgm` key.
     * Title and Battle are BGM; Victory, Defeat and Game Over are ME (and Game
     * Over is spelled `gameoverMe`, lowercase); the three vehicles nest their
     * BGM inside the vehicle object. Synthesising `<type>Bgm` read six empty
     * slots and wrote six keys the engine never looks at.
     */
    static resolveMusicSlot(system, type) {
        const direct = {
            title: 'titleBgm', battle: 'battleBgm',
            victory: 'victoryMe', defeat: 'defeatMe', gameOver: 'gameoverMe'
        }[type];
        if (direct) {
            return {
                get: () => system[direct] || {},
                ensure: () => (system[direct] = system[direct]
                    || { name: '', volume: 90, pitch: 100, pan: 0 })
            };
        }
        if (['boat', 'ship', 'airship'].includes(type)) {
            return {
                get: () => (system[type] && system[type].bgm) || {},
                ensure: () => {
                    if (!system[type]) system[type] = {};
                    return (system[type].bgm = system[type].bgm
                        || { name: '', volume: 90, pitch: 100, pan: 0 });
                }
            };
        }
        return null;
    }

    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this.locationPicker = new TransferPlayerEditor(databaseManager, projectManager);
    }

    showSystem1Detail(container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const system = this.databaseManager.getSystem();
        if (!system) {
            container.innerHTML = `<p style="color: var(--color-text-muted); text-align: center; margin-top: 100px;">${tt('System data not loaded')}</p>`;
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
        titleBanner.textContent = tt('System 1');
        wrapper.appendChild(titleBanner);

        // 3-column grid
        const columnsGrid = document.createElement('div');
        columnsGrid.className = 'system1-columns-grid';
        columnsGrid.style.cssText = `
            display: grid;
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
                        console.debug(`Updated ${field} to:`, value);
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
                        console.debug(`Updated ${field} to:`, system[field]);
                    }
                });
            });

            // Music rows
            const musicRows = container.querySelectorAll('.music-row');
            musicRows.forEach(row => {
                const activate = () => {
                    const musicType = row.dataset.musicType;
                    this.showMusicPicker(system, musicType);
                };
                row.tabIndex = 0;
                row.setAttribute('role', 'button');
                row.setAttribute('aria-label', row.textContent.trim());
                row.addEventListener('click', activate);
                row.addEventListener('keydown', event => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    activate();
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
                const activate = () => {
                    const soundIndex = parseInt(row.dataset.soundIndex);
                    this.showSoundPicker(system, soundIndex);
                };
                row.tabIndex = 0;
                row.setAttribute('role', 'button');
                row.setAttribute('aria-label', row.textContent.trim());
                row.addEventListener('click', activate);
                row.addEventListener('keydown', event => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    activate();
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
                        if (sysField === 'gameTitle' && window.reactor?.projectController?.updateWindowTitle) {
                            window.reactor.projectController.updateWindowTitle();
                        }
                        console.debug(`Updated system.${sysField} to:`, e.target.value);
                    }
                });
            });

            const titleInterface = container.querySelector('.system-title-interface');
            if (titleInterface) {
                titleInterface.addEventListener('change', event => {
                    system.reactorTitleInterfaceId = Math.max(0, Math.floor(Number(event.target.value) || 0));
                    this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
                });
            }

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
                            console.debug(`Updated system.${vehicleKey}.${prop} to:`, val);
                        }
                    } else {
                        // Top-level: e.g. "startMapId", "startX", "startY"
                        system[target] = val;
                        console.debug(`Updated system.${target} to:`, val);
                    }
                });
            });

            container.querySelectorAll('.system-pos-picker-btn').forEach(button => {
                button.addEventListener('click', () => {
                    this.showStartLocationPicker(system, button.dataset.posOwner, container);
                });
            });

            // Command Window Settings button
            const cmdWindowBtn = container.querySelector('.database-button');
            if (cmdWindowBtn && cmdWindowBtn.textContent.trim() === tt('Command Window Settings')) {
                cmdWindowBtn.addEventListener('click', () => {
                    this.showCommandWindowModal(system, container);
                });
            }

        }, 0);
    }

    createColumn1(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const column = document.createElement('div');
        column.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

        // Row 1: Game Title
        const gameTitleSection = this.createSection(tt('Game Title'), `
            <div class="form-row">
                <input type="text" class="database-field-value system-text-field" style="width: 100%;" value="${rrEscapeHtml(system.gameTitle)}" data-system-field="gameTitle">
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
                <span style="color: var(--color-text); flex: 1; font-size: 12px;">${rrEscapeHtml(actor ? actor.name : tt('Actor') + ' #' + actorId)}</span>
                <button class="party-move-up" data-idx="${idx}" style="padding: 2px 6px; background: var(--color-bg-menubar); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 10px;" title="${tt('Move up')}">\u25B2</button>
                <button class="party-move-down" data-idx="${idx}" style="padding: 2px 6px; background: var(--color-bg-menubar); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 10px;" title="${tt('Move down')}">\u25BC</button>
                <button class="party-remove" data-idx="${idx}" style="padding: 2px 6px; background: var(--color-bg-menubar); color: #f44; border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 10px;" title="${tt('Remove')}">\u2715</button>
            </div>`;
        });
        if (partyMembers.length === 0) {
            partyListHTML += `<div style="color: var(--color-text-muted); font-size: 12px;">${tt('No party members')}</div>`;
        }
        partyListHTML += '</div>';
        partyListHTML += `<div style="display: flex; gap: 6px; margin-top: 8px; align-items: center;">
            <select id="system-party-add-select" class="database-field-value" style="flex: 1; font-size: 12px;">
                ${actors.filter(a => a).map(a => `<option value="${a.id}">${rrEscapeHtml(a.name)}</option>`).join('')}
            </select>
            <button id="system-party-add-btn" style="padding: 4px 10px; background: var(--color-bg-menubar); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 11px;">${tt('Add')}</button>
        </div>`;

        const startingPartySection = this.createSection(tt('Starting Party'), partyListHTML);
        column.appendChild(startingPartySection);

        // Row 3: Currency & Window Tone
        const wt = system.windowTone || [0, 0, 0, 0];
        const currencySection = this.createSection(tt('Currency & Display'), `
            <div class="form-row">
                <label class="database-field-label">${tt('Currency Unit:')}</label>
                <input type="text" class="database-field-value system-text-field" style="width: 120px;" value="${rrEscapeHtml(system.currencyUnit || 'G')}" data-system-field="currencyUnit">
            </div>
            <div style="margin-top: 10px;">
                <label class="database-field-label" style="margin-bottom: 6px; display: block;">${tt('Window Tone:')}</label>
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
                <label class="database-field-label" style="min-width: 50px;">${tt('Boat:')}</label>
                <input type="text" class="database-field-value" style="flex: 1;" value="${rrEscapeHtml(system.boat?.characterName || '')}" readonly>
                <button class="vehicle-change-btn rr-btn-chip" data-vehicle="boat">${tt('Change')}</button>
            </div>
            <div class="form-row" style="display: flex; align-items: center; gap: 6px; margin-top: 6px;">
                <label class="database-field-label" style="min-width: 50px;">${tt('Ship:')}</label>
                <input type="text" class="database-field-value" style="flex: 1;" value="${rrEscapeHtml(system.ship?.characterName || '')}" readonly>
                <button class="vehicle-change-btn rr-btn-chip" data-vehicle="ship">${tt('Change')}</button>
            </div>
            <div class="form-row" style="display: flex; align-items: center; gap: 6px; margin-top: 6px;">
                <label class="database-field-label" style="min-width: 50px;">${tt('Airship:')}</label>
                <input type="text" class="database-field-value" style="flex: 1;" value="${rrEscapeHtml(system.airship?.characterName || '')}" readonly>
                <button class="vehicle-change-btn rr-btn-chip" data-vehicle="airship">${tt('Change')}</button>
            </div>
        `;
        const vehicleSection = this.createSection(tt('Vehicle Images'), vehicleImages);
        column.appendChild(vehicleSection);

        // Row 5: Starting Positions (editable)
        const posField = (label, mapVal, xVal, yVal, prefix, owner) => `
            <div class="form-row system-pos-row" data-pos-owner="${owner}" style="margin-bottom: 6px;">
                <label class="database-field-label" style="min-width: 50px;">${label}:</label>
                <div style="display: flex; gap: 4px; align-items: center;">
                    <span style="color: var(--color-text-muted); font-size: 11px;">${tt('Map')}</span>
                    <input type="number" class="database-field-value system-pos-field" style="width: 50px; font-size: 11px;" value="${mapVal}" min="0" data-pos-target="${prefix}MapId" data-pos-part="mapId">
                    <span style="color: var(--color-text-muted); font-size: 11px;">${tt('X')}</span>
                    <input type="number" class="database-field-value system-pos-field" style="width: 50px; font-size: 11px;" value="${xVal}" min="0" data-pos-target="${prefix}X" data-pos-part="x">
                    <span style="color: var(--color-text-muted); font-size: 11px;">${tt('Y')}</span>
                    <input type="number" class="database-field-value system-pos-field" style="width: 50px; font-size: 11px;" value="${yVal}" min="0" data-pos-target="${prefix}Y" data-pos-part="y">
                    <button class="system-pos-picker-btn rr-btn-chip" data-pos-owner="${owner}">${tt('Browse...')}</button>
                </div>
            </div>`;

        const startingPos =
            posField(tt('Player'), system.startMapId || 1, system.startX || 0, system.startY || 0, 'start', 'player') +
            posField(tt('Boat'), system.boat?.startMapId || 0, system.boat?.startX || 0, system.boat?.startY || 0, 'boat.start', 'boat') +
            posField(tt('Ship'), system.ship?.startMapId || 0, system.ship?.startX || 0, system.ship?.startY || 0, 'ship.start', 'ship') +
            posField(tt('Airship'), system.airship?.startMapId || 0, system.airship?.startX || 0, system.airship?.startY || 0, 'airship.start', 'airship');

        const startingPosSection = this.createSection(tt('Starting Positions'), startingPos);
        column.appendChild(startingPosSection);

        return column;
    }

    applyStartLocation(system, ownerKey, location) {
        if (!system || !location) return false;
        const mapId = Math.max(0, Math.trunc(Number(location.mapId) || 0));
        const x = Math.max(0, Math.trunc(Number(location.x) || 0));
        const y = Math.max(0, Math.trunc(Number(location.y) || 0));

        if (ownerKey === 'player') {
            Object.assign(system, { startMapId: mapId, startX: x, startY: y });
            return true;
        }
        if (!['boat', 'ship', 'airship'].includes(ownerKey)) return false;
        if (!system[ownerKey]) {
            system[ownerKey] = { characterName: '', characterIndex: 0 };
        }
        Object.assign(system[ownerKey], { startMapId: mapId, startX: x, startY: y });
        return true;
    }

    showStartLocationPicker(system, ownerKey, container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const owner = ownerKey === 'player' ? system : system[ownerKey] || {};
        const labels = {
            player: tt('Player'),
            boat: tt('Boat'),
            ship: tt('Ship'),
            airship: tt('Airship')
        };
        if (!labels[ownerKey]) return;

        this.locationPicker.showMapPicker({
            mapId: owner.startMapId,
            x: owner.startX,
            y: owner.startY,
            title: `${labels[ownerKey]} - ${tt('Select Map & Position')}`,
            onConfirm: location => {
                if (!this.applyStartLocation(system, ownerKey, location)) return;
                const row = Array.from(container.querySelectorAll('.system-pos-row'))
                    .find(candidate => candidate.dataset.posOwner === ownerKey);
                if (!row) return;
                row.querySelector('[data-pos-part="mapId"]').value = location.mapId;
                row.querySelector('[data-pos-part="x"]').value = location.x;
                row.querySelector('[data-pos-part="y"]').value = location.y;
            }
        });
    }

    createColumn2(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const column = document.createElement('div');
        column.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

        // Row 1: Title Screen
        const titleImageName = system.title1Name || '';
        const interfaceOptions = this.userInterfaceOptions(system.reactorTitleInterfaceId);
        const titleScreen = `
            <div class="form-row" style="margin-bottom: 8px;">
                <label class="database-field-label">${tt('Custom title interface:')}</label>
                <select class="database-field-value system-title-interface" style="width: 100%;">${interfaceOptions}</select>
                <div style="color: var(--color-text-muted); font-size: 11px; margin-top: 4px;">${tt('Stock title screen is used when no scene interface is selected or the record is unavailable.')}</div>
            </div>
            <div class="form-row">
                <label class="database-field-label">${tt('Title Image:')}</label>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="text" class="database-field-value" style="flex: 1;" value="${rrEscapeHtml(titleImageName)}" readonly>
                    <button class="title-image-picker-btn" style="padding: 6px 12px; background: var(--color-bg-panel); color: var(--color-text-strong); border: 1px solid var(--color-text-dim); border-radius: 4px; cursor: pointer; white-space: nowrap; transition: background-color 0.2s, border-color 0.2s;">
                        ${tt('Choose Image')}
                    </button>
                </div>
            </div>
            <div class="form-row" style="margin-top: 8px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optDrawTitle ? 'checked' : ''} data-field="optDrawTitle">
                    ${tt('Draw Game Title')}
                </label>
            </div>
            <div class="form-row" style="margin-top: 8px;">
                <button class="database-button" style="padding: 6px 12px; background: var(--color-bg-panel); color: var(--color-text-strong); border: 1px solid var(--color-text-dim); border-radius: 4px; cursor: pointer;">
                    ${tt('Command Window Settings')}
                </button>
            </div>
        `;
        const titleScreenSection = this.createSection(tt('Title Screen'), titleScreen);
        column.appendChild(titleScreenSection);

        // Row 2: Battle Screen
        const battleView = system.optSideView ? 'sideView' : 'frontView';
        const battleScreen = `
            <div class="form-row">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); cursor: pointer;">
                    <input type="radio" class="system-radio" name="battleView" value="frontView" ${!system.optSideView ? 'checked' : ''} data-field="optSideView" data-value="false">
                    ${tt('Front View')}
                </label>
            </div>
            <div class="form-row" style="margin-top: 4px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); cursor: pointer;">
                    <input type="radio" class="system-radio" name="battleView" value="sideView" ${system.optSideView ? 'checked' : ''} data-field="optSideView" data-value="true">
                    ${tt('Side View')}
                </label>
            </div>
        `;
        const battleScreenSection = this.createSection(tt('Battle Screen'), battleScreen);
        column.appendChild(battleScreenSection);

        // Row 3: Battle System
        const battleSystem = `
            <div class="form-row">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); cursor: pointer;">
                    <input type="radio" class="system-radio" name="battleSystem" value="turn" ${system.battleSystem === 0 ? 'checked' : ''} data-field="battleSystem" data-value="0">
                    ${tt('Turn-Based')}
                </label>
            </div>
            <div class="form-row" style="margin-top: 4px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); cursor: pointer;">
                    <input type="radio" class="system-radio" name="battleSystem" value="timeActive" ${system.battleSystem === 1 ? 'checked' : ''} data-field="battleSystem" data-value="1">
                    ${tt('Time Progress (Active)')}
                </label>
            </div>
            <div class="form-row" style="margin-top: 4px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); cursor: pointer;">
                    <input type="radio" class="system-radio" name="battleSystem" value="timeWait" ${system.battleSystem === 2 ? 'checked' : ''} data-field="battleSystem" data-value="2">
                    ${tt('Time Progress (Wait)')}
                </label>
            </div>
        `;
        const battleSystemSection = this.createSection(tt('Battle System'), battleSystem);
        column.appendChild(battleSystemSection);

        // Row 4: Options
        const options = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optTransparent ? 'checked' : ''} data-field="optTransparent">
                    ${tt('Start Transparent')}
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optFollowers ? 'checked' : ''} data-field="optFollowers">
                    ${tt('Show Followers')}
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optSlipDeath ? 'checked' : ''} data-field="optSlipDeath">
                    ${tt('Slip Damage Death')}
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optFloorDeath ? 'checked' : ''} data-field="optFloorDeath">
                    ${tt('Floor Damage Death')}
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optDisplayTp ? 'checked' : ''} data-field="optDisplayTp">
                    ${tt('Display TP')}
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optExtraExp ? 'checked' : ''} data-field="optExtraExp">
                    ${tt('EXP for Reserves')}
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optKeyItemsNumber ? 'checked' : ''} data-field="optKeyItemsNumber">
                    ${tt('Show Key Item Count')}
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${system.optAutosave ? 'checked' : ''} data-field="optAutosave">
                    ${tt('Enable Autosave')}
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" data-field="optSplashScreen">
                    ${tt('Show Splash Screen')}
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" data-field="optMessageSkip">
                    ${tt('Enable Message Skip')}
                </label>
            </div>
        `;
        const optionsSection = this.createSection(tt('Options'), options);
        column.appendChild(optionsSection);

        return column;
    }

    userInterfaceOptions(selectedId) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const selected = Math.max(0, Math.floor(Number(selectedId) || 0));
        let html = `<option value="0"${selected === 0 ? ' selected' : ''}>${tt('Stock (default)')}</option>`;
        const records = this.databaseManager.getUserInterfaces ? this.databaseManager.getUserInterfaces() : [];
        for (const entry of records || []) {
            const id = Math.floor(Number(entry && entry.id) || 0);
            const roles = Array.isArray(entry && entry.roles) ? entry.roles : entry && entry.stock ? [entry.stock] : [];
            if (!entry || !(id > 0) || entry.mode === 'overlay' || !roles.includes('title')) continue;
            html += `<option value="${id}"${id === selected ? ' selected' : ''}>${String(id).padStart(4, '0')}: ${rrEscapeHtml(entry.name || tt('(Unnamed)'))}</option>`;
        }
        if (selected > 0 && !(records || []).some(entry => {
            const roles = Array.isArray(entry && entry.roles) ? entry.roles : entry && entry.stock ? [entry.stock] : [];
            return entry && Number(entry.id) === selected && entry.mode !== 'overlay' && roles.includes('title');
        })) {
            html += `<option value="${selected}" selected>${tt('(Missing)')} / ${tt('(incompatible)')} #${selected}</option>`;
        }
        return html;
    }

    createColumn3(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const column = document.createElement('div');
        column.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

        // Row 1: Music
        const musicTypes = ['title', 'battle', 'victory', 'defeat', 'gameOver', 'boat', 'ship', 'airship'];
        const musicLabels = ['Title', 'Battle', 'Victory', 'Defeat', 'Game Over', 'Boat', 'Ship', 'Airship'];

        let musicRows = '';
        musicTypes.forEach((type, idx) => {
            const bgm = DatabaseSystem1Editor.resolveMusicSlot(system, type)?.get() || {};
            musicRows += `
                <tr class="music-row" data-music-type="${type}" style="cursor: pointer;">
                    <td>${tt(musicLabels[idx])}</td>
                    <td>${rrEscapeHtml(bgm.name || tt('(None)'))}</td>
                </tr>
            `;
        });

        const musicTable = `
            <table class="traits-table">
                <thead>
                    <tr>
                        <th>${tt('Type')}</th>
                        <th>${tt('Filename')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${musicRows}
                </tbody>
            </table>
        `;
        const musicSection = this.createSection(tt('Music'), musicTable);
        column.appendChild(musicSection);

        // Row 2: Sound
        const soundLabels = RRSystemSoundSlotModal.SOUND_LABELS;

        let soundRows = '';
        soundLabels.forEach((label, idx) => {
            const se = system.sounds?.[idx] || {};
            const variants = Array.isArray(se.variants) ? se.variants.length : 0;
            const range = RRSystemSoundSlotModal.pitchRange(se.pitchRandom);
            const details = `${se.name || tt('(None)')}${variants ? ` +${variants}` : ''}${range ? `  P${range.min}-${range.max}` : ''}`;
            soundRows += `
                <tr class="sound-row" data-sound-index="${idx}" style="cursor: pointer;">
                    <td>${tt(label)}</td>
                    <td>${rrEscapeHtml(details)}</td>
                </tr>
            `;
        });

        const soundTable = `
            <table class="traits-table">
                <thead>
                    <tr>
                        <th>${tt('Type')}</th>
                        <th>${tt('Filename')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${soundRows}
                </tbody>
            </table>
        `;
        const soundSection = this.createSection(tt('Sound'), soundTable);
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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const path = require('path');
        const fs = require('fs');

        const project = this.projectManager.getCurrentProject();
        if (!project) { alert(tt('No project loaded')); return; }

        const charactersPath = path.join(project.path, 'img', 'characters');
        if (!fs.existsSync(charactersPath)) { alert(tt('Characters folder not found')); return; }

        const files = RRAssetFiles.listImageReferences(charactersPath);

        if (files.length === 0) { alert(tt('No character images found')); return; }

        this.parentEditor.showImagePicker(tt('Select Vehicle Image'), files, (selectedFile) => {
            if (!system[vehicleKey]) {
                system[vehicleKey] = { characterName: '', characterIndex: 0, startMapId: 0, startX: 0, startY: 0 };
            }
            system[vehicleKey].characterName = selectedFile;

            const indexChoice = prompt(tt('Enter character index (0-7) on the sprite sheet:'), system[vehicleKey].characterIndex || '0');
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
            return RRAssetFiles.imageUrlFor(charactersPath, fileName);
        });
    }

    showCommandWindowModal(system, container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
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
                <div style="font-size: 16px; font-weight: 600; color: var(--color-text);">${tt('Command Window Settings')}</div>
                <button class="cmd-modal-close" style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer;">×</button>
            </div>
            <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div class="form-row">
                    <label class="database-field-label">${tt('Background:')}</label>
                    <select id="cmd-win-bg" class="database-field-value" style="width: 100%;">
                        <option value="0" ${tcw.background === 0 ? 'selected' : ''}>${tt('Window')}</option>
                        <option value="1" ${tcw.background === 1 ? 'selected' : ''}>${tt('Dim')}</option>
                        <option value="2" ${tcw.background === 2 ? 'selected' : ''}>${tt('Transparent')}</option>
                    </select>
                </div>
                <div class="form-row" style="display: flex; gap: 16px;">
                    <div>
                        <label class="database-field-label">${tt('Offset X:')}</label>
                        <input type="number" id="cmd-win-ox" class="database-field-value" style="width: 80px;" value="${tcw.offsetX || 0}">
                    </div>
                    <div>
                        <label class="database-field-label">${tt('Offset Y:')}</label>
                        <input type="number" id="cmd-win-oy" class="database-field-value" style="width: 80px;" value="${tcw.offsetY || 0}">
                    </div>
                </div>
            </div>
            <div style="padding: 12px 16px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 8px; background-color: var(--color-bg-panel);">
                <button class="cmd-modal-cancel rr-btn-secondary">${tt('Cancel')}</button>
                <button class="cmd-modal-ok rr-button-primary">${tt('OK')}</button>
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
            console.debug('Updated titleCommandWindow:', tcw);
            close();
        });

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    updateSystemField(fieldName, value) {
        const system = this.databaseManager.getSystem();
        if (!system) return;

        system[fieldName] = value;
        console.debug(`Updated system field ${fieldName} to:`, value);
    }

    showTitleImagePicker(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const path = require('path');
        const fs = require('fs');

        const project = this.projectManager.getCurrentProject();
        if (!project) {
            alert(tt('No project loaded'));
            return;
        }

        const titlesPath = path.join(project.path, 'img', 'titles1');

        // Check if directory exists
        if (!fs.existsSync(titlesPath)) {
            alert(tt('titles1 folder not found'));
            return;
        }

        const files = RRAssetFiles.listImageReferences(titlesPath);

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
            width: min(1000px, 95vw);
            height: min(760px, 88vh);
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
            <div style="font-size: 16px; font-weight: 600; color: var(--color-text);">${tt('Select Title Image')}</div>
            <button style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">×</button>
        `;
        modal.appendChild(header);

        const workspace = document.createElement('div');
        workspace.style.cssText = 'display:flex;flex:1;min-height:0;overflow:hidden;';

        const browserPanel = document.createElement('div');
        browserPanel.style.cssText = 'flex:0 1 340px;min-width:180px;display:flex;flex-direction:column;border-right:1px solid var(--color-border);';

        const previewPanel = document.createElement('div');
        previewPanel.style.cssText = `
            flex: 1;
            min-width: 0;
            min-height: 0;
            padding: 24px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background-color: var(--color-bg-list-item);
            overflow: auto;
        `;

        const previewImage = document.createElement('img');
        previewImage.style.cssText = `
            max-width: 100%;
            max-height: calc(88vh - 190px);
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
        previewLabel.textContent = tt('Preview');

        previewPanel.appendChild(previewImage);
        previewPanel.appendChild(previewLabel);

        let selectedFile = system.title1Name || '';

        const updatePreview = (fileName) => {
            const imageUrl = RRAssetFiles.imageUrlFor(titlesPath, fileName);
            if (!imageUrl) {
                previewImage.src = '';
                previewImage.style.display = 'none';
                previewLabel.textContent = fileName ? tt('No preview') : tt('No image selected');
                return;
            }
            selectedFile = fileName;
            previewImage.style.display = '';
            previewImage.src = imageUrl;
            previewLabel.textContent = fileName;
        };

        const browser = RRPickerIndex.createBrowser({
            files,
            selectedName: selectedFile,
            folders: true,
            searchPlaceholder: tt('Search files...'),
            emptyText: `${tt('No files found in:')} img/titles1`,
            onSelect: updatePreview
        });
        browserPanel.appendChild(browser.element);
        workspace.appendChild(browserPanel);
        workspace.appendChild(previewPanel);
        modal.appendChild(workspace);

        if (files.includes(selectedFile)) {
            updatePreview(selectedFile);
            requestAnimationFrame(() => browser.scrollTo(selectedFile));
        } else {
            updatePreview('');
        }

        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-panel);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        `;

        const close = () => overlay.remove();
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.onclick = close;

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.className = 'rr-button-primary';
        okBtn.onclick = () => {
            system.title1Name = selectedFile;
            close();

            const detailEl = document.getElementById('database-detail');
            if (detailEl) {
                detailEl.innerHTML = '';
                this.showSystem1Detail(detailEl);
            }

            console.debug('Updated title1Name to:', selectedFile);
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        modal.appendChild(footer);

        header.querySelector('button').onclick = close;
        overlay.addEventListener('click', event => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    showMusicPicker(system, musicType) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const path = require('path');
        const fs = require('fs');

        const project = this.projectManager.getCurrentProject();
        if (!project) {
            alert(tt('No project loaded'));
            return;
        }

        const bgmPath = path.join(project.path, 'audio', 'bgm');
        const mePath = path.join(project.path, 'audio', 'me');

        // Determine which folder to use based on music type
        const audioPath = ['victory', 'defeat', 'gameOver'].includes(musicType) ? mePath : bgmPath;
        const folderName = ['victory', 'defeat', 'gameOver'].includes(musicType) ? 'ME' : 'BGM';

        if (!fs.existsSync(audioPath)) {
            alert(`${folderName} ${tt('folder not found')}`);
            return;
        }

        const files = RRAssetFiles.listUnique(audioPath, RRAssetFiles.AUDIO_EXTENSIONS);

        this.showAudioPickerModal(system, files, audioPath, musicType, 'bgm', folderName);
    }

    showSoundPicker(system, soundIndex) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const path = require('path');
        const fs = require('fs');

        const project = this.projectManager.getCurrentProject();
        if (!project) {
            alert(tt('No project loaded'));
            return;
        }

        const sePath = path.join(project.path, 'audio', 'se');

        if (!fs.existsSync(sePath)) {
            alert(tt('SE folder not found'));
            return;
        }

        const files = RRAssetFiles.listUnique(sePath, RRAssetFiles.AUDIO_EXTENSIONS);

        const current = system.sounds?.[soundIndex] || {};
        RRSystemSoundSlotModal.open({
            label: RRSystemSoundSlotModal.SOUND_LABELS[soundIndex],
            slot: current,
            files,
            onOk: result => {
                if (!system.sounds) system.sounds = [];
                system.sounds[soundIndex] = result;
                const detailEl = document.getElementById('database-detail');
                if (detailEl) {
                    detailEl.innerHTML = '';
                    this.showSystem1Detail(detailEl);
                    setTimeout(() => detailEl.querySelector(`.sound-row[data-sound-index="${soundIndex}"]`)?.focus(), 0);
                }
            }
        });
    }

    showAudioPickerModal(system, files, audioPath, identifier, audioType, folderName) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const isMusic = audioType === 'bgm';
        const slot = isMusic
            ? DatabaseSystem1Editor.resolveMusicSlot(system, identifier) : null;
        const current = isMusic
            ? (slot?.get() || {})
            : (system.sounds?.[identifier] || {});

        RRAudioPickerModal.open({
            title: `${tt('Select')} ${folderName} ${tt('File')}`,
            folderLabel: folderName,
            files,
            selected: current.name || '',
            levels: {
                volume: current.volume !== undefined ? current.volume : 90,
                pitch: current.pitch !== undefined ? current.pitch : 100,
                pan: current.pan !== undefined ? current.pan : 0
            },
            loopDefault: isMusic,
            onOk: result => {
                if (isMusic) {
                    if (slot) Object.assign(slot.ensure(), result);
                } else {
                    if (!system.sounds) {
                        system.sounds = [];
                    }
                    system.sounds[identifier] = { ...system.sounds[identifier], ...result };
                }

                const detailEl = document.getElementById('database-detail');
                if (detailEl) {
                    detailEl.innerHTML = '';
                    this.showSystem1Detail(detailEl);
                    const selector = isMusic
                        ? `.music-row[data-music-type="${identifier}"]`
                        : `.sound-row[data-sound-index="${identifier}"]`;
                    setTimeout(() => detailEl.querySelector(selector)?.focus(), 0);
                }
            }
        });
    }
}
