//=============================================================================
// reactor_objects_battlers.js v1.7.0
//=============================================================================
// Game_BattlerBase, Game_Battler, Game_Actor, Game_Enemy, Game_Actors, Game_Unit, Game_Party and Game_Troop.
// Part of reactor_objects.js; loads after reactor_objects_actions.js.

//-----------------------------------------------------------------------------
// Game_BattlerBase
//
// The superclass of Game_Battler. It mainly contains parameters calculation.

function Game_BattlerBase() {
    this.initialize(...arguments);
}

Game_BattlerBase.TRAIT_ELEMENT_RATE = 11;
Game_BattlerBase.TRAIT_DEBUFF_RATE = 12;
Game_BattlerBase.TRAIT_STATE_RATE = 13;
Game_BattlerBase.TRAIT_STATE_RESIST = 14;
// Reactor's own: code 15 is unused by RPG Maker MZ.
Game_BattlerBase.TRAIT_BUFF_RATE = 15;
Game_BattlerBase.TRAIT_PARAM = 21;
Game_BattlerBase.TRAIT_XPARAM = 22;
Game_BattlerBase.TRAIT_SPARAM = 23;
Game_BattlerBase.TRAIT_ATTACK_ELEMENT = 31;
Game_BattlerBase.TRAIT_ATTACK_STATE = 32;
Game_BattlerBase.TRAIT_ATTACK_SPEED = 33;
Game_BattlerBase.TRAIT_ATTACK_TIMES = 34;
Game_BattlerBase.TRAIT_ATTACK_SKILL = 35;
Game_BattlerBase.TRAIT_STYPE_ADD = 41;
Game_BattlerBase.TRAIT_STYPE_SEAL = 42;
Game_BattlerBase.TRAIT_SKILL_ADD = 43;
Game_BattlerBase.TRAIT_SKILL_SEAL = 44;
Game_BattlerBase.TRAIT_EQUIP_WTYPE = 51;
Game_BattlerBase.TRAIT_EQUIP_ATYPE = 52;
Game_BattlerBase.TRAIT_EQUIP_LOCK = 53;
Game_BattlerBase.TRAIT_EQUIP_SEAL = 54;
Game_BattlerBase.TRAIT_SLOT_TYPE = 55;
Game_BattlerBase.TRAIT_ACTION_PLUS = 61;
Game_BattlerBase.TRAIT_SPECIAL_FLAG = 62;
Game_BattlerBase.TRAIT_COLLAPSE_TYPE = 63;
Game_BattlerBase.TRAIT_PARTY_ABILITY = 64;
Game_BattlerBase.FLAG_ID_AUTO_BATTLE = 0;
Game_BattlerBase.FLAG_ID_GUARD = 1;
Game_BattlerBase.FLAG_ID_SUBSTITUTE = 2;
Game_BattlerBase.FLAG_ID_PRESERVE_TP = 3;
Game_BattlerBase.ICON_BUFF_START = 32;
Game_BattlerBase.ICON_DEBUFF_START = 48;

Object.defineProperties(Game_BattlerBase.prototype, {
    // Hit Points
    hp: {
        get: function() {
            return this._hp;
        },
        configurable: true
    },
    // Magic Points
    mp: {
        get: function() {
            return this._mp;
        },
        configurable: true
    },
    // Tactical Points
    tp: {
        get: function() {
            return this._tp;
        },
        configurable: true
    },
    // Maximum Hit Points
    mhp: {
        get: function() {
            return this.param(0);
        },
        configurable: true
    },
    // Maximum Magic Points
    mmp: {
        get: function() {
            return this.param(1);
        },
        configurable: true
    },
    // ATtacK power
    atk: {
        get: function() {
            return this.param(2);
        },
        configurable: true
    },
    // DEFense power
    def: {
        get: function() {
            return this.param(3);
        },
        configurable: true
    },
    // Magic ATtack power
    mat: {
        get: function() {
            return this.param(4);
        },
        configurable: true
    },
    // Magic DeFense power
    mdf: {
        get: function() {
            return this.param(5);
        },
        configurable: true
    },
    // AGIlity
    agi: {
        get: function() {
            return this.param(6);
        },
        configurable: true
    },
    // LUcK
    luk: {
        get: function() {
            return this.param(7);
        },
        configurable: true
    },
    // HIT rate
    hit: {
        get: function() {
            return this.xparam(0);
        },
        configurable: true
    },
    // EVAsion rate
    eva: {
        get: function() {
            return this.xparam(1);
        },
        configurable: true
    },
    // CRItical rate
    cri: {
        get: function() {
            return this.xparam(2);
        },
        configurable: true
    },
    // Critical EVasion rate
    cev: {
        get: function() {
            return this.xparam(3);
        },
        configurable: true
    },
    // Magic EVasion rate
    mev: {
        get: function() {
            return this.xparam(4);
        },
        configurable: true
    },
    // Magic ReFlection rate
    mrf: {
        get: function() {
            return this.xparam(5);
        },
        configurable: true
    },
    // CouNTer attack rate
    cnt: {
        get: function() {
            return this.xparam(6);
        },
        configurable: true
    },
    // Hp ReGeneration rate
    hrg: {
        get: function() {
            return this.xparam(7);
        },
        configurable: true
    },
    // Mp ReGeneration rate
    mrg: {
        get: function() {
            return this.xparam(8);
        },
        configurable: true
    },
    // Tp ReGeneration rate
    trg: {
        get: function() {
            return this.xparam(9);
        },
        configurable: true
    },
    // TarGet Rate
    tgr: {
        get: function() {
            return this.sparam(0);
        },
        configurable: true
    },
    // GuaRD effect rate
    grd: {
        get: function() {
            return this.sparam(1);
        },
        configurable: true
    },
    // RECovery effect rate
    rec: {
        get: function() {
            return this.sparam(2);
        },
        configurable: true
    },
    // PHArmacology
    pha: {
        get: function() {
            return this.sparam(3);
        },
        configurable: true
    },
    // Mp Cost Rate
    mcr: {
        get: function() {
            return this.sparam(4);
        },
        configurable: true
    },
    // Tp Charge Rate
    tcr: {
        get: function() {
            return this.sparam(5);
        },
        configurable: true
    },
    // Physical Damage Rate
    pdr: {
        get: function() {
            return this.sparam(6);
        },
        configurable: true
    },
    // Magic Damage Rate
    mdr: {
        get: function() {
            return this.sparam(7);
        },
        configurable: true
    },
    // Floor Damage Rate
    fdr: {
        get: function() {
            return this.sparam(8);
        },
        configurable: true
    },
    // EXperience Rate
    exr: {
        get: function() {
            return this.sparam(9);
        },
        configurable: true
    }
});

Game_BattlerBase.prototype.initialize = function() {
    this.initMembers();
};

Game_BattlerBase.prototype.initMembers = function() {
    this._hp = 1;
    this._mp = 0;
    this._tp = 0;
    this._hidden = false;
    this.clearParamPlus();
    this.clearStates();
    this.clearBuffs();
};

Game_BattlerBase.prototype.clearParamPlus = function() {
    this._paramPlus = [0, 0, 0, 0, 0, 0, 0, 0];
    // Max TP grows too (Grow effect / Change Parameter with param 8), in
    // its own field: `_paramPlus` has exactly eight entries, one per paramId.
    this._maxTpPlus = 0;
};

/** The paramId Grow and Change Parameter use for Max TP. Not a `params` index. */
Game_BattlerBase.PARAM_MAX_TP = 8;

Game_BattlerBase.prototype.clearStates = function() {
    this._states = [];
    this._stateTurns = {};
};

Game_BattlerBase.prototype.eraseState = function(stateId) {
    this._states.remove(stateId);
    delete this._stateTurns[stateId];
};

Game_BattlerBase.prototype.isStateAffected = function(stateId) {
    return this._states.includes(stateId);
};

Game_BattlerBase.prototype.isDeathStateAffected = function() {
    return this.isStateAffected(this.deathStateId());
};

Game_BattlerBase.prototype.deathStateId = function() {
    return 1;
};

Game_BattlerBase.prototype.resetStateCounts = function(stateId) {
    const state = $dataStates[stateId];
    const variance = 1 + Math.max(state.maxTurns - state.minTurns, 0);
    this._stateTurns[stateId] = state.minTurns + Math.randomInt(variance);
};

/** Set how many turns a state the battler already has will last. */
Game_BattlerBase.prototype.setStateTurns = function(stateId, turns) {
    if (!this.isStateAffected(stateId)) return;
    this._stateTurns[stateId] = Math.max(0, Math.floor(Number(turns) || 0));
};

Game_BattlerBase.prototype.isStateExpired = function(stateId) {
    return this._stateTurns[stateId] === 0;
};

Game_BattlerBase.prototype.updateStateTurns = function() {
    for (const stateId of this._states) {
        if (this._stateTurns[stateId] > 0) {
            this._stateTurns[stateId]--;
        }
    }
};

Game_BattlerBase.prototype.clearBuffs = function() {
    this._buffs = [0, 0, 0, 0, 0, 0, 0, 0];
    this._buffTurns = [0, 0, 0, 0, 0, 0, 0, 0];
    this._buffPotency = [[], [], [], [], [], [], [], []];
};

Game_BattlerBase.prototype.eraseBuff = function(paramId) {
    this._buffs[paramId] = 0;
    this._buffTurns[paramId] = 0;
    this.buffPotencyList(paramId).length = 0;
};

/** How much one stack moves a parameter when the effect named no strength. */
Game_BattlerBase.BUFF_RATE_PER_STACK = 0.25;

/**
 * The strengths of a parameter's current buff or debuff stacks, one entry
 * per stack, oldest first. An entry is the rate that stack contributes
 * (0.4 for 40%), or null for "whatever the standard rate is", which is
 * resolved when the rate is read rather than when the stack is added.
 * Built on demand, so a save written before strengths existed still answers.
 */
Game_BattlerBase.prototype.buffPotencyList = function(paramId) {
    if (!this._buffPotency) this._buffPotency = [];
    if (!this._buffPotency[paramId]) this._buffPotency[paramId] = [];
    return this._buffPotency[paramId];
};

/**
 * The strength the effect being applied asked for, held only for as long
 * as it takes that effect to move the stack. null means it named none.
 */
Game_BattlerBase.prototype.setPendingBuffPotency = function(rate) {
    this._pendingBuffPotency = rate;
};

/**
 * Keep the strengths in step with the stack count: a stack gained takes
 * the strength the current effect asked for, a stack lost gives up the
 * most recent one. A parameter's stacks are all buffs or all debuffs --
 * the list empties as the count passes through zero -- so the direction
 * belongs to the count, not to the entries, which are magnitudes.
 */
Game_BattlerBase.prototype.shiftBuffPotency = function(paramId, before, after) {
    const list = this.buffPotencyList(paramId);
    if (Math.abs(after) > Math.abs(before)) {
        list.push(this._pendingBuffPotency ?? null);
    } else {
        list.pop();
    }
};

/**
 * A parameter's buff rate: every stack contributes its own strength and
 * they add up, with a stack that named none taking `standard`. A list
 * that has fallen out of step with the stack count -- a save from before
 * strengths existed, or a plugin moving `_buffs` itself -- is ignored in
 * favour of the standard rate for that many stacks, so the rate is never
 * silently wrong.
 */
Game_BattlerBase.buffRateFromStacks = function(level, list, standard) {
    const stacks = Math.abs(level || 0);
    if (!Array.isArray(list) || list.length !== stacks) {
        return Math.max(0, 1 + (level || 0) * standard);
    }
    const sign = level < 0 ? -1 : 1;
    let rate = 1;
    for (const entry of list) {
        rate += sign * (entry === null || entry === undefined ? standard : entry);
    }
    // Three stacks of 30% land on 0.09999999999999998, which every display
    // that floors a percent then reports as 9%. Round back to the figure
    // that was authored.
    return Math.max(0, Math.round(rate * 1e6) / 1e6);
};

Game_BattlerBase.prototype.buffLength = function() {
    return this._buffs.length;
};

Game_BattlerBase.prototype.buff = function(paramId) {
    return this._buffs[paramId];
};

Game_BattlerBase.prototype.isBuffAffected = function(paramId) {
    return this._buffs[paramId] > 0;
};

Game_BattlerBase.prototype.isDebuffAffected = function(paramId) {
    return this._buffs[paramId] < 0;
};

Game_BattlerBase.prototype.isBuffOrDebuffAffected = function(paramId) {
    return this._buffs[paramId] !== 0;
};

Game_BattlerBase.prototype.isMaxBuffAffected = function(paramId) {
    return this._buffs[paramId] === 2;
};

Game_BattlerBase.prototype.isMaxDebuffAffected = function(paramId) {
    return this._buffs[paramId] === -2;
};

Game_BattlerBase.prototype.increaseBuff = function(paramId) {
    if (!this.isMaxBuffAffected(paramId)) {
        const before = this._buffs[paramId];
        this._buffs[paramId]++;
        this.shiftBuffPotency(paramId, before, this._buffs[paramId]);
    }
};

Game_BattlerBase.prototype.decreaseBuff = function(paramId) {
    if (!this.isMaxDebuffAffected(paramId)) {
        const before = this._buffs[paramId];
        this._buffs[paramId]--;
        this.shiftBuffPotency(paramId, before, this._buffs[paramId]);
    }
};

Game_BattlerBase.prototype.overwriteBuffTurns = function(paramId, turns) {
    if (this._buffTurns[paramId] < turns) {
        this._buffTurns[paramId] = turns;
    }
};

Game_BattlerBase.prototype.isBuffExpired = function(paramId) {
    return this._buffTurns[paramId] === 0;
};

Game_BattlerBase.prototype.updateBuffTurns = function() {
    for (let i = 0; i < this._buffTurns.length; i++) {
        if (this._buffTurns[i] > 0) {
            this._buffTurns[i]--;
        }
    }
};

Game_BattlerBase.prototype.die = function() {
    this._hp = 0;
    this.clearStates();
    this.clearBuffs();
    ReactorEvents.emit("battlerDied", { battler: this });
};

Game_BattlerBase.prototype.revive = function() {
    if (this._hp === 0) {
        this._hp = 1;
    }
    ReactorEvents.emit("battlerRevived", { battler: this });
};

Game_BattlerBase.prototype.states = function() {
    return this._states.map(id => $dataStates[id]);
};

Game_BattlerBase.prototype.stateIcons = function() {
    return this.states()
        .map(state => state.iconIndex)
        .filter(iconIndex => iconIndex > 0);
};

Game_BattlerBase.prototype.buffIcons = function() {
    const icons = [];
    for (let i = 0; i < this._buffs.length; i++) {
        if (this._buffs[i] !== 0) {
            icons.push(this.buffIconIndex(this._buffs[i], i));
        }
    }
    return icons;
};

Game_BattlerBase.prototype.buffIconIndex = function(buffLevel, paramId) {
    if (buffLevel > 0) {
        return Game_BattlerBase.ICON_BUFF_START + (buffLevel - 1) * 8 + paramId;
    } else if (buffLevel < 0) {
        return (
            Game_BattlerBase.ICON_DEBUFF_START + (-buffLevel - 1) * 8 + paramId
        );
    } else {
        return 0;
    }
};

Game_BattlerBase.prototype.allIcons = function() {
    return this.stateIcons().concat(this.buffIcons());
};

Game_BattlerBase.prototype.traitObjects = function() {
    // Returns an array of the all objects having traits. States only here.
    return this.states();
};

Game_BattlerBase.prototype.allTraits = function() {
    return this.traitObjects().reduce((r, obj) => r.concat(obj.traits), []);
};

Game_BattlerBase.prototype.traits = function(code) {
    return this.allTraits().filter(trait => trait.code === code);
};

Game_BattlerBase.prototype.traitsWithId = function(code, id) {
    return this.allTraits().filter(
        trait => trait.code === code && trait.dataId === id
    );
};

Game_BattlerBase.prototype.traitsPi = function(code, id) {
    return this.traitsWithId(code, id).reduce((r, trait) => r * trait.value, 1);
};

Game_BattlerBase.prototype.traitsSum = function(code, id) {
    return this.traitsWithId(code, id).reduce((r, trait) => r + trait.value, 0);
};

Game_BattlerBase.prototype.traitsSumAll = function(code) {
    return this.traits(code).reduce((r, trait) => r + trait.value, 0);
};

Game_BattlerBase.prototype.traitsSet = function(code) {
    return this.traits(code).reduce((r, trait) => r.concat(trait.dataId), []);
};

Game_BattlerBase.prototype.paramBase = function(/*paramId*/) {
    return 0;
};

Game_BattlerBase.prototype.paramPlus = function(paramId) {
    return this._paramPlus[paramId];
};

Game_BattlerBase.prototype.paramBasePlus = function(paramId) {
    return Math.max(0, this.paramBase(paramId) + this.paramPlus(paramId));
};

Game_BattlerBase.prototype.paramMin = function(paramId) {
    if (paramId === 0) {
        return 1; // MHP
    } else {
        return 0;
    }
};

Game_BattlerBase.prototype.paramMax = function(/*paramId*/) {
    return Infinity;
};

Game_BattlerBase.prototype.paramRate = function(paramId) {
    return this.traitsPi(Game_BattlerBase.TRAIT_PARAM, paramId);
};

Game_BattlerBase.prototype.paramBuffRate = function(paramId) {
    return Game_BattlerBase.buffRateFromStacks(
        this._buffs[paramId],
        this._buffPotency ? this._buffPotency[paramId] : null,
        Game_BattlerBase.BUFF_RATE_PER_STACK
    );
};

Game_BattlerBase.prototype.param = function(paramId) {
    const value =
        this.paramBasePlus(paramId) *
        this.paramRate(paramId) *
        this.paramBuffRate(paramId);
    const maxValue = this.paramMax(paramId);
    const minValue = this.paramMin(paramId);
    return Math.round(value.clamp(minValue, maxValue));
};

Game_BattlerBase.prototype.xparam = function(xparamId) {
    return this.traitsSum(Game_BattlerBase.TRAIT_XPARAM, xparamId);
};

Game_BattlerBase.prototype.sparam = function(sparamId) {
    return this.traitsPi(Game_BattlerBase.TRAIT_SPARAM, sparamId);
};

Game_BattlerBase.prototype.elementRate = function(elementId) {
    return this.traitsPi(Game_BattlerBase.TRAIT_ELEMENT_RATE, elementId);
};

Game_BattlerBase.prototype.debuffRate = function(paramId) {
    return this.traitsPi(Game_BattlerBase.TRAIT_DEBUFF_RATE, paramId);
};

/**
 * The chance a buff on this parameter is accepted (Buff Rate trait). It
 * decides whether a buff lands, never how strong it is; traits multiply
 * together, so with none it is 1.
 */
Game_BattlerBase.prototype.buffRate = function(paramId) {
    return this.traitsPi(Game_BattlerBase.TRAIT_BUFF_RATE, paramId);
};

/**
 * One roll against buffRate, clamped to 0-100%. A sure answer either way
 * draws no random number, so a project without the trait sees the same
 * sequence from Math.random as before the trait existed.
 */
Game_BattlerBase.prototype.isBuffAccepted = function(paramId) {
    const chance = this.buffRate(paramId);
    if (!(chance < 1)) return true; // 100% or more, and a non-number
    if (chance <= 0) return false;
    return Math.random() < chance;
};

Game_BattlerBase.prototype.stateRate = function(stateId) {
    return this.traitsPi(Game_BattlerBase.TRAIT_STATE_RATE, stateId);
};

Game_BattlerBase.prototype.stateResistSet = function() {
    return this.traitsSet(Game_BattlerBase.TRAIT_STATE_RESIST);
};

Game_BattlerBase.prototype.isStateResist = function(stateId) {
    return this.stateResistSet().includes(stateId);
};

Game_BattlerBase.prototype.attackElements = function() {
    return this.traitsSet(Game_BattlerBase.TRAIT_ATTACK_ELEMENT);
};

Game_BattlerBase.prototype.attackStates = function() {
    return this.traitsSet(Game_BattlerBase.TRAIT_ATTACK_STATE);
};

Game_BattlerBase.prototype.attackStatesRate = function(stateId) {
    return this.traitsSum(Game_BattlerBase.TRAIT_ATTACK_STATE, stateId);
};

Game_BattlerBase.prototype.attackSpeed = function() {
    return this.traitsSumAll(Game_BattlerBase.TRAIT_ATTACK_SPEED);
};

Game_BattlerBase.prototype.attackTimesAdd = function() {
    return Math.max(this.traitsSumAll(Game_BattlerBase.TRAIT_ATTACK_TIMES), 0);
};

Game_BattlerBase.prototype.attackSkillId = function() {
    const set = this.traitsSet(Game_BattlerBase.TRAIT_ATTACK_SKILL);
    return set.length > 0 ? Math.max(...set) : 1;
};

Game_BattlerBase.prototype.addedSkillTypes = function() {
    return this.traitsSet(Game_BattlerBase.TRAIT_STYPE_ADD);
};

Game_BattlerBase.prototype.isSkillTypeSealed = function(stypeId) {
    return this.traitsSet(Game_BattlerBase.TRAIT_STYPE_SEAL).includes(stypeId);
};

Game_BattlerBase.prototype.addedSkills = function() {
    return this.traitsSet(Game_BattlerBase.TRAIT_SKILL_ADD);
};

Game_BattlerBase.prototype.isSkillSealed = function(skillId) {
    return this.traitsSet(Game_BattlerBase.TRAIT_SKILL_SEAL).includes(skillId);
};

Game_BattlerBase.prototype.isEquipWtypeOk = function(wtypeId) {
    return this.traitsSet(Game_BattlerBase.TRAIT_EQUIP_WTYPE).includes(wtypeId);
};

Game_BattlerBase.prototype.isEquipAtypeOk = function(atypeId) {
    return this.traitsSet(Game_BattlerBase.TRAIT_EQUIP_ATYPE).includes(atypeId);
};

Game_BattlerBase.prototype.isEquipTypeLocked = function(etypeId) {
    return this.traitsSet(Game_BattlerBase.TRAIT_EQUIP_LOCK).includes(etypeId);
};

Game_BattlerBase.prototype.isEquipTypeSealed = function(etypeId) {
    return this.traitsSet(Game_BattlerBase.TRAIT_EQUIP_SEAL).includes(etypeId);
};

Game_BattlerBase.prototype.slotType = function() {
    const set = this.traitsSet(Game_BattlerBase.TRAIT_SLOT_TYPE);
    return set.length > 0 ? Math.max(...set) : 0;
};

Game_BattlerBase.prototype.isDualWield = function() {
    return this.slotType() === 1;
};

// Slot layouts ($dataSystem.rrSlotLayouts: [{ name, slots: [etypeId, ...] }]): a Slot Type of 2 picks the
// first, 3 the second, and so on. Null for Normal, Dual Wield, or a layout the project does not have.
// With Equipment Slot Layouts off in Database > Reactor Features the project has none: a Slot Type that
// picked one is Normal, as RPG Maker MZ reads it.
Game_BattlerBase.SLOT_LAYOUT_BASE = 2;
Game_BattlerBase.prototype.slotLayout = function() {
    const index = this.slotType() - Game_BattlerBase.SLOT_LAYOUT_BASE;
    if (typeof ReactorFeatures !== "undefined" && !ReactorFeatures.on("equipSlotLayouts")) return null;
    const list = typeof $dataSystem !== 'undefined' && $dataSystem ? $dataSystem.rrSlotLayouts : null;
    const layout = index >= 0 && Array.isArray(list) ? list[index] : null;
    return layout && Array.isArray(layout.slots) ? layout : null;
};

Game_BattlerBase.prototype.actionPlusSet = function() {
    return this.traits(Game_BattlerBase.TRAIT_ACTION_PLUS).map(
        trait => trait.value
    );
};

Game_BattlerBase.prototype.specialFlag = function(flagId) {
    return this.traits(Game_BattlerBase.TRAIT_SPECIAL_FLAG).some(
        trait => trait.dataId === flagId
    );
};

// Collapse Effect values the battle modes ask about by name (the rest are looks of the same going).
Game_BattlerBase.COLLAPSE_INSTANT = 2;
Game_BattlerBase.COLLAPSE_NONE = 3;
Game_BattlerBase.COLLAPSE_CORPSE = 8;

Game_BattlerBase.prototype.collapseType = function() {
    const set = this.traitsSet(Game_BattlerBase.TRAIT_COLLAPSE_TYPE);
    return set.length > 0 ? Math.max(...set) : 0;
};

Game_BattlerBase.prototype.partyAbility = function(abilityId) {
    return this.traits(Game_BattlerBase.TRAIT_PARTY_ABILITY).some(
        trait => trait.dataId === abilityId
    );
};

Game_BattlerBase.prototype.isAutoBattle = function() {
    return this.specialFlag(Game_BattlerBase.FLAG_ID_AUTO_BATTLE);
};

Game_BattlerBase.prototype.isGuard = function() {
    return this.specialFlag(Game_BattlerBase.FLAG_ID_GUARD) && this.canMove();
};

Game_BattlerBase.prototype.isSubstitute = function() {
    return (
        this.specialFlag(Game_BattlerBase.FLAG_ID_SUBSTITUTE) && this.canMove()
    );
};

Game_BattlerBase.prototype.isPreserveTp = function() {
    return this.specialFlag(Game_BattlerBase.FLAG_ID_PRESERVE_TP);
};

Game_BattlerBase.prototype.addParam = function(paramId, value) {
    if (paramId === Game_BattlerBase.PARAM_MAX_TP) {
        this._maxTpPlus = (this._maxTpPlus || 0) + value;
    } else {
        this._paramPlus[paramId] += value;
    }
    this.refresh();
};

Game_BattlerBase.prototype.setHp = function(hp) {
    this._hp = hp;
    this.refresh();
};

Game_BattlerBase.prototype.setMp = function(mp) {
    this._mp = mp;
    this.refresh();
};

Game_BattlerBase.prototype.setTp = function(tp) {
    this._tp = tp;
    this.refresh();
};

Game_BattlerBase.prototype.maxTp = function() {
    // `|| 0`: a save from before Max TP could grow has no field.
    return Math.max(0, 100 + (this._maxTpPlus || 0));
};

Game_BattlerBase.prototype.refresh = function() {
    for (const stateId of this.stateResistSet()) {
        this.eraseState(stateId);
    }
    this._hp = this._hp.clamp(0, this.mhp);
    this._mp = this._mp.clamp(0, this.mmp);
    this._tp = this._tp.clamp(0, this.maxTp());
};

Game_BattlerBase.prototype.recoverAll = function() {
    this.clearStates();
    this._hp = this.mhp;
    this._mp = this.mmp;
};

Game_BattlerBase.prototype.hpRate = function() {
    return this.hp / this.mhp;
};

Game_BattlerBase.prototype.mpRate = function() {
    return this.mmp > 0 ? this.mp / this.mmp : 0;
};

Game_BattlerBase.prototype.tpRate = function() {
    return this.tp / this.maxTp();
};

Game_BattlerBase.prototype.hide = function() {
    this._hidden = true;
};

Game_BattlerBase.prototype.appear = function() {
    this._hidden = false;
};

Game_BattlerBase.prototype.isHidden = function() {
    return this._hidden;
};

Game_BattlerBase.prototype.isAppeared = function() {
    return !this.isHidden();
};

Game_BattlerBase.prototype.isDead = function() {
    return this.isAppeared() && this.isDeathStateAffected();
};

Game_BattlerBase.prototype.isAlive = function() {
    return this.isAppeared() && !this.isDeathStateAffected();
};

Game_BattlerBase.prototype.isDying = function() {
    return this.isAlive() && this._hp < this.mhp / 4;
};

Game_BattlerBase.prototype.isRestricted = function() {
    return this.isAppeared() && this.restriction() > 0;
};

Game_BattlerBase.prototype.canInput = function() {
    // prettier-ignore
    return this.isAppeared() && this.isActor() &&
            !this.isRestricted() && !this.isAutoBattle();
};

Game_BattlerBase.prototype.canMove = function() {
    return this.isAppeared() && this.restriction() < 4;
};

Game_BattlerBase.prototype.isConfused = function() {
    return (
        this.isAppeared() && this.restriction() >= 1 && this.restriction() <= 3
    );
};

Game_BattlerBase.prototype.confusionLevel = function() {
    return this.isConfused() ? this.restriction() : 0;
};

Game_BattlerBase.prototype.isActor = function() {
    return false;
};

Game_BattlerBase.prototype.isEnemy = function() {
    return false;
};

Game_BattlerBase.prototype.sortStates = function() {
    this._states.sort((a, b) => {
        const p1 = $dataStates[a].priority;
        const p2 = $dataStates[b].priority;
        if (p1 !== p2) {
            return p2 - p1;
        }
        return a - b;
    });
};

Game_BattlerBase.prototype.restriction = function() {
    const restrictions = this.states().map(state => state.restriction);
    return Math.max(0, ...restrictions);
};

Game_BattlerBase.prototype.addNewState = function(stateId) {
    if (stateId === this.deathStateId()) {
        this.die();
    }
    const restricted = this.isRestricted();
    this._states.push(stateId);
    this.sortStates();
    if (!restricted && this.isRestricted()) {
        this.onRestrict();
    }
};

Game_BattlerBase.prototype.onRestrict = function() {
    //
};

Game_BattlerBase.prototype.mostImportantStateText = function() {
    for (const state of this.states()) {
        if (state.message3) {
            return state.message3;
        }
    }
    return "";
};

Game_BattlerBase.prototype.stateMotionIndex = function() {
    const states = this.states();
    if (states.length > 0) {
        return states[0].motion;
    } else {
        return 0;
    }
};

Game_BattlerBase.prototype.stateOverlayIndex = function() {
    const states = this.states();
    if (states.length > 0) {
        return states[0].overlay;
    } else {
        return 0;
    }
};

Game_BattlerBase.prototype.isSkillWtypeOk = function(/*skill*/) {
    return true;
};

// Resource pools a project turned off (System.json rrPoolsOff: ["mp"], ["tp"] or both; set in
// Database > System 1 > Options). A pool that is off is hidden on every window and HUD, costs
// nothing (a skill priced in it stays usable) and, for TP, gains nothing. HP is never off.
Game_BattlerBase.isPoolOn = function(key) {
    const off = typeof $dataSystem !== "undefined" && $dataSystem ? $dataSystem.rrPoolsOff : null;
    return !(Array.isArray(off) && key !== "hp" && off.includes(key));
};

Game_BattlerBase.prototype.skillMpCost = function(skill) {
    return Game_BattlerBase.isPoolOn("mp") ? Math.floor(skill.mpCost * this.mcr) : 0;
};

Game_BattlerBase.prototype.skillTpCost = function(skill) {
    return Game_BattlerBase.isPoolOn("tp") ? skill.tpCost : 0;
};

Game_BattlerBase.prototype.canPaySkillCost = function(skill) {
    return (
        this._tp >= this.skillTpCost(skill) &&
        this._mp >= this.skillMpCost(skill)
    );
};

Game_BattlerBase.prototype.paySkillCost = function(skill) {
    this._mp -= this.skillMpCost(skill);
    this._tp -= this.skillTpCost(skill);
};

Game_BattlerBase.prototype.isOccasionOk = function(item) {
    if ($gameParty.inBattle()) {
        return item.occasion === 0 || item.occasion === 1;
    } else {
        return item.occasion === 0 || item.occasion === 2;
    }
};

Game_BattlerBase.prototype.meetsUsableItemConditions = function(item) {
    return this.canMove() && this.isOccasionOk(item);
};

Game_BattlerBase.prototype.meetsSkillConditions = function(skill) {
    return (
        this.meetsUsableItemConditions(skill) &&
        this.isSkillWtypeOk(skill) &&
        this.canPaySkillCost(skill) &&
        !this.isSkillSealed(skill.id) &&
        !this.isSkillTypeSealed(skill.stypeId)
    );
};

Game_BattlerBase.prototype.meetsItemConditions = function(item) {
    return this.meetsUsableItemConditions(item) && this.hasItemStock(item);
};

/**
 * Whether the party currently holds `item` for this battler to use.
 *
 * Split out of `meetsItemConditions` so that "can this battler act with this
 * item" and "is there any left" are separately overridable. A plugin that
 * prepays or waives an item's cost — a replayed action, a pair consumed up
 * front — can override this one method and leave every other usability
 * condition intact, including conditions added by plugins that alias
 * `meetsItemConditions`. Overriding `meetsItemConditions` or `Game_Action`'s
 * validity check instead means reimplementing that chain, which silently drops
 * any condition added to it later.
 *
 * @param {object} item
 * @returns {boolean}
 */
Game_BattlerBase.prototype.hasItemStock = function(item) {
    return $gameParty.hasItem(item);
};

Game_BattlerBase.prototype.canUse = function(item) {
    if (!item) {
        return false;
    } else if (DataManager.isSkill(item)) {
        return this.meetsSkillConditions(item);
    } else if (DataManager.isItem(item)) {
        return this.meetsItemConditions(item);
    } else {
        return false;
    }
};

Game_BattlerBase.prototype.canEquip = function(item) {
    if (!item) {
        return false;
    } else if (DataManager.isWeapon(item)) {
        return this.canEquipWeapon(item);
    } else if (DataManager.isArmor(item)) {
        return this.canEquipArmor(item);
    } else {
        return false;
    }
};

Game_BattlerBase.prototype.canEquipWeapon = function(item) {
    return (
        this.isEquipWtypeOk(item.wtypeId) &&
        !this.isEquipTypeSealed(item.etypeId)
    );
};

Game_BattlerBase.prototype.canEquipArmor = function(item) {
    return (
        this.isEquipAtypeOk(item.atypeId) &&
        !this.isEquipTypeSealed(item.etypeId)
    );
};

Game_BattlerBase.prototype.guardSkillId = function() {
    // Imported XP games keep their own skill 2; the importer appends Guard and names it here.
    return ($dataSystem && $dataSystem.rrGuardSkillId) || 2;
};

Game_BattlerBase.prototype.canAttack = function() {
    return this.canUse($dataSkills[this.attackSkillId()]);
};

Game_BattlerBase.prototype.canGuard = function() {
    return this.canUse($dataSkills[this.guardSkillId()]);
};

//-----------------------------------------------------------------------------
// Game_Battler
//
// The superclass of Game_Actor and Game_Enemy. It contains methods for sprites
// and actions.

function Game_Battler() {
    this.initialize(...arguments);
}

Game_Battler.prototype = Object.create(Game_BattlerBase.prototype);
Game_Battler.prototype.constructor = Game_Battler;

Game_Battler.prototype.initialize = function() {
    Game_BattlerBase.prototype.initialize.call(this);
};

Game_Battler.prototype.initMembers = function() {
    Game_BattlerBase.prototype.initMembers.call(this);
    this._actions = [];
    this._speed = 0;
    this._result = new Game_ActionResult();
    this._actionState = "";
    this._lastTargetIndex = 0;
    this._damagePopup = false;
    this._effectType = null;
    this._motionType = null;
    this._weaponImageId = 0;
    this._motionRefresh = false;
    this._selected = false;
    this._tpbState = "";
    this._tpbChargeTime = 0;
    this._tpbCastTime = 0;
    this._tpbIdleTime = 0;
    this._tpbTurnCount = 0;
    this._tpbTurnEnd = false;
};

Game_Battler.prototype.clearDamagePopup = function() {
    this._damagePopup = false;
};

Game_Battler.prototype.clearWeaponAnimation = function() {
    this._weaponImageId = 0;
};

Game_Battler.prototype.clearEffect = function() {
    this._effectType = null;
};

Game_Battler.prototype.clearMotion = function() {
    this._motionType = null;
    this._motionRefresh = false;
};

Game_Battler.prototype.requestEffect = function(effectType) {
    this._effectType = effectType;
};

Game_Battler.prototype.requestMotion = function(motionType) {
    this._motionType = motionType;
};

Game_Battler.prototype.requestMotionRefresh = function() {
    this._motionRefresh = true;
};

Game_Battler.prototype.cancelMotionRefresh = function() {
    this._motionRefresh = false;
};

Game_Battler.prototype.select = function() {
    this._selected = true;
};

Game_Battler.prototype.deselect = function() {
    this._selected = false;
};

Game_Battler.prototype.isDamagePopupRequested = function() {
    return this._damagePopup;
};

Game_Battler.prototype.isEffectRequested = function() {
    return !!this._effectType;
};

Game_Battler.prototype.isMotionRequested = function() {
    return !!this._motionType;
};

Game_Battler.prototype.isWeaponAnimationRequested = function() {
    return this._weaponImageId > 0;
};

Game_Battler.prototype.isMotionRefreshRequested = function() {
    return this._motionRefresh;
};

Game_Battler.prototype.isSelected = function() {
    return this._selected;
};

Game_Battler.prototype.effectType = function() {
    return this._effectType;
};

Game_Battler.prototype.motionType = function() {
    return this._motionType;
};

Game_Battler.prototype.weaponImageId = function() {
    return this._weaponImageId;
};

Game_Battler.prototype.startDamagePopup = function() {
    this._damagePopup = true;
};

Game_Battler.prototype.shouldPopupDamage = function() {
    const result = this._result;
    return (
        result.missed ||
        result.evaded ||
        result.hpAffected ||
        result.mpDamage !== 0
    );
};

Game_Battler.prototype.startWeaponAnimation = function(weaponImageId) {
    this._weaponImageId = weaponImageId;
};

Game_Battler.prototype.action = function(index) {
    return this._actions[index];
};

Game_Battler.prototype.setAction = function(index, action) {
    this._actions[index] = action;
};

Game_Battler.prototype.numActions = function() {
    return this._actions.length;
};

Game_Battler.prototype.clearActions = function() {
    this._actions = [];
};

Game_Battler.prototype.result = function() {
    return this._result;
};

Game_Battler.prototype.clearResult = function() {
    this._result.clear();
};

Game_Battler.prototype.clearTpbChargeTime = function() {
    this._tpbState = "charging";
    this._tpbChargeTime = 0;
};

Game_Battler.prototype.applyTpbPenalty = function() {
    this._tpbState = "charging";
    this._tpbChargeTime -= 1;
};

Game_Battler.prototype.initTpbChargeTime = function(advantageous) {
    const speed = this.tpbRelativeSpeed();
    this._tpbState = "charging";
    this._tpbChargeTime = advantageous ? 1 : speed * Math.random() * 0.5;
    if (this.isRestricted()) {
        this._tpbChargeTime = 0;
    }
};

Game_Battler.prototype.tpbChargeTime = function() {
    return this._tpbChargeTime;
};

Game_Battler.prototype.startTpbCasting = function() {
    this._tpbState = "casting";
    this._tpbCastTime = 0;
};

Game_Battler.prototype.startTpbAction = function() {
    this._tpbState = "acting";
};

Game_Battler.prototype.isTpbCharged = function() {
    return this._tpbState === "charged";
};

Game_Battler.prototype.isTpbReady = function() {
    return this._tpbState === "ready";
};

Game_Battler.prototype.isTpbTimeout = function() {
    return this._tpbIdleTime >= 1;
};

Game_Battler.prototype.updateTpb = function() {
    if (this.canMove()) {
        this.updateTpbChargeTime();
        this.updateTpbCastTime();
        this.updateTpbAutoBattle();
    }
    if (this.isAlive()) {
        this.updateTpbIdleTime();
    }
};

Game_Battler.prototype.updateTpbChargeTime = function() {
    if (this._tpbState === "charging") {
        this._tpbChargeTime += this.tpbAcceleration();
        if (this._tpbChargeTime >= 1) {
            this._tpbChargeTime = 1;
            this.onTpbCharged();
        }
    }
};

Game_Battler.prototype.updateTpbCastTime = function() {
    if (this._tpbState === "casting") {
        this._tpbCastTime += this.tpbAcceleration();
        if (this._tpbCastTime >= this.tpbRequiredCastTime()) {
            this._tpbCastTime = this.tpbRequiredCastTime();
            this._tpbState = "ready";
        }
    }
};

Game_Battler.prototype.updateTpbAutoBattle = function() {
    if (this.isTpbCharged() && !this.isTpbTurnEnd() && this.isAutoBattle()) {
        this.makeTpbActions();
    }
};

Game_Battler.prototype.updateTpbIdleTime = function() {
    if (!this.canMove() || this.isTpbCharged()) {
        this._tpbIdleTime += this.tpbAcceleration();
    }
};

Game_Battler.prototype.tpbAcceleration = function() {
    const speed = this.tpbRelativeSpeed();
    const referenceTime = $gameParty.tpbReferenceTime();
    return speed / referenceTime;
};

Game_Battler.prototype.tpbRelativeSpeed = function() {
    return this.tpbSpeed() / $gameParty.tpbBaseSpeed();
};

Game_Battler.prototype.tpbSpeed = function() {
    return Math.sqrt(this.agi) + 1;
};

Game_Battler.prototype.tpbBaseSpeed = function() {
    const baseAgility = this.paramBasePlus(6);
    return Math.sqrt(baseAgility) + 1;
};

Game_Battler.prototype.tpbRequiredCastTime = function() {
    const actions = this._actions.filter(action => action.isValid());
    const items = actions.map(action => action.item());
    const delay = items.reduce((r, item) => r + Math.max(0, -item.speed), 0);
    return Math.sqrt(delay) / this.tpbSpeed();
};

Game_Battler.prototype.onTpbCharged = function() {
    if (!this.shouldDelayTpbCharge()) {
        this.finishTpbCharge();
    }
};

Game_Battler.prototype.shouldDelayTpbCharge = function() {
    return !BattleManager.isActiveTpb() && $gameParty.canInput();
};

Game_Battler.prototype.finishTpbCharge = function() {
    this._tpbState = "charged";
    this._tpbTurnEnd = true;
    this._tpbIdleTime = 0;
};

Game_Battler.prototype.isTpbTurnEnd = function() {
    return this._tpbTurnEnd;
};

Game_Battler.prototype.initTpbTurn = function() {
    this._tpbTurnEnd = false;
    this._tpbTurnCount = 0;
    this._tpbIdleTime = 0;
};

Game_Battler.prototype.startTpbTurn = function() {
    this._tpbTurnEnd = false;
    this._tpbTurnCount++;
    this._tpbIdleTime = 0;
    if (this.numActions() === 0) {
        this.makeTpbActions();
    }
};

Game_Battler.prototype.makeTpbActions = function() {
    this.makeActions();
    if (this.canInput()) {
        this.setActionState("undecided");
    } else {
        this.startTpbCasting();
        this.setActionState("waiting");
    }
};

Game_Battler.prototype.onTpbTimeout = function() {
    this.onAllActionsEnd();
    this._tpbTurnEnd = true;
    this._tpbIdleTime = 0;
};

Game_Battler.prototype.turnCount = function() {
    if (BattleManager.isTpb()) {
        return this._tpbTurnCount;
    } else {
        return $gameTroop.turnCount() + 1;
    }
};

Game_Battler.prototype.canInput = function() {
    if (BattleManager.isTpb() && !this.isTpbCharged()) {
        return false;
    }
    return Game_BattlerBase.prototype.canInput.call(this);
};

Game_Battler.prototype.refresh = function() {
    Game_BattlerBase.prototype.refresh.call(this);
    if (this.hp === 0) {
        this.addState(this.deathStateId());
    } else {
        this.removeState(this.deathStateId());
    }
};

Game_Battler.prototype.addState = function(stateId) {
    if (this.isStateAddable(stateId)) {
        const renewed = this.isStateAffected(stateId);
        if (!renewed) {
            this.addNewState(stateId);
            // addNewState is where a plugin turns a state away after it was found
            // addable -- an auto-life or a last-gasp skill refusing death. Nothing
            // was added then, so nothing is recorded or reported: a result that
            // lists the death state makes the battle log collapse a battler who is
            // still standing.
            const landed = this.isStateAffected(stateId);
            this.refresh();
            if (!landed) {
                this._result.pushBlockedState(stateId);
                return;
            }
        }
        this.resetStateCounts(stateId);
        const firstLanding = !this._result.isStateAdded(stateId);
        this._result.pushAddedState(stateId);
        if (renewed && firstLanding) {
            this._result.pushRenewedState(stateId);
        }
        ReactorEvents.emit("stateAdded", { battler: this, stateId, renewed });
    } else if ($dataStates[stateId] && !this.isStateAffected(stateId)) {
        // Asked for and not there: resisted, restricted, or the battler is
        // dead. A state it already has is not blocked -- a fallen battler's
        // refresh asks for death again every time.
        this._result.pushBlockedState(stateId);
    }
};

Game_Battler.prototype.isStateAddable = function(stateId) {
    return (
        this.isAlive() &&
        $dataStates[stateId] &&
        !this.isStateResist(stateId) &&
        !this.isStateRestrict(stateId)
    );
};

Game_Battler.prototype.isStateRestrict = function(stateId) {
    return $dataStates[stateId].removeByRestriction && this.isRestricted();
};

Game_Battler.prototype.onRestrict = function() {
    Game_BattlerBase.prototype.onRestrict.call(this);
    this.clearTpbChargeTime();
    this.clearActions();
    for (const state of this.states()) {
        if (state.removeByRestriction) {
            this.removeState(state.id);
        }
    }
};

Game_Battler.prototype.removeState = function(stateId) {
    if (this.isStateAffected(stateId)) {
        if (stateId === this.deathStateId()) {
            this.revive();
        }
        this.eraseState(stateId);
        this.refresh();
        this._result.pushRemovedState(stateId);
        ReactorEvents.emit("stateRemoved", { battler: this, stateId });
    }
};

Game_Battler.prototype.escape = function() {
    if ($gameParty.inBattle()) {
        this.hide();
    }
    this.clearActions();
    this.clearStates();
    SoundManager.playEscape();
};

Game_Battler.prototype.addBuff = function(paramId, turns) {
    if (this.isAlive()) {
        this.increaseBuff(paramId);
        if (this.isBuffAffected(paramId)) {
            this.overwriteBuffTurns(paramId, turns);
        }
        this._result.pushAddedBuff(paramId);
        this.refresh();
    }
};

Game_Battler.prototype.addDebuff = function(paramId, turns) {
    if (this.isAlive()) {
        this.decreaseBuff(paramId);
        if (this.isDebuffAffected(paramId)) {
            this.overwriteBuffTurns(paramId, turns);
        }
        this._result.pushAddedDebuff(paramId);
        this.refresh();
    }
};

/**
 * The Buff Rate gate (trait 15). Plugins hang behaviour on both methods a
 * buff passes through - VisuMZ_2_EnhancedTpSystem grants TP from
 * itemEffectAddBuff whenever the target's result is already a success, and
 * SkillsStatesCore and BattleVoices react inside addBuff - so a rejected
 * buff has to stop before any of them runs. Installed once the plugins
 * have loaded, the gate is the outermost wrapper of each.
 *
 * An Add Buff effect rolls once, and a buff it accepts leaves a one-use
 * pass for the addBuff call it goes on to make, so that call does not roll
 * a second time. Every other addBuff - an event's script, a plugin - rolls
 * for itself. The pass is spent before the call it covers and put back as
 * it was when the effect returns or throws, so it cannot reach a later or
 * nested call.
 */
Game_Battler._buffRatePass = null;

Game_Battler.installBuffRateGate = function() {
    if (Game_Battler._buffRateGateInstalled) return false;
    Game_Battler._buffRateGateInstalled = true;
    const addBuff = Game_Battler.prototype.addBuff;
    Game_Battler.prototype.addBuff = function(paramId) {
        const pass = Game_Battler._buffRatePass;
        if (pass && pass.battler === this && pass.paramId === paramId) {
            Game_Battler._buffRatePass = null;
        } else if (!this.isBuffAccepted(paramId)) {
            return undefined;
        }
        return addBuff.apply(this, arguments);
    };
    const itemEffectAddBuff = Game_Action.prototype.itemEffectAddBuff;
    Game_Action.prototype.itemEffectAddBuff = function(target, effect) {
        if (!target.isBuffAccepted(effect.dataId)) return undefined;
        const outer = Game_Battler._buffRatePass;
        Game_Battler._buffRatePass = { battler: target, paramId: effect.dataId };
        try {
            return itemEffectAddBuff.apply(this, arguments);
        } finally {
            Game_Battler._buffRatePass = outer;
        }
    };
    return true;
};

Game_Battler.prototype.removeBuff = function(paramId) {
    if (this.isAlive() && this.isBuffOrDebuffAffected(paramId)) {
        this.eraseBuff(paramId);
        this._result.pushRemovedBuff(paramId);
        this.refresh();
    }
};

Game_Battler.prototype.removeBattleStates = function() {
    for (const state of this.states()) {
        if (state.removeAtBattleEnd) {
            this.removeState(state.id);
        }
    }
};

Game_Battler.prototype.removeAllBuffs = function() {
    for (let i = 0; i < this.buffLength(); i++) {
        this.removeBuff(i);
    }
};

Game_Battler.prototype.removeStatesAuto = function(timing) {
    for (const state of this.states()) {
        if (
            this.isStateExpired(state.id) &&
            state.autoRemovalTiming === timing
        ) {
            this.removeState(state.id);
        }
    }
};

Game_Battler.prototype.removeBuffsAuto = function() {
    for (let i = 0; i < this.buffLength(); i++) {
        if (this.isBuffExpired(i)) {
            this.removeBuff(i);
        }
    }
};

Game_Battler.prototype.removeStatesByDamage = function() {
    for (const state of this.states()) {
        if (
            state.removeByDamage &&
            Math.randomInt(100) < state.chanceByDamage
        ) {
            this.removeState(state.id);
        }
    }
};

Game_Battler.prototype.makeActionTimes = function() {
    const actionPlusSet = this.actionPlusSet();
    return actionPlusSet.reduce((r, p) => (Math.random() < p ? r + 1 : r), 1);
};

Game_Battler.prototype.makeActions = function() {
    this.clearActions();
    if (this.canMove()) {
        const actionTimes = this.makeActionTimes();
        this._actions = [];
        for (let i = 0; i < actionTimes; i++) {
            this._actions.push(new Game_Action(this));
        }
    }
};

Game_Battler.prototype.speed = function() {
    return this._speed;
};

Game_Battler.prototype.makeSpeed = function() {
    this._speed = Math.min(...this._actions.map(action => action.speed())) || 0;
};

Game_Battler.prototype.currentAction = function() {
    return this._actions[0];
};

Game_Battler.prototype.removeCurrentAction = function() {
    this._actions.shift();
};

Game_Battler.prototype.setLastTarget = function(target) {
    this._lastTargetIndex = target ? target.index() : 0;
};

Game_Battler.prototype.forceAction = function(skillId, targetIndex) {
    this.clearActions();
    const action = new Game_Action(this, true);
    action.setSkill(skillId);
    if (targetIndex === -2) {
        action.setTarget(this._lastTargetIndex);
    } else if (targetIndex === -1) {
        action.decideRandomTarget();
    } else {
        action.setTarget(targetIndex);
    }
    if (action.item()) {
        this._actions.push(action);
    }
};

Game_Battler.prototype.useItem = function(item) {
    if (DataManager.isSkill(item)) {
        this.paySkillCost(item);
    } else if (DataManager.isItem(item)) {
        this.consumeItem(item);
    }
};

Game_Battler.prototype.consumeItem = function(item) {
    $gameParty.consumeItem(item);
};

Game_Battler.prototype.gainHp = function(value) {
    const before = this.hp;
    this._result.hpDamage = -value;
    this._result.hpAffected = true;
    this.setHp(this.hp + value);
    ReactorEvents.emit("hpChanged", { battler: this, delta: value, before, after: this.hp });
};

Game_Battler.prototype.gainMp = function(value) {
    const before = this.mp;
    this._result.mpDamage = -value;
    this.setMp(this.mp + value);
    ReactorEvents.emit("mpChanged", { battler: this, delta: value, before, after: this.mp });
};

Game_Battler.prototype.gainTp = function(value) {
    const before = this.tp;
    this._result.tpDamage = -value;
    this.setTp(this.tp + value);
    ReactorEvents.emit("tpChanged", { battler: this, delta: value, before, after: this.tp, silent: false });
};

Game_Battler.prototype.gainSilentTp = function(value) {
    const before = this.tp;
    this.setTp(this.tp + value);
    ReactorEvents.emit("tpChanged", { battler: this, delta: value, before, after: this.tp, silent: true });
};

Game_Battler.prototype.initTp = function() {
    this.setTp(Game_BattlerBase.isPoolOn("tp") ? Math.randomInt(25) : 0);
};

Game_Battler.prototype.clearTp = function() {
    this.setTp(0);
};

Game_Battler.prototype.chargeTpByDamage = function(damageRate) {
    if (!Game_BattlerBase.isPoolOn("tp")) return;
    const value = Math.floor(50 * damageRate * this.tcr);
    this.gainSilentTp(value);
};

Game_Battler.prototype.regenerateHp = function() {
    const minRecover = -this.maxSlipDamage();
    const value = Math.max(Math.floor(this.mhp * this.hrg), minRecover);
    if (value !== 0) {
        this.gainHp(value);
    }
};

Game_Battler.prototype.maxSlipDamage = function() {
    return $dataSystem.optSlipDeath ? this.hp : Math.max(this.hp - 1, 0);
};

Game_Battler.prototype.regenerateMp = function() {
    const value = Math.floor(this.mmp * this.mrg);
    if (value !== 0) {
        this.gainMp(value);
    }
};

Game_Battler.prototype.regenerateTp = function() {
    if (!Game_BattlerBase.isPoolOn("tp")) return;
    const value = Math.floor(100 * this.trg);
    this.gainSilentTp(value);
};

Game_Battler.prototype.regenerateAll = function() {
    if (this.isAlive()) {
        this.regenerateHp();
        this.regenerateMp();
        this.regenerateTp();
    }
};

Game_Battler.prototype.onBattleStart = function(advantageous) {
    this.setActionState("undecided");
    this.clearMotion();
    this.initTpbChargeTime(advantageous);
    this.initTpbTurn();
    if (!this.isPreserveTp()) {
        this.initTp();
    }
};

Game_Battler.prototype.onAllActionsEnd = function() {
    this.clearResult();
    this.removeStatesAuto(1);
    this.removeBuffsAuto();
};

Game_Battler.prototype.onTurnEnd = function() {
    this.clearResult();
    this.regenerateAll();
    this.updateStateTurns();
    this.updateBuffTurns();
    this.removeStatesAuto(2);
};

Game_Battler.prototype.onBattleEnd = function() {
    this.clearResult();
    this.removeBattleStates();
    this.removeAllBuffs();
    this.clearActions();
    if (!this.isPreserveTp()) {
        this.clearTp();
    }
    this.appear();
};

Game_Battler.prototype.onDamage = function(value) {
    this.removeStatesByDamage();
    this.chargeTpByDamage(value / this.mhp);
};

Game_Battler.prototype.setActionState = function(actionState) {
    this._actionState = actionState;
    this.requestMotionRefresh();
};

Game_Battler.prototype.isUndecided = function() {
    return this._actionState === "undecided";
};

Game_Battler.prototype.isInputting = function() {
    return this._actionState === "inputting";
};

Game_Battler.prototype.isWaiting = function() {
    return this._actionState === "waiting";
};

Game_Battler.prototype.isActing = function() {
    return this._actionState === "acting";
};

Game_Battler.prototype.isChanting = function() {
    if (this.isWaiting()) {
        return this._actions.some(action => action.isMagicSkill());
    }
    return false;
};

Game_Battler.prototype.isGuardWaiting = function() {
    if (this.isWaiting()) {
        return this._actions.some(action => action.isGuard());
    }
    return false;
};

Game_Battler.prototype.performActionStart = function(action) {
    if (!action.isGuard()) {
        this.setActionState("acting");
    }
};

Game_Battler.prototype.performAction = function(/*action*/) {
    //
};

Game_Battler.prototype.performActionEnd = function() {
    //
};

Game_Battler.prototype.performDamage = function() {
    //
};

Game_Battler.prototype.performMiss = function() {
    SoundManager.playMiss();
};

Game_Battler.prototype.performRecovery = function() {
    SoundManager.playRecovery();
};

Game_Battler.prototype.performMpRecovery = function() {
    SoundManager.playMpRecovery();
};

Game_Battler.prototype.performTpRecovery = function() {
    SoundManager.playTpRecovery();
};

Game_Battler.prototype.performEvasion = function() {
    SoundManager.playEvasion();
};

Game_Battler.prototype.performMagicEvasion = function() {
    SoundManager.playMagicEvasion();
};

Game_Battler.prototype.performCounter = function() {
    SoundManager.playEvasion();
};

Game_Battler.prototype.performReflection = function() {
    SoundManager.playReflection();
};

Game_Battler.prototype.performSubstitute = function(/*target*/) {
    //
};

Game_Battler.prototype.performCollapse = function() {
    //
};

//-----------------------------------------------------------------------------
// Game_Actor
//
// The game object class for an actor.

function Game_Actor() {
    this.initialize(...arguments);
}

Game_Actor.prototype = Object.create(Game_Battler.prototype);
Game_Actor.prototype.constructor = Game_Actor;

Object.defineProperty(Game_Actor.prototype, "level", {
    get: function() {
        return this._level;
    },
    configurable: true
});

Game_Actor.prototype.initialize = function(actorId) {
    Game_Battler.prototype.initialize.call(this);
    this.setup(actorId);
};

Game_Actor.prototype.initMembers = function() {
    Game_Battler.prototype.initMembers.call(this);
    this._actorId = 0;
    this._name = "";
    this._nickname = "";
    this._classId = 0;
    this._level = 0;
    this._characterName = "";
    this._characterIndex = 0;
    this._faceName = "";
    this._faceIndex = 0;
    this._battlerName = "";
    this._exp = {};
    this._skills = [];
    this._equips = [];
    this._actionInputIndex = 0;
    this._lastMenuSkill = new Game_Item();
    this._lastBattleSkill = new Game_Item();
    this._lastCommandSymbol = "";
};

Game_Actor.prototype.setup = function(actorId) {
    const actor = $dataActors[actorId];
    this._actorId = actorId;
    this._name = actor.name;
    this._nickname = actor.nickname;
    this._profile = actor.profile;
    this._classId = actor.classId;
    const maximumLevel = Math.max(1, Math.min(9999, Math.floor(Number(actor.maxLevel) || 99)));
    this._level = Math.max(1, Math.min(maximumLevel, Math.floor(Number(actor.initialLevel) || 1)));
    this.initImages();
    this.initExp();
    this.initSkills();
    this.initEquips(actor.equips);
    this.clearParamPlus();
    this.recoverAll();
};

Game_Actor.prototype.actorId = function() {
    return this._actorId;
};

Game_Actor.prototype.actor = function() {
    return $dataActors[this._actorId];
};

Game_Actor.prototype.name = function() {
    return this._name;
};

Game_Actor.prototype.setName = function(name) {
    this._name = name;
};

Game_Actor.prototype.nickname = function() {
    return this._nickname;
};

Game_Actor.prototype.setNickname = function(nickname) {
    this._nickname = nickname;
};

Game_Actor.prototype.profile = function() {
    return this._profile;
};

Game_Actor.prototype.setProfile = function(profile) {
    this._profile = profile;
};

Game_Actor.prototype.characterName = function() {
    return this._characterName;
};

Game_Actor.prototype.characterIndex = function() {
    return this._characterIndex;
};

Game_Actor.prototype.faceName = function() {
    return this._faceName;
};

Game_Actor.prototype.faceIndex = function() {
    return this._faceIndex;
};

Game_Actor.prototype.battlerName = function() {
    return this._battlerName;
};

Game_Actor.prototype.clearStates = function() {
    Game_Battler.prototype.clearStates.call(this);
    this._stateSteps = {};
};

Game_Actor.prototype.eraseState = function(stateId) {
    Game_Battler.prototype.eraseState.call(this, stateId);
    delete this._stateSteps[stateId];
};

Game_Actor.prototype.resetStateCounts = function(stateId) {
    Game_Battler.prototype.resetStateCounts.call(this, stateId);
    this._stateSteps[stateId] = $dataStates[stateId].stepsToRemove;
};

Game_Actor.prototype.initImages = function() {
    const actor = this.actor();
    this._characterName = actor.characterName;
    this._characterIndex = actor.characterIndex;
    this._faceName = actor.faceName;
    this._faceIndex = actor.faceIndex;
    this._battlerName = actor.battlerName;
};

Game_Actor.prototype.expForLevel = function(level) {
    const c = this.currentClass();
    const basis = c.expParams[0];
    const extra = c.expParams[1];
    const acc_a = c.expParams[2];
    const acc_b = c.expParams[3];
    return Math.round(
        (basis * Math.pow(level - 1, 0.9 + acc_a / 250) * level * (level + 1)) /
            (6 + Math.pow(level, 2) / 50 / acc_b) +
            (level - 1) * extra
    );
};

Game_Actor.prototype.initExp = function() {
    this._exp[this._classId] = this.currentLevelExp();
};

Game_Actor.prototype.currentExp = function() {
    return this._exp[this._classId];
};

Game_Actor.prototype.currentLevelExp = function() {
    return this.expForLevel(this._level);
};

Game_Actor.prototype.nextLevelExp = function() {
    return this.expForLevel(this._level + 1);
};

Game_Actor.prototype.nextRequiredExp = function() {
    return this.nextLevelExp() - this.currentExp();
};

Game_Actor.prototype.maxLevel = function() {
    return Math.max(1, Math.min(9999, Math.floor(Number(this.actor().maxLevel) || 99)));
};

Game_Actor.prototype.isMaxLevel = function() {
    return this._level >= this.maxLevel();
};

Game_Actor.prototype.initSkills = function() {
    this._skills = [];
    for (const learning of this.currentClass().learnings) {
        if (learning.level <= this._level) {
            this.learnSkill(learning.skillId);
        }
    }
};

Game_Actor.prototype.initEquips = function(equips) {
    const slots = this.equipSlots();
    const maxSlots = slots.length;
    this._equips = [];
    for (let i = 0; i < maxSlots; i++) {
        this._equips[i] = new Game_Item();
    }
    for (let j = 0; j < equips.length; j++) {
        if (j < maxSlots) {
            this._equips[j].setEquip(slots[j] === 1, equips[j]);
        }
    }
    this.releaseUnequippableItems(true);
    this.refresh();
};

// A class may list its equipment slots (rrEquipSlots): the equipment type of each slot, in order, a
// type as many times as the class has slots of it. Null for a class with no list, which has one slot
// per equipment type (and a second weapon in place of the second slot under Dual Wield).
Game_Actor.prototype.classEquipSlots = function() {
    // Database > Reactor Features can leave slots to a plugin (YEP_EquipCore, VisuStella's Items & Equips Core).
    if (typeof ReactorFeatures !== "undefined" && !ReactorFeatures.on("classEquipSlots")) return null;
    const actorClass = this.currentClass();
    const slots = actorClass ? actorClass.rrEquipSlots : null;
    return Array.isArray(slots) ? slots : null;
};

// The slots an actor has a list of its own for: the layout its Slot Type picks, else its class's list.
// Null for one with the stock slots.
Game_Actor.prototype.ownEquipSlots = function() {
    const layout = this.slotLayout();
    return layout ? layout.slots : this.classEquipSlots();
};

Game_Actor.prototype.equipSlots = function() {
    const own = this.ownEquipSlots();
    if (own) {
        return own.slice();
    }
    const slots = [];
    for (let i = 1; i < $dataSystem.equipTypes.length; i++) {
        slots.push(i);
    }
    if (slots.length >= 2 && this.isDualWield()) {
        slots[1] = 1;
    }
    return slots;
};

// Under a list of its own (a slot layout or the class's list) the equipment held is one place per
// slot: a slot the list gained is empty, and what a slot it lost was holding goes back to the party.
// In a project with slot layouts this holds for every actor, so one whose layout is gone (a state
// worn off) is back to one place per stock slot.
Game_Actor.prototype.fitEquipSlots = function(forcing) {
    // (Equipment Slot Layouts off in Database > Reactor Features: the project has none.)
    const layoutsOn = typeof ReactorFeatures === "undefined" || ReactorFeatures.on("equipSlotLayouts");
    const layouts = layoutsOn && typeof $dataSystem !== 'undefined' && $dataSystem ? $dataSystem.rrSlotLayouts : null;
    if (!this._equips || (!this.ownEquipSlots() && !(Array.isArray(layouts) && layouts.length > 0))) {
        return;
    }
    const slots = this.equipSlots();
    const was = this._rrFittedSlots;
    if (Array.isArray(was) && (was.length !== slots.length || was.some((etypeId, i) => etypeId !== slots[i]))) {
        // The slots changed since they were last fitted (a layout put on or worn off, a new class list):
        // each slot takes the first thing held not yet placed that is of its type, and what no slot is
        // there for goes back to the party.
        const held = this._equips.slice();
        this._equips = slots.map(etypeId => {
            const at = held.findIndex(entry => entry && entry.object() && entry.object().etypeId === etypeId);
            if (at < 0) {
                return new Game_Item();
            }
            const entry = held[at];
            held[at] = null;
            return entry;
        });
        for (const entry of held) {
            const item = entry && entry.object();
            if (item && !forcing) {
                this.tradeItemWithParty(null, item);
            }
        }
    }
    while (this._equips.length < slots.length) {
        this._equips.push(new Game_Item());
    }
    while (this._equips.length > slots.length) {
        const item = this._equips.pop().object();
        if (item && !forcing) {
            this.tradeItemWithParty(null, item);
        }
    }
    this._rrFittedSlots = slots.slice();
};

Game_Actor.prototype.equips = function() {
    return this._equips.map(item => item.object());
};

Game_Actor.prototype.weapons = function() {
    return this.equips().filter(item => item && DataManager.isWeapon(item));
};

Game_Actor.prototype.armors = function() {
    return this.equips().filter(item => item && DataManager.isArmor(item));
};

Game_Actor.prototype.hasWeapon = function(weapon) {
    return this.weapons().includes(weapon);
};

Game_Actor.prototype.hasArmor = function(armor) {
    return this.armors().includes(armor);
};

Game_Actor.prototype.isEquipChangeOk = function(slotId) {
    return (
        !this.isEquipTypeLocked(this.equipSlots()[slotId]) &&
        !this.isEquipTypeSealed(this.equipSlots()[slotId])
    );
};

Game_Actor.prototype.changeEquip = function(slotId, item) {
    if (
        this.tradeItemWithParty(item, this.equips()[slotId]) &&
        (!item || this.equipSlots()[slotId] === item.etypeId)
    ) {
        this._equips[slotId].setObject(item);
        this.refresh();
    }
};

Game_Actor.prototype.forceChangeEquip = function(slotId, item) {
    this._equips[slotId].setObject(item);
    this.releaseUnequippableItems(true);
    this.refresh();
};

Game_Actor.prototype.tradeItemWithParty = function(newItem, oldItem) {
    if (newItem && !$gameParty.hasItem(newItem)) {
        return false;
    } else {
        $gameParty.gainItem(oldItem, 1);
        $gameParty.loseItem(newItem, 1);
        return true;
    }
};

Game_Actor.prototype.changeEquipById = function(etypeId, itemId) {
    // Under a list of its own: the first slot of that type (none: nothing to change).
    const slotId = this.ownEquipSlots() ? this.equipSlots().indexOf(etypeId) : etypeId - 1;
    if (slotId < 0) {
        return;
    }
    if (this.equipSlots()[slotId] === 1) {
        this.changeEquip(slotId, $dataWeapons[itemId]);
    } else {
        this.changeEquip(slotId, $dataArmors[itemId]);
    }
};

Game_Actor.prototype.isEquipped = function(item) {
    return this.equips().includes(item);
};

Game_Actor.prototype.discardEquip = function(item) {
    const slotId = this.equips().indexOf(item);
    if (slotId >= 0) {
        this._equips[slotId].setObject(null);
    }
};

Game_Actor.prototype.releaseUnequippableItems = function(forcing) {
    this.fitEquipSlots(forcing);
    for (;;) {
        const slots = this.equipSlots();
        const equips = this.equips();
        let changed = false;
        for (let i = 0; i < equips.length; i++) {
            const item = equips[i];
            if (item && (!this.canEquip(item) || item.etypeId !== slots[i])) {
                if (!forcing) {
                    this.tradeItemWithParty(null, item);
                }
                this._equips[i].setObject(null);
                changed = true;
            }
        }
        if (!changed) {
            break;
        }
        // What came off may have given the layout: the slots are fitted to the one there is now.
        this.fitEquipSlots(forcing);
    }
};

Game_Actor.prototype.clearEquipments = function() {
    const maxSlots = this.equipSlots().length;
    for (let i = 0; i < maxSlots; i++) {
        if (this.isEquipChangeOk(i)) {
            this.changeEquip(i, null);
        }
    }
};

Game_Actor.prototype.optimizeEquipments = function() {
    const maxSlots = this.equipSlots().length;
    this.clearEquipments();
    for (let i = 0; i < maxSlots; i++) {
        if (this.isEquipChangeOk(i)) {
            this.changeEquip(i, this.bestEquipItem(i));
        }
    }
};

Game_Actor.prototype.bestEquipItem = function(slotId) {
    const etypeId = this.equipSlots()[slotId];
    const items = $gameParty
        .equipItems()
        .filter(item => item.etypeId === etypeId && this.canEquip(item));
    let bestItem = null;
    let bestPerformance = -1000;
    for (let i = 0; i < items.length; i++) {
        const performance = this.calcEquipItemPerformance(items[i]);
        if (performance > bestPerformance) {
            bestPerformance = performance;
            bestItem = items[i];
        }
    }
    return bestItem;
};

Game_Actor.prototype.calcEquipItemPerformance = function(item) {
    return item.params.reduce((a, b) => a + b);
};

Game_Actor.prototype.isSkillWtypeOk = function(skill) {
    const wtypeId1 = skill.requiredWtypeId1;
    const wtypeId2 = skill.requiredWtypeId2;
    if (
        (wtypeId1 === 0 && wtypeId2 === 0) ||
        (wtypeId1 > 0 && this.isWtypeEquipped(wtypeId1)) ||
        (wtypeId2 > 0 && this.isWtypeEquipped(wtypeId2))
    ) {
        return true;
    } else {
        return false;
    }
};

Game_Actor.prototype.isWtypeEquipped = function(wtypeId) {
    return this.weapons().some(weapon => weapon.wtypeId === wtypeId);
};

Game_Actor.prototype.refresh = function() {
    this.releaseUnequippableItems(false);
    Game_Battler.prototype.refresh.call(this);
};

Game_Actor.prototype.hide = function() {
    Game_Battler.prototype.hide.call(this);
    $gameTemp.requestBattleRefresh();
};

Game_Actor.prototype.isActor = function() {
    return true;
};

Game_Actor.prototype.friendsUnit = function() {
    return $gameParty;
};

Game_Actor.prototype.opponentsUnit = function() {
    return $gameTroop;
};

Game_Actor.prototype.index = function() {
    return $gameParty.members().indexOf(this);
};

Game_Actor.prototype.isBattleMember = function() {
    return $gameParty.battleMembers().includes(this);
};

Game_Actor.prototype.isFormationChangeOk = function() {
    return true;
};

Game_Actor.prototype.currentClass = function() {
    return $dataClasses[this._classId];
};

Game_Actor.prototype.isClass = function(gameClass) {
    return gameClass && this._classId === gameClass.id;
};

Game_Actor.prototype.skillTypes = function() {
    const skillTypes = this.addedSkillTypes().sort((a, b) => a - b);
    return skillTypes.filter((x, i, self) => self.indexOf(x) === i);
};

Game_Actor.prototype.skills = function() {
    const list = [];
    for (const id of this._skills.concat(this.addedSkills())) {
        if (!list.includes($dataSkills[id])) {
            list.push($dataSkills[id]);
        }
    }
    return list;
};

Game_Actor.prototype.usableSkills = function() {
    return this.skills().filter(skill => this.canUse(skill));
};

Game_Actor.prototype.traitObjects = function() {
    const objects = Game_Battler.prototype.traitObjects.call(this);
    objects.push(this.actor(), this.currentClass());
    for (const item of this.equips()) {
        if (item) {
            objects.push(item);
        }
    }
    return objects;
};

Game_Actor.prototype.attackElements = function() {
    const set = Game_Battler.prototype.attackElements.call(this);
    if (this.hasNoWeapons() && !set.includes(this.bareHandsElementId())) {
        set.push(this.bareHandsElementId());
    }
    return set;
};

Game_Actor.prototype.hasNoWeapons = function() {
    return this.weapons().length === 0;
};

Game_Actor.prototype.bareHandsElementId = function() {
    return 1;
};

Game_Actor.prototype.classParamAtLevel = function(classData, paramId, level) {
    const values = classData?.params?.[paramId];
    if (!Array.isArray(values) || values.length === 0) return 0;
    const requestedLevel = Math.max(1, Math.min(9999, Math.floor(Number(level) || 1)));
    const exact = Number(values[requestedLevel]);
    if (Number.isFinite(exact)) return exact;

    let lastIndex = Math.min(requestedLevel, values.length - 1);
    while (lastIndex >= 1 && !Number.isFinite(Number(values[lastIndex]))) lastIndex--;
    if (lastIndex < 1) return 0;

    const lastValue = Number(values[lastIndex]);
    let previousIndex = lastIndex - 1;
    while (previousIndex >= 1 && !Number.isFinite(Number(values[previousIndex]))) previousIndex--;
    if (previousIndex < 1) return lastValue;

    const previousValue = Number(values[previousIndex]);
    const slope = (lastValue - previousValue) / (lastIndex - previousIndex);
    return Math.round(lastValue + slope * (requestedLevel - lastIndex));
};

Game_Actor.prototype.paramBase = function(paramId) {
    return this.classParamAtLevel(this.currentClass(), paramId, this._level);
};

Game_Actor.prototype.paramPlus = function(paramId) {
    let value = Game_Battler.prototype.paramPlus.call(this, paramId);
    for (const item of this.equips()) {
        if (item) {
            value += item.params[paramId];
        }
    }
    return value;
};

Game_Actor.prototype.attackAnimationId1 = function() {
    if (this.hasNoWeapons()) {
        return this.bareHandsAnimationId();
    } else {
        const weapons = this.weapons();
        return weapons[0] ? weapons[0].animationId : 0;
    }
};

Game_Actor.prototype.attackAnimationId2 = function() {
    const weapons = this.weapons();
    return weapons[1] ? weapons[1].animationId : 0;
};

Game_Actor.prototype.bareHandsAnimationId = function() {
    return 1;
};

Game_Actor.prototype.changeExp = function(exp, show) {
    this._exp[this._classId] = Math.max(exp, 0);
    const lastLevel = this._level;
    const lastSkills = this.skills();
    while (!this.isMaxLevel() && this.currentExp() >= this.nextLevelExp()) {
        this.levelUp();
    }
    while (this.currentExp() < this.currentLevelExp()) {
        this.levelDown();
    }
    if (show && this._level > lastLevel) {
        this.displayLevelUp(this.findNewSkills(lastSkills));
    }
    this.refresh();
};

Game_Actor.prototype.levelUp = function() {
    this._level++;
    for (const learning of this.currentClass().learnings) {
        if (learning.level === this._level) {
            this.learnSkill(learning.skillId);
        }
    }
};

Game_Actor.prototype.levelDown = function() {
    this._level--;
};

Game_Actor.prototype.findNewSkills = function(lastSkills) {
    const newSkills = this.skills();
    for (const lastSkill of lastSkills) {
        newSkills.remove(lastSkill);
    }
    return newSkills;
};

Game_Actor.prototype.displayLevelUp = function(newSkills) {
    const text = TextManager.levelUp.format(
        this._name,
        TextManager.level,
        this._level
    );
    $gameMessage.newPage();
    $gameMessage.add(text);
    for (const skill of newSkills) {
        $gameMessage.add(TextManager.obtainSkill.format(skill.name));
    }
};

Game_Actor.prototype.gainExp = function(exp) {
    const newExp = this.currentExp() + Math.round(exp * this.finalExpRate());
    this.changeExp(newExp, this.shouldDisplayLevelUp());
};

Game_Actor.prototype.finalExpRate = function() {
    return this.exr * (this.isBattleMember() ? 1 : this.benchMembersExpRate());
};

Game_Actor.prototype.benchMembersExpRate = function() {
    return $dataSystem.optExtraExp ? 1 : 0;
};

Game_Actor.prototype.shouldDisplayLevelUp = function() {
    // A level gained while the Victory interface gives a battle's rewards is shown there, not as a message.
    return !(typeof ReactorVictory !== "undefined" && ReactorVictory && ReactorVictory.isGiving());
};

Game_Actor.prototype.changeLevel = function(level, show) {
    level = level.clamp(1, this.maxLevel());
    this.changeExp(this.expForLevel(level), show);
};

Game_Actor.prototype.learnSkill = function(skillId) {
    if (!this.isLearnedSkill(skillId)) {
        this._skills.push(skillId);
        this._skills.sort((a, b) => a - b);
    }
};

Game_Actor.prototype.forgetSkill = function(skillId) {
    this._skills.remove(skillId);
};

Game_Actor.prototype.isLearnedSkill = function(skillId) {
    return this._skills.includes(skillId);
};

Game_Actor.prototype.hasSkill = function(skillId) {
    return this.skills().includes($dataSkills[skillId]);
};

Game_Actor.prototype.changeClass = function(classId, keepExp) {
    if (keepExp) {
        this._exp[classId] = this.currentExp();
    }
    this._classId = classId;
    this._level = 0;
    this.changeExp(this._exp[this._classId] || 0, false);
    this.refresh();
};

Game_Actor.prototype.setCharacterImage = function(
    characterName,
    characterIndex
) {
    this._characterName = characterName;
    this._characterIndex = characterIndex;
};

Game_Actor.prototype.setFaceImage = function(faceName, faceIndex) {
    this._faceName = faceName;
    this._faceIndex = faceIndex;
    $gameTemp.requestBattleRefresh();
};

Game_Actor.prototype.setBattlerImage = function(battlerName) {
    this._battlerName = battlerName;
};

Game_Actor.prototype.isSpriteVisible = function() {
    return $gameSystem.isSideView();
};

Game_Actor.prototype.performActionStart = function(action) {
    Game_Battler.prototype.performActionStart.call(this, action);
};

Game_Actor.prototype.performAction = function(action) {
    Game_Battler.prototype.performAction.call(this, action);
    if (action.isAttack()) {
        this.performAttack();
    } else if (action.isGuard()) {
        this.requestMotion("guard");
    } else if (action.isMagicSkill()) {
        this.requestMotion("spell");
    } else if (action.isSkill()) {
        this.requestMotion("skill");
    } else if (action.isItem()) {
        this.requestMotion("item");
    }
};

Game_Actor.prototype.performActionEnd = function() {
    Game_Battler.prototype.performActionEnd.call(this);
};

Game_Actor.prototype.performAttack = function() {
    const weapons = this.weapons();
    const wtypeId = weapons[0] ? weapons[0].wtypeId : 0;
    const attackMotion = $dataSystem.attackMotions[wtypeId];
    if (attackMotion) {
        if (attackMotion.type === 0) {
            this.requestMotion("thrust");
        } else if (attackMotion.type === 1) {
            this.requestMotion("swing");
        } else if (attackMotion.type === 2) {
            this.requestMotion("missile");
        }
        this.startWeaponAnimation(attackMotion.weaponImageId);
    }
};

Game_Actor.prototype.performDamage = function() {
    Game_Battler.prototype.performDamage.call(this);
    if (this.isSpriteVisible()) {
        this.requestMotion("damage");
    } else {
        $gameScreen.startShake(5, 5, 10);
    }
    SoundManager.playActorDamage();
};

Game_Actor.prototype.performEvasion = function() {
    Game_Battler.prototype.performEvasion.call(this);
    this.requestMotion("evade");
};

Game_Actor.prototype.performMagicEvasion = function() {
    Game_Battler.prototype.performMagicEvasion.call(this);
    this.requestMotion("evade");
};

Game_Actor.prototype.performCounter = function() {
    Game_Battler.prototype.performCounter.call(this);
    this.performAttack();
};

Game_Actor.prototype.performCollapse = function() {
    Game_Battler.prototype.performCollapse.call(this);
    if ($gameParty.inBattle()) {
        SoundManager.playActorCollapse();
    }
};

Game_Actor.prototype.performVictory = function() {
    this.setActionState("done");
    if (this.canMove()) {
        this.requestMotion("victory");
    }
};

Game_Actor.prototype.performEscape = function() {
    if (this.canMove()) {
        this.requestMotion("escape");
    }
};

Game_Actor.prototype.makeActionList = function() {
    const list = [];
    const attackAction = new Game_Action(this);
    attackAction.setAttack();
    list.push(attackAction);
    for (const skill of this.usableSkills()) {
        const skillAction = new Game_Action(this);
        skillAction.setSkill(skill.id);
        list.push(skillAction);
    }
    return list;
};

Game_Actor.prototype.makeAutoBattleActions = function() {
    for (let i = 0; i < this.numActions(); i++) {
        const list = this.makeActionList();
        let maxValue = -Number.MAX_VALUE;
        for (const action of list) {
            const value = action.evaluate();
            if (value > maxValue) {
                maxValue = value;
                this.setAction(i, action);
            }
        }
    }
    this.setActionState("waiting");
};

Game_Actor.prototype.makeConfusionActions = function() {
    for (let i = 0; i < this.numActions(); i++) {
        this.action(i).setConfusion();
    }
    this.setActionState("waiting");
};

Game_Actor.prototype.makeActions = function() {
    Game_Battler.prototype.makeActions.call(this);
    if (this.numActions() > 0) {
        this.setActionState("undecided");
    } else {
        this.setActionState("waiting");
    }
    if (this.isAutoBattle()) {
        this.makeAutoBattleActions();
    } else if (this.isConfused()) {
        this.makeConfusionActions();
    }
};

Game_Actor.prototype.onPlayerWalk = function() {
    this.clearResult();
    this.checkFloorEffect();
    if ($gamePlayer.isNormal()) {
        this.turnEndOnMap();
        for (const state of this.states()) {
            this.updateStateSteps(state);
        }
        this.showAddedStates();
        this.showRemovedStates();
    }
};

Game_Actor.prototype.updateStateSteps = function(state) {
    if (state.removeByWalking) {
        if (this._stateSteps[state.id] > 0) {
            if (--this._stateSteps[state.id] === 0) {
                this.removeState(state.id);
            }
        }
    }
};

Game_Actor.prototype.showAddedStates = function() {
    for (const state of this.result().addedStateObjects()) {
        if (state.message1) {
            $gameMessage.add(state.message1.format(this._name));
        }
    }
};

Game_Actor.prototype.showRemovedStates = function() {
    for (const state of this.result().removedStateObjects()) {
        if (state.message4) {
            $gameMessage.add(state.message4.format(this._name));
        }
    }
};

Game_Actor.prototype.stepsForTurn = function() {
    return 20;
};

Game_Actor.prototype.turnEndOnMap = function() {
    if ($gameParty.steps() % this.stepsForTurn() === 0) {
        this.onTurnEnd();
        if (this.result().hpDamage > 0) {
            this.performMapDamage();
        }
    }
};

Game_Actor.prototype.checkFloorEffect = function() {
    if ($gamePlayer.isOnDamageFloor()) {
        this.executeFloorDamage();
    }
};

Game_Actor.prototype.executeFloorDamage = function() {
    const floorDamage = Math.floor(this.basicFloorDamage() * this.fdr);
    const realDamage = Math.min(floorDamage, this.maxFloorDamage());
    this.gainHp(-realDamage);
    if (realDamage > 0) {
        this.performMapDamage();
    }
};

Game_Actor.prototype.basicFloorDamage = function() {
    return 10;
};

Game_Actor.prototype.maxFloorDamage = function() {
    return $dataSystem.optFloorDeath ? this.hp : Math.max(this.hp - 1, 0);
};

Game_Actor.prototype.performMapDamage = function() {
    if (!$gameParty.inBattle()) {
        $gameScreen.startFlashForDamage();
    }
};

Game_Actor.prototype.clearActions = function() {
    Game_Battler.prototype.clearActions.call(this);
    this._actionInputIndex = 0;
};

Game_Actor.prototype.inputtingAction = function() {
    return this.action(this._actionInputIndex);
};

Game_Actor.prototype.selectNextCommand = function() {
    if (this._actionInputIndex < this.numActions() - 1) {
        this._actionInputIndex++;
        return true;
    } else {
        return false;
    }
};

Game_Actor.prototype.selectPreviousCommand = function() {
    if (this._actionInputIndex > 0) {
        this._actionInputIndex--;
        return true;
    } else {
        return false;
    }
};

Game_Actor.prototype.lastSkill = function() {
    if ($gameParty.inBattle()) {
        return this.lastBattleSkill();
    } else {
        return this.lastMenuSkill();
    }
};

Game_Actor.prototype.lastMenuSkill = function() {
    return this._lastMenuSkill.object();
};

Game_Actor.prototype.setLastMenuSkill = function(skill) {
    this._lastMenuSkill.setObject(skill);
};

Game_Actor.prototype.lastBattleSkill = function() {
    return this._lastBattleSkill.object();
};

Game_Actor.prototype.setLastBattleSkill = function(skill) {
    this._lastBattleSkill.setObject(skill);
};

Game_Actor.prototype.lastCommandSymbol = function() {
    return this._lastCommandSymbol;
};

Game_Actor.prototype.setLastCommandSymbol = function(symbol) {
    this._lastCommandSymbol = symbol;
};

Game_Actor.prototype.testEscape = function(item) {
    return item.effects.some(
        effect => effect && effect.code === Game_Action.EFFECT_SPECIAL
    );
};

Game_Actor.prototype.meetsUsableItemConditions = function(item) {
    if ($gameParty.inBattle()) {
        if (!BattleManager.canEscape() && this.testEscape(item)) {
            return false;
        }
    }
    return Game_BattlerBase.prototype.meetsUsableItemConditions.call(
        this,
        item
    );
};

Game_Actor.prototype.onEscapeFailure = function() {
    if (BattleManager.isTpb()) {
        this.applyTpbPenalty();
    }
    this.clearActions();
    this.requestMotionRefresh();
};

//-----------------------------------------------------------------------------
// Game_Enemy
//
// The game object class for an enemy.

function Game_Enemy() {
    this.initialize(...arguments);
}

Game_Enemy.prototype = Object.create(Game_Battler.prototype);
Game_Enemy.prototype.constructor = Game_Enemy;

Game_Enemy.prototype.initialize = function(enemyId, x, y) {
    Game_Battler.prototype.initialize.call(this);
    this.setup(enemyId, x, y);
};

Game_Enemy.prototype.initMembers = function() {
    Game_Battler.prototype.initMembers.call(this);
    this._enemyId = 0;
    this._letter = "";
    this._plural = false;
    this._screenX = 0;
    this._screenY = 0;
};

Game_Enemy.prototype.setup = function(enemyId, x, y) {
    this._enemyId = enemyId;
    this._screenX = x;
    this._screenY = y;
    this._rrRoll = null;
    this.recoverAll();
};

// The database's ranges (Enemies: Stat Variance %, an EXP or Gold maximum),
// rolled once per enemy and kept, so its stats hold still through the battle.
// Rolled again when the enemy becomes another one (Transform). An enemy with
// none of these fields gets null and behaves exactly as in RPG Maker MZ, as
// does every enemy while Database > Reactor Features has Enemy Ranges off.
Game_Enemy.prototype.rrRoll = function() {
    const enemy = this.enemy();
    if (!enemy) return null;
    if (typeof ReactorFeatures !== "undefined" && !ReactorFeatures.on("enemyRanges")) return null;
    if (this._rrRoll && this._rrRoll.enemyId === this._enemyId) return this._rrRoll;
    const variance = Math.min(50, Math.max(0, Number(enemy.rrStatVariance) || 0));
    const between = (base, max) => {
        base = Math.floor(Number(base) || 0);
        max = Math.floor(Number(max));
        return Number.isFinite(max) && max > base ? base + Math.randomInt(max - base + 1) : undefined;
    };
    const exp = between(enemy.exp, enemy.rrExpMax), gold = between(enemy.gold, enemy.rrGoldMax);
    if (variance <= 0 && exp === undefined && gold === undefined) {
        this._rrRoll = { enemyId: this._enemyId, none: true };
        return this._rrRoll;
    }
    const rates = variance > 0
        ? Array.from({ length: 8 }, () => 1 + (Math.random() * 2 - 1) * variance / 100)
        : null;
    this._rrRoll = { enemyId: this._enemyId, rates, exp, gold };
    return this._rrRoll;
};

Game_Enemy.prototype.isEnemy = function() {
    return true;
};

Game_Enemy.prototype.friendsUnit = function() {
    return $gameTroop;
};

Game_Enemy.prototype.opponentsUnit = function() {
    return $gameParty;
};

Game_Enemy.prototype.index = function() {
    return $gameTroop.members().indexOf(this);
};

Game_Enemy.prototype.isBattleMember = function() {
    return this.index() >= 0;
};

Game_Enemy.prototype.enemyId = function() {
    return this._enemyId;
};

Game_Enemy.prototype.enemy = function() {
    return $dataEnemies[this._enemyId];
};

Game_Enemy.prototype.traitObjects = function() {
    return Game_Battler.prototype.traitObjects.call(this).concat(this.enemy());
};

Game_Enemy.prototype.paramBase = function(paramId) {
    const base = this.enemy().params[paramId];
    const roll = this.rrRoll();
    if (!roll || !roll.rates || roll.rates[paramId] === undefined) return base;
    return Math.max(paramId === 0 ? 1 : 0, Math.round((Number(base) || 0) * roll.rates[paramId]));
};

// Max TP is per-enemy rather than the flat 100 every battler used to get. It
// is not part of params -- that array is indexed by paramId and has exactly
// eight entries -- so it sits beside exp and gold as its own field, and an
// enemy that has never been given one is left to whatever
// Game_BattlerBase.prototype.maxTp says, which is the 100 it always was. That
// fallback is looked up rather than inlined so a plugin that replaces maxTp
// still governs every enemy the database has not spoken for.
Game_Enemy.prototype.maxTp = function() {
    const raw = this.enemy().maxTp;
    // Only a number, or a string holding one, counts as authored. Number()
    // reads null, '' and [] as 0, and a silent zero-TP enemy is a worse
    // answer to malformed data than the default is.
    const authored = typeof raw === 'number'
        || (typeof raw === 'string' && raw.trim() !== '');
    const value = authored ? Number(raw) : NaN;
    if (Number.isFinite(value)) {
        return Math.max(0, value + (this._maxTpPlus || 0));
    }
    return Game_BattlerBase.prototype.maxTp.call(this);
};

Game_Enemy.prototype.exp = function() {
    const roll = this.rrRoll();
    return roll && roll.exp !== undefined ? roll.exp : this.enemy().exp;
};

Game_Enemy.prototype.gold = function() {
    const roll = this.rrRoll();
    return roll && roll.gold !== undefined ? roll.gold : this.enemy().gold;
};

Game_Enemy.prototype.makeDropItems = function() {
    const rate = this.dropItemRate();
    return this.enemy().dropItems.reduce((r, di) => {
        if (di.kind > 0 && Math.random() * di.denominator < rate) {
            const count = this.rrDropCount(di);
            const item = this.itemObject(di.kind, di.dataId);
            return count === 1 ? r.concat(item) : r.concat(Array.from({ length: count }, () => item));
        } else {
            return r;
        }
    }, []);
};

// How many of a drop fall: the database's quantity range (rrQtyMin to
// rrQtyMax on the drop slot), or the 1 RPG Maker MZ always drops (also with
// Enemy Ranges off in Database > Reactor Features).
Game_Enemy.prototype.rrDropCount = function(di) {
    if (di.rrQtyMin === undefined && di.rrQtyMax === undefined) return 1;
    if (typeof ReactorFeatures !== "undefined" && !ReactorFeatures.on("enemyRanges")) return 1;
    const min = Math.max(1, Math.floor(Number(di.rrQtyMin) || 1));
    const max = Math.max(min, Math.floor(Number(di.rrQtyMax) || min));
    return min + Math.randomInt(max - min + 1);
};

Game_Enemy.prototype.dropItemRate = function() {
    return $gameParty.hasDropItemDouble() ? 2 : 1;
};

Game_Enemy.prototype.itemObject = function(kind, dataId) {
    if (kind === 1) {
        return $dataItems[dataId];
    } else if (kind === 2) {
        return $dataWeapons[dataId];
    } else if (kind === 3) {
        return $dataArmors[dataId];
    } else {
        return null;
    }
};

Game_Enemy.prototype.isSpriteVisible = function() {
    return true;
};

Game_Enemy.prototype.screenX = function() {
    return this._screenX;
};

Game_Enemy.prototype.screenY = function() {
    return this._screenY;
};

Game_Enemy.prototype.battlerName = function() {
    return this.enemy().battlerName;
};

Game_Enemy.prototype.battlerHue = function() {
    return this.enemy().battlerHue;
};

Game_Enemy.prototype.originalName = function() {
    return this.enemy().name;
};

Game_Enemy.prototype.name = function() {
    return this.originalName() + (this._plural ? this._letter : "");
};

Game_Enemy.prototype.isLetterEmpty = function() {
    return this._letter === "";
};

Game_Enemy.prototype.setLetter = function(letter) {
    this._letter = letter;
};

Game_Enemy.prototype.setPlural = function(plural) {
    this._plural = plural;
};

Game_Enemy.prototype.performActionStart = function(action) {
    Game_Battler.prototype.performActionStart.call(this, action);
    this.requestEffect("whiten");
};

Game_Enemy.prototype.performAction = function(action) {
    Game_Battler.prototype.performAction.call(this, action);
};

Game_Enemy.prototype.performActionEnd = function() {
    Game_Battler.prototype.performActionEnd.call(this);
};

Game_Enemy.prototype.performDamage = function() {
    Game_Battler.prototype.performDamage.call(this);
    SoundManager.playEnemyDamage();
    this.requestEffect("blink");
};

/**
 * Play this enemy's collapse sound: the one chosen beside its Collapse Effect
 * in the editor, or the engine's own.
 *
 * The choice lives in BattlePresentation.json under `enemies[id].collapseSe`,
 * beside the other per-enemy presentation settings, because a trait is three
 * numbers and has nowhere to keep a filename. A chosen sound is played for
 * every collapse kind, Instant included, which has none of its own.
 *
 * @param {?Function} fallback - The engine's sound for this kind, if any.
 */
Game_Enemy.prototype.playCollapseSe = function(fallback) {
    const chosen = globalThis.ReactorBattlePresentation
        && globalThis.ReactorBattlePresentation.settings
        && globalThis.ReactorBattlePresentation.settings.enemies
        && globalThis.ReactorBattlePresentation.settings.enemies[this.enemyId()];
    const se = chosen && chosen.collapseSe;
    if (se && se.name) {
        AudioManager.playSe({
            name: se.name,
            volume: se.volume === undefined ? 90 : se.volume,
            pitch: se.pitch === undefined ? 100 : se.pitch,
            pan: se.pan === undefined ? 0 : se.pan
        });
        return;
    }
    if (fallback) {
        fallback();
    }
};

Game_Enemy.prototype.performCollapse = function() {
    Game_Battler.prototype.performCollapse.call(this);
    switch (this.collapseType()) {
        case 0:
            this.requestEffect("collapse");
            this.playCollapseSe(() => SoundManager.playEnemyCollapse());
            break;
        case 1:
            this.requestEffect("bossCollapse");
            this.playCollapseSe(() => SoundManager.playBossCollapse1());
            break;
        case 2:
            this.requestEffect("instantCollapse");
            // Instant has no sound of its own; a chosen one still plays.
            this.playCollapseSe(null);
            break;
        // 3 is "No Disappear": the sprite stays put, so no effect is requested.
        case 4:
            this.requestEffect("ashCollapse");
            this.playCollapseSe(() => SoundManager.playEnemyCollapse());
            break;
        case 5:
            this.requestEffect("emberCollapse");
            this.playCollapseSe(() => SoundManager.playEnemyCollapse());
            break;
        case 6:
            this.requestEffect("wispCollapse");
            this.playCollapseSe(() => SoundManager.playEnemyCollapse());
            break;
        case 7:
            this.requestEffect("shatterCollapse");
            this.playCollapseSe(() => SoundManager.playEnemyCollapse());
            break;
        // 8 is "Corpse": it goes over and lies where it stood, and gets up if it is revived.
        case 8:
            this.requestEffect("corpseCollapse");
            this.playCollapseSe(() => SoundManager.playEnemyCollapse());
            break;
    }
};

Game_Enemy.prototype.transform = function(enemyId) {
    const name = this.originalName();
    this._enemyId = enemyId;
    if (this.originalName() !== name) {
        this._letter = "";
        this._plural = false;
    }
    this.refresh();
    if (this.numActions() > 0) {
        this.makeActions();
    }
};

Game_Enemy.prototype.meetsCondition = function(action) {
    if (Array.isArray(action.conditions)) {
        return action.conditions.every(condition =>
            condition &&
            Number.isInteger(condition.type) &&
            condition.type > 0 &&
            this.meetsActionCondition(
                condition.type,
                condition.param1,
                condition.param2,
                action,
                condition
            )
        );
    }
    return this.meetsActionCondition(
        action.conditionType,
        action.conditionParam1,
        action.conditionParam2,
        action
    );
};

// `condition` is the whole entry, which a state condition needs for its list of
// ids; everything else reads the two params. A caller with the older four
// arguments - a plugin bridging an actor onto this method - still gets the
// single-state behaviour, because the list falls back to param1.
Game_Battler.prototype.meetsActionCondition = function(
    type, param1, param2, action, condition
) {
    switch (type) {
        case 1:
            return this.meetsTurnCondition(param1, param2);
        case 2:
            return this.meetsHpCondition(param1, param2);
        case 3:
            return this.meetsMpCondition(param1, param2);
        // A state condition can name several states, and holds when any one of
        // them is there. Composing per id rather than per candidate keeps
        // meetsTargetStateCondition a one-state question, so a plugin that
        // replaces it keeps working: "any of these states on any reachable
        // target" is the same set either way round.
        case 4:
            return this.actionConditionStateIds(param1, condition)
                .some(id => this.meetsStateCondition(id));
        case 5:
            return this.meetsPartyLevelCondition(param1);
        case 6:
            return this.meetsSwitchCondition(param1);
        case 7:
            return this.meetsTpCondition(param1, param2);
        case 8:
            return this.actionConditionStateIds(param1, condition)
                .some(id => this.meetsTargetStateCondition(id, action));
        // "Lacks" is the negation of the same check, not of isStateAffected:
        // a plugin that replaces meetsStateCondition with a passive-state-
        // aware version (VisuMZ_1_SkillsStatesCore does) then moves has and
        // lacks together instead of leaving them disagreeing. Over a list it
        // reads as "none of these", which is what negating "any of these" is.
        case 9:
            return !this.actionConditionStateIds(param1, condition)
                .some(id => this.meetsStateCondition(id));
        case 10:
            return !this.actionConditionStateIds(param1, condition)
                .some(id => this.meetsTargetStateCondition(id, action));
        default:
            return Number(type) === 0;
    }
};

/**
 * The states a state condition names.
 *
 * `params` is the authored list and param1 is its first entry, kept so the
 * legacy `conditionParam1` field and anything reading it still name a real
 * state. An action written before lists existed has no `params` and is the
 * one-state case. A list that survives editing as nothing usable falls back to
 * param1 rather than to the empty set, because `some` over nothing is false
 * and would silently retire the action.
 */
Game_Battler.prototype.actionConditionStateIds = function(param1, condition) {
    const authored = condition && Array.isArray(condition.params)
        ? condition.params.map(Number).filter(id => Number.isInteger(id) && id > 0)
        : [];
    return authored.length > 0 ? authored : [param1];
};

Game_Battler.prototype.meetsTurnCondition = function(param1, param2) {
    const n = this.turnCount();
    if (param2 === 0) {
        return n === param1;
    } else {
        return n > 0 && n >= param1 && n % param2 === param1 % param2;
    }
};

Game_Battler.prototype.meetsHpCondition = function(param1, param2) {
    return this.hpRate() >= param1 && this.hpRate() <= param2;
};

Game_Battler.prototype.meetsMpCondition = function(param1, param2) {
    return this.mpRate() >= param1 && this.mpRate() <= param2;
};

Game_Battler.prototype.meetsTpCondition = function(param1, param2) {
    return this.tpRate() >= param1 && this.tpRate() <= param2;
};

// Membership by state object rather than by id. While states() is the engine's
// own map over _states the two are the same answer, but a plugin that injects
// passive states into states() (VisuMZ_1_SkillsStatesCore does) then reaches
// this check too, so a passive answers a state condition the way the player
// sees it. The lookup is guarded because such a plugin can push an entry for a
// state id that no longer exists, and includes(undefined) would match.
Game_Battler.prototype.meetsStateCondition = function(param) {
    const state = $dataStates[param];
    return !!state && this.states().includes(state);
};

// Asked of the candidate rather than read off its _states, so a per-class
// replacement of meetsStateCondition governs the target check as well:
// SkillsStatesCore replaces Game_Enemy's, and the two sides of an action
// condition cannot end up disagreeing about what counts as having a state.
Game_Battler.prototype.meetsTargetStateCondition = function(param, action) {
    return this.actionTargetCandidates(action).some(battler =>
        battler.meetsStateCondition(param)
    );
};

Game_Battler.prototype.actionTargetCandidates = function(action) {
    const skill = action ? $dataSkills[action.skillId] : null;
    if (!skill) {
        return [];
    }
    // Scope is not reliably a number: a <Target: ...> notetag plugin
    // overwrites it with an uppercase string and reroutes the isFor*
    // predicates to parse it, so a numeric list would give those skills
    // zero candidates and their Target State conditions could never hold.
    // Asking a probe action inherits any such redefinition; numeric scopes
    // group exactly as the spelled-out lists did. Alive-friend runs before
    // the catch-all friend check so the unconditional ally scopes still
    // reach the dead.
    const probe = new Game_Action(this);
    probe.setSkill(action.skillId);
    if (probe.isForUser()) {
        return [this];
    }
    const candidates = [];
    if (probe.isForOpponent()) {
        candidates.push(...this.opponentsUnit().aliveMembers());
    }
    if (probe.isForDeadFriend()) {
        candidates.push(...this.friendsUnit().deadMembers());
    } else if (probe.isForAliveFriend()) {
        candidates.push(...this.friendsUnit().aliveMembers());
    } else if (probe.isForFriend()) {
        candidates.push(...this.friendsUnit().members());
    }
    return candidates;
};

Game_Battler.prototype.meetsPartyLevelCondition = function(param) {
    return $gameParty.highestLevel() >= param;
};

Game_Battler.prototype.meetsSwitchCondition = function(param) {
    return $gameSwitches.value(param);
};

Game_Enemy.prototype.isActionValid = function(action) {
    return (
        this.meetsCondition(action) && this.canUse($dataSkills[action.skillId])
    );
};

Game_Enemy.prototype.selectAction = function(actionList, ratingZero) {
    const sum = actionList.reduce((r, a) => r + a.rating - ratingZero, 0);
    if (sum > 0) {
        let value = Math.randomInt(sum);
        for (const action of actionList) {
            value -= action.rating - ratingZero;
            if (value < 0) {
                return action;
            }
        }
    } else {
        return null;
    }
};

Game_Enemy.prototype.selectAllActions = function(actionList) {
    const ratingMax = Math.max(...actionList.map(a => a.rating));
    const ratingZero = ratingMax - 3;
    actionList = actionList.filter(a => a.rating > ratingZero);
    for (let i = 0; i < this.numActions(); i++) {
        this.action(i).setEnemyAction(
            this.selectAction(actionList, ratingZero)
        );
    }
};

Game_Enemy.prototype.makeActions = function() {
    Game_Battler.prototype.makeActions.call(this);
    if (this.numActions() > 0) {
        const actionList = this.enemy().actions.filter(a =>
            this.isActionValid(a)
        );
        if (actionList.length > 0) {
            this.selectAllActions(actionList);
        }
    }
    this.setActionState("waiting");
};

//-----------------------------------------------------------------------------
// Game_Actors
//
// The wrapper class for an actor array.

function Game_Actors() {
    this.initialize(...arguments);
}

Game_Actors.prototype.initialize = function() {
    this._data = [];
};

Game_Actors.prototype.actor = function(actorId) {
    if ($dataActors[actorId]) {
        if (!this._data[actorId]) {
            this._data[actorId] = new Game_Actor(actorId);
        }
        return this._data[actorId];
    }
    return null;
};

//-----------------------------------------------------------------------------
// Game_Unit
//
// The superclass of Game_Party and Game_Troop.

function Game_Unit() {
    this.initialize(...arguments);
}

Game_Unit.prototype.initialize = function() {
    this._inBattle = false;
};

Game_Unit.prototype.inBattle = function() {
    return this._inBattle;
};

Game_Unit.prototype.members = function() {
    return [];
};

Game_Unit.prototype.aliveMembers = function() {
    return this.members().filter(member => member.isAlive());
};

Game_Unit.prototype.deadMembers = function() {
    return this.members().filter(member => member.isDead());
};

Game_Unit.prototype.movableMembers = function() {
    return this.members().filter(member => member.canMove());
};

Game_Unit.prototype.clearActions = function() {
    for (const member of this.members()) {
        member.clearActions();
    }
};

Game_Unit.prototype.agility = function() {
    const members = this.members();
    const sum = members.reduce((r, member) => r + member.agi, 0);
    return Math.max(1, sum / Math.max(1, members.length));
};

Game_Unit.prototype.tgrSum = function() {
    return this.aliveMembers().reduce((r, member) => r + member.tgr, 0);
};

Game_Unit.prototype.randomTarget = function() {
    let tgrRand = Math.random() * this.tgrSum();
    let target = null;
    for (const member of this.aliveMembers()) {
        tgrRand -= member.tgr;
        if (tgrRand <= 0 && !target) {
            target = member;
        }
    }
    return target;
};

Game_Unit.prototype.randomDeadTarget = function() {
    const members = this.deadMembers();
    return members.length ? members[Math.randomInt(members.length)] : null;
};

Game_Unit.prototype.smoothTarget = function(index) {
    const member = this.members()[Math.max(0, index)];
    return member && member.isAlive() ? member : this.aliveMembers()[0];
};

Game_Unit.prototype.smoothDeadTarget = function(index) {
    const member = this.members()[Math.max(0, index)];
    return member && member.isDead() ? member : this.deadMembers()[0];
};

Game_Unit.prototype.clearResults = function() {
    for (const member of this.members()) {
        member.clearResult();
    }
};

Game_Unit.prototype.onBattleStart = function(advantageous) {
    for (const member of this.members()) {
        member.onBattleStart(advantageous);
    }
    this._inBattle = true;
};

Game_Unit.prototype.onBattleEnd = function() {
    this._inBattle = false;
    for (const member of this.members()) {
        member.onBattleEnd();
    }
};

Game_Unit.prototype.makeActions = function() {
    for (const member of this.members()) {
        member.makeActions();
    }
};

Game_Unit.prototype.select = function(activeMember) {
    for (const member of this.members()) {
        if (member === activeMember) {
            member.select();
        } else {
            member.deselect();
        }
    }
};

Game_Unit.prototype.isAllDead = function() {
    return this.aliveMembers().length === 0;
};

Game_Unit.prototype.substituteBattler = function() {
    for (const member of this.members()) {
        if (member.isSubstitute()) {
            return member;
        }
    }
    return null;
};

Game_Unit.prototype.tpbBaseSpeed = function() {
    const members = this.members();
    return Math.max(...members.map(member => member.tpbBaseSpeed()));
};

Game_Unit.prototype.tpbReferenceTime = function() {
    return BattleManager.isActiveTpb() ? 240 : 60;
};

Game_Unit.prototype.updateTpb = function() {
    for (const member of this.members()) {
        member.updateTpb();
    }
};

//-----------------------------------------------------------------------------
// Game_Party
//
// The game object class for the party. Information such as gold and items is
// included.

function Game_Party() {
    this.initialize(...arguments);
}

Game_Party.prototype = Object.create(Game_Unit.prototype);
Game_Party.prototype.constructor = Game_Party;

Game_Party.ABILITY_ENCOUNTER_HALF = 0;
Game_Party.ABILITY_ENCOUNTER_NONE = 1;
Game_Party.ABILITY_CANCEL_SURPRISE = 2;
Game_Party.ABILITY_RAISE_PREEMPTIVE = 3;
Game_Party.ABILITY_GOLD_DOUBLE = 4;
Game_Party.ABILITY_DROP_ITEM_DOUBLE = 5;

Game_Party.prototype.initialize = function() {
    Game_Unit.prototype.initialize.call(this);
    this._gold = 0;
    this._steps = 0;
    this._lastItem = new Game_Item();
    this._menuActorId = 0;
    this._targetActorId = 0;
    this._actors = [];
    this.initAllItems();
};

Game_Party.prototype.initAllItems = function() {
    this._items = {};
    this._weapons = {};
    this._armors = {};
};

Game_Party.prototype.exists = function() {
    return this._actors.length > 0;
};

Game_Party.prototype.size = function() {
    return this.members().length;
};

Game_Party.prototype.isEmpty = function() {
    return this.size() === 0;
};

Game_Party.prototype.members = function() {
    return this.inBattle() ? this.battleMembers() : this.allMembers();
};

Game_Party.prototype.allMembers = function() {
    return this._actors.map(id => $gameActors.actor(id));
};

Game_Party.prototype.battleMembers = function() {
    return this.allBattleMembers().filter(actor => actor.isAppeared());
};

Game_Party.prototype.hiddenBattleMembers = function() {
    return this.allBattleMembers().filter(actor => actor.isHidden());
};

Game_Party.prototype.allBattleMembers = function() {
    return this.allMembers().slice(0, this.maxBattleMembers());
};

Game_Party.prototype.maxBattleMembers = function() {
    return 4;
};

Game_Party.prototype.leader = function() {
    return this.battleMembers()[0];
};

Game_Party.prototype.removeInvalidMembers = function() {
    for (const actorId of this._actors) {
        if (!$dataActors[actorId]) {
            this._actors.remove(actorId);
        }
    }
};

Game_Party.prototype.reviveBattleMembers = function() {
    for (const actor of this.battleMembers()) {
        if (actor.isDead()) {
            actor.setHp(1);
        }
    }
};

Game_Party.prototype.items = function() {
    return Object.keys(this._items).map(id => $dataItems[id]);
};

Game_Party.prototype.weapons = function() {
    return Object.keys(this._weapons).map(id => $dataWeapons[id]);
};

Game_Party.prototype.armors = function() {
    return Object.keys(this._armors).map(id => $dataArmors[id]);
};

Game_Party.prototype.equipItems = function() {
    return this.weapons().concat(this.armors());
};

Game_Party.prototype.allItems = function() {
    return this.items().concat(this.equipItems());
};

Game_Party.prototype.itemContainer = function(item) {
    if (!item) {
        return null;
    } else if (DataManager.isItem(item)) {
        return this._items;
    } else if (DataManager.isWeapon(item)) {
        return this._weapons;
    } else if (DataManager.isArmor(item)) {
        return this._armors;
    } else {
        return null;
    }
};

Game_Party.prototype.setupStartingMembers = function() {
    this._actors = [];
    for (const actorId of $dataSystem.partyMembers) {
        if ($gameActors.actor(actorId)) {
            this._actors.push(actorId);
        }
    }
};

Game_Party.prototype.name = function() {
    const numBattleMembers = this.battleMembers().length;
    if (numBattleMembers === 0) {
        return "";
    } else if (numBattleMembers === 1) {
        return this.leader().name();
    } else {
        return TextManager.partyName.format(this.leader().name());
    }
};

Game_Party.prototype.setupBattleTest = function() {
    this.setupBattleTestMembers();
    this.setupBattleTestItems();
};

Game_Party.prototype.setupBattleTestMembers = function() {
    for (const battler of $dataSystem.testBattlers) {
        const actor = $gameActors.actor(battler.actorId);
        if (actor) {
            actor.changeLevel(battler.level, false);
            actor.initEquips(battler.equips);
            actor.recoverAll();
            this.addActor(battler.actorId);
        }
    }
};

Game_Party.prototype.setupBattleTestItems = function() {
    for (const item of $dataItems) {
        if (item && item.name.length > 0) {
            this.gainItem(item, this.maxItems(item));
        }
    }
};

Game_Party.prototype.highestLevel = function() {
    return Math.max(...this.members().map(actor => actor.level));
};

Game_Party.prototype.addActor = function(actorId) {
    if (!this._actors.includes(actorId)) {
        this._actors.push(actorId);
        $gamePlayer.refresh();
        $gameMap.requestRefresh();
        $gameTemp.requestBattleRefresh();
        if (this.inBattle()) {
            const actor = $gameActors.actor(actorId);
            if (this.battleMembers().includes(actor)) {
                actor.onBattleStart();
            }
        }
    }
};

Game_Party.prototype.removeActor = function(actorId) {
    if (this._actors.includes(actorId)) {
        const actor = $gameActors.actor(actorId);
        const wasBattleMember = this.battleMembers().includes(actor);
        this._actors.remove(actorId);
        $gamePlayer.refresh();
        $gameMap.requestRefresh();
        $gameTemp.requestBattleRefresh();
        if (this.inBattle() && wasBattleMember) {
            actor.onBattleEnd();
        }
    }
};

Game_Party.prototype.gold = function() {
    return this._gold;
};

Game_Party.prototype.gainGold = function(amount) {
    this._gold = (this._gold + amount).clamp(0, this.maxGold());
};

Game_Party.prototype.loseGold = function(amount) {
    this.gainGold(-amount);
};

// Database > Reactor Features > Higher Limits ($dataSystem.rrHigherLimits, an
// opt-in): 9,999 of each item and 9,999,999,999 gold. Off (and in any RPG
// Maker MZ project) the stock 99 and 99,999,999 stand.
Game_Party.RR_HIGHER_MAX_GOLD = 9999999999;
Game_Party.RR_HIGHER_MAX_ITEMS = 9999;
Game_Party.rrHigherLimits = function() {
    if (typeof $dataSystem === "undefined" || !$dataSystem || $dataSystem.rrHigherLimits !== true) return false;
    return typeof ReactorFeatures === "undefined" || ReactorFeatures.on("higherLimits");
};

Game_Party.prototype.maxGold = function() {
    return Game_Party.rrHigherLimits() ? Game_Party.RR_HIGHER_MAX_GOLD : 99999999;
};

Game_Party.prototype.steps = function() {
    return this._steps;
};

Game_Party.prototype.increaseSteps = function() {
    this._steps++;
};

Game_Party.prototype.numItems = function(item) {
    const container = this.itemContainer(item);
    return container ? container[item.id] || 0 : 0;
};

Game_Party.prototype.maxItems = function(/*item*/) {
    return Game_Party.rrHigherLimits() ? Game_Party.RR_HIGHER_MAX_ITEMS : 99;
};

Game_Party.prototype.hasMaxItems = function(item) {
    return this.numItems(item) >= this.maxItems(item);
};

Game_Party.prototype.hasItem = function(item, includeEquip) {
    if (this.numItems(item) > 0) {
        return true;
    } else if (includeEquip && this.isAnyMemberEquipped(item)) {
        return true;
    } else {
        return false;
    }
};

Game_Party.prototype.isAnyMemberEquipped = function(item) {
    return this.members().some(actor => actor.equips().includes(item));
};

Game_Party.prototype.gainItem = function(item, amount, includeEquip) {
    const container = this.itemContainer(item);
    if (container) {
        const lastNumber = this.numItems(item);
        const newNumber = lastNumber + amount;
        container[item.id] = newNumber.clamp(0, this.maxItems(item));
        if (container[item.id] === 0) {
            delete container[item.id];
        }
        if (includeEquip && newNumber < 0) {
            this.discardMembersEquip(item, -newNumber);
        }
        $gameMap.requestRefresh();
    }
};

Game_Party.prototype.discardMembersEquip = function(item, amount) {
    let n = amount;
    for (const actor of this.members()) {
        while (n > 0 && actor.isEquipped(item)) {
            actor.discardEquip(item);
            n--;
        }
    }
};

Game_Party.prototype.loseItem = function(item, amount, includeEquip) {
    this.gainItem(item, -amount, includeEquip);
};

Game_Party.prototype.consumeItem = function(item) {
    if (DataManager.isItem(item) && item.consumable) {
        this.loseItem(item, 1);
    }
};

Game_Party.prototype.canUse = function(item) {
    return this.members().some(actor => actor.canUse(item));
};

Game_Party.prototype.canInput = function() {
    return this.members().some(actor => actor.canInput());
};

Game_Party.prototype.isAllDead = function() {
    if (Game_Unit.prototype.isAllDead.call(this)) {
        return this.inBattle() || !this.isEmpty();
    } else {
        return false;
    }
};

Game_Party.prototype.isEscaped = function() {
    return this.isAllDead() && this.hiddenBattleMembers().length > 0;
};

Game_Party.prototype.onPlayerWalk = function() {
    for (const actor of this.members()) {
        actor.onPlayerWalk();
    }
};

Game_Party.prototype.menuActor = function() {
    let actor = $gameActors.actor(this._menuActorId);
    if (!this.members().includes(actor)) {
        actor = this.members()[0];
    }
    return actor;
};

Game_Party.prototype.setMenuActor = function(actor) {
    this._menuActorId = actor.actorId();
};

Game_Party.prototype.makeMenuActorNext = function() {
    let index = this.members().indexOf(this.menuActor());
    if (index >= 0) {
        index = (index + 1) % this.members().length;
        this.setMenuActor(this.members()[index]);
    } else {
        this.setMenuActor(this.members()[0]);
    }
};

Game_Party.prototype.makeMenuActorPrevious = function() {
    let index = this.members().indexOf(this.menuActor());
    if (index >= 0) {
        index = (index + this.members().length - 1) % this.members().length;
        this.setMenuActor(this.members()[index]);
    } else {
        this.setMenuActor(this.members()[0]);
    }
};

Game_Party.prototype.targetActor = function() {
    let actor = $gameActors.actor(this._targetActorId);
    if (!this.members().includes(actor)) {
        actor = this.members()[0];
    }
    return actor;
};

Game_Party.prototype.setTargetActor = function(actor) {
    this._targetActorId = actor.actorId();
};

Game_Party.prototype.lastItem = function() {
    return this._lastItem.object();
};

Game_Party.prototype.setLastItem = function(item) {
    this._lastItem.setObject(item);
};

Game_Party.prototype.swapOrder = function(index1, index2) {
    const temp = this._actors[index1];
    this._actors[index1] = this._actors[index2];
    this._actors[index2] = temp;
    $gamePlayer.refresh();
};

Game_Party.prototype.charactersForSavefile = function() {
    return this.battleMembers().map(actor => [
        actor.characterName(),
        actor.characterIndex()
    ]);
};

Game_Party.prototype.facesForSavefile = function() {
    return this.battleMembers().map(actor => [
        actor.faceName(),
        actor.faceIndex()
    ]);
};

Game_Party.prototype.partyAbility = function(abilityId) {
    return this.battleMembers().some(actor => actor.partyAbility(abilityId));
};

Game_Party.prototype.hasEncounterHalf = function() {
    return this.partyAbility(Game_Party.ABILITY_ENCOUNTER_HALF);
};

Game_Party.prototype.hasEncounterNone = function() {
    return this.partyAbility(Game_Party.ABILITY_ENCOUNTER_NONE);
};

Game_Party.prototype.hasCancelSurprise = function() {
    return this.partyAbility(Game_Party.ABILITY_CANCEL_SURPRISE);
};

Game_Party.prototype.hasRaisePreemptive = function() {
    return this.partyAbility(Game_Party.ABILITY_RAISE_PREEMPTIVE);
};

Game_Party.prototype.hasGoldDouble = function() {
    return this.partyAbility(Game_Party.ABILITY_GOLD_DOUBLE);
};

Game_Party.prototype.hasDropItemDouble = function() {
    return this.partyAbility(Game_Party.ABILITY_DROP_ITEM_DOUBLE);
};

Game_Party.prototype.ratePreemptive = function(troopAgi) {
    let rate = this.agility() >= troopAgi ? 0.05 : 0.03;
    if (this.hasRaisePreemptive()) {
        rate *= 4;
    }
    return rate;
};

Game_Party.prototype.rateSurprise = function(troopAgi) {
    let rate = this.agility() >= troopAgi ? 0.03 : 0.05;
    if (this.hasCancelSurprise()) {
        rate = 0;
    }
    return rate;
};

Game_Party.prototype.performVictory = function() {
    for (const actor of this.members()) {
        actor.performVictory();
    }
};

Game_Party.prototype.performEscape = function() {
    for (const actor of this.members()) {
        actor.performEscape();
    }
};

Game_Party.prototype.removeBattleStates = function() {
    for (const actor of this.members()) {
        actor.removeBattleStates();
    }
};

Game_Party.prototype.requestMotionRefresh = function() {
    for (const actor of this.members()) {
        actor.requestMotionRefresh();
    }
};

Game_Party.prototype.onEscapeFailure = function() {
    for (const actor of this.members()) {
        actor.onEscapeFailure();
    }
};

//-----------------------------------------------------------------------------
// Game_Troop
//
// The game object class for a troop and the battle-related data.

function Game_Troop() {
    this.initialize(...arguments);
}

Game_Troop.prototype = Object.create(Game_Unit.prototype);
Game_Troop.prototype.constructor = Game_Troop;

// prettier-ignore
Game_Troop.LETTER_TABLE_HALF = [
    " A"," B"," C"," D"," E"," F"," G"," H"," I"," J"," K"," L"," M",
    " N"," O"," P"," Q"," R"," S"," T"," U"," V"," W"," X"," Y"," Z"
];
// prettier-ignore
Game_Troop.LETTER_TABLE_FULL = [
    "Ａ","Ｂ","Ｃ","Ｄ","Ｅ","Ｆ","Ｇ","Ｈ","Ｉ","Ｊ","Ｋ","Ｌ","Ｍ",
    "Ｎ","Ｏ","Ｐ","Ｑ","Ｒ","Ｓ","Ｔ","Ｕ","Ｖ","Ｗ","Ｘ","Ｙ","Ｚ"
];

Game_Troop.prototype.initialize = function() {
    Game_Unit.prototype.initialize.call(this);
    this._interpreter = new Game_Interpreter();
    this.clear();
};

Game_Troop.prototype.isEventRunning = function() {
    return this._interpreter.isRunning();
};

Game_Troop.prototype.updateInterpreter = function() {
    this._interpreter.update();
};

Game_Troop.prototype.turnCount = function() {
    return this._turnCount;
};

Game_Troop.prototype.members = function() {
    return this._enemies;
};

Game_Troop.prototype.clear = function() {
    this._interpreter.clear();
    this._troopId = 0;
    this._eventFlags = {};
    this._enemies = [];
    this._turnCount = 0;
    this._namesCount = {};
};

Game_Troop.prototype.troop = function() {
    return $dataTroops[this._troopId];
};

Game_Troop.prototype.setup = function(troopId) {
    this.clear();
    this._troopId = troopId;
    this._enemies = [];
    for (const member of this.troop().members) {
        if ($dataEnemies[member.enemyId]) {
            const enemyId = member.enemyId;
            const x = member.x;
            const y = member.y;
            const enemy = new Game_Enemy(enemyId, x, y);
            if (member.hidden) {
                enemy.hide();
            }
            this._enemies.push(enemy);
        }
    }
    this.makeUniqueNames();
};

Game_Troop.prototype.makeUniqueNames = function() {
    const table = this.letterTable();
    for (const enemy of this.members()) {
        if (enemy.isAlive() && enemy.isLetterEmpty()) {
            const name = enemy.originalName();
            const n = this._namesCount[name] || 0;
            enemy.setLetter(table[n % table.length]);
            this._namesCount[name] = n + 1;
        }
    }
    this.updatePluralFlags();
};

Game_Troop.prototype.updatePluralFlags = function() {
    for (const enemy of this.members()) {
        const name = enemy.originalName();
        if (this._namesCount[name] >= 2) {
            enemy.setPlural(true);
        }
    }
};

Game_Troop.prototype.letterTable = function() {
    return $gameSystem.isCJK()
        ? Game_Troop.LETTER_TABLE_FULL
        : Game_Troop.LETTER_TABLE_HALF;
};

Game_Troop.prototype.enemyNames = function() {
    const names = [];
    for (const enemy of this.members()) {
        const name = enemy.originalName();
        if (enemy.isAlive() && !names.includes(name)) {
            names.push(name);
        }
    }
    return names;
};

Game_Troop.prototype.meetsConditions = function(page) {
    const c = page.conditions;
    if (
        !c.turnEnding &&
        !c.turnValid &&
        !c.enemyValid &&
        !c.actorValid &&
        !c.switchValid
    ) {
        return false; // Conditions not set
    }
    if (c.turnEnding) {
        if (!BattleManager.isTurnEnd()) {
            return false;
        }
    }
    if (c.turnValid) {
        const n = this._turnCount;
        const a = c.turnA;
        const b = c.turnB;
        if (b === 0 && n !== a) {
            return false;
        }
        if (b > 0 && (n < 1 || n < a || n % b !== a % b)) {
            return false;
        }
    }
    if (c.enemyValid) {
        const enemy = $gameTroop.members()[c.enemyIndex];
        if (!enemy || enemy.hpRate() * 100 > c.enemyHp) {
            return false;
        }
    }
    if (c.actorValid) {
        const actor = $gameActors.actor(c.actorId);
        if (!actor || actor.hpRate() * 100 > c.actorHp) {
            return false;
        }
    }
    if (c.switchValid) {
        if (!$gameSwitches.value(c.switchId)) {
            return false;
        }
    }
    return true;
};

Game_Troop.prototype.setupBattleEvent = function() {
    if (!this._interpreter.isRunning()) {
        if (this._interpreter.setupReservedCommonEvent()) {
            return;
        }
        const pages = this.troop().pages;
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            if (this.meetsConditions(page) && !this._eventFlags[i]) {
                this._interpreter.setup(page.list);
                if (page.span <= 1) {
                    this._eventFlags[i] = true;
                }
                break;
            }
        }
    }
};

Game_Troop.prototype.increaseTurn = function() {
    const pages = this.troop().pages;
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (page.span === 1) {
            this._eventFlags[i] = false;
        }
    }
    this._turnCount++;
};

Game_Troop.prototype.expTotal = function() {
    return this.deadMembers().reduce((r, enemy) => r + enemy.exp(), 0);
};

Game_Troop.prototype.goldTotal = function() {
    const members = this.deadMembers();
    return members.reduce((r, enemy) => r + enemy.gold(), 0) * this.goldRate();
};

Game_Troop.prototype.goldRate = function() {
    return $gameParty.hasGoldDouble() ? 2 : 1;
};

Game_Troop.prototype.makeDropItems = function() {
    const members = this.deadMembers();
    return members.reduce((r, enemy) => r.concat(enemy.makeDropItems()), []);
};

Game_Troop.prototype.isTpbTurnEnd = function() {
    const members = this.members();
    const turnMax = Math.max(...members.map(member => member.turnCount()));
    return turnMax > this._turnCount;
};
