/*:
 * @target MZ
 * @plugindesc Skill Shop / Tech Shop (VX), for imported games
 * @author Nechigawara Sanzenin; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_SkillShop.js
 *
 * A shop that teaches skills for gold. The event names the skills on sale,
 * then opens the shop:
 *
 *   $gameTemp.rrSkillShopGoods = [14, 15, 16];
 *   SceneManager.push(Scene_RRSkillShop);
 *
 * (the importer writes both from the game's $skill_shop = [...] and
 * $scene = Scene_Skill_Shop.new). Choose Teach, a skill, then who learns
 * it. An actor can learn a skill listed for them under "Who can learn what"
 * and not known yet; the price comes from "Prices" (else the default).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script, with its prices and tables. Turning the plugin off leaves
 * the calls doing nothing.
 *
 * @param prices
 * @text Prices
 * @desc JSON: skill id → price.
 * @default {}
 *
 * @param defaultPrice
 * @text Default price
 * @type number
 * @default 100
 *
 * @param learners
 * @text Who can learn what
 * @desc JSON: actor id → [skill ids].
 * @default {}
 *
 * @param partyLabel
 * @text Party heading
 * @default Characters in Party
 * @param canLearn
 * @text Can learn
 * @default Not learned yet
 * @param cannotLearn
 * @text Cannot learn
 * @default Unable to learn
 * @param learned
 * @text Learned
 * @default Already learned
 * @param teach
 * @text Teach command
 * @default Teach
 * @param cancel
 * @text Cancel command
 * @default Cancel
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_SkillShop');
    const json = (text, fallback) => { try { return JSON.parse(text); } catch (_) { return fallback; } };
    const PRICES = json(params.prices || '{}', {});
    const DEFAULT_PRICE = Number(params.defaultPrice || 100);
    const LEARNERS = json(params.learners || '{}', {});
    const TEXT = { party: params.partyLabel || 'Characters in Party', can: params.canLearn || 'Not learned yet', cannot: params.cannotLearn || 'Unable to learn',
        learned: params.learned || 'Already learned', teach: params.teach || 'Teach', cancel: params.cancel || 'Cancel' };

    const priceOf = (skill) => (skill && PRICES[skill.id] !== undefined ? Number(PRICES[skill.id]) : DEFAULT_PRICE);
    const mayLearn = (actor, skill) => !!(actor && skill && (LEARNERS[actor.actorId()] || []).includes(skill.id));
    const canTeach = (actor, skill) => mayLearn(actor, skill) && !actor.isLearnedSkill(skill.id);

    //--------------------------------------------------------------------------
    function Window_RRSkillShopCommand() { this.initialize(...arguments); }
    Window_RRSkillShopCommand.prototype = Object.create(Window_HorzCommand.prototype);
    Window_RRSkillShopCommand.prototype.constructor = Window_RRSkillShopCommand;
    Window_RRSkillShopCommand.prototype.maxCols = function() { return 2; };
    Window_RRSkillShopCommand.prototype.makeCommandList = function() {
        this.addCommand(TEXT.teach, 'teach');
        this.addCommand(TEXT.cancel, 'cancel');
    };

    function Window_RRSkillShopBuy() { this.initialize(...arguments); }
    Window_RRSkillShopBuy.prototype = Object.create(Window_Selectable.prototype);
    Window_RRSkillShopBuy.prototype.constructor = Window_RRSkillShopBuy;
    Window_RRSkillShopBuy.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._data = [];
        this.refresh();
    };
    Window_RRSkillShopBuy.prototype.maxItems = function() { return this._data.length; };
    Window_RRSkillShopBuy.prototype.skill = function() { return this._data[this.index()] || null; };
    Window_RRSkillShopBuy.prototype.refresh = function() {
        this._data = ($gameTemp.rrSkillShopGoods || []).map(id => $dataSkills[id]).filter(Boolean);
        Window_Selectable.prototype.refresh.call(this);
    };
    Window_RRSkillShopBuy.prototype.isCurrentItemEnabled = function() {
        const skill = this.skill();
        return !!skill && priceOf(skill) <= $gameParty.gold();
    };
    Window_RRSkillShopBuy.prototype.drawItem = function(index) {
        const skill = this._data[index];
        const rect = this.itemLineRect(index);
        const price = priceOf(skill);
        this.changePaintOpacity(price <= $gameParty.gold());
        this.drawItemName(skill, rect.x, rect.y, rect.width - 80);
        this.drawText(price, rect.x + rect.width - 80, rect.y, 80, 'right');
        this.changePaintOpacity(true);
    };
    Window_RRSkillShopBuy.prototype.updateHelp = function() { this.setHelpWindowItem(this.skill()); };
    Window_RRSkillShopBuy.prototype.update = function() {
        Window_Selectable.prototype.update.call(this);
        if (this._statusWindow && this.active) this._statusWindow.setSkill(this.skill());
    };

    /** The party and whether each can learn the skill; also where the learner is picked. */
    function Window_RRSkillShopStatus() { this.initialize(...arguments); }
    Window_RRSkillShopStatus.prototype = Object.create(Window_Selectable.prototype);
    Window_RRSkillShopStatus.prototype.constructor = Window_RRSkillShopStatus;
    Window_RRSkillShopStatus.prototype.maxItems = function() { return this._skill ? $gameParty.members().length : 0; };
    Window_RRSkillShopStatus.prototype.actor = function() { return $gameParty.members()[this.index()] || null; };
    Window_RRSkillShopStatus.prototype.itemRect = function(index) {
        const rect = Window_Selectable.prototype.itemRect.call(this, index);
        rect.y += this.itemHeight();   // under the heading
        return rect;
    };
    Window_RRSkillShopStatus.prototype.isCurrentItemEnabled = function() { return canTeach(this.actor(), this._skill); };
    Window_RRSkillShopStatus.prototype.setSkill = function(skill) {
        if (this._skill === skill) return;
        this._skill = skill;
        this.refresh();
    };
    Window_RRSkillShopStatus.prototype.refresh = function() {
        Window_Selectable.prototype.refresh.call(this);
        if (!this._skill) return;
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(TEXT.party, 0, 0, this.innerWidth);
        this.resetTextColor();
    };
    Window_RRSkillShopStatus.prototype.drawItem = function(index) {
        const actor = $gameParty.members()[index], skill = this._skill;
        const rect = this.itemLineRect(index);
        const text = !mayLearn(actor, skill) ? TEXT.cannot : actor.isLearnedSkill(skill.id) ? TEXT.learned : TEXT.can;
        this.resetTextColor();
        this.changePaintOpacity(canTeach(actor, skill));
        this.drawText(actor.name(), rect.x, rect.y, rect.width / 2);
        this.drawText(text, rect.x + rect.width / 2, rect.y, rect.width / 2, 'right');
        this.changePaintOpacity(true);
    };

    //--------------------------------------------------------------------------
    function Scene_RRSkillShop() { this.initialize(...arguments); }
    Scene_RRSkillShop.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRSkillShop.prototype.constructor = Scene_RRSkillShop;
    window.Scene_RRSkillShop = Scene_RRSkillShop;

    Scene_RRSkillShop.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        // The main area leaves room for the help window and the touch buttons, wherever the scene puts them.
        const top = this.mainAreaTop(), bottom = top + this.mainAreaHeight();
        const lh = this.calcWindowHeight(1, true);
        const goldWidth = 240;
        this._goldWindow = new Window_Gold(new Rectangle(Graphics.boxWidth - goldWidth, top, goldWidth, lh));
        this.addWindow(this._goldWindow);
        this._commandWindow = new Window_RRSkillShopCommand(new Rectangle(0, top, Graphics.boxWidth - goldWidth, lh));
        this._commandWindow.setHandler('teach', this.onTeach.bind(this));
        this._commandWindow.setHandler('cancel', this.popScene.bind(this));
        this.addWindow(this._commandWindow);
        const y = top + lh, h = bottom - y, listWidth = Math.floor(Graphics.boxWidth * 0.56);
        this._buyWindow = new Window_RRSkillShopBuy(new Rectangle(0, y, listWidth, h));
        this._buyWindow.setHelpWindow(this._helpWindow);
        this._buyWindow.setHandler('ok', this.onBuyOk.bind(this));
        this._buyWindow.setHandler('cancel', this.onBuyCancel.bind(this));
        this._buyWindow.hide();
        this.addWindow(this._buyWindow);
        this._statusWindow = new Window_RRSkillShopStatus(new Rectangle(listWidth, y, Graphics.boxWidth - listWidth, h));
        this._statusWindow.hide();
        this._buyWindow._statusWindow = this._statusWindow;
        this.addWindow(this._statusWindow);
        this._statusWindow.setHandler('ok', this.onActorOk.bind(this));
        this._statusWindow.setHandler('cancel', this.onActorCancel.bind(this));
    };
    Scene_RRSkillShop.prototype.onTeach = function() {
        this._buyWindow.refresh();
        this._buyWindow.show(); this._statusWindow.show();
        this._buyWindow.activate(); this._buyWindow.select(0);
    };
    Scene_RRSkillShop.prototype.onBuyCancel = function() {
        this._buyWindow.hide(); this._statusWindow.hide(); this._statusWindow.setSkill(null); this._buyWindow.deselect();
        this._helpWindow.clear();
        this._commandWindow.activate();
    };
    Scene_RRSkillShop.prototype.onBuyOk = function() {
        this._skill = this._buyWindow.skill();
        this._statusWindow.setSkill(this._skill);
        this._statusWindow.activate(); this._statusWindow.select(0);
    };
    // The window only lets OK through for an actor who can learn it (isCurrentItemEnabled).
    Scene_RRSkillShop.prototype.onActorOk = function() {
        SoundManager.playShop();
        this._statusWindow.actor().learnSkill(this._skill.id);
        $gameParty.loseGold(priceOf(this._skill));
        this._goldWindow.refresh(); this._buyWindow.refresh(); this._statusWindow.refresh();
        this.onActorCancel();
    };
    Scene_RRSkillShop.prototype.onActorCancel = function() {
        this._statusWindow.deselect(); this._statusWindow.deactivate();
        this._buyWindow.activate();
    };
})();
