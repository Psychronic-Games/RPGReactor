/*:
 * @target MZ
 * @plugindesc Target Manager (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyTargetManager.js
 *
 * More target scopes for skills and items, set in their notes:
 *   <total hits: x>                 the action hits x times (past 9)
 *   <targets: everybody>            every living actor and enemy
 *   <targets: target all foes>      the chosen foe first, then the others
 *   <targets: target x random foes> the chosen foe, then x random foes
 *   <targets: x random foes>        x random foes
 *   <targets: all but user>         the user's allies without the user
 *   <targets: target all allies>    the chosen ally first, then the others
 *   <targets: target x random allies>, <targets: x random allies>
 * The "target …" scopes let the player choose the first target; the others
 * need no choice. A tag replaces the database scope as the script did, so a
 * scope the tag names is neither for one nor for all in the engine's eyes.
 *
 * A hit of a random scope aimed at a battler who has fallen goes to another
 * living member of that side (a revival item's goes to another fallen one).
 *
 * A chosen target written as -1 (enemies' actions) reads, as in Ruby, the
 * last member of the side when that member is alive.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param randomRedirect
 * @text Random hits move off fallen targets
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyTargetManager');
    const RANDOM_REDIRECT = String(params.randomRedirect ?? 'true') !== 'false';

    // Scopes the notes name, as strings in item.scope where Ruby kept symbols.
    const OPPONENT = new Set(['target_all_foes', 'target_random_foes']);
    const FRIEND = new Set(['all_but_user', 'target_all_allies', 'target_random_allies', 'random_allies']);
    const ALL = new Set(['all_but_user']);
    const SELECTION = new Set(['target_all_foes', 'target_random_foes', 'target_all_allies', 'target_random_allies']);

    const readNotes = (item) => {
        if (!item || item._rrTargetNotes) return;
        item._rrTargetNotes = true;
        item._rrRandomHits = [3, 4, 5, 6].includes(item.scope) ? item.scope - 2 : 0;
        for (const line of String(item.note || '').split(/[\r\n]+/)) {
            let m, n;
            if ((m = /<(?:TOTAL_HITS|total hits):[ ](\d+)>/i.exec(line))) {
                item.repeats = Math.max(Number(m[1]), 1);
            } else if ((m = /<(?:TARGETS|target):[ ](.*)>/i.exec(line))) {
                const t = m[1];
                item._rrRandomHits = 0;
                if (/EVERYBODY/i.test(t)) item.scope = 'everybody';
                else if (/TARGET ALL FOES/i.test(t)) item.scope = 'target_all_foes';
                else if ((n = /TARGET[ ](\d+)[ ]RANDOM FOE/i.exec(t))) { item.scope = 'target_random_foes'; item._rrRandomHits = Number(n[1]); }
                else if ((n = /(\d+)[ ]RANDOM FOE/i.exec(t))) { item.scope = 3; item._rrRandomHits = Number(n[1]); }
                else if (/ALL BUT USER/i.test(t)) item.scope = 'all_but_user';
                else if (/TARGET ALL ALLIES/i.test(t)) item.scope = 'target_all_allies';
                else if ((n = /TARGET[ ](\d+)[ ]RANDOM ALL/i.exec(t))) { item.scope = 'target_random_allies'; item._rrRandomHits = Number(n[1]); }
                else if ((n = /(\d+)[ ]RANDOM ALL/i.exec(t))) { item.scope = 'random_allies'; item._rrRandomHits = Number(n[1]); }
            }
        }
    };
    const _isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_isDatabaseLoaded.call(this)) return false;
        for (const table of [$dataSkills, $dataItems]) {
            if (!table || table._rrTargetNotes) continue;
            table._rrTargetNotes = true;
            for (const item of table) readNotes(item);
        }
        return true;
    };

    const custom = (item) => (item && typeof item.scope === 'string' ? item.scope : null);
    // Ruby's for_random? and number_of_targets read the hits the notes set; MZ's own scopes past 11 keep theirs.
    const aceScope = (item) => !!item && (typeof item.scope === 'string' || item.scope <= 11);
    const randomHits = (item) => {
        if (!item) return 0;
        if (item._rrRandomHits === undefined) return [3, 4, 5, 6].includes(item.scope) ? item.scope - 2 : 0;
        return item._rrRandomHits;
    };
    // Ruby's smooth_target: a negative index counts from the end of the members.
    const smoothTarget = (unit, index) => {
        const members = unit.members();
        const member = index < 0 ? members[members.length + index] : members[index];
        return member && member.isAlive() ? member : unit.aliveMembers()[0] || null;
    };
    const union = (list, more) => { for (const b of more) if (!list.includes(b)) list.push(b); return list; };
    window.RRTargetManager = { custom, randomHits, smoothTarget, union, OPPONENT, FRIEND, ALL, SELECTION };

    //-------------------------------------------------------------------------
    // Scope tests, for the engine's actions and for the battle windows
    //-------------------------------------------------------------------------
    const GA = Game_Action.prototype;
    const test = (name, set) => {
        const base = GA[name];
        GA[name] = function() {
            const scope = custom(this.item());
            return scope ? set.has(scope) : base.call(this);
        };
    };
    test('isForOpponent', OPPONENT);
    test('isForFriend', FRIEND);
    test('isForAll', ALL);
    test('needsSelection', SELECTION);
    const _isForAliveFriend = GA.isForAliveFriend;
    GA.isForAliveFriend = function() { return custom(this.item()) ? this.isForFriend() : _isForAliveFriend.call(this); };
    const _isForRandom = GA.isForRandom;
    GA.isForRandom = function() { return aceScope(this.item()) ? randomHits(this.item()) > 0 : _isForRandom.call(this); };
    const _numTargets = GA.numTargets;
    GA.numTargets = function() { return aceScope(this.item()) ? randomHits(this.item()) : _numTargets.call(this); };

    const Scope = window.RRYanflyBattleScope;
    if (Scope) {
        const base = Object.assign({}, Scope);
        Scope.forOpponent = (item) => OPPONENT.has(custom(item)) || base.forOpponent(item);
        Scope.forFriend = (item) => FRIEND.has(custom(item)) || base.forFriend(item);
        Scope.forAll = (item) => ALL.has(custom(item)) || base.forAll(item);
        Scope.needSelection = (item) => SELECTION.has(custom(item)) || base.needSelection(item);
        Scope.forRandom = (item) => (aceScope(item) ? randomHits(item) > 0 : base.forRandom(item));
        Scope.numberOfTargets = (item) => (aceScope(item) ? randomHits(item) : base.numberOfTargets(item));
    }

    //-------------------------------------------------------------------------
    // Targets
    //-------------------------------------------------------------------------
    // Repeats are added after the scope's targets and any area of effect, as Ruby's use_item repeated each.
    const _repeatTargets = GA.repeatTargets;
    GA.repeatTargets = function(targets) {
        return this._rrBareTargets ? targets : _repeatTargets.call(this, targets);
    };
    const _makeTargets = GA.makeTargets;
    GA.makeTargets = function() {
        let targets;
        if (!this._forcing && this.subject().isConfused()) targets = [this.confusionTarget()];
        else if (custom(this.item())) targets = this.rrMakeCustomTargets();
        else {
            this._rrBareTargets = true;
            try { targets = _makeTargets.call(this); } finally { this._rrBareTargets = false; }
        }
        if (this.rrAoeTargets) targets = this.rrAoeTargets(targets);
        return this.repeatTargets(targets);
    };
    GA.rrMakeCustomTargets = function() {
        const item = this.item(), scope = custom(item);
        const foes = this.opponentsUnit(), friends = this.friendsUnit();
        const random = (unit) => Array.from({ length: randomHits(item) }, () => unit.randomTarget());
        let list = [];
        if (scope === 'everybody') {
            union(list, foes.aliveMembers());
            union(list, friends.aliveMembers());
        } else if (scope === 'target_all_foes') {
            union(list, [smoothTarget(foes, this._targetIndex)]);
            union(list, foes.aliveMembers());
        } else if (scope === 'target_random_foes') {
            union(list, [smoothTarget(foes, this._targetIndex)]);
            list = list.concat(random(foes));
        } else if (scope === 'all_but_user') {
            union(list, friends.aliveMembers());
            list = list.filter(b => b !== this.subject());
        } else if (scope === 'target_all_allies') {
            union(list, [smoothTarget(friends, this._targetIndex)]);
            union(list, friends.aliveMembers());
        } else if (scope === 'target_random_allies') {
            union(list, [smoothTarget(friends, this._targetIndex)]);
            list = list.concat(random(friends));
        } else if (scope === 'random_allies') {
            list = list.concat(random(friends));
        }
        return list;
    };

    // A random hit on a fallen battler goes to another member of the same side.
    const forDeadFriend = (item) => [9, 10].includes(item.scope);
    BattleManager.rrAliveRandomTarget = function(target, item) {
        if (target.isAlive()) return target;
        if (target.isDead() === forDeadFriend(item)) return target;
        if (!RANDOM_REDIRECT) return target;
        const unit = target.friendsUnit();
        if (forDeadFriend(item)) return unit.deadMembers().length === 0 ? target : unit.randomDeadTarget() || target;
        if (unit.isAllDead()) return target;
        return unit.randomTarget() || target;
    };
    const _invokeAction = BattleManager.invokeAction;
    BattleManager.invokeAction = function(subject, target) {
        const item = this._action && this._action.item();
        if (item && target && randomHits(item) > 0) target = this.rrAliveRandomTarget(target, item);
        _invokeAction.call(this, subject, target);
    };
})();
