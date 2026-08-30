/**
 * MessageCommandEditor - Editor for Show Text event commands
 * Handles code 101 (Show Text header) and 401 (text lines)
 */
class MessageCommandEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.command = null;
        this.textLines = ['', '', '', '']; // 4 lines of text
        this.faceImage = '';
        this.faceIndex = 0;
        this.background = 0; // 0=window, 1=dim, 2=transparent
        this.positionType = 2; // 0=top, 1=middle, 2=bottom
        this.speakerName = '';
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    /**
     * Show editor for a message command
     * @param {object} messageData - The message data to edit (or null for new)
     *                               Can be { command: {...}, textLines: [...] } or just a command object
     * @param {function} callback - Callback when done editing
     */
    show(messageData, callback) {
        this.callback = callback;

        if (messageData) {
            if (messageData.command && messageData.command.code === 101) {
                // Editing existing message with text lines
                this.parseCommand(messageData.command, messageData.textLines || []);
            } else if (messageData.code === 101) {
                // Editing existing message (old format, no text lines)
                this.parseCommand(messageData, []);
            } else {
                // New message - use defaults
                this.resetToDefaults();
            }
        } else {
            // New message - use defaults
            this.resetToDefaults();
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    /**
     * Parse existing message command
     */
    parseCommand(command, textLines = []) {
        // Code 101 parameters: [faceName, faceIndex, background, positionType, speakerName]
        this.faceImage = command.parameters[0] || '';
        this.faceIndex = command.parameters[1] || 0;
        this.background = command.parameters[2] || 0;
        // 0 is Top, which is falsy — `||` silently rewrote it to Bottom.
        this.positionType = command.parameters[3] ?? 2;
        this.speakerName = command.parameters[4] || '';

        // Set text lines from the 401 commands
        this.textLines = ['', '', '', ''];
        for (let i = 0; i < Math.min(textLines.length, 4); i++) {
            this.textLines[i] = textLines[i] || '';
        }
    }

    /**
     * Reset to default values
     */
    resetToDefaults() {
        this.faceImage = '';
        this.faceIndex = 0;
        this.background = 0;
        this.positionType = 2;
        this.speakerName = '';
        this.textLines = ['', '', '', ''];
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'message-command-editor-modal';
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
        container.className = 'message-command-container rr-modal';
        container.style.cssText = `width: min(1100px, calc(100vw - 24px)); max-height: 92vh;`;

        this.modal.appendChild(container);

        // Close on background click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Render modal content
     */
    renderContent() {
        const container = this.modal.querySelector('.message-command-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${this._t('Show Text')}</div>
            <button class="rr-modal-close close-btn" type="button">×</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content area
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            overflow-y: auto;
            min-height: 0;
        `;

        // Main row: Face selector (left) + Text input (right)
        const mainRow = document.createElement('div');
        mainRow.style.cssText = `
            display: flex;
            gap: 12px;
        `;

        // Face selector column
        mainRow.appendChild(this.createFaceSelector());

        // Text input column
        mainRow.appendChild(this.createTextInput());

        content.appendChild(mainRow);

        // Bottom row: Name, Background, Position, Preview
        content.appendChild(this.createControlsRow());

        container.appendChild(content);

        // Footer with OK/Cancel
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = this._t('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = this._t('OK');
        okBtn.className = 'rr-button-primary';
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);

        // Update face preview after DOM is ready
        setTimeout(() => {
            this.updateFacePreview();
        }, 0);
    }

    /**
     * Create face selector column
     */
    createFaceSelector() {
        const column = document.createElement('div');
        column.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 150px;
        `;

        const label = document.createElement('div');
        label.textContent = this._t('Face:');
        label.style.cssText = 'font-weight: bold; font-size: 13px; color: var(--color-text);';

        // Face preview canvas (144x144 to show one face from the sheet)
        const canvas = document.createElement('canvas');
        canvas.className = 'face-preview-canvas';
        canvas.width = 144;
        canvas.height = 144;
        canvas.style.cssText = `
            border: 1px solid var(--color-border-input);
            background-color: var(--color-bg-input);
            image-rendering: pixelated;
            image-rendering: -moz-crisp-edges;
            image-rendering: crisp-edges;
            cursor: pointer;
        `;

        // Double-click to open face picker
        canvas.addEventListener('dblclick', () => this.browseFaces());

        // Browse button
        const browseBtn = document.createElement('button');
        browseBtn.textContent = this._t('Browse...');
        browseBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-bg-panel);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        `;
        browseBtn.addEventListener('click', () => this.browseFaces());

        // Clear button
        const clearBtn = document.createElement('button');
        clearBtn.textContent = this._t('Clear');
        clearBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-bg-panel);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        `;
        clearBtn.addEventListener('click', () => {
            this.faceImage = '';
            this.faceIndex = 0;
            this.updateFacePreview();
        });

        column.appendChild(label);
        column.appendChild(canvas);
        column.appendChild(browseBtn);
        column.appendChild(clearBtn);

        // Face preview will be updated after renderContent completes

        return column;
    }

    /**
     * Create text input column (paragraph textarea with 4 lines)
     */
    createTextInput() {
        const column = document.createElement('div');
        column.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex: 1;
        `;

        const label = document.createElement('div');
        label.textContent = this._t('Message:');
        label.style.cssText = 'font-weight: bold; font-size: 13px; color: var(--color-text);';

        column.appendChild(label);

        // Join the 4 lines with newlines for the textarea
        const messageText = this.textLines.join('\n');

        // Create textarea for paragraph-style input
        const textarea = document.createElement('textarea');
        textarea.className = 'message-textarea';
        textarea.value = messageText;
        textarea.rows = 4;
        textarea.style.cssText = `
            padding: 8px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 13px;
            font-family: monospace;
            resize: vertical;
            min-height: 100px;
            white-space: pre;
            overflow-x: auto;
        `;
        textarea.addEventListener('input', (e) => {
            // Split by newlines and limit to 4 lines
            const lines = e.target.value.split('\n');
            this.textLines = [];
            for (let i = 0; i < 4; i++) {
                this.textLines[i] = lines[i] || '';
            }

            // If user entered more than 4 lines, trim it
            if (lines.length > 4) {
                e.target.value = this.textLines.join('\n');
            }
        });

        column.appendChild(textarea);

        // Add helper text
        const helper = document.createElement('div');
        helper.textContent = this._t('Maximum 4 lines of text');
        helper.style.cssText = 'font-size: 11px; color: var(--color-text-muted); margin-top: -4px;';
        column.appendChild(helper);

        return column;
    }

    /**
     * Create controls row (Name, Background, Position, Preview)
     */
    createControlsRow() {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            gap: 12px;
            align-items: center;
            padding-top: 8px;
            border-top: 1px solid var(--color-border);
        `;

        // Name field
        const nameGroup = document.createElement('div');
        nameGroup.style.cssText = 'display: flex; align-items: center; gap: 6px;';

        const nameLabel = document.createElement('label');
        nameLabel.textContent = this._t('Name:');
        nameLabel.style.cssText = 'color: var(--color-text); font-size: 12px;';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = this.speakerName;
        nameInput.className = 'speaker-name-input';
        nameInput.style.cssText = `
            padding: 4px 8px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 120px;
        `;
        nameInput.addEventListener('input', (e) => {
            this.speakerName = e.target.value;
        });

        nameGroup.appendChild(nameLabel);
        nameGroup.appendChild(nameInput);

        // Background dropdown
        const bgGroup = document.createElement('div');
        bgGroup.style.cssText = 'display: flex; align-items: center; gap: 6px;';

        const bgLabel = document.createElement('label');
        bgLabel.textContent = this._t('Background:');
        bgLabel.style.cssText = 'color: var(--color-text); font-size: 12px;';

        const bgSelect = document.createElement('select');
        bgSelect.className = 'background-select';
        bgSelect.style.cssText = `
            padding: 4px 8px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
        `;
        bgSelect.innerHTML = `
            <option value="0">${window.I18n ? window.I18n.tText('Window') : 'Window'}</option>
            <option value="1">${window.I18n ? window.I18n.tText('Dim') : 'Dim'}</option>
            <option value="2">${window.I18n ? window.I18n.tText('Transparent') : 'Transparent'}</option>
        `;
        bgSelect.value = this.background.toString();
        bgSelect.addEventListener('change', (e) => {
            this.background = parseInt(e.target.value);
        });

        bgGroup.appendChild(bgLabel);
        bgGroup.appendChild(bgSelect);

        // Window Position dropdown
        const posGroup = document.createElement('div');
        posGroup.style.cssText = 'display: flex; align-items: center; gap: 6px;';

        const posLabel = document.createElement('label');
        posLabel.textContent = this._t('Window Position:');
        posLabel.style.cssText = 'color: var(--color-text); font-size: 12px;';

        const posSelect = document.createElement('select');
        posSelect.className = 'position-select';
        posSelect.style.cssText = `
            padding: 4px 8px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
        `;
        posSelect.innerHTML = `
            <option value="0">${window.I18n ? window.I18n.tText('Top') : 'Top'}</option>
            <option value="1">${window.I18n ? window.I18n.tText('Middle') : 'Middle'}</option>
            <option value="2">${window.I18n ? window.I18n.tText('Bottom') : 'Bottom'}</option>
        `;
        posSelect.value = this.positionType.toString();
        posSelect.addEventListener('change', (e) => {
            this.positionType = parseInt(e.target.value);
        });

        posGroup.appendChild(posLabel);
        posGroup.appendChild(posSelect);

        // Preview button
        const previewBtn = document.createElement('button');
        previewBtn.textContent = this._t('Preview');
        previewBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            margin-left: auto;
        `;
        previewBtn.addEventListener('click', () => this.showPreview());

        row.appendChild(nameGroup);
        row.appendChild(bgGroup);
        row.appendChild(posGroup);
        row.appendChild(previewBtn);

        return row;
    }

    /**
     * Browse for face graphics
     */
    browseFaces() {
        const currentProject = this.projectController.getCurrentProject ?
            this.projectController.getCurrentProject() :
            this.projectController.currentProject;

        if (!currentProject || !currentProject.path) {
            alert(this._t('No project loaded'));
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const facesFolder = path.join(currentProject.path, 'img', 'faces');

        if (!fs.existsSync(facesFolder)) {
            alert(this._t('Faces folder not found:') + ' ' + facesFolder);
            return;
        }

        const files = RRAssetFiles.listImageReferences(facesFolder);

        if (files.length === 0) {
            alert(this._t('No face images found'));
            return;
        }

        this.showFacePicker(files, currentProject.path);
    }

    /**
     * Show face picker dialog with improved UI
     */
    showFacePicker(files, projectPath) {
        const picker = document.createElement('div');
        picker.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            z-index: 10006;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'rr-modal';
        container.style.cssText = `width: min(900px, calc(100vw - 24px)); max-height: 85vh;`;

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.innerHTML = `
            <div class="rr-modal-title">${this._t('Select Face')}</div>
            <button class="close-picker" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer;">×</button>
        `;

        // Main content - split view (file list + preview pane)
        const mainContent = document.createElement('div');
        mainContent.style.cssText = `
            flex: 1;
            overflow: hidden;
            display: flex;
            min-width: 0;
            gap: 1px;
            background-color: var(--color-border);
        `;

        // Left side - file list
        const fileListContainer = document.createElement('div');
        fileListContainer.style.cssText = `
            width: min(280px, 35%);
            min-width: 160px;
            background-color: var(--color-bg-surface);
            overflow: hidden;
        `;

        // Right side - preview pane
        const previewPane = document.createElement('div');
        previewPane.style.cssText = `
            flex: 1;
            min-width: 0;
            background-color: var(--color-bg-surface);
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            overflow-y: auto;
        `;

        const previewTitle = document.createElement('div');
        previewTitle.textContent = this.faceImage || this._t('Select a faceset');
        previewTitle.className = 'preview-title';
        previewTitle.style.cssText = `
            color: var(--color-text);
            font-size: 14px;
            font-weight: bold;
        `;

        const faceGridContainer = document.createElement('div');
        faceGridContainer.className = 'face-grid-container';
        faceGridContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 144px));
            gap: 8px;
            justify-content: center;
            width: 100%;
        `;

        previewPane.appendChild(previewTitle);
        previewPane.appendChild(faceGridContainer);

        mainContent.appendChild(fileListContainer);
        mainContent.appendChild(previewPane);

        const path = require('path');
        let selectedFilename = this.faceImage;
        const browser = RRPickerIndex.createBrowser({
            files,
            selectedName: selectedFilename,
            folders: true,
            itemClass: 'file-list-item',
            searchPlaceholder: this._t('Search facesets...'),
            onSelect: filename => {
                selectedFilename = filename;
                previewTitle.textContent = filename;
                renderFaceGrid(filename);
            }
        });
        fileListContainer.appendChild(browser.element);

        // Render face grid for selected file
        const renderFaceGrid = (filename) => {
            faceGridContainer.innerHTML = '';

            const facesFolder = path.join(projectPath, 'img', 'faces');
            const faceSheet = new Image();

            faceSheet.onload = () => {
                const sheet = RRFaceSheet.metrics(faceSheet);
                for (let i = 0; i < sheet.count; i++) {
                    const canvas = document.createElement('canvas');
                    canvas.width = RRFaceSheet.FACE_SIZE;
                    canvas.height = RRFaceSheet.FACE_SIZE;
                    canvas.className = 'face-option';
                    canvas.dataset.index = i;
                    canvas.style.cssText = `
                        border: 3px solid ${filename === this.faceImage && i === this.faceIndex ? 'var(--color-accent)' : 'var(--color-border-input)'};
                        cursor: pointer;
                        image-rendering: pixelated;
                        image-rendering: -moz-crisp-edges;
                        image-rendering: crisp-edges;
                        transition: all 0.15s;
                        width: 100%;
                        height: auto;
                        box-sizing: border-box;
                    `;

                    const ctx = canvas.getContext('2d');
                    const source = RRFaceSheet.sourceRect(i, faceSheet);

                    ctx.drawImage(
                        faceSheet,
                        source.x, source.y,
                        source.width, source.height,
                        0, 0,
                        RRFaceSheet.FACE_SIZE, RRFaceSheet.FACE_SIZE
                    );

                    canvas.addEventListener('mouseenter', () => {
                        if (!(filename === this.faceImage && i === this.faceIndex)) {
                            canvas.style.borderColor = 'var(--color-accent)';
                        }
                    });

                    canvas.addEventListener('mouseleave', () => {
                        if (!(filename === this.faceImage && i === this.faceIndex)) {
                            canvas.style.borderColor = 'var(--color-border-input)';
                        }
                    });

                    canvas.addEventListener('click', () => {
                        this.faceImage = filename;
                        this.faceIndex = i;
                        document.body.removeChild(picker);
                        this.updateFacePreview();
                        if (this.modal) {
                            this.modal.style.zIndex = '10005';
                        }
                    });

                    faceGridContainer.appendChild(canvas);
                }
            };

            faceSheet.onerror = () => {
                faceGridContainer.innerHTML = `<div style="color: #ff6666; padding: 20px;">${this._t('Failed to load faceset image')}</div>`;
            };
            faceSheet.src = RRAssetFiles.imageUrlFor(facesFolder, filename);
        };

        // Footer
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';

        // Open in Folder button
        const openFolderBtn = document.createElement('button');
        openFolderBtn.textContent = this._t('Open in Folder');
        openFolderBtn.style.cssText = `
            padding: 6px 20px;
            background-color: var(--color-border-subtle);
            color: var(--color-text-strong);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            margin-right: auto;
        `;
        openFolderBtn.addEventListener('click', () => {
            const facesFolder = path.join(projectPath, 'img', 'faces');
            const selectedFile = selectedFilename
                ? RRAssetFiles.findImage(facesFolder, selectedFilename)
                : null;
            const facePath = selectedFile ? selectedFile.absolutePath : facesFolder;
            if (typeof nw !== 'undefined') {
                nw.Shell.showItemInFolder(facePath);
            }
        });
        openFolderBtn.addEventListener('mouseenter', () => { openFolderBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; openFolderBtn.style.borderColor = 'var(--color-accent)'; });
        openFolderBtn.addEventListener('mouseleave', () => { openFolderBtn.style.backgroundColor = 'var(--color-border-subtle)'; openFolderBtn.style.borderColor = 'var(--color-border-input)'; });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = this._t('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(picker);
        });

        footer.appendChild(openFolderBtn);
        footer.appendChild(cancelBtn);

        container.appendChild(header);
        container.appendChild(mainContent);
        container.appendChild(footer);
        picker.appendChild(container);

        header.querySelector('.close-picker').addEventListener('click', () => {
            document.body.removeChild(picker);
        });

        picker.addEventListener('click', (e) => {
            if (e.target === picker) {
                document.body.removeChild(picker);
            }
        });

        document.body.appendChild(picker);

        // Initial render
        if (selectedFilename) {
            renderFaceGrid(selectedFilename);
            browser.scrollTo(selectedFilename);
        }

        // Focus search input
        setTimeout(() => browser.searchInput.focus(), 100);
    }

    /** Show the face index picker for one loaded sheet. */
    showFaceIndexPicker(filename, projectPath) {
        const picker = document.createElement('div');
        picker.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            z-index: 10007;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'rr-modal';
        container.style.cssText = `width: min(640px, 90%); max-height: 85vh;`;

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const heading = document.createElement('h3');
        heading.style.cssText = 'margin: 0; color: var(--color-text-strong); font-size: 16px;';
        heading.textContent = filename;
        const closeButton = document.createElement('button');
        closeButton.className = 'close-picker';
        closeButton.style.cssText = 'background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer;';
        closeButton.textContent = '×';
        header.append(heading, closeButton);

        // Content - four stock face columns with as many rows as the image contains
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 144px));
            gap: 8px;
            justify-content: center;
            overflow-y: auto;
        `;

        const path = require('path');
        const facesFolder = path.join(projectPath, 'img', 'faces');

        // Load the face image
        const faceSheet = new Image();

        faceSheet.onload = () => {
            const sheet = RRFaceSheet.metrics(faceSheet);
            for (let i = 0; i < sheet.count; i++) {
                const canvas = document.createElement('canvas');
                canvas.width = RRFaceSheet.FACE_SIZE;
                canvas.height = RRFaceSheet.FACE_SIZE;
                canvas.style.cssText = `
                    border: 2px solid var(--color-border-input);
                    cursor: pointer;
                    image-rendering: pixelated;
                    image-rendering: -moz-crisp-edges;
                    image-rendering: crisp-edges;
                    width: 100%;
                    height: auto;
                    box-sizing: border-box;
                `;

                const ctx = canvas.getContext('2d');
                const source = RRFaceSheet.sourceRect(i, faceSheet);

                ctx.drawImage(
                    faceSheet,
                    source.x, source.y,
                    source.width, source.height,
                    0, 0,
                    RRFaceSheet.FACE_SIZE, RRFaceSheet.FACE_SIZE
                );

                canvas.addEventListener('mouseenter', () => {
                    canvas.style.borderColor = 'var(--color-accent)';
                });

                canvas.addEventListener('mouseleave', () => {
                    canvas.style.borderColor = 'var(--color-border-input)';
                });

                canvas.addEventListener('click', () => {
                    this.faceImage = filename;
                    this.faceIndex = i;
                    document.body.removeChild(picker);
                    // Update the preview after removing the picker to ensure proper focus
                    setTimeout(() => {
                        this.updateFacePreview();
                        // Ensure main modal is on top
                        if (this.modal) {
                            this.modal.style.zIndex = '10005';
                        }
                    }, 50);
                });

                content.appendChild(canvas);
            }
        };

        faceSheet.onerror = () => {
            content.innerHTML = `<div style="color: #ff6666; padding: 20px;">${this._t('Failed to load face image')}</div>`;
        };
        faceSheet.src = RRAssetFiles.imageUrlFor(facesFolder, filename);

        container.appendChild(header);
        container.appendChild(content);
        picker.appendChild(container);

        header.querySelector('.close-picker').addEventListener('click', () => {
            document.body.removeChild(picker);
        });

        picker.addEventListener('click', (e) => {
            if (e.target === picker) {
                document.body.removeChild(picker);
            }
        });

        document.body.appendChild(picker);
    }

    /**
     * Update face preview canvas
     */
    updateFacePreview() {
        const canvas = this.modal ? this.modal.querySelector('.face-preview-canvas') : null;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!this.faceImage) return;

        const currentProject = this.projectController.getCurrentProject ?
            this.projectController.getCurrentProject() :
            this.projectController.currentProject;

        if (!currentProject) return;

        const path = require('path');
        const facesFolder = path.join(currentProject.path, 'img', 'faces');
        const imagePath = RRAssetFiles.imageUrlFor(facesFolder, this.faceImage);

        const faceSheet = new Image();

        faceSheet.onload = () => {
            const source = RRFaceSheet.sourceRect(this.faceIndex, faceSheet);
            if (!source) return;

            ctx.drawImage(
                faceSheet,
                source.x, source.y,
                source.width, source.height,
                0, 0,
                RRFaceSheet.FACE_SIZE, RRFaceSheet.FACE_SIZE
            );
        };

        faceSheet.onerror = () => {
            console.error('Failed to load face image:', imagePath);
        };
        faceSheet.src = imagePath;
    }

    /**
     * Show preview of the message in-game
     */
    showPreview() {
        alert(this._t('Preview functionality will be implemented in the game engine preview system.'));
    }

    /**
     * Build command array from current data
     */
    buildCommands() {
        const commands = [];

        // First command: code 101 (Show Text header)
        commands.push({
            code: 101,
            indent: 0,
            parameters: [
                this.faceImage,
                this.faceIndex,
                this.background,
                this.positionType,
                this.speakerName
            ]
        });

        // Following commands: code 401 (text lines). Emit through the last
        // non-empty line so interior blank lines survive the round-trip;
        // only trailing blanks are trimmed.
        let lastLine = 0;
        for (let i = 0; i < 4; i++) {
            if (this.textLines[i]) lastLine = i;
        }
        for (let i = 0; i <= lastLine; i++) {
            commands.push({
                code: 401,
                indent: 0,
                parameters: [this.textLines[i] || '']
            });
        }

        return commands;
    }

    /**
     * Save and return commands
     */
    save() {
        if (this.callback) {
            const commands = this.buildCommands();
            this.callback(commands);
        }
        this.close();
    }

    /**
     * Close modal
     */
    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MessageCommandEditor;
}
