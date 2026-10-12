/*:
 * @target MZ
 * @plugindesc Pinnacle's kingdom layer (VX Ace), for imported games
 * @author Zoro (Pinnacle - The Five Kingdoms); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_PinnacleKingdom.js
 *
 * The party of Pinnacle - The Five Kingdoms keeps more than its members:
 *   the story so far (the lines the Story command shows), the buildings of
 *   its fortress with what each yields every day, the stock of the special-
 *   offer stalls, and its armies. An army is a party member made from a troop
 *   item (the Troop table names its class and look); its commander is an armor
 *   numbered 100 after the commanding actor, lost when that actor leaves.
 * The party's leader is always actor 1; four fight; up to 999 of an item are
 *   carried; a save file is named after actor 1 and shows every member.
 * A new game can start on any map (the title's Tutorial does).
 *
 * Script calls the events make, translated by the import:
 *   $gameParty.rrStory()           the story lines (story[-1] is the last)
 *   $gameParty.rrDailyIncome()     the buildings: [name, [item, n], …]
 *                                  (item nil = gold)
 *   $gameParty.rrShops()           the stalls' goods (nil until a stall
 *                                  first stocks, as the game started it)
 *   RRPinnacleKingdom.troopData()  item id → [class, graphic, index]
 *   RRPinnacleKingdom.totalProduction(item)   a day's yield (0 = gold)
 *   SceneManager.rrScene()         the scene a call just made, or the one
 *                                  running
 * The party's mode ("main" or "troops") and the members set aside when it
 * switches: rrPartyMode / rrSetPartyMode, rrSavedParty / rrSetSavedParty,
 * rrSavedTroops / rrSetSavedTroops. removeActor(id, false) keeps the
 * commander.
 *
 * Kept as the game had it: the party's name is "Gruppo di" (the game took
 * out the leader's name), and the stalls start as nil, not empty (its
 * initialize set a local), so a stall the events never stocked reads nil.
 * The day's yield of an item no building makes is nil; the event that asks
 * whether it is under 2 is told yes.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param troopData
 * @text Troop table
 * @desc JSON: troop item id → [class id, character graphic, index].
 * @default {}
 *
 * @param troopNameflag
 * @text Troop name flags
 * @desc JSON: Troop.troop_nameflag.
 * @default []
 *
 * @param factionNames
 * @text Faction names
 * @desc JSON: faction → [name key, English name].
 * @default {}
 *
 * @param maxBattleMembers
 * @text Fighting members
 * @type number
 * @default 4
 *
 * @param maxItems
 * @text Most of one item
 * @type number
 * @default 999
 *
 * @param leaderActor
 * @text Leader actor
 * @type actor
 * @default 1
 *
 * @param commanderOffset
 * @text Commander armor offset
 * @desc A commander is the armor this many after the actor's id.
 * @type number
 * @default 100
 *
 * @param partyName
 * @text Party name
 * @default Gruppo di
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_PinnacleKingdom');
    const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
    const TROOPS = json(P.troopData, {});
    const NAMEFLAG = json(P.troopNameflag, []);
    const FACTIONS = json(P.factionNames, {});
    const MAX_BATTLE = Number(P.maxBattleMembers) || 4;
    const MAX_ITEMS = Number(P.maxItems) || 999;
    const LEADER = Number(P.leaderActor) || 1;
    const COMMANDER = P.commanderOffset === undefined || P.commanderOffset === '' ? 100 : Number(P.commanderOffset);
    const PARTY_NAME = P.partyName === undefined ? 'Gruppo di' : String(P.partyName);

    /** Ruby's == on the arrays events build: element by element, nil and undefined alike. */
    const same = (a, b) => {
        if (a == null || b == null) return a == null && b == null;
        if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
        return a === b;
    };
    /** A day's yield of every building: gold and items by id (Game_Interpreter#total_production's sums). */
    const production = () => {
        let money = 0;
        const items = [];
        for (const building of $gameParty.rrDailyIncome()) {
            if (!building) continue;
            for (const income of building.slice(1)) {
                if (!income) continue;
                if (income[0] != null) items[income[0]] = (items[income[0]] || 0) + income[1];
                else money += income[1];
            }
        }
        return { money, items };
    };
    window.RRPinnacleKingdom = {
        troopData: () => TROOPS,
        troopNameflag: () => NAMEFLAG,
        factionNames: () => FACTIONS,
        includes: (list, value) => Array.isArray(list) && list.some(x => same(x, value)),
        remove: (list, value) => {
            let found = null;
            if (Array.isArray(list)) for (let i = list.length - 1; i >= 0; i--) if (same(list[i], value)) { found = list[i]; list.splice(i, 1); }
            return found;
        },
        totalProduction: (item) => {
            const p = production();
            return Number(item) === 0 ? p.money : (p.items[item] ?? null);
        },
        commanderArmor: (actorId) => $dataArmors[actorId + COMMANDER] || null,
        same
    };

    //-------------------------------------------------------------------------
    // The story lines: story[-1] reads and writes the last line, as in Ruby
    //-------------------------------------------------------------------------
    const proxies = new WeakMap();
    const rubyIndex = (target, key) => {
        if (typeof key !== 'string' || !/^-\d+$/.test(key)) return key;
        return String(target.length + Number(key));
    };
    const rubyArray = (array) => {
        let proxy = proxies.get(array);
        if (!proxy) {
            proxy = new Proxy(array, {
                get: (t, k) => Reflect.get(t, rubyIndex(t, k)),
                set: (t, k, v) => Reflect.set(t, rubyIndex(t, k), v)
            });
            proxies.set(array, proxy);
        }
        return proxy;
    };

    //-------------------------------------------------------------------------
    // Game_Party
    //-------------------------------------------------------------------------
    const G = Game_Party.prototype;
    const _initialize = G.initialize;
    G.initialize = function() {
        _initialize.call(this);
        this._rrSavedTroops = [];
        this._rrSavedParty = [];
        this._rrConsumedItemValue = 0;
        this._rrShops = null;
        this._rrName = PARTY_NAME;
        this._rrFlag = 'Player1';
        this._rrDailyIncome = [];
        this._rrStory = [];
        this._rrPartyMode = null;
        this._rrMaxGold = null;
    };
    G.rrStory = function() {
        if (!Array.isArray(this._rrStory)) this._rrStory = [];
        return rubyArray(this._rrStory);
    };
    G.rrSetStory = function(lines) { this._rrStory = Array.isArray(lines) ? Array.from(lines) : lines; };
    G.rrDailyIncome = function() {
        if (!Array.isArray(this._rrDailyIncome)) this._rrDailyIncome = [];
        return this._rrDailyIncome;
    };
    G.rrSetDailyIncome = function(list) { this._rrDailyIncome = Array.isArray(list) ? Array.from(list) : []; };
    G.rrShops = function() { return this._rrShops ?? null; };
    G.rrSetShops = function(v) { this._rrShops = v; };
    G.rrPartyMode = function() { return this._rrPartyMode ?? null; };
    G.rrSetPartyMode = function(v) { this._rrPartyMode = v == null ? null : String(v); };
    G.rrSavedParty = function() { if (!Array.isArray(this._rrSavedParty)) this._rrSavedParty = []; return this._rrSavedParty; };
    G.rrSetSavedParty = function(ids) { this._rrSavedParty = Array.isArray(ids) ? Array.from(ids) : []; };
    G.rrSavedTroops = function() { if (!Array.isArray(this._rrSavedTroops)) this._rrSavedTroops = []; return this._rrSavedTroops; };
    G.rrSetSavedTroops = function(ids) { this._rrSavedTroops = Array.isArray(ids) ? Array.from(ids) : []; };
    G.rrConsumedItemValue = function() { return this._rrConsumedItemValue || 0; };
    G.rrSetConsumedItemValue = function(v) { this._rrConsumedItemValue = Number(v) || 0; };
    G.rrMaxGold = function() { return this._rrMaxGold ?? null; };
    G.rrSetMaxGold = function(v) { this._rrMaxGold = v; };
    G.rrFlag = function() { return this._rrFlag ?? 'Player1'; };
    G.rrSetFlag = function(v) { this._rrFlag = v; };
    G.rrSetName = function(v) { this._rrName = v; };
    G.rrIsTroopsMode = function() { return this.rrPartyMode() === 'troops'; };

    // The party's name is its own field: the game took out the leader's.
    G.name = function() { return this._rrName ?? PARTY_NAME; };
    G.maxBattleMembers = function() { return MAX_BATTLE; };
    // Actor 1 leads whoever is in the party.
    G.leader = function() { return $gameActors.actor(LEADER); };
    G.maxItems = function() { return MAX_ITEMS; };

    // Equipment the party loses is taken from the members set aside as well.
    G.discardMembersEquip = function(item, amount) {
        let n = amount;
        const members = this.members().concat(this.rrSavedParty().map(id => $gameActors.actor(id)).filter(Boolean));
        for (const actor of members) {
            while (n > 0 && actor.isEquipped(item)) {
                actor.discardEquip(item);
                n--;
            }
        }
    };
    // Every item used adds its price to the tally, consumable or not.
    const _consumeItem = G.consumeItem;
    G.consumeItem = function(item) {
        _consumeItem.call(this, item);
        this._rrConsumedItemValue = this.rrConsumedItemValue() + (item && item.price ? item.price : 0);
    };
    // An actor leaving takes their commander with them (from the bag or a member's equipment).
    const _removeActor = G.removeActor;
    G.removeActor = function(actorId, removeCommander = true) {
        _removeActor.call(this, actorId);
        const armor = removeCommander ? window.RRPinnacleKingdom.commanderArmor(actorId) : null;
        if (armor) this.loseItem(armor, 1, true);
    };
    // A save file shows every member, not only the fighting four.
    G.charactersForSavefile = function() { return this.members().map(a => [a.characterName(), a.characterIndex()]); };
    G.facesForSavefile = function() { return this.members().map(a => [a.faceName(), a.faceIndex()]); };

    //-------------------------------------------------------------------------
    // DataManager: a new game on any map; a save named after actor 1; a
    // save from an older version keeps its map
    //-------------------------------------------------------------------------
    const _setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function(mapId, x, y) {
        _setupNewGame.call(this);
        if (mapId) $gamePlayer.reserveTransfer(Number(mapId), x == null ? $dataSystem.startX : Number(x), y == null ? $dataSystem.startY : Number(y), 2, 0);
    };
    const _makeSavefileInfo = DataManager.makeSavefileInfo;
    DataManager.makeSavefileInfo = function() {
        const info = _makeSavefileInfo.call(this);
        const actor = $gameActors.actor(LEADER);
        info.rrName = actor ? actor.name() : '';
        return info;
    };
    if (typeof Scene_Load !== 'undefined') Scene_Load.prototype.reloadMapIfUpdated = function() {};
    DataManager.rrLookupLocText = function(text) { return window.RRKeyedText ? RRKeyedText.resolve(text) : text; };

    //-------------------------------------------------------------------------
    // SceneManager.scene: the scene a call just made, or the running one
    //-------------------------------------------------------------------------
    if (!SceneManager.rrScene) SceneManager.rrScene = function() { return this._nextScene || this._scene; };
})();
