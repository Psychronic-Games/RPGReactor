/**
 * ShowBalloonIconEditor - Editor for Show Balloon Icon event command (code 213)
 */
class ShowBalloonIconEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [characterId, balloonId, waitForCompletion]
        this.characterId = -1; // -1=Player, 0=This Event, 1+=Event ID
        this.balloonId = 1; // 1-15 (Exclamation, Question, Music Note, Heart, Anger, Sweat, Cobweb, Silence, Light Bulb, Zzz, User-defined 1-5)
        this.waitForCompletion = true;

        // Balloon names
        this.balloonNames = [
            'Exclamation',
            'Question',
            'Music Note',
            'Heart',
            'Anger',
            'Sweat',
            'Cobweb',
            'Silence',
            'Light Bulb',
            'Zzz',
            'User-defined 1',
            'User-defined 2',
            'User-defined 3',
            'User-defined 4',
            'User-defined 5'
        ];

        // Balloon emojis for preview
        this.balloonEmojis = [
            '❗',  // Exclamation
            '❓',  // Question
            '♪',   // Music Note
            '❤️',  // Heart
            '💢',  // Anger
            '💧',  // Sweat
            '🕸️',  // Cobweb
            '💭',  // Silence
            '💡',  // Light Bulb
            '💤',  // Zzz
            '①',   // User-defined 1
            '②',   // User-defined 2
            '③',   // User-defined 3
            '④',   // User-defined 4
            '⑤'    // User-defined 5
        ];
    }

    show(command, callback, eventData = null) {
        this.callback = callback;
        this.currentEventData = eventData; // Store event data for character preview

        if (command && command.code === 213) {
            const params = command.parameters;
            this.characterId = params[0] !== undefined ? params[0] : -1;
            this.balloonId = params[1] || 1;
            this.waitForCompletion = params[2] !== undefined ? params[2] : true;
        } else {
            this.characterId = -1;
            this.balloonId = 1;
            this.waitForCompletion = true;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'show-balloon-icon-editor-modal';
        this.modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 10005;
            justify-content: center;
            align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'show-balloon-icon-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 750px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        document.body.appendChild(this.modal);
    }

    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.show-balloon-icon-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top-left-radius: 6px;
            border-top-right-radius: 6px;
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Show Balloon Icon')}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

        // Character selector
        const charRow = document.createElement('div');
        charRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const charLabel = document.createElement('span');
        charLabel.textContent = tt('Character:');
        charLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 100px;';

        const charSelect = document.createElement('select');
        charSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;
        charSelect.innerHTML = `
            <option value="-1">${window.I18n ? window.I18n.tText('Player') : 'Player'}</option>
            <option value="0">${window.I18n ? window.I18n.tText('This Event') : 'This Event'}</option>
        `;

        // Get current map events
        const currentProject = this.projectController.getCurrentProject ?
            this.projectController.getCurrentProject() :
            this.projectController.currentProject;

        let mapData = null;
        if (this.projectController && this.projectController.tilemapManager) {
            mapData = this.projectController.tilemapManager.currentMap;
        }

        // Add events from current map
        if (mapData && mapData.events) {
            mapData.events.forEach((event, index) => {
                if (event && index > 0) {
                    const eventName = event.name || `${tt('Event')} ${index.toString().padStart(3, '0')}`;
                    const option = document.createElement('option');
                    option.value = index;
                    option.textContent = `${tt('Event')} ${index.toString().padStart(3, '0')} - ${eventName}`;
                    charSelect.appendChild(option);
                }
            });
        } else {
            // Fallback: add generic event IDs
            for (let i = 1; i <= 20; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${tt('Event')} ${i.toString().padStart(3, '0')}`;
                charSelect.appendChild(option);
            }
        }

        charSelect.value = this.characterId.toString();
        charSelect.addEventListener('change', (e) => {
            this.characterId = parseInt(e.target.value);
            this.loadCharacterSprite(); // Reload sprite when character changes
        });

        charRow.appendChild(charLabel);
        charRow.appendChild(charSelect);
        content.appendChild(charRow);

        // Balloon icon selector with grid and preview side-by-side
        const balloonSection = document.createElement('div');
        balloonSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const balloonLabel = document.createElement('div');
        balloonLabel.textContent = tt('Balloon Icon:');
        balloonLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        balloonSection.appendChild(balloonLabel);

        // Container for grid and preview side-by-side
        const gridAndPreviewContainer = document.createElement('div');
        gridAndPreviewContainer.style.cssText = 'display: flex; gap: 16px;';

        // Balloon grid
        const balloonGrid = document.createElement('div');
        balloonGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
            flex: 1;
        `;

        // Load balloon sprite sheet
        const path = require('path');
        let balloonPath = null;

        if (currentProject) {
            balloonPath = path.join(currentProject.path, 'img', 'system', 'Balloon.png');
        }

        for (let i = 0; i < 15; i++) {
            const balloonBtn = document.createElement('button');
            balloonBtn.className = 'balloon-btn';
            const balloonIndex = i + 1;
            const isSelected = (this.balloonId === balloonIndex);

            balloonBtn.style.cssText = `
                padding: 8px;
                background-color: ${isSelected ? 'var(--color-accent)' : 'var(--color-bg-input)'};
                color: var(--color-text-strong);
                border: 2px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border-input)'};
                border-radius: 3px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
                transition: all 0.15s;
            `;

            // Create canvas for balloon icon (show last frame)
            const canvas = document.createElement('canvas');
            canvas.width = 48;
            canvas.height = 48;
            canvas.style.cssText = `
                image-rendering: pixelated;
                image-rendering: -moz-crisp-edges;
                image-rendering: crisp-edges;
            `;

            const ctx = canvas.getContext('2d');

            // Load and draw balloon icon (use closure to capture the correct row index)
            if (balloonPath) {
                ((rowIndex, context) => {
                    const img = new Image();
                    img.src = 'file://' + balloonPath.replace(/\\/g, '/');
                    img.onload = () => {
                        // Balloon.png format: 8 columns (animation frames) x 15 rows (balloon types)
                        // Each balloon sprite is 48x48
                        const frameWidth = 48;
                        const frameHeight = 48;
                        const col = 7; // Last frame (most prominent) for static preview

                        context.drawImage(
                            img,
                            col * frameWidth, rowIndex * frameHeight,
                            frameWidth, frameHeight,
                            0, 0,
                            48, 48
                        );
                    };
                })(i, ctx);
            }

            const name = document.createElement('div');
            name.textContent = tt(this.balloonNames[i]);
            name.style.cssText = `font-size: 9px; color: ${isSelected ? 'var(--color-bg-deep)' : 'var(--color-text-muted)'}; text-align: center; line-height: 1.2; max-width: 60px;`;

            balloonBtn.appendChild(canvas);
            balloonBtn.appendChild(name);

            balloonBtn.addEventListener('click', () => {
                this.balloonId = balloonIndex;
                this.updateBalloonSelection();
                this.startPreviewAnimation();
            });

            balloonBtn.addEventListener('mouseenter', () => {
                if (!isSelected) {
                    balloonBtn.style.backgroundColor = '#3d3d3d';
                    balloonBtn.style.borderColor = 'var(--color-text-dim)';
                }
            });

            balloonBtn.addEventListener('mouseleave', () => {
                if (!isSelected) {
                    balloonBtn.style.backgroundColor = 'var(--color-bg-input)';
                    balloonBtn.style.borderColor = 'var(--color-border-input)';
                }
            });

            balloonGrid.appendChild(balloonBtn);
        }

        // Preview area with animated balloon and character sprite
        const previewSection = document.createElement('div');
        previewSection.style.cssText = `
            width: 240px;
            padding: 20px;
            background-color: #0a0a0a;
            border: 1px solid var(--color-border);
            border-radius: 3px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
        `;

        const previewLabel = document.createElement('div');
        previewLabel.textContent = tt('Preview');
        previewLabel.style.cssText = 'color: var(--color-text-muted); font-size: 11px;';
        previewSection.appendChild(previewLabel);

        // Container for character + balloon (adaptable to sprite size)
        const spriteContainer = document.createElement('div');
        spriteContainer.className = 'sprite-container';
        spriteContainer.style.cssText = `
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        `;

        // Balloon canvas (positioned above character)
        const balloonCanvas = document.createElement('canvas');
        balloonCanvas.className = 'balloon-preview';
        balloonCanvas.width = 48;
        balloonCanvas.height = 48;
        balloonCanvas.style.cssText = `
            image-rendering: pixelated;
            image-rendering: -moz-crisp-edges;
            image-rendering: crisp-edges;
            opacity: 0;
        `;

        // Character sprite canvas (size will be determined dynamically)
        const characterCanvas = document.createElement('canvas');
        characterCanvas.className = 'character-preview';
        characterCanvas.style.cssText = `
            image-rendering: pixelated;
            image-rendering: -moz-crisp-edges;
            image-rendering: crisp-edges;
        `;

        spriteContainer.appendChild(balloonCanvas);
        spriteContainer.appendChild(characterCanvas);
        previewSection.appendChild(spriteContainer);

        gridAndPreviewContainer.appendChild(balloonGrid);
        gridAndPreviewContainer.appendChild(previewSection);
        balloonSection.appendChild(gridAndPreviewContainer);
        content.appendChild(balloonSection);

        // Wait for completion checkbox
        const waitRow = document.createElement('div');
        waitRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const waitCheckbox = document.createElement('input');
        waitCheckbox.type = 'checkbox';
        waitCheckbox.id = 'wait-for-completion';
        waitCheckbox.checked = this.waitForCompletion;
        waitCheckbox.addEventListener('change', (e) => {
            this.waitForCompletion = e.target.checked;
        });

        const waitLabel = document.createElement('label');
        waitLabel.htmlFor = 'wait-for-completion';
        waitLabel.textContent = tt('Wait for Completion');
        waitLabel.style.cssText = 'color: var(--color-text); font-size: 12px; cursor: pointer;';

        waitRow.appendChild(waitCheckbox);
        waitRow.appendChild(waitLabel);
        content.appendChild(waitRow);

        container.appendChild(content);

        // Footer
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
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.style.cssText = `
            padding: 6px 20px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);

        // Load and display character sprite
        this.loadCharacterSprite();

        // Auto-start preview animation
        setTimeout(() => this.startPreviewAnimation(), 100);
    }

    updateBalloonSelection() {
        // Update button styles without rebuilding the entire modal
        const balloonButtons = this.modal.querySelectorAll('.balloon-btn');
        balloonButtons.forEach((btn, index) => {
            const balloonIndex = index + 1;
            const isSelected = (this.balloonId === balloonIndex);

            btn.style.backgroundColor = isSelected ? 'var(--color-accent)' : 'var(--color-bg-input)';
            btn.style.borderColor = isSelected ? 'var(--color-accent)' : 'var(--color-border-input)';

            const nameLabel = btn.querySelector('div');
            if (nameLabel) {
                nameLabel.style.color = isSelected ? 'var(--color-bg-deep)' : 'var(--color-text-muted)';
            }
        });
    }

    loadCharacterSprite() {
        const characterCanvas = this.modal.querySelector('.character-preview');
        if (!characterCanvas) {
            console.log('ShowBalloonIcon: No character canvas found');
            return;
        }

        const ctx = characterCanvas.getContext('2d');
        ctx.clearRect(0, 0, characterCanvas.width, characterCanvas.height);

        const currentProject = this.projectController.getCurrentProject ?
            this.projectController.getCurrentProject() :
            this.projectController.currentProject;

        if (!currentProject) {
            console.log('ShowBalloonIcon: No current project');
            return;
        }

        const path = require('path');
        const fs = require('fs');

        let characterName = null;
        let characterIndex = 0;

        console.log('ShowBalloonIcon: Loading character sprite for characterId:', this.characterId);

        // Determine which character to show
        if (this.characterId === -1) {
            // Player - get from System.json
            try {
                const systemPath = path.join(currentProject.path, 'data', 'System.json');
                const systemData = JSON.parse(fs.readFileSync(systemPath, 'utf8'));
                console.log('ShowBalloonIcon: System data:', systemData.partyMembers);
                if (systemData.partyMembers && systemData.partyMembers.length > 0) {
                    const leaderId = systemData.partyMembers[0];
                    const actorsPath = path.join(currentProject.path, 'data', 'Actors.json');
                    const actorsData = JSON.parse(fs.readFileSync(actorsPath, 'utf8'));
                    const leader = actorsData[leaderId];
                    console.log('ShowBalloonIcon: Leader actor:', leader);
                    if (leader) {
                        characterName = leader.characterName;
                        characterIndex = leader.characterIndex;
                    }
                }
            } catch (e) {
                console.error('Failed to load player character:', e);
            }
        } else if (this.characterId === 0) {
            // This Event - get from current event being edited
            console.log('ShowBalloonIcon: Current event data:', this.currentEventData);
            if (this.currentEventData && this.currentEventData.pages && this.currentEventData.pages.length > 0) {
                const currentPage = this.currentEventData.pages[0]; // Use first page for preview
                console.log('ShowBalloonIcon: Event page image:', currentPage.image);
                if (currentPage.image) {
                    characterName = currentPage.image.characterName;
                    characterIndex = currentPage.image.characterIndex;
                }
            }
        } else {
            // Specific event ID - load from current map data
            // Get the current map from the tilemapManager
            console.log('ShowBalloonIcon: ProjectController:', this.projectController);
            let mapData = null;

            if (this.projectController && this.projectController.tilemapManager) {
                mapData = this.projectController.tilemapManager.currentMap;
            }

            console.log('ShowBalloonIcon: Map data:', mapData);

            if (mapData && mapData.events) {
                const mapEvents = mapData.events;
                if (mapEvents && mapEvents[this.characterId]) {
                    const event = mapEvents[this.characterId];
                    console.log('ShowBalloonIcon: Event data:', event);
                    if (event && event.pages && event.pages.length > 0) {
                        const eventPage = event.pages[0]; // Use first page for preview
                        console.log('ShowBalloonIcon: Event page image:', eventPage.image);
                        if (eventPage.image) {
                            characterName = eventPage.image.characterName;
                            characterIndex = eventPage.image.characterIndex;
                        }
                    }
                }
            }
        }

        console.log('ShowBalloonIcon: Character name:', characterName, 'index:', characterIndex);

        // If we have a character name, load and draw the sprite
        if (characterName && characterName.trim() !== '') {
            const characterImage = new Image();
            const imagePath = path.join(currentProject.path, 'img', 'characters', characterName + '.png');
            characterImage.src = RRAssetFiles.toUrl(imagePath);

            characterImage.onload = () => {
                // Detect character sheet format based on filename and image size
                const isSingleCharacter = RRAssetFiles.isBigCharacter(characterName);

                let cols, rows, frameWidth, frameHeight;

                if (isSingleCharacter) {
                    // Single character sheet: 3 columns (frames) x 4 rows (directions)
                    cols = 3;
                    rows = 4;
                    frameWidth = characterImage.width / cols;
                    frameHeight = characterImage.height / rows;
                } else {
                    // Standard multi-character sheet
                    // Each character is 3 frames wide x 4 directions tall
                    // Characters are arranged in a grid (typically 4 across, 2 down)
                    frameWidth = characterImage.width / 12; // 4 characters * 3 frames
                    frameHeight = characterImage.height / 8; // 2 rows * 4 directions

                    const charsPerRow = 4;
                    const charCol = characterIndex % charsPerRow;
                    const charRow = Math.floor(characterIndex / charsPerRow);

                    // Calculate position of this specific character
                    const charStartX = charCol * (frameWidth * 3);
                    const charStartY = charRow * (frameHeight * 4);

                    // Extract middle frame (column 1), facing down (row 0)
                    const sourceX = charStartX + frameWidth;
                    const sourceY = charStartY;

                    // Set canvas size to match frame size
                    characterCanvas.width = frameWidth;
                    characterCanvas.height = frameHeight;

                    ctx.drawImage(
                        characterImage,
                        sourceX, sourceY,
                        frameWidth, frameHeight,
                        0, 0,
                        frameWidth, frameHeight
                    );
                    return;
                }

                // For single character sheets ($ or !$)
                // Extract middle frame (column 1), facing down (row 0)
                const sourceX = frameWidth; // Column 1 (0-indexed)
                const sourceY = 0; // Row 0 (facing down)

                // Set canvas size to match frame size
                characterCanvas.width = frameWidth;
                characterCanvas.height = frameHeight;

                ctx.drawImage(
                    characterImage,
                    sourceX, sourceY,
                    frameWidth, frameHeight,
                    0, 0,
                    frameWidth, frameHeight
                );
            };

            characterImage.onerror = () => {
                console.error('Failed to load character image:', imagePath);
            };
        }
    }

    startPreviewAnimation() {
        const previewCanvas = this.modal.querySelector('.balloon-preview');
        if (!previewCanvas) return;

        // Stop any existing animation
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
        }

        const ctx = previewCanvas.getContext('2d');

        // Load balloon sprite sheet
        const currentProject = this.projectController.getCurrentProject ?
            this.projectController.getCurrentProject() :
            this.projectController.currentProject;

        if (!currentProject) return;

        const path = require('path');
        const balloonImage = new Image();
        const balloonPath = path.join(currentProject.path, 'img', 'system', 'Balloon.png');
        balloonImage.src = 'file://' + balloonPath.replace(/\\/g, '/');

        balloonImage.onload = () => {
            let frame = 0;
            const totalFrames = 8;
            const frameWidth = 48;
            const frameHeight = 48;
            const balloonRow = this.balloonId - 1;

            // Fade in
            previewCanvas.style.opacity = '1';
            previewCanvas.style.transition = 'opacity 0.3s';

            // Animate through frames (loop continuously)
            this.animationInterval = setInterval(() => {
                // Clear canvas
                ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

                // Draw current frame
                ctx.drawImage(
                    balloonImage,
                    frame * frameWidth, balloonRow * frameHeight,
                    frameWidth, frameHeight,
                    0, 0,
                    48, 48
                );

                frame++;
                if (frame >= totalFrames) {
                    frame = 0; // Loop back to start
                }
            }, 100); // 100ms per frame (about 10 FPS)
        };
    }

    buildCommand() {
        return {
            code: 213,
            indent: 0,
            parameters: [
                this.characterId,
                this.balloonId,
                this.waitForCompletion
            ]
        };
    }

    save() {
        if (this.callback) {
            const command = this.buildCommand();
            this.callback(command);
        }
        this.close();
    }

    close() {
        // Clean up animation interval
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
            this.animationInterval = null;
        }

        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShowBalloonIconEditor;
}
