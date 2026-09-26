/*:
 * @target MZ
 * @plugindesc Weapon and Armor Durability, Equip Repair and Armthrift (VX Ace), for imported games
 * @author Selchar (credit Tsukihime); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_SelcharDurability.js
 *
 * Weapon and armor copies (RR_HimeInstanceItems) that use durability show it
 * after their name ("Wyvern [+1] [100%]") and sell for less as it wears.
 *
 * Weapons wear each time a skill (Attack included) the actor uses hits a
 * target: 1, or <durability cost: x> on the skill, plus the weapon's
 * <skill durability mod id: x>. Armors wear when a skill hits the actor:
 * 1, or <durability damage: x> on the skill, at the chance the game set plus
 * the armor's <elem dura rate element: x> for the skill's element. At 0 the
 * piece comes off ("Jay's Wyvern broke!"): a weapon stays in the bag, broken,
 * or turns into <broken weapon change: id>; an armor is thrown away or turns
 * into <broken armor change: id>, as the game set. A piece at 0 cannot be
 * worn. <set durability> turns durability the other way from the default.
 *
 * Armthrift: <armthrift rate: x> on the actor, class, equipment, states or
 * any skill the actor knows adds up to the chance an attack costs the weapon
 * nothing.
 *
 * The repair screen lists the party's pieces that use durability; choosing
 * one pays the price it lost (its whole price when broken) and restores it.
 *
 * Wear counts per target: a skill that hits three enemies wears the weapon
 * three times. Skills used from the menu wear too (a healing skill on an
 * ally included). Both are the original's rules and are kept. An armor that
 * breaks outside battle, where the original stopped with an error, breaks
 * without a line of text.
 *
 * Battle Symphony's DAMAGE CHANGE DURABILITY SCALE (Yami Engine add-on) is
 * battler.rrDurabilityDamageRatio(ratio): in the game it came out 0 whenever
 * the battler held a weapon using durability, since the game's Array#sum
 * (Victor's Basic Module) ignores the block the add-on passed. Kept.
 *
 * Script calls:
 *   SceneManager.push(Scene_RRRepairEquip)        (SceneManager.call(Scene_RepairEquip))
 *   RRSelcharDurability.repair(item), .canRepair(item), .repairPrice(item),
 *   .useDurability(item), .maxDurability(item); item.durability
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param weapons
 * @text Weapon durability
 * @type boolean
 * @default true
 *
 * @param weaponDefault
 * @text Weapon max durability
 * @type number
 * @default 100
 *
 * @param weaponCost
 * @text Wear per skill
 * @type number
 * @default 1
 *
 * @param weaponDestroy
 * @text Broken weapons vanish
 * @type boolean
 * @default false
 *
 * @param weaponSetting
 * @text Weapons use durability by default
 * @type boolean
 * @default true
 *
 * @param weaponSuffix
 * @text Weapon durability after the name
 * @default  [%s%%]
 *
 * @param armors
 * @text Armor durability
 * @type boolean
 * @default true
 *
 * @param armorDefault
 * @text Armor max durability
 * @type number
 * @default 100
 *
 * @param armorDamage
 * @text Wear per hit
 * @type number
 * @default 1
 *
 * @param armorRate
 * @text Chance a hit wears armor
 * @type number
 * @decimals 2
 * @default 1
 *
 * @param armorDestroy
 * @text Broken armors vanish
 * @type boolean
 * @default true
 *
 * @param armorSetting
 * @text Armors use durability by default
 * @type boolean
 * @default false
 *
 * @param armorSuffix
 * @text Armor durability after the name
 * @default  [%s%%]
 *
 * @param repairScene
 * @text Repair screen
 * @type boolean
 * @default true
 *
 * @param repairText
 * @default Repair
 *
 * @param cancelText
 * @default Cancel
 *
 * @param noItemText
 * @default Select item that needs repairs.
 *
 * @param priceText
 * @default Repair Cost:
 *
 * @param fullText
 * @default Max Durability
 *
 * @param repairSe
 * @text Repair sound
 * @default {"name":"Hammer","volume":100,"pitch":100}
 *
 * @param repairPriceMod
 * @text Repair price rate
 * @type number
 * @decimals 2
 * @default 1
 *
 * @param armthrift
 * @type boolean
 * @default false
 */
(() => {
    'use strict';
    const I = window.RRInstanceItems;
    if (!I) return;
    const params = PluginManager.parameters('RR_SelcharDurability');
    const json = (text, fallback) => { try { const v = JSON.parse(text); return v === null || v === undefined ? fallback : v; } catch (_) { return fallback; } };
    const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
    const bool = (v, d) => (v === undefined || v === '' ? d : String(v) === 'true');
    const CFG = {
        weapon: {
            on: bool(params.weapons, true), max: num(params.weaponDefault, 100), cost: num(params.weaponCost, 1),
            destroy: bool(params.weaponDestroy, false), setting: bool(params.weaponSetting, true), suffix: params.weaponSuffix ?? ' [%s%%]'
        },
        armor: {
            on: bool(params.armors, true), max: num(params.armorDefault, 100), damage: num(params.armorDamage, 1), rate: num(params.armorRate, 1),
            destroy: bool(params.armorDestroy, true), setting: bool(params.armorSetting, false), suffix: params.armorSuffix ?? ' [%s%%]'
        }
    };
    const R = {
        on: bool(params.repairScene, true), text: params.repairText ?? 'Repair', cancel: params.cancelText ?? 'Cancel',
        noItem: params.noItemText ?? 'Select item that needs repairs.', price: params.priceText ?? 'Repair Cost: ', full: params.fullText ?? 'Max Durability',
        se: json(params.repairSe, { name: 'Hammer', volume: 100, pitch: 100 }), mod: num(params.repairPriceMod, 1)
    };
    const ARMTHRIFT = bool(params.armthrift, false);

    const toI = (s) => { const m = /^\s*[-+]?\d+/.exec(String(s)); return m ? parseInt(m[0], 10) : 0; };
    const toF = (s) => { const m = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(String(s)); return m ? parseFloat(m[0]) : 0; };
    const format = (text, ...args) => String(text).replace(/%(%|s|d)/g, (all, c) => (c === '%' ? '%' : String(args.shift())));
    const note = (o) => String((o && o.note) || '');
    const kindOf = (o) => I.kindOf(o);
    /** The durability rules of a weapon or armor, when the game carried the script for its kind. */
    const cfgOf = (o) => { const c = CFG[kindOf(o)]; return c && c.on ? c : null; };

    const D = {
        /** Read once and kept on the piece, as the original kept it. */
        useDurability(o) {
            const c = cfgOf(o);
            if (!c) return false;
            if (o.useDurability === undefined || o.useDurability === null) o.useDurability = /<set[-_ ]?durability>/i.test(note(o)) ? !c.setting : c.setting;
            return o.useDurability;
        },
        maxDurability(o) {
            if (o.maxDurability === undefined || o.maxDurability === null) {
                const m = /<max[-_ ]?durability:\s*(.*)\s*>/i.exec(note(o));
                o.maxDurability = m ? toI(m[1]) : cfgOf(o).max;
            }
            return o.maxDurability;
        },
        /** The id a broken piece turns into, or false. */
        brokenChange(o) {
            const re = kindOf(o) === 'weapon' ? /<broken[-_ ]?weapon[-_ ]?change:\s*(.*)\s*>/i : /<broken[-_ ]?armor[-_ ]?change:\s*(.*)\s*>/i;
            const m = re.exec(note(o));
            return m ? toI(m[1]) : false;
        },
        skillDurabilityMod(o, skillId) {
            const m = new RegExp('<skill[-_ ]?durability[-_ ]?mod[-_ ]?' + skillId + ':\\s*(.*)\\s*>', 'i').exec(note(o));
            return m ? toI(m[1]) : 0;
        },
        // The element's name goes into the pattern as written, as the original's did.
        elemDuraRate(o, elementId) {
            const name = $dataSystem.elements[elementId];
            if (name === undefined || name === null) return 0;
            let m = null;
            try { m = new RegExp('<elem[-_ ]?dura[-_ ]?rate[-_ ]?' + name + ':\\s*(.*)\\s*>', 'i').exec(note(o)); } catch (_) { m = null; }
            return m ? toF(m[1]) : 0;
        },
        weaponCost(skill) { const m = /<durability[-_ ]?cost:\s*(.*)\s*>/i.exec(note(skill)); return m ? toI(m[1]) : CFG.weapon.cost; },
        armorDamage(skill) { const m = /<durability[-_ ]?damage:\s*(.*)\s*>/i.exec(note(skill)); return m ? toI(m[1]) : CFG.armor.damage; },
        armthriftRate(obj) { const m = /<armthrift[-_ ]?rate:\s*(.*)\s*>/i.exec(note(obj)); return m ? toF(m[1]) : 0; },
        repair(o) {
            o.durability = D.maxDurability(o);
            I.refreshAttr(o, 'name');
            I.refreshAttr(o, 'price');
        },
        canRepair(o) { return o.durability < D.maxDurability(o); },
        repairPrice(o) {
            const base = o.durability === 0 ? o.nonDurabilityPrice : o.nonDurabilityPrice - o.price;
            return R.on ? Math.trunc(base * R.mod) : base;
        },
        /** Wear a piece by an amount; at 0 it breaks off the actor wearing it. */
        wear(o, amount, actor) {
            o.durability = Math.max(o.durability - amount, 0);
            I.refreshAttr(o, 'name');
            I.refreshAttr(o, 'price');
            if (o.durability === 0) D.breakOff(o, actor);
        },
        breakOff(o, actor) {
            const c = cfgOf(o), equips = actor.equips();
            for (let i = 0; i < equips.length; i++) {
                if (equips[i] !== o) continue;
                actor.changeEquip(i, null);
                if (c.destroy) $gameParty.loseItem(o, 1);
                else {
                    const into = D.brokenChange(o);
                    if (into !== false) {
                        $gameParty.loseItem(o, 1);
                        const table = kindOf(o) === 'weapon' ? $dataWeapons : $dataArmors;
                        $gameParty.gainItem(I.getInstance(table[into]), 1);
                    }
                }
                D.brokenText(o, actor);
                break;
            }
        },
        brokenText(o, actor) {
            const text = format("%s's %s broke!", actor.name(), o.nonDurabilityName);
            if (kindOf(o) === 'weapon') {
                AudioManager.playSe({ name: 'Break', volume: 100, pitch: 100, pan: 0 });
                $gameMessage.add(text);
            } else {
                const log = SceneManager._scene && SceneManager._scene._logWindow;
                if (log) log.addText(text);
            }
        }
    };
    window.RRSelcharDurability = D;
    // A copy that uses durability carries it; a database entry never does.
    const worn = (o) => !!o && D.useDurability(o) && typeof o.durability === 'number';

    for (const kind of ['weapon', 'armor']) {
        if (!CFG[kind].on) continue;
        I.makers.name.push((o, name) => {
            if (kindOf(o) !== kind) return name;
            o.nonDurabilityName = name;
            return D.useDurability(o) ? name + format(CFG[kind].suffix, o.durability, o.maxDurability) : name;
        });
        I.makers.price.push((o, price) => {
            if (kindOf(o) !== kind) return price;
            o.nonDurabilityPrice = price;
            if (!D.useDurability(o)) return price;
            if (o.durability === 0 && o.nonDurabilityPrice !== 0) return 2;
            return Math.trunc(price * (Number(o.durability) || 0) / D.maxDurability(o));
        });
        const setup = kind === 'weapon' ? 'setupWeaponInstance' : 'setupArmorInstance';
        const _setup = I[setup];
        I[setup] = function(obj) {
            _setup.call(this, obj);
            if (D.useDurability(obj)) D.repair(obj);
        };
    }

    //-------------------------------------------------------------------------
    // Battle: a skill that hits wears the user's weapons and the target's armor
    //-------------------------------------------------------------------------
    const B = Game_Battler.prototype;
    B.rrArmthrift = function() {
        if (!ARMTHRIFT || !this.isActor()) return false;
        let chance = 0;
        for (const obj of this.traitObjects()) if (obj) chance += D.armthriftRate(obj);
        for (const skill of this.skills()) if (skill) chance += D.armthriftRate(skill);
        return Math.random() <= chance;
    };
    B.rrWeaponDurabilityCost = function(weapon, skill) {
        if (this.rrArmthrift()) return 0;
        return Math.max(D.weaponCost(skill) + D.skillDurabilityMod(weapon, skill.id), 0);
    };
    B.rrProcessWeaponDurability = function(skill) {
        if (!CFG.weapon.on || !DataManager.isSkill(skill)) return;
        for (const weapon of this.weapons()) if (worn(weapon)) D.wear(weapon, this.rrWeaponDurabilityCost(weapon, skill), this);
    };
    B.rrProcessArmorDurability = function(skill) {
        if (!CFG.armor.on || !DataManager.isSkill(skill)) return;
        const element = skill.damage.elementId === -1 ? 0 : skill.damage.elementId;
        for (const armor of this.armors()) {
            if (!worn(armor)) continue;
            if (!(Math.random() <= CFG.armor.rate + D.elemDuraRate(armor, element))) continue;
            D.wear(armor, Math.max(D.armorDamage(skill), 0), this);
        }
    };
    /** Battle Symphony's DAMAGE CHANGE DURABILITY SCALE: the ratio scaled by the average durability, as the game computed it. */
    B.rrDurabilityDamageRatio = function(ratio) {
        const weapons = (this.weapons ? this.weapons() : []).filter(w => w && D.useDurability(w));
        const average = weapons.length ? 0 : 100;
        return Math.trunc(Number(ratio) * (average / 100));
    };
    const _executeDamage = Game_Action.prototype.executeDamage;
    Game_Action.prototype.executeDamage = function(target, value) {
        const user = this.subject(), item = this.item();
        if (user && user.isActor()) user.rrProcessWeaponDurability(item);
        if (target && target.isActor()) target.rrProcessArmorDurability(item);
        _executeDamage.call(this, target, value);
    };

    // A copy at 0 durability cannot be worn.
    const _canEquip = Game_Actor.prototype.canEquip;
    Game_Actor.prototype.canEquip = function(item) {
        if (item && kindOf(item) && !I.isTemplate(item) && cfgOf(item) && D.useDurability(item) && item.durability === 0) return false;
        return _canEquip.call(this, item);
    };

    if (!R.on) return;

    //-------------------------------------------------------------------------
    // Repair screen
    //-------------------------------------------------------------------------
    const subclass = (base) => {
        const C = function() { this.initialize(...arguments); };
        C.prototype = Object.create(base.prototype);
        C.prototype.constructor = C;
        return C;
    };
    const fitting = (lines) => Window_Base.prototype.fittingHeight.call(Window_Base.prototype, lines);

    const Window_RREquipRepair = subclass(Window_ItemList);
    Object.assign(Window_RREquipRepair.prototype, {
        includes(item) { return !!item && kindOf(item) !== 'item' && D.useDurability(item); },
        isEnabled(item) { return !!item && ['weapon', 'armor'].includes(kindOf(item)) && D.canRepair(item) && $gameParty.gold() >= D.repairPrice(item); },
        // Activating the list shows the help for the row under the cursor.
        activate() {
            Window_ItemList.prototype.activate.call(this);
            this.callUpdateHelp();
        },
        updateHelp() {
            const item = this.item();
            if (!item) this._helpWindow.setText(R.noItem);
            else if (D.repairPrice(item) === 0) this._helpWindow.setText(R.full);
            else this._helpWindow.setText(R.price + D.repairPrice(item) + TextManager.currencyUnit);
        }
    });

    const Window_RRRepairCommand = subclass(Window_HorzCommand);
    Object.assign(Window_RRRepairCommand.prototype, {
        maxCols() { return 2; },
        makeCommandList() {
            this.addCommand(R.text, 'repair');
            this.addCommand(R.cancel, 'cancel');
        }
    });

    function Scene_RRRepairEquip() { this.initialize(...arguments); }
    Scene_RRRepairEquip.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRRepairEquip.prototype.constructor = Scene_RRRepairEquip;
    window.Scene_RRRepairEquip = Scene_RRRepairEquip;

    Object.assign(Scene_RRRepairEquip.prototype, {
        helpWindowRect() { return new Rectangle(0, 0, Graphics.boxWidth, fitting(2)); },
        create() {
            Scene_MenuBase.prototype.create.call(this);
            const gw = Graphics.boxWidth, gh = Graphics.boxHeight;
            this.createHelpWindow();
            const top = this._helpWindow.height, row = fitting(1);
            this._goldWindow = new Window_Gold(new Rectangle(gw - 160, top, 160, row));
            this.addWindow(this._goldWindow);
            const listY = top + row;
            this._itemWindow = new Window_RREquipRepair(new Rectangle(0, listY, gw, gh - listY));
            this._itemWindow.setHelpWindow(this._helpWindow);
            this._itemWindow.setHandler('ok', this.onItemOk.bind(this));
            this._itemWindow.setHandler('cancel', this.onItemCancel.bind(this));
            this._itemWindow.setCategory('item');
            this._itemWindow.deactivate();
            this.addWindow(this._itemWindow);
            this._commandWindow = new Window_RRRepairCommand(new Rectangle(0, top, this._goldWindow.x, row));
            this._commandWindow.setHandler('repair', this.commandRepair.bind(this));
            this._commandWindow.setHandler('cancel', this.popScene.bind(this));
            this.addWindow(this._commandWindow);
        },
        item() { return this._itemWindow.item(); },
        onItemOk() {
            const item = this.item();
            $gameParty.loseGold(D.repairPrice(item));
            D.repair(item);
            this._goldWindow.refresh();
            AudioManager.stopSe();
            AudioManager.playSe({ name: R.se.name, volume: R.se.volume, pitch: R.se.pitch, pan: 0 });
            this._itemWindow.refresh();
            this._itemWindow.activate();
        },
        onItemCancel() {
            this._itemWindow.deselect();
            this._itemWindow.deactivate();
            this._commandWindow.activate();
            this._helpWindow.setText('');
        },
        commandRepair() {
            this._commandWindow.deactivate();
            this._itemWindow.activate();
            this._itemWindow.select(0);
        }
    });
})();
