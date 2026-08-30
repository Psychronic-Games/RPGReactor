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

        // Conditions Section (full width)
        const conditionsSection = this.createConditionsSection(page, pageIndex);
        conditionsSection.style.flexShrink = '0';
        container.appendChild(conditionsSection);

        // Image Section (full width)
        const imageSection = this.createImageSection(page, pageIndex);
        imageSection.style.flex = '1';
        imageSection.style.minHeight = '0';
        imageSection.style.overflow = 'hidden';
        container.appendChild(imageSection);

        // Autonomous Movement Section (full width)
        const movementSection = this.createMovementSection(page, pageIndex);
        movementSection.style.flexShrink = '0';
        container.appendChild(movementSection);

        // Row: Options + (Priority + Trigger stacked)
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 6px; flex-shrink: 0;';

        const optionsSection = this.createOptionsSection(page, pageIndex);
        optionsSection.style.flex = '1';
        row.appendChild(optionsSection);

        // Priority and Trigger stacked in right column
        const priorityTriggerColumn = document.createElement('div');
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
                        style="flex: 1; min-width: 0; padding: 5px 8px; font-size: 11px; background: var(--color-bg-surface); color: var(--color-text); border: 1px solid var(--color-border-input); text-align: left; cursor: pointer; border-radius: 3px; min-height: 24px;"
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
                        style="flex: 1; min-width: 0; padding: 5px 8px; font-size: 11px; background: var(--color-bg-surface); color: var(--color-text); border: 1px solid var(--color-border-input); text-align: left; cursor: pointer; border-radius: 3px; min-height: 24px;"
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
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">${tt('Variable')}</label>
                <button class="variable-picker-btn"
                        data-field="variableId"
                        data-page-index="${pageIndex}"
                        style="flex: 1; min-width: 0; padding: 5px 8px; font-size: 11px; background: var(--color-bg-surface); color: var(--color-text); border: 1px solid var(--color-border-input); text-align: left; cursor: pointer; border-radius: 3px; min-height: 24px;"
                        ${!conditions.variableValid ? 'disabled' : ''}>
                    #${String(conditions.variableId || 1).padStart(4, '0')}: ${rrEscapeHtml(variables.find(v => v.id === (conditions.variableId || 1))?.name || `${tt('Variable')} 0001`)}
                </button>
                <span style="flex-shrink: 0; font-size: 12px; color: var(--color-text-muted);" data-rr-i18n-skip>&ge;</span>
                <input type="number"
                       class="condition-input"
                       data-field="variableValue"
                       data-page-index="${pageIndex}"
                       value="${conditions.variableValue || 0}"
                       style="width: 70px; flex-shrink: 0; padding: 4px 6px; font-size: 11px;
                              background: var(--color-bg-surface); color: var(--color-text);
                              border: 1px solid var(--color-border-input); border-radius: 3px;"
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
                    <option value="A" ${conditions.selfSwitchCh === 'A' ? 'selected' : ''}>A</option>
                    <option value="B" ${conditions.selfSwitchCh === 'B' ? 'selected' : ''}>B</option>
                    <option value="C" ${conditions.selfSwitchCh === 'C' ? 'selected' : ''}>C</option>
                    <option value="D" ${conditions.selfSwitchCh === 'D' ? 'selected' : ''}>D</option>
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
                    ${this.generateOptionsFromArray(actors, conditions.actorId || 1)}
                </select>
            </div>
        `;

        // Add event listeners
        this.attachConditionListeners(section);

        return section;
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
        section.style.backgroundColor = 'var(--color-bg-input)';
        section.style.padding = '4px';
        section.style.borderRadius = '4px';
        section.style.display = 'flex';
        section.style.flexDirection = 'column';
        section.style.minHeight = '0';

        // Get direction name
        const directionNames = { 2: 'Down', 4: 'Left', 6: 'Right', 8: 'Up' };
        const directionName = directionNames[image.direction] || 'Down';
        const displayName = use3d ? model.name : (image.characterName || '');
        const title = use3d ? tt('3D Model') : this._t('event.image');

        section.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; flex-shrink: 0;">
                <div style="font-weight: bold; font-size: 13px;">${title}</div>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: normal;">
                    <input type="checkbox" class="image-3d-checkbox" data-page-index="${pageIndex}" ${use3d ? 'checked' : ''}>
                    ${tt('3D')}
                </label>
            </div>

            <div style="display: flex; flex-direction: column; gap: 3px;flex:1;min-height:0;">
                <div style="background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 4px; overflow: hidden; width: 100%;flex:1;min-height:0;">
                    <canvas class="character-preview-canvas"
                            width="192"
                            height="88"
                            style="image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; display: block; width: 100%; height: 100%;"></canvas>
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
                        ? `${tt('Model size (tiles)')} <strong style="color: var(--color-text);">${model.size || 2}</strong>
                            <span style="margin-left:6px;">${this._t('event.dir')}</span>
                            ${[2, 4, 6, 8].map(dir => {
                                const label = { 2: 'Down', 4: 'Left', 6: 'Right', 8: 'Up' }[dir];
                                const on = (image.direction || 2) === dir;
                                return `<button type="button" class="image-dir-btn" data-dir="${dir}"
                                    style="margin-left:3px;padding:1px 5px;font-size:10px;border-radius:3px;cursor:pointer;border:1px solid ${on ? 'var(--color-accent-bright)' : 'var(--color-border-input)'};background:${on ? 'var(--color-accent-tint-30)' : 'var(--color-bg-surface)'};color:var(--color-text);">${tt(label)}</button>`;
                            }).join('')}`
                        : `${this._t('event.index')} <strong style="color: var(--color-text);">${image.characterIndex || 0}</strong> | ${this._t('event.dir')} <strong style="color: var(--color-text);">${tt(directionName)}</strong> | ${this._t('event.pattern')} <strong style="color: var(--color-text);">${image.pattern || 0}</strong>${image.tileId > 0 ? ` | ${this._t('event.tile')} <strong style="color: var(--color-text);">${image.tileId}</strong>` : ''}`}
                </div>
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
        const image = page.image;
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

        const model = this.pageModelSpec(this.parentEditor.currentPageIndex);
        if (model && model.name) {
            this._renderModelPreview(canvas, model, page);
            return;
        }

        const fit = () => this._fitPreviewCanvas(canvas);

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

        const tilesets = JSON.parse(fs.readFileSync(tilesetsPath, 'utf8'));
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
        // Checkbox listeners
        section.querySelectorAll('.condition-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                const pageIndex = parseInt(e.target.dataset.pageIndex);
                const page = this.parentEditor.currentEvent.pages[pageIndex];

                page.conditions[field] = e.target.checked;

                // Enable/disable associated controls
                const associatedControls = section.querySelectorAll(`[data-field^="${field.replace('Valid', '')}"]`);
                associatedControls.forEach(control => {
                    if (!control.classList.contains('condition-checkbox')) {
                        control.disabled = !e.target.checked;
                    }
                });
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
        if (this.parentEditor._writePendingModels) this.parentEditor._writePendingModels();
    }

    _fitPreviewCanvas(canvas) {
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        return canvas.getContext('2d');
    }

    _disposeModelPreview() {
        if (this._modelPreviewRaf) cancelAnimationFrame(this._modelPreviewRaf);
        this._modelPreviewRaf = 0;
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
        const ready = (typeof window !== 'undefined' && window.THREE && window.Reactor3D)
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
            mesh.scale.setScalar(1.4 / span);
            const box = new THREE.Box3().setFromObject(mesh);
            mesh.position.sub(box.getCenter(new THREE.Vector3()));
            const object = new THREE.Group();
            object.add(mesh);
            Reactor3D.applyEventModelPose(object, {
                pitch: (Number(model.pitch) || 0) * Math.PI / 180,
                yaw: (Number(model.yaw) || 0) * Math.PI / 180,
                roll: (Number(model.roll) || 0) * Math.PI / 180,
                faces: model.faces
            }, (page && page.image && page.image.direction) || 2, { preview: true, faceYaw: 0 });
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1a1a1e);
            scene.add(object);
            const camera = Reactor3D.createCamera({ fov: 35 });
            const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
            this._modelPreviewScene = scene;
            this._modelPreviewCamera = camera;
            this._modelPreviewRenderer = renderer;
            const tick = () => {
                if (gen !== this._modelPreviewGen || !canvas.isConnected || !this._modelPreviewRenderer) return;
                const rect = canvas.getBoundingClientRect();
                const width = Math.max(1, Math.round(rect.width));
                const height = Math.max(1, Math.round(rect.height));
                if (canvas.width !== width || canvas.height !== height) {
                    renderer.setSize(width, height, false);
                    camera.aspect = width / height;
                    camera.updateProjectionMatrix();
                }
                Reactor3D.aimCamera(camera, { x: -0.5, y: 0, z: -0.5 }, { yaw: 0, pitch: 12, distance: 2.4 });
                renderer.render(scene, camera);
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

        // Browse button for character selection
        section.querySelectorAll('.image-dir-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!page.image) page.image = {};
                page.image.direction = Number(btn.dataset.dir) || 2;
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
