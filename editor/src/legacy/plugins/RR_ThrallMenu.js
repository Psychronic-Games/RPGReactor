/*:
 * @target MZ
 * @plugindesc Scene Menu ReDux, Simple Sort Inventory and Thrall's menu scenes (VX), for imported games
 * @author Yanfly and KGC (Scene Menu ReDux), cozziekuns (Simple Sort Inventory), Strak; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallMenu.js
 *
 * The main menu: a bar of icon commands across the top (Items, Equip,
 * Skills, Save, Settings), the party below it (name, class, HP, the
 * Overdrive gauge, level with the experience gauge and percentage,
 * states), and Objectives: the accepted jobs, the location and its icon,
 * the trinket, gold and shards. The menu opens with the menu or cancel
 * key; compare opens the Pain menu (unless switch 65) and sort the Guide,
 * when those ports are on. Save is disabled while saving is, and shows a
 * lock icon until switch 4 is on.
 *
 * Items: three categories (Items, Weapons, Armors) by the page keys, with
 * the backpack count (variable 2 of 26, 5 or 6), sorted by rarity or type
 * (the sort key toggles variable 100), dash marks a weapon or armour as a
 * favourite, confirm uses an item or offers to salvage gear for gold or
 * materials (variable 89). The detail panel shows the selected entry.
 *
 * Equip: the slots and the chosen item's stats, the actor's stats with
 * what a change gives; the page keys change actor, dash marks favourites,
 * compare toggles the quick comparison (switch 68). An item above the
 * actor's level cannot be equipped, nor gear taken off into a full pack.
 *
 * Save, load and erase (the title's Continue and Erase): four accounts. A
 * save goes to the account the game was loaded from (or the first free
 * one); loading puts the party on the start map, as the original did. The
 * game's database changes (loot, favourites) are kept in the save, and
 * the locker (weapons 524-526, armour 488-490) is kept for every save, as
 * Data/Validation.rvdata kept it.
 *
 * Skills opens Scene_ThrallSkills (the skill tree port) for the chosen
 * actor; the Overdrive gauge reads Game_Battler rrOverdrive() and
 * rrOverdriveMax() or rrMaxOverdrive() (the Overdrive port); compare and
 * sort on the map open Scene_ThrallHeat and Scene_RRThrallGuide; Objectives read
 * $gameSystem.rrAcceptedJobs() and rrJobDetail(id) (the Job Board port).
 * Each shows nothing when its port is off.
 *
 * Script calls:
 *   DataManager.rrThrallAutoSave()   Auto_Save.new: save without a scene
 *   SceneManager.goto(Scene_ThrallMenu); SceneManager.prepareNextScene(i)
 *                                    the menu with command i selected
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param menuCommands
 * @text Menu commands
 * @desc JSON: MENU_COMMANDS (0 Items, 1 Skills, 2 Equip, 4 Save, 5 Settings).
 * @default [0,2,1,4,5]
 *
 * @param startIndex
 * @type number
 * @default 0
 *
 * @param iconSets
 * @text Command icons
 * @desc JSON: ICON_SETS, command name to icon.
 * @default {"Unlisted":0,"Equip":298,"Items":144,"Save":6,"Settings":7,"Skills":1}
 *
 * @param expGauge1
 * @type number
 * @default 18
 *
 * @param expGauge2
 * @type number
 * @default 19
 *
 * @param percentExp
 * @default %#.1f%%
 *
 * @param odGaugeMax
 * @text Overdrive gauge
 * @desc KGC::OverDrive::GAUGE_MAX
 * @type number
 * @default 1000
 *
 * @param categories
 * @text Item categories
 * @desc JSON: MOD_ALG_ITEM_CATEGORIES, id to [icon, name, prime].
 * @default {"0":[144,"Items",false],"1":[298,"Weapons",false],"2":[637,"Armors",true]}
 *
 * @param categoryWidth
 * @type number
 * @default 456
 *
 * @param categoryText
 * @default
 *
 * @param locker
 * @text Locker
 * @desc JSON: the shipped Data/Validation.rvdata's locker, {"weapons": [3 records], "armors": [3 records]} (VX fields).
 * @type note
 * @default ""
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallMenu');
    const json = (text, fallback) => { try { const v = JSON.parse(text); return v == null ? fallback : v; } catch (_) { return fallback; } };
    const U = window.RRThrallUi;
    if (!U) return;
    const { v, s, idiv, WLH, define, rect: R, vxSelectable } = U;
    const P = {
        menuCommands: json(params.menuCommands, [0, 2, 1, 4, 5]),
        startIndex: Number(params.startIndex || 0),
        iconSets: json(params.iconSets, { Unlisted: 0, Equip: 298, Items: 144, Save: 6, Settings: 7, Skills: 1 }),
        expGauge1: Number(params.expGauge1 ?? 18), expGauge2: Number(params.expGauge2 ?? 19),
        percentExp: params.percentExp || '%#.1f%%',
        odGaugeMax: Number(params.odGaugeMax || 1000),
        categories: json(params.categories, { 0: [144, 'Items', false], 1: [298, 'Weapons', false], 2: [637, 'Armors', true] }),
        categoryWidth: Number(params.categoryWidth || 456),
        categoryText: params.categoryText || '',
        locker: json(params.locker && params.locker.startsWith('"') ? json(params.locker, '') : params.locker, null)
    };
    const CATEGORY_KEYS = Object.keys(P.categories).map(Number).sort((a, b) => a - b);
    const MAX_NUMBER = idiv(608 - P.categoryWidth, 48);
    const readInput = (i, fallback) => ($gameSystem.rrReadInput ? $gameSystem.rrReadInput(i) : fallback);
    const sceneOf = (...names) => { for (const n of names) if (typeof window[n] === 'function') return window[n]; return null; };

    /** sprintf for the formats the scripts use: %#.Nf, %d, %s and %%. */
    const sprintf = (format, ...values) => {
        let i = 0;
        return String(format).replace(/%(#?)(?:\.(\d+))?([dfs%])/g, (m, hash, prec, type) => {
            if (type === '%') return '%';
            const value = values[i++];
            if (type === 'd') return String(Math.trunc(Number(value)));
            if (type === 'f') return Number(value).toFixed(prec === undefined ? 6 : Number(prec));
            return String(value);
        });
    };
    U.sprintf = sprintf;

    //=========================================================================
    // Going between scenes as $scene = … did
    //=========================================================================
    const goto = (S, ...args) => { SceneManager.goto(S); if (args.length) SceneManager.prepareNextScene(...args); };
    /** Back to a scene the stack holds (the map under the menu, the title under its screens), else a new one. */
    const back = (S) => {
        const stack = SceneManager._stack;
        if (stack.length && stack[stack.length - 1] === S) SceneManager.pop();
        else goto(S);
    };
    U.toMap = () => back(Scene_Map);
    U.toTitle = () => back(Scene_Title);
    /** Game_Temp#menu_command_index: where each command sits in the menu last built (KGC's custom menu). */
    const menuIndex = () => ($gameTemp._rrMenuCommandIndex || ($gameTemp._rrMenuCommandIndex = {}));
    /** A scene's return_scene as Scene Menu ReDux wrote it: the menu at the command, else the map. */
    U.returnToMenu = (key) => {
        const at = menuIndex()[key];
        if (at !== undefined) goto(Scene_ThrallMenu, at); else U.toMap();
    };

    // The engine's own menu scenes, and the events' calls to them, open Thrall's. By name: the engine
    // wraps its scene classes after the plugins load, so the class a call passes is not the one seen here.
    const redirect = (U.sceneRedirects = U.sceneRedirects || new Map());
    if (!U.redirectInstalled) {
        U.redirectInstalled = true;
        const _goto = SceneManager.goto;
        SceneManager.goto = function(sceneClass) {
            const to = sceneClass && redirect.get(sceneClass.name);
            _goto.call(this, (to && to()) || sceneClass);
        };
    }
    U.redirectScene = (fromName, to) => redirect.set(fromName, to);

    //=========================================================================
    // Scene_Menu (078, 129)
    //=========================================================================
    define('Window_ThrallMenuCommand', Window_Selectable, Object.assign({}, vxSelectable, {
        initialize(commands) {
            this._rrCommands = commands;
            this._rrDisabled = new Set();
            Window_Selectable.prototype.initialize.call(this, R(0, 0, 608, 56));
            this.refresh();
            this.select(0);
            this.activate();
        },
        rrVxSpacing() { return 4; },
        maxCols() { return this._rrCommands.length; },
        maxItems() { return this._rrCommands.length; },
        isHorizontal() { return true; },
        rrSetEnabled(index, enabled) {
            if (enabled) this._rrDisabled.delete(index); else this._rrDisabled.add(index);
            this.redrawItem(index);
        },
        drawItem(index) {
            const enabled = !this._rrDisabled.has(index);
            const r = this.itemRect(index);
            const dx = r.x + 4, dy = r.y, dw = r.width - 8, dh = r.height;
            this.contents.clearRect(dx, dy, dw, dh);
            this.changeTextColor(this.rrVxNormalColor());
            const text = this._rrCommands[index];
            let icon = Object.prototype.hasOwnProperty.call(P.iconSets, text) ? P.iconSets[text] : P.iconSets.Unlisted || 0;
            if (icon === 6 && !s(4)) icon = 758;
            const tw = Math.floor(this.textWidth(text));
            this.rrVxDrawIcon(icon, dx + Math.floor((dw - tw) / 2) - 12, dy, enabled);
            this.changeTextColor(enabled ? this.rrVxNormalColor() : this.rrVxTextColor(17));
            this.rrVxDrawText(dx + Math.floor((dw - tw) / 2) + 12, dy, dw - 24, dh, text);
        }
    }));

    define('Window_ThrallReDuxStatus', Window_ThrallMenuStatus, {
        rrDrawMembers() {
            $gameParty.members().forEach((actor, index) => {
                this.rrVxDrawActorGraphic(actor, index * 202 + 129, 48);
                let x = index * 202;
                const y = 0;
                this.rrVxDrawActorName(actor, x, y);
                this.rrVxDrawActorClass(actor, x, y + WLH);
                this.rrVxDrawActorHp(actor, x, y + WLH * 2, 172);
                this.rrDrawActorOd(actor, x, y + WLH * 3, 172);
                this.rrDrawExp(actor, x, y + WLH * 4, 172);
                let count = 0;
                for (const state of actor.states()) {
                    this.rrVxDrawIcon(state.iconIndex, x, y + WLH * 5);
                    count++;
                    x += 24;
                    if (count >= 7) break;
                }
            });
        },
        /** now_exp / next_exp: the experience into this level and this level's span (0 at the top level). */
        rrExp(actor) {
            const list = actor.rrExpList ? actor.rrExpList() : null;
            if (list) {
                const level = actor.level;
                return { now: actor.currentExp() - (list[level] || 0), next: list[level + 1] > 0 ? list[level + 1] - (list[level] || 0) : 0 };
            }
            const now = actor.currentExp() - actor.currentLevelExp();
            const next = actor.isMaxLevel() ? 0 : Math.max(0, actor.nextLevelExp() - actor.currentLevelExp());
            return { now, next };
        },
        rrDrawExp(actor, x, y, size = 120) {
            const { now, next } = this.rrExp(actor);
            const gw = next !== 0 ? idiv(size * now, next) : size;
            this.contents.fillRect(x, y + WLH - 8, size, 6, this.rrVxGaugeBackColor());
            this.contents.gradientFillRect(x, y + WLH - 8, Math.max(0, gw), 6, this.rrVxTextColor(P.expGauge1), this.rrVxTextColor(P.expGauge2));
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(x, y, 32, WLH, TextManager.levelA);
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(x + 36, y, 24, WLH, actor.level);
            let percent = next !== 0 ? now * 100.0 / next : 100.0;
            if (percent > 100.0) percent = 100.0;
            this.rrVxDrawText(x, y, size, WLH, sprintf(P.percentExp, percent), 2);
        },
        /** The Overdrive gauge: the current gauge's share (full at the maximum). */
        rrDrawActorOd(actor, x, y, width = 120) {
            const od = actor.rrOverdrive ? Number(actor.rrOverdrive()) || 0 : 0;
            const max = Number(actor.rrOverdriveMax ? actor.rrOverdriveMax() : actor.rrMaxOverdrive ? actor.rrMaxOverdrive() : P.odGaugeMax) || P.odGaugeMax;
            let n = od % P.odGaugeMax;
            if (od === max) n = P.odGaugeMax;
            const gw = idiv(width * n, P.odGaugeMax);
            this.contents.fillRect(x, y + WLH - 8, width, 6, this.rrVxGaugeBackColor());
            this.contents.gradientFillRect(x, y + WLH - 8, gw, 6, this.rrVxTextColor(12), this.rrVxTextColor(15));
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(x, y, 172, WLH, 'Overdrive');
        }
    });

    const TRINKETS = [0, 912, 913, 914, 915, 916, 917, 918, 919, 920, 921, 922, 923, 924, 928, 929, 930, 931, 932, 933, 935, 936, 934, 938, 937];
    const DELIVERY_ICONS = [145, 158, 164, 165, 166, 167, 144, 148, 159, 168];
    /** Game_Map#map_name: the map's name without its [tags] (Message Queue's version, which the game ran). */
    U.mapName = () => {
        const info = $dataMapInfos[$gameMap.mapId()];
        return info ? String(info.name).replace(/\[.*?\]/g, '').trim() : '';
    };
    define('Window_ThrallObjectives', Window_Base, {
        initialize() {
            Window_Base.prototype.initialize.call(this, R(0, 232, 608, 248));
            this.refresh();
        },
        refresh() {
            this.contents.clear();
            const cw = this.innerWidth;
            let y = 0;
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(0, y, cw, WLH, 'Objectives');
            const jobs = $gameSystem.rrAcceptedJobs ? $gameSystem.rrAcceptedJobs() || [] : [];
            const detail = (id) => ($gameSystem.rrJobDetail ? String($gameSystem.rrJobDetail(id) ?? '') : '');
            for (const [lo, hi] of [[1, 100], [101, 200], [201, 300]]) {
                for (const job of jobs) {
                    if (!jobs.length) break;
                    if (job[0] < lo || job[0] > hi) continue;
                    y += 24;
                    this.changeTextColor(this.rrVxNormalColor());
                    if (job[0] < 101) this.rrVxDrawIcon(227, 0, y);
                    else if (job[0] < 201) this.rrVxDrawIcon(228, 0, y);
                    else if (job[5]) { this.changeTextColor(this.rrVxPowerUpColor()); this.rrVxDrawIcon(226, 0, y); }
                    else this.rrVxDrawIcon(225, 0, y);
                    let text = detail(job[0]);
                    this.rrVxDrawText(24, y, cw, WLH, text);
                    let x = Math.floor(this.textWidth(text)) + 24;
                    if (job[0] >= 204 && job[0] <= 213) { this.rrVxDrawIcon(DELIVERY_ICONS[job[0] - 204], x, y); x += 24; }
                    if (job[0] > 100) {
                        text = ' - ' + detail(job[1]);
                        if (job[0] > 200) text += detail(job[2]);
                        text += ' - ';
                        this.rrVxDrawText(x, y, cw - x, WLH, text);
                        x += Math.floor(this.textWidth(text));
                        this.rrVxDrawIcon(job[3], x, y);
                    }
                }
            }
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(28, 192, cw, WLH, $gameParty.gold());
            this.rrVxDrawIcon(8, 0, 192);
            this.rrVxDrawText(0, 192, cw - 28, WLH, String(v(89)), 2);
            this.rrVxDrawIcon(14, cw - 24, 192);
            let name = U.mapName();
            if (v(16) > 0) name += ' ' + v(16);
            this.rrVxDrawText(0, 0, cw - 28, WLH, name, 2);
            this.rrVxDrawIcon(9, cw - 24, 0);
            const trinket = TRINKETS[v(185)];
            if (trinket) this.rrVxDrawIcon(trinket, idiv(cw, 2) - 12, 192);
        }
    });

    /** Shared by Thrall's menu scenes: VX's background, no touch buttons, input polled by the scene. */
    const sceneBase = {
        createButtons() {},
        /** Input is read only while nothing else is happening: no fade, no scene change on its way. */
        rrIdle() { return !this.isBusy() && !SceneManager.isSceneChanging(); }
    };

    define('Scene_ThrallMenu', Scene_MenuBase, Object.assign({}, sceneBase, {
        initialize() {
            Scene_MenuBase.prototype.initialize.call(this);
            this._rrMenuIndex = P.startIndex;
        },
        prepare(menuIndex = P.startIndex) { this._rrMenuIndex = menuIndex; },
        create() {
            Scene_MenuBase.prototype.create.call(this);
            this.rrCreateCommandWindow();
            this._statusWindow = new Window_ThrallReDuxStatus(160, 56);
            this._statusWindow.x = 0;
            this.addWindow(this._statusWindow);
            this._objectiveWindow = new Window_ThrallObjectives();
            this.addWindow(this._objectiveWindow);
        },
        /** create_command_list: the commands MENU_COMMANDS names, and where each one sits. */
        rrCommandList() {
            const commands = [], index = {};
            for (const c of P.menuCommands) {
                const add = (key, text) => { index[key] = commands.length; commands.push(text); };
                if (c === 0) add('item', TextManager.item);
                else if (c === 1) add('skill', TextManager.skill);
                else if (c === 2) add('equip', TextManager.equip);
                else if (c === 4) add('save', TextManager.save);
                else if (c === 5) add('game_end', TextManager.gameEnd);
            }
            $gameTemp._rrMenuCommandIndex = index;
            return commands;
        },
        rrCreateCommandWindow() {
            const commands = this.rrCommandList();
            this._commandWindow = new Window_ThrallMenuCommand(commands);
            this._commandWindow.select(Math.min(this._rrMenuIndex, commands.length - 1));
            this.addWindow(this._commandWindow);
            this._rrDisabledIndex = [];
            const disable = [];
            if ($gameParty.members().length === 0) disable.push('item', 'skill', 'equip');
            if (!$gameSystem.isSaveEnabled()) disable.push('save');
            for (const key of disable) {
                const at = menuIndex()[key];
                if (at === undefined) continue;
                this._commandWindow.rrSetEnabled(at, false);
                this._rrDisabledIndex.push(at);
            }
        },
        rrCommandEnabled(index) {
            if (!$gameSystem.isSaveEnabled() && index === menuIndex().save) return false;
            if ($gameParty.members().length === 0 && this._rrDisabledIndex.includes(index)) return false;
            return true;
        },
        update() {
            Scene_MenuBase.prototype.update.call(this);
            if (!this.rrIdle()) return;
            if (this._commandWindow.active) this.rrUpdateCommandSelection();
            else if (this._statusWindow.active) this.rrUpdateActorSelection();
        },
        rrUpdateCommandSelection() {
            if (Input.isTriggered('cancel')) { U.sound('cancel'); U.toMap(); return; }
            if (!Input.isTriggered('ok')) return;
            const index = this._commandWindow.index(), at = menuIndex();
            if (!this.rrCommandEnabled(index)) { U.sound('buzzer'); return; }
            U.sound('decision');
            if (index === at.item) goto(Scene_ThrallItem);
            else if (index === at.skill || index === at.equip) this.rrStartActorSelection();
            else if (index === at.save) goto(Scene_ThrallFile, true, false, false);
            else if (index === at.game_end) {
                const S = sceneOf('Scene_ThrallOptions');
                if (S) goto(S, false); else SceneManager.push(Scene_GameEnd);
            }
        },
        rrStartActorSelection() {
            this._commandWindow.deactivate();
            this._statusWindow.activate();
            const last = $gameParty._rrLastActorIndex || 0;
            this._statusWindow.select(last < this._statusWindow.maxItems() ? last : 0);
        },
        rrEndActorSelection() {
            this._commandWindow.activate();
            this._statusWindow.deactivate();
            this._statusWindow.select(-1);
        },
        rrUpdateActorSelection() {
            if (Input.isTriggered('cancel')) { U.sound('cancel'); this.rrEndActorSelection(); return; }
            if (!Input.isTriggered('ok')) return;
            const actorIndex = this._statusWindow.index(), at = menuIndex();
            $gameParty._rrLastActorIndex = actorIndex;
            U.sound('decision');
            const command = this._commandWindow.index();
            if (command === at.skill) { const S = sceneOf('Scene_ThrallSkills'); if (S) goto(S, actorIndex); }
            else if (command === at.equip) goto(Scene_ThrallEquip, actorIndex);
        }
    }));

    //=========================================================================
    // Simple Sort Inventory (127) and Scene_Item (079)
    //=========================================================================
    /** \item_category[n] in a note, else 0. */
    const categoryIndex = (item) => { const m = /\\item_category\[(\d+)]/i.exec(U.note(item)); return m ? Number(m[1]) : 0; };
    const isPrime = (item) => { const c = P.categories[categoryIndex(item)]; return !!(c && c[2]); };
    const _itemIncludes = Window_ThrallItem.prototype.includes;
    const _itemRefresh = Window_ThrallItem.prototype.refresh;
    Object.assign(Window_ThrallItem.prototype, {
        /** refresh(sort_index): the category the list shows (0 when none is given, as Ruby's default). */
        refresh(sortIndex = 0) {
            this._rrSortIndex = sortIndex;
            _itemRefresh.call(this);
        },
        includes(item) {
            if (!_itemIncludes.call(this, item)) return false;
            if ($gameParty.inBattle()) return true;
            if (!this.rrCategoryFilter) return true;
            if (isPrime(item)) return false;
            if (this._rrSortIndex === 0) return U.isItem(item);
            if (this._rrSortIndex === 1) return U.isWeapon(item);
            if (this._rrSortIndex === 2) return U.isArmor(item);
            return false;
        },
        rrCategoryFilter: true
    });
    Window_ThrallEquipItem.prototype.rrCategoryFilter = false;

    define('Window_ThrallItemCategory', Window_Base, {
        initialize(x, y, width) {
            Window_Base.prototype.initialize.call(this, R(x, y, width, WLH + 32));
            this.refresh();
        },
        refresh(sortIndex = 0) {
            this._rrSortIndex = sortIndex;
            this.contents.clear();
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(4, 0, P.categoryWidth - 40, WLH, P.categoryText);
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawIcon(readInput(3, 817), 0, 0);
            this.rrVxDrawIcon(readInput(4, 835), 156, 0);
            for (const key of CATEGORY_KEYS) {
                if (sortIndex !== key) continue;
                const name = P.categories[key][1];
                const cap = key === 1 ? v(5) : key === 2 ? v(6) : v(26);
                const text = `${name}: ${v(2)}/${cap}`;
                const text2 = v(100) === 0 ? 'Sort: Rarity' : 'Sort: Type';
                this.rrVxDrawIcon(readInput(6, 839), 292, 0);
                this.rrVxDrawIcon(readInput(0, 819), 400, 0);
                this.rrVxDrawText(0, 0, 180, WLH, text, 1);
                this.rrVxDrawText(188, 0, 100, WLH, text2, 2);
                this.rrVxDrawText(320, 0, 76, WLH, 'Favorite:', 2);
                break;
            }
        }
    });

    define('Window_ThrallItemSort', Window_Base, {
        initialize(x, y, width) {
            Window_Base.prototype.initialize.call(this, R(x, y, width, WLH + 32));
            this.refresh();
        },
        refresh(sortIndex = 0) {
            this._rrSortIndex = sortIndex;
            this.contents.clear();
            CATEGORY_KEYS.forEach((key, i) => {
                this.rrVxDrawIcon(P.categories[key][0], i * 48, 0, false);
                if (sortIndex === key) this.rrVxDrawIcon(P.categories[key][0], i * 48, 0, true);
            });
        }
    });

    // ---- Window_Stats (the Loot Table's detail panel, as the inventory uses it) ----
    /** Window_Stats#update_skin and Window_EquipStats#update_skin: the colour-blind skin, its Perfect twin for element 23. */
    U.statsSkin = (item) => {
        const mode = v(80);
        let name = mode > 0 ? 'Window' + mode : 'Window';
        if (item && !U.isItem(item) && U.hasElement(item, 23)) name = mode > 0 ? 'WindowP' + mode : 'WindowP';
        return U.windowskin(name);
    };
    /** The flavour text of a \FLAVOR[...] note. */
    const flavor = (item) => { const m = /\\FLAVOR\[(.*?)\]/i.exec(U.note(item)); return m ? m[1] : ''; };
    const STATE_SKIP = [49, 50, 51];
    const stateIcons = (ids, into = []) => {
        for (const id of ids) {
            if (STATE_SKIP.includes(id)) continue;
            const st = $dataStates[id];
            if (!st || !st.iconIndex) continue;
            if (!into.includes(st.iconIndex)) into.push(st.iconIndex);
        }
        return into;
    };
    const ELEMENT_ICONS = { 1: 738, 2: 739, 3: 740, 4: 741, 5: 742 };
    U.weaponIcons = (item) => {
        const icons = [];
        for (const e of U.elementSet(item)) if (ELEMENT_ICONS[e]) icons.push(ELEMENT_ICONS[e]);
        return stateIcons(U.stateSet(item), icons);
    };
    U.armorTag = (item) => (U.get(item, 'prevent_critical') ? 'LESSCRIT' : U.get(item, 'half_mp_cost') ? 'COOLDOWN' : U.get(item, 'auto_hp_recover') ? 'REGEN'
        : U.get(item, 'double_exp_gain') ? 'BONUS EXP' : U.note(item).includes('THORNS') ? 'THORNS' : '');
    U.weaponTag = (item) => (U.get(item, 'fast_attack') ? 'FAST' : U.note(item).includes('HEAVY') ? 'KNOCKBACK' : U.hasElement(item, 16) ? 'MULTI' : U.get(item, 'critical_bonus') ? 'CRITDMG' : '');
    /** A stat drawn against another: up, down or level, with " (O)" / " (X)" while switch 37 is on. */
    const compared = (win, text, value, other) => {
        if (other === null || other === undefined) { win.changeTextColor(win.rrVxNormalColor()); return text; }
        if (value > other) { win.changeTextColor(win.rrVxPowerUpColor()); return s(37) ? text + ' (O)' : text; }
        if (value < other) { win.changeTextColor(win.rrVxPowerDownColor()); return s(37) ? text + ' (X)' : text; }
        win.changeTextColor(win.rrVxNormalColor());
        return text;
    };
    U.compared = compared;

    define('Window_ThrallStats', Window_Base, {
        initialize(x, y, w, h) { Window_Base.prototype.initialize.call(this, R(x, y, w, h)); },
        /** refresh(index, items, actor): the entry at index, against the party member's gear when an actor index is given. */
        rrRefresh(index, items, actorIndex = null) {
            this.contents.clear();
            const item = items[index] || null;
            this.windowskin = U.statsSkin(item);
            if (!items.length || !item) return;
            const sys = (x, y, w, text) => { this.changeTextColor(this.rrVxSystemColor()); this.rrVxDrawText(x, y, w, 24, text); };
            const actor = actorIndex !== null && actorIndex !== undefined ? $gameParty.members()[actorIndex] : null;
            this.rrVxDrawItemName(item, 0, 0, true);
            if (U.isItem(item)) {
                sys(0, WLH, 50, 'Effect:');
                this.changeTextColor(this.rrVxNormalColor());
                this.rrVxDrawText(55, WLH, 467, 24, U.description(item));
                sys(0, WLH * 2, 50, 'SELL:');
                this.changeTextColor(this.rrVxNormalColor());
                this.rrVxDrawText(55, WLH * 2, 73, 24, idiv(U.price(item), 5) + 'G');
                stateIcons(U.get(item, 'minus_state_set') || []).forEach((icon, i) => this.rrVxDrawIcon(icon, 128 + i * 24, WLH * 2));
                return;
            }
            const weapon = U.isWeapon(item);
            const other = actor ? (weapon ? U.equips(actor)[0] : U.equips(actor)[U.armorKind(item) + 1]) : null;
            const stat = (x, label, field, suffix = '') => {
                sys(x, WLH, 45, label);
                const value = U.get(item, field);
                const text = compared(this, value + suffix, value, other ? U.get(other, field) : null);
                this.rrVxDrawText(x + 49, WLH, 89, 24, text);
            };
            if (weapon) {
                stat(0, 'DMG:', 'atk'); stat(146, 'DEX:', 'agi'); stat(292, 'ACC:', 'hit', '%');
                sys(438, WLH, 45, 'CRIT:');
                const n = Number(U.get(item, 'spi')) || 0;
                const text = actor && other ? compared(this, n + '%', n, U.wpnCri(actor)) : compared(this, n + '%', n, null);
                this.rrVxDrawText(487, WLH, 89, 24, text);
            } else {
                stat(0, 'HP:', 'atk'); stat(146, 'DEF:', 'def'); stat(292, 'RES:', 'spi'); stat(438, 'EVA:', 'eva', '%');
            }
            this.changeTextColor(this.rrVxNormalColor());
            const tag = weapon ? U.weaponTag(item) : U.armorTag(item);
            if (tag) this.rrVxDrawText(292, WLH * 2, 138, 24, tag);
            sys(0, WLH * 2, 45, 'LVL:');
            let lvl = U.description(item);
            if (actor && U.levelReq(item) > actor.level) { this.changeTextColor(this.rrVxTextColor(14)); if (s(37)) lvl += ' (X)'; }
            else this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(49, WLH * 2, 89, 24, lvl);
            sys(146, WLH * 2, 45, 'SELL:');
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(195, WLH * 2, 89, 24, idiv(U.price(item), 5) + 'G');
            const icons = weapon ? U.weaponIcons(item) : stateIcons(U.stateSet(item));
            icons.forEach((icon, i) => this.rrVxDrawIcon(icon, 438 + i * 24, WLH * 2));
            this.changeTextColor(this.rrVxTextColor(14));
            this.rrVxDrawText(288, 0, 288, 24, flavor(item));
        }
    });

    define('Scene_ThrallItem', Scene_MenuBase, Object.assign({}, sceneBase, {
        create() {
            Scene_MenuBase.prototype.create.call(this);
            this._itemWindow = new Window_ThrallItem(R(0, 56, 608, 320));
            this.addWindow(this._itemWindow);
            this._statsWindow = new Window_ThrallStats(0, 376, 608, 104);
            this.addWindow(this._statsWindow);
            this._confirmWindow = new Window_ThrallConfirm();
            this.addWindow(this._confirmWindow);
            this._itemWindow.deactivate();
            this._rrSortIndex = 0;
            this._rrData = this.rrMakeData(true);
            this._categoryWindow = new Window_ThrallItemCategory(608 - P.categoryWidth, 0, P.categoryWidth);
            this.addWindow(this._categoryWindow);
            this._sortWindow = new Window_ThrallItemSort(0, 0, 608 - P.categoryWidth);
            this.addWindow(this._sortWindow);
            this._targetWindow = new Window_ThrallReDuxStatus(160, 56);
            this.addWindow(this._targetWindow);
            this._statsWindow.rrRefresh(this._itemWindow.index(), this._rrData);
            this._rrLastIndex = null;
            this.rrHideTargetWindow();
        },
        /** The scene's own list (weapons, armour, items), and the backpack count in variable 2 when asked. */
        rrMakeData(count) {
            const include = (item) => this._itemWindow.includes(item);
            const data = U.sortedWeapons(include).concat(U.sortedArmors(include), U.sortedItems(include));
            if (count) U.setV(2, data.length);
            return data;
        },
        update() {
            Scene_MenuBase.prototype.update.call(this);
            if (!this.rrIdle()) return;
            const index = this._itemWindow.index();
            if (this._rrLastIndex !== index && index >= 0) {
                this._rrData = this.rrMakeData(false);
                this._rrLastIndex = index;
                this._statsWindow.rrRefresh(index, this._rrData);
            }
            if (this._itemWindow.active) this.rrUpdateItemSelection();
            else if (this._targetWindow.active) this.rrUpdateTargetSelection();
            else if (this._confirmWindow.active) this.rrUpdateConfirmSelection();
        },
        rrRelist(index = 0) {
            this._itemWindow.refresh(CATEGORY_KEYS[this._rrSortIndex]);
            this._itemWindow.select(index);
            this._rrData = this.rrMakeData(true);
            this._categoryWindow.refresh(CATEGORY_KEYS[this._rrSortIndex]);
            this._statsWindow.rrRefresh(this._itemWindow.index(), this._rrData);
        },
        rrUpdateItemSelection() {
            const w = this._itemWindow;
            if (Input.isTriggered('cancel')) { U.sound('cancel'); U.returnToMenu('item'); return; }
            if (Input.isTriggered('shift')) {
                const item = w.item();
                if (item && (U.isWeapon(item) || U.isArmor(item))) {
                    U.toggleFavorite(item);
                    w.refresh(this._rrSortIndex);
                    this._statsWindow.rrRefresh(w.index(), this._rrData);
                    U.sound('decision');
                }
                return;
            }
            if (Input.isTriggered('ok')) {
                const item = (this._rrItem = w.item());
                if (U.itemCanUse(item)) { U.sound('decision'); this.rrDetermineItem(); }
                else if (U.isWeapon(item) || U.isArmor(item)) {
                    if (U.hasElement(item, 18)) U.sound('buzzer');
                    else { w.deactivate(); this._confirmWindow.rrRefresh(true); U.sound('decision'); }
                } else U.sound('buzzer');
                return;
            }
            if (Input.isTriggered('pagedown') || Input.isTriggered('pageup')) {
                const n = CATEGORY_KEYS.length;
                this._rrSortIndex = ((this._rrSortIndex + (Input.isTriggered('pagedown') ? 1 : -1)) % n + n) % n;
                this._sortWindow.refresh(CATEGORY_KEYS[this._rrSortIndex]);
                this.rrRelist(0);
                U.sound('cursor');
                return;
            }
            if (Input.isTriggered('rgssY')) {
                U.setV(100, v(100) === 0 ? 1 : 0);
                this.rrRelist(0);
                U.sound('cursor');
            }
        },
        rrUpdateConfirmSelection() {
            if (Input.isTriggered('cancel')) { U.sound('cancel'); this.rrHideTargetWindow(); return; }
            if (!Input.isTriggered('ok')) return;
            if (this._confirmWindow.index() !== 0) { U.sound('cancel'); this.rrHideTargetWindow(); return; }
            const item = this._rrItem;
            this.rrSalvage(item);
            this.rrRelist(0);
            U.sound('decision');
            this.rrHideTargetWindow();
        },
        /** Salvage: gold with the Voucher trinket (22), else materials by rarity; the challenges count; the item goes. */
        rrSalvage(item) {
            if (v(185) === 22) $gameParty.gainGold(idiv(U.price(item), 5));
            else {
                const e = U.elementSet(item);
                U.setV(89, v(89) + (e.includes(14) ? 1 : e.includes(13) ? 2 : e.includes(12) ? 5 : e.includes(11) ? 10 : 25));
            }
            const st = U.stateSet(item);
            [[2, 161], [3, 162], [4, 163], [5, 164]].forEach(([state, variable]) => { if (st.includes(state)) U.setV(variable, v(variable) + 1); });
            $gameParty.gainItem(U.mz(item), -1);
        },
        rrDetermineItem() {
            const action = new Game_Action($gameParty.leader() || $gameActors.actor(1));
            action.setItemObject(U.mz(this._rrItem));
            if (action.isForFriend()) {
                this.rrShowTargetWindow();
                if (action.isForAll()) this._targetWindow.select(99);
                else {
                    const last = $gameParty._rrLastTargetIndex || 0;
                    this._targetWindow.select(last < this._targetWindow.maxItems() ? last : 0);
                }
            } else this.rrUseItemNontarget();
        },
        rrUpdateTargetSelection() {
            if (Input.isTriggered('cancel')) {
                U.sound('cancel');
                if ($gameParty.numItems(U.mz(this._rrItem)) === 0) this._itemWindow.refresh();
                this.rrHideTargetWindow();
                return;
            }
            if (!Input.isTriggered('ok')) return;
            if (!U.itemCanUse(this._rrItem)) U.sound('buzzer');
            else this.rrDetermineTarget();
        },
        rrDetermineTarget() {
            const item = this._rrItem;
            const action = new Game_Action($gameParty.leader() || $gameActors.actor(1));
            action.setItemObject(U.mz(item));
            let used = false;
            if (action.isForAll()) {
                for (const target of $gameParty.members()) if (U.itemEffect(target, item)) used = true;
            } else {
                $gameParty._rrLastTargetIndex = this._targetWindow.index();
                const target = $gameParty.members()[this._targetWindow.index()];
                if (target && U.itemEffect(target, item)) used = true;
            }
            if (used) this.rrUseItemNontarget(); else U.sound('buzzer');
        },
        rrShowTargetWindow() {
            this._itemWindow.deactivate();
            this._targetWindow.x = 0;
            this._targetWindow.show();
            this._targetWindow.activate();
        },
        rrHideTargetWindow() {
            this._confirmWindow.rrHide();
            this._itemWindow.activate();
            this._targetWindow.hide();
            this._targetWindow.deactivate();
        },
        rrUseItemNontarget() {
            const item = this._rrItem;
            U.sound('useItem');
            $gameParty.consumeItem(U.mz(item));
            this._itemWindow.redrawItem(this._itemWindow.index());
            this._targetWindow.refresh();
            this._rrData = U.partyItems().filter(x => this._itemWindow.includes(x));
            this._statsWindow.rrRefresh(this._itemWindow.index(), this._rrData);
            if ($gameParty.isAllDead()) { SceneManager.goto(Scene_Gameover); return; }
            const ce = Number(U.get(item, 'common_event_id')) || 0;
            if (ce > 0) { $gameParty._lastItem.setObject(U.mz(item)); $gameTemp.reserveCommonEvent(ce); U.toMap(); }
        }
    }));
    /** Game_Battler#item_effect(user, item) in the menu: the battle port's VX rules when on, else MZ's; true unless skipped. */
    U.itemEffect = (target, item) => {
        const V = window.RRThrallVx;
        const vxItem = V && V.item ? V.item(U.mz(item).id) : null;
        if (vxItem && target.rrVxItemEffect) {
            target.rrVxItemEffect(target, vxItem);
            return !(target.rrVxResult && target.rrVxResult().skipped);
        }
        const action = new Game_Action(target);
        action.setItemObject(U.mz(item));
        if (!action.testApply(target)) return false;
        for (let i = 0; i < action.numRepeats(); i++) action.apply(target);
        return true;
    };

    //=========================================================================
    // Scene_Equip (081) and its stats window
    //=========================================================================
    define('Window_ThrallEquipStats', Window_Base, {
        initialize(x = 304, y = 0, width = 304, height = 224) {
            Window_Base.prototype.initialize.call(this, R(x, y, width, height));
            this._rrItem = false;
        },
        /** set_text(item, actor): drawn when the item changed. */
        rrSetItem(item, actor, compare = 0) {
            if (item !== this._rrItem) { this.rrRefresh(item, actor, compare); this._rrItem = item; }
        },
        rrRefresh(item, actor, compare = 0) {
            this.windowskin = U.statsSkin(item);
            this.contents.clear();
            this.changeTextColor(this.rrVxNormalColor());
            if (compare > 0) {
                if (!item) { this.rrVxDrawText(0, 0, 272, 24, 'No Comparison Data'); this.rrVxDrawActorGraphic(actor, 16, WLH + 48); }
                else { this.rrVxDrawActorGraphic(actor, 16, 232); this.rrVxDrawActorFace(actor, 36, 216); this.rrVxDrawActorLevel(actor, 36, 184); }
            }
            this.rrVxDrawItemName(item, 0, 0, true);
            if (!item || U.isItem(item)) return;
            const sys = (x, y, text) => { this.changeTextColor(this.rrVxSystemColor()); this.rrVxDrawText(x, y, 45, 24, text); };
            const weapon = U.isWeapon(item);
            const equipped = weapon ? U.equips(actor)[0] : U.equips(actor)[U.armorKind(item) + 1];
            const row = (x, y, label, field, bare, suffix = '') => {
                sys(x, y, label);
                const value = Number(U.get(item, field)) || 0;
                const other = equipped ? Number(U.get(equipped, field)) || 0 : bare;
                this.rrVxDrawText(x + 49, y, 83, 24, compared(this, value + suffix, value, other));
            };
            if (weapon) {
                row(0, WLH, 'DMG:', 'atk', actor.param(2));
                row(140, WLH, 'DEX:', 'agi', actor.param(6));
                row(0, WLH * 2, 'ACC:', 'hit', actor.rrVxHit ? actor.rrVxHit() : Math.round(actor.hit * 100), '%');
                sys(140, WLH * 2, 'CRIT:');
                const n = Number(U.get(item, 'spi')) || 0;
                this.rrVxDrawText(189, WLH * 2, 83, 24, compared(this, n + '%', n, U.wpnCri(actor)));
            } else {
                row(0, WLH, 'HP:', 'atk', 1);
                row(140, WLH, 'DEF:', 'def', 1);
                row(0, WLH * 2, 'RES:', 'spi', 1);
                row(140, WLH * 2, 'EVA:', 'eva', 0, '%');
            }
            sys(0, WLH * 3, 'LVL:');
            let lvl = U.description(item);
            if (U.levelReq(item) > actor.level) { this.changeTextColor(this.rrVxTextColor(14)); if (s(37)) lvl += ' (X)'; }
            else this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(49, WLH * 3, 83, 24, lvl);
            sys(140, WLH * 3, 'SELL:');
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(189, WLH * 3, 83, 24, idiv(U.price(item), 5) + 'G');
            const tag = weapon ? U.weaponTag(item) : U.armorTag(item);
            if (tag) this.rrVxDrawText(0, WLH * 4, 132, 24, tag);
            const icons = weapon ? U.weaponIcons(item) : stateIcons(U.stateSet(item));
            icons.forEach((icon, i) => this.rrVxDrawIcon(icon, 140 + i * 24, WLH * 4));
            this.changeTextColor(this.rrVxTextColor(14));
            this.rrVxDrawText(0, weapon || compare === 0 ? WLH * 5 : WLH * 6, 272, 24, flavor(item));
        }
    });

    const EQUIP_TYPE_MAX = 5;
    define('Scene_ThrallEquip', Scene_MenuBase, Object.assign({}, sceneBase, {
        prepare(actorIndex = 0, equipIndex = 0) { this._rrActorIndex = actorIndex; this._rrEquipIndex = equipIndex; },
        create() {
            Scene_MenuBase.prototype.create.call(this);
            this._rrActorIndex = this._rrActorIndex || 0;
            this._rrEquipIndex = this._rrEquipIndex || 0;
            this._rrActor = $gameParty.members()[this._rrActorIndex] || $gameParty.members()[0];
            const actor = this._rrActor;
            this._statsWindow = new Window_ThrallEquipStats();
            this.addWindow(this._statsWindow);
            this._itemWindows = [];
            for (let i = 0; i < EQUIP_TYPE_MAX; i++) {
                const w = new Window_ThrallEquipItem(R(0, 224, 256, 256), actor, i, 1);
                w.visible = this._rrEquipIndex === i;
                w.deactivate();
                w.select(-1);
                this._itemWindows.push(w);
                this.addWindow(w);
            }
            this._equipWindow = new Window_ThrallEquip(0, 0, actor);
            this._equipWindow.select(this._rrEquipIndex);
            this._equipWindow.activate();
            this.addWindow(this._equipWindow);
            this._statusWindow = new Window_ThrallEquipStatus(256, 224, actor);
            this.addWindow(this._statusWindow);
            this._itemWindow = this._itemWindows[this._rrEquipIndex];
            this._statsWindow.rrSetItem(this._equipWindow.item(), actor);
        },
        update() {
            Scene_MenuBase.prototype.update.call(this);
            if (!this.rrIdle() || !this._rrActor) return;
            this.rrUpdateHelp();
            this.rrUpdateStatusWindow();
            this._itemWindows.forEach((w, i) => { w.visible = this._equipWindow.index() === i; });
            this._itemWindow = this._itemWindows[this._equipWindow.index()];
            if (this._equipWindow.active) this.rrUpdateEquipSelection();
            else if (this._itemWindow.active) this.rrUpdateItemSelection();
        },
        /** update_help: the active window's item in the stats panel. */
        rrUpdateHelp() {
            if (this._equipWindow.active) this._statsWindow.rrSetItem(this._equipWindow.item(), this._rrActor);
            else if (this._itemWindow && this._itemWindow.active) this._statsWindow.rrSetItem(this._itemWindow.item(), this._rrActor);
        },
        rrUpdateStatusWindow() {
            if (this._equipWindow.active) this._statusWindow.rrSetNewParameters(null, null, null, null, null, null, null, null);
            else if (this._itemWindow.active) {
                const key = this._equipWindow.index() + ':' + this._itemWindow.index();
                if (key !== this._rrStatusKey) {
                    this._rrStatusKey = key;
                    const t = U.testActor(this._rrActor, this._equipWindow.index(), this._itemWindow.item());
                    this._rrNew = [U.baseAtk(t), U.baseDef(t), U.baseSpi(t), U.baseAgi(t), U.wpnHit(t), U.eva(t), U.cri(t), U.maxhp(t)];
                }
                this._statusWindow.rrSetNewParameters(...this._rrNew);
            }
        },
        rrToggleFavorite(item) {
            U.toggleFavorite(item);
            this._statsWindow.rrRefresh(item, this._rrActor);
            this._statsWindow._rrItem = item;
        },
        rrToggleCompare() {
            U.setS(68, !s(68));
            for (const w of this._itemWindows) w.refresh();
            U.sound('decision');
        },
        rrUpdateEquipSelection() {
            const ew = this._equipWindow;
            if (Input.isTriggered('cancel')) { U.sound('cancel'); U.returnToMenu('equip'); return; }
            if (Input.isTriggered('shift')) {
                const item = ew.item();
                if (item) { this.rrToggleFavorite(item); ew.refresh(); U.sound('decision'); }
                return;
            }
            if (Input.isTriggered('pagedown')) { U.sound('cursor'); this.rrChangeActor(1); return; }
            if (Input.isTriggered('pageup')) { U.sound('cursor'); this.rrChangeActor(-1); return; }
            if (Input.isTriggered('rgssX')) { this.rrToggleCompare(); return; }
            if (Input.isTriggered('ok')) {
                const actor = this._rrActor;
                const fixed = actor.rrVxActorData ? actor.rrVxActorData().fix_equipment : !actor.isEquipChangeOk(ew.index());
                if (fixed) { U.sound('buzzer'); return; }
                U.sound('decision');
                ew.deactivate();
                this._itemWindow.activate();
                this._itemWindow.select(0);
            }
        },
        rrChangeActor(step) {
            const n = $gameParty.members().length;
            const index = ((this._rrActorIndex + step) % n + n) % n;
            goto(Scene_ThrallEquip, index, this._equipWindow.index());
        },
        rrUpdateItemSelection() {
            const iw = this._itemWindow;
            if (Input.isTriggered('cancel')) {
                U.sound('cancel');
                this._equipWindow.activate();
                iw.deactivate();
                iw.select(-1);
                return;
            }
            if (Input.isTriggered('rgssX')) { this.rrToggleCompare(); return; }
            if (Input.isTriggered('shift')) {
                const item = iw.item();
                if (item) { this.rrToggleFavorite(item); iw.refresh(); U.sound('decision'); }
                return;
            }
            if (!Input.isTriggered('ok')) return;
            const actor = this._rrActor, slot = this._equipWindow.index(), item = iw.item();
            let ok = true;
            if (item) ok = U.levelReq(item) <= actor.level;
            else {
                // Taking gear off needs room in the pack (variables 6 for armour, 5 for weapons).
                let y = 0;
                if (slot > 0) { for (let i = 1; i <= 16 + v(6); i++) if ($dataArmors[i] && $gameParty.numItems($dataArmors[i]) > 0) y++; ok = y < v(6); }
                else { for (let i = 1; i <= 4 + v(5); i++) if ($dataWeapons[i] && $gameParty.numItems($dataWeapons[i]) > 0) y++; ok = y < v(5); }
            }
            if (!ok) { U.sound('buzzer'); return; }
            U.sound('equip');
            actor.changeEquip(slot, U.mz(item));
            if (actor.hp > actor.mhp) actor.setHp(actor.mhp);
            this._equipWindow.activate();
            iw.deactivate();
            iw.select(-1);
            this._equipWindow.refresh();
            this._statusWindow.refresh();
            this._rrStatusKey = null;
            const halfMp = actor.armors().filter(a => a && U.get(a, 'half_mp_cost')).length;
            if (v(170) < halfMp) U.setV(170, halfMp);
            const fast = $gameParty.members().filter(m => m.weapons()[0] && U.get(m.weapons()[0], 'fast_attack')).length;
            if (v(166) < fast) U.setV(166, fast);
            for (const w of this._itemWindows) w.refresh();
        }
    }));

    //=========================================================================
    // Scene_Status (082): no menu command reaches it in Thrall
    //=========================================================================
    define('Scene_ThrallStatus', Scene_MenuBase, Object.assign({}, sceneBase, {
        prepare(actorIndex = 0) { this._rrActorIndex = actorIndex; },
        create() {
            Scene_MenuBase.prototype.create.call(this);
            this._rrActorIndex = this._rrActorIndex || 0;
            const actor = $gameParty.members()[this._rrActorIndex] || $gameParty.leader();
            this._statusWindow = new Window_ThrallStatus(actor);
            this.addWindow(this._statusWindow);
        },
        update() {
            Scene_MenuBase.prototype.update.call(this);
            if (!this.rrIdle()) return;
            const n = $gameParty.members().length;
            if (Input.isTriggered('cancel')) { U.sound('cancel'); U.returnToMenu('status'); }
            else if (Input.isTriggered('pagedown')) { U.sound('cursor'); goto(Scene_ThrallStatus, (this._rrActorIndex + 1) % n); }
            else if (Input.isTriggered('pageup')) { U.sound('cursor'); goto(Scene_ThrallStatus, (this._rrActorIndex + n - 1) % n); }
        }
    }));

    //=========================================================================
    // Scene_File (083): accounts, the save's database, the locker
    //=========================================================================
    const KINDS = { weapons: () => $dataWeapons, armors: () => $dataArmors, items: () => $dataItems };
    const VX_KIND = { weapons: 'weapon', armors: 'armor', items: 'item' };
    const pristine = { weapons: null, armors: null, items: null };
    const pristineVx = { weapons: null, armors: null, items: null };
    /** The record's VX fields of its own (the battle port's record, or the one read from the database). */
    const vxOwn = (kind, id) => {
        const V = window.RRThrallVx;
        const r = V && V[VX_KIND[kind]] ? V[VX_KIND[kind]](id) : U.fallbackRecords.get(VX_KIND[kind] + ':' + id);
        if (!r) return null;
        const out = {};
        for (const k of Object.keys(r)) if (k !== 'kind' && k !== 'id') out[k] = r[k];
        return out;
    };
    const vxRecord = (kind, id, create) => {
        const V = window.RRThrallVx;
        if (V && V[VX_KIND[kind]]) { const r = V[VX_KIND[kind]](id); if (r) return r; }
        const d = KINDS[kind]()[id];
        return create && d ? U.rec(d) : U.fallbackRecords.get(VX_KIND[kind] + ':' + id) || null;
    };
    // A record takes the saved or shipped fields; what other ports keep on it besides stays.
    const assignInPlace = (target, source) => Object.assign(target, JSON.parse(JSON.stringify(source)));
    /** The shipped records, as the database stands once every port has read it (before the title). */
    U.capturePristine = () => {
        for (const kind of Object.keys(KINDS)) {
            const list = KINDS[kind]();
            if (list && !pristine[kind]) pristine[kind] = list.map(d => (d ? JSON.stringify(d) : null));
        }
    };
    const _bootStart = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        U.capturePristine();
        _bootStart.call(this);
    };
    const capturePristineVx = () => {
        if (!window.RRThrallVx) return;
        for (const kind of Object.keys(KINDS)) {
            const list = KINDS[kind]() || [];
            pristineVx[kind] = list.map((d, id) => { const o = d ? vxOwn(kind, id) : null; return o ? JSON.stringify(o) : null; });
        }
    };
    /** RGSS reads its database again at the title: back to the shipped records, the locker from the last save. */
    U.reloadDatabase = function() {
        U.capturePristine();
        for (const kind of Object.keys(KINDS)) {
            const list = KINDS[kind](), base = pristine[kind];
            if (!list || !base) continue;
            base.forEach((p, id) => { if (p && list[id] && JSON.stringify(list[id]) !== p) assignInPlace(list[id], JSON.parse(p)); });
        }
        U.fallbackRecords.clear();
        const V = window.RRThrallVx;
        if (V && V.buildDatabase && $dataStates) V.buildDatabase();
        if (V && !pristineVx.weapons) capturePristineVx();
        U.applyLocker();
    };
    const V0 = window.RRThrallVx;
    if (V0 && Array.isArray(V0.databaseHooks)) V0.databaseHooks.push(() => { if (!pristineVx.weapons) capturePristineVx(); U.applyLocker(); });
    const _titleStart = Scene_Title.prototype.start;
    Scene_Title.prototype.start = function() {
        U.reloadDatabase();
        _titleStart.call(this);
    };

    // ---- the locker (Validation.rvdata) ----------------------------------------
    /** A VX record's fields written over an MZ record, as the importer converts them. */
    U.vxToMz = (kind, vx, d) => {
        if (!d || !vx) return;
        if ('name' in vx) d.name = String(vx.name);
        if ('icon_index' in vx) d.iconIndex = Number(vx.icon_index) || 0;
        if ('description' in vx) d.description = String(vx.description);
        if ('note' in vx) d.note = String(vx.note);
        if ('price' in vx) d.price = Number(vx.price) || 0;
        if (kind === 'items') return;
        const p = d.params || (d.params = [0, 0, 0, 0, 0, 0, 0, 0]);
        if ('atk' in vx) p[2] = vx.atk;
        if ('def' in vx) p[3] = vx.def;
        if ('spi' in vx) { p[4] = vx.spi; p[5] = vx.spi; }
        if ('agi' in vx) p[6] = vx.agi;
        const traits = [];
        if (kind === 'weapons') {
            for (const id of vx.element_set || []) traits.push({ code: 31, dataId: id, value: 0 });
            for (const id of vx.state_set || []) traits.push({ code: 32, dataId: id, value: 0.5 });
            traits.push({ code: 22, dataId: 0, value: ((Number(vx.hit) || 95) - 95) / 100 });
            if (vx.critical_bonus) traits.push({ code: 22, dataId: 2, value: 0.04 });
            if (vx.fast_attack) traits.push({ code: 33, dataId: 0, value: 2000 });
            if (vx.dual_attack) traits.push({ code: 34, dataId: 0, value: 1 });
            if (vx.two_handed) traits.push({ code: 54, dataId: 2, value: 1 });
            if ('animation_id' in vx) d.animationId = vx.animation_id;
        } else {
            for (const id of vx.element_set || []) traits.push({ code: 11, dataId: id, value: 0.5 });
            for (const id of vx.state_set || []) traits.push({ code: 14, dataId: id, value: 1 });
            if (vx.eva) traits.push({ code: 22, dataId: 1, value: vx.eva / 100 });
            if (vx.prevent_critical) traits.push({ code: 22, dataId: 3, value: 1 });
            if (vx.half_mp_cost) traits.push({ code: 23, dataId: 4, value: 0.5 });
            if (vx.double_exp_gain) traits.push({ code: 23, dataId: 9, value: 2 });
            if (vx.auto_hp_recover) traits.push({ code: 22, dataId: 7, value: 0.05 });
            if ('kind' in vx) d.etypeId = [2, 3, 4, 5][vx.kind] ?? d.etypeId;
        }
        d.traits = traits;
    };
    const LOCKER = { weapons: [524, 525, 526], armors: [488, 489, 490] };
    const VX_FIELDS = { weapons: ['atk', 'def', 'spi', 'agi', 'hit', 'animation_id', 'two_handed', 'fast_attack', 'dual_attack', 'critical_bonus', 'element_set', 'state_set'],
        armors: ['kind', 'atk', 'def', 'spi', 'agi', 'eva', 'prevent_critical', 'half_mp_cost', 'double_exp_gain', 'auto_hp_recover', 'element_set', 'state_set'] };
    /** A record as the save keeps it: the MZ record and its VX fields. */
    const snapshot = (kind, id) => {
        const d = KINDS[kind]()[id];
        return d ? { mz: JSON.parse(JSON.stringify(d)), vx: vxOwn(kind, id) } : null;
    };
    const restore = (kind, id, snap) => {
        const list = KINDS[kind]();
        if (!snap || !list || !list[id]) return;
        if (snap.mz) { assignInPlace(list[id], snap.mz); list[id].id = id; }
        else if (snap.vxOnly) U.vxToMz(kind, snap.vxOnly, list[id]);
        U.fallbackRecords.delete(VX_KIND[kind] + ':' + id);
        const vx = snap.vx || (snap.vxOnly ? Object.fromEntries(VX_FIELDS[kind].filter(f => f in snap.vxOnly).map(f => [f, JSON.parse(JSON.stringify(snap.vxOnly[f]))])) : null);
        const r = vxRecord(kind, id, true);
        if (r && vx) Object.assign(r, JSON.parse(JSON.stringify(vx)));
    };
    /** ConfigManager keeps Validation.rvdata: the four accounts' stamps and the locker. */
    const validation = () => {
        if (!ConfigManager.rrThrallValidation) {
            const shipped = P.locker || {};
            const vxOnly = (kind) => (shipped[kind] || []).map(r => (r ? { vxOnly: r } : null));
            ConfigManager.rrThrallValidation = { times: [0, 0, 0, 0], weapons: vxOnly('weapons'), armors: vxOnly('armors') };
        }
        return ConfigManager.rrThrallValidation;
    };
    U.validation = validation;
    U.applyLocker = () => {
        if (!$dataWeapons || !$dataArmors) return;
        const valid = validation();
        for (const kind of ['weapons', 'armors']) LOCKER[kind].forEach((id, i) => { if (valid[kind][i]) restore(kind, id, valid[kind][i]); });
    };
    const _makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const data = _makeData.call(this);
        if (this.rrThrallValidation) data.rrThrallValidation = this.rrThrallValidation;
        return data;
    };
    const _applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(data) {
        _applyData.call(this, data);
        if (data && data.rrThrallValidation && typeof data.rrThrallValidation === 'object') this.rrThrallValidation = data.rrThrallValidation;
    };
    /** do_save's validation: the account's stamp (Time.at(0), as the game wrote it) and the locker as it is now. */
    U.writeValidation = (index) => {
        const valid = validation();
        valid.times[index] = 0;
        $gameSystem._rrTimeCheck = 0;
        for (const kind of ['weapons', 'armors']) LOCKER[kind].forEach((id, i) => { valid[kind][i] = snapshot(kind, id); });
        ConfigManager.save();
    };

    // ---- the save's database: what the game changed in it ------------------------
    const PATCH = { weapons: [[147, 523], [527, 548]], armors: [[162, 487], [491, 496]], items: [[141, 198]] };
    const _makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = _makeSaveContents.call(this);
        U.capturePristine();
        const db = {};
        for (const kind of Object.keys(KINDS)) {
            const list = KINDS[kind]() || [];
            db[kind] = [];
            list.forEach((d, id) => {
                if (!d) return;
                const mz = JSON.stringify(d), vx = vxOwn(kind, id);
                const vxText = vx ? JSON.stringify(vx) : null;
                const mzChanged = pristine[kind] && pristine[kind][id] !== mz;
                const vxChanged = vxText && (pristineVx[kind] ? pristineVx[kind][id] !== vxText : !window.RRThrallVx);
                if (mzChanged || vxChanged) db[kind].push([id, mzChanged ? JSON.parse(mz) : null, vxChanged ? vx : null]);
            });
        }
        contents.rrThrallMenu = { db, lastFileIndex: $gameTemp._rrLastFileIndex };
        return contents;
    };
    const _makeSavefileInfo = DataManager.makeSavefileInfo;
    DataManager.makeSavefileInfo = function() {
        const info = _makeSavefileInfo.call(this);
        info.rrThrall = {
            characters: $gameParty.members().map(a => [a.characterName(), a.characterIndex(), a.faceName(), a.faceIndex(), a.level]),
            frameCount: Graphics.frameCount
        };
        return info;
    };
    /** Loading: the save's database over the shipped one (patched ranges stay shipped when the game was updated), then the locker. */
    U.restoreDatabase = (db, updated) => {
        U.reloadDatabaseOnly();
        const patched = (kind, id) => updated && (PATCH[kind] || []).some(([a, b]) => id >= a && id <= b);
        for (const kind of Object.keys(KINDS)) {
            for (const [id, mz, vx] of (db && db[kind]) || []) {
                if (patched(kind, id)) continue;
                const list = KINDS[kind]();
                if (!list || !list[id]) continue;
                if (mz) { assignInPlace(list[id], mz); U.fallbackRecords.delete(VX_KIND[kind] + ':' + id); }
                const r = vxRecord(kind, id, true);
                if (r && vx) Object.assign(r, vx);
            }
        }
        U.applyLocker();
    };
    U.reloadDatabaseOnly = () => {
        const apply = U.applyLocker;
        U.applyLocker = () => {};
        try { U.reloadDatabase(); } finally { U.applyLocker = apply; }
    };
    let loading = false, loadingIndex = 0;
    const _extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        const fresh = { map: $gameMap, player: $gamePlayer, screen: $gameScreen };
        _extractSaveContents.call(this, contents);
        const own = contents && contents.rrThrallMenu;
        if (!own) return;
        U.restoreDatabase(own.db, $gameSystem.versionId() !== $dataSystem.versionId);
        $gameSystem._rrValidator = validation().times[loadingIndex] ?? 0;
        if (loading) {
            // The map, the player and the screen were never saved: a loaded game starts on the start map, the player hidden.
            $gameMap = fresh.map; $gamePlayer = fresh.player; $gameScreen = fresh.screen;
        }
    };

    define('Scene_ThrallFile', Scene_MenuBase, Object.assign({}, sceneBase, {
        initialize() {
            Scene_MenuBase.prototype.initialize.call(this);
            this.prepare(...this.rrDefaults());
        },
        rrDefaults() { return [true, false, true, false]; },
        /** Scene_File.new(saving, from_title, from_event, erasing). */
        prepare(saving, fromTitle, fromEvent, erasing = false) {
            Object.assign(this, { _rrSaving: !!saving, _rrFromTitle: !!fromTitle, _rrFromEvent: !!fromEvent, _rrErasing: !!erasing });
        },
        create() {
            Scene_MenuBase.prototype.create.call(this);
            this._helpWindow = new Window_ThrallHelp();
            this.addWindow(this._helpWindow);
            this._savefileWindows = [0, 1, 2, 3].map(i => { const w = new Window_ThrallSaveFile(i); this.addWindow(w); return w; });
            this._rrItemMax = 4;
            if (this._rrSaving) {
                const last = $gameTemp._rrLastFileIndex;
                this._rrIndex = last !== undefined && last !== null ? last : Math.max(0, this._savefileWindows.findIndex(w => !w.fileExist));
                let text = TextManager.saveMessage;
                if (!s(4)) text += ' CAUTION: Items and Gold will be lost!';
                this._helpWindow.rrSetText(text);
            } else if (this._rrErasing) {
                this._rrIndex = this.rrLatestFileIndex();
                this._helpWindow.rrSetText('Erase which account?');
            } else {
                this._rrIndex = this.rrLatestFileIndex();
                this._helpWindow.rrSetText(TextManager.loadMessage);
            }
            this._savefileWindows[this._rrIndex].rrSetSelected(true);
        },
        rrLatestFileIndex() {
            let index = 0, latest = 0;
            this._savefileWindows.forEach((w, i) => { if (w.timeStamp > latest) { latest = w.timeStamp; index = i; } });
            return index;
        },
        rrReturnScene() {
            if (this._rrFromTitle) U.toTitle();
            else if (this._rrFromEvent) U.toMap();
            else if (menuIndex().save !== undefined) goto(Scene_ThrallMenu, menuIndex().save);
            else U.toMap();
        },
        update() {
            Scene_MenuBase.prototype.update.call(this);
            if (this._rrLoaded) { if (--this._rrHold <= 0) { this._rrLoaded = false; SceneManager.goto(Scene_Map); } return; }
            if (!this.rrIdle() || this._rrBusy) return;
            if (Input.isTriggered('ok')) this.rrDetermineSavefile();
            else if (Input.isTriggered('cancel')) { U.sound('cancel'); this.rrReturnScene(); }
            else {
                const last = this._rrIndex;
                if (Input.isRepeated('down')) this.rrCursorDown(Input.isTriggered('down'));
                if (Input.isRepeated('up')) this.rrCursorUp(Input.isTriggered('up'));
                if (this._rrIndex !== last) {
                    U.sound('cursor');
                    this._savefileWindows[last].rrSetSelected(false);
                    this._savefileWindows[this._rrIndex].rrSetSelected(true);
                }
            }
        },
        // Saving keeps to the account: the cursor does not move.
        rrCursorDown(wrap) { if (!this._rrSaving && (this._rrIndex < this._rrItemMax - 1 || wrap)) this._rrIndex = (this._rrIndex + 1) % this._rrItemMax; },
        rrCursorUp(wrap) { if (!this._rrSaving && (this._rrIndex > 0 || wrap)) this._rrIndex = (this._rrIndex - 1 + this._rrItemMax) % this._rrItemMax; },
        rrDetermineSavefile() {
            if (this._rrSaving) { U.sound('save'); this.rrDoSave(); }
            else if (this._savefileWindows[this._rrIndex].fileExist) {
                if (this._rrErasing) { U.sound('enemyAttack'); this.rrDoErase(); }
                else { U.sound('load'); this.rrDoLoad(); }
            } else { U.sound('buzzer'); return; }
            $gameTemp._rrLastFileIndex = this._rrIndex;
        },
        rrDoSave() {
            this._rrBusy = true;
            U.saveAccount(this._rrIndex).then(() => { this._rrBusy = false; this.rrReturnScene(); }).catch(() => { this._rrBusy = false; U.sound('buzzer'); });
        },
        rrDoLoad() {
            this._rrBusy = true;
            loading = true;
            loadingIndex = this._rrIndex;
            const index = this._rrIndex;
            DataManager.loadGame(index + 1).then(() => {
                loading = false;
                $gameTemp._rrLastFileIndex = index;
                if (!s(4)) $gameTimer.stop();
                $gamePlayer.reserveTransfer($dataSystem.startMapId, $dataSystem.startX, $dataSystem.startY, 2, 0);
                $gamePlayer.setTransparent(true);
                AudioManager.fadeOutBgm(1.5);
                this.startFadeOut(60, false);
                this._rrHold = 100;
                this._rrLoaded = true;
                this._rrLoadSuccess = true;
            }).catch((error) => { loading = false; this._rrBusy = false; console.warn('RR_ThrallMenu: load failed', error); U.sound('buzzer'); });
        },
        /** Game_System#onAfterLoad (the play time, the keys), without the saved music: the start map plays its own. */
        terminate() {
            Scene_MenuBase.prototype.terminate.call(this);
            if (!this._rrLoadSuccess) return;
            const { playBgm, playBgs } = AudioManager;
            AudioManager.playBgm = AudioManager.playBgs = function() {};
            try { $gameSystem.onAfterLoad(); } finally { AudioManager.playBgm = playBgm; AudioManager.playBgs = playBgs; }
        },
        rrDoErase() {
            const id = this._rrIndex + 1;
            this._rrBusy = true;
            Promise.resolve(StorageManager.remove(DataManager.makeSavename(id))).catch(() => {}).then(() => {
                delete DataManager._globalInfo[id];
                DataManager.saveGlobalInfo();
                this._rrBusy = false;
                this.rrReturnScene();
            });
        }
    }));
    /** do_save into account `index` (0–3): the validation file, then the game. */
    U.saveAccount = (index) => {
        U.writeValidation(index);
        $gameSystem.onBeforeSave();
        return DataManager.saveGame(index + 1);
    };
    /** Auto_Save.new: the account in use, else the first free one; nothing when there is neither. */
    DataManager.rrThrallAutoSave = function() {
        let index = $gameTemp._rrLastFileIndex;
        if (index === undefined || index === null) {
            index = [0, 1, 2, 3].find(i => !DataManager.savefileExists(i + 1));
            if (index === undefined) return Promise.resolve(false);
            $gameTemp._rrLastFileIndex = index;
        }
        return U.saveAccount(index).then(() => true).catch(() => false);
    };
    define('Scene_ThrallSave', Scene_ThrallFile, { rrDefaults() { return [true, false, true, false]; } });
    define('Scene_ThrallLoad', Scene_ThrallFile, { rrDefaults() { return [false, true, false, false]; } });
    define('Scene_ThrallErase', Scene_ThrallFile, { rrDefaults() { return [false, true, false, true]; } });
    // After a load the map fades in from black.
    const _needsFadeIn = Scene_Map.prototype.needsFadeIn;
    Scene_Map.prototype.needsFadeIn = function() {
        return _needsFadeIn.call(this) || SceneManager.isPreviousScene(Scene_ThrallLoad) || SceneManager.isPreviousScene(Scene_ThrallFile);
    };

    U.redirectScene('Scene_Menu', () => Scene_ThrallMenu);
    U.redirectScene('Scene_Item', () => Scene_ThrallItem);
    U.redirectScene('Scene_Equip', () => Scene_ThrallEquip);
    U.redirectScene('Scene_Status', () => Scene_ThrallStatus);
    U.redirectScene('Scene_Save', () => Scene_ThrallSave);
    U.redirectScene('Scene_Load', () => Scene_ThrallLoad);

    //=========================================================================
    // Scene_Map's menu keys (129): menu or cancel, compare for the Pain menu, sort for the Guide
    //=========================================================================
    Scene_Map.prototype.isMenuCalled = function() {
        return Input.isTriggered('rgssZ') || Input.isTriggered('menu');
    };
    const _updateCallMenu = Scene_Map.prototype.updateCallMenu;
    Scene_Map.prototype.updateCallMenu = function() {
        if (this.isMenuEnabled()) {
            if (Input.isTriggered('rgssX') && !s(65)) { U.setS(66, true); this._rrNextScene = 'heat'; }
            if (Input.isTriggered('rgssY')) this._rrNextScene = 'guide';
        } else this._rrNextScene = null;
        _updateCallMenu.call(this);
        if (this._rrNextScene && !this.menuCalling && !$gamePlayer.isMoving() && !SceneManager.isSceneChanging()) {
            const S = this._rrNextScene === 'heat' ? sceneOf('Scene_ThrallHeat', 'Scene_RRThrallHeat', 'Scene_Heat') : sceneOf('Scene_ThrallGuide', 'Scene_RRThrallGuide', 'Scene_Guide');
            this._rrNextScene = null;
            if (S) { U.sound('decision'); SceneManager.push(S); }
        }
    };
})();
