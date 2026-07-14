// Event command codes that take no parameters — editing them via double-click
// is meaningless, so editCommand returns early instead of showing a placeholder alert.
const NO_PARAM_EVENT_CODES = new Set([
    109, // Skip
    115, // Exit Event Processing
    206, // Get on/off Vehicle
    214, // Erase Event
    217, // Gather Followers
    243, // Save BGM
    244, // Replay BGM
    340, // Abort Battle
    351, // Open Menu Screen
    352, // Open Save Screen
    353, // Game Over
    354  // Return to Title Screen
]);

/**
 * EventCommandList - Manages the interactive command list
 */
class EventCommandList {
    constructor(eventEditor) {
        this.eventEditor = eventEditor;
        this.commandPicker = new EventCommandPicker();
        this.selectedIndices = [];
        this.clipboard = null;
        this.currentPage = null;
        this.currentPageIndex = null;
        this.expandedPluginCommands = new Set(); // Track which plugin commands are expanded (by index)

        // Command editors
        this.audioEditor = new AudioCommandEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.messageEditor = new MessageCommandEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.choicesEditor = new ShowChoicesCommandEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.waitEditor = new WaitCommandEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.switchesEditor = new ControlSwitchesEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.variablesEditor = new ControlVariablesEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.goldEditor = new ChangeGoldEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.transferPlayerEditor = new TransferPlayerEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.commentEditor = new CommentEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.conditionalBranchEditor = new ConditionalBranchEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.scrollMapEditor = new ScrollMapEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.balloonIconEditor = new ShowBalloonIconEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.setEventLocationEditor = new SetEventLocationEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeItemsEditor = new ChangeItemsEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changePartyMemberEditor = new ChangePartyMemberEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.scriptEditor = new ScriptEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeWeaponsEditor = new ChangeWeaponsEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeArmorsEditor = new ChangeArmorsEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.controlSelfSwitchEditor = new ControlSelfSwitchEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.controlTimerEditor = new ControlTimerEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.setMovementRouteEditor = new SetMovementRouteEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeTransparencyEditor = new ChangeTransparencyEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.showAnimationEditor = new ShowAnimationEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.fadeScreenEditor = new FadeScreenEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.showPictureEditor = new ShowPictureEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.erasePictureEditor = new ErasePictureEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.loopEditor = new LoopEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.breakLoopEditor = new BreakLoopEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.pluginCommandEditor = new PluginCommandEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );

        // Toggle command editor (shared for codes 136-139, 216, 281)
        this.toggleCommandEditor = new ToggleCommandEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.inputNumberEditor = new InputNumberEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.selectItemEditor = new SelectItemEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.showScrollingTextEditor = new ShowScrollingTextEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.commonEventEditor = new CommonEventEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.labelEditor = new LabelEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.jumpToLabelEditor = new JumpToLabelEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeWindowColorEditor = new ChangeWindowColorEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeBattleBGMEditor = new ChangeBattleBGMEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeVictoryMEEditor = new ChangeVictoryMEEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeDefeatMEEditor = new ChangeDefeatMEEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeVehicleBGMEditor = new ChangeVehicleBGMEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.setVehicleLocationEditor = new SetVehicleLocationEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.tintScreenEditor = new TintScreenEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.flashScreenEditor = new FlashScreenEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.shakeScreenEditor = new ShakeScreenEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.movePictureEditor = new MovePictureEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.rotatePictureEditor = new RotatePictureEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.tintPictureEditor = new TintPictureEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.setWeatherEffectEditor = new SetWeatherEffectEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.playMovieEditor = new PlayMovieEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeTilesetEditor = new ChangeTilesetEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeBattleBackgroundEditor = new ChangeBattleBackgroundEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeParallaxEditor = new ChangeParallaxEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.getLocationInfoEditor = new GetLocationInfoEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.nameInputProcessingEditor = new NameInputProcessingEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.battleProcessingEditor = new BattleProcessingEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.shopProcessingEditor = new ShopProcessingEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeHPEditor = new ChangeHPEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeMPEditor = new ChangeMPEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeTPEditor = new ChangeTPEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeStateEditor = new ChangeStateEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.recoverAllEditor = new RecoverAllEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeEXPEditor = new ChangeEXPEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeLevelEditor = new ChangeLevelEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeParameterEditor = new ChangeParameterEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeSkillEditor = new ChangeSkillEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeEquipmentEditor = new ChangeEquipmentEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeNameEditor = new ChangeNameEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeClassEditor = new ChangeClassEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeActorImagesEditor = new ChangeActorImagesEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeVehicleImageEditor = new ChangeVehicleImageEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeNicknameEditor = new ChangeNicknameEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeProfileEditor = new ChangeProfileEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeEnemyHPEditor = new ChangeEnemyHPEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeEnemyMPEditor = new ChangeEnemyMPEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeEnemyTPEditor = new ChangeEnemyTPEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.changeEnemyStateEditor = new ChangeEnemyStateEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.enemyRecoverAllEditor = new EnemyRecoverAllEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.enemyAppearEditor = new EnemyAppearEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.enemyTransformEditor = new EnemyTransformEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.showBattleAnimationEditor = new ShowBattleAnimationEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );
        this.forceActionEditor = new ForceActionEditor(
            eventEditor.databaseManager,
            eventEditor.projectController
        );

        // Set up keyboard shortcuts
        this.setupKeyboardShortcuts();
        if (typeof window !== 'undefined') window.addEventListener('rr-language-changed', () => {
            if (this.currentPage) this.refreshCommandList(this.currentPage, this.currentPageIndex);
        });
    }

    _t(key, params = {}) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.t(key, params) : key;
    }

    _commandName(name) {
        return typeof window !== 'undefined' && window.I18n?.tEventCommandName ? window.I18n.tEventCommandName(name) : name;
    }

    /**
     * Set up keyboard shortcuts (Ctrl+C, Ctrl+X, Ctrl+V)
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only handle if we have a current page (command list is active)
            if (!this.currentPage) return;

            const eventEditorModal = document.getElementById('event-editor-modal');
            if (!eventEditorModal || eventEditorModal.style.display === 'none') return;

            const commandListRoot = document.getElementById('event-command-list');
            if (commandListRoot && !commandListRoot.contains(e.target) && !eventEditorModal.contains(e.target)) return;

            // Don't intercept when user is typing in an input, textarea, or contenteditable
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

            // Check for Ctrl/Cmd key
            const isCtrl = e.ctrlKey || e.metaKey;

            if (isCtrl && e.key === 'c') {
                // Copy
                e.preventDefault();
                this.copyCommands(this.currentPage, this.currentPageIndex);
            } else if (isCtrl && e.key === 'x') {
                // Cut
                e.preventDefault();
                this.cutCommands(this.currentPage, this.currentPageIndex);
            } else if (isCtrl && e.key === 'v') {
                // Paste
                e.preventDefault();
                this.pasteCommands(this.currentPage, this.currentPageIndex);
            } else if (e.key === 'Delete' && this.selectedIndices.length > 0) {
                // Delete key (no confirmation)
                e.preventDefault();
                this.deleteCommands(this.currentPage, this.currentPageIndex);
            }
        });
    }

    /**
     * Render the command list for a page
     */
    renderCommandList(container, page, pageIndex) {
        // Store current page for keyboard shortcuts
        this.currentPage = page;
        this.currentPageIndex = pageIndex;

        container.innerHTML = '';

        if (!page.list || page.list.length === 0) {
            container.innerHTML = `<div style="color: var(--color-text-muted); padding: 8px;">${this._t('event.noCommands')}</div>`;
            this.attachEmptyContextMenu(container, page, pageIndex);
            return;
        }

        // Create command list container
        const listContainer = document.createElement('div');
        listContainer.className = 'command-list-container';
        listContainer.style.cssText = 'font-family: monospace; font-size: 12px;';

        page.list.forEach((command, index) => {
            const commandDiv = this.createCommandItem(command, index, page, pageIndex);
            if (commandDiv) { // Only append if not null (hidden commands return null)
                listContainer.appendChild(commandDiv);
            }
        });

        container.appendChild(listContainer);
    }

    /**
     * Create a single command item
     */
    createCommandItem(command, index, page, pageIndex) {
        // Hide 505 continuation entries that are just the end marker (move code 0)
        if (command.code === 505 && command.parameters[0] && command.parameters[0].code === 0) {
            return null;
        }

        // Hide 655 Script continuation rows - folded into parent 355's description
        if (command.code === 655) {
            return null;
        }

        const div = document.createElement('div');
        div.className = 'command-item';
        div.dataset.index = index;

        // Check if this command or its parent is selected
        let isSelected = this.selectedIndices.includes(index);

        // If this is a continuation line (401, 408), also check if parent is selected
        if (!isSelected && (command.code === 401 || command.code === 408)) {
            const parentIndex = this.findParentCommandIndex(index, page);
            isSelected = this.selectedIndices.includes(parentIndex);
        }

        div.style.cssText = `
            padding: 6px 8px;
            margin-bottom: 2px;
            background: ${isSelected ? 'var(--color-bg-selected)' : 'var(--color-bg-list-item)'};
            border-left: 3px solid ${this.getCommandColor(command.code)};
            font-size: 12px;
            cursor: pointer;
            user-select: none;
            transition: background-color 0.15s;
        `;

        // Calculate indent
        let indent = command.indent || 0;

        // Add extra indent for continuation commands (401-404, 408, 411-413, 505, 655, 657, etc.)
        const isContinuationCommand = command.code === 401 ||
                                     (command.code >= 402 && command.code <= 404) ||
                                     command.code === 405 ||
                                     command.code === 408 ||
                                     (command.code >= 411 && command.code <= 413) ||
                                     command.code === 505 ||
                                     command.code === 605 ||
                                     command.code === 655 ||
                                     command.code === 657;

        if (isContinuationCommand) {
            indent += 1; // Add one level of visual indentation
        }

        // Calculate pixel padding (24 pixels per indent level for clear visual hierarchy)
        const indentPadding = indent * 24;

        // Get command info
        const commandInfo = this.getCommandInfo(command, page, index);

        // Build the HTML
        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'display: flex; gap: 12px; align-items: center;';

        // Line number
        const lineNum = document.createElement('span');
        lineNum.style.cssText = 'color: var(--color-text-dim); min-width: 40px;';
        lineNum.textContent = String(index + 1).padStart(3, '0');
        contentDiv.appendChild(lineNum);

        // Expand/collapse button for plugin commands
        const isPluginCommand = command.code === 356 || command.code === 357;
        if (isPluginCommand) {
            const params = command.parameters || [];
            const args = params[3] || {};
            const hasArgs = Object.keys(args).length > 0;

            if (hasArgs) {
                const isExpanded = this.expandedPluginCommands.has(index);
                const expandBtn = document.createElement('span');
                expandBtn.style.cssText = `
                    color: var(--color-text-muted);
                    cursor: pointer;
                    user-select: none;
                    min-width: 16px;
                    text-align: center;
                `;
                expandBtn.textContent = isExpanded ? '▼' : '▶';
                expandBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.expandedPluginCommands.has(index)) {
                        this.expandedPluginCommands.delete(index);
                    } else {
                        this.expandedPluginCommands.add(index);
                    }
                    this.refreshCommandList(page, pageIndex);
                });
                contentDiv.appendChild(expandBtn);
            } else {
                // Add spacer if no args
                const spacer = document.createElement('span');
                spacer.style.cssText = 'min-width: 16px;';
                contentDiv.appendChild(spacer);
            }
        }

        // Face icon (if present)
        if (commandInfo.faceIcon) {
            const faceCanvas = this.createFaceIcon(commandInfo.faceIcon);
            if (faceCanvas) {
                contentDiv.appendChild(faceCanvas);
            }
        }

        // Command name
        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = `color: ${commandInfo.color}; font-weight: 600; min-width: 100px; padding-left: ${indentPadding}px;`;
        nameSpan.textContent = commandInfo.name;
        contentDiv.appendChild(nameSpan);

        // Description
        const descSpan = document.createElement('span');
        descSpan.style.cssText = 'color: var(--color-text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

        if (command.code === 401 || command.code === 408) {
            // For text/comment lines, render with HTML to support color codes
            descSpan.innerHTML = this.convertTextCodesToHTML(commandInfo.description);
        } else {
            descSpan.textContent = commandInfo.description;
        }

        contentDiv.appendChild(descSpan);

        div.appendChild(contentDiv);

        // Add nested argument display for expanded plugin commands
        if (isPluginCommand && this.expandedPluginCommands.has(index)) {
            const params = command.parameters || [];
            const args = params[3] || {};

            for (const [key, value] of Object.entries(args)) {
                if (value !== undefined && value !== null && value !== '') {
                    const argDiv = document.createElement('div');
                    argDiv.style.cssText = `
                        padding: 4px 12px 4px ${indentPadding + 80}px;
                        color: var(--color-text-muted);
                        font-size: 12px;
                        display: flex;
                        gap: 8px;
                    `;

                    const keySpan = document.createElement('span');
                    keySpan.style.cssText = 'color: #9cdcfe; min-width: 120px;';
                    keySpan.textContent = key + ':';

                    const valueSpan = document.createElement('span');
                    valueSpan.style.cssText = 'color: var(--color-syntax-string); flex: 1; word-break: break-word;';

                    // Format value based on type
                    let displayValue = String(value);
                    if (typeof value === 'boolean') {
                        valueSpan.style.color = 'var(--color-syntax-type)';
                    } else if (typeof value === 'number') {
                        valueSpan.style.color = '#b5cea8';
                    }
                    valueSpan.textContent = displayValue;

                    argDiv.appendChild(keySpan);
                    argDiv.appendChild(valueSpan);
                    div.appendChild(argDiv);
                }
            }
        }

        // Click to select
        div.addEventListener('click', (e) => {
            // For continuation lines (401, 408), redirect to parent command
            let targetIndex = index;
            if (command.code === 401 || command.code === 408) {
                targetIndex = this.findParentCommandIndex(index, page);
            }

            if (e.ctrlKey || e.metaKey) {
                // Multi-select
                this.toggleSelection(targetIndex);
            } else if (e.shiftKey && this.selectedIndices.length > 0) {
                // Range select
                this.selectRange(this.selectedIndices[0], targetIndex);
            } else {
                // Single select
                this.selectSingle(targetIndex);
            }
            this.refreshCommandList(page, pageIndex);
        });

        // Double-click to edit
        div.addEventListener('dblclick', () => {
            // For continuation lines (401, 408), redirect to parent command
            let targetIndex = index;
            if (command.code === 401 || command.code === 408) {
                targetIndex = this.findParentCommandIndex(index, page);
            }
            this.editCommand(targetIndex, page, pageIndex);
        });

        // Hover effect
        div.addEventListener('mouseenter', () => {
            if (!isSelected) {
                div.style.backgroundColor = 'var(--color-bg-input)';
            }
        });

        div.addEventListener('mouseleave', () => {
            if (!isSelected) {
                div.style.backgroundColor = 'var(--color-bg-list-item)';
            }
        });

        // Right-click context menu
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!isSelected) {
                this.selectSingle(index);
                this.refreshCommandList(page, pageIndex);
            }
            this.showContextMenu(e.clientX, e.clientY, page, pageIndex);
        });

        return div;
    }

    /**
     * Convert RPG Maker text codes to HTML for preview
     * @param {string} text - The text with codes like \C[6]
     * @returns {string} - HTML string with color spans
     */
    convertTextCodesToHTML(text) {
        if (!text) return '';

        // RPG Maker MZ default text colors (matching the engine's color palette)
        const textColors = [
            'var(--color-text-strong)', // 0 - Normal (white)
            '#20a0d6', // 1 - System (light blue)
            '#ff784c', // 2 - Crisis (orange-red)
            '#66cc40', // 3 - Death (green)
            '#99ccff', // 4 - Gauge Back (light blue)
            '#ccc0a8', // 5 - HP Gauge (tan)
            '#ffff80', // 6 - MP Gauge (yellow)
            '#80ff80', // 7 - TP Gauge (light green)
            '#c0c0c0', // 8 - TP Cost (gray)
            'var(--color-syntax-comment)', // 9 - Pending (dark gray)
            '#ff2020', // 10 - HP Damage (red)
            '#e08040', // 11 - HP Recover (orange)
            '#20b0ff', // 12 - MP Damage (blue)
            '#4080c0', // 13 - MP Recover (darker blue)
            '#d040a0', // 14 - TP Damage (purple)
            '#00a040', // 15 - TP Recover (dark green)
            '#c08040', // 16 - Exp (brown)
            '#ffff40', // 17 - Gold (bright yellow)
            '#ff6060', // 18 - Item (light red)
            '#a0a0ff', // 19 - Weapon (light purple)
            '#60e060', // 20 - Armor (light green)
            '#ff80ff', // 21 - Key Item (pink)
            '#c0c0c0', // 22 - Equip (light gray)
            'var(--color-danger-light)', // 23 - Power Up (light red)
            '#8080ff', // 24 - Power Down (light blue)
            '#80ff80', // 25 - Buff (light green)
            'var(--color-danger-light)', // 26 - Debuff (light red)
            'var(--color-text-strong)', // 27 - Default
            'var(--color-syntax-comment)', // 28 - Gray
            '#ff6666', // 29 - Red
            '#66ff66', // 30 - Green
            '#6666ff'  // 31 - Blue
        ];

        let html = text;
        let currentColor = 0;

        // Replace \C[n] or \c[n] with color spans
        html = html.replace(/\\[Cc]\[(\d+)\]/g, (match, colorIndex) => {
            const index = parseInt(colorIndex);
            const color = textColors[index] || textColors[0];
            currentColor = index;
            return `</span><span style="color: ${color}">`;
        });

        // Wrap in initial color span
        html = `<span style="color: ${textColors[currentColor]}">${html}</span>`;

        // Clean up any empty spans
        html = html.replace(/<span[^>]*><\/span>/g, '');

        return html;
    }

    /**
     * Find the parent command index for continuation lines (401, 408)
     * @param {number} index - The index of the continuation line
     * @param {object} page - The current page
     * @returns {number} - The index of the parent command (101 or 108)
     */
    findParentCommandIndex(index, page) {
        // Walk backwards to find the parent command
        for (let i = index - 1; i >= 0; i--) {
            const code = page.list[i].code;
            // For 401 lines, parent is 101
            if (page.list[index].code === 401 && code === 101) {
                return i;
            }
            // For 408 lines, parent is 108
            if (page.list[index].code === 408 && code === 108) {
                return i;
            }
            // Stop if we hit a non-continuation command
            if (page.list[index].code === 401 && code !== 401) {
                break;
            }
            if (page.list[index].code === 408 && code !== 408) {
                break;
            }
        }
        // Fallback to original index if no parent found
        return index;
    }

    /**
     * Create a small face icon canvas
     */
    createFaceIcon(faceData) {
        const { faceName, faceIndex } = faceData;
        if (!faceName) return null;

        const currentProject = this.eventEditor.projectController.getCurrentProject ?
            this.eventEditor.projectController.getCurrentProject() :
            this.eventEditor.projectController.currentProject;

        if (!currentProject) return null;

        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        canvas.style.cssText = `
            border: 1px solid var(--color-border-input);
            image-rendering: pixelated;
            image-rendering: -moz-crisp-edges;
            image-rendering: crisp-edges;
        `;

        const ctx = canvas.getContext('2d');
        const path = require('path');
        const imagePath = path.join(currentProject.path, 'img', 'faces', faceName + '.png');

        const faceSheet = new Image();
        faceSheet.src = 'file://' + imagePath.replace(/\\/g, '/');

        faceSheet.onload = () => {
            const col = faceIndex % 4;
            const row = Math.floor(faceIndex / 4);

            // Draw scaled down version (144x144 -> 32x32)
            ctx.drawImage(
                faceSheet,
                col * 144, row * 144,
                144, 144,
                0, 0,
                32, 32
            );
        };

        faceSheet.onerror = () => {
            // Draw a placeholder if image fails to load
            ctx.fillStyle = ThemeColors.resolve('--color-border-subtle', '#333333');
            ctx.fillRect(0, 0, 32, 32);
            ctx.fillStyle = '#666';
            ctx.fillText('?', 12, 20);
        };

        return canvas;
    }

    /**
     * Get color for command based on code
     */
    getCommandColor(code) {
        if (code === 0) return 'var(--color-text-dim)';
        if (code >= 100 && code < 200) return 'var(--color-syntax-type)'; // Messages/Dialogs
        if (code >= 200 && code < 300) return 'var(--color-syntax-function)'; // Game Progression
        if (code >= 300 && code < 400) return 'var(--color-syntax-string)'; // Flow Control
        if (code === 401) return 'var(--color-syntax-comment)'; // Text continuation
        if (code >= 400 && code < 500) return 'var(--color-syntax-comment)'; // Continuation
        return 'var(--color-link)'; // Other
    }

    /**
     * Get human-readable info for a command
     */
    getCommandInfo(command, page, index) {
        const code = command.code;
        const params = command.parameters || [];

        const commandNames = {
            0: { name: 'End', color: 'var(--color-text-dim)' },
            101: { name: 'Show Text', color: 'var(--color-syntax-type)' },
            102: { name: 'Show Choices', color: 'var(--color-syntax-type)' },
            103: { name: 'Input Number', color: 'var(--color-syntax-type)' },
            104: { name: 'Select Item', color: 'var(--color-syntax-type)' },
            105: { name: 'Show Scrolling Text', color: 'var(--color-syntax-type)' },
            108: { name: 'Comment', color: 'var(--color-syntax-string)' },
            109: { name: 'Skip', color: 'var(--color-syntax-string)' },
            111: { name: 'Conditional Branch', color: 'var(--color-syntax-string)' },
            112: { name: 'Loop', color: 'var(--color-syntax-string)' },
            113: { name: 'Break Loop', color: 'var(--color-syntax-string)' },
            115: { name: 'Exit Event', color: 'var(--color-syntax-string)' },
            117: { name: 'Common Event', color: 'var(--color-syntax-function)' },
            118: { name: 'Label', color: 'var(--color-syntax-string)' },
            119: { name: 'Jump to Label', color: 'var(--color-syntax-string)' },
            121: { name: 'Control Switches', color: 'var(--color-syntax-function)' },
            122: { name: 'Control Variables', color: 'var(--color-syntax-function)' },
            123: { name: 'Control Self Switch', color: 'var(--color-syntax-function)' },
            124: { name: 'Control Timer', color: 'var(--color-syntax-function)' },
            125: { name: 'Change Gold', color: 'var(--color-syntax-function)' },
            126: { name: 'Change Items', color: 'var(--color-syntax-function)' },
            127: { name: 'Change Weapons', color: 'var(--color-syntax-function)' },
            128: { name: 'Change Armors', color: 'var(--color-syntax-function)' },
            129: { name: 'Change Party Member', color: 'var(--color-syntax-function)' },
            132: { name: 'Change Battle BGM', color: 'var(--color-syntax-function)' },
            133: { name: 'Change Victory ME', color: 'var(--color-syntax-function)' },
            134: { name: 'Change Save Access', color: 'var(--color-syntax-function)' },
            135: { name: 'Change Menu Access', color: 'var(--color-syntax-function)' },
            136: { name: 'Change Encounter', color: 'var(--color-syntax-function)' },
            137: { name: 'Change Formation Access', color: 'var(--color-syntax-function)' },
            138: { name: 'Change Window Color', color: 'var(--color-syntax-function)' },
            139: { name: 'Change Defeat ME', color: 'var(--color-syntax-function)' },
            140: { name: 'Change Vehicle BGM', color: 'var(--color-syntax-function)' },
            201: { name: 'Transfer Player', color: 'var(--color-syntax-function)' },
            202: { name: 'Set Vehicle Location', color: 'var(--color-syntax-function)' },
            203: { name: 'Set Event Location', color: 'var(--color-syntax-function)' },
            204: { name: 'Scroll Map', color: 'var(--color-syntax-function)' },
            205: { name: 'Set Movement Route', color: 'var(--color-syntax-function)' },
            206: { name: 'Get on/off Vehicle', color: 'var(--color-syntax-function)' },
            211: { name: 'Change Transparency', color: 'var(--color-syntax-type)' },
            212: { name: 'Show Animation', color: 'var(--color-syntax-type)' },
            213: { name: 'Show Balloon Icon', color: 'var(--color-syntax-type)' },
            214: { name: 'Erase Event', color: 'var(--color-syntax-function)' },
            216: { name: 'Change Player Followers', color: 'var(--color-syntax-function)' },
            217: { name: 'Gather Followers', color: 'var(--color-syntax-function)' },
            221: { name: 'Fadeout Screen', color: 'var(--color-syntax-type)' },
            222: { name: 'Fadein Screen', color: 'var(--color-syntax-type)' },
            223: { name: 'Tint Screen', color: 'var(--color-syntax-type)' },
            224: { name: 'Flash Screen', color: 'var(--color-syntax-type)' },
            225: { name: 'Shake Screen', color: 'var(--color-syntax-type)' },
            230: { name: 'Wait', color: 'var(--color-syntax-string)' },
            231: { name: 'Show Picture', color: 'var(--color-syntax-type)' },
            232: { name: 'Move Picture', color: 'var(--color-syntax-type)' },
            233: { name: 'Rotate Picture', color: 'var(--color-syntax-type)' },
            234: { name: 'Tint Picture', color: 'var(--color-syntax-type)' },
            235: { name: 'Erase Picture', color: 'var(--color-syntax-type)' },
            236: { name: 'Set Weather Effect', color: 'var(--color-syntax-type)' },
            241: { name: 'Play BGM', color: 'var(--color-syntax-type)' },
            242: { name: 'Fadeout BGM', color: 'var(--color-syntax-type)' },
            243: { name: 'Save BGM', color: 'var(--color-syntax-type)' },
            244: { name: 'Replay BGM', color: 'var(--color-syntax-type)' },
            245: { name: 'Play BGS', color: 'var(--color-syntax-type)' },
            246: { name: 'Fadeout BGS', color: 'var(--color-syntax-type)' },
            249: { name: 'Play ME', color: 'var(--color-syntax-type)' },
            250: { name: 'Play SE', color: 'var(--color-syntax-type)' },
            251: { name: 'Stop SE', color: 'var(--color-syntax-type)' },
            261: { name: 'Play Movie', color: 'var(--color-syntax-type)' },
            281: { name: 'Change Map Name Display', color: 'var(--color-syntax-function)' },
            282: { name: 'Change Tileset', color: 'var(--color-syntax-function)' },
            283: { name: 'Change Battle Background', color: 'var(--color-syntax-function)' },
            284: { name: 'Change Parallax', color: 'var(--color-syntax-function)' },
            285: { name: 'Get Location Info', color: 'var(--color-syntax-function)' },
            301: { name: 'Battle Processing', color: 'var(--color-syntax-function)' },
            302: { name: 'Shop Processing', color: 'var(--color-syntax-function)' },
            303: { name: 'Name Input Processing', color: 'var(--color-syntax-function)' },
            311: { name: 'Change HP', color: 'var(--color-syntax-function)' },
            312: { name: 'Change MP', color: 'var(--color-syntax-function)' },
            313: { name: 'Change State', color: 'var(--color-syntax-function)' },
            314: { name: 'Recover All', color: 'var(--color-syntax-function)' },
            315: { name: 'Change EXP', color: 'var(--color-syntax-function)' },
            316: { name: 'Change Level', color: 'var(--color-syntax-function)' },
            317: { name: 'Change Parameter', color: 'var(--color-syntax-function)' },
            318: { name: 'Change Skill', color: 'var(--color-syntax-function)' },
            319: { name: 'Change Equipment', color: 'var(--color-syntax-function)' },
            320: { name: 'Change Name', color: 'var(--color-syntax-function)' },
            321: { name: 'Change Class', color: 'var(--color-syntax-function)' },
            322: { name: 'Change Actor Images', color: 'var(--color-syntax-function)' },
            323: { name: 'Change Vehicle Image', color: 'var(--color-syntax-function)' },
            324: { name: 'Change Nickname', color: 'var(--color-syntax-function)' },
            325: { name: 'Change Profile', color: 'var(--color-syntax-function)' },
            326: { name: 'Change TP', color: 'var(--color-syntax-function)' },
            331: { name: 'Change Enemy HP', color: 'var(--color-syntax-function)' },
            332: { name: 'Change Enemy MP', color: 'var(--color-syntax-function)' },
            333: { name: 'Change Enemy State', color: 'var(--color-syntax-function)' },
            334: { name: 'Enemy Recover All', color: 'var(--color-syntax-function)' },
            335: { name: 'Enemy Appear', color: 'var(--color-syntax-function)' },
            336: { name: 'Enemy Transform', color: 'var(--color-syntax-function)' },
            337: { name: 'Show Battle Animation', color: 'var(--color-syntax-function)' },
            339: { name: 'Force Action', color: 'var(--color-syntax-function)' },
            340: { name: 'Abort Battle', color: 'var(--color-syntax-function)' },
            342: { name: 'Change Enemy TP', color: 'var(--color-syntax-function)' },
            351: { name: 'Open Menu Screen', color: 'var(--color-syntax-function)' },
            352: { name: 'Open Save Screen', color: 'var(--color-syntax-function)' },
            353: { name: 'Game Over', color: 'var(--color-syntax-function)' },
            354: { name: 'Return to Title Screen', color: 'var(--color-syntax-function)' },
            355: { name: 'Script', color: 'var(--color-syntax-keyword)' },
            356: { name: 'Plugin Command', color: 'var(--color-syntax-keyword)' },
            357: { name: 'Plugin Command', color: 'var(--color-syntax-keyword)' },
            401: { name: 'Text', color: 'var(--color-syntax-comment)' },
            402: { name: 'When', color: 'var(--color-syntax-string)' },
            403: { name: 'When Cancel', color: 'var(--color-syntax-string)' },
            404: { name: 'End', color: 'var(--color-syntax-comment)' },
            405: { name: 'Scrolling Text', color: 'var(--color-syntax-comment)' },
            411: { name: 'Else', color: 'var(--color-syntax-comment)' },
            412: { name: 'End', color: 'var(--color-syntax-comment)' },
            413: { name: 'Repeat Above', color: 'var(--color-syntax-comment)' },
            505: { name: 'Move Route', color: 'var(--color-syntax-comment)' },
            601: { name: 'If Win', color: 'var(--color-syntax-string)' },
            602: { name: 'If Escape', color: 'var(--color-syntax-string)' },
            603: { name: 'If Lose', color: 'var(--color-syntax-string)' },
            604: { name: 'End', color: 'var(--color-syntax-comment)' },
            605: { name: 'Shop Good', color: 'var(--color-syntax-comment)' },
            655: { name: 'Script', color: 'var(--color-syntax-comment)' },
            657: { name: 'Plugin Args', color: 'var(--color-syntax-comment)' }
        };

        const rawInfo = commandNames[code] || { name: `Unknown (${code})`, color: '#f88' };
        const info = { ...rawInfo, name: this._commandName(rawInfo.name) };

        let description = '';
        let faceIcon = null;

        switch (code) {
            case 101: {
                // Show Text - display face info and speaker name
                const faceName = params[0] || '';
                const faceIndex = params[1] || 0;
                const speakerName = params[4] || '';

                if (faceName) {
                    description = `Face: ${faceName} [${faceIndex}]`;
                    if (speakerName) {
                        description += ` - ${speakerName}`;
                    }
                    // Create face icon data for rendering
                    faceIcon = { faceName, faceIndex };
                } else if (speakerName) {
                    description = speakerName;
                } else {
                    description = '(No face or speaker)';
                }
                break;
            }
            case 108:
                // Comment - show first line only
                description = params[0] || '';
                break;
            case 111: {
                // Conditional Branch - show condition details
                const condType = params[0] || 0;
                const condTypes = ['Switch', 'Variable', 'Self Switch', 'Timer', 'Actor', 'Enemy', 'Character', 'Gold', 'Item', 'Weapon', 'Armor', 'Button', 'Script'];

                if (condType === 0) { // Switch
                    const switchId = params[1] || 1;
                    const value = params[2] === 0 ? 'ON' : 'OFF';
                    description = `Switch ${this._fmtSwitch(switchId)} is ${value}`;
                } else if (condType === 1) { // Variable
                    const varId = params[1] || 1;
                    const compNames = ['==', '>=', '<=', '>', '<', '!='];
                    const comp = compNames[params[4] || 0];
                    const value = params[3] || 0;
                    description = `Variable ${this._fmtVar(varId)} ${comp} ${value}`;
                } else if (condType === 2) { // Self Switch
                    const ch = params[1] || 'A';
                    const value = params[2] === 0 ? 'ON' : 'OFF';
                    description = `Self Switch ${ch} is ${value}`;
                } else if (condType === 7) { // Gold
                    const amount = params[1] || 0;
                    const compNames = ['>=', '<=', '<'];
                    const comp = compNames[params[2] || 0];
                    description = `Gold ${comp} ${amount}`;
                } else if (condType === 12) { // Script
                    const s = String(params[1] || '');
                    description = `Script: ${s.substring(0, 150)}${s.length > 150 ? '...' : ''}`;
                } else {
                    description = condTypes[condType] || 'Unknown condition';
                }
                break;
            }
            case 401:
                description = params[0] || '';
                break;
            case 408:
                // Comment continuation - show text
                description = params[0] || '';
                break;
            case 402: {
                // When [Choice N]
                const choiceIndex = params[0];
                description = `Choice ${choiceIndex + 1}`;
                break;
            }
            case 403:
                // When Cancel
                description = '';
                break;
            case 230: {
                // Wait
                const frames = params[0] || 60;
                const seconds = (frames / 60).toFixed(2);
                description = `${frames} frames (${seconds}s)`;
                break;
            }
            case 121: {
                // Control Switches
                const start = params[0];
                const end = params[1];
                const value = params[2] === 0 ? 'ON' : 'OFF';
                if (start === end) {
                    description = `${this._fmtSwitch(start)} = ${value}`;
                } else {
                    description = `${this._fmtSwitch(start)}..${this._fmtSwitch(end)} = ${value}`;
                }
                break;
            }
            case 122: {
                // Control Variables
                const start = params[0];
                const end = params[1];
                const operationType = params[2]; // 0=Set, 1=Add, 2=Sub, 3=Mul, 4=Div, 5=Mod
                const operandType = params[3]; // 0=Constant, 1=Variable, 2=Random, 3=Game Data, 4=Script

                const operations = ['=', '+=', '-=', '*=', '/=', '%='];
                const opSymbol = operations[operationType] || '=';

                let valueStr = '';
                if (operandType === 0) {
                    // Constant
                    valueStr = String(params[4]);
                } else if (operandType === 1) {
                    // Variable
                    valueStr = this._fmtVarBracket(params[4]);
                } else if (operandType === 2) {
                    // Random: params[4]=min, params[5]=max
                    const min = params[4] || 0;
                    const max = params[5] || 0;
                    valueStr = `Random(${min}..${max})`;
                } else if (operandType === 3) {
                    // Game Data: params[4]=type, params[5]=param1, params[6]=param2
                    valueStr = this._fmtGameDataOperand(params[4], params[5], params[6]);
                } else if (operandType === 4) {
                    // Script: params[4]=script string
                    const scriptText = String(params[4] || '');
                    const trimmed = scriptText.substring(0, 150);
                    valueStr = `Script: ${trimmed}${scriptText.length > 150 ? '...' : ''}`;
                }

                if (start === end) {
                    description = `${this._fmtVar(start)} ${opSymbol} ${valueStr}`;
                } else {
                    description = `${this._fmtVar(start)}..${this._fmtVar(end)} ${opSymbol} ${valueStr}`;
                }
                break;
            }
            case 123:
                description = `${params[0]} = ${params[1] === 0 ? 'ON' : 'OFF'}`;
                break;
            case 125: {
                // Change Gold: [operation, operandType, operand] (MZ order)
                const operation = params[0] === 0 ? '+' : '-';
                const operandType = params[1] || 0;
                const operand = params[2] || 0;
                if (operandType === 1) {
                    // Variable
                    description = `${operation}${this._fmtVarBracket(operand)} gold`;
                } else {
                    // Constant
                    description = `${operation}${operand} gold`;
                }
                break;
            }
            case 126: {
                // Change Items
                const itemId = params[0] || 1;
                const operation = params[1] === 0 ? '+' : '-';
                const operandType = params[2] || 0;
                const operand = params[3] || 1;

                // Get item name from database
                let itemName = `Item ${itemId.toString().padStart(3, '0')}`;
                if (this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.items) {
                    const item = this.eventEditor.databaseManager.data.items[itemId];
                    if (item && item.name) {
                        itemName = item.name;
                    }
                }

                if (operandType === 1) {
                    // Variable
                    description = `${itemName} ${operation}${this._fmtVarBracket(operand)}`;
                } else {
                    // Constant
                    description = `${itemName} ${operation}${operand}`;
                }
                break;
            }
            case 127: {
                // Change Weapons
                const weaponId = params[0] || 1;
                const operation = params[1] === 0 ? '+' : '-';
                const operandType = params[2] || 0;
                const operand = params[3] || 1;
                const includeEquipment = params[4] !== undefined ? params[4] : true;

                // Get weapon name from database
                let weaponName = `Weapon ${weaponId.toString().padStart(3, '0')}`;
                if (this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.weapons) {
                    const weapon = this.eventEditor.databaseManager.data.weapons[weaponId];
                    if (weapon && weapon.name) {
                        weaponName = weapon.name;
                    }
                }

                if (operandType === 1) {
                    // Variable
                    description = `${weaponName} ${operation}${this._fmtVarBracket(operand)}`;
                } else {
                    // Constant
                    description = `${weaponName} ${operation}${operand}`;
                }
                if (operation === '-' && !includeEquipment) {
                    description += ' (Exclude equipped)';
                }
                break;
            }
            case 128: {
                // Change Armors
                const armorId = params[0] || 1;
                const operation = params[1] === 0 ? '+' : '-';
                const operandType = params[2] || 0;
                const operand = params[3] || 1;
                const includeEquipment = params[4] !== undefined ? params[4] : true;

                // Get armor name from database
                let armorName = `Armor ${armorId.toString().padStart(3, '0')}`;
                if (this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.armors) {
                    const armor = this.eventEditor.databaseManager.data.armors[armorId];
                    if (armor && armor.name) {
                        armorName = armor.name;
                    }
                }

                if (operandType === 1) {
                    // Variable
                    description = `${armorName} ${operation}${this._fmtVarBracket(operand)}`;
                } else {
                    // Constant
                    description = `${armorName} ${operation}${operand}`;
                }
                if (operation === '-' && !includeEquipment) {
                    description += ' (Exclude equipped)';
                }
                break;
            }
            case 129: {
                // Change Party Member
                const actorId = params[0] || 1;
                const operation = params[1] || 0;
                const initialize = params[2] !== undefined ? params[2] : true;

                // Get actor name from database
                let actorName = `Actor ${actorId.toString().padStart(3, '0')}`;
                if (this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.actors) {
                    const actor = this.eventEditor.databaseManager.data.actors[actorId];
                    if (actor && actor.name) {
                        actorName = actor.name;
                    }
                }

                if (operation === 0) {
                    // Add
                    description = `Add ${actorName}`;
                    if (initialize) {
                        description += ' (Initialize)';
                    }
                } else {
                    // Remove
                    description = `Remove ${actorName}`;
                }
                break;
            }
            case 201: {
                // Transfer Player
                // Standard format: [designation, mapId, x, y, direction, fadeType]
                // designation: 0 = direct, 1 = variables
                const designation = params[0] || 0;
                const mapId = params[1] || 1;
                const x = params[2] !== undefined ? params[2] : 0;
                const y = params[3] !== undefined ? params[3] : 0;
                const direction = params[4] || 0;
                const fadeType = params[5] || 0;

                const directionNames = { 0: 'Retain', 2: 'Down', 4: 'Left', 6: 'Right', 8: 'Up' };
                const fadeNames = { 0: 'Black', 1: 'White', 2: 'None' };

                // Get map name from database
                let mapName = `Map${mapId.toString().padStart(3, '0')}`;
                if (this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.mapInfos) {
                    const mapInfo = this.eventEditor.databaseManager.data.mapInfos[mapId];
                    if (mapInfo && mapInfo.name) {
                        mapName = mapInfo.name;
                    }
                }

                if (designation === 0) {
                    description = `${mapName} (${x}, ${y})`;
                } else {
                    description = `${this._fmtVarBracket(mapId)}, ${this._fmtVarBracket(x)}, ${this._fmtVarBracket(y)}`;
                }
                if (direction !== 0) {
                    description += `, ${directionNames[direction]}`;
                }
                if (fadeType !== 0) {
                    description += `, Fade: ${fadeNames[fadeType]}`;
                }
                break;
            }
            case 203: {
                // Set Event Location
                const characterId = params[0] !== undefined ? params[0] : -1;
                const type = params[1] || 0;

                let charName = '';
                if (characterId === -1) {
                    charName = 'Player';
                } else if (characterId === 0) {
                    charName = 'This Event';
                } else {
                    charName = this._fmtEvent(characterId);
                }

                if (type === 0) {
                    // Direct designation
                    const x = params[2] || 0;
                    const y = params[3] || 0;
                    const direction = params[4] || 0;
                    const directionNames = { 0: '', 2: ' ▼', 4: ' ◄', 6: ' ►', 8: ' ▲' };
                    description = `${charName} → (${x}, ${y})${directionNames[direction]}`;
                } else if (type === 1) {
                    // Variable designation
                    const xVar = params[2] || 1;
                    const yVar = params[3] || 1;
                    const direction = params[4] || 0;
                    const directionNames = { 0: '', 2: ' ▼', 4: ' ◄', 6: ' ►', 8: ' ▲' };
                    description = `${charName} → (${this._fmtVarBracket(xVar)}, ${this._fmtVarBracket(yVar)})${directionNames[direction]}`;
                } else if (type === 2) {
                    // Exchange with event
                    const mapId = params[2] || 1;
                    const eventId = params[3] || 1;
                    description = `${charName} ⇄ Map${mapId.toString().padStart(3, '0')} Event${eventId.toString().padStart(3, '0')}`;
                }
                break;
            }
            case 204: {
                // Scroll Map
                const direction = params[0] || 2;
                const distance = params[1] || 1;
                const speed = params[2] || 4;

                const directionNames = { 2: 'Down', 4: 'Left', 6: 'Right', 8: 'Up' };
                description = `${directionNames[direction]} ${distance} tiles (Speed: ${speed})`;
                break;
            }
            case 205: {
                // Set Movement Route
                const charId = params[0] != null ? params[0] : -1;
                const route = params[1];
                let charName = 'Player';
                if (charId === 0) charName = 'This Event';
                else if (charId > 0) charName = this._fmtEvent(charId);
                const cmdCount = route && route.list ? route.list.filter(c => c.code !== 0).length : 0;
                description = `${charName} (${cmdCount} command${cmdCount !== 1 ? 's' : ''})`;
                break;
            }
            case 213: {
                // Show Balloon Icon
                const characterId = params[0] !== undefined ? params[0] : -1;
                const balloonId = params[1] || 1;
                const waitForCompletion = params[2] !== undefined ? params[2] : true;

                const balloonNames = [
                    'Exclamation', 'Question', 'Music Note', 'Heart', 'Anger',
                    'Sweat', 'Cobweb', 'Silence', 'Light Bulb', 'Zzz',
                    'User-defined 1', 'User-defined 2', 'User-defined 3',
                    'User-defined 4', 'User-defined 5'
                ];

                let charName = '';
                if (characterId === -1) {
                    charName = 'Player';
                } else if (characterId === 0) {
                    charName = 'This Event';
                } else {
                    charName = this._fmtEvent(characterId);
                }

                const balloonName = balloonNames[balloonId - 1] || 'Unknown';
                description = `${charName}: ${balloonName}`;
                if (waitForCompletion) {
                    description += ' (Wait)';
                }
                break;
            }
            case 505: // Movement route commands
                if (params[0] && params[0].code !== undefined) {
                    const moveCommandNames = {
                        1: 'Move Down',
                        2: 'Move Left',
                        3: 'Move Right',
                        4: 'Move Up',
                        5: 'Move Lower Left',
                        6: 'Move Lower Right',
                        7: 'Move Upper Left',
                        8: 'Move Upper Right',
                        9: 'Move at Random',
                        10: 'Move toward Player',
                        11: 'Move away from Player',
                        12: 'Step Forward',
                        13: 'Step Backward',
                        14: 'Jump',
                        15: 'Wait',
                        16: 'Turn Down',
                        17: 'Turn Left',
                        18: 'Turn Right',
                        19: 'Turn Up',
                        20: 'Turn 90° Right',
                        21: 'Turn 90° Left',
                        22: 'Turn 180°',
                        23: 'Turn 90° Right or Left',
                        24: 'Turn at Random',
                        25: 'Turn toward Player',
                        26: 'Turn away from Player',
                        27: 'Switch ON',
                        28: 'Switch OFF',
                        29: 'Change Speed',
                        30: 'Change Frequency',
                        31: 'Walk Animation ON',
                        32: 'Walk Animation OFF',
                        33: 'Step Animation ON',
                        34: 'Step Animation OFF',
                        35: 'Direction Fix ON',
                        36: 'Direction Fix OFF',
                        37: 'Through ON',
                        38: 'Through OFF',
                        39: 'Transparent ON',
                        40: 'Transparent OFF',
                        41: 'Change Image',
                        42: 'Change Opacity',
                        43: 'Change Blend Mode',
                        44: 'Play SE',
                        45: 'Script'
                    };
                    const moveName = moveCommandNames[params[0].code] || `Move Code ${params[0].code}`;
                    description = moveName;
                    const mp = params[0].parameters;
                    if (mp && mp.length > 0) {
                        const mc = params[0].code;
                        if (mc === 14) description += `: ${mp[0]}, ${mp[1]}`;
                        else if (mc === 15) description += `: ${mp[0]} frames`;
                        else if (mc === 27 || mc === 28) description += `: [${mp[0]}]`;
                        else if (mc === 29) description += `: ${({1:'x8 Slower',2:'x4 Slower',3:'x2 Slower',4:'Normal',5:'x2 Faster',6:'x4 Faster'})[mp[0]] || mp[0]}`;
                        else if (mc === 30) description += `: ${({1:'Lowest',2:'Lower',3:'Normal',4:'Higher',5:'Highest'})[mp[0]] || mp[0]}`;
                        else if (mc === 41) description += `: ${mp[0] || '(none)'} [${mp[1]}]`;
                        else if (mc === 42) description += `: ${mp[0]}`;
                        else if (mc === 43) description += `: ${({0:'Normal',1:'Additive',2:'Multiply',3:'Screen'})[mp[0]] || mp[0]}`;
                        else if (mc === 44) description += mp[0] && mp[0].name ? `: ${mp[0].name}` : '';
                        else if (mc === 45) description += `: ${String(mp[0] || '').substring(0, 30)}`;
                    }
                }
                break;
            case 241: // Play BGM
            case 245: // Play BGS
            case 249: // Play ME
            case 250: // Play SE
                if (params[0] && params[0].name) {
                    description = `${params[0].name} (Vol: ${params[0].volume}, Pitch: ${params[0].pitch}%, Pan: ${params[0].pan})`;
                } else {
                    description = '(None)';
                }
                break;
            case 242: // Fadeout BGM
            case 246: // Fadeout BGS
                description = `${(params[0] || 60) / 60}s`;
                break;
            case 251: // Stop SE
                description = '';
                break;
            case 355: {
                // Script - collect this line + all following 655 continuations
                const lines = [params[0] || ''];
                if (page && index !== undefined && page.list) {
                    for (let i = index + 1; i < page.list.length; i++) {
                        if (page.list[i].code !== 655) break;
                        lines.push((page.list[i].parameters && page.list[i].parameters[0]) || '');
                    }
                }
                const firstNonEmpty = lines.find(l => l && l.trim()) || '';
                let preview = firstNonEmpty.substring(0, 200);
                if (firstNonEmpty.length > 200) preview += '...';
                const extra = lines.length - 1;
                if (extra > 0) {
                    description = `${preview}  (+${extra} more line${extra === 1 ? '' : 's'})`;
                } else {
                    description = preview;
                }
                break;
            }
            case 356:
            case 357: {
                // Plugin Command (356 = MV, 357 = MZ)
                const pluginName = params[0] || '';
                const commandName = params[1] || '';
                if (pluginName && commandName) {
                    description = `${pluginName}: ${commandName}`;
                } else if (pluginName) {
                    description = pluginName;
                } else {
                    description = '(not configured)';
                }
                // 357: append args object (params[3]) inline so callers see
                // "FollowerControl: setFollowerControl  (memberIndex=1, action=Move Down)"
                if (code === 357 && params[3] && typeof params[3] === 'object') {
                    const argEntries = Object.entries(params[3])
                        .filter(([k, v]) => v !== undefined && v !== null && v !== '')
                        .map(([k, v]) => {
                            const sv = String(v);
                            return `${k}=${sv.length > 30 ? sv.substring(0, 27) + '...' : sv}`;
                        });
                    if (argEntries.length > 0) {
                        description += `  (${argEntries.join(', ')})`;
                    }
                }
                break;
            }
            case 655: {
                // Script continuation (rows are hidden; this is defensive)
                const scriptLine = params[0] || '';
                description = scriptLine.substring(0, 200);
                if (scriptLine.length > 200) {
                    description += '...';
                }
                break;
            }
            case 103: {
                // Input Number
                const varId = params[0] || 1;
                const maxDigits = params[1] || 1;
                description = `Variable ${this._fmtVar(varId)}, ${maxDigits} digits`;
                break;
            }
            case 104: {
                // Select Item
                const varId = params[0] || 1;
                const itemTypes = { 1: 'Regular', 2: 'Key', 3: 'Hidden A', 4: 'Hidden B' };
                description = `Variable ${this._fmtVar(varId)}, ${itemTypes[params[1]] || 'Regular'} Item`;
                break;
            }
            case 105: {
                // Show Scrolling Text
                const speed = params[0] || 2;
                const noFastFwd = params[1] ? ' (No Fast Forward)' : '';
                description = `Speed: ${speed}${noFastFwd}`;
                break;
            }
            case 117: {
                // Common Event
                const ceId = params[0] || 1;
                let ceName = `Common Event ${ceId}`;
                if (this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.commonEvents) {
                    const ce = this.eventEditor.databaseManager.data.commonEvents[ceId];
                    if (ce && ce.name) ceName = ce.name;
                }
                description = `#${ceId.toString().padStart(4, '0')}: ${ceName}`;
                break;
            }
            case 118:
                description = params[0] || '';
                break;
            case 119:
                description = params[0] || '';
                break;
            case 132:
            case 133: {
                const audio = params[0] || {};
                description = audio.name || '(None)';
                break;
            }
            case 134: description = params[0] === 0 ? 'Disable' : 'Enable'; break;
            case 135: description = params[0] === 0 ? 'Disable' : 'Enable'; break;
            case 136: description = params[0] === 0 ? 'Disable' : 'Enable'; break;
            case 137: description = params[0] === 0 ? 'Disable' : 'Enable'; break;
            case 138: {
                const tone = params[0] || [0,0,0,0];
                description = `(${tone[0]}, ${tone[1]}, ${tone[2]}, ${tone[3]})`;
                break;
            }
            case 139: {
                const audio = params[0] || {};
                description = audio.name || '(None)';
                break;
            }
            case 140: {
                const vehicles = ['Boat', 'Ship', 'Airship'];
                const audio = params[1] || {};
                description = `${vehicles[params[0]] || 'Unknown'}: ${audio.name || '(None)'}`;
                break;
            }
            case 202: {
                const vehicles = ['Boat', 'Ship', 'Airship'];
                description = `${vehicles[params[0]] || 'Unknown'} → (${params[2]}, ${params[3]}, ${params[4]})`;
                break;
            }
            case 216: description = params[0] === 0 ? 'Show' : 'Hide'; break;
            case 223: {
                const tone = params[0] || [0,0,0,0];
                const dur = params[1] || 60;
                description = `(${tone[0]}, ${tone[1]}, ${tone[2]}, ${tone[3]}) ${dur} frames`;
                break;
            }
            case 224: {
                const color = params[0] || [255,255,255,190];
                const dur = params[1] || 8;
                description = `(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]}) ${dur} frames`;
                break;
            }
            case 225: {
                description = `Power: ${params[0] || 5}, Speed: ${params[1] || 5}, ${params[2] || 60} frames`;
                break;
            }
            case 232: {
                description = `#${params[0] || 1} (${params[4] || 0}, ${params[5] || 0}) ${params[10] || 60} frames`;
                break;
            }
            case 233: {
                description = `#${params[0] || 1} Speed: ${params[1] || 0}`;
                break;
            }
            case 234: {
                const tone = params[1] || [0,0,0,0];
                description = `#${params[0] || 1} (${tone[0]}, ${tone[1]}, ${tone[2]}, ${tone[3]}) ${params[2] || 60} frames`;
                break;
            }
            case 236: {
                const types = { none: 'None', rain: 'Rain', storm: 'Storm', snow: 'Snow' };
                description = `${types[params[0]] || params[0]}, Power: ${params[1] || 5}, ${params[2] || 60} frames`;
                break;
            }
            case 261:
                description = params[0] || '';
                break;
            case 281: description = params[0] === 0 ? 'Enable' : 'Disable'; break;
            case 282: {
                const tsId = params[0] || 1;
                let tsName = `Tileset ${tsId}`;
                if (this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.tilesets) {
                    const ts = this.eventEditor.databaseManager.data.tilesets[tsId];
                    if (ts && ts.name) tsName = ts.name;
                }
                description = tsName;
                break;
            }
            case 283:
                description = `${params[0] || ''}, ${params[1] || ''}`;
                break;
            case 284:
                description = params[0] || '(None)';
                break;
            case 285: {
                const infoTypes = ['Terrain Tag', 'Event ID', 'Tile ID (Layer 1)', 'Tile ID (Layer 2)', 'Tile ID (Layer 3)', 'Tile ID (Layer 4)', 'Region ID'];
                description = `${this._fmtVar(params[0] || 1)} = ${infoTypes[params[1]] || 'Unknown'}`;
                break;
            }
            case 301: {
                const desig = params[0] || 0;
                if (desig === 2) {
                    description = 'Random Encounter';
                } else {
                    const troopId = params[1] || 1;
                    let troopName = `Troop ${troopId}`;
                    if (desig === 0 && this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.troops) {
                        const t = this.eventEditor.databaseManager.data.troops[troopId];
                        if (t && t.name) troopName = t.name;
                    }
                    description = desig === 1 ? `Variable ${this._fmtVar(troopId)}` : troopName;
                }
                if (params[2]) description += ' (Can Escape)';
                if (params[3]) description += ' (Can Lose)';
                break;
            }
            case 302: {
                const types = ['Item', 'Weapon', 'Armor'];
                const itemType = types[params[0]] || 'Item';
                const itemId = params[1] || 1;
                description = `${itemType} #${itemId.toString().padStart(4, '0')}`;
                if (params[4]) description += ' (Purchase Only)';
                break;
            }
            case 303: {
                const actorId = params[0] || 1;
                let actorName = `Actor ${actorId}`;
                if (this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.actors) {
                    const a = this.eventEditor.databaseManager.data.actors[actorId];
                    if (a && a.name) actorName = a.name;
                }
                description = `${actorName}, Max ${params[1] || 8} chars`;
                break;
            }
            case 311: case 312: case 326: {
                // Change HP/MP/TP
                const op = params[2] === 0 ? '+' : '-';
                const opType = params[3] || 0;
                const val = params[4] || 0;
                const valStr = opType === 1 ? this._fmtVarBracket(val) : val;
                description = `${op}${valStr}`;
                break;
            }
            case 313: {
                const op = params[2] === 0 ? 'Add' : 'Remove';
                const stId = params[3] || 1;
                let stName = `State ${stId}`;
                if (this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.states) {
                    const s = this.eventEditor.databaseManager.data.states[stId];
                    if (s && s.name) stName = s.name;
                }
                description = `${op} ${stName}`;
                break;
            }
            case 314:
                description = params[0] === 0 ? 'Fixed Actor' : 'Variable';
                break;
            case 315: case 316: {
                const op = params[2] === 0 ? '+' : '-';
                const opType = params[3] || 0;
                const val = params[4] || 0;
                const valStr = opType === 1 ? this._fmtVarBracket(val) : val;
                description = `${op}${valStr}`;
                if (params[5]) description += ' (Show)';
                break;
            }
            case 317: {
                const paramNames = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
                const pName = paramNames[params[2]] || 'Unknown';
                const op = params[3] === 0 ? '+' : '-';
                const val = params[5] || 0;
                description = `${pName} ${op}${val}`;
                break;
            }
            case 318: {
                const op = params[2] === 0 ? 'Learn' : 'Forget';
                const skId = params[3] || 1;
                let skName = `Skill ${skId}`;
                if (this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.skills) {
                    const s = this.eventEditor.databaseManager.data.skills[skId];
                    if (s && s.name) skName = s.name;
                }
                description = `${op} ${skName}`;
                break;
            }
            case 319: {
                const slots = ['Weapon', 'Shield', 'Head', 'Body', 'Accessory'];
                description = `${slots[params[1]] || 'Unknown'} = #${params[2] || 0}`;
                break;
            }
            case 320: case 324:
                description = `${params[1] || ''}`;
                break;
            case 321: {
                let clsName = `Class ${params[1] || 1}`;
                if (this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.classes) {
                    const c = this.eventEditor.databaseManager.data.classes[params[1]];
                    if (c && c.name) clsName = c.name;
                }
                description = clsName;
                break;
            }
            case 322:
                description = `Character: ${params[1] || '(None)'}`;
                break;
            case 323: {
                const vehicles = ['Boat', 'Ship', 'Airship'];
                description = `${vehicles[params[0]] || 'Unknown'}: ${params[1] || '(None)'}`;
                break;
            }
            case 325:
                description = (params[1] || '').substring(0, 40);
                break;
            case 331: case 332: case 342: {
                const idx = params[0] || 0;
                const op = params[1] === 0 ? '+' : '-';
                const val = params[3] || 0;
                description = `#${idx + 1} ${op}${val}`;
                break;
            }
            case 333: {
                const idx = params[0] || 0;
                const op = params[1] === 0 ? 'Add' : 'Remove';
                const stId = params[2] || 1;
                description = `#${idx + 1} ${op} State ${stId}`;
                break;
            }
            case 334: case 335: {
                const idx = params[0];
                description = idx === -1 ? 'Entire Troop' : `#${(idx || 0) + 1}`;
                break;
            }
            case 336: {
                const idx = params[0] || 0;
                const newId = params[1] || 1;
                let eName = `Enemy ${newId}`;
                if (this.eventEditor.databaseManager && this.eventEditor.databaseManager.data && this.eventEditor.databaseManager.data.enemies) {
                    const e = this.eventEditor.databaseManager.data.enemies[newId];
                    if (e && e.name) eName = e.name;
                }
                description = `#${idx + 1} → ${eName}`;
                break;
            }
            case 337: {
                const idx = params[0];
                const animId = params[1] || 1;
                description = `${idx === -1 ? 'All' : '#' + (idx + 1)} Anim ${this._fmtAnim(animId)}`;
                break;
            }
            case 339: {
                const bType = params[0] === 0 ? 'Enemy' : 'Actor';
                const bId = params[1] || 0;
                const skId = params[2] || 1;
                let skName = `Skill #${skId}`;
                try {
                    const sk = this.eventEditor.databaseManager.data.skills[skId];
                    if (sk && sk.name) skName = sk.name;
                } catch (e) { /* */ }
                description = `${bType} #${bId + (params[0] === 0 ? 1 : 0)} uses ${skName}`;
                break;
            }
            case 405:
                description = params[0] || '';
                break;
            case 102: {
                // Show Choices
                const choices = params[0] || [];
                if (choices.length > 0) {
                    description = choices.join(', ');
                    if (description.length > 150) description = description.substring(0, 147) + '...';
                }
                break;
            }
            case 124: {
                // Control Timer
                const timerOp = params[0] || 0;
                if (timerOp === 0) {
                    const seconds = params[1] || 0;
                    const min = Math.floor(seconds / 60);
                    const sec = seconds % 60;
                    description = `Start ${min}:${sec.toString().padStart(2, '0')}`;
                } else {
                    description = 'Stop';
                }
                break;
            }
            case 211:
                // Change Transparency
                description = params[0] === 0 ? 'ON' : 'OFF';
                break;
            case 212: {
                // Show Animation
                const charId = params[0] !== undefined ? params[0] : -1;
                const animId = params[1] || 1;
                const wait = params[2];
                let charName = 'Player';
                if (charId === 0) charName = 'This Event';
                else if (charId > 0) charName = this._fmtEvent(charId);
                description = `${charName}, Anim ${this._fmtAnim(animId)}`;
                if (wait) description += ' (Wait)';
                break;
            }
            case 231: {
                // Show Picture
                const picNum = params[0] || 1;
                const picName = params[1] || '';
                description = `#${picNum}: ${picName || '(None)'}`;
                break;
            }
            case 235:
                // Erase Picture
                description = `#${params[0] || 1}`;
                break;
            case 605: {
                const types = ['Item', 'Weapon', 'Armor'];
                description = `${types[params[0]] || 'Item'} #${(params[1] || 1).toString().padStart(4, '0')}`;
                break;
            }
            default:
                if (params.length > 0 && code !== 0) {
                    description = JSON.stringify(params).substring(0, 60);
                }
        }

        return {
            name: info.name,
            color: info.color,
            description: description,
            faceIcon: faceIcon
        };
    }

    // ------------------------------------------------------------------
    //  Name-lookup helpers for display text
    // ------------------------------------------------------------------

    _lookupSwitchName(id) {
        try {
            const sys = this.eventEditor.databaseManager.getSystem();
            if (sys && sys.switches && sys.switches[id]) {
                const n = sys.switches[id].trim();
                if (n) return n;
            }
        } catch (e) { /* */ }
        return '';
    }

    _lookupVariableName(id) {
        try {
            const sys = this.eventEditor.databaseManager.getSystem();
            if (sys && sys.variables && sys.variables[id]) {
                const n = sys.variables[id].trim();
                if (n) return n;
            }
        } catch (e) { /* */ }
        return '';
    }

    _lookupEventName(id) {
        try {
            const events = this.eventEditor.projectController.eventManager.currentMap.events;
            if (events && Array.isArray(events)) {
                const ev = events.find(e => e && e.id === id);
                if (ev && ev.name) return ev.name;
            }
        } catch (e) { /* */ }
        return '';
    }

    _lookupAnimationName(id) {
        try {
            const anims = this.eventEditor.databaseManager.data.animations;
            if (anims && anims[id] && anims[id].name) {
                return anims[id].name.trim();
            }
        } catch (e) { /* */ }
        return '';
    }

    /** Format a switch reference: #0001 SwitchName */
    _fmtSwitch(id) {
        const num = `#${id.toString().padStart(4, '0')}`;
        const name = this._lookupSwitchName(id);
        return name ? `${num} ${name}` : `${num} (unnamed)`;
    }

    /** Format a variable reference: #0001 VarName */
    _fmtVar(id) {
        const num = `#${id.toString().padStart(4, '0')}`;
        const name = this._lookupVariableName(id);
        return name ? `${num} ${name}` : `${num} (unnamed)`;
    }

    /** Format a Game Data operand: type+param1+param2 → readable string */
    _fmtGameDataOperand(type, param1, param2) {
        type = type || 0;
        param1 = param1 || 0;
        param2 = param2 || 0;
        const data = this.eventEditor.databaseManager && this.eventEditor.databaseManager.data;
        switch (type) {
            case 0: { // Item count
                let name = `Item ${param1}`;
                if (data && data.items && data.items[param1] && data.items[param1].name) name = data.items[param1].name;
                return `Item Count: ${name}`;
            }
            case 1: { // Weapon count
                let name = `Weapon ${param1}`;
                if (data && data.weapons && data.weapons[param1] && data.weapons[param1].name) name = data.weapons[param1].name;
                return `Weapon Count: ${name}`;
            }
            case 2: { // Armor count
                let name = `Armor ${param1}`;
                if (data && data.armors && data.armors[param1] && data.armors[param1].name) name = data.armors[param1].name;
                return `Armor Count: ${name}`;
            }
            case 3: { // Actor param
                let name = `Actor ${param1}`;
                if (data && data.actors && data.actors[param1] && data.actors[param1].name) name = data.actors[param1].name;
                const paramNames = ['Level', 'EXP', 'HP', 'MP', 'Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
                return `${name}.${paramNames[param2] || 'param'}`;
            }
            case 4: { // Enemy param (param1 = troop member index)
                const paramNames = ['HP', 'MP', 'Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
                return `Troop #${param1 + 1}.${paramNames[param2] || 'param'}`;
            }
            case 5: { // Character (param1 = char id, param2 = prop)
                let charName = '';
                if (param1 === -1) charName = 'Player';
                else if (param1 === 0) charName = 'This Event';
                else charName = this._fmtEvent(param1);
                const propNames = ['Map X', 'Map Y', 'Direction', 'Screen X', 'Screen Y'];
                return `${charName}.${propNames[param2] || 'prop'}`;
            }
            case 6: // Party member (param1 = member index)
                return `Party Member #${param1 + 1} Actor ID`;
            case 7: { // Other
                const otherNames = ['Map ID', 'Party Size', 'Gold', 'Steps', 'Play Time', 'Timer', 'Save Count', 'Battle Count', 'Win Count', 'Escape Count'];
                return otherNames[param1] || 'Other';
            }
            default:
                return 'Game Data';
        }
    }

    /** Format a compact variable operand: V[0001 VarName] */
    _fmtVarBracket(id) {
        const num = id.toString().padStart(4, '0');
        const name = this._lookupVariableName(id);
        return name ? `V[${num} ${name}]` : `V[${num}]`;
    }

    /** Format an event reference: Event 001: Name  (or just Event 001) */
    _fmtEvent(id) {
        const num = `Event ${id.toString().padStart(3, '0')}`;
        const name = this._lookupEventName(id);
        return name ? `${num}: ${name}` : num;
    }

    /** Format an animation reference: #1 AnimName */
    _fmtAnim(id) {
        const num = `#${id}`;
        const name = this._lookupAnimationName(id);
        return name ? `${num} ${name}` : num;
    }

    /**
     * Selection management
     */
    selectSingle(index) {
        this.selectedIndices = [index];
    }

    toggleSelection(index) {
        const idx = this.selectedIndices.indexOf(index);
        if (idx > -1) {
            this.selectedIndices.splice(idx, 1);
        } else {
            this.selectedIndices.push(index);
        }
    }

    selectRange(start, end) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        this.selectedIndices = [];
        for (let i = min; i <= max; i++) {
            this.selectedIndices.push(i);
        }
    }

    selectAll(page) {
        this.selectedIndices = [];
        for (let i = 0; i < page.list.length; i++) {
            this.selectedIndices.push(i);
        }
    }

    /**
     * Show context menu
     */
    showContextMenu(x, y, page, pageIndex) {
        // Remove existing menu
        const existing = document.querySelector('.command-context-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.className = 'command-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background-color: var(--color-bg-list-item);
            border: 1px solid var(--color-border);
            border-radius: 4px;
            padding: 4px;
            z-index: 10004;
            min-width: 180px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
        `;

        const menuItems = [
            { label: 'New', action: () => this.newCommand(page, pageIndex) },
            { label: 'Edit', action: () => this.editCommand(this.selectedIndices[0], page, pageIndex), disabled: this.selectedIndices.length !== 1 },
            { label: '—', divider: true },
            { label: 'Cut', action: () => this.cutCommands(page, pageIndex) },
            { label: 'Copy', action: () => this.copyCommands(page, pageIndex) },
            { label: 'Paste', action: () => this.pasteCommands(page, pageIndex), disabled: false },
            { label: 'Delete', action: () => this.deleteCommands(page, pageIndex) },
            { label: '—', divider: true },
            { label: 'Select All', action: () => { this.selectAll(page); this.refreshCommandList(page, pageIndex); } },
            { label: '—', divider: true },
            { label: 'Copy As Text', action: () => this.copyAsText(page) },
            { label: 'Copy As HTML', action: () => this.copyAsHTML(page) },
            { label: '—', divider: true },
            { label: 'Toggle Skip', action: () => this.toggleSkip(page, pageIndex) },
            { label: 'Test', action: () => this.testEvent(page, pageIndex) }
        ];

        menuItems.forEach(item => {
            if (item.divider) {
                const divider = document.createElement('div');
                divider.style.cssText = 'height: 1px; background-color: var(--color-border); margin: 4px 0;';
                menu.appendChild(divider);
            } else {
                const menuItem = document.createElement('div');
                menuItem.textContent = window.I18n ? window.I18n.tText(item.label) : item.label;
                menuItem.style.cssText = `
                    padding: 6px 12px;
                    cursor: ${item.disabled ? 'not-allowed' : 'pointer'};
                    color: ${item.disabled ? 'var(--color-text-dim)' : 'var(--color-text)'};
                    font-size: 12px;
                    border-radius: 2px;
                    transition: background-color 0.15s;
                `;

                if (!item.disabled) {
                    menuItem.addEventListener('mouseenter', () => {
                        menuItem.style.backgroundColor = 'var(--color-bg-hover)';
                    });

                    menuItem.addEventListener('mouseleave', () => {
                        menuItem.style.backgroundColor = 'transparent';
                    });

                    menuItem.addEventListener('click', () => {
                        item.action();
                        menu.remove();
                    });
                }

                menu.appendChild(menuItem);
            }
        });

        document.body.appendChild(menu);

        // Close menu on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 100);
    }

    /**
     * Attach context menu to empty area
     */
    attachEmptyContextMenu(container, page, pageIndex) {
        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.selectedIndices = [];
            this.showContextMenu(e.clientX, e.clientY, page, pageIndex);
        });
    }

    /**
     * Shift a freshly built (or pasted) command block so its first command
     * sits at baseIndent, preserving the block's internal structure. MZ's
     * interpreter routes branches by indent: a command inserted at indent 0
     * inside an indent-1 branch body terminates skipBranch early and runs
     * the rest of the branch even when the branch is inactive.
     */
    _rebaseInsertIndent(commands, baseIndent) {
        if (!commands || commands.length === 0) return commands;
        const delta = baseIndent - (commands[0].indent || 0);
        if (delta !== 0) {
            for (const cmd of commands) {
                cmd.indent = Math.max(0, (cmd.indent || 0) + delta);
            }
        }
        return commands;
    }

    /**
     * Command operations
     */
    newCommand(page, pageIndex) {
        this.commandPicker.show((command) => {
            let insertIndex;
            if (this.selectedIndices.length > 0) {
                const maxSelected = Math.max(...this.selectedIndices);
                // If the End command (code 0) is selected, insert before it, not after
                if (page.list[maxSelected] && page.list[maxSelected].code === 0) {
                    insertIndex = maxSelected;
                } else {
                    insertIndex = maxSelected + 1;
                }
            } else {
                insertIndex = page.list.length - 1; // Before the final End command
            }
            // Clamp so we never insert past the End command
            insertIndex = Math.min(insertIndex, page.list.length - 1);

            // MZ indent rule: a new command adopts the indent of the row it
            // is inserted after — one level deeper when that row opens a
            // block (If/Loop/When/Else/battle-result branches).
            let baseIndent = 0;
            if (this.selectedIndices.length > 0) {
                const anchor = page.list[Math.max(...this.selectedIndices)];
                if (anchor && anchor.code !== 0) {
                    const blockOpeners = [111, 112, 402, 403, 411, 601, 602, 603];
                    baseIndent = (anchor.indent || 0) +
                        (blockOpeners.includes(anchor.code) ? 1 : 0);
                }
            }

            const code = command.code;

            // For message commands, open the editor immediately
            if (code === 101) {
                this.messageEditor.show(null, (commands) => {
                    if (commands && commands.length > 0) {
                        // Insert all message commands (101 + 401s)
                        this._rebaseInsertIndent(commands, baseIndent);
                        commands.forEach((cmd, i) => {
                            page.list.splice(insertIndex + i, 0, cmd);
                        });
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For show choices commands, open the editor immediately
            if (code === 102) {
                this.choicesEditor.show(null, (commands) => {
                    if (commands && commands.length > 0) {
                        // Insert all choice commands (102 + 402s + 403 + 404)
                        this._rebaseInsertIndent(commands, baseIndent);
                        commands.forEach((cmd, i) => {
                            page.list.splice(insertIndex + i, 0, cmd);
                        });
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For comment commands, open the editor immediately
            if (code === 108) {
                this.commentEditor.show(null, null, null, (commands) => {
                    if (commands && commands.length > 0) {
                        // Insert all comment commands (108 + 408s)
                        this._rebaseInsertIndent(commands, baseIndent);
                        commands.forEach((cmd, i) => {
                            page.list.splice(insertIndex + i, 0, cmd);
                        });
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For conditional branch commands, open the editor immediately
            if (code === 111) {
                this.conditionalBranchEditor.show(null, (commands) => {
                    if (commands && commands.length > 0) {
                        // Insert all branch commands (111 + 411 + 412)
                        this._rebaseInsertIndent(commands, baseIndent);
                        commands.forEach((cmd, i) => {
                            page.list.splice(insertIndex + i, 0, cmd);
                        });
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For loop commands, open the editor immediately
            if (code === 112 || code === 413) {
                this.loopEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For break loop commands, open the editor immediately
            if (code === 113) {
                this.breakLoopEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For wait commands, open the editor immediately
            if (code === 230) {
                this.waitEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For control switches commands, open the editor immediately
            if (code === 121) {
                this.switchesEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For control variables commands, open the editor immediately
            if (code === 122) {
                this.variablesEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For control self switch commands, open the editor immediately
            if (code === 123) {
                this.controlSelfSwitchEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For control timer commands, open the editor immediately
            if (code === 124) {
                this.controlTimerEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For change gold commands, open the editor immediately
            if (code === 125) {
                this.goldEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For change items commands, open the editor immediately
            if (code === 126) {
                this.changeItemsEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For change party member commands, open the editor immediately
            if (code === 129) {
                this.changePartyMemberEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For change weapons commands, open the editor immediately
            if (code === 127) {
                this.changeWeaponsEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For change armors commands, open the editor immediately
            if (code === 128) {
                this.changeArmorsEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For transfer player commands, open the editor immediately
            if (code === 201) {
                this.transferPlayerEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For set event location commands, open the editor immediately
            if (code === 203) {
                this.setEventLocationEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For scroll map commands, open the editor immediately
            if (code === 204) {
                this.scrollMapEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For set movement route commands, open the editor immediately
            if (code === 205) {
                this.setMovementRouteEditor.show(null, (command) => {
                    if (command) {
                        // Insert the 205 header command
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        // Insert 505 continuation entries for each move step (skip end marker code 0)
                        const moveList = command.parameters[1].list;
                        let inserted = 0;
                        for (let i = 0; i < moveList.length; i++) {
                            if (moveList[i].code === 0) continue; // skip end marker
                            page.list.splice(insertIndex + 1 + inserted, 0, {
                                code: 505,
                                indent: command.indent || 0,
                                parameters: [moveList[i]]
                            });
                            inserted++;
                        }
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For change transparency commands, open the editor immediately
            if (code === 211) {
                this.changeTransparencyEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For show animation commands, open the editor immediately
            if (code === 212) {
                this.showAnimationEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For show balloon icon commands, open the editor immediately
            if (code === 213) {
                const eventData = this.eventEditor ? this.eventEditor.event : null;
                this.balloonIconEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                }, eventData);
                return;
            }

            // For fade screen commands, open the editor immediately
            if (code === 221 || code === 222) {
                this.fadeScreenEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For show picture commands, open the editor immediately
            if (code === 231) {
                this.showPictureEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For erase picture commands, open the editor immediately
            if (code === 235) {
                this.erasePictureEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For plugin command, open the editor immediately
            if (code === 356 || code === 357) {
                this.pluginCommandEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        // Expand plugin commands by default
                        this.expandedPluginCommands.add(insertIndex);
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For script commands, open the editor immediately
            if (code === 355) {
                this.scriptEditor.show(null, null, null, (commands) => {
                    if (commands && commands.length > 0) {
                        // Insert all script commands (355 + 655s)
                        this._rebaseInsertIndent(commands, baseIndent);
                        commands.forEach((cmd, i) => {
                            page.list.splice(insertIndex + i, 0, cmd);
                        });
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // For audio commands, open the editor immediately
            if ([241, 242, 245, 246, 249, 250, 251].includes(code)) {
                this.audioEditor.show(null, code, (editedCommand) => {
                    if (editedCommand) {
                        page.list.splice(insertIndex, 0, editedCommand);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Input Number
            if (code === 103) {
                this.inputNumberEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Select Item
            if (code === 104) {
                this.selectItemEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Show Scrolling Text
            if (code === 105) {
                this.showScrollingTextEditor.show(null, (commands) => {
                    if (commands && commands.length > 0) {
                        this._rebaseInsertIndent(commands, baseIndent);
                        commands.forEach((cmd, i) => {
                            page.list.splice(insertIndex + i, 0, cmd);
                        });
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Exit Event Processing (no params)
            if (code === 115) {
                page.list.splice(insertIndex, 0, { code: 115, indent: baseIndent, parameters: [] });
                this.selectedIndices = [insertIndex];
                this.refreshCommandList(page, pageIndex);
                return;
            }

            // Common Event
            if (code === 117) {
                this.commonEventEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Label
            if (code === 118) {
                this.labelEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Jump to Label
            if (code === 119) {
                this.jumpToLabelEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Battle BGM
            if (code === 132) {
                this.changeBattleBGMEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Victory ME
            if (code === 133) {
                this.changeVictoryMEEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Save Access (toggle)
            if (code === 134) {
                this.toggleCommandEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                }, { code: 134, title: 'Change Save Access', option0: 'Disable', option1: 'Enable' });
                return;
            }

            // Change Menu Access (toggle)
            if (code === 135) {
                this.toggleCommandEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                }, { code: 135, title: 'Change Menu Access', option0: 'Disable', option1: 'Enable' });
                return;
            }

            // Change Encounter (toggle)
            if (code === 136) {
                this.toggleCommandEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                }, { code: 136, title: 'Change Encounter', option0: 'Disable', option1: 'Enable' });
                return;
            }

            // Change Formation Access (toggle)
            if (code === 137) {
                this.toggleCommandEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                }, { code: 137, title: 'Change Formation Access', option0: 'Disable', option1: 'Enable' });
                return;
            }

            // Change Window Color
            if (code === 138) {
                this.changeWindowColorEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Defeat ME
            if (code === 139) {
                this.changeDefeatMEEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Vehicle BGM
            if (code === 140) {
                this.changeVehicleBGMEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Set Vehicle Location
            if (code === 202) {
                this.setVehicleLocationEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Get on/off Vehicle (no params)
            if (code === 206) {
                page.list.splice(insertIndex, 0, { code: 206, indent: baseIndent, parameters: [] });
                this.selectedIndices = [insertIndex];
                this.refreshCommandList(page, pageIndex);
                return;
            }

            // Erase Event (no params)
            if (code === 214) {
                page.list.splice(insertIndex, 0, { code: 214, indent: baseIndent, parameters: [] });
                this.selectedIndices = [insertIndex];
                this.refreshCommandList(page, pageIndex);
                return;
            }

            // Change Player Followers (toggle)
            if (code === 216) {
                this.toggleCommandEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                }, { code: 216, title: 'Change Player Followers', option0: 'Show', option1: 'Hide' });
                return;
            }

            // Gather Followers (no params)
            if (code === 217) {
                page.list.splice(insertIndex, 0, { code: 217, indent: baseIndent, parameters: [] });
                this.selectedIndices = [insertIndex];
                this.refreshCommandList(page, pageIndex);
                return;
            }

            // Tint Screen
            if (code === 223) {
                this.tintScreenEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Flash Screen
            if (code === 224) {
                this.flashScreenEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Shake Screen
            if (code === 225) {
                this.shakeScreenEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Move Picture
            if (code === 232) {
                this.movePictureEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Rotate Picture
            if (code === 233) {
                this.rotatePictureEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Tint Picture
            if (code === 234) {
                this.tintPictureEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Set Weather Effect
            if (code === 236) {
                this.setWeatherEffectEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Save BGM (no params)
            if (code === 243) {
                page.list.splice(insertIndex, 0, { code: 243, indent: baseIndent, parameters: [] });
                this.selectedIndices = [insertIndex];
                this.refreshCommandList(page, pageIndex);
                return;
            }

            // Replay BGM (no params)
            if (code === 244) {
                page.list.splice(insertIndex, 0, { code: 244, indent: baseIndent, parameters: [] });
                this.selectedIndices = [insertIndex];
                this.refreshCommandList(page, pageIndex);
                return;
            }

            // Play Movie
            if (code === 261) {
                this.playMovieEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Map Name Display (toggle)
            if (code === 281) {
                this.toggleCommandEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                }, { code: 281, title: 'Change Map Name Display', option0: 'Enable', option1: 'Disable' });
                return;
            }

            // Change Tileset
            if (code === 282) {
                this.changeTilesetEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Battle Background
            if (code === 283) {
                this.changeBattleBackgroundEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Parallax
            if (code === 284) {
                this.changeParallaxEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Get Location Info
            if (code === 285) {
                this.getLocationInfoEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Battle Processing
            if (code === 301) {
                this.battleProcessingEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Shop Processing (multi-command)
            if (code === 302) {
                this.shopProcessingEditor.show(null, (commands) => {
                    if (commands && commands.length > 0) {
                        this._rebaseInsertIndent(commands, baseIndent);
                        commands.forEach((cmd, i) => {
                            page.list.splice(insertIndex + i, 0, cmd);
                        });
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Name Input Processing
            if (code === 303) {
                this.nameInputProcessingEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change HP
            if (code === 311) {
                this.changeHPEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change MP
            if (code === 312) {
                this.changeMPEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change State
            if (code === 313) {
                this.changeStateEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Recover All
            if (code === 314) {
                this.recoverAllEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change EXP
            if (code === 315) {
                this.changeEXPEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Level
            if (code === 316) {
                this.changeLevelEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Parameter
            if (code === 317) {
                this.changeParameterEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Skill
            if (code === 318) {
                this.changeSkillEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Equipment
            if (code === 319) {
                this.changeEquipmentEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Name
            if (code === 320) {
                this.changeNameEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Class
            if (code === 321) {
                this.changeClassEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Actor Images
            if (code === 322) {
                this.changeActorImagesEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Vehicle Image
            if (code === 323) {
                this.changeVehicleImageEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Nickname
            if (code === 324) {
                this.changeNicknameEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Profile
            if (code === 325) {
                this.changeProfileEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change TP
            if (code === 326) {
                this.changeTPEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Enemy HP
            if (code === 331) {
                this.changeEnemyHPEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Enemy MP
            if (code === 332) {
                this.changeEnemyMPEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Change Enemy State
            if (code === 333) {
                this.changeEnemyStateEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Enemy Recover All
            if (code === 334) {
                this.enemyRecoverAllEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Enemy Appear
            if (code === 335) {
                this.enemyAppearEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Enemy Transform
            if (code === 336) {
                this.enemyTransformEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Show Battle Animation
            if (code === 337) {
                this.showBattleAnimationEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Force Action
            if (code === 339) {
                this.forceActionEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Abort Battle (no params)
            if (code === 340) {
                page.list.splice(insertIndex, 0, { code: 340, indent: baseIndent, parameters: [] });
                this.selectedIndices = [insertIndex];
                this.refreshCommandList(page, pageIndex);
                return;
            }

            // Change Enemy TP
            if (code === 342) {
                this.changeEnemyTPEditor.show(null, (command) => {
                    if (command) {
                        page.list.splice(insertIndex, 0, this._rebaseInsertIndent([command], baseIndent)[0]);
                        this.selectedIndices = [insertIndex];
                        this.refreshCommandList(page, pageIndex);
                    }
                });
                return;
            }

            // Open Menu Screen (no params)
            if (code === 351) {
                page.list.splice(insertIndex, 0, { code: 351, indent: baseIndent, parameters: [] });
                this.selectedIndices = [insertIndex];
                this.refreshCommandList(page, pageIndex);
                return;
            }

            // Open Save Screen (no params)
            if (code === 352) {
                page.list.splice(insertIndex, 0, { code: 352, indent: baseIndent, parameters: [] });
                this.selectedIndices = [insertIndex];
                this.refreshCommandList(page, pageIndex);
                return;
            }

            // Game Over (no params)
            if (code === 353) {
                page.list.splice(insertIndex, 0, { code: 353, indent: baseIndent, parameters: [] });
                this.selectedIndices = [insertIndex];
                this.refreshCommandList(page, pageIndex);
                return;
            }

            // Return to Title Screen (no params)
            if (code === 354) {
                page.list.splice(insertIndex, 0, { code: 354, indent: baseIndent, parameters: [] });
                this.selectedIndices = [insertIndex];
                this.refreshCommandList(page, pageIndex);
                return;
            }

            // For other commands, insert with default parameters
            const newCommand = {
                code: command.code,
                indent: 0,
                parameters: []
            };

            page.list.splice(insertIndex, 0, newCommand);
            this.selectedIndices = [insertIndex];
            this.refreshCommandList(page, pageIndex);
        });
    }

    editCommand(index, page, pageIndex) {
        const command = page.list[index];
        if (!command || command.code === 0) return;

        const code = command.code;

        // Commands with no editable parameters — double-clicking is a no-op.
        // Insertion happens through the picker with `parameters: []`; there's
        // nothing to change after the fact, so don't fall through to the
        // "will be implemented" placeholder alert.
        if (NO_PARAM_EVENT_CODES.has(code)) return;

        // Message commands (Show Text)
        if (code === 101) {
            // Gather the text lines (401 commands) that follow this message
            const textLines = [];
            for (let i = index + 1; i < page.list.length; i++) {
                if (page.list[i].code === 401) {
                    textLines.push(page.list[i].parameters[0] || '');
                } else {
                    break;
                }
            }

            // Create a message data object to pass to the editor
            const messageData = {
                command: command,
                textLines: textLines
            };

            this.messageEditor.show(messageData, (commands) => {
                // Replace the message command and its text lines
                // First, remove the old message and all its 401 lines
                let removeCount = 1; // Start with the 101 command itself
                for (let i = index + 1; i < page.list.length; i++) {
                    if (page.list[i].code === 401) {
                        removeCount++;
                    } else {
                        break;
                    }
                }

                // Remove old commands
                page.list.splice(index, removeCount);

                // Insert new commands
                commands.forEach((cmd, i) => {
                    page.list.splice(index + i, 0, cmd);
                });

                this.refreshCommandList(page, pageIndex);
            });
            return;
        }

        // Show Choices command
        if (code === 102) {
            this.choicesEditor.show(command, (commands) => {
                if (commands && commands.length > 0) {
                    // Collect all the nested commands between branch markers
                    const nestedCommands = [];
                    let currentBranch = [];
                    let i = index + 1;
                    let currentIndent = 1;

                    while (i < page.list.length) {
                        const cmd = page.list[i];

                        if (cmd.code === 402) {
                            // Start of a new branch
                            if (currentBranch.length > 0) {
                                nestedCommands.push(currentBranch);
                            }
                            currentBranch = [];
                            i++;
                        } else if (cmd.code === 403) {
                            // Cancel branch
                            if (currentBranch.length > 0) {
                                nestedCommands.push(currentBranch);
                            }
                            currentBranch = [];
                            i++;
                        } else if (cmd.code === 404) {
                            // End of choices
                            if (currentBranch.length > 0) {
                                nestedCommands.push(currentBranch);
                            }
                            break;
                        } else {
                            // Regular command inside a branch
                            currentBranch.push(cmd);
                            i++;
                        }
                    }

                    // Remove the entire old choice structure
                    const removeCount = i - index + 1; // +1 to include the 404
                    page.list.splice(index, removeCount);

                    // Insert new choice structure, re-inserting nested commands
                    let insertPos = index;
                    let branchIndex = 0;

                    commands.forEach((cmd) => {
                        page.list.splice(insertPos++, 0, cmd);

                        // After each 402/403, insert the nested commands from that branch
                        if (cmd.code === 402 || cmd.code === 403) {
                            if (nestedCommands[branchIndex]) {
                                nestedCommands[branchIndex].forEach(nestedCmd => {
                                    page.list.splice(insertPos++, 0, nestedCmd);
                                });
                                branchIndex++;
                            }
                        }
                    });

                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Comment command
        if (code === 108) {
            this.commentEditor.show(command, page.list, index, (commands) => {
                if (commands && commands.length > 0) {
                    // Remove the comment command and all its 408 continuation lines
                    let removeCount = 1; // Start with the 108 command itself
                    for (let i = index + 1; i < page.list.length; i++) {
                        if (page.list[i].code === 408) {
                            removeCount++;
                        } else {
                            break;
                        }
                    }

                    // Remove old commands
                    page.list.splice(index, removeCount);

                    // Insert new commands
                    commands.forEach((cmd, i) => {
                        page.list.splice(index + i, 0, cmd);
                    });

                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Conditional Branch command
        if (code === 111) {
            this.conditionalBranchEditor.show(command, (commands) => {
                if (commands && commands.length > 0) {
                    // Collect all the nested commands between branch markers
                    const nestedCommands = [];
                    let currentBranch = [];
                    let i = index + 1;

                    while (i < page.list.length) {
                        const cmd = page.list[i];

                        if (cmd.code === 411) {
                            // Else branch
                            if (currentBranch.length > 0) {
                                nestedCommands.push(currentBranch);
                            }
                            currentBranch = [];
                            i++;
                        } else if (cmd.code === 412) {
                            // End of conditional
                            if (currentBranch.length > 0) {
                                nestedCommands.push(currentBranch);
                            }
                            break;
                        } else {
                            // Regular command inside a branch
                            currentBranch.push(cmd);
                            i++;
                        }
                    }

                    // Remove the entire old branch structure
                    const removeCount = i - index + 1; // +1 to include the 412
                    page.list.splice(index, removeCount);

                    // Insert new branch structure, re-inserting nested commands
                    let insertPos = index;
                    let branchIndex = 0;

                    commands.forEach((cmd) => {
                        page.list.splice(insertPos++, 0, cmd);

                        // After 111 or 411, insert the nested commands from that branch
                        if (cmd.code === 111 || cmd.code === 411) {
                            if (nestedCommands[branchIndex]) {
                                nestedCommands[branchIndex].forEach(nestedCmd => {
                                    page.list.splice(insertPos++, 0, nestedCmd);
                                });
                                branchIndex++;
                            }
                        }
                    });

                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Loop/Repeat Above commands
        if (code === 112 || code === 413) {
            this.loopEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Break Loop command
        if (code === 113) {
            this.breakLoopEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Wait command
        if (code === 230) {
            this.waitEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Control Switches command
        if (code === 121) {
            this.switchesEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Control Variables command
        if (code === 122) {
            this.variablesEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Control Self Switch command
        if (code === 123) {
            this.controlSelfSwitchEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Control Timer command
        if (code === 124) {
            this.controlTimerEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Gold command
        if (code === 125) {
            this.goldEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Items command
        if (code === 126) {
            this.changeItemsEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Party Member command
        if (code === 129) {
            this.changePartyMemberEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Weapons command
        if (code === 127) {
            this.changeWeaponsEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Armors command
        if (code === 128) {
            this.changeArmorsEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Transfer Player command
        if (code === 201) {
            this.transferPlayerEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Set Event Location command
        if (code === 203) {
            this.setEventLocationEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Scroll Map command
        if (code === 204) {
            this.scrollMapEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Set Movement Route command
        if (code === 205) {
            this.setMovementRouteEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    // Replace the 205 header command
                    page.list[index] = editedCommand;
                    // Remove old 505 continuation entries
                    let removeCount = 0;
                    let scan = index + 1;
                    while (scan < page.list.length && page.list[scan].code === 505) {
                        removeCount++;
                        scan++;
                    }
                    if (removeCount > 0) {
                        page.list.splice(index + 1, removeCount);
                    }
                    // Insert new 505 entries from the updated moveRoute (skip end marker code 0)
                    const moveList = editedCommand.parameters[1].list;
                    let inserted = 0;
                    for (let i = 0; i < moveList.length; i++) {
                        if (moveList[i].code === 0) continue; // skip end marker
                        page.list.splice(index + 1 + inserted, 0, {
                            code: 505,
                            indent: editedCommand.indent || 0,
                            parameters: [moveList[i]]
                        });
                        inserted++;
                    }
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Transparency command
        if (code === 211) {
            this.changeTransparencyEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Show Animation command
        if (code === 212) {
            this.showAnimationEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Show Balloon Icon command
        if (code === 213) {
            const eventData = this.eventEditor ? this.eventEditor.event : null;
            this.balloonIconEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            }, eventData);
            return;
        }

        // Fadeout/Fadein Screen commands
        if (code === 221 || code === 222) {
            this.fadeScreenEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Show Picture command
        if (code === 231) {
            this.showPictureEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Erase Picture command
        if (code === 235) {
            this.erasePictureEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Plugin Command
        if (code === 356 || code === 357) {
            this.pluginCommandEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Script command
        if (code === 355) {
            this.scriptEditor.show(command, page.list, index, (commands) => {
                if (commands && commands.length > 0) {
                    // Remove the script command and all its 655 continuation lines
                    let removeCount = 1; // Start with the 355 command itself
                    for (let i = index + 1; i < page.list.length; i++) {
                        if (page.list[i].code === 655) {
                            removeCount++;
                        } else {
                            break;
                        }
                    }

                    // Remove old commands
                    page.list.splice(index, removeCount);

                    // Insert new commands
                    commands.forEach((cmd, i) => {
                        page.list.splice(index + i, 0, cmd);
                    });

                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Audio commands
        if ([241, 242, 245, 246, 249, 250, 251].includes(code)) {
            this.audioEditor.show(command, code, (editedCommand) => {
                page.list[index] = editedCommand;
                this.refreshCommandList(page, pageIndex);
            });
            return;
        }

        // Input Number command
        if (code === 103) {
            this.inputNumberEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Select Item command
        if (code === 104) {
            this.selectItemEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Show Scrolling Text command
        if (code === 105) {
            const textLines = [];
            for (let i = index + 1; i < page.list.length; i++) {
                if (page.list[i].code === 405) {
                    textLines.push(page.list[i].parameters[0] || '');
                } else {
                    break;
                }
            }
            this.showScrollingTextEditor.show(command, (commands) => {
                if (commands && commands.length > 0) {
                    let removeCount = 1;
                    for (let i = index + 1; i < page.list.length; i++) {
                        if (page.list[i].code === 405) {
                            removeCount++;
                        } else {
                            break;
                        }
                    }
                    page.list.splice(index, removeCount);
                    commands.forEach((cmd, i) => {
                        page.list.splice(index + i, 0, cmd);
                    });
                    this.refreshCommandList(page, pageIndex);
                }
            }, textLines);
            return;
        }

        // Common Event command
        if (code === 117) {
            this.commonEventEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Label command
        if (code === 118) {
            this.labelEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Jump to Label command
        if (code === 119) {
            this.jumpToLabelEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Battle BGM command
        if (code === 132) {
            this.changeBattleBGMEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Victory ME command
        if (code === 133) {
            this.changeVictoryMEEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Save Access (toggle)
        if (code === 134) {
            this.toggleCommandEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            }, { code: 134, title: 'Change Save Access', option0: 'Disable', option1: 'Enable' });
            return;
        }

        // Change Menu Access (toggle)
        if (code === 135) {
            this.toggleCommandEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            }, { code: 135, title: 'Change Menu Access', option0: 'Disable', option1: 'Enable' });
            return;
        }

        // Change Encounter (toggle)
        if (code === 136) {
            this.toggleCommandEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            }, { code: 136, title: 'Change Encounter', option0: 'Disable', option1: 'Enable' });
            return;
        }

        // Change Formation Access (toggle)
        if (code === 137) {
            this.toggleCommandEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            }, { code: 137, title: 'Change Formation Access', option0: 'Disable', option1: 'Enable' });
            return;
        }

        // Change Window Color command
        if (code === 138) {
            this.changeWindowColorEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Defeat ME command
        if (code === 139) {
            this.changeDefeatMEEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Vehicle BGM command
        if (code === 140) {
            this.changeVehicleBGMEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Set Vehicle Location command
        if (code === 202) {
            this.setVehicleLocationEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Player Followers (toggle)
        if (code === 216) {
            this.toggleCommandEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            }, { code: 216, title: 'Change Player Followers', option0: 'Show', option1: 'Hide' });
            return;
        }

        // Tint Screen command
        if (code === 223) {
            this.tintScreenEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Flash Screen command
        if (code === 224) {
            this.flashScreenEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Shake Screen command
        if (code === 225) {
            this.shakeScreenEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Move Picture command
        if (code === 232) {
            this.movePictureEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Rotate Picture command
        if (code === 233) {
            this.rotatePictureEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Tint Picture command
        if (code === 234) {
            this.tintPictureEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Set Weather Effect command
        if (code === 236) {
            this.setWeatherEffectEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Play Movie command
        if (code === 261) {
            this.playMovieEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Map Name Display (toggle)
        if (code === 281) {
            this.toggleCommandEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            }, { code: 281, title: 'Change Map Name Display', option0: 'Enable', option1: 'Disable' });
            return;
        }

        // Change Tileset command
        if (code === 282) {
            this.changeTilesetEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Battle Background command
        if (code === 283) {
            this.changeBattleBackgroundEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Parallax command
        if (code === 284) {
            this.changeParallaxEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Get Location Info command
        if (code === 285) {
            this.getLocationInfoEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Battle Processing command
        if (code === 301) {
            this.battleProcessingEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Shop Processing command (multi-command)
        if (code === 302) {
            this.shopProcessingEditor.show(command, (commands) => {
                if (commands && commands.length > 0) {
                    let removeCount = 1;
                    for (let i = index + 1; i < page.list.length; i++) {
                        if (page.list[i].code === 605) {
                            removeCount++;
                        } else {
                            break;
                        }
                    }
                    page.list.splice(index, removeCount);
                    commands.forEach((cmd, i) => {
                        page.list.splice(index + i, 0, cmd);
                    });
                    this.refreshCommandList(page, pageIndex);
                }
            }, page.list, index);
            return;
        }

        // Name Input Processing command
        if (code === 303) {
            this.nameInputProcessingEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change HP command
        if (code === 311) {
            this.changeHPEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change MP command
        if (code === 312) {
            this.changeMPEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change State command
        if (code === 313) {
            this.changeStateEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Recover All command
        if (code === 314) {
            this.recoverAllEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change EXP command
        if (code === 315) {
            this.changeEXPEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Level command
        if (code === 316) {
            this.changeLevelEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Parameter command
        if (code === 317) {
            this.changeParameterEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Skill command
        if (code === 318) {
            this.changeSkillEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Equipment command
        if (code === 319) {
            this.changeEquipmentEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Name command
        if (code === 320) {
            this.changeNameEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Class command
        if (code === 321) {
            this.changeClassEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Actor Images command
        if (code === 322) {
            this.changeActorImagesEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Vehicle Image command
        if (code === 323) {
            this.changeVehicleImageEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Nickname command
        if (code === 324) {
            this.changeNicknameEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Profile command
        if (code === 325) {
            this.changeProfileEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change TP command
        if (code === 326) {
            this.changeTPEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Enemy HP command
        if (code === 331) {
            this.changeEnemyHPEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Enemy MP command
        if (code === 332) {
            this.changeEnemyMPEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Enemy State command
        if (code === 333) {
            this.changeEnemyStateEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Enemy Recover All command
        if (code === 334) {
            this.enemyRecoverAllEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Enemy Appear command
        if (code === 335) {
            this.enemyAppearEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Enemy Transform command
        if (code === 336) {
            this.enemyTransformEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Show Battle Animation command
        if (code === 337) {
            this.showBattleAnimationEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Force Action command
        if (code === 339) {
            this.forceActionEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // Change Enemy TP command
        if (code === 342) {
            this.changeEnemyTPEditor.show(command, (editedCommand) => {
                if (editedCommand) {
                    page.list[index] = editedCommand;
                    this.refreshCommandList(page, pageIndex);
                }
            });
            return;
        }

        // For other commands, show placeholder
        alert(`Edit command dialog for "${this.getCommandInfo(command).name}" will be implemented for each command type.`);
    }

    /**
     * Expand selection to include all related commands (continuation lines, branches, etc.)
     * @param {object} page - The current page
     * @returns {number[]} - Expanded indices
     */
    expandSelection(page) {
        const expanded = new Set();

        this.selectedIndices.forEach(index => {
            const command = page.list[index];
            const code = command.code;

            // For Show Text (101), include all 401 continuation lines
            if (code === 101) {
                expanded.add(index);
                for (let i = index + 1; i < page.list.length; i++) {
                    if (page.list[i].code === 401) {
                        expanded.add(i);
                    } else {
                        break;
                    }
                }
            }
            // For Comment (108), include all 408 continuation lines
            else if (code === 108) {
                expanded.add(index);
                for (let i = index + 1; i < page.list.length; i++) {
                    if (page.list[i].code === 408) {
                        expanded.add(i);
                    } else {
                        break;
                    }
                }
            }
            // For Script (355), include all 655 continuation lines
            else if (code === 355) {
                expanded.add(index);
                for (let i = index + 1; i < page.list.length; i++) {
                    if (page.list[i].code === 655) {
                        expanded.add(i);
                    } else {
                        break;
                    }
                }
            }
            // For Show Choices (102), include entire branch structure
            else if (code === 102) {
                expanded.add(index);
                for (let i = index + 1; i < page.list.length; i++) {
                    expanded.add(i);
                    if (page.list[i].code === 404) break; // Stop at End
                }
            }
            // For continuation lines, include parent AND all siblings
            else if (code === 401) {
                const parentIndex = this.findParentCommandIndex(index, page);
                expanded.add(parentIndex);
                // Add all 401 lines following the parent
                for (let i = parentIndex + 1; i < page.list.length; i++) {
                    if (page.list[i].code === 401) {
                        expanded.add(i);
                    } else {
                        break;
                    }
                }
            }
            else if (code === 408) {
                const parentIndex = this.findParentCommandIndex(index, page);
                expanded.add(parentIndex);
                // Add all 408 lines following the parent
                for (let i = parentIndex + 1; i < page.list.length; i++) {
                    if (page.list[i].code === 408) {
                        expanded.add(i);
                    } else {
                        break;
                    }
                }
            }
            else if (code === 655) {
                // Find parent 355 command
                for (let i = index - 1; i >= 0; i--) {
                    if (page.list[i].code === 355) {
                        expanded.add(i);
                        // Add all 655 lines following the parent
                        for (let j = i + 1; j < page.list.length; j++) {
                            if (page.list[j].code === 655) {
                                expanded.add(j);
                            } else {
                                break;
                            }
                        }
                        break;
                    }
                }
            }
            // For Show Scrolling Text (105), include all 405 continuation lines
            else if (code === 105) {
                expanded.add(index);
                for (let i = index + 1; i < page.list.length; i++) {
                    if (page.list[i].code === 405) {
                        expanded.add(i);
                    } else {
                        break;
                    }
                }
            }
            // For Show Scrolling Text continuation (405), include parent and siblings
            else if (code === 405) {
                const parentIndex = this.findParentCommandIndex(index, page);
                expanded.add(parentIndex);
                for (let i = parentIndex + 1; i < page.list.length; i++) {
                    if (page.list[i].code === 405) {
                        expanded.add(i);
                    } else {
                        break;
                    }
                }
            }
            // For Shop Processing continuation (605), include parent and siblings
            else if (code === 605) {
                for (let i = index - 1; i >= 0; i--) {
                    if (page.list[i].code === 302) {
                        expanded.add(i);
                        for (let j = i + 1; j < page.list.length; j++) {
                            if (page.list[j].code === 605) {
                                expanded.add(j);
                            } else {
                                break;
                            }
                        }
                        break;
                    }
                }
            }
            // Block headers own their body markers: select the header's
            // whole structure through its matching end marker at the same
            // indent. An orphaned 413 ("Repeat Above") jumps execution
            // backwards unconditionally; an orphaned 411 swallows its body.
            else if ([111, 112].includes(code)) {
                const endCode = code === 111 ? 412 : 413;
                const headerIndent = command.indent || 0;
                expanded.add(index);
                for (let i = index + 1; i < page.list.length; i++) {
                    expanded.add(i);
                    if (page.list[i].code === endCode &&
                        (page.list[i].indent || 0) === headerIndent) {
                        break;
                    }
                }
            }
            else if (code === 301) {
                expanded.add(index);
                // Only a "branch results" battle carries 601-604 markers;
                // a standalone 301 is a regular command.
                const next = page.list[index + 1];
                if (next && [601, 602, 603].includes(next.code)) {
                    const headerIndent = command.indent || 0;
                    for (let i = index + 1; i < page.list.length; i++) {
                        expanded.add(i);
                        if (page.list[i].code === 604 &&
                            (page.list[i].indent || 0) === headerIndent) {
                            break;
                        }
                    }
                }
            }
            // For branch markers inside choices, don't copy individually
            else if ([402, 403, 404].includes(code)) {
                // Find the parent 102 command
                for (let i = index - 1; i >= 0; i--) {
                    if (page.list[i].code === 102) {
                        // Add entire choice structure
                        expanded.add(i);
                        for (let j = i + 1; j < page.list.length; j++) {
                            expanded.add(j);
                            if (page.list[j].code === 404) break;
                        }
                        break;
                    }
                }
            }
            else {
                // Regular command
                expanded.add(index);
            }
        });

        return Array.from(expanded).sort((a, b) => a - b);
    }

    cutCommands(page, pageIndex) {
        this.copyCommands(page, pageIndex);
        this.deleteCommands(page, pageIndex);
    }

    copyCommands(page, pageIndex) {
        // Expand selection to include related commands
        const expandedIndices = this.expandSelection(page);
        this.clipboard = expandedIndices.map(i => JSON.parse(JSON.stringify(page.list[i])));
        if (typeof ReactorClipboard !== 'undefined') {
            ReactorClipboard.write('eventCommands', { commands: this.clipboard });
        }
        console.log('Copied', this.clipboard.length, 'commands:', this.clipboard.map(c => `${c.code}(${c.parameters})`).join(', '));
    }

    async pasteCommands(page, pageIndex) {
        let commands = this.clipboard;
        if (!commands && typeof ReactorClipboard !== 'undefined') {
            const clipboardData = await ReactorClipboard.read('eventCommands');
            commands = clipboardData?.payload?.commands || null;
        }

        if (!commands || commands.length === 0) {
            alert(window.I18n ? window.I18n.tText('No event commands in clipboard to paste.') : 'No event commands in clipboard to paste.');
            return;
        }

        let insertIndex;
        if (this.selectedIndices.length > 0) {
            // Insert BEFORE the selected command (RPG Maker behavior)
            // Find the start of the selected command group
            const minSelected = Math.min(...this.selectedIndices);
            const selectedCommand = page.list[minSelected];

            // If it's a continuation line, find the parent command
            if (selectedCommand.code === 401 || selectedCommand.code === 408) {
                // Find parent and insert before it
                const parentIndex = this.findParentCommandIndex(minSelected, page);
                insertIndex = parentIndex;
            } else {
                // Insert before the selected command
                insertIndex = minSelected;
            }
        } else {
            // No selection - insert at end
            insertIndex = page.list.length - 1;
        }

        const pasted = commands.map(cmd => JSON.parse(JSON.stringify(cmd)));
        const pasteAnchor = page.list[insertIndex];
        this._rebaseInsertIndent(pasted,
            pasteAnchor && pasteAnchor.code !== 0 ? (pasteAnchor.indent || 0) : 0);
        pasted.forEach((cmd, i) => {
            page.list.splice(insertIndex + i, 0, cmd);
        });

        this.selectedIndices = [];
        for (let i = 0; i < commands.length; i++) {
            this.selectedIndices.push(insertIndex + i);
        }

        this.refreshCommandList(page, pageIndex);
    }

    deleteCommands(page, pageIndex) {
        // Expand selection to include related commands
        const expandedIndices = this.expandSelection(page);

        // Sort in reverse to delete from end to start
        const sortedIndices = [...expandedIndices].sort((a, b) => b - a);

        sortedIndices.forEach(index => {
            // Don't delete the End command (code 0), but allow deleting anything else
            if (page.list[index] && page.list[index].code !== 0) {
                page.list.splice(index, 1);
            }
        });

        this.selectedIndices = [];
        this.refreshCommandList(page, pageIndex);
    }

    copyAsText(page) {
        const text = page.list.map((cmd, i) => {
            const info = this.getCommandInfo(cmd);
            return `${String(i + 1).padStart(3, '0')}: ${info.name} ${info.description}`;
        }).join('\n');

        navigator.clipboard.writeText(text);
        console.log('Copied as text');
    }

    copyAsHTML(page) {
        const html = '<pre>' + page.list.map((cmd, i) => {
            const info = this.getCommandInfo(cmd);
            return `<span style="color: ${info.color}">${String(i + 1).padStart(3, '0')}: ${info.name}</span> ${info.description}`;
        }).join('\n') + '</pre>';

        navigator.clipboard.writeText(html);
        console.log('Copied as HTML');
    }

    toggleSkip(page, pageIndex) {
        // TODO: Implement skip flag
        console.log('Toggle skip for selected commands');
    }

    testEvent(page, pageIndex) {
        // TODO: Implement event testing
        console.log('Test event from this point');
    }

    /**
     * Repair orphaned 505 entries - 505 commands not preceded by a 205 parent.
     * Collects consecutive orphaned 505s into a group and synthesizes a 205 parent.
     */
    _repairOrphaned505s(page) {
        if (!page || !page.list) return false;

        let repaired = false;
        let i = 0;

        while (i < page.list.length) {
            const cmd = page.list[i];

            // If we find a valid 205, skip it and clean up any code-0 end marker 505s
            if (cmd.code === 205) {
                i++;
                while (i < page.list.length && page.list[i].code === 505) {
                    // Remove 505s that are just end markers (code 0)
                    if (page.list[i].parameters[0] && page.list[i].parameters[0].code === 0) {
                        page.list.splice(i, 1);
                        repaired = true;
                    } else {
                        i++;
                    }
                }
                continue;
            }

            // If we find a 505 without a preceding 205, it's orphaned
            if (cmd.code === 505) {
                const orphanStart = i;
                const moveCommands = [];

                // Collect all consecutive orphaned 505s
                const orphanCount = (() => {
                    let count = 0;
                    while (i < page.list.length && page.list[i].code === 505) {
                        const moveCmd = page.list[i].parameters[0];
                        if (moveCmd && moveCmd.code !== 0) { // skip end markers
                            moveCommands.push(moveCmd);
                        }
                        count++;
                        i++;
                    }
                    return count;
                })();

                // Ensure the move list ends with an end marker (code 0)
                moveCommands.push({ code: 0 });

                // Synthesize a 205 parent command
                const indent = page.list[orphanStart].indent || 0;
                const synthetic205 = {
                    code: 205,
                    indent: indent,
                    parameters: [-1, {
                        repeat: false,
                        skippable: false,
                        wait: true,
                        list: moveCommands
                    }]
                };

                // Remove the orphaned 505s and replace with 205 + clean 505s
                page.list.splice(orphanStart, orphanCount, synthetic205);
                // Re-insert 505s for actual move commands only (no end marker)
                let ins = 0;
                for (const mc of moveCommands) {
                    if (mc.code === 0) continue;
                    page.list.splice(orphanStart + 1 + ins, 0, {
                        code: 505,
                        indent: indent,
                        parameters: [mc]
                    });
                    ins++;
                }
                // Advance past the inserted 205 + its 505 children
                i = orphanStart + 1 + ins;

                repaired = true;
                console.log(`Repaired ${moveCommands.length} orphaned 505 entries at index ${orphanStart} by inserting synthetic 205`);
                continue;
            }

            i++;
        }

        return repaired;
    }

    /**
     * Refresh the command list display
     */
    refreshCommandList(page, pageIndex) {
        // Repair any orphaned 505 entries before rendering
        if (page) {
            this._repairOrphaned505s(page);
        }

        const container = document.querySelector('.event-contents-area');
        if (container) {
            this.eventEditor.updateContentsColumn();
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventCommandList;
}
