/**
 * DatabaseCommonEventEditor - Full visual common event editor
 * Layout: top section (name, trigger, switch), interactive command list
 * with command picker support.
 */

class DatabaseCommonEventEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;

        this.currentEvent = null;
        this.currentEventId = null;

        // Command list state
        this.commandPicker = null;
        this.selectedCommandIndices = [];
        this._selectionAnchor = null;
        this.commandClipboard = null;

        // Lazily-initialized command editors (same classes used by EventCommandList)
        this._editors = {};
    }

    // ==========================================
    // MAIN ENTRY
    // ==========================================

    showCommonEventDetail(container, event) {
        // Always fetch fresh data from database in case persisted changes replaced the reference
        const fresh = this.databaseManager.getCommonEvent(event.id);
        this.currentEvent = JSON.parse(JSON.stringify(fresh || event));
        this.currentEventId = event.id;
        this.selectedCommandIndices = [];
        this._selectionAnchor = null;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow-y: auto; padding: 16px; gap: 12px;';

        // Top section: Name, Trigger, Switch
        wrapper.appendChild(this.createTopSection());

        // Command list section
        wrapper.appendChild(this.createCommandListSection());

        container.appendChild(wrapper);

        this.attachMainListeners(container);
    }

    // ==========================================
    // TOP SECTION (Name, Trigger, Switch)
    // ==========================================

    createTopSection() {
        const section = document.createElement('div');
        section.style.cssText = 'display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;';

        // Name row
        const nameRow = document.createElement('div');
        nameRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';
        nameRow.innerHTML = `
            <label class="database-field-label" style="flex-shrink: 0;">Name:</label>
            <input type="text" class="database-field-value" id="common-event-name-input"
                   data-field="name" data-common-event-id="${this.currentEventId}"
                   value="${this.escapeHTML(this.currentEvent.name || '')}" style="flex: 1;">
        `;
        section.appendChild(nameRow);

        // Trigger row
        const triggerRow = document.createElement('div');
        triggerRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        const triggerLabel = document.createElement('label');
        triggerLabel.className = 'database-field-label';
        triggerLabel.style.cssText = 'flex-shrink: 0;';
        triggerLabel.textContent = 'Trigger:';
        triggerRow.appendChild(triggerLabel);

        const triggerSelect = document.createElement('select');
        triggerSelect.id = 'common-event-trigger-select';
        triggerSelect.className = 'database-field-value';
        triggerSelect.setAttribute('data-field', 'trigger');
        triggerSelect.style.cssText = 'min-width: 120px; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 4px; border-radius: 3px; font-size: 12px;';
        [{ value: 0, label: 'None' }, { value: 1, label: 'Autorun' }, { value: 2, label: 'Parallel' }].forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (this.currentEvent.trigger === opt.value) option.selected = true;
            triggerSelect.appendChild(option);
        });
        triggerRow.appendChild(triggerSelect);

        // Switch field (only visible when trigger > 0)
        const switchLabel = document.createElement('label');
        switchLabel.id = 'common-event-switch-label';
        switchLabel.className = 'database-field-label';
        switchLabel.style.cssText = `flex-shrink: 0; margin-left: 16px; ${this.currentEvent.trigger > 0 ? '' : 'display: none;'}`;
        switchLabel.textContent = 'Switch:';
        triggerRow.appendChild(switchLabel);

        const switchInput = document.createElement('input');
        switchInput.type = 'number';
        switchInput.id = 'common-event-switch-input';
        switchInput.className = 'database-field-value';
        switchInput.setAttribute('data-field', 'switchId');
        switchInput.min = 1;
        switchInput.value = this.currentEvent.switchId || 1;
        switchInput.style.cssText = `width: 80px; ${this.currentEvent.trigger > 0 ? '' : 'display: none;'}`;
        triggerRow.appendChild(switchInput);

        section.appendChild(triggerRow);

        return section;
    }

    // ==========================================
    // COMMAND LIST SECTION
    // ==========================================

    createCommandListSection() {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.cssText = 'flex: 1; display: flex; flex-direction: column; min-height: 300px;';

        section.innerHTML = '<div class="database-section-header">Event Commands</div>';

        const content = document.createElement('div');
        content.className = 'database-section-content';
        content.style.cssText = 'flex: 1; display: flex; flex-direction: column; overflow: hidden;';

        // Command list (interactive). tabIndex=-1 lets it receive focus on
        // click so Delete/Ctrl+C/X/V routed here instead of bubbling up to
        // the sidebar list (which would delete the whole common event).
        const cmdListContainer = document.createElement('div');
        cmdListContainer.id = 'common-event-command-list';
        cmdListContainer.tabIndex = -1;
        cmdListContainer.style.cssText = 'flex: 1; overflow-y: auto; border: 1px solid var(--color-border); background: var(--color-bg-base); border-radius: 3px; min-height: 300px; outline: none;';
        this.attachCommandListKeyboard(cmdListContainer);
        content.appendChild(cmdListContainer);

        section.appendChild(content);

        setTimeout(() => {
            this.renderCommandList(cmdListContainer, this.currentEvent);
        }, 0);

        return section;
    }

    /**
     * Bind keyboard shortcuts to the command list container. The listener
     * is on the container itself (not document), so it only fires when
     * focus is inside the command list. We stopPropagation so the sidebar
     * list's Delete handler doesn't also fire and delete the whole common
     * event.
     */
    attachCommandListKeyboard(container) {
        container.addEventListener('keydown', (e) => {
            // Ignore when editing text inside a child input
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

            const isCtrl = e.ctrlKey || e.metaKey;
            if (e.key === 'Delete' && this.selectedCommandIndices.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                this.deleteCommands(this.currentEvent, container);
            } else if (isCtrl && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                e.stopPropagation();
                this.copyCommands(this.currentEvent);
            } else if (isCtrl && e.key.toLowerCase() === 'x') {
                e.preventDefault();
                e.stopPropagation();
                this.cutCommands(this.currentEvent, container);
            } else if (isCtrl && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                e.stopPropagation();
                this.pasteCommands(this.currentEvent, container);
            }
        });
    }

    // ==========================================
    // INTERACTIVE COMMAND LIST
    // ==========================================

    renderCommandList(container, event) {
        container.innerHTML = '';

        if (!event.list || event.list.length === 0) {
            event.list = [{ code: 0, indent: 0, parameters: [] }];
        }

        event.list.forEach((cmd, idx) => {
            // Hide 655 Script continuation rows - folded into parent 355's summary
            if (cmd.code === 655) return;

            const div = document.createElement('div');
            div.dataset.cmdIndex = idx;
            const isSelected = this.selectedCommandIndices.includes(idx);

            // Don't visually hide the end command - show it as insertion point
            const isEnd = cmd.code === 0;

            div.style.cssText = `
                padding: 4px 8px; padding-left: ${(cmd.indent || 0) * 20 + 8}px;
                font-family: monospace; font-size: 11px; cursor: pointer; user-select: none;
                border-left: 3px solid ${this.getCommandColor(cmd.code)};
                background: ${isSelected ? 'var(--color-bg-selected)' : 'var(--color-bg-list-item)'};
                transition: background-color 0.1s; margin-bottom: 1px;
            `;

            if (isEnd) {
                div.innerHTML = '<span style="color: var(--color-border-input);">End</span>';
            } else {
                const info = this.getCommandDisplay(cmd, event, idx);
                div.innerHTML = `<span style="color: var(--color-text-dim); min-width: 32px; display: inline-block;">${String(idx + 1).padStart(3, '0')}</span>` +
                    `<span style="color: ${info.color}; font-weight: 600; margin-right: 8px;">${this.escapeHTML(info.name)}</span>` +
                    `<span style="color: var(--color-text);">${this.escapeHTML(info.description)}</span>`;
            }

            // Click to select. Plain click = single, Ctrl/Cmd-click =
            // toggle, Shift-click = range from anchor.
            div.onclick = (e) => {
                // Focus the command list so Delete/Ctrl+C/X/V get routed
                // here instead of bubbling to the sidebar list.
                container.focus();
                if (e.shiftKey &&
                    typeof this._selectionAnchor === "number") {
                    const lo = Math.min(this._selectionAnchor, idx);
                    const hi = Math.max(this._selectionAnchor, idx);
                    const range = [];
                    for (let i = lo; i <= hi; i++) range.push(i);
                    this.selectedCommandIndices = range;
                } else if (e.ctrlKey || e.metaKey) {
                    const i = this.selectedCommandIndices.indexOf(idx);
                    if (i >= 0) this.selectedCommandIndices.splice(i, 1);
                    else this.selectedCommandIndices.push(idx);
                    this._selectionAnchor = idx;
                } else {
                    this.selectedCommandIndices = [idx];
                    this._selectionAnchor = idx;
                }
                this.renderCommandList(container, event);
            };

            // Double-click end command -> add new command
            if (isEnd) {
                div.ondblclick = () => this.insertNewCommand(event, idx);
            } else {
                div.ondblclick = () => {
                    // For continuation lines, redirect to parent command
                    let targetIdx = idx;
                    if (cmd.code === 401 || cmd.code === 405 || cmd.code === 408 || cmd.code === 655) {
                        targetIdx = this.findParentCommandIndex(idx, event);
                    }
                    this.editCommand(targetIdx, event);
                };
            }

            // Hover
            div.onmouseenter = () => { if (!isSelected) div.style.backgroundColor = 'var(--color-bg-input)'; };
            div.onmouseleave = () => { if (!isSelected) div.style.backgroundColor = 'var(--color-bg-list-item)'; };

            // Right-click context menu
            div.oncontextmenu = (e) => {
                e.preventDefault();
                if (!this.selectedCommandIndices.includes(idx)) {
                    this.selectedCommandIndices = [idx];
                    this.renderCommandList(container, event);
                }
                this.showCommandContextMenu(e.clientX, e.clientY, event, container);
            };

            container.appendChild(div);
        });
    }

    showCommandContextMenu(x, y, event, container) {
        const existing = document.querySelector('.common-event-cmd-context-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.className = 'common-event-cmd-context-menu';
        menu.style.cssText = `
            position: fixed; left: ${x}px; top: ${y}px; background-color: var(--color-bg-list-item);
            border: 1px solid var(--color-border); border-radius: 4px; padding: 4px; z-index: 10004;
            min-width: 160px; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        `;

        const items = [
            { label: 'Insert Command', action: () => { const idx = this.selectedCommandIndices.length > 0 ? Math.max(...this.selectedCommandIndices) : event.list.length - 1; this.insertNewCommand(event, idx); } },
            { label: 'Edit', action: () => { if (this.selectedCommandIndices.length === 1) { let targetIdx = this.selectedCommandIndices[0]; const c = event.list[targetIdx]; if (c.code === 401 || c.code === 405 || c.code === 408 || c.code === 655) { targetIdx = this.findParentCommandIndex(targetIdx, event); } this.editCommand(targetIdx, event); } }, disabled: this.selectedCommandIndices.length !== 1 || (this.selectedCommandIndices.length === 1 && event.list[this.selectedCommandIndices[0]].code === 0) },
            { divider: true },
            { label: 'Cut', action: () => this.cutCommands(event, container) },
            { label: 'Copy', action: () => this.copyCommands(event) },
            { label: 'Paste', action: () => this.pasteCommands(event, container), disabled: !this.commandClipboard },
            { label: 'Delete', action: () => this.deleteCommands(event, container) },
        ];

        items.forEach(item => {
            if (item.divider) {
                const d = document.createElement('div');
                d.style.cssText = 'height: 1px; background-color: var(--color-border); margin: 4px 0;';
                menu.appendChild(d);
                return;
            }
            const mi = document.createElement('div');
            mi.textContent = item.label;
            mi.style.cssText = `padding: 5px 12px; cursor: ${item.disabled ? 'not-allowed' : 'pointer'}; color: ${item.disabled ? 'var(--color-text-dim)' : 'var(--color-text)'}; font-size: 12px; border-radius: 2px;`;
            if (!item.disabled) {
                mi.onmouseenter = () => { mi.style.backgroundColor = 'var(--color-bg-hover)'; };
                mi.onmouseleave = () => { mi.style.backgroundColor = ''; };
                mi.onclick = () => { item.action(); menu.remove(); };
            }
            menu.appendChild(mi);
        });

        document.body.appendChild(menu);
        const closeMenu = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); } };
        setTimeout(() => document.addEventListener('click', closeMenu), 50);
    }

    insertNewCommand(event, insertBeforeIndex) {
        if (!this.commandPicker) {
            this.commandPicker = new EventCommandPicker();
        }

        const refreshList = () => {
            this.persistEvent();
            const container = document.getElementById('common-event-command-list');
            if (container) this.renderCommandList(container, event);
        };

        const insertAndRefresh = (commands) => {
            if (commands && commands.length > 0) {
                commands.forEach((cmd, i) => event.list.splice(insertBeforeIndex + i, 0, cmd));
                this.selectedCommandIndices = [insertBeforeIndex];
                refreshList();
            }
        };

        this.commandPicker.show((command) => {
            const code = command.code;

            // Commands that need editors opened immediately on insert
            if (code === 101) {
                this.getEditor('message', MessageCommandEditor).show(null, insertAndRefresh);
                return;
            }
            if (code === 102) {
                this.getEditor('choices', ShowChoicesCommandEditor).show(null, insertAndRefresh);
                return;
            }
            if (code === 108) {
                this.getEditor('comment', CommentEditor).show(null, null, null, insertAndRefresh);
                return;
            }
            if (code === 111) {
                this.getEditor('conditionalBranch', ConditionalBranchEditor).show(null, insertAndRefresh);
                return;
            }
            if (code === 105) {
                this.getEditor('scrollingText', ShowScrollingTextEditor).show(null, insertAndRefresh);
                return;
            }
            if (code === 355) {
                this.getEditor('script', ScriptEditor).show(null, null, null, insertAndRefresh);
                return;
            }

            // Simple single-command editors for insert
            const singleInsert = (editor, ...extraArgs) => {
                editor.show(null, (editedCommand) => {
                    if (editedCommand) {
                        event.list.splice(insertBeforeIndex, 0, editedCommand);
                        this.selectedCommandIndices = [insertBeforeIndex];
                        refreshList();
                    }
                }, ...extraArgs);
            };

            const simpleEditorMap = {
                103: ['inputNumber', InputNumberEditor],
                104: ['selectItem', SelectItemEditor],
                112: ['loop', LoopEditor],
                113: ['breakLoop', BreakLoopEditor],
                117: ['commonEvent', CommonEventEditor],
                118: ['label', LabelEditor],
                119: ['jumpToLabel', JumpToLabelEditor],
                121: ['switches', ControlSwitchesEditor],
                122: ['variables', ControlVariablesEditor],
                123: ['controlSelfSwitch', ControlSelfSwitchEditor],
                124: ['controlTimer', ControlTimerEditor],
                125: ['gold', ChangeGoldEditor],
                126: ['changeItems', ChangeItemsEditor],
                127: ['changeWeapons', ChangeWeaponsEditor],
                128: ['changeArmors', ChangeArmorsEditor],
                129: ['changePartyMember', ChangePartyMemberEditor],
                201: ['transferPlayer', TransferPlayerEditor],
                205: ['setMovementRoute', SetMovementRouteEditor],
                211: ['changeTransparency', ChangeTransparencyEditor],
                212: ['showAnimation', ShowAnimationEditor],
                213: ['balloonIcon', ShowBalloonIconEditor],
                230: ['wait', WaitCommandEditor],
                231: ['showPicture', ShowPictureEditor],
                235: ['erasePicture', ErasePictureEditor],
                301: ['battleProcessing', BattleProcessingEditor],
                303: ['nameInputProcessing', NameInputProcessingEditor],
                311: ['changeHP', ChangeHPEditor],
                312: ['changeMP', ChangeMPEditor],
                313: ['changeState', ChangeStateEditor],
                314: ['recoverAll', RecoverAllEditor],
                315: ['changeEXP', ChangeEXPEditor],
                316: ['changeLevel', ChangeLevelEditor],
                317: ['changeParameter', ChangeParameterEditor],
                318: ['changeSkill', ChangeSkillEditor],
                319: ['changeEquipment', ChangeEquipmentEditor],
                320: ['changeName', ChangeNameEditor],
                321: ['changeClass', ChangeClassEditor],
                326: ['changeTP', ChangeTPEditor],
                331: ['changeEnemyHP', ChangeEnemyHPEditor],
                332: ['changeEnemyMP', ChangeEnemyMPEditor],
                333: ['changeEnemyState', ChangeEnemyStateEditor],
                334: ['enemyRecoverAll', EnemyRecoverAllEditor],
                335: ['enemyAppear', EnemyAppearEditor],
                336: ['enemyTransform', EnemyTransformEditor],
                337: ['showBattleAnimation', ShowBattleAnimationEditor],
                339: ['forceAction', ForceActionEditor],
                356: ['pluginCommand', PluginCommandEditor],
            };

            if (simpleEditorMap[code]) {
                const [name, EditorClass] = simpleEditorMap[code];
                singleInsert(this.getEditor(name, EditorClass));
                return;
            }

            // Audio commands
            if ([241, 242, 245, 246, 249, 250, 251].includes(code)) {
                const editor = this.getEditor('audio', AudioCommandEditor);
                editor.show(null, code, (editedCommand) => {
                    if (editedCommand) {
                        event.list.splice(insertBeforeIndex, 0, editedCommand);
                        this.selectedCommandIndices = [insertBeforeIndex];
                        refreshList();
                    }
                });
                return;
            }

            // Toggle commands
            const toggleMap = {
                134: { code: 134, title: 'Change Save Access', option0: 'Disable', option1: 'Enable' },
                135: { code: 135, title: 'Change Menu Access', option0: 'Disable', option1: 'Enable' },
                136: { code: 136, title: 'Change Encounter', option0: 'Disable', option1: 'Enable' },
                137: { code: 137, title: 'Change Formation Access', option0: 'Disable', option1: 'Enable' },
                216: { code: 216, title: 'Change Player Followers', option0: 'Show', option1: 'Hide' },
                281: { code: 281, title: 'Change Map Name Display', option0: 'Enable', option1: 'Disable' },
            };
            if (toggleMap[code]) {
                singleInsert(this.getEditor('toggle', ToggleCommandEditor), toggleMap[code]);
                return;
            }

            // Default: insert with default params (no editor)
            const cmds = this.buildCommandStructure(code);
            cmds.forEach((cmd, i) => event.list.splice(insertBeforeIndex + i, 0, cmd));
            this.selectedCommandIndices = [insertBeforeIndex];
            refreshList();
        });
    }

    // ==========================================
    // LAZY EDITOR INITIALIZATION
    // ==========================================

    getEditor(name, EditorClass, ...extraArgs) {
        if (!this._editors[name]) {
            this._editors[name] = new EditorClass(this.databaseManager, this.projectManager, ...extraArgs);
        }
        return this._editors[name];
    }

    // ==========================================
    // COMMAND EDITING (dispatch to specialized editors)
    // ==========================================

    editCommand(idx, event) {
        const command = event.list[idx];
        if (!command || command.code === 0) return;

        const code = command.code;
        const refreshList = () => {
            this.persistEvent();
            const container = document.getElementById('common-event-command-list');
            if (container) this.renderCommandList(container, event);
        };

        // Helper: simple single-command replace
        const singleReplace = (editor, ...showArgs) => {
            editor.show(command, (editedCommand) => {
                if (editedCommand) {
                    event.list[idx] = editedCommand;
                    refreshList();
                }
            }, ...showArgs);
        };

        // Helper: multi-command replace (removes continuation lines first)
        const multiReplace = (editor, contCode, showArgs = []) => {
            let removeCount = 1;
            for (let i = idx + 1; i < event.list.length; i++) {
                if (event.list[i].code === contCode) removeCount++;
                else break;
            }
            const textLines = [];
            for (let i = idx + 1; i < idx + removeCount; i++) {
                textLines.push(event.list[i].parameters[0] || '');
            }
            editor.show(command, (commands) => {
                if (commands && commands.length > 0) {
                    event.list.splice(idx, removeCount);
                    commands.forEach((cmd, i) => event.list.splice(idx + i, 0, cmd));
                    refreshList();
                }
            }, ...showArgs);
        };

        // Show Text (101) - multi-line with 401 continuation
        if (code === 101) {
            const textLines = [];
            for (let i = idx + 1; i < event.list.length; i++) {
                if (event.list[i].code === 401) textLines.push(event.list[i].parameters[0] || '');
                else break;
            }
            const messageData = { command, textLines };
            const editor = this.getEditor('message', MessageCommandEditor);
            editor.show(messageData, (commands) => {
                if (commands && commands.length > 0) {
                    let removeCount = 1;
                    for (let i = idx + 1; i < event.list.length; i++) {
                        if (event.list[i].code === 401) removeCount++;
                        else break;
                    }
                    event.list.splice(idx, removeCount);
                    commands.forEach((cmd, i) => event.list.splice(idx + i, 0, cmd));
                    refreshList();
                }
            });
            return;
        }

        // Show Choices (102) - structural command with branches
        if (code === 102) {
            const editor = this.getEditor('choices', ShowChoicesCommandEditor);
            editor.show(command, (commands) => {
                if (commands && commands.length > 0) {
                    const nestedCommands = [];
                    let currentBranch = [];
                    let i = idx + 1;
                    while (i < event.list.length) {
                        const cmd = event.list[i];
                        if (cmd.code === 402 || cmd.code === 403) {
                            if (currentBranch.length > 0) nestedCommands.push(currentBranch);
                            currentBranch = [];
                            i++;
                        } else if (cmd.code === 404) {
                            if (currentBranch.length > 0) nestedCommands.push(currentBranch);
                            break;
                        } else {
                            currentBranch.push(cmd);
                            i++;
                        }
                    }
                    const removeCount = i - idx + 1;
                    event.list.splice(idx, removeCount);
                    let insertPos = idx;
                    let branchIndex = 0;
                    commands.forEach((cmd) => {
                        event.list.splice(insertPos++, 0, cmd);
                        if (cmd.code === 402 || cmd.code === 403) {
                            if (nestedCommands[branchIndex]) {
                                nestedCommands[branchIndex].forEach(nc => event.list.splice(insertPos++, 0, nc));
                                branchIndex++;
                            }
                        }
                    });
                    refreshList();
                }
            });
            return;
        }

        // Input Number (103)
        if (code === 103) { singleReplace(this.getEditor('inputNumber', InputNumberEditor)); return; }

        // Select Item (104)
        if (code === 104) { singleReplace(this.getEditor('selectItem', SelectItemEditor)); return; }

        // Show Scrolling Text (105) - multi-line with 405 continuation
        if (code === 105) {
            const textLines = [];
            for (let i = idx + 1; i < event.list.length; i++) {
                if (event.list[i].code === 405) textLines.push(event.list[i].parameters[0] || '');
                else break;
            }
            const editor = this.getEditor('scrollingText', ShowScrollingTextEditor);
            editor.show(command, (commands) => {
                if (commands && commands.length > 0) {
                    let removeCount = 1;
                    for (let i = idx + 1; i < event.list.length; i++) {
                        if (event.list[i].code === 405) removeCount++;
                        else break;
                    }
                    event.list.splice(idx, removeCount);
                    commands.forEach((cmd, i) => event.list.splice(idx + i, 0, cmd));
                    refreshList();
                }
            }, textLines);
            return;
        }

        // Comment (108) - multi-line with 408 continuation
        if (code === 108) {
            const editor = this.getEditor('comment', CommentEditor);
            editor.show(command, event.list, idx, (commands) => {
                if (commands && commands.length > 0) {
                    let removeCount = 1;
                    for (let i = idx + 1; i < event.list.length; i++) {
                        if (event.list[i].code === 408) removeCount++;
                        else break;
                    }
                    event.list.splice(idx, removeCount);
                    commands.forEach((cmd, i) => event.list.splice(idx + i, 0, cmd));
                    refreshList();
                }
            });
            return;
        }

        // Conditional Branch (111) - structural with nested branches
        if (code === 111) {
            const editor = this.getEditor('conditionalBranch', ConditionalBranchEditor);
            editor.show(command, (commands) => {
                if (commands && commands.length > 0) {
                    const nestedCommands = [];
                    let currentBranch = [];
                    let i = idx + 1;
                    while (i < event.list.length) {
                        const cmd = event.list[i];
                        if (cmd.code === 411) {
                            if (currentBranch.length > 0) nestedCommands.push(currentBranch);
                            currentBranch = [];
                            i++;
                        } else if (cmd.code === 412) {
                            if (currentBranch.length > 0) nestedCommands.push(currentBranch);
                            break;
                        } else {
                            currentBranch.push(cmd);
                            i++;
                        }
                    }
                    const removeCount = i - idx + 1;
                    event.list.splice(idx, removeCount);
                    let insertPos = idx;
                    let branchIndex = 0;
                    commands.forEach((cmd) => {
                        event.list.splice(insertPos++, 0, cmd);
                        if (cmd.code === 111 || cmd.code === 411) {
                            if (nestedCommands[branchIndex]) {
                                nestedCommands[branchIndex].forEach(nc => event.list.splice(insertPos++, 0, nc));
                                branchIndex++;
                            }
                        }
                    });
                    refreshList();
                }
            });
            return;
        }

        // Loop (112)
        if (code === 112) { singleReplace(this.getEditor('loop', LoopEditor)); return; }

        // Break Loop (113)
        if (code === 113) { singleReplace(this.getEditor('breakLoop', BreakLoopEditor)); return; }

        // Common Event (117)
        if (code === 117) { singleReplace(this.getEditor('commonEvent', CommonEventEditor)); return; }

        // Label (118)
        if (code === 118) { singleReplace(this.getEditor('label', LabelEditor)); return; }

        // Jump to Label (119)
        if (code === 119) { singleReplace(this.getEditor('jumpToLabel', JumpToLabelEditor)); return; }

        // Control Switches (121)
        if (code === 121) { singleReplace(this.getEditor('switches', ControlSwitchesEditor)); return; }

        // Control Variables (122)
        if (code === 122) { singleReplace(this.getEditor('variables', ControlVariablesEditor)); return; }

        // Control Self Switch (123)
        if (code === 123) { singleReplace(this.getEditor('controlSelfSwitch', ControlSelfSwitchEditor)); return; }

        // Control Timer (124)
        if (code === 124) { singleReplace(this.getEditor('controlTimer', ControlTimerEditor)); return; }

        // Change Gold (125)
        if (code === 125) { singleReplace(this.getEditor('gold', ChangeGoldEditor)); return; }

        // Change Items (126)
        if (code === 126) { singleReplace(this.getEditor('changeItems', ChangeItemsEditor)); return; }

        // Change Weapons (127)
        if (code === 127) { singleReplace(this.getEditor('changeWeapons', ChangeWeaponsEditor)); return; }

        // Change Armors (128)
        if (code === 128) { singleReplace(this.getEditor('changeArmors', ChangeArmorsEditor)); return; }

        // Change Party Member (129)
        if (code === 129) { singleReplace(this.getEditor('changePartyMember', ChangePartyMemberEditor)); return; }

        // Change Battle BGM (132)
        if (code === 132) { singleReplace(this.getEditor('changeBattleBGM', ChangeBattleBGMEditor)); return; }

        // Change Victory ME (133)
        if (code === 133) { singleReplace(this.getEditor('changeVictoryME', ChangeVictoryMEEditor)); return; }

        // Toggle commands (134-137)
        if (code === 134) { singleReplace(this.getEditor('toggle', ToggleCommandEditor), { code: 134, title: 'Change Save Access', option0: 'Disable', option1: 'Enable' }); return; }
        if (code === 135) { singleReplace(this.getEditor('toggle', ToggleCommandEditor), { code: 135, title: 'Change Menu Access', option0: 'Disable', option1: 'Enable' }); return; }
        if (code === 136) { singleReplace(this.getEditor('toggle', ToggleCommandEditor), { code: 136, title: 'Change Encounter', option0: 'Disable', option1: 'Enable' }); return; }
        if (code === 137) { singleReplace(this.getEditor('toggle', ToggleCommandEditor), { code: 137, title: 'Change Formation Access', option0: 'Disable', option1: 'Enable' }); return; }

        // Change Window Color (138)
        if (code === 138) { singleReplace(this.getEditor('changeWindowColor', ChangeWindowColorEditor)); return; }

        // Change Defeat ME (139)
        if (code === 139) { singleReplace(this.getEditor('changeDefeatME', ChangeDefeatMEEditor)); return; }

        // Change Vehicle BGM (140)
        if (code === 140) { singleReplace(this.getEditor('changeVehicleBGM', ChangeVehicleBGMEditor)); return; }

        // Transfer Player (201)
        if (code === 201) { singleReplace(this.getEditor('transferPlayer', TransferPlayerEditor)); return; }

        // Set Vehicle Location (202)
        if (code === 202) { singleReplace(this.getEditor('setVehicleLocation', SetVehicleLocationEditor)); return; }

        // Set Event Location (203)
        if (code === 203) { singleReplace(this.getEditor('setEventLocation', SetEventLocationEditor)); return; }

        // Scroll Map (204)
        if (code === 204) { singleReplace(this.getEditor('scrollMap', ScrollMapEditor)); return; }

        // Set Movement Route (205) - has 505 continuation lines
        if (code === 205) {
            const editor = this.getEditor('setMovementRoute', SetMovementRouteEditor);
            editor.show(command, (editedCommand) => {
                if (editedCommand) {
                    event.list[idx] = editedCommand;
                    let removeCount = 0;
                    let scan = idx + 1;
                    while (scan < event.list.length && event.list[scan].code === 505) {
                        removeCount++;
                        scan++;
                    }
                    if (removeCount > 0) event.list.splice(idx + 1, removeCount);
                    const moveList = editedCommand.parameters[1].list;
                    let inserted = 0;
                    for (let i = 0; i < moveList.length; i++) {
                        if (moveList[i].code === 0) continue;
                        event.list.splice(idx + 1 + inserted, 0, {
                            code: 505, indent: editedCommand.indent || 0, parameters: [moveList[i]]
                        });
                        inserted++;
                    }
                    refreshList();
                }
            });
            return;
        }

        // Change Transparency (211)
        if (code === 211) { singleReplace(this.getEditor('changeTransparency', ChangeTransparencyEditor)); return; }

        // Show Animation (212)
        if (code === 212) { singleReplace(this.getEditor('showAnimation', ShowAnimationEditor)); return; }

        // Show Balloon Icon (213)
        if (code === 213) { singleReplace(this.getEditor('balloonIcon', ShowBalloonIconEditor)); return; }

        // Change Player Followers (216)
        if (code === 216) { singleReplace(this.getEditor('toggle', ToggleCommandEditor), { code: 216, title: 'Change Player Followers', option0: 'Show', option1: 'Hide' }); return; }

        // Fadeout/Fadein Screen (221, 222)
        if (code === 221 || code === 222) { singleReplace(this.getEditor('fadeScreen', FadeScreenEditor)); return; }

        // Tint Screen (223)
        if (code === 223) { singleReplace(this.getEditor('tintScreen', TintScreenEditor)); return; }

        // Flash Screen (224)
        if (code === 224) { singleReplace(this.getEditor('flashScreen', FlashScreenEditor)); return; }

        // Shake Screen (225)
        if (code === 225) { singleReplace(this.getEditor('shakeScreen', ShakeScreenEditor)); return; }

        // Wait (230)
        if (code === 230) { singleReplace(this.getEditor('wait', WaitCommandEditor)); return; }

        // Show Picture (231)
        if (code === 231) { singleReplace(this.getEditor('showPicture', ShowPictureEditor)); return; }

        // Move Picture (232)
        if (code === 232) { singleReplace(this.getEditor('movePicture', MovePictureEditor)); return; }

        // Rotate Picture (233)
        if (code === 233) { singleReplace(this.getEditor('rotatePicture', RotatePictureEditor)); return; }

        // Tint Picture (234)
        if (code === 234) { singleReplace(this.getEditor('tintPicture', TintPictureEditor)); return; }

        // Erase Picture (235)
        if (code === 235) { singleReplace(this.getEditor('erasePicture', ErasePictureEditor)); return; }

        // Set Weather Effect (236)
        if (code === 236) { singleReplace(this.getEditor('setWeatherEffect', SetWeatherEffectEditor)); return; }

        // Audio commands (241, 242, 245, 246, 249, 250, 251)
        if ([241, 242, 245, 246, 249, 250, 251].includes(code)) {
            const editor = this.getEditor('audio', AudioCommandEditor);
            editor.show(command, code, (editedCommand) => {
                event.list[idx] = editedCommand;
                refreshList();
            });
            return;
        }

        // Play Movie (261)
        if (code === 261) { singleReplace(this.getEditor('playMovie', PlayMovieEditor)); return; }

        // Change Map Name Display (281)
        if (code === 281) { singleReplace(this.getEditor('toggle', ToggleCommandEditor), { code: 281, title: 'Change Map Name Display', option0: 'Enable', option1: 'Disable' }); return; }

        // Change Tileset (282)
        if (code === 282) { singleReplace(this.getEditor('changeTileset', ChangeTilesetEditor)); return; }

        // Change Battle Background (283)
        if (code === 283) { singleReplace(this.getEditor('changeBattleBackground', ChangeBattleBackgroundEditor)); return; }

        // Change Parallax (284)
        if (code === 284) { singleReplace(this.getEditor('changeParallax', ChangeParallaxEditor)); return; }

        // Get Location Info (285)
        if (code === 285) { singleReplace(this.getEditor('getLocationInfo', GetLocationInfoEditor)); return; }

        // Battle Processing (301)
        if (code === 301) { singleReplace(this.getEditor('battleProcessing', BattleProcessingEditor)); return; }

        // Shop Processing (302) - multi-command with 605 continuation
        if (code === 302) {
            const editor = this.getEditor('shopProcessing', ShopProcessingEditor);
            editor.show(command, (commands) => {
                if (commands && commands.length > 0) {
                    let removeCount = 1;
                    for (let i = idx + 1; i < event.list.length; i++) {
                        if (event.list[i].code === 605) removeCount++;
                        else break;
                    }
                    event.list.splice(idx, removeCount);
                    commands.forEach((cmd, i) => event.list.splice(idx + i, 0, cmd));
                    refreshList();
                }
            }, event.list, idx);
            return;
        }

        // Name Input Processing (303)
        if (code === 303) { singleReplace(this.getEditor('nameInputProcessing', NameInputProcessingEditor)); return; }

        // Change HP (311)
        if (code === 311) { singleReplace(this.getEditor('changeHP', ChangeHPEditor)); return; }

        // Change MP (312)
        if (code === 312) { singleReplace(this.getEditor('changeMP', ChangeMPEditor)); return; }

        // Change State (313)
        if (code === 313) { singleReplace(this.getEditor('changeState', ChangeStateEditor)); return; }

        // Recover All (314)
        if (code === 314) { singleReplace(this.getEditor('recoverAll', RecoverAllEditor)); return; }

        // Change EXP (315)
        if (code === 315) { singleReplace(this.getEditor('changeEXP', ChangeEXPEditor)); return; }

        // Change Level (316)
        if (code === 316) { singleReplace(this.getEditor('changeLevel', ChangeLevelEditor)); return; }

        // Change Parameter (317)
        if (code === 317) { singleReplace(this.getEditor('changeParameter', ChangeParameterEditor)); return; }

        // Change Skill (318)
        if (code === 318) { singleReplace(this.getEditor('changeSkill', ChangeSkillEditor)); return; }

        // Change Equipment (319)
        if (code === 319) { singleReplace(this.getEditor('changeEquipment', ChangeEquipmentEditor)); return; }

        // Change Name (320)
        if (code === 320) { singleReplace(this.getEditor('changeName', ChangeNameEditor)); return; }

        // Change Class (321)
        if (code === 321) { singleReplace(this.getEditor('changeClass', ChangeClassEditor)); return; }

        // Change Actor Images (322)
        if (code === 322) { singleReplace(this.getEditor('changeActorImages', ChangeActorImagesEditor)); return; }

        // Change Vehicle Image (323)
        if (code === 323) { singleReplace(this.getEditor('changeVehicleImage', ChangeVehicleImageEditor)); return; }

        // Change Nickname (324)
        if (code === 324) { singleReplace(this.getEditor('changeNickname', ChangeNicknameEditor)); return; }

        // Change Profile (325)
        if (code === 325) { singleReplace(this.getEditor('changeProfile', ChangeProfileEditor)); return; }

        // Change TP (326)
        if (code === 326) { singleReplace(this.getEditor('changeTP', ChangeTPEditor)); return; }

        // Change Enemy HP (331)
        if (code === 331) { singleReplace(this.getEditor('changeEnemyHP', ChangeEnemyHPEditor)); return; }

        // Change Enemy MP (332)
        if (code === 332) { singleReplace(this.getEditor('changeEnemyMP', ChangeEnemyMPEditor)); return; }

        // Change Enemy State (333)
        if (code === 333) { singleReplace(this.getEditor('changeEnemyState', ChangeEnemyStateEditor)); return; }

        // Enemy Recover All (334)
        if (code === 334) { singleReplace(this.getEditor('enemyRecoverAll', EnemyRecoverAllEditor)); return; }

        // Enemy Appear (335)
        if (code === 335) { singleReplace(this.getEditor('enemyAppear', EnemyAppearEditor)); return; }

        // Enemy Transform (336)
        if (code === 336) { singleReplace(this.getEditor('enemyTransform', EnemyTransformEditor)); return; }

        // Show Battle Animation (337)
        if (code === 337) { singleReplace(this.getEditor('showBattleAnimation', ShowBattleAnimationEditor)); return; }

        // Force Action (339)
        if (code === 339) { singleReplace(this.getEditor('forceAction', ForceActionEditor)); return; }

        // Change Enemy TP (342)
        if (code === 342) { singleReplace(this.getEditor('changeEnemyTP', ChangeEnemyTPEditor)); return; }

        // Script (355) - multi-line with 655 continuation
        if (code === 355) {
            const editor = this.getEditor('script', ScriptEditor);
            editor.show(command, event.list, idx, (commands) => {
                if (commands && commands.length > 0) {
                    let removeCount = 1;
                    for (let i = idx + 1; i < event.list.length; i++) {
                        if (event.list[i].code === 655) removeCount++;
                        else break;
                    }
                    event.list.splice(idx, removeCount);
                    commands.forEach((cmd, i) => event.list.splice(idx + i, 0, cmd));
                    refreshList();
                }
            });
            return;
        }

        // Plugin Command (356, 357)
        if (code === 356 || code === 357) { singleReplace(this.getEditor('pluginCommand', PluginCommandEditor)); return; }

        // Fallback: raw JSON editor for unrecognized codes
        this.editCommandRawJSON(command, idx, event);
    }

    /**
     * Find the parent command index for continuation lines (401, 405, 408)
     */
    findParentCommandIndex(idx, event) {
        const code = event.list[idx].code;
        const parentCodes = { 401: 101, 405: 105, 408: 108, 655: 355 };
        const parentCode = parentCodes[code];
        if (!parentCode) return idx;
        for (let i = idx - 1; i >= 0; i--) {
            if (event.list[i].code === parentCode) return i;
        }
        return idx;
    }

    /**
     * Map of continuation / end-marker codes to the parent header code that
     * owns them. Used to trace from any line in a block back to its header
     * so a delete on (e.g.) an "Else" line removes the whole conditional.
     */
    static get CONTINUATION_PARENT() {
        return {
            401: 101,  // Show Text  (content line)
            405: 105,  // Show Scrolling Text  (content line)
            408: 108,  // Comment  (continuation line)
            411: 111,  // Conditional Branch  (Else)
            412: 111,  // Conditional Branch  (End)
            413: 112,  // Loop  (Repeat / end-loop)
            505: 205,  // Set Movement Route  (route step)
            601: 301,  // Battle Processing  (if win)
            602: 301,  // Battle Processing  (if escape/loss)
            603: 301,  // Battle Processing  (if lose)
            604: 301,  // Battle Processing  (end-battle)
            655: 355   // Script  (additional line)
        };
    }

    /**
     * Header codes whose block is a contiguous run of specific child codes
     * at the SAME indent immediately following the header. No end marker.
     */
    static get CONTIGUOUS_CHILDREN() {
        return {
            101: [401],
            105: [405],
            108: [408],
            205: [505],
            355: [655]
        };
    }

    /**
     * Header codes whose block ends at a specific end-marker code at the
     * SAME indent as the header. Inner lines (any code, any deeper indent)
     * are all part of the block.
     */
    static get BLOCK_END_CODES() {
        return {
            111: [412],   // Conditional Branch -> End
            112: [413],   // Loop -> Repeat
            102: [404],   // Show Choices -> End
            301: [604]    // Battle Processing -> End
        };
    }

    /**
     * Given any index in event.list, return [startIdx, endIdx] (inclusive)
     * for the structural block that contains it. If idx points to a child
     * or end-marker line, the result spans the whole parent block. If idx
     * is a standalone command (no children, not a continuation), returns
     * [idx, idx]. The end marker `code: 0` is always treated as standalone.
     */
    getCommandBlockRange(idx, event) {
        const list = event.list;
        if (!list[idx] || list[idx].code === 0) return [idx, idx];

        // Step 1: trace continuation/end-marker back to its parent header.
        let headerIdx = idx;
        const codeAt = list[idx].code;
        const parentCode = DatabaseCommonEventEditor.CONTINUATION_PARENT[codeAt];
        if (parentCode) {
            const parentIndent = list[idx].indent;
            for (let i = idx - 1; i >= 0; i--) {
                if (list[i].code === parentCode &&
                    list[i].indent === parentIndent) {
                    headerIdx = i;
                    break;
                }
            }
        }

        const headerCode = list[headerIdx].code;
        const headerIndent = list[headerIdx].indent;

        // Step 2a: contiguous-children blocks (Show Text + 401 lines, etc.).
        const childCodes =
            DatabaseCommonEventEditor.CONTIGUOUS_CHILDREN[headerCode];
        if (childCodes) {
            let endIdx = headerIdx;
            for (let i = headerIdx + 1; i < list.length; i++) {
                if (childCodes.includes(list[i].code) &&
                    list[i].indent === headerIndent) {
                    endIdx = i;
                } else {
                    break;
                }
            }
            return [headerIdx, endIdx];
        }

        // Step 2b: end-marker blocks (111 -> 412, 112 -> 413, etc.).
        const endCodes = DatabaseCommonEventEditor.BLOCK_END_CODES[headerCode];
        if (endCodes) {
            for (let i = headerIdx + 1; i < list.length; i++) {
                if (endCodes.includes(list[i].code) &&
                    list[i].indent === headerIndent) {
                    return [headerIdx, i];
                }
            }
            // Malformed (no matching end). Don't aggressively delete --
            // return just the header to avoid eating unrelated commands.
            return [headerIdx, headerIdx];
        }

        // Standalone command.
        return [headerIdx, headerIdx];
    }

    /**
     * Fallback raw JSON editor for unrecognized command codes
     */
    editCommandRawJSON(cmd, idx, event) {
        if (cmd.code === 0) return;

        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10005;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 8px; padding: 20px; width: 500px; max-width: 90vw; max-height: 80vh; overflow-y: auto;';

        const info = this.getCommandDisplay(cmd);
        dialog.innerHTML = `<h3 style="margin: 0 0 12px 0; color: var(--color-text-strong); font-size: 14px;">${this.escapeHTML(info.name)} (Code ${cmd.code})</h3>`;

        const textarea = document.createElement('textarea');
        textarea.value = JSON.stringify(cmd.parameters, null, 2);
        textarea.style.cssText = 'width: 100%; height: 200px; background: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); font-family: monospace; font-size: 12px; padding: 8px; border-radius: 4px; box-sizing: border-box; resize: vertical;';
        dialog.appendChild(textarea);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;';

        const cancelBtn = this.createButton('Cancel', () => document.body.removeChild(modal));
        const okBtn = this.createButton('OK', () => {
            try {
                cmd.parameters = JSON.parse(textarea.value);
                this.persistEvent();
                const container = document.getElementById('common-event-command-list');
                if (container) this.renderCommandList(container, event);
                document.body.removeChild(modal);
            } catch (e) {
                alert('Invalid JSON: ' + e.message);
            }
        });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        dialog.appendChild(btnRow);
        modal.appendChild(dialog);
        modal.onclick = (e) => { if (e.target === modal) document.body.removeChild(modal); };
        document.body.appendChild(modal);
    }

    // ==========================================
    // COMMAND CLIPBOARD OPERATIONS
    // ==========================================

    copyCommands(event) {
        // Expand selection to full blocks so copying a Conditional Branch
        // grabs the entire if/else/end structure, not just the header line.
        const indices = this.expandToBlocks(this.selectedCommandIndices, event);
        if (indices.length === 0) return;
        this.commandClipboard = indices.map(i => JSON.parse(JSON.stringify(event.list[i])));
    }

    /**
     * Expand a set of selected indices to cover the full structural blocks
     * containing each one (header + children + end-marker). Returns a sorted
     * unique array. Drops the terminating `code: 0` line. Mirrors MZ map
     * editor behavior: deleting any line in a Conditional Branch removes the
     * whole if/else/end block.
     */
    expandToBlocks(indices, event) {
        const expanded = new Set();
        for (const idx of indices) {
            if (!event.list[idx] || event.list[idx].code === 0) continue;
            const [start, end] = this.getCommandBlockRange(idx, event);
            for (let i = start; i <= end; i++) expanded.add(i);
        }
        return Array.from(expanded).sort((a, b) => a - b);
    }

    cutCommands(event, container) {
        this.copyCommands(event);
        this.deleteCommands(event, container);
    }

    deleteCommands(event, container) {
        // Expand each selected index into its full block (e.g. a Conditional
        // Branch header expands to header + body + else + body + end). Sort
        // descending so splices don't shift indices we still need.
        const indices = this.expandToBlocks(this.selectedCommandIndices, event)
            .sort((a, b) => b - a);
        indices.forEach(i => event.list.splice(i, 1));
        this.selectedCommandIndices = [];
        this.persistEvent();
        if (container) this.renderCommandList(container, event);
    }

    pasteCommands(event, container) {
        if (!this.commandClipboard) return;
        const insertAt = this.selectedCommandIndices.length > 0 ? Math.max(...this.selectedCommandIndices) + 1 : event.list.length - 1;
        this.commandClipboard.forEach((cmd, i) => {
            event.list.splice(insertAt + i, 0, JSON.parse(JSON.stringify(cmd)));
        });
        this.persistEvent();
        if (container) this.renderCommandList(container, event);
    }

    // ==========================================
    // COMMAND STRUCTURE BUILDERS
    // ==========================================

    buildCommandStructure(code) {
        switch (code) {
            case 111: // Conditional Branch
                return [
                    { code: 111, indent: 0, parameters: [0, 1, 0] },
                    { code: 0, indent: 1, parameters: [] },
                    { code: 411, indent: 0, parameters: [] },
                    { code: 0, indent: 1, parameters: [] },
                    { code: 412, indent: 0, parameters: [] }
                ];
            case 112: // Loop
                return [
                    { code: 112, indent: 0, parameters: [] },
                    { code: 0, indent: 1, parameters: [] },
                    { code: 413, indent: 0, parameters: [] }
                ];
            case 102: // Show Choices
                return [
                    { code: 102, indent: 0, parameters: [['Yes', 'No'], 0, 0, 2, 0] },
                    { code: 402, indent: 0, parameters: [0, 'Yes'] },
                    { code: 0, indent: 1, parameters: [] },
                    { code: 402, indent: 0, parameters: [1, 'No'] },
                    { code: 0, indent: 1, parameters: [] },
                    { code: 404, indent: 0, parameters: [] }
                ];
            case 301: // Battle Processing
                return [
                    { code: 301, indent: 0, parameters: [0, 0, false, false] },
                    { code: 601, indent: 0, parameters: [] },
                    { code: 0, indent: 1, parameters: [] },
                    { code: 602, indent: 0, parameters: [] },
                    { code: 0, indent: 1, parameters: [] },
                    { code: 603, indent: 0, parameters: [] },
                    { code: 0, indent: 1, parameters: [] },
                    { code: 604, indent: 0, parameters: [] }
                ];
            default:
                return [{ code: code, indent: 0, parameters: this.getDefaultParams(code) }];
        }
    }

    getDefaultParams(code) {
        const defaults = {
            101: ['', 0, 0, 2, ''],    // Show Text
            108: [''],                   // Comment
            117: [1],                    // Common Event
            121: [1, 1, 0],             // Control Switches
            122: [1, 1, 0, 0, 0],       // Control Variables
            125: [0, 0, 0],             // Change Gold
            126: [1, 0, 0, 1],          // Change Items
            230: [60],                   // Wait
            241: [{ name: '', volume: 90, pitch: 100, pan: 0 }], // Play BGM
            245: [{ name: '', volume: 90, pitch: 100, pan: 0 }], // Play BGS
            250: [{ name: '', volume: 90, pitch: 100, pan: 0 }], // Play SE
            311: [0, 0, 0, 0, 100, false], // Change HP
            312: [0, 0, 0, 0, 100, false], // Change MP
            313: [0, 0, 0, 1],          // Change State
            314: [0, 0],                // Recover All
            331: [0, 0, 0, 100],        // Change Enemy HP
            332: [0, 0, 0, 100],        // Change Enemy MP
            333: [0, 0, 1],             // Change Enemy State
            334: [0],                    // Enemy Recover All
            335: [0],                    // Enemy Appear
            336: [0, 1],                // Enemy Transform
            337: [0, 0, 1, false],       // Show Battle Animation
            338: [0, 0, 0],             // Force Action
            339: [],                     // Abort Battle
            355: [''],                   // Script
        };
        return defaults[code] || [];
    }

    // ==========================================
    // COMMAND DISPLAY (delegated to EventCommandList so summaries stay in
    // lockstep with the map event editor — single source of truth)
    // ==========================================

    /**
     * Lazily construct a shared EventCommandList instance used here purely
     * as a formatter. EventCommandList's getCommandInfo / getCommandColor /
     * _fmtSwitch / _fmtVar / _fmtGameDataOperand etc. are the canonical
     * summary renderers for every event command; reusing them keeps the
     * common-event command list visually identical to the map event one.
     *
     * EventCommandList expects an eventEditor host with databaseManager +
     * projectController. We supply a shim with the pieces its formatting
     * helpers actually touch. Map-event lookups (e.g. "Event 003: Foo" in
     * Set Event Location summaries) fall back to numeric IDs because the
     * shim has no current map, which is correct for common events.
     */
    _getFormatter() {
        if (!this._formatter) {
            this._formatter = new EventCommandList({
                databaseManager: this.databaseManager,
                projectController: {
                    eventManager: { currentMap: { events: [] } },
                    getCurrentProject: () => (this.projectManager && this.projectManager.currentProject) || null,
                    currentProject: (this.projectManager && this.projectManager.currentProject) || null,
                },
            });
        }
        return this._formatter;
    }

    getCommandColor(code) {
        return this._getFormatter().getCommandColor(code);
    }

    getCommandDisplay(cmd, page, index) {
        return this._getFormatter().getCommandInfo(cmd, page, index);
    }

    // ==========================================
    // PERSISTENCE & LISTENERS
    // ==========================================

    persistEvent() {
        if (this.currentEvent && this.currentEventId)
            this.databaseManager.updateCommonEvent(this.currentEventId, this.currentEvent);
    }

    attachMainListeners(container) {
        setTimeout(() => {
            const nameInput = document.getElementById('common-event-name-input');
            if (nameInput) {
                nameInput.addEventListener('change', (e) => {
                    this.currentEvent.name = e.target.value;
                    this.persistEvent();
                    // Update the sidebar list item if visible
                    const sel = document.querySelector('.database-list-item.selected span');
                    if (sel) sel.textContent = e.target.value;
                });
            }

            const triggerSelect = document.getElementById('common-event-trigger-select');
            if (triggerSelect) {
                triggerSelect.addEventListener('change', (e) => {
                    this.currentEvent.trigger = parseInt(e.target.value);
                    this.persistEvent();
                    // Show/hide switch field based on trigger
                    const switchLabel = document.getElementById('common-event-switch-label');
                    const switchInput = document.getElementById('common-event-switch-input');
                    if (switchLabel) switchLabel.style.display = this.currentEvent.trigger > 0 ? '' : 'none';
                    if (switchInput) switchInput.style.display = this.currentEvent.trigger > 0 ? '' : 'none';
                });
            }

            const switchInput = document.getElementById('common-event-switch-input');
            if (switchInput) {
                switchInput.addEventListener('change', (e) => {
                    this.currentEvent.switchId = parseInt(e.target.value) || 1;
                    this.persistEvent();
                });
            }
        }, 0);
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    createSmallButton(label, onclick) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = 'padding: 3px 10px; background-color: var(--color-bg-menubar); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 11px; transition: background-color 0.2s; white-space: nowrap;';
        btn.onmouseenter = () => { btn.style.backgroundColor = 'var(--color-accent-tint-25)'; };
        btn.onmouseleave = () => { btn.style.backgroundColor = 'var(--color-bg-menubar)'; };
        btn.onclick = onclick;
        return btn;
    }

    createButton(label, onclick) {
        const btn = document.createElement('button');
        btn.textContent = label;
        if (label === 'OK') {
            btn.style.cssText = 'padding: 8px 16px; background-color: var(--color-accent); color: var(--color-bg-deep); border: 1px solid var(--color-accent); border-radius: 4px; cursor: pointer; font-weight: bold;';
            btn.onmouseenter = () => { btn.style.backgroundColor = 'var(--color-accent-muted)'; };
            btn.onmouseleave = () => { btn.style.backgroundColor = 'var(--color-accent)'; };
        } else {
            btn.style.cssText = 'padding: 8px 16px; background-color: var(--color-bg-button); color: var(--color-text-strong); border: 1px solid var(--color-border-input); border-radius: 4px; cursor: pointer;';
            btn.onmouseenter = () => { btn.style.backgroundColor = 'var(--color-accent-tint-25)'; btn.style.borderColor = 'var(--color-accent)'; };
            btn.onmouseleave = () => { btn.style.backgroundColor = 'var(--color-bg-button)'; btn.style.borderColor = 'var(--color-border-input)'; };
        }
        btn.onclick = onclick;
        return btn;
    }

    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
