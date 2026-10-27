/**
 * EventPageEditor - Handles rendering of individual event page configuration
 * Manages conditions, image, autonomous movement, priority, and trigger settings
 */
class EventPageEditor {
    constructor(databaseManager, projectController, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.parentEditor = parentEditor;
        this.switchVariablePicker = new SwitchVariablePicker(databaseManager, projectController);
    }

    _t(key, params = {}) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.t(key, params) : key;
    }

    /** A phrase rather than a key, for the strings that have no key of their own. */
    /** The picked frame in the picker's own words ("Character 4 · Left · Frame 2"), counted from 1 as a person counts. */
    frameWords(image, directionName) {
        const params = { index: (Number(image.characterIndex) || 0) + 1, direction: this._tt(directionName), frame: (Number(image.pattern) || 0) + 1 };
        const single = typeof RRAssetFiles !== 'undefined' && RRAssetFiles.isBigCharacter && RRAssetFiles.isBigCharacter(image.characterName || '');
        const words = this._tt(single ? '{direction} · Frame {frame}' : 'Character {index} · {direction} · Frame {frame}');
        return words.replace(/\{(\w+)\}/g, (token, key) => (Object.hasOwn(params, key) ? String(params[key]) : token));
    }

    _tt(text) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text;
    }

    /**
     * Render the complete page configuration
     */
    renderPageConfiguration(container, page, pageIndex) {
        container.innerHTML = '';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '4px';
        container.style.overflow = 'hidden';

        // Options, Priority and Trigger stay in view at any height: the sections above them scroll on their own.
        const settings = document.createElement('div');
        settings.className = 'event-page-settings rr-accent-scrollbar';
        settings.style.cssText = 'display: flex; flex-direction: column; gap: 4px; flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;';
        container.appendChild(settings);

        // Conditions Section (full width)
        const conditionsSection = this.createConditionsSection(page, pageIndex);
        conditionsSection.style.flexShrink = '0';
        settings.appendChild(conditionsSection);

        // Image Section (full width): a picture takes the height there is; an empty box stays small.
        const imageSection = this.createImageSection(page, pageIndex);
        imageSection.style.overflow = 'hidden';
        this._sizeImageSection(imageSection);
        settings.appendChild(imageSection);

        // Autonomous Movement Section (full width)
        const movementSection = this.createMovementSection(page, pageIndex);
        movementSection.style.flexShrink = '0';
        settings.appendChild(movementSection);

        // Row: Options + (Priority + Trigger stacked)
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 6px; flex-shrink: 0;';

        const optionsSection = this.createOptionsSection(page, pageIndex);
        optionsSection.style.flex = '1';
        row.appendChild(optionsSection);

        // Priority and Trigger stacked in right column
        const priorityTriggerColumn = document.createElement('div');
        priorityTriggerColumn.className = 'event-priority-trigger';
        priorityTriggerColumn.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 4px;';
        const prioritySection = this.createPrioritySection(page, pageIndex);
        const triggerSection = this.createTriggerSection(page, pageIndex);
        priorityTriggerColumn.appendChild(prioritySection);
        priorityTriggerColumn.appendChild(triggerSection);
        row.appendChild(priorityTriggerColumn);

        container.appendChild(row);
    }

    /**
     * Create Conditions section
     */
    createConditionsSection(page, pageIndex) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'event-section conditions-section';
        section.style.backgroundColor = 'var(--color-bg-input)';
        section.style.padding = '6px';
        section.style.borderRadius = '4px';

        const conditions = page.conditions || {};

        // Get switches and variables for dropdowns
        const systemData = this.databaseManager.getSystem() || {};

        // Convert switches and variables arrays to objects with id and name
        const switches = (systemData.switches || []).map((name, index) => {
            if (index === 0) return null; // Skip index 0
            return { id: index, name: name || `${tt('Switch')} ${String(index).padStart(4, '0')}` };
        }).filter(item => item !== null);

        const variables = (systemData.variables || []).map((name, index) => {
            if (index === 0) return null; // Skip index 0
            return { id: index, name: name || `${tt('Variable')} ${String(index).padStart(4, '0')}` };
        }).filter(item => item !== null);

        const items = this.databaseManager.getItems() || [];
        const actors = this.databaseManager.getActors() || [];

        section.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">${this._t('event.conditions')}</div>

            <!-- Switch 1 -->
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; min-width: 0;">
                <input type="checkbox"
                       class="condition-checkbox"
                       data-field="switch1Valid"
                       data-page-index="${pageIndex}"
                       ${conditions.switch1Valid ? 'checked' : ''}>
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">${this._t('event.switch1')}</label>
                <button class="switch-picker-btn"
                        data-field="switch1Id"
                        data-page-index="${pageIndex}"
                        style="flex: 1; min-width: 0; padding: 5px 8px; font-size: 11px; text-align: left; min-height: 24px;"
                        ${!conditions.switch1Valid ? 'disabled' : ''}>
                    #${String(conditions.switch1Id || 1).padStart(4, '0')}: ${rrEscapeHtml(switches.find(s => s.id === (conditions.switch1Id || 1))?.name || `${tt('Switch')} 0001`)}
                </button>
            </div>

            <!-- Switch 2 -->
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; min-width: 0;">
                <input type="checkbox"
                       class="condition-checkbox"
                       data-field="switch2Valid"
                       data-page-index="${pageIndex}"
                       ${conditions.switch2Valid ? 'checked' : ''}>
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">${this._t('event.switch2')}</label>
                <button class="switch-picker-btn"
                        data-field="switch2Id"
                        data-page-index="${pageIndex}"
                        style="flex: 1; min-width: 0; padding: 5px 8px; font-size: 11px; text-align: left; min-height: 24px;"
                        ${!conditions.switch2Valid ? 'disabled' : ''}>
                    #${String(conditions.switch2Id || 1).padStart(4, '0')}: ${rrEscapeHtml(switches.find(s => s.id === (conditions.switch2Id || 1))?.name || `${tt('Switch')} 0001`)}
                </button>
            </div>

            <!-- Variable -->
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; min-width: 0;">
                <input type="checkbox"
                       class="condition-checkbox"
                       data-field="variableValid"
                       data-page-index="${pageIndex}"
                       ${conditions.variableValid ? 'checked' : ''}>
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">${tt('Variable')}:</label>
                <button class="variable-picker-btn"
                        data-field="variableId"
                        data-page-index="${pageIndex}"
                        style="flex: 1; min-width: 0; padding: 5px 8px; font-size: 11px; text-align: left; min-height: 24px;"
                        ${!conditions.variableValid ? 'disabled' : ''}>
                    #${String(conditions.variableId || 1).padStart(4, '0')}: ${rrEscapeHtml(variables.find(v => v.id === (conditions.variableId || 1))?.name || `${tt('Variable')} 0001`)}
                </button>
                <span style="flex-shrink: 0; font-size: 12px; color: var(--color-text-muted);" data-rr-i18n-skip>&ge;</span>
                <input type="number"
                       class="condition-input"
                       data-field="variableValue"
                       data-page-index="${pageIndex}"
                       value="${conditions.variableValue || 0}"
                       style="width: 70px; flex-shrink: 0; padding: 4px 6px; font-size: 11px;"
                       ${!conditions.variableValid ? 'disabled' : ''}>
            </div>

            <!-- Self Switch -->
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; min-width: 0;">
                <input type="checkbox"
                       class="condition-checkbox"
                       data-field="selfSwitchValid"
                       data-page-index="${pageIndex}"
                       ${conditions.selfSwitchValid ? 'checked' : ''}>
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">${this._t('event.selfSwitch')}</label>
                <select class="condition-select"
                        data-field="selfSwitchCh"
                        data-page-index="${pageIndex}"
                        style="flex: 1; min-width: 0; padding: 3px; font-size: 11px;"
                        ${!conditions.selfSwitchValid ? 'disabled' : ''}>
                    <option value="" ${!conditions.selfSwitchValid ? 'selected' : ''}></option>
                    ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(ch => `<option value="${ch}" ${conditions.selfSwitchCh === ch ? 'selected' : ''}>${ch}</option>`).join('')}
                </select>
            </div>

            <!-- Item -->
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; min-width: 0;">
                <input type="checkbox"
                       class="condition-checkbox"
                       data-field="itemValid"
                       data-page-index="${pageIndex}"
                       ${conditions.itemValid ? 'checked' : ''}>
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">${this._t('event.item')}</label>
                <select class="condition-select"
                        data-field="itemId"
                        data-page-index="${pageIndex}"
                        style="flex: 1; min-width: 0; padding: 3px; font-size: 11px;"
                        ${!conditions.itemValid ? 'disabled' : ''}>
                    <option value="" disabled hidden></option>
                    ${this.generateOptionsFromArray(items, conditions.itemId || 1)}
                </select>
            </div>

            <!-- Actor -->
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; min-width: 0;">
                <input type="checkbox"
                       class="condition-checkbox"
                       data-field="actorValid"
                       data-page-index="${pageIndex}"
                       ${conditions.actorValid ? 'checked' : ''}>
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">${this._t('event.actor')}</label>
                <select class="condition-select"
                        data-field="actorId"
                        data-page-index="${pageIndex}"
                        style="flex: 1; min-width: 0; padding: 3px; font-size: 11px;"
                        ${!conditions.actorValid ? 'disabled' : ''}>
                    <option value="" disabled hidden></option>
                    ${this.generateOptionsFromArray(actors, conditions.actorId || 1)}
                </select>
            </div>
        `;

        section.appendChild(this.createFightHookRow(page));

        // Add event listeners
        this.attachConditionListeners(section);

        return section;
    }

    /**
     * The battle row in Conditions: the page runs when its moment in a battle
     * on the map comes (runtime/reactor_fight.js), on top of the conditions
     * above. Stored as `page.rrFightHook`; "Never" removes it.
     */
    /**
     * A battle hook as the page stores it, from the row's controls: the moment
     * (`on`) and only the fields that moment has. `fields` holds what the
     * controls show: `{ turn, team, unit, region }`, each as typed.
     */
    static hookValue(on, fields = {}) {
        if (!on) return null;
        const hook = { on };
        const sides = ['any', 'ally', 'enemy'];
        if (on === 'turnStart' || on === 'turnEnd') {
            hook.turn = Math.max(0, Math.floor(Number(fields.turn) || 0));
            hook.team = sides.includes(fields.team) ? fields.team : 'any';
        } else if (on === 'unitDefeated') {
            hook.unit = ['any', 'ally', 'enemy', 'this'].includes(fields.unit) ? fields.unit : 'any';
        } else if (on === 'unitEnters') {
            hook.region = Math.max(1, Math.floor(Number(fields.region) || 1));
            hook.team = sides.includes(fields.team) ? fields.team : 'any';
        }
        return hook;
    }

    createFightHookRow(page) {
        const tt = text => this._tt(text);
        const hook = page.rrFightHook || null;
        const on = hook ? hook.on : '';
        const row = document.createElement('div');
        row.className = 'event-fight-hook';
        row.title = tt('Runs when its battle moment comes; it is never the page the event shows.');
        const choices = [['battleStart', 'When the battle starts'], ['turnStart', 'When a turn starts'], ['turnEnd', 'When a turn ends'],
            ['unitDefeated', 'When a unit is defeated'], ['unitEnters', 'When a unit steps on a region']];
        const plain = (value, label, current) => `<option value="${value}"${String(value) === String(current) ? ' selected' : ''}>${rrEscapeHtml(label)}</option>`;
        const option = (value, label, current) => plain(value, tt(label), current);
        row.innerHTML = `
            <label class="event-fight-hook-label">${rrEscapeHtml(tt('Runs during a battle'))}</label>
            <select class="event-fight-hook-on">${plain('', this._t('event.hookNever'), on)}${choices.map(([v, l]) => option(v, l, on)).join('')}</select>
            <span class="event-fight-hook-more"></span>
            <div class="event-fight-hook-note" hidden>${rrEscapeHtml(row.title)}</div>`;
        const more = row.querySelector('.event-fight-hook-more');
        const select = row.querySelector('.event-fight-hook-on');
        const team = current => `<select class="event-fight-hook-team">${[['any', 'Any side'], ['ally', 'Allies'], ['enemy', 'Enemies']].map(([v, l]) => option(v, l, current)).join('')}</select>`;
        const words = text => `<span class="event-fight-hook-words">${rrEscapeHtml(text)}</span>`;
        const note = row.querySelector('.event-fight-hook-note');
        const fill = () => {
            const h = page.rrFightHook || {};
            // What choosing one means, in words, once one is chosen.
            note.hidden = !h.on;
            if (h.on === 'turnStart' || h.on === 'turnEnd') {
                more.innerHTML = `${words(this._t('event.hookTurn'))}<input type="number" class="event-fight-hook-turn" min="0" max="999" step="1" value="${Number(h.turn) || 0}">${words(tt('(0: every turn)'))}${team(h.team || 'any')}`;
            } else if (h.on === 'unitDefeated') {
                more.innerHTML = `<select class="event-fight-hook-unit">${[['any', 'Any unit'], ['ally', 'An ally'], ['enemy', 'An enemy'], ['this', 'This unit']].map(([v, l]) => option(v, l, h.unit || 'any')).join('')}</select>`;
            } else if (h.on === 'unitEnters') {
                more.innerHTML = `${words(this._t('event.hookRegion'))}<input type="number" class="event-fight-hook-region" min="1" max="255" step="1" value="${Number(h.region) || 1}">${team(h.team || 'any')}`;
            } else {
                more.innerHTML = '';
            }
            const write = () => {
                const value = name => { const control = more.querySelector('.event-fight-hook-' + name); return control ? control.value : undefined; };
                const next = EventPageEditor.hookValue(select.value, { turn: value('turn'), team: value('team'), unit: value('unit'), region: value('region') });
                page.rrFightHook = next;
            };
            more.querySelectorAll('input, select').forEach(control => control.addEventListener('change', write));
        };
        select.addEventListener('change', () => {
            if (!select.value) delete page.rrFightHook;
            else page.rrFightHook = { on: select.value };
            fill();
        });
        fill();
        return row;
    }

    vehicleModelSpec(pageIndex) {
        if (this.pageModelSpec(pageIndex) || typeof RRVehicles === 'undefined') return null;
        const event = this.parentEditor.currentEvent, image = event?.pages?.[pageIndex]?.image;
        if (image?.characterName || image?.tileId > 0) return null;
        return RRVehicles.modelOf(event, this.databaseManager.data.vehicles);
    }

    /**
     * Create Image section
     */
    createImageSection(page, pageIndex) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'event-section image-section';
        const image = page.image || {};
        const model = this.pageModelSpec(pageIndex);
        const use3d = !!(model && model.name);
        // An event that is a vehicle (the Vehicle row) wears the vehicle's own model on a page that gives it none.
        const worn = use3d ? null : this.vehicleModelSpec(pageIndex);
        section.style.backgroundColor = 'var(--color-bg-input)';
        section.style.padding = '4px';
        section.style.borderRadius = '4px';
        section.style.display = 'flex';
        section.style.flexDirection = 'column';
        section.style.minHeight = '0';

        // Get direction name
        const directionNames = { 2: 'Down', 4: 'Left', 6: 'Right', 8: 'Up' };
        const directionName = directionNames[image.direction] || 'Down';
        // A sheet of eight characters names the one used beside the file, in brackets: not part of the file name.
        const sheetCharacter = !use3d && !worn && image.characterName && !(typeof RRAssetFiles !== 'undefined' && RRAssetFiles.isBigCharacter && RRAssetFiles.isBigCharacter(image.characterName))
            ? ` (${tt('Character')} ${(Number(image.characterIndex) || 0) + 1})` : '';
        const displayName = use3d ? model.name + (model.variant ? ' · ' + model.variant : '') : worn ? worn.name : (image.characterName || '') + sheetCharacter;
        const title = use3d ? tt('3D Model') : worn ? tt('3D Model') : this._t('event.image');

        section.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; flex-shrink: 0;">
                <div style="font-weight: bold; font-size: 13px;">${title}</div>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: normal;">
                    <input type="checkbox" class="image-3d-checkbox" data-page-index="${pageIndex}" ${use3d || worn ? 'checked' : ''} ${worn ? `disabled title="${rrEscapeHtml(this._t('vehicle.inherited'))}"` : ''}>
                    ${tt('3D')}
                </label>
            </div>

            <div style="display: flex; flex-direction: column; gap: 3px;flex:1;min-height:0;">
                <div class="image-preview-box" style="background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 4px; overflow: hidden; width: 100%;flex:1;min-height:88px;">
                    <canvas class="character-preview-canvas"
                            width="192"
                            height="88"
                            style="image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; display: block; width: 100%; height: 100%; object-fit: contain;"></canvas>
                </div>

                <div style="display: flex; align-items: center; gap: 4px; min-width: 0; flex-shrink: 0;">
                    <button class="image-browse-button rr-btn-browse"
                            data-page-index="${pageIndex}">${this._t('event.browse')}</button>
                    <input type="text"
                           class="image-input image-name-display"
                           data-field="characterName"
                           data-page-index="${pageIndex}"
                           value="${rrEscapeHtml(displayName)}"
                           placeholder="${this._t('event.none')}"
                           readonly
                           style="flex: 1; min-width: 0; padding: 3px 6px; background: var(--color-bg-surface); color: var(--color-text); border: 1px solid var(--color-border-input); font-size: 11px;">
                </div>

                <div style="font-size: 10px; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;">
                    ${use3d
                        ? `${tt('Model size')} <strong style="color: var(--color-text);">${model.size || 2}</strong>
                            <span style="margin-left:6px;">${this._t('event.dir')}</span>
                            ${[2, 4, 6, 8].map(dir => {
                                const label = { 2: 'Down', 4: 'Left', 6: 'Right', 8: 'Up' }[dir];
                                const on = (image.direction || 2) === dir;
                                return `<button type="button" class="image-dir-btn" data-dir="${dir}"
                                    style="margin-left:3px;padding:1px 5px;font-size:10px;border-radius:3px;cursor:pointer;border:1px solid ${on ? 'var(--color-accent-bright)' : 'var(--color-border-input)'};background:${on ? 'var(--color-accent-tint-30)' : 'var(--color-bg-surface)'};color:var(--color-text);">${tt(label)}</button>`;
                            }).join('')}`
                        : ''}
                </div>
                ${use3d || worn ? '' : this.imageTurnRow(page, pageIndex, directionName)}
            </div>
        `;

        // Add event listeners
        this.attachImageListeners(section, page, pageIndex);

        // Render character preview
        this.renderCharacterPreview(section, page);

        return section;
    }

    /**
     * Render character preview canvas
     */
    renderCharacterPreview(section, page) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        let image = page.image;
        const canvas = section.querySelector('.character-preview-canvas');
        if (!canvas) return;

        // Clear any existing animation interval. The instance-level handle
        // covers re-renders that build a NEW canvas — the discarded canvas's
        // interval would otherwise run (and pin the canvas + sheet image)
        // forever.
        if (this._previewAnimInterval) {
            clearInterval(this._previewAnimInterval);
            this._previewAnimInterval = null;
        }
        if (canvas.animationInterval) {
            clearInterval(canvas.animationInterval);
            canvas.animationInterval = null;
        }

        this._disposeModelPreview();
        // A model preview sizes itself (watchSize); a picture is drawn again for the new size.
        this._redrawOnResize(canvas, () => {
            if (this._modelPreviewRenderer && this._modelPreviewRenderer.domElement === canvas) return;
            this.renderCharacterPreview(section, page);
        });

        const row = RRVehicles.vehicleOf(this.parentEditor.currentEvent);
        const sheet = row && this.databaseManager.data.vehicles?.[row.type]?.sheet;
        const currentMap = this.parentEditor.currentMap || window.reactor?.eventManager?.currentMap;
        const flat = currentMap && !window.Reactor3D?.isMap3D?.(currentMap) && !/<3d>/i.test(currentMap.note || '');
        const inheritedSprite = !image.characterName && !image.tileId && sheet?.characterName;
        if (inheritedSprite && flat) image = {...image,...sheet};
        const model = this.pageModelSpec(this.parentEditor.currentPageIndex) || (flat && inheritedSprite ? null : this.vehicleModelSpec(this.parentEditor.currentPageIndex));
        if (model && model.name) {
            this._showUnitLookNote(canvas, this.vehicleModelSpec(this.parentEditor.currentPageIndex) ? this._t('vehicle.inherited') : '');
            this._renderModelPreview(canvas, model, page);
            return;
        }

        const fit = () => this._fitPreviewCanvas(canvas);

        // A unit with no picture or model of its own stands as its record's look.
        const look = EventPageEditor.showsUnitLook(image, model) ? this.unitLook(this.parentEditor.currentPageIndex) : null;
        this._showUnitLookNote(canvas, look ? look.note : '');
        if (look && look.kind === 'model') {
            this._renderModelPreview(canvas, look.spec, page);
            return;
        }
        if (look && look.kind === 'character') {
            image = Object.assign({}, image, { characterName: look.characterName, characterIndex: look.characterIndex || 0 });
        } else if (look) {
            requestAnimationFrame(() => {
                if (canvas.isConnected) this._drawUnitLook(canvas, fit(), look);
            });
            return;
        }

        console.log('renderCharacterPreview - image data:', image);
        console.log('renderCharacterPreview - tileId:', image.tileId);

        // Check if this is a tileset graphic (tileId > 0)
        if (image.tileId && image.tileId > 0) {
            console.log('Rendering tileset preview for tileId:', image.tileId);
            requestAnimationFrame(() => {
                if (!canvas.isConnected) return;
                this.renderTilesetPreview(canvas, fit(), image.tileId);
            });
            return;
        }

        if (!image.characterName) {
            requestAnimationFrame(() => {
                if (!canvas.isConnected) return;
                const ctx = fit();
                ctx.fillStyle = '#3e3e42';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#999';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(tt('No Character'), canvas.width / 2, canvas.height / 2);
            });
            return;
        }

        const currentProject = this.projectController.getCurrentProject ? this.projectController.getCurrentProject() : this.projectController.currentProject;
        if (!currentProject) return;

        const img = new Image();
        const path = require('path');
        const imgPath = RRAssetFiles.imageUrlFor(
            path.join(currentProject.path, 'img', 'characters'), image.characterName);

        console.log('Loading character preview:', imgPath);

        img.onload = () => {
            if (!canvas.isConnected) return;
            const ctx = fit();
            const shouldAnimate = page.stepAnime; // Check stepping animation option
            // Check if this is a big character ($ or !$ prefix)
            const isBigCharacter = RRAssetFiles.isBigCharacter(image.characterName);

            let characterWidth, characterHeight, baseX, baseY;

            // Direction mapping: 2=down, 4=left, 6=right, 8=up
            const directionRow = { 2: 0, 4: 1, 6: 2, 8: 3 };
            const dirRow = directionRow[image.direction] || 0;

            if (isBigCharacter) {
                // Big characters: 3 frames x 4 directions
                characterWidth = img.width / 3;
                characterHeight = img.height / 4;
                baseX = 0;
                baseY = dirRow * characterHeight;
            } else {
                // Normal sprites: 8 characters (4x2 grid), 3 frames x 4 directions each
                characterWidth = img.width / 12; // 3 frames * 4 columns
                characterHeight = img.height / 8; // 4 directions * 2 rows

                const charCol = (image.characterIndex || 0) % 4;
                const charRow = Math.floor((image.characterIndex || 0) / 4);

                baseX = charCol * 3 * characterWidth;
                baseY = (charRow * 4 + dirRow) * characterHeight;
            }

            // Calculate display size - fill entire canvas
            ctx.imageSmoothingEnabled = false;
            const scale = Math.min(canvas.width / characterWidth, canvas.height / characterHeight);
            const drawWidth = characterWidth * scale;
            const drawHeight = characterHeight * scale;
            const drawX = (canvas.width - drawWidth) / 2;
            const drawY = (canvas.height - drawHeight) / 2;

            // Function to draw a specific frame
            const drawFrame = (framePattern) => {
                const sourceX = baseX + framePattern * characterWidth;
                const sourceY = baseY;

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(
                    img,
                    sourceX, sourceY,
                    characterWidth, characterHeight,
                    drawX, drawY,
                    drawWidth, drawHeight
                );
            };

            if (shouldAnimate) {
                // Animation frames: 1-0-1-2 pattern (standing-left-standing-right)
                const frames = [1, 0, 1, 2];
                let frameIndex = 0;

                const animate = () => {
                    // Self-stop once the canvas leaves the DOM, whatever
                    // rebuilt or closed the surrounding editor.
                    if (!canvas.isConnected) {
                        if (this._previewAnimInterval === canvas.animationInterval) {
                            this._previewAnimInterval = null;
                        }
                        clearInterval(canvas.animationInterval);
                        canvas.animationInterval = null;
                        return;
                    }
                    drawFrame(frames[frameIndex]);
                    frameIndex = (frameIndex + 1) % frames.length;
                };

                // Start animation at ~8 FPS
                canvas.animationInterval = setInterval(animate, 125);
                this._previewAnimInterval = canvas.animationInterval;
                animate(); // Draw first frame immediately
            } else {
                // Static - just draw the selected pattern
                drawFrame(image.pattern || 0);
            }
        };

        img.onerror = () => {
            if (!canvas.isConnected) return;
            const failed = fit();
            failed.fillStyle = '#3e3e42';
            failed.fillRect(0, 0, canvas.width, canvas.height);
            failed.fillStyle = '#f88';
            failed.font = '10px Arial';
            failed.textAlign = 'center';
            failed.fillText(tt('Error Loading'), canvas.width / 2, canvas.height / 2);
        };

        img.src = imgPath;
    }

    /**
     * The controls under the page's picture, in one row that wraps where it is narrow: the frame it
     * starts on (Direction, and Frame 1-3, or 1-N for an [NF] sheet; stored as MZ's pattern, 0-based), then
     * the picture's own turn: Mirror (faces the other way), Flip (upside
     * down) and Rotation (a listed angle or any typed one, in place about its
     * middle). The turn is stored as `page.rrImage = { mirror, flip, angle, pivot }`;
     * all off removes it, so a plain page stays plain MZ data. A page with no
     * picture shows none of them.
     */
    imageTurnRow(page, pageIndex, directionName) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const image = page.image || {};
        if (!image.characterName && !(image.tileId > 0)) return '';
        const turn = page.rrImage || {};
        const field = 'padding:0 2px;height:20px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;font-size:11px;';
        const option = (value, label, current) => `<option value="${value}"${Number(value) === Number(current) ? ' selected' : ''}>${rrEscapeHtml(label)}</option>`;
        let first;
        if (image.characterName) {
            const frames = typeof RRAssetFiles !== 'undefined' && RRAssetFiles.characterFrameCount ? RRAssetFiles.characterFrameCount(image.characterName) : 3;
            const dirs = [[2, 'Down'], [4, 'Left'], [6, 'Right'], [8, 'Up']];
            // (Which character of an eight-character sheet is shown with the file name above.)
            first = `<label style="display:flex;align-items:center;gap:3px;">${rrEscapeHtml(tt('Direction'))}
                    <select class="image-dir-select" data-page-index="${pageIndex}" style="${field}">${dirs.map(([d, label]) => option(d, tt(label), image.direction || 2)).join('')}</select></label>
                <label style="display:flex;align-items:center;gap:3px;">${rrEscapeHtml(tt('Frame'))}
                    <select class="image-pattern-select" data-page-index="${pageIndex}" style="${field}">${Array.from({ length: Math.max(1, frames) }, (_, i) => option(i, String(i + 1), image.pattern || 0)).join('')}</select></label>`;
        } else {
            first = `<span>${this._t('event.tile')} <strong style="color: var(--color-text);">${image.tileId}</strong></span>`;
        }
        const box = (cls, on, text, hint) => `<label title="${rrEscapeHtml(tt(hint))}" style="display:flex;align-items:center;gap:3px;cursor:pointer;">
            <input type="checkbox" class="${cls}" data-page-index="${pageIndex}" ${on ? 'checked' : ''} style="margin:0;">${rrEscapeHtml(tt(text))}</label>`;
        // The theme's dropdown for the usual angles; Custom opens a themed number field for any other.
        // (A <datalist> showed the browser's own list, which no theme reaches.)
        const angles = [0, 45, 90, 135, 180, 225, 270, 315];
        const angle = Number(turn.angle) || 0, preset = angles.includes(angle);
        const words = image.characterName ? this.frameWords(image, directionName) : '';
        // Sprite Transforms off (Database › Reactor Features): no Mirror, Flip or Rotation; a stored turn stays, unused.
        const features = typeof window !== 'undefined' ? window.ReactorFeatures : null;
        const turns = !features || features.on('spriteTransforms', this.databaseManager?.getSystem?.() || {});
        // The two groups share one row (display: contents), wrapping only where the column is too narrow.
        return `<div class="image-turn-rows" title="${rrEscapeHtml(words)}" style="display:flex;align-items:center;gap:3px 8px;flex-wrap:wrap;font-size:11px;color:var(--color-text);flex-shrink:0;">
            <div class="image-frame-row" style="display:contents;">${first}</div>
            ${turns ? `<div class="image-turn-row" style="display:contents;">
                ${box('image-turn-mirror', turn.mirror, 'Mirror', 'Faces the other way (flipped left to right)')}
                ${box('image-turn-flip', turn.flip, 'Flip', 'Upside down (flipped top to bottom)')}
                <label title="${rrEscapeHtml(tt('Turned clockwise in place, about its middle; 90 lays it on its side'))}" style="display:flex;align-items:center;gap:3px;">
                    ${rrEscapeHtml(tt('Rotation'))}
                    <select class="image-turn-angle-pick" data-page-index="${pageIndex}" style="${field}">${angles.map(a => `<option value="${a}"${a === angle && preset ? ' selected' : ''}>${a}°</option>`).join('')}
                        <option value="custom"${preset ? '' : ' selected'}>${rrEscapeHtml(tt('Custom'))}</option></select>
                </label>
                <span class="image-turn-angle-custom" style="display:${preset ? 'none' : 'flex'};align-items:center;gap:3px;">
                    <input type="number" class="image-turn-angle" data-page-index="${pageIndex}" min="-360" max="360" step="1" value="${angle}" style="width:72px;height:22px;font-size:11px;">°
                </span>
            </div>` : ''}
        </div>`;
    }

    /** Writes the Image options row back onto the page and turns the preview with it. */
    static readImageTurn(page, section) {
        const mirror = !!section.querySelector('.image-turn-mirror')?.checked;
        const flip = !!section.querySelector('.image-turn-flip')?.checked;
        const angle = Math.round((Number(section.querySelector('.image-turn-angle')?.value) || 0) * 100) / 100;
        if (!mirror && !flip && !angle) delete page.rrImage;
        else {
            const turn = {};
            if (mirror) turn.mirror = true;
            if (flip) turn.flip = true;
            if (angle) { turn.angle = angle; turn.pivot = 'center'; }
            page.rrImage = turn;
        }
        EventPageEditor.turnPreview(section, page);
    }

    /** The preview drawn turned the way the page starts (CSS only; the picture itself is not redrawn). */
    static turnPreview(section, page) {
        const canvas = section && section.querySelector('.character-preview-canvas');
        if (!canvas) return;
        // Only a sprite or tile picture turns (a model page, or Sprite Transforms off, shows no turn controls and its preview stays as it is).
        const turn = page && section.querySelector && section.querySelector('.image-turn-row') ? page.rrImage : null;
        canvas.style.transform = turn ? `rotate(${Number(turn.angle) || 0}deg) scale(${turn.mirror ? -1 : 1}, ${turn.flip ? -1 : 1})` : '';
    }

    /** The Image box grows into the height there is, with or without a picture, so no gap opens below it. */
    _sizeImageSection(section) {
        section.style.flex = '1 0 140px';
        section.style.minHeight = '140px';
        const box = section.querySelector('.image-preview-box');
        if (box) {
            box.style.flex = '1';
            box.style.height = '';
            box.style.minHeight = '88px';
        }
    }

    /** Draws the Image box again: the unit row changed what the event stands as. */
    refreshCharacterPreview() {
        const section = document.querySelector('.event-page-config .image-section');
        const editor = this.parentEditor;
        const page = editor && editor.currentEvent && editor.currentEvent.pages[editor.currentPageIndex];
        if (!section || !page) return;
        this._sizeImageSection(section);
        // A canvas that drew a model cannot draw a picture afterwards: each look starts on a canvas of its own.
        const canvas = section.querySelector('.character-preview-canvas');
        if (canvas) {
            this._disposeModelPreview();
            const fresh = canvas.cloneNode(false);
            // As the section first makes it: the preview then measures it again and sets its own proportions.
            fresh.width = 192;
            fresh.height = 88;
            canvas.replaceWith(fresh);
        }
        this.renderCharacterPreview(section, page);
    }

    /** Whether the Image box shows the unit's look: the page has no model, no tile and no character picture of its own. */
    static showsUnitLook(image, model) {
        return !(model && model.name) && !((image && image.tileId) > 0) && !(image && image.characterName);
    }

    /**
     * What a unit stands as when its event has no picture of its own, the
     * first that exists: the look Battle Setup gives (`given`), the model the
     * Database binds to its record (`model`), an actor's character or an
     * enemy's own picture on the map, an enemy's battler picture, a
     * plain figure in its side's color (`colors`). `record` is its Database
     * record, `sideView` whether the game's battles are side view, `tx(text,
     * params)` translates. `{ kind: "model" | "character" | "picture" | "figure", note, … }`.
     */
    static lookOf(unit, record, { given = null, model = null, sideView = false, colors = {}, tx }) {
        const figure = note => ({ kind: 'figure', color: colors[unit.team] || colors.neutral || '#e6d15a', note });
        if (!record) return figure('');
        const actor = unit.record === 'actor';
        const name = record.name || String(unit.id).padStart(4, '0');
        const note = tx(actor ? 'Looks like {name} (Database › Actors)' : 'Looks like {name} (Database › Enemies)', { name });
        if (given && ['model', 'character', 'picture', 'figure'].includes(given.kind)) return Object.assign({ note }, given);
        if (model && model.name) return { kind: 'model', spec: model, note };
        if (actor && record.characterName) return { kind: 'character', characterName: record.characterName, characterIndex: record.characterIndex || 0, note };
        // An enemy's own picture on the map (`rrBattle.character`), else its `<unit character:>` tag: the game's own rule (FightLook.js).
        const rule = typeof ReactorFightLook !== 'undefined' ? ReactorFightLook : typeof require === 'function' ? require('../utils/FightLook.js') : null;
        const sheet = actor || !rule ? null : rule.recordCharacter(unit, record);
        if (sheet) return { kind: 'character', characterName: sheet.characterName, characterIndex: sheet.characterIndex, note };
        if (!actor && record.battlerName) return { kind: 'picture', folder: sideView ? 'sv_enemies' : 'enemies', name: record.battlerName, hue: Number(record.battlerHue) || 0, note };
        return figure(tx('{name} has no picture: it stands as a plain figure.', { name }));
    }

    /**
     * What the event stands as on page `pageIndex` when it is a unit with no
     * picture of its own (`lookOf`); null when it is not a unit on that page.
     */
    unitLook(pageIndex) {
        const editor = this.parentEditor, event = editor && editor.currentEvent;
        const unit = event && typeof FightCommandEditor !== 'undefined' ? FightCommandEditor.unitOf(event) : null;
        // A unit made by a comment is one on that page only.
        if (!unit || (unit.from === 'comment' && unit.page !== pageIndex + 1)) return null;
        const tx = (text, params) => (typeof window !== 'undefined' && window.I18n ? window.I18n.formatText(text, params)
            : String(text).replace(/\{(\w+)\}/g, (token, key) => (key in params ? String(params[key]) : token)));
        const colors = (typeof RRBattleSetup !== 'undefined' && RRBattleSetup.TEAM_COLORS) || { ally: '#4aa8ff', enemy: '#ff5a4a', neutral: '#e6d15a' };
        const actor = unit.record === 'actor';
        const list = (actor ? this.databaseManager.getActors() : this.databaseManager.getEnemies()) || [];
        const record = unit.id > 0 ? list.find(entry => entry && Number(entry.id) === Number(unit.id)) : null;
        const given = record && typeof RRBattleSetup !== 'undefined' && typeof RRBattleSetup.lookOf === 'function' ? RRBattleSetup.lookOf(unit, event) : null;
        const project = this.projectController.getCurrentProject ? this.projectController.getCurrentProject() : this.projectController.currentProject;
        const bindings = typeof RRDatabase3DBindings !== 'undefined' ? RRDatabase3DBindings : null;
        let model = null;
        if (record && project && project.path && bindings && bindings.get) {
            try { model = actor ? bindings.get(project.path, 'actors', unit.id, 'character') : bindings.get(project.path, 'enemies', unit.id); } catch (error) { model = null; }
        }
        const system = this.databaseManager.getSystem ? this.databaseManager.getSystem() : null;
        return EventPageEditor.lookOf(unit, record, { given, model, sideView: !!(system && system.optSideView), colors, tx });
    }

    /** The line under the Image box that says whose look it shows; '' takes it away. */
    _showUnitLookNote(canvas, text) {
        const box = canvas.parentElement, holder = box && box.parentElement;
        if (!holder) return;
        let note = holder.querySelector('.event-unit-look');
        if (!text) { if (note) note.remove(); return; }
        if (!note) {
            note = document.createElement('div');
            note.className = 'event-unit-look';
            box.after(note);
        }
        note.textContent = text;
        note.title = text;
    }

    /** A battler picture fitted in the box, or a plain figure in the side's color. */
    _drawUnitLook(canvas, ctx, look) {
        const background = () => {
            ctx.fillStyle = '#3e3e42';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        };
        const figure = color => {
            background();
            const h = canvas.height * 0.72, w = h * 0.42, x = canvas.width / 2, top = (canvas.height - h) / 2;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, top + h * 0.16, h * 0.16, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x - w / 2, top + h);
            ctx.lineTo(x - w / 2, top + h * 0.5);
            ctx.quadraticCurveTo(x - w / 2, top + h * 0.36, x, top + h * 0.36);
            ctx.quadraticCurveTo(x + w / 2, top + h * 0.36, x + w / 2, top + h * 0.5);
            ctx.lineTo(x + w / 2, top + h);
            ctx.closePath();
            ctx.fill();
        };
        if (look.kind !== 'picture') { figure(look.color || '#e6d15a'); return; }
        const project = this.projectController.getCurrentProject ? this.projectController.getCurrentProject() : this.projectController.currentProject;
        if (!project) { figure('#ff5a4a'); return; }
        const picture = new Image();
        picture.onload = () => {
            if (!canvas.isConnected) return;
            background();
            const scale = Math.min(canvas.width / picture.width, canvas.height / picture.height);
            const w = picture.width * scale, h = picture.height * scale;
            ctx.imageSmoothingEnabled = true;
            if (look.hue) ctx.filter = `hue-rotate(${look.hue}deg)`;
            ctx.drawImage(picture, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
            ctx.filter = 'none';
        };
        picture.onerror = () => { if (canvas.isConnected) figure('#ff5a4a'); };
        picture.src = RRAssetFiles.imageUrlFor(require('path').join(project.path, 'img', look.folder), look.name);
    }

    /**
     * Render tileset preview for events with tileId
     */
    renderTilesetPreview(canvas, ctx, tileId) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const currentProject = this.projectController.getCurrentProject ? this.projectController.getCurrentProject() : this.projectController.currentProject;
        if (!currentProject) return;

        const path = require('path');
        const tilemapManager = this.projectController.getTilemapManager();
        if (!tilemapManager || !tilemapManager.currentMap) return;

        // Get current tileset
        const fs = require('fs');
        const tilesetsPath = path.join(currentProject.path, 'data', 'Tilesets.json');
        if (!fs.existsSync(tilesetsPath)) return;

        const tilesets = RRJson.parse(fs.readFileSync(tilesetsPath));
        const tilesetId = tilemapManager.currentMap.tilesetId || 1;
        const currentTileset = tilesets[tilesetId];
        if (!currentTileset) return;

        // The sheet is sampled in the project's own tile size; the 48s below
        // are the format's shapes per autotile kind.
        const TILE_SIZE = tilemapManager.TILE_WIDTH || 48;

        // Determine which tileset image to use based on tileId
        let layerIndex = null;
        let tileX = 0;
        let tileY = 0;
        let srcX = 0;
        let srcY = 0;

        if (tileId >= 2048) {
            // Autotiles A1-A4
            const kind = Math.floor((tileId - 2048) / 48);

            if (kind < 16) {
                // A1 (0-15)
                layerIndex = 0; // A1 is first
                tileX = kind % 8;
                tileY = Math.floor(kind / 8);
                srcX = tileX * TILE_SIZE * 2;
                srcY = tileY * TILE_SIZE * 3;
            } else if (kind < 48) {
                // A2 (16-47)
                layerIndex = 1; // A2
                const localKind = kind - 16;
                tileX = localKind % 8;
                tileY = Math.floor(localKind / 8);
                srcX = tileX * TILE_SIZE * 2;
                srcY = tileY * TILE_SIZE * 3;
            } else if (kind < 80) {
                // A3 (48-79)
                layerIndex = 2; // A3
                const localKind = kind - 48;
                tileX = localKind % 8;
                tileY = Math.floor(localKind / 8);
                srcX = tileX * TILE_SIZE * 2;
                srcY = tileY * TILE_SIZE * 2;
            } else if (kind < 128) {
                // A4 (80-127)
                layerIndex = 3; // A4
                const localKind = kind - 80;
                tileX = localKind % 8;
                tileY = Math.floor(localKind / 8);
                srcX = tileX * TILE_SIZE * 2;
                // A4 alternates between floor (3 tall) and wall (2 tall)
                srcY = 0;
                for (let r = 0; r < tileY; r++) {
                    if (r % 2 === 0) {
                        srcY += TILE_SIZE * 3;
                    } else {
                        srcY += TILE_SIZE * 2;
                    }
                }
            }
        } else if (tileId >= 1536) {
            // A5 tiles
            layerIndex = 4; // A5
            const localTileId = tileId - 1536;
            tileX = localTileId % 8;
            tileY = Math.floor(localTileId / 8);
            srcX = tileX * TILE_SIZE;
            srcY = tileY * TILE_SIZE;
        } else {
            // B-E and the extended F-G sheets, addressed by the same
            // definition the map canvas uses.
            layerIndex = RRTilesetSheets.setNumberForNormalTileId(tileId);

            // Each sheet is 256 tiles split into two halves of 128, the right
            // half drawn beside the left. Read as a plain 8-wide grid, every
            // tile past the 128th sampled off the bottom of the sheet.
            const localTileId = tileId % 256;
            tileX = (Math.floor(localTileId / 128) % 2) * 8 + (localTileId % 8);
            tileY = Math.floor((localTileId % 256) / 8) % 16;
            srcX = tileX * TILE_SIZE;
            srcY = tileY * TILE_SIZE;
        }

        // Get tileset image filename
        const tilesetName = currentTileset.tilesetNames[layerIndex];
        if (!tilesetName) {
            // No tileset image for this layer
            ctx.fillStyle = '#3e3e42';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#999';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(tt('No Tileset'), canvas.width / 2, canvas.height / 2);
            return;
        }

        const imgPath = RRAssetFiles.toUrl(
            path.join(currentProject.path, 'img', 'tilesets', tilesetName + '.png'));

        const img = new Image();
        img.onload = () => {
            // Calculate scale to fit canvas
            ctx.imageSmoothingEnabled = false;
            const scale = Math.min(canvas.width / TILE_SIZE, canvas.height / TILE_SIZE);
            const drawWidth = TILE_SIZE * scale;
            const drawHeight = TILE_SIZE * scale;
            const drawX = (canvas.width - drawWidth) / 2;
            const drawY = (canvas.height - drawHeight) / 2;

            // Clear and draw the tile
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(
                img,
                srcX, srcY,
                TILE_SIZE, TILE_SIZE,
                drawX, drawY,
                drawWidth, drawHeight
            );
        };

        img.onerror = () => {
            ctx.fillStyle = '#3e3e42';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#f88';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(tt('Error Loading Tile'), canvas.width / 2, canvas.height / 2);
        };

        img.src = imgPath;
    }

    /**
     * Create Options section
     */
    createOptionsSection(page, pageIndex) {
        const section = document.createElement('div');
        section.className = 'event-section options-section';
        section.style.backgroundColor = 'var(--color-bg-input)';
        section.style.padding = '6px';
        section.style.borderRadius = '4px';

        section.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">${this._t('event.options')}</div>

            <div style="display: flex; flex-direction: column; gap: 3px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox"
                           class="option-checkbox"
                           data-field="walkAnime"
                           data-page-index="${pageIndex}"
                           ${page.walkAnime ? 'checked' : ''}>
                    <label style="font-size: 12px;">${this._t('event.walkingAnimation')}</label>
                </div>

                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox"
                           class="option-checkbox"
                           data-field="stepAnime"
                           data-page-index="${pageIndex}"
                           ${page.stepAnime ? 'checked' : ''}>
                    <label style="font-size: 12px;">${this._t('event.steppingAnimation')}</label>
                </div>

                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox"
                           class="option-checkbox"
                           data-field="directionFix"
                           data-page-index="${pageIndex}"
                           ${page.directionFix ? 'checked' : ''}>
                    <label style="font-size: 12px;">${this._t('event.directionFix')}</label>
                </div>

                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox"
                           class="option-checkbox"
                           data-field="through"
                           data-page-index="${pageIndex}"
                           ${page.through ? 'checked' : ''}>
                    <label style="font-size: 12px;">${this._t('event.through')}</label>
                </div>
            </div>
        `;

        // Add event listeners
        this.attachOptionsListeners(section);

        return section;
    }

    /**
     * Create Autonomous Movement section
     */
    createMovementSection(page, pageIndex) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'event-section movement-section';
        section.style.backgroundColor = 'var(--color-bg-input)';
        section.style.padding = '6px';
        section.style.borderRadius = '4px';

        section.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">${this._t('event.autonomousMovement')}</div>

            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                    <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">${this._t('event.type')}</label>
                    <select class="movement-select"
                            data-field="moveType"
                            data-page-index="${pageIndex}"
                            style="flex: 1; min-width: 0; padding: 3px; font-size: 11px;">
                        <option value="0" ${page.moveType === 0 ? 'selected' : ''}>${this._t('event.fixed')}</option>
                        <option value="1" ${page.moveType === 1 ? 'selected' : ''}>${this._t('event.random')}</option>
                        <option value="2" ${page.moveType === 2 ? 'selected' : ''}>${this._t('event.approach')}</option>
                        <option value="3" ${page.moveType === 3 ? 'selected' : ''}>${this._t('event.custom')}</option>
                    </select>
                    <button class="movement-route-btn rr-btn-chip"
                            data-page-index="${pageIndex}"
                            title="${this._tt('Set the route this event follows on its own')}"
                            ${page.moveType === 3 ? '' : 'disabled'}
                            style="flex-shrink: 0;">${this._tt('Route...')}</button>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                    <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">${this._t('event.speed')}</label>
                    <select class="movement-select"
                            data-field="moveSpeed"
                            data-page-index="${pageIndex}"
                            style="flex: 1; min-width: 0; padding: 3px; font-size: 11px;">
                        <option value="1" ${page.moveSpeed === 1 ? 'selected' : ''}>1: ${tt('x8 slower')}</option>
                        <option value="2" ${page.moveSpeed === 2 ? 'selected' : ''}>2: ${tt('x4 slower')}</option>
                        <option value="3" ${page.moveSpeed === 3 ? 'selected' : ''}>3: ${tt('x2 slower')}</option>
                        <option value="4" ${page.moveSpeed === 4 ? 'selected' : ''}>4: ${this._t('event.normal')}</option>
                        <option value="5" ${page.moveSpeed === 5 ? 'selected' : ''}>5: ${tt('x2 faster')}</option>
                        <option value="6" ${page.moveSpeed === 6 ? 'selected' : ''}>6: ${tt('x4 faster')}</option>
                    </select>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                    <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">${this._t('event.frequency')}</label>
                    <select class="movement-select"
                            data-field="moveFrequency"
                            data-page-index="${pageIndex}"
                            style="flex: 1; min-width: 0; padding: 3px; font-size: 11px;">
                        <option value="1" ${page.moveFrequency === 1 ? 'selected' : ''}>1: ${this._t('event.lowest')}</option>
                        <option value="2" ${page.moveFrequency === 2 ? 'selected' : ''}>2: ${this._t('event.lower')}</option>
                        <option value="3" ${page.moveFrequency === 3 ? 'selected' : ''}>3: ${this._t('event.normal')}</option>
                        <option value="4" ${page.moveFrequency === 4 ? 'selected' : ''}>4: ${this._t('event.higher')}</option>
                        <option value="5" ${page.moveFrequency === 5 ? 'selected' : ''}>5: ${this._t('event.highest')}</option>
                    </select>
                </div>
            </div>
        `;

        // Add event listeners
        this.attachMovementListeners(section);

        return section;
    }

    /**
     * Create Priority section
     */
    createPrioritySection(page, pageIndex) {
        const section = document.createElement('div');
        section.className = 'event-section priority-section';
        section.style.backgroundColor = 'var(--color-bg-input)';
        section.style.padding = '6px';
        section.style.borderRadius = '4px';

        section.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">${this._t('event.priority')}</div>

            <div style="display: flex; align-items: center; gap: 6px;">
                <select class="priority-select"
                        data-field="priorityType"
                        data-page-index="${pageIndex}"
                        style="flex: 1; padding: 3px; font-size: 11px;">
                    <option value="0" ${page.priorityType === 0 ? 'selected' : ''}>${this._t('event.belowCharacters')}</option>
                    <option value="1" ${page.priorityType === 1 ? 'selected' : ''}>${this._t('event.sameAsCharacters')}</option>
                    <option value="2" ${page.priorityType === 2 ? 'selected' : ''}>${this._t('event.aboveCharacters')}</option>
                    <option value="3" ${page.priorityType === 3 ? 'selected' : ''}>${this._t('event.aboveCharactersSorted')}</option>
                </select>
            </div>
        `;

        // Add event listeners
        this.attachPriorityListeners(section);

        return section;
    }

    /**
     * Create Trigger section
     */
    createTriggerSection(page, pageIndex) {
        const section = document.createElement('div');
        section.className = 'event-section trigger-section';
        section.style.backgroundColor = 'var(--color-bg-input)';
        section.style.padding = '6px';
        section.style.borderRadius = '4px';

        section.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">${this._t('event.trigger')}</div>

            <div style="display: flex; align-items: center; gap: 6px;">
                <select class="trigger-select"
                        data-field="trigger"
                        data-page-index="${pageIndex}"
                        style="flex: 1; padding: 3px; font-size: 11px;">
                    <option value="0" ${page.trigger === 0 ? 'selected' : ''}>${this._t('event.actionButton')}</option>
                    <option value="1" ${page.trigger === 1 ? 'selected' : ''}>${this._t('event.playerTouch')}</option>
                    <option value="2" ${page.trigger === 2 ? 'selected' : ''}>${this._t('event.eventTouch')}</option>
                    <option value="3" ${page.trigger === 3 ? 'selected' : ''}>${this._t('event.autorun')}</option>
                    <option value="4" ${page.trigger === 4 ? 'selected' : ''}>${this._t('event.parallel')}</option>
                </select>
            </div>
        `;

        // Add event listeners
        this.attachTriggerListeners(section);

        return section;
    }

    /**
     * Generate options from array (for switches, variables, items, actors)
     */
    generateOptionsFromArray(array, selectedId) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        if (!array || array.length === 0) {
            return `<option value="1">${this._t('event.noneAvailable')}</option>`;
        }

        return array
            .filter(item => item && item.id) // Filter out null/undefined entries
            .map(item => {
                const name = item.name || `${tt('Unnamed')} #${item.id}`;
                const selected = item.id === selectedId ? 'selected' : '';
                return `<option value="${item.id}" ${selected}>#${String(item.id).padStart(4, '0')}: ${rrEscapeHtml(name)}</option>`;
            })
            .join('');
    }

    /**
     * Attach event listeners for conditions
     */
    attachConditionListeners(section) {
        // Display inactive conditions as blank without changing the
        // stored ID. Re-enabling a condition restores the user's selection.
        const syncCondition = checkbox => {
            const field = checkbox.dataset.field.replace('Valid', '');
            const page = this.parentEditor.currentEvent.pages[Number(checkbox.dataset.pageIndex)];
            section.querySelectorAll(`[data-field^="${field}"]`).forEach(control => {
                if (control.classList.contains('condition-checkbox')) return;
                control.disabled = !checkbox.checked;
                if (field === 'item' || field === 'actor') {
                    control.value = checkbox.checked ? String(page.conditions[field + 'Id'] || 1) : '';
                } else if (control.matches('.switch-picker-btn, .variable-picker-btn')) {
                    const id = page.conditions[control.dataset.field] || 1;
                    const system = this.databaseManager.getSystem() || {};
                    const names = field === 'variable' ? system.variables : system.switches;
                    const label = field === 'variable' ? 'Variable' : 'Switch';
                    const fallback = `${window.I18n ? window.I18n.tText(label) : label} ${String(id).padStart(4, '0')}`;
                    control.textContent = checkbox.checked ? `#${String(id).padStart(4, '0')}: ${names?.[id] || fallback}` : '';
                } else if (control.dataset.field === 'variableValue') {
                    control.value = checkbox.checked ? String(page.conditions.variableValue ?? 0) : '';
                } else if (control.dataset.field === 'selfSwitchCh') {
                    control.value = checkbox.checked ? (page.conditions.selfSwitchCh || 'A') : '';
                }
            });
        };
        // Checkbox listeners
        section.querySelectorAll('.condition-checkbox').forEach(checkbox => {
            syncCondition(checkbox);
            checkbox.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                const pageIndex = parseInt(e.target.dataset.pageIndex);
                const page = this.parentEditor.currentEvent.pages[pageIndex];

                page.conditions[field] = e.target.checked;

                syncCondition(checkbox);
            });
        });

        // Switch picker button listeners
        section.querySelectorAll('.switch-picker-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                if (button.disabled) return;

                const field = button.dataset.field;
                const pageIndex = parseInt(button.dataset.pageIndex);
                const page = this.parentEditor.currentEvent.pages[pageIndex];
                const currentId = page.conditions[field] || 1;

                this.switchVariablePicker.show('switch', currentId, (id, name) => {
                    page.conditions[field] = id;
                    button.textContent = `#${String(id).padStart(4, '0')}: ${name}`;
                });
            });

            // Hover effects
            button.addEventListener('mouseenter', () => {
                if (!button.disabled) button.style.backgroundColor = 'var(--color-bg-input)';
            });
            button.addEventListener('mouseleave', () => {
                if (!button.disabled) button.style.backgroundColor = 'var(--color-bg-surface)';
            });
        });

        // Variable picker button listeners
        section.querySelectorAll('.variable-picker-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                if (button.disabled) return;

                const field = button.dataset.field;
                const pageIndex = parseInt(button.dataset.pageIndex);
                const page = this.parentEditor.currentEvent.pages[pageIndex];
                const currentId = page.conditions[field] || 1;

                this.switchVariablePicker.show('variable', currentId, (id, name) => {
                    page.conditions[field] = id;
                    button.textContent = `#${String(id).padStart(4, '0')}: ${name}`;
                });
            });

            // Hover effects
            button.addEventListener('mouseenter', () => {
                if (!button.disabled) button.style.backgroundColor = 'var(--color-bg-input)';
            });
            button.addEventListener('mouseleave', () => {
                if (!button.disabled) button.style.backgroundColor = 'var(--color-bg-surface)';
            });
        });

        // Select/Input listeners
        section.querySelectorAll('.condition-select, .condition-input').forEach(element => {
            element.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                const pageIndex = parseInt(e.target.dataset.pageIndex);
                const page = this.parentEditor.currentEvent.pages[pageIndex];

                page.conditions[field] = EventPageEditor.readConditionValue(
                    field, e.target.value, page.conditions[field]);
            });
        });
    }

    /**
     * Attach event listeners for image settings
     */
    pageModelSpec(pageIndex) {
        const models = this.parentEditor && this.parentEditor.pendingModels;
        return (models && models[pageIndex]) || null;
    }

    setPageModelSpec(pageIndex, spec) {
        if (!this.parentEditor.pendingModels) this.parentEditor.pendingModels = [];
        this.parentEditor.pendingModels[pageIndex] = spec;
        // The preview reads pendingModels directly; only Apply/OK commits
        // this selection to the map alongside the rest of the event draft.
        // An Auto size follows the model.
        this.parentEditor.refreshAutoSize?.();
    }

    /**
     * The preview is drawn for its box's size; when the box changes (the editor's window resized,
     * or moved to another window) it is drawn again for the new one, in proportion. Until then
     * `object-fit: contain` keeps the old drawing in proportion too.
     */
    _redrawOnResize(canvas, redraw) {
        canvas._rrRedraw = redraw;
        if (canvas._rrSizeWatch) return;
        const view = (canvas.ownerDocument && canvas.ownerDocument.defaultView) || window;
        const Observer = view.ResizeObserver || (typeof ResizeObserver === 'function' ? ResizeObserver : null);
        if (!Observer) return;
        let settle = null;
        canvas._rrSizeWatch = new Observer(() => {
            const box = canvas.getBoundingClientRect();
            if (Math.abs(Math.round(box.width) - canvas.width) < 2 && Math.abs(Math.round(box.height) - canvas.height) < 2) return;
            clearTimeout(settle);
            settle = setTimeout(() => {
                if (canvas.isConnected && box.width > 0 && box.height > 0 && canvas._rrRedraw) canvas._rrRedraw();
            }, 150);
        });
        canvas._rrSizeWatch.observe(canvas);
    }

    _fitPreviewCanvas(canvas) {
        // The layout size, not the drawn box: a page's Rotation turns the canvas, and a turned box is another shape.
        const rect = canvas.offsetWidth ? { width: canvas.offsetWidth, height: canvas.offsetHeight } : canvas.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        return canvas.getContext('2d');
    }

    _disposeModelPreview() {
        // A model still loading must not build its preview after this.
        this._modelPreviewGen = (this._modelPreviewGen || 0) + 1;
        if (this._modelPreviewRaf) cancelAnimationFrame(this._modelPreviewRaf);
        this._modelPreviewRaf = 0;
        this._modelPreviewUnwatch?.();
        this._modelPreviewUnwatch = null;
        if (this._modelPreviewRenderer) {
            this._modelPreviewRenderer.dispose();
            const gl = this._modelPreviewRenderer.getContext && this._modelPreviewRenderer.getContext();
            const lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
        }
        this._modelPreviewRenderer = null;
        this._modelPreviewScene = null;
        this._modelPreviewCamera = null;
    }

    async _renderModelPreview(canvas, model, page) {
        const gen = (this._modelPreviewGen = (this._modelPreviewGen || 0) + 1);
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (gen !== this._modelPreviewGen) return;
        const map3d = this.projectController && this.projectController.mapEditor3D;
        const ready = (typeof window !== 'undefined' && window.THREE && window.Reactor3D?.extensionsLoaded?.())
            || (map3d && map3d.ensureLibraries && await map3d.ensureLibraries());
        if (gen !== this._modelPreviewGen || !canvas.isConnected) return;
        if (!ready || typeof THREE === 'undefined' || typeof Reactor3D === 'undefined') return;
        const project = this.projectController.getCurrentProject
            ? this.projectController.getCurrentProject()
            : this.projectController.currentProject;
        if (!project || !project.path) return;
        const path = require('path');
        const fs = require('fs');
        const file = (model.file || model.name) + (model.ext || '.glb');
        const next = path.join(project.path, '3d', model.name, 'source', file);
        const filePath = fs.existsSync(next) ? next : path.join(project.path, '3d', 'source', file);
        if (!fs.existsSync(filePath)) return;
        try {
            const data = fs.readFileSync(filePath);
            const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            const baseUrl = 'file://' + path.dirname(filePath).replace(/\\/g, '/') + '/';
            // The colour map the sidecar names — or, for a spec saved before
            // it carried one, the same folder-derived choice the picker makes.
            const texture = model.texture
                || (typeof ModelGraphicPicker !== 'undefined' && ModelGraphicPicker.colorTextureIn
                    ? ModelGraphicPicker.colorTextureIn(
                        path.join(project.path, '3d', model.name, 'textures'))
                    : '');
            const template = Reactor3D.readModelAsync
                ? await Reactor3D.readModelAsync(buffer, model.ext || '.glb', baseUrl, texture)
                : Reactor3D.readModel(buffer, model.ext || '.glb', baseUrl, texture);
            if (gen !== this._modelPreviewGen || !canvas.isConnected) return;
            const mesh = Reactor3D.cloneModelTemplate
                ? Reactor3D.cloneModelTemplate(template)
                : template.clone(true);
            const extent = template.userData.glbSize || { x: 1, y: 1, z: 1 };
            const span = Math.max(extent.x, extent.y, extent.z, 0.0001);
            const scale = 1.4 / span;
            mesh.scale.setScalar(scale);
            // A skinned character's vertices follow bones Box3 cannot see:
            // its measured box can collapse to almost nothing at the feet,
            // and subtracting THAT centre left the camera staring at the
            // ankles. When the box is clearly smaller than the declared
            // extent, the template's own measurement (feet at the origin,
            // x/z centred) places the middle instead.
            const box = new THREE.Box3().setFromObject(mesh);
            const boxHeight = Number.isFinite(box.min.y) && Number.isFinite(box.max.y)
                ? box.max.y - box.min.y : 0;
            const declaredHeight = extent.y * scale;
            if (boxHeight >= declaredHeight * 0.5) {
                mesh.position.sub(box.getCenter(new THREE.Vector3()));
            } else {
                mesh.position.set(0, -declaredHeight / 2, 0);
            }
            const object = new THREE.Group();
            object.add(mesh);
            Reactor3D.applyEventModelPose(object, {
                pitch: (Number(model.pitch) || 0) * Math.PI / 180,
                yaw: (Number(model.yaw) || 0) * Math.PI / 180,
                roll: (Number(model.roll) || 0) * Math.PI / 180,
                faces: model.faces
            }, (page && page.image && page.image.direction) || 2, { preview: true, faceYaw: 0 });
            const scene = new THREE.Scene();
            ModelPreview3D.updateBackground(scene);
            ModelPreview3D.isolateLighting(object);
            if (model.variant && typeof ModelVariantsPanel !== 'undefined') ModelVariantsPanel.wear(mesh, project.path, model.name, model.variant);
            scene.add(object);
            const camera = Reactor3D.createCamera({ fov: 35 });
            const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
            this._modelPreviewScene = scene;
            this._modelPreviewCamera = camera;
            this._modelPreviewRenderer = renderer;
            // The page's model stands still, so it is drawn when something
            // about the picture changes — its size, the theme behind it, or a
            // texture decoding after the first draw — and not sixty times a
            // second. The canvas is measured only when it reports a resize.
            const textures = ModelPreview3D.collectTextures(template, object);
            let dirty = true, sizeDirty = true, theme = null, textureVersion = -1;
            const unwatchSize = ModelPreview3D.watchSize(canvas, () => { sizeDirty = true; });
            this._modelPreviewUnwatch = unwatchSize;
            const tick = () => {
                if (gen !== this._modelPreviewGen || !canvas.isConnected || !this._modelPreviewRenderer) {
                    unwatchSize?.();
                    return;
                }
                if (sizeDirty || !unwatchSize) {
                    sizeDirty = false;
                    const rect = canvas.getBoundingClientRect();
                    const width = Math.max(1, Math.round(rect.width));
                    const height = Math.max(1, Math.round(rect.height));
                    const ratio = renderer.getPixelRatio();
                    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
                        renderer.setSize(width, height, false);
                        camera.aspect = width / height;
                        camera.updateProjectionMatrix();
                        dirty = true;
                    }
                }
                const nextTheme = ModelPreview3D.themeKey();
                if (nextTheme !== theme) { theme = nextTheme; dirty = true; }
                const nextVersion = ModelPreview3D.textureVersionSum(textures);
                if (nextVersion !== textureVersion) { textureVersion = nextVersion; dirty = true; }
                if (dirty) {
                    Reactor3D.aimCamera(camera, { x: -0.5, y: 0, z: -0.5 }, { yaw: 0, pitch: 12, distance: 2.4 });
                    ModelPreview3D.updateBackground(scene);
                    // Drawn again next frame while the model is still left out of the draw.
                    dirty = ModelPreview3D.render(renderer, scene, camera);
                }
                this._modelPreviewRaf = requestAnimationFrame(tick);
            };
            this._modelPreviewRaf = requestAnimationFrame(tick);
        } catch (error) {
            console.error('Event model preview failed.', error);
        }
    }

    openModelPicker(pageIndex, current) {
        const picker = new ModelGraphicPicker(this.projectController);
        picker.show(current, result => {
            this.setPageModelSpec(pageIndex, result);
            this.parentEditor.renderCurrentPage();
        });
    }

    attachImageListeners(section, page, pageIndex) {
        const threeD = section.querySelector('.image-3d-checkbox');
        if (threeD) {
            threeD.addEventListener('change', () => {
                if (threeD.checked) {
                    this.openModelPicker(pageIndex, this.pageModelSpec(pageIndex));
                } else {
                    this.setPageModelSpec(pageIndex, null);
                    this.parentEditor.renderCurrentPage();
                }
            });
        }

        // The frame the page starts on, and its turn: mirror, flip, rotation. Each redraws the preview at once.
        section.querySelectorAll('.image-turn-mirror, .image-turn-flip').forEach(input => {
            input.addEventListener('change', () => EventPageEditor.readImageTurn(page, section));
        });
        section.querySelectorAll('.image-turn-angle').forEach(input => {
            input.addEventListener('input', () => EventPageEditor.readImageTurn(page, section));
            input.addEventListener('change', () => EventPageEditor.readImageTurn(page, section));
        });
        section.querySelectorAll('.image-turn-angle-pick').forEach(pick => {
            pick.addEventListener('change', () => {
                const custom = section.querySelector('.image-turn-angle-custom'), input = section.querySelector('.image-turn-angle');
                if (custom) custom.style.display = pick.value === 'custom' ? 'flex' : 'none';
                if (!input) return;
                if (pick.value === 'custom') { input.focus(); input.select?.(); return; }
                input.value = pick.value;
                EventPageEditor.readImageTurn(page, section);
            });
        });
        const frameSelect = (selector, key) => section.querySelectorAll(selector).forEach(select => {
            select.addEventListener('change', () => {
                if (!page.image) page.image = {};
                page.image[key] = Number(select.value) || 0;
                if (key === 'direction') page.image.direction = page.image.direction || 2;
                this.renderCharacterPreview(section, page);
                const rows = section.querySelector('.image-turn-rows');
                const names = { 2: 'Down', 4: 'Left', 6: 'Right', 8: 'Up' };
                if (rows && page.image.characterName) rows.title = this.frameWords(page.image, names[page.image.direction] || 'Down');
            });
        });
        frameSelect('.image-dir-select', 'direction');
        frameSelect('.image-pattern-select', 'pattern');
        EventPageEditor.turnPreview(section, page);

        // Browse button for character selection
        section.querySelectorAll('.image-dir-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!page.image) page.image = {};
                page.image.direction = Number(btn.dataset.dir) || 2;
                this.parentEditor.refreshAutoSize?.();
                this.parentEditor.renderCurrentPage();
            });
        });

        const browseButton = section.querySelector('.image-browse-button');
        if (browseButton) {
            // Add hover effects
            browseButton.addEventListener('mouseenter', () => browseButton.style.backgroundColor = 'var(--color-bg-deep)');
            browseButton.addEventListener('mouseleave', () => browseButton.style.backgroundColor = 'var(--color-bg-panel)');
            browseButton.addEventListener('mousedown', () => browseButton.style.backgroundColor = 'var(--color-bg-deep)');
            browseButton.addEventListener('mouseup', () => browseButton.style.backgroundColor = 'var(--color-bg-deep)');

            browseButton.addEventListener('click', () => {
                if (threeD && threeD.checked) {
                    this.openModelPicker(pageIndex, this.pageModelSpec(pageIndex));
                    return;
                }

                // Create character graphic picker
                const picker = new CharacterGraphicPicker(this.projectController);

                picker.show(
                    page.image.characterName,
                    page.image.characterIndex,
                    page.image.pattern,
                    page.image.direction,
                    (result) => {
                        // Update page image data
                        page.image.characterName = result.characterName;
                        page.image.characterIndex = result.characterIndex;
                        page.image.pattern = result.pattern;
                        page.image.direction = result.direction;

                        // Re-render the page configuration to show updated values
                        this.parentEditor.renderCurrentPage();
                        // The page was drawn again: the keyboard goes back to the button that opened the picker.
                        document.querySelector(`.image-browse-button[data-page-index="${pageIndex}"]`)?.focus();
                    }
                );
            });
        }
    }

    /**
     * Attach event listeners for options checkboxes
     */
    attachOptionsListeners(section) {
        section.querySelectorAll('.option-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                const pageIndex = parseInt(e.target.dataset.pageIndex);
                const page = this.parentEditor.currentEvent.pages[pageIndex];

                page[field] = e.target.checked;

                // If stepAnime changed, update the character preview animation
                if (field === 'stepAnime') {
                    const imageSection = document.querySelector('.event-section.image-section');
                    if (imageSection) {
                        this.renderCharacterPreview(imageSection, page);
                    }
                }
            });
        });
    }

    /**
     * Every page condition except the self-switch letter is a number in
     * authored data. Keying the conversion off the element type instead got
     * both wrong: a `<select>` reports type "select-one", so actorId and itemId
     * were stored as strings, and clearing a number input produced NaN, which
     * serialises to null — the runtime then compares the variable against null,
     * i.e. against zero, and the page starts meeting a condition it should not.
     */
    static get NUMERIC_CONDITIONS() {
        return ['actorId', 'itemId', 'switch1Id', 'switch2Id', 'variableId', 'variableValue'];
    }

    static readConditionValue(field, rawValue, currentValue) {
        if (!EventPageEditor.NUMERIC_CONDITIONS.includes(field)) return rawValue;
        const parsed = parseInt(rawValue, 10);
        // An empty or unparseable field keeps what was there rather than
        // writing a value the engine cannot compare against.
        return Number.isFinite(parsed) ? parsed : (currentValue ?? 0);
    }

    /**
     * Attach event listeners for movement settings
     */
    attachMovementListeners(section) {
        section.querySelectorAll('.movement-select').forEach(element => {
            element.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                const pageIndex = parseInt(e.target.dataset.pageIndex);
                const page = this.parentEditor.currentEvent.pages[pageIndex];

                page[field] = parseInt(e.target.value);

                // Only a custom route has a route to edit, so the button
                // follows the choice rather than sitting there inviting a
                // click that would do nothing.
                if (field === 'moveType') {
                    const button = section.querySelector('.movement-route-btn');
                    if (button) button.disabled = page.moveType !== 3;
                }
            });
        });

        /*
         * Choosing Custom is only half of it.
         *
         * The type could be set and there was no way to say what the route
         * actually was — the page kept whatever list it already had, and a new
         * event kept an empty one, so Custom meant "stand still" and could not
         * be made to mean anything else.
         *
         * It opens the movement route editor, which is the same dialog the Set
         * Movement Route command uses because it is the same forty-five
         * commands building the same structure. What the page has already
         * answered is left out of it: it is always this event, and nothing is
         * waiting on it to finish.
         */
        section.querySelectorAll('.movement-route-btn').forEach(button => {
            button.addEventListener('click', () => {
                const pageIndex = parseInt(button.dataset.pageIndex);
                const page = this.parentEditor.currentEvent.pages[pageIndex];
                const editor = this.movementRouteEditor();
                if (!page || !editor) return;
                editor.showRoute(page.moveRoute, route => { page.moveRoute = route; });
            });
        });
    }

    /**
     * The movement route editor, borrowed rather than built again.
     *
     * The command list owns one; a page editing its own route wants exactly
     * the same dialog, and two of them would drift apart a command at a time.
     */
    movementRouteEditor() {
        const owner = this.parentEditor && this.parentEditor.commandList;
        if (owner && owner.setMovementRouteEditor) return owner.setMovementRouteEditor;
        if (typeof SetMovementRouteEditor !== 'function') return null;
        this._routeEditor = this._routeEditor
            || new SetMovementRouteEditor(this.databaseManager, this.projectController);
        return this._routeEditor;
    }

    /**
     * Attach event listeners for priority settings
     */
    attachPriorityListeners(section) {
        section.querySelectorAll('.priority-select').forEach(element => {
            element.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                const pageIndex = parseInt(e.target.dataset.pageIndex);
                const page = this.parentEditor.currentEvent.pages[pageIndex];

                page[field] = parseInt(e.target.value);
            });
        });
    }

    /**
     * Attach event listeners for trigger settings
     */
    attachTriggerListeners(section) {
        section.querySelectorAll('.trigger-select').forEach(element => {
            element.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                const pageIndex = parseInt(e.target.dataset.pageIndex);
                const page = this.parentEditor.currentEvent.pages[pageIndex];

                page[field] = parseInt(e.target.value);
            });
        });
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventPageEditor;
}
