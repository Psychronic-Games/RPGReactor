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
        this._detailGeneration = 0;
        this._listGeneration = 0;
        this._activeDatabaseList = null;

        // Animation preview state
        this.animationPreviews = {};

        // Clipboard for list copy/cut/paste
        this.listClipboard = null;  // { type, entry }

        // Initialize modular editors
        this.commonUI = new DatabaseCommonUI(databaseManager, { getCurrentProject: () => this.currentProject });
        this.actorEditor = new DatabaseActorEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.classEditor = new DatabaseClassEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.skillEditor = new DatabaseSkillEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.itemEditor = new DatabaseItemEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.weaponEditor = new DatabaseWeaponEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.armorEditor = new DatabaseArmorEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.enemyEditor = new DatabaseEnemyEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.stateEditor = new DatabaseStateEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.animationEditor = new DatabaseAnimationEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        const eventProjectManager = {
            getCurrentProject: () => this.currentProject,
            getTilemapManager: () => callbacks.getTilemapManager ? callbacks.getTilemapManager() : null,
            get tilemapManager() {
                return callbacks.getTilemapManager ? callbacks.getTilemapManager() : null;
            }
        };
        this.troopEditor = new DatabaseTroopEditor(databaseManager, eventProjectManager, this.commonUI, this);
        this.tilesetEditor = new DatabaseTilesetEditor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        const system1ProjectManager = {
            getCurrentProject: () => this.currentProject,
            get tilemapManager() {
                return callbacks.getTilemapManager ? callbacks.getTilemapManager() : null;
            }
        };
        this.system1Editor = new DatabaseSystem1Editor(databaseManager, system1ProjectManager, this.commonUI, this);
        this.system2Editor = new DatabaseSystem2Editor(databaseManager, { getCurrentProject: () => this.currentProject }, this.commonUI, this);
        this.commonEventEditor = new DatabaseCommonEventEditor(databaseManager, eventProjectManager, this.commonUI, this);

        if (typeof window !== 'undefined') {
            window.addEventListener('rr-language-changed', () => {
                this.closeDatabaseActionMenu();
                const activeType = document.querySelector('.database-nav-item.active')?.dataset.type;
                this.setupDatabaseNavigation();
                this.refreshDatabaseChrome();
                if (document.getElementById('database-viewer')?.classList.contains('active')) {
                    if (activeType === 'types') this.showTypesEditor();
                    if (activeType === 'terms') this.showTermsEditor();
                }
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
        this._detailGeneration++;
        this._listGeneration++;
        this._activeDatabaseList = null;
    }

    /**
     * Update status message (calls back to main app)
     */
    updateStatus(message) {
        if (this.callbacks.updateStatus) {
            this.callbacks.updateStatus(message);
        }
    }

    _markDatabaseMutation() {
        if (!this.databaseManager) return;
        this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
    }

    cleanupDatabaseListChrome() {
        const listEl = document.getElementById('database-list');
        const parent = listEl?.parentNode;
        if (!parent) return;

        parent.querySelectorAll('.database-search-container, .database-button-bar, .database-list-pager, .database-change-max-btn').forEach(el => el.remove());

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
        // Whatever path closed the viewer, the Cancel baseline must not
        // leak into the next session (the once-per-session guard in
        // takeDatabaseSnapshot would keep a stale one alive).
        this._dataSnapshot = null;
        this._listGeneration++;
        this._activeDatabaseList = null;
        this.closeDatabaseActionMenu();
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
            Object.assign(this.databaseManager.data, JSON.parse(this._dataSnapshot));
            if (this.currentProject?.maps) {
                this.databaseManager.data.mapInfos = this.currentProject.maps;
            }
            this._dataSnapshot = null;
        }
    }

    takeDatabaseSnapshot(force = false) {
        // Baseline for Cancel: capture once per viewer session. This runs on
        // every nav-category click, and retaking it there overwrote the
        // baseline with the already-edited state — Cancel then kept every
        // edit made before the last category switch, and the next save wrote
        // those "cancelled" edits to disk. (Apply intentionally refreshes
        // the baseline by assigning _dataSnapshot directly after saving;
        // OK/close null it so the next open captures fresh.) It also
        // Store compact JSON rather than a second live object graph. This is
        // especially important for Tilesets, where every entry has 8,192 flags.
        if (this._dataSnapshot && !force) return;
        this._dataSnapshot = JSON.stringify(this.databaseManager.data);
    }

    setupDatabaseControls() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
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
                        alert(tt('One or more database files could not be saved.'));
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
                        alert(tt('One or more database files could not be saved.'));
                        return;
                    }
                    this.updateStatus(this._t('db.saved'));
                    this._dataSnapshot = JSON.stringify(this.databaseManager.data);
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
        this._detailGeneration++;
        this._listGeneration++;
        this._activeDatabaseList = null;

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
                data = this.databaseManager.getTilesets();
                title = this._dbTitle(type, 'Tilesets');
                break;
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
                this.prepareDatabaseSection('types', this._dbTitle('types', 'Types'), { showListPanel: false });
                // Types editor uses System.json - delegate to callback
                if (this.callbacks.showTypesEditor) {
                    this.callbacks.showTypesEditor();
                }
                return;
            }
            case 'terms': {
                this.prepareDatabaseSection('terms', this._dbTitle('terms', 'Terms'), { showListPanel: false });
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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const viewer = document.getElementById('database-viewer');
        const navEl = document.getElementById('database-navigation');
        const titleEl = document.getElementById('database-viewer-title');
        const listEl = document.getElementById('database-list');
        const detailEl = document.getElementById('database-detail');
        const listPanelEl = document.getElementById('database-list-panel');
        const batchSize = 250;
        let filteredData = data;
        let renderedCount = 0;
        const selectedIds = new Set();
        let selectionAnchorId = null;
        let focusedId = null;

        if (navEl && navEl.children.length === 0) this.setupDatabaseNavigation();
        navEl?.querySelectorAll('.database-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.type === type);
        });

        titleEl.textContent = title;
        listEl.innerHTML = '';
        listEl.tabIndex = 0;
        listEl.setAttribute('role', 'listbox');
        listEl.setAttribute('aria-multiselectable', 'true');
        detailEl.style.flex = '';
        detailEl.style.display = '';
        detailEl.style.flexDirection = '';
        detailEl.style.overflow = '';
        detailEl.style.overflowY = 'auto';
        if (listPanelEl) listPanelEl.style.display = '';
        detailEl.innerHTML = this._selectEntryMarkup();

        listEl.parentNode.querySelector('.database-button-bar')?.remove();
        listEl.parentNode.querySelector('.database-search-container')?.remove();
        listEl.parentNode.querySelector('.database-list-pager')?.remove();
        listEl.parentNode.querySelector('.database-change-max-btn')?.remove();

        const searchContainer = document.createElement('div');
        searchContainer.className = 'database-search-container';
        searchContainer.style.cssText = 'padding: 8px; background-color: var(--color-bg-menubar); border-bottom: 1px solid var(--color-border); flex-shrink: 0;';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = this._t('db.search', { title });
        searchInput.style.cssText = 'width:100%;padding:6px 10px;background-color:var(--color-bg-panel);border:1px solid var(--color-border-input);border-radius:3px;color:var(--color-text);font-size:12px;box-sizing:border-box;';
        searchInput.addEventListener('focus', () => {
            searchInput.style.borderColor = 'var(--color-accent-border-strong)';
            searchInput.style.outline = 'none';
        });
        searchInput.addEventListener('blur', () => { searchInput.style.borderColor = 'var(--color-border-input)'; });
        searchContainer.appendChild(searchInput);
        listEl.parentNode.insertBefore(searchContainer, listEl);

        const applySelection = () => {
            listEl.querySelectorAll('.database-list-item').forEach(item => {
                const selected = selectedIds.has(Number(item.dataset.entryId));
                item.classList.toggle('selected', selected);
                item.setAttribute('aria-selected', String(selected));
            });
        };
        const getSelectedEntries = () => filteredData
            .filter(entry => selectedIds.has(entry.id))
            .map(entry => this.databaseManager.data[type]?.[entry.id] || entry);
        const selectIds = (ids, focusId = null, showDetail = true) => {
            selectedIds.clear();
            ids.forEach(id => selectedIds.add(id));
            focusedId = focusId ?? ids[0] ?? null;
            selectionAnchorId = focusedId;
            applySelection();
            if (!showDetail) return;
            const focusedEntry = data.find(entry => entry?.id === focusedId);
            if (focusedEntry) this.showDatabaseDetail(focusedEntry, type);
            else detailEl.innerHTML = this._selectEntryMarkup();
        };
        const selectRange = (toId) => {
            const anchorIndex = filteredData.findIndex(entry => entry.id === selectionAnchorId);
            const targetIndex = filteredData.findIndex(entry => entry.id === toId);
            if (anchorIndex < 0 || targetIndex < 0) return;
            selectedIds.clear();
            const start = Math.min(anchorIndex, targetIndex);
            const end = Math.max(anchorIndex, targetIndex);
            filteredData.slice(start, end + 1).forEach(entry => selectedIds.add(entry.id));
        };

        // Keep one continuous list, appending in batches for large databases.
        const populateList = (filterText = '', append = false, options = {}) => {
            const previousScrollTop = listEl.scrollTop;
            const previousRenderedCount = renderedCount;
            if (!append) {
                listEl.innerHTML = '';
                renderedCount = 0;
                const query = filterText.toLowerCase();
                filteredData = query ? data.filter(entry => {
                    const name = (entry.name || this._t('common.unnamed')).toLowerCase();
                    return name.includes(query) || String(entry.id || '').includes(query);
                }) : data;
                if (options.resetSelection) {
                    selectedIds.clear();
                    selectionAnchorId = null;
                    focusedId = null;
                }
            }
            let requiredIndex = focusedId === null ? -1 : filteredData.findIndex(entry => entry.id === focusedId);
            const targetCount = !append && options.preserveScroll
                ? Math.max(batchSize, previousRenderedCount, requiredIndex + 1)
                : renderedCount + batchSize;
            const end = Math.min(targetCount, filteredData.length);
            const visibleData = filteredData.slice(renderedCount, end);

            visibleData.forEach(entry => {
                const item = document.createElement('div');
                item.className = 'database-list-item';
                item.dataset.entryId = String(entry.id);
                item.dataset.entryName = entry.name || this._t('common.unnamed');
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', String(selectedIds.has(entry.id)));
                if (selectedIds.has(entry.id)) item.classList.add('selected');

                const nameSpan = document.createElement('span');
                nameSpan.className = 'database-list-name';
                nameSpan.textContent = entry.name || this._t('common.unnamed');
                const idSpan = document.createElement('span');
                idSpan.className = 'database-list-id';
                idSpan.textContent = `#${entry.id}`;
                if (this.listIconTypes.includes(type)) {
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'database-list-icon';
                    this.applyListIcon(iconSpan, entry, type);
                    item.appendChild(iconSpan);
                    nameSpan.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                }
                item.appendChild(nameSpan);
                item.appendChild(idSpan);

                item.addEventListener('click', event => {
                    listEl.focus();
                    if (event.shiftKey && selectionAnchorId !== null) {
                        selectRange(entry.id);
                    } else if (event.ctrlKey || event.metaKey) {
                        if (selectedIds.has(entry.id)) selectedIds.delete(entry.id);
                        else selectedIds.add(entry.id);
                        selectionAnchorId = entry.id;
                    } else {
                        selectedIds.clear();
                        selectedIds.add(entry.id);
                        selectionAnchorId = entry.id;
                    }
                    focusedId = selectedIds.has(entry.id)
                        ? entry.id
                        : (getSelectedEntries().at(-1)?.id ?? null);
                    applySelection();
                    const focusedEntry = this.databaseManager.data[type]?.[focusedId];
                    if (focusedEntry) this.showDatabaseDetail(focusedEntry, type);
                    else detailEl.innerHTML = this._selectEntryMarkup();
                });
                item.addEventListener('contextmenu', event => {
                    event.preventDefault();
                    listEl.focus();
                    if (!selectedIds.has(entry.id)) {
                        selectedIds.clear();
                        selectedIds.add(entry.id);
                        selectionAnchorId = entry.id;
                    }
                    focusedId = entry.id;
                    applySelection();
                    this.showDatabaseDetail(this.databaseManager.data[type]?.[entry.id] || entry, type);
                    this.showListContextMenu(event.clientX, event.clientY, entry, data, type, populateList, searchInput, detailEl);
                });
                listEl.appendChild(item);
            });
            renderedCount = end;
            if (!append && options.preserveScroll) listEl.scrollTop = previousScrollTop;
        };

        const refreshData = () => {
            data.length = 0;
            this.databaseManager.data[type]?.forEach(entry => { if (entry) data.push(entry); });
        };
        const refreshList = () => populateList(searchInput.value, false, { preserveScroll: true });
        const listSession = {
            generation: this._listGeneration,
            type,
            data,
            selectedIds,
            mutationGeneration: 0,
            get focusedId() { return focusedId; },
            getSelectedEntries,
            selectIds,
            selectAll: () => selectIds(filteredData.map(entry => entry.id), focusedId, false),
            refresh: () => { refreshData(); refreshList(); }
        };
        this._activeDatabaseList = listSession;

        listEl.onscroll = () => {
            const nearBottom = listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 160;
            if (nearBottom && renderedCount < filteredData.length) populateList(searchInput.value, true);
        };

        const undoStack = [];
        const snapshotForUndo = () => undoStack.push(JSON.parse(JSON.stringify(this.databaseManager.data[type])));
        const performUndo = () => {
            if (undoStack.length === 0) return;
            listSession.mutationGeneration++;
            this.databaseManager.data[type] = undoStack.pop();
            this._markDatabaseMutation();
            refreshData();
            selectedIds.clear();
            focusedId = null;
            selectionAnchorId = null;
            refreshList();
            detailEl.innerHTML = this._selectEntryMarkup();
            this.updateStatus(tt('Undo'));
        };
        this._snapshotForUndo = snapshotForUndo;

        const buttonBar = document.createElement('div');
        buttonBar.className = 'database-button-bar';
        buttonBar.style.cssText = 'display:flex;gap:4px;padding:6px 8px;background-color:var(--color-bg-menubar);border-bottom:1px solid var(--color-border);flex-shrink:0;';
        const addBtn = document.createElement('button');
        addBtn.className = 'database-add-btn';
        addBtn.textContent = this._t('common.new');
        addBtn.style.cssText = 'flex:1;padding:4px 8px;background-color:var(--color-bg-panel);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;cursor:pointer;font-size:11px;';
        addBtn.onclick = () => {
            if (this.databaseManager.getMaxEntries(type) >= this.getDatabaseMaximum(type)) return;
            snapshotForUndo();
            listSession.mutationGeneration++;
            const newEntry = this.addDatabaseEntry(type);
            if (!newEntry) return;
            data.push(newEntry);
            selectedIds.clear();
            selectedIds.add(newEntry.id);
            focusedId = newEntry.id;
            selectionAnchorId = newEntry.id;
            refreshList();
        };
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'database-delete-btn';
        deleteBtn.textContent = this._t('common.delete');
        deleteBtn.style.cssText = addBtn.style.cssText;
        deleteBtn.onclick = () => {
            const entries = getSelectedEntries();
            if (entries.length === 0) { alert(this._t('db.selectEntryToDelete')); return; }
            const suffix = entries.length > 1 ? ` (+${entries.length - 1})` : '';
            if (!confirm(this._t('db.deleteConfirm', { name: `${entries[0].name || tt('this entry')}${suffix}` }))) return;
            snapshotForUndo();
            listSession.mutationGeneration++;
            entries.forEach(entry => this.deleteDatabaseEntry(type, entry.id));
            refreshData();
            selectedIds.clear();
            focusedId = null;
            selectionAnchorId = null;
            refreshList();
            detailEl.innerHTML = this._selectEntryMarkup();
        };
        buttonBar.appendChild(addBtn);
        buttonBar.appendChild(deleteBtn);
        listEl.parentNode.insertBefore(buttonBar, searchContainer);

        const changeMaxBtn = document.createElement('button');
        changeMaxBtn.className = 'database-change-max-btn';
        changeMaxBtn.textContent = this._t('db.changeMaximum');
        changeMaxBtn.title = `${tt('Max:')} ${this.getDatabaseMaximum(type)}`;
        changeMaxBtn.style.cssText = 'width:100%;padding:6px 8px;background-color:var(--color-bg-panel);color:var(--color-text);border:1px solid var(--color-border-input);border-top:none;cursor:pointer;font-size:11px;flex-shrink:0;';
        changeMaxBtn.onclick = () => {
            this.showChangeMaximumModal(title, type, this.databaseManager.getMaxEntries(type), newMax => {
                const template = this.getDefaultTemplates()[type];
                if (!template) return;
                listSession.mutationGeneration++;
                this.databaseManager.changeMaximum(type, newMax, template);
                refreshData();
                selectedIds.clear();
                refreshList();
                detailEl.innerHTML = this._selectEntryMarkup();
                this.updateStatus(this._t('db.maximumChanged', { title, max: newMax }));
            });
        };
        listEl.parentNode.appendChild(changeMaxBtn);

        searchInput.addEventListener('input', event => {
            populateList(event.target.value, false, { resetSelection: true });
            listEl.scrollTop = 0;
            detailEl.innerHTML = this._selectEntryMarkup();
        });

        if (this._listKeyHandler) document.removeEventListener('keydown', this._listKeyHandler);
        const getSelectedEntry = () => data.find(entry => entry?.id === focusedId) || getSelectedEntries()[0] || null;
        const listKeyHandler = event => {
            if (!viewer.classList.contains('active') || this._activeDatabaseList !== listSession) return;
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
            const key = event.key.toLowerCase();
            if (key === 'arrowup' || key === 'arrowdown') {
                if (filteredData.length === 0) return;
                event.preventDefault();
                const currentIndex = filteredData.findIndex(entry => entry.id === focusedId);
                const delta = key === 'arrowup' ? -1 : 1;
                const nextIndex = currentIndex < 0
                    ? (delta > 0 ? 0 : filteredData.length - 1)
                    : Math.max(0, Math.min(filteredData.length - 1, currentIndex + delta));
                const next = filteredData[nextIndex];
                if (event.shiftKey && selectionAnchorId !== null) {
                    selectRange(next.id);
                    focusedId = next.id;
                    applySelection();
                    this.showDatabaseDetail(next, type);
                } else {
                    selectIds([next.id], next.id);
                }
                listEl.querySelector(`[data-entry-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
                return;
            }
            if (event.key === 'Delete') {
                const entries = getSelectedEntries();
                if (entries.length === 0) return;
                event.preventDefault();
                snapshotForUndo();
                listSession.mutationGeneration++;
                const template = this.getDefaultTemplates()[type];
                entries.forEach(entry => {
                    const blank = { ...JSON.parse(JSON.stringify(template)), id: entry.id, name: '' };
                    this.databaseManager.data[type][entry.id] = blank;
                });
                this._markDatabaseMutation();
                refreshData();
                refreshList();
                detailEl.innerHTML = this._selectEntryMarkup();
                this.updateStatus(this._t('db.entryCleared'));
                return;
            }
            if (!event.ctrlKey && !event.metaKey) return;
            if (key === 'z') {
                event.preventDefault();
                performUndo();
            } else if (key === 'a') {
                event.preventDefault();
                listSession.selectAll();
            } else if (key === 'c') {
                const entries = getSelectedEntries();
                if (entries.length === 0) return;
                event.preventDefault();
                this.copyListEntries(entries, type);
            } else if (key === 'x') {
                const entries = getSelectedEntries();
                if (entries.length === 0) return;
                event.preventDefault();
                this.cutListEntries(entries, data, type, populateList, searchInput, detailEl);
            } else if (key === 'v') {
                const entry = getSelectedEntry();
                if (!entry) return;
                event.preventDefault();
                this.pasteListEntries(entry, data, type, populateList, searchInput, detailEl);
            } else if (key === 'd') {
                const entry = getSelectedEntry();
                if (!entry) return;
                event.preventDefault();
                this.duplicateListEntry(entry, data, type, populateList, searchInput);
            }
        };
        this._listKeyHandler = listKeyHandler;
        document.addEventListener('keydown', listKeyHandler);

        populateList();
        viewer.classList.add('active');
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

        const selectedEntries = this._activeDatabaseList?.type === type
            ? this._activeDatabaseList.getSelectedEntries()
            : [entry];
        const items = [
            { label: this._t('common.copy'), action: () => this.copyListEntries(selectedEntries, type), enabled: true },
            { label: this._t('common.cut'), action: () => this.cutListEntries(selectedEntries, data, type, populateList, searchInput, detailEl), enabled: true },
            { label: this._t('common.paste'), action: () => this.pasteListEntries(entry, data, type, populateList, searchInput, detailEl), enabled: true },
            { label: this._t('common.duplicate'), action: () => this.duplicateListEntry(entry, data, type, populateList, searchInput), enabled: true },
            { label: window.I18n ? window.I18n.tText('Select All') : 'Select All', action: () => {
                const session = this._activeDatabaseList;
                if (session?.type === type) session.selectAll();
            }, enabled: true },
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

    showDatabaseActionMenu(x, y, items) {
        this.closeDatabaseActionMenu();
        const menu = document.createElement('div');
        menu.className = 'rr-database-action-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        items.forEach(item => {
            if (item.separator) {
                const separator = document.createElement('div');
                separator.className = 'rr-database-action-separator';
                menu.appendChild(separator);
                return;
            }

            const enabled = item.enabled !== false;
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'rr-database-action-item';
            row.disabled = !enabled;
            row.innerHTML = `<span>${rrEscapeHtml(item.label)}</span><kbd>${rrEscapeHtml(item.shortcut || '')}</kbd>`;
            if (enabled) {
                row.addEventListener('click', () => {
                    this.closeDatabaseActionMenu();
                    item.action?.();
                });
            }
            menu.appendChild(row);
        });

        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = `${Math.max(4, window.innerWidth - rect.width - 4)}px`;
        if (rect.bottom > window.innerHeight) menu.style.top = `${Math.max(4, window.innerHeight - rect.height - 4)}px`;

        const close = event => {
            if (!menu.contains(event.target)) {
                this.closeDatabaseActionMenu();
            }
        };
        const closeOnEscape = event => {
            if (event.key === 'Escape') this.closeDatabaseActionMenu();
        };
        this._databaseActionMenu = menu;
        this._databaseActionMenuClose = close;
        this._databaseActionMenuEscape = closeOnEscape;
        document.addEventListener('pointerdown', close, true);
        document.addEventListener('keydown', closeOnEscape, true);
    }

    closeDatabaseActionMenu() {
        this._databaseActionMenu?.remove();
        if (this._databaseActionMenuClose) document.removeEventListener('pointerdown', this._databaseActionMenuClose, true);
        if (this._databaseActionMenuEscape) document.removeEventListener('keydown', this._databaseActionMenuEscape, true);
        this._databaseActionMenu = null;
        this._databaseActionMenuClose = null;
        this._databaseActionMenuEscape = null;
    }

    attachTextFieldContextMenu(input) {
        if (!input || input.dataset.rrContextMenu === 'true') return;
        input.dataset.rrContextMenu = 'true';
        input.addEventListener('contextmenu', event => {
            const tt = text => window.I18n ? window.I18n.tText(text) : text;
            event.preventDefault();
            event.stopPropagation();
            input.focus();
            const selectionStart = input.selectionStart ?? 0;
            const selectionEnd = input.selectionEnd ?? selectionStart;
            const originalValue = input.value;
            const hasSelection = selectionEnd > selectionStart;
            const replaceSelection = text => {
                if (input.value !== originalValue || input.selectionStart !== selectionStart || input.selectionEnd !== selectionEnd) return;
                input.setRangeText(text, selectionStart, selectionEnd, 'end');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            };
            this.showDatabaseActionMenu(event.clientX, event.clientY, [
                { label: this._t('common.cut'), shortcut: 'Ctrl+X', enabled: hasSelection, action: () => {
                    this.writePlainClipboardText(input.value.slice(selectionStart, selectionEnd));
                    input.setRangeText('', selectionStart, selectionEnd, 'end');
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }},
                { label: this._t('common.copy'), shortcut: 'Ctrl+C', enabled: hasSelection, action: () => this.writePlainClipboardText(input.value.slice(selectionStart, selectionEnd)) },
                { label: this._t('common.paste'), shortcut: 'Ctrl+V', action: async () => {
                    const workspace = input.closest('.rr-types-workspace, .rr-terms-workspace');
                    const text = await this.readPlainClipboardText();
                    const viewer = document.getElementById('database-viewer');
                    const detail = document.getElementById('database-detail');
                    if (input.isConnected && viewer?.classList.contains('active') && workspace && detail?.contains(workspace)) {
                        replaceSelection(text);
                    }
                }},
                { separator: true },
                { label: tt('Select All'), shortcut: 'Ctrl+A', enabled: input.value.length > 0, action: () => input.select() }
            ]);
        });
    }

    writeDatabaseEntryClipboard(type, entries) {
        const sourceEntries = Array.isArray(entries) ? entries : [entries];
        const copiedEntries = sourceEntries.map(entry => {
            const copied = JSON.parse(JSON.stringify(entry));
            delete copied.id;
            return copied;
        });
        this.listClipboard = { type, entries: copiedEntries, entry: copiedEntries[0] || null };
        let writePromise = Promise.resolve(true);
        if (typeof ReactorClipboard !== 'undefined') {
            writePromise = Promise.resolve(ReactorClipboard.write('databaseEntry', {
                version: 2,
                databaseType: type,
                entries: copiedEntries,
                entry: copiedEntries[0] || null,
                sourceProjectName: this.currentProject?.name || null,
                sourceProjectPath: this.currentProject?.path || null
            }));
        }
        Object.defineProperty(this.listClipboard, '_writePromise', { value: writePromise });
        return sourceEntries.length === 1 ? copiedEntries[0] : copiedEntries;
    }

    async readDatabaseEntryClipboard(type) {
        if (typeof ReactorClipboard !== 'undefined') {
            const clipboardData = await ReactorClipboard.read('databaseEntry');
            const payload = clipboardData?.payload;
            const payloadEntries = Array.isArray(payload?.entries) ? payload.entries : payload?.entry ? [payload.entry] : [];
            if (!payload || payload.databaseType !== type || payloadEntries.length === 0) return null;
            const entries = payloadEntries.map(sourceEntry => {
                const entry = JSON.parse(JSON.stringify(sourceEntry));
                delete entry.id;
                return entry;
            });
            this.listClipboard = { type, entries, entry: entries[0] };
            return this.listClipboard;
        }

        return this.listClipboard?.type === type ? this.listClipboard : null;
    }

    copyListEntry(entry, type) {
        this.copyListEntries([entry], type);
    }

    copyListEntries(entries, type) {
        if (!entries?.length) return;
        this.writeDatabaseEntryClipboard(type, entries);
        this.updateStatus(this._t('db.entryCopied'));
    }

    cutListEntry(entry, data, type, populateList, searchInput, detailEl) {
        return this.cutListEntries([entry], data, type, populateList, searchInput, detailEl);
    }

    async cutListEntries(entries, data, type, populateList, searchInput, detailEl) {
        if (!entries?.length) return;
        const session = this._activeDatabaseList;
        const mutationGeneration = session?.mutationGeneration;
        const selectedIds = session ? [...session.selectedIds] : null;
        const focusedId = session?.focusedId;
        const listGeneration = this._listGeneration;
        const project = this.currentProject;
        const databaseGeneration = this.databaseManager.dataGeneration;
        const databaseMutationGeneration = this.databaseManager.mutationGeneration;
        const targetArray = this.databaseManager.data[type];
        const slots = entries.map(entry => ({
            id: entry.id,
            value: targetArray?.[entry.id],
            snapshot: JSON.stringify(targetArray?.[entry.id])
        }));
        this.writeDatabaseEntryClipboard(type, entries);
        if (!await (this.listClipboard?._writePromise || true)) {
            alert(this._t('db.clipboardWriteFailed'));
            return;
        }
        if (this._listGeneration !== listGeneration || this.currentProject !== project
            || this.databaseManager.dataGeneration !== databaseGeneration
            || this.databaseManager.mutationGeneration !== databaseMutationGeneration
            || this.databaseManager.data[type] !== targetArray
            || (session && this._activeDatabaseList !== session)
            || (session && session.mutationGeneration !== mutationGeneration)
            || (session && (selectedIds.length !== session.selectedIds.size
                || selectedIds.some(id => !session.selectedIds.has(id))))
            || (session && session.focusedId !== focusedId)
            || slots.some(slot => targetArray?.[slot.id] !== slot.value
                || JSON.stringify(slot.value) !== slot.snapshot)) return;

        if (this._snapshotForUndo) this._snapshotForUndo();
        if (session) session.mutationGeneration++;
        const template = this.getDefaultTemplates()[type];
        if (template) {
            entries.forEach(entry => {
                const blank = { ...JSON.parse(JSON.stringify(template)), id: entry.id, name: '' };
                this.databaseManager.data[type][entry.id] = blank;
                const idx = data.findIndex(candidate => candidate?.id === entry.id);
                if (idx >= 0) data[idx] = blank;
            });
            this._markDatabaseMutation();
        }
        if (session?.type === type) session.selectIds(entries.map(entry => entry.id), entries[0].id, false);
        populateList(searchInput.value, false, { preserveScroll: true });
        detailEl.innerHTML = this._selectEntryMarkup();
        this.updateStatus(this._t('db.entryCut'));
    }

    async pasteListEntry(targetEntry, data, type, populateList, searchInput, detailEl) {
        return this.pasteListEntries(targetEntry, data, type, populateList, searchInput, detailEl);
    }

    async pasteListEntries(targetEntry, data, type, populateList, searchInput, detailEl) {
        if (!targetEntry) return;
        const targetId = targetEntry.id;
        const session = this._activeDatabaseList;
        const mutationGeneration = session?.mutationGeneration;
        const selectedIds = session ? [...session.selectedIds] : null;
        const focusedId = session?.focusedId;
        const listGeneration = this._listGeneration;
        const project = this.currentProject;
        const databaseGeneration = this.databaseManager.dataGeneration;
        const databaseMutationGeneration = this.databaseManager.mutationGeneration;
        const targetArray = this.databaseManager.data[type];
        const targetSlot = targetArray?.[targetId];
        const targetSnapshot = JSON.stringify(targetSlot);
        const clipboard = await this.readDatabaseEntryClipboard(type);
        const stale = this._listGeneration !== listGeneration || this.currentProject !== project
            || this.databaseManager.dataGeneration !== databaseGeneration
            || this.databaseManager.mutationGeneration !== databaseMutationGeneration
            || this.databaseManager.data[type] !== targetArray
            || targetArray[targetId] !== targetSlot
            || JSON.stringify(targetSlot) !== targetSnapshot
            || (session && this._activeDatabaseList !== session)
            || (session && session.mutationGeneration !== mutationGeneration)
            || (session && (selectedIds.length !== session.selectedIds.size
                || selectedIds.some(id => !session.selectedIds.has(id)))
            || (session && session.focusedId !== focusedId));
        if (stale) return;
        if (!clipboard) {
            alert(this._t('db.noCompatibleClipboard'));
            return;
        }
        const copiedEntries = clipboard.entries || (clipboard.entry ? [clipboard.entry] : []);
        const lastId = targetId + copiedEntries.length - 1;
        if (lastId >= targetArray.length) {
            alert(this._t('db.noCompatibleClipboard'));
            return;
        }
        if (this._snapshotForUndo) this._snapshotForUndo();
        if (session) session.mutationGeneration++;

        const pastedEntries = copiedEntries.map((sourceEntry, index) => {
            const pasted = JSON.parse(JSON.stringify(sourceEntry));
            pasted.id = targetId + index;
            targetArray[pasted.id] = pasted;
            return pasted;
        });
        this._markDatabaseMutation();
        data.length = 0;
        targetArray.forEach(entry => { if (entry) data.push(entry); });
        if (session?.type === type) session.selectIds(pastedEntries.map(entry => entry.id), pastedEntries[0].id, false);
        populateList(searchInput.value, false, { preserveScroll: true });
        this.showDatabaseDetail(pastedEntries[0], type);
        this.updateStatus(this._t('db.entryPasted'));
        return pastedEntries;
    }

    duplicateListEntry(entry, data, type, populateList, searchInput) {
        if (this._snapshotForUndo) this._snapshotForUndo();
        if (this._activeDatabaseList?.type === type) this._activeDatabaseList.mutationGeneration++;
        const cloned = JSON.parse(JSON.stringify(entry));
        delete cloned.id;
        cloned.name = (cloned.name || this._t('common.unnamed')) + ` (${this._t('common.copy')})`;
        const newEntry = this.databaseManager.addEntry(type, cloned);
        if (newEntry) {
            data.push(newEntry);
            if (this._activeDatabaseList?.type === type) {
                this._activeDatabaseList.selectIds([newEntry.id], newEntry.id, false);
            }
            populateList(searchInput.value, false, { preserveScroll: true });
            this.updateStatus(this._t('db.entryDuplicated'));
        }
    }

    /**
     * Setup the database navigation sidebar
     */
    setupDatabaseNavigation() {
        const navEl = document.getElementById('database-navigation');
        if (!navEl) return;

        const activeType = navEl.querySelector('.database-nav-item.active')?.dataset.type;
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
            if (category.type === activeType) item.classList.add('active');
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
        this._detailGeneration++;
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
            this.tilesetEditor.showTilesetEditorDetail(detailEl, entry);
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
                const isSingle = RRAssetFiles.isBigCharacter(entry.battlerName);
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
            classes: { name: 'New Class', expParams: [30,20,30,30], params: Array.from({ length: 8 }, () => [1, 1]), learnings: [], traits: [], note: '' },
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

    getDatabaseMaximum(type) {
        const managerMaximum = this.databaseManager?.getMaximumEntries?.(type);
        if (managerMaximum) return managerMaximum;
        return globalThis.RR_LIMITS?.DATABASE_ENTRIES?.[type] || {
            actors: 9999, classes: 9999, skills: 9999, items: 9999,
            weapons: 9999, armors: 9999, enemies: 9999, troops: 9999,
            states: 9999, animations: 1000, tilesets: 1000, commonEvents: 9999,
            elements: 512, skillTypes: 128, weaponTypes: 256,
            armorTypes: 256, equipTypes: 128
        }[type] || 0;
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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const wrapper = document.createElement('div');
        wrapper.style.padding = '16px';

        const heading = document.createElement('h3');
        heading.textContent = entry.name || tt('Entry') + ' #' + entry.id;
        const data = document.createElement('pre');
        data.style.cssText = 'background: var(--color-bg-surface); padding: 16px; border-radius: 4px; overflow: auto; max-height: 600px;';
        data.textContent = JSON.stringify(entry, null, 2);
        wrapper.append(heading, data);

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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
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
            charLabel.textContent = tt('Character Sprite');
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
                const isBigCharacter = RRAssetFiles.isBigCharacter(entry.characterName);

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

                // Self-stop when the detail view is rebuilt — the untracked
                // interval otherwise ticks forever, pinning the cached frame
                // canvases for every actor ever viewed.
                const walkInterval = setInterval(() => {
                    if (!canvas.isConnected) {
                        clearInterval(walkInterval);
                        return;
                    }
                    animate();
                }, 125);
                animate();
            };
            img.onerror = (e) => {
                console.error('Failed to load character sprite:', imgPath, e);
                canvas.remove();
                const errorMsg = document.createElement('span');
                errorMsg.style.color = 'var(--color-text-muted)';
                errorMsg.style.fontSize = '11px';
                errorMsg.textContent = tt('Image not found');
                charCanvasContainer.appendChild(errorMsg);
            };
            img.src = imgPath;
            } else {
                const noImageMsg = document.createElement('span');
                noImageMsg.style.color = 'var(--color-text-muted)';
                noImageMsg.style.fontSize = '11px';
                noImageMsg.textContent = tt('No image set');
                charCanvasContainer.appendChild(noImageMsg);
            }

            characterBox.appendChild(charCanvasContainer);

            // Add change character button
            const charButton = document.createElement('button');
            charButton.textContent = tt('Change Sprite');
            charButton.className = 'graphic-selector-button';
            charButton.onclick = () => this.selectCharacterImage(entry);
            characterBox.appendChild(charButton);

            graphicsContainer.appendChild(characterBox);

            // Face graphic section
            const faceBox = document.createElement('div');
            faceBox.className = 'graphic-preview-box';

            const faceLabel = document.createElement('div');
            faceLabel.textContent = tt('Face Graphic');
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
                    errorMsg.textContent = tt('Image not found');
                    faceCanvasContainer.appendChild(errorMsg);
                };
                faceImg.src = faceImgPath;
            } else {
                const noFaceMsg = document.createElement('span');
                noFaceMsg.style.color = 'var(--color-text-muted)';
                noFaceMsg.style.fontSize = '11px';
                noFaceMsg.textContent = tt('No image set');
                faceCanvasContainer.appendChild(noFaceMsg);
            }

            faceBox.appendChild(faceCanvasContainer);

            // Add change face button
            const faceButton = document.createElement('button');
            faceButton.textContent = tt('Change Face');
            faceButton.className = 'graphic-selector-button';
            faceButton.onclick = () => this.selectFaceImage(entry);
            faceBox.appendChild(faceButton);

            graphicsContainer.appendChild(faceBox);

            // SV Battler section
            const svBox = document.createElement('div');
            svBox.className = 'graphic-preview-box';

            const svLabel = document.createElement('div');
            svLabel.textContent = tt('SV Battler');
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
                    errorMsg.textContent = tt('Image not found');
                    svCanvasContainer.appendChild(errorMsg);
                };
                svImg.src = svImgPath;
            } else {
                const noSvMsg = document.createElement('span');
                noSvMsg.style.color = 'var(--color-text-muted)';
                noSvMsg.style.fontSize = '11px';
                noSvMsg.textContent = tt('No image set');
                svCanvasContainer.appendChild(noSvMsg);
            }

            svBox.appendChild(svCanvasContainer);

            // Add change SV battler button
            const svButton = document.createElement('button');
            svButton.textContent = tt('Change Battler');
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
            iconWrapper.title = tt('Click to change icon');

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
                preview.innerHTML = `<span style="color: var(--color-text-muted);">${tt('Icon not found')}</span>`;
            };
            img.src = imgPath;

        } else {
            preview.innerHTML = `<span style="color: var(--color-text-muted);">${tt('No preview available')}</span>`;
        }

        container.appendChild(preview);
    }

    selectCharacterImage(actor) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (typeof nw === 'undefined' && !window.RPGReactorHost) {
            alert(tt('Character selection requires the desktop editor or the browser project host'));
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const charactersPath = path.join(this.currentProject.path, 'img', 'characters');

        try {
            const files = RRAssetFiles.listNames(charactersPath, ['.png']);

            if (files.length === 0) {
                alert(tt('No character images found in img/characters folder'));
                return;
            }

            this.showImagePicker(tt('Select Character Sprite'), files, (selectedFile, selectedIndex) => {
                actor.characterName = selectedFile;
                actor.characterIndex = selectedIndex;

                this.showDatabaseDetail(actor, 'actors');
                this.updateStatus(tt('Character sprite updated'));
            }, (fileName) => {
                // Preview callback - show full sprite sheet
                return RRAssetFiles.urlFor(charactersPath, fileName, ['.png']);
            }, actor.characterName, {
                sheetType: 'character',
                currentIndex: actor.characterIndex || 0,
                selectButtonLabel: tt('Select Sprite')
            });
        } catch (error) {
            console.error('Error reading characters folder:', error);
            alert(tt('Error reading characters folder'));
        }
    }

    selectFaceImage(actor) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (typeof nw === 'undefined' && !window.RPGReactorHost) {
            alert(tt('Face selection requires the desktop editor or the browser project host'));
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const facesPath = path.join(this.currentProject.path, 'img', 'faces');

        try {
            const files = RRAssetFiles.listNames(facesPath, ['.png']);

            if (files.length === 0) {
                alert(tt('No face images found in img/faces folder'));
                return;
            }

            this.showImagePicker(tt('Select Face Graphic'), files, (selectedFile, selectedIndex) => {
                actor.faceName = selectedFile;
                actor.faceIndex = selectedIndex;

                this.showDatabaseDetail(actor, 'actors');
                this.updateStatus(tt('Face graphic updated'));
            }, (fileName) => {
                return RRAssetFiles.urlFor(facesPath, fileName, ['.png']);
            }, actor.faceName, {
                sheetType: 'face',
                currentIndex: actor.faceIndex || 0,
                selectButtonLabel: tt('Select Face')
            });
        } catch (error) {
            console.error('Error reading faces folder:', error);
            alert(tt('Error reading faces folder'));
        }
    }

    selectSVBattlerImage(actor) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (typeof nw === 'undefined' && !window.RPGReactorHost) {
            alert(tt('SV Battler selection requires the desktop editor or the browser project host'));
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const svActorsPath = path.join(this.currentProject.path, 'img', 'sv_actors');

        try {
            const files = RRAssetFiles.listNames(svActorsPath, ['.png']);

            if (files.length === 0) {
                alert(tt('No SV battler images found in img/sv_actors folder'));
                return;
            }

            this.showImagePicker(tt('Select SV Battler'), files, (selectedFile) => {
                actor.battlerName = selectedFile;

                this.showDatabaseDetail(actor, 'actors');
                this.updateStatus(tt('SV battler updated'));
            }, (fileName) => {
                return RRAssetFiles.urlFor(svActorsPath, fileName, ['.png']);
            });
        } catch (error) {
            console.error('Error reading sv_actors folder:', error);
            alert(tt('Error reading sv_actors folder'));
        }
    }

    selectIcon(entry, type) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (typeof nw === 'undefined' && !window.RPGReactorHost) {
            alert(tt('Icon selection requires the desktop editor or the browser project host'));
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
            this.updateStatus(tt('Icon updated'));
        }, iconSetPath);
    }

    showIconPicker(currentIconIndex, onSelectCallback, iconSetPath) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
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
        title.textContent = tt('Select Icon');
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
        selectedInfo.textContent = `${tt('Selected Icon:')} ${currentIconIndex}`;
        bottomSection.appendChild(selectedInfo);

        // Buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.onclick = () => document.body.removeChild(modal);

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
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

                selectedInfo.textContent = `${tt('Selected Icon:')} ${selectedIconIndex}`;
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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const configuredMaximum = this.getDatabaseMaximum(type);
        const maximum = Math.max(currentMax, configuredMaximum);
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
            <h2 style="margin: 0; color: var(--color-text); font-size: 18px;">${tt('Change Maximum')}</h2>
            <span class="modal-close" style="color: var(--color-text); font-size: 28px; font-weight: bold; cursor: pointer; line-height: 1;">&times;</span>
        `;
        modal.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.style.cssText = 'padding: 20px;';

        const label = document.createElement('div');
        label.style.cssText = 'color: var(--color-text); font-size: 13px; margin-bottom: 12px;';
        label.textContent = `${tt('Set the maximum number of')} ${title} (${tt('Max:')} ${maximum}):`;
        body.appendChild(label);

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = String(maximum);
        input.step = '1';
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
            let val = Number(input.value);
            if (Number.isFinite(val) && val > maximum) {
                val = maximum;
                input.value = String(maximum);
            }
            if (!isNaN(val) && val < currentMax) {
                warning.textContent = `${tt('Warning: This will remove entries')} ${val + 1} ${tt('through')} ${currentMax}.`;
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
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.style.cssText = 'padding: 8px 16px; background: var(--color-accent); color: var(--color-bg-deep); border: 1px solid var(--color-accent); border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold;';
        okBtn.onmouseenter = () => { okBtn.style.backgroundColor = 'var(--color-accent-muted)'; };
        okBtn.onmouseleave = () => { okBtn.style.backgroundColor = 'var(--color-accent)'; };

        const close = () => document.body.removeChild(overlay);

        cancelBtn.onclick = close;
        header.querySelector('.modal-close').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };

        okBtn.onclick = () => {
            const newMax = Number(input.value);
            if (!Number.isInteger(newMax) || newMax < 1 || newMax > maximum) {
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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const modal = document.getElementById('image-picker-modal');
        const titleEl = document.getElementById('image-picker-title');
        const listEl = document.getElementById('image-picker-list');
        const previewEl = document.getElementById('image-picker-preview');
        const closeBtn = document.getElementById('image-picker-close-btn');

        titleEl.textContent = title;
        listEl.innerHTML = '';
        listEl.style.overflow = 'hidden';
        previewEl.innerHTML = `<p style="color: var(--color-text-muted); text-align: center;">${tt('Select an image to preview')}</p>`;

        const showPreview = file => {
                const imagePath = getImagePathCallback(file);
                const isCharacterSheet = options.sheetType === 'character';
                const isFaceSheet = options.sheetType === 'face';
                const hasSheetSelection = isCharacterSheet || isFaceSheet;
                const isBigCharacter = isCharacterSheet && RRAssetFiles.isBigCharacter(file);
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
                        ? tt('This is a single-character sheet.')
                        : tt('Click a square on the image to choose the index.');
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
                        selectedInfo.textContent = `${tt(isFaceSheet ? 'Face' : 'Character')} ${tt('index:')} ${selectedIndex}`;
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
                        cell.title = `${tt('Index')} ${index}`;
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
                selectBtn.textContent = options.selectButtonLabel || tt('Select This Image');
                selectBtn.style.cssText = 'background: var(--color-accent); border: 1px solid var(--color-accent); color: var(--color-bg-deep); padding: 10px 24px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;';
                buttonRow.appendChild(selectBtn);

                const openFolderBtn = document.createElement('button');
                openFolderBtn.id = 'image-picker-open-folder-btn';
                openFolderBtn.textContent = tt('Open in Folder');
                openFolderBtn.title = tt('Open containing folder in file manager');
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
        };

        const browser = RRPickerIndex.createBrowser({
            files,
            selectedName: currentFile,
            searchPlaceholder: tt('Search files...'),
            onSelect: showPreview
        });
        listEl.appendChild(browser.element);

        // Show modal
        modal.style.display = 'flex';

        // Auto-select current file if provided
        if (currentFile) {
            showPreview(currentFile);
            browser.scrollTo(currentFile);
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
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const system = this.databaseManager.getSystem();
        if (!system) {
            alert(tt('System data not loaded'));
            return;
        }

        const { detailEl } = this.prepareDatabaseSection('types', this._dbTitle('types', 'Types'), { showListPanel: false });
        const categories = [
            { key: 'elements', title: tt('Elements'), description: tt('Damage element types referenced by skills, items, weapons, and enemy resist/weakness traits.') },
            { key: 'skillTypes', title: tt('Skill Types'), description: tt('Skill categories used by the Skills menu and the battle command list.') },
            { key: 'weaponTypes', title: tt('Weapon Types'), description: tt('Weapon categories referenced by equipment trait restrictions and animations.') },
            { key: 'armorTypes', title: tt('Armor Types'), description: tt('Armor categories referenced by equipment trait restrictions.') },
            { key: 'equipTypes', title: tt('Equipment Types'), description: tt('Equipment slot labels (Weapon, Shield, Head, Body, Accessory, ...).') }
        ];
        const categoryByKey = new Map(categories.map(category => [category.key, category]));
        const selections = new Map();
        const anchors = new Map();
        let activeCategory = categories[0].key;
        let mutationGeneration = 0;
        let pasteGeneration = 0;

        for (const category of categories) {
            if (!Array.isArray(system[category.key]) || system[category.key].length === 0) system[category.key] = [''];
            else system[category.key][0] = '';
            const initial = system[category.key].length > 1 ? [1] : [];
            selections.set(category.key, new Set(initial));
            anchors.set(category.key, initial[0] || null);
        }

        detailEl.innerHTML = `
            <div class="rr-types-workspace">
                <div class="rr-types-toolbar">
                    <div class="rr-types-toolbar-copy">
                        <strong>${tt('Type Lists')}</strong>
                        <span>${tt('Click a row to edit. Ctrl/Cmd-click or Shift-click to select multiple rows.')}</span>
                    </div>
                <div class="rr-types-toolbar-actions">
                        <span class="rr-types-active-category"></span>
                        <button class="rr-btn-chip rr-types-cut">${tt('Cut')}</button>
                        <button class="rr-btn-chip rr-types-copy">${tt('Copy')}</button>
                        <button class="rr-btn-chip rr-types-paste">${tt('Paste')}</button>
                        <button class="rr-btn-chip-danger rr-types-clear">${tt('Clear Selected')}</button>
                    </div>
                </div>
                <div class="rr-types-grid">
                    ${categories.map(category => `
                        <section class="rr-types-panel" data-category="${category.key}" title="${rrEscapeHtml(category.description)}">
                            <div class="rr-types-panel-body"></div>
                        </section>
                    `).join('')}
                </div>
            </div>
        `;

        const panelFor = category => detailEl.querySelector(`.rr-types-panel[data-category="${category}"]`);
        const selectedFor = category => selections.get(category) || new Set();
        const sortedSelection = category => [...selectedFor(category)].sort((a, b) => a - b);

        const setActiveCategory = category => {
            activeCategory = category;
            detailEl.querySelectorAll('.rr-types-panel').forEach(panel => {
                panel.classList.toggle('active', panel.dataset.category === category);
            });
            const activeLabel = detailEl.querySelector('.rr-types-active-category');
            if (activeLabel) activeLabel.textContent = categoryByKey.get(category)?.title || category;
        };

        const updateSelectionUI = category => {
            const panel = panelFor(category);
            if (!panel) return;
            const selected = selectedFor(category);
            panel.querySelectorAll('.rr-types-row').forEach(row => {
                const isSelected = selected.has(Number(row.dataset.index));
                row.classList.toggle('selected', isSelected);
                row.setAttribute('aria-selected', String(isSelected));
            });

            const editor = panel.querySelector('.rr-types-name-editor');
            if (!editor) return;
            const indices = sortedSelection(category);
            if (indices.length === 1) {
                editor.disabled = false;
                editor.value = system[category][indices[0]] || '';
                editor.placeholder = tt('Type name');
            } else {
                editor.disabled = true;
                editor.value = '';
                editor.placeholder = indices.length
                    ? tt('{count} rows selected').replace('{count}', indices.length)
                    : tt('Select a row');
            }
        };

        const selectRow = (category, index, event = {}) => {
            setActiveCategory(category);
            const selected = selectedFor(category);
            const anchor = anchors.get(category);
            if (event.shiftKey && anchor !== null) {
                if (!event.ctrlKey && !event.metaKey) selected.clear();
                const start = Math.min(anchor, index);
                const end = Math.max(anchor, index);
                for (let current = start; current <= end; current++) selected.add(current);
            } else if (event.ctrlKey || event.metaKey) {
                if (selected.has(index)) selected.delete(index);
                else selected.add(index);
                anchors.set(category, index);
            } else {
                selected.clear();
                selected.add(index);
                anchors.set(category, index);
            }
            updateSelectionUI(category);
        };

        const selectAll = category => {
            const last = system[category].length - 1;
            selections.set(category, new Set(Array.from({ length: last }, (_, index) => index + 1)));
            if (last > 0 && anchors.get(category) === null) anchors.set(category, 1);
            updateSelectionUI(category);
        };

        const renderPanel = category => {
            const panel = panelFor(category.key);
            if (!panel) return;
            const oldScroll = panel.querySelector('.rr-types-list')?.scrollTop || 0;
            const data = system[category.key];
            const rows = data.slice(1).map((value, offset) => {
                const index = offset + 1;
                return `
                    <div class="rr-types-row" role="option" aria-selected="false" data-index="${index}">
                        <span class="rr-types-id">${String(index).padStart(2, '0')}</span>
                        <span class="rr-types-name">${rrEscapeHtml(value || '')}</span>
                    </div>
                `;
            }).join('');

            panel.querySelector('.rr-types-panel-body').innerHTML = `
                <header class="rr-types-panel-header">
                    <span>${category.title}</span>
                    <span class="rr-types-count">${data.length - 1}</span>
                </header>
                <div class="rr-types-list" role="listbox" aria-multiselectable="true" tabindex="0">${rows}</div>
                <input class="rr-types-name-editor database-field-value" type="text" placeholder="${tt('Select a row')}" disabled>
                <footer class="rr-types-panel-footer">
                    <button class="rr-btn-chip rr-types-add">+ ${tt('Add')}</button>
                    <button class="rr-btn-chip rr-types-change-max" title="${tt('Max:')} ${this.getDatabaseMaximum(category.key)}">${tt('Change Maximum')}</button>
                </footer>
            `;

            const list = panel.querySelector('.rr-types-list');
            list.scrollTop = oldScroll;
            panel.onpointerdown = () => setActiveCategory(category.key);
            list.addEventListener('click', event => {
                const row = event.target.closest('.rr-types-row');
                if (!row) return;
                list.focus();
                selectRow(category.key, Number(row.dataset.index), event);
            });
            list.addEventListener('contextmenu', event => {
                event.preventDefault();
                event.stopPropagation();
                const row = event.target.closest('.rr-types-row');
                if (row && !selectedFor(category.key).has(Number(row.dataset.index))) {
                    selectRow(category.key, Number(row.dataset.index));
                } else {
                    setActiveCategory(category.key);
                }
                const hasSelection = selectedFor(category.key).size > 0;
                this.showDatabaseActionMenu(event.clientX, event.clientY, [
                    { label: tt('Cut'), shortcut: 'Ctrl+X', enabled: hasSelection, action: cutSelected },
                    { label: tt('Copy'), shortcut: 'Ctrl+C', enabled: hasSelection, action: copySelected },
                    { label: tt('Paste'), shortcut: 'Ctrl+V', action: pasteSelected },
                    { separator: true },
                    { label: tt('Clear Selected'), shortcut: 'Delete', enabled: hasSelection, action: clearSelected },
                    { label: tt('Select All'), shortcut: 'Ctrl+A', enabled: system[category.key].length > 1, action: () => selectAll(category.key) },
                    { separator: true },
                    { label: tt('Edit'), shortcut: 'F2', enabled: selectedFor(category.key).size === 1, action: () => {
                        const field = panel.querySelector('.rr-types-name-editor');
                        field.focus();
                        field.select();
                    }}
                ]);
            });
            list.addEventListener('dblclick', event => {
                if (!event.target.closest('.rr-types-row')) return;
                const editor = panel.querySelector('.rr-types-name-editor');
                if (!editor.disabled) {
                    editor.focus();
                    editor.select();
                }
            });
            list.addEventListener('keydown', event => {
                const current = anchors.get(category.key) || sortedSelection(category.key)[0] || 1;
                const last = system[category.key].length - 1;
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
                    event.preventDefault();
                    selectAll(category.key);
                } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
                    event.preventDefault();
                    cutSelected();
                } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
                    event.preventDefault();
                    copySelected();
                } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
                    event.preventDefault();
                    pasteSelected();
                } else if (event.key === 'Delete' || event.key === 'Backspace') {
                    event.preventDefault();
                    clearSelected();
                } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (last < 1) return;
                    const next = Math.max(1, Math.min(last, current + (event.key === 'ArrowDown' ? 1 : -1)));
                    selectRow(category.key, next, { shiftKey: event.shiftKey });
                    panel.querySelector(`.rr-types-row[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
                } else if (event.key === 'Enter' || event.key === 'F2') {
                    event.preventDefault();
                    const editor = panel.querySelector('.rr-types-name-editor');
                    if (!editor.disabled) {
                        editor.focus();
                        editor.select();
                    }
                }
            });

            const editor = panel.querySelector('.rr-types-name-editor');
            editor.addEventListener('input', () => {
                const index = sortedSelection(category.key)[0];
                if (!index) return;
                data[index] = editor.value;
                mutationGeneration++;
                const name = panel.querySelector(`.rr-types-row[data-index="${index}"] .rr-types-name`);
                if (name) name.textContent = editor.value;
            });
            editor.addEventListener('keydown', event => {
                if (event.key !== 'Enter') return;
                const index = sortedSelection(category.key)[0];
                const next = Math.min(data.length - 1, index + 1);
                if (next !== index) selectRow(category.key, next);
                editor.focus();
                editor.select();
            });
            this.attachTextFieldContextMenu(editor);

            panel.querySelector('.rr-types-add').addEventListener('click', () => {
                const newIndex = data.length;
                if (!this.resizeTypeArray(system, category.key, newIndex)) return;
                mutationGeneration++;
                selections.set(category.key, new Set([newIndex]));
                anchors.set(category.key, newIndex);
                renderPanel(category);
                const newEditor = panel.querySelector('.rr-types-name-editor');
                newEditor.focus();
                newEditor.select();
                panel.querySelector(`.rr-types-row[data-index="${newIndex}"]`)?.scrollIntoView({ block: 'nearest' });
            });
            panel.querySelector('.rr-types-change-max').addEventListener('click', () => {
                const currentMax = data.length - 1;
                this.showChangeMaximumModal(category.title, category.key, currentMax, newMax => {
                    if (newMax < currentMax && !confirm(
                        `${tt('Reducing this maximum will remove type IDs')} ${newMax + 1} ${tt('through')} ${currentMax}. ${tt('Existing references to those IDs may become invalid. Continue?')}`
                    )) return;
                    if (!this.resizeTypeArray(system, category.key, newMax)) return;
                    mutationGeneration++;
                    const remaining = sortedSelection(category.key).filter(index => index <= newMax);
                    selections.set(category.key, new Set(remaining.length ? remaining : [newMax]));
                    anchors.set(category.key, remaining[0] || newMax);
                    renderPanel(category);
                    this.updateStatus?.(`${category.title} ${tt('maximum changed to')} ${newMax}`);
                });
            });

            updateSelectionUI(category.key);
        };

        const copySelected = async () => {
            const indices = sortedSelection(activeCategory);
            if (!indices.length) return;
            const names = indices.map(index => system[activeCategory][index] || '');
            await this.writeTypeClipboard(names);
            this.updateStatus?.(tt('Copied {count} type names').replace('{count}', names.length));
        };

        const cutSelected = async () => {
            const category = activeCategory;
            const indices = sortedSelection(category);
            if (!indices.length) return;
            const names = indices.map(index => system[category][index] || '');
            const expectedMutation = mutationGeneration;
            if (!await this.writeTypeClipboard(names)) {
                alert(this._t('db.clipboardWriteFailed'));
                return;
            }
            if (activeCategory !== category || mutationGeneration !== expectedMutation
                || indices.some((index, i) => (system[category][index] || '') !== names[i])) return;
            this.clearTypeNames(system, category, indices);
            mutationGeneration++;
            renderPanel(categoryByKey.get(category));
            this.updateStatus?.(tt('Cut {count} type names').replace('{count}', names.length));
        };

        const pasteSelected = async () => {
            const workspace = detailEl.querySelector('.rr-types-workspace');
            const targetCategory = activeCategory;
            const start = sortedSelection(targetCategory)[0] || 1;
            const expectedMutation = mutationGeneration;
            const requestGeneration = ++pasteGeneration;
            const names = await this.readTypeClipboard();
            const viewer = document.getElementById('database-viewer');
            if (!workspace || !detailEl.contains(workspace) || !viewer?.classList.contains('active')) return;
            if (requestGeneration !== pasteGeneration || mutationGeneration !== expectedMutation) return;
            if (sortedSelection(targetCategory)[0] !== start || system[targetCategory].length - 1 < start) return;
            if (!names.length) {
                alert(tt('No type names in the clipboard.'));
                return;
            }
            const category = categoryByKey.get(targetCategory);
            if (!this.pasteTypeNames(system, targetCategory, start, names)) {
                alert(`${tt('Max:')} ${this.getDatabaseMaximum(targetCategory)}`);
                return;
            }
            mutationGeneration++;
            selections.set(targetCategory, new Set(names.map((_, offset) => start + offset)));
            anchors.set(targetCategory, start);
            renderPanel(category);
            panelFor(targetCategory)?.querySelector(`.rr-types-row[data-index="${start}"]`)?.scrollIntoView({ block: 'nearest' });
            this.updateStatus?.(tt('Pasted {count} type names').replace('{count}', names.length));
        };

        const clearSelected = () => {
            const indices = sortedSelection(activeCategory);
            if (!indices.length) return;
            if (!confirm(tt('Clear {count} selected type names? Numeric IDs will remain in place.').replace('{count}', indices.length))) return;
            this.clearTypeNames(system, activeCategory, indices);
            mutationGeneration++;
            renderPanel(categoryByKey.get(activeCategory));
            this.updateStatus?.(tt('Cleared {count} type names').replace('{count}', indices.length));
        };

        detailEl.querySelector('.rr-types-cut').addEventListener('click', cutSelected);
        detailEl.querySelector('.rr-types-copy').addEventListener('click', copySelected);
        detailEl.querySelector('.rr-types-paste').addEventListener('click', pasteSelected);
        detailEl.querySelector('.rr-types-clear').addEventListener('click', clearSelected);
        categories.forEach(renderPanel);
        setActiveCategory(activeCategory);
    }

    /** Resize a System type array while preserving its reserved zero slot. */
    resizeTypeArray(system, category, newMax) {
        if (!system || !Array.isArray(system[category]) || !Number.isInteger(newMax) || newMax < 1) return false;

        const data = system[category];
        const currentMax = data.length - 1;
        const maximum = this.getDatabaseMaximum(category);
        if (!maximum || (newMax > maximum && newMax > currentMax)) return false;
        const oldLength = data.length;
        data.length = newMax + 1;
        data[0] = '';
        for (let index = oldLength; index < data.length; index++) {
            data[index] = '';
        }
        return true;
    }

    pasteTypeNames(system, category, startIndex, names) {
        if (!system || !Array.isArray(system[category]) || !Number.isInteger(startIndex) || startIndex < 1 || !Array.isArray(names) || !names.length) return false;
        const requiredMax = startIndex + names.length - 1;
        if (requiredMax > system[category].length - 1 && !this.resizeTypeArray(system, category, requiredMax)) return false;
        names.forEach((name, offset) => {
            system[category][startIndex + offset] = String(name ?? '');
        });
        return true;
    }

    clearTypeNames(system, category, indices) {
        if (!system || !Array.isArray(system[category]) || !Array.isArray(indices)) return false;
        indices.forEach(index => {
            if (Number.isInteger(index) && index > 0 && index < system[category].length) system[category][index] = '';
        });
        return true;
    }

    normalizeTypeClipboardText(text) {
        if (typeof text !== 'string') return [];
        if (text === '') return [];
        const names = text.replace(/\r/g, '').split('\n');
        if (names.length > 1 && names[names.length - 1] === '') names.pop();
        return names;
    }

    async writePlainClipboardText(value) {
        const text = String(value ?? '');
        this.plainTextClipboard = text;
        if (text !== this.typeClipboardText) this.typeClipboardUseInternal = false;
        const generation = (this.plainClipboardGeneration || 0) + 1;
        this.plainClipboardGeneration = generation;
        this.plainClipboardWritePending = true;
        const write = async () => {
            let wrote = false;
            try {
                if (typeof nw !== 'undefined' && nw.Clipboard) {
                    nw.Clipboard.get().set(text, 'text');
                    wrote = true;
                }
            } catch (error) {
                console.warn('NW.js clipboard write failed:', error);
            }
            try {
                if (!wrote && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                    wrote = true;
                }
            } catch (error) {
                console.warn('Browser clipboard write failed:', error);
            }
            return wrote;
        };
        const queued = (this._clipboardWriteQueue || Promise.resolve()).catch(() => false).then(write);
        const result = queued.then(wrote => {
            if (generation === this.plainClipboardGeneration) this.plainClipboardWritePending = false;
            return wrote;
        });
        this._clipboardWriteQueue = result;
        return result;
    }

    async readPlainClipboardText() {
        if (this.plainClipboardWritePending) return this.plainTextClipboard || '';
        try {
            if (typeof nw !== 'undefined' && nw.Clipboard) return nw.Clipboard.get().get('text') || '';
        } catch (error) {
            console.warn('NW.js clipboard read failed:', error);
        }
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) return await navigator.clipboard.readText();
        } catch (error) {
            console.warn('Browser clipboard read failed:', error);
        }
        return this.plainTextClipboard || '';
    }

    async writeTypeClipboard(names) {
        this.typeClipboard = names.map(name => String(name ?? ''));
        const text = this.typeClipboard.join('\n');
        this.typeClipboardText = text;
        this.typeClipboardUseInternal = true;
        const generation = (this.typeClipboardGeneration || 0) + 1;
        this.typeClipboardGeneration = generation;
        const wrote = await this.writePlainClipboardText(text);
        if (generation === this.typeClipboardGeneration) this.typeClipboardUseInternal = !wrote;
        return wrote;
    }

    async readTypeClipboard() {
        if (this.plainClipboardWritePending) {
            if (this.plainTextClipboard === this.typeClipboardText && Array.isArray(this.typeClipboard)) return this.typeClipboard.slice();
            return this.normalizeTypeClipboardText(this.plainTextClipboard || '');
        }
        if (this.typeClipboardUseInternal && this.plainTextClipboard === this.typeClipboardText && Array.isArray(this.typeClipboard)) {
            this.typeClipboardUseInternal = false;
            return this.typeClipboard.slice();
        }
        let text = null;
        let readSystemClipboard = false;
        try {
            if (typeof nw !== 'undefined' && nw.Clipboard) {
                text = nw.Clipboard.get().get('text');
                readSystemClipboard = true;
            }
        } catch (error) {
            console.warn('NW.js type clipboard read failed:', error);
        }
        try {
            if (!readSystemClipboard && typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
                text = await navigator.clipboard.readText();
                readSystemClipboard = true;
            }
        } catch (error) {
            console.warn('Browser type clipboard read failed:', error);
        }
        if (readSystemClipboard) {
            if (text === this.typeClipboardText && Array.isArray(this.typeClipboard)) return this.typeClipboard.slice();
            return this.normalizeTypeClipboardText(text || '');
        }
        if (this.plainTextClipboard === this.typeClipboardText && Array.isArray(this.typeClipboard)) return this.typeClipboard.slice();
        return this.normalizeTypeClipboardText(this.plainTextClipboard || '');
    }

    /**
     * Show Terms editor (Basic, Commands, Parameters)
     */
    showTermsEditor() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const system = this.databaseManager.getSystem();
        if (!system || !system.terms) {
            alert(tt('Terms data not loaded'));
            return;
        }

        const { detailEl } = this.prepareDatabaseSection('terms', this._dbTitle('terms', 'Terms'), { showListPanel: false });
        const terms = system.terms;
        const arrays = {
            basic: [
                'Level', 'Level (Abbreviation)', 'HP', 'HP (Abbreviation)',
                'MP', 'MP (Abbreviation)', 'TP', 'TP (Abbreviation)',
                'EXP', 'EXP (Abbreviation)'
            ],
            params: [
                'Max HP', 'Max MP', 'Attack', 'Defense', 'Magic Attack',
                'Magic Defense', 'Agility', 'Luck', 'Hit', 'Evasion'
            ],
            commands: [
                'Fight', 'Escape', 'Attack', 'Guard', 'Item', 'Skill', 'Equip',
                'Status', 'Formation', 'Save', 'Game End', 'Options', 'Weapon',
                'Armor', 'Key Item', 'Equip', 'Optimize', 'Clear', 'New Game',
                'Continue', '(Reserved)', 'To Title', 'Cancel', '(Reserved)', 'Buy', 'Sell'
            ]
        };
        const messageGroups = [
            { label: 'Options Menu', fields: [
                ['alwaysDash', 'Always Dash'], ['commandRemember', 'Command Remember'], ['touchUI', 'Touch UI']
            ]},
            { label: 'Audio Volume', fields: [
                ['bgmVolume', 'BGM Volume'], ['bgsVolume', 'BGS Volume'], ['meVolume', 'ME Volume'], ['seVolume', 'SE Volume']
            ]},
            { label: 'Menu & Save / Load', fields: [
                ['possession', 'Possession'], ['expTotal', 'EXP Total'], ['expNext', 'EXP To Next'],
                ['saveMessage', 'Save Message'], ['loadMessage', 'Load Message'], ['file', 'File'],
                ['autosave', 'Autosave'], ['partyName', 'Party Name']
            ]},
            { label: 'Battle Flow', fields: [
                ['emerge', 'Enemy Emerge'], ['preemptive', 'Preemptive Attack'], ['surprise', 'Surprise Attack'],
                ['escapeStart', 'Escape Start'], ['escapeFailure', 'Escape Failure'], ['victory', 'Victory'],
                ['defeat', 'Defeat'], ['obtainExp', 'Obtain EXP'], ['obtainGold', 'Obtain Gold'],
                ['obtainItem', 'Obtain Item'], ['levelUp', 'Level Up'], ['obtainSkill', 'Obtain Skill'],
                ['useItem', 'Use Item']
            ]},
            { label: 'Battle Damage', fields: [
                ['criticalToEnemy', 'Critical To Enemy'], ['criticalToActor', 'Critical To Actor'],
                ['actorDamage', 'Actor Damage'], ['actorRecovery', 'Actor Recovery'], ['actorGain', 'Actor Gain'],
                ['actorLoss', 'Actor Loss'], ['actorDrain', 'Actor Drain'], ['actorNoDamage', 'Actor No Damage'],
                ['actorNoHit', 'Actor No Hit'], ['enemyDamage', 'Enemy Damage'], ['enemyRecovery', 'Enemy Recovery'],
                ['enemyGain', 'Enemy Gain'], ['enemyLoss', 'Enemy Loss'], ['enemyDrain', 'Enemy Drain'],
                ['enemyNoDamage', 'Enemy No Damage'], ['enemyNoHit', 'Enemy No Hit']
            ]},
            { label: 'Battle Effects', fields: [
                ['evasion', 'Evasion'], ['magicEvasion', 'Magic Evasion'], ['magicReflection', 'Magic Reflection'],
                ['counterAttack', 'Counter Attack'], ['substitute', 'Substitute'], ['buffAdd', 'Buff Add'],
                ['debuffAdd', 'Debuff Add'], ['buffRemove', 'Buff Remove'], ['actionFailure', 'Action Failure']
            ]}
        ];

        Object.entries(arrays).forEach(([key, labels]) => {
            if (!Array.isArray(terms[key])) terms[key] = [];
            while (terms[key].length < labels.length) terms[key].push('');
        });
        if (!terms.messages || typeof terms.messages !== 'object') terms.messages = {};

        const renderArrayFields = (category, labels, className = '') => labels.map((label, index) => `
            <label class="rr-term-field ${className}" title="${rrEscapeHtml(tt(label))}">
                <span>${tt(label)}</span>
                <input type="text" class="database-field-value rr-term-input" data-category="${category}" data-index="${index}" value="${rrEscapeHtml(terms[category][index] || '')}" placeholder="${tt('(default)')}">
            </label>
        `).join('');

        const messagesHtml = messageGroups.map(group => `
            <div class="rr-terms-message-group">${tt(group.label)}</div>
            ${group.fields.map(([key, label]) => `
                <label class="rr-terms-message-row" title="${rrEscapeHtml(tt(label))}">
                    <span>${tt(label)}</span>
                    <input type="text" class="rr-term-message-input" data-key="${key}" value="${rrEscapeHtml(terms.messages[key] || '')}" placeholder="${tt('(default)')}">
                </label>
            `).join('')}
        `).join('');

        detailEl.innerHTML = `
            <div class="rr-terms-workspace">
                <div class="rr-terms-left">
                    <div class="rr-terms-top-grid">
                        <section class="rr-terms-panel">
                            <header>${tt('Basic Statuses')}</header>
                            <div class="rr-terms-fields rr-terms-fields-two">${renderArrayFields('basic', arrays.basic)}</div>
                        </section>
                        <section class="rr-terms-panel">
                            <header>${tt('Parameters')}</header>
                            <div class="rr-terms-fields rr-terms-fields-two">${renderArrayFields('params', arrays.params)}</div>
                        </section>
                    </div>
                    <section class="rr-terms-panel rr-terms-commands-panel">
                        <header>${tt('Commands')}</header>
                        <div class="rr-terms-fields rr-terms-fields-four">${renderArrayFields('commands', arrays.commands)}</div>
                    </section>
                </div>
                <section class="rr-terms-panel rr-terms-messages-panel">
                    <header>${tt('Messages')}</header>
                    <div class="rr-terms-message-columns"><span>${tt('Type')}</span><span>${tt('Text')}</span></div>
                    <div class="rr-terms-message-list">${messagesHtml}</div>
                </section>
            </div>
        `;

        detailEl.querySelectorAll('.rr-term-input').forEach(input => {
            input.addEventListener('input', () => {
                terms[input.dataset.category][Number(input.dataset.index)] = input.value;
            });
            this.attachTextFieldContextMenu(input);
        });
        detailEl.querySelectorAll('.rr-term-message-input').forEach(input => {
            input.addEventListener('input', () => {
                terms.messages[input.dataset.key] = input.value;
            });
            this.attachTextFieldContextMenu(input);
        });
    }

    /**
     * Show detail for a specific terms category. Terms have a fixed schema in
     * MZ: basic[8], commands[23], params[10] are arrays; messages is a keyed
     * object (alwaysDash, touchUI, victory, etc.). Persistence is direct
     * mutation of the system.terms object on every keystroke.
     */
    showTermDetail(terms, category) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const detailEl = document.getElementById('database-detail');

        const arrayCategoryMeta = {
            basic: {
                title: tt('Basic Terms'),
                description: tt('Labels shown on status panels, level-up screens, and the bestiary.'),
                labels: [
                    'Level', 'Level (Abbreviation)', 'HP', 'HP (Abbreviation)',
                    'MP', 'MP (Abbreviation)', 'TP', 'TP (Abbreviation)',
                    'EXP', 'EXP (Abbreviation)'
                ].map(tt)
            },
            commands: {
                title: tt('Command Terms'),
                description: tt('Battle command and menu labels.'),
                labels: [
                    'Fight',         'Escape',        'Attack',        'Guard',
                    'Item',          'Skill',         'Equip',         'Status',
                    'Formation',     'Save',          'Game End',      'Options',
                    'Weapon',        'Armor',         'Key Item',      'Equip',
                    'Optimize',      'Clear',         'New Game',      'Continue',
                    '(Reserved)',    'To Title',      'Cancel',        '(Reserved)',
                    'Buy',           'Sell'
                ].map(tt)
            },
            params: {
                title: tt('Parameters'),
                description: tt('Stat names used in the status menu, equipment screen, and damage formulas.'),
                labels: [
                    'Max HP', 'Max MP', 'Attack', 'Defense',
                    'Magic Attack', 'Magic Defense', 'Agility', 'Luck',
                    'Hit',           'Evasion'
                ].map(tt)
            }
        };

        // Object-keyed Messages schema. Groups are presentation-only.
        // hint shows what %1 / %2 / %3 will be replaced with at runtime.
        const messagesSchema = {
            title: tt('Messages'),
            description: tt('Game messages and option labels. %1, %2, %3 are placeholders the engine fills in at runtime (e.g. "%1 took %2 damage!" → "Harold took 25 damage!"). The hint under each field shows what each placeholder becomes.'),
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
                    <div style="font-size: 12px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--color-accent-border-mid);">${tt(group.label)}</div>
                `;
                group.fields.forEach(field => {
                    const value = data[field.key] != null ? String(data[field.key]) : '';
                    const hintHtml = field.hint
                        ? `<div style="grid-column: 2; font-size: 11px; color: var(--color-text-muted); margin-top: 3px;">${tt(field.hint)}</div>`
                        : '';
                    bodyHtml += `
                        <div style="display: grid; grid-template-columns: 200px 1fr; gap: 12px 12px; align-items: center; padding: 6px 12px; background: var(--color-bg-list-item); border: 1px solid var(--color-border); border-radius: 3px; margin-bottom: 4px;">
                            <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600;">${tt(field.label)}</div>
                            <input type="text" class="rr-terms-msg-input database-field-value" data-key="${field.key}" value="${rrEscapeHtml(value)}" placeholder="${tt('(default)')}">
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
            const label = meta.labels[index] ? tt(meta.labels[index]) : `${tt('Slot')} ${index}`;
            rowsHtml += `
                <div style="display: grid; grid-template-columns: 48px 180px 1fr; gap: 12px; align-items: center; padding: 8px 12px; background: var(--color-bg-list-item); border: 1px solid var(--color-border); border-radius: 3px; margin-bottom: 6px;">
                    <div style="text-align: center; font-size: 11px; color: var(--color-text-muted); font-family: var(--font-mono); padding: 4px 0; background: var(--color-bg-deep); border-radius: 3px; border: 1px solid var(--color-border-subtle);">${String(index).padStart(3, '0')}</div>
                    <div style="font-size: 12px; color: var(--color-text-muted); font-weight: 600;">${label}</div>
                    <input type="text" class="rr-terms-input database-field-value" data-index="${index}" value="${rrEscapeHtml(value)}" placeholder="${tt('(default)')}">
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
