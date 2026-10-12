/*:
 * @target MZ
 * @plugindesc Window_Base, Window_Selectable, Window_Command and the menu windows (VX, as Thrall edited them), for imported games
 * @author Strak (on Enterbrain's RGSS2 windows); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallWindows.js
 *
 * The changes Thrall made to VX's own windows, and its menu windows:
 *   - Windows are fully opaque. Text and gauge colours come from the
 *     window's own skin (system 1, crisis 2, knockout 3, gauge back 4,
 *     HP gauge 3 to 5, MP gauge 30 to 31, stat up 6, stat down 7), so a
 *     colour-blind skin recolours the windows that use it. VX skins
 *     (128 x 128) are laid out for MZ when a window loads one.
 *   - A face is a 96 x 16 strip of the face sheet (four across).
 *   - Names are drawn 150 wide, classes 172 wide with an alignment.
 *   - Item names: weapons and armour in their rarity colour (elements 9
 *     Mythic to 14 Common), with " (M)" ... " (C)" after them while switch
 *     37 is on; consumables in colour 14, gold items in 15. Weapons and
 *     armour show their shard icon (elements 19 to 22, a legendary shard
 *     for 24 to 39) over their own, and favourites (element 18) a star.
 *   - Lists do not page with page up and page down; command text starts
 *     24 px in.
 *
 * Windows for the menus (used by RR_ThrallMenu and the other Thrall ports):
 * Window_ThrallHelp, Window_ThrallMenuStatus, Window_ThrallItem (the
 * inventory sorted by rarity or type, variable 100), Window_ThrallEquip,
 * Window_ThrallEquipItem (with the quick comparison arrows while switch 68
 * is off, and a lock over items above the actor's level),
 * Window_ThrallEquipStatus, Window_ThrallStatus, Window_ThrallSaveFile and
 * Window_ThrallConfirm.
 *
 * The VX fields the windows read (element sets, armour kind, recovery
 * rates) come from RRThrallVx's records when the battle port is on, else
 * from the database. RRThrallUi has the helpers the menu ports share.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param weapon1
 * @text Weapon 1 term
 * @desc Vocab::weapon1, a two-sword actor's first slot.
 * @default WPN1
 *
 * @param weapon2
 * @text Weapon 2 term
 * @default WPN2
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallWindows');
    const WLH = 24;
    const U = (window.RRThrallUi = window.RRThrallUi || {});
    U.terms = { weapon1: params.weapon1 || 'WPN1', weapon2: params.weapon2 || 'WPN2' };

    //=========================================================================
    // Shared helpers
    //=========================================================================
    const v = (id) => (typeof $gameVariables !== 'undefined' && $gameVariables ? $gameVariables.value(id) : 0);
    const s = (id) => (typeof $gameSwitches !== 'undefined' && $gameSwitches ? $gameSwitches.value(id) : false);
    const idiv = (a, b) => (b ? Math.floor(a / b) : 0);
    /** Ruby's String#to_i: the leading integer, else 0. */
    const toI = (text) => { const m = /^\s*[-+]?\d+/.exec(String(text == null ? '' : text)); return m ? parseInt(m[0], 10) : 0; };
    Object.assign(U, { v, s, idiv, toI, WLH });
    U.setV = (id, value) => $gameVariables.setValue(id, value);
    U.setS = (id, value) => $gameSwitches.setValue(id, value);
    U.sound = (name) => {
        const play = { decision: 'playOk', cancel: 'playCancel', buzzer: 'playBuzzer', cursor: 'playCursor', equip: 'playEquip', useItem: 'playUseItem',
            save: 'playSave', load: 'playLoad', enemyAttack: 'playEnemyAttack' }[name];
        if (play && SoundManager[play]) SoundManager[play]();
    };

    // ---- the VX side of a database record ---------------------------------------
    const VX = () => window.RRThrallVx;
    /** 'item', 'weapon', 'armor' or 'skill' for an MZ record or a VX one. */
    U.kindOf = (item) => {
        if (!item) return null;
        const V = VX();
        if (V && V.VxBase && item instanceof V.VxBase) return item.kind;
        if (DataManager.isItem(item)) return 'item';
        if (DataManager.isWeapon(item)) return 'weapon';
        if (DataManager.isArmor(item)) return 'armor';
        if (DataManager.isSkill(item)) return 'skill';
        return null;
    };
    const TABLE = { item: () => $dataItems, weapon: () => $dataWeapons, armor: () => $dataArmors, skill: () => $dataSkills };
    /** The MZ record of an MZ or VX record. */
    U.mz = (item) => {
        if (!item) return null;
        const V = VX();
        if (V && V.VxBase && item instanceof V.VxBase) return item.mz();
        return item;
    };
    U.isItem = (item) => U.kindOf(item) === 'item';
    U.isWeapon = (item) => U.kindOf(item) === 'weapon';
    U.isArmor = (item) => U.kindOf(item) === 'armor';
    U.isSkill = (item) => U.kindOf(item) === 'skill';

    const traitIds = (d, code) => (d.traits || []).filter(t => t.code === code).map(t => t.dataId);
    const traitValue = (d, code, id) => { const t = (d.traits || []).find(x => x.code === code && x.dataId === id); return t ? t.value : 0; };
    const hasTrait = (d, code, id) => (d.traits || []).some(x => x.code === code && x.dataId === id);
    /** The VX fields of an MZ record, as the importer wrote them into traits and effects. */
    function fromMz(d, kind) {
        const p = d.params || [];
        const effects = d.effects || [];
        const mpEffect = effects.find(e => e.code === 12);
        const out = {};
        if (kind === 'weapon') {
            Object.assign(out, { atk: p[2] || 0, def: p[3] || 0, spi: p[4] || 0, agi: p[6] || 0, hit: Math.round(95 + traitValue(d, 22, 0) * 100),
                element_set: traitIds(d, 31), state_set: traitIds(d, 32), fast_attack: (d.traits || []).some(t => t.code === 33),
                dual_attack: (d.traits || []).some(t => t.code === 34), critical_bonus: hasTrait(d, 22, 2), two_handed: hasTrait(d, 54, 2), animation_id: d.animationId || 0 });
        } else if (kind === 'armor') {
            Object.assign(out, { kind: Math.max(0, (d.etypeId || 2) - 2), atk: p[2] || 0, def: p[3] || 0, spi: p[4] || 0, agi: p[6] || 0,
                eva: Math.round(traitValue(d, 22, 1) * 100), element_set: traitIds(d, 11), state_set: traitIds(d, 14),
                prevent_critical: hasTrait(d, 22, 3), half_mp_cost: hasTrait(d, 23, 4), double_exp_gain: hasTrait(d, 23, 9), auto_hp_recover: hasTrait(d, 22, 7) });
        } else {
            const ce = effects.find(e => e.code === 44);
            Object.assign(out, { element_set: d.damage && d.damage.elementId > 0 ? [d.damage.elementId] : [],
                plus_state_set: effects.filter(e => e.code === 21).map(e => e.dataId), minus_state_set: effects.filter(e => e.code === 22).map(e => e.dataId),
                mp_recovery_rate: mpEffect ? Math.round(mpEffect.value1 * 100) : 0, mp_recovery: mpEffect ? Math.round(mpEffect.value2) : 0,
                common_event_id: ce ? ce.dataId : 0, scope: d.scope || 0, occasion: d.occasion || 0 });
        }
        return out;
    }
    const fallback = new Map();
    U.fallbackRecords = fallback;
    /** The VX record of an item: RRThrallVx's when the battle port has one, else one read from the database (kept until the title). */
    U.rec = (item) => {
        if (!item) return null;
        const V = VX();
        if (V && typeof V.of === 'function') { const r = V.of(item); if (r) return r; }
        const kind = U.kindOf(item), d = U.mz(item);
        if (!kind || !d) return null;
        const key = kind + ':' + d.id;
        let r = fallback.get(key);
        if (!r) { r = fromMz(d, kind); fallback.set(key, r); }
        return r;
    };
    const MZ_FIELD = {
        name: d => d.name, description: d => d.description, note: d => d.note || '', price: d => d.price || 0, icon_index: d => d.iconIndex || 0, id: d => d.id
    };
    /** A VX field: the record's own value, else the database's (name, description, note, price, icon). */
    U.get = (item, field) => {
        if (!item) return undefined;
        const r = U.rec(item);
        if (r && Object.prototype.hasOwnProperty.call(r, field)) return r[field];
        const d = U.mz(item);
        if (d && MZ_FIELD[field]) return MZ_FIELD[field](d);
        return r ? r[field] : undefined;
    };
    U.elementSet = (item) => U.get(item, 'element_set') || [];
    U.stateSet = (item) => U.get(item, 'state_set') || [];
    U.hasElement = (item, id) => U.elementSet(item).includes(id);
    /** RPG::BaseItem#price etc., for the drawing code. */
    U.price = (item) => Number(U.get(item, 'price')) || 0;
    U.name = (item) => String(U.get(item, 'name') ?? '');
    U.note = (item) => String(U.get(item, 'note') ?? '');
    U.description = (item) => String(U.get(item, 'description') ?? '');
    U.iconIndex = (item) => Number(U.get(item, 'icon_index')) || 0;
    /** The level an item asks for: its description, as Ruby's to_i reads it. */
    U.levelReq = (item) => toI(U.description(item));

    /** item.element_set = new set: on the VX record, and in the database's traits so MZ's rules see it too. */
    U.setElementSet = (item, set) => {
        const r = U.rec(item);
        if (r) r.element_set = set.slice();
        const d = U.mz(item), kind = U.kindOf(item);
        if (!d || !Array.isArray(d.traits)) return;
        const code = kind === 'weapon' ? 31 : kind === 'armor' ? 11 : 0;
        if (!code) return;
        d.traits = d.traits.filter(t => t.code !== code).concat(set.map(id => ({ code, dataId: id, value: code === 31 ? 0 : 0.5 })));
    };
    /** Favourite (element 18) on or off: element_set minus or plus the FAVORITE record's set (weapon 527, armour 491). */
    U.toggleFavorite = (item, weaponId = 527, armorId = 491) => {
        const fav = U.isWeapon(item) ? U.elementSet($dataWeapons[weaponId]) : U.elementSet($dataArmors[armorId]);
        const set = U.elementSet(item);
        U.setElementSet(item, set.includes(18) ? set.filter(e => !fav.includes(e)) : set.concat(fav));
    };

    /** $game_party.items: items, then weapons, then armour, each by id. */
    U.partyItems = () => $gameParty.items().concat($gameParty.weapons(), $gameParty.armors());
    U.armorKind = (item) => Number(U.get(item, 'kind')) || 0;
    /** The order Thrall lists things in (Window_Item#refresh): variable 100 is 0 for rarity, else type. */
    U.sortRanges = () => (v(100) === 0 ? { sort1: [9, 14], sort2: [1, 5], sort3: [9, 14], sort4: [0, 3] } : { sort1: [1, 5], sort2: [9, 14], sort3: [0, 3], sort4: [9, 14] });
    const range = (a, b, fn) => { for (let i = a; i <= b; i++) fn(i); };
    U.sortedItems = (include, all = U.partyItems()) => {
        const out = [];
        const byRate = v(100) === 0;
        const keys = [0];
        for (const item of all) {
            if (!U.isItem(item)) continue;
            const k = Number(U.get(item, byRate ? 'mp_recovery_rate' : 'mp_recovery')) || 0;
            if (!keys.includes(k)) keys.push(k);
        }
        range(Math.min(...keys), Math.max(...keys), (i) => {
            for (const item of all) {
                if (!U.isItem(item) || !include(item)) continue;
                if (Number(U.get(item, byRate ? 'mp_recovery_rate' : 'mp_recovery')) === i) out.push(item);
            }
        });
        return out;
    };
    U.sortedWeapons = (include, all = U.partyItems(), skip = null) => {
        const { sort1, sort2 } = U.sortRanges();
        const out = [];
        range(sort1[0], sort1[1], (i) => range(sort2[0], sort2[1], (ii) => {
            for (const item of all) {
                if (!U.isWeapon(item) || !include(item)) continue;
                if (skip && skip(item)) continue;
                const e = U.elementSet(item);
                if (e.includes(i) && e.includes(ii)) out.push(item);
            }
        }));
        return out;
    };
    U.sortedArmors = (include, all = U.partyItems()) => {
        const { sort3, sort4 } = U.sortRanges();
        const out = [];
        range(sort3[0], sort3[1], (i) => range(sort4[0], sort4[1], (ii) => {
            for (const item of all) {
                if (!U.isArmor(item) || !include(item)) continue;
                const e = U.elementSet(item), kind = U.armorKind(item);
                if (sort3[0] === 0 ? e.includes(ii) && kind === i : e.includes(i) && kind === ii) out.push(item);
            }
        }));
        return out;
    };

    /** $game_party.item_can_use?(item) (VX): a usable item the party has, for the battle or the menu. */
    U.itemCanUse = (item) => {
        if (!item || !(U.isItem(item) || U.isSkill(item))) return false;
        const d = U.mz(item);
        if (U.isItem(item) && $gameParty.numItems(d) === 0) return false;
        const occasion = d.occasion || 0;
        return $gameParty.inBattle() ? occasion === 0 || occasion === 1 : occasion === 0 || occasion === 2;
    };

    // ---- the actor's VX numbers (Thrall's Game_Actor; the battle and skill ports give them when on) ------
    const weaponsOf = (actor) => (actor.rrVxWeapons ? actor.rrVxWeapons() : actor.weapons().map(w => U.rec(w)));
    const equipsOf = (actor) => (actor.rrVxEquips ? actor.rrVxEquips() : actor.equips().map(e => U.rec(e)));
    const learned = (actor, id) => (actor.rrVxSkillLearn ? actor.rrVxSkillLearn(id) : actor.isLearnedSkill(id));
    const secondWord = (item) => String((item && (item.name !== undefined ? item.name : U.name(item))) || '').split(/ /)[1];
    U.baseAtk = (a) => (a.rrVxBaseAtk ? a.rrVxBaseAtk() : a.param(2));
    U.baseDef = (a) => (a.rrVxBaseDef ? a.rrVxBaseDef() : a.param(3));
    U.baseSpi = (a) => (a.rrVxBaseSpi ? a.rrVxBaseSpi() : a.param(4));
    U.baseAgi = (a) => (a.rrVxBaseAgi ? a.rrVxBaseAgi() : a.param(6));
    U.eva = (a) => (a.rrVxEva ? a.rrVxEva() : Math.round(a.eva * 100));
    U.cri = (a) => (a.rrVxCri ? a.rrVxCri() : Math.round(a.cri * 100));
    U.maxhp = (a) => a.mhp;
    /** Game_Actor#wpn_hit (Thrall): the weapon's hit (80 bare-handed), Falcon gear, Practiced and Precision. */
    U.wpnHit = (actor) => {
        if (actor.rrVxWpnHit) return actor.rrVxWpnHit();
        const w = weaponsOf(actor)[0];
        let n = w ? Number(w.hit) : 80;
        for (const item of equipsOf(actor).filter(Boolean)) {
            if (secondWord(item) === 'Falcon') n += 10;
            if (U.isWeapon(item) && (U.hasElement(item, 2) || U.hasElement(item, 29)) && learned(actor, 167)) n += 10;
        }
        if (learned(actor, 133)) n += 5;
        return Math.max(0, n);
    };
    /** Game_Actor#wpn_cri (Thrall): the weapons' SPI, and the Watcher's bonus as HP falls. */
    U.wpnCri = (actor) => {
        if (actor.rrVxWpnCri) return actor.rrVxWpnCri();
        let n = 0;
        for (const w of weaponsOf(actor).filter(Boolean)) {
            n += Number(w.spi) || 0;
            if (secondWord(w) === 'Watcher') n += idiv(100 - idiv(actor.hp * 100, actor.mhp), 2);
        }
        return n;
    };
    U.plusStateSet = (actor) => (actor.rrVxPlusStateSet ? actor.rrVxPlusStateSet() : actor.attackStates());
    U.twoSwords = (actor) => (actor.rrVxTwoSwordsStyle ? actor.rrVxTwoSwordsStyle() : actor.isDualWield());
    /** VX's equips: [weapon, armour1 (or second weapon), head, body, accessory], MZ records or null. */
    U.equips = (actor) => { const e = actor.equips(); return [0, 1, 2, 3, 4].map(i => e[i] || null); };
    /** The actor with `item` in `slot`, for the stats a change would give (VX's clone + change_equip(…, true)). */
    U.testActor = (actor, slot, item) => {
        const temp = JsonEx.makeDeepCopy(actor);
        temp._tempFlag = true;
        temp.forceChangeEquip(slot, U.mz(item));
        return temp;
    };

    /** VX's draw_text arguments for a Ruby value: numbers as Ruby prints them. */
    const str = (x) => (x === null || x === undefined ? '' : String(x));

    //=========================================================================
    // VX window skins (128 × 128) as MZ's (192 × 192)
    //=========================================================================
    const converted = new WeakMap();
    /** A system image as a window skin: a VX one (128 × 128) laid out as MZ's once it has loaded. */
    U.windowskin = (name) => {
        const source = ImageManager.loadSystem(name);
        if (!source.isReady() || source.width >= 192) return source;
        let skin = converted.get(source);
        if (!skin) { skin = new Bitmap(192, 192); U.layVxSkin(skin, source); converted.set(source, skin); }
        return skin;
    };
    /** The skins the game switches between, loaded with the system images so a window has its own from the start. */
    U.SKINS = ['Window', 'Window1', 'Window2', 'Window3', 'WindowP', 'WindowP1', 'WindowP2', 'WindowP3', 'WindowS'];
    const _loadSystemImages = Scene_Boot.prototype.loadSystemImages;
    Scene_Boot.prototype.loadSystemImages = function() {
        _loadSystemImages.call(this);
        for (const name of U.SKINS) ImageManager.loadSystem(name);
    };
    /** VX's skin regions into MZ's places (the importer's windowSkin, for the skins it did not convert). */
    U.layVxSkin = (out, src) => {
        out.context.imageSmoothingEnabled = false;
        const blt = (sx, sy, sw, sh, dx, dy, dw, dh) => out.blt(src, sx, sy, sw, sh, dx, dy, dw, dh);
        blt(0, 0, 64, 64, 0, 0, 96, 96);
        blt(0, 64, 64, 64, 0, 96, 96, 96);
        blt(64, 0, 16, 16, 96, 0); blt(112, 0, 16, 16, 176, 0); blt(64, 48, 16, 16, 96, 80); blt(112, 48, 16, 16, 176, 80);
        blt(80, 0, 32, 16, 104, 0, 80, 16); blt(80, 48, 32, 16, 104, 80, 80, 16);
        blt(64, 16, 16, 32, 96, 8, 16, 80); blt(112, 16, 16, 32, 176, 8, 16, 80);
        blt(88, 16, 16, 8, 136, 26); blt(88, 40, 16, 8, 136, 62);
        blt(64, 64, 32, 32, 96, 96, 48, 48);
        for (let i = 0; i < 4; i++) blt(96 + (i % 2) * 16, 64 + Math.floor(i / 2) * 16, 16, 16, 144 + (i % 2) * 24 + 4, 96 + Math.floor(i / 2) * 24 + 4);
        for (let i = 0; i < 32; i++) blt(64 + (i % 8) * 8 + 4, 96 + Math.floor(i / 8) * 8 + 4, 1, 1, 96 + (i % 8) * 12, 144 + Math.floor(i / 8) * 12, 12, 12);
    };
    /** The skin's text colour n (VX's text_color reads the window's own skin). */
    U.skinColor = (skin, n) => {
        if (!skin || !skin.isReady() || skin.width < 192) return null;
        if (!skin._rrPalette) {
            skin._rrPalette = [];
            for (let i = 0; i < 32; i++) skin._rrPalette[i] = skin.getPixel(96 + (i % 8) * 12 + 6, 144 + Math.floor(i / 8) * 12 + 6);
        }
        return skin._rrPalette[n] || null;
    };

    //=========================================================================
    // Window_Base (043)
    //=========================================================================
    const W = Window_Base.prototype;
    // back_opacity 255: every window is opaque.
    W.updateBackOpacity = function() { this.backOpacity = 255; };
    W.rrVxTextColor = function(n) { return U.skinColor(this.windowskin, n) || ColorManager.textColor(n); };
    W.rrVxSystemColor = function() { return this.rrVxTextColor(1); };
    W.rrVxCrisisColor = function() { return this.rrVxTextColor(2); };
    W.rrVxKnockoutColor = function() { return this.rrVxTextColor(3); };
    W.rrVxGaugeBackColor = function() { return this.rrVxTextColor(4); };
    W.rrVxHpGaugeColor1 = function() { return this.rrVxTextColor(3); };
    W.rrVxHpGaugeColor2 = function() { return this.rrVxTextColor(5); };
    W.rrVxMpGaugeColor1 = function() { return this.rrVxTextColor(30); };
    W.rrVxMpGaugeColor2 = function() { return this.rrVxTextColor(31); };
    W.rrVxPowerUpColor = function() { return this.rrVxTextColor(6); };
    W.rrVxPowerDownColor = function() { return this.rrVxTextColor(7); };
    /** Thrall's faces are 96 × 16 strips, four across a sheet. */
    W.rrVxDrawFace = function(name, index, x, y, size = 96) {
        if (!name) return;
        const bitmap = ImageManager.loadFace(name);
        const draw = () => this.contents.blt(bitmap, index % 4 * 96 + Math.floor((96 - size) / 2), Math.floor(index / 4) * 16, size, 16, x, y);
        if (bitmap.isReady()) draw();
        else { const contents = this.contents; bitmap.addLoadListener(() => { if (this.contents === contents) draw(); }); }
    };
    W.rrVxDrawActorName = function(actor, x, y) {
        this.changeTextColor(this.rrVxHpColor(actor));
        this.rrVxDrawText(x, y, 150, WLH, actor.name());
    };
    W.rrVxDrawActorClass = function(actor, x, y, align = 0) {
        this.changeTextColor(this.rrVxNormalColor());
        this.rrVxDrawText(x, y, 172, WLH, actor.currentClass() ? actor.currentClass().name : '', align);
    };
    const RARITY = [[9, ' (M)', 13], [10, ' (L)', 12], [11, ' (E)', 11], [12, ' (R)', 10], [13, ' (U)', 9]];
    /** The colour and text Thrall gives an item's name. */
    U.itemNameStyle = (item) => {
        let text = U.name(item), color = 0;
        if (U.isWeapon(item) || U.isArmor(item)) {
            const e = U.elementSet(item);
            const r = RARITY.find(([id]) => e.includes(id));
            if (r) { if (s(37)) text += r[1]; color = r[2]; }
            else if (s(37)) text += ' (C)';
        } else if (U.isItem(item)) {
            color = text.split(/ /)[1] === 'Gold' ? 15 : 14;
        }
        return { text, color };
    };
    /** The shard or favourite icons drawn over an item's own. */
    U.overlayIcons = (item) => {
        const e = U.elementSet(item), out = [];
        if (U.isWeapon(item)) {
            const shard = [[19, 773], [20, 775], [21, 777], [22, 779]].find(([id]) => e.includes(id));
            if (shard) out.push(shard[1]);
            else for (let i = 24; i <= 39; i++) if (e.includes(i)) { out.push(782); break; }
        } else if (U.isArmor(item)) {
            const shard = [[19, 772], [20, 774], [21, 776], [22, 778]].find(([id]) => e.includes(id));
            if (shard) out.push(shard[1]);
        }
        if (e.includes(18)) out.push(766);
        return out;
    };
    W.rrVxDrawItemName = function(item, x, y, enabled = true) {
        if (!item) return;
        const { text, color } = U.itemNameStyle(item);
        this.changeTextColor(this.rrVxTextColor(color));
        this.rrVxDrawIcon(U.iconIndex(item), x, y, enabled);
        for (const icon of U.overlayIcons(item)) this.rrVxDrawIcon(icon, x, y, enabled);
        const opacity = this.contents.paintOpacity;
        this.contents.paintOpacity = enabled ? 255 : 128;
        this.rrVxDrawText(x + 24, y, 198, WLH, text);
        this.contents.paintOpacity = opacity;
    };

    //=========================================================================
    // Window_Selectable (044): the page keys do not page; Window_Command (045): text 24 in
    //=========================================================================
    Window_Selectable.prototype.cursorPagedown = function() {};
    Window_Selectable.prototype.cursorPageup = function() {};
    Window_Command.prototype.drawItem = function(index) {
        const rect = this.itemRect(index);
        this.resetTextColor();
        this.changePaintOpacity(this.isCommandEnabled(index));
        this.rrVxDrawText(rect.x + 24, rect.y, rect.width, rect.height, this.commandName(index));
        this.changePaintOpacity(true);
    };

    //=========================================================================
    // Window classes
    //=========================================================================
    const define = (name, Base, proto) => {
        const C = function() { this.initialize(...arguments); };
        C.prototype = Object.create(Base.prototype);
        C.prototype.constructor = C;
        Object.assign(C.prototype, proto);
        Object.defineProperty(C, 'name', { value: name });
        window[name] = C;
        return C;
    };
    U.define = define;
    const R = (x, y, w, h) => new Rectangle(x, y, w, h);
    U.rect = R;
    /** A window the scene drives: no mouse, no handlers, VX's look. */
    const vxSelectable = {
        processTouch() {},
        drawItemBackground() {},
        refresh() { this.paint(); }
    };
    U.vxSelectable = vxSelectable;

    // ---- Window_Help (046) ------------------------------------------------------
    define('Window_ThrallHelp', Window_Base, {
        initialize(x = 0, y = 0, width = 608, height = WLH + 32) {
            Window_Base.prototype.initialize.call(this, R(x, y, width, height));
            this._rrText = null; this._rrAlign = null;
        },
        /** set_text(text, align): drawn again only when either changed. */
        rrSetText(text, align = 0) {
            if (text === this._rrText && align === this._rrAlign) return;
            this.contents.clear();
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(4, 0, this.width - 40, WLH, str(text), align);
            this._rrText = text; this._rrAlign = align;
        }
    });

    // ---- Window_MenuStatus (048) ------------------------------------------------
    define('Window_ThrallMenuStatus', Window_Selectable, Object.assign({}, vxSelectable, {
        initialize(x, y) {
            Window_Selectable.prototype.initialize.call(this, R(x, y, 608, 176));
            this.refresh();
            this.deactivate();
            this.select(-1);
        },
        maxCols() { return 3; },
        maxItems() { return $gameParty.members().length; },
        itemHeight() { return this.innerHeight; },
        isHorizontal() { return true; },
        paint() {
            if (!this.contents) return;
            this.contents.clear();
            this.rrDrawMembers();
        },
        rrDrawMembers() {
            $gameParty.members().forEach((actor, index) => {
                this.rrVxDrawActorGraphic(actor, index * 202 + 86, 48);
                const x = index * 202, y = 48;
                this.rrVxDrawActorName(actor, x, y);
                this.rrVxDrawActorClass(actor, x, y, 2);
                this.rrVxDrawActorLevel(actor, x, y + WLH);
                this.rrVxDrawActorHp(actor, x, y + WLH * 2, 172);
                this.rrVxDrawActorState(actor, x, y + WLH * 4);
            });
        },
        // cursor_right / cursor_left: a trigger wraps round.
        cursorRight(wrap) {
            const i = this.index(), n = this.maxItems();
            if (this.maxCols() >= 2 && (i < n - 1 || wrap)) this.smoothSelect((i + 1) % n);
        },
        cursorLeft(wrap) {
            const i = this.index(), n = this.maxItems();
            if (this.maxCols() >= 2 && (i > 0 || wrap)) this.smoothSelect((i - 1 + n) % n);
        },
        cursorDown() {}, cursorUp() {},
        /** index 0…: one actor; 100+: one actor, by itself; 99 (or any past the party): all of them. */
        refreshCursor() {
            const i = this._index;
            if (i < 0) this.setCursorRect(0, 0, 0, 0);
            else if (i < this.maxItems()) this.setCursorRect(i * 202, 0, 172, WLH * 2);
            else if (i >= 100) this.setCursorRect((i - 100) * 202, 24, 101, WLH * 6);
            else this.setCursorRect(0, 0, this.innerWidth, WLH);
        },
        // An index past the party (all of them) is VX's own: MZ's select would not clamp it.
        select(index) { this._index = index; this.refreshCursor(); this.callUpdateHelp(); }
    }));

    // ---- Window_Item (049) ------------------------------------------------------
    define('Window_ThrallItem', Window_Selectable, Object.assign({}, vxSelectable, {
        initialize(rect, columns = 2, actor = null) {
            Window_Selectable.prototype.initialize.call(this, rect);
            this._rrColumns = columns;
            this._rrActiveBattler = actor;
            this._data = [];
            this.refresh();
            this.select(0);
        },
        maxCols() { return this._rrColumns; },
        maxItems() { return this._data ? this._data.length : 0; },
        item() { return this._data ? this._data[this.index()] || null : null; },
        /** include?: anything outside battle; in battle weapons and what the party can use. */
        includes(item) {
            if (!item) return false;
            if ($gameParty.inBattle()) {
                if (U.isWeapon(item)) return true;
                if (!U.itemCanUse(item)) return false;
            }
            return true;
        },
        isEnabled() { return true; },
        makeItemList() {
            const include = (item) => this.includes(item);
            const battler = $gameParty.inBattle() ? this._rrActiveBattler : null;
            const skip = battler ? (item) => U.levelReq(item) > battler.level : null;
            this._data = U.sortedItems(include).concat(U.sortedWeapons(include, undefined, skip), U.sortedArmors(include));
            if (this.includes(null)) this._data.push(null);
        },
        refresh() {
            this.makeItemList();
            Window_Selectable.prototype.refresh.call(this);
        },
        drawItem(index) {
            const item = this._data[index];
            const rect = this.itemRect(index);
            this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);
            if (item) this.rrVxDrawItemName(item, rect.x, rect.y, this.isEnabled(item));
        },
        /** The battle's help text: the description, or the weapon swap. */
        updateHelp() {
            const item = this.item();
            if (!this._helpWindow) return;
            if (item && $gameParty.inBattle()) this._helpWindow.rrSetText ? this._helpWindow.rrSetText(U.isWeapon(item) ? 'Change currently equipped weapon' : U.description(item)) : this._helpWindow.setText(U.description(item));
            else if (this._helpWindow.rrSetItem) this._helpWindow.rrSetItem(item, this._actor || null);
        }
    }));

    // ---- Window_Equip (052) -----------------------------------------------------
    define('Window_ThrallEquip', Window_Selectable, Object.assign({}, vxSelectable, {
        initialize(x, y, actor) {
            Window_Selectable.prototype.initialize.call(this, R(x, y, 304, 224));
            this._actor = actor;
            this.refresh();
            this.select(0);
        },
        maxCols() { return 1; },
        maxItems() { return 5; },
        item() { return U.equips(this._actor)[this.index()] || null; },
        paint() {
            if (!this.contents) return;
            const actor = this._actor, data = U.equips(actor);
            this.contents.clear();
            this.changeTextColor(this.rrVxHpColor(actor));
            this.rrVxDrawText(0, 0, 272, WLH, actor.name(), 1);
            this.rrVxDrawIcon($gameSystem.rrReadInput ? $gameSystem.rrReadInput(3) : 817, 0, 0);
            this.rrVxDrawIcon($gameSystem.rrReadInput ? $gameSystem.rrReadInput(4) : 835, 248, 0);
            this.changeTextColor(this.rrVxSystemColor());
            const types = $dataSystem.equipTypes;
            if (U.twoSwords(actor)) {
                this.rrVxDrawText(0, WLH, 50, WLH, U.terms.weapon1);
                this.rrVxDrawText(0, WLH * 2, 50, WLH, U.terms.weapon2);
            } else {
                this.rrVxDrawText(0, WLH, 50, WLH, types[1]);
                this.rrVxDrawText(0, WLH * 2, 50, WLH, types[2]);
            }
            this.rrVxDrawText(0, WLH * 3, 50, WLH, types[3]);
            this.rrVxDrawText(0, WLH * 4, 50, WLH, types[4]);
            this.rrVxDrawText(0, WLH * 5, 50, WLH, types[5]);
            for (let i = 0; i < 5; i++) this.rrVxDrawItemName(data[i], 50, WLH * (i + 1));
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawIcon($gameSystem.rrReadInput ? $gameSystem.rrReadInput(0) : 819, 0, WLH * 6);
            this.rrVxDrawText(28, WLH * 6, 244, WLH, 'Mark as Favorite');
            this.rrVxDrawIcon($gameSystem.rrReadInput ? $gameSystem.rrReadInput(5) : 833, 0, WLH * 7);
            this.rrVxDrawText(28, WLH * 7, 244, WLH, 'Toggle Quick Comparison');
        },
        // The cursor sits a row lower: the actor's name is the first.
        refreshCursor() {
            if (this._index < 0) { this.setCursorRect(0, 0, 0, 0); return; }
            const r = this.itemRect(this._index);
            this.setCursorRect(r.x, r.y + WLH, r.width, r.height);
        }
    }));

    // ---- Window_EquipItem (053) -------------------------------------------------
    define('Window_ThrallEquipItem', Window_ThrallItem, {
        initialize(rect, actor, equipType, columns) {
            this._actor = actor;
            if (equipType === 1 && U.twoSwords(actor)) equipType = 0;
            this._rrEquipType = equipType;
            Window_ThrallItem.prototype.initialize.call(this, rect, columns);
        },
        includes(item) {
            if (!item) return true;
            if (this._rrEquipType === 0) { if (!U.isWeapon(item)) return false; }
            else {
                if (!U.isArmor(item)) return false;
                if (U.armorKind(item) !== this._rrEquipType - 1) return false;
            }
            return this.rrEquippable(item);
        },
        /** Game_Actor#equippable?: the class's weapon or armour set (no shield for a two-sword actor). */
        rrEquippable(item) {
            const d = U.mz(item);
            if (U.isArmor(item) && U.twoSwords(this._actor) && U.armorKind(item) === 0) return false;
            return this._actor.canEquip(d);
        },
        drawItem(index) {
            const item = this._data[index];
            const rect = this.itemRect(index);
            this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);
            if (!item) return;
            const enabled = this.isEnabled(item);
            if (!s(68)) {
                const ic = this.rrCompareIcon(item);
                if (ic) this.rrVxDrawIcon(ic, rect.x, rect.y, enabled);
            }
            this.rrVxDrawItemName(item, rect.x, rect.y, enabled);
            if (U.levelReq(item) > this._actor.level) this.rrVxDrawIcon(743, rect.x, rect.y, enabled);
        },
        /** The quick comparison: an up arrow (862, 863 on a colour-blind skin) for a tenth better, a down one (861) for a tenth worse. */
        rrCompareIcon(item) {
            const actor = this._actor;
            let flag1 = 0, flag2 = 0, mod1 = 100, mod2 = 100;
            if (U.isWeapon(item)) {
                const temp = U.testActor(actor, 0, item);
                const newAtk = U.baseAtk(temp), newAgi = U.baseAgi(temp), newHit = U.wpnHit(temp), newCri = U.cri(temp);
                const item2 = U.equips(actor)[0];
                const score = (it) => {
                    let m = 0;
                    const st = U.stateSet(it), e = U.elementSet(it);
                    for (const id of [1, 2, 3, 4, 5]) if (st.includes(id)) m += 35;
                    if (U.note(it).includes('HEAVY')) m += 15;
                    if (e.includes(16)) m += 55;
                    if (U.get(it, 'fast_attack')) m += 15;
                    if (U.get(it, 'critical_bonus')) m += 15;
                    if (e.includes(12)) m += 5;
                    if (e.includes(11)) m += 10;
                    if (e.includes(10)) m += 15;
                    if (e.includes(9)) m += 15;
                    return m;
                };
                if (item2) { mod1 += score(item); mod2 += score(item2); }
                flag1 = idiv(idiv(newAtk * mod1, 100), 2) + newAgi;
                flag1 = idiv(flag1 * (newHit + newCri), 100);
                flag2 = idiv(idiv(U.baseAtk(actor) * mod2, 100), 2) + U.baseAgi(actor);
                flag2 = idiv(flag2 * (U.wpnHit(actor) + U.cri(actor)), 100);
            } else {
                const item2 = U.equips(actor)[U.armorKind(item) + 1];
                const score = (it) => {
                    let m = 0;
                    const st = U.stateSet(it);
                    for (const id of [2, 3, 4, 5]) if (st.includes(id)) m += 10;
                    if (U.note(it).includes('THORNS')) m += 10;
                    for (const f of ['auto_hp_recover', 'half_mp_cost', 'prevent_critical', 'double_exp_gain']) if (U.get(it, f)) m += 10;
                    return m;
                };
                if (item2) { mod1 += score(item); mod2 += score(item2); }
                const value = (it, mod) => {
                    let f = idiv((U.get(it, 'def') + U.get(it, 'spi')) * mod, 100) + idiv(U.get(it, 'atk'), 10);
                    return idiv(f * (100 + U.get(it, 'eva')), 100);
                };
                flag1 = value(item, mod1);
                if (item2) flag2 = value(item2, mod2);
            }
            if (flag1 < flag2) return flag2 - flag1 > idiv(flag2, 10) ? 861 : 0;
            if (flag1 > flag2 && flag1 - flag2 > idiv(flag1, 10)) return v(80) > 0 ? 863 : 862;
            return 0;
        }
    });

    // ---- Window_EquipStatus (054) -----------------------------------------------
    define('Window_ThrallEquipStatus', Window_Base, {
        initialize(x, y, actor, width = 352, height = 256) {
            Window_Base.prototype.initialize.call(this, R(x, y, width, height));
            this._actor = actor;
            this._rrNew = [];
            this.refresh();
        },
        refresh() {
            this.contents.clear();
            const actor = this._actor;
            this.rrVxDrawActorGraphic(actor, 16, 224);
            this.rrVxDrawActorFace(actor, 36, 204);
            this.rrVxDrawActorLevel(actor, 36, 176);
            this.rrDrawParameter(0, 0, 0);
            this.rrDrawParameter(0, WLH, 3);
            this.rrDrawParameter(0, WLH * 2, 5);
            this.rrDrawParameter(0, WLH * 3, 7);
            this.rrDrawParameter(168, 0, 4);
            this.rrDrawParameter(168, WLH, 1);
            this.rrDrawParameter(168, WLH * 2, 2);
            this.rrDrawParameter(168, WLH * 3, 6);
            this.rrDrawElements(0, WLH * 4);
        },
        /** set_new_parameters(atk, def, spi, agi, hit, eva, cri, hp): redrawn when any changed. */
        rrSetNewParameters(...values) {
            if (values.length === this._rrNew.length && values.every((x, i) => x === this._rrNew[i])) return;
            this._rrNew = values;
            this.refresh();
        },
        rrDrawParameter(x, y, type) {
            const a = this._actor, n = this._rrNew;
            const rows = [
                [TextManager.param(2), U.baseAtk(a), n[0]], [TextManager.param(3), U.baseDef(a), n[1]], [TextManager.param(4), U.baseSpi(a), n[2]],
                [TextManager.param(6), U.baseAgi(a), n[3]], ['HP', U.maxhp(a), n[7]], ['ACC', U.wpnHit(a), n[4]], ['EVA', U.eva(a), n[5]], ['CRIT', U.cri(a), n[6]]
            ];
            const [name, value, newValue] = rows[type];
            const fmt = (val) => (type < 5 ? str(val) : `${Math.trunc(val)}%`);
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(x, y, 40, WLH, name);
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(x + 40, y, 48, WLH, fmt(value), 2);
            if (newValue === null || newValue === undefined) return;
            this.changeTextColor(this.rrVxSystemColor());
            if (newValue > value) this.rrVxDrawText(x + 91, y, 10, WLH, '>', 1);
            if (newValue < value) this.rrVxDrawText(x + 91, y, 10, WLH, '<', 1);
            this.changeTextColor(newValue > value ? this.rrVxPowerUpColor() : newValue === value ? this.rrVxNormalColor() : this.rrVxPowerDownColor());
            if (newValue !== value) this.rrVxDrawText(x + 103, y, 48, WLH, fmt(newValue), 2);
        },
        /** Apply: the states the weapon gives; Resist: the states the armour wards off. */
        rrDrawElements(x, y) {
            const actor = this._actor;
            const data = actor.armors().concat(actor.weapons());
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(x, y, 60, WLH, 'Apply:');
            this.rrVxDrawText(x, y + WLH, 60, WLH, 'Resist:');
            const icons = (ids, into) => { for (const id of ids) { const st = $dataStates[id]; if (st && st.iconIndex && !into.includes(st.iconIndex)) into.push(st.iconIndex); } };
            const apply = [];
            for (const item of data) if (item && U.isWeapon(item)) icons(U.plusStateSet(actor), apply);
            apply.forEach((icon, i) => this.rrVxDrawIcon(icon, x + 64 + i * 24, y));
            const resist = [];
            for (const item of data) if (item && U.isArmor(item)) icons(U.stateSet(item), resist);
            resist.forEach((icon, i) => this.rrVxDrawIcon(icon, x + 64 + i * 24, y + WLH));
        }
    });

    // ---- Window_Status (055) ----------------------------------------------------
    define('Window_ThrallStatus', Window_Base, {
        initialize(actor) {
            Window_Base.prototype.initialize.call(this, R(0, 0, 544, 416));
            this._actor = actor;
            this.refresh();
        },
        refresh() {
            const a = this._actor;
            this.contents.clear();
            this.rrVxDrawActorName(a, 4, 0);
            this.rrVxDrawActorClass(a, 128, 0);
            this.rrVxDrawActorFace(a, 8, 32);
            this.rrVxDrawActorLevel(a, 128, 32);
            this.rrVxDrawActorState(a, 128, 32 + WLH);
            this.rrVxDrawActorHp(a, 128, 32 + WLH * 2);
            this.rrVxDrawActorMp(a, 128, 32 + WLH * 3);
            for (let i = 0; i < 4; i++) this.rrVxDrawActorParameter(a, 32, 160 + WLH * i, i);
            const x = 288, y = 32;
            const next = a.isMaxLevel() ? '-------' : str(a.nextRequiredExp());
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(x, y, 180, WLH, TextManager.expTotal.replace('%1', ''));
            this.rrVxDrawText(x, y + WLH * 2, 180, WLH, TextManager.expNext.replace('%1', TextManager.level));
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(x, y + WLH, 180, WLH, str(a.currentExp()), 2);
            this.rrVxDrawText(x, y + WLH * 3, 180, WLH, next, 2);
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(288, 160, 120, WLH, TextManager.equip);
            U.equips(a).forEach((item, i) => this.rrVxDrawItemName(item, 304, 160 + WLH * (i + 1)));
        }
    });

    // ---- Window_SaveFile (056) --------------------------------------------------
    define('Window_ThrallSaveFile', Window_Base, {
        /** Save file index 0–3 is MZ's save file index + 1. */
        initialize(fileIndex) {
            Window_Base.prototype.initialize.call(this, R(0, 56 + fileIndex % 4 * 106, 608, 106));
            this._rrFileIndex = fileIndex;
            this.rrLoadGamedata();
            this.refresh();
            this._rrSelected = false;
        },
        rrSavefileId() { return this._rrFileIndex + 1; },
        rrLoadGamedata() {
            const info = DataManager.savefileInfo(this.rrSavefileId());
            this._rrInfo = info || null;
            this.fileExist = !!info;
            this.timeStamp = info ? info.timestamp || 0 : 0;
        },
        refresh() {
            this.contents.clear();
            this.changeTextColor(this.rrVxNormalColor());
            const name = `${TextManager.file} ${this._rrFileIndex + 1}`;
            this.rrVxDrawText(4, 0, 200, WLH, name);
            this._rrNameWidth = this.textWidth(name);
            if (!this.fileExist) return;
            this.rrDrawPartyCharacters(152, 54);
            this.rrDrawPlaytime(0, 0, this.innerWidth - 4, 2);
        },
        /** [character, index, face, face index, level] per member, as the save wrote them. */
        rrCharacters() {
            const info = this._rrInfo || {};
            if (info.rrThrall && Array.isArray(info.rrThrall.characters)) return info.rrThrall.characters;
            const faces = info.faces || [];
            return (info.characters || []).map((c, i) => [c[0], c[1], faces[i] ? faces[i][0] : null, faces[i] ? faces[i][1] : null, null]);
        },
        rrDrawPartyCharacters(x, y) {
            this.rrCharacters().forEach((c, i) => {
                const [name, index, fName, fIndex, level] = c;
                this.rrVxDrawCharacter(name, index, x + i * 112, y);
                if (fName != null && fIndex != null) this.rrVxDrawFace(fName, fIndex, x + i * 112 - 16, 58);
                if (level != null) this.rrVxDrawText(x + i * 112 + 20, 30, 60, WLH, 'Lvl. ' + level);
            });
        },
        rrDrawPlaytime(x, y, width, align) {
            const info = this._rrInfo || {};
            let total = info.rrThrall && info.rrThrall.frameCount != null ? Math.floor(info.rrThrall.frameCount / 60) : null;
            let text;
            if (total === null) text = info.playtime || '00:00:00';
            else text = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(n => String(n).padStart(2, '0')).join(':');
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(x, y, width, WLH, text, align);
        },
        rrSetSelected(selected) {
            this._rrSelected = selected;
            if (selected) this.setCursorRect(0, 0, this._rrNameWidth + 8, WLH);
            else this.setCursorRect(0, 0, 0, 0);
        }
    });

    // ---- Window_Confirm (072) ---------------------------------------------------
    define('Window_ThrallConfirm', Window_Selectable, Object.assign({}, vxSelectable, {
        initialize() {
            Window_Selectable.prototype.initialize.call(this, R(168, 156, 272, 104));
            this._data = [];
            this.select(-1);
            this.deactivate();
            this.opacity = 0;
        },
        maxCols() { return 1; },
        maxItems() { return this._data.length; },
        paint() {},
        /** refresh(inventory): Salvage item? (the inventory), Salvage remaining loot?, or the crafting cost (variable 3 past 5). */
        rrRefresh(inventory = false) {
            let text;
            if (v(3) > 5) { text = `Crafting Cost: ${v(82)} Materials.`; this._data = ['Craft', 'Cancel']; }
            else { text = inventory ? 'Salvage item?' : 'Salvage remaining loot?'; this._data = ['Yes', 'No']; }
            this.contents.clear();
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(0, 0, 240, WLH, text, 1);
            for (let i = 0; i < this._data.length; i++) this.drawItem(i);
            this.opacity = 255;
            this.select(0);
            this.activate();
        },
        drawItem(index) {
            const width = this.innerWidth, x = 4, y = (index + 1) * WLH;
            this.contents.clearRect(x, y, width - 8, WLH);
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(x, y, width - 8, WLH, this._data[index], 1);
        },
        refreshCursor() {
            if (this._index < 0) { this.setCursorRect(0, 0, 0, 0); return; }
            const r = this.itemRect(this._index);
            this.setCursorRect(r.x, r.y + WLH, r.width, r.height);
        },
        rrHide() {
            this.contents.clear();
            this.select(-1);
            this.deactivate();
            this.opacity = 0;
        }
    }));
})();
