/**
 * BattleTestConfigModal - Configure party for battle testing
 * Allows selecting actors, levels, and equipment before launching a battle test.
 * Writes testBattlers/testTroopId to System.json and spawns NW.js with 'btest'.
 */

class BattleTestConfigModal {
    constructor(databaseManager, project, troopId, battleback1Name, battleback2Name, playtestManager) {
        this.databaseManager = databaseManager;
        this.project = project;
        this.troopId = troopId;
        this.battleback1Name = battleback1Name;
        this.battleback2Name = battleback2Name;
        this.playtestManager = playtestManager;

        // Party configuration: array of battler configs
        this.battlers = [];
        this.selectedBattlerIndex = 0;

        // Initialize with default party from System.json testBattlers or actors
        this.initializeBattlers();
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    initializeBattlers() {
        const system = this.databaseManager.getSystem();
        const existingBattlers = system && system.testBattlers;

        if (existingBattlers && existingBattlers.length > 0) {
            this.battlers = JSON.parse(JSON.stringify(existingBattlers));
        } else {
            // Default: first actor at level 1 with default equipment
            const actors = this.databaseManager.getActors();
            if (actors.length > 0) {
                const actor = actors[0];
                this.battlers = [{
                    actorId: actor.id,
                    level: actor.initialLevel || 1,
                    equips: actor.equips ? [...actor.equips] : [0, 0, 0, 0, 0]
                }];
            } else {
                this.battlers = [{
                    actorId: 1,
                    level: 1,
                    equips: [0, 0, 0, 0, 0]
                }];
            }
        }
    }

    show() {
        this.modal = document.createElement('div');
        this.modal.className = 'battle-test-config-modal';
        this.modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(0, 0, 0, 0.8); display: flex;
            align-items: center; justify-content: center; z-index: 10002;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background-color: var(--color-bg-surface); border: 1px solid var(--color-border-input); border-radius: 8px;
            width: 560px; max-width: 90vw; max-height: 85vh;
            display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--shadow-modal);
        `;

        const header = document.createElement('div');
        header.className = 'battle-test-config-header';
        header.style.cssText = 'padding:12px 16px;background-color:var(--color-bg-toolbar);border-bottom:1px solid var(--color-border);flex-shrink:0;';
        const title = document.createElement('h3');
        title.textContent = this._t('Battle Test Configuration');
        title.style.cssText = 'margin:0;color:var(--color-text-strong);font-size:15px;';
        header.appendChild(title);
        dialog.appendChild(header);

        const body = document.createElement('div');
        body.className = 'battle-test-config-body';
        body.style.cssText = 'display:flex;flex:1;flex-direction:column;min-height:0;padding:16px;background-color:var(--color-bg-surface);';

        // Battler tabs row
        const tabsRow = document.createElement('div');
        tabsRow.id = 'btest-tabs-row';
        tabsRow.style.cssText = 'display: flex; align-items: center; gap: 4px; margin-bottom: 12px; flex-wrap: wrap;';
        body.appendChild(tabsRow);

        // Battler config area
        const configArea = document.createElement('div');
        configArea.id = 'btest-config-area';
        configArea.style.cssText = 'flex:1;min-height:0;overflow-y:auto;padding-inline-end:12px;scrollbar-gutter:stable;';
        body.appendChild(configArea);
        dialog.appendChild(body);

        // Buttons
        const btnRow = document.createElement('div');
        btnRow.className = 'battle-test-config-footer';
        btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;background-color:var(--color-bg-panel);border-top:1px solid var(--color-border);flex-shrink:0;';

        const cancelBtn = this.createButton('Cancel', () => this.close());
        cancelBtn.style.backgroundColor = 'var(--color-bg-button)';
        cancelBtn.onmouseenter = () => { cancelBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; cancelBtn.style.borderColor = 'var(--color-accent)'; };
        cancelBtn.onmouseleave = () => { cancelBtn.style.backgroundColor = 'var(--color-bg-button)'; cancelBtn.style.borderColor = 'var(--color-text-dim)'; };

        const okBtn = document.createElement('button');
        okBtn.textContent = this._t('OK');
        okBtn.style.cssText = 'padding: 8px 16px; background-color: var(--color-accent); color: var(--color-bg-deep); border: 1px solid var(--color-accent); border-radius: 4px; cursor: pointer; font-weight: bold;';
        okBtn.onmouseenter = () => { okBtn.style.backgroundColor = 'var(--color-accent-muted)'; };
        okBtn.onmouseleave = () => { okBtn.style.backgroundColor = 'var(--color-accent)'; };
        okBtn.onclick = () => this.launch();

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        dialog.appendChild(btnRow);

        this.modal.appendChild(dialog);
        this.modal.onclick = (e) => { if (e.target === this.modal) this.close(); };
        document.body.appendChild(this.modal);
        if (window.I18n) window.I18n.applyText(this.modal);

        this.renderTabs();
        this.renderConfig();
    }

    close() {
        if (this.modal && this.modal.parentNode) {
            document.body.removeChild(this.modal);
        }
    }

    createButton(label, onclick) {
        const btn = document.createElement('button');
        btn.textContent = this._t(label);
        btn.style.cssText = 'padding: 8px 16px; background-color: var(--color-bg-panel); color: var(--color-text-strong); border: 1px solid var(--color-text-dim); border-radius: 4px; cursor: pointer;';
        btn.onmouseenter = () => { btn.style.backgroundColor = 'var(--color-accent-tint-35)'; btn.style.borderColor = 'var(--color-bg-deep)'; };
        btn.onmouseleave = () => { btn.style.backgroundColor = 'var(--color-bg-panel)'; btn.style.borderColor = 'var(--color-text-dim)'; };
        btn.onclick = onclick;
        return btn;
    }

    // ==========================================
    // TABS
    // ==========================================

    renderTabs() {
        const row = document.getElementById('btest-tabs-row');
        if (!row) return;
        row.innerHTML = '';

        const actors = this.databaseManager.getActors();

        this.battlers.forEach((battler, idx) => {
            const actor = this.databaseManager.getActor(battler.actorId);
            const tab = document.createElement('button');
            tab.textContent = actor ? actor.name : `${this._t('Actor')} #${battler.actorId}`;
            tab.style.cssText = `
                padding: 4px 12px; border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 12px;
                ${idx === this.selectedBattlerIndex
                    ? 'background-color: var(--color-accent-tint-30); color: var(--color-text-strong); border-color: var(--color-accent-bright);'
                    : 'background-color: var(--color-bg-menubar); color: var(--color-text-muted);'}
            `;
            tab.onclick = () => {
                this.selectedBattlerIndex = idx;
                this.renderTabs();
                this.renderConfig();
            };
            row.appendChild(tab);
        });

        // Add button
        const addBtn = document.createElement('button');
        addBtn.textContent = '+';
        addBtn.title = this._t('Add party member');
        addBtn.style.cssText = 'padding: 4px 10px; background-color: var(--color-bg-menubar); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 14px;';
        addBtn.onmouseenter = () => { addBtn.style.backgroundColor = 'var(--color-accent-tint-25)'; };
        addBtn.onmouseleave = () => { addBtn.style.backgroundColor = 'var(--color-bg-menubar)'; };
        addBtn.onclick = () => this.addBattler();
        row.appendChild(addBtn);

        // Remove button
        if (this.battlers.length > 1) {
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '\u2212';
            removeBtn.title = this._t('Remove selected party member');
            removeBtn.style.cssText = 'padding: 4px 10px; background-color: var(--color-bg-menubar); color: #f44; border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 14px;';
            removeBtn.onmouseenter = () => { removeBtn.style.backgroundColor = 'rgba(255, 100, 100, 0.2)'; };
            removeBtn.onmouseleave = () => { removeBtn.style.backgroundColor = 'var(--color-bg-menubar)'; };
            removeBtn.onclick = () => this.removeBattler();
            row.appendChild(removeBtn);
        }
    }

    addBattler() {
        const actors = this.databaseManager.getActors();
        if (actors.length === 0) return;
        // Pick the next actor not already in party, or default to first
        const usedIds = this.battlers.map(b => b.actorId);
        const nextActor = actors.find(a => !usedIds.includes(a.id)) || actors[0];
        this.battlers.push({
            actorId: nextActor.id,
            level: nextActor.initialLevel || 1,
            equips: nextActor.equips ? [...nextActor.equips] : [0, 0, 0, 0, 0]
        });
        this.selectedBattlerIndex = this.battlers.length - 1;
        this.renderTabs();
        this.renderConfig();
    }

    removeBattler() {
        if (this.battlers.length <= 1) return;
        this.battlers.splice(this.selectedBattlerIndex, 1);
        if (this.selectedBattlerIndex >= this.battlers.length) {
            this.selectedBattlerIndex = this.battlers.length - 1;
        }
        this.renderTabs();
        this.renderConfig();
    }

    // ==========================================
    // CONFIG AREA
    // ==========================================

    collectActorTraitDataIds(actor, traitCode) {
        const result = new Set();
        const collect = traits => {
            for (const trait of traits || []) {
                if (trait.code === traitCode) result.add(trait.dataId);
            }
        };
        collect(actor?.traits);
        collect(this.databaseManager.getClass(actor?.classId)?.traits);
        return result;
    }

    getCompatibleEquipment(actor, etypeId) {
        if (!actor || this.collectActorTraitDataIds(actor, 54).has(etypeId)) return [];
        if (etypeId === 1) {
            const allowedWtypes = this.collectActorTraitDataIds(actor, 51);
            return this.databaseManager.getWeapons()
                .filter(weapon => weapon && allowedWtypes.has(weapon.wtypeId));
        }
        const allowedAtypes = this.collectActorTraitDataIds(actor, 52);
        return this.databaseManager.getArmors()
            .filter(armor => armor && armor.etypeId === etypeId && allowedAtypes.has(armor.atypeId));
    }

    getEquipmentForSlot(equipId, etypeId) {
        if (!equipId) return null;
        return etypeId === 1
            ? this.databaseManager.getWeapon(equipId)
            : this.databaseManager.getArmor(equipId);
    }

    isCompatibleEquipment(actor, item, etypeId) {
        return !!item && this.getCompatibleEquipment(actor, etypeId)
            .some(candidate => candidate.id === item.id);
    }

    renderConfig() {
        const area = document.getElementById('btest-config-area');
        if (!area) return;
        area.innerHTML = '';

        if (this.battlers.length === 0) {
            area.innerHTML = `<div style="color: var(--color-text-dim); text-align: center; padding: 20px;">${this._t('No party members')}</div>`;
            return;
        }

        const battler = this.battlers[this.selectedBattlerIndex];
        const actors = this.databaseManager.getActors();
        const system = this.databaseManager.getSystem() || {};
        const equipTypes = system.equipTypes || [];
        const weaponTypes = system.weaponTypes || [];
        const armorTypes = system.armorTypes || [];
        const actor = this.databaseManager.getActor(battler.actorId);
        const engineLevelLimit = globalThis.RR_LIMITS?.ACTOR_LEVEL || 999;
        const actorLevelLimit = Math.max(1, Math.min(engineLevelLimit, Number(actor?.maxLevel) || engineLevelLimit));
        battler.level = Math.max(1, Math.min(actorLevelLimit, Number(battler.level) || 1));

        // Actor selector
        const actorRow = this.createFormRow('Actor:');
        const actorSelect = document.createElement('select');
        actorSelect.style.cssText = 'width:100%;min-width:0;background:var(--color-bg-menubar);border:1px solid var(--color-border-input);color:var(--color-text);padding:4px;border-radius:3px;';
        actors.forEach(actor => {
            const opt = document.createElement('option');
            opt.value = actor.id;
            opt.textContent = `#${actor.id} ${actor.name}`;
            if (actor.id === battler.actorId) opt.selected = true;
            actorSelect.appendChild(opt);
        });
        actorSelect.onchange = () => {
            const newActorId = parseInt(actorSelect.value);
            const newActor = this.databaseManager.getActor(newActorId);
            battler.actorId = newActorId;
            battler.level = (newActor && newActor.initialLevel) || 1;
            battler.equips = (newActor && newActor.equips) ? [...newActor.equips] : [0, 0, 0, 0, 0];
            this.renderTabs();
            this.renderConfig();
        };
        actorRow.appendChild(actorSelect);
        area.appendChild(actorRow);

        // Level
        const levelRow = this.createFormRow('Level:');
        const levelInput = document.createElement('input');
        levelInput.type = 'number';
        levelInput.min = 1;
        levelInput.max = actorLevelLimit;
        levelInput.value = battler.level || 1;
        levelInput.style.cssText = 'width: 60px; background: var(--color-bg-menubar); border: 1px solid var(--color-border-input); color: var(--color-text); padding: 4px; border-radius: 3px;';
        levelInput.onchange = () => {
            battler.level = Math.max(1, Math.min(actorLevelLimit, parseInt(levelInput.value) || 1));
            levelInput.value = battler.level;
            this.renderStats(area, battler);
        };
        levelRow.appendChild(levelInput);
        area.appendChild(levelRow);

        // Equipment
        const equipHeader = document.createElement('div');
        equipHeader.style.cssText = 'color: var(--color-text-muted); font-size: 12px; font-weight: 500; margin: 12px 0 6px 0; border-bottom: 1px solid var(--color-border); padding-bottom: 4px;';
        equipHeader.textContent = this._t('Equipment');
        area.appendChild(equipHeader);

        const actorClass = this.databaseManager.getClass(actor?.classId);
        const filterHint = document.createElement('div');
        filterHint.style.cssText = 'margin:0 0 8px 106px;color:var(--color-text-muted);font-size:10px;';
        filterHint.textContent = actorClass
            ? `${this._t('Filtered by class:')} ${actorClass.name}`
            : this._t('Filtered by actor traits');
        area.appendChild(filterHint);

        const equipSlots = this.getEquipSlotBindings(actor);

        // Ensure equips array is long enough
        if (!Array.isArray(battler.equips)) battler.equips = [];
        const requiredEquipLength = equipSlots.reduce((length, slot) => Math.max(length, slot.slotIndex + 1), 0);
        while (battler.equips.length < requiredEquipLength) {
            battler.equips.push(0);
        }

        const visibleEquipSlots = equipSlots
            .map(({ etypeId, slotIndex }) => ({
                etypeId,
                slotIndex,
                currentEquipId: Number(battler.equips[slotIndex]) || 0,
                compatibleItems: this.getCompatibleEquipment(actor, etypeId)
            }))
            .filter(slot => typeof equipTypes[slot.etypeId] === 'string' && equipTypes[slot.etypeId].trim())
            .filter(slot => slot.compatibleItems.length > 0 || slot.currentEquipId > 0);

        visibleEquipSlots.forEach(({ etypeId, slotIndex, currentEquipId, compatibleItems }) => {
            const slotName = equipTypes[etypeId] || `${this._t('Slot')} ${slotIndex + 1}`;
            const row = this.createFormRow(slotName + ':');

            const select = document.createElement('select');
            select.style.cssText = 'width:100%;min-width:0;background:var(--color-bg-menubar);border:1px solid var(--color-border-input);color:var(--color-text);padding:4px;border-radius:3px;font-size:12px;';
            const noneOption = document.createElement('option');
            noneOption.value = '0';
            noneOption.textContent = this._t('(None)');
            noneOption.selected = currentEquipId === 0;
            select.appendChild(noneOption);

            compatibleItems.forEach(item => {
                const typeName = etypeId === 1
                    ? (weaponTypes[item.wtypeId] || this._t('Weapon'))
                    : (armorTypes[item.atypeId] || this._t('Armor'));
                const option = document.createElement('option');
                option.value = String(item.id);
                option.textContent = `${item.name} (${typeName})`;
                option.selected = item.id === currentEquipId;
                select.appendChild(option);
            });

            if (currentEquipId > 0 && !compatibleItems.some(item => item.id === currentEquipId)) {
                const staleItem = this.getEquipmentForSlot(currentEquipId, etypeId);
                const staleOption = document.createElement('option');
                staleOption.value = String(currentEquipId);
                staleOption.textContent = staleItem
                    ? `${staleItem.name} ${this._t('(incompatible)')}`
                    : `#${currentEquipId} ${this._t('(missing)')}`;
                staleOption.selected = true;
                staleOption.disabled = true;
                select.appendChild(staleOption);
            }

            select.onchange = () => {
                battler.equips[slotIndex] = parseInt(select.value);
                this.renderStats(area, battler);
            };

            const field = document.createElement('div');
            field.style.cssText = 'min-width:0;';
            field.appendChild(select);
            row.appendChild(field);
            area.appendChild(row);
        });

        if (visibleEquipSlots.length === 0) {
            const emptyEquipment = document.createElement('div');
            emptyEquipment.style.cssText = 'margin:8px 0 10px 106px;color:var(--color-text-muted);font-size:11px;';
            emptyEquipment.textContent = this._t('No equipment slots available');
            area.appendChild(emptyEquipment);
        }

        // Stats display
        const statsHeader = document.createElement('div');
        statsHeader.style.cssText = 'color: var(--color-text-muted); font-size: 12px; font-weight: 500; margin: 12px 0 6px 0; border-bottom: 1px solid var(--color-border); padding-bottom: 4px;';
        statsHeader.textContent = this._t('Stats');
        area.appendChild(statsHeader);

        const statsContainer = document.createElement('div');
        statsContainer.id = 'btest-stats-display';
        area.appendChild(statsContainer);

        this.renderStats(area, battler);
    }

    renderStats(area, battler) {
        const container = document.getElementById('btest-stats-display');
        if (!container) return;
        container.innerHTML = '';

        const stats = this.calculateStats(battler);
        const paramNames = ['Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'].map(name => this._t(name));

        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px;';

        paramNames.forEach((name, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; justify-content: space-between; font-size: 12px;';
            const label = document.createElement('span');
            label.style.color = 'var(--color-text-muted)';
            label.textContent = `${name}:`;
            const value = document.createElement('span');
            value.style.color = 'var(--color-text)';
            value.textContent = stats[idx];
            row.append(label, value);
            grid.appendChild(row);
        });

        container.appendChild(grid);
    }

    calculateStats(battler) {
        const actor = this.databaseManager.getActor(battler.actorId);
        if (!actor) return [0, 0, 0, 0, 0, 0, 0, 0];

        const classData = this.databaseManager.getClass(actor.classId);
        if (!classData || !classData.params) return [0, 0, 0, 0, 0, 0, 0, 0];

        const engineLevelLimit = globalThis.RR_LIMITS?.ACTOR_LEVEL || 999;
        const actorLevelLimit = Math.max(1, Math.min(engineLevelLimit, Number(actor.maxLevel) || engineLevelLimit));
        const level = Math.max(1, Math.min(actorLevelLimit, battler.level || 1));
        const stats = [];
        const equipSlots = this.getEquipSlotBindings(actor);
        const equippedItems = equipSlots.map(({ etypeId, slotIndex }) => {
            const item = this.getEquipmentForSlot(Number(battler.equips?.[slotIndex]) || 0, etypeId);
            return this.isCompatibleEquipment(actor, item, etypeId) ? item : null;
        });

        for (let paramIdx = 0; paramIdx < 8; paramIdx++) {
            // Base stat from class curve at level
            const base = globalThis.rrClassParamAtLevel
                ? globalThis.rrClassParamAtLevel(classData.params[paramIdx], level)
                : Number(classData.params[paramIdx]?.[level]) || 0;

            // Add equipment bonuses
            let equipBonus = 0;
            for (const item of equippedItems) {
                if (item?.params?.[paramIdx] !== undefined) equipBonus += item.params[paramIdx];
            }

            stats.push(base + equipBonus);
        }

        return stats;
    }

    getEquipSlots(actor) {
        return RREquipSlots.resolve(
            this.databaseManager,
            this.project,
            actor,
            this.isDualWield(actor)
        );
    }

    getEquipSlotBindings(actor) {
        return RREquipSlots.resolveInitialBindings(
            this.databaseManager,
            this.project,
            actor,
            this.isDualWield(actor)
        );
    }

    isDualWield(actor) {
        if (!actor) return false;
        if (actor.traits) {
            for (const trait of actor.traits) {
                if (trait.code === 55 && trait.dataId === 1) return true;
            }
        }
        const actorClass = this.databaseManager.getClass(actor.classId);
        if (actorClass && actorClass.traits) {
            for (const trait of actorClass.traits) {
                if (trait.code === 55 && trait.dataId === 1) return true;
            }
        }
        return false;
    }

    createFormRow(label) {
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:96px minmax(0,1fr);align-items:center;gap:10px;width:100%;min-width:0;margin-bottom:6px;';
        const labelEl = document.createElement('label');
        labelEl.style.cssText = 'color:var(--color-text-muted);font-size:12px;text-align:right;';
        labelEl.textContent = this._t(label);
        row.appendChild(labelEl);
        return row;
    }

    // ==========================================
    // LAUNCH
    // ==========================================

    async launch() {
        const system = this.databaseManager.getSystem();
        if (!system) {
            alert(this._t('System data not available'));
            return;
        }

        // The test party/troop persist in System.json (as in MZ), but the
        // battleback picked for this run is preview-only — it goes into the
        // Test_ copy and must not overwrite the game's default battlebacks.
        system.testBattlers = this.battlers;
        system.testTroopId = this.troopId;

        const testSystem = JSON.parse(JSON.stringify(system));
        testSystem.battleback1Name = this.battleback1Name;
        testSystem.battleback2Name = this.battleback2Name;

        const path = require('path');
        const fs = require('fs');
        const dataDir = path.join(this.project.path, 'data');

        // The game engine loads Test_-prefixed files in btest mode.
        // Write all database files with Test_ prefix so the game has current data.
        const dm = this.databaseManager;
        const testFiles = [
            ['Actors.json', dm.data.actors],
            ['Classes.json', dm.data.classes],
            ['Skills.json', dm.data.skills],
            ['Items.json', dm.data.items],
            ['Weapons.json', dm.data.weapons],
            ['Armors.json', dm.data.armors],
            ['Enemies.json', dm.data.enemies],
            ['Troops.json', dm.data.troops],
            ['States.json', dm.data.states],
            ['Animations.json', dm.data.animations],
            ['Tilesets.json', dm.data.tilesets],
            ['CommonEvents.json', dm.data.commonEvents],
            ['System.json', testSystem],
            ['MapInfos.json', dm.data.mapInfos],
        ];

        try {
            for (const [filename, data] of testFiles) {
                fs.writeFileSync(path.join(dataDir, 'Test_' + filename), JSON.stringify(data));
            }
        } catch (e) {
            alert(`${this._t('Failed to write test data:')} ${e.message}`);
            return;
        }

        // Also save normal System.json so testTroopId persists
        try {
            fs.writeFileSync(path.join(dataDir, 'System.json'), JSON.stringify(system, null, 2));
        } catch (e) {
            // Non-fatal, test files are what matter
        }

        this.close();
        this.playtestManager.battleTest(this.project.path);
    }
}
