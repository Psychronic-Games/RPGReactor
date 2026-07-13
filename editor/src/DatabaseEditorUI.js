/**
 * DatabaseEditorUI.js
 * Handles all database editing UI functionality for RPG Reactor
 * Extracted from main.js for better code organization
 */

class DatabaseEditorUI {
    constructor(databaseManager, project, callbacks = {}) {
        this.databaseManager = databaseManager;
        this.currentProject = project;
        this.callbacks = callbacks;

        // Animation preview state
        this.animationPreviews = {};

        // Clipboard for list copy/cut/paste
        this.listClipboard = null;  // { type, entry }

        // Initialize modular editors
        this.commonUI = new DatabaseCommonUI(databaseManager, { getCurrentProject: () => this.currentProject });
        this.actorEditor = new DatabaseActorEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.classEditor = new DatabaseClassEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI);
        this.skillEditor = new DatabaseSkillEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.itemEditor = new DatabaseItemEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.weaponEditor = new DatabaseWeaponEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.armorEditor = new DatabaseArmorEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.enemyEditor = new DatabaseEnemyEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.stateEditor = new DatabaseStateEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.animationEditor = new DatabaseAnimationEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.troopEditor = new DatabaseTroopEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.tilesetEditor = new DatabaseTilesetEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.system1Editor = new DatabaseSystem1Editor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.system2Editor = new DatabaseSystem2Editor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.commonEventEditor = new DatabaseCommonEventEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);

        if (typeof window !== 'undefined') {
            window.addEventListener('rr-language-changed', () => {
                this.setupDatabaseNavigation();
                this.refreshDatabaseChrome();
            });
        }
    }

    _t(key, params = {}) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.t(key, params) : key;
    }

    _dbTitle(type, fallback = type) {
        return typeof window !== 'undefined' && window.I18n?.tDbType ? window.I18n.tDbType(type, fallback) : fallback;
    }

    _selectEntryMarkup() {
        return `<p style="color: var(--color-text-muted); text-align: center; margin-top: 100px;">${this._t('db.selectEntry')}</p>`;
    }

    refreshDatabaseChrome() {
        document.querySelectorAll('.database-nav-item').forEach(item => {
            item.textContent = this._dbTitle(item.dataset.type, item.dataset.fallbackName || item.textContent);
        });
        const titleEl = document.getElementById('database-viewer-title');
        const active = document.querySelector('.database-nav-item.active');
        if (titleEl && active) titleEl.textContent = this._dbTitle(active.dataset.type, titleEl.textContent);
        const searchInput = document.querySelector('.database-search-container input');
        if (searchInput && active) searchInput.placeholder = this._t('db.search', { title: this._dbTitle(active.dataset.type) });
        const addBtn = document.querySelector('.database-add-btn');
        if (addBtn) addBtn.textContent = this._t('common.new');
        const deleteBtn = document.querySelector('.database-delete-btn');
        if (deleteBtn) deleteBtn.textContent = this._t('common.delete');
        const changeMaxBtn = document.querySelector('.database-change-max-btn');
        if (changeMaxBtn) changeMaxBtn.textContent = this._t('db.changeMaximum');
    }

    /**
     * Update the current project reference
     */
    setCurrentProject(project) {
        this.currentProject = project;
    }

    /**
     * Update status message (calls back to main app)
     */
    updateStatus(message) {
        if (this.callbacks.updateStatus) {
            this.callbacks.updateStatus(message);
        }
    }

    cleanupDatabaseListChrome() {
        const listEl = document.getElementById('database-list');
        const parent = listEl?.parentNode;
        if (!parent) return;

        parent.querySelectorAll('.database-search-container, .database-button-bar, .database-change-max-btn').forEach(el => el.remove());

        if (this._listKeyHandler) {
            document.removeEventListener('keydown', this._listKeyHandler);
            this._listKeyHandler = null;
        }

        if (this.tilesetEditor?.cleanupListKeyHandler) {
            this.tilesetEditor.cleanupListKeyHandler();
        }
    }

    setActiveDatabaseNav(type) {
        document.querySelectorAll('.database-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.type === type);
        });
    }

    prepareDatabaseSection(type, title, options = {}) {
        const viewer = document.getElementById('database-viewer');
        const navEl = document.getElementById('database-navigation');
        const titleEl = document.getElementById('database-viewer-title');
        const listEl = document.getElementById('database-list');
        const listPanelEl = document.getElementById('database-list-panel');
        const detailEl = document.getElementById('database-detail');
        const showListPanel = options.showListPanel !== false;

        if (navEl && navEl.children.length === 0) {
            this.setupDatabaseNavigation();
        }

        this.cleanupDatabaseListChrome();
        this.setActiveDatabaseNav(type);

        if (titleEl) titleEl.textContent = title;
        if (listEl) listEl.innerHTML = '';
        if (detailEl) {
            detailEl.style.flex = showListPanel ? '' : '1';
            detailEl.innerHTML = '';
        }
        if (listPanelEl) {
            listPanelEl.style.display = showListPanel ? '' : 'none';
        }
        if (viewer) {
            viewer.classList.add('active');
        }

        this.takeDatabaseSnapshot();
        this.setupDatabaseControls();

        return { viewer, titleEl, listEl, listPanelEl, detailEl };
    }

    closeDatabaseViewer() {
        const viewer = document.getElementById('database-viewer');

        if (this.animationEditor && this.animationEditor._currentEffekseerStop) {
            this.animationEditor._currentEffekseerStop();
            this.animationEditor._currentEffekseerStop = null;
        }

        const tilesetEditorContainer = document.getElementById('tileset-editor-main-container');
        if (tilesetEditorContainer && tilesetEditorContainer.style.display !== 'none') {
            tilesetEditorContainer.style.display = 'none';
        }

        if (this._listKeyHandler) {
            document.removeEventListener('keydown', this._listKeyHandler);
            this._listKeyHandler = null;
        }

        if (this.tilesetEditor?.cleanupListKeyHandler) {
            this.tilesetEditor.cleanupListKeyHandler();
        }

        if (viewer) {
            viewer.classList.remove('active');
        }
    }

    revertDatabaseSnapshot() {
        if (this._dataSnapshot) {
            Object.assign(this.databaseManager.data, this._dataSnapshot);
            if (this.currentProject?.maps) {
                this.databaseManager.data.mapInfos = this.currentProject.maps;
            }
            this._dataSnapshot = null;
        }
    }

    takeDatabaseSnapshot() {
        this._dataSnapshot = JSON.parse(JSON.stringify(this.databaseManager.data));
    }

    setupDatabaseControls() {
        const closeBtn = document.getElementById('database-close-btn');
        const okBtn = document.getElementById('database-ok-btn');
        const cancelBtn = document.getElementById('database-cancel-btn');
        const applyBtn = document.getElementById('database-apply-btn');

        const cancelAndClose = () => {
            this.revertDatabaseSnapshot();
            this.closeDatabaseViewer();
        };

        if (closeBtn) closeBtn.onclick = cancelAndClose;
        if (cancelBtn) cancelBtn.onclick = cancelAndClose;

        if (okBtn) {
            okBtn.onclick = async () => {
                const projectPath = this.currentProject?.path;
                if (projectPath) {
                    const saved = await this.databaseManager.saveAllData(projectPath);
                    if (!saved) {
                        alert('One or more database files could not be saved.');
                        return;
                    }
                    this.updateStatus(this._t('db.saved'));
                }
                this._dataSnapshot = null;
                this.closeDatabaseViewer();
            };
        }

        if (applyBtn) {
            applyBtn.onclick = async () => {
                const projectPath = this.currentProject?.path;
                if (projectPath) {
                    const saved = await this.databaseManager.saveAllData(projectPath);
                    if (!saved) {
                        alert('One or more database files could not be saved.');
                        return;
                    }
                    this.updateStatus(this._t('db.saved'));
                    this._dataSnapshot = JSON.parse(JSON.stringify(this.databaseManager.data));
                    applyBtn.style.backgroundColor = 'var(--color-accent)';
                    applyBtn.style.color = 'var(--color-bg-deep)';
                    setTimeout(() => {
                        applyBtn.style.backgroundColor = '';
                        applyBtn.style.color = '';
                    }, 200);
                }
            };
        }
    }

    /**
     * Open database viewer for a specific type
     */
    openDatabase(type) {
        if (!this.currentProject) {
            alert(this._t('alert.loadProjectFirst'));
            return;
        }

        // Stop any playing animations when switching sections
        if (this.animationEditor && this.animationEditor._currentEffekseerStop) {
            this.animationEditor._currentEffekseerStop();
            this.animationEditor._currentEffekseerStop = null;
        }

        console.log('Opening database:', type);
        this.cleanupDatabaseListChrome();

        // Get data based on type
        let data, title;
        switch(type) {
            case 'actors':
                data = this.databaseManager.getActors();
                title = this._dbTitle(type, 'Actors');
                break;
            case 'classes':
                data = this.databaseManager.getClasses();
                title = this._dbTitle(type, 'Classes');
                break;
            case 'skills':
                data = this.databaseManager.getSkills();
                title = this._dbTitle(type, 'Skills');
                break;
            case 'items':
                data = this.databaseManager.getItems();
                title = this._dbTitle(type, 'Items');
                break;
            case 'weapons':
                data = this.databaseManager.getWeapons();
                title = this._dbTitle(type, 'Weapons');
                break;
            case 'armors':
                data = this.databaseManager.getArmors();
                title = this._dbTitle(type, 'Armors');
                break;
            case 'enemies':
                data = this.databaseManager.getEnemies();
                title = this._dbTitle(type, 'Enemies');
                break;
            case 'troops':
                data = this.databaseManager.getTroops();
                title = this._dbTitle(type, 'Troops');
                break;
            case 'states':
                data = this.databaseManager.getStates();
                title = this._dbTitle(type, 'States');
                break;
            case 'animations':
                data = this.databaseManager.getAnimations();
                title = this._dbTitle(type, 'Animations');
                break;
            case 'tilesets':
                // Tilesets use custom editor within modal
                this.tilesetEditor.showTilesetEditor();
                return;
            case 'commonEvents':
                data = this.databaseManager.getCommonEvents();
                title = this._dbTitle(type, 'Common Events');
                break;
            case 'system':
                this.openDatabase('system1');
                return;
            case 'system1': {
                // Show System 1 editor
                const { detailEl } = this.prepareDatabaseSection('system1', this._dbTitle('system1', 'System 1'), { showListPanel: false });

                this.system1Editor.showSystem1Detail(detailEl);
                return;
            }
            case 'system2': {
                // Show System 2 editor
                const { detailEl } = this.prepareDatabaseSection('system2', this._dbTitle('system2', 'System 2'), { showListPanel: false });

                this.system2Editor.showSystem2Detail(detailEl);
                return;
            }
            case 'types': {
                this.prepareDatabaseSection('types', this._dbTitle('types', 'Types'));
                // Types editor uses System.json - delegate to callback
                if (this.callbacks.showTypesEditor) {
                    this.callbacks.showTypesEditor();
                }
                return;
            }
            case 'terms': {
                this.prepareDatabaseSection('terms', this._dbTitle('terms', 'Terms'));
                // Terms editor uses System.json - delegate to callback
                if (this.callbacks.showTermsEditor) {
                    this.callbacks.showTermsEditor();
                }
                return;
            }
            default:
                alert(this._t('db.unknownType', { type }));
                return;
        }

        // Show database viewer
        this.showDatabaseViewer(title, data, type);
    }

    /**
     * Show the main database viewer with list and detail panels
     */
    showDatabaseViewer(title, data, type) {
        const viewer = document.getElementById('database-viewer');
        const navEl = document.getElementById('database-navigation');
        const titleEl = document.getElementById('database-viewer-title');
        const listEl = document.getElementById('database-list');
        const detailEl = document.getElementById('database-detail');

        // Set up navigation if not already done
        if (navEl && navEl.children.length === 0) {
            this.setupDatabaseNavigation();
        }

        // Update active nav item
        if (navEl) {
            document.querySelectorAll('.database-nav-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.type === type) {
                    item.classList.add('active');
                }
            });
        }

        const listPanelEl = document.getElementById('database-list-panel');

        titleEl.textContent = title;
        listEl.innerHTML = '';
        detailEl.style.flex = ''; // Reset detail flex
        if (listPanelEl) {
            listPanelEl.style.display = ''; // Reset list panel display
        }
        detailEl.innerHTML = this._selectEntryMarkup();

        // Remove any existing button bar and search container first
        const existingButtonBar = listEl.parentNode.querySelector('.database-button-bar');
        if (existingButtonBar) {
            existingButtonBar.remove();
        }
        const existingSearch = listEl.parentNode.querySelector('.database-search-container');
        if (existingSearch) {
            existingSearch.remove();
        }

        // Add search bar before populating list
        const searchContainer = document.createElement('div');
        searchContainer.className = 'database-search-container';
        searchContainer.style.cssText = 'padding: 8px; background-color: var(--color-bg-menubar); border-bottom: 1px solid var(--color-border); flex-shrink: 0;';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = this._t('db.search', { title });
        searchInput.style.cssText = `
            width: 100%;
            padding: 6px 10px;
            background-color: var(--color-bg-panel);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            color: var(--color-text);
            font-size: 12px;
            box-sizing: border-box;
        `;

        // Add focus/blur listeners for yellow-gold border
        searchInput.addEventListener('focus', () => {
            searchInput.style.borderColor = 'var(--color-accent-border-strong)';
            searchInput.style.outline = 'none';
        });
        searchInput.addEventListener('blur', () => {
            searchInput.style.borderColor = 'var(--color-border-input)';
        });

        searchContainer.appendChild(searchInput);

        // Insert search bar before the list
        listEl.parentNode.insertBefore(searchContainer, listEl);

        // Function to populate list with optional filter
        const populateList = (filterText = '') => {
            listEl.innerHTML = '';
            const filteredData = filterText
                ? data.filter(entry => {
                    const name = (entry.name || this._t('common.unnamed')).toLowerCase();
                    const id = String(entry.id || '');
                    return name.includes(filterText.toLowerCase()) || id.includes(filterText);
                })
                : data;

            filteredData.forEach((entry) => {
                const item = document.createElement('div');
                item.className = 'database-list-item';
                item.dataset.entryId = String(entry.id || '');
                item.dataset.entryName = entry.name || this._t('common.unnamed');

                const nameSpan = document.createElement('span');
                nameSpan.className = 'database-list-name';
                nameSpan.textContent = entry.name || this._t('common.unnamed');

                const idSpan = document.createElement('span');
                idSpan.className = 'database-list-id';
                idSpan.textContent = `#${entry.id || '?'}`;

                if (this.listIconTypes.includes(type)) {
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'database-list-icon';
                    this.applyListIcon(iconSpan, entry, type);
                    item.appendChild(iconSpan);
                    nameSpan.style.flex = '1';
                    nameSpan.style.minWidth = '0';
                    nameSpan.style.overflow = 'hidden';
                    nameSpan.style.textOverflow = 'ellipsis';
                    nameSpan.style.whiteSpace = 'nowrap';
                }

                item.appendChild(nameSpan);
                item.appendChild(idSpan);

                item.addEventListener('click', () => {
                    // Remove selection from all items
                    document.querySelectorAll('.database-list-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');

                    // Show detail
                    this.showDatabaseDetail(entry, type);
                });

                // Right-click context menu
                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    // Select this item
                    document.querySelectorAll('.database-list-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    this.showDatabaseDetail(entry, type);

                    this.showListContextMenu(e.clientX, e.clientY, entry, data, type, populateList, searchInput, detailEl);
                });

                listEl.appendChild(item);
            });
        };

        // Add/Delete button bar
        const buttonBar = document.createElement('div');
        buttonBar.className = 'database-button-bar';
        buttonBar.style.cssText = 'display: flex; gap: 4px; padding: 6px 8px; background-color: var(--color-bg-menubar); border-bottom: 1px solid var(--color-border); flex-shrink: 0;';

        const addBtn = document.createElement('button');
        addBtn.className = 'database-add-btn';
        addBtn.textContent = this._t('common.new');
        addBtn.style.cssText = 'flex: 1; padding: 4px 8px; background-color: var(--color-bg-panel); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 11px; transition: background-color 0.2s;';
        addBtn.onmouseenter = () => { addBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; };
        addBtn.onmouseleave = () => { addBtn.style.backgroundColor = 'var(--color-bg-panel)'; };
        addBtn.onclick = () => {
            snapshotForUndo();
            const newEntry = this.addDatabaseEntry(type);
            if (newEntry) {
                data.push(newEntry);
                populateList(searchInput.value);
            }
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'database-delete-btn';
        deleteBtn.textContent = this._t('common.delete');
        deleteBtn.style.cssText = 'flex: 1; padding: 4px 8px; background-color: var(--color-bg-panel); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 11px; transition: background-color 0.2s;';
        deleteBtn.onmouseenter = () => { deleteBtn.style.backgroundColor = 'rgba(255, 80, 80, 0.25)'; };
        deleteBtn.onmouseleave = () => { deleteBtn.style.backgroundColor = 'var(--color-bg-panel)'; };
        deleteBtn.onclick = () => {
            const selectedItem = listEl.querySelector('.database-list-item.selected');
            if (!selectedItem) { alert(this._t('db.selectEntryToDelete')); return; }
            const entryName = selectedItem.dataset.entryName || 'this entry';
            if (!confirm(this._t('db.deleteConfirm', { name: entryName }))) return;

            const idText = selectedItem.querySelector('.database-list-id')?.textContent;
            const entryId = idText ? parseInt(idText.replace('#', '')) : null;
            if (entryId !== null) {
                snapshotForUndo();
                this.deleteDatabaseEntry(type, entryId);
                const idx = data.findIndex(d => d && d.id === entryId);
                if (idx >= 0) data.splice(idx, 1);
                populateList(searchInput.value);
                detailEl.innerHTML = this._selectEntryMarkup();
            }
        };

        buttonBar.appendChild(addBtn);
        buttonBar.appendChild(deleteBtn);
        listEl.parentNode.insertBefore(buttonBar, searchContainer);

        // "Change Maximum" button at bottom of list panel
        const changeMaxBtn = document.createElement('button');
        changeMaxBtn.textContent = this._t('db.changeMaximum');
        changeMaxBtn.style.cssText = 'width: 100%; padding: 6px 8px; background-color: var(--color-bg-panel); color: var(--color-text); border: 1px solid var(--color-border-input); border-top: none; cursor: pointer; font-size: 11px; transition: background-color 0.2s; flex-shrink: 0;';
        changeMaxBtn.onmouseenter = () => { changeMaxBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; };
        changeMaxBtn.onmouseleave = () => { changeMaxBtn.style.backgroundColor = 'var(--color-bg-panel)'; };
        changeMaxBtn.onclick = () => {
            const currentMax = this.databaseManager.getMaxEntries(type);
            this.showChangeMaximumModal(title, type, currentMax, (newMax) => {
                const templates = this.getDefaultTemplates();
                const template = templates[type];
                if (!template) return;

                this.databaseManager.changeMaximum(type, newMax, template);

                // Refresh the list
                const freshData = this.databaseManager.data[type].filter(e => e !== null);
                data.length = 0;
                freshData.forEach(e => data.push(e));
                populateList(searchInput.value);
                detailEl.innerHTML = this._selectEntryMarkup();
                this.updateStatus(this._t('db.maximumChanged', { title, max: newMax }));
            });
        };

        // Remove any existing change max button
        const existingMaxBtn = listEl.parentNode.querySelector('.database-change-max-btn');
        if (existingMaxBtn) existingMaxBtn.remove();
        changeMaxBtn.className = 'database-change-max-btn';
        listEl.parentNode.appendChild(changeMaxBtn);

        // Populate initial list
        populateList();

        // Add search input listener
        searchInput.addEventListener('input', (e) => {
            populateList(e.target.value);
        });

        // Undo stack for this viewer session
        const undoStack = [];
        const snapshotForUndo = () => {
            undoStack.push(JSON.parse(JSON.stringify(this.databaseManager.data[type])));
        };
        const performUndo = () => {
            if (undoStack.length === 0) return;
            this.databaseManager.data[type] = undoStack.pop();
            data.length = 0;
            this.databaseManager.data[type].forEach(e => { if (e) data.push(e); });
            populateList(searchInput.value);
            detailEl.innerHTML = this._selectEntryMarkup();
            this.updateStatus('Undo');
        };
        // Store snapshot function so operation methods can call it
        this._snapshotForUndo = snapshotForUndo;

        // Remove previous keyboard handler if navigating between categories
        if (this._listKeyHandler) {
            document.removeEventListener('keydown', this._listKeyHandler);
        }

        // Keyboard shortcuts for list operations
        const getSelectedEntry = () => {
            const selectedItem = listEl.querySelector('.database-list-item.selected');
            if (!selectedItem) return null;
            const idText = selectedItem.querySelector('.database-list-id')?.textContent;
            const entryId = idText ? parseInt(idText.replace('#', '')) : null;
            return entryId !== null ? data.find(d => d && d.id === entryId) : null;
        };

        const listKeyHandler = (e) => {
            // Only when database viewer is active and not typing in an input
            if (!viewer.classList.contains('active')) return;
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            // Delete key (no modifier needed)
            if (e.key === 'Delete') {
                const entry = getSelectedEntry();
                if (!entry) return;
                e.preventDefault();
                snapshotForUndo();
                const template = this.getDefaultTemplates()[type];
                if (template) {
                    const blank = { ...JSON.parse(JSON.stringify(template)), id: entry.id, name: '' };
                    this.databaseManager.data[type][entry.id] = blank;
                    const idx = data.findIndex(d => d && d.id === entry.id);
                    if (idx >= 0) data[idx] = blank;
                }
                populateList(searchInput.value);
                detailEl.innerHTML = this._selectEntryMarkup();
                this.updateStatus(this._t('db.entryCleared'));
                return;
            }

            if (!e.ctrlKey && !e.metaKey) return;

            if (e.key === 'z') {
                e.preventDefault();
                performUndo();
            } else if (e.key === 'c') {
                const entry = getSelectedEntry();
                if (!entry) return;
                e.preventDefault();
                this.copyListEntry(entry, type);
            } else if (e.key === 'x') {
                const entry = getSelectedEntry();
                if (!entry) return;
                e.preventDefault();
                this.cutListEntry(entry, data, type, populateList, searchInput, detailEl);
            } else if (e.key === 'v') {
                const entry = getSelectedEntry();
                if (!entry || !this.listClipboard || this.listClipboard.type !== type) return;
                e.preventDefault();
                this.pasteListEntry(entry, data, type, populateList, searchInput, detailEl);
            } else if (e.key === 'd') {
                const entry = getSelectedEntry();
                if (!entry) return;
                e.preventDefault();
                this.duplicateListEntry(entry, data, type, populateList, searchInput);
            }
        };
        this._listKeyHandler = listKeyHandler;
        document.addEventListener('keydown', listKeyHandler);

        // Show viewer
        viewer.classList.add('active');

        // Take snapshot of database data for Cancel/revert
        this.takeDatabaseSnapshot();
        this.setupDatabaseControls();
    }

    /**
     * Show context menu for database list items
     */
    showListContextMenu(x, y, entry, data, type, populateList, searchInput, detailEl) {
        const existing = document.getElementById('database-list-context-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'database-list-context-menu';
        menu.style.cssText = `
            position: fixed; left: ${x}px; top: ${y}px; background-color: var(--color-bg-list-item);
            border: 1px solid var(--color-border); border-radius: 4px; padding: 4px; z-index: 10004;
            min-width: 160px; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        `;

        const canPaste = this.listClipboard && this.listClipboard.type === type;

        const items = [
            { label: this._t('common.copy'), action: () => this.copyListEntry(entry, type), enabled: true },
            { label: this._t('common.cut'), action: () => this.cutListEntry(entry, data, type, populateList, searchInput, detailEl), enabled: true },
            { label: this._t('common.paste'), action: () => this.pasteListEntry(entry, data, type, populateList, searchInput, detailEl), enabled: canPaste },
            { label: this._t('common.duplicate'), action: () => this.duplicateListEntry(entry, data, type, populateList, searchInput), enabled: true },
        ];

        items.forEach(item => {
            const mi = document.createElement('div');
            mi.textContent = item.label;
            mi.style.cssText = `padding: 5px 12px; cursor: ${item.enabled ? 'pointer' : 'not-allowed'}; color: ${item.enabled ? 'var(--color-text)' : 'var(--color-text-dim)'}; font-size: 12px; border-radius: 2px;`;
            if (item.enabled) {
                mi.onmouseenter = () => { mi.style.backgroundColor = 'var(--color-accent-tint-25)'; };
                mi.onmouseleave = () => { mi.style.backgroundColor = ''; };
                mi.onclick = () => { item.action(); menu.remove(); };
            }
            menu.appendChild(mi);
        });

        document.body.appendChild(menu);

        // Keep menu in viewport
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';

        const closeMenu = (e) => {
            if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', closeMenu); }
        };
        setTimeout(() => document.addEventListener('mousedown', closeMenu), 50);
    }

    copyListEntry(entry, type) {
        const copied = JSON.parse(JSON.stringify(entry));
        delete copied.id;
        this.listClipboard = { type, entry: copied };
        this.updateStatus(this._t('db.entryCopied'));
    }

    cutListEntry(entry, data, type, populateList, searchInput, detailEl) {
        if (this._snapshotForUndo) this._snapshotForUndo();

        // Copy data to clipboard (without name change)
        const copied = JSON.parse(JSON.stringify(entry));
        delete copied.id;
        this.listClipboard = { type, entry: copied };

        // Replace source slot with blank template, keeping the ID
        const template = this.getDefaultTemplates()[type];
        if (template) {
            const blank = { ...JSON.parse(JSON.stringify(template)), id: entry.id, name: '' };
            this.databaseManager.data[type][entry.id] = blank;

            const idx = data.findIndex(d => d && d.id === entry.id);
            if (idx >= 0) data[idx] = blank;
        }

        populateList(searchInput.value);
        detailEl.innerHTML = this._selectEntryMarkup();
        this.updateStatus(this._t('db.entryCut'));
    }

    pasteListEntry(targetEntry, data, type, populateList, searchInput, detailEl) {
        if (!this.listClipboard || this.listClipboard.type !== type) return;
        if (!targetEntry) return;
        if (this._snapshotForUndo) this._snapshotForUndo();

        // Overwrite target slot with clipboard data, keeping the target's ID
        const pasted = JSON.parse(JSON.stringify(this.listClipboard.entry));
        pasted.id = targetEntry.id;

        this.databaseManager.data[type][targetEntry.id] = pasted;

        const idx = data.findIndex(d => d && d.id === targetEntry.id);
        if (idx >= 0) data[idx] = pasted;

        populateList(searchInput.value);
        this.showDatabaseDetail(pasted, type);
        this.updateStatus(this._t('db.entryPasted'));
    }

    duplicateListEntry(entry, data, type, populateList, searchInput) {
        if (this._snapshotForUndo) this._snapshotForUndo();
        const cloned = JSON.parse(JSON.stringify(entry));
        delete cloned.id;
        cloned.name = (cloned.name || this._t('common.unnamed')) + ` (${this._t('common.copy')})`;
        const newEntry = this.databaseManager.addEntry(type, cloned);
        if (newEntry) {
            data.push(newEntry);
            populateList(searchInput.value);
            this.updateStatus(this._t('db.entryDuplicated'));
        }
    }

    /**
     * Setup the database navigation sidebar
     */
    setupDatabaseNavigation() {
        const navEl = document.getElementById('database-navigation');
        if (!navEl) return;

        navEl.innerHTML = '';

        const categories = [
            { name: 'Actors', type: 'actors' },
            { name: 'Classes', type: 'classes' },
            { name: 'Skills', type: 'skills' },
            { name: 'Items', type: 'items' },
            { name: 'Weapons', type: 'weapons' },
            { name: 'Armors', type: 'armors' },
            { name: 'Enemies', type: 'enemies' },
            { name: 'Troops', type: 'troops' },
            { name: 'States', type: 'states' },
            { name: 'Animations', type: 'animations' },
            { name: 'Tilesets', type: 'tilesets' },
            { name: 'Common Events', type: 'commonEvents' },
            { name: 'System 1', type: 'system1' },
            { name: 'System 2', type: 'system2' },
            { name: 'Types', type: 'types' },
            { name: 'Terms', type: 'terms' }
        ];

        categories.forEach(category => {
            const item = document.createElement('div');
            item.className = 'database-nav-item';
            item.textContent = this._dbTitle(category.type, category.name);
            item.dataset.type = category.type;
            item.dataset.fallbackName = category.name;

            item.addEventListener('click', () => {
                this.openDatabase(category.type);
            });

            navEl.appendChild(item);
        });
    }

    /**
     * Show detail view for a specific database entry
     */
    showDatabaseDetail(entry, type) {
        const detailEl = document.getElementById('database-detail');
        detailEl.innerHTML = '';

        // Delegate to modular editors
        if (type === 'actors') {
            this.actorEditor.showActorDetail(detailEl, entry);
        } else if (type === 'classes') {
            this.classEditor.showClassDetail(detailEl, entry);
        } else if (type === 'skills') {
            this.skillEditor.showSkillDetail(detailEl, entry);
        } else if (type === 'items') {
            this.itemEditor.showItemDetail(detailEl, entry);
        } else if (type === 'weapons') {
            this.weaponEditor.showWeaponDetail(detailEl, entry);
        } else if (type === 'armors') {
            this.armorEditor.showArmorDetail(detailEl, entry);
        } else if (type === 'enemies') {
            this.enemyEditor.showEnemyDetail(detailEl, entry);
        } else if (type === 'troops') {
            this.troopEditor.showTroopDetail(detailEl, entry);
        } else if (type === 'states') {
            this.stateEditor.showStateDetail(detailEl, entry);
        } else if (type === 'tilesets') {
            this.tilesetEditor.showTilesetDetail(detailEl, entry);
        } else if (type === 'animations') {
            this.animationEditor.showAnimationDetail(detailEl, entry);
        } else if (type === 'commonEvents') {
            this.commonEventEditor.showCommonEventDetail(detailEl, entry);
        } else {
            // Generic display for other types
            this.showGenericDetail(detailEl, entry, type);
        }
        this.wireLiveDatabaseNameSync(detailEl, entry);
        if (window.I18n) window.I18n.applyText(detailEl);
    }

    get listIconTypes() {
        return ['skills', 'items', 'weapons', 'armors', 'states', 'actors', 'enemies'];
    }

    /**
     * Paint an entry's mini icon into a .database-list-icon span:
     * IconSet cell for icon-bearing entries, face crop for actors.
     */
    applyListIcon(span, entry, type) {
        span.style.backgroundImage = 'none';
        span.style.imageRendering = '';
        span.classList.remove('has-icon');
        // Works on desktop NW.js and in the browser editor: the browser
        // host shims require('fs'/'path') over the virtual project. CSS
        // background-image is NOT rewritten by the host's file:// bridge
        // (only src/fetch/XHR are), so URLs are resolved explicitly here.
        const isWeb = !!window.RPGReactorHost;
        if ((typeof nw === 'undefined' && !isWeb) || !this.currentProject) return;
        const path = require('path');
        const imageUrl = p => isWeb && window.RPGReactorAssetUrl
            ? window.RPGReactorAssetUrl(p)
            : encodeURI('file://' + p);
        const SIZE = 20;
        if (type === 'actors') {
            if (!entry.faceName) return;
            const facePath = path.join(this.currentProject.path, 'img', 'faces', entry.faceName + '.png');
            const idx = entry.faceIndex || 0;
            span.style.backgroundImage = `url("${imageUrl(facePath)}")`;
            span.style.backgroundSize = `${4 * SIZE}px ${2 * SIZE}px`;
            span.style.backgroundPosition = `-${(idx % 4) * SIZE}px -${Math.floor(idx / 4) * SIZE}px`;
            span.classList.add('has-icon');
            return;
        }
        if (type === 'enemies') {
            if (!entry.battlerName) return;
            const fs = require('fs');
            let battlerDir = null;
            for (const dir of ['enemies', 'sv_enemies', 'characters']) {
                if (fs.existsSync(path.join(this.currentProject.path, 'img', dir, entry.battlerName + '.png'))) {
                    battlerDir = dir;
                    break;
                }
            }
            if (!battlerDir) return;
            span.style.imageRendering = 'auto';
            const battlerPath = path.join(this.currentProject.path, 'img', battlerDir, entry.battlerName + '.png');
            const url = `url("${imageUrl(battlerPath)}")`;
            if (battlerDir === 'characters') {
                // Charset-style battler: crop the front-facing idle frame
                const isSingle = /^[!$]*\$/.test(entry.battlerName);
                const img = new Image();
                img.onload = () => {
                    const cols = isSingle ? 3 : 12;
                    const rows = isSingle ? 4 : 8;
                    const fw = img.width / cols;
                    const fh = img.height / rows;
                    const scale = SIZE / Math.max(fw, fh);
                    span.style.backgroundImage = url;
                    span.style.backgroundSize = `${img.width * scale}px ${img.height * scale}px`;
                    span.style.backgroundPosition =
                        `${-(1 * fw * scale) + (SIZE - fw * scale) / 2}px ${(SIZE - fh * scale) / 2}px`;
                    span.classList.add('has-icon');
                };
                img.src = imageUrl(battlerPath);
            } else {
                // Singular battler image: shrink the whole thing into the cell
                span.style.backgroundImage = url;
                span.style.backgroundSize = 'contain';
                span.style.backgroundPosition = 'center';
                span.classList.add('has-icon');
            }
            return;
        }
        const idx = entry.iconIndex || 0;
        if (idx <= 0) return;
        const iconSetPath = path.join(this.currentProject.path, 'img', 'system', 'IconSet.png');
        span.style.backgroundImage = `url("${imageUrl(iconSetPath)}")`;
        span.style.backgroundSize = `${16 * SIZE}px auto`;
        span.style.backgroundPosition = `-${(idx % 16) * SIZE}px -${Math.floor(idx / 16) * SIZE}px`;
        span.classList.add('has-icon');
    }

    refreshListIcon(entry, type) {
        const listEl = document.getElementById('database-list');
        const item = Array.from(listEl?.querySelectorAll('.database-list-item') || [])
            .find(el => el.dataset.entryId === String(entry.id || ''));
        const iconSpan = item?.querySelector('.database-list-icon');
        if (iconSpan) this.applyListIcon(iconSpan, entry, type);
    }

    wireLiveDatabaseNameSync(detailEl, entry) {
        const nameField = detailEl.querySelector('[data-field="name"]');
        if (!nameField || !entry) return;

        const syncName = () => {
            entry.name = nameField.value || '';
            const listEl = document.getElementById('database-list');
            const item = Array.from(listEl?.querySelectorAll('.database-list-item') || [])
                .find(el => el.dataset.entryId === String(entry.id || ''));
            if (!item) return;
            const displayName = entry.name || this._t('common.unnamed');
            item.dataset.entryName = displayName;
            const nameSpan = item.querySelector('.database-list-name');
            if (nameSpan) nameSpan.textContent = displayName;
        };

        nameField.addEventListener('input', syncName);
        nameField.addEventListener('change', syncName);
    }

    /**
     * Get default entry templates for each database type
     */
    getDefaultTemplates() {
        return {
            actors: { name: 'New Actor', nickname: '', classId: 1, initialLevel: 1, maxLevel: 99, profile: '', characterName: '', characterIndex: 0, faceName: '', faceIndex: 0, battlerName: '', equips: [0,0,0,0,0], traits: [], note: '' },
            classes: { name: 'New Class', expParams: [30,20,30,30], params: [[1],[1],[1],[1],[1],[1],[1],[1]], learnings: [], traits: [], note: '' },
            skills: { name: 'New Skill', iconIndex: 0, description: '', stypeId: 1, scope: 1, occasion: 1, mpCost: 0, tpCost: 0, tpGain: 0, hitType: 0, animationId: 0, speed: 0, successRate: 100, repeats: 1, message1: '', message2: '', message3: '', message4: '', damage: { type: 0, elementId: -1, formula: '0', variance: 20, critical: false }, effects: [], note: '' },
            items: { name: 'New Item', iconIndex: 0, description: '', itypeId: 1, price: 0, consumable: true, scope: 0, occasion: 0, speed: 0, successRate: 100, repeats: 1, hitType: 0, animationId: 0, damage: { type: 0, elementId: -1, formula: '0', variance: 20, critical: false }, effects: [], note: '' },
            weapons: { name: 'New Weapon', iconIndex: 0, description: '', wtypeId: 1, price: 0, params: [0,0,0,0,0,0,0,0], traits: [], animationId: 0, note: '' },
            armors: { name: 'New Armor', iconIndex: 0, description: '', atypeId: 1, etypeId: 2, price: 0, params: [0,0,0,0,0,0,0,0], traits: [], note: '' },
            enemies: { name: 'New Enemy', battlerName: '', battlerHue: 0, params: [100,0,10,10,10,10,10,10], exp: 0, gold: 0, dropItems: [{kind:0,dataId:1,denominator:1},{kind:0,dataId:1,denominator:1},{kind:0,dataId:1,denominator:1}], actions: [{skillId:1,conditionType:0,conditionParam1:0,conditionParam2:0,rating:5}], traits: [], note: '' },
            troops: { name: 'New Troop', members: [], pages: [], note: '' },
            states: { name: 'New State', iconIndex: 0, restriction: 0, priority: 50, removeAtBattleEnd: false, removeByRestriction: false, autoRemovalTiming: 0, minTurns: 1, maxTurns: 1, removeByDamage: false, chanceByDamage: 100, removeByWalking: false, stepsToRemove: 100, traits: [], note: '', message1: '', message2: '', message3: '', message4: '' },
            animations: { name: 'New Animation', flashTimings: [], soundTimings: [], effectName: '', offsetX: 0, offsetY: 0, rotation: { x: 0, y: 0, z: 0 }, scale: 100, speed: 100 },
            tilesets: { name: 'New Tileset', mode: 0, tilesetNames: ['', '', '', '', '', '', '', '', ''], flags: new Array(8192).fill(0), note: '' },
            commonEvents: { name: 'New Common Event', trigger: 0, switchId: 1, list: [{code:0,indent:0,parameters:[]}] }
        };
    }

    /**
     * Add a new database entry with appropriate default template
     */
    addDatabaseEntry(type) {
        const template = this.getDefaultTemplates()[type];
        if (!template) return null;
        return this.databaseManager.addEntry(type, { ...template });
    }

    /**
     * Delete a database entry
     */
    deleteDatabaseEntry(type, id) {
        this.databaseManager.deleteEntry(type, id);
    }

    /**
     * Show generic detail for database types without specialized editors
     */
    showGenericDetail(container, entry, type) {
        const wrapper = document.createElement('div');
        wrapper.style.padding = '16px';

        wrapper.innerHTML = `
            <h3>${entry.name || 'Entry #' + entry.id}</h3>
            <pre style="background: var(--color-bg-surface); padding: 16px; border-radius: 4px; overflow: auto; max-height: 600px;">${JSON.stringify(entry, null, 2)}</pre>
        `;

        container.appendChild(wrapper);
    }

    /**
     * Get human-readable trait name from trait code
     */
    getTraitName(traitCode) {
        // Trait codes from RPG Maker MZ
        const traitNames = {
            11: 'Element Rate', 12: 'Debuff Rate', 13: 'State Rate', 14: 'State Resist',
            21: 'Parameter', 22: 'Ex-Parameter', 23: 'Sp-Parameter',
            31: 'Attack Element', 32: 'Attack State', 33: 'Attack Speed', 34: 'Attack Times+',
            41: 'Add Skill Type', 42: 'Seal Skill Type', 43: 'Add Skill', 44: 'Seal Skill',
            51: 'Equip Weapon', 52: 'Equip Armor', 53: 'Lock Equip', 54: 'Seal Equip', 55: 'Slot Type',
            61: 'Action Times+', 62: 'Special Flag', 63: 'Collapse Effect', 64: 'Party Ability'
        };
        return traitNames[traitCode] || `Trait ${traitCode}`;
    }

    /**
     * Get equipment slots for an actor (RPG Maker MZ compatible)
     */
    getActorEquipSlots(actor) {
        const system = this.databaseManager.getSystem();
        if (!system || !system.equipTypes) {
            return [1, 2, 3, 4, 5]; // Default slots
        }

        // Build slots array from equipTypes (skip index 0 which is empty)
        const slots = [];
        for (let i = 1; i < system.equipTypes.length; i++) {
            slots.push(i);
        }

        // Check for dual-wield trait (trait code 55, dataId 1)
        if (slots.length >= 2 && this.isDualWield(actor)) {
            slots[1] = 1; // Change second slot from Shield to Weapon
        }

        return slots;
    }

    /**
     * Check if actor has dual-wield trait
     */
    isDualWield(actor) {
        // Check actor's own traits
        if (actor.traits) {
            for (const trait of actor.traits) {
                if (trait.code === 55 && trait.dataId === 1) {
                    return true;
                }
            }
        }

        // Check class traits
        const actorClass = this.databaseManager.getClass(actor.classId);
        if (actorClass && actorClass.traits) {
            for (const trait of actorClass.traits) {
                if (trait.code === 55 && trait.dataId === 1) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Get formatted trait value based on trait type
     */
    getTraitValue(trait) {
        // Format trait value based on type
        if (trait.code === 21) { // Parameter
            const params = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
            const change = Math.round((trait.value - 1) * 100);
            return `${params[trait.dataId] || 'Param'} ${change >= 0 ? '+' : ''}${change}%`;
        } else if (trait.code === 22) { // Ex-Parameter
            const exParams = ['Hit Rate', 'Evasion', 'Critical Rate', 'Critical Evade', 'Magic Evade', 'Magic Reflect', 'Counter', 'HP Regen', 'MP Regen', 'TP Regen'];
            return `${exParams[trait.dataId] || 'ExParam'} +${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 23) { // Sp-Parameter
            const spParams = ['Target Rate', 'Guard Rate', 'Recovery Rate', 'Pharmacology', 'MP Cost Rate', 'TP Charge Rate', 'Physical Damage', 'Magical Damage', 'Floor Damage', 'Experience'];
            return `${spParams[trait.dataId] || 'SpParam'} ${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 11) { // Element Rate
            const elements = this.databaseManager.getSystem()?.elements || [];
            const elementName = elements[trait.dataId] || `Element ${trait.dataId}`;
            return `${elementName} ${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 12) { // Debuff Rate
            const params = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'];
            return `${params[trait.dataId] || 'Param'} Debuff ${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 13) { // State Rate
            const state = this.databaseManager.getState(trait.dataId);
            const stateName = state ? state.name : `State ${trait.dataId}`;
            return `${stateName} ${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 14) { // State Resist
            const state = this.databaseManager.getState(trait.dataId);
            const stateName = state ? state.name : `State ${trait.dataId}`;
            return `Resist ${stateName}`;
        } else if (trait.code === 31) { // Attack Element
            const elements = this.databaseManager.getSystem()?.elements || [];
            const elementName = elements[trait.dataId] || `Element ${trait.dataId}`;
            return `Attack Element: ${elementName}`;
        } else if (trait.code === 32) { // Attack State
            const state = this.databaseManager.getState(trait.dataId);
            const stateName = state ? state.name : `State ${trait.dataId}`;
            return `${stateName} ${Math.round(trait.value * 100)}% chance`;
        } else if (trait.code === 33) { // Attack Speed
            return `Attack Speed ${trait.value >= 0 ? '+' : ''}${trait.value}`;
        } else if (trait.code === 34) { // Attack Times
            return `Attack Times +${trait.value}`;
        } else if (trait.code === 41 || trait.code === 42) { // Skill Type Add/Seal
            const skillTypes = this.databaseManager.getSystem()?.skillTypes || [];
            const skillTypeName = skillTypes[trait.dataId] || `Skill Type ${trait.dataId}`;
            return trait.code === 41 ? `Add ${skillTypeName}` : `Seal ${skillTypeName}`;
        } else if (trait.code === 43 || trait.code === 44) { // Skill Add/Seal
            const skill = this.databaseManager.getSkill(trait.dataId);
            const skillName = skill ? skill.name : `Skill ${trait.dataId}`;
            return trait.code === 43 ? `Add ${skillName}` : `Seal ${skillName}`;
        } else if (trait.code === 51 || trait.code === 52) { // Weapon/Armor Type Equip
            if (trait.code === 51) {
                const weaponTypes = this.databaseManager.getSystem()?.weaponTypes || [];
                const weaponTypeName = weaponTypes[trait.dataId] || `Weapon Type ${trait.dataId}`;
                return `Equip ${weaponTypeName}`;
            } else {
                const armorTypes = this.databaseManager.getSystem()?.armorTypes || [];
                const armorTypeName = armorTypes[trait.dataId] || `Armor Type ${trait.dataId}`;
                return `Equip ${armorTypeName}`;
            }
        } else if (trait.code === 53) { // Lock Equip
            const equipTypes = this.databaseManager.getSystem()?.equipTypes || [];
            const equipTypeName = equipTypes[trait.dataId] || `Equip ${trait.dataId}`;
            return `Lock ${equipTypeName}`;
        } else if (trait.code === 54) { // Seal Equip
            const equipTypes = this.databaseManager.getSystem()?.equipTypes || [];
            const equipTypeName = equipTypes[trait.dataId] || `Equip ${trait.dataId}`;
            return `Seal ${equipTypeName}`;
        } else if (trait.code === 55) { // Slot Type
            return trait.dataId === 0 ? 'Normal Slot' : 'Dual Wield';
        } else if (trait.code === 61) { // Action Times
            return `Action Times +${Math.round(trait.value * 100)}%`;
        } else if (trait.code === 62) { // Special Flag
            const flags = ['Auto Battle', 'Guard', 'Substitute', 'Preserve TP'];
            return flags[trait.dataId] || `Special Flag ${trait.dataId}`;
        } else if (trait.code === 63) { // Collapse Effect
            const effects = ['Boss Collapse', 'Instant Collapse', 'No Disappear'];
            return effects[trait.dataId] || `Collapse ${trait.dataId}`;
        } else if (trait.code === 64) { // Party Ability
            const abilities = ['Encounter Half', 'Encounter None', 'Cancel Surprise', 'Raise Preemptive', 'Gold Double', 'Drop Item Double'];
            return abilities[trait.dataId] || `Party Ability ${trait.dataId}`;
        } else {
            return `Data ${trait.dataId}, Value ${trait.value}`;
        }
    }

    // Note: The animation detail methods are very long - I'll include the key parts
    // Continue in next part due to length...
    addDatabasePreview(container, entry, type) {
        const preview = document.createElement('div');
        preview.className = 'database-preview';

        if (type === 'actors') {
            // Create container for character, face, and SV battler
            const graphicsContainer = document.createElement('div');
            graphicsContainer.className = 'graphics-grid';

            // Character sprite section
            const characterBox = document.createElement('div');
            characterBox.className = 'graphic-preview-box';

            const charLabel = document.createElement('div');
            charLabel.textContent = 'Character Sprite';
            charLabel.className = 'graphic-preview-label';
            characterBox.appendChild(charLabel);

            const charCanvasContainer = document.createElement('div');
            charCanvasContainer.className = 'graphic-canvas-container';
            charCanvasContainer.style.minHeight = '160px';

            if (entry.characterName) {
                // Show animated character sprite (same size as face for consistency)
                const canvas = document.createElement('canvas');
                canvas.width = 144;
                canvas.height = 144;
                canvas.className = 'sprite-preview';
                charCanvasContainer.appendChild(canvas);

                const ctx = canvas.getContext('2d');
                const img = new Image();

                // Use file:// protocol for NW.js
                const path = require('path');
                // Add .png extension if not already present (RPG Maker stores names without extension)
                const filename = entry.characterName.endsWith('.png') ? entry.characterName : entry.characterName + '.png';
                const imgPath = 'file://' + path.join(this.currentProject.path, 'img', 'characters', filename).replace(/\\/g, '/');

                console.log('Loading character sprite:', imgPath);

                img.onload = () => {
                // Check if this is a big character ($ or !$ prefix)
                const isBigCharacter = entry.characterName.startsWith('$') || entry.characterName.startsWith('!$');

                let characterWidth, characterHeight, col, row;

                if (isBigCharacter) {
                    // Big characters are single character per file (3 frames x 4 directions)
                    characterWidth = img.width / 3;
                    characterHeight = img.height / 4;
                    col = 0;
                    row = 0;
                } else {
                    // Normal sprites are 3 columns x 4 rows (8 characters per file)
                    characterWidth = img.width / 12; // 3 frames * 4 columns
                    characterHeight = img.height / 8; // 4 directions * 2 rows

                    // Get the specific character based on characterIndex (0-7)
                    const charCol = entry.characterIndex % 4;
                    const charRow = Math.floor(entry.characterIndex / 4);

                    col = charCol;
                    row = charRow;
                }

                // Pre-cache frames to offscreen canvases for smooth animation
                const frameIndices = [1, 0, 1, 2];
                const cachedFrames = [];

                // Pre-render all frames
                frameIndices.forEach(frameNum => {
                    const offscreenCanvas = document.createElement('canvas');
                    offscreenCanvas.width = canvas.width;
                    offscreenCanvas.height = canvas.height;
                    const offscreenCtx = offscreenCanvas.getContext('2d');

                    let frameX, frameY, frameWidth, frameHeight;

                    if (isBigCharacter) {
                        frameWidth = characterWidth;
                        frameHeight = characterHeight;
                        frameX = frameNum * characterWidth;
                        frameY = 0;
                    } else {
                        frameWidth = characterWidth;
                        frameHeight = characterHeight;
                        frameX = (col * 3 + frameNum) * characterWidth;
                        frameY = (row * 4) * characterHeight;
                    }

                    offscreenCtx.drawImage(
                        img,
                        frameX, frameY,
                        frameWidth, frameHeight,
                        0, 0,
                        offscreenCanvas.width, offscreenCanvas.height
                    );

                    cachedFrames.push(offscreenCanvas);
                });

                // Simple animation using cached frames
                let currentFrame = 0;

                const animate = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(cachedFrames[currentFrame], 0, 0);
                    currentFrame = (currentFrame + 1) % cachedFrames.length;
                };

                setInterval(animate, 125);
                animate();
            };
            img.onerror = (e) => {
                console.error('Failed to load character sprite:', imgPath, e);
                canvas.remove();
                const errorMsg = document.createElement('span');
                errorMsg.style.color = 'var(--color-text-muted)';
                errorMsg.style.fontSize = '11px';
                errorMsg.textContent = 'Image not found';
                charCanvasContainer.appendChild(errorMsg);
            };
            img.src = imgPath;
            } else {
                const noImageMsg = document.createElement('span');
                noImageMsg.style.color = 'var(--color-text-muted)';
                noImageMsg.style.fontSize = '11px';
                noImageMsg.textContent = 'No image set';
                charCanvasContainer.appendChild(noImageMsg);
            }

            characterBox.appendChild(charCanvasContainer);

            // Add change character button
            const charButton = document.createElement('button');
            charButton.textContent = 'Change Sprite';
            charButton.className = 'graphic-selector-button';
            charButton.onclick = () => this.selectCharacterImage(entry);
            characterBox.appendChild(charButton);

            graphicsContainer.appendChild(characterBox);

            // Face graphic section
            const faceBox = document.createElement('div');
            faceBox.className = 'graphic-preview-box';

            const faceLabel = document.createElement('div');
            faceLabel.textContent = 'Face Graphic';
            faceLabel.className = 'graphic-preview-label';
            faceBox.appendChild(faceLabel);

            const faceCanvasContainer = document.createElement('div');
            faceCanvasContainer.className = 'graphic-canvas-container';
            faceCanvasContainer.style.minHeight = '160px';

            if (entry.faceName) {
                // Face graphics are 4x2 layout (8 faces per file)
                const faceCanvas = document.createElement('canvas');
                faceCanvas.width = 144;
                faceCanvas.height = 144;
                faceCanvas.className = 'sprite-preview';
                faceCanvasContainer.appendChild(faceCanvas);

                const faceCtx = faceCanvas.getContext('2d');
                const faceImg = new Image();

                const path = require('path');
                const faceImgPath = 'file://' + path.join(this.currentProject.path, 'img', 'faces', entry.faceName + '.png').replace(/\\/g, '/');

                console.log('Loading face graphic:', faceImgPath);

                faceImg.onload = () => {
                    // Face files are 4 columns x 2 rows (8 faces)
                    const faceWidth = faceImg.width / 4;
                    const faceHeight = faceImg.height / 2;

                    // Get position based on faceIndex (0-7)
                    const col = entry.faceIndex % 4;
                    const row = Math.floor(entry.faceIndex / 4);

                    faceCtx.drawImage(
                        faceImg,
                        col * faceWidth, row * faceHeight,
                        faceWidth, faceHeight,
                        0, 0,
                        faceCanvas.width, faceCanvas.height
                    );
                };
                faceImg.onerror = (e) => {
                    console.error('Failed to load face graphic:', faceImgPath, e);
                    faceCanvas.remove();
                    const errorMsg = document.createElement('span');
                    errorMsg.style.color = 'var(--color-text-muted)';
                    errorMsg.style.fontSize = '11px';
                    errorMsg.textContent = 'Image not found';
                    faceCanvasContainer.appendChild(errorMsg);
                };
                faceImg.src = faceImgPath;
            } else {
                const noFaceMsg = document.createElement('span');
                noFaceMsg.style.color = 'var(--color-text-muted)';
                noFaceMsg.style.fontSize = '11px';
                noFaceMsg.textContent = 'No image set';
                faceCanvasContainer.appendChild(noFaceMsg);
            }

            faceBox.appendChild(faceCanvasContainer);

            // Add change face button
            const faceButton = document.createElement('button');
            faceButton.textContent = 'Change Face';
            faceButton.className = 'graphic-selector-button';
            faceButton.onclick = () => this.selectFaceImage(entry);
            faceBox.appendChild(faceButton);

            graphicsContainer.appendChild(faceBox);

            // SV Battler section
            const svBox = document.createElement('div');
            svBox.className = 'graphic-preview-box';

            const svLabel = document.createElement('div');
            svLabel.textContent = 'SV Battler';
            svLabel.className = 'graphic-preview-label';
            svBox.appendChild(svLabel);

            const svCanvasContainer = document.createElement('div');
            svCanvasContainer.className = 'graphic-canvas-container';
            svCanvasContainer.style.minHeight = '160px';

            if (entry.battlerName) {
                // Show SV battler sprite (same size as face for consistency)
                const svCanvas = document.createElement('canvas');
                svCanvas.width = 144;
                svCanvas.height = 144;
                svCanvas.className = 'sprite-preview';
                svCanvasContainer.appendChild(svCanvas);

                const svCtx = svCanvas.getContext('2d');
                const svImg = new Image();

                const path = require('path');
                const svImgPath = 'file://' + path.join(this.currentProject.path, 'img', 'sv_actors', entry.battlerName + '.png').replace(/\\/g, '/');

                console.log('Loading SV battler:', svImgPath);

                svImg.onload = () => {
                    // SV battlers are 9 frames (3x3) x 6 motions, each frame is typically 64x64
                    const frameWidth = svImg.width / 9;
                    const frameHeight = svImg.height / 6;

                    // Draw the idle stance (first frame of first motion)
                    svCtx.drawImage(
                        svImg,
                        0, 0,
                        frameWidth, frameHeight,
                        0, 0,
                        svCanvas.width, svCanvas.height
                    );
                };
                svImg.onerror = (e) => {
                    console.error('Failed to load SV battler:', svImgPath, e);
                    svCanvas.remove();
                    const errorMsg = document.createElement('span');
                    errorMsg.style.color = 'var(--color-text-muted)';
                    errorMsg.style.fontSize = '11px';
                    errorMsg.textContent = 'Image not found';
                    svCanvasContainer.appendChild(errorMsg);
                };
                svImg.src = svImgPath;
            } else {
                const noSvMsg = document.createElement('span');
                noSvMsg.style.color = 'var(--color-text-muted)';
                noSvMsg.style.fontSize = '11px';
                noSvMsg.textContent = 'No image set';
                svCanvasContainer.appendChild(noSvMsg);
            }

            svBox.appendChild(svCanvasContainer);

            // Add change SV battler button
            const svButton = document.createElement('button');
            svButton.textContent = 'Change Battler';
            svButton.className = 'graphic-selector-button';
            svButton.onclick = () => this.selectSVBattlerImage(entry);
            svBox.appendChild(svButton);

            graphicsContainer.appendChild(svBox);
            preview.appendChild(graphicsContainer);

        } else if ((type === 'items' || type === 'weapons' || type === 'armors' || type === 'skills') && entry.iconIndex !== undefined) {
            // Show item icon with click handler
            const iconWrapper = document.createElement('div');
            iconWrapper.style.cssText = `
                display: inline-block;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                transition: background-color 0.2s;
                position: relative;
            `;
            iconWrapper.title = 'Click to change icon';

            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            canvas.className = 'icon-preview';
            iconWrapper.appendChild(canvas);

            // Add hover indicator overlay
            const hoverIndicator = document.createElement('div');
            hoverIndicator.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.75);
                border-radius: 4px;
                display: none;
                align-items: center;
                justify-content: center;
                pointer-events: none;
            `;
            // Sleek futuristic folder/browse icon
            hoverIndicator.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 7C3 5.89543 3.89543 5 5 5H9L11 7H19C20.1046 7 21 7.89543 21 9V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z"
                          stroke="var(--color-accent-bright)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M9 12H15M12 9V15"
                          stroke="var(--color-accent-bright)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
            iconWrapper.appendChild(hoverIndicator);

            // Add hover effect
            iconWrapper.onmouseenter = () => {
                iconWrapper.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                hoverIndicator.style.display = 'flex';
            };
            iconWrapper.onmouseleave = () => {
                iconWrapper.style.backgroundColor = '';
                hoverIndicator.style.display = 'none';
            };

            // Add click handler
            iconWrapper.onclick = () => this.selectIcon(entry, type);

            preview.appendChild(iconWrapper);

            const ctx = canvas.getContext('2d');
            const img = new Image();

            // Use file:// protocol for NW.js
            const path = require('path');
            const imgPath = 'file://' + path.join(this.currentProject.path, 'img', 'system', 'IconSet.png');

            img.onload = () => {
                // IconSet is 16 icons wide, each 32x32
                const iconsPerRow = 16;
                const iconSize = 32;

                const col = entry.iconIndex % iconsPerRow;
                const row = Math.floor(entry.iconIndex / iconsPerRow);

                ctx.drawImage(
                    img,
                    col * iconSize, row * iconSize,
                    iconSize, iconSize,
                    0, 0,
                    canvas.width, canvas.height
                );
            };
            img.onerror = (e) => {
                console.error('Failed to load icon:', imgPath, e);
                preview.innerHTML = '<span style="color: var(--color-text-muted);">Icon not found</span>';
            };
            img.src = imgPath;

        } else {
            preview.innerHTML = '<span style="color: var(--color-text-muted);">No preview available</span>';
        }

        container.appendChild(preview);
    }

    selectCharacterImage(actor) {
        if (typeof nw === 'undefined' && !window.RPGReactorHost) {
            alert('Character selection requires the desktop editor or the browser project host');
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const charactersPath = path.join(this.currentProject.path, 'img', 'characters');

        try {
            const files = fs.readdirSync(charactersPath)
                .filter(f => f.endsWith('.png'))
                .map(f => f.replace('.png', ''));

            if (files.length === 0) {
                alert('No character images found in img/characters folder');
                return;
            }

            this.showImagePicker('Select Character Sprite', files, (selectedFile, selectedIndex) => {
                actor.characterName = selectedFile;
                actor.characterIndex = selectedIndex;

                this.showDatabaseDetail(actor, 'actors');
                this.updateStatus('Character sprite updated');
            }, (fileName) => {
                // Preview callback - show full sprite sheet
                return 'file://' + path.join(this.currentProject.path, 'img', 'characters', fileName + '.png');
            }, actor.characterName, {
                sheetType: 'character',
                currentIndex: actor.characterIndex || 0,
                selectButtonLabel: 'Select Sprite'
            });
        } catch (error) {
            console.error('Error reading characters folder:', error);
            alert('Error reading characters folder');
        }
    }

    selectFaceImage(actor) {
        if (typeof nw === 'undefined' && !window.RPGReactorHost) {
            alert('Face selection requires the desktop editor or the browser project host');
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const facesPath = path.join(this.currentProject.path, 'img', 'faces');

        try {
            const files = fs.readdirSync(facesPath)
                .filter(f => f.endsWith('.png'))
                .map(f => f.replace('.png', ''));

            if (files.length === 0) {
                alert('No face images found in img/faces folder');
                return;
            }

            this.showImagePicker('Select Face Graphic', files, (selectedFile, selectedIndex) => {
                actor.faceName = selectedFile;
                actor.faceIndex = selectedIndex;

                this.showDatabaseDetail(actor, 'actors');
                this.updateStatus('Face graphic updated');
            }, (fileName) => {
                return 'file://' + path.join(this.currentProject.path, 'img', 'faces', fileName + '.png');
            }, actor.faceName, {
                sheetType: 'face',
                currentIndex: actor.faceIndex || 0,
                selectButtonLabel: 'Select Face'
            });
        } catch (error) {
            console.error('Error reading faces folder:', error);
            alert('Error reading faces folder');
        }
    }

    selectSVBattlerImage(actor) {
        if (typeof nw === 'undefined' && !window.RPGReactorHost) {
            alert('SV Battler selection requires the desktop editor or the browser project host');
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const svActorsPath = path.join(this.currentProject.path, 'img', 'sv_actors');

        try {
            const files = fs.readdirSync(svActorsPath)
                .filter(f => f.endsWith('.png'))
                .map(f => f.replace('.png', ''));

            if (files.length === 0) {
                alert('No SV battler images found in img/sv_actors folder');
                return;
            }

            this.showImagePicker('Select SV Battler', files, (selectedFile) => {
                actor.battlerName = selectedFile;

                this.showDatabaseDetail(actor, 'actors');
                this.updateStatus('SV battler updated');
            }, (fileName) => {
                return 'file://' + path.join(this.currentProject.path, 'img', 'sv_actors', fileName + '.png');
            });
        } catch (error) {
            console.error('Error reading sv_actors folder:', error);
            alert('Error reading sv_actors folder');
        }
    }

    selectIcon(entry, type) {
        if (typeof nw === 'undefined' && !window.RPGReactorHost) {
            alert('Icon selection requires the desktop editor or the browser project host');
            return;
        }

        const path = require('path');
        const iconSetPath = path.join(this.currentProject.path, 'img', 'system', 'IconSet.png');

        this.showIconPicker(entry.iconIndex || 0, (selectedIconIndex) => {
            // Update the icon index
            entry.iconIndex = selectedIconIndex;

            // Save to database based on type
            switch(type) {
                case 'items':
                    this.databaseManager.updateItem(entry.id, entry);
                    break;
                case 'weapons':
                    this.databaseManager.updateWeapon(entry.id, entry);
                    break;
                case 'armors':
                    this.databaseManager.updateArmor(entry.id, entry);
                    break;
                case 'skills':
                    this.databaseManager.updateSkill(entry.id, entry);
                    break;
                case 'states':
                    this.databaseManager.updateState(entry.id, entry);
                    break;
            }

            // Refresh the detail view and the entry's mini icon in the list
            this.showDatabaseDetail(entry, type);
            this.refreshListIcon(entry, type);
            this.updateStatus('Icon updated');
        }, iconSetPath);
    }

    showIconPicker(currentIconIndex, onSelectCallback, iconSetPath) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // Create picker container
        const container = document.createElement('div');
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 8px;
            max-width: 90vw;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
        `;

        // Title
        const title = document.createElement('h2');
        title.textContent = 'Select Icon';
        title.style.cssText = 'margin: 0; padding: 20px 20px 16px 20px; color: var(--color-text-strong); font-size: 16px;';
        container.appendChild(title);

        // Scrollable canvas area
        const canvasContainer = document.createElement('div');
        canvasContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 0 20px;
        `;

        // Canvas for icon grid
        const canvas = document.createElement('canvas');
        canvas.style.cssText = `
            display: block;
            border: 1px solid var(--color-border);
            cursor: pointer;
            image-rendering: pixelated;
            margin: 0 auto;
        `;
        canvasContainer.appendChild(canvas);
        container.appendChild(canvasContainer);

        // Bottom section with selection info and buttons (sticky)
        const bottomSection = document.createElement('div');
        bottomSection.style.cssText = `
            background-color: var(--color-bg-panel);
            border-top: 1px solid var(--color-border);
            padding: 16px 20px;
        `;

        // Selected icon display
        const selectedInfo = document.createElement('div');
        selectedInfo.style.cssText = 'margin: 0 0 16px 0; color: var(--color-text-strong); font-size: 13px;';
        selectedInfo.textContent = `Selected Icon: ${currentIconIndex}`;
        bottomSection.appendChild(selectedInfo);

        // Buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.onclick = () => document.body.removeChild(modal);

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'padding: 8px 16px; background-color: var(--color-accent); color: var(--color-bg-deep); border: 1px solid var(--color-accent); border-radius: 4px; cursor: pointer; font-weight: bold; transition: background-color 0.2s;';
        okBtn.onmouseenter = () => {
            okBtn.style.backgroundColor = 'var(--color-accent-muted)';
        };
        okBtn.onmouseleave = () => {
            okBtn.style.backgroundColor = 'var(--color-accent)';
        };

        let selectedIconIndex = currentIconIndex;

        okBtn.onclick = () => {
            onSelectCallback(selectedIconIndex);
            document.body.removeChild(modal);
        };

        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(okBtn);
        bottomSection.appendChild(buttonContainer);
        container.appendChild(bottomSection);

        modal.appendChild(container);
        document.body.appendChild(modal);

        // Load and draw iconset
        const img = new Image();
        img.onload = () => {
            const iconsPerRow = 16;
            const iconSize = 32;
            const scale = 2; // Show icons at 2x size for easier selection

            // Calculate grid dimensions
            const imgRows = Math.ceil(img.height / iconSize);
            canvas.width = iconsPerRow * iconSize * scale;
            canvas.height = imgRows * iconSize * scale;

            const ctx = canvas.getContext('2d');

            // OPTIMIZATION: Pre-cache the icon sheet to an offscreen canvas
            const cachedIconSheet = document.createElement('canvas');
            cachedIconSheet.width = canvas.width;
            cachedIconSheet.height = canvas.height;
            const cacheCtx = cachedIconSheet.getContext('2d');

            // Draw all icons once to the cache
            for (let row = 0; row < imgRows; row++) {
                for (let col = 0; col < iconsPerRow; col++) {
                    cacheCtx.drawImage(
                        img,
                        col * iconSize, row * iconSize,
                        iconSize, iconSize,
                        col * iconSize * scale, row * iconSize * scale,
                        iconSize * scale, iconSize * scale
                    );
                }
            }

            // Draw selection highlight - now just copies cached canvas + draws highlight
            const drawSelection = (iconIndex) => {
                // Copy cached icon sheet (single fast operation)
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(cachedIconSheet, 0, 0);

                // Draw highlight
                const col = iconIndex % iconsPerRow;
                const row = Math.floor(iconIndex / iconsPerRow);
                ctx.strokeStyle = ThemeColors.resolve('--color-accent-bright', '#ffd700');
                ctx.lineWidth = 3;
                ctx.strokeRect(
                    col * iconSize * scale + 1.5,
                    row * iconSize * scale + 1.5,
                    iconSize * scale - 3,
                    iconSize * scale - 3
                );
            };

            // Initial selection highlight
            drawSelection(selectedIconIndex);

            // Click handler
            canvas.onclick = (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const col = Math.floor(x / (iconSize * scale));
                const row = Math.floor(y / (iconSize * scale));
                selectedIconIndex = row * iconsPerRow + col;

                selectedInfo.textContent = `Selected Icon: ${selectedIconIndex}`;
                drawSelection(selectedIconIndex);
            };
        };

        img.src = 'file://' + iconSetPath;

        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        };
    }

    /**
     * Show a styled modal for changing the maximum number of database entries
     */
    showChangeMaximumModal(title, type, currentMax, onConfirm) {
        // Overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000;
        `;

        // Modal container
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: var(--color-bg-menubar); border: 1px solid var(--color-border); border-radius: 6px;
            width: 360px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            display: flex; flex-direction: column;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            background: var(--color-bg-panel); padding: 16px 20px;
            border-bottom: 1px solid var(--color-border);
            display: flex; justify-content: space-between; align-items: center;
            border-radius: 6px 6px 0 0;
        `;
        header.innerHTML = `
            <h2 style="margin: 0; color: var(--color-text); font-size: 18px;">Change Maximum</h2>
            <span class="modal-close" style="color: var(--color-text); font-size: 28px; font-weight: bold; cursor: pointer; line-height: 1;">&times;</span>
        `;
        modal.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.style.cssText = 'padding: 20px;';

        const label = document.createElement('div');
        label.style.cssText = 'color: var(--color-text); font-size: 13px; margin-bottom: 12px;';
        label.textContent = `Set the maximum number of ${title}:`;
        body.appendChild(label);

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.value = currentMax;
        input.style.cssText = `
            width: 100%; padding: 8px 10px; box-sizing: border-box;
            background: var(--color-bg-panel); border: 1px solid var(--color-border-input); border-radius: 3px;
            color: var(--color-text); font-size: 14px;
        `;
        body.appendChild(input);

        // Warning message (shown when decreasing)
        const warning = document.createElement('div');
        warning.style.cssText = 'color: #ff8800; font-size: 12px; margin-top: 8px; display: none;';
        body.appendChild(warning);

        input.addEventListener('input', () => {
            const val = parseInt(input.value);
            if (!isNaN(val) && val < currentMax) {
                warning.textContent = `Warning: This will remove entries ${val + 1} through ${currentMax}.`;
                warning.style.display = 'block';
            } else {
                warning.style.display = 'none';
            }
        });

        modal.appendChild(body);

        // Footer buttons
        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 12px 20px; display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--color-border); background-color: var(--color-bg-panel);';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'padding: 8px 16px; background: var(--color-accent); color: var(--color-bg-deep); border: 1px solid var(--color-accent); border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold;';
        okBtn.onmouseenter = () => { okBtn.style.backgroundColor = 'var(--color-accent-muted)'; };
        okBtn.onmouseleave = () => { okBtn.style.backgroundColor = 'var(--color-accent)'; };

        const close = () => document.body.removeChild(overlay);

        cancelBtn.onclick = close;
        header.querySelector('.modal-close').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };

        okBtn.onclick = () => {
            const newMax = parseInt(input.value);
            if (isNaN(newMax) || newMax < 1) {
                input.style.borderColor = 'var(--color-danger-pressed)';
                return;
            }
            close();
            onConfirm(newMax);
        };

        // Enter key submits
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') okBtn.click();
            if (e.key === 'Escape') close();
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        modal.appendChild(footer);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Focus and select the input
        input.focus();
        input.select();
    }

    showImagePicker(title, files, onSelectCallback, getImagePathCallback, currentFile, options = {}) {
        const modal = document.getElementById('image-picker-modal');
        const titleEl = document.getElementById('image-picker-title');
        const listEl = document.getElementById('image-picker-list');
        const previewEl = document.getElementById('image-picker-preview');
        const closeBtn = document.getElementById('image-picker-close-btn');

        titleEl.textContent = title;
        listEl.innerHTML = '';
        previewEl.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">Select an image to preview</p>';

        // Populate file list
        files.forEach((file) => {
            const item = document.createElement('div');
            item.style.cssText = 'padding: 10px 16px; cursor: pointer; border-bottom: 1px solid var(--color-bg-menubar); font-size: 13px;';
            item.textContent = file;

            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = 'var(--color-bg-button)';
            });

            item.addEventListener('mouseleave', () => {
                if (!item.classList.contains('selected')) {
                    item.style.backgroundColor = '';
                }
            });

            item.addEventListener('click', () => {
                // Remove selection from all items
                Array.from(listEl.children).forEach(i => {
                    i.classList.remove('selected');
                    i.style.backgroundColor = '';
                });
                item.classList.add('selected');
                item.style.backgroundColor = 'var(--color-selection-deep)';

                // Show preview
                const imagePath = getImagePathCallback(file);
                const isCharacterSheet = options.sheetType === 'character';
                const isFaceSheet = options.sheetType === 'face';
                const hasSheetSelection = isCharacterSheet || isFaceSheet;
                const isBigCharacter = isCharacterSheet && (file.startsWith('$') || file.startsWith('!$'));
                const sheetColumns = isFaceSheet ? 4 : (isBigCharacter ? 1 : 4);
                const sheetRows = isFaceSheet ? 2 : (isBigCharacter ? 1 : 2);
                const maxIndex = sheetColumns * sheetRows - 1;
                let selectedIndex = file === currentFile ? parseInt(options.currentIndex || 0) : 0;
                if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex > maxIndex) selectedIndex = 0;

                previewEl.innerHTML = '';

                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%;';

                const filenameEl = document.createElement('div');
                filenameEl.style.cssText = 'font-size: 14px; font-weight: 600; color: var(--color-accent);';
                filenameEl.textContent = file;
                wrapper.appendChild(filenameEl);

                if (hasSheetSelection) {
                    const instructions = document.createElement('div');
                    instructions.style.cssText = 'font-size: 12px; color: var(--color-text-muted); text-align: center;';
                    instructions.textContent = isBigCharacter
                        ? 'This is a single-character sheet.'
                        : 'Click a square on the image to choose the index.';
                    wrapper.appendChild(instructions);
                }

                const imageFrame = document.createElement('div');
                imageFrame.style.cssText = 'background: #1a1d1e; border: 2px solid var(--color-border); border-radius: 8px; padding: 16px; max-width: 100%; overflow: auto;';

                const imageWrap = document.createElement('div');
                imageWrap.style.cssText = 'position: relative; display: inline-block; line-height: 0;';

                const img = document.createElement('img');
                img.src = imagePath;
                img.style.cssText = 'image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; max-width: 100%; display: block;';
                imageWrap.appendChild(img);

                let selectedInfo = null;
                const selectionCells = [];

                const updateSelection = () => {
                    selectionCells.forEach((cell, index) => {
                        const selected = index === selectedIndex;
                        cell.style.borderColor = selected ? 'var(--color-accent)' : 'rgba(255, 255, 255, 0.35)';
                        cell.style.backgroundColor = selected ? 'rgba(212, 175, 55, 0.18)' : 'transparent';
                        cell.style.boxShadow = selected ? '0 0 0 2px rgba(0, 0, 0, 0.9), 0 0 12px rgba(212, 175, 55, 0.8)' : 'none';
                    });

                    if (selectedInfo) {
                        selectedInfo.textContent = `${isFaceSheet ? 'Face' : 'Character'} index: ${selectedIndex}`;
                    }
                };

                if (hasSheetSelection) {
                    const overlay = document.createElement('div');
                    overlay.style.cssText = 'position: absolute; inset: 0; pointer-events: none;';
                    imageWrap.appendChild(overlay);

                    for (let index = 0; index <= maxIndex; index++) {
                        const col = index % sheetColumns;
                        const row = Math.floor(index / sheetColumns);
                        const cell = document.createElement('div');
                        cell.style.cssText = `
                            position: absolute;
                            left: ${(col / sheetColumns) * 100}%;
                            top: ${(row / sheetRows) * 100}%;
                            width: ${100 / sheetColumns}%;
                            height: ${100 / sheetRows}%;
                            box-sizing: border-box;
                            border: 3px solid rgba(255, 255, 255, 0.35);
                            cursor: pointer;
                            pointer-events: auto;
                            transition: border-color 0.12s, background-color 0.12s, box-shadow 0.12s;
                        `;
                        cell.title = `Index ${index}`;
                        cell.addEventListener('mouseenter', () => {
                            if (index !== selectedIndex) cell.style.borderColor = 'rgba(212, 175, 55, 0.85)';
                        });
                        cell.addEventListener('mouseleave', updateSelection);
                        cell.addEventListener('click', () => {
                            selectedIndex = index;
                            updateSelection();
                        });
                        overlay.appendChild(cell);
                        selectionCells.push(cell);
                    }
                }

                imageFrame.appendChild(imageWrap);
                wrapper.appendChild(imageFrame);

                if (hasSheetSelection) {
                    selectedInfo = document.createElement('div');
                    selectedInfo.style.cssText = 'font-size: 12px; color: var(--color-accent);';
                    wrapper.appendChild(selectedInfo);
                    updateSelection();
                }

                const buttonRow = document.createElement('div');
                buttonRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';

                const selectBtn = document.createElement('button');
                selectBtn.id = 'image-picker-select-btn';
                selectBtn.textContent = options.selectButtonLabel || 'Select This Image';
                selectBtn.style.cssText = 'background: var(--color-accent); border: 1px solid var(--color-accent); color: var(--color-bg-deep); padding: 10px 24px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;';
                buttonRow.appendChild(selectBtn);

                const openFolderBtn = document.createElement('button');
                openFolderBtn.id = 'image-picker-open-folder-btn';
                openFolderBtn.textContent = 'Open in Folder';
                openFolderBtn.title = 'Open containing folder in file manager';
                openFolderBtn.style.cssText = 'background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-strong); padding: 10px 16px; border-radius: 4px; cursor: pointer; font-size: 13px;';
                buttonRow.appendChild(openFolderBtn);

                wrapper.appendChild(buttonRow);
                previewEl.appendChild(wrapper);

                // Add select button handler
                selectBtn.addEventListener('click', () => {
                    modal.style.display = 'none';
                    onSelectCallback(file, selectedIndex);
                });

                // Add open-in-folder button handler
                openFolderBtn.addEventListener('mouseenter', () => openFolderBtn.style.background = 'var(--color-accent-tint-25)');
                openFolderBtn.addEventListener('mouseleave', () => openFolderBtn.style.background = 'var(--color-border-subtle)');
                openFolderBtn.addEventListener('click', () => {
                    // Strip file:// prefix to get the filesystem path
                    let filePath = imagePath;
                    if (filePath.startsWith('file://')) {
                        filePath = decodeURIComponent(filePath.replace('file://', ''));
                    }
                    if (typeof nw !== 'undefined' && nw.Shell) {
                        nw.Shell.showItemInFolder(filePath);
                    }
                });
            });

            listEl.appendChild(item);
        });

        // Show modal
        modal.style.display = 'flex';

        // Auto-select current file if provided
        if (currentFile) {
            const items = Array.from(listEl.children);
            const match = items.find(item => item.textContent === currentFile);
            if (match) {
                match.click();
                match.scrollIntoView({ block: 'center' });
            }
        }

        // Close button handler
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }

    /**
     * Show Types editor (Elements, Skill Types, Weapon Types, etc.)
     */
    showTypesEditor() {
        const system = this.databaseManager.getSystem();
        if (!system) {
            alert('System data not loaded');
            return;
        }

        const { listEl, detailEl } = this.prepareDatabaseSection('types', 'Types');

        listEl.innerHTML = `
            <div class="database-list-item" data-type="elements">Elements</div>
            <div class="database-list-item" data-type="skillTypes">Skill Types</div>
            <div class="database-list-item" data-type="weaponTypes">Weapon Types</div>
            <div class="database-list-item" data-type="armorTypes">Armor Types</div>
            <div class="database-list-item" data-type="equipTypes">Equipment Types</div>
        `;

        detailEl.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; margin-top: 100px;">Select a type category from the list</p>';

        // Add click handlers
        listEl.querySelectorAll('.database-list-item').forEach(item => {
            item.addEventListener('click', () => {
                listEl.querySelectorAll('.database-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                const typeCategory = item.dataset.type;
                this.showTypeDetail(system, typeCategory);
            });
        });
    }

    /**
     * Show detail for a specific type category.
     * Pretty title, count badge, add/remove controls, live persistence to
     * system data on every keystroke. Index 0 is reserved as "(None)" per
     * the MZ convention for type arrays — shown as a disabled placeholder
     * and skipped from removal so external IDs stay stable.
     */
    showTypeDetail(system, category) {
        const detailEl = document.getElementById('database-detail');
        if (!system[category]) system[category] = [''];
        const data = system[category];

        const categoryTitles = {
            elements:    { title: 'Elements',         description: 'Damage element types referenced by skills, items, weapons, and enemy resist/weakness traits.' },
            skillTypes:  { title: 'Skill Types',      description: 'Skill categories used by the Skills menu and the battle command list.' },
            weaponTypes: { title: 'Weapon Types',     description: 'Weapon categories referenced by equipment trait restrictions and animations.' },
            armorTypes:  { title: 'Armor Types',      description: 'Armor categories referenced by equipment trait restrictions.' },
            equipTypes:  { title: 'Equipment Slots',  description: 'Equipment slot labels (Weapon, Shield, Head, Body, Accessory, ...).' }
        };
        const meta = categoryTitles[category] || { title: category, description: '' };

        const render = () => {
            const totalCount = data.length;
            const realCount = data.length - 1; // exclude reserved index 0

            let rowsHtml = '';
            // Skip index 0 visually -- it's the MZ "(None)" placeholder that
            // shouldn't be exposed as an editable row. It still occupies the
            // slot internally so 1-based references stay stable.
            data.forEach((value, index) => {
                if (index === 0) return;
                rowsHtml += `
                    <div class="rr-types-row" data-index="${index}" style="display: grid; grid-template-columns: 48px 1fr 84px; gap: 12px; align-items: center; padding: 8px 12px; background: var(--color-bg-list-item); border: 1px solid var(--color-border); border-radius: 3px; margin-bottom: 6px;">
                        <div style="text-align: center; font-size: 11px; color: var(--color-text-muted); font-family: var(--font-mono); padding: 4px 0; background: var(--color-bg-deep); border-radius: 3px; border: 1px solid var(--color-border-subtle);">${String(index).padStart(3, '0')}</div>
                        <input type="text" class="rr-types-input database-field-value" data-index="${index}" value="${(value || '').replace(/"/g, '&quot;')}" placeholder="Type ${index} name…">
                        <button class="rr-btn-chip-danger rr-types-remove" data-index="${index}">Remove</button>
                    </div>
                `;
            });

            detailEl.innerHTML = `
                <div style="display: flex; flex-direction: column; height: 100%; padding: 16px; overflow-y: auto;">
                    <!-- Header banner -->
                    <div style="background: var(--color-bg-deep); padding: 14px 18px; border-bottom: 2px solid var(--color-accent-border-mid); margin-bottom: 16px; border-radius: 4px 4px 0 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                            <div>
                                <div style="font-size: 18px; font-weight: 600; color: var(--color-text-strong);">${meta.title}</div>
                                <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px;">${meta.description}</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 11px; color: var(--color-text-muted);">Total:</span>
                                <span style="font-size: 13px; color: var(--color-accent-bright); font-weight: 600; font-family: var(--font-mono); padding: 4px 10px; background: var(--color-accent-tint-15); border: 1px solid var(--color-accent-border); border-radius: 3px;" id="rr-types-count">${realCount}</span>
                                <button class="rr-btn-chip" id="rr-types-add" style="padding: 6px 14px;">+ Add</button>
                            </div>
                        </div>
                    </div>

                    <!-- Rows -->
                    <div class="rr-types-rows">${rowsHtml}</div>
                </div>
            `;

            // Wire input persistence
            detailEl.querySelectorAll('.rr-types-input').forEach(input => {
                input.addEventListener('input', (e) => {
                    const idx = parseInt(e.target.dataset.index);
                    data[idx] = e.target.value;
                });
            });

            // Wire remove buttons (skip reserved index 0)
            detailEl.querySelectorAll('.rr-types-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.index);
                    if (idx === 0) return;
                    if (data.length <= 2 && data[idx] === '') {
                        // Allow remove even on empty
                    }
                    data.splice(idx, 1);
                    render();
                });
            });

            // Add button
            const addBtn = detailEl.querySelector('#rr-types-add');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    data.push('');
                    render();
                    // Focus the new input
                    setTimeout(() => {
                        const inputs = detailEl.querySelectorAll('.rr-types-input');
                        const last = inputs[inputs.length - 1];
                        if (last) { last.focus(); last.select(); }
                    }, 0);
                });
            }
        };
        render();
    }

    /**
     * Show Terms editor (Basic, Commands, Parameters)
     */
    showTermsEditor() {
        const system = this.databaseManager.getSystem();
        if (!system || !system.terms) {
            alert('Terms data not loaded');
            return;
        }

        const { listEl, detailEl } = this.prepareDatabaseSection('terms', 'Terms');

        listEl.innerHTML = `
            <div class="database-list-item" data-category="basic">Basic</div>
            <div class="database-list-item" data-category="commands">Commands</div>
            <div class="database-list-item" data-category="params">Parameters</div>
            <div class="database-list-item" data-category="messages">Messages</div>
        `;

        detailEl.innerHTML = '<p style="color: var(--color-text-muted); text-align: center; margin-top: 100px;">Select a terms category from the list</p>';

        // Add click handlers
        listEl.querySelectorAll('.database-list-item').forEach(item => {
            item.addEventListener('click', () => {
                listEl.querySelectorAll('.database-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                const category = item.dataset.category;
                this.showTermDetail(system.terms, category);
            });
        });
    }

    /**
     * Show detail for a specific terms category. Terms have a fixed schema in
     * MZ: basic[8], commands[23], params[10] are arrays; messages is a keyed
     * object (alwaysDash, touchUI, victory, etc.). Persistence is direct
     * mutation of the system.terms object on every keystroke.
     */
    showTermDetail(terms, category) {
        const detailEl = document.getElementById('database-detail');

        const arrayCategoryMeta = {
            basic: {
                title: 'Basic Terms',
                description: 'Labels shown on status panels, level-up screens, and the bestiary.',
                labels: ['Level', 'Level (Abbreviation)', 'HP', 'HP (Abbreviation)', 'MP', 'MP (Abbreviation)', 'TP', 'TP (Abbreviation)']
            },
            commands: {
                title: 'Command Terms',
                description: 'Battle command and menu labels.',
                labels: [
                    'Fight',         'Escape',        'Attack',        'Guard',
                    'Item',          'Skill',         'Equip',         'Status',
                    'Formation',     'Save',          'Game End',      'Options',
                    'Weapon',        'Armor',         'Key Item',      'Equip',
                    'Optimize',      'Clear',         'New Game',      'Continue',
                    '(Reserved)',    'To Title',      'Cancel'
                ]
            },
            params: {
                title: 'Parameters',
                description: 'Stat names used in the status menu, equipment screen, and damage formulas.',
                labels: [
                    'Max HP', 'Max MP', 'Attack', 'Defense',
                    'Magic Attack', 'Magic Defense', 'Agility', 'Luck',
                    'Hit',           'Evasion'
                ]
            }
        };

        // Object-keyed Messages schema. Groups are presentation-only.
        // hint shows what %1 / %2 / %3 will be replaced with at runtime.
        const messagesSchema = {
            title: 'Messages',
            description: 'Game messages and option labels. %1, %2, %3 are placeholders the engine fills in at runtime (e.g. "%1 took %2 damage!" → "Harold took 25 damage!"). The hint under each field shows what each placeholder becomes.',
            groups: [
                { label: 'Options Menu', fields: [
                    { key: 'alwaysDash',      label: 'Always Dash' },
                    { key: 'commandRemember', label: 'Command Remember' },
                    { key: 'touchUI',         label: 'Touch UI' }
                ]},
                { label: 'Audio Volume', fields: [
                    { key: 'bgmVolume', label: 'BGM Volume' },
                    { key: 'bgsVolume', label: 'BGS Volume' },
                    { key: 'meVolume',  label: 'ME Volume' },
                    { key: 'seVolume',  label: 'SE Volume' }
                ]},
                { label: 'Menu & Save / Load', fields: [
                    { key: 'possession',  label: 'Possession' },
                    { key: 'expTotal',    label: 'EXP Total',  hint: '%1 = "EXP" term from Basic' },
                    { key: 'expNext',     label: 'EXP To Next', hint: '%1 = "Level" term from Basic' },
                    { key: 'saveMessage', label: 'Save Message' },
                    { key: 'loadMessage', label: 'Load Message' },
                    { key: 'file',        label: 'File' },
                    { key: 'autosave',    label: 'Autosave' },
                    { key: 'partyName',   label: 'Party Name',  hint: '%1 = party leader name' }
                ]},
                { label: 'Battle Flow', fields: [
                    { key: 'emerge',         label: 'Enemy Emerge',     hint: '%1 = enemy name' },
                    { key: 'preemptive',     label: 'Preemptive Attack', hint: '%1 = party name' },
                    { key: 'surprise',       label: 'Surprise Attack',   hint: '%1 = party name' },
                    { key: 'escapeStart',    label: 'Escape Start',      hint: '%1 = party name' },
                    { key: 'escapeFailure',  label: 'Escape Failure' },
                    { key: 'victory',        label: 'Victory',           hint: '%1 = party name' },
                    { key: 'defeat',         label: 'Defeat',            hint: '%1 = party name' },
                    { key: 'obtainExp',      label: 'Obtain EXP',        hint: '%1 = amount, %2 = "EXP" term' },
                    { key: 'obtainGold',     label: 'Obtain Gold',       hint: '%1 = amount (use \\\\G for currency icon)' },
                    { key: 'obtainItem',     label: 'Obtain Item',       hint: '%1 = item name' },
                    { key: 'levelUp',        label: 'Level Up',          hint: '%1 = actor name, %2 = "Level" term, %3 = new level' },
                    { key: 'obtainSkill',    label: 'Obtain Skill',      hint: '%1 = skill name' },
                    { key: 'useItem',        label: 'Use Item',          hint: '%1 = actor name, %2 = item or skill name' }
                ]},
                { label: 'Battle Damage', fields: [
                    { key: 'criticalToEnemy', label: 'Critical To Enemy' },
                    { key: 'criticalToActor', label: 'Critical To Actor' },
                    { key: 'actorDamage',     label: 'Actor Damage',     hint: '%1 = actor name, %2 = damage amount' },
                    { key: 'actorRecovery',   label: 'Actor Recovery',   hint: '%1 = actor name, %2 = stat name, %3 = amount' },
                    { key: 'actorGain',       label: 'Actor Gain',       hint: '%1 = actor name, %2 = stat name, %3 = amount' },
                    { key: 'actorLoss',       label: 'Actor Loss',       hint: '%1 = actor name, %2 = stat name, %3 = amount' },
                    { key: 'actorDrain',      label: 'Actor Drain',      hint: '%1 = actor name, %2 = stat name, %3 = amount' },
                    { key: 'actorNoDamage',   label: 'Actor No Damage',  hint: '%1 = actor name' },
                    { key: 'actorNoHit',      label: 'Actor No Hit',     hint: '%1 = actor name' },
                    { key: 'enemyDamage',     label: 'Enemy Damage',     hint: '%1 = enemy name, %2 = damage amount' },
                    { key: 'enemyRecovery',   label: 'Enemy Recovery',   hint: '%1 = enemy name, %2 = stat name, %3 = amount' },
                    { key: 'enemyGain',       label: 'Enemy Gain',       hint: '%1 = enemy name, %2 = stat name, %3 = amount' },
                    { key: 'enemyLoss',       label: 'Enemy Loss',       hint: '%1 = enemy name, %2 = stat name, %3 = amount' },
                    { key: 'enemyDrain',      label: 'Enemy Drain',      hint: '%1 = enemy name, %2 = stat name, %3 = amount' },
                    { key: 'enemyNoDamage',   label: 'Enemy No Damage',  hint: '%1 = enemy name' },
                    { key: 'enemyNoHit',      label: 'Enemy No Hit',     hint: '%1 = enemy name' }
                ]},
                { label: 'Battle Effects', fields: [
                    { key: 'evasion',         label: 'Evasion',          hint: '%1 = target name' },
                    { key: 'magicEvasion',    label: 'Magic Evasion',    hint: '%1 = target name' },
                    { key: 'magicReflection', label: 'Magic Reflection', hint: '%1 = target name' },
                    { key: 'counterAttack',   label: 'Counter Attack',   hint: '%1 = counter-attacker name' },
                    { key: 'substitute',      label: 'Substitute',       hint: '%1 = protector name, %2 = original target name' },
                    { key: 'buffAdd',         label: 'Buff Add',         hint: '%1 = target name, %2 = stat name' },
                    { key: 'debuffAdd',       label: 'Debuff Add',       hint: '%1 = target name, %2 = stat name' },
                    { key: 'buffRemove',      label: 'Buff Remove',      hint: '%1 = target name, %2 = stat name' },
                    { key: 'actionFailure',   label: 'Action Failure',   hint: '%1 = target name' }
                ]}
            ]
        };

        if (category === 'messages') {
            if (!terms.messages || typeof terms.messages !== 'object') terms.messages = {};
            const data = terms.messages;
            const meta = messagesSchema;

            let bodyHtml = '';
            meta.groups.forEach(group => {
                bodyHtml += `
                    <div style="font-size: 12px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--color-accent-border-mid);">${group.label}</div>
                `;
                group.fields.forEach(field => {
                    const value = data[field.key] != null ? String(data[field.key]) : '';
                    const hintHtml = field.hint
                        ? `<div style="grid-column: 2; font-size: 11px; color: var(--color-text-muted); margin-top: 3px;">${field.hint}</div>`
                        : '';
                    bodyHtml += `
                        <div style="display: grid; grid-template-columns: 200px 1fr; gap: 12px 12px; align-items: center; padding: 6px 12px; background: var(--color-bg-list-item); border: 1px solid var(--color-border); border-radius: 3px; margin-bottom: 4px;">
                            <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600;">${field.label}</div>
                            <input type="text" class="rr-terms-msg-input database-field-value" data-key="${field.key}" value="${value.replace(/"/g, '&quot;')}" placeholder="(default)">
                            ${hintHtml}
                        </div>
                    `;
                });
            });

            detailEl.innerHTML = `
                <div style="display: flex; flex-direction: column; height: 100%; padding: 16px; overflow-y: auto;">
                    <div style="background: var(--color-bg-deep); padding: 14px 18px; border-bottom: 2px solid var(--color-accent-border-mid); margin-bottom: 16px; border-radius: 4px 4px 0 0;">
                        <div style="font-size: 18px; font-weight: 600; color: var(--color-text-strong);">${meta.title}</div>
                        <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px;">${meta.description}</div>
                    </div>
                    ${bodyHtml}
                </div>
            `;

            detailEl.querySelectorAll('.rr-terms-msg-input').forEach(input => {
                input.addEventListener('input', (e) => {
                    data[e.target.dataset.key] = e.target.value;
                });
            });
            return;
        }

        if (!terms[category]) terms[category] = [];
        const data = terms[category];
        const meta = arrayCategoryMeta[category] || { title: category, description: '', labels: [] };

        // Ensure data length matches the schema (MZ may not allocate trailing slots)
        const targetLen = Math.max(data.length, meta.labels.length);
        while (data.length < targetLen) data.push('');

        let rowsHtml = '';
        data.forEach((value, index) => {
            const label = meta.labels[index] || `Slot ${index}`;
            rowsHtml += `
                <div style="display: grid; grid-template-columns: 48px 180px 1fr; gap: 12px; align-items: center; padding: 8px 12px; background: var(--color-bg-list-item); border: 1px solid var(--color-border); border-radius: 3px; margin-bottom: 6px;">
                    <div style="text-align: center; font-size: 11px; color: var(--color-text-muted); font-family: var(--font-mono); padding: 4px 0; background: var(--color-bg-deep); border-radius: 3px; border: 1px solid var(--color-border-subtle);">${String(index).padStart(3, '0')}</div>
                    <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600;">${label}</div>
                    <input type="text" class="rr-terms-input database-field-value" data-index="${index}" value="${(value || '').replace(/"/g, '&quot;')}" placeholder="(default)">
                </div>
            `;
        });

        detailEl.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; padding: 16px; overflow-y: auto;">
                <div style="background: var(--color-bg-deep); padding: 14px 18px; border-bottom: 2px solid var(--color-accent-border-mid); margin-bottom: 16px; border-radius: 4px 4px 0 0;">
                    <div style="font-size: 18px; font-weight: 600; color: var(--color-text-strong);">${meta.title}</div>
                    <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 2px;">${meta.description}</div>
                </div>
                ${rowsHtml}
            </div>
        `;

        detailEl.querySelectorAll('.rr-terms-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.index);
                data[idx] = e.target.value;
            });
        });
    }

}

// Export for use in main.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseEditorUI;
}
