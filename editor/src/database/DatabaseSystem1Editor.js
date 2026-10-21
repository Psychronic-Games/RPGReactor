/**
 * DatabaseSystem1Editor - Editor for managing System 1 settings
 * Handles game configuration including title, parties, vehicles, battle settings, and audio
 */

class DatabaseSystem1Editor {
    /**
     * System.json does not store these five under a uniform `<type>Bgm` key.
     * Title and Battle are BGM; Victory, Defeat and Game Over are ME (and Game
     * Over is spelled `gameoverMe`, lowercase). A vehicle's BGM is nested in
     * its own object and is set in Database > Vehicles.
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
            this.wirePartyLimit(container, system);
            // Title image picker buttons -- one per title screen layer.
            container.querySelectorAll('.title-image-picker-btn').forEach(button => {
                button.addEventListener('click', () => {
                    this.showTitleImagePicker(system, Number(button.dataset.titleLayer) || 1);
                });
            });

            // Checkboxes
            const checkboxes = container.querySelectorAll('.system-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.addEventListener('change', (e) => {
                    const field = e.target.dataset.field;
                    const value = e.target.checked;
                    if (field) {
                        system[field] = value;
                        console.debug(`Updated ${field} to:`, value);
                    } else if (e.target.dataset.presentation) {
                        // Battle presentation switches live beside the database, not in System.json; on is the absence of the key.
                        const key = e.target.dataset.presentation, data = this.databaseManager.data;
                        const presentation = data.battlePresentation ||= (typeof ReactorBattleData !== 'undefined' ? ReactorBattleData.empty() : { version: 1 });
                        if (value) delete presentation[key]; else presentation[key] = false;
                        this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
                    }
                });
            });

            this.wireBattles(container, system);

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

            // Starting Party management
            this.wirePartyListeners(container, system);
            this.wireFollowerFormation(container, system);

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

            // The preview draws into an element that has to exist first, so it
            // runs with the rest of the wiring rather than inside the markup
            // that builds it.
            this.renderTitlePreview(container, system);

        }, 0);
    }

    createColumn1(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const column = document.createElement('div');
        column.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

        // Row 1: Game Title
        const gameTitleSection = this.keyedSection('game-title', tt('Game Title'), `
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
                <button class="party-remove" data-idx="${idx}" style="padding: 2px 6px; background: var(--color-bg-menubar); color: var(--color-danger-bright); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 10px;" title="${tt('Remove')}">\u2715</button>
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

        partyListHTML += `<div class="rr-battle-toolbar">
            <label class="rr-battle-field">${tt('Max Battle Members')}
                <input id="system-max-battle-members" type="number" min="1" max="99" step="1" class="database-field-value" style="width:96px" value="${this.partyLimit(system)}">
            </label>
            <button id="system-party-limit-reset" type="button" class="rr-btn-secondary">${tt('Use Existing Limit')}</button>
        </div><p id="system-party-limit-hint" class="rr-battle-help"></p>`;
        partyListHTML += this.followerFormationRows(system);
        const startingPartySection = this.keyedSection('starting-party', tt('Starting Party'), partyListHTML);
        column.appendChild(startingPartySection);

        // Row 3: Currency & Window Tone
        const wt = system.windowTone || [0, 0, 0, 0];
        const currencySection = this.keyedSection('currency-display', tt('Currency & Display'), `
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

        // Row 4: Starting Positions (editable)
        const posField = (label, mapVal, xVal, yVal, prefix, owner) => `
            <div class="form-row system-pos-row" data-pos-owner="${owner}" style="margin-bottom: 6px;">
                <label class="database-field-label" style="min-width: 50px;">${label}:</label>
                <div class="system-pos-controls">
                    <span class="system-pos-coordinate">
                        <span style="color: var(--color-text-muted); font-size: 11px;">${tt('Map')}</span>
                        <input type="number" class="database-field-value system-pos-field" style="width: 62px; font-size: 11px;" value="${mapVal}" min="0" data-pos-target="${prefix}MapId" data-pos-part="mapId">
                    </span>
                    <span class="system-pos-coordinate">
                        <span style="color: var(--color-text-muted); font-size: 11px;">${tt('X')}</span>
                        <input type="number" class="database-field-value system-pos-field" style="width: 62px; font-size: 11px;" value="${xVal}" min="0" data-pos-target="${prefix}X" data-pos-part="x">
                    </span>
                    <span class="system-pos-coordinate">
                        <span style="color: var(--color-text-muted); font-size: 11px;">${tt('Y')}</span>
                        <input type="number" class="database-field-value system-pos-field" style="width: 62px; font-size: 11px;" value="${yVal}" min="0" data-pos-target="${prefix}Y" data-pos-part="y">
                    </span>
                    <button class="system-pos-picker-btn rr-btn-chip" data-pos-owner="${owner}">${tt('Browse...')}</button>
                </div>
            </div>`;

        const startingPos =
            posField(tt('Player'), system.startMapId || 1, system.startX || 0, system.startY || 0, 'start', 'player') +
            posField(tt('Boat'), system.boat?.startMapId || 0, system.boat?.startX || 0, system.boat?.startY || 0, 'boat.start', 'boat') +
            posField(tt('Ship'), system.ship?.startMapId || 0, system.ship?.startX || 0, system.ship?.startY || 0, 'ship.start', 'ship') +
            posField(tt('Airship'), system.airship?.startMapId || 0, system.airship?.startX || 0, system.airship?.startY || 0, 'airship.start', 'airship');

        const startingPosSection = this.keyedSection('starting-positions', tt('Starting Positions'), startingPos);
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
        //
        // Scene_Title builds its background from two sprites -- img/titles1,
        // then img/titles2 drawn over it (runtime/reactor_scenes.js,
        // Scene_Title.prototype.createBackground). Only the lower one was
        // reachable here, so img/titles2, which every new project is given,
        // had no way in. The layers are named the way the troop editor names
        // its battleback layers.
        const titleLayerRow = (layer, label, value) => `
            <div class="form-row" style="display: flex; align-items: center; gap: 6px;${layer === 1 ? '' : ' margin-top: 6px;'}">
                <label class="database-field-label" style="min-width: 84px;">${label}</label>
                <input type="text" class="database-field-value" style="flex: 1; min-width: 0;" value="${rrEscapeHtml(value)}" readonly>
                <button class="title-image-picker-btn rr-btn-chip" data-title-layer="${layer}">${tt('Choose Image')}</button>
            </div>`;
        const titleScreen = `
            ${titleLayerRow(1, tt('Lower Layer:'), system.title1Name || '')}
            ${titleLayerRow(2, tt('Upper Layer:'), system.title2Name || '')}
            <div class="system-title-preview" style="margin-top: 8px; position: relative; width: 100%; border: 1px solid var(--color-border); border-radius: 3px; background-color: var(--color-bg-deep); overflow: hidden;"></div>
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
        const titleScreenSection = this.keyedSection('title-screen', tt('Title Screen'), titleScreen);
        column.appendChild(titleScreenSection);

        // Row 2: Battles, one card for the four modes.
        column.appendChild(this.createBattlesSection(system));

        // Row 3: Options
        const options = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${this.databaseManager.data.battlePresentation?.startMessages !== false ? 'checked' : ''} data-presentation="startMessages">
                    ${tt('Announce enemies at battle start')}
                </label>
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;">
                    <input type="checkbox" class="system-checkbox" ${this.databaseManager.data.battlePresentation?.escapeMessages !== false ? 'checked' : ''} data-presentation="escapeMessages">
                    ${tt('Show escape messages')}
                </label>
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
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 12px; cursor: pointer;" title="${rrEscapeHtml(tt('A Show Text with no face picture shows the face of whoever speaks: an actor or an event of that name.'))}">
                    <input type="checkbox" class="system-checkbox" ${system.reactorSpeakerFace === true ? 'checked' : ''} data-field="reactorSpeakerFace">
                    ${tt("Show the speaker's face in messages")}
                </label>
            </div>
        `;
        const optionsSection = this.keyedSection('options', tt('Options'), options);
        column.appendChild(optionsSection);

        return column;
    }

    //-------------------------------------------------------------------------
    // The Battles card.

    /** The modes fought on the map, as System.json, a map's Note tag and the commands store them. */
    static MAP_MODES = ['tactical', 'action', 'firstPerson'];

    /**
     * The card's own words in English; the label manager's keyed tables
     * translate them (I18nManager.js, "Database > System 1: the Battles card").
     */
    static TEXT = {
        'db.battles.screen': 'Screen',
        'db.battles.turns': 'Turns',
        'db.battles.classic': 'Classic battles',
        'db.battles.tactical': 'Tactical battles',
        'db.battles.tacticalElsewhere': 'A map or a command of this game fights Tactical.',
        'db.battles.onMap': 'Battles on the map',
        'db.battles.pace': 'Enemy turn speed',
        'db.battles.paceFast': 'Fast',
        'db.battles.paceSkip': 'Skip to my turn',
        'db.battles.paceHint': 'What a new player starts with.',
        'db.battles.revive': 'The fallen get up after a win',
        'db.battles.setup': 'Save and open Battle Setup',
        'db.battles.setupNoMap': 'Open a map first.'
    };

    /** One of the card's words in the editor's language. */
    static word(key) {
        const i18n = typeof window !== 'undefined' ? window.I18n : null;
        const text = i18n && typeof i18n.t === 'function' ? i18n.t(key) : key;
        return text && text !== key ? text : (DatabaseSystem1Editor.TEXT[key] || key);
    }

    /** A battle mode the game knows by this very name (it reads the names letter for letter); '' for anything else. */
    static modeName(value) {
        return value === 'classic' || DatabaseSystem1Editor.MAP_MODES.includes(value) ? value : '';
    }

    /** The first `<battle mode: x>` tag of a Note, or null: what it names is group 1. */
    static modeTag(note) {
        return /<battle\s*mode\s*:([^>]*)>/i.exec(String(note == null ? '' : note));
    }

    /** A mode named in a tag, in any letter case, as the game writes it; '' where it names none. */
    static modeNamed(text) {
        const word = String(text == null ? '' : text).trim().toLowerCase();
        return ['classic'].concat(DatabaseSystem1Editor.MAP_MODES).find(mode => mode.toLowerCase() === word) || '';
    }

    /**
     * A map's own mode as the game reads it: the first `<battle mode: x>`
     * tag of its Note (whatever it names: a tag that names no mode is no mode,
     * and the sidecar is not asked), else its 3D sidecar's battle mode;
     * '' for none.
     */
    static mapMode(map) {
        if (!map) return '';
        const E = DatabaseSystem1Editor, tag = E.modeTag(map.note);
        if (tag) return E.modeNamed(tag[1]);
        return E.modeName(map.reactor3d && map.reactor3d.battle && map.reactor3d.battle.mode);
    }

    /**
     * What a Start Battle on Map that names no on-map mode fights where the
     * mode in force is Classic: nothing on the map (the game starts no battle
     * there by itself). With a mode's name such a start would count for it.
     */
    static START_FALLBACK = '';

    /**
     * The on-map modes a list of event commands names: Start Battle on Map or
     * Change Battle Mode with a mode. `starts`, when given, takes the troop of
     * each Start Battle on Map that names none: it fights in the mode in force.
     */
    static commandModes(list, into = new Set(), starts = null) {
        const E = DatabaseSystem1Editor;
        for (const command of list || []) {
            if (!command || command.code !== 357) continue;
            const parameters = command.parameters || [];
            if (parameters[0] !== 'RPGReactor' || (parameters[1] !== 'StartMapBattle' && parameters[1] !== 'ChangeBattleMode')) continue;
            const mode = E.modeName(parameters[3] && parameters[3].mode);
            if (E.MAP_MODES.includes(mode)) into.add(mode);
            else if (starts && parameters[1] === 'StartMapBattle') starts.push(Math.floor(Number(parameters[3] && parameters[3].troopId) || 0));
        }
        return into;
    }

    /**
     * What a map says about battles on the map: its own mode ('' for none),
     * the on-map modes its events' commands name, and the troop of each
     * Start Battle on Map that names none.
     */
    static mapFacts(map) {
        const E = DatabaseSystem1Editor, named = new Set(), starts = [];
        for (const event of (map && map.events) || []) for (const page of (event && event.pages) || []) if (page) E.commandModes(page.list, named, starts);
        const facts = { own: E.mapMode(map), named: Array.from(named), starts };
        // Whether the Note holds a mode tag at all (one that names no mode still keeps the sidecar from being asked): not listed with the facts.
        return Object.defineProperty(facts, 'tagged', { value: !!E.modeTag(map && map.note), enumerable: false });
    }

    /**
     * What one map file says, read as the open map is: a map file gives its
     * Note's mode, the modes its commands name and its starts that name none;
     * a 3D sidecar gives its battle mode. null for a file that says nothing.
     * A file is parsed only when its text could say something.
     */
    static fileFacts(text, sidecar = false) {
        const E = DatabaseSystem1Editor, source = String(text == null ? '' : text);
        if (!(sidecar ? /"battle"\s*:/ : /StartMapBattle|ChangeBattleMode|battle[^"]{0,80}mode/i).test(source)) return null;
        let data = null;
        try { data = JSON.parse(source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source); } catch (error) { return null; }
        if (!data || typeof data !== 'object') return null;
        if (sidecar) {
            const own = E.mapMode({ reactor3d: data });
            return own ? { own } : null;
        }
        const facts = E.mapFacts({ note: data.note, events: data.events });
        return facts.own || facts.tagged || facts.named.length || facts.starts.length ? facts : null;
    }

    /**
     * The on-map modes a project fights in: the game's mode, a troop's, a
     * map's own, and every Start Battle on Map or Change Battle Mode command
     * that names one in a troop page, a common event or a map event. A Start
     * Battle on Map that names none fights in the mode in force (its troop's,
     * else its map's, else the game's), which is counted where it is named;
     * where that is Classic it counts as START_FALLBACK.
     *
     * facts: { mode, troops, commonEvents, openMap, maps } (`maps`: what the map files said, one `mapFacts` each)
     */
    static modesInUse(facts = {}) {
        const E = DatabaseSystem1Editor, used = new Set();
        const onMap = value => E.MAP_MODES.includes(E.modeName(value));
        const add = value => { if (onMap(value)) used.add(value); };
        const troops = facts.troops || [];
        const troopMode = id => {
            const troop = id > 0 ? troops.find(one => one && Number(one.id) === id) : null;
            return E.modeName(troop && troop.reactorBattle && troop.reactorBattle.mode);
        };
        const start = (troopId, mapOwn) => {
            if (E.START_FALLBACK && !onMap(troopMode(troopId) || E.modeName(mapOwn) || facts.mode)) used.add(E.START_FALLBACK);
        };
        add(facts.mode);
        // (A troop page and a common event run on any map: only the troop and the game are known there.)
        const anywhere = [];
        for (const troop of troops) {
            if (!troop) continue;
            add(troop.reactorBattle && troop.reactorBattle.mode);
            for (const page of troop.pages || []) if (page) E.commandModes(page.list, used, anywhere);
        }
        for (const event of facts.commonEvents || []) if (event) E.commandModes(event.list, used, anywhere);
        for (const troopId of anywhere) start(troopId, '');
        const maps = facts.openMap ? (facts.maps || []).concat([E.mapFacts(facts.openMap)]) : (facts.maps || []);
        for (const map of maps) {
            if (!map) continue;
            add(map.own);
            for (const mode of map.named || []) add(mode);
            for (const troopId of map.starts || []) start(troopId, map.own);
        }
        return used;
    }

    /** Node's file modules on a desktop; null in the web edition, which has no disk of the user's. */
    static nodeFiles() {
        if (typeof process === 'undefined' || !process.versions || !process.versions.node || typeof require !== 'function') return null;
        if (typeof window !== 'undefined' && window.RPGReactorWebHost && window.RPGReactorHost === window.RPGReactorWebHost) return null;
        try { return { fs: require('fs'), path: require('path') }; } catch (error) { return null; }
    }

    /**
     * Reads a project's map files (the maps and their 3D sidecars) for what
     * they say about battles on the map, one file at a time; a file is read
     * again only when its time or size changed. Resolves with one `mapFacts`
     * per map that says something (the Note's tag before the sidecar's mode, as
     * in the game), or null where there is no disk to read.
     */
    static async readMapModes(folder, node = DatabaseSystem1Editor.nodeFiles()) {
        const E = DatabaseSystem1Editor;
        if (!node || !node.fs || !node.fs.promises || !folder) return null;
        const io = node.fs.promises, files = E._mapModeFiles || (E._mapModeFiles = new Map());
        let names = [];
        try { names = await io.readdir(folder); } catch (error) { return []; }
        const maps = new Map(), sides = new Map(), tagged = new Set();
        for (const name of names) {
            const found = /^Map(\d+)(\.r3d)?\.json$/i.exec(name);
            if (!found) continue;
            const file = node.path.join(folder, name);
            try {
                const stat = await io.stat(file), stamp = stat.mtimeMs + ':' + stat.size;
                let entry = files.get(file);
                if (!entry || entry.stamp !== stamp) {
                    entry = { stamp, said: E.fileFacts(await io.readFile(file, 'utf8'), !!found[2]) };
                    files.set(file, entry);
                }
                if (!entry.said) continue;
                const id = Number(found[1]), map = maps.get(id) || { own: '', named: [], starts: [] };
                if (found[2]) {
                    sides.set(id, entry.said.own);
                    if (!tagged.has(id)) map.own = entry.said.own;
                } else {
                    Object.assign(map, entry.said);
                    if (entry.said.tagged) tagged.add(id);
                    else map.own = sides.get(id) || '';
                }
                maps.set(id, map);
            } catch (error) { /* a file that went away says nothing */ }
        }
        return Array.from(maps.values());
    }

    /** Whether System.json's battle settings say nothing but the defaults: Classic, team turns, nothing else. */
    static isPlainBattle(battle) {
        return !!battle && (battle.mode === undefined || battle.mode === 'classic') && (battle.turns === undefined || battle.turns === 'team')
            && Object.keys(battle).every(key => key === 'mode' || key === 'turns');
    }

    /** A stored `reactorBattle.partySize` as the game reads it: 1 to 99, or 0 for none. */
    static storedPartySize(system) {
        const size = Math.floor(Number(system && system.reactorBattle && system.reactorBattle.partySize) || 0);
        return size > 0 ? Math.min(size, 99) : 0;
    }

    /**
     * The plugins that count the battle party themselves. One that is on
     * replaces the game's count, so a stored battle party size is not read
     * beside it. (The names ReactorBattleData.maxBattleMembers reads a limit from.)
     */
    static PARTY_PLUGINS = ['PSYCHRONIC_PartySystemMZ', 'MOG_BattleHud', 'YEP_PartySystem'];

    /** Whether a party plugin is on in a project's plugin list. */
    static hasPartyPlugin(plugins) {
        return (plugins || []).some(plugin => !!plugin && plugin.status === true && DatabaseSystem1Editor.PARTY_PLUGINS.includes(plugin.name));
    }

    /**
     * Where the number of the party that fights comes from, as the game
     * counts it: 'set' (Max Battle Members), else 'plugin' (a party plugin
     * that is on), else 'stored' (a stored battle party size), else 'stock'
     * (four).
     */
    partyLimitSource(system) {
        const set = system ? system.maxBattleMembers : undefined;
        if (Number.isInteger(set) && set >= 1 && set <= 99) return 'set';
        if (DatabaseSystem1Editor.hasPartyPlugin(this.databaseManager.getPluginManifest?.())) return 'plugin';
        return DatabaseSystem1Editor.storedPartySize(system) ? 'stored' : 'stock';
    }

    /** How many of the party fight, as the game counts them. */
    partyLimit(system) {
        const source = this.partyLimitSource(system);
        if (source === 'set') return system.maxBattleMembers;
        if (source === 'stored') return DatabaseSystem1Editor.storedPartySize(system);
        return this.databaseManager.getMaxBattleMembers?.() ?? 4;
    }

    /**
     * Sets Max Battle Members (null: back to the project's existing limit).
     * A stored battle party size goes with it, so the number shown is the
     * number the game uses.
     */
    setPartyLimit(system, members) {
        const found = this.battleAsFound(system);
        if (members === null) delete system.maxBattleMembers; else system.maxBattleMembers = members;
        const battle = system.reactorBattle;
        if (battle && typeof battle === 'object' && 'partySize' in battle) {
            delete battle.partySize;
            if (DatabaseSystem1Editor.isPlainBattle(battle)) delete system.reactorBattle;
        }
        this.settleBattle(system, found);
        this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
    }

    /**
     * The Max Battle Members field and its Use Existing Limit button. The
     * field shows the game's number; a number typed there is stored, also
     * when it is the one shown; the hint says whether the number is the
     * database's own or one the project already had.
     */
    wirePartyLimit(container, system) {
        const tt = text => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const field = container.querySelector('#system-max-battle-members');
        const hint = container.querySelector('#system-party-limit-hint');
        if (!field) return;
        let typed = false;
        const refresh = () => {
            typed = false;
            field.value = this.partyLimit(system);
            const own = ['set', 'stored'].includes(this.partyLimitSource(system));
            if (hint) hint.textContent = tt(own ? 'Maximum actors in battle. Additional party members are reserves.'
                : 'Using the existing party limit. Edit to set the database limit.');
        };
        const commit = () => {
            const members = Number(field.value);
            if (field.value !== '' && Number.isInteger(members) && members >= 1 && members <= 99) this.setPartyLimit(system, members);
            refresh();
        };
        field.addEventListener('input', () => { typed = true; });
        field.addEventListener('change', commit);
        // The field tells nobody when the number typed is the one it showed: leaving it stores that number too.
        field.addEventListener('blur', () => { if (typed) commit(); });
        container.querySelector('#system-party-limit-reset')?.addEventListener('click', () => {
            this.setPartyLimit(system, null);
            refresh();
        });
        refresh();
    }

    mapDataFolder() {
        const folder = this.projectManager?.getCurrentProject?.()?.path;
        return folder ? String(folder).replace(/[\\/]+$/, '') + '/data' : '';
    }

    /** The on-map modes in use, with `mode` as the game's (the card's choice, saved or not). */
    battleModesInUse(mode) {
        const manager = this.databaseManager || {}, folder = this.mapDataFolder();
        return DatabaseSystem1Editor.modesInUse({
            mode,
            troops: manager.getTroops?.(),
            commonEvents: manager.getCommonEvents?.(),
            openMap: typeof window !== 'undefined' ? window.reactor?.eventManager?.currentMap || null : null,
            maps: this._mapModes && this._mapModes.folder === folder ? this._mapModes.maps : null
        });
    }

    /**
     * Reads the map files once per Database session; what they say shows
     * the rows of a mode the Database and the open map do not mention.
     */
    scanMapModes() {
        const folder = this.mapDataFolder(), session = this.parentEditor?._databaseSession || 0;
        if (!folder || (this._mapScan && this._mapScan.folder === folder && this._mapScan.session === session)) return null;
        this._mapScan = { folder, session };
        return DatabaseSystem1Editor.readMapModes(folder).then(maps => {
            if (!maps || this.mapDataFolder() !== folder) return;
            this._mapModes = { folder, maps };
            const card = this._battleCard;
            if (card && card.isConnected !== false) this.refreshBattleRows(card);
        }).catch(() => {});
    }

    /**
     * The Battles card: the game's battle mode and what each kind of battle
     * needs, on one label | field grid. The Classic rows are the battle
     * screen's; the Tactical rows show once the game, a map or a command
     * fights Tactical; the on-map rows once any battle is fought on the map.
     */
    createBattlesSection(system) {
        const tt = text => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const E = DatabaseSystem1Editor;
        // A word of the card, written into the opening tag of the element that shows it: the element keeps the
        // word's English (`lit`) or its key (`keyed`) beside it, so the label manager relabels the card where it
        // stands when the editor's language changes.
        const lit = english => ` data-i18n-text-source="${rrEscapeHtml(english)}">${rrEscapeHtml(tt(english))}`;
        const keyed = key => ` data-i18n="${key}">${rrEscapeHtml(E.word(key))}`;
        const word = source => (Object.hasOwn(E.TEXT, source) ? keyed(source) : lit(source));
        const battle = system.reactorBattle || {};
        const mode = E.modeName(battle.mode) || 'classic';
        const used = this.battleModesInUse(mode);
        const tactical = used.has('tactical') ? '' : ' hidden', onMap = used.size ? '' : ' hidden';
        const action = used.has('action') || used.has('firstPerson') ? '' : ' hidden';
        const options = (pairs, current) => pairs.map(([value, source]) =>
            `<option value="${value}"${String(value) === String(current) ? ' selected' : ''}${word(source)}</option>`).join('');
        const hasMap = typeof window !== 'undefined' && !!window.reactor?.eventManager?.currentMap;
        const section = this.keyedSection('battles', tt('Battles'), `
            <div class="system-battle-mode-grid">
                <label for="system-battle-mode"${lit('Battle mode')}</label>
                <select id="system-battle-mode" class="database-field-value system-battle-mode">
                    ${options([['classic', 'Classic'], ['tactical', 'Tactical'], ['action', 'Action'], ['firstPerson', 'First Person']], mode)}
                </select>
                <div class="system-battle-mode-hint"${lit('Classic is the separate battle screen; Tactical, Action and First Person fight on the map.')}</div>
                <div class="system-battle-group"${keyed('db.battles.classic')}</div>
                <label for="system-battle-screen"${keyed('db.battles.screen')}</label>
                <select id="system-battle-screen" class="database-field-value system-battle-screen">
                    ${options([['front', 'Front view'], ['side', 'Side view']], system.optSideView ? 'side' : 'front')}
                </select>
                <label for="system-battle-system"${keyed('db.battles.turns')}</label>
                <select id="system-battle-system" class="database-field-value system-battle-system">
                    ${options([[0, 'Turn-based'], [1, 'Time progress (active)'], [2, 'Time progress (wait)']], [1, 2].includes(system.battleSystem) ? system.battleSystem : 0)}
                </select>
                <div class="system-battle-group" data-tactical${tactical}${lit('Tactical Battles')}</div>
                <div class="system-battle-mode-hint" data-tactical-elsewhere${used.has('tactical') && mode !== 'tactical' ? '' : ' hidden'}${keyed('db.battles.tacticalElsewhere')}</div>
                <label for="system-battle-turns" data-tactical${tactical}${lit('Turn order')}</label>
                <select id="system-battle-turns" class="database-field-value system-battle-turns" data-tactical${tactical}>
                    ${options([['team', 'Team turns'], ['initiative', 'Initiative order']], battle.turns === 'initiative' ? 'initiative' : 'team')}
                </select>
                <label for="system-battle-view" data-tactical${tactical}${lit('Tactical view')}</label>
                <select id="system-battle-view" class="database-field-value system-battle-view" data-tactical${tactical}>
                    ${options([['isometric', 'Isometric'], ['map', "The map's own camera"]], battle.view === 'map' ? 'map' : 'isometric')}
                </select>
                <label for="system-battle-cinematic" data-tactical${tactical}${lit('Cinematic camera')}</label>
                <select id="system-battle-cinematic" class="database-field-value system-battle-cinematic" data-tactical${tactical}>
                    ${options([['off', 'Off'], ['some', 'Some actions'], ['every', 'Every action']], ['off', 'every'].includes(battle.cinematic?.level) ? battle.cinematic.level : 'some')}
                </select>
                <span data-tactical${tactical}></span>
                <label class="system-battle-check" data-tactical${tactical}>
                    <input type="checkbox" class="system-battle-slowmo" ${battle.cinematic?.slowMotion !== false ? 'checked' : ''}>
                    <span${lit('Slow motion on kills')}</span>
                </label>
                <label for="system-battle-pace" data-tactical${tactical}${keyed('db.battles.pace')}</label>
                <select id="system-battle-pace" class="database-field-value system-battle-pace" data-tactical${tactical}>
                    ${options([['normal', 'Normal'], ['fast', 'db.battles.paceFast'], ['skip', 'db.battles.paceSkip']], ['fast', 'skip'].includes(battle.pace) ? battle.pace : 'normal')}
                </select>
                <div class="system-battle-mode-hint" data-tactical${tactical}${keyed('db.battles.paceHint')}</div>
                <div class="system-battle-group" data-action${action}${lit('Action and First Person Battles')}</div>
                <div class="system-battle-mode-hint" data-action${action}${lit('Real-time attacks and cooldowns. First Person uses the same combat rules.')}</div>
                <div class="system-battle-group" data-on-map${onMap}${lit('Shared Combat Settings')}</div>
                <span data-on-map${onMap}></span>
                <label class="system-battle-check" data-on-map${onMap}>
                    <input type="checkbox" class="system-battle-revive" ${battle.reviveAfterBattle !== false ? 'checked' : ''}>
                    <span${keyed('db.battles.revive')}</span>
                </label>
            </div>
            <div class="system-battle-actions">
                <button type="button" class="rr-btn-secondary system-battle-setup"${hasMap ? '' : ' disabled aria-describedby="system-battle-setup-why"'}${keyed('db.battles.setup')}</button>
                ${hasMap ? '' : `<span id="system-battle-setup-why" class="system-battle-setup-why"${keyed('db.battles.setupNoMap')}</span>`}
            </div>
        `);
        section.className += ' system-battles-card';
        // The title keeps its English too: "Battle" and "Battles" are one word in some languages, and a change of
        // language would bring back the wrong one.
        const title = typeof section.querySelector === 'function' ? section.querySelector('.database-section-header') : null;
        if (title) title.setAttribute('data-i18n-text-source', 'Battles');
        return section;
    }

    /** The card's controls: each writes System.json as it changes; the rows shown follow the modes in use. */
    wireBattles(container, system) {
        const find = selector => container.querySelector(selector);
        const touched = () => { this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1; };
        find('.system-battle-screen')?.addEventListener('change', event => { system.optSideView = event.target.value === 'side'; touched(); });
        find('.system-battle-system')?.addEventListener('change', event => {
            system.battleSystem = Math.max(0, Math.min(2, Math.floor(Number(event.target.value)) || 0));
            touched();
        });
        for (const selector of ['.system-battle-mode', '.system-battle-turns', '.system-battle-view', '.system-battle-cinematic', '.system-battle-slowmo', '.system-battle-pace', '.system-battle-revive']) {
            find(selector)?.addEventListener('change', () => {
                this.writeBattleMode(container, system);
                if (selector === '.system-battle-mode') this.refreshBattleRows(container);
            });
        }
        find('.system-battle-setup')?.addEventListener('click', () => { this.saveAndOpenBattleSetup(); });
        this._battleCard = container;
        this.scanMapModes();
    }

    /** A value as text with its keys in one order at every depth: two values that say the same read the same. */
    static canonical(value) {
        return JSON.stringify(value, (key, inner) => (inner && typeof inner === 'object' && !Array.isArray(inner)
            ? Object.fromEntries(Object.keys(inner).sort().map(name => [name, inner[name]])) : inner));
    }

    /**
     * System.json's battle settings as the Database holds them unchanged: as
     * text, with the order of System's keys. Taken before the first change of
     * a Database session, and again after a save (Apply) made the changes the
     * state to compare with.
     */
    battleAsFound(system) {
        const E = DatabaseSystem1Editor, session = this.parentEditor?._databaseSession || 0, saved = this.parentEditor?._dataSnapshot;
        const found = this._battleFound;
        if (found && found.session === session && found.system === system && found.saved === saved) return found;
        const battle = system.reactorBattle, stored = battle !== undefined;
        return (this._battleFound = { session, system, saved, keys: Object.keys(system), stored,
            text: stored ? JSON.stringify(battle) : '', canonical: stored ? E.canonical(battle) : '',
            plain: !!battle && typeof battle === 'object' && E.isPlainBattle(battle) });
    }

    /**
     * After a change to the battle settings or the party size: settings that
     * say what `found` holds read exactly as they did (the same text, at the
     * same place among System's keys). The Database compares its data with
     * what it opened, as text, before it asks whether to drop changes: a
     * control set and set back is no change.
     */
    settleBattle(system, found) {
        const now = system.reactorBattle;
        if (found.stored && (now === undefined ? found.plain : DatabaseSystem1Editor.canonical(now) === found.canonical)) system.reactorBattle = JSON.parse(found.text);
        // A key taken out and put back stands at the end: every key goes back to where it was found.
        const keys = Object.keys(system);
        const order = found.keys.filter(key => key in system).concat(keys.filter(key => !found.keys.includes(key)));
        if (order.some((key, index) => key !== keys[index])) for (const key of order) { const value = system[key]; delete system[key]; system[key] = value; }
    }

    /**
     * Writes System.json › reactorBattle from the card: absent while it is
     * all default (Classic, team turns, isometric, the camera cutting on some
     * actions, the normal pace, the fallen getting up), or as the project
     * stored it when it stored the defaults.
     */
    writeBattleMode(container, system) {
        const found = this.battleAsFound(system);
        const mode = container.querySelector('.system-battle-mode')?.value || 'classic';
        const turns = container.querySelector('.system-battle-turns')?.value || 'team';
        // The cinematic camera for battles on the map: stored only where it differs from Some / slow motion on / skippable.
        const level = container.querySelector('.system-battle-cinematic')?.value || 'some';
        const slowMotion = container.querySelector('.system-battle-slowmo')?.checked !== false;
        const skip = system.reactorBattle?.cinematic?.skip !== false;
        const cinematic = level === 'some' && slowMotion && skip ? null
            : Object.assign({ level, slowMotion }, skip ? {} : { skip: false });
        // The tactical view: stored only when battles keep the map's own camera (isometric is the default).
        const view = container.querySelector('.system-battle-view')?.value === 'map' ? 'map' : '';
        // The pace the other side's turn starts at for a new player: stored only when it is not the normal one.
        const paceChoice = container.querySelector('.system-battle-pace')?.value;
        const pace = paceChoice === 'fast' || paceChoice === 'skip' ? paceChoice : '';
        // Those who fell in a battle won on the map get up unless the game keeps them down.
        const revive = container.querySelector('.system-battle-revive')?.checked !== false;
        // The card owns mode, turns, view, cinematic, pace and reviveAfterBattle; whatever else is there (terms, a stored partySize, hand-written keys) is kept.
        const battle = Object.assign({}, system.reactorBattle || {}, { mode, turns });
        if (view) battle.view = view; else delete battle.view;
        if (cinematic) battle.cinematic = cinematic; else delete battle.cinematic;
        if (pace) battle.pace = pace; else delete battle.pace;
        if (revive) delete battle.reviveAfterBattle; else battle.reviveAfterBattle = false;
        const plain = mode === 'classic' && turns === 'team' && Object.keys(battle).every(key => key === 'mode' || key === 'turns');
        if (plain) delete system.reactorBattle; else system.reactorBattle = battle;
        this.settleBattle(system, found);
        this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
    }

    /** Shows the rows of the modes in use: Tactical's once anything fights Tactical, the on-map rows once any battle is on the map. */
    refreshBattleRows(container) {
        const select = container.querySelector('.system-battle-mode');
        if (!select) return;
        const mode = select.value || 'classic', used = this.battleModesInUse(mode);
        container.querySelectorAll('.system-battle-mode-grid [data-tactical]').forEach(row => { row.hidden = !used.has('tactical'); });
        container.querySelectorAll('.system-battle-mode-grid [data-action]').forEach(row => { row.hidden = !used.has('action') && !used.has('firstPerson'); });
        container.querySelectorAll('.system-battle-mode-grid [data-on-map]').forEach(row => { row.hidden = used.size === 0; });
        const elsewhere = container.querySelector('.system-battle-mode-grid [data-tactical-elsewhere]');
        if (elsewhere) elsewhere.hidden = !used.has('tactical') || mode === 'tactical';
    }

    /**
     * Save and open Battle Setup: saves the Database as OK does, which closes
     * it, then opens the Battle Setup card over the open map and puts the
     * keyboard on it. Nothing opens when the save did not go through and the
     * Database stayed open.
     */
    async saveAndOpenBattleSetup() {
        if (this._openingBattleSetup) return false;
        const viewer = document.getElementById('database-viewer'), ok = document.getElementById('database-ok-btn');
        if (!viewer || !ok || typeof ok.onclick !== 'function' || !viewer.classList.contains('active')) return false;
        this._openingBattleSetup = true;
        try {
            await ok.onclick();
            if (viewer.classList.contains('active')) return false;
            // The closing Database hands the keyboard to the control that opened it: a key still held would press it.
            const held = document.activeElement;
            if (held && held !== document.body && typeof held.blur === 'function') held.blur();
            await new Promise(resolve => setTimeout(resolve, 0));
            const setup = typeof window !== 'undefined' ? window.RRBattleSetup : null;
            const opened = !!(setup && typeof setup.open === 'function' && setup.open());
            if (opened) DatabaseSystem1Editor.focusBattleSetup(setup);
            return opened;
        } finally {
            this._openingBattleSetup = false;
        }
    }

    /** Puts the keyboard on the open Battle Setup card: on the card itself, so Tab walks its controls and a held key presses nothing. */
    static focusBattleSetup(setup) {
        if (setup && typeof setup.focus === 'function') return setup.focus() !== false;
        const card = (setup && setup._state && setup._state.panel) || document.getElementById('rr-battle-setup');
        if (!card || typeof card.focus !== 'function') return false;
        if (typeof card.hasAttribute === 'function' && !card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
        card.focus({ preventScroll: true });
        return true;
    }

    /** Opens Database › System 1 with the Battles card in view, unfolded, and its mode list focused. */
    static openBattles() {
        const app = typeof window !== 'undefined' ? window.reactor : null;
        if (!app || typeof app.openDatabase !== 'function') return false;
        app.openDatabase('system1');
        setTimeout(() => {
            const card = document.querySelector('#database-detail .system-battles-card');
            if (!card) return;
            if (card.classList.contains('is-collapsed')) card.querySelector('.database-section-header')?.click();
            card.scrollIntoView({ block: 'center' });
            card.querySelector('.system-battle-mode')?.focus();
        }, 0);
        return true;
    }

    createColumn3(system) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const column = document.createElement('div');
        column.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

        // Row 1: Music
        const musicTypes = ['title', 'battle', 'victory', 'defeat', 'gameOver'];
        const musicLabels = ['Title', 'Battle', 'Victory', 'Defeat', 'Game Over'];

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
        const musicSection = this.keyedSection('music', tt('Music'), musicTable);
        column.appendChild(musicSection);

        // Row 2: Sound
        const soundLabels = RRSystemSoundSlotModal.SOUND_LABELS;

        let soundRows = '';
        RRSystemSoundSlotModal.SOUND_ORDER.forEach(idx => {
            const se = system.sounds?.[idx] || {};
            const variants = Array.isArray(se.variants) ? se.variants.length : 0;
            const range = RRSystemSoundSlotModal.pitchRange(se.pitchRandom);
            // A slot 24-25 a project has never written falls back to Recovery in
            // the runtime rather than playing nothing, so it must not read
            // `(None)` here -- that is the picked-and-blanked state, which really
            // is silent. Naming the slot it borrows from reuses a phrase the
            // catalog already carries in all 17 locales.
            const inheritsRecovery = (idx === 24 || idx === 25) && !system.sounds?.[idx];
            const shownName = inheritsRecovery ? `(${tt('Recovery')})` : (se.name || tt('(None)'));
            const details = `${shownName}${variants ? ` +${variants}` : ''}${range ? `  P${range.min}-${range.max}` : ''}`;
            soundRows += `
                <tr class="sound-row" data-sound-index="${idx}" style="cursor: pointer;">
                    <td>${tt(soundLabels[idx])}</td>
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
        const soundSection = this.keyedSection('sound', tt('Sound'), soundTable);
        column.appendChild(soundSection);

        return column;
    }

    /** A card that is named for the folding of the page's sections: `key` is the same in every language. */
    keyedSection(key, title, content) {
        return this.createSection(title, content, key);
    }

    createSection(title, content, key = '') {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.innerHTML = `
            <div class="database-section-header"${key ? ` data-section-key="${key}"` : ''}>${title}</div>
            <div class="database-section-content">
                ${content}
            </div>
        `;
        return section;
    }

    /**
     * How the party's followers walk, the game's own setting (System.json
     * `reactorParty: { formation, spacing, straggle }`): a formation, the
     * tiles between members and how late and unevenly they follow. A single
     * file at 1 tile with no straggle is the stock walk and stores nothing.
     */
    followerFormationRows(system) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        if (typeof FollowerCommandEditor === 'undefined') return '';
        const F = FollowerCommandEditor, party = system.reactorParty || {};
        const formation = F.FORMATIONS.some(([key]) => key === party.formation) ? party.formation : 'file';
        const spacing = Math.max(1, Math.min(4, Math.floor(Number(party.spacing)) || 1));
        const straggle = Math.max(0, Math.min(100, Math.floor(Number(party.straggle)) || 0));
        return `<div class="rr-battle-toolbar system-follower-formation">
            <span class="system-follower-picture" style="flex:0 0 auto;line-height:0;">${F.picture(formation, 44, 56)}</span>
            <label class="rr-battle-field">${tt('Follower Formation')}
                <select id="system-follower-formation" class="database-field-value">${F.FORMATIONS.map(([key, label]) => `<option value="${key}"${key === formation ? ' selected' : ''}>${rrEscapeHtml(tt(label))}</option>`).join('')}</select>
            </label>
            <label class="rr-battle-field">${tt('Spacing')}
                <select id="system-follower-spacing" class="database-field-value">${[1, 2, 3, 4].map(n => `<option value="${n}"${n === spacing ? ' selected' : ''}>${rrEscapeHtml(F.tiles(n))}</option>`).join('')}</select>
            </label>
            <label class="rr-battle-field">${tt('Straggle')} (%)
                <input id="system-follower-straggle" type="number" min="0" max="100" step="5" class="database-field-value" style="width:76px" value="${straggle}">
            </label>
        </div>`;
    }

    wireFollowerFormation(container, system) {
        const formation = container.querySelector('#system-follower-formation');
        const spacing = container.querySelector('#system-follower-spacing');
        const straggle = container.querySelector('#system-follower-straggle');
        if (!formation || !spacing || !straggle) return;
        const write = () => {
            const party = {
                formation: formation.value,
                spacing: Math.max(1, Math.min(4, Math.floor(Number(spacing.value)) || 1)),
                straggle: Math.max(0, Math.min(100, Math.floor(Number(straggle.value)) || 0))
            };
            straggle.value = String(party.straggle);
            // The stock walk is the absence of the setting.
            if (party.formation === 'file' && party.spacing === 1 && party.straggle === 0) delete system.reactorParty;
            else system.reactorParty = party;
            const picture = container.querySelector('.system-follower-picture');
            if (picture) picture.innerHTML = FollowerCommandEditor.picture(party.formation, 44, 56);
            this.databaseManager.mutationGeneration++;
        };
        for (const control of [formation, spacing, straggle]) control.addEventListener('change', write);
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
                // One actor is one Game_Actor: listed twice, the game would put the same battler in two slots.
                if (actorId && !(system.partyMembers || []).includes(actorId)) {
                    if (!system.partyMembers) system.partyMembers = [];
                    system.partyMembers.push(actorId);
                    refreshParty();
                }
            });
        }
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
        this.commonUI?.databaseEditor?.registerDetailModal(overlay);
    }

    updateSystemField(fieldName, value) {
        const system = this.databaseManager.getSystem();
        if (!system) return;

        system[fieldName] = value;
        console.debug(`Updated system field ${fieldName} to:`, value);
    }

    /**
     * The game's own screen size, so a title preview is cropped and letterboxed
     * the way the running game would crop and letterbox it.
     */
    gameResolution(system) {
        const advanced = system?.advanced || {};
        const width = Number(advanced.screenWidth);
        const height = Number(advanced.screenHeight);
        return {
            width: Number.isFinite(width) && width > 0 ? width : 816,
            height: Number.isFinite(height) && height > 0 ? height : 624
        };
    }

    /**
     * Stack the two title layers the way Scene_Title stacks them.
     *
     * The upper layer is an overlay -- a frame, a logo, a vignette -- and an
     * overlay is only judged against what it sits on, so the row pair is
     * followed by the composite rather than by two separate thumbnails.
     */
    renderTitlePreview(container, system) {
        const box = container.querySelector('.system-title-preview');
        if (!box) return;
        box.replaceChildren();

        const { width, height } = this.gameResolution(system);
        box.style.aspectRatio = `${width} / ${height}`;

        const project = this.projectManager.getCurrentProject();
        if (!project?.path) return;
        const path = require('path');

        for (const layer of [1, 2]) {
            const name = system[`title${layer}Name`] || '';
            if (!name) continue;
            const url = RRAssetFiles.imageUrlFor(path.join(project.path, 'img', `titles${layer}`), name);
            if (!url) continue;
            const image = document.createElement('img');
            image.src = url;
            image.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;';
            box.appendChild(image);
        }
    }

    /**
     * Choose one of the two title screen layers.
     *
     * Scene_Title draws img/titles1 and then img/titles2 over it, so the
     * preview is the composite: the layer being edited swaps live while the
     * other one stays put beneath or above it. Either layer may be empty --
     * `(None)` leads the list -- because ImageManager.loadBitmap answers an
     * empty name with the empty bitmap.
     */
    showTitleImagePicker(system, layer = 1) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const path = require('path');

        const project = this.projectManager.getCurrentProject();
        if (!project) {
            RRDialog.alert(tt('No project loaded'), { title: tt('System 1'), kind: 'warning' });
            return;
        }

        const edited = layer === 2 ? 2 : 1;
        const other = edited === 1 ? 2 : 1;
        const field = `title${edited}Name`;
        const folder = `titles${edited}`;
        const titlesPath = path.join(project.path, 'img', folder);

        // A project with no img/titles2 art is an ordinary project, so a
        // missing or empty folder is an empty list rather than a dead end.
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
        const layerName = edited === 1 ? tt('Lower Layer:') : tt('Upper Layer:');
        header.innerHTML = `
            <div style="font-size: 16px; font-weight: 600; color: var(--color-text);">${rrEscapeHtml(`${tt('Select Title Image')} — ${layerName.replace(/:$/, '')}`)}</div>
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

        // Both layers share one box, so they line up here the way the title
        // screen lines them up, at the game's own aspect ratio.
        const resolution = this.gameResolution(system);
        const stage = document.createElement('div');
        stage.style.cssText = `
            position: relative;
            width: 100%;
            max-width: 640px;
            aspect-ratio: ${resolution.width} / ${resolution.height};
            border: 1px solid var(--color-border);
            background-color: var(--color-bg-surface);
        `;

        const layerImage = () => {
            const image = document.createElement('img');
            image.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;';
            image.style.display = 'none';
            return image;
        };
        const lowerImage = layerImage();
        const upperImage = layerImage();
        stage.appendChild(lowerImage);
        stage.appendChild(upperImage);
        const editedImage = edited === 1 ? lowerImage : upperImage;
        const otherImage = edited === 1 ? upperImage : lowerImage;

        const otherName = system[`title${other}Name`] || '';
        const otherUrl = otherName
            ? RRAssetFiles.imageUrlFor(path.join(project.path, 'img', `titles${other}`), otherName)
            : '';
        if (otherUrl) {
            otherImage.src = otherUrl;
            otherImage.style.display = '';
        }

        const previewLabel = document.createElement('div');
        previewLabel.style.cssText = `
            margin-top: 12px;
            color: var(--color-text-muted);
            font-size: 12px;
            text-align: center;
        `;
        previewLabel.textContent = tt('Preview');

        previewPanel.appendChild(stage);
        previewPanel.appendChild(previewLabel);

        let selectedFile = system[field] || '';

        const updatePreview = (fileName) => {
            selectedFile = fileName || '';
            const imageUrl = selectedFile ? RRAssetFiles.imageUrlFor(titlesPath, fileName) : '';
            if (!imageUrl) {
                editedImage.removeAttribute('src');
                editedImage.style.display = 'none';
                previewLabel.textContent = selectedFile ? tt('No preview') : tt('No image selected');
                return;
            }
            editedImage.style.display = '';
            editedImage.src = imageUrl;
            previewLabel.textContent = selectedFile;
        };

        const browser = RRPickerIndex.createBrowser({
            files,
            selectedName: selectedFile,
            // Same folder tree the audio, effect and character pickers use, so
            // a titles subfolder reads as a folder rather than as a prefix.
            folders: true,
            searchPlaceholder: tt('Search files...'),
            emptyText: `${tt('No files found in:')} img/${folder}`,
            onSelect: updatePreview,
            // Clearing a layer is the same kind of choice as picking one, and
            // the upper layer is cleared often enough to need the option.
            // createBrowser clears its own selection before calling this.
            leadingItem: {
                label: tt('(None)'),
                onClick: () => updatePreview('')
            }
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
            system[field] = selectedFile;
            close();

            const detailEl = document.getElementById('database-detail');
            if (detailEl) {
                detailEl.innerHTML = '';
                this.showSystem1Detail(detailEl);
            }

            console.debug(`Updated ${field} to:`, selectedFile);
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
        this.commonUI?.databaseEditor?.registerDetailModal(overlay);
    }

    showMusicPicker(system, musicType) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const path = require('path');
        const fs = require('fs');

        const project = this.projectManager.getCurrentProject();
        if (!project) {
            RRDialog.alert(tt('No project loaded'), { title: tt('System 1'), kind: 'warning' });
            return;
        }

        const bgmPath = path.join(project.path, 'audio', 'bgm');
        const mePath = path.join(project.path, 'audio', 'me');

        // Determine which folder to use based on music type
        const audioPath = ['victory', 'defeat', 'gameOver'].includes(musicType) ? mePath : bgmPath;
        const folderName = ['victory', 'defeat', 'gameOver'].includes(musicType) ? 'ME' : 'BGM';

        if (!fs.existsSync(audioPath)) {
            RRDialog.alert(`${folderName} ${tt('folder not found')}`, { title: tt('System 1'), kind: 'warning' });
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
            RRDialog.alert(tt('No project loaded'), { title: tt('System 1'), kind: 'warning' });
            return;
        }

        const sePath = path.join(project.path, 'audio', 'se');

        if (!fs.existsSync(sePath)) {
            RRDialog.alert(tt('SE folder not found'), { title: tt('System 1'), kind: 'warning' });
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
