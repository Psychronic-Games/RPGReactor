/**
 * MessageCommandEditor - Editor for Show Text event commands
 * Handles code 101 (Show Text header) and 401 (text lines)
 *
 * This edits a *run* of message boxes, not a single one. A conversation on disk
 * is several 101 headers in a row, each with its own face, name, background and
 * position, and each followed by its own 401 lines - so opening one box in
 * isolation meant an author had to close and reopen the dialog for every box of
 * a five-box exchange. The box strip down the left is that run; adding, removing
 * and reordering there is what MZ's Batch Entry only approximates by splitting
 * overflow text on save.
 *
 * The four-line cap is gone, and its removal is a bug fix rather than a feature:
 * the old input handler kept the first four lines and wrote the truncated value
 * straight back into the field, so pasting eight lines silently destroyed four.
 * Overflow now splits into as many boxes as the message window's height needs -
 * which is MessageCore's MessageRows when that plugin is enabled, and four
 * otherwise.
 *
 * `faceImage`, `faceIndex`, `background`, `positionType` and `speakerName` are
 * accessors onto the active box's header rather than plain fields. The face
 * browser and its two pickers are several hundred lines that read and write
 * them by name; routing them to the active box keeps all of that working
 * untouched instead of threading a box index through code that has nothing to
 * do with this change.
 */
class MessageCommandEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.command = null;

        this.boxes = [this._emptyBox()];
        this.activeIndex = 0;

        this._skin = null;
        this._plugins = null;
        // One per field the menu is attached to; cleared together on close.
        this._detachMenus = [];
        // Whether this message runs in battle, which is what decides if the
        // battle-only text codes are offered. Set by the host, not guessed.
        this._inBattle = false;

        this._defineHeaderAccessors();
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    _emptyBox() {
        return {
            header: {
                faceName: '',
                faceIndex: 0,
                background: 0,
                positionType: 2,
                speakerName: ''
            },
            lines: ['']
        };
    }

    /** The header the flat accessors read and write. */
    _activeHeader() {
        if (!this.boxes.length) this.boxes = [this._emptyBox()];
        const index = Math.max(0, Math.min(this.activeIndex, this.boxes.length - 1));
        this.activeIndex = index;
        return this.boxes[index].header;
    }

    _defineHeaderAccessors() {
        const map = {
            faceImage: 'faceName',
            faceIndex: 'faceIndex',
            background: 'background',
            positionType: 'positionType',
            speakerName: 'speakerName'
        };
        for (const [flat, key] of Object.entries(map)) {
            Object.defineProperty(this, flat, {
                configurable: true,
                enumerable: true,
                get: () => this._activeHeader()[key],
                set: value => { this._activeHeader()[key] = value; }
            });
        }
    }

    /** The active box's text as one string, which is what the textarea holds. */
    get textLines() {
        if (!this.boxes.length) return [''];
        return this.boxes[Math.min(this.activeIndex, this.boxes.length - 1)].lines;
    }

    set textLines(lines) {
        if (!this.boxes.length) this.boxes = [this._emptyBox()];
        this.boxes[Math.min(this.activeIndex, this.boxes.length - 1)].lines =
            Array.isArray(lines) ? lines.slice() : [''];
    }

    /**
     * The plugin manifest, for text-code gating and the row count.
     *
     * Read from disk rather than from the Plugin Manager: its `plugins` array
     * is only populated once that window has been opened, so on a fresh editor
     * it is empty and MessageCore would read as absent.
     */
    _pluginList() {
        if (this._plugins) return this._plugins;
        this._plugins = window.RRTextCodes
            ? window.RRTextCodes.readManifest(this._projectPath())
            : [];
        return this._plugins;
    }

    _messageRows() {
        return window.RRTextCodes ? window.RRTextCodes.messageRows(this._pluginList()) : 4;
    }

    _projectPath() {
        const project = this.projectController.getCurrentProject
            ? this.projectController.getCurrentProject()
            : this.projectController.currentProject;
        return (project && project.path) || '';
    }

    /**
     * Show editor for a message command
     * @param {object} messageData - The message data to edit (or null for new)
     *                               Can be { command: {...}, textLines: [...] } or just a command object
     * @param {function} callback - Callback when done editing
     */
    show(messageData, callback) {
        this.callback = callback;
        this._plugins = null;
        // The host knows whether this event runs in battle; the dialog cannot
        // work it out from the command it was handed.
        this._inBattle = Boolean(messageData && messageData.inBattle);

        if (messageData && Array.isArray(messageData.boxes) && messageData.boxes.length) {
            // The whole run, read by RRMessageBoxes.collectRun.
            this.boxes = messageData.boxes.map(box => ({
                header: { ...box.header },
                lines: (box.lines || []).slice()
            }));
            this.activeIndex = 0;
        } else if (messageData && messageData.command && messageData.command.code === 101) {
            this.parseCommand(messageData.command, messageData.textLines || []);
        } else if (messageData && messageData.code === 101) {
            this.parseCommand(messageData, []);
        } else {
            this.resetToDefaults();
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
        this._loadSkin();

        // The guide is measured with the project's own font, so it has to be
        // registered before the measurement means anything. Both are cached, so
        // this is a one-off cost on the first open.
        this.ensurePreviewAssets().then(() => this.updateGuide());
    }

    /**
     * Parse a single existing message command.
     *
     * Retained for the older `{ command, textLines }` call shape. No line cap:
     * a run authored by MZ's Batch Entry, or by a plugin, can legitimately carry
     * more 401s than the window has rows, and dropping them here would delete
     * text the moment the author pressed OK.
     */
    parseCommand(command, textLines = []) {
        const header = window.RRMessageBoxes
            ? window.RRMessageBoxes.readHeader(command)
            : {
                faceName: command.parameters[0] || '',
                faceIndex: command.parameters[1] || 0,
                background: command.parameters[2] || 0,
                // 0 is Top, which is falsy - `||` silently rewrote it to Bottom.
                positionType: command.parameters[3] ?? 2,
                speakerName: command.parameters[4] || ''
            };

        this.boxes = [{ header, lines: textLines.length ? textLines.slice() : [''] }];
        this.activeIndex = 0;
    }

    /**
     * Reset to default values
     */
    resetToDefaults() {
        this.boxes = [this._emptyBox()];
        this.activeIndex = 0;
    }

    /** Load the project windowskin once per open, for colours and the preview. */
    _loadSkin() {
        const projectPath = this._projectPath();
        if (!projectPath || !window.RRWindowskin) return;
        const skinPath = require('path').join(projectPath, 'img', 'system', 'Window.png');
        window.RRWindowskin.load(skinPath)
            .then(record => {
                this._skin = record;
                const panel = this.modal && this.modal.querySelector('.rr-text-code-panel');
                if (panel && panel.refresh) panel.refresh();
            })
            .catch(() => {
                // A project without a windowskin still gets the dialog; the
                // colour picker falls back to the stock palette and says so.
                this._skin = null;
            });
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
        // Four columns now ride in the main row - the box strip, the face, the
        // text and the code reference - so the dialog is wider than the two-column
        // version it replaces, while still collapsing on a narrow window.
        container.style.cssText = `width: min(1500px, calc(100vw - 24px)); max-height: 92vh;`;

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
        // Every field is about to be replaced, so the handlers attached to the
        // previous set have nothing left to detach from. Release them here
        // rather than only on close, so a re-render cannot accumulate them.
        for (const detach of this._detachMenus) detach();
        this._detachMenus = [];
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

        // Main row: box strip, face selector, text input, code reference
        const mainRow = document.createElement('div');
        mainRow.style.cssText = `
            display: flex;
            gap: 12px;
            align-items: stretch;
        `;

        mainRow.appendChild(this.createBoxStrip());
        mainRow.appendChild(this.createFaceSelector());
        mainRow.appendChild(this.createTextInput());

        if (window.RRTextCodeMenu) {
            const reference = document.createElement('div');
            reference.style.cssText = 'width: 340px; flex-shrink: 0; display: flex; flex-direction: column;';
            const heading = document.createElement('div');
            heading.textContent = this._t('Reference');
            heading.style.cssText =
                'font-weight: bold; font-size: 13px; color: var(--color-text); margin-bottom: 8px;';
            reference.appendChild(heading);
            reference.appendChild(window.RRTextCodeMenu.createReferencePanel(
                () => this.modal && this.modal.querySelector('.message-textarea'),
                this._menuOptions()));
            mainRow.appendChild(reference);
        }

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

        // Update face preview after DOM is ready. The guide and the split hint
        // wait for the same tick: the guide is measured against the textarea's
        // laid-out width, which is zero until the dialog has been through a
        // layout pass, and both should be right on open rather than only after
        // the first keystroke.
        setTimeout(() => {
            this.updateFacePreview();
            this.updateOverflowHint();
            this.updateGuide();
        }, 0);
    }

    /**
     * The run of message boxes, as an ordered strip.
     *
     * Each row is one 101 command. Selecting one swaps every control in the
     * dialog - face, name, background, position, text - because each box owns
     * its own header; that is what the data has always allowed and the editor
     * previously could not express.
     */
    createBoxStrip() {
        const column = document.createElement('div');
        column.className = 'message-box-strip';
        column.style.cssText = `
            width: 150px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px;
        `;

        const label = document.createElement('div');
        label.textContent = this._t('Message Boxes');
        label.style.cssText = 'font-weight: bold; font-size: 13px; color: var(--color-text);';
        column.appendChild(label);

        const list = document.createElement('div');
        list.className = 'message-box-list';
        list.style.cssText = `
            flex: 1; min-height: 120px; overflow-y: auto;
            border: 1px solid var(--color-border); border-radius: 3px;
            background: var(--color-bg-input);
        `;
        column.appendChild(list);

        const buttons = document.createElement('div');
        buttons.style.cssText = 'display: flex; gap: 4px;';

        const button = (text, title, onClick) => {
            const element = document.createElement('button');
            element.type = 'button';
            element.textContent = text;
            element.title = title;
            element.style.cssText = `
                flex: 1; padding: 4px 0; font-size: 12px; cursor: pointer;
                background: var(--color-bg-panel); color: var(--color-text);
                border: 1px solid var(--color-border); border-radius: 3px;
            `;
            element.addEventListener('click', onClick);
            return element;
        };

        buttons.appendChild(button('+', this._t('Add Message Box'), () => this.addBox()));
        buttons.appendChild(button('−', this._t('Remove Message Box'), () => this.removeBox()));
        buttons.appendChild(button('▲', this._t('Move Up'), () => this.moveBox(-1)));
        buttons.appendChild(button('▼', this._t('Move Down'), () => this.moveBox(1)));
        column.appendChild(buttons);

        this.renderBoxList(list);
        return column;
    }

    renderBoxList(list) {
        const container = list || (this.modal && this.modal.querySelector('.message-box-list'));
        if (!container) return;
        container.innerHTML = '';

        this.boxes.forEach((box, index) => {
            const row = document.createElement('div');
            row.style.cssText = `
                padding: 5px 8px; font-size: 11px; cursor: pointer;
                border-bottom: 1px solid var(--color-border);
                background: ${index === this.activeIndex ? 'var(--color-bg-selected)' : 'transparent'};
                color: var(--color-text);
            `;

            const title = document.createElement('div');
            title.textContent = `${index + 1}. ${box.header.speakerName || this._t('(no name)')}`;
            title.style.cssText = 'font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

            // A one-line excerpt makes a five-box run navigable without
            // clicking through every entry to find the right one.
            const excerpt = document.createElement('div');
            const firstLine = (box.lines.find(line => String(line).trim().length) || '').trim();
            excerpt.textContent = firstLine || this._t('(empty)');
            excerpt.style.cssText = `
                color: var(--color-text-muted); overflow: hidden;
                text-overflow: ellipsis; white-space: nowrap;
            `;

            row.appendChild(title);
            row.appendChild(excerpt);
            row.addEventListener('click', () => this.selectBox(index));
            container.appendChild(row);
        });
    }

    /**
     * Switch boxes, saving whatever is in the textarea first.
     *
     * The textarea is the only place the active box's text lives while the
     * dialog is open, so reading it back here is what stops a switch from
     * discarding un-committed typing.
     */
    selectBox(index) {
        this.commitTextarea();
        this.activeIndex = Math.max(0, Math.min(index, this.boxes.length - 1));
        this.refreshActiveBox();
    }

    commitTextarea() {
        const textarea = this.modal && this.modal.querySelector('.message-textarea');
        if (textarea) this.textLines = textarea.value.split('\n');
    }

    /** Push the active box back into every control after a switch. */
    refreshActiveBox() {
        if (!this.modal) return;
        const textarea = this.modal.querySelector('.message-textarea');
        if (textarea) textarea.value = this.textLines.join('\n');

        const name = this.modal.querySelector('.speaker-name-input');
        if (name) name.value = this.speakerName;

        const background = this.modal.querySelector('.background-select');
        if (background) background.value = String(this.background);

        const position = this.modal.querySelector('.position-select');
        if (position) position.value = String(this.positionType);

        this.updateFacePreview();
        this.renderBoxList();
        this.updateOverflowHint();
        this.updateGuide();
    }

    addBox() {
        this.commitTextarea();
        // Inherit the current header: the next line of a conversation is
        // usually the same speaker, and copying beats retyping the face.
        const previous = this.boxes[this.activeIndex];
        const box = window.RRMessageBoxes
            ? window.RRMessageBoxes.newBox(previous && previous.header)
            : this._emptyBox();
        this.boxes.splice(this.activeIndex + 1, 0, box);
        this.activeIndex += 1;
        this.refreshActiveBox();
    }

    removeBox() {
        if (this.boxes.length <= 1) {
            // Removing the only box would leave a dialog editing nothing;
            // clearing it is the sensible reading of the request.
            this.boxes = [this._emptyBox()];
            this.activeIndex = 0;
            this.refreshActiveBox();
            return;
        }
        this.boxes.splice(this.activeIndex, 1);
        if (this.activeIndex >= this.boxes.length) this.activeIndex = this.boxes.length - 1;
        this.refreshActiveBox();
    }

    moveBox(direction) {
        this.commitTextarea();
        const target = this.activeIndex + direction;
        if (target < 0 || target >= this.boxes.length) return;
        const [box] = this.boxes.splice(this.activeIndex, 1);
        this.boxes.splice(target, 0, box);
        this.activeIndex = target;
        this.refreshActiveBox();
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
            min-width: 0;
        `;

        const label = document.createElement('div');
        label.textContent = this._t('Message:');
        label.style.cssText = 'font-weight: bold; font-size: 13px; color: var(--color-text);';
        column.appendChild(label);

        // The textarea and the guide share a stacking context so the guide can
        // sit over the text without being part of the editable content.
        const stack = document.createElement('div');
        stack.style.cssText = 'position: relative; display: flex; flex-direction: column; min-height: 0;';

        const textarea = document.createElement('textarea');
        textarea.className = 'message-textarea';
        textarea.value = this.textLines.join('\n');
        textarea.rows = Math.max(4, this._messageRows());
        textarea.spellcheck = false;
        textarea.style.cssText = `
            padding: 8px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 13px;
            font-family: monospace;
            resize: vertical;
            min-height: 132px;
            white-space: pre;
            overflow-x: auto;
        `;

        textarea.addEventListener('input', event => {
            // No truncation. Overflow becomes extra boxes on save, which is
            // what Batch Entry means; silently discarding it was the old bug.
            this.textLines = event.target.value.split('\n');
            this.updateOverflowHint();
            this.updateGuide();
        });

        const guide = document.createElement('div');
        guide.className = 'message-guide';
        guide.style.cssText = `
            position: absolute; top: 0; bottom: 0; width: 1px;
            background: var(--color-accent); opacity: 0.45; pointer-events: none;
            display: none;
        `;

        stack.appendChild(textarea);
        stack.appendChild(guide);
        column.appendChild(stack);

        // Ctrl+Enter is OK, as it is in MZ. Enter alone stays a newline.
        textarea.addEventListener('keydown', event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                this.save();
            }
        });

        if (window.RRTextCodeMenu) {
            this._detachMenus.push(window.RRTextCodeMenu.attach(textarea, this._menuOptions()));
        }

        const hint = document.createElement('div');
        hint.className = 'message-overflow-hint';
        hint.style.cssText = 'font-size: 11px; color: var(--color-text-muted); margin-top: -4px; min-height: 14px;';
        column.appendChild(hint);

        return column;
    }

    /**
     * What the text-code menu and reference panel need to do their job.
     *
     * `scope` differs per field: the message body is a Window_Message and gets
     * the pacing codes, the name field is a Window_NameBox and does not - it is
     * a plain Window_Base, so `\$`, `\.`, `\|`, `\!`, `\>`, `\<` and `\^` are
     * not implemented for it and offering them would be offering codes that
     * print as literal text.
     */
    _menuOptions(scope) {
        return {
            scope: scope || 'message',
            inBattle: () => this._inBattle,
            plugins: () => this._pluginList(),
            projectPath: () => this._projectPath(),
            skin: () => this._skin,
            iconSetUrl: () => {
                const projectPath = this._projectPath();
                if (!projectPath || !window.RRAssetFiles) return '';
                return window.RRAssetFiles.toUrl(
                    require('path').join(projectPath, 'img', 'system', 'IconSet.png'));
            },
            pickVariable: onPick => {
                if (typeof SwitchVariablePicker !== 'function') return;
                if (!this._variablePicker) {
                    this._variablePicker = new SwitchVariablePicker(
                        this.databaseManager, this.projectController);
                }
                this._variablePicker.show('variable', 1, id => onPick(id));
            }
        };
    }

    /**
     * Say how many boxes the current text will become.
     *
     * Silence would be worse than a message here: an author who pasted twelve
     * lines needs to know before pressing OK that they are about to create
     * three Show Text commands rather than one.
     */
    updateOverflowHint() {
        const hint = this.modal && this.modal.querySelector('.message-overflow-hint');
        if (!hint) return;

        const rows = this._messageRows();
        const chunks = window.RRMessageBoxes
            ? window.RRMessageBoxes.splitLines(this.textLines, rows)
            : [this.textLines];

        // One phrase with a placeholder rather than two fragments around a
        // number: word order around a count is not the same in every language.
        if (chunks.length > 1) {
            hint.textContent = this._t('This box will be split into {n} message boxes on save.')
                .replace('{n}', chunks.length);
            hint.style.color = 'var(--color-accent)';
        } else {
            hint.textContent = this._t('{n} lines per box').replace('{n}', rows);
            hint.style.color = 'var(--color-text-muted)';
        }
    }

    /**
     * Position the character-limit guide.
     *
     * MZ draws a fixed column ruler. That would be wrong here: the game
     * measures text in pixels using the project's own font, so the guide is
     * placed at the real pixel width the message window gives text - narrower
     * when a face is set - converted through the textarea's own monospace
     * metrics. With word wrap on, a per-line limit means nothing, so the guide
     * hides rather than lying.
     */
    updateGuide() {
        if (!this.modal) return;
        const guide = this.modal.querySelector('.message-guide');
        const textarea = this.modal.querySelector('.message-textarea');
        if (!guide || !textarea || !window.RRTextCodes) return;

        if (window.RRTextCodes.hasWordWrap(this.textLines.join('\n'))) {
            guide.style.display = 'none';
            return;
        }

        const available = window.RRTextCodes.messageTextWidth(
            this._pluginList(), Boolean(this.faceImage));

        // The game font's average advance at its own size, against the
        // textarea's monospace advance, gives a column count that lands where
        // text actually runs out rather than at an arbitrary character count.
        const context = this._measureContext();
        const gameSize = window.RRWindowskin ? window.RRWindowskin.METRICS.DEFAULT_FONT_SIZE : 26;
        context.font = `${gameSize}px ${this._previewFontFamily || 'sans-serif'}`;
        const gameAdvance = context.measureText('MMMMMMMMMM').width / 10;
        if (!gameAdvance) {
            guide.style.display = 'none';
            return;
        }
        const columns = Math.floor(available / gameAdvance);

        const style = window.getComputedStyle(textarea);
        context.font = `${style.fontSize} ${style.fontFamily}`;
        const editorAdvance = context.measureText('M').width;
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const borderLeft = parseFloat(style.borderLeftWidth) || 0;

        const offset = borderLeft + paddingLeft + columns * editorAdvance;
        if (offset <= 0 || offset > textarea.clientWidth + paddingLeft) {
            guide.style.display = 'none';
            return;
        }
        guide.style.left = `${offset}px`;
        guide.style.display = '';
        guide.title = this._t('{n} characters').replace('{n}', columns);
    }

    _measureContext() {
        if (!this._measureCanvas) this._measureCanvas = document.createElement('canvas');
        return this._measureCanvas.getContext('2d');
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
            // The strip labels each box by its speaker, so it has to follow.
            this.renderBoxList();
        });

        // The name box takes control characters too - an actor's real name via
        // \N[x], a colour, an icon - so it gets the same menu, scoped to what a
        // Window_NameBox actually implements.
        if (window.RRTextCodeMenu) {
            this._detachMenus.push(
                window.RRTextCodeMenu.attach(nameInput, this._menuOptions('namebox')));
        }

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
        // The guide narrows when a face appears, so anything that can change
        // the window's text area re-measures it.

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
        this.commitTextarea();

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.85); z-index: 10013;
            display: flex; justify-content: center; align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'rr-modal';
        container.style.cssText = 'width: min(880px, calc(100vw - 24px));';

        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.textContent = this._t('Preview');
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = '×';
        closeButton.style.cssText =
            'background:none;border:none;color:var(--color-text-strong);font-size:20px;cursor:pointer;';
        header.appendChild(title);
        header.appendChild(closeButton);

        // The project's own screen size, not the 816x624 default: window
        // placement is a fraction of the screen height, so previewing a
        // 1280x800 game on a 624-high canvas would put Middle in the wrong
        // place. object-fit keeps the whole frame on screen whatever it is.
        const canvas = document.createElement('canvas');
        canvas.width = this._previewScreenWidth || 816;
        canvas.height = this._previewScreenHeight || 624;
        canvas.style.cssText =
            'display:block; width:100%; height:auto; max-height:72vh; object-fit:contain; background:#000;';

        // Shared chrome rather than a hand-styled bar: rr-modal-footer already
        // carries the rule and the padding every other dialog uses.
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        footer.style.alignItems = 'center';

        const stepLabel = document.createElement('div');
        stepLabel.style.cssText =
            'flex: 1; color: var(--color-text-muted); font-size: 11px;';

        const previous = document.createElement('button');
        previous.type = 'button';
        previous.textContent = '◀';
        previous.className = 'rr-btn-secondary';
        const next = document.createElement('button');
        next.type = 'button';
        next.textContent = '▶';
        next.className = 'rr-btn-secondary';

        footer.appendChild(stepLabel);
        footer.appendChild(previous);
        footer.appendChild(next);

        container.appendChild(header);
        container.appendChild(canvas);
        container.appendChild(footer);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        // Preview the run as the player meets it: one box at a time, in order,
        // including the boxes a batch split will create.
        const rows = this._messageRows();
        const pages = [];
        for (const box of this.boxes) {
            const chunks = window.RRMessageBoxes
                ? window.RRMessageBoxes.splitLines(box.lines, rows)
                : [box.lines];
            for (const chunk of chunks) pages.push({ header: box.header, lines: chunk });
        }
        if (!pages.length) pages.push({ header: this._activeHeader(), lines: [] });

        let page = Math.min(this.activeIndex, pages.length - 1);
        const render = () => {
            stepLabel.textContent = this._t('Box {n} of {total}')
                .replace('{n}', page + 1).replace('{total}', pages.length);
            previous.disabled = page === 0;
            next.disabled = page === pages.length - 1;
            this.drawPreview(canvas, pages[page]);
        };

        previous.addEventListener('click', () => { page = Math.max(0, page - 1); render(); });
        next.addEventListener('click', () => { page = Math.min(pages.length - 1, page + 1); render(); });

        const close = () => {
            document.removeEventListener('keydown', onKey, true);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };
        const onKey = event => {
            if (event.key === 'Escape') { event.stopPropagation(); close(); }
            if (event.key === 'ArrowLeft') { page = Math.max(0, page - 1); render(); }
            if (event.key === 'ArrowRight') { page = Math.min(pages.length - 1, page + 1); render(); }
        };
        document.addEventListener('keydown', onKey, true);
        closeButton.addEventListener('click', close);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) close();
        });

        this.ensurePreviewAssets().then(render);
        render();
    }

    /**
     * Load what the preview needs and cache it: the windowskin, the project's
     * main font, and the face sheet for the box being drawn.
     *
     * The editor had never loaded a game font before. Without it the canvas
     * silently falls back to a system face and mismeasures every line, which
     * defeats the point of previewing at all.
     */
    async ensurePreviewAssets() {
        const projectPath = this._projectPath();
        if (!projectPath) return;

        if (!this._skin) this._loadSkin();

        if (this._previewFontFamily === undefined && window.RRWindowskin) {
            this._previewFontFamily = null;
            let filename = '';
            try {
                const path = require('path');
                const systemPath = path.join(projectPath, 'data', 'System.json');
                const system = JSON.parse(require('fs').readFileSync(systemPath, 'utf8'));
                const advanced = system.advanced || {};
                filename = advanced.mainFontFilename || '';
                this._previewFontSize = advanced.fontSize || 26;
                this._previewOpacity = advanced.windowOpacity ?? 192;
                this._previewTone = system.windowTone || [0, 0, 0, 0];
                this._previewScreenWidth = advanced.uiAreaWidth || advanced.screenWidth || 816;
                this._previewScreenHeight = advanced.uiAreaHeight || advanced.screenHeight || 624;
            } catch (error) {
                this._previewFontSize = 26;
                this._previewOpacity = 192;
                this._previewTone = [0, 0, 0, 0];
                this._previewScreenWidth = 816;
                this._previewScreenHeight = 624;
            }
            this._previewFontFamily = await window.RRWindowskin.loadGameFont(
                require('path').join(projectPath, 'fonts'), filename);
        }

        // The IconSet has to be decoded before the first draw, or every \I[n]
        // in the first frame is a silent gap - the draw is synchronous and
        // cannot wait for an image mid-line.
        if (!this._iconSheetReady && window.RRAssetFiles) {
            this._iconSheetReady = new Promise(resolve => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => resolve(null);
                image.src = window.RRAssetFiles.toUrl(
                    require('path').join(projectPath, 'img', 'system', 'IconSet.png'));
            });
        }
        this._iconSheet = await this._iconSheetReady;
    }

    /**
     * Draw one message box the way the runtime lays it out: the window at its
     * position, the face slab on the left, the name box above, and the text
     * with its colour and icon codes resolved.
     */
    drawPreview(canvas, page) {
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#101018';
        context.fillRect(0, 0, canvas.width, canvas.height);

        const metrics = window.RRWindowskin
            ? window.RRWindowskin.METRICS
            : { PADDING: 12, LINE_HEIGHT: 36, ITEM_PADDING: 8, FACE_SIZE: 144, DEFAULT_FONT_SIZE: 26 };

        const rows = this._messageRows();
        const height = rows * metrics.LINE_HEIGHT + metrics.PADDING * 2;
        const width = window.RRTextCodes
            ? (window.RRTextCodes.messageTextWidth(this._pluginList(), false) + (4 + 8) * 2)
            : 816;
        const x = Math.floor((canvas.width - width) / 2);
        // Window_Message.updatePlacement: y = positionType * (boxHeight - height) / 2.
        // Top, Middle and Bottom are 0, 1 and 2 fed through that one expression
        // rather than three cases, which is also why Top must stay 0 and not
        // get defaulted away.
        const position = page.header.positionType ?? 2;
        const y = Math.floor((position * (canvas.height - height)) / 2);

        const rect = { x, y, w: width, h: height };

        if (window.RRWindowskin) {
            window.RRWindowskin.drawWindow(context, rect, this._skin, {
                background: page.header.background || 0,
                opacity: this._previewOpacity,
                tone: this._previewTone
            });
        }

        let textLeft = x + metrics.PADDING + metrics.ITEM_PADDING;
        if (page.header.faceName) {
            this.drawPreviewFace(context, page.header, x + metrics.PADDING, y + metrics.PADDING);
            textLeft += metrics.FACE_SIZE + metrics.ITEM_PADDING;
        }

        if (page.header.speakerName) {
            this.drawPreviewNameBox(context, page.header.speakerName, x, y, height);
        }

        const fontSize = this._previewFontSize || metrics.DEFAULT_FONT_SIZE;
        const family = this._previewFontFamily || 'sans-serif';
        context.textBaseline = 'alphabetic';

        page.lines.forEach((line, index) => {
            this.drawPreviewLine(context, String(line || ''), textLeft,
                y + metrics.PADDING + index * metrics.LINE_HEIGHT, fontSize, family);
        });
    }

    drawPreviewNameBox(context, name, windowX, windowY, windowHeight) {
        const metrics = window.RRWindowskin.METRICS;
        const fontSize = this._previewFontSize || metrics.DEFAULT_FONT_SIZE;
        const family = this._previewFontFamily || 'sans-serif';
        context.font = `${fontSize}px ${family}`;
        const width = context.measureText(name).width + metrics.PADDING * 2 + metrics.ITEM_PADDING * 2;
        const height = metrics.LINE_HEIGHT + metrics.PADDING * 2;

        // Window_NameBox.updatePlacement: above the message window, except at
        // the top of the screen where it flips below - otherwise a Top-
        // positioned message would put its name box off-screen, which is
        // exactly what this preview did before.
        const y = windowY > 0 ? windowY - height : windowY + windowHeight;
        const rect = { x: windowX, y, w: width, h: height };

        window.RRWindowskin.drawWindow(context, rect, this._skin, {
            background: 0,
            opacity: this._previewOpacity,
            tone: this._previewTone
        });

        // The name box defaults to text colour 6 under MessageCore.
        context.fillStyle = window.RRWindowskin.textColor(this._skin, 6);
        context.fillText(name, rect.x + metrics.PADDING + metrics.ITEM_PADDING,
            rect.y + metrics.PADDING + fontSize);
    }

    drawPreviewFace(context, header, x, y) {
        const projectPath = this._projectPath();
        if (!projectPath || !window.RRAssetFiles) return;

        const size = window.RRWindowskin.METRICS.FACE_SIZE;
        const cached = this._faceCache && this._faceCache.name === header.faceName
            ? this._faceCache.image
            : null;

        const draw = image => {
            const columns = (window.RRFaceSheet && window.RRFaceSheet.COLUMNS) || 4;
            const index = header.faceIndex || 0;
            context.drawImage(image,
                (index % columns) * size, Math.floor(index / columns) * size, size, size,
                x, y, size, size);
        };

        if (cached && cached.complete) {
            draw(cached);
            return;
        }

        const url = window.RRAssetFiles.urlFor
            ? window.RRAssetFiles.urlFor(require('path').join(projectPath, 'img', 'faces'),
                header.faceName, ['.png'])
            : '';
        if (!url) return;

        const image = new Image();
        image.onload = () => {
            this._faceCache = { name: header.faceName, image };
            draw(image);
        };
        image.src = url;
    }

    /**
     * Draw one line, resolving the codes that change how it looks.
     *
     * This is deliberately a subset: colour, icons, font size and the literal
     * backslash - the codes that change what the line *looks like*. Codes that
     * only affect timing or flow (\., \|, \!, \^) are stripped, because a still
     * image cannot show a pause, and leaving their markup on screen would be a
     * worse lie than omitting it.
     */
    drawPreviewLine(context, line, x, y, fontSize, family) {
        const iconSize = 32;
        let cursorX = x;
        let size = fontSize;
        context.fillStyle = window.RRWindowskin
            ? window.RRWindowskin.normalColor(this._skin)
            : '#ffffff';

        const pattern = /\\([A-Za-z]+)\[(\d+)\]|\\([{}])|\\\\|\\[.|!^><$]/g;
        let lastIndex = 0;
        let match;

        const write = text => {
            if (!text) return;
            context.font = `${size}px ${family}`;
            context.fillText(text, cursorX, y + size);
            cursorX += context.measureText(text).width;
        };

        while ((match = pattern.exec(line)) !== null) {
            write(line.slice(lastIndex, match.index));
            lastIndex = pattern.lastIndex;

            const name = (match[1] || '').toUpperCase();
            const value = Number(match[2]);

            if (match[0] === '\\\\') {
                write('\\');
            } else if (match[3] === '{') {
                size += 12;
            } else if (match[3] === '}') {
                size = Math.max(12, size - 12);
            } else if (name === 'C') {
                context.fillStyle = window.RRWindowskin
                    ? window.RRWindowskin.textColor(this._skin, value)
                    : '#ffffff';
            } else if (name === 'FS') {
                size = value || fontSize;
            } else if (name === 'I') {
                this.drawPreviewIcon(context, value, cursorX, y + (size - iconSize) / 2 + 4);
                cursorX += iconSize + 4;
            } else if (name === 'PX') {
                cursorX = x + value;
            } else if (name === 'PY' || name === 'FS') {
                // FS is handled above; PY would move the whole line and is not
                // meaningful for a single-line draw.
            } else {
                // \V, \N, \P and anything else resolve against live game state
                // that does not exist in the editor. Draw the code as written
                // rather than swallowing it - a blank gap reads as "this text
                // disappears", which is a worse lie than showing the markup.
                write(match[0]);
            }
        }

        write(line.slice(lastIndex));
    }

    drawPreviewIcon(context, index, x, y) {
        // Preloaded by ensurePreviewAssets; absent only when the project has no
        // IconSet, in which case the gap is the honest result.
        if (!this._iconSheet || !this._iconSheet.naturalWidth) return;

        const size = 32;
        const columns = 16;
        context.drawImage(this._iconSheet,
            (index % columns) * size, Math.floor(index / columns) * size, size, size,
            x, y, size, size);
    }

    /**
     * Build command array from current data
     */
    buildCommands() {
        this.commitTextarea();

        // Every box emits its own header, and any box whose text overruns the
        // window height becomes several commands sharing that header - which is
        // what MZ's Batch Entry produces, and what makes the old silent
        // four-line truncation unnecessary.
        if (window.RRMessageBoxes) {
            return window.RRMessageBoxes.buildCommands(this.boxes, 0, this._messageRows());
        }

        const commands = [];
        for (const box of this.boxes) {
            commands.push({
                code: 101,
                indent: 0,
                parameters: [
                    box.header.faceName || '',
                    box.header.faceIndex || 0,
                    box.header.background || 0,
                    box.header.positionType ?? 2,
                    box.header.speakerName || ''
                ]
            });
            let lastLine = -1;
            for (let i = 0; i < box.lines.length; i++) {
                if (String(box.lines[i]).length) lastLine = i;
            }
            for (let i = 0; i <= lastLine; i++) {
                commands.push({ code: 401, indent: 0, parameters: [box.lines[i] || ''] });
            }
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
        for (const detach of this._detachMenus) detach();
        this._detachMenus = [];
        if (window.RRTextCodeMenu) window.RRTextCodeMenu.closeMenu();
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MessageCommandEditor;
}
