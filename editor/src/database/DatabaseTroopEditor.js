/**
 * DatabaseTroopEditor - Full visual troop editor
 * Layout: top bar (name + members + battleback + note), battle preview canvas,
 * interactive battle events with command picker support.
 */

class DatabaseTroopEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;

        this.currentTroop = null;
        this.currentTroopId = null;

        // Canvas
        this.canvas = null;
        this.ctx = null;
        this.battleback1Img = null;
        this.battleback2Img = null;
        this.enemySpriteImages = {};
        this.selectedMemberIndex = -1;
        this.enemySpriteBounds = [];
        this.memberClipboard = null;

        // Drag
        this.isDragging = false;
        this.dragMemberIndex = -1;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Battleback
        this.battleback1Name = '';
        this.battleback2Name = '';

        // Battle events
        this.currentBattlePageIndex = 0;
        this.battlePageClipboard = null;

        // Command list state
        this.commandPicker = null;
        this.selectedCommandIndices = [];
        this.commandSelectionAnchor = null;
        this.commandClipboard = null;
        this._editors = {};
    }

    // ==========================================
    // MAIN ENTRY
    // ==========================================

    showTroopDetail(container, troop) {
        // Always fetch fresh data from database in case persisted changes replaced the reference
        const fresh = this.databaseManager.getTroop(troop.id);
        this.currentTroop = JSON.parse(JSON.stringify(fresh || troop));
        this.currentTroopId = troop.id;
        this.currentBattlePageIndex = 0;
        this.enemySpriteImages = {};
        this.enemySpriteBounds = [];
        this.selectedMemberIndex = -1;
        this.selectedCommandIndices = [];
        this.commandSelectionAnchor = null;

        const system = this.databaseManager.getSystem();
        this.battleback1Name = (system && system.battleback1Name) || '';
        this.battleback2Name = (system && system.battleback2Name) || '';

        this.configureBattleGeometry(system);
        this.showBattleUI = this.loadBattleUIPreference();
        this.battleUISetup = null;
        this.actorBattlerImages = {};
        this.actorFaceImages = {};

        const wrapper = document.createElement('div');
        wrapper.className = 'rr-troop-editor';
        wrapper.style.cssText = 'display:flex;flex-direction:column;min-height:100%;padding:clamp(8px,1.2vw,14px);gap:8px;box-sizing:border-box;';

        // Row 1: Name
        wrapper.appendChild(this.createNameRow());

        // Main workspace: battle preview with a compact control sidebar.
        const upperWorkspace = document.createElement('div');
        upperWorkspace.className = 'rr-troop-upper-workspace';
        upperWorkspace.appendChild(this.createBattlePreview());
        upperWorkspace.appendChild(this.createTopBar());
        wrapper.appendChild(upperWorkspace);

        // Battle Events
        wrapper.appendChild(this.createBattleEventsSection());

        container.appendChild(wrapper);

        this.attachMainListeners(container);
        setTimeout(() => this.loadAndRenderCanvas(), 50);
    }

    createNameRow() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
        row.innerHTML = `
            <label class="database-field-label" style="flex-shrink: 0;">${tt('Name:')}</label>
            <input type="text" class="database-field-value" id="troop-name-input"
                   value="${this.escapeHTML(this.currentTroop.name || '')}" style="flex: 1;">
        `;
        return row;
    }

    createTopBar() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const bar = document.createElement('div');
        bar.className = 'rr-troop-sidebar';
        bar.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:0;';

        // Keep the primary action at the top of the sidebar.
        const battleTestBtn = document.createElement('button');
        battleTestBtn.textContent = tt('Battle Test...');
        battleTestBtn.className = 'rr-btn-secondary';
        battleTestBtn.onclick = () => this.openBattleTestConfig();
        bar.appendChild(battleTestBtn);

        bar.appendChild(this.createMembersSection());
        bar.appendChild(this.createBattlebackSection());

        // Note
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.style.cssText = 'width:100%;min-width:0;';
        noteSection.innerHTML = `
            <div class="database-section-header">${tt('Note')}</div>
            <div class="database-section-content">
                <textarea class="database-field-value" id="troop-note-input" rows="2"
                          style="width: 100%; box-sizing: border-box; resize: vertical;">${this.escapeHTML(this.currentTroop.note || '')}</textarea>
            </div>
        `;
        bar.appendChild(noteSection);
        return bar;
    }

    // ==========================================
    // MEMBERS SECTION
    // ==========================================

    createMembersSection() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.cssText = 'width:100%;min-width:0;max-width:none;flex-shrink:0;';

        section.innerHTML = `<div class="database-section-header">${tt('Members')}</div>`;

        const content = document.createElement('div');
        content.className = 'database-section-content';

        // Enemy picker action
        const addRow = document.createElement('div');
        addRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;';
        const addBtn = this.createSmallButton('Add', () => this.showEnemyPicker());
        addBtn.style.flex = '1';
        addRow.appendChild(addBtn);
        content.appendChild(addRow);

        // Members list
        const membersList = document.createElement('div');
        membersList.id = 'troop-members-list';
        membersList.tabIndex = -1;
        membersList.style.cssText = 'max-height:120px;overflow-y:auto;outline:none;';
        membersList.addEventListener('keydown', (e) => this.handleMemberKeyDown(e));
        membersList.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            membersList.focus({ preventScroll: true });
            const row = e.target.closest('.troop-member-row');
            if (row && membersList.contains(row)) {
                this.selectedMemberIndex = Number(row.dataset.memberIndex);
                this.highlightMemberRow(this.selectedMemberIndex);
                this.renderCanvas();
            }
            this.showMemberContextMenu(e.clientX, e.clientY);
        });
        this.populateMembersList(membersList);
        content.appendChild(membersList);

        section.appendChild(content);
        return section;
    }

    populateMembersList(listEl) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (!listEl) listEl = document.getElementById('troop-members-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        const enemies = this.databaseManager.getEnemies();
        const members = this.currentTroop.members || [];

        if (members.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; color: var(--color-text-muted); padding: 8px; font-size: 11px;">${tt('No members')}</div>`;
            return;
        }

        members.forEach((member, idx) => {
            const enemy = enemies.find(e => e && e.id === member.enemyId);
            const entryLabels = enemy ? this.databaseEntryLabels(enemy, 'enemies') : null;
            const enemyName = enemy ? `#${member.enemyId} ${entryLabels.primary || enemy.name}` : `${tt('Enemy')} #${member.enemyId}`;

            const row = document.createElement('div');
            row.className = 'troop-member-row';
            row.dataset.memberIndex = idx;
            row.style.cssText = `
                display: flex; align-items: center; gap: 4px; padding: 3px 6px;
                border-bottom: 1px solid var(--color-border); font-size: 11px; cursor: pointer;
                ${idx === this.selectedMemberIndex ? 'background-color: var(--color-accent-tint-15);' : ''}
            `;
            row.onmouseenter = () => { if (idx !== this.selectedMemberIndex) row.style.backgroundColor = 'var(--color-bg-button)'; };
            row.onmouseleave = () => { if (idx !== this.selectedMemberIndex) row.style.backgroundColor = ''; };
            row.onclick = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
                listEl.focus({ preventScroll: true });
                this.selectedMemberIndex = idx;
                this.highlightMemberRow(idx);
                this.renderCanvas();
            };
            row.ondblclick = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
                this.selectedMemberIndex = idx;
                this.showEnemyPicker(idx);
            };

            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = 'flex: 1; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            nameSpan.textContent = `${idx + 1}. ${enemyName}`;
            row.appendChild(nameSpan);

            const posSpan = document.createElement('span');
            posSpan.className = 'member-pos-display';
            posSpan.dataset.memberIndex = idx;
            posSpan.style.cssText = 'color: var(--color-text-muted); font-size: 10px; flex-shrink: 0;';
            posSpan.textContent = `(${member.x},${member.y})`;
            row.appendChild(posSpan);

            // Replace enemy button
            const replaceBtn = document.createElement('button');
            replaceBtn.textContent = '\u21C4';
            replaceBtn.title = tt('Replace Enemy');
            replaceBtn.style.cssText = 'width: 18px; height: 18px; padding: 0; border: 1px solid var(--color-border-input); background: var(--color-border-subtle); color: var(--color-syntax-type); cursor: pointer; font-size: 12px; line-height: 1; border-radius: 3px; flex-shrink: 0;';
            replaceBtn.onmouseenter = () => { replaceBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; };
            replaceBtn.onmouseleave = () => { replaceBtn.style.backgroundColor = 'var(--color-border-subtle)'; };
            replaceBtn.onclick = (e) => {
                e.stopPropagation();
                this.selectedMemberIndex = idx;
                this.showEnemyPicker(idx);
            };
            row.appendChild(replaceBtn);

            // Visibility toggle (eyeball icon)
            const visBtn = document.createElement('button');
            visBtn.title = member.hidden ? tt('Show') : tt('Hide');
            visBtn.innerHTML = member.hidden
                ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-dim)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
                : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
            visBtn.style.cssText = `width: 18px; height: 18px; padding: 0; border: 1px solid var(--color-border-input); background: ${member.hidden ? 'var(--color-danger-bg-deep)' : 'var(--color-border-subtle)'}; cursor: pointer; line-height: 1; border-radius: 3px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;`;
            visBtn.onmouseenter = () => { visBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; };
            visBtn.onmouseleave = () => { visBtn.style.backgroundColor = member.hidden ? 'var(--color-danger-bg-deep)' : 'var(--color-border-subtle)'; };
            visBtn.onclick = (e) => {
                e.stopPropagation();
                this.currentTroop.members[idx].hidden = !this.currentTroop.members[idx].hidden;
                this.persistTroop();
                this.populateMembersList();
                this.renderCanvas();
            };
            row.appendChild(visBtn);

            const removeBtn = document.createElement('button');
            removeBtn.textContent = '\u00D7';
            removeBtn.title = tt('Remove');
            removeBtn.style.cssText = 'width: 18px; height: 18px; padding: 0; border: 1px solid var(--color-border-input); background: var(--color-border-subtle); color: #f44; cursor: pointer; font-size: 13px; line-height: 1; border-radius: 3px; flex-shrink: 0;';
            removeBtn.onclick = (e) => { e.stopPropagation(); this.removeMember(idx); };
            row.appendChild(removeBtn);

            listEl.appendChild(row);
        });
    }

    addMember(enemyId) {
        enemyId = parseInt(enemyId);
        if (!enemyId || isNaN(enemyId)) return;

        if (!this.currentTroop.members) {
            this.currentTroop.members = [];
        }

        const count = this.currentTroop.members.length;
        const offsetX = (count % 4) * 100 - 150;
        const offsetY = Math.floor(count / 4) * 80;
        this.currentTroop.members.push({
            enemyId: enemyId,
            x: Math.round(this.boxWidth / 2 + offsetX),
            y: Math.round(this.boxHeight / 2 + offsetY),
            hidden: false
        });
        this.selectedMemberIndex = this.currentTroop.members.length - 1;

        this.persistTroop();
        this.populateMembersList();
        this.loadAndRenderCanvas();
    }

    removeMember(idx) {
        if (!this.currentTroop.members || idx < 0 || idx >= this.currentTroop.members.length) return false;
        this.currentTroop.members.splice(idx, 1);
        if (this.selectedMemberIndex === idx) this.selectedMemberIndex = -1;
        else if (this.selectedMemberIndex > idx) this.selectedMemberIndex--;
        this.persistTroop();
        this.populateMembersList();
        this.renderCanvas();
        return true;
    }

    // DatabaseEditorUI owns editor names: the store, the display mode, and the three
    // orderings. Delegate rather than reimplement. The copy this replaced had already
    // drifted from the owner on the day it was written -- it resolved the unnamed
    // string by phrase where the owner resolves it by key -- and nothing but a test
    // could reach it, because the one construction site always passes a parent.
    // Without a parent there is no names store to read, so the game name is the whole
    // answer and there is no secondary.
    databaseEntryLabels(entry, type) {
        if (typeof this.parentEditor?.databaseEntryLabels === 'function') {
            return this.parentEditor.databaseEntryLabels(entry, type);
        }
        return { primary: String(entry?.name || ''), secondary: '', editorName: '' };
    }

    showEnemyPicker(memberIdx = null) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const replacing = Number.isInteger(memberIdx);
        const member = replacing ? this.currentTroop.members?.[memberIdx] : null;
        if (replacing && !member) return;
        const enemies = this.databaseManager.getEnemies().filter(enemy => enemy && enemy.id > 0);
        const enemyLabels = new Map();
        const labels = enemies.map(enemy => {
            const entryLabels = this.databaseEntryLabels(enemy, 'enemies');
            const primary = entryLabels.primary || enemy.name || tt('Enemy');
            // An enemy whose editor name matches its game name would otherwise read
            // "Goblin (Goblin)". RRPluginDataRefs.labelForEntry drops the parenthetical
            // on the same test.
            const alt = entryLabels.secondary && entryLabels.secondary !== primary
                ? ` (${entryLabels.secondary})` : '';
            const label = `${primary}${alt} [#${String(enemy.id).padStart(4, '0')}]`;
            enemyLabels.set(label, enemy);
            return label;
        });

        // Modal overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.8); display: flex; align-items: center;
            justify-content: center; z-index: 10005;
        `;

        const dialog = document.createElement('div');
        dialog.className = 'rr-modal';
        dialog.style.cssText = 'width:min(900px,94vw);height:min(660px,86vh);';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.textContent = replacing ? tt('Replace Enemy') : `${tt('Select')} ${tt('Enemy')}`;
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '\u00d7';
        closeBtn.className = 'rr-modal-close';
        header.appendChild(title);
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        // Enemy list + preview area
        const body = document.createElement('div');
        body.style.cssText = 'display: flex; flex: 1; overflow: hidden; min-height: 0;';

        // Left: scrollable enemy list
        const listPanel = document.createElement('div');
        listPanel.style.cssText = 'flex:0 1 380px;min-width:220px;display:flex;flex-direction:column;border-right:1px solid var(--color-border);';

        // Right: preview panel
        const previewPanel = document.createElement('div');
        previewPanel.style.cssText = `
            flex:1;min-width:0;display:flex;flex-direction:column;
            align-items: center; justify-content: center; padding: 16px;
            background:var(--color-bg-panel);gap:8px;overflow:auto;
        `;
        previewPanel.innerHTML = `<span style="color: var(--color-text-dim); font-size: 11px;">${tt('Select an enemy')}</span>`;

        let selectedEnemyId = member?.enemyId || enemies[0]?.id || 0;

        // Show preview for an enemy
        const showPreview = (enemy) => {
            previewPanel.innerHTML = '';

            const entryLabels = this.databaseEntryLabels(enemy, 'enemies');
            const primary = entryLabels.primary || enemy.name || tt('Enemy');

            const nameLabel = document.createElement('div');
            nameLabel.style.cssText = 'color: var(--color-accent-bright); font-size: 12px; font-weight: 600; text-align: center; word-break: break-word;';
            nameLabel.textContent = `#${enemy.id} ${primary}`;
            previewPanel.appendChild(nameLabel);

            // Styled here rather than with .database-list-alt: that class is written for
            // a horizontal list row -- flex: 0 1 40%, margin-left: 6px, and nowrap with
            // an ellipsis -- and this panel is a centred column, where those would push
            // the label off-centre and truncate a long name instead of wrapping it.
            if (entryLabels.secondary && entryLabels.secondary !== primary) {
                const altLabel = document.createElement('div');
                altLabel.style.cssText = 'color: var(--color-text-muted); font-size: 11px; text-align: center; word-break: break-word;';
                altLabel.textContent = entryLabels.secondary;
                previewPanel.appendChild(altLabel);
            }

            const imgContainer = document.createElement('div');
            imgContainer.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center; min-height: 80px;';

            const battlerPath = this.getEnemyBattlerUrl(enemy);
            if (battlerPath) {
                const img = document.createElement('img');
                img.src = battlerPath;
                img.style.cssText = 'max-width:min(360px,100%);max-height:300px;image-rendering:pixelated;object-fit:contain;';
                img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { textContent: tt('No preview'), style: 'color: var(--color-text-dim); font-size: 11px;' })); };
                imgContainer.appendChild(img);
            } else {
                imgContainer.innerHTML = `<span style="color: var(--color-text-dim); font-size: 11px;">${tt('No battler image')}</span>`;
            }
            previewPanel.appendChild(imgContainer);

            // Stats summary
            if (enemy.params) {
                const stats = document.createElement('div');
                stats.style.cssText = 'color: var(--color-text-muted); font-size: 10px; text-align: center; line-height: 1.5;';
                const paramNames = ['HP', 'MP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'];
                stats.textContent = paramNames.map((n, i) => `${tt(n)}:${enemy.params[i] || 0}`).join(' ');
                previewPanel.appendChild(stats);
            }
        };

        const selectedLabel = labels.find(label => enemyLabels.get(label)?.id === selectedEnemyId) || '';
        const browser = RRPickerIndex.createBrowser({
            files: labels,
            selectedName: selectedLabel,
            searchPlaceholder: tt('Search enemies...'),
            emptyText: tt('No matches'),
            onSelect: label => {
                const enemy = enemyLabels.get(label);
                if (!enemy) return;
                selectedEnemyId = enemy.id;
                showPreview(enemy);
            }
        });
        listPanel.appendChild(browser.element);

        body.appendChild(listPanel);
        body.appendChild(previewPanel);
        dialog.appendChild(body);

        // Footer buttons
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        footer.style.flexShrink = '0';

        const cancelBtn = this.createButton('Cancel', () => close());
        const okBtn = this.createButton('OK', () => confirmAndClose());
        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        dialog.appendChild(footer);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        const confirmAndClose = () => {
            if (!selectedEnemyId) return;
            if (replacing) this.replaceMember(memberIdx, selectedEnemyId);
            else this.addMember(selectedEnemyId);
            close();
        };

        closeBtn.onclick = close;
        // A click on the backdrop no longer closes the dialog: close deliberately.
        overlay.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
            } else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
                e.preventDefault();
                confirmAndClose();
            }
        });
        browser.list.addEventListener('dblclick', e => {
            const item = e.target.closest('.rr-picker-file-item');
            const enemy = item ? enemyLabels.get(item.dataset.fileName) : null;
            if (!enemy) return;
            selectedEnemyId = enemy.id;
            confirmAndClose();
        });

        const selectedEnemy = enemies.find(enemy => enemy.id === selectedEnemyId);
        if (selectedEnemy) showPreview(selectedEnemy);
        requestAnimationFrame(() => {
            if (selectedLabel) browser.scrollTo(selectedLabel);
            browser.searchInput.focus();
        });
    }

    getEnemyBattlerUrl(enemy) {
        const project = this.projectManager.getCurrentProject();
        if (!enemy?.battlerName || !project) return null;
        const path = require('path');
        const searchDirs = this.sideView
            ? ['sv_enemies', 'enemies', 'characters']
            : ['enemies', 'sv_enemies', 'characters'];
        for (const dir of searchDirs) {
            const file = RRAssetFiles.findImage(path.join(project.path, 'img', dir), enemy.battlerName);
            if (file) return RRAssetFiles.toUrl(file.absolutePath);
        }
        return null;
    }

    replaceMember(idx, newEnemyId) {
        const member = this.currentTroop.members[idx];
        if (!member) return;
        member.enemyId = newEnemyId;
        this.persistTroop();
        this.populateMembersList();
        this.loadAndRenderCanvas();
    }

    copyMember(idx = this.selectedMemberIndex) {
        const member = this.currentTroop.members?.[idx];
        if (!member) return false;
        this.memberClipboard = JSON.parse(JSON.stringify(member));
        return true;
    }

    cutMember(idx = this.selectedMemberIndex) {
        if (!this.copyMember(idx)) return false;
        this.removeMember(idx);
        return true;
    }

    pasteMember(afterIdx = this.selectedMemberIndex) {
        if (!this.memberClipboard) return false;
        if (!this.currentTroop.members) this.currentTroop.members = [];
        const member = JSON.parse(JSON.stringify(this.memberClipboard));
        member.x = Math.round(Math.max(0, Math.min(this.boxWidth, (Number(member.x) || 0) + 16)));
        member.y = Math.round(Math.max(0, Math.min(this.boxHeight, (Number(member.y) || 0) + 16)));
        const insertAt = afterIdx >= 0 && afterIdx < this.currentTroop.members.length
            ? afterIdx + 1
            : this.currentTroop.members.length;
        this.currentTroop.members.splice(insertAt, 0, member);
        this.selectedMemberIndex = insertAt;
        this.persistTroop();
        this.populateMembersList();
        this.loadAndRenderCanvas();
        return true;
    }

    handleMemberKeyDown(e) {
        const target = e.target;
        if (target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
        const key = e.key.toLowerCase();
        const modified = e.ctrlKey || e.metaKey;
        const handled = e.key === 'Delete'
            || e.key === 'Enter'
            || (modified && ['c', 'x', 'v'].includes(key));
        if (!handled) return;
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Delete') this.removeMember(this.selectedMemberIndex);
        else if (e.key === 'Enter' && this.selectedMemberIndex >= 0) this.showEnemyPicker(this.selectedMemberIndex);
        else if (modified && key === 'c') this.copyMember();
        else if (modified && key === 'x') this.cutMember();
        else if (modified && key === 'v') this.pasteMember();
    }

    showMemberContextMenu(x, y) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        document.querySelector('.troop-member-context-menu')?.remove();
        const hasSelection = !!this.currentTroop.members?.[this.selectedMemberIndex];
        const menu = document.createElement('div');
        menu.className = 'troop-member-context-menu';
        menu.style.cssText = 'position:fixed;background:var(--color-bg-menubar);border:1px solid var(--color-accent-bright);border-radius:4px;padding:4px 0;z-index:10004;min-width:160px;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
        const items = [
            { label: 'Add', action: () => this.showEnemyPicker() },
            { label: 'Replace Enemy', action: () => this.showEnemyPicker(this.selectedMemberIndex), disabled: !hasSelection },
            { divider: true },
            { label: 'Cut', action: () => this.cutMember(), disabled: !hasSelection },
            { label: 'Copy', action: () => this.copyMember(), disabled: !hasSelection },
            { label: 'Paste', action: () => this.pasteMember(), disabled: !this.memberClipboard },
            { label: 'Delete', action: () => this.removeMember(this.selectedMemberIndex), disabled: !hasSelection }
        ];
        for (const item of items) {
            if (item.divider) {
                const divider = document.createElement('div');
                divider.style.cssText = 'height:1px;background:var(--color-border);margin:4px 0;';
                menu.appendChild(divider);
                continue;
            }
            const entry = document.createElement('div');
            entry.textContent = tt(item.label);
            entry.style.cssText = `padding:6px 16px;color:${item.disabled ? 'var(--color-text-dim)' : 'var(--color-text-strong)'};cursor:${item.disabled ? 'default' : 'pointer'};font-size:12px;`;
            if (!item.disabled) {
                entry.onmouseenter = () => { entry.style.background = 'var(--color-accent-tint-25)'; };
                entry.onmouseleave = () => { entry.style.background = ''; };
                entry.onclick = () => { menu.remove(); item.action(); };
            }
            menu.appendChild(entry);
        }
        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - rect.width - 4))}px`;
        menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - rect.height - 4))}px`;
        const closeMenu = event => {
            if (menu.contains(event.target)) return;
            menu.remove();
            document.removeEventListener('pointerdown', closeMenu);
        };
        setTimeout(() => document.addEventListener('pointerdown', closeMenu), 0);
    }

    highlightMemberRow(selectedIdx) {
        document.querySelectorAll('.troop-member-row').forEach(row => {
            const idx = parseInt(row.dataset.memberIndex);
            row.style.backgroundColor = idx === selectedIdx ? 'var(--color-accent-tint-15)' : '';
        });
    }

    updateMemberPositionDisplay(memberIndex, x, y) {
        const posEl = document.querySelector(`.member-pos-display[data-member-index="${memberIndex}"]`);
        if (posEl) posEl.textContent = `(${x},${y})`;
    }

    // ==========================================
    // BATTLEBACK SELECTORS
    // ==========================================

    createBattlebackSection() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.cssText = 'width:100%;min-width:0;max-width:none;flex-shrink:0;';

        section.innerHTML = `<div class="database-section-header">${tt('Battleback')}</div>`;

        const content = document.createElement('div');
        content.className = 'database-section-content';

        const project = this.projectManager.getCurrentProject();
        const bb1Files = this.scanImageDir(project, 'battlebacks1');
        const bb2Files = this.scanImageDir(project, 'battlebacks2');

        // Lower Layer (battleback1)
        content.appendChild(this.createBBSelect('Lower Layer:', 'troop-bb1-select', bb1Files, this.battleback1Name, (val) => {
            this.battleback1Name = val;
            this.loadAndRenderCanvas();
        }, 1));

        // Upper Layer (battleback2)
        content.appendChild(this.createBBSelect('Upper Layer:', 'troop-bb2-select', bb2Files, this.battleback2Name, (val) => {
            this.battleback2Name = val;
            this.loadAndRenderCanvas();
        }, 2));

        section.appendChild(content);
        return section;
    }

    createBBSelect(label, id, files, currentVal, onChange, layer) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const row = document.createElement('div');
        row.style.cssText = 'margin-bottom: 6px;';
        row.innerHTML = `<label class="database-field-label" style="display: block; margin-bottom: 2px; font-size: 11px;">${tt(label)}</label>`;
        const select = document.createElement('select');
        select.id = id;
        select.style.cssText = 'width: 100%; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 3px; border-radius: 3px; font-size: 11px;';
        select.innerHTML = `<option value="">${tt('(None)')}</option>`;
        files.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            if (f === currentVal) opt.selected = true;
            select.appendChild(opt);
        });
        select.onchange = () => onChange(select.value);
        row.appendChild(select);
        const browse = document.createElement('button');
        browse.type = 'button';
        browse.className = 'troop-bb-browse-btn';
        browse.dataset.layer = String(layer);
        browse.textContent = tt('Browse…');
        browse.style.cssText = 'margin-top: 3px; width: 100%; background: var(--color-border-subtle); border: 1px solid var(--color-border-input); color: var(--color-text-strong); padding: 3px; border-radius: 3px; font-size: 11px; cursor: pointer;';
        browse.addEventListener('click', () => this.openBattlebackPicker(layer, select, onChange));
        row.appendChild(browse);
        return row;
    }

    openBattlebackPicker(layer, select, onChange) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const project = this.projectManager?.getCurrentProject?.();
        if (!project?.path || typeof this.parentEditor?.browseImageFolder !== 'function') return;

        this.parentEditor.browseImageFolder({
            projectPath: project.path,
            folder: layer === 2 ? 'battlebacks2' : 'battlebacks1',
            title: tt(layer === 2 ? 'Select Battleback 2' : 'Select Battleback 1'),
            current: select.value || '',
            allowNone: true,
            onPick: (name) => {
                if (![...select.options].some(option => option.value === name)) {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name || tt('(None)');
                    select.appendChild(option);
                }
                select.value = name;
                onChange(name);
            }
        });
    }

    scanImageDir(project, subdir) {
        if (!project) return [];
        try {
            const path = require('path');
            const fs = require('fs');
            const dir = path.join(project.path, 'img', subdir);
            if (!fs.existsSync(dir)) return [];
            return RRAssetFiles.listImageReferences(dir);
        } catch (e) { return []; }
    }

    // ==========================================
    // BATTLE PREVIEW CANVAS
    // ==========================================

    configureBattleGeometry(system, mvSemantics = this.usesMvBattleSemantics()) {
        const advanced = system?.advanced || {};
        this.screenWidth = Number(advanced.screenWidth) || 816;
        this.screenHeight = Number(advanced.screenHeight) || 624;
        const uiAreaWidth = Number(advanced.uiAreaWidth) || this.screenWidth;
        const uiAreaHeight = Number(advanced.uiAreaHeight) || this.screenHeight;
        this.boxWidth = Math.max(1, uiAreaWidth - 8);
        this.boxHeight = Math.max(1, uiAreaHeight - 8);
        this.battleFieldX = (this.screenWidth - this.boxWidth) / 2;
        this.battleFieldY = (this.screenHeight - this.boxHeight) / 2 - (mvSemantics ? 0 : 24);
        this.sideView = !!system?.optSideView;
    }

    usesMvBattleSemantics() {
        const project = this.projectManager?.getCurrentProject?.();
        if (project?.importedFrom === 'RPG Maker MV') return true;
        if (!project?.path || typeof require === 'undefined') return false;
        try {
            const path = require('path');
            const fs = require('fs');
            return fs.existsSync(path.join(project.path, 'Game.rpgproject'))
                || fs.existsSync(path.join(project.path, 'game.rpgproject'));
        } catch (error) {
            return false;
        }
    }

    battleToCanvas(x, y) {
        return { x: x + this.battleFieldX, y: y + this.battleFieldY };
    }

    canvasToBattle(x, y) {
        return { x: x - this.battleFieldX, y: y - this.battleFieldY };
    }

    getEnemyDrawRect(member, width, height) {
        const home = this.battleToCanvas(member.x, member.y);
        return { x: home.x - width / 2, y: home.y - height, width, height };
    }

    getBattlebackDrawRect(image) {
        const targetWidth = Math.floor((1000 * this.screenWidth) / 816);
        const targetHeight = Math.floor((740 * this.screenHeight) / 624);
        const bitmapWidth = image?.naturalWidth || targetWidth;
        const bitmapHeight = image?.naturalHeight || targetHeight;
        const scale = Math.max(targetWidth / bitmapWidth, targetHeight / bitmapHeight, 1);
        return {
            x: (this.screenWidth - targetWidth) / 2,
            y: this.sideView ? this.screenHeight - targetHeight : 0,
            width: bitmapWidth * scale,
            height: bitmapHeight * scale
        };
    }

    createBattlePreview() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'database-section rr-troop-preview-section';
        section.style.cssText = 'display:flex;flex-direction:column;min-width:0;';

        const header = document.createElement('div');
        header.className = 'database-section-header';
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
        const title = document.createElement('span');
        title.textContent = tt('Battle Preview');
        header.appendChild(title);

        // The overlay draws the battle windows the runtime would put over this
        // troop - status, commands, turn order, sideview party - so a placement
        // can be judged against what actually covers the screen in play.
        const toggle = document.createElement('label');
        toggle.className = 'rr-troop-battle-ui-toggle';
        toggle.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-weight:normal;font-size:11px;cursor:pointer;white-space:nowrap;';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'troop-battle-ui-toggle';
        checkbox.checked = !!this.showBattleUI;
        checkbox.style.margin = '0';
        checkbox.addEventListener('change', () => {
            this.showBattleUI = checkbox.checked;
            this.saveBattleUIPreference(this.showBattleUI);
            if (this.showBattleUI && !this.battleUISetup) {
                // First switch-on: the party art was never requested.
                this.loadAndRenderCanvas();
            } else {
                this.renderCanvas();
            }
        });
        toggle.appendChild(checkbox);
        toggle.appendChild(document.createTextNode(tt('Show Battle UI')));
        header.appendChild(toggle);
        section.appendChild(header);

        const canvasContainer = document.createElement('div');
        canvasContainer.style.cssText = 'position:relative;display:flex;flex:1;min-height:220px;align-items:center;justify-content:center;background:var(--color-bg-deep);border:1px solid var(--color-border);overflow:hidden;';

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.screenWidth;
        this.canvas.height = this.screenHeight;
        this.canvas.tabIndex = -1;
        this.canvas.style.cssText = 'display:block;width:auto;height:auto;max-width:100%;max-height:clamp(220px,34vh,460px);margin:0 auto;cursor:default;image-rendering:auto;outline:none;';
        this.ctx = this.canvas.getContext('2d');

        canvasContainer.appendChild(this.canvas);
        section.appendChild(canvasContainer);

        this.canvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onCanvasMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.onCanvasMouseUp(e));
        this.canvas.addEventListener('keydown', (e) => this.onCanvasKeyDown(e));

        return section;
    }

    getCanvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    onCanvasMouseDown(e) {
        this.canvas.focus({ preventScroll: true });
        const coords = this.getCanvasCoords(e);
        for (let i = this.enemySpriteBounds.length - 1; i >= 0; i--) {
            const b = this.enemySpriteBounds[i];
            if (coords.x >= b.x && coords.x <= b.x + b.width && coords.y >= b.y && coords.y <= b.y + b.height) {
                this.isDragging = true;
                this.dragMemberIndex = b.memberIndex;
                this.selectedMemberIndex = b.memberIndex;
                const member = this.currentTroop.members[b.memberIndex];
                const battleCoords = this.canvasToBattle(coords.x, coords.y);
                this.dragOffsetX = battleCoords.x - member.x;
                this.dragOffsetY = battleCoords.y - member.y;
                this.canvas.style.cursor = 'grabbing';
                this.highlightMemberRow(b.memberIndex);
                this.renderCanvas();
                return;
            }
        }
        this.selectedMemberIndex = -1;
        this.highlightMemberRow(-1);
        this.renderCanvas();
    }

    onCanvasKeyDown(e) {
        this.handleMemberKeyDown(e);
    }

    onCanvasMouseMove(e) {
        const coords = this.getCanvasCoords(e);
        if (this.isDragging && this.dragMemberIndex >= 0) {
            const member = this.currentTroop.members[this.dragMemberIndex];
            const battleCoords = this.canvasToBattle(coords.x, coords.y);
            member.x = Math.round(Math.max(0, Math.min(this.boxWidth, battleCoords.x - this.dragOffsetX)));
            member.y = Math.round(Math.max(0, Math.min(this.boxHeight, battleCoords.y - this.dragOffsetY)));
            this.renderCanvas();
            this.updateMemberPositionDisplay(this.dragMemberIndex, member.x, member.y);
            return;
        }
        let over = false;
        for (let i = this.enemySpriteBounds.length - 1; i >= 0; i--) {
            const b = this.enemySpriteBounds[i];
            if (coords.x >= b.x && coords.x <= b.x + b.width && coords.y >= b.y && coords.y <= b.y + b.height) { over = true; break; }
        }
        this.canvas.style.cursor = over ? 'grab' : 'default';
    }

    onCanvasMouseUp(e) {
        if (this.isDragging && this.dragMemberIndex >= 0) {
            this.canvas.style.cursor = 'default';
            this.persistTroop();
        }
        this.isDragging = false;
        this.dragMemberIndex = -1;
    }

    loadAndRenderCanvas() {
        const project = this.projectManager.getCurrentProject();
        if (!project) return;

        const path = require('path');
        let pending = 0;

        const done = () => { pending--; if (pending <= 0) this.renderCanvas(); };

        // Battleback1
        if (this.battleback1Name) {
            pending++;
            this.battleback1Img = new Image();
            this.battleback1Img.onload = done;
            this.battleback1Img.onerror = () => { this.battleback1Img = null; done(); };
            this.battleback1Img.src = RRAssetFiles.imageUrlFor(
                path.join(project.path, 'img', 'battlebacks1'), this.battleback1Name);
        } else { this.battleback1Img = null; }

        // Battleback2
        if (this.battleback2Name) {
            pending++;
            this.battleback2Img = new Image();
            this.battleback2Img.onload = done;
            this.battleback2Img.onerror = () => { this.battleback2Img = null; done(); };
            this.battleback2Img.src = RRAssetFiles.imageUrlFor(
                path.join(project.path, 'img', 'battlebacks2'), this.battleback2Name);
        } else { this.battleback2Img = null; }

        // Enemy sprites
        const enemies = this.databaseManager.getEnemies();
        const members = this.currentTroop.members || [];
        this.enemySpriteImages = {};

        members.forEach(member => {
            const enemy = enemies.find(e => e && e.id === member.enemyId);
            if (!enemy || !enemy.battlerName || this.enemySpriteImages[enemy.battlerName]) return;

            pending++;
            const battlerName = enemy.battlerName;

            // Match the runtime's front/side-view directory first. Character
            // sheets remain a compatibility fallback for plugin-driven games.
            const searchDirs = this.sideView
                ? ['sv_enemies', 'enemies', 'characters']
                : ['enemies', 'sv_enemies', 'characters'];
            let found = false;
            for (const dir of searchDirs) {
                const battlerFile = RRAssetFiles.findImage(path.join(project.path, 'img', dir), battlerName);
                if (battlerFile) {
                    const img = new Image();
                    img.onload = () => { this.enemySpriteImages[battlerName] = img; done(); };
                    img.onerror = done;
                    img.src = RRAssetFiles.toUrl(battlerFile.absolutePath);
                    this.enemySpriteImages[battlerName] = img;
                    found = true;
                    break;
                }
            }
            if (!found) done();
        });

        if (this.showBattleUI) {
            pending += this.loadBattleUIAssets(project, path, done);
        }

        if (pending === 0) this.renderCanvas();
    }

    renderCanvas() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        if (this.battleback1Img && this.battleback1Img.complete && this.battleback1Img.naturalWidth) {
            const rect = this.getBattlebackDrawRect(this.battleback1Img);
            ctx.drawImage(this.battleback1Img, rect.x, rect.y, rect.width, rect.height);
        }
        if (this.battleback2Img && this.battleback2Img.complete && this.battleback2Img.naturalWidth) {
            const rect = this.getBattlebackDrawRect(this.battleback2Img);
            ctx.drawImage(this.battleback2Img, rect.x, rect.y, rect.width, rect.height);
        }

        this.enemySpriteBounds = [];
        const enemies = this.databaseManager.getEnemies();
        const members = this.currentTroop.members || [];

        members.forEach((member, idx) => {
            const enemy = enemies.find(e => e && e.id === member.enemyId);
            if (!enemy) return;
            const home = this.battleToCanvas(member.x, member.y);

            const img = enemy.battlerName ? this.enemySpriteImages[enemy.battlerName] : null;

            if (img && img.complete && img.naturalWidth) {
                let drawW = img.naturalWidth;
                let drawH = img.naturalHeight;

                // Handle character-set battlers: extract single frame
                const firstChar = RRAssetFiles.basename(enemy.battlerName).charAt(0);
                const isBigChar = RRAssetFiles.isBigCharacter(enemy.battlerName);
                const isCharBattler = (firstChar === '!' || firstChar === '$');

                if (isCharBattler && !isBigChar) {
                    // Standard character sheet: 12 cols x 8 rows, show middle frame of first direction
                    const fw = img.naturalWidth / 12;
                    const fh = img.naturalHeight / 8;
                    const bounds = this.getEnemyDrawRect(member, fw, fh);
                    const drawX = bounds.x;
                    const drawY = bounds.y;
                    if (member.hidden) ctx.globalAlpha = 0.4;
                    // Draw middle frame (index 1) of down direction (row 0)
                    ctx.drawImage(img, fw, 0, fw, fh, drawX, drawY, fw, fh);
                    ctx.globalAlpha = 1.0;
                    this.enemySpriteBounds.push({ x: drawX, y: drawY, width: fw, height: fh, memberIndex: idx });
                } else if (isCharBattler && isBigChar) {
                    // Big character ($ prefix): 3 cols x 4 rows
                    const fw = img.naturalWidth / 3;
                    const fh = img.naturalHeight / 4;
                    const bounds = this.getEnemyDrawRect(member, fw, fh);
                    const drawX = bounds.x;
                    const drawY = bounds.y;
                    if (member.hidden) ctx.globalAlpha = 0.4;
                    ctx.drawImage(img, fw, 0, fw, fh, drawX, drawY, fw, fh);
                    ctx.globalAlpha = 1.0;
                    this.enemySpriteBounds.push({ x: drawX, y: drawY, width: fw, height: fh, memberIndex: idx });
                } else {
                    // Standard enemy sprite: draw full image
                    const bounds = this.getEnemyDrawRect(member, drawW, drawH);
                    const drawX = bounds.x;
                    const drawY = bounds.y;
                    if (member.hidden) ctx.globalAlpha = 0.4;
                    ctx.drawImage(img, drawX, drawY);
                    ctx.globalAlpha = 1.0;
                    this.enemySpriteBounds.push({ x: drawX, y: drawY, width: drawW, height: drawH, memberIndex: idx });
                }
            } else {
                // Placeholder
                const pw = 64, ph = 64;
                const bounds = this.getEnemyDrawRect(member, pw, ph);
                const drawX = bounds.x;
                const drawY = bounds.y;
                ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                ctx.fillRect(drawX, drawY, pw, ph);
                ctx.strokeStyle = '#f00';
                ctx.strokeRect(drawX, drawY, pw, ph);
                ctx.fillStyle = '#fff';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(enemy.name || '?', home.x, home.y - ph / 2 + 4);
                ctx.textAlign = 'start';
                this.enemySpriteBounds.push({ x: drawX, y: drawY, width: pw, height: ph, memberIndex: idx });
            }

            // Selection highlight
            if (idx === this.selectedMemberIndex) {
                const b = this.enemySpriteBounds[this.enemySpriteBounds.length - 1];
                ctx.strokeStyle = ThemeColors.resolve('--color-accent-bright', '#ffd700');
                ctx.lineWidth = 2;
                ctx.strokeRect(b.x - 2, b.y - 2, b.width + 4, b.height + 4);
                ctx.lineWidth = 1;
            }
        });

        // Drawn last so it covers the battlers the way the real windows do;
        // enemySpriteBounds is already final, so hit-testing still reaches an
        // enemy that sits under a window - which is the case worth noticing.
        if (this.showBattleUI) {
            const setup = this.battleUISetup || this.refreshBattleUISetup();
            if (setup) this.drawBattleUIOverlay(ctx, setup);
        }
    }

    // ==========================================
    // BATTLE EVENTS SECTION
    // ==========================================

    createBattleEventsSection() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:clamp(180px,24vh,240px);';

        section.innerHTML = `<div class="database-section-header">${tt('Battle Events')}</div>`;

        const content = document.createElement('div');
        content.className = 'database-section-content';
        content.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;';

        // Toolbar: page tabs + buttons
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display: flex; align-items: center; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;';

        const tabsContainer = document.createElement('div');
        tabsContainer.id = 'battle-page-tabs';
        tabsContainer.style.cssText = 'display: flex; gap: 2px; flex: 1; flex-wrap: wrap;';
        toolbar.appendChild(tabsContainer);

        ['New', 'Copy', 'Paste', 'Delete', 'Clear'].forEach(label => {
            const btn = this.createSmallButton(label, () => {
                if (label === 'New') this.addBattlePage();
                else if (label === 'Copy') this.copyBattlePage();
                else if (label === 'Paste') this.pasteBattlePage();
                else if (label === 'Delete') this.deleteBattlePage();
                else if (label === 'Clear') this.clearBattlePage();
            });
            toolbar.appendChild(btn);
        });

        content.appendChild(toolbar);

        // Page content: conditions + span on left, command list on right
        const pageContent = document.createElement('div');
        pageContent.id = 'battle-page-content';
        pageContent.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;';
        content.appendChild(pageContent);

        section.appendChild(content);

        setTimeout(() => {
            this.renderBattlePageTabs();
            this.renderBattlePageContent();
        }, 0);

        return section;
    }

    renderBattlePageTabs() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const tabsContainer = document.getElementById('battle-page-tabs');
        if (!tabsContainer) return;
        tabsContainer.innerHTML = '';

        const pages = this.currentTroop.pages || [];
        pages.forEach((page, idx) => {
            const tab = document.createElement('button');
            tab.textContent = `${tt('Page')} ${idx + 1}`;
            const active = idx === this.currentBattlePageIndex;
            tab.style.cssText = `
                padding: 3px 10px; border: 1px solid ${active ? 'var(--color-accent-bright)' : 'var(--color-border-input)'}; border-radius: 3px;
                cursor: pointer; font-size: 11px;
                background-color: ${active ? 'var(--color-accent-tint-30)' : 'var(--color-bg-menubar)'};
                color: ${active ? 'var(--color-text-strong)' : 'var(--color-text-muted)'};
            `;
            tab.onclick = () => {
                this.currentBattlePageIndex = idx;
                this.selectedCommandIndices = [];
                this.renderBattlePageTabs();
                this.renderBattlePageContent();
            };
            tabsContainer.appendChild(tab);
        });

        if (pages.length === 0) {
            tabsContainer.innerHTML = `<span style="color: var(--color-text-dim); font-size: 11px;">${tt('No pages')}</span>`;
        }
    }

    renderBattlePageContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = document.getElementById('battle-page-content');
        if (!container) return;
        container.innerHTML = '';

        const pages = this.currentTroop.pages || [];
        if (pages.length === 0 || this.currentBattlePageIndex >= pages.length) {
            container.innerHTML = `<div style="color: var(--color-text-dim); text-align: center; padding: 20px;">${tt('No battle event pages. Click "New" to add one.')}</div>`;
            return;
        }

        const page = pages[this.currentBattlePageIndex];

        // Top row: conditions + span
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;';

        const condBtn = this.createSmallButton('Conditions...', () => this.showConditionsModal(page));
        topRow.appendChild(condBtn);

        const condSummary = document.createElement('span');
        condSummary.style.cssText = 'color: var(--color-text-muted); font-size: 11px; flex: 1;';
        condSummary.textContent = this.getConditionsSummary(page.conditions);
        topRow.appendChild(condSummary);

        const spanLabel = document.createElement('span');
        spanLabel.style.cssText = 'color: var(--color-text-muted); font-size: 11px;';
        spanLabel.textContent = tt('Span:');
        topRow.appendChild(spanLabel);

        const spanSelect = document.createElement('select');
        spanSelect.style.cssText = 'background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 2px; border-radius: 3px; font-size: 11px;';
        ['Battle', 'Turn', 'Moment'].forEach((label, i) => {
            const opt = document.createElement('option');
            opt.value = i; opt.textContent = tt(label);
            if (page.span === i) opt.selected = true;
            spanSelect.appendChild(opt);
        });
        spanSelect.onchange = () => { page.span = parseInt(spanSelect.value); this.persistTroop(); };
        topRow.appendChild(spanSelect);

        container.appendChild(topRow);

        // Command list (interactive)
        const cmdListContainer = document.createElement('div');
        cmdListContainer.id = 'battle-command-list';
        cmdListContainer.tabIndex = 0;
        cmdListContainer.style.cssText = 'flex:1;min-height:0;overflow-y:auto;border:1px solid var(--color-border);background:var(--color-bg-base);border-radius:3px;';
        cmdListContainer.addEventListener('keydown', event => this.handleCommandListKeyDown(event, page, cmdListContainer));
        container.appendChild(cmdListContainer);

        this.renderCommandList(cmdListContainer, page);
    }

    // ==========================================
    // INTERACTIVE COMMAND LIST
    // ==========================================

    renderCommandList(container, page) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const previousScrollTop = container.scrollTop;
        container.innerHTML = '';

        if (!page.list || page.list.length === 0) {
            page.list = [{ code: 0, indent: 0, parameters: [] }];
        }

        page.list.forEach((cmd, idx) => {
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
                div.innerHTML = `<span style="color: var(--color-border-input);">${tt('End')}</span>`;
            } else {
                const info = this.getCommandDisplay(cmd, page, idx);
                div.innerHTML = `<span style="color: var(--color-text-dim); min-width: 32px; display: inline-block;">${String(idx + 1).padStart(3, '0')}</span>` +
                    `<span style="color: ${info.color}; font-weight: 600; margin-right: 8px;">${this.escapeHTML(info.name)}</span>` +
                    `<span style="color: var(--color-text);">${this.escapeHTML(info.description)}</span>`;
            }

            // Click to select
            div.onclick = (e) => {
                container.focus();
                if (e.shiftKey && this.commandSelectionAnchor !== null) {
                    const start = Math.min(this.commandSelectionAnchor, idx);
                    const end = Math.max(this.commandSelectionAnchor, idx);
                    this.selectedCommandIndices = [];
                    for (let i = start; i <= end; i++) this.selectedCommandIndices.push(i);
                } else if (e.ctrlKey || e.metaKey) {
                    const i = this.selectedCommandIndices.indexOf(idx);
                    if (i >= 0) this.selectedCommandIndices.splice(i, 1);
                    else this.selectedCommandIndices.push(idx);
                    this.commandSelectionAnchor = idx;
                } else {
                    this.selectedCommandIndices = [idx];
                    this.commandSelectionAnchor = idx;
                }
                this.renderCommandList(container, page);
            };

            // Double-click end command → add new command
            if (isEnd) {
                div.ondblclick = () => this.insertNewCommand(page, idx);
            } else {
                div.ondblclick = () => this.editCommandSimple(cmd, idx, page);
            }

            // Hover
            div.onmouseenter = () => { if (!isSelected) div.style.backgroundColor = 'var(--color-bg-input)'; };
            div.onmouseleave = () => { if (!isSelected) div.style.backgroundColor = 'var(--color-bg-list-item)'; };

            // Right-click context menu
            div.oncontextmenu = (e) => {
                e.preventDefault();
                if (!this.selectedCommandIndices.includes(idx)) {
                    this.selectedCommandIndices = [idx];
                    this.renderCommandList(container, page);
                }
                this.showCommandContextMenu(e.clientX, e.clientY, page, container);
            };

            container.appendChild(div);
        });
        container.scrollTop = previousScrollTop;
    }

    handleCommandListKeyDown(event, page, container) {
        const modified = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (event.key === 'Delete' && this.selectedCommandIndices.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            this.deleteCommands(page, container);
            return;
        }
        if (!modified) return;
        if (key === 'a') {
            event.preventDefault();
            event.stopPropagation();
            this.selectedCommandIndices = page.list
                .map((command, index) => command?.code !== 0 ? index : -1)
                .filter(index => index >= 0);
            this.commandSelectionAnchor = this.selectedCommandIndices[0] ?? null;
            this.renderCommandList(container, page);
        } else if (key === 'c' && this.selectedCommandIndices.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            this.copyCommands(page);
        } else if (key === 'x' && this.selectedCommandIndices.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            this.cutCommands(page, container);
        } else if (key === 'v') {
            event.preventDefault();
            event.stopPropagation();
            this.pasteCommands(page, container);
        }
    }

    showCommandContextMenu(x, y, page, container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const existing = document.querySelector('.battle-cmd-context-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.className = 'battle-cmd-context-menu';
        menu.style.cssText = `
            position: fixed; left: ${x}px; top: ${y}px; background-color: var(--color-bg-list-item);
            border: 1px solid var(--color-border); border-radius: 4px; padding: 4px; z-index: 10004;
            min-width: 160px; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        `;

        const items = [
            { label: 'Insert Command', action: () => { const idx = this.selectedCommandIndices.length > 0 ? Math.max(...this.selectedCommandIndices) : page.list.length - 1; this.insertNewCommand(page, idx); } },
            { label: 'Edit', action: () => { if (this.selectedCommandIndices.length === 1) { const idx = this.selectedCommandIndices[0]; this.editCommandSimple(page.list[idx], idx, page); } }, disabled: this.selectedCommandIndices.length !== 1 || (this.selectedCommandIndices.length === 1 && page.list[this.selectedCommandIndices[0]].code === 0) },
            { divider: true },
            { label: 'Cut', action: () => this.cutCommands(page, container) },
            { label: 'Copy', action: () => this.copyCommands(page) },
            { label: 'Paste', action: () => this.pasteCommands(page, container) },
            { label: 'Delete', action: () => this.deleteCommands(page, container) },
        ];

        items.forEach(item => {
            if (item.divider) {
                const d = document.createElement('div');
                d.style.cssText = 'height: 1px; background-color: var(--color-border); margin: 4px 0;';
                menu.appendChild(d);
                return;
            }
            const mi = document.createElement('div');
            mi.textContent = tt(item.label);
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

    insertNewCommand(page, insertBeforeIndex) {
        if (!this.commandPicker) {
            this.commandPicker = new EventCommandPicker();
        }

        this.commandPicker.show((command) => {
            const ECL = this._eventCommandListClass();
            const insertIndex = ECL.safeInsertionIndex(page.list, insertBeforeIndex);
            const insertCommands = commands => {
                if (!commands?.length) return;
                ECL.rebaseInsertIndent(commands, ECL.insertionIndent(page.list, insertIndex));
                commands.forEach((cmd, i) => page.list.splice(insertIndex + i, 0, cmd));
                this.persistTroop();
                this.selectedCommandIndices = [insertIndex];
                const container = document.getElementById('battle-command-list');
                if (container) this.renderCommandList(container, page);
            };

            // Show Text had no branch here at all: inserting one dropped a bare
            // default header with no way to type into it, and double-clicking it
            // afterwards did nothing. Battle messages are ordinary Show Text
            // commands and go through the same editor as everywhere else.
            if (command.code === 101) {
                // A troop page only ever runs in battle, so the battle-only
                // text codes are real here and offered.
                this.getCommandEditor('message', MessageCommandEditor)
                    .show({ inBattle: true }, insertCommands);
                return;
            }
            if (command.code === 111) {
                this.getCommandEditor('conditionalBranch', ConditionalBranchEditor).show(null, insertCommands, { troop: this.currentTroop });
                return;
            }
            if (command.code === 112 || command.code === 413) {
                this.getCommandEditor('loop', LoopEditor).show(null, insertCommands);
                return;
            }
            if ([132, 133, 139, 241, 242, 245, 246, 249, 250, 251].includes(command.code)) {
                this.getCommandEditor('audio', AudioCommandEditor).show(null, command.code, edited => {
                    if (edited) insertCommands([edited]);
                });
                return;
            }
            if (command.code === 357 && ['ShowVideoSurface', 'TransformVideoSurface'].includes(command.reactor)) {
                this.warnVideoSurfaceMapOnly();
                return;
            }
            if (command.code === 357 && command.reactor === 'StopVideoSurface'
                && typeof VideoSurfaceEditor !== 'undefined'
                && typeof VideoSurfaceEditor.supports === 'function'
                && VideoSurfaceEditor.supports(command.reactor)) {
                this.getCommandEditor('videoSurface', VideoSurfaceEditor)
                    .show(null, edited => edited && insertCommands([edited]), command.reactor, { type: 'troop' });
                return;
            }
            const editorMap = {
                232: ['movePicture', MovePictureEditor],
                356: ['pluginCommand', PluginCommandEditor],
                357: ['pluginCommand', PluginCommandEditor]
            };
            const editorConfig = editorMap[command.code];
            if (editorConfig) {
                const editor = this.getCommandEditor(editorConfig[0], editorConfig[1]);
                const context = command.code === 232 ? { commands: page.list, index: insertIndex } : undefined;
                editor.show(null, edited => edited && insertCommands(ECL.commandBlock(edited)), context);
                return;
            }
            const run = DatabaseTroopEditor.RUN_COMMAND_DIALOGS[command.code];
            if (run) {
                const editor = this.commandDialogs()[run[0]];
                const args = new Array(run[1]).fill(null);
                editor.show(null, ...args, commands => insertCommands(ECL.commandBlock(commands)));
                return;
            }
            const simple = this.simpleCommandDialog(command.code);
            if (simple) {
                simple.editor.show(null, edited => edited && insertCommands(ECL.commandBlock(edited)),
                    this.commandDialogContext(command.code, simple.options));
                return;
            }
            if (ECL.isNoParamCommand(command.code)) {
                insertCommands([{ code: command.code, indent: 0, parameters: [] }]);
                return;
            }

            // Commands that need structure (conditional branch, loop, etc.)
            const cmds = this.buildCommandStructure(command.code);
            insertCommands(cmds);
        });
    }

    _eventCommandListClass() {
        if (typeof EventCommandList !== 'undefined') return EventCommandList;
        return require('../event/EventCommandList.js');
    }

    /**
     * The command dialogs, held as one EventCommandList used purely as the bag
     * of editor instances SIMPLE_COMMAND_EDITORS names. A battle page therefore
     * dispatches through the same table the map event list does, instead of a
     * second hand-maintained list beside it: the second list is what left
     * Force Action working here and the eight battle commands beside it, plus
     * every actor, party and screen command, showing a raw JSON textarea of
     * their parameters.
     *
     * `currentPage` is left null on it. That is what keeps the keyboard and
     * language listeners its constructor installs inert, so this instance can
     * never act on the map editor's command list.
     */
    /** Change Enemy HP through Force Action: every command that picks a slot. */
    static get ENEMY_SLOT_COMMANDS() {
        return new Set([331, 332, 333, 334, 335, 336, 337, 339, 342]);
    }

    commandDialogs() {
        if (!this._commandDialogs) {
            const ECL = this._eventCommandListClass();
            const list = new ECL({
                databaseManager: this.databaseManager,
                projectController: this.projectManager
            });
            // The whole host surface a shared dispatch touches: where a change
            // lands, and what stays selected after it. Overriding this is what
            // lets EventCommandList.editCommand run against a battle page and
            // write back here instead of into the map editor's list.
            list.refreshCommandList = page => {
                this.persistTroop();
                this.selectedCommandIndices = Array.from(list.selectedIndices || []);
                const container = document.getElementById('battle-command-list');
                if (container) this.renderCommandList(container, page);
            };
            this._commandDialogs = list;
        }
        return this._commandDialogs;
    }

    /**
     * Commands whose dialog hands back a run rather than one command: a Show
     * Choices with its branches, a Comment or a Script with its continuation
     * lines, a Shop with its goods. Replacing such a run correctly is a
     * different rule per command, and EventCommandList already implements every
     * one of them -- so its own editCommand runs against this page rather than
     * a second copy of those rules living here.
     */
    static get RUN_COMMANDS() {
        return new Set([102, 105, 108, 302, 355]);
    }

    /**
     * The same commands on the way in, where the dialog hands back the whole
     * run to insert. `extraArgs` is what the dialog takes between the command
     * and the callback.
     */
    static get RUN_COMMAND_DIALOGS() {
        return {
            102: ['choicesEditor', 0],
            105: ['showScrollingTextEditor', 0],
            108: ['commentEditor', 2],
            302: ['shopProcessingEditor', 0],
            355: ['scriptEditor', 2]
        };
    }

    /** The dialog for a table-driven command, with its options, or null. */
    simpleCommandDialog(code) {
        const simple = this._eventCommandListClass().simpleCommandEditor(code);
        if (!simple) return null;
        const editor = this.commandDialogs()[simple.editor];
        return editor ? { editor, options: simple.options } : null;
    }

    /**
     * The third argument a command's dialog takes here. A toggle command's own
     * configuration comes from the table; a command that addresses an enemy
     * slot gets this page's troop, so the dropdown can name it.
     */
    commandDialogContext(code, options) {
        if (options) return options;
        return DatabaseTroopEditor.ENEMY_SLOT_COMMANDS.has(code) ? this.enemySlotContext() : undefined;
    }

    /**
     * What a battle command dialog needs to name its enemy slots. A troop page
     * knows its members, so the dropdowns can read "#1 Cave Goblin" instead of
     * "#1"; the names resolve the same way the Members list beside them does,
     * editor names included.
     */
    enemySlotContext() {
        return {
            troop: this.currentTroop,
            enemyName: enemy => this.databaseEntryLabels(enemy, 'enemies').primary || enemy.name
        };
    }

    /** One slot as a command list row prints it, sharing the dialogs' naming. */
    enemySlotLabel(index) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (index === -1) return tt('Entire Troop');
        return RREnemySlotOptions.label(index, this.enemySlotContext(), this.databaseManager);
    }

    getCommandEditor(name, EditorClass) {
        if (!this._editors[name]) {
            this._editors[name] = new EditorClass(this.databaseManager, this.projectManager);
        }
        return this._editors[name];
    }

    warnVideoSurfaceMapOnly() {
        const message = 'Show and Transform Video Surface are map-only commands and cannot run in troop events.';
        if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message);
        else if (typeof alert === 'function') alert(message);
    }

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
            132: [{ name: '', volume: 90, pitch: 100, pan: 0 }], // Change Battle BGM
            133: [{ name: '', volume: 90, pitch: 100, pan: 0 }], // Change Victory ME
            139: [{ name: '', volume: 90, pitch: 100, pan: 0 }], // Change Defeat ME
            140: [0, { name: '', volume: 90, pitch: 100, pan: 0 }], // Change Vehicle BGM
            230: [60],                   // Wait
            241: [{ name: '', volume: 90, pitch: 100, pan: 0 }], // Play BGM
            242: [1],                    // Fadeout BGM
            245: [{ name: '', volume: 90, pitch: 100, pan: 0 }], // Play BGS
            246: [1],                    // Fadeout BGS
            249: [{ name: '', volume: 90, pitch: 100, pan: 0 }], // Play ME
            250: [{ name: '', volume: 90, pitch: 100, pan: 0 }], // Play SE
            251: [],                     // Stop SE
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
            337: [0, 1, false],         // Show Battle Animation
            339: [0, 0, 1, -1],         // Force Action
            340: [],                     // Abort Battle
            342: [0, 0, 0, 100],        // Change Enemy TP
            355: [''],                   // Script
        };
        return defaults[code] || [];
    }

    editCommandSimple(cmd, idx, page) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (cmd.code === 0) return;

        const ECL = this._eventCommandListClass();
        if (cmd.code === 657) {
            const range = ECL.contiguousBlockRange(page.list, idx, 357, 657);
            if (!range) return;
            idx = range.start;
            cmd = page.list[idx];
        }
        const refresh = () => {
            this.persistTroop();
            const container = document.getElementById('battle-command-list');
            if (container) this.renderCommandList(container, page);
        };
        const replaceSingle = (editor, context) => {
            editor.show(cmd, edited => {
                if (!edited) return;
                edited.indent = cmd.indent || 0;
                page.list[idx] = edited;
                refresh();
            }, context);
        };

        if (cmd.code === 101) {
            const run = ECL.messageBoxes().collectRun(page.list, idx);
            const messageEditor = this.getCommandEditor('message', MessageCommandEditor);
            messageEditor.show({ boxes: run.boxes, inBattle: true, activeIndex: run.activeIndex }, commands => {
                if (!commands?.length) return;
                page.list.splice(run.startIndex, run.count);
                ECL.rebaseInsertIndent(commands, cmd.indent || 0);
                commands.forEach((command, i) => page.list.splice(run.startIndex + i, 0, command));
                refresh();
            });
            return;
        }

        if (cmd.code === 111) {
            const { branches, endIndex } = ECL.collectBranchStructure(page.list, idx, [411], 412, true);
            const thenBody = branches[0].body;
            const elseBranch = branches.find(branch => branch.marker?.code === 411);
            const elseBody = elseBranch ? elseBranch.body : null;
            this.getCommandEditor('conditionalBranch', ConditionalBranchEditor).show(cmd, commands => {
                if (!commands?.length) return;
                page.list.splice(idx, endIndex - idx + 1);
                ECL.rebaseInsertIndent(commands, cmd.indent || 0);
                let insertAt = idx;
                for (const command of commands) {
                    page.list.splice(insertAt++, 0, command);
                    const body = command.code === 111 ? thenBody : command.code === 411 ? elseBody : null;
                    if (body) for (const nested of body) page.list.splice(insertAt++, 0, nested);
                }
                refresh();
            }, { hasElse: !!elseBranch, troop: this.currentTroop });
            return;
        }

        if (cmd.code === 112 || cmd.code === 413) {
            const LoopClass = ECL.loopEditorClass();
            const range = LoopClass.findBlockRange(page.list, idx);
            if (!range) return;
            let start = range.start;
            let block = page.list.slice(start, range.end + 1);
            if (start > 0) {
                const candidate = page.list.slice(start - 1, range.end + 1);
                const parsed = LoopClass.parse(candidate);
                if (parsed?.generated) {
                    start--;
                    block = candidate;
                }
            }
            this.getCommandEditor('loop', LoopEditor).show(block, commands => {
                if (!commands?.length) return;
                page.list.splice(start, range.end - start + 1, ...commands);
                this.selectedCommandIndices = [start + (commands[0].code === 122 ? 1 : 0)];
                refresh();
            });
            return;
        }

        if (cmd.code === 232) {
            replaceSingle(this.getCommandEditor('movePicture', MovePictureEditor), { commands: page.list, index: idx });
            return;
        }
        if ([132, 133, 139, 241, 242, 245, 246, 249, 250, 251].includes(cmd.code)) {
            this.getCommandEditor('audio', AudioCommandEditor).show(cmd, cmd.code, edited => {
                if (!edited) return;
                edited.indent = cmd.indent || 0;
                page.list[idx] = edited;
                refresh();
            });
            return;
        }
        if (cmd.code === 357 && cmd.parameters?.[0] === 'RPGReactor'
            && ['ShowVideoSurface', 'TransformVideoSurface'].includes(cmd.parameters?.[1])) {
            this.warnVideoSurfaceMapOnly();
            return;
        }
        if (cmd.code === 357 && cmd.parameters?.[0] === 'RPGReactor'
            && cmd.parameters?.[1] === 'StopVideoSurface'
            && typeof VideoSurfaceEditor !== 'undefined'
            && typeof VideoSurfaceEditor.supports === 'function'
            && VideoSurfaceEditor.supports(cmd.parameters?.[1])) {
            this.getCommandEditor('videoSurface', VideoSurfaceEditor).show(cmd, edited => {
                if (!edited) return;
                ECL.replaceContiguousBlock(page.list, idx, edited, 357, 657);
                refresh();
            }, undefined, { type: 'troop' });
            return;
        }
        if (cmd.code === 356 || cmd.code === 357) {
            const range = cmd.code === 357
                ? ECL.contiguousBlockRange(page.list, idx, 357, 657)
                : { start: idx, end: idx };
            const continuationCommands = range
                ? page.list.slice(range.start + 1, range.end + 1) : [];
            this.getCommandEditor('pluginCommand', PluginCommandEditor).show(cmd, commands => {
                if (!ECL.commandBlock(commands).length) return;
                ECL.replaceContiguousBlock(page.list, idx, commands, cmd.code, 657);
                refresh();
            }, { continuationCommands });
            return;
        }
        if (cmd.code === 355 && ECL.generatedCommand(cmd, 'eventCall')) {
            replaceSingle(this.getCommandEditor('commonEvent', CommonEventEditor));
            return;
        }
        if (cmd.code === 355) {
            const pictureEditor = ECL.pictureEditorFor(cmd, {
                show: this.getCommandEditor('showPicture', ShowPictureEditor),
                move: this.getCommandEditor('movePicture', MovePictureEditor),
                erase: this.getCommandEditor('erasePicture', ErasePictureEditor)
            });
            if (pictureEditor) {
                const context = pictureEditor === this._editors.movePicture ? { commands: page.list, index: idx } : undefined;
                replaceSingle(pictureEditor, context);
                return;
            }
        }

        if (DatabaseTroopEditor.RUN_COMMANDS.has(cmd.code)) {
            const list = this.commandDialogs();
            list.selectedIndices = [idx];
            list.editCommand(idx, page, this.currentBattlePageIndex);
            return;
        }

        // The shared table, the same one the map event list dispatches through.
        // Anything below this line is a command with no dialog anywhere, and the
        // raw parameter array is all there is to show for it.
        const simple = this.simpleCommandDialog(cmd.code);
        if (simple) {
            replaceSingle(simple.editor, this.commandDialogContext(cmd.code, simple.options));
            return;
        }
        if (ECL.isNoParamCommand(cmd.code)) return;

        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10005;';

        const dialog = document.createElement('div');
        dialog.className = 'rr-modal';
        dialog.style.cssText = 'width: min(500px, calc(100vw - 24px));';

        const info = this.getCommandDisplay(cmd);
        dialog.innerHTML = `
            <div class="rr-modal-header">
                <div class="rr-modal-title">${this.escapeHTML(info.name)} (${tt('Code')} ${cmd.code})</div>
                <button class="rr-modal-close raw-cmd-close" type="button">&times;</button>
            </div>`;

        const body = document.createElement('div');
        body.className = 'rr-modal-body';
        const textarea = document.createElement('textarea');
        textarea.value = JSON.stringify(cmd.parameters, null, 2);
        textarea.style.cssText = 'width: 100%; height: 200px; background: var(--color-bg-panel); border: 1px solid var(--color-border-input); color: var(--color-text); font-family: monospace; font-size: 12px; padding: 8px; border-radius: 4px; box-sizing: border-box; resize: vertical;';
        body.appendChild(textarea);
        dialog.appendChild(body);

        const btnRow = document.createElement('div');
        btnRow.className = 'rr-modal-footer';

        const cancelBtn = this.createButton('Cancel', () => document.body.removeChild(modal));
        const okBtn = this.createButton('OK', () => {
            try {
                cmd.parameters = JSON.parse(textarea.value);
                this.persistTroop();
                const container = document.getElementById('battle-command-list');
                if (container) this.renderCommandList(container, page);
                document.body.removeChild(modal);
            } catch (e) {
                alert(`${tt('Invalid JSON:')} ` + e.message);
            }
        });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        dialog.appendChild(btnRow);
        dialog.querySelector('.raw-cmd-close').addEventListener('click', () => document.body.removeChild(modal));
        modal.appendChild(dialog);
        // A click on the backdrop no longer closes the dialog: close deliberately.
        document.body.appendChild(modal);
    }

    // Command clipboard operations
    expandCommandSelection(page) {
        if (typeof EventCommandList !== 'undefined' && EventCommandList.prototype.expandSelection) {
            const helper = Object.create(EventCommandList.prototype);
            helper.selectedIndices = [...this.selectedCommandIndices];
            return helper.expandSelection(page);
        }
        return this.selectedCommandIndices
            .filter(index => page.list[index] && page.list[index].code !== 0)
            .sort((a, b) => a - b);
    }

    copyCommands(page) {
        const indices = this.expandCommandSelection(page);
        if (indices.length === 0) return;
        this.commandClipboard = indices.map(i => JSON.parse(JSON.stringify(page.list[i])));
        if (typeof ReactorClipboard !== 'undefined') {
            return ReactorClipboard.write('eventCommands', { commands: this.commandClipboard });
        }
        return Promise.resolve(true);
    }

    async cutCommands(page, container) {
        const targetTroop = this.currentTroop;
        const targetPageIndex = this.currentBattlePageIndex;
        const selected = [...this.selectedCommandIndices];
        const listSnapshot = JSON.stringify(page.list);
        const wrote = await this.copyCommands(page);
        if (!wrote) {
            alert(window.I18n?.t('db.clipboardWriteFailed') || 'Could not write data to the clipboard.');
            return;
        }
        if (this.currentTroop !== targetTroop || this.currentBattlePageIndex !== targetPageIndex
            || targetTroop?.pages?.[targetPageIndex] !== page
            || JSON.stringify(page.list) !== listSnapshot
            || selected.length !== this.selectedCommandIndices.length
            || selected.some((index, i) => index !== this.selectedCommandIndices[i])) return;
        this.deleteCommands(page, container);
    }

    deleteCommands(page, container) {
        const indices = this.expandCommandSelection(page).sort((a, b) => b - a);
        indices.forEach(i => page.list.splice(i, 1));
        this.selectedCommandIndices = [];
        this.commandSelectionAnchor = null;
        this.persistTroop();
        if (container) this.renderCommandList(container, page);
    }

    async pasteCommands(page, container) {
        const targetTroop = this.currentTroop;
        const targetPageIndex = this.currentBattlePageIndex;
        const selected = [...this.selectedCommandIndices];
        const listSnapshot = JSON.stringify(page.list);
        let commands = null;
        if (typeof ReactorClipboard !== 'undefined') {
            const clipboardData = await ReactorClipboard.read('eventCommands');
            commands = clipboardData?.payload?.commands || null;
        } else {
            commands = this.commandClipboard;
        }
        if (this.currentTroop !== targetTroop || this.currentBattlePageIndex !== targetPageIndex
            || targetTroop?.pages?.[targetPageIndex] !== page
            || JSON.stringify(page.list) !== listSnapshot
            || selected.length !== this.selectedCommandIndices.length
            || selected.some((index, i) => index !== this.selectedCommandIndices[i])) return;
        if (!commands?.length) {
            alert(window.I18n ? window.I18n.tText('No event commands in clipboard to paste.') : 'No event commands in clipboard to paste.');
            return;
        }
        const selectedIndex = selected.length > 0 ? Math.max(...selected) : -1;
        let insertAt = selectedIndex >= 0 ? selectedIndex + 1 : page.list.length - 1;
        const ECL = this._eventCommandListClass();
        insertAt = ECL.safeInsertionIndex(page.list, insertAt);
        const pasted = commands.map(command => JSON.parse(JSON.stringify(command)));
        const baseIndent = ECL.insertionIndent(page.list, insertAt);
        ECL.rebaseInsertIndent(pasted, baseIndent);
        pasted.forEach((cmd, i) => {
            page.list.splice(insertAt + i, 0, cmd);
        });
        this.selectedCommandIndices = pasted.map((_, index) => insertAt + index);
        this.commandSelectionAnchor = this.selectedCommandIndices[0] ?? null;
        this.persistTroop();
        if (container) this.renderCommandList(container, page);
    }

    // COMMAND DISPLAY -- delegated to EventCommandList, the way
    // DatabaseCommonEventEditor already does it. The copy that used to live
    // here knew a smaller name table and a shorter description switch, so a
    // battle page printed "Cmd 342" over a raw parameter list where the map
    // event list printed "Change Enemy TP", and read Change Enemy HP's sign out
    // of the wrong parameter. What this host still owns is the enemy slot: a
    // troop page can name it, and no other host can.

    // The colours stay this host's own: a battle page bands them more finely
    // than the map list does, and the rows look the way they always have.
    getCommandColor(code) {
        if (code === 0) return 'var(--color-border-input)';
        if (code >= 101 && code <= 105) return 'var(--color-syntax-type)';
        if (code === 108 || code === 109 || code === 408) return 'var(--color-syntax-string)';
        if (code >= 111 && code <= 119) return 'var(--color-syntax-string)';
        if (code >= 121 && code <= 129) return 'var(--color-syntax-function)';
        if (code >= 201 && code <= 250) return 'var(--color-syntax-type)';
        if (code >= 301 && code <= 340) return 'var(--color-syntax-function)';
        if (code >= 351 && code <= 357) return 'var(--color-syntax-keyword)';
        if (code >= 401 && code <= 413) return 'var(--color-syntax-comment)';
        if ((code >= 601 && code <= 604) || code === 655 || code === 657) return 'var(--color-syntax-comment)';
        return 'var(--color-text-muted)';
    }

    getCommandDisplay(cmd, page, index) {
        const info = this.commandDialogs().getCommandInfo(cmd, page, index);
        const named = this.enemySlotDescription(cmd);
        return {
            name: info.name,
            color: this.getCommandColor(cmd.code),
            description: named === null ? info.description : named
        };
    }

    /**
     * A battle command's summary, with the enemy named from this page's troop
     * rather than numbered. Null for everything else, which the shared
     * formatter describes perfectly well.
     */
    enemySlotDescription(cmd) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const p = cmd.parameters || [];
        const db = this.databaseManager;
        switch (cmd.code) {
            case 331: case 332: case 342: {
                const amount = p[2] === 0 ? p[3] : `${tt('Variable')} #${p[3]}`;
                return `${this.enemySlotLabel(p[0])}: ${p[1] === 0 ? '+' : '-'}${amount}`;
            }
            case 333: {
                const state = db.getState(p[2]);
                return `${this.enemySlotLabel(p[0])}: ${p[1] === 0 ? '+' : '-'} ${state ? state.name : `${tt('State')} ${p[2]}`}`;
            }
            case 334: case 335:
                return this.enemySlotLabel(p[0]);
            case 336: {
                const enemy = db.getEnemy(p[1]);
                return `${this.enemySlotLabel(p[0])} \u2192 ${enemy ? enemy.name : '#' + p[1]}`;
            }
            case 337: {
                const anim = db.getAnimation(p[1]);
                const target = p[2] ? tt('Entire Troop') : this.enemySlotLabel(p[0]);
                return `${target}: ${anim ? anim.name : `${tt('Animation')} #${p[1]}`}`;
            }
            case 339: {
                const skill = db.getSkill(p[2]);
                const skillName = skill ? skill.name : `${tt('Skill')} #${p[2]}`;
                const actor = p[0] === 1 ? db.getActor(p[1]) : null;
                const who = p[0] === 1
                    ? (actor ? actor.name : `${tt('Actor')} #${p[1]}`)
                    : this.enemySlotLabel(p[1]);
                return `${who}: ${skillName}`;
            }
            default:
                return null;
        }
    }

    // Page management
    addBattlePage() {
        if (!this.currentTroop.pages) this.currentTroop.pages = [];
        this.currentTroop.pages.push({
            conditions: { actorHp: 0, actorId: 1, actorValid: false, enemyHp: 0, enemyIndex: 0, enemyValid: false, switchId: 1, switchValid: false, turnA: 0, turnB: 0, turnEnding: false, turnValid: false },
            span: 0,
            list: [{ code: 0, indent: 0, parameters: [] }]
        });
        this.currentBattlePageIndex = this.currentTroop.pages.length - 1;
        this.selectedCommandIndices = [];
        this.persistTroop();
        this.renderBattlePageTabs();
        this.renderBattlePageContent();
    }

    copyBattlePage() {
        const pages = this.currentTroop.pages || [];
        if (this.currentBattlePageIndex < pages.length) {
            this.battlePageClipboard = JSON.parse(JSON.stringify(pages[this.currentBattlePageIndex]));
            if (typeof ReactorClipboard !== 'undefined') {
                ReactorClipboard.write('troopEventPage', { page: this.battlePageClipboard });
            }
        }
    }

    async pasteBattlePage() {
        const targetTroop = this.currentTroop;
        const targetPageIndex = this.currentBattlePageIndex;
        let pageData = null;
        if (typeof ReactorClipboard !== 'undefined') {
            const clipboardData = await ReactorClipboard.read('troopEventPage');
            pageData = clipboardData?.payload?.page || null;
        } else {
            pageData = this.battlePageClipboard;
        }
        if (this.currentTroop !== targetTroop || this.currentBattlePageIndex !== targetPageIndex) return;
        if (!pageData) return;
        if (!this.currentTroop.pages) this.currentTroop.pages = [];
        this.currentTroop.pages.splice(this.currentBattlePageIndex + 1, 0, JSON.parse(JSON.stringify(pageData)));
        this.currentBattlePageIndex++;
        this.selectedCommandIndices = [];
        this.persistTroop();
        this.renderBattlePageTabs();
        this.renderBattlePageContent();
    }

    deleteBattlePage() {
        const pages = this.currentTroop.pages || [];
        if (pages.length === 0) return;
        pages.splice(this.currentBattlePageIndex, 1);
        if (this.currentBattlePageIndex >= pages.length) this.currentBattlePageIndex = Math.max(0, pages.length - 1);
        this.selectedCommandIndices = [];
        this.persistTroop();
        this.renderBattlePageTabs();
        this.renderBattlePageContent();
    }

    clearBattlePage() {
        const pages = this.currentTroop.pages || [];
        if (this.currentBattlePageIndex >= pages.length) return;
        pages[this.currentBattlePageIndex].list = [{ code: 0, indent: 0, parameters: [] }];
        pages[this.currentBattlePageIndex].conditions = { actorHp: 0, actorId: 1, actorValid: false, enemyHp: 0, enemyIndex: 0, enemyValid: false, switchId: 1, switchValid: false, turnA: 0, turnB: 0, turnEnding: false, turnValid: false };
        this.selectedCommandIndices = [];
        this.persistTroop();
        this.renderBattlePageContent();
    }

    getConditionsSummary(conditions) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (!conditions) return tt('No conditions');
        const parts = [];
        if (conditions.turnEnding) parts.push(tt('Turn End'));
        if (conditions.turnValid) parts.push(`${tt('Turn')} ${conditions.turnA || 0}+${conditions.turnB || 0}x`);
        if (conditions.enemyValid) {
            const members = this.currentTroop.members || [];
            const m = members[conditions.enemyIndex];
            const enemy = m ? this.databaseManager.getEnemy(m.enemyId) : null;
            parts.push(`${tt('Enemy:')} ${enemy ? enemy.name : '#' + conditions.enemyIndex} \u2264${conditions.enemyHp}%`);
        }
        if (conditions.actorValid) {
            const actor = this.databaseManager.getActor(conditions.actorId);
            parts.push(`${tt('Actor:')} ${actor ? actor.name : '#' + conditions.actorId} \u2264${conditions.actorHp}%`);
        }
        if (conditions.switchValid) parts.push(`${tt('Sw')} #${conditions.switchId} ${tt('ON')}`);
        return parts.length > 0 ? parts.join(', ') : tt('No conditions');
    }

    // ==========================================
    // CONDITIONS MODAL
    // ==========================================

    showConditionsModal(page) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const c = page.conditions || {};

        const modal = document.createElement('div');
        modal.className = 'troop-conditions-modal';
        modal.style.cssText = 'position:fixed;inset:0;background-color:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;z-index:10001;';

        const dialog = document.createElement('div');
        dialog.className = 'rr-modal';
        dialog.style.cssText = 'width:min(560px,calc(100vw - 32px));max-height:min(680px,calc(100vh - 32px));overflow:hidden;';

        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        header.style.flexShrink = '0';
        header.innerHTML = `
            <div class="rr-modal-title">${tt('Conditions')}</div>
            <button class="rr-modal-close troop-cond-close" type="button">&times;</button>
        `;
        dialog.appendChild(header);

        const members = this.currentTroop.members || [];
        const enemies = this.databaseManager.getEnemies();
        const actors = this.databaseManager.getActors();

        const memberOpts = members.map((m, i) => {
            const en = enemies.find(e => e && e.id === m.enemyId);
            return `<option value="${i}" ${i === c.enemyIndex ? 'selected' : ''}>#${i + 1} ${this.escapeHTML(en ? en.name : '?')}</option>`;
        }).join('');

        const actorOpts = actors.map(a =>
            `<option value="${a.id}" ${a.id === c.actorId ? 'selected' : ''}>#${a.id} ${this.escapeHTML(a.name)}</option>`
        ).join('');

        const inputStyle = 'width: 50px; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 3px; border-radius: 3px;';
        const selStyle = 'flex: 1; min-width: 0; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 3px; border-radius: 3px; font-size: 12px;';

        const form = document.createElement('div');
        form.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 13px;">
                    <input type="checkbox" id="cond-turnEnding" ${c.turnEnding ? 'checked' : ''}> ${tt('Turn End')}
                </label>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 4px; color: var(--color-text); font-size: 13px;">
                        <input type="checkbox" id="cond-turnValid" ${c.turnValid ? 'checked' : ''}> ${tt('Turn')}
                    </label>
                    <input type="number" id="cond-turnA" value="${c.turnA || 0}" min="0" style="${inputStyle}">
                    <span style="color: var(--color-text-muted);">+</span>
                    <input type="number" id="cond-turnB" value="${c.turnB || 0}" min="0" style="${inputStyle}">
                    <span style="color: var(--color-text-muted);">\u00D7 X</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 4px; color: var(--color-text); font-size: 13px; white-space: nowrap;">
                        <input type="checkbox" id="cond-enemyValid" ${c.enemyValid ? 'checked' : ''}> ${tt('Enemy HP')}
                    </label>
                    <select id="cond-enemyIndex" style="${selStyle}">${memberOpts}</select>
                    <span style="color: var(--color-text-muted);">\u2264</span>
                    <input type="number" id="cond-enemyHp" value="${c.enemyHp || 0}" min="0" max="100" style="${inputStyle}">
                    <span style="color: var(--color-text-muted);">%</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 4px; color: var(--color-text); font-size: 13px; white-space: nowrap;">
                        <input type="checkbox" id="cond-actorValid" ${c.actorValid ? 'checked' : ''}> ${tt('Actor HP')}
                    </label>
                    <select id="cond-actorId" style="${selStyle}">${actorOpts}</select>
                    <span style="color: var(--color-text-muted);">\u2264</span>
                    <input type="number" id="cond-actorHp" value="${c.actorHp || 0}" min="0" max="100" style="${inputStyle}">
                    <span style="color: var(--color-text-muted);">%</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 4px; color: var(--color-text); font-size: 13px; white-space: nowrap;">
                        <input type="checkbox" id="cond-switchValid" ${c.switchValid ? 'checked' : ''}> ${tt('Switch')}
                    </label>
                    <input type="number" id="cond-switchId" value="${c.switchId || 1}" min="1" style="flex: 1; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 3px; border-radius: 3px;">
                </div>
            </div>
        `;
        form.className = 'troop-condition-grid';
        const conditionRows = Array.from(form.firstElementChild.children);
        const columns = [
            'minmax(130px,34%) minmax(0,1fr)',
            'minmax(130px,34%) 58px auto 58px auto',
            'minmax(130px,34%) minmax(0,1fr) auto 64px auto',
            'minmax(130px,34%) minmax(0,1fr) auto 64px auto',
            'minmax(130px,34%) minmax(0,1fr)'
        ];
        conditionRows.forEach((row, index) => {
            const isStandaloneLabel = row.tagName === 'LABEL';
            row.className = 'troop-condition-row';
            row.style.cssText = isStandaloneLabel
                ? `display:flex;align-items:center;gap:7px;min-height:38px;padding:6px 10px;background:var(--color-bg-list-item);color:var(--color-text);font-size:12px;font-weight:600;box-sizing:border-box;`
                : `display:grid;grid-template-columns:${columns[index]};align-items:center;gap:6px;min-height:38px;padding:6px 10px;background:${index % 2 ? 'var(--color-bg-list-item-alt)' : 'var(--color-bg-list-item)'};box-sizing:border-box;`;
            const label = isStandaloneLabel ? row : row.querySelector('label');
            if (label && !isStandaloneLabel) label.style.cssText = 'display:flex;align-items:center;gap:7px;min-width:0;color:var(--color-text);font-size:12px;font-weight:600;white-space:nowrap;';
            row.querySelectorAll('input[type="checkbox"]').forEach(input => input.className = 'system-checkbox');
            row.querySelectorAll('input[type="number"], select').forEach(input => {
                input.style.cssText = 'width:100%;min-width:0;padding:4px 6px;background:var(--color-bg-input);border:1px solid var(--color-border-input);border-radius:3px;color:var(--color-text);box-sizing:border-box;font-size:12px;';
            });
            row.querySelectorAll('span').forEach(span => {
                if (!span.closest('label')) span.style.color = 'var(--color-text-muted)';
            });
        });
        form.firstElementChild.style.cssText = 'display:flex;flex-direction:column;gap:2px;border:1px solid var(--color-border);border-radius:4px;overflow:hidden;';

        const body = document.createElement('div');
        body.style.cssText = 'padding:16px;overflow-y:auto;background-color:var(--color-bg-surface);';
        body.appendChild(form);
        dialog.appendChild(body);

        const btnRow = document.createElement('div');
        btnRow.className = 'rr-modal-footer troop-conditions-footer';
        btnRow.style.flexShrink = '0';
        btnRow.appendChild(this.createButton('Cancel', () => document.body.removeChild(modal)));
        btnRow.appendChild(this.createButton('OK', () => {
            page.conditions = {
                turnEnding: document.getElementById('cond-turnEnding').checked,
                turnValid: document.getElementById('cond-turnValid').checked,
                turnA: parseInt(document.getElementById('cond-turnA').value) || 0,
                turnB: parseInt(document.getElementById('cond-turnB').value) || 0,
                enemyValid: document.getElementById('cond-enemyValid').checked,
                enemyIndex: parseInt(document.getElementById('cond-enemyIndex').value) || 0,
                enemyHp: parseInt(document.getElementById('cond-enemyHp').value) || 0,
                actorValid: document.getElementById('cond-actorValid').checked,
                actorId: parseInt(document.getElementById('cond-actorId').value) || 1,
                actorHp: parseInt(document.getElementById('cond-actorHp').value) || 0,
                switchValid: document.getElementById('cond-switchValid').checked,
                switchId: parseInt(document.getElementById('cond-switchId').value) || 1
            };
            this.persistTroop();
            this.renderBattlePageContent();
            document.body.removeChild(modal);
        }));
        dialog.appendChild(btnRow);

        header.querySelector('.troop-cond-close').addEventListener('click', () => document.body.removeChild(modal));
        modal.appendChild(dialog);
        // A click on the backdrop no longer closes the dialog: close deliberately.
        document.body.appendChild(modal);
    }

    // ==========================================
    // BATTLE TEST
    // ==========================================

    openBattleTestConfig() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (typeof BattleTestConfigModal === 'undefined') { alert(tt('Battle test module not loaded')); return; }
        const project = this.projectManager.getCurrentProject();
        if (!project) { alert(tt('No project loaded')); return; }
        const playtestManager = this.parentEditor.playtestManager;
        if (!playtestManager) { alert(tt('Playtest manager not available')); return; }

        // Test_Troops.json is written from the database manager's copy, so the
        // placement on screen must be in it before the dialog reads it.
        this.persistTroop();
        new BattleTestConfigModal(this.databaseManager, project, this.currentTroopId, this.battleback1Name, this.battleback2Name, playtestManager).show();
    }

    // ==========================================
    // PERSISTENCE & UTILITIES
    // ==========================================

    persistTroop() {
        if (this.currentTroop && this.currentTroopId)
            this.databaseManager.updateTroop(this.currentTroopId, this.currentTroop);
    }

    attachMainListeners(container) {
        setTimeout(() => {
            const nameInput = document.getElementById('troop-name-input');
            if (nameInput) {
                nameInput.addEventListener('change', (e) => {
                    this.currentTroop.name = e.target.value;
                    this.persistTroop();
                    const sel = document.querySelector('.database-list-item.selected span');
                    if (sel) sel.textContent = e.target.value;
                });
            }
            const noteInput = document.getElementById('troop-note-input');
            if (noteInput) {
                noteInput.addEventListener('change', (e) => {
                    this.currentTroop.note = e.target.value;
                    this.persistTroop();
                });
            }
        }, 0);
    }

    createSmallButton(label, onclick) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const btn = document.createElement('button');
        btn.textContent = tt(label);
        btn.className = 'rr-btn-chip';
        btn.onclick = onclick;
        return btn;
    }

    createButton(label, onclick) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const btn = document.createElement('button');
        btn.textContent = tt(label);
        btn.className = label === 'OK' ? 'rr-button-primary' : 'rr-btn-secondary';
        btn.onclick = onclick;
        return btn;
    }

    // ==========================================
    // BATTLE UI OVERLAY
    // ==========================================
    //
    // A schematic of the windows Scene_Battle puts over this troop, sized from
    // the same numbers the runtime uses: the UI box (`configureBattleGeometry`),
    // `Scene_Battle.statusWindowRect` / `actorCommandWindowRect`
    // (runtime/reactor_scenes.js) and `Sprite_Actor.setActorHome`
    // (runtime/reactor_sprites.js), with the VisuStella overrides read from the
    // project's plugin manifest rather than assumed: BattleCore's layout style
    // and command width, the enabled battle system, PartySystem's party size.
    // It is a schematic and says so in its corner tag - a plugin's own JS
    // (BattleCore's `HomePosJS`, a custom status window) is not evaluated.

    static get BATTLE_UI_STORAGE_KEY() { return 'rpg-reactor.troopPreview.battleUI'; }

    static get BATTLE_SYSTEM_PLUGINS() {
        // Load-order-independent: the first enabled one wins, as in play only
        // one of them can own BattleManager.
        return ['OTB', 'CTB', 'ATB', 'BTB', 'STB', 'FTB', 'ETB', 'PTB'];
    }

    loadBattleUIPreference() {
        try {
            return localStorage.getItem(DatabaseTroopEditor.BATTLE_UI_STORAGE_KEY) === 'true';
        } catch (error) {
            return false;
        }
    }

    saveBattleUIPreference(enabled) {
        try {
            localStorage.setItem(DatabaseTroopEditor.BATTLE_UI_STORAGE_KEY, enabled ? 'true' : 'false');
        } catch (error) {
            // Preference only; the toggle still works for this session.
        }
    }

    /**
     * The plugin manifest as an array of `{name, status, parameters}`, or null
     * when the project has none. Reads the file the runtime loads
     * (`js/reactor_plugins.js`), falling back to the MZ manifest for projects
     * that have not been converted.
     */
    readPluginManifest() {
        const project = this.projectManager?.getCurrentProject?.();
        if (!project?.path || typeof require === 'undefined') return null;
        // The shared reader (utils/TextCodes.js) already caches by mtime and
        // knows why pluginManager.plugins cannot be asked; go through it.
        const shared = (typeof window !== 'undefined' && window.RRTextCodes?.readManifest) || null;
        if (shared) {
            const plugins = shared(project.path);
            return Array.isArray(plugins) ? plugins : null;
        }
        try {
            const path = require('path');
            const fs = require('fs');
            for (const file of ['reactor_plugins.js', 'plugins.js']) {
                const manifestPath = path.join(project.path, 'js', file);
                if (!fs.existsSync(manifestPath)) continue;
                return DatabaseTroopEditor.parsePluginManifest(fs.readFileSync(manifestPath, 'utf8'));
            }
        } catch (error) {
            console.warn('Could not read the plugin manifest for the battle preview:', error);
        }
        return null;
    }

    /** `var $plugins = [...];` in either the pretty-printed or the one-line form. */
    static parsePluginManifest(source) {
        const text = String(source || '');
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start === -1 || end <= start) return null;
        try {
            const parsed = JSON.parse(text.slice(start, end + 1));
            return Array.isArray(parsed) ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    /** The enabled manifest entry for `name`, or null. Disabled counts as absent. */
    static enabledPlugin(manifest, name) {
        if (!Array.isArray(manifest)) return null;
        const entry = manifest.find(plugin => plugin && plugin.name === name && plugin.status === true);
        return entry || null;
    }

    /** A VisuStella `:struct` parameter parsed, or `{}` when absent or malformed. */
    static structParam(plugin, key) {
        const raw = plugin?.parameters?.[key];
        if (typeof raw !== 'string' || !raw.trim()) return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    /**
     * What the battle UI would look like for this project, from its System
     * data and plugin manifest. Pure: no I/O, so it can be checked in a test.
     */
    detectBattleUISetup(system, manifest) {
        const enabled = name => DatabaseTroopEditor.enabledPlugin(manifest, name);
        const coreEngine = enabled('VisuMZ_0_CoreEngine');
        const battleCore = enabled('VisuMZ_1_BattleCore');
        const partySystem = enabled('VisuMZ_2_PartySystem');
        const sideviewUI = enabled('VisuMZ_3_SideviewBattleUI');
        const frontviewUI = enabled('VisuMZ_3_FrontviewBattleUI');

        let turnSystem = null;
        for (const code of DatabaseTroopEditor.BATTLE_SYSTEM_PLUGINS) {
            if (enabled(`VisuMZ_2_BattleSystem${code}`)) { turnSystem = code.toLowerCase(); break; }
        }
        if (!turnSystem) {
            // 0 turn-based, 1 TPB active, 2 TPB wait (System › Battle System).
            turnSystem = Number(system?.battleSystem) > 0 ? 'tpb' : 'turn';
        }

        // Mirrors Scene_Battle.battleLayoutStyle in VisuMZ_1_BattleCore: a UI
        // style whose plugin is missing silently becomes "default".
        let layoutStyle = 'vanilla';
        let commandWidth = 192;
        let xpCommandLines = 4;
        let showFacesListStyle = true;
        if (battleCore) {
            const layout = DatabaseTroopEditor.structParam(battleCore, 'BattleLayout:struct');
            layoutStyle = String(layout['Style:str'] || 'default').toLowerCase().trim() || 'default';
            if (layoutStyle === 'sideview_ui' && !sideviewUI) layoutStyle = 'default';
            if (layoutStyle === 'frontview_ui' && !frontviewUI) layoutStyle = 'default';
            commandWidth = Number(layout['CommandWidth:num']) || 192;
            xpCommandLines = Number(layout['XPActorCommandLines:num']) || 4;
            showFacesListStyle = String(layout['ShowFacesListStyle:eval'] ?? 'true').trim() !== 'false';
        }

        let maxBattleMembers = 4;
        if (partySystem) {
            const general = DatabaseTroopEditor.structParam(partySystem, 'General:struct');
            maxBattleMembers = Math.max(1, Number(general['MaxBattleMembers:num']) || 4);
        }

        let repositionActors = false;
        if (coreEngine) {
            const ui = DatabaseTroopEditor.structParam(coreEngine, 'UI:struct');
            repositionActors = String(ui['RepositionActors:eval']).trim() === 'true';
        }

        let turnOrder = null;
        if (turnSystem === 'otb') {
            const otb = DatabaseTroopEditor.structParam(enabled('VisuMZ_2_BattleSystemOTB'), 'TurnOrder:struct');
            turnOrder = {
                position: String(otb['DisplayPosition:str'] || 'top').toLowerCase(),
                offsetX: Number(otb['DisplayOffsetX:num']) || 0,
                offsetY: Number(otb['DisplayOffsetY:num']) || 0,
                thin: Number(otb['SpriteThin:num']) || 72,
                length: Number(otb['SpriteLength:num']) || 72,
                subjectText: String(otb['UiSubjectText:str'] ?? '★'),
                currentText: String(otb['UiCurrentText:str'] ?? 'CURRENT TURN'),
                nextText: String(otb['UiNextText:str'] ?? 'NEXT TURN')
            };
        }

        return {
            sideView: !!system?.optSideView,
            displayTp: !!system?.optDisplayTp,
            screenWidth: this.screenWidth,
            screenHeight: this.screenHeight,
            boxWidth: this.boxWidth,
            boxHeight: this.boxHeight,
            boxX: (this.screenWidth - this.boxWidth) / 2,
            boxY: (this.screenHeight - this.boxHeight) / 2,
            hasManifest: Array.isArray(manifest),
            coreEngine: !!coreEngine,
            battleCore: !!battleCore,
            repositionActors,
            turnSystem,
            turnOrder,
            layoutStyle,
            commandWidth,
            xpCommandLines,
            showFacesListStyle,
            maxBattleMembers,
            party: this.battleTestParty(system, maxBattleMembers)
        };
    }

    /**
     * The party a battle test would field: the System testBattlers slots that
     * name a real actor, else the starting party, capped at the battle size.
     */
    battleTestParty(system, maxBattleMembers) {
        const dm = this.databaseManager;
        const getActor = id => (dm && typeof dm.getActor === 'function') ? dm.getActor(id) : null;
        const fromTest = (system?.testBattlers || [])
            .map(slot => ({ actor: getActor(Number(slot?.actorId) || 0), level: Number(slot?.level) || 1 }))
            .filter(entry => entry.actor);
        const members = fromTest.length ? fromTest
            : (system?.partyMembers || [])
                .map(id => getActor(Number(id) || 0))
                .filter(Boolean)
                .map(actor => ({ actor, level: Number(actor.initialLevel) || 1 }));
        return members.slice(0, maxBattleMembers).map(entry => {
            const cls = (dm && typeof dm.getClass === 'function') ? dm.getClass(entry.actor.classId) : null;
            const param = index => {
                const table = cls?.params?.[index];
                return Array.isArray(table) ? (Number(table[entry.level]) || Number(table[table.length - 1]) || 0) : 0;
            };
            return { actor: entry.actor, level: entry.level, mhp: param(0), mmp: param(1) };
        });
    }

    refreshBattleUISetup() {
        const system = this.databaseManager.getSystem();
        this.battleUISetup = this.detectBattleUISetup(system, this.readPluginManifest());
        return this.battleUISetup;
    }

    /**
     * Queue the art the overlay draws - sideview battlers, faces, the
     * windowskin - through the caller's pending counter. Returns how many
     * loads were started.
     */
    loadBattleUIAssets(project, path, done) {
        const setup = this.refreshBattleUISetup();
        if (!setup) return 0;
        let started = 0;
        const track = (cache, key, dir, reference) => {
            if (!reference || cache[key]) return;
            const file = RRAssetFiles.findImage(path.join(project.path, 'img', dir), reference);
            if (!file) return;
            const img = new Image();
            img.onload = done;
            img.onerror = () => { delete cache[key]; done(); };
            img.src = RRAssetFiles.toUrl(file.absolutePath);
            cache[key] = img;
            started++;
        };
        for (const { actor } of setup.party) {
            if (setup.sideView) track(this.actorBattlerImages, actor.battlerName, 'sv_actors', actor.battlerName);
            track(this.actorFaceImages, actor.faceName, 'faces', actor.faceName);
        }
        if (!this.windowSkin && typeof window !== 'undefined' && window.RRWindowskin) {
            started++;
            window.RRWindowskin.load(path.join(project.path, 'img', 'system', 'Window.png'))
                .then(record => { this.windowSkin = record; })
                .catch(() => { this.windowSkin = null; })
                .then(done);
        }
        return started;
    }

    drawBattleUIOverlay(ctx, setup) {
        ctx.save();
        if (setup.sideView) this.drawSideviewParty(ctx, setup);
        if (setup.turnSystem === 'otb') this.drawOtbTurnOrder(ctx, setup);
        else if (setup.turnSystem !== 'turn' && setup.turnSystem !== 'tpb') this.drawTurnOrderBar(ctx, setup);
        else this.drawBattleLogArea(ctx, setup);
        this.drawBattleWindows(ctx, setup);
        this.drawBattleSetupTag(ctx, setup);
        ctx.restore();
    }

    /**
     * A window drawn with the project's own skin, or a plain stand-in without
     * one. `frame: false` is Window_BattleStatus with `frameVisible = false`:
     * the back is drawn, the nine-slice frame is not. `dim: true` is the
     * background type 1 that BattleCore gives the XP-style actor command.
     */
    drawSkinWindow(ctx, rect, options = {}) {
        const opacity = Number.isFinite(options.opacity) ? options.opacity
            : (Number(this.databaseManager.getSystem()?.advanced?.windowOpacity) || 192);
        const skin = this.windowSkin;
        const dest = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
        if (typeof window !== 'undefined' && window.RRWindowskin && (skin || options.dim)) {
            window.RRWindowskin.drawWindow(ctx, dest, skin, {
                opacity, background: options.dim ? 1 : 0, frame: options.frame !== false
            });
            return;
        }
        ctx.fillStyle = `rgba(16, 24, 48, ${(opacity / 255).toFixed(3)})`;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        if (options.frame === false) return;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 2;
        ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
        ctx.lineWidth = 1;
    }

    skinColor(index, fallback) {
        const skin = this.windowSkin;
        if (skin && typeof window !== 'undefined' && window.RRWindowskin?.textColor) {
            try { return window.RRWindowskin.textColor(skin, index) || fallback; } catch (error) { /* fall through */ }
        }
        return fallback;
    }

    /** Where Sprite_Actor.setActorHome puts each party slot, in battlefield coordinates. */
    actorHomePosition(index, setup) {
        if (setup.battleCore || (setup.coreEngine && setup.repositionActors)) {
            // BattleCore's default HomePosJS and CoreEngine's RepositionActors
            // are the same formula, centred on the screen and lifted by the
            // party size so the last slot clears the status window.
            const x = Math.round(setup.screenWidth / 2 + 192) - Math.floor((setup.screenWidth - setup.boxWidth) / 2) + index * 32;
            const y = (setup.screenHeight - 200) - setup.maxBattleMembers * 48
                - Math.floor((setup.screenHeight - setup.boxHeight) / 2) + index * 48;
            return { x, y };
        }
        return { x: 600 + index * 32, y: 280 + index * 48 };
    }

    drawSideviewParty(ctx, setup) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        setup.party.forEach((entry, index) => {
            const home = this.actorHomePosition(index, setup);
            const pos = this.battleToCanvas(home.x, home.y);
            const img = this.actorBattlerImages[entry.actor.battlerName];

            // The shadow the runtime parents under every actor sprite.
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.beginPath();
            ctx.ellipse(pos.x, pos.y - 2, 30, 9, 0, 0, Math.PI * 2);
            ctx.fill();

            if (img && img.complete && img.naturalWidth) {
                // Motion sheet: 9 columns x 6 rows; idle is column 0, row 0.
                const cw = img.naturalWidth / 9;
                const ch = img.naturalHeight / 6;
                ctx.drawImage(img, 0, 0, cw, ch, Math.round(pos.x - cw / 2), Math.round(pos.y - ch), cw, ch);
            } else {
                const w = 64, h = 64;
                ctx.fillStyle = 'rgba(64, 128, 255, 0.28)';
                ctx.fillRect(pos.x - w / 2, pos.y - h, w, h);
                ctx.strokeStyle = 'rgba(120, 180, 255, 0.9)';
                ctx.strokeRect(pos.x - w / 2, pos.y - h, w, h);
                ctx.fillStyle = '#fff';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(entry.actor.name || tt('Actor'), pos.x, pos.y - h / 2 + 4);
                ctx.textAlign = 'start';
            }
        });
    }

    /** One face-sized turn-order chip; enemies get a red frame, actors a blue one. */
    drawTurnChip(ctx, x, y, size, entry, isEnemy, subject) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(x, y, size, size);
        const face = entry && !isEnemy ? this.actorFaceImages[entry.actor.faceName] : null;
        if (face && face.complete && face.naturalWidth) {
            const src = RRFaceSheet.sourceRect(entry.actor.faceIndex, face);
            if (src) ctx.drawImage(face, src.x, src.y, src.width, src.height, x, y, size, size);
        } else if (isEnemy) {
            const img = entry?.battlerName ? this.enemySpriteImages[entry.battlerName] : null;
            if (img && img.complete && img.naturalWidth) {
                const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
                const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, size, size);
                ctx.clip();
                ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
                ctx.restore();
            }
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = isEnemy ? '#ff5050' : '#5aa0ff';
        ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
        ctx.lineWidth = 1;
        if (subject) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(subject, x + size / 2, y + size + 14);
            ctx.textAlign = 'start';
        }
    }

    /** The battlers a turn bar would show, party then visible enemies, interleaved. */
    turnOrderEntries(setup) {
        const enemies = this.databaseManager.getEnemies();
        const troopEntries = (this.currentTroop.members || [])
            .filter(member => !member.hidden)
            .map(member => enemies.find(e => e && e.id === member.enemyId))
            .filter(Boolean)
            .map(enemy => ({ enemy: true, entry: enemy }));
        const partyEntries = setup.party.map(entry => ({ enemy: false, entry }));
        const order = [];
        const count = Math.max(partyEntries.length, troopEntries.length);
        for (let i = 0; i < count; i++) {
            if (partyEntries[i]) order.push(partyEntries[i]);
            if (troopEntries[i]) order.push(troopEntries[i]);
        }
        return order;
    }

    drawOtbTurnOrder(ctx, setup) {
        const to = setup.turnOrder;
        const size = to.length;
        const margin = 32;
        const gap = 40;
        const y = (to.position === 'bottom' ? setup.screenHeight - size - margin - 20 : setup.boxY + margin) + to.offsetY;
        const left = setup.boxX + margin + to.offsetX;
        const segmentWidth = (setup.boxWidth - margin * 2 - gap) / 2;

        // The dark band behind both segments.
        const band = ctx.createLinearGradient(left, 0, left + setup.boxWidth - margin * 2, 0);
        band.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
        band.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
        ctx.fillStyle = band;
        ctx.fillRect(left, y, segmentWidth, size);
        ctx.fillRect(left + segmentWidth + gap, y, segmentWidth, size);

        const entries = this.turnOrderEntries(setup);
        const perSegment = Math.max(1, Math.floor(segmentWidth / (to.thin + 4)));
        const drawSegment = (x0, label, subjectFirst) => {
            entries.slice(0, perSegment).forEach((item, i) => {
                const x = x0 + i * (to.thin + 4);
                const isSubject = subjectFirst && i === 0;
                this.drawTurnChip(ctx, x, y, size, item.entry, item.enemy, isSubject ? to.subjectText : '');
            });
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(label, x0 + 6, y + size + 14);
        };
        drawSegment(left, to.currentText, true);
        drawSegment(left + segmentWidth + gap, to.nextText, false);
    }

    drawTurnOrderBar(ctx, setup) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const size = 64;
        const y = setup.boxY + 24;
        const left = setup.boxX + 32;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(left, y, setup.boxWidth - 64, size);
        const entries = this.turnOrderEntries(setup);
        const perBar = Math.max(1, Math.floor((setup.boxWidth - 64) / (size + 4)));
        entries.slice(0, perBar).forEach((item, i) => {
            this.drawTurnChip(ctx, left + i * (size + 4), y, size, item.entry, item.enemy, '');
        });
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`${tt('Turn Order')} (${setup.turnSystem.toUpperCase()})`, left + 6, y + size + 14);
    }

    /** Window_BattleLog has no frame; the area its first lines occupy is outlined. */
    drawBattleLogArea(ctx, setup) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const lines = 2;
        const rect = { x: setup.boxX, y: setup.boxY, width: setup.boxWidth, height: lines * 36 + 24 };
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '12px sans-serif';
        ctx.fillText(tt('Battle Log'), rect.x + 12, rect.y + 18);
    }

    /**
     * The battle windows' rectangles in canvas pixels, transcribed from
     * Scene_Battle in runtime/reactor_scenes.js and, when BattleCore is
     * enabled, from its `statusWindowRect*` / `partyCommandWindowRect*` /
     * `Window_ActorCommand.resizeWindow*` overrides for the resolved style.
     * `isRightInputMode()` is true in this runtime. Every constant here is a
     * runtime one: line height 36, selectable item height 44, padding 12,
     * `Window_BattleStatus` padding 8 and extraHeight 10 while its frame is
     * hidden (default / XP / portrait), 0 with it shown (list / border).
     */
    battleWindowRects(setup) {
        const bx = setup.boxX, by = setup.boxY, bw = setup.boxWidth, bh = setup.boxHeight;
        const W = setup.screenWidth, H = setup.screenHeight;
        const lines = n => n * 44 + 24;                      // calcWindowHeight(n, true)
        const cmdW = setup.commandWidth;
        const style = setup.layoutStyle;
        const members = Math.max(1, setup.party.length);

        if (style === 'xp' || style === 'portrait') {
            const statusH = lines(4) + 10;
            const status = { x: bx, y: by + bh - statusH + 10, width: bw, height: statusH, frame: false, padding: 8, extra: 10 };
            // Window_ActorCommand.resizeWindowXPStyle for the first actor, dimmed.
            const colW = Math.round(bw / members);
            const w = Math.max(Math.min(Math.round(bw / 3), colW), cmdW);
            const h = lines(setup.xpCommandLines);
            const minX = Math.floor((bw - W) / 2);
            const x = Math.min(Math.max(Math.round((colW - w) / 2), minX), bw - minX - w);
            const command = { x: bx + x, y: status.y - h, width: w, height: h, dim: true };
            return { status, command, help: null };
        }
        if (style === 'border') {
            const help = { x: bx + Math.round((bw - W) / 2), y: by - (H - bh) / 2, width: W, height: 2 * 36 + 24 };
            const statusH = lines(4);
            const status = { x: help.x, y: by + bh - statusH + (H - bh) / 2, width: W, height: statusH, frame: true, padding: 12, extra: 0 };
            const w = Math.floor(W / 3);
            const top = help.y + help.height;
            const command = { x: bx + (W + bw) / 2 - w, y: top, width: w, height: status.y - top };
            return { status, command, help };
        }
        if (style === 'list') {
            const areaH = lines(Math.max(1, setup.maxBattleMembers));
            const status = { x: bx, y: by + bh - areaH, width: bw - cmdW, height: areaH, frame: true, padding: 12, extra: 0 };
            const command = { x: bx + bw - cmdW, y: by + bh - areaH, width: cmdW, height: areaH };
            return { status, command, help: null };
        }
        // BattleCore "default", and the stock engine: the stock one sits 4px higher.
        const areaH = lines(4);
        const statusH = areaH + 10;
        const status = {
            x: bx, y: by + bh - statusH + 10 - (setup.battleCore ? 0 : 4),
            width: bw - cmdW, height: statusH, frame: false, padding: 8, extra: 10
        };
        const command = { x: bx + bw - cmdW, y: by + bh - areaH, width: cmdW, height: areaH };
        return { status, command, help: null };
    }

    /** Status and command windows, laid out by the resolved layout style. */
    drawBattleWindows(ctx, setup) {
        const { status, command, help } = this.battleWindowRects(setup);
        if (help) this.drawSkinWindow(ctx, help);
        this.drawSkinWindow(ctx, status, { frame: status.frame });
        if (setup.layoutStyle === 'list') this.drawStatusList(ctx, status, setup);
        else this.drawStatusColumns(ctx, status, setup);
        this.drawSkinWindow(ctx, command, { dim: !!command.dim });
        this.drawActorCommands(ctx, command, setup);
    }

    /**
     * Window_Selectable.itemRect for column `index` of `cols`, then the
     * itemRectWithPadding inset, both in canvas pixels. colSpacing is 8 and
     * the item padding 8, as in runtime/reactor_windows.js.
     */
    statusItemRect(status, index, cols) {
        const innerW = status.width - status.padding * 2;
        const innerH = status.height - status.padding * 2;
        const itemW = Math.floor(innerW / cols);
        const rect = { x: status.x + status.padding + index * itemW + 4, y: status.y + status.padding, width: itemW - 8, height: innerH };
        const padded = { x: rect.x + 8, y: rect.y, width: rect.width - 16, height: rect.height };
        return { rect, padded };
    }

    /**
     * A database name as a command window shows it: `\I[79]Magick` is drawn
     * with an icon and the text, so the escape must not appear as text here.
     * Bracketed codes, the single-character ones, and `\\` for a backslash.
     */
    static stripTextCodes(text) {
        return String(text ?? '')
            .replace(/\\[A-Za-z]+\[[^\]]*\]/g, '')
            .replace(/\\[{}$.|!<>^]/g, '')
            .replace(/\\\\/g, '\\')
            .trim();
    }

    drawActorCommands(ctx, rect, setup) {
        const system = this.databaseManager.getSystem();
        const commands = system?.terms?.commands || [];
        const skillTypes = (system?.skillTypes || []).slice(1).filter(name => name);
        const items = [commands[2] || 'Attack', ...skillTypes, commands[3] || 'Guard', commands[4] || 'Item']
            .map(name => DatabaseTroopEditor.stripTextCodes(name));
        const padding = 12, itemPadding = 8;
        const rows = Math.floor((rect.height - padding * 2) / 44);
        ctx.font = '20px sans-serif';
        ctx.textBaseline = 'middle';
        items.slice(0, rows).forEach((name, i) => {
            const y = rect.y + padding + i * 44;
            if (i === 0) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
                ctx.fillRect(rect.x + padding, y + 2, rect.width - padding * 2, 40);
            }
            ctx.fillStyle = this.skinColor(0, '#ffffff');
            ctx.fillText(String(name), rect.x + padding + itemPadding, y + 22);
        });
        ctx.textBaseline = 'alphabetic';
    }

    /**
     * One Sprite_Gauge as placeGauge draws it: a 128x32 bitmap at (x, y), the
     * label in the 24px font at the top-left, the 12px bar along the bottom
     * starting after the label, the value right-aligned in the 20px font.
     */
    drawGauge(ctx, x, y, label, rate, color1, color2, valueText) {
        const width = 128, gaugeH = 12;
        ctx.font = 'bold 24px sans-serif';
        const gaugeX = Math.ceil(ctx.measureText(String(label)).width) + 6;
        const gaugeY = y + 32 - gaugeH;
        const barW = Math.max(0, width - gaugeX);
        ctx.fillStyle = this.skinColor(19, '#202040');
        ctx.fillRect(x + gaugeX, gaugeY, barW, gaugeH);
        const fill = ctx.createLinearGradient(x + gaugeX, 0, x + width, 0);
        fill.addColorStop(0, color1);
        fill.addColorStop(1, color2);
        ctx.fillStyle = fill;
        ctx.fillRect(x + gaugeX + 1, gaugeY + 1, Math.max(0, (barW - 2) * Math.min(1, Math.max(0, rate))), gaugeH - 2);
        ctx.fillStyle = this.skinColor(16, '#84aaff');
        ctx.fillText(String(label), x, y + 3 + 20);
        if (valueText) {
            ctx.font = '20px sans-serif';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'right';
            ctx.fillText(valueText, x + width, y + 3 + 18);
            ctx.textAlign = 'start';
        }
    }

    basicGaugeColors() {
        return {
            hp: [this.skinColor(20, '#63ff63'), this.skinColor(21, '#d3ff4b')],
            mp: [this.skinColor(22, '#3a6cff'), this.skinColor(23, '#78b8ff')],
            tp: [this.skinColor(28, '#28c87e'), this.skinColor(29, '#a0ff96')]
        };
    }

    gaugeLabels() {
        const basic = this.databaseManager.getSystem()?.terms?.basic || [];
        return { hp: basic[3] || 'HP', mp: basic[5] || 'MP', tp: basic[7] || 'TP' };
    }

    drawFace(ctx, actor, x, y, width, height) {
        const face = this.actorFaceImages[actor.faceName];
        const src = face && face.complete && face.naturalWidth ? RRFaceSheet.sourceRect(actor.faceIndex, face) : null;
        if (!src) return;
        const w = Math.min(144, width), h = Math.min(144, height);
        if (w <= 0 || h <= 0) return;
        ctx.drawImage(face, src.x, src.y, w, h, x, y, w, h);
    }

    drawActorName(ctx, name, x, y) {
        ctx.font = '26px sans-serif';
        ctx.fillStyle = this.skinColor(0, '#ffffff');
        ctx.fillText(String(name || ''), x, y + 22);
    }

    /**
     * Window_BattleStatus with one column per party slot (stock engine, and
     * BattleCore's default / XP / portrait / border). The stock engine draws
     * the name and the 128px gauges flush left in the padded item rect;
     * BattleCore's `drawItemStatusXPStyle`, which those four styles share,
     * centres them on the cell. The face fills the cell down to the name.
     */
    drawStatusColumns(ctx, status, setup) {
        const labels = this.gaugeLabels();
        const colors = this.basicGaugeColors();
        const style = setup.layoutStyle;
        const cols = !setup.battleCore ? 4
            : (style === 'xp' || style === 'portrait') ? Math.max(1, setup.party.length)
                : setup.maxBattleMembers;
        const numGauges = setup.displayTp ? 3 : 2;

        setup.party.forEach((entry, i) => {
            const { rect, padded } = this.statusItemRect(status, i, cols);
            const bottom = padded.y + padded.height - status.extra;
            const gaugesY = bottom - 24 * numGauges;
            const nameY = gaugesY - 24;

            // drawItemImage: the stock face for default and border, XP only in
            // sideview (frontview centres the battler sprite there instead).
            const showFace = !setup.battleCore || style === 'default' || style === 'border'
                || (style === 'xp' && setup.sideView);
            if (showFace) {
                const faceH = nameY + 12 - (rect.y - 1);
                this.drawFace(ctx, entry.actor, rect.x - 1, rect.y - 1, rect.width + 2, faceH);
            }

            const x = setup.battleCore ? Math.round(padded.x + (padded.width - 128) / 2) : padded.x;
            this.drawActorName(ctx, entry.actor.name, x, nameY);
            this.drawGauge(ctx, x, gaugesY, labels.hp, 1, colors.hp[0], colors.hp[1], entry.mhp ? String(entry.mhp) : '');
            this.drawGauge(ctx, x, gaugesY + 24, labels.mp, 1, colors.mp[0], colors.mp[1], entry.mmp ? String(entry.mmp) : '');
            if (setup.displayTp) this.drawGauge(ctx, x, gaugesY + 48, labels.tp, 0, colors.tp[0], colors.tp[1], '0');
        });
    }

    /**
     * BattleCore "list": one 44px row per actor, the face on the left when
     * ShowFacesListStyle is on, the name 136px before the gauges, the gauges
     * 136px apart - `drawItemStatusListStyle`, with its right-edge clamp.
     */
    drawStatusList(ctx, status, setup) {
        const labels = this.gaugeLabels();
        const colors = this.basicGaugeColors();
        const innerW = status.width - status.padding * 2;
        const gaugeCount = setup.displayTp ? 4 : 3;
        const block = gaugeCount * 128 + (gaugeCount - 1) * 8 + 4;
        setup.party.forEach((entry, i) => {
            const rowY = status.y + status.padding + i * 44;
            if (rowY + 44 > status.y + status.height) return;
            const rect = { x: status.x + status.padding, y: rowY, width: innerW, height: 44 };
            let nameX = setup.showFacesListStyle ? rect.x + 144 + 8 : rect.x + status.padding + 32;
            nameX = Math.round(Math.min(rect.x + rect.width - block, nameX));
            const y = Math.round(rect.y + (rect.height - 24) / 2);
            if (setup.showFacesListStyle) this.drawFace(ctx, entry.actor, rect.x, rect.y, 144, 44);
            this.drawActorName(ctx, entry.actor.name, nameX, y);
            const gx = nameX + 136;
            this.drawGauge(ctx, gx, y, labels.hp, 1, colors.hp[0], colors.hp[1], entry.mhp ? String(entry.mhp) : '');
            this.drawGauge(ctx, gx + 136, y, labels.mp, 1, colors.mp[0], colors.mp[1], entry.mmp ? String(entry.mmp) : '');
            if (setup.displayTp) this.drawGauge(ctx, gx + 272, y, labels.tp, 0, colors.tp[0], colors.tp[1], '0');
        });
    }

    /** What the overlay believes about the project, in its top-right corner. */
    battleSetupLabel(setup) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const systemLabel = ['turn', 'tpb'].includes(setup.turnSystem)
            ? (setup.turnSystem === 'tpb' ? 'TPB' : tt('Turn-based'))
            : `VisuStella ${setup.turnSystem.toUpperCase()}`;
        const view = setup.sideView ? tt('Sideview') : tt('Frontview');
        const layout = setup.layoutStyle === 'vanilla' ? 'MZ' : `VisuStella ${setup.layoutStyle}`;
        return `${systemLabel} • ${view} • ${layout} (${setup.screenWidth}×${setup.screenHeight})`;
    }

    drawBattleSetupTag(ctx, setup) {
        const text = this.battleSetupLabel(setup);
        ctx.font = 'bold 12px sans-serif';
        const w = ctx.measureText(text).width + 16;
        const h = 20;
        const x = setup.screenWidth - w - 8;
        const y = 6;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = ThemeColors.resolve('--color-accent-bright', '#ffd700');
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, x + 8, y + 14);
    }

    escapeHTML(str) {
        return typeof rrEscapeHtml !== 'undefined'
            ? rrEscapeHtml(str)
            : require('../utils/HtmlEscape.js')(str);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseTroopEditor;
}
