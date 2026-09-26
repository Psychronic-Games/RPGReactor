/*:
 * @target MZ
 * @plugindesc Target One Ally (Not the User) (VX Ace), for imported games
 * @author Sixth; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TargetOneAlly.js
 *
 * A skill or item with the One Ally scope and <one_ally_no_user> in its note
 * can't be used on its user: the user's name is faded in the battle's actor
 * list and choosing it (or choosing the user in the skill menu) buzzes. With
 * no other living ally it can't be used at all.
 *
 * Enemies using a One Ally skill pick a random living troop member (not
 * themselves with the tag) instead of the last one.
 *
 * As the original replaced them, the battle's actor list accepts any member
 * for a revival item (the fallen-member check is gone), and draws the names
 * at the column's left edge in the list's current font size.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const noUser = (item) => {
        if (!item || !(DataManager.isSkill(item) || DataManager.isItem(item))) return false;
        if (item._rrOneNoUser === undefined) item._rrOneNoUser = /<one_ally_no_user>/i.test(item.note || '');
        return item._rrOneNoUser;
    };
    window.RRTargetOneAlly = { noUser };
    const inputItem = () => {
        const actor = BattleManager.actor(), action = actor && actor.inputtingAction();
        return action ? action.item() : null;
    };

    // An enemy's One Ally skill lands on a random living troop member.
    const _targetsForFriends = Game_Action.prototype.targetsForFriends;
    Game_Action.prototype.targetsForFriends = function() {
        const subject = this.subject(), item = this.item();
        if (subject && subject.isEnemy() && item && item.scope === 7) {
            const ids = this.friendsUnit().aliveMembers().filter(m => !(noUser(item) && m === subject)).map(m => $gameTroop.members().indexOf(m));
            if (ids.length) this._targetIndex = ids[Math.randomInt(ids.length)];
        }
        return _targetsForFriends.call(this);
    };

    const _canUse = Game_BattlerBase.prototype.canUse;
    Game_BattlerBase.prototype.canUse = function(item) {
        if (item && noUser(item) && this.friendsUnit().aliveMembers().length <= 1) return false;
        return _canUse.call(this, item);
    };
    // Used on its user, the item has no effect (the menu's target check and the battle's hit both ask this).
    const _testApply = Game_Action.prototype.testApply;
    Game_Action.prototype.testApply = function(target) {
        if (target && target.isActor() && noUser(this.item()) && target === this.subject()) return false;
        return _testApply.call(this, target);
    };

    Window_BattleActor.prototype.rrAceDrawActorName = function(actor, x, y, width = 112) {
        const item = inputItem();
        const enabled = !(BattleManager.actor() && noUser(item) && actor === BattleManager.actor());
        this.changeTextColor(this.rrAceHpColor ? this.rrAceHpColor(actor) : ColorManager.hpColor(actor));
        const opacity = this.contents.paintOpacity;
        this.contents.paintOpacity = enabled ? 255 : this.translucentOpacity();
        this.drawText(actor.name(), x, y, width);
        this.contents.paintOpacity = opacity;
    };
    Window_BattleActor.prototype.isCurrentItemEnabled = function() {
        if (BattleManager.actor() && noUser(inputItem()) && $gameParty.members()[this.index()] === BattleManager.actor()) return false;
        return Window_Selectable.prototype.isCurrentItemEnabled.call(this);
    };

    const _skillUseItem = Scene_Skill.prototype.useItem;
    Scene_Skill.prototype.useItem = function() {
        if (noUser(this.item()) && this.user() === $gameParty.members()[this._actorWindow.index()]) return SoundManager.playBuzzer();
        _skillUseItem.call(this);
    };
    const _onActorOk = Scene_Battle.prototype.onActorOk;
    Scene_Battle.prototype.onActorOk = function() {
        if (noUser(inputItem()) && BattleManager.actor() === $gameParty.battleMembers()[this._actorWindow.index()]) return SoundManager.playBuzzer();
        _onActorOk.call(this);
    };
})();
