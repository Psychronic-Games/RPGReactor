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
        this.commandClipboard = null;
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

        const system = this.databaseManager.getSystem();
        this.battleback1Name = (system && system.battleback1Name) || '';
        this.battleback2Name = (system && system.battleback2Name) || '';

        // Get project resolution (stored under system.advanced in RPG Maker MZ format)
        const adv = system && system.advanced;
        this.screenWidth = (adv && adv.screenWidth) || 816;
        this.screenHeight = (adv && adv.screenHeight) || 624;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow-y: auto; padding: 16px; gap: 12px;';

        // Row 1: Name
        wrapper.appendChild(this.createNameRow());

        // Row 2: Members + Battleback + Actions (horizontal)
        wrapper.appendChild(this.createTopBar());

        // Row 3: Battle Preview Canvas
        wrapper.appendChild(this.createBattlePreview());

        // Row 4: Battle Events
        wrapper.appendChild(this.createBattleEventsSection());

        container.appendChild(wrapper);

        this.attachMainListeners(container);
        setTimeout(() => this.loadAndRenderCanvas(), 50);
    }

    createNameRow() {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
        row.innerHTML = `
            <label class="database-field-label" style="flex-shrink: 0;">Name:</label>
            <input type="text" class="database-field-value" id="troop-name-input"
                   value="${this.escapeHTML(this.currentTroop.name || '')}" style="flex: 1;">
        `;
        return row;
    }

    createTopBar() {
        const bar = document.createElement('div');
        bar.style.cssText = 'display: flex; gap: 12px; flex-wrap: wrap;';

        // Members section
        bar.appendChild(this.createMembersSection());

        // Battleback section
        bar.appendChild(this.createBattlebackSection());

        // Right side: Note + Battle Test
        const rightSide = document.createElement('div');
        rightSide.style.cssText = 'display: flex; flex-direction: column; gap: 8px; min-width: 200px; flex: 1;';

        // Battle Test button (above note)
        const battleTestBtn = document.createElement('button');
        battleTestBtn.textContent = 'Battle Test...';
        battleTestBtn.style.cssText = `
            padding: 8px 16px; background-color: var(--color-bg-panel); color: var(--color-text-strong); border: 1px solid var(--color-text-dim);
            border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500;
            transition: background-color 0.2s, border-color 0.2s;
        `;
        battleTestBtn.onmouseenter = () => { battleTestBtn.style.backgroundColor = 'var(--color-accent-tint-35)'; battleTestBtn.style.borderColor = 'var(--color-bg-deep)'; };
        battleTestBtn.onmouseleave = () => { battleTestBtn.style.backgroundColor = 'var(--color-bg-panel)'; battleTestBtn.style.borderColor = 'var(--color-text-dim)'; };
        battleTestBtn.onclick = () => this.openBattleTestConfig();
        rightSide.appendChild(battleTestBtn);

        // Note
        const noteSection = document.createElement('div');
        noteSection.className = 'database-section';
        noteSection.style.cssText = 'flex: 1;';
        noteSection.innerHTML = `
            <div class="database-section-header">Note</div>
            <div class="database-section-content">
                <textarea class="database-field-value" id="troop-note-input" rows="2"
                          style="width: 100%; box-sizing: border-box; resize: vertical;">${this.escapeHTML(this.currentTroop.note || '')}</textarea>
            </div>
        `;
        rightSide.appendChild(noteSection);

        bar.appendChild(rightSide);
        return bar;
    }

    // ==========================================
    // MEMBERS SECTION
    // ==========================================

    createMembersSection() {
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.cssText = 'min-width: 220px; max-width: 300px; flex-shrink: 0;';

        section.innerHTML = '<div class="database-section-header">Members</div>';

        const content = document.createElement('div');
        content.className = 'database-section-content';

        // Add enemy row
        const addRow = document.createElement('div');
        addRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 6px;';

        const enemySelect = document.createElement('select');
        enemySelect.id = 'troop-add-enemy-select';
        enemySelect.style.cssText = 'flex: 1; min-width: 0; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 4px; border-radius: 3px; font-size: 12px;';
        const enemies = this.databaseManager.getEnemies();
        enemies.forEach(enemy => {
            if (enemy) {
                const opt = document.createElement('option');
                opt.value = enemy.id;
                opt.textContent = `#${enemy.id} ${enemy.name}`;
                enemySelect.appendChild(opt);
            }
        });
        addRow.appendChild(enemySelect);

        const addBtn = this.createSmallButton('Add', () => this.addMember());
        addRow.appendChild(addBtn);
        content.appendChild(addRow);

        // Members list
        const membersList = document.createElement('div');
        membersList.id = 'troop-members-list';
        membersList.style.cssText = 'max-height: 150px; overflow-y: auto;';
        this.populateMembersList(membersList);
        content.appendChild(membersList);

        section.appendChild(content);
        return section;
    }

    populateMembersList(listEl) {
        if (!listEl) listEl = document.getElementById('troop-members-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        const enemies = this.databaseManager.getEnemies();
        const members = this.currentTroop.members || [];

        if (members.length === 0) {
            listEl.innerHTML = '<div style="text-align: center; color: var(--color-text-muted); padding: 8px; font-size: 11px;">No members</div>';
            return;
        }

        members.forEach((member, idx) => {
            const enemy = enemies.find(e => e && e.id === member.enemyId);
            const enemyName = enemy ? enemy.name : `Enemy #${member.enemyId}`;

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
                this.selectedMemberIndex = idx;
                this.highlightMemberRow(idx);
                this.renderCanvas();
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
            replaceBtn.title = 'Replace Enemy';
            replaceBtn.style.cssText = 'width: 18px; height: 18px; padding: 0; border: 1px solid var(--color-border-input); background: var(--color-border-subtle); color: var(--color-syntax-type); cursor: pointer; font-size: 12px; line-height: 1; border-radius: 3px; flex-shrink: 0;';
            replaceBtn.onmouseenter = () => { replaceBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; };
            replaceBtn.onmouseleave = () => { replaceBtn.style.backgroundColor = 'var(--color-border-subtle)'; };
            replaceBtn.onclick = (e) => {
                e.stopPropagation();
                this.showReplaceEnemyPicker(idx);
            };
            row.appendChild(replaceBtn);

            // Visibility toggle (eyeball icon)
            const visBtn = document.createElement('button');
            visBtn.title = member.hidden ? 'Show' : 'Hide';
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
            removeBtn.title = 'Remove';
            removeBtn.style.cssText = 'width: 18px; height: 18px; padding: 0; border: 1px solid var(--color-border-input); background: var(--color-border-subtle); color: #f44; cursor: pointer; font-size: 13px; line-height: 1; border-radius: 3px; flex-shrink: 0;';
            removeBtn.onclick = (e) => { e.stopPropagation(); this.removeMember(idx); };
            row.appendChild(removeBtn);

            listEl.appendChild(row);
        });
    }

    addMember() {
        const select = document.getElementById('troop-add-enemy-select');
        if (!select || !select.value) return;

        const enemyId = parseInt(select.value);
        if (!enemyId || isNaN(enemyId)) return;

        if (!this.currentTroop.members) {
            this.currentTroop.members = [];
        }

        const count = this.currentTroop.members.length;
        const offsetX = (count % 4) * 100 - 150;
        const offsetY = Math.floor(count / 4) * 80;
        this.currentTroop.members.push({
            enemyId: enemyId,
            x: Math.round(this.screenWidth / 2 + offsetX),
            y: Math.round(this.screenHeight / 2 + offsetY),
            hidden: false
        });

        this.persistTroop();
        this.populateMembersList();
        this.loadAndRenderCanvas();
    }

    removeMember(idx) {
        if (!this.currentTroop.members) return;
        this.currentTroop.members.splice(idx, 1);
        if (this.selectedMemberIndex === idx) this.selectedMemberIndex = -1;
        else if (this.selectedMemberIndex > idx) this.selectedMemberIndex--;
        this.persistTroop();
        this.populateMembersList();
        this.renderCanvas();
    }

    showReplaceEnemyPicker(memberIdx) {
        const member = this.currentTroop.members[memberIdx];
        if (!member) return;

        const enemies = this.databaseManager.getEnemies();
        const project = this.projectManager.getCurrentProject();
        const path = require('path');
        const fs = require('fs');

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
            width: 520px; max-width: 90vw; max-height: 80vh;
            display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            background: var(--color-bg-panel); padding: 14px 20px; border-bottom: 1px solid var(--color-border);
            display: flex; justify-content: space-between; align-items: center;
            border-radius: 8px 8px 0 0;
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text); font-size: 15px;">Replace Enemy</h3>
            <span class="modal-close" style="color: var(--color-text); font-size: 24px; font-weight: bold; cursor: pointer; line-height: 1;">&times;</span>
        `;
        dialog.appendChild(header);

        // Search bar
        const searchBar = document.createElement('div');
        searchBar.style.cssText = 'padding: 10px 16px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search enemies...';
        searchInput.style.cssText = `
            width: 100%; padding: 6px 10px; background: var(--color-bg-panel); border: 1px solid var(--color-border-input);
            border-radius: 3px; color: var(--color-text); font-size: 12px; box-sizing: border-box;
        `;
        searchInput.addEventListener('focus', () => { searchInput.style.borderColor = 'var(--color-accent-border-strong)'; searchInput.style.outline = 'none'; });
        searchInput.addEventListener('blur', () => { searchInput.style.borderColor = 'var(--color-border-input)'; });
        searchBar.appendChild(searchInput);
        dialog.appendChild(searchBar);

        // Enemy list + preview area
        const body = document.createElement('div');
        body.style.cssText = 'display: flex; flex: 1; overflow: hidden; min-height: 0;';

        // Left: scrollable enemy list
        const listPanel = document.createElement('div');
        listPanel.style.cssText = 'flex: 1; overflow-y: auto; border-right: 1px solid var(--color-border);';

        // Right: preview panel
        const previewPanel = document.createElement('div');
        previewPanel.style.cssText = `
            width: 180px; flex-shrink: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center; padding: 16px;
            background: var(--color-bg-panel); gap: 8px;
        `;
        previewPanel.innerHTML = '<span style="color: var(--color-text-dim); font-size: 11px;">Select an enemy</span>';

        let selectedEnemyId = member.enemyId;

        // Helper to resolve battler image path
        const getBattlerPath = (battlerName) => {
            if (!battlerName || !project) return null;
            const searchDirs = ['enemies', 'sv_enemies', 'characters'];
            for (const dir of searchDirs) {
                const tryPath = path.join(project.path, 'img', dir, battlerName + '.png');
                if (fs.existsSync(tryPath)) return 'file://' + tryPath.replace(/\\/g, '/');
            }
            return null;
        };

        // Show preview for an enemy
        const showPreview = (enemy) => {
            previewPanel.innerHTML = '';

            const nameLabel = document.createElement('div');
            nameLabel.style.cssText = 'color: var(--color-accent-bright); font-size: 12px; font-weight: 600; text-align: center; word-break: break-word;';
            nameLabel.textContent = `#${enemy.id} ${enemy.name}`;
            previewPanel.appendChild(nameLabel);

            const imgContainer = document.createElement('div');
            imgContainer.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center; min-height: 80px;';

            const battlerPath = getBattlerPath(enemy.battlerName);
            if (battlerPath) {
                const img = document.createElement('img');
                img.src = battlerPath;
                img.style.cssText = 'max-width: 148px; max-height: 148px; image-rendering: pixelated; object-fit: contain;';
                img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { textContent: 'No preview', style: 'color: var(--color-text-dim); font-size: 11px;' })); };
                imgContainer.appendChild(img);
            } else {
                imgContainer.innerHTML = '<span style="color: var(--color-text-dim); font-size: 11px;">No battler image</span>';
            }
            previewPanel.appendChild(imgContainer);

            // Stats summary
            if (enemy.params) {
                const stats = document.createElement('div');
                stats.style.cssText = 'color: var(--color-text-muted); font-size: 10px; text-align: center; line-height: 1.5;';
                const paramNames = ['HP', 'MP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'];
                stats.textContent = paramNames.map((n, i) => `${n}:${enemy.params[i] || 0}`).join(' ');
                previewPanel.appendChild(stats);
            }
        };

        // Populate enemy list
        const populateList = (filter = '') => {
            listPanel.innerHTML = '';
            const filtered = enemies.filter(e => {
                if (!e) return false;
                if (!filter) return true;
                const lf = filter.toLowerCase();
                return e.name.toLowerCase().includes(lf) || String(e.id).includes(filter);
            });

            if (filtered.length === 0) {
                listPanel.innerHTML = '<div style="color: var(--color-text-dim); text-align: center; padding: 16px; font-size: 12px;">No matches</div>';
                return;
            }

            filtered.forEach(enemy => {
                const item = document.createElement('div');
                const isSelected = enemy.id === selectedEnemyId;
                const isCurrent = enemy.id === member.enemyId;
                item.style.cssText = `
                    padding: 6px 12px; cursor: pointer; font-size: 12px; color: var(--color-text);
                    border-bottom: 1px solid var(--color-bg-menubar); display: flex; align-items: center; gap: 8px;
                    background: ${isSelected ? 'var(--color-accent-tint-15)' : ''};
                `;
                item.onmouseenter = () => { if (enemy.id !== selectedEnemyId) item.style.backgroundColor = 'var(--color-bg-button)'; };
                item.onmouseleave = () => { item.style.backgroundColor = enemy.id === selectedEnemyId ? 'var(--color-accent-tint-15)' : ''; };

                // Mini battler thumbnail
                const thumb = document.createElement('div');
                thumb.style.cssText = 'width: 28px; height: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--color-bg-base); border-radius: 3px; overflow: hidden;';
                const battlerPath = getBattlerPath(enemy.battlerName);
                if (battlerPath) {
                    const tImg = document.createElement('img');
                    tImg.src = battlerPath;
                    tImg.style.cssText = 'max-width: 28px; max-height: 28px; image-rendering: pixelated; object-fit: contain;';
                    tImg.onerror = () => { thumb.innerHTML = '<span style="color: var(--color-border-input); font-size: 9px;">?</span>'; };
                    thumb.appendChild(tImg);
                } else {
                    thumb.innerHTML = '<span style="color: var(--color-border-input); font-size: 9px;">?</span>';
                }
                item.appendChild(thumb);

                const label = document.createElement('span');
                label.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                label.textContent = `#${enemy.id} ${enemy.name}`;
                item.appendChild(label);

                if (isCurrent) {
                    const badge = document.createElement('span');
                    badge.style.cssText = 'color: var(--color-syntax-type); font-size: 9px; flex-shrink: 0;';
                    badge.textContent = 'current';
                    item.appendChild(badge);
                }

                item.onclick = () => {
                    selectedEnemyId = enemy.id;
                    showPreview(enemy);
                    populateList(searchInput.value);
                };

                item.ondblclick = () => {
                    selectedEnemyId = enemy.id;
                    confirmAndClose();
                };

                listPanel.appendChild(item);
            });
        };

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

        // Initial state
        populateList();
        const currentEnemy = enemies.find(e => e && e.id === member.enemyId);
        if (currentEnemy) showPreview(currentEnemy);
        searchInput.focus();

        searchInput.addEventListener('input', () => populateList(searchInput.value));

        const close = () => { document.body.removeChild(overlay); };
        const confirmAndClose = () => {
            if (selectedEnemyId && selectedEnemyId !== member.enemyId) {
                this.replaceMember(memberIdx, selectedEnemyId);
            }
            close();
        };

        header.querySelector('.modal-close').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };
    }

    replaceMember(idx, newEnemyId) {
        const member = this.currentTroop.members[idx];
        if (!member) return;
        member.enemyId = newEnemyId;
        this.persistTroop();
        this.populateMembersList();
        this.loadAndRenderCanvas();
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
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.cssText = 'min-width: 180px; max-width: 240px; flex-shrink: 0;';

        section.innerHTML = '<div class="database-section-header">Battleback</div>';

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
        const row = document.createElement('div');
        row.style.cssText = 'margin-bottom: 6px;';
        row.innerHTML = `<label class="database-field-label" style="display: block; margin-bottom: 2px; font-size: 11px;">${label}</label>`;
        const select = document.createElement('select');
        select.id = id;
        select.style.cssText = 'width: 100%; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 3px; border-radius: 3px; font-size: 11px;';
        select.innerHTML = '<option value="">(None)</option>';
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
            return fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')).sort();
        } catch (e) { return []; }
    }

    // ==========================================
    // BATTLE PREVIEW CANVAS
    // ==========================================

    createBattlePreview() {
        const section = document.createElement('div');
        section.className = 'database-section';

        section.innerHTML = '<div class="database-section-header">Battle Preview</div>';

        const canvasContainer = document.createElement('div');
        canvasContainer.style.cssText = 'position: relative; background: var(--color-bg-deep); border: 1px solid var(--color-border); overflow: hidden;';

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.screenWidth;
        this.canvas.height = this.screenHeight;
        this.canvas.style.cssText = 'width: 100%; display: block; cursor: default; image-rendering: auto;';
        this.ctx = this.canvas.getContext('2d');

        canvasContainer.appendChild(this.canvas);
        section.appendChild(canvasContainer);

        this.canvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onCanvasMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.onCanvasMouseUp(e));

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
        const coords = this.getCanvasCoords(e);
        for (let i = this.enemySpriteBounds.length - 1; i >= 0; i--) {
            const b = this.enemySpriteBounds[i];
            if (coords.x >= b.x && coords.x <= b.x + b.width && coords.y >= b.y && coords.y <= b.y + b.height) {
                this.isDragging = true;
                this.dragMemberIndex = b.memberIndex;
                this.selectedMemberIndex = b.memberIndex;
                const member = this.currentTroop.members[b.memberIndex];
                this.dragOffsetX = coords.x - member.x;
                this.dragOffsetY = coords.y - member.y;
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

    onCanvasMouseMove(e) {
        const coords = this.getCanvasCoords(e);
        if (this.isDragging && this.dragMemberIndex >= 0) {
            const member = this.currentTroop.members[this.dragMemberIndex];
            member.x = Math.round(Math.max(0, Math.min(this.canvas.width, coords.x - this.dragOffsetX)));
            member.y = Math.round(Math.max(0, Math.min(this.canvas.height, coords.y - this.dragOffsetY)));
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
            this.battleback1Img.src = 'file://' + path.join(project.path, 'img', 'battlebacks1', this.battleback1Name + '.png').replace(/\\/g, '/');
        } else { this.battleback1Img = null; }

        // Battleback2
        if (this.battleback2Name) {
            pending++;
            this.battleback2Img = new Image();
            this.battleback2Img.onload = done;
            this.battleback2Img.onerror = () => { this.battleback2Img = null; done(); };
            this.battleback2Img.src = 'file://' + path.join(project.path, 'img', 'battlebacks2', this.battleback2Name + '.png').replace(/\\/g, '/');
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

            // Search directories in order: enemies, sv_enemies, characters
            const searchDirs = ['enemies', 'sv_enemies', 'characters'];
            let found = false;
            for (const dir of searchDirs) {
                const tryPath = path.join(project.path, 'img', dir, battlerName + '.png');
                if (fs.existsSync(tryPath)) {
                    const img = new Image();
                    img.onload = () => { this.enemySpriteImages[battlerName] = img; done(); };
                    img.onerror = done;
                    img.src = 'file://' + tryPath.replace(/\\/g, '/');
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

        if (this.battleback1Img && this.battleback1Img.complete && this.battleback1Img.naturalWidth)
            ctx.drawImage(this.battleback1Img, 0, 0, w, h);
        if (this.battleback2Img && this.battleback2Img.complete && this.battleback2Img.naturalWidth)
            ctx.drawImage(this.battleback2Img, 0, 0, w, h);

        this.enemySpriteBounds = [];
        const enemies = this.databaseManager.getEnemies();
        const members = this.currentTroop.members || [];

        members.forEach((member, idx) => {
            const enemy = enemies.find(e => e && e.id === member.enemyId);
            if (!enemy) return;

            const img = enemy.battlerName ? this.enemySpriteImages[enemy.battlerName] : null;

            if (img && img.complete && img.naturalWidth) {
                let drawW = img.naturalWidth;
                let drawH = img.naturalHeight;

                // Handle character-set battlers: extract single frame
                const firstChar = (enemy.battlerName || '').charAt(0);
                const isBigChar = (enemy.battlerName || '').match(/^[!$]*\$/);
                const isCharBattler = (firstChar === '!' || firstChar === '$');

                if (isCharBattler && !isBigChar) {
                    // Standard character sheet: 12 cols x 8 rows, show middle frame of first direction
                    const fw = img.naturalWidth / 12;
                    const fh = img.naturalHeight / 8;
                    const drawX = member.x - fw / 2;
                    const drawY = member.y - fh / 2;
                    if (member.hidden) ctx.globalAlpha = 0.4;
                    // Draw middle frame (index 1) of down direction (row 0)
                    ctx.drawImage(img, fw, 0, fw, fh, drawX, drawY, fw, fh);
                    ctx.globalAlpha = 1.0;
                    this.enemySpriteBounds.push({ x: drawX, y: drawY, width: fw, height: fh, memberIndex: idx });
                } else if (isCharBattler && isBigChar) {
                    // Big character ($ prefix): 3 cols x 4 rows
                    const fw = img.naturalWidth / 3;
                    const fh = img.naturalHeight / 4;
                    const drawX = member.x - fw / 2;
                    const drawY = member.y - fh / 2;
                    if (member.hidden) ctx.globalAlpha = 0.4;
                    ctx.drawImage(img, fw, 0, fw, fh, drawX, drawY, fw, fh);
                    ctx.globalAlpha = 1.0;
                    this.enemySpriteBounds.push({ x: drawX, y: drawY, width: fw, height: fh, memberIndex: idx });
                } else {
                    // Standard enemy sprite: draw full image
                    const drawX = member.x - drawW / 2;
                    const drawY = member.y - drawH / 2;
                    if (member.hidden) ctx.globalAlpha = 0.4;
                    ctx.drawImage(img, drawX, drawY);
                    ctx.globalAlpha = 1.0;
                    this.enemySpriteBounds.push({ x: drawX, y: drawY, width: drawW, height: drawH, memberIndex: idx });
                }
            } else {
                // Placeholder
                const pw = 64, ph = 64;
                const drawX = member.x - pw / 2;
                const drawY = member.y - ph / 2;
                ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                ctx.fillRect(drawX, drawY, pw, ph);
                ctx.strokeStyle = '#f00';
                ctx.strokeRect(drawX, drawY, pw, ph);
                ctx.fillStyle = '#fff';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(enemy.name || '?', member.x, member.y + 4);
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
        const section = document.createElement('div');
        section.className = 'database-section';
        section.style.cssText = 'flex: 1; display: flex; flex-direction: column; min-height: 250px;';

        section.innerHTML = '<div class="database-section-header">Battle Events</div>';

        const content = document.createElement('div');
        content.className = 'database-section-content';
        content.style.cssText = 'flex: 1; display: flex; flex-direction: column; overflow: hidden;';

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
        pageContent.style.cssText = 'flex: 1; display: flex; flex-direction: column; overflow: hidden;';
        content.appendChild(pageContent);

        section.appendChild(content);

        setTimeout(() => {
            this.renderBattlePageTabs();
            this.renderBattlePageContent();
        }, 0);

        return section;
    }

    renderBattlePageTabs() {
        const tabsContainer = document.getElementById('battle-page-tabs');
        if (!tabsContainer) return;
        tabsContainer.innerHTML = '';

        const pages = this.currentTroop.pages || [];
        pages.forEach((page, idx) => {
            const tab = document.createElement('button');
            tab.textContent = `Page ${idx + 1}`;
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
            tabsContainer.innerHTML = '<span style="color: var(--color-text-dim); font-size: 11px;">No pages</span>';
        }
    }

    renderBattlePageContent() {
        const container = document.getElementById('battle-page-content');
        if (!container) return;
        container.innerHTML = '';

        const pages = this.currentTroop.pages || [];
        if (pages.length === 0 || this.currentBattlePageIndex >= pages.length) {
            container.innerHTML = '<div style="color: var(--color-text-dim); text-align: center; padding: 20px;">No battle event pages. Click "New" to add one.</div>';
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
        spanLabel.textContent = 'Span:';
        topRow.appendChild(spanLabel);

        const spanSelect = document.createElement('select');
        spanSelect.style.cssText = 'background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 2px; border-radius: 3px; font-size: 11px;';
        ['Battle', 'Turn', 'Moment'].forEach((label, i) => {
            const opt = document.createElement('option');
            opt.value = i; opt.textContent = label;
            if (page.span === i) opt.selected = true;
            spanSelect.appendChild(opt);
        });
        spanSelect.onchange = () => { page.span = parseInt(spanSelect.value); this.persistTroop(); };
        topRow.appendChild(spanSelect);

        container.appendChild(topRow);

        // Command list (interactive)
        const cmdListContainer = document.createElement('div');
        cmdListContainer.id = 'battle-command-list';
        cmdListContainer.style.cssText = 'flex: 1; overflow-y: auto; border: 1px solid var(--color-border); background: var(--color-bg-base); border-radius: 3px;';
        container.appendChild(cmdListContainer);

        this.renderCommandList(cmdListContainer, page);
    }

    // ==========================================
    // INTERACTIVE COMMAND LIST
    // ==========================================

    renderCommandList(container, page) {
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
                div.innerHTML = '<span style="color: var(--color-border-input);">End</span>';
            } else {
                const info = this.getCommandDisplay(cmd);
                div.innerHTML = `<span style="color: var(--color-text-dim); min-width: 32px; display: inline-block;">${String(idx + 1).padStart(3, '0')}</span>` +
                    `<span style="color: ${info.color}; font-weight: 600; margin-right: 8px;">${this.escapeHTML(info.name)}</span>` +
                    `<span style="color: var(--color-text);">${this.escapeHTML(info.description)}</span>`;
            }

            // Click to select
            div.onclick = (e) => {
                if (e.ctrlKey || e.metaKey) {
                    const i = this.selectedCommandIndices.indexOf(idx);
                    if (i >= 0) this.selectedCommandIndices.splice(i, 1);
                    else this.selectedCommandIndices.push(idx);
                } else {
                    this.selectedCommandIndices = [idx];
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
    }

    showCommandContextMenu(x, y, page, container) {
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
            { label: 'Paste', action: () => this.pasteCommands(page, container), disabled: !this.commandClipboard },
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

    insertNewCommand(page, insertBeforeIndex) {
        if (!this.commandPicker) {
            this.commandPicker = new EventCommandPicker();
        }

        this.commandPicker.show((command) => {
            const newCmd = { code: command.code, indent: 0, parameters: this.getDefaultParams(command.code) };

            // Commands that need structure (conditional branch, loop, etc.)
            const cmds = this.buildCommandStructure(command.code);

            cmds.forEach((cmd, i) => {
                page.list.splice(insertBeforeIndex + i, 0, cmd);
            });

            this.persistTroop();
            this.selectedCommandIndices = [insertBeforeIndex];
            const container = document.getElementById('battle-command-list');
            if (container) this.renderCommandList(container, page);
        });
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
            338: [0, 0, 0],             // Force Action
            339: [],                     // Abort Battle
            355: [''],                   // Script
        };
        return defaults[code] || [];
    }

    editCommandSimple(cmd, idx, page) {
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
                this.persistTroop();
                const container = document.getElementById('battle-command-list');
                if (container) this.renderCommandList(container, page);
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

    // Command clipboard operations
    copyCommands(page) {
        const indices = this.selectedCommandIndices.filter(i => page.list[i] && page.list[i].code !== 0).sort((a, b) => a - b);
        if (indices.length === 0) return;
        this.commandClipboard = indices.map(i => JSON.parse(JSON.stringify(page.list[i])));
    }

    cutCommands(page, container) {
        this.copyCommands(page);
        this.deleteCommands(page, container);
    }

    deleteCommands(page, container) {
        const indices = this.selectedCommandIndices.filter(i => page.list[i] && page.list[i].code !== 0).sort((a, b) => b - a);
        indices.forEach(i => page.list.splice(i, 1));
        this.selectedCommandIndices = [];
        this.persistTroop();
        if (container) this.renderCommandList(container, page);
    }

    pasteCommands(page, container) {
        if (!this.commandClipboard) return;
        const insertAt = this.selectedCommandIndices.length > 0 ? Math.max(...this.selectedCommandIndices) + 1 : page.list.length - 1;
        this.commandClipboard.forEach((cmd, i) => {
            page.list.splice(insertAt + i, 0, JSON.parse(JSON.stringify(cmd)));
        });
        this.persistTroop();
        if (container) this.renderCommandList(container, page);
    }

    getCommandColor(code) {
        if (code === 0) return 'var(--color-border-input)';
        if (code >= 101 && code <= 105) return 'var(--color-syntax-type)';
        if (code === 108 || code === 408) return 'var(--color-syntax-string)';
        if (code >= 111 && code <= 119) return 'var(--color-syntax-string)';
        if (code >= 121 && code <= 129) return 'var(--color-syntax-function)';
        if (code >= 201 && code <= 250) return 'var(--color-syntax-type)';
        if (code >= 301 && code <= 339) return 'var(--color-syntax-function)';
        if (code >= 351 && code <= 357) return 'var(--color-syntax-keyword)';
        if (code >= 401 && code <= 413) return 'var(--color-syntax-comment)';
        if (code >= 601 && code <= 604) return 'var(--color-syntax-comment)';
        return 'var(--color-text-muted)';
    }

    getCommandDisplay(cmd) {
        const names = {
            0: 'End', 101: 'Show Text', 102: 'Show Choices', 103: 'Input Number',
            104: 'Select Item', 105: 'Show Scrolling Text',
            108: 'Comment', 111: 'If', 112: 'Loop', 113: 'Break Loop',
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
            337: 'Show Battle Anim', 338: 'Force Action', 339: 'Abort Battle',
            355: 'Script', 356: 'Plugin Command', 357: 'Plugin Command',
            401: '\u25B7 Text', 402: 'When', 403: 'When Cancel', 404: 'End Choices',
            405: '\u25B7 Scrolling Text', 408: '\u25B7 Comment',
            411: 'Else', 412: 'End', 413: 'Repeat Above',
            601: 'If Win', 602: 'If Escape', 603: 'If Lose', 604: 'End'
        };

        const name = names[cmd.code] || `Cmd ${cmd.code}`;
        const color = this.getCommandColor(cmd.code);
        let desc = '';

        const p = cmd.parameters || [];
        switch (cmd.code) {
            case 101: desc = p[4] ? p[4] : (p[0] ? `Face: ${p[0]}` : ''); break;
            case 108: case 408: desc = p[0] || ''; break;
            case 401: case 405: desc = p[0] || ''; break;
            case 111: {
                const types = ['Switch', 'Variable', 'Self Sw', 'Timer', 'Actor', 'Enemy', 'Character', 'Gold', 'Item', 'Weapon', 'Armor', 'Button', 'Script'];
                desc = types[p[0]] || `Type ${p[0]}`;
                if (p[0] === 0) desc = `Switch #${p[1]} ${p[2] === 0 ? 'ON' : 'OFF'}`;
                break;
            }
            case 117: desc = `#${p[0]}`; break;
            case 121: desc = `#${p[0]}${p[1] > p[0] ? '-' + p[1] : ''} = ${p[2] === 0 ? 'ON' : 'OFF'}`; break;
            case 122: desc = `#${p[0]}${p[1] > p[0] ? '-' + p[1] : ''}`; break;
            case 230: desc = `${p[0]} frames`; break;
            case 241: case 245: case 250: desc = p[0] ? (p[0].name || '') : ''; break;
            case 331: desc = `Enemy #${p[0] + 1}: ${p[2] === 0 ? '+' : '-'}${p[3]}`; break;
            case 332: desc = `Enemy #${p[0] + 1}: ${p[2] === 0 ? '+' : '-'}${p[3]}`; break;
            case 333: { const st = this.databaseManager.getState(p[2]); desc = `Enemy #${p[0] + 1}: ${p[1] === 0 ? '+' : '-'} ${st ? st.name : 'State ' + p[2]}`; break; }
            case 335: desc = `Enemy #${p[0] + 1}`; break;
            case 336: { const en = this.databaseManager.getEnemy(p[1]); desc = `Enemy #${p[0] + 1} → ${en ? en.name : '#' + p[1]}`; break; }
            case 338: desc = `Enemy #${p[0] + 1}`; break;
            case 355: desc = p[0] || ''; break;
            case 356: case 357: desc = p[0] ? `${p[0]}: ${p[1] || ''}` : ''; break;
            case 402: desc = p[1] || `Choice ${p[0]}`; break;
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
        if (this.currentBattlePageIndex < pages.length)
            this.battlePageClipboard = JSON.parse(JSON.stringify(pages[this.currentBattlePageIndex]));
    }

    pasteBattlePage() {
        if (!this.battlePageClipboard) return;
        if (!this.currentTroop.pages) this.currentTroop.pages = [];
        this.currentTroop.pages.splice(this.currentBattlePageIndex + 1, 0, JSON.parse(JSON.stringify(this.battlePageClipboard)));
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
        if (!conditions) return 'No conditions';
        const parts = [];
        if (conditions.turnEnding) parts.push('Turn End');
        if (conditions.turnValid) parts.push(`Turn ${conditions.turnA || 0}+${conditions.turnB || 0}x`);
        if (conditions.enemyValid) {
            const members = this.currentTroop.members || [];
            const m = members[conditions.enemyIndex];
            const enemy = m ? this.databaseManager.getEnemy(m.enemyId) : null;
            parts.push(`Enemy: ${enemy ? enemy.name : '#' + conditions.enemyIndex} \u2264${conditions.enemyHp}%`);
        }
        if (conditions.actorValid) {
            const actor = this.databaseManager.getActor(conditions.actorId);
            parts.push(`Actor: ${actor ? actor.name : '#' + conditions.actorId} \u2264${conditions.actorHp}%`);
        }
        if (conditions.switchValid) parts.push(`Sw #${conditions.switchId} ON`);
        return parts.length > 0 ? parts.join(', ') : 'No conditions';
    }

    // ==========================================
    // CONDITIONS MODAL
    // ==========================================

    showConditionsModal(page) {
        const c = page.conditions || {};

        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10001;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 8px; padding: 20px; width: 450px; max-width: 90vw;';

        dialog.innerHTML = '<h3 style="margin: 0 0 16px 0; color: var(--color-text-strong); font-size: 15px;">Conditions</h3>';

        const members = this.currentTroop.members || [];
        const enemies = this.databaseManager.getEnemies();
        const actors = this.databaseManager.getActors();

        const memberOpts = members.map((m, i) => {
            const en = enemies.find(e => e && e.id === m.enemyId);
            return `<option value="${i}" ${i === c.enemyIndex ? 'selected' : ''}>#${i + 1} ${en ? en.name : '?'}</option>`;
        }).join('');

        const actorOpts = actors.map(a =>
            `<option value="${a.id}" ${a.id === c.actorId ? 'selected' : ''}>#${a.id} ${a.name}</option>`
        ).join('');

        const inputStyle = 'width: 50px; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 3px; border-radius: 3px;';
        const selStyle = 'flex: 1; min-width: 0; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 3px; border-radius: 3px; font-size: 12px;';

        const form = document.createElement('div');
        form.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 13px;">
                    <input type="checkbox" id="cond-turnEnding" ${c.turnEnding ? 'checked' : ''}> Turn End
                </label>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 4px; color: var(--color-text); font-size: 13px;">
                        <input type="checkbox" id="cond-turnValid" ${c.turnValid ? 'checked' : ''}> Turn
                    </label>
                    <input type="number" id="cond-turnA" value="${c.turnA || 0}" min="0" style="${inputStyle}">
                    <span style="color: var(--color-text-muted);">+</span>
                    <input type="number" id="cond-turnB" value="${c.turnB || 0}" min="0" style="${inputStyle}">
                    <span style="color: var(--color-text-muted);">\u00D7 X</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 4px; color: var(--color-text); font-size: 13px; white-space: nowrap;">
                        <input type="checkbox" id="cond-enemyValid" ${c.enemyValid ? 'checked' : ''}> Enemy HP
                    </label>
                    <select id="cond-enemyIndex" style="${selStyle}">${memberOpts}</select>
                    <span style="color: var(--color-text-muted);">\u2264</span>
                    <input type="number" id="cond-enemyHp" value="${c.enemyHp || 0}" min="0" max="100" style="${inputStyle}">
                    <span style="color: var(--color-text-muted);">%</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 4px; color: var(--color-text); font-size: 13px; white-space: nowrap;">
                        <input type="checkbox" id="cond-actorValid" ${c.actorValid ? 'checked' : ''}> Actor HP
                    </label>
                    <select id="cond-actorId" style="${selStyle}">${actorOpts}</select>
                    <span style="color: var(--color-text-muted);">\u2264</span>
                    <input type="number" id="cond-actorHp" value="${c.actorHp || 0}" min="0" max="100" style="${inputStyle}">
                    <span style="color: var(--color-text-muted);">%</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 4px; color: var(--color-text); font-size: 13px; white-space: nowrap;">
                        <input type="checkbox" id="cond-switchValid" ${c.switchValid ? 'checked' : ''}> Switch
                    </label>
                    <input type="number" id="cond-switchId" value="${c.switchId || 1}" min="1" style="flex: 1; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 3px; border-radius: 3px;">
                </div>
            </div>
        `;
        dialog.appendChild(form);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;';
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
        if (typeof BattleTestConfigModal === 'undefined') { alert('Battle test module not loaded'); return; }
        const project = this.projectManager.getCurrentProject();
        if (!project) { alert('No project loaded'); return; }
        const playtestManager = this.parentEditor.playtestManager;
        if (!playtestManager) { alert('Playtest manager not available'); return; }

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
