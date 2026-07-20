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
        battleTestBtn.style.cssText = `
            padding: 6px 12px; background-color: var(--color-bg-panel); color: var(--color-text-strong); border: 1px solid var(--color-text-dim);
            border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;
            transition: background-color 0.2s, border-color 0.2s;
        `;
        battleTestBtn.onmouseenter = () => { battleTestBtn.style.backgroundColor = 'var(--color-accent-tint-35)'; battleTestBtn.style.borderColor = 'var(--color-bg-deep)'; };
        battleTestBtn.onmouseleave = () => { battleTestBtn.style.backgroundColor = 'var(--color-bg-panel)'; battleTestBtn.style.borderColor = 'var(--color-text-dim)'; };
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
            const enemyName = enemy ? `#${member.enemyId} ${enemy.name}` : `${tt('Enemy')} #${member.enemyId}`;

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

    showEnemyPicker(memberIdx = null) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const replacing = Number.isInteger(memberIdx);
        const member = replacing ? this.currentTroop.members?.[memberIdx] : null;
        if (replacing && !member) return;
        const enemies = this.databaseManager.getEnemies().filter(enemy => enemy && enemy.id > 0);
        const enemyLabels = new Map();
        const labels = enemies.map(enemy => {
            const label = `${enemy.name || tt('Enemy')} [#${String(enemy.id).padStart(4, '0')}]`;
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
        dialog.style.cssText = `
            background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 8px;
            width:min(900px,94vw);height:min(660px,86vh);
            display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            background: var(--color-bg-panel); padding: 14px 20px; border-bottom: 1px solid var(--color-border);
            display: flex; justify-content: space-between; align-items: center;
            border-radius: 8px 8px 0 0;
        `;
        const title = document.createElement('h3');
        title.style.cssText = 'margin:0;color:var(--color-text);font-size:15px;';
        title.textContent = replacing ? tt('Replace Enemy') : `${tt('Select')} ${tt('Enemy')}`;
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '\u00d7';
        closeBtn.style.cssText = 'width:28px;height:28px;padding:0;background:none;border:0;color:var(--color-text);font-size:24px;cursor:pointer;line-height:1;';
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

            const nameLabel = document.createElement('div');
            nameLabel.style.cssText = 'color: var(--color-accent-bright); font-size: 12px; font-weight: 600; text-align: center; word-break: break-word;';
            nameLabel.textContent = `#${enemy.id} ${enemy.name}`;
            previewPanel.appendChild(nameLabel);

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
        footer.style.cssText = 'padding: 12px 16px; display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--color-border); flex-shrink: 0; background-color: var(--color-bg-panel);';

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
        overlay.onclick = (e) => { if (e.target === overlay) close(); };
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
            const file = RRAssetFiles.find(path.join(project.path, 'img', dir), enemy.battlerName, ['.png']);
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
        }));

        // Upper Layer (battleback2)
        content.appendChild(this.createBBSelect('Upper Layer:', 'troop-bb2-select', bb2Files, this.battleback2Name, (val) => {
            this.battleback2Name = val;
            this.loadAndRenderCanvas();
        }));

        section.appendChild(content);
        return section;
    }

    createBBSelect(label, id, files, currentVal, onChange) {
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
        return row;
    }

    scanImageDir(project, subdir) {
        if (!project) return [];
        try {
            const path = require('path');
            const fs = require('fs');
            const dir = path.join(project.path, 'img', subdir);
            if (!fs.existsSync(dir)) return [];
            return RRAssetFiles.listNames(dir, ['.png']);
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

        section.innerHTML = `<div class="database-section-header">${tt('Battle Preview')}</div>`;

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
        const fs = require('fs');
        let pending = 0;

        const done = () => { pending--; if (pending <= 0) this.renderCanvas(); };

        // Battleback1
        if (this.battleback1Name) {
            pending++;
            this.battleback1Img = new Image();
            this.battleback1Img.onload = done;
            this.battleback1Img.onerror = () => { this.battleback1Img = null; done(); };
            this.battleback1Img.src = RRAssetFiles.urlFor(path.join(project.path, 'img', 'battlebacks1'), this.battleback1Name, ['.png']);
        } else { this.battleback1Img = null; }

        // Battleback2
        if (this.battleback2Name) {
            pending++;
            this.battleback2Img = new Image();
            this.battleback2Img.onload = done;
            this.battleback2Img.onerror = () => { this.battleback2Img = null; done(); };
            this.battleback2Img.src = RRAssetFiles.urlFor(path.join(project.path, 'img', 'battlebacks2'), this.battleback2Name, ['.png']);
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
                const battlerFile = RRAssetFiles.find(path.join(project.path, 'img', dir), battlerName, ['.png']);
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
                const info = this.getCommandDisplay(cmd);
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

            if (command.code === 111) {
                this.getCommandEditor('conditionalBranch', ConditionalBranchEditor).show(null, insertCommands);
                return;
            }
            if (command.code === 112 || command.code === 413) {
                this.getCommandEditor('loop', LoopEditor).show(null, insertCommands);
                return;
            }
            const editorMap = {
                117: ['commonEvent', CommonEventEditor],
                122: ['variables', ControlVariablesEditor],
                231: ['showPicture', ShowPictureEditor],
                232: ['movePicture', MovePictureEditor],
                235: ['erasePicture', ErasePictureEditor],
                339: ['forceAction', ForceActionEditor]
            };
            const editorConfig = editorMap[command.code];
            if (editorConfig) {
                const editor = this.getCommandEditor(editorConfig[0], editorConfig[1]);
                const context = command.code === 232 ? { commands: page.list, index: insertIndex } : undefined;
                editor.show(null, edited => edited && insertCommands([edited]), context);
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

    getCommandEditor(name, EditorClass) {
        if (!this._editors[name]) {
            this._editors[name] = new EditorClass(this.databaseManager, this.projectManager);
        }
        return this._editors[name];
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
            339: [0, 0, 1, -1],         // Force Action
            340: [],                     // Abort Battle
            355: [''],                   // Script
        };
        return defaults[code] || [];
    }

    editCommandSimple(cmd, idx, page) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        if (cmd.code === 0) return;

        const ECL = this._eventCommandListClass();
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
            }, { hasElse: !!elseBranch });
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

        if (cmd.code === 117) {
            replaceSingle(this.getCommandEditor('commonEvent', CommonEventEditor));
            return;
        }
        if (cmd.code === 122) {
            replaceSingle(this.getCommandEditor('variables', ControlVariablesEditor));
            return;
        }
        if (cmd.code === 231) {
            replaceSingle(this.getCommandEditor('showPicture', ShowPictureEditor));
            return;
        }
        if (cmd.code === 232) {
            replaceSingle(this.getCommandEditor('movePicture', MovePictureEditor), { commands: page.list, index: idx });
            return;
        }
        if (cmd.code === 235) {
            replaceSingle(this.getCommandEditor('erasePicture', ErasePictureEditor));
            return;
        }
        if (cmd.code === 339) {
            replaceSingle(this.getCommandEditor('forceAction', ForceActionEditor));
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

        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10005;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 8px; padding: 20px; width: 500px; max-width: 90vw; max-height: 80vh; overflow-y: auto;';

        const info = this.getCommandDisplay(cmd);
        dialog.innerHTML = `<h3 style="margin: 0 0 12px 0; color: var(--color-text-strong); font-size: 14px;">${this.escapeHTML(info.name)} (${tt('Code')} ${cmd.code})</h3>`;

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
        modal.appendChild(dialog);
        modal.onclick = (e) => { if (e.target === modal) document.body.removeChild(modal); };
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
        if (typeof EventCommandList !== 'undefined' && EventCommandList.safeInsertionIndex) {
            insertAt = EventCommandList.safeInsertionIndex(page.list, insertAt);
        }
        const pasted = commands.map(command => JSON.parse(JSON.stringify(command)));
        if (typeof EventCommandList !== 'undefined' && EventCommandList.rebaseInsertIndent) {
            const baseIndent = EventCommandList.insertionIndent(page.list, insertAt);
            EventCommandList.rebaseInsertIndent(pasted, baseIndent);
        }
        pasted.forEach((cmd, i) => {
            page.list.splice(insertAt + i, 0, cmd);
        });
        this.selectedCommandIndices = pasted.map((_, index) => insertAt + index);
        this.commandSelectionAnchor = this.selectedCommandIndices[0] ?? null;
        this.persistTroop();
        if (container) this.renderCommandList(container, page);
    }

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
        if (code >= 601 && code <= 604) return 'var(--color-syntax-comment)';
        return 'var(--color-text-muted)';
    }

    getCommandDisplay(cmd) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const ECL = this._eventCommandListClass();
        if (ECL.generatedCommand(cmd, 'eventCall') || ECL.generatedCommand(cmd, 'picture') ||
            ECL.generatedCommand(cmd, 'inputCondition') ||
            ECL.generatedCommand(cmd, 'control-variables-expression')) {
            const formatter = Object.create(ECL.prototype);
            formatter.eventEditor = { databaseManager: this.databaseManager };
            return formatter.getCommandInfo(cmd);
        }
        const names = {
            0: 'End', 101: 'Show Text', 102: 'Show Choices', 103: 'Input Number',
            104: 'Select Item', 105: 'Show Scrolling Text',
            108: 'Comment', 109: 'Skip', 111: 'If', 112: 'Loop', 113: 'Break Loop',
            115: 'Exit Event', 117: 'Common Event', 118: 'Label', 119: 'Jump to Label',
            121: 'Control Switches', 122: 'Control Variables',
            123: 'Control Self Switch', 124: 'Control Timer',
            125: 'Change Gold', 126: 'Change Items', 127: 'Change Weapons',
            128: 'Change Armors', 129: 'Change Party Member',
            201: 'Transfer Player', 205: 'Set Movement Route',
            212: 'Show Animation', 230: 'Wait',
            231: 'Show Picture', 232: 'Move Picture', 235: 'Erase Picture',
            241: 'Play BGM', 242: 'Fadeout BGM', 245: 'Play BGS',
            246: 'Fadeout BGS', 249: 'Play ME', 250: 'Play SE', 251: 'Stop SE',
            301: 'Battle Processing', 311: 'Change HP', 312: 'Change MP',
            313: 'Change State', 314: 'Recover All',
            315: 'Change EXP', 316: 'Change Level', 317: 'Change Parameter',
            318: 'Change Skill', 319: 'Change Equipment',
            331: 'Change Enemy HP', 332: 'Change Enemy MP',
            333: 'Change Enemy State', 334: 'Enemy Recover All',
            335: 'Enemy Appear', 336: 'Enemy Transform',
            337: 'Show Battle Anim', 339: 'Force Action', 340: 'Abort Battle',
            355: 'Script', 356: 'Plugin Command', 357: 'Plugin Command',
            401: '\u25B7 Text', 402: 'When', 403: 'When Cancel', 404: 'End Choices',
            405: '\u25B7 Scrolling Text', 408: '\u25B7 Comment',
            411: 'Else', 412: 'End', 413: 'Repeat Above',
            601: 'If Win', 602: 'If Escape', 603: 'If Lose', 604: 'End'
        };

        const name = names[cmd.code] ? tt(names[cmd.code]) : `Cmd ${cmd.code}`;
        const color = this.getCommandColor(cmd.code);
        let desc = '';

        const p = cmd.parameters || [];
        switch (cmd.code) {
            case 101: desc = p[4] ? p[4] : (p[0] ? `${tt('Face:')} ${p[0]}` : ''); break;
            case 108: case 408: desc = p[0] || ''; break;
            case 401: case 405: desc = p[0] || ''; break;
            case 111: {
                const types = ['Switch', 'Variable', 'Self Sw', 'Timer', 'Actor', 'Enemy', 'Character', 'Gold', 'Item', 'Weapon', 'Armor', 'Button', 'Script'];
                desc = types[p[0]] ? tt(types[p[0]]) : `${tt('Type')} ${p[0]}`;
                if (p[0] === 0) desc = `${tt('Switch')} #${p[1]} ${p[2] === 0 ? tt('ON') : tt('OFF')}`;
                break;
            }
            case 117: desc = `#${p[0]}`; break;
            case 121: desc = `#${p[0]}${p[1] > p[0] ? '-' + p[1] : ''} = ${p[2] === 0 ? tt('ON') : tt('OFF')}`; break;
            case 122: desc = `#${p[0]}${p[1] > p[0] ? '-' + p[1] : ''}`; break;
            case 230: desc = `${p[0]} ${tt('frames')}`; break;
            case 241: case 245: case 250: desc = p[0] ? (p[0].name || '') : ''; break;
            case 331: desc = `${tt('Enemy')} #${p[0] + 1}: ${p[2] === 0 ? '+' : '-'}${p[3]}`; break;
            case 332: desc = `${tt('Enemy')} #${p[0] + 1}: ${p[2] === 0 ? '+' : '-'}${p[3]}`; break;
            case 333: { const st = this.databaseManager.getState(p[2]); desc = `${tt('Enemy')} #${p[0] + 1}: ${p[1] === 0 ? '+' : '-'} ${st ? st.name : `${tt('State')} ${p[2]}`}`; break; }
            case 335: desc = `${tt('Enemy')} #${p[0] + 1}`; break;
            case 336: { const en = this.databaseManager.getEnemy(p[1]); desc = `${tt('Enemy')} #${p[0] + 1} → ${en ? en.name : '#' + p[1]}`; break; }
            case 339: desc = `${tt('Enemy')} #${p[0] + 1}`; break;
            case 355: desc = p[0] || ''; break;
            case 356: case 357: desc = p[0] ? `${p[0]}: ${p[1] || ''}` : ''; break;
            case 402: desc = p[1] || `${tt('Choice')} ${p[0]}`; break;
            default:
                if (p.length > 0 && p.length <= 3) desc = p.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(', ');
                else if (p.length > 3) desc = p.slice(0, 3).map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(', ') + '...';
        }

        const maxLen = 80;
        if (desc.length > maxLen) desc = desc.substring(0, maxLen) + '...';

        return { name, color, description: desc };
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
        dialog.style.cssText = 'width:min(560px,calc(100vw - 32px));max-height:min(680px,calc(100vh - 32px));display:flex;flex-direction:column;overflow:hidden;background-color:var(--color-bg-surface);border:1px solid var(--color-border-input);border-radius:8px;box-shadow:var(--shadow-modal);';

        const header = document.createElement('div');
        header.style.cssText = 'padding:12px 16px;background-color:var(--color-bg-toolbar);border-bottom:1px solid var(--color-border);flex-shrink:0;';
        header.innerHTML = `<h3 style="margin:0;color:var(--color-text-strong);font-size:15px;">${tt('Conditions')}</h3>`;
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
        btnRow.className = 'troop-conditions-footer';
        btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;background-color:var(--color-bg-panel);border-top:1px solid var(--color-border);flex-shrink:0;';
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

        modal.appendChild(dialog);
        modal.onclick = (e) => { if (e.target === modal) document.body.removeChild(modal); };
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
        btn.style.cssText = 'padding: 3px 10px; background-color: var(--color-bg-menubar); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 11px; transition: background-color 0.2s; white-space: nowrap;';
        btn.onmouseenter = () => { btn.style.backgroundColor = 'var(--color-accent-tint-25)'; };
        btn.onmouseleave = () => { btn.style.backgroundColor = 'var(--color-bg-menubar)'; };
        btn.onclick = onclick;
        return btn;
    }

    createButton(label, onclick) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const btn = document.createElement('button');
        btn.textContent = tt(label);
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
        return typeof rrEscapeHtml !== 'undefined'
            ? rrEscapeHtml(str)
            : require('../utils/HtmlEscape.js')(str);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseTroopEditor;
}
