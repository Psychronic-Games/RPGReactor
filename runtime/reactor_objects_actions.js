//=============================================================================
// reactor_objects_actions.js v1.7.0
//=============================================================================
// Game_Action and Game_ActionResult.
// Part of reactor_objects.js; loads after reactor_objects.js.

//-----------------------------------------------------------------------------
// Game_Action
//
// The game object class for a battle action.

function Game_Action() {
    this.initialize(...arguments);
}

Game_Action.EFFECT_RECOVER_HP = 11;
Game_Action.EFFECT_RECOVER_MP = 12;
Game_Action.EFFECT_GAIN_TP = 13;
Game_Action.EFFECT_ADD_STATE = 21;
Game_Action.EFFECT_REMOVE_STATE = 22;
Game_Action.EFFECT_ADD_BUFF = 31;
Game_Action.EFFECT_ADD_DEBUFF = 32;
Game_Action.EFFECT_REMOVE_BUFF = 33;
Game_Action.EFFECT_REMOVE_DEBUFF = 34;
Game_Action.EFFECT_SPECIAL = 41;
Game_Action.EFFECT_GROW = 42;
Game_Action.EFFECT_LEARN_SKILL = 43;
Game_Action.EFFECT_COMMON_EVENT = 44;
Game_Action.SPECIAL_EFFECT_ESCAPE = 0;
Game_Action.HITTYPE_CERTAIN = 0;
Game_Action.HITTYPE_PHYSICAL = 1;
Game_Action.HITTYPE_MAGICAL = 2;

// Action scopes. 0-14 are RPG Maker MZ's own values and keep MZ's exact
// meaning, so data authored anywhere in the MZ ecosystem loads unchanged.
//
// 15 and up are Reactor's. MZ has no scope that reaches both sides of the
// battle: an action is aimed at opponents or at friends, decided by the
// scope, and the only way around it is a plugin that replaces item.scope
// with a string it parses itself. These make "either side" an ordinary
// database value instead, so the Scope dropdown can offer it and the
// isFor* predicates below group it like any other scope.
Game_Action.SCOPE_ONE_ALLY_OR_ENEMY = 15;
Game_Action.SCOPE_ONE_ENEMY_OR_ALLY = 16;
Game_Action.SCOPE_ALL_ONE_SIDE = 17;
Game_Action.SCOPE_ALL_ALLIES_BUT_USER = 18;
Game_Action.SCOPE_RANDOM_ANY_1 = 19;
Game_Action.SCOPE_RANDOM_ANY_2 = 20;
Game_Action.SCOPE_RANDOM_ANY_3 = 21;
Game_Action.SCOPE_RANDOM_ANY_4 = 22;

// Scopes whose side is decided when the target is chosen rather than by the
// scope itself.
Game_Action.EITHER_SIDE_SCOPES = [15, 16, 17];
// Scopes that draw their targets at random from both sides at once.
Game_Action.RANDOM_ANY_SCOPES = [19, 20, 21, 22];

Game_Action.prototype.initialize = function(subject, forcing) {
    this._subjectActorId = 0;
    this._subjectEnemyIndex = -1;
    this._forcing = forcing || false;
    this.setSubject(subject);
    this.clear();
};

Game_Action.prototype.clear = function() {
    this._item = new Game_Item();
    this._targetIndex = -1;
    this._targetSideIsFriend = null;
    this._repeatsRoll = null;
};

Game_Action.prototype.setSubject = function(subject) {
    if (subject.isActor()) {
        this._subjectActorId = subject.actorId();
        this._subjectEnemyIndex = -1;
    } else {
        this._subjectEnemyIndex = subject.index();
        this._subjectActorId = 0;
    }
};

Game_Action.prototype.subject = function() {
    if (this._subjectActorId > 0) {
        return $gameActors.actor(this._subjectActorId);
    } else {
        return $gameTroop.members()[this._subjectEnemyIndex];
    }
};

Game_Action.prototype.friendsUnit = function() {
    return this.subject().friendsUnit();
};

Game_Action.prototype.opponentsUnit = function() {
    return this.subject().opponentsUnit();
};

Game_Action.prototype.setEnemyAction = function(action) {
    if (action) {
        this.setSkill(action.skillId);
    } else {
        this.clear();
    }
};

Game_Action.prototype.setAttack = function() {
    this.setSkill(this.subject().attackSkillId());
};

Game_Action.prototype.setGuard = function() {
    this.setSkill(this.subject().guardSkillId());
};

Game_Action.prototype.setSkill = function(skillId) {
    this._item.setObject($dataSkills[skillId]);
};

Game_Action.prototype.setItem = function(itemId) {
    this._item.setObject($dataItems[itemId]);
};

Game_Action.prototype.setItemObject = function(object) {
    this._item.setObject(object);
};

Game_Action.prototype.setTarget = function(targetIndex) {
    this._targetIndex = targetIndex;
    this._targetSideIsFriend = null;
};

// Records which battler was chosen along with which side it was on. A target
// index cannot carry that on its own - index 0 is both the first actor and
// the first enemy - so the either-side scopes need the side stored beside it.
// Separate from setTarget so every existing caller keeps its meaning.
Game_Action.prototype.setTargetBattler = function(battler) {
    if (!battler) {
        return;
    }
    this._targetIndex = battler.index();
    this._targetSideIsFriend = battler.isActor() === this.subject().isActor();
};

// The unit holding the chosen target: the side recorded at selection time, or
// the side the scope opens on when nothing was recorded (an AI user, or a save
// written before the side was tracked).
Game_Action.prototype.targetSideUnit = function() {
    if (this._targetSideIsFriend === true) {
        return this.friendsUnit();
    }
    if (this._targetSideIsFriend === false) {
        return this.opponentsUnit();
    }
    return this.isForAnyoneFocusFriends()
        ? this.friendsUnit()
        : this.opponentsUnit();
};

Game_Action.prototype.item = function() {
    return this._item.object();
};

Game_Action.prototype.isSkill = function() {
    return this._item.isSkill();
};

Game_Action.prototype.isItem = function() {
    return this._item.isItem();
};

Game_Action.prototype.numRepeats = function() {
    let repeats = this.itemRepeats();
    if (this.isAttack()) {
        repeats += this.subject().attackTimesAdd();
    }
    return Math.max(1, Math.min(100, Math.floor(Number(repeats) || 1)));
};

// Repeats is the fewest hits; a repeatsMax above it makes the count a range.
// The roll is made once and kept on the action, because numRepeats is read
// many times for one action - to lay out its targets, in AI scoring, and by
// plugins mid-action - and every read has to agree. It is keyed by the item,
// so giving the same action a different skill or item rolls again.
Game_Action.prototype.itemRepeats = function() {
    const item = this.item();
    const min = Math.floor(Number(item.repeats) || 1);
    const max = Math.min(100, Math.floor(Number(item.repeatsMax) || 0));
    if (max <= min) {
        return item.repeats;
    }
    const key = this._item._dataClass + ":" + this._item._itemId;
    if (!this._repeatsRoll || this._repeatsRoll.key !== key) {
        this._repeatsRoll = { key: key, value: min + Math.randomInt(max - min + 1) };
    }
    return this._repeatsRoll.value;
};

Game_Action.prototype.checkItemScope = function(list) {
    return list.includes(this.item().scope);
};

// The either-side and random-any scopes answer true to both isForOpponent and
// isForFriend: they really can reach either side, and this pair of predicates
// is what every consumer - the engine, action conditions, plugins - asks to
// learn who an action may touch. makeTargets below is ordered to resolve them
// before either of these can steer the action onto one fixed side.
Game_Action.prototype.isForOpponent = function() {
    return this.checkItemScope([1, 2, 3, 4, 5, 6, 14, 15, 16, 17, 19, 20, 21, 22]);
};

Game_Action.prototype.isForFriend = function() {
    return this.checkItemScope([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
};

Game_Action.prototype.isForEveryone = function() {
    return this.checkItemScope([14]);
};

Game_Action.prototype.isForAliveFriend = function() {
    return this.checkItemScope([7, 8, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
};

Game_Action.prototype.isForDeadFriend = function() {
    return this.checkItemScope([9, 10]);
};

Game_Action.prototype.isForUser = function() {
    return this.checkItemScope([11]);
};

Game_Action.prototype.isForOne = function() {
    return this.checkItemScope([1, 3, 7, 9, 11, 12, 15, 16]);
};

Game_Action.prototype.isForRandom = function() {
    return this.checkItemScope([3, 4, 5, 6, 19, 20, 21, 22]);
};

Game_Action.prototype.isForAll = function() {
    return this.checkItemScope([2, 8, 10, 13, 14, 17, 18]);
};

Game_Action.prototype.needsSelection = function() {
    return this.checkItemScope([1, 7, 9, 12, 15, 16, 17]);
};

// True when the action may reach either side, the side being settled when the
// target is picked. Scope 17 is included: choosing a battler there chooses that
// battler's whole side.
Game_Action.prototype.isForAnyone = function() {
    return this.checkItemScope(Game_Action.EITHER_SIDE_SCOPES);
};

// Which side an either-side scope opens its cursor on. Only the focus differs;
// both scopes can still reach every living battler.
Game_Action.prototype.isForAnyoneFocusFriends = function() {
    return this.checkItemScope([15]);
};

Game_Action.prototype.isForAnyoneFocusOpponents = function() {
    return this.checkItemScope([16, 17]);
};

// True when picking one battler picks that battler's entire living side.
Game_Action.prototype.isForOneSide = function() {
    return this.checkItemScope([17]);
};

// True for the random scopes that draw from both sides at once, as distinct
// from scopes 3-6, which draw from opponents only.
Game_Action.prototype.isForRandomAny = function() {
    return this.checkItemScope(Game_Action.RANDOM_ANY_SCOPES);
};

Game_Action.prototype.isForAllAlliesButUser = function() {
    return this.checkItemScope([18]);
};

Game_Action.prototype.numTargets = function() {
    if (this.isForRandomAny()) {
        return this.item().scope - 18;
    }
    return this.isForRandom() ? this.item().scope - 2 : 0;
};

Game_Action.prototype.checkDamageType = function(list) {
    return list.includes(this.item().damage.type);
};

Game_Action.prototype.isHpEffect = function() {
    return this.checkDamageType([1, 3, 5]);
};

Game_Action.prototype.isMpEffect = function() {
    return this.checkDamageType([2, 4, 6]);
};

Game_Action.prototype.isDamage = function() {
    return this.checkDamageType([1, 2]);
};

Game_Action.prototype.isRecover = function() {
    return this.checkDamageType([3, 4]);
};

Game_Action.prototype.isDrain = function() {
    return this.checkDamageType([5, 6]);
};

Game_Action.prototype.isHpRecover = function() {
    return this.checkDamageType([3]);
};

Game_Action.prototype.isMpRecover = function() {
    return this.checkDamageType([4]);
};

Game_Action.prototype.isCertainHit = function() {
    return this.item().hitType === Game_Action.HITTYPE_CERTAIN;
};

Game_Action.prototype.isPhysical = function() {
    return this.item().hitType === Game_Action.HITTYPE_PHYSICAL;
};

Game_Action.prototype.isMagical = function() {
    return this.item().hitType === Game_Action.HITTYPE_MAGICAL;
};

Game_Action.prototype.isAttack = function() {
    return this.item() === $dataSkills[this.subject().attackSkillId()];
};

Game_Action.prototype.isGuard = function() {
    return this.item() === $dataSkills[this.subject().guardSkillId()];
};

Game_Action.prototype.isMagicSkill = function() {
    if (this.isSkill()) {
        return $dataSystem.magicSkills.includes(this.item().stypeId);
    } else {
        return false;
    }
};

Game_Action.prototype.decideRandomTarget = function() {
    let target;
    if (this.isForDeadFriend()) {
        target = this.friendsUnit().randomDeadTarget();
    } else if (this.isForFriend()) {
        target = this.friendsUnit().randomTarget();
    } else {
        target = this.opponentsUnit().randomTarget();
    }
    if (target) {
        this.setTargetBattler(target);
    } else {
        this.clear();
    }
};

Game_Action.prototype.setConfusion = function() {
    this.setAttack();
};

Game_Action.prototype.prepare = function() {
    if (this.subject().isConfused() && !this._forcing) {
        this.setConfusion();
    }
};

Game_Action.prototype.isValid = function() {
    return (this._forcing && this.item()) || this.subject().canUse(this.item());
};

Game_Action.prototype.speed = function() {
    const agi = this.subject().agi;
    let speed = agi + Math.randomInt(Math.floor(5 + agi / 4));
    if (this.item()) {
        speed += this.item().speed;
    }
    if (this.isAttack()) {
        speed += this.subject().attackSpeed();
    }
    return speed;
};

Game_Action.prototype.makeTargets = function() {
    const targets = [];
    if (!this._forcing && this.subject().isConfused()) {
        targets.push(this.confusionTarget());
    } else if (this.isForRandomAny()) {
        targets.push(...this.targetsForRandomAny());
    } else if (this.isForAnyone()) {
        targets.push(...this.targetsForAnyone());
    } else if (this.isForAllAlliesButUser()) {
        targets.push(...this.targetsForAlliesButUser());
    } else if (this.isForEveryone()) {
        targets.push(...this.targetsForEveryone());
    } else if (this.isForOpponent()) {
        targets.push(...this.targetsForOpponents());
    } else if (this.isForFriend()) {
        targets.push(...this.targetsForFriends());
    }
    return this.repeatTargets(targets);
};

Game_Action.prototype.repeatTargets = function(targets) {
    const repeatedTargets = [];
    const repeats = this.numRepeats();
    for (const target of targets) {
        if (target) {
            for (let i = 0; i < repeats; i++) {
                repeatedTargets.push(target);
            }
        }
    }
    return repeatedTargets;
};

// Targets decided for an action before BattleManager.startAction rolls them.
//
// startAction asks makeTargets() for targets at the moment the action begins.
// A plugin that has to decide them earlier -- testing a reaction against the
// exact battlers a random scope picked, or replaying a copied action onto the
// targets of the one it copies -- hands them over here, and startAction uses
// them instead of rolling again. They are taken once, and only by startAction,
// so anything else that calls makeTargets() before then (a target preview, a
// viability check) still gets a fresh answer and cannot use them up.
//
// `targets` is an array of battlers, or a function returning one that is
// called with the action as `this` when the action starts -- for targets that
// must be checked again at that moment, since a battler may have fallen in
// between. An empty result falls back to makeTargets(). The plan is kept off
// the action object, so a JsonEx copy of the action or a save file never
// carries battler references.
Game_Action._plannedTargets = new WeakMap();

Game_Action.prototype.setPlannedTargets = function(targets) {
    if (Array.isArray(targets)) {
        Game_Action._plannedTargets.set(this, targets.slice());
    } else if (typeof targets === "function") {
        Game_Action._plannedTargets.set(this, targets);
    } else {
        Game_Action._plannedTargets.delete(this);
    }
};

Game_Action.prototype.hasPlannedTargets = function() {
    return Game_Action._plannedTargets.has(this);
};

Game_Action.prototype.clearPlannedTargets = function() {
    Game_Action._plannedTargets.delete(this);
};

Game_Action.prototype.takePlannedTargets = function() {
    const planned = Game_Action._plannedTargets.get(this);
    if (planned === undefined) {
        return null;
    }
    Game_Action._plannedTargets.delete(this);
    const targets = typeof planned === "function" ? planned.call(this) : planned;
    return Array.isArray(targets) && targets.length > 0 ? targets : null;
};

Game_Action.prototype.confusionTarget = function() {
    switch (this.subject().confusionLevel()) {
        case 1:
            return this.opponentsUnit().randomTarget();
        case 2:
            if (Math.randomInt(2) === 0) {
                return this.opponentsUnit().randomTarget();
            }
            return this.friendsUnit().randomTarget();
        default:
            return this.friendsUnit().randomTarget();
    }
};

Game_Action.prototype.targetsForEveryone = function() {
    const opponentMembers = this.opponentsUnit().aliveMembers();
    const friendMembers = this.friendsUnit().aliveMembers();
    return opponentMembers.concat(friendMembers);
};

// The side was settled when the target was chosen, so resolve against that
// side and let the ordinary one-versus-all split take over from there.
Game_Action.prototype.targetsForAnyone = function() {
    const unit = this.targetSideUnit();
    if (this.isForOneSide()) {
        return unit.aliveMembers();
    }
    return this.targetsForAlive(unit);
};

// Each draw picks a side first, then a battler on it. Drawing from the two
// units combined would instead favour whichever side has more members left.
Game_Action.prototype.targetsForRandomAny = function() {
    const targets = [];
    for (let i = 0; i < this.numTargets(); i++) {
        const living = [this.friendsUnit(), this.opponentsUnit()]
            .filter(unit => unit.aliveMembers().length > 0);
        if (living.length === 0) {
            break;
        }
        // A side with living members can still yield nothing when something
        // upstream is narrowing the draw - Battle A.I. restricts randomTarget
        // to the targets its conditions chose - so try the other side rather
        // than spending the roll on nothing.
        const first = Math.randomInt(living.length);
        let target = null;
        for (let n = 0; n < living.length && !target; n++) {
            target = living[(first + n) % living.length].randomTarget();
        }
        if (target) {
            targets.push(target);
        }
    }
    return targets;
};

Game_Action.prototype.targetsForAlliesButUser = function() {
    return this.friendsUnit()
        .aliveMembers()
        .filter(member => member !== this.subject());
};

Game_Action.prototype.targetsForOpponents = function() {
    const unit = this.opponentsUnit();
    if (this.isForRandom()) {
        return this.randomTargets(unit);
    } else {
        return this.targetsForAlive(unit);
    }
};

Game_Action.prototype.targetsForFriends = function() {
    const unit = this.friendsUnit();
    if (this.isForUser()) {
        return [this.subject()];
    } else if (this.isForDeadFriend()) {
        return this.targetsForDead(unit);
    } else if (this.isForAliveFriend()) {
        return this.targetsForAlive(unit);
    } else {
        return this.targetsForDeadAndAlive(unit);
    }
};

Game_Action.prototype.randomTargets = function(unit) {
    const targets = [];
    for (let i = 0; i < this.numTargets(); i++) {
        targets.push(unit.randomTarget());
    }
    return targets;
};

Game_Action.prototype.targetsForDead = function(unit) {
    if (this.isForOne()) {
        return [unit.smoothDeadTarget(this._targetIndex)];
    } else {
        return unit.deadMembers();
    }
};

Game_Action.prototype.targetsForAlive = function(unit) {
    if (this.isForOne()) {
        if (this._targetIndex < 0) {
            return [unit.randomTarget()];
        } else {
            return [unit.smoothTarget(this._targetIndex)];
        }
    } else {
        return unit.aliveMembers();
    }
};

Game_Action.prototype.targetsForDeadAndAlive = function(unit) {
    if (this.isForOne()) {
        return [unit.members()[this._targetIndex]];
    } else {
        return unit.members();
    }
};

Game_Action.prototype.evaluate = function() {
    let value = 0;
    for (const target of this.itemTargetCandidates()) {
        const targetValue = this.evaluateWithTarget(target);
        if (this.isForAll()) {
            value += targetValue;
        } else if (targetValue > value) {
            value = targetValue;
            this.setTargetBattler(target);
        }
    }
    value *= this.numRepeats();
    if (value > 0) {
        value += Math.random();
    }
    return value;
};

Game_Action.prototype.itemTargetCandidates = function() {
    if (!this.isValid()) {
        return [];
    } else if (this.isForAnyone() || this.isForRandomAny()) {
        return this.opponentsUnit()
            .aliveMembers()
            .concat(this.friendsUnit().aliveMembers());
    } else if (this.isForAllAlliesButUser()) {
        return this.targetsForAlliesButUser();
    } else if (this.isForOpponent()) {
        return this.opponentsUnit().aliveMembers();
    } else if (this.isForUser()) {
        return [this.subject()];
    } else if (this.isForDeadFriend()) {
        return this.friendsUnit().deadMembers();
    } else {
        return this.friendsUnit().aliveMembers();
    }
};

Game_Action.prototype.evaluateWithTarget = function(target) {
    if (this.isHpEffect()) {
        const value = this.makeDamageValue(target, false);
        if (this.isForOpponent()) {
            return value / Math.max(target.hp, 1);
        } else {
            const recovery = Math.min(-value, target.mhp - target.hp);
            return recovery / target.mhp;
        }
    }
};

Game_Action.prototype.testApply = function(target) {
    return (
        this.testLifeAndDeath(target) &&
        ($gameParty.inBattle() ||
            (this.isHpRecover() && target.hp < target.mhp) ||
            (this.isMpRecover() && target.mp < target.mmp) ||
            this.testSecondaryRecover(target) ||
            this.hasItemAnyValidEffects(target))
    );
};

/** A secondary Recover makes the action worth using, as a primary one does. */
Game_Action.prototype.testSecondaryRecover = function(target) {
    const secondary = this.secondaryDamage();
    if (!secondary) return false;
    return (
        (secondary.type === 3 && target.hp < target.mhp) ||
        (secondary.type === 4 && target.mp < target.mmp)
    );
};

Game_Action.prototype.testLifeAndDeath = function(target) {
    if (this.isForOpponent() || this.isForAliveFriend()) {
        return target.isAlive();
    } else if (this.isForDeadFriend()) {
        return target.isDead();
    } else {
        return true;
    }
};

Game_Action.prototype.hasItemAnyValidEffects = function(target) {
    return this.item().effects.some(effect =>
        this.testItemEffect(target, effect)
    );
};

Game_Action.prototype.testItemEffect = function(target, effect) {
    switch (effect.code) {
        case Game_Action.EFFECT_RECOVER_HP:
            return (
                target.hp < target.mhp || effect.value1 < 0 || effect.value2 < 0
            );
        case Game_Action.EFFECT_RECOVER_MP:
            return (
                target.mp < target.mmp || effect.value1 < 0 || effect.value2 < 0
            );
        case Game_Action.EFFECT_ADD_STATE:
            return !target.isStateAffected(effect.dataId);
        case Game_Action.EFFECT_REMOVE_STATE:
            return target.isStateAffected(effect.dataId);
        case Game_Action.EFFECT_ADD_BUFF:
            return !target.isMaxBuffAffected(effect.dataId);
        case Game_Action.EFFECT_ADD_DEBUFF:
            return !target.isMaxDebuffAffected(effect.dataId);
        case Game_Action.EFFECT_REMOVE_BUFF:
            return target.isBuffAffected(effect.dataId);
        case Game_Action.EFFECT_REMOVE_DEBUFF:
            return target.isDebuffAffected(effect.dataId);
        case Game_Action.EFFECT_LEARN_SKILL:
            return target.isActor() && !target.isLearnedSkill(effect.dataId);
        default:
            return true;
    }
};

Game_Action.prototype.itemCnt = function(target) {
    if (this.isPhysical() && target.canMove()) {
        return target.cnt;
    } else {
        return 0;
    }
};

Game_Action.prototype.itemMrf = function(target) {
    if (this.isMagical()) {
        return target.mrf;
    } else {
        return 0;
    }
};

Game_Action.prototype.itemHit = function(/*target*/) {
    const successRate = this.item().successRate;
    if (this.isPhysical()) {
        return successRate * 0.01 * this.subject().hit;
    } else {
        return successRate * 0.01;
    }
};

Game_Action.prototype.itemEva = function(target) {
    if (this.isPhysical()) {
        return target.eva;
    } else if (this.isMagical()) {
        return target.mev;
    } else {
        return 0;
    }
};

Game_Action.prototype.itemCri = function(target) {
    return this.item().damage.critical
        ? this.subject().cri * (1 - target.cev)
        : 0;
};

Game_Action.prototype.apply = function(target) {
    const result = target.result();
    this.subject().clearResult();
    result.clear();
    result.used = this.testApply(target);
    result.missed = result.used && Math.random() >= this.itemHit(target);
    result.evaded = !result.missed && Math.random() < this.itemEva(target);
    result.physical = this.isPhysical();
    result.drain = this.isDrain();
    if (result.isHit()) {
        if (this.item().damage.type > 0) {
            const critical = Math.random() < this.itemCri(target);
            result.critical = critical;
            const value = this.makeDamageValue(target, critical);
            this.executeDamage(target, value);
            this.executeSecondaryDamage(target, value, critical);
        }
        if (!result.dodged) {
            for (const effect of this.item().effects) {
                this.applyItemEffect(target, effect);
            }
            this.applyItemUserEffect(target);
        }
    }
    this.updateLastTarget(target);
    ReactorEvents.emit("actionApplied", { action: this, subject: this.subject(), target, result });
};

/**
 * The second resource a skill or item moves, or null. `damage.secondary`
 * names an effect - damage, recover or drain - that always lands on the
 * resource the primary type does not use, so HP Damage with an MP Drain
 * can be written and HP Damage with an HP Drain cannot. Its amount is its
 * own formula, or a rate of the primary's calculated value. Written only
 * when used, so an action without it reads exactly as it always has.
 */
Game_Action.SECONDARY_DAMAGE_EFFECTS = ["damage", "recover", "drain"];

Game_Action.prototype.secondaryDamage = function() {
    const item = this.item();
    const damage = item && item.damage;
    const secondary = damage && damage.secondary;
    if (!secondary || !(damage.type >= 1 && damage.type <= 6)) return null;
    const effect = Game_Action.SECONDARY_DAMAGE_EFFECTS.indexOf(secondary.effect);
    if (effect < 0) return null;
    const basis = secondary.basis === "formula" ? "formula" : "rate";
    const rate = Number(secondary.rate) || 0;
    const formula = String(secondary.formula ?? "");
    if (basis === "rate" ? !(rate > 0) : !formula.trim()) return null;
    // HP types are odd (1, 3, 5) and MP types even (2, 4, 6).
    const type = effect * 2 + (damage.type % 2 === 1 ? 2 : 1);
    return { type, basis, rate, formula };
};

Game_Action.damageTypeSign = function(type) {
    return type === 3 || type === 4 ? -1 : 1;
};

/**
 * Apply the secondary channel to a target the primary has just hit, as a
 * pass of its own through makeDamageValue and executeDamage. For that pass
 * the item's damage type (and, by formula, its formula) are the
 * secondary's, so every check and every wrapper sees an ordinary action of
 * one type: an undead reversal, a barrier or a break shield judges each
 * resource by itself. Plugins read `damage.type` and `damage.formula` off
 * the item directly, which is why the fields themselves change rather than
 * a method answering differently; both are put back before this returns.
 *
 * By rate, the amount is the primary's value scaled, carrying its sign, so
 * a primary an element absorbed turns the secondary round with it; element,
 * critical and variance are already in that number and are not applied
 * again. Returns the value executed, or null when there was nothing to do.
 */
Game_Action.prototype.executeSecondaryDamage = function(target, primaryValue, critical) {
    const secondary = this.secondaryDamage();
    const result = target.result();
    if (!secondary || result.dodged) return null;
    const damage = this.item().damage;
    const primaryType = damage.type;
    const primaryFormula = damage.formula;
    const priorChannel = this._rrDamageChannel;
    const primaryCritical = result.critical;
    let value = 0;
    damage.type = secondary.type;
    if (secondary.basis === "formula") damage.formula = secondary.formula;
    this._rrDamageChannel = "secondary";
    try {
        value = secondary.basis === "formula"
            ? this.makeDamageValue(target, critical)
            : Math.round(primaryValue * secondary.rate / 100 *
                Game_Action.damageTypeSign(secondary.type) / Game_Action.damageTypeSign(primaryType));
        this.executeDamage(target, value);
    } finally {
        damage.type = primaryType;
        damage.formula = primaryFormula;
        this._rrDamageChannel = priorChannel;
    }
    // executeDamage clears the flag for a value of 0: a secondary that did
    // nothing must not take the primary's critical away.
    result.critical = primaryCritical || (critical && value !== 0);
    // One drain flag per resource. `drain` itself follows the HP channel,
    // which is what decides whether the HP line shakes and how it reads.
    const hpIsPrimary = primaryType % 2 === 1;
    result.hpDrain = hpIsPrimary ? primaryType === 5 : secondary.type === 5;
    result.mpDrain = hpIsPrimary ? secondary.type === 6 : primaryType === 6;
    result.drain = result.hpDrain;
    return value;
};

Game_Action.prototype.makeDamageValue = function(target, critical) {
    const item = this.item();
    const baseValue = this.evalDamageFormula(target);
    let value = baseValue * this.calcElementRate(target);
    if (this.isPhysical()) {
        value *= target.pdr;
    }
    if (this.isMagical()) {
        value *= target.mdr;
    }
    if (baseValue < 0) {
        value *= target.rec;
    }
    if (critical) {
        value = this.applyCritical(value);
    }
    value = this.applyVariance(value, item.damage.variance);
    value = this.applyGuard(value, target);
    value = Math.round(value);
    return value;
};

Game_Action.prototype.evalDamageFormula = function(target) {
    try {
        const item = this.item();
        const a = this.subject(); // eslint-disable-line no-unused-vars
        const b = target; // eslint-disable-line no-unused-vars
        const v = $gameVariables._data; // eslint-disable-line no-unused-vars
        const sign = [3, 4].includes(item.damage.type) ? -1 : 1;
        const value = Math.max(eval(item.damage.formula), 0) * sign;
        return isNaN(value) ? 0 : value;
    } catch (e) {
        return 0;
    }
};

/**
 * The elements this action carries. `damage.elementIds` holds two or more
 * (the editor writes it only then, with `elementId` mirroring its first
 * entry); otherwise the one `elementId`, or the user's own attack elements
 * for Normal Attack (-1). For every entry authored before lists existed
 * this is exactly the branch calcElementRate used to take, and the name is
 * the one plugins ask an action for its elements by.
 */
Game_Action.prototype.elements = function() {
    const item = this.item();
    if (!item || !item.damage) return [];
    const ids = item.damage.elementIds;
    if (Array.isArray(ids) && ids.length > 0) {
        return ids.filter(id => id > 0);
    }
    if (item.damage.elementId < 0) {
        return this.subject().attackElements();
    }
    return [item.damage.elementId];
};

Game_Action.prototype.calcElementRate = function(target) {
    return this.elementsMaxRate(target, this.elements());
};

/**
 * Let an element plugin see the list. VisuMZ_1_ElementStatusCore replaces
 * `elements()` and `calcElementRate` outright, so a list in `elementIds`
 * would be invisible to its Maximum/Minimum/Multiply/Additive/Average
 * rulings and to reflect, pierce and absorb - but its `elements()` reads
 * `DataManager.getActionObjectElements(item)` for the note-tag elements and
 * de-duplicates afterwards, and that one function is a plain definition.
 * Wrapping it after the plugins have loaded feeds the list into every
 * ruling without touching the plugin. Inert when no such function exists;
 * marked so a second boot cannot wrap it twice.
 */
Game_Action.installMultiElementShim = function() {
    if (typeof DataManager === "undefined" || typeof DataManager.getActionObjectElements !== "function") return false;
    if (DataManager.getActionObjectElements._reactorMultiElement) return false;
    const original = DataManager.getActionObjectElements;
    const wrapped = function(object) {
        const list = original.call(this, object) || [];
        const ids = object && object.damage && object.damage.elementIds;
        return Array.isArray(ids) ? list.concat(ids.filter(id => id > 0)) : list;
    };
    wrapped._reactorMultiElement = true;
    DataManager.getActionObjectElements = wrapped;
    return true;
};

Game_Action.prototype.elementsMaxRate = function(target, elements) {
    if (elements.length > 0) {
        const rates = elements.map(elementId => target.elementRate(elementId));
        return Math.max(...rates);
    } else {
        return 1;
    }
};

Game_Action.prototype.applyCritical = function(damage) {
    return damage * 3;
};

Game_Action.prototype.applyVariance = function(damage, variance) {
    const amp = Math.floor(Math.max((Math.abs(damage) * variance) / 100, 0));
    const v = Math.randomInt(amp + 1) + Math.randomInt(amp + 1) - amp;
    return damage >= 0 ? damage + v : damage - v;
};

Game_Action.prototype.applyGuard = function(damage, target) {
    return damage / (damage > 0 && target.isGuard() ? 2 * target.grd : 1);
};

Game_Action.prototype.executeDamage = function(target, value) {
    const result = target.result();
    if (value === 0) {
        result.critical = false;
    }
    if (this.isHpEffect()) {
        this.executeHpDamage(target, value);
    }
    if (this.isMpEffect()) {
        this.executeMpDamage(target, value);
    }
};

Game_Action.prototype.executeHpDamage = function(target, value) {
    if (this.isDrain()) {
        value = Math.min(target.hp, value);
    }
    this.makeSuccess(target);
    target.gainHp(-value);
    if (value > 0) {
        target.onDamage(value);
    }
    this.gainDrainedHp(value);
};

Game_Action.prototype.executeMpDamage = function(target, value) {
    if (!this.isMpRecover()) {
        value = Math.min(target.mp, value);
    }
    if (value !== 0) {
        this.makeSuccess(target);
    }
    target.gainMp(-value);
    this.gainDrainedMp(value);
};

Game_Action.prototype.gainDrainedHp = function(value) {
    if (this.isDrain()) {
        let gainTarget = this.subject();
        if (this._reflectionTarget) {
            gainTarget = this._reflectionTarget;
        }
        gainTarget.gainHp(value);
    }
};

Game_Action.prototype.gainDrainedMp = function(value) {
    if (this.isDrain()) {
        let gainTarget = this.subject();
        if (this._reflectionTarget) {
            gainTarget = this._reflectionTarget;
        }
        gainTarget.gainMp(value);
    }
};

Game_Action.prototype.applyItemEffect = function(target, effect) {
    switch (effect.code) {
        case Game_Action.EFFECT_RECOVER_HP:
            this.itemEffectRecoverHp(target, effect);
            break;
        case Game_Action.EFFECT_RECOVER_MP:
            this.itemEffectRecoverMp(target, effect);
            break;
        case Game_Action.EFFECT_GAIN_TP:
            this.itemEffectGainTp(target, effect);
            break;
        case Game_Action.EFFECT_ADD_STATE:
            this.itemEffectAddState(target, effect);
            break;
        case Game_Action.EFFECT_REMOVE_STATE:
            this.itemEffectRemoveState(target, effect);
            break;
        case Game_Action.EFFECT_ADD_BUFF:
            this.itemEffectAddBuff(target, effect);
            break;
        case Game_Action.EFFECT_ADD_DEBUFF:
            this.itemEffectAddDebuff(target, effect);
            break;
        case Game_Action.EFFECT_REMOVE_BUFF:
            this.itemEffectRemoveBuff(target, effect);
            break;
        case Game_Action.EFFECT_REMOVE_DEBUFF:
            this.itemEffectRemoveDebuff(target, effect);
            break;
        case Game_Action.EFFECT_SPECIAL:
            this.itemEffectSpecial(target, effect);
            break;
        case Game_Action.EFFECT_GROW:
            this.itemEffectGrow(target, effect);
            break;
        case Game_Action.EFFECT_LEARN_SKILL:
            this.itemEffectLearnSkill(target, effect);
            break;
        case Game_Action.EFFECT_COMMON_EVENT:
            this.itemEffectCommonEvent(target, effect);
            break;
    }
};

Game_Action.prototype.itemEffectRecoverHp = function(target, effect) {
    let value = (target.mhp * effect.value1 + effect.value2) * target.rec;
    if (this.isItem()) {
        value *= this.subject().pha;
    }
    value = Math.floor(value);
    if (value !== 0) {
        target.gainHp(value);
        this.makeSuccess(target);
    }
};

Game_Action.prototype.itemEffectRecoverMp = function(target, effect) {
    let value = (target.mmp * effect.value1 + effect.value2) * target.rec;
    if (this.isItem()) {
        value *= this.subject().pha;
    }
    value = Math.floor(value);
    if (value !== 0) {
        target.gainMp(value);
        this.makeSuccess(target);
    }
};

Game_Action.prototype.itemEffectGainTp = function(target, effect) {
    let value = Math.floor(effect.value1);
    if (value !== 0) {
        target.gainTp(value);
        this.makeSuccess(target);
    }
};

Game_Action.prototype.itemEffectAddState = function(target, effect) {
    if (effect.dataId === 0) {
        this.itemEffectAddAttackState(target, effect);
    } else {
        this.itemEffectAddNormalState(target, effect);
    }
};

Game_Action.prototype.itemEffectAddAttackState = function(target, effect) {
    for (const stateId of this.subject().attackStates()) {
        let chance = effect.value1;
        chance *= target.stateRate(stateId);
        chance *= this.subject().attackStatesRate(stateId);
        chance *= this.lukEffectRate(target);
        if (Math.random() < chance) {
            target.addState(stateId);
            this.applyEffectStateTurns(target, stateId, effect);
            this.makeSuccess(target);
        }
    }
};

Game_Action.prototype.itemEffectAddNormalState = function(target, effect) {
    let chance = effect.value1;
    if (!this.isCertainHit()) {
        chance *= target.stateRate(effect.dataId);
        chance *= this.lukEffectRate(target);
    }
    if (Math.random() < chance) {
        target.addState(effect.dataId);
        this.applyEffectStateTurns(target, effect.dataId, effect);
        this.makeSuccess(target);
    }
};

/**
 * An Add State effect may say how long the state lasts, overriding the
 * state's own Min/Max Turns for this one skill or item: `value2` is the
 * turns (0, which every RPG Maker-authored effect carries, keeps the
 * state's default) and an optional `value3` is the upper end of a range.
 * Applied after addState, so the count it wrote is what gets replaced.
 */
Game_Action.effectStateTurns = function(effect) {
    const min = Math.max(0, Math.floor(Number(effect && effect.value2) || 0));
    if (min <= 0) return 0;
    const max = Math.max(min, Math.floor(Number(effect.value3) || 0));
    return min + Math.randomInt(max - min + 1);
};

Game_Action.prototype.applyEffectStateTurns = function(target, stateId, effect) {
    const turns = Game_Action.effectStateTurns(effect);
    if (turns > 0) target.setStateTurns(stateId, turns);
};

Game_Action.prototype.itemEffectRemoveState = function(target, effect) {
    let chance = effect.value1;
    if (Math.random() < chance) {
        target.removeState(effect.dataId);
        this.makeSuccess(target);
    }
};

/**
 * An Add Buff or Add Debuff effect may say how strong the stack it adds
 * is, instead of the standard rate: `value2` is that rate (0.4 for 40%),
 * and 0 -- which every RPG Maker-authored effect carries -- keeps the
 * standard. Always a magnitude; Add Debuff's own direction makes it a
 * reduction.
 */
Game_Action.effectBuffRate = function(effect) {
    const rate = Math.abs(Number(effect && effect.value2) || 0);
    return rate === 0 ? null : rate;
};

Game_Action.prototype.itemEffectAddBuff = function(target, effect) {
    target.setPendingBuffPotency(Game_Action.effectBuffRate(effect));
    try {
        target.addBuff(effect.dataId, effect.value1);
    } finally {
        target.setPendingBuffPotency(null);
    }
    this.makeSuccess(target);
};

Game_Action.prototype.itemEffectAddDebuff = function(target, effect) {
    let chance = target.debuffRate(effect.dataId) * this.lukEffectRate(target);
    if (Math.random() < chance) {
        target.setPendingBuffPotency(Game_Action.effectBuffRate(effect));
        try {
            target.addDebuff(effect.dataId, effect.value1);
        } finally {
            target.setPendingBuffPotency(null);
        }
        this.makeSuccess(target);
    }
};

Game_Action.prototype.itemEffectRemoveBuff = function(target, effect) {
    if (target.isBuffAffected(effect.dataId)) {
        target.removeBuff(effect.dataId);
        this.makeSuccess(target);
    }
};

Game_Action.prototype.itemEffectRemoveDebuff = function(target, effect) {
    if (target.isDebuffAffected(effect.dataId)) {
        target.removeBuff(effect.dataId);
        this.makeSuccess(target);
    }
};

Game_Action.prototype.itemEffectSpecial = function(target, effect) {
    if (effect.dataId === Game_Action.SPECIAL_EFFECT_ESCAPE) {
        target.escape();
        this.makeSuccess(target);
    }
};

/**
 * A Grow effect's amount: `value1`, or a whole number drawn between
 * `value1` and `value2` when `value2` is set (RPG Maker writes 0 there).
 * Either end may be the larger.
 */
Game_Action.effectGrowValue = function(effect) {
    const a = Math.floor(Number(effect && effect.value1) || 0);
    const b = Math.floor(Number(effect && effect.value2) || 0);
    if (b === 0) return a;
    const min = Math.min(a, b), max = Math.max(a, b);
    return min + Math.randomInt(max - min + 1);
};

Game_Action.prototype.itemEffectGrow = function(target, effect) {
    target.addParam(effect.dataId, Game_Action.effectGrowValue(effect));
    this.makeSuccess(target);
};

Game_Action.prototype.itemEffectLearnSkill = function(target, effect) {
    if (target.isActor()) {
        target.learnSkill(effect.dataId);
        this.makeSuccess(target);
    }
};

Game_Action.prototype.itemEffectCommonEvent = function(/*target, effect*/) {
    //
};

Game_Action.prototype.makeSuccess = function(target) {
    target.result().success = true;
};

Game_Action.prototype.applyItemUserEffect = function(/*target*/) {
    if (typeof Game_BattlerBase !== "undefined" && Game_BattlerBase.isPoolOn && !Game_BattlerBase.isPoolOn("tp")) return;
    const value = Math.floor(this.item().tpGain * this.subject().tcr);
    this.subject().gainSilentTp(value);
};

Game_Action.prototype.lukEffectRate = function(target) {
    return Math.max(1.0 + (this.subject().luk - target.luk) * 0.001, 0.0);
};

Game_Action.prototype.applyGlobal = function() {
    for (const effect of this.item().effects) {
        if (effect.code === Game_Action.EFFECT_COMMON_EVENT) {
            $gameTemp.reserveCommonEvent(effect.dataId);
        }
    }
    this.updateLastUsed();
    this.updateLastSubject();
};

Game_Action.prototype.updateLastUsed = function() {
    const item = this.item();
    if (DataManager.isSkill(item)) {
        $gameTemp.setLastUsedSkillId(item.id);
    } else if (DataManager.isItem(item)) {
        $gameTemp.setLastUsedItemId(item.id);
    }
};

Game_Action.prototype.updateLastSubject = function() {
    const subject = this.subject();
    if (subject.isActor()) {
        $gameTemp.setLastSubjectActorId(subject.actorId());
    } else {
        $gameTemp.setLastSubjectEnemyIndex(subject.index() + 1);
    }
};

Game_Action.prototype.updateLastTarget = function(target) {
    if (target.isActor()) {
        $gameTemp.setLastTargetActorId(target.actorId());
    } else {
        $gameTemp.setLastTargetEnemyIndex(target.index() + 1);
    }
};

//-----------------------------------------------------------------------------
// Game_ActionResult
//
// The game object class for a result of a battle action. For convinience, all
// member variables in this class are public.

function Game_ActionResult() {
    this.initialize(...arguments);
}

Game_ActionResult.prototype.initialize = function() {
    this.clear();
};

Game_ActionResult.prototype.clear = function() {
    this.used = false;
    this.missed = false;
    this.evaded = false;
    // Set by a damage step that turned the hit aside (a ninja's shadow);
    // the item's effects then do not land. Nothing stock sets it.
    this.dodged = false;
    this.physical = false;
    this.drain = false;
    // Per resource, set only by an action with a secondary channel; unset,
    // a reader falls back to `drain`, which is right for every other hit.
    this.hpDrain = undefined;
    this.mpDrain = undefined;
    this.critical = false;
    this.success = false;
    this.hpAffected = false;
    this.hpDamage = 0;
    this.mpDamage = 0;
    this.tpDamage = 0;
    this.addedStates = [];
    this.renewedStates = [];
    this.blockedStates = [];
    this.removedStates = [];
    this.addedBuffs = [];
    this.addedDebuffs = [];
    this.removedBuffs = [];
};

Game_ActionResult.prototype.addedStateObjects = function() {
    return this.addedStates.map(id => $dataStates[id]);
};

Game_ActionResult.prototype.removedStateObjects = function() {
    return this.removedStates.map(id => $dataStates[id]);
};

Game_ActionResult.prototype.isStatusAffected = function() {
    return (
        this.addedStates.length > 0 ||
        this.removedStates.length > 0 ||
        this.addedBuffs.length > 0 ||
        this.addedDebuffs.length > 0 ||
        this.removedBuffs.length > 0
    );
};

Game_ActionResult.prototype.isHit = function() {
    return this.used && !this.missed && !this.evaded;
};

/**
 * Whether the item's effects were applied: a hit that `dodged` did not turn
 * aside. isHit is true for a dodged hit too -- its damage step ran, and that
 * is where it was turned aside, so its effects were skipped.
 */
Game_ActionResult.prototype.isLanded = function() {
    return this.isHit() && !this.dodged;
};

Game_ActionResult.prototype.isStateAdded = function(stateId) {
    return this.addedStates.includes(stateId);
};

Game_ActionResult.prototype.pushAddedState = function(stateId) {
    if (!this.isStateAdded(stateId)) {
        this.addedStates.push(stateId);
    }
    // A state that lands after an earlier attempt failed has landed.
    if (this.isStateBlocked(stateId)) {
        this.blockedStates.splice(this.blockedStates.indexOf(stateId), 1);
    }
};

// The renewed and blocked lists came after the others, and a battler's result
// is written into save files, so one restored from an older save has neither
// until its next clear. Their methods create or skip them rather than assume.

/**
 * Whether an added state was one the battler already had, so only its turn
 * count was reset. isStateAdded is true either way; this tells them apart.
 * Decided the first time this result records the state landing: one that
 * arrived fresh stays fresh if the same action lands it again.
 */
Game_ActionResult.prototype.isStateRenewed = function(stateId) {
    return !!this.renewedStates && this.renewedStates.includes(stateId);
};

/** Whether an added state was not on the battler when it landed. */
Game_ActionResult.prototype.isStateNewlyAdded = function(stateId) {
    return this.isStateAdded(stateId) && !this.isStateRenewed(stateId);
};

Game_ActionResult.prototype.pushRenewedState = function(stateId) {
    if (!this.renewedStates) {
        this.renewedStates = [];
    }
    if (!this.isStateRenewed(stateId)) {
        this.renewedStates.push(stateId);
    }
};

/**
 * Whether addState was asked for this state and left the battler without it:
 * resisted, restricted, dead, or turned away by a plugin in addNewState. A
 * chance roll that failed never reaches addState, so it is not listed here;
 * nor is a state the battler still has from before.
 */
Game_ActionResult.prototype.isStateBlocked = function(stateId) {
    return !!this.blockedStates && this.blockedStates.includes(stateId);
};

Game_ActionResult.prototype.pushBlockedState = function(stateId) {
    if (!this.blockedStates) {
        this.blockedStates = [];
    }
    if (!this.isStateAdded(stateId) && !this.isStateBlocked(stateId)) {
        this.blockedStates.push(stateId);
    }
};

Game_ActionResult.prototype.isStateRemoved = function(stateId) {
    return this.removedStates.includes(stateId);
};

Game_ActionResult.prototype.pushRemovedState = function(stateId) {
    if (!this.isStateRemoved(stateId)) {
        this.removedStates.push(stateId);
    }
};

Game_ActionResult.prototype.isBuffAdded = function(paramId) {
    return this.addedBuffs.includes(paramId);
};

Game_ActionResult.prototype.pushAddedBuff = function(paramId) {
    if (!this.isBuffAdded(paramId)) {
        this.addedBuffs.push(paramId);
    }
};

Game_ActionResult.prototype.isDebuffAdded = function(paramId) {
    return this.addedDebuffs.includes(paramId);
};

Game_ActionResult.prototype.pushAddedDebuff = function(paramId) {
    if (!this.isDebuffAdded(paramId)) {
        this.addedDebuffs.push(paramId);
    }
};

Game_ActionResult.prototype.isBuffRemoved = function(paramId) {
    return this.removedBuffs.includes(paramId);
};

Game_ActionResult.prototype.pushRemovedBuff = function(paramId) {
    if (!this.isBuffRemoved(paramId)) {
        this.removedBuffs.push(paramId);
    }
};
