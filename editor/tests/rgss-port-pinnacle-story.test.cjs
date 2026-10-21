'use strict';
// Pinnacle - The Five Kingdoms, the story area: Yanfly's message system as the game changed it, Hime's choices
// with the game's choice list, KilloZapit's word wrap, Hollow's message busts, Neon Black's passive skills, and
// the game's own message, interpreter, character and picture edits with the story values its events keep.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));

// Snippets of the game's own sections.
const YEA = `$imported = {} if $imported.nil?
$imported["YEA-MessageSystem"] = true
module YEA
  module MESSAGE
    TEXT_SKIP = :A     # Input::A is the shift button on keyboard.
    VARIABLE_ROWS  = 21
    VARIABLE_WIDTH = 22
    FACE_INDENT_X = 112
    NAME_WINDOW_X_BUFFER = 180     # Buffer x position of the name window.
    NAME_WINDOW_Y_BUFFER = 5      # Buffer y position of the name window.
    NAME_WINDOW_PADDING  = 0      # Padding added to the horizontal position.
    NAME_WINDOW_OPACITY  = 255     # Opacity of the name window.
    NAME_WINDOW_COLOUR   = 6       # Text colour used by default for names.
    MESSAGE_WINDOW_FONT_NAME = Font.default_name
    MESSAGE_WINDOW_FONT_SIZE    = 20       # Font size.
    MESSAGE_WINDOW_FONT_BOLD    = false    # Default bold?
    MESSAGE_WINDOW_FONT_ITALIC  = false    # Default italic?
    MESSAGE_WINDOW_FONT_OUTLINE = true     # Default outline?
    MESSAGE_WINDOW_FONT_SHADOW  = false    # Default shadow?
  end # MESSAGE
end # YEA
module Variable
  def self.reset_message_settings
    $game_variables[21] = 5
    $game_variables[22] = 0
  end
  def self.message_rows
    return 5 if YEA::MESSAGE::VARIABLE_ROWS <= 0
    return 5 if YEA::MESSAGE::VARIABLE_ROWS == 4
    return 5 if $game_variables[YEA::MESSAGE::VARIABLE_ROWS] <= 0
    return 5 if $game_variables[YEA::MESSAGE::VARIABLE_ROWS] == 4
    return $game_variables[YEA::MESSAGE::VARIABLE_ROWS]
  end
end # Variable
class Game_Interpreter
  def continue_message_string?
    return true if next_event_code == 101 && Variable.message_rows > 5
    return next_event_code == 401
  end
end # Game_Interpreter
class Window_NameMessage < Window_Base
  def set_x_position(x_position)
    case x_position
    when 1 # Left
      self.x = @message_window.x
    when 2 # 3/10
      self.x = @message_window.x
    when 5 # Right
      self.x = @message_window.x + @message_window.width
      self.x -= self.width
      self.x -= YEA::MESSAGE::NAME_WINDOW_X_BUFFER
    end
  end
end
class Window_Message < Window_Base
  def fiber_main
    self.offset = 120
    self.y = @position * (Graphics.height - height) / 2 + self.offset
      while self.offset > 0
        self.offset -= 6
        Fiber.yield
      end
  end
end # Window_Message`;
const FONT_NAME = 'Font.default_name = ["Arial", "Font2"]\nFont.default_size = 22';
const WINDOW_MESSAGE = `class Window_Message < Window_Base
  def visible_line_number
    return 5
  end
  def line_height
    return 20
  end
  def fiber_main
    $game_message.visible = true
  end
  def wait_for_one_character
    update_show_fast
    Fiber.yield unless @show_fast || @line_show_fast || $game_settings[:fasttext] == 1
  end
end`;
const CHOICE_OPTIONS = `$imported["TH_ChoiceOptions"] = true
class Window_ChoiceList < Window_Command
  def update_placement
    self.width = [max_choice_width  + 12, 96].max + padding * 2
    self.height = [max_choice_lines * fitting_height($game_message.choices.size / col_max), Graphics.height - ($game_variables[21] * 24 + 24)].min
  end
end`;
const BUSTS = `module HMB
  BUST_INDENT = 155
  BUST_OFFSET = -90
  BUST_SYMBOL = "§"
end # HMB
class Window_Message < Window_Base
  def update_bust
    if $game_message.face_name.include?(HMB::BUST_SYMBOL)
      #PEZZA PER USARE SOLO UN SINGOLO FILE PER IL PORTRAIT
      name = $game_message.face_name
      name = name[0, name.length-2] if name[/S\\d+$/]
      name = name[0, name.length - 1] if name[/\\d+$/]
      name += "1"
      @bust.bitmap = Cache.face(name)
      @bust.x = Graphics.width - 150
    end
  end
end`;
const PASSIVES = `$imported ||= {}
$imported["CP_PASSIVES"] = 1.1
class Game_Enemy < Game_Battler  ## Gets passive states on a character.
  def passives
    res = []
  end
end`;
const VE_BASIC = `class Game_Enemy < Game_Battler
  def skills
    enemy.actions.collect {|action| $data_skills[action.skill_id] }
  end
end`;
const SCRIPTS = [FONT_NAME, '$imported["TH_LargeChoices"] = true', CHOICE_OPTIONS, YEA, 'module KZIsAwesome\n  module WordWrap\n    DEFAULT_WORDWRAP = true\n  end\nend', BUSTS, PASSIVES, VE_BASIC, WINDOW_MESSAGE];

test('the story families: detected in the game\'s scripts, settings read from its copies', () => {
    const families = C.scriptFamilies(SCRIPTS);
    for (const key of ['pinnacleStory', 'yeaMessageWindow', 'himeChoices', 'kzWordWrap', 'hollowMessageBusts', 'cpPassiveSkills']) assert.ok(families.has(key), key);
    assert.ok(!C.scriptFamilies(['$imported["YEA-MessageSystem"] = true']).has('pinnacleStory'), 'Yanfly alone is not Pinnacle');

    const constants = C.scriptConstants(SCRIPTS);
    const yea = params('RR_YanflyMessage').extract({ scripts: SCRIPTS, constants });
    assert.deepEqual([yea.rowsVariable, yea.widthVariable, yea.defaultRows, yea.rowsAlsoDefault, yea.continueAbove], ['21', '22', '5', '4', '5']);
    assert.equal(yea.fontSize, String(Math.round(20 * 0.8951 * 10) / 10), 'Font.default_name: the game\'s font (Arial here) at the message size, scaled as the import scales it');
    assert.equal(yea.fontFace, '');
    assert.deepEqual([yea.textSkip, yea.nameWindow, yea.nameXBuffer, yea.nameYBuffer, yea.nameColour, yea.nameLeftBuffer], ['shift', 'true', '180', '5', '6', 'false']);

    const story = params('RR_PinnacleStory').extract({ scripts: SCRIPTS, constants });
    assert.deepEqual(story, { resetVariables: '[[21,5],[22,0]]', slide: '120', slideStep: '6', lineHeight: '20', fastTextSetting: 'fasttext', choiceRowsVariable: '21' });
    assert.deepEqual(params('RR_HollowMessageBusts').extract({ scripts: SCRIPTS, constants: C.scriptConstants([BUSTS]) }),
        { symbol: '§', indent: '155', offset: '-90', rightWidth: '150', singleFile: 'true' });
    assert.deepEqual(params('RR_CpPassiveSkills').extract({ scripts: SCRIPTS }), { enemySkills: 'actions' });
    assert.deepEqual(params('RR_CpPassiveSkills').extract({ scripts: [PASSIVES] }), { enemySkills: 'none' }, 'without a skill list enemies keep none');
});

test('the events\' calls translate: story values, flags in choice conditions, message settings, the hunt', () => {
    const ctx = { constants: C.scriptConstants(SCRIPTS), families: C.scriptFamilies(SCRIPTS) };
    const st = (ruby) => C.ruby(ruby, 'statement', ctx);
    const ex = (ruby) => C.ruby(ruby, 'expression', ctx);
    assert.equal(st('Variable.reset_message_settings'), 'window.RRPinnacleStory?.resetMessageSettings();');
    assert.equal(st('$game_actors[1].homeland = "Doralba"'), '$gameActors.actor(1).rrSetHomeland?.("Doralba");');
    assert.equal(ex('$game_actors[1].gender == 1'), '(($gameActors.actor(1).rrGender?.() ?? 3) === 1)');
    assert.equal(st('$game_actors[1].set_gender(2)'), '$gameActors.actor(1).rrSetGender?.(2);');
    assert.equal(ex('$game_actors[4].affection < 30'), '(($gameActors.actor(4).rrAffection?.() ?? 0) < 30)');
    assert.equal(st('$game_actors[7].maxaffection = 100'), '$gameActors.actor(7).rrSetMaxAffection?.(100);');
    assert.equal(st('$game_actors[4].flags.push("ChiestoVetusia")'), '($gameActors.actor(4).rrFlags?.() ?? []).push("ChiestoVetusia");');
    assert.equal(ex('!($game_actors[4].flags.include?("ChiestoStanco"))'), '!(($gameActors.actor(4).rrFlags?.() ?? []).includes("ChiestoStanco"))');
    assert.equal(st('hide_choice(4, "!$game_switches[5] && !check_flag(2,\'ChiestoCuore\')")'),
        'this.rrChoiceOption?.("hidden", 4, ((!($gameSwitches.value(5)) && !((this.rrCheckFlag?.(2, "ChiestoCuore") ?? false)))));');
    assert.equal(st('hide_choice(2, "$game_actors[1].homeland == \'Valgioiosa\'")'), 'this.rrChoiceOption?.("hidden", 2, ((($gameActors.actor(1).rrHomeland?.() ?? "") === "Valgioiosa")));');
    assert.equal(ex('!in_room?'), '!((this.rrInRoom?.() ?? false))');
    assert.equal(ex('$game_temp.last_choice == -1'), '($gameTemp.rrLastChoice?.() === -(1))');
    assert.match(st('event_list = event_level_data[$game_variables[10]]'), /^var event_list = \(\{ 1: \[13, 14, 15, 16, 17, 18\][^;]*\}\)\[\$gameVariables\.value\(10\)\];$/);
    assert.equal(st('rabbit = $game_map.events[1]\nto_block = rabbit.prominent_tile'), 'var rabbit = $gameMap.event(1);\nvar to_block = rabbit.rrProminentTile?.();');
    assert.equal(ex('$game_map.events[3].can_reach([8, 4])'), '$gameMap.event(3).rrCanReach?.([8, 4])');
});

test('a compound assignment to a story value adds to it, a list as a list', () => {
    const ctx = { constants: {}, families: C.scriptFamilies(SCRIPTS) };
    assert.equal(C.ruby('$game_actors[2].affection += 10', 'statement', ctx), '$gameActors.actor(2).rrSetAffection?.(($gameActors.actor(2).rrAffection?.() ?? 0) + (10));');
    assert.equal(C.ruby('$game_actors[3].flags += ["ChiestoUndine"]', 'statement', ctx), '$gameActors.actor(3).rrSetFlags?.([...($gameActors.actor(3).rrFlags?.() ?? []), ...["ChiestoUndine"]]);');
});

/** RR_PinnacleStory over enough of MZ to run it. */
function storyContext(extra = {}) {
    const ctx = {
        PluginManager: { parameters: () => ({}) },
        Graphics: { boxWidth: 544, boxHeight: 416, width: 544 },
        Math, JSON, Number, String, Array, Object,
        Input: { pressed: new Set(), isPressed(b) { return this.pressed.has(b); } },
        $gameVariables: { v: {}, value(id) { return this.v[id] || 0; }, setValue(id, x) { this.v[id] = x; } },
        $gameSystem: { windowPadding: () => 12 },
        $dataSystem: { advanced: { fontSizeStep: 6.7 } },
        $dataActors: [null, { note: 'male' }, { note: 'female\r\nmove=-1' }, { note: '' }, { note: 'female' }],
        $dataMap: { note: 'room' }
    };
    ctx.window = ctx;
    function Game_Battler() { this.initMembers(); }
    Game_Battler.prototype.initMembers = function() { this._states = []; };
    function Game_Actor(id) { Game_Battler.call(this); this.setup(id); }
    Game_Actor.prototype = Object.create(Game_Battler.prototype);
    Object.assign(Game_Actor.prototype, { setup(id) { this._actorId = id; }, actorId() { return this._actorId; }, refresh() { this.refreshed = true; } });
    function Game_Temp() {}
    function Game_Interpreter() { this.waited = 0; this.chars = {}; }
    Object.assign(Game_Interpreter.prototype, {
        character(id) { return this.chars[id] || null; }, wait(n) { this.waited += n; },
        command203(p) { this.stock203 = p; return true; }
    });
    function Game_CharacterBase(x, y, d) { this.x = x; this.y = y; this._direction = d; this.blocked = new Set(); this.occupied = new Set(); }
    Object.assign(Game_CharacterBase.prototype, {
        direction() { return this._direction; }, reverseDir(d) { return 10 - d; },
        locate(x, y) { this.x = x; this.y = y; }, setDirection(d) { this._direction = d; },
        canPass(x, y, d) { return !this.blocked.has(`${x},${y},${d}`); },
        isCollidedWithCharacters(x, y) { return this.occupied.has(`${x},${y}`); }
    });
    const dx = (d) => (d === 6 ? 1 : d === 4 ? -1 : 0), dy = (d) => (d === 2 ? 1 : d === 8 ? -1 : 0);
    ctx.$gameMap = { xWithDirection: (x, d) => x + dx(d), yWithDirection: (y, d) => y + dy(d), roundXWithDirection: (x, d) => x + dx(d), roundYWithDirection: (y, d) => y + dy(d) };
    function Game_Picture() { Object.assign(this, { _x: 0, _y: 0, _scaleX: 100, _scaleY: 100, _opacity: 255, _duration: 0 }); }
    Object.assign(Game_Picture.prototype, {
        move(origin, x, y, sx, sy, opacity, blend, duration) { Object.assign(this, { _targetX: x, _targetY: y, _targetScaleX: sx, _targetScaleY: sy, _targetOpacity: opacity, _duration: duration }); },
        updateMove() { if (this._duration > 0) { const d = this._duration; this._x = (this._x * (d - 1) + this._targetX) / d; this._y = (this._y * (d - 1) + this._targetY) / d; this._duration--; } }
    });
    function Game_Screen() { this._pictures = []; }
    Object.assign(Game_Screen.prototype, {
        realPictureId: (id) => id, picture(id) { return this._pictures[id]; },
        showPicture(id) { this._pictures[id] = new Game_Picture(); }
    });
    function Window_Base() {}
    Window_Base.prototype.lineHeight = () => 24;
    Window_Base.prototype.update = function() {};
    function Window_Message() { Object.assign(this, { x: 0, y: 0, width: 544, height: 124, openness: 0, _positionType: 2, _background: 0, contents: { fontSize: 16.6, clear() {} } }); }
    Window_Message.prototype = Object.create(Window_Base.prototype);
    Object.assign(Window_Message.prototype, {
        updatePlacement() { this._positionType = ctx.$gameMessage.positionType(); this.y = (this._positionType * (416 - this.height)) / 2; },
        update() { this.stockUpdates = (this.stockUpdates || 0) + 1; },
        terminateMessage() { this.stockTerminated = true; }, synchronizeNameBox() { this._nameBoxWindow.openness = this.openness; },
        startMessage() {}, updateShowFast() {}, updateInput() { return this.isTriggered(); }, isTriggered() { return false; },
        fittingHeight(n) { return n * this.lineHeight() + 24; }, move(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); }, createContents() {},
        isOpening() { return false; }, isClosing() { return this.closing; }, isClosed() { return this.openness === 0; },
        open() { this.openness = 255; }, close() { this.closing = true; },
        doesContinue() { return ctx.$gameMessage.hasText() && ctx.$gameMessage.background() === this._background && ctx.$gameMessage.positionType() === this._positionType; },
        updateBackground() { this._background = ctx.$gameMessage.background(); },
        maxFontSizeInLine() { return this.contents.fontSize; }
    });
    function Window_ChoiceList() { Object.assign(this, { x: 0, y: 0, width: 0, height: 0, _index: 0 }); }
    Window_ChoiceList.prototype = Object.create(Window_Base.prototype);
    Object.assign(Window_ChoiceList.prototype, {
        convertEscapeCharacters: (t) => String(t), textWidth: (t) => String(t).length * 9, resetFontSettings() {},
        index() { return this._index; }, callOkHandler() { this.ok = true; }, callCancelHandler() { this.cancelled = true; },
        itemRectWithPadding(i) { return { x: 4, y: i * this.itemHeight(), width: this.width - 32, height: this.itemHeight() }; }
    });
    Object.assign(ctx, { Game_Battler, Game_Actor, Game_Temp, Game_Interpreter, Game_CharacterBase, Game_Picture, Game_Screen, Window_Base, Window_Message, Window_ChoiceList }, extra);
    ctx.$gameTemp = new Game_Temp();
    const actors = {};
    ctx.$gameActors = { actor: (id) => (actors[id] = actors[id] || new Game_Actor(id)) };
    ctx.$gameMessage = { _choices: [], _cancel: -1, _texts: [], _bg: 0, _pos: 2, choices() { return this._choices; }, choiceCancelType() { return this._cancel; },
        isBusy() { return this._texts.length > 0 || this._choices.length > 0; }, hasText() { return this._texts.length > 0; }, scrollMode: () => false,
        background() { return this._bg; }, positionType() { return this._pos; }, clear() { this._texts = []; this._choices = []; } };
    vm.runInNewContext(plugin('RR_PinnacleStory'), ctx);
    return ctx;
}

test('story values: gender from the note\'s first line, flags cleared by setup, affection kept within its maximum', () => {
    const ctx = storyContext();
    const [emzi, avigail, blank, kia] = [1, 2, 3, 4].map(id => ctx.$gameActors.actor(id));
    assert.deepEqual([emzi.rrGender(), avigail.rrGender(), blank.rrGender(), kia.rrGender()], [1, 3, 3, 2], '"female\\r" is not "female": the game read it as 3');
    emzi.rrSetGender(2);
    assert.equal(emzi.rrGender(), 2);
    emzi.rrFlags().push('TruppaMercenari');
    assert.equal(new ctx.Game_Interpreter().rrCheckFlag(1, 'TruppaMercenari'), true);
    emzi.setup(1);
    assert.deepEqual([...emzi.rrFlags()], [], 'setting an actor up again clears its flags');
    assert.equal(emzi.rrGender(), 1);
    kia.rrSetAffection(130);
    assert.equal(kia.rrAffection(), 130, 'raised past the maximum until the actor refreshes');
    kia.refresh();
    assert.deepEqual([kia.rrAffection(), kia.refreshed], [100, true]);
    kia.rrSetMaxAffection(70); kia.refresh();
    assert.equal(kia.rrAffection(), 70);
    assert.equal(blank.rrHomeland(), '');
    ctx.RRPinnacleStory.resetMessageSettings();
    assert.deepEqual([ctx.$gameVariables.value(21), ctx.$gameVariables.value(22)], [5, 0]);
    assert.equal(new ctx.Game_Interpreter().rrInRoom(), true);
});

test('vocabulary from the language file: Ruby\'s %s become MZ\'s %1, %2', () => {
    const messages = { useItem: '%s used %s! ', emerge: '%1 appare!', expNext: 'Next %s ' };
    const ctx = storyContext({ TextManager: { message: (id) => messages[id] } });
    assert.deepEqual(['useItem', 'emerge', 'expNext', 'none'].map(id => ctx.TextManager.message(id)), ['%1 used %2! ', '%1 appare!', 'Next %1 ', undefined]);
});

test('interpreter edits: an exchange moves only the event, a shake waits its speed', () => {
    const ctx = storyContext();
    const it = new ctx.Game_Interpreter();
    const a = new ctx.Game_CharacterBase(1, 1, 2), b = new ctx.Game_CharacterBase(5, 6, 2);
    it.chars = { 3: a, 4: b };
    it.command203([3, 2, 4, 0, 8]);
    assert.deepEqual([a.x, a.y, a.direction(), b.x, b.y], [5, 6, 8, 5, 6]);
    it.command203([3, 0, 2, 2, 0]);
    assert.ok(it.stock203, 'direct and variable designations stay MZ\'s');
    const shakes = [];
    ctx.$gameScreen = { startShake: (...p) => shakes.push(p) };
    it.command225([5, 7, 30, false]);
    assert.deepEqual([shakes[0], it.waited], [[5, 7, 30], 7]);
});

test('the hunt: the tile a rabbit makes for, whether a wolf reaches it, how far', () => {
    const ctx = storyContext();
    const rabbit = new ctx.Game_CharacterBase(5, 5, 2);   // x < 8, y < 6: the key tile is (6, 4)
    assert.deepEqual([...rabbit.rrProminentTile()], [6, 4]);
    rabbit.occupied.add('6,4');
    assert.deepEqual([...rabbit.rrProminentTile()], [5, 6], 'key tile taken: the way ahead');
    rabbit.blocked.add('5,5,2');
    assert.deepEqual([...rabbit.rrProminentTile()], [6, 5], 'then left of its facing (down → right of the screen)');
    for (const d of [6, 4, 8]) rabbit.blocked.add(`5,5,${d}`);
    assert.equal(rabbit.rrProminentTile(), null);
    const wolf = new ctx.Game_CharacterBase(2, 4, 6);
    assert.equal(wolf.rrCanReach([6, 4]), true);
    assert.equal(wolf.rrDirDistance([6, 4]), 4);
    wolf.blocked.add('4,4,6');
    assert.equal(wolf.rrCanReach([6, 4]), false, 'blocked on the way');
    assert.equal(wolf.rrCanReach([2, 4]), false, 'already there');
    rabbit.occupied.add('7,5');
    assert.deepEqual([rabbit.rrEventClear(6, 5, 6), rabbit.rrEventClear(6, 5, 2)], [false, true]);
    assert.deepEqual([rabbit.rrClockwiseDir(2), rabbit.rrCounterclockwiseDir(2), rabbit.rrClockwiseDir(8)], [4, 6, 6]);
});

test('pictures moved with acceleration curve in x and stay accelerated when shown again', () => {
    const ctx = storyContext();
    const screen = new ctx.Game_Screen();
    screen.showPicture(1);
    screen.rrMovePictureWithAccel(1, 0, 544, 100, 80, 100, 255, 0, 40);
    const p = screen.picture(1);
    p._x = -100;
    p.updateMove();
    assert.ok(Math.abs(p._x - (-100 * 39 + 544) / Math.pow(40, 1.08)) < 1e-9);
    assert.ok(Math.abs(p._y - (0 * 39 + 100) / 40) < 1e-9, 'y moves as usual');
    for (let i = 0; i < 39; i++) p.updateMove();
    assert.equal(p._x, 544, 'the last frame lands on the target');
    screen.showPicture(1);
    assert.equal(screen.picture(1)._rrAccel, true);
    // The battle port moves the picture itself ($gameScreen.picture(1).rrMoveWithAccel): the same.
    ctx.$gameScreen = screen;
    screen.showPicture(2);
    screen.picture(2).rrMoveWithAccel(0, 10, 10, 100, 100, 255, 0, 5);
    screen.showPicture(2);
    assert.equal(screen.picture(2)._rrAccel, true);
});

test('the choice list: right edge, above a bottom message, below one that ends higher, wide and tall choices', () => {
    const ctx = storyContext();
    const list = new ctx.Window_ChoiceList();
    list._messageWindow = { x: 0, y: 146, width: 544, height: 124 };
    ctx.$gameMessage._choices = ['Yes ', 'No '];
    ctx.$gameVariables.setValue(21, 4);
    list.updatePlacement();
    assert.deepEqual([list.width, list.height, list.x, list.y], [Math.max(4 * 9 + 12, 96) + 24, 72, 544 - 120, 270], '"Are you fated to live instead?"');
    ctx.$gameMessage._choices = ['What is this?', 'HP', 'SP', 'Strength', 'Defense', 'Acumen', 'Resistance', 'Agility', 'Luck'];
    list._messageWindow = { x: 0, y: 292, width: 544, height: 124 };
    list.updatePlacement();
    assert.deepEqual([list.height, list.y], [9 * 24 + 24, 52], 'nine choices above the bottom message');
    ctx.$gameVariables.setValue(21, 9);
    list.updatePlacement();
    assert.equal(list.height, 416 - (9 * 24 + 24), 'never taller than the screen less the message rows');
    ctx.$gameVariables.setValue(21, 4);
    ctx.$gameMessage._choices = Array.from({ length: 14 }, (_, i) => 'C' + i);
    list.updatePlacement();
    assert.deepEqual([list.maxCols(), list.width, list.height], [2, Math.max(3 * 9 * 3 + 12, 96) + 24, 7 * 24 + 24], 'past twelve: two columns, three times as wide');
    ctx.$gameMessage._choices = ['x'.repeat(61), 'y'];
    list.updatePlacement();
    assert.deepEqual([list.itemHeight(), list.height], [48, 2 * (2 * 24 + 24)], 'a choice of more than 60 characters takes two rows');
    // $game_temp.last_choice
    ctx.$gameMessage._choices = ['A', 'B', 'C'];
    ctx.$gameMessage._cancel = 1;   // the game's cancel type 2
    list._index = 2; list.callOkHandler();
    assert.equal(ctx.$gameTemp.rrLastChoice(), 0, 'the game compared the row with its 1-based cancel type');
    list._index = 1; list.callOkHandler();
    assert.equal(ctx.$gameTemp.rrLastChoice(), 1);
    list.callCancelHandler();
    assert.deepEqual([ctx.$gameTemp.rrLastChoice(), list.cancelled], [-1, true]);
});

test('a message session slides up 120 pixels, holds for a following message, then slides down and closes', () => {
    const ctx = storyContext();
    const w = new ctx.Window_Message();
    w._nameBoxWindow = { openness: 0, close() { this.closed = true; } };
    w._goldWindow = { close() {} };
    ctx.$gameMessage._texts = ['hello'];
    w.update();
    assert.deepEqual([w.height, w.openness, w._rrPhase, w.y], [5 * 20 + 24, 255, 'in', 292 + 114], 'five rows of 20 once the plugin sizes it; the first frame already 6 up');
    for (let i = 0; i < 19; i++) w.update();
    assert.deepEqual([w.y, w._rrPhase, w.stockUpdates || 0], [292, 'run', 0], 'the text waits for the slide');
    w.update();
    assert.equal(w.stockUpdates, 1);
    w.terminateMessage();
    assert.deepEqual([w._rrPhase, w.stockTerminated, ctx.$gameMessage.hasText()], ['end', undefined, false]);
    ctx.$gameMessage._texts = ['more'];
    w.update();
    assert.equal(w._rrPhase, 'run', 'a message with the same settings continues the window');
    w.terminateMessage();
    w.update();
    assert.deepEqual([w._rrPhase, w.y], ['out', 298]);
    for (let i = 0; i < 19; i++) w.update();
    assert.equal(w.y, 412);
    w.update();
    assert.deepEqual([w._rrPhase, w.closing, w._nameBoxWindow.closed], ['closing', true, true]);
    w.openness = 0;
    w.update();
    assert.equal(w._rrPhase, null);
    assert.equal(w.calcTextHeight({ text: 'abc', index: 0 }), 20, 'a 20-unit line is 20 tall');
    w.contents.fontSize = 16.6 + 6.7;
    assert.equal(w.calcTextHeight({ text: 'abc', index: 0 }), 28, '\\{ makes it 28');
    // Ctrl goes on from a finished page; holding it while text types does not.
    ctx.Input.pressed.add('control');
    assert.equal(w.updateInput(), true);
    assert.equal(w.isTriggered(), false);
    // The Options' fast text shows a page at once.
    w.updateShowFast();
    assert.equal(w._showFast, undefined);
    ctx.$gameSettings = { fasttext: 1 };
    w.updateShowFast();
    assert.equal(w._showFast, true);
});

test('Yanfly\'s name window: \\n<…> codes, positions and the game\'s right-only buffer', () => {
    function Window_Base() {}
    Window_Base.prototype.convertEscapeCharacters = (t) => String(t).replace(/\\/g, '\x1b').replace(/\x1bN\[(\d+)\]/gi, (m, n) => ['', 'Emzi', 'Idris'][n]);
    Window_Base.prototype.resetFontSettings = function() { this.contents.fontSize = 18.3; };
    function Window_Message() {}
    Window_Message.prototype = Object.create(Window_Base.prototype);
    Object.assign(Window_Message.prototype, { resetFontSettings() { Window_Base.prototype.resetFontSettings.call(this); }, newPage() {}, updateShowFast() {} });
    function Window_NameBox() { this.padding = 12; this.contents = {}; }
    Window_NameBox.prototype = Object.create(Window_Base.prototype);
    Object.assign(Window_NameBox.prototype, { textSizeEx: (t) => ({ width: t.length * 10 }), fittingHeight: (n) => n * 24 + 24, hideBackgroundDimmer() {} });
    function Game_Message() { this.clear(); }
    Object.assign(Game_Message.prototype, { clear() { this._speakerName = ''; }, setSpeakerName(n) { this._speakerName = n; }, positionType() { return this._pos; } });
    const yea = params('RR_YanflyMessage').extract({ scripts: SCRIPTS, constants: C.scriptConstants(SCRIPTS) });
    const vars = {};
    const ctx = { Window_Base, Window_Message, Window_NameBox, Game_Message, Game_Interpreter: function() {}, PluginManager: { parameters: () => yea },
        Graphics: { boxWidth: 544, boxHeight: 416 }, $gameVariables: { value: (id) => vars[id] || 0 } };
    ctx.window = ctx;
    vm.runInNewContext(plugin('RR_YanflyMessage'), ctx);
    ctx.$gameMessage = new Game_Message();
    const w = new Window_Message();
    assert.equal(w.convertEscapeCharacters('\\n<\\n[2]>Finally, a quiet moment.'), 'Finally, a quiet moment.');
    assert.deepEqual([ctx.$gameMessage._speakerName, ctx.$gameMessage._rrNamePosition], ['Idris', 1]);
    w.convertEscapeCharacters('Hm.\\nr<Kia>');
    assert.deepEqual([ctx.$gameMessage._speakerName, ctx.$gameMessage._rrNamePosition], ['Kia', 5]);
    const box = new Window_NameBox();
    box._messageWindow = { x: 0, y: 292, width: 394, height: 124, opacity: 0, backOpacity: 192 };
    box._name = 'Idris';
    ctx.$gameMessage._pos = 2;
    ctx.$gameMessage._rrNamePosition = 1;
    box.updatePlacement();
    assert.deepEqual([box.x, box.y, box.width, box.height], [0, 292 - 48 + 5, 5 * 10 + 24, 48], 'left: no buffer in this game');
    ctx.$gameMessage._rrNamePosition = 5;
    box.updatePlacement();
    assert.equal(box.x, 394 - 74 - 180, 'right: the buffer comes off');
    ctx.$gameMessage._pos = 0;
    box.updatePlacement();
    assert.equal(box.y, 124 - 5, 'a top message has its name below');
    box.updateBackground();
    assert.deepEqual([box.opacity, box.backOpacity], [0, 192], 'the name window takes the message window\'s frame');
    box.resetFontSettings();
    assert.equal(box.contents.fontSize, Number(yea.fontSize), 'in the message font');
    ctx.$gameMessage.clear();
    assert.equal(ctx.$gameMessage._rrNamePosition, 1);
    // Rows: 0 and 4 mean five; past five, the next Show Text joins the window.
    vars[21] = 4;
    assert.equal(ctx.RRYanflyMessage.rows(), 5);
    vars[21] = 9;
    assert.equal(ctx.RRYanflyMessage.rows(), 9);
});

test('Yanfly\'s text codes: names and icons of database entries (their text keys read), waits, font sizes', () => {
    function Window_Base() { this.contents = { fontSize: 18.3, fontBold: false }; }
    Window_Base.prototype.convertEscapeCharacters = (t) => String(t).replace(/\\/g, '\x1b');
    Window_Base.prototype.processEscapeCharacter = function(code) { this.stock = code; };
    Window_Base.prototype.obtainEscapeParam = function(ts) { const m = /^\[(\d+)\]/.exec(ts.text.slice(ts.index)); ts.index += m[0].length; return Number(m[1]); };
    function Window_Message() { Window_Base.call(this); }
    Window_Message.prototype = Object.create(Window_Base.prototype);
    Object.assign(Window_Message.prototype, { resetFontSettings() {}, newPage() {}, updateShowFast() {}, startWait(n) { this.waited = n; } });
    const ctx = { Window_Base, Window_Message, Game_Interpreter: function() {}, PluginManager: { parameters: () => ({}) },
        $dataItems: [null, { name: '[5', iconIndex: 64 }], $dataSkills: [null, { name: 'Slash', iconIndex: 76 }], $dataClasses: [null, { name: 'Hero' }],
        $dataSystem: { advanced: { fontSizeStep: 6.7 } }, RRKeyedText: { resolve: (t) => (t === '[5' ? 'Potion' : t) } };
    ctx.window = ctx;
    vm.runInNewContext(plugin('RR_YanflyMessage'), ctx);
    const w = new Window_Message();
    assert.equal(w.convertEscapeCharacters('Take \\ii[1] and \\NS[1]. \\IC[1]'), 'Take \x1bI[64]Potion and Slash. ');
    assert.equal(w.convertEscapeCharacters('\\FB\\FR'), '\x1bAMSF[1]\x1bAMSF[0]');
    const ts = { text: '[30]x', index: 0 };
    w.processEscapeCharacter('W', ts);
    assert.deepEqual([w.waited, ts.index], [30, 4]);
    w.processEscapeCharacter('FZ', { text: '[16]', index: 0 });
    assert.equal(w.contents.fontSize, Math.round(16 * 6.7 / 8 * 10) / 10, '\\FZ sizes in the game\'s units');
    w.processEscapeCharacter('AMSF', { text: '[1]', index: 0 });
    assert.equal(w.contents.fontBold, true);
    w.processEscapeCharacter('C', { text: '[2]', index: 0 });
    assert.equal(w.stock, 'C', 'other codes are MZ\'s');
});

test('Hollow\'s busts: one file per character, loaded ahead in its place, the window narrower with the bust at its right', () => {
    function Game_Interpreter() {}
    Game_Interpreter.prototype.loadImages = function() { for (const c of this._list) if (c.code === 101) loaded.push(c.parameters[0]); };
    const loaded = [];
    function Scene_Message() {}
    Scene_Message.prototype.createAllWindows = function() { this._messageWindow = new Window_Message(); };
    Scene_Message.prototype.addChild = function(c) { this.child = c; };
    function Window_Message() { this.openness = 255; this.innerWidth = 370; }
    Object.assign(Window_Message.prototype, {
        update() {}, newLineX: () => 112, drawMessageFace() { this.faceDrawn = true; }, loadMessageFace() { this._faceBitmap = 'face'; },
        rrMessageWidth: () => 544, rrMessageX() { return (544 - this.width) / 2; }, rrAdjustSize() {}
    });
    function Sprite() { this.bitmap = null; }
    const bitmaps = {};
    const ctx = { Game_Interpreter, Scene_Message, Window_Message, Sprite, PluginManager: { parameters: () => params('RR_HollowMessageBusts').extract({ scripts: [BUSTS], constants: C.scriptConstants([BUSTS]) }) },
        Graphics: { boxWidth: 544, boxHeight: 416 }, ImageManager: { loadFace: (n) => (bitmaps[n] = bitmaps[n] || { name: n, height: 280, isReady: () => true }) } };
    vm.runInNewContext(plugin('RR_HollowMessageBusts'), ctx);
    const it = new Game_Interpreter();
    const list = [{ code: 101, parameters: ['§Idris3', 0, 0, 2] }, { code: 101, parameters: ['Emzi', 1, 0, 2] }, { code: 101, parameters: ['§KiaS2', 0, 0, 2] }];
    it._list = list;
    it.loadImages();
    assert.deepEqual(loaded, ['§Idris1', 'Emzi', '§Kia1']);
    assert.equal(it._list, list, 'the event\'s own list is left as it was');
    const scene = new Scene_Message();
    scene.createAllWindows();
    const w = scene._messageWindow;
    ctx.$gameMessage = { faceName: () => '§Idris2' };
    w.update();
    assert.deepEqual([scene.child.visible, scene.child.bitmap.name, scene.child.x, scene.child.y], [true, '§Idris1', 394, 136]);
    assert.deepEqual([w.rrMessageWidth(), w.rrMessageX(), w.newLineX({}), w.loadMessageFace() || w._faceBitmap], [394, 0, 0, null]);
    w.drawMessageFace();
    assert.equal(w.faceDrawn, undefined, 'no face inside the window');
    ctx.$gameMessage = { faceName: () => 'Emzi' };
    w.width = 544;
    w.update();
    assert.deepEqual([scene.child.visible, w.rrMessageWidth(), w.rrMessageX(), w.newLineX({})], [false, 544, 0, 112]);
});

test('passive skills: enemies take theirs from the skills of their actions when the game gave them a skill list', () => {
    const skills = [null, { id: 1, note: 'passive[1]' }, { id: 2, note: '' }];
    const states = [null, { id: 1 }];
    function Game_BattlerBase() { this._states = []; }
    Game_BattlerBase.prototype.traitObjects = function() { return this._states.slice(); };
    function Game_Actor() { Game_BattlerBase.call(this); }
    Game_Actor.prototype = Object.create(Game_BattlerBase.prototype);
    Game_Actor.prototype.skills = () => [];
    function Game_Enemy(actions) { Game_BattlerBase.call(this); this._actions = actions; }
    Game_Enemy.prototype = Object.create(Game_BattlerBase.prototype);
    Game_Enemy.prototype.enemy = function() { return { actions: this._actions.map(skillId => ({ skillId })) }; };
    for (const [enemySkills, expected] of [['actions', [states[1]]], ['none', []]]) {
        const ctx = { Game_BattlerBase, Game_Actor, Game_Enemy: function(a) { Game_Enemy.call(this, a); }, $dataSkills: skills, $dataStates: states, PluginManager: { parameters: () => ({ enemySkills }) } };
        ctx.Game_Enemy.prototype = Object.create(Game_Enemy.prototype);
        vm.runInNewContext(plugin('RR_CpPassiveSkills'), ctx);
        assert.deepEqual(new ctx.Game_Enemy([1, 2]).traitObjects(), expected, enemySkills);
    }
});
