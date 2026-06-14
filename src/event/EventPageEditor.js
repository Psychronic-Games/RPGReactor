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

    /**
     * Render the complete page configuration
     */
    renderPageConfiguration(container, page, pageIndex) {
        container.innerHTML = '';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '6px';

        // Conditions Section (full width)
        const conditionsSection = this.createConditionsSection(page, pageIndex);
        container.appendChild(conditionsSection);

        // Image Section (full width)
        const imageSection = this.createImageSection(page, pageIndex);
        container.appendChild(imageSection);

        // Autonomous Movement Section (full width)
        const movementSection = this.createMovementSection(page, pageIndex);
        container.appendChild(movementSection);

        // Row: Options + (Priority + Trigger stacked)
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 6px;';

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
            return { id: index, name: name || `Switch ${String(index).padStart(4, '0')}` };
        }).filter(item => item !== null);

        const variables = (systemData.variables || []).map((name, index) => {
            if (index === 0) return null; // Skip index 0
            return { id: index, name: name || `Variable ${String(index).padStart(4, '0')}` };
        }).filter(item => item !== null);

        const items = this.databaseManager.getItems() || [];
        const actors = this.databaseManager.getActors() || [];

        section.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">Conditions</div>

            <!-- Switch 1 -->
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; min-width: 0;">
                <input type="checkbox"
                       class="condition-checkbox"
                       data-field="switch1Valid"
                       data-page-index="${pageIndex}"
                       ${conditions.switch1Valid ? 'checked' : ''}>
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">Switch 1:</label>
                <button class="switch-picker-btn"
                        data-field="switch1Id"
                        data-page-index="${pageIndex}"
                        style="flex: 1; min-width: 0; padding: 5px 8px; font-size: 11px; background: var(--color-bg-surface); color: var(--color-text); border: 1px solid var(--color-border-input); text-align: left; cursor: pointer; border-radius: 3px; min-height: 24px;"
                        ${!conditions.switch1Valid ? 'disabled' : ''}>
                    #${String(conditions.switch1Id || 1).padStart(4, '0')}: ${switches.find(s => s.id === (conditions.switch1Id || 1))?.name || 'Switch 0001'}
                </button>
            </div>

            <!-- Switch 2 -->
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; min-width: 0;">
                <input type="checkbox"
                       class="condition-checkbox"
                       data-field="switch2Valid"
                       data-page-index="${pageIndex}"
                       ${conditions.switch2Valid ? 'checked' : ''}>
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">Switch 2:</label>
                <button class="switch-picker-btn"
                        data-field="switch2Id"
                        data-page-index="${pageIndex}"
                        style="flex: 1; min-width: 0; padding: 5px 8px; font-size: 11px; background: var(--color-bg-surface); color: var(--color-text); border: 1px solid var(--color-border-input); text-align: left; cursor: pointer; border-radius: 3px; min-height: 24px;"
                        ${!conditions.switch2Valid ? 'disabled' : ''}>
                    #${String(conditions.switch2Id || 1).padStart(4, '0')}: ${switches.find(s => s.id === (conditions.switch2Id || 1))?.name || 'Switch 0001'}
                </button>
            </div>

            <!-- Variable -->
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; min-width: 0;">
                <input type="checkbox"
                       class="condition-checkbox"
                       data-field="variableValid"
                       data-page-index="${pageIndex}"
                       ${conditions.variableValid ? 'checked' : ''}>
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">Variable ≥:</label>
                <button class="variable-picker-btn"
                        data-field="variableId"
                        data-page-index="${pageIndex}"
                        style="flex: 1; min-width: 0; padding: 5px 8px; font-size: 11px; background: var(--color-bg-surface); color: var(--color-text); border: 1px solid var(--color-border-input); text-align: left; cursor: pointer; border-radius: 3px; min-height: 24px;"
                        ${!conditions.variableValid ? 'disabled' : ''}>
                    #${String(conditions.variableId || 1).padStart(4, '0')}: ${variables.find(v => v.id === (conditions.variableId || 1))?.name || 'Variable 0001'}
                </button>
                <input type="number"
                       class="condition-input"
                       data-field="variableValue"
                       data-page-index="${pageIndex}"
                       value="${conditions.variableValue || 0}"
                       style="width: 70px; flex-shrink: 0; padding: 3px; font-size: 11px;"
                       ${!conditions.variableValid ? 'disabled' : ''}>
            </div>

            <!-- Self Switch -->
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; min-width: 0;">
                <input type="checkbox"
                       class="condition-checkbox"
                       data-field="selfSwitchValid"
                       data-page-index="${pageIndex}"
                       ${conditions.selfSwitchValid ? 'checked' : ''}>
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">Self Switch:</label>
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
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">Item:</label>
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
                <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">Actor:</label>
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
        const section = document.createElement('div');
        section.className = 'event-section image-section';
        section.style.backgroundColor = 'var(--color-bg-input)';
        section.style.padding = '6px';
        section.style.borderRadius = '4px';

        const image = page.image || {};

        // Get direction name
        const directionNames = { 2: 'Down', 4: 'Left', 6: 'Right', 8: 'Up' };
        const directionName = directionNames[image.direction] || 'Down';

        section.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">Image</div>

            <div style="display: flex; flex-direction: column; gap: 4px;">
                <!-- Preview Canvas -->
                <div style="background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 4px; overflow: hidden; width: 100%;">
                    <canvas class="character-preview-canvas"
                            width="192"
                            height="128"
                            style="image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; display: block; width: 100%; height: auto;"></canvas>
                </div>

                <!-- Browse Button -->
                <div style="display: flex; align-items: center; gap: 4px; min-width: 0;">
                    <button class="image-browse-button rr-btn-browse"
                            data-page-index="${pageIndex}">Browse...</button>
                    <input type="text"
                           class="image-input image-name-display"
                           data-field="characterName"
                           data-page-index="${pageIndex}"
                           value="${image.characterName || ''}"
                           placeholder="None"
                           readonly
                           style="flex: 1; min-width: 0; padding: 3px 6px; background: var(--color-bg-surface); color: var(--color-text); border: 1px solid var(--color-border-input); font-size: 11px;">
                </div>

                <!-- Info Display -->
                <div style="display: flex; flex-direction: column; gap: 1px; font-size: 10px; color: var(--color-text-muted);">
                    <span>Index: <strong style="color: var(--color-text);">${image.characterIndex || 0}</strong> | Dir: <strong style="color: var(--color-text);">${directionName}</strong></span>
                    <span>Pattern: <strong style="color: var(--color-text);">${image.pattern || 0}</strong>${image.tileId > 0 ? ` | Tile: <strong style="color: var(--color-text);">${image.tileId}</strong>` : ''}</span>
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
        const image = page.image;
        const canvas = section.querySelector('.character-preview-canvas');
        if (!canvas) return;

        // Clear any existing animation interval
        if (canvas.animationInterval) {
            clearInterval(canvas.animationInterval);
            canvas.animationInterval = null;
        }

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        console.log('renderCharacterPreview - image data:', image);
        console.log('renderCharacterPreview - tileId:', image.tileId);

        // Check if this is a tileset graphic (tileId > 0)
        if (image.tileId && image.tileId > 0) {
            console.log('Rendering tileset preview for tileId:', image.tileId);
            this.renderTilesetPreview(canvas, ctx, image.tileId);
            return;
        }

        if (!image.characterName) {
            // Show placeholder
            ctx.fillStyle = '#3e3e42';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#999';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No Character', canvas.width / 2, canvas.height / 2);
            return;
        }

        const currentProject = this.projectController.getCurrentProject ? this.projectController.getCurrentProject() : this.projectController.currentProject;
        if (!currentProject) return;

        const img = new Image();
        const path = require('path');
        // Add .png extension if not already present (RPG Maker stores names without extension)
        const filename = image.characterName.endsWith('.png') ? image.characterName : image.characterName + '.png';
        const imgPath = 'file://' + path.join(currentProject.path, 'img', 'characters', filename).replace(/\\/g, '/');

        console.log('Loading character preview:', imgPath);

        img.onload = () => {
            const shouldAnimate = page.stepAnime; // Check stepping animation option
            // Check if this is a big character ($ or !$ prefix)
            const isBigCharacter = image.characterName.includes('$');

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
                    drawFrame(frames[frameIndex]);
                    frameIndex = (frameIndex + 1) % frames.length;
                };

                // Start animation at ~8 FPS
                canvas.animationInterval = setInterval(animate, 125);
                animate(); // Draw first frame immediately
            } else {
                // Static - just draw the selected pattern
                drawFrame(image.pattern || 0);
            }
        };

        img.onerror = () => {
            ctx.fillStyle = '#3e3e42';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#f88';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Error Loading', canvas.width / 2, canvas.height / 2);
        };

        img.src = imgPath;
    }

    /**
     * Render tileset preview for events with tileId
     */
    renderTilesetPreview(canvas, ctx, tileId) {
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

        const TILE_SIZE = 48;

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
            // B-E tiles
            let localTileId = tileId;

            if (tileId >= 768) {
                layerIndex = 8; // E
                localTileId = tileId - 768;
            } else if (tileId >= 512) {
                layerIndex = 7; // D
                localTileId = tileId - 512;
            } else if (tileId >= 256) {
                layerIndex = 6; // C
                localTileId = tileId - 256;
            } else {
                layerIndex = 5; // B
            }

            tileX = localTileId % 8;
            tileY = Math.floor(localTileId / 8);
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
            ctx.fillText('No Tileset', canvas.width / 2, canvas.height / 2);
            return;
        }

        const imgPath = 'file://' + path.join(currentProject.path, 'img', 'tilesets', tilesetName + '.png').replace(/\\/g, '/');

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
            ctx.fillText('Error Loading Tile', canvas.width / 2, canvas.height / 2);
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
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">Options</div>

            <div style="display: flex; flex-direction: column; gap: 3px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox"
                           class="option-checkbox"
                           data-field="walkAnime"
                           data-page-index="${pageIndex}"
                           ${page.walkAnime ? 'checked' : ''}>
                    <label style="font-size: 12px;">Walking Animation</label>
                </div>

                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox"
                           class="option-checkbox"
                           data-field="stepAnime"
                           data-page-index="${pageIndex}"
                           ${page.stepAnime ? 'checked' : ''}>
                    <label style="font-size: 12px;">Stepping Animation</label>
                </div>

                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox"
                           class="option-checkbox"
                           data-field="directionFix"
                           data-page-index="${pageIndex}"
                           ${page.directionFix ? 'checked' : ''}>
                    <label style="font-size: 12px;">Direction Fix</label>
                </div>

                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox"
                           class="option-checkbox"
                           data-field="through"
                           data-page-index="${pageIndex}"
                           ${page.through ? 'checked' : ''}>
                    <label style="font-size: 12px;">Through</label>
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
        const section = document.createElement('div');
        section.className = 'event-section movement-section';
        section.style.backgroundColor = 'var(--color-bg-input)';
        section.style.padding = '6px';
        section.style.borderRadius = '4px';

        section.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">Autonomous Movement</div>

            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                    <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">Type:</label>
                    <select class="movement-select"
                            data-field="moveType"
                            data-page-index="${pageIndex}"
                            style="flex: 1; min-width: 0; padding: 3px; font-size: 11px;">
                        <option value="0" ${page.moveType === 0 ? 'selected' : ''}>Fixed</option>
                        <option value="1" ${page.moveType === 1 ? 'selected' : ''}>Random</option>
                        <option value="2" ${page.moveType === 2 ? 'selected' : ''}>Approach</option>
                        <option value="3" ${page.moveType === 3 ? 'selected' : ''}>Custom</option>
                    </select>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                    <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">Speed:</label>
                    <select class="movement-select"
                            data-field="moveSpeed"
                            data-page-index="${pageIndex}"
                            style="flex: 1; min-width: 0; padding: 3px; font-size: 11px;">
                        <option value="1" ${page.moveSpeed === 1 ? 'selected' : ''}>1: x8 slower</option>
                        <option value="2" ${page.moveSpeed === 2 ? 'selected' : ''}>2: x4 slower</option>
                        <option value="3" ${page.moveSpeed === 3 ? 'selected' : ''}>3: x2 slower</option>
                        <option value="4" ${page.moveSpeed === 4 ? 'selected' : ''}>4: Normal</option>
                        <option value="5" ${page.moveSpeed === 5 ? 'selected' : ''}>5: x2 faster</option>
                        <option value="6" ${page.moveSpeed === 6 ? 'selected' : ''}>6: x4 faster</option>
                    </select>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                    <label style="min-width: 70px; flex-shrink: 0; font-size: 12px;">Frequency:</label>
                    <select class="movement-select"
                            data-field="moveFrequency"
                            data-page-index="${pageIndex}"
                            style="flex: 1; min-width: 0; padding: 3px; font-size: 11px;">
                        <option value="1" ${page.moveFrequency === 1 ? 'selected' : ''}>1: Lowest</option>
                        <option value="2" ${page.moveFrequency === 2 ? 'selected' : ''}>2: Lower</option>
                        <option value="3" ${page.moveFrequency === 3 ? 'selected' : ''}>3: Normal</option>
                        <option value="4" ${page.moveFrequency === 4 ? 'selected' : ''}>4: Higher</option>
                        <option value="5" ${page.moveFrequency === 5 ? 'selected' : ''}>5: Highest</option>
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
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">Priority</div>

            <div style="display: flex; align-items: center; gap: 6px;">
                <select class="priority-select"
                        data-field="priorityType"
                        data-page-index="${pageIndex}"
                        style="flex: 1; padding: 3px; font-size: 11px;">
                    <option value="0" ${page.priorityType === 0 ? 'selected' : ''}>Below Characters</option>
                    <option value="1" ${page.priorityType === 1 ? 'selected' : ''}>Same as Characters</option>
                    <option value="2" ${page.priorityType === 2 ? 'selected' : ''}>Above Characters</option>
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
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">Trigger</div>

            <div style="display: flex; align-items: center; gap: 6px;">
                <select class="trigger-select"
                        data-field="trigger"
                        data-page-index="${pageIndex}"
                        style="flex: 1; padding: 3px; font-size: 11px;">
                    <option value="0" ${page.trigger === 0 ? 'selected' : ''}>Action Button</option>
                    <option value="1" ${page.trigger === 1 ? 'selected' : ''}>Player Touch</option>
                    <option value="2" ${page.trigger === 2 ? 'selected' : ''}>Event Touch</option>
                    <option value="3" ${page.trigger === 3 ? 'selected' : ''}>Autorun</option>
                    <option value="4" ${page.trigger === 4 ? 'selected' : ''}>Parallel</option>
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
        if (!array || array.length === 0) {
            return '<option value="1">None available</option>';
        }

        return array
            .filter(item => item && item.id) // Filter out null/undefined entries
            .map(item => {
                const name = item.name || `Unnamed #${item.id}`;
                const selected = item.id === selectedId ? 'selected' : '';
                return `<option value="${item.id}" ${selected}>#${String(item.id).padStart(4, '0')}: ${name}</option>`;
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

                let value = e.target.value;
                if (e.target.type === 'number') {
                    value = parseInt(value);
                }

                page.conditions[field] = value;
            });
        });
    }

    /**
     * Attach event listeners for image settings
     */
    attachImageListeners(section, page, pageIndex) {
        // Browse button for character selection
        const browseButton = section.querySelector('.image-browse-button');
        if (browseButton) {
            // Add hover effects
            browseButton.addEventListener('mouseenter', () => browseButton.style.backgroundColor = 'var(--color-bg-deep)');
            browseButton.addEventListener('mouseleave', () => browseButton.style.backgroundColor = 'var(--color-bg-panel)');
            browseButton.addEventListener('mousedown', () => browseButton.style.backgroundColor = 'var(--color-bg-deep)');
            browseButton.addEventListener('mouseup', () => browseButton.style.backgroundColor = 'var(--color-bg-deep)');

            browseButton.addEventListener('click', () => {
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
     * Attach event listeners for movement settings
     */
    attachMovementListeners(section) {
        section.querySelectorAll('.movement-select').forEach(element => {
            element.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                const pageIndex = parseInt(e.target.dataset.pageIndex);
                const page = this.parentEditor.currentEvent.pages[pageIndex];

                page[field] = parseInt(e.target.value);
            });
        });
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
