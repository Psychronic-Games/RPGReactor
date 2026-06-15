/**
 * CharacterGraphicPicker - Visual picker for character graphics
 * Handles both single character (!$ or $) and multi-character sprite sheets
 */
class CharacterGraphicPicker {
    constructor(projectController) {
        this.projectController = projectController;
        // ProjectController has currentProject property
        this.currentProject = projectController.getCurrentProject ? projectController.getCurrentProject() : projectController.currentProject;
        this.onSelect = null; // Callback when a graphic is selected

        console.log('CharacterGraphicPicker initialized');
        console.log('ProjectController:', projectController);
        console.log('Current Project:', this.currentProject);
        console.log('Project Path:', this.currentProject?.path);
    }

    /**
     * Show the character graphic picker
     */
    show(currentCharacterName, currentCharacterIndex, currentPattern, currentDirection, callback) {
        this.onSelect = callback;

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'character-picker-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 20000;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 8px;
            width: 90%;
            max-width: 1000px;
            height: 85%;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        // Header
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
            <div style="font-size: 16px; font-weight: 600; color: var(--color-accent);">Select Character Graphic</div>
            <button id="char-picker-close" style="background: none; border: none; color: var(--color-text-muted); font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px; line-height: 1;">×</button>
        `;

        // Body container
        const body = document.createElement('div');
        body.style.cssText = `
            flex: 1;
            display: flex;
            overflow: hidden;
        `;

        // Left side - file list
        const fileList = document.createElement('div');
        fileList.id = 'char-file-list';
        fileList.style.cssText = `
            width: 250px;
            background-color: var(--color-bg-list-item);
            border-right: 1px solid var(--color-border);
            overflow-y: auto;
            padding: 8px;
        `;

        // Right side - sprite preview and selection
        const previewArea = document.createElement('div');
        previewArea.id = 'char-preview-area';
        previewArea.style.cssText = `
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background-color: var(--color-bg-menubar);
            display: flex;
            flex-direction: column;
            align-items: center;
        `;

        // Footer with buttons
        const footer = document.createElement('div');
        footer.style.cssText = `
            background-color: var(--color-bg-panel);
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        `;
        footer.innerHTML = `
            <button id="char-picker-clear" style="padding: 8px 16px; background: var(--color-bg-button); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; transition: background-color 0.15s;">Clear</button>
            <button id="char-picker-ok" style="padding: 8px 16px; background: var(--color-accent); color: var(--color-bg-deep); border: 1px solid var(--color-accent); border-radius: 3px; cursor: pointer; transition: background-color 0.15s; font-weight: bold;">OK</button>
            <button id="char-picker-cancel" class="rr-btn-secondary">Cancel</button>
        `;

        body.appendChild(fileList);
        body.appendChild(previewArea);

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        modal.appendChild(content);
        document.body.appendChild(modal);

        // Load character files
        this.loadCharacterFiles(fileList, previewArea, currentCharacterName);

        // Setup event listeners
        this.setupPickerEvents(modal, currentCharacterName, currentCharacterIndex, currentPattern, currentDirection);
    }

    /**
     * Load character files from project
     */
    async loadCharacterFiles(fileList, previewArea, currentCharacterName) {
        const projectPath = this.currentProject?.path;
        console.log('Loading character files from project:', projectPath);

        if (!projectPath) {
            fileList.innerHTML = '<div style="color: var(--color-text-muted); padding: 12px;">No project loaded</div>';
            console.warn('No project path available');
            return;
        }

        const charactersPath = `${projectPath}/img/characters`;
        console.log('Characters path:', charactersPath);

        try {
            const fs = require('fs');
            const path = require('path');

            if (!fs.existsSync(charactersPath)) {
                fileList.innerHTML = '<div style="color: var(--color-text-muted); padding: 12px;">Characters folder not found</div>';
                console.warn('Characters folder does not exist:', charactersPath);
                return;
            }

            console.log('Characters folder exists, reading files...');

            const files = fs.readdirSync(charactersPath)
                .filter(file => file.match(/\.(png|jpg|jpeg|gif)$/i))
                .map(file => ({
                    fullName: file,  // Keep full filename with extension for loading
                    baseName: file.replace(/\.(png|jpg|jpeg|gif)$/i, '')  // Strip extension for display/storage
                }))
                .sort((a, b) => a.baseName.localeCompare(b.baseName));

            console.log('Found character files:', files);

            fileList.innerHTML = '';

            if (files.length === 0) {
                fileList.innerHTML = '<div style="color: var(--color-text-muted); padding: 12px;">No character images found in img/characters folder</div>';
                previewArea.innerHTML = '<div style="color: var(--color-text-muted);">No character files available</div>';
                return;
            }

            files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'char-file-item';
                item.textContent = file.baseName;  // Display without extension
                item.dataset.filename = file.baseName;  // Store without extension for saving to database
                item.dataset.fullFilename = file.fullName;  // Store with extension for loading image
                item.style.cssText = `
                    padding: 8px 12px;
                    cursor: pointer;
                    border-bottom: 1px solid var(--color-border);
                    font-size: 13px;
                    color: var(--color-text);
                `;

                if (file.baseName === currentCharacterName) {
                    item.style.backgroundColor = 'var(--color-selection-mid)';
                    item.style.color = 'var(--color-link)';
                }

                item.addEventListener('mouseenter', () => {
                    if (file.baseName !== currentCharacterName) {
                        item.style.backgroundColor = 'var(--color-bg-list-item)';
                    }
                });

                item.addEventListener('mouseleave', () => {
                    if (file.baseName !== currentCharacterName) {
                        item.style.backgroundColor = '';
                    }
                });

                item.addEventListener('click', () => {
                    // Clear selection from all items
                    fileList.querySelectorAll('.char-file-item').forEach(i => {
                        i.style.backgroundColor = '';
                        i.style.color = 'var(--color-text)';
                    });

                    // Highlight selected
                    item.style.backgroundColor = 'var(--color-selection-mid)';
                    item.style.color = 'var(--color-link)';

                    // Show preview - pass the full filename for loading the image
                    this.showSpritePreview(previewArea, file.fullName, file.baseName);
                });

                fileList.appendChild(item);
            });

            // Auto-select current character if it exists
            const currentFile = files.find(f => f.baseName === currentCharacterName);
            if (currentFile) {
                this.showSpritePreview(previewArea, currentFile.fullName, currentFile.baseName);
            } else {
                previewArea.innerHTML = '<div style="color: var(--color-text-muted);">Select a character file from the list</div>';
            }

        } catch (error) {
            console.error('Error loading character files:', error);
            fileList.innerHTML = '<div style="color: #f88; padding: 12px;">Error loading files</div>';
        }
    }

    /**
     * Show sprite preview and selection grid
     * @param {HTMLElement} previewArea - The preview area element
     * @param {string} fullFilename - Full filename with extension (for loading image)
     * @param {string} baseName - Base filename without extension (for display and storage)
     */
    showSpritePreview(previewArea, fullFilename, baseName = null) {
        // If baseName not provided, strip extension from fullFilename
        if (!baseName) {
            baseName = fullFilename.replace(/\.(png|jpg|jpeg|gif)$/i, '');
        }

        const projectPath = this.currentProject?.path;

        // Use file:// protocol for NW.js
        const path = require('path');
        const imagePath = 'file://' + path.join(projectPath, 'img', 'characters', fullFilename).replace(/\\/g, '/');

        console.log('Loading character sprite:', imagePath);

        previewArea.innerHTML = '';
        previewArea.dataset.selectedFile = baseName;  // Store base name without extension

        // Check if single character sprite (!$ or $)
        const isSingleCharacter = baseName.includes('!$') || (baseName.includes('$') && !baseName.includes('!$'));

        // Create image element to get dimensions
        const img = new Image();
        img.onload = () => {
            console.log('Character sprite loaded successfully:', fullFilename);
            const spriteWidth = img.width;
            const spriteHeight = img.height;

            // Title - show base name without extension
            const title = document.createElement('div');
            title.style.cssText = 'font-size: 14px; font-weight: 600; color: var(--color-text); margin-bottom: 16px;';
            title.textContent = baseName;
            previewArea.appendChild(title);

            // Info
            const info = document.createElement('div');
            info.style.cssText = 'font-size: 12px; color: var(--color-text-muted); margin-bottom: 16px;';
            info.textContent = isSingleCharacter
                ? 'Single Character Sprite Sheet'
                : 'Multi-Character Sprite Sheet (8 characters)';
            previewArea.appendChild(info);

            // Instructions
            const instructions = document.createElement('div');
            instructions.style.cssText = 'font-size: 12px; color: var(--color-link); margin-bottom: 16px; text-align: center;';
            instructions.textContent = 'Click on the specific frame you want to use';
            previewArea.appendChild(instructions);

            // Calculate scale for frame canvases based on sprite dimensions
            // For single chars: frame is spriteWidth/3 x spriteHeight/4
            // For multi chars: frame is spriteWidth/12 x spriteHeight/8
            const maxFrameHeight = isSingleCharacter ? spriteHeight / 4 : spriteHeight / 8;
            const maxFrameWidth = isSingleCharacter ? spriteWidth / 3 : spriteWidth / 12;
            // Target: frames should be at most ~64px tall, scale up small ones (2x) but shrink large ones
            const targetHeight = 64;
            this._frameScale = Math.min(2, targetHeight / maxFrameHeight);
            if (this._frameScale < 0.5) this._frameScale = 0.5; // Don't go too tiny

            // Selection container
            const selectionContainer = document.createElement('div');
            selectionContainer.style.cssText = `
                display: inline-block;
                background: var(--color-bg-surface);
                padding: 16px;
                border-radius: 4px;
                border: 1px solid var(--color-border);
                max-width: 100%;
                overflow-x: auto;
                box-sizing: border-box;
            `;

            if (isSingleCharacter) {
                this.createSingleCharacterGrid(selectionContainer, img, spriteWidth, spriteHeight);
            } else {
                this.createMultiCharacterGrid(selectionContainer, img, spriteWidth, spriteHeight);
            }

            previewArea.appendChild(selectionContainer);
        };

        img.onerror = () => {
            console.error('Failed to load character sprite:', imagePath);
            previewArea.innerHTML = `
                <div style="color: #f88; padding: 20px; text-align: center;">
                    Failed to load image:<br>
                    ${filename}<br><br>
                    <small>Check console for details</small>
                </div>
            `;
        };

        img.src = imagePath;
    }

    /**
     * Create selection grid for single character sprite
     */
    createSingleCharacterGrid(container, img, spriteWidth, spriteHeight) {
        // Single character: 3 frames x 4 directions
        const frameWidth = spriteWidth / 3;
        const frameHeight = spriteHeight / 4;

        const directions = [
            { label: 'Down', row: 0, direction: 2 },
            { label: 'Left', row: 1, direction: 4 },
            { label: 'Right', row: 2, direction: 6 },
            { label: 'Up', row: 3, direction: 8 }
        ];

        directions.forEach(dir => {
            const rowContainer = document.createElement('div');
            rowContainer.style.cssText = 'display: flex; align-items: center; margin-bottom: 8px;';

            const label = document.createElement('div');
            label.textContent = dir.label + ':';
            label.style.cssText = 'width: 60px; color: var(--color-text); font-size: 12px;';
            rowContainer.appendChild(label);

            const framesContainer = document.createElement('div');
            framesContainer.style.cssText = 'display: flex; gap: 4px;';

            for (let pattern = 0; pattern < 3; pattern++) {
                const frameCanvas = this.createFrameCanvas(
                    img,
                    pattern * frameWidth,
                    dir.row * frameHeight,
                    frameWidth,
                    frameHeight,
                    0, // characterIndex (always 0 for single character)
                    pattern,
                    dir.direction
                );
                framesContainer.appendChild(frameCanvas);
            }

            rowContainer.appendChild(framesContainer);
            container.appendChild(rowContainer);
        });
    }

    /**
     * Create selection grid for multi-character sprite
     */
    createMultiCharacterGrid(container, img, spriteWidth, spriteHeight) {
        // Multi-character: 8 characters (4 per row), 3 frames x 4 directions each
        const charWidth = spriteWidth / 4;
        const charHeight = spriteHeight / 2;
        const frameWidth = charWidth / 3;
        const frameHeight = charHeight / 4;

        // Arrange characters in a 4×2 grid layout
        const gridWrapper = document.createElement('div');
        gridWrapper.style.cssText = `
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
        `;

        for (let charIndex = 0; charIndex < 8; charIndex++) {
            const charRow = Math.floor(charIndex / 4);
            const charCol = charIndex % 4;

            const charContainer = document.createElement('div');
            charContainer.style.cssText = `
                padding: 8px;
                background: var(--color-bg-list-item);
                border-radius: 4px;
                border: 1px solid var(--color-border);
            `;

            const charTitle = document.createElement('div');
            charTitle.textContent = `Character ${charIndex}`;
            charTitle.style.cssText = 'color: var(--color-link); font-size: 13px; font-weight: 600; margin-bottom: 8px;';
            charContainer.appendChild(charTitle);

            const directions = [
                { label: 'Down', row: 0, direction: 2 },
                { label: 'Left', row: 1, direction: 4 },
                { label: 'Right', row: 2, direction: 6 },
                { label: 'Up', row: 3, direction: 8 }
            ];

            directions.forEach(dir => {
                const rowContainer = document.createElement('div');
                rowContainer.style.cssText = 'display: flex; align-items: center; margin-bottom: 4px;';

                const label = document.createElement('div');
                label.textContent = dir.label + ':';
                label.style.cssText = 'width: 60px; color: var(--color-text); font-size: 11px;';
                rowContainer.appendChild(label);

                const framesContainer = document.createElement('div');
                framesContainer.style.cssText = 'display: flex; gap: 4px;';

                for (let pattern = 0; pattern < 3; pattern++) {
                    const baseX = charCol * charWidth;
                    const baseY = charRow * charHeight;

                    const frameCanvas = this.createFrameCanvas(
                        img,
                        baseX + (pattern * frameWidth),
                        baseY + (dir.row * frameHeight),
                        frameWidth,
                        frameHeight,
                        charIndex,
                        pattern,
                        dir.direction
                    );
                    framesContainer.appendChild(frameCanvas);
                }

                rowContainer.appendChild(framesContainer);
                charContainer.appendChild(rowContainer);
            });

            gridWrapper.appendChild(charContainer);
        }

        container.appendChild(gridWrapper);
    }

    /**
     * Create a clickable canvas for a single frame
     */
    createFrameCanvas(img, sx, sy, sw, sh, characterIndex, pattern, direction) {
        const canvas = document.createElement('canvas');
        const scale = this._frameScale || 2;
        canvas.width = Math.round(sw * scale);
        canvas.height = Math.round(sh * scale);
        canvas.style.cssText = `
            border: 2px solid var(--color-border);
            cursor: pointer;
            image-rendering: pixelated;
            image-rendering: -moz-crisp-edges;
            image-rendering: crisp-edges;
        `;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

        // Store selection data
        canvas.dataset.characterIndex = characterIndex;
        canvas.dataset.pattern = pattern;
        canvas.dataset.direction = direction;

        // Hover effect
        canvas.addEventListener('mouseenter', () => {
            canvas.style.borderColor = 'var(--color-link)';
        });

        canvas.addEventListener('mouseleave', () => {
            if (!canvas.classList.contains('selected')) {
                canvas.style.borderColor = 'var(--color-border)';
            }
        });

        // Click to select
        canvas.addEventListener('click', () => {
            // Clear previous selection
            const allCanvases = document.querySelectorAll('#char-preview-area canvas');
            allCanvases.forEach(c => {
                c.classList.remove('selected');
                c.style.borderColor = 'var(--color-border)';
            });

            // Mark as selected
            canvas.classList.add('selected');
            canvas.style.borderColor = '#00ff00';
        });

        return canvas;
    }

    /**
     * Setup event listeners for the picker
     */
    setupPickerEvents(modal, currentCharacterName, currentCharacterIndex, currentPattern, currentDirection) {
        const closeBtn = modal.querySelector('#char-picker-close');
        const okBtn = modal.querySelector('#char-picker-ok');
        const cancelBtn = modal.querySelector('#char-picker-cancel');
        const clearBtn = modal.querySelector('#char-picker-clear');

        const closeModal = () => {
            document.body.removeChild(modal);
        };

        // Add hover effects to Cancel and Clear buttons
        [cancelBtn, clearBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('mouseenter', () => { btn.style.backgroundColor = 'var(--color-accent-tint-25)'; btn.style.borderColor = 'var(--color-accent)'; });
                btn.addEventListener('mouseleave', () => { btn.style.backgroundColor = 'var(--color-bg-button)'; btn.style.borderColor = 'var(--color-border-input)'; });
            }
        });
        // Add hover effects to OK button (gold)
        if (okBtn) {
            okBtn.addEventListener('mouseenter', () => { okBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
            okBtn.addEventListener('mouseleave', () => { okBtn.style.backgroundColor = 'var(--color-accent)'; });
        }

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        clearBtn.addEventListener('click', () => {
            if (this.onSelect) {
                this.onSelect({
                    characterName: '',
                    characterIndex: 0,
                    pattern: 0,
                    direction: 2
                });
            }
            closeModal();
        });

        okBtn.addEventListener('click', () => {
            const previewArea = modal.querySelector('#char-preview-area');
            const selectedFile = previewArea.dataset.selectedFile || '';
            const selectedCanvas = modal.querySelector('#char-preview-area canvas.selected');

            if (selectedCanvas && selectedFile) {
                const result = {
                    characterName: selectedFile,
                    characterIndex: parseInt(selectedCanvas.dataset.characterIndex),
                    pattern: parseInt(selectedCanvas.dataset.pattern),
                    direction: parseInt(selectedCanvas.dataset.direction)
                };

                if (this.onSelect) {
                    this.onSelect(result);
                }
                closeModal();
            } else {
                alert('Please select a character frame');
            }
        });

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CharacterGraphicPicker;
}
