'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));

// The settings of Dreamwalker's copies.
const BCL = `$imported = {} if $imported.nil?
$imported["YEA-BattleCommandList"] = true
module YEA
  module BATTLE_COMMANDS
    PARTY_COMMANDS =[
      :fight,
      :autobattle,
      :party,
      :combatlog,
    # :custom1,
    # :custom2,
      :escape,
    ] # Do not remove this.
    CUSTOM_PARTY_COMMANDS ={
    # :command => ["Display Name", EnableSwitch, ShowSwitch, Handler Method],
      :custom1 => [ "Custom Name",            0,         0, :command_name1],
      :custom2 => [ "Custom Name",           13,         0, :command_name2],
    } # Do not remove this.
    DEFAULT_ACTOR_COMMANDS =[
    # "AUTOBATTLE",
      "ATTACK",
      "SKILL TYPE 1",
      "ITEMS",
      "EQUIP",
    ] # Do not remove this.
    USE_CONFIRM_WINDOW = false    # Set to false if you don't wish to use it.
  end # BATTLE_COMMANDS
end # YEA`;
const CEQ = `$imported = {} if $imported.nil?
$imported["YEA-CommandEquip"] = true
module YEA
  module COMMAND_EQUIP
    COMMAND_TEXT   = "Equip"      # Text used for the command.
    EQUIP_COOLDOWN = 0            # Turns to wait before re-equipping.
    EQUIP_SKIPTURN = false         # If true, it will cost a turn to equip.
    EQUIP_FIXEDSLOT = []  # list of fixed slots in combat.
  end # COMMAND_EQUIP
end # YEA`;
const BHW = `module BATTLE_HELP_WINDOW
  HIDE_WINDOW_SWITCH = 0
  Battle_desc = {} #no touchy
  # Skill type descriptions
  Battle_desc[1] = "Skills based on the TP stat"
 #Battle_desc[2] = "Ammo based skills generally used by firearms"
  # Default basic commands
  Battle_desc[:item] = "Contains consumable items that can be used in battle such as medkits and grenades."
  Battle_desc[:fight] = "Prepares your party for combat."
  Battle_desc[:escape] = "Attempt to flee battle."
  Battle_desc[:party] = ""
  Battle_desc[:equip] = "Allows the player to change the current equipment of the selected party member."
end
class Window_ActorCommand < Window_Command
  include BATTLE_HELP_WINDOW
end`;
const SMOOTH = `module MakerSystems
  module SmoothCursor
    #------------------------------------------------------------------------
    # * Low values yield a fast effect.                                 [OPT]
    #------------------------------------------------------------------------
    DELAY_LEVEL = 4
  end
end
class Window_Selectable < Window_Base
  def ms_smooth_cursor_update
  end
end`;

test('Battle commands: the four scripts are detected', () => {
    const families = C.scriptFamilies([BCL, CEQ, BHW, SMOOTH]);
    for (const key of ['yeaBattleCommandList', 'yeaCommandEquip', 'battleHelpWindow', 'msSmoothCursor']) assert.ok(families.has(key), key);
    // The Battle Engine only asks whether the command list is there.
    assert.ok(!C.scriptFamilies(['if $imported["YEA-BattleCommandList"] && x\nend']).has('yeaBattleCommandList'));
    assert.ok(!C.scriptFamilies(['class Window_Selectable\n def update_cursor\n end\nend']).has('msSmoothCursor'));
});

test('Battle commands: settings from the game copies', () => {
    const scripts = [BCL, CEQ, BHW, SMOOTH];
    const constants = C.scriptConstants(scripts);
    const b = params('RR_YanflyBattleCommandList').extract({ scripts, constants });
    assert.deepEqual(JSON.parse(b.partyCommands), ['fight', 'autobattle', 'party', 'combatlog', 'escape']);
    assert.deepEqual(JSON.parse(b.defaultActorCommands), ['ATTACK', 'SKILL TYPE 1', 'ITEMS', 'EQUIP']);
    assert.deepEqual(JSON.parse(b.customPartyCommands).custom2, ['Custom Name', 13, 0, 'command_name2']);
    const e = params('RR_YanflyCommandEquip').extract({ scripts, constants });
    assert.deepEqual(e, { commandText: 'Equip', cooldown: '0', skipTurn: 'false', fixedSlots: '[]' });
    const h = params('RR_BattleHelpWindow').extract({ scripts, constants });
    assert.equal(h.hideSwitch, '0');
    assert.deepEqual(JSON.parse(h.descriptions), {
        1: 'Skills based on the TP stat', item: 'Contains consumable items that can be used in battle such as medkits and grenades.',
        fight: 'Prepares your party for combat.', escape: 'Attempt to flee battle.', party: '',
        equip: 'Allows the player to change the current equipment of the selected party member.'
    });
    assert.deepEqual(params('RR_SmoothCursor').extract({ scripts, constants }), { delayLevel: '4' });
});

/** The four plugins over a small MZ-shaped battle runtime. */
function load() {
    const scripts = [BCL, CEQ, BHW, SMOOTH];
    const constants = C.scriptConstants(scripts);
    const parameters = {};
    for (const name of ['RR_YanflyBattleCommandList', 'RR_YanflyCommandEquip', 'RR_BattleHelpWindow', 'RR_SmoothCursor']) parameters[name] = params(name).extract({ scripts, constants });
    const K = (parent) => { function Klass(...args) { if (this.initialize) this.initialize(...args); } if (parent) Klass.prototype = Object.create(parent.prototype); return Klass; };
    const Window_Base = K(), Window_Scrollable = K(Window_Base), Window_Selectable = K(Window_Scrollable), Window_Command = K(Window_Selectable);
    const Rectangle = function(x, y, width, height) { Object.assign(this, { x, y, width, height }); };
    Object.assign(Window_Base.prototype, {
        initialize(rect) { Object.assign(this, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: true, active: false, openness: 0 }); },
        update() {}, open() { this.openness = 255; }, close() { this.openness = 0; }, show() { this.visible = true; }, hide() { this.visible = false; },
        activate() { this.active = true; }, deactivate() { this.active = false; }
    });
    Object.assign(Window_Selectable.prototype, {
        initialize(rect) {
            Window_Base.prototype.initialize.call(this, rect);
            Object.assign(this, { _index: -1, _scrollY: 0, _cursorRect: new Rectangle(0, 0, 0, 0), _cursorAll: false });
        },
        index() { return this._index; }, maxCols() { return 1; }, itemHeight() { return 24; }, maxItems() { return 30; },
        maxRows() { return Math.ceil(this.maxItems() / this.maxCols()); }, maxPageRows() { return 5; }, row() { return Math.floor(this._index / this.maxCols()); },
        scrollX() { return 0; }, scrollY() { return this._scrollY; }, scrollBaseX() { return 0; }, scrollBaseY() { return this._scrollY - (this._scrollY % 24); },
        maxScrollY() { return this.maxRows() * 24 - 120; }, scrollTo(x, y) { this._scrollY = Math.max(0, Math.min(y, this.maxScrollY())); },
        itemRect(i) { return new Rectangle(0, i * 24 - this.scrollBaseY(), 176, 24); },
        setCursorRect(x, y, w, h) { Object.assign(this._cursorRect, { x, y, width: w, height: h }); },
        refreshCursor() { const r = this.itemRect(this._index); this.setCursorRect(r.x, r.y, r.width, r.height); },
        ensureCursorVisible() { this._stockEnsure = true; },
        select(i) { this._index = i; this.refreshCursor(); }, update() { this._updated = true; }
    });
    Object.assign(Window_Command.prototype, {
        initialize(rect) { Window_Selectable.prototype.initialize.call(this, rect); this._list = []; this._handlers = {}; },
        clearCommandList() { this._list = []; }, refresh() { this.clearCommandList(); this.makeCommandList(); },
        addCommand(name, symbol, enabled = true, ext = null) { this._list.push({ name, symbol, enabled, ext }); },
        currentData() { return this._list[this._index] || null; }, currentSymbol() { return this.currentData() ? this.currentData().symbol : null; },
        currentExt() { return this.currentData() ? this.currentData().ext : null; }, setHandler(s, f) { this._handlers[s] = f; },
        isHandled(s) { return !!this._handlers[s]; }, makeCommandList() {}
    });
    const classes = {
        Window_Base, Window_Scrollable, Window_Selectable, Window_Command, Window_Help: K(Window_Base), Window_EquipCommand: K(Window_Command),
        Window_PartyCommand: K(Window_Command), Window_ActorCommand: K(Window_Command), Scene_Base: K(), Game_Battler: K(), Sprite: K()
    };
    classes.Window_Help.prototype.setText = function(text) { this._text = text; };
    Object.assign(classes.Window_ActorCommand.prototype, {
        setup(actor) { this._actor = actor; this.refresh(); this.select(0); this.active = true; this.open(); },
        addAttackCommand() { this.addCommand('Attack', 'attack', true); }, addGuardCommand() { this.addCommand('Guard', 'guard', true); },
        addItemCommand() { this.addCommand('Items', 'item'); },
        addSkillCommands() { for (const id of this._actor.addedSkillTypes().slice().sort()) this.addCommand('stype' + id, 'skill', true, id); }
    });
    classes.Scene_Base.prototype.calcWindowHeight = (n) => n * 24 + 24;
    classes.Scene_Battle = K(classes.Scene_Base);
    classes.Scene_MenuBase = K(classes.Scene_Base);
    classes.Scene_Equip = K(classes.Scene_MenuBase);
    Object.assign(classes.Scene_Equip.prototype, { needsPageButtons: () => true, start() {}, isFading: () => false, popScene() { this._popped = true; }, update() {} });
    classes.Game_Actor = K(classes.Game_Battler);
    Object.assign(classes.Game_Battler.prototype, { onBattleStart() {}, onTurnEnd() {}, onBattleEnd() {} });
    classes.Game_Actor.prototype.isEquipTypeLocked = (etypeId) => etypeId === 5;
    const log = [];
    Object.assign(classes.Scene_Battle.prototype, {
        createPartyCommandWindow() { this._partyCommandWindow = new classes.Window_PartyCommand(new Rectangle(0, 0, 128, 120)); },
        createActorCommandWindow() { this._actorCommandWindow = new classes.Window_ActorCommand(new Rectangle(0, 0, 128, 120)); },
        addWindow(w) { (this._windows = this._windows || []).push(w); }, startActorCommandSelection() {},
        onActorOk() {}, onEnemyOk() {}, onActorCancel() {}, onEnemyCancel() {}, update() {},
        rrChooseTarget(item) { log.push(['target', item.id]); }, rrStatusRedrawTarget(actor) { log.push(['redraw', actor.name]); }
    });
    const switches = {};
    const skills = [null, { id: 1, name: 'Attack', note: '', description: 'Attack a single target.' }, { id: 2, name: 'Guard', note: '', description: 'Guards.' },
        { id: 3, name: 'Bite', note: '<command name: Chomp>', description: 'Single Attack Skill.' },
        { id: 4, name: 'Secret', note: '<command hide until learn>', description: '' },
        { id: 5, name: 'Lever', note: '<command hide until switch: 9>', description: '' },
        { id: 18, name: 'Shotgun', note: '', description: 'Hits a single enemy.\n\\c[17]Ammo: \\I[5074]Shotgun Shells' }];
    skills[18] = skills[6];
    const ctx = Object.assign({}, classes, {
        window: {}, Rectangle, Graphics: { boxWidth: 640, boxHeight: 480 }, TextManager: { fight: 'Fight', escape: 'Retreat' },
        BattleManager: { canEscape: () => true, actor() { return this._actor; } }, $gameSwitches: { value: (id) => !!switches[id] },
        $gameMessage: { isBusy: () => false }, $gameParty: { inBattle: () => true }, $dataSystem: { skillTypes: ['', 'Tactic', 'Perks', 'Field'] },
        $dataSkills: skills, $dataItems: [null, { id: 1, name: 'Medkit', note: '<command hide until usable>', description: 'Heals.' }],
        PluginManager: { parameters: (name) => parameters[name] || {} }
    });
    for (const name of ['RR_YanflyBattleCommandList', 'RR_YanflyCommandEquip', 'RR_SmoothCursor', 'RR_BattleHelpWindow']) vm.runInNewContext(plugin(name), ctx);
    const actor = (note, classNote, extra = {}) => Object.assign(new classes.Game_Actor(), {
        name: 'Jay', actor: () => ({ note }), currentClass: () => ({ note: classNote }), addedSkillTypes: () => [2, 1], isLearnedSkill: () => false,
        addedSkills: () => [], canUse: () => false, meetsSkillConditions: () => true, meetsItemConditions: () => false, attackSkillId: () => 18, guardSkillId: () => 2
    }, extra);
    return { ctx, switches, log, actor };
}

test('Battle Command List: an actor\'s list, else its class\'s, else the default', () => {
    const { ctx, actor, switches } = load();
    const w = new ctx.Window_ActorCommand(new ctx.Rectangle(0, 0, 128, 120));
    const names = () => w._list.map(c => [c.name, c.symbol, c.enabled, c.ext]);
    w.setup(actor('', ''));
    assert.deepEqual(names(), [['Attack', 'attack', true, null], ['Tactic', 'skill', true, 1], ['Items', 'item', true, null], ['Equip', 'equip', true, null]]);
    // Beany: "SKILL 3" with its quotes, then every skill type in the order gained.
    w.setup(actor('<command list>\r\n"SKILL 3"\r\n"SKILL LIST"\r\n</command list>', ''));
    assert.deepEqual(names(), [['Chomp', 'use_skill', true, 3], ['Perks', 'skill', true, 2], ['Tactic', 'skill', true, 1]]);
    w.setup(actor('', '<command list>\nskill type 2\nskill type 2\nskill type 3\ndefend\nskill 4\nskill 5\nitem 1\n</command list>'));
    assert.deepEqual(names(), [['Perks', 'skill', true, 2], ['Guard', 'guard', true, null]]);
    switches[9] = true;
    w.setup(actor('', '<command list>\nskill 4\nskill 5\nitem 1\n</command list>', { addedSkills: () => [4], canUse: () => true }));
    assert.deepEqual(names(), [['Secret', 'use_skill', true, 4], ['Lever', 'use_skill', true, 5], ['Medkit', 'use_item', false, 1]]);
    assert.equal(w.visible, true);
});

test('Battle Command List: party commands in the set order, the unported ones left out', () => {
    const { ctx } = load();
    const w = new ctx.Window_PartyCommand(new ctx.Rectangle(0, 0, 128, 120));
    w.refresh();
    assert.deepEqual(w._list.map(c => c.name), ['Fight', 'Retreat']);
});

test('Battle Command List: SKILL x sets the skill and picks the target by its scope', () => {
    const { ctx, actor, log } = load();
    const scene = new ctx.Scene_Battle();
    scene.createActorCommandWindow();
    const jay = actor('<command list>\nSKILL 3\n</command list>', '');
    const action = { setSkill(id) { this.skill = id; } };
    Object.assign(jay, { inputtingAction: () => action, setLastBattleSkill(s) { this.last = s.id; } });
    ctx.BattleManager._actor = jay;
    scene._actorCommandWindow.setup(jay);
    scene._actorCommandWindow._handlers.use_skill();
    assert.equal(action.skill, 3);
    assert.equal(jay.last, 3);
    assert.deepEqual(log, [['redraw', 'Jay'], ['target', 3]]);
    // Cancelling its target goes back to the commands.
    scene._actorCommandWindow.active = false;
    Object.assign(scene, { _helpWindow: { hide() { this.hidden = true; } }, _statusWindow: { show() { this.shown = true; } } });
    scene.onEnemyCancel();
    assert.equal(scene._actorCommandWindow.active, true);
    assert.equal(scene._helpWindow.hidden, true);
});

test('Battle help window: the highlighted command\'s text, sliding down from above', () => {
    const { ctx, actor } = load();
    const scene = new ctx.Scene_Battle();
    scene.createPartyCommandWindow();
    scene.createActorCommandWindow();
    const w = scene._actorCommandWindow, help = w._rrCommandHelp;
    assert.deepEqual(scene._windows, [scene._partyCommandWindow._rrCommandHelp, help]);
    assert.deepEqual([help.x, help.y, help.width, help.height, help.visible], [0, 0, 640, 72, false]);
    w.setup(actor('', ''));
    assert.equal(help.y, -400);
    w.update();
    assert.equal(help.y, -375);
    assert.equal(help._text, 'Hits a single enemy.\n\\c[17]Ammo: \\I[5074]Shotgun Shells');
    assert.equal(help.visible, true);
    for (let i = 0; i < 20; i++) w.update();
    assert.equal(help.y, 0);
    w.select(1);
    w.update();
    assert.equal(help._text, 'Skills based on the TP stat');
    w.select(3);
    w.update();
    assert.match(help._text, /^Allows the player/);
    // Inactive, or a command without text: hidden.
    w.active = false;
    w.update();
    assert.equal(help.visible, false);
    w.active = true;
    w.select(0);
    w._actor.attackSkillId = () => 4;
    w.update();
    assert.equal(help.visible, false);
    w.close();
    assert.equal(help.visible, false);
    // The party window's help stays up while it is inactive.
    const party = scene._partyCommandWindow, partyHelp = party._rrCommandHelp;
    party.refresh();
    party.select(0);
    party.open();
    party.active = true;
    party.update();
    assert.equal(partyHelp._text, 'Prepares your party for combat.');
    party.active = false;
    party.update();
    assert.equal(partyHelp.visible, true);
});

test('Command Equip: cooldown, fixed types and no actor switching in battle', () => {
    const { ctx, actor } = load();
    const jay = actor('', '');
    jay.onBattleStart();
    assert.equal(jay.rrBattleEquippable(), true);
    jay._rrEquipCooldown = 2;
    jay.onTurnEnd();
    assert.equal(jay.rrBattleEquippable(), false);
    jay.onTurnEnd();
    assert.equal(jay.rrBattleEquippable(), true);
    jay._rrBattleFixedEtypes = [1];
    assert.equal(jay.isEquipTypeLocked(1), true);
    assert.equal(jay.isEquipTypeLocked(5), true);
    assert.equal(jay.isEquipTypeLocked(2), false);
    const cmd = new ctx.Window_EquipCommand(new ctx.Rectangle(0, 0, 1, 1));
    cmd.setHandler('pagedown', () => {});
    assert.equal(cmd.isHandled('pagedown'), false);
    ctx.$gameParty.inBattle = () => false;
    assert.equal(cmd.isHandled('pagedown'), true);
    assert.equal(new ctx.Scene_Equip().needsPageButtons(), true);
    // The equipment screen closing in battle hands back to the battle instead of popping the scene.
    const equip = new ctx.Scene_Equip();
    equip._rrBattleScene = {};
    equip.popScene();
    assert.equal(equip._popped, undefined);
    assert.equal(equip._rrLeaving, true);
});

test('Smooth Cursor: a quarter of the way each frame (rounded away from zero), scrolling with it', () => {
    const { ctx } = load();
    const w = new ctx.Window_Selectable(new ctx.Rectangle(0, 0, 200, 144));
    const ys = [];
    w.select(1);
    assert.deepEqual([w._cursorRect.y, w._cursorRect.height], [0, 0]);
    for (let i = 0; i < 30; i++) { w.update(); ys.push([w._cursorRect.y, w._cursorRect.height, w._cursorRect.width]); }
    assert.deepEqual(ys.slice(0, 10).map(y => y[0]), [6, 11, 15, 18, 20, 21, 22, 23, 24, 24]);
    assert.deepEqual(ys.slice(0, 7).map(y => y[1]), [6, 11, 15, 18, 20, 21, 22]);
    assert.deepEqual(ys.slice(0, 4).map(y => y[2]), [44, 77, 102, 121]);
    assert.equal(w._rrSmoothTarget, null);
    // Row 5 is below the five visible rows: the list scrolls one row along with the cursor.
    w.select(5);
    w.ensureCursorVisible(true);
    assert.equal(w._stockEnsure, undefined);
    const scroll = [];
    for (let i = 0; i < 30; i++) { w.update(); scroll.push(w.scrollY()); }
    assert.deepEqual(scroll.slice(0, 10), [6, 11, 15, 18, 20, 21, 22, 23, 24, 24]);
    assert.equal(w._cursorRect.y + w.scrollBaseY(), 120);
});
