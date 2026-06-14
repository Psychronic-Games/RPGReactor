//=============================================================================
// MOG_BattleCursor.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc (v1.0) Adds the target cursor.
 * @author Moghunter
 * @url https://mogplugins.wordpress.com
 *
 * @param -> GENERAL
 * @desc
 *
 * @param Target Window
 * @parent -> GENERAL
 * @text Show Window (Target)
 * @desc Display the target selection window.
 * @type boolean
 * @default false
 *
 * @param Slide Effect
 * @parent -> GENERAL
 * @text Slide Animation
 * @desc Slide animation.
 * @type boolean
 * @default true
 *
 * @param Move Speed
 * @parent -> GENERAL
 * @text Slide Speed %
 * @desc Cursor movement speed.
 * (30%...300%)
 * @default 100
 * @type number
 * @min 30
 * @max 300
 * 
 * @param Float Effect
 * @parent -> GENERAL
 * @text Float Animation
 * @desc Float animation.
 * @type boolean
 * @default true
 *
 * @param Align for Actor
 * @parent -> GENERAL
 * @desc Cursor alignment definition for allies. 
 * @text Align (Actor)
 * @type select
 * @default Above
 * @option Below
 * @value Below
 * @option Center
 * @value Center
 * @option Above
 * @value Above
 * @option Left
 * @value Left 
 * @option Right
 * @value Right
 *
 * @param Align for Enemy
 * @parent -> GENERAL
 * @desc Cursor alignment definition for enemies. 
 * @text Align (Enemy)
 * @type select
 * @default Center
 * @option Below
 * @value Below
 * @option Center
 * @value Center
 * @option Above
 * @value Above
 * @option Left
 * @value Left 
 * @option Right
 * @value Right
 *
 * @param X-Axis Offset Actor
 * @parent -> GENERAL
 * @text X-Axis Offset (Actor)
 * @desc X-axis definition for cursor on allies.
 * @default 0
 *
 * @param Y-Axis Offset Actor
 * @parent -> GENERAL
 * @text Y-Axis Offset (Actor)
 * @desc Y-axis definition for cursor on allies.
 * @default 0
 *
 * @param X-Axis Offset Enemy
 * @parent -> GENERAL
 * @text X-Axis Offset (Enemy)
 * @desc X-axis definition for cursor on enemies.
 * @default 0
 *
 * @param Y-Axis Offset Enemy
 * @parent -> GENERAL
 * @text Y-Axis Offset (Enemy)
 * @desc Y-axis definition for cursor on enemies.
 * @default 0
 * 
 * @param -----------------------
 * @desc
 *
 * @param -> NAME
 * @desc
 *
 * @param Name Visible
 * @parent -> NAME
 * @text Show Name
 * @desc Display the target name.
 * @type boolean
 * @default true
 *
 * @param Font Size
 * @parent -> NAME
 * @text Font Size
 * @desc Font size
 * @default 18
 * @type number
 * @min 9
 * @max 48
 *
 * @param Font Bold
 * @parent -> NAME
 * @text Font Bold
 * @desc Enable bold text.
 * @type boolean
 * @default false
 *
 * @param Font Italic
 * @parent -> NAME
 * @text Font Italic
 * @desc Enable italic text.
 * @type boolean
 * @default false
 *
 * @param Name X-Axis Actor
 * @parent -> NAME
 * @text X-Axis Offset (Actor)
 * @desc X-axis definition for name on allies.
 * @default 0
 *
 * @param Name Y-Axis Actor
 * @parent -> NAME
 * @text Y-Axis Offset (Actor)
 * @desc Y-axis definition for name on allies.
 * @default 0
 *
 * @param Name X-Axis Enemy
 * @parent -> NAME
 * @text X-Axis Offset (Enemy)
 * @desc X-axis definition for name on enemies.
 * @default 0
 *
 * @param Name Y-Axis Enemy
 * @parent -> NAME
 * @text Y-Axis Offset (Enemy)
 * @desc Y-axis definition for name on enemies.
 * @default 0
 *
 * @param ------------------------
 * @desc
 *
 * @param -> ANIMATED
 * @desc
 *
 * @param Animated
 * @parent -> ANIMATED
 * @text Spriteset Animation
 * @desc Enable frame animation.
 * @type boolean
 * @default false
 *
 * @param Frames
 * @parent -> ANIMATED
 * @text Frames
 * @desc Frame count definition.
 * (2..100)
 * @type number
 * @default 3
 * @min 2
 * @max 100
 *
 * @param Animation Speed
 * @parent -> ANIMATED
 * @text Animation Speed
 * @desc Animation speed definition.
 * (2..240) 
 * @type number
 * @default 8
 * @min 2
 * @max 240
 *
 * @help  
 * =============================================================================
 * ♦♦♦ MOG - Battle Cursor ♦♦♦
 * Author   -   Moghunter
 * Version  -   1.0
 * Updated  -   2021/04/04
 * https://mogplugins.wordpress.com
 * =============================================================================
 * Adds the target cursor.
 *
 * =============================================================================
 * USAGE
 * =============================================================================
 * The following images are required. (/img/system/)
 *
 * BattleCursor_A.png
 * BattleCursor_B.png
 * 
 * =============================================================================
 * NOTETAGS
 * =============================================================================
 * To define a specific cursor position for certain enemies
 * use the notes below.
 * 
 * Battle Cursor Offset : X : Y
 * 
 * Ex
 *
 * Battle Cursor Offset : 120 : 100
 *
 */
 
 
(() => {
	 
　　var Imported = Imported || {};
　　Imported.MOG_BattleCursor = true;
　　var Moghunter = Moghunter || {}; 


    Moghunter.parameters = PluginManager.parameters('MOG_BattleCursor');
	Moghunter.bcursor_x_actor = Number(Moghunter.parameters['X-Axis Offset Actor'] || 0);
	Moghunter.bcursor_y_actor = Number(Moghunter.parameters['Y-Axis Offset Actor'] || 0);	
	Moghunter.bcursor_x_enemy = Number(Moghunter.parameters['X-Axis Offset Enemy'] || 0);
	Moghunter.bcursor_y_enemy = Number(Moghunter.parameters['Y-Axis Offset Enemy'] || 0);	
	Moghunter.bcursor_slide = String(Moghunter.parameters['Slide Effect'] || "false");
    Moghunter.bcursor_moveSpeed  = Number(Moghunter.parameters['Move Speed'] || 100);
	Moghunter.bcursor_float = String(Moghunter.parameters['Float Effect'] || "true");
    Moghunter.bcursor_alignActor = String(Moghunter.parameters['Align for Actor'] || "Above");
	Moghunter.bcursor_alignEnemy = String(Moghunter.parameters['Align for Enemy'] || "Above");
	
	Moghunter.bcursor_name_visible = String(Moghunter.parameters['Name Visible'] || "true");
	Moghunter.bcursor_name_x_actor = Number(Moghunter.parameters['Name X-Axis Actor'] || 0);
	Moghunter.bcursor_name_y_actor = Number(Moghunter.parameters['Name Y-Axis Actor'] || 0);
	Moghunter.bcursor_name_x_enemy = Number(Moghunter.parameters['Name X-Axis Enemy'] || 0);
	Moghunter.bcursor_name_y_enemy = Number(Moghunter.parameters['Name Y-Axis Enemy'] || 0);
	
	Moghunter.bcursor_fontSize = Number(Moghunter.parameters['Font Size'] || 18);
	Moghunter.bcursor_fontBold = String(Moghunter.parameters['Font Bold'] || "false");
	Moghunter.bcursor_fontItalic = String(Moghunter.parameters['Font Italic'] || "false");
	Moghunter.bcursor_TargetWindow = String(Moghunter.parameters['Target Window'] || "false");
    
    Moghunter.bcursor_animated = String(Moghunter.parameters['Animated'] || "true");
	Moghunter.bcursor_aniFrames = Number(Moghunter.parameters['Frames'] || 3);
	Moghunter.bcursor_aniSpeed = Number(Moghunter.parameters['Animation Speed'] || 5);
	

//=============================================================================
// ■■■ Game_Temp ■■■
//=============================================================================

//==============================
// ♦ ALIAS ♦  Initialize
//==============================
const _mog_bCursor_game_temp_initialize = Game_Temp.prototype.initialize
Game_Temp.prototype.initialize = function() {
	_mog_bCursor_game_temp_initialize.call(this);
    this._mogBattleCursor = {};
	this._mogBattleCursor.needRefresh1 = false;
	this._mogBattleCursor.needRefresh2 = false;
	this._mogBattleCursor.x = 0;
	this._mogBattleCursor.y = 0;
	this._mogBattleCursor.slideTime = 0;
	this._mogBattleCursor.isForOpponent = false;
	this._mogBattleCursor.isForAll = false;
	this._mogBattleCursor.isForEveryone = false
};

//=============================================================================
// ■■■ Game_Party ■■■
//=============================================================================

//==============================
// ♦ ALIAS ♦  addActor
//==============================
const _mog_bCursor_game_party_addActor = Game_Party.prototype.addActor;
Game_Party.prototype.addActor = function(actorId) {
	_mog_bCursor_game_party_addActor.call(this,actorId);
	if (this.inBattle()) {$gameTemp._mogBattleCursor.needRefresh1 = true};
};

//==============================
// ♦ ALIAS ♦  removeActor
//==============================
const _mog_bCursor_game_party_removeActor = Game_Party.prototype.removeActor;
Game_Party.prototype.removeActor = function(actorId) {
	_mog_bCursor_game_party_removeActor.call(this,actorId);
	if (this.inBattle()) {$gameTemp._mogBattleCursor.needRefresh1 = true};
};

//=============================================================================
// ■■■ Game_Battler ■■■
//=============================================================================

//==============================
// ♦ ALIAS ♦  Initialize
//==============================
const _mog_bCursor_game_battler_initMembers = Game_Battler.prototype.initMembers;
Game_Battler.prototype.initMembers = function() {
	_mog_bCursor_game_battler_initMembers.call(this);
	this.initBattleCursor();
};

//==============================
// * initBattleCursor
//==============================
Game_Battler.prototype.initBattleCursor = function() {
	this._battleCursor = {};
	this._battleCursor.enable = true;
	this._battleCursor.X_Offset = 0;
	this._battleCursor.Y_Offset = 0;
};

//==============================
// * notetags mg
//==============================
Game_Battler.prototype.notetags_mg = function() {
	if (this.isEnemy()) {return this.enemy().note.split(/[\r\n]+/)};
	if (this.isActor()) {return this.actor().note.split(/[\r\n]+/)};
};

//==============================
// * setupBattleCursor Note
//==============================
Game_Battler.prototype.setupBattleCursorNote = function() {
     this.notetags_mg().forEach(function(note) {
		 const note_data = note.split(' : ')
		 if (note_data[0].toLowerCase() == "battle cursor offset"){
		     this._battleCursor.X_Offset = Number(note_data[1]);
			 this._battleCursor.Y_Offset = Number(note_data[2]);
		 }; 
	},this);
};

//=============================================================================
// ■■■ Game_Actor ■■■
//=============================================================================

//==============================
// ♦ ALIAS ♦  Setup
//==============================
const _mog_bCursor_game_actor_setup = Game_Actor.prototype.setup;
Game_Actor.prototype.setup = function(actorId) {
	_mog_bCursor_game_actor_setup.call(this,actorId)
	this.setupBattleCursorNote();
};

//=============================================================================
// ■■■ Game_Enemy ■■■
//=============================================================================

//==============================
// ♦ ALIAS ♦  Setup
//==============================
const _mog_bCursor_game_enemy_setup = Game_Enemy.prototype.setup;
Game_Enemy.prototype.setup = function(enemyId, x, y) {
	 _mog_bCursor_game_enemy_setup.call(this,enemyId, x, y);
	 this.setupBattleCursorNote();
};

//==============================
// ♦ ALIAS ♦  transform
//==============================
const _mog_battleCursor_game_enemy_transform = Game_Enemy.prototype.transform;
Game_Enemy.prototype.transform = function(enemyId) {
	_mog_battleCursor_game_enemy_transform.call(this,enemyId);
    $gameTemp._mogBattleCursor.needRefresh2 = true;	
	this.setupBattleCursorNote();
};

//=============================================================================
// ■■■ Game Action ■■■
//=============================================================================

//==============================
//  ♦ OVERWRITE ♦ NeedsSelection
//==============================
Game_Action.prototype.needsSelection = function() {
    return this.checkItemScope([1, 2, 7, 8, 9, 10,14]);
};

//==============================
// ♦ ALIAS ♦  apply
//==============================
const _mog_battleCursor_game_action_apply = Game_Action.prototype.apply;
Game_Action.prototype.apply = function(target) {
	_mog_battleCursor_game_action_apply.call(this,target);
	if (target && target.isEnemy() && target.isDead()) {$gameTemp._mogBattleCursor.needRefresh2 = true};
};

//=============================================================================
// ■■■ Window_BattleActor ■■■
//=============================================================================

//==============================
// ♦ ALIAS ♦  Initialize
//==============================
const _mog_battleCursor_window_battleActor_initialize = Window_BattleActor.prototype.initialize;
Window_BattleActor.prototype.initialize = function(rect) {
	_mog_battleCursor_window_battleActor_initialize.call(this,rect);
	this._bcursor_winVisble = String(Moghunter.bcursor_TargetWindow) == "true" ? true : false;
	if (!$dataSystem.optSideView) {this._bcursor_winVisble = true};
	this._bcSo = (Graphics.height * 2);
};

//==============================
// ♦ ALIAS ♦  Select
//==============================
const _mog_battleCursor_window_battleactor_select = Window_BattleActor.prototype.select;
Window_BattleActor.prototype.select = function(index) {
	  _mog_battleCursor_window_battleactor_select.call(this,index);
	   if (this.battleCursorNeedSelectAllActors()) {
		   this.battleCursorSelectAllActors()};	  
};

//==============================
// * battleCursorNeedSelectAllActors
//==============================
Window_BattleActor.prototype.battleCursorNeedSelectAllActors = function() {
   if ($gameTemp._mogBattleCursor.isForEveryone) {return true};
   if ($gameTemp._mogBattleCursor.isForOpponent) {return false};
   if (!$gameTemp._mogBattleCursor.isForAll) {return false};
   return true;
};

//==============================
// * battleCursorSelectAllActors
//==============================
Window_BattleActor.prototype.battleCursorSelectAllActors = function() {
    for (const member of $gameParty.battleMembers()) {
	     member.select();
	};
	this.setCursorAll(true);
};

//==============================
// ♦ ALIAS ♦ hide
//==============================
const _mog_battleCursor_window_battleactor_hide = Window_BattleActor.prototype.hide;
Window_BattleActor.prototype.hide = function(index) {
	  _mog_battleCursor_window_battleactor_hide.call(this);
	  this.setCursorAll(false);
};

//==============================
// ♦ ALIAS ♦  cursorDown
//==============================
const _mog_battleCursor_window_battleActor_cursorDown = Window_BattleActor.prototype.cursorDown;
Window_BattleActor.prototype.cursorDown = function(wrap) {
    if (!this._bcursor_winVisble) {this.inputIndex(1);return}
	_mog_battleCursor_window_battleActor_cursorDown.call(this,wrap);
};

//==============================
// ♦ ALIAS ♦  cursorUp
//==============================
const _mog_battleCursor_window_battleActor_cursorUp = Window_BattleActor.prototype.cursorUp;
Window_BattleActor.prototype.cursorUp = function(wrap) {
    if (!this._bcursor_winVisble) {this.inputIndex(-1);return}
	_mog_battleCursor_window_battleActor_cursorUp.call(this,wrap);
};

//=============================================================================
// ■■■ Window_BattleEnemy ■■■
//=============================================================================

//==============================
// ♦ ALIAS ♦  Initialize
//==============================
const _mog_battleCursor_window_battleenemy_initialize = Window_BattleEnemy.prototype.initialize;
Window_BattleEnemy.prototype.initialize = function(rect) {
	_mog_battleCursor_window_battleenemy_initialize.call(this,rect);
	this._bcursor_winVisble = String(Moghunter.bcursor_TargetWindow) == "true" ? true : false;
	this._bcSo = (Graphics.height * 2);
};

//==============================
// ♦ ALIAS ♦  Select
//==============================
const _mog_battleCursor_window_battleenemy_select = Window_BattleEnemy.prototype.select
Window_BattleEnemy.prototype.select = function(index) {
    _mog_battleCursor_window_battleenemy_select.call(this,index);
	if (this.battleCursorNeedSelectAllEnemies()) {this.battleCursorSelectAllEnemies()};	  
};

//==============================
// * battleCursorNeedSelectAllEnemies
//==============================
Window_BattleEnemy.prototype.battleCursorNeedSelectAllEnemies = function() {
   if ($gameTemp._mogBattleCursor.isForEveryone) {return true};
   if (!$gameTemp._mogBattleCursor.isForOpponent) {return false};
   if (!$gameTemp._mogBattleCursor.isForAll) {return false};
   return true;
};

//==============================
// * battleCursorSelectAllEnemies
//==============================
Window_BattleEnemy.prototype.battleCursorSelectAllEnemies = function() {
    for (const member of $gameTroop.aliveMembers()) {
	     member.select();
	};
	this.setCursorAll(true);
};

//==============================
// ♦ ALIAS ♦  hide
//==============================
const _mog_battleCursor_window_battleenemy_hide = Window_BattleEnemy.prototype.hide;
Window_BattleEnemy.prototype.hide = function() {
     _mog_battleCursor_window_battleenemy_hide.call(this);
	 this.setCursorAll(false);
};

//==============================
// * itemRectBatttleCursor
//==============================
Window_BattleEnemy.prototype.itemRectBatteCursor = function(index) {
    const maxCols = this.maxCols();
    const itemWidth = this.itemWidth();
    const itemHeight = this.itemHeight();
    const colSpacing = this.colSpacing();
    const rowSpacing = this.rowSpacing();
    const col = index % maxCols;
    const row = Math.floor(index / maxCols);
    const x = itemWidth + colSpacing / 1 - this.scrollBaseX();
    const y = row * itemHeight + rowSpacing / 1 - this.scrollBaseY();
    const width = itemWidth - colSpacing;
    const height = itemHeight - rowSpacing;
    return new Rectangle(x, y, width, height);
};

//==============================
// ♦ OVERWRITE ♦ refreshCursorForAll
//==============================
Window_BattleEnemy.prototype.refreshCursorForAll = function() {
    const maxItems = this.maxItems();
    if (maxItems > 0) {
        const rect = this.itemRect(0);
        rect.enlarge(this.itemRectBatteCursor(999));
 
        this.setCursorRect(rect.x, rect.y, rect.width, rect.height);
    } else {
        this.setCursorRect(0, 0, 0, 0);
    };
	this._index = 0;
};

//==============================
// ♦ ALIAS ♦  cursorDown
//==============================
const _mog_battleCursor_window_battleEnemy_cursorDown = Window_BattleEnemy.prototype.cursorDown;
Window_BattleEnemy.prototype.cursorDown = function(wrap) {
    if (!this._bcursor_winVisble) {this.inputIndex(1);return};
	_mog_battleCursor_window_battleEnemy_cursorDown.call(this,wrap);
};

//==============================
// ♦ ALIAS ♦  cursorUp
//==============================
const _mog_battleCursor_window_battleEnemy_cursorUp = Window_BattleEnemy.prototype.cursorUp;
Window_BattleEnemy.prototype.cursorUp = function(wrap) {
    if (!this._bcursor_winVisble) {this.inputIndex(-1);return};
	_mog_battleCursor_window_battleEnemy_cursorUp.call(this,wrap);
};

//==============================
// ♦ ALIAS ♦  cursorRight
//==============================
const _mog_battleCursor_window_battleEnemy_cursorRight = Window_BattleEnemy.prototype.cursorRight;
Window_BattleEnemy.prototype.cursorRight = function(wrap) {
    if (!this._bcursor_winVisble) {this.inputIndex(1);return};
	_mog_battleCursor_window_battleEnemy_cursorRight.call(this,wrap);
};

//==============================
// ♦ ALIAS ♦  cursorLeft
//==============================
const _mog_battleCursor_window_battleEnemy_cursorLeft = Window_BattleEnemy.prototype.cursorLeft;
Window_BattleEnemy.prototype.cursorLeft = function(wrap) {
    if (!this._bcursor_winVisble) {this.inputIndex(-1);return};
	_mog_battleCursor_window_battleEnemy_cursorLeft.call(this,wrap);
};

//=============================================================================
// ■■■ Window Selectable ■■■ 
//=============================================================================

//==============================
// * input Index
//==============================
Window_Selectable.prototype.inputIndex = function(value) {
    var index = this.index();
	var maxValue = this.maxItems() - 1;
	index += value;
	if (index > maxValue) {index = 0};
	if (index < 0) {index = maxValue};
	this.smoothSelect(index)
};

//=============================================================================
// ■■■ Spriteset Battle ■■■ 
//=============================================================================

//==============================
// * create Sprt Field 1
//==============================
Spriteset_Battle.prototype.createSprtField1 = function() {
    this._sprtField1 = new Sprite();
	this._sprtField1.z = 1;
	this.addChild(this._sprtField1);
};

//==============================
// * create Sprt Field 2
//==============================
Spriteset_Battle.prototype.createSprtField2 = function() {
    this._sprtField2 = new Sprite();
	this._sprtField2.z = 5;
	this.addChild(this._sprtField2);
};

//==============================
// ♦ ALIAS ♦  Create Spriteset
//==============================
const _mog_bCursor_spriteset_battle_createLowerLayer = Spriteset_Battle.prototype.createLowerLayer
Spriteset_Battle.prototype.createLowerLayer = function() {
	_mog_bCursor_spriteset_battle_createLowerLayer.call(this);
    if (!this._sprtField2) {this.createSprtField2()};
	this.createBattleCursor();	  
};


//==============================
// * createBattleCursor
//==============================
Spriteset_Battle.prototype.createBattleCursor = function() {
	for (const sprite of this.battlerSprites()) {
		 const battlerSprite = new BattleCursorSprite(this,sprite);
		 battlerSprite.z = 5;
		 this._sprtField2.addChild(battlerSprite);
	};
};

//=============================================================================
// ■■■  Scene Battle ■■■ 
//=============================================================================

//==============================
// ♦ ALIAS ♦ update
//==============================
const _mog_bCursor_scene_battle_update = Scene_Battle.prototype.update; 
Scene_Battle.prototype.update = function() {
     _mog_bCursor_scene_battle_update.call(this);
	 this.updateBattleCursor();
};

//==============================
// * update Battle Cursor
//==============================
Scene_Battle.prototype.updateBattleCursor = function() {
	if ($gameTemp._mogBattleCursor.slideTime > 0) {
	    $gameTemp._mogBattleCursor.slideTime--;
		if ($gameTemp._mogBattleCursor.slideTime == 0) {
	        $gameTemp._mogBattleCursor.x = 0;
		    $gameTemp._mogBattleCursor.y = 0;
		};
	};
    this.updateBattleCursorTargetWindow();
	$gameTemp._mogBattleCursor.needRefresh1 = false;
	$gameTemp._mogBattleCursor.needRefresh2 = false;	
};

//==============================
// * updateBattleCursorTargetWindow
//==============================
Scene_Battle.prototype.updateBattleCursorTargetWindow= function() {
	if ($gameTemp._mogBattleCursor.needRefresh1 && this._actorWindow.active) {
		this._actorWindow.refresh();
		this._actorWindow.select(0);
	};
	if ($gameTemp._mogBattleCursor.needRefresh2 && this._enemyWindow.active) {
		const enemy = this._enemyWindow.enemy();
		this._enemyWindow.refresh();
		if (!enemy.isDead()) {
			var checked = false;
			for (var i = 0; i < $gameTroop.aliveMembers().length; i++) {	
				 if ($gameTroop.aliveMembers()[i] == enemy) {this._enemyWindow.select(i);checked = true};
			};
			if (!checked) {this._enemyWindow.select(0)};
		} else {
			this._enemyWindow.select(0);
		};
	};
    if (this._enemyWindow && !this._enemyWindow._bcursor_winVisble) {this._enemyWindow.y = this._enemyWindow._bcSo};
	if (this._actorWindow && !this._actorWindow._bcursor_winVisble) {this._actorWindow.y = this._actorWindow._bcSo};
};

//==============================
// ♦ ALIAS ♦ onEnemyCancel
//==============================
const _mog_bCursor_scene_battle_onEnemyCancel = Scene_Battle.prototype.onEnemyCancel;
Scene_Battle.prototype.onEnemyCancel = function() {
	  this._actorWindow.hide();
	  _mog_bCursor_scene_battle_onEnemyCancel.call(this);
};

//==============================
// ♦ ALIAS ♦ onSelectAction
//==============================
const _mog_bCursor_scene_battle_onSelectAction = Scene_Battle.prototype.onSelectAction;
Scene_Battle.prototype.onSelectAction = function() {
    this.battleCursorOnSelectAction();
	_mog_bCursor_scene_battle_onSelectAction.call(this);
	if (this._enemyWindow.active && $gameTemp._mogBattleCursor.isForEveryone) {
		this._actorWindow.battleCursorSelectAllActors();
	}
};

//==============================
// * battleCursorOnSelectAction
//==============================
Scene_Battle.prototype.battleCursorOnSelectAction = function() {
	const action = BattleManager.inputtingAction();
	$gameTemp._mogBattleCursor.isForOpponent = action.isForOpponent();
	$gameTemp._mogBattleCursor.isForAll = action.isForAll();
	$gameTemp._mogBattleCursor.isForEveryone = action.isForEveryone();
};

//=============================================================================
// ■■■  BattleCursorSprite ■■■ 
//=============================================================================
function BattleCursorSprite() {
    this.initialize.apply(this, arguments);
};

BattleCursorSprite.prototype = Object.create(Sprite.prototype);
BattleCursorSprite.prototype.constructor = BattleCursorSprite;

//==============================
// * Initialize
//==============================
BattleCursorSprite.prototype.initialize = function(spriteset,sprite) {
    Sprite.prototype.initialize.call(this);	
	this._spriteset = spriteset;
	this._battlerSprite = sprite;
	this._position = {};
	this._position.x = 0;
	this._position.y = 0;
	this._position.height = 0;
	this._position.xOffset = 0;
	this._position.yOffset = 0;
	this._effect = {};
	this._effect.wave = String(Moghunter.bcursor_float) == "true" ? true : false;
	this._effect.waveX = 0;
	this._effect.waveY = 0;
	this._effect.waveMode = 0;
	this._effect.waveTime = 0;
	this._effect.waveSpeed = 0;
	this._anime = {};
	this._anime.enabled = String(Moghunter.bcursor_animated) == "true" ? true : false;
	this._anime.index = 0;
	this._anime.frameMax = (Math.min(Math.max(Moghunter.bcursor_aniFrames,2),100));
	this._anime.time1 = 0;
	this._anime.time2 = (Math.min(Math.max(Moghunter.bcursor_aniSpeed,2),240));
	this._anime.width = 0;
	this._anime.height = 0;
	this._align = 0
	this.refreshBattler();
	this.prepareBitmap();
	this.visible = false;
	this.opacity = 0;
	this._moveSpeed = (Math.min(Math.max(Moghunter.bcursor_moveSpeed,30),300));
	if (String(Moghunter.bcursor_slide) != "true") {this._moveSpeed = 3000};
	this._xf = ((Graphics.width - Graphics.boxWidth) / 2);
	this._yf = ((Graphics.height - Graphics.boxHeight) / 2);	
};

//==============================
// * getAlign
//==============================
BattleCursorSprite.prototype.getAlign = function(mode) {	
     if (mode == "Below") {
		 return 0;
	 } else if (mode == "Center") {
		 return 1;
 	 } else if (mode == "Left") {
		 return 3;
	 } else if (mode == "Right") {
		 return 4;
	 } else {
		 return 2;
	 } 
};

//==============================
// * prepareAnimation
//==============================
BattleCursorSprite.prototype.prepareAnimation = function() {	
    this._anime.width = this.setCursorBitmap().width / this._anime.frameMax;
    this._anime.height = this.setCursorBitmap().height;
    this.refreshFrameAnimation();
};

//==============================
// * updateAnime
//==============================
BattleCursorSprite.prototype.updateAnime = function() {
	this._anime.time1++;
	if (this._anime.time1 > this._anime.time2) {
		this._anime.time1 = 0;
		this.refreshFrameAnimation();
	};
};

//==============================
// * refresh Frame Animation
//==============================
BattleCursorSprite.prototype.refreshFrameAnimation = function() {
	this._anime.index++;
	if (this._anime.index > (this._anime.frameMax - 1)) {this._anime.index = 0};
	const sx = this._anime.width * this._anime.index;
    this._cursorSprite.setFrame(sx, 0, this._anime.width, this._anime.height);
};

//==============================
// * move Speed
//==============================
BattleCursorSprite.prototype.moveSpeed = function() {
   return this._moveSpeed;
};

//==============================
// * prepare Bitmap
//==============================
BattleCursorSprite.prototype.prepareBitmap = function() {
    this._cursorBitmap1 = ImageManager.loadSystem("BattleCursor_A");
	this._cursorBitmap2 = ImageManager.loadSystem("BattleCursor_B");
};

//==============================
// * create Sprites
//==============================
BattleCursorSprite.prototype.createSprites = function() {	
    this._cursorSprite = new Sprite();
	this._cursorSprite.z = 5;
	this._cursorSprite.anchor.x = 0.5;
	this._cursorSprite.anchor.y = 2;
	this.addChild(this._cursorSprite);
    this._nameSprite = new Sprite(new Bitmap(160,48));
	this._nameSprite.z = 10;
	this._nameSprite.anchor.x = 0.5;
	this._nameSprite.visible = String(Moghunter.bcursor_name_visible) == "true" ? true : false;
	this._nameSprite.bitmap.fontSize = Moghunter.bcursor_fontSize;
	this._nameSprite.bitmap.fontBold = String(Moghunter.bcursor_fontBold) == "true" ? true : false;
	this._nameSprite.bitmap.fontItalic = String(Moghunter.bcursor_fontItalic) == "true" ? true : false;
	this.addChild(this._nameSprite);
	if (this._battler) {this.refreshBattleCursor()};
};

//==============================
// * refreshBattler
//==============================
BattleCursorSprite.prototype.refreshBattler = function() {	 
     this._battler = this.setBattler();
};

//==============================
// * setBattler
//==============================
BattleCursorSprite.prototype.setBattler = function() {	 
     if (this._battlerSprite) {
	     return this._battlerSprite._battler;
	 };
	 return null;
};

//==============================
// * Need Refresh
//==============================
BattleCursorSprite.prototype.needRefresh = function() {
	if (this._battlerSprite) {
        if ($gameTemp._mogBattleCursor.needRefresh1) {return true};
		if ($gameTemp._mogBattleCursor.needRefresh2) {return true};
		if (this._battler != this._battlerSprite._battler) {return true};
		if (this._battler && this._position.width == 0 && this._position.height == 0) {
		   if (this._battlerSprite._mainSprite) { 
			   if (this._battlerSprite._mainSprite.bitmap && this._battlerSprite._mainSprite.bitmap.isReady()) {return true};
		   } else {
			   if (this._battlerSprite.bitmap && this._battlerSprite.bitmap.isReady()) {return true};
		   };
		};
	};
    return false;
};

//==============================
// * Refresh Battle Cursor
//==============================
BattleCursorSprite.prototype.refreshBattleCursor = function() {
	this.visible = false;
    this.refreshBattler();
	if (this._battler) {
		this.refreshData();
		this.refreshBitmap();
		this.refreshName();
	};
};

//==============================
// * Refresh Data
//==============================
BattleCursorSprite.prototype.refreshData = function() {
     if (this._battler.isEnemy()) {
	     this._align = this.getAlign(String(Moghunter.bcursor_alignEnemy));		 
		 this._position.xOffset = Moghunter.bcursor_x_enemy;
		 this._position.yOffset = Moghunter.bcursor_y_enemy;		 
	 } else {
	     this._align = this.getAlign(String(Moghunter.bcursor_alignActor));
	  	 this._position.xOffset = Moghunter.bcursor_x_actor;
		 this._position.yOffset = Moghunter.bcursor_y_actor;		 
	 };
};

//==============================
// * refresh Bitmap
//==============================
BattleCursorSprite.prototype.refreshBitmap = function() {
	 this._cursorSprite.bitmap = this.setCursorBitmap();
	 this._position.width = 0;
	 this._position.height = 0;
	 if (this._align < 3) {
	    this._position.height = this.setCursorAlign(this._align); 
     } else {
	    this._position.width = this.setCursorAlign(this._align);
		this._position.height = this.setCursorAlign(1); 
     };
	 if (this._anime.enabled) {this.prepareAnimation()};
};

//==============================
// * setCursorAlign
//==============================
BattleCursorSprite.prototype.setCursorAlign = function(align) {
  	 if (this._battlerSprite) {
 	     if (this._battlerSprite._mainSprite && this._battlerSprite._mainSprite.bitmap && this._battlerSprite._mainSprite.bitmap.isReady()) {
			 if (align == 0) {
				 return 0;
			 } else if (align == 1) {
			     return (this._battlerSprite._mainSprite.height / 2) - 5;
			 } else if (align == 3) {
				 return -(this._battlerSprite._mainSprite.width / 2) + 5;
			 } else if (align == 4) { 
				 return (this._battlerSprite._mainSprite.width / 2) - 5;
		     } else {
			     return this._battlerSprite._mainSprite.height - 12;
			 };			 
		 };
         if (this._battlerSprite.bitmap && this._battlerSprite.bitmap.isReady()) {
			 if (align == 0) {
				 return 0;
			 } else if (align == 1) {
			     return (this._battlerSprite.height / 2) - 10;
			 } else if (align == 3) {
				 return -(this._battlerSprite.width / 2) + 10;
			 } else if (align == 4) {
				 return (this._battlerSprite.width / 2) - 10;				 
		     } else {
			     return this._battlerSprite.height - 24;
			 };
         };
     };
	 return 0;
};

//==============================
// * set Cursor Bitmap
//==============================
BattleCursorSprite.prototype.setCursorBitmap = function() {
     if (this._battler.isEnemy()) {return this._cursorBitmap2};
	 return this._cursorBitmap1;
};

//==============================
// * Refresh Name
//==============================
BattleCursorSprite.prototype.refreshName = function() {
	const text = String(this._battler.name());
	this._nameSprite.bitmap.clear();
    this._nameSprite.bitmap.drawText(text,0,0,160,42,"center");
	const sh = -(this._cursorSprite.height * 2) - 28;
	const x_Offset = this._battler.isEnemy() ? Moghunter.bcursor_name_x_enemy : Moghunter.bcursor_name_x_actor;
	const y_Offset = this._battler.isEnemy() ? Moghunter.bcursor_name_y_enemy : Moghunter.bcursor_name_y_actor;
	this._nameSprite.x = x_Offset;
	this._nameSprite.y = y_Offset + sh;
};

//==============================
// * move Cursor
//==============================
BattleCursorSprite.prototype.moveCursor = function(value,real_value) {
	if (value == real_value) {return value};
	var dnspeed = (5 + (Math.abs(value - real_value) / 10)) * (this.moveSpeed() / 100);
	if (value > real_value) {value -= dnspeed;
	    if (value < real_value) {value = real_value};}
    else if (value < real_value) {value  += dnspeed;
    	if (value  > real_value) {value  = real_value};		
    };
	return Math.floor(value);
};	

//==============================
// * posX
//==============================
BattleCursorSprite.prototype.posX = function() {
   if (!this._battlerSprite) {return 0};
   return this._xf + this._position.xOffset + this._battlerSprite.x + this._effect.waveX + this._battler._battleCursor.X_Offset + this._position.width;   
};

//==============================
// * posY
//==============================
BattleCursorSprite.prototype.posY = function() {
   if (!this._battlerSprite) {return 0};
   return this._yf + this._position.yOffset + this._battlerSprite.y + this._effect.waveY + this._battler._battleCursor.Y_Offset - this._position.height; 
};

//==============================
// * update Wave Effect
//==============================
BattleCursorSprite.prototype.updateWaveEffect = function() {
    this._effect.waveTime++;
	if (this._align < 3) {
		this._effect.waveY = this.updateWaveMovement(this._effect.waveY);
	} else {
		this._effect.waveX = this.updateWaveMovement(this._effect.waveX);
	};
};

//==============================
// * updateWaveMovement
//==============================
BattleCursorSprite.prototype.updateWaveMovement = function(value) {	
	if (this._effect.waveMode == 0) {
		if (this._effect.waveTime > 2) {
			this._effect.waveTime = 0
		    value++;
			if (value >= 10) {this._effect.waveMode = 1	};
		};
	} else {
		if (this._effect.waveTime > 2) {
			this._effect.waveTime = 0
		    value--;
			if (value <= 0) {this._effect.waveMode = 0};
		};		
	};
	return value
};

//==============================
// * isForAll
//==============================
BattleCursorSprite.prototype.isForAll = function() {
   return $gameTemp._mogBattleCursor.isForAll;;
};

//==============================
// * isVisible
//==============================
BattleCursorSprite.prototype.isVisible = function() {
	if (!this._battler) {return false};
	if (this._battler.isHidden()) {return false};
	if (this._battler.isEnemy() && this._battler.isDead()) {return false};
	return this._battler.isSelected();
};

//==============================
// * Update Battle Cursor
//==============================
BattleCursorSprite.prototype.updateBattleCursor = function() {
     this.visible = this.isVisible();
	 if (this._effect.wave) {this.updateWaveEffect()};
	 if (this._anime.enabled) {this.updateAnime()};
     this.updatePosition();
};

//==============================
// * Update Position
//==============================
BattleCursorSprite.prototype.updatePosition = function() {
	 if (this.visible) {
    	 this.x = this.moveCursor(this.x,this.posX());
	     this.y = this.moveCursor(this.y,this.posY());
		 $gameTemp._mogBattleCursor.x = this.x;
		 $gameTemp._mogBattleCursor.y = this.y;
		 $gameTemp._mogBattleCursor.slideTime = 6;
		 this.opacity += 25;
	 } else {
       	 this.x = $gameTemp._mogBattleCursor.x;
	     this.y = $gameTemp._mogBattleCursor.y;
		 this.opacity = $gameTemp._mogBattleCursor.slideTime == 0 ? 0 : 255;
	 };
 };

//==============================
// * need Create Sprites
//==============================
BattleCursorSprite.prototype.needCreateSprites = function() {
   if (this._cursorSprite) {return false};
   if (!this._cursorBitmap1.isReady()) {return false};
   return true;
};

//==============================
// * Update
//==============================
BattleCursorSprite.prototype.update = function() {
    Sprite.prototype.update.call(this);	
	if (this.needCreateSprites()) {this.createSprites()}
    if (this.needRefresh()) {this.refreshBattleCursor()};
	if (this._battler) {this.updateBattleCursor()};
};

})();