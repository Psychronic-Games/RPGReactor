//=============================================================================
// PSYCHRONIC_PartySystemMZ.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc [v1.0.1] Advanced Party Formation System for RPG Maker MZ
 * @author PSYCHRONIC
 * @url https://psychronic.itch.io
 *
 * @help
 * ============================================================================
 * PSYCHRONIC Party System MZ
 * ============================================================================
 *
 * This plugin replaces the standard Formation command with an advanced
 * party management system allowing players to customize their active party.
 *
 * ============================================================================
 * Plugin Commands
 * ============================================================================
 *
 * Use the Plugin Command interface in MZ to access these commands.
 *
 * ============================================================================
 * Terms of Use
 * ============================================================================
 * Free for commercial and non-commercial use.
 * Credit PSYCHRONIC if you use this plugin.
 *
 * @command OpenPartyMenu
 * @text Open Party Menu
 * @desc Opens the party formation menu
 *
 * @command LockActor
 * @text Lock Actor
 * @desc Locks an actor so they cannot be removed from party
 *
 * @arg actorId
 * @text Actor ID
 * @type actor
 * @desc The actor to lock
 * @default 1
 *
 * @command UnlockActor
 * @text Unlock Actor
 * @desc Unlocks a previously locked actor
 *
 * @arg actorId
 * @text Actor ID
 * @type actor
 * @desc The actor to unlock
 * @default 1
 *
 * @command RequireActor
 * @text Require Actor
 * @desc Makes an actor required in the active party
 *
 * @arg actorId
 * @text Actor ID
 * @type actor
 * @desc The actor to require
 * @default 1
 *
 * @command UnrequireActor
 * @text Unrequire Actor
 * @desc Removes requirement for an actor
 *
 * @arg actorId
 * @text Actor ID
 * @type actor
 * @desc The actor to unrequire
 * @default 1
 *
 * @command ChangeMaxBattleMembers
 * @text Change Max Party Size
 * @desc Changes the maximum battle party size
 *
 * @arg max
 * @text Maximum Size
 * @type number
 * @min 1
 * @max 8
 * @desc New maximum party size
 * @default 4
 *
 * @param maxBattleMembers
 * @text Max Battle Members
 * @type number
 * @min 1
 * @max 8
 * @desc Maximum number of actors in battle party
 * @default 4
 *
 * @param showBattleCommand
 * @text Show in Battle
 * @type boolean
 * @desc Show Formation command during battle
 * @default true
 *
 * @param enableBattleCommand
 * @text Enable in Battle
 * @type boolean
 * @desc Enable Formation command during battle
 * @default true
 *
 * @param battleCooldown
 * @text Battle Cooldown
 * @type number
 * @min 0
 * @desc Turns to wait after changing party in battle
 * @default 1
 *
 * @param lockFirstActor
 * @text Lock First Actor
 * @type boolean
 * @desc Automatically lock the first actor in the party
 * @default false
 *
 * @param emptySlotText
 * @text Empty Slot Text
 * @type string
 * @desc Text shown for empty party slots
 * @default - Empty -
 *
 * @param changeCommandText
 * @text Change Command
 * @type string
 * @desc Text for the Change command (leave blank to hide)
 * @default Change
 *
 * @param removeCommandText
 * @text Remove Command
 * @type string
 * @desc Text for the Remove command (leave blank to hide)
 * @default Remove
 *
 * @param revertCommandText
 * @text Revert Command
 * @type string
 * @desc Text for the Revert command (leave blank to hide)
 * @default Revert
 *
 * @param finishCommandText
 * @text Finish Command
 * @type string
 * @desc Text for the Finish command (leave blank to hide)
 * @default Finish
 *
 * @param showActorFaces
 * @text Show Actor Faces
 * @type boolean
 * @desc Show actor faces in party window
 * @default true
 *
 * @param showActorSprites
 * @text Show Actor Sprites
 * @type boolean
 * @desc Show actor sprites in party window
 * @default true
 *
 * @param lockedIcon
 * @text Locked Icon
 * @type number
 * @desc Icon index for locked actors
 * @default 195
 *
 * @param requiredIcon
 * @text Required Icon
 * @type number
 * @desc Icon index for required actors
 * @default 205
 *
 * @param formationTitle
 * @text Formation Title
 * @type string
 * @desc Title text shown at the top of the formation screen
 * @default Formation
 *
 * @param showLevel
 * @text Show Level in Status
 * @type boolean
 * @desc Show actor level in the status window
 * @default false
 */

(() => {
    'use strict';

    const pluginName = 'PSYCHRONIC_PartySystemMZ';
    const parameters = PluginManager.parameters(pluginName);

    const params = {
        maxBattleMembers: Number(parameters['maxBattleMembers']) || 4,
 showBattleCommand: parameters['showBattleCommand'] === 'true',
 enableBattleCommand: parameters['enableBattleCommand'] === 'true',
 battleCooldown: Number(parameters['battleCooldown']) || 1,
 lockFirstActor: parameters['lockFirstActor'] === 'true',
 emptySlotText: String(parameters['emptySlotText'] || '- Empty -'),
 changeCommandText: String(parameters['changeCommandText'] || 'Change'),
 removeCommandText: String(parameters['removeCommandText'] || 'Remove'),
 revertCommandText: String(parameters['revertCommandText'] || 'Revert'),
 finishCommandText: String(parameters['finishCommandText'] || 'Finish'),
 showActorFaces: parameters['showActorFaces'] !== 'false',
 showActorSprites: parameters['showActorSprites'] !== 'false',
 lockedIcon: Number(parameters['lockedIcon']) || 195,
 requiredIcon: Number(parameters['requiredIcon']) || 205,
 formationTitle: String(parameters['formationTitle'] || 'Formation'),
     showLevel: parameters['showLevel'] === 'true'
    };

 // Plugin Commands
 PluginManager.registerCommand(pluginName, 'OpenPartyMenu', args => {
     SceneManager.push(Scene_PartyFormation);
 });

 PluginManager.registerCommand(pluginName, 'LockActor', args => {
     const actorId = Number(args.actorId);
     $gameParty.lockActor(actorId);
 });

 PluginManager.registerCommand(pluginName, 'UnlockActor', args => {
     const actorId = Number(args.actorId);
     $gameParty.unlockActor(actorId);
 });

 PluginManager.registerCommand(pluginName, 'RequireActor', args => {
     const actorId = Number(args.actorId);
     $gameParty.requireActor(actorId);
 });

 PluginManager.registerCommand(pluginName, 'UnrequireActor', args => {
     const actorId = Number(args.actorId);
     $gameParty.unrequireActor(actorId);
 });

 PluginManager.registerCommand(pluginName, 'ChangeMaxBattleMembers', args => {
     $gameParty.setMaxBattleMembers(Number(args.max));
 });

 //=============================================================================
 // Game_Party
 //=============================================================================

 const _Game_Party_initialize = Game_Party.prototype.initialize;
 Game_Party.prototype.initialize = function() {
     _Game_Party_initialize.call(this);
     this._lockedActors = [];
     this._requiredActors = [];
     this._maxBattleMembers = params.maxBattleMembers;
     this._pendingParty = null;
     this._availableActors = [];
 };

 const _Game_Party_setupStartingMembers = Game_Party.prototype.setupStartingMembers;
 Game_Party.prototype.setupStartingMembers = function() {
     _Game_Party_setupStartingMembers.call(this);
     if (!this._availableActors) this._availableActors = [];
     for (const actorId of this._actors) {
         if (!this._availableActors.includes(actorId)) {
             this._availableActors.push(actorId);
         }
     }
 };

 const _Game_Party_addActor = Game_Party.prototype.addActor;
 Game_Party.prototype.addActor = function(actorId) {
     _Game_Party_addActor.call(this, actorId);
     if (!this._availableActors) this._availableActors = [];
     if (!this._availableActors.includes(actorId)) {
         this._availableActors.push(actorId);
     }
 };

 Game_Party.prototype.availableMembers = function() {
     if (!this._availableActors) {
         this._availableActors = [];
         for (const actorId of this._actors) {
             if (!this._availableActors.includes(actorId)) {
                 this._availableActors.push(actorId);
             }
         }
     }

     return this._availableActors.map(id => $gameActors.actor(id)).filter(actor => actor !== null);
 };

 Game_Party.prototype.maxBattleMembers = function() {
     if (this._maxBattleMembers === undefined) {
         this._maxBattleMembers = params.maxBattleMembers;
     }
     return this._maxBattleMembers;
 };

 Game_Party.prototype.setMaxBattleMembers = function(max) {
     this._maxBattleMembers = max;
 };

 Game_Party.prototype.lockActor = function(actorId) {
     if (!this._lockedActors) this._lockedActors = [];
     if (!this._lockedActors.includes(actorId)) {
         this._lockedActors.push(actorId);
     }
 };

 Game_Party.prototype.unlockActor = function(actorId) {
     if (!this._lockedActors) this._lockedActors = [];
     this._lockedActors = this._lockedActors.filter(id => id !== actorId);
 };

 Game_Party.prototype.isActorLocked = function(actorId) {
     if (!this._lockedActors) this._lockedActors = [];
     return this._lockedActors.includes(actorId);
 };

 Game_Party.prototype.requireActor = function(actorId) {
     if (!this._requiredActors) this._requiredActors = [];
     if (!this._requiredActors.includes(actorId)) {
         this._requiredActors.push(actorId);
     }
     if (!this._actors.includes(actorId)) {
         this.addActor(actorId);
     }
 };

 Game_Party.prototype.unrequireActor = function(actorId) {
     if (!this._requiredActors) this._requiredActors = [];
     this._requiredActors = this._requiredActors.filter(id => id !== actorId);
 };

 Game_Party.prototype.isActorRequired = function(actorId) {
     if (!this._requiredActors) this._requiredActors = [];
     return this._requiredActors.includes(actorId);
 };

 Game_Party.prototype.battleMembersWithEmpty = function() {
     const max = this.maxBattleMembers();
     const members = [];
     for (let i = 0; i < max; i++) {
         if (this._actors[i] && this._actors[i] > 0) {
             members.push($gameActors.actor(this._actors[i]));
         } else {
             members.push(null);
         }
     }
     return members;
 };

 // Returns only actual actors (for battle and game logic)
 Game_Party.prototype.battleMembers = function() {
     const max = this.maxBattleMembers();
     const members = [];
     for (let i = 0; i < max; i++) {
         if (this._actors[i] && this._actors[i] > 0) {
             const actor = $gameActors.actor(this._actors[i]);
             if (actor) members.push(actor);
         }
     }
     return members;
 };

 Game_Party.prototype.allMembers = function() {
     return this._actors.filter(id => id > 0).map(id => $gameActors.actor(id));
 };

 Game_Party.prototype.reserveMembers = function() {
     return this.allMembers().slice(this.maxBattleMembers());
 };

 Game_Party.prototype.canRemoveActor = function(actorId) {
     if (this.isActorLocked(actorId)) return false;
     if (this.isActorRequired(actorId)) return false;
     const actualActorCount = this._actors.filter(id => id > 0).length;
     if (actualActorCount <= 1) return false;
     return true;
 };

 Game_Party.prototype.swapOrder = function(index1, index2) {
     const temp = this._actors[index1];
     this._actors[index1] = this._actors[index2];
     this._actors[index2] = temp;
     $gamePlayer.refresh();
 };

 Game_Party.prototype.savePendingParty = function() {
     if (!this._pendingParty) this._pendingParty = null;
     this._pendingParty = JsonEx.makeDeepCopy(this._actors);
 };

 Game_Party.prototype.restorePendingParty = function() {
     if (!this._pendingParty) this._pendingParty = null;
     if (this._pendingParty) {
         this._actors = JsonEx.makeDeepCopy(this._pendingParty);
         this._pendingParty = null;
         $gamePlayer.refresh();
     }
 };

 Game_Party.prototype.commitPendingParty = function() {
     if (!this._pendingParty) this._pendingParty = null;
     this._pendingParty = null;
     $gamePlayer.refresh();
 };

 //=============================================================================
 // Scene_Menu
 //=============================================================================

 const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
 Scene_Menu.prototype.createCommandWindow = function() {
     _Scene_Menu_createCommandWindow.call(this);
     this._commandWindow.setHandler('formation', this.commandFormation.bind(this));
 };

 const _Scene_Menu_isFormationEnabled = Scene_Menu.prototype.isFormationEnabled;
 Scene_Menu.prototype.isFormationEnabled = function() {
     const actualActorCount = $gameParty._actors.filter(id => id > 0).length;
     if (actualActorCount === 0) return false;
     return _Scene_Menu_isFormationEnabled ? _Scene_Menu_isFormationEnabled.call(this) : true;
 };

 Scene_Menu.prototype.commandFormation = function() {
     SceneManager.push(Scene_PartyFormation);
 };

 //=============================================================================
 // Scene_PartyFormation
 //=============================================================================

 class Scene_PartyFormation extends Scene_MenuBase {
     create() {
         super.create();
         this.createWindows();
         $gameParty.savePendingParty();
     }

     createWindows() {
         this.createTitleWindow();
         this.createPartyWindow();
         this.createCommandWindow();
         this.createMemberListWindow();
         this.createStatusWindow();
     }

     createTitleWindow() {
         const rect = this.titleWindowRect();
         this._titleWindow = new Window_PartyTitle(rect);
         this.addWindow(this._titleWindow);
     }

     titleWindowRect() {
         const ww = Graphics.boxWidth;
         const wh = this.calcWindowHeight(1, false);
         const wx = 0;
         const wy = 0;
         return new Rectangle(wx, wy, ww, wh);
     }

     createPartyWindow() {
         const rect = this.partyWindowRect();
         this._partyWindow = new Window_PartyMembers(rect);
         this._partyWindow.setHandler('ok', this.onPartyOk.bind(this));
         this._partyWindow.setHandler('cancel', this.onPartyCancel.bind(this));
         this.addWindow(this._partyWindow);
     }

     partyWindowRect() {
         const ww = Graphics.boxWidth;
         const wh = 180;
         const wx = 0;
         const wy = this._titleWindow.height;
         return new Rectangle(wx, wy, ww, wh);
     }

     createCommandWindow() {
         const rect = this.commandWindowRect();
         this._commandWindow = new Window_PartyFormationCommand(rect);
         this._commandWindow.setHandler('change', this.commandChange.bind(this));
         this._commandWindow.setHandler('remove', this.commandRemove.bind(this));
         this._commandWindow.setHandler('revert', this.commandRevert.bind(this));
         this._commandWindow.setHandler('finish', this.commandFinish.bind(this));
         this._commandWindow.setHandler('cancel', this.onCommandCancel.bind(this));
         this._commandWindow.deactivate();
         this.addWindow(this._commandWindow);
     }

     commandWindowRect() {
         const ww = Graphics.boxWidth;
         const wh = this.calcWindowHeight(1, true);
         const wx = 0;
         const wy = this._titleWindow.height + this._partyWindow.height;
         return new Rectangle(wx, wy, ww, wh);
     }

     createMemberListWindow() {
         const rect = this.memberListWindowRect();
         this._memberListWindow = new Window_MemberList(rect);
         this._memberListWindow.setHandler('ok', this.onMemberListOk.bind(this));
         this._memberListWindow.setHandler('cancel', this.onMemberListCancel.bind(this));
         this._memberListWindow.deactivate();
         this.addWindow(this._memberListWindow);
     }

     memberListWindowRect() {
         const ww = 240;
         const wh = Graphics.boxHeight - this._titleWindow.height - this._partyWindow.height - this._commandWindow.height;
         const wx = 0;
         const wy = this._titleWindow.height + this._partyWindow.height + this._commandWindow.height;
         return new Rectangle(wx, wy, ww, wh);
     }

     createStatusWindow() {
         const rect = this.statusWindowRect();
         this._statusWindow = new Window_PartyStatus(rect);
         this.addWindow(this._statusWindow);
     }

     statusWindowRect() {
         const ww = Graphics.boxWidth - 240;
         const wh = Graphics.boxHeight - this._titleWindow.height - this._partyWindow.height - this._commandWindow.height;
         const wx = 240;
         const wy = this._titleWindow.height + this._partyWindow.height + this._commandWindow.height;
         return new Rectangle(wx, wy, ww, wh);
     }

     onPartyOk() {
         this._commandWindow.activate();
     }

     onPartyCancel() {
         this.commandFinish();
     }

     onCommandCancel() {
         this._partyWindow.activate();
     }

     commandChange() {
         this._memberListWindow.setMode('change');
         this._memberListWindow.setPartyIndex(this._partyWindow.index());
         this._memberListWindow.refresh();
         this._memberListWindow.activate();
         this._memberListWindow.select(0);
     }

     commandRemove() {
         const actor = this._partyWindow.currentActor();
         const index = this._partyWindow.index();

         if (actor && $gameParty.canRemoveActor(actor.actorId())) {
             $gameParty._actors[index] = 0;
             $gamePlayer.refresh();
             this._partyWindow.refresh();
             this._memberListWindow.refresh();
             this._statusWindow.setActor(null);
             this._commandWindow.refresh();
         }
         this._partyWindow.activate();
     }

     commandRevert() {
         $gameParty.restorePendingParty();
         this._partyWindow.refresh();
         this._memberListWindow.refresh();
         this._statusWindow.setActor(this._partyWindow.currentActor());
         this._commandWindow.refresh();
         this._partyWindow.activate();
     }

     commandFinish() {
         $gameParty.commitPendingParty();
         this.popScene();
     }

     onMemberListOk() {
         const actor = this._memberListWindow.currentActor();
         const partyIndex = this._partyWindow.index();

         if (!actor) {
             this._memberListWindow.activate();
             return;
         }

         if (this._memberListWindow._mode === 'change') {
             const actorId = actor.actorId();
             const currentIndex = $gameParty._actors.indexOf(actorId);

             if (currentIndex >= 0) {
                 $gameParty.swapOrder(partyIndex, currentIndex);
             } else {
                 const oldActorId = $gameParty._actors[partyIndex];
                 if (!oldActorId || oldActorId === 0 || $gameParty.canRemoveActor(oldActorId)) {
                     $gameParty._actors[partyIndex] = actorId;
                     $gamePlayer.refresh();
                 }
             }
         }

         this._memberListWindow.deactivate();
         this._partyWindow.refresh();
         this._memberListWindow.refresh();
         this._partyWindow.activate();
         this._statusWindow.setActor(this._partyWindow.currentActor());
         this._commandWindow.refresh();
     }

     onMemberListCancel() {
         this._memberListWindow.deactivate();
         this._commandWindow.activate();
     }

     start() {
         super.start();
         this._partyWindow.refresh();
         this._partyWindow.activate();
         this._partyWindow.select(0);
         this._statusWindow.setActor(this._partyWindow.currentActor());
     }
 }

 window.Scene_PartyFormation = Scene_PartyFormation;

 //=============================================================================
 // Window_PartyTitle
 //=============================================================================

 class Window_PartyTitle extends Window_Base {
     initialize(rect) {
         super.initialize(rect);
         this.refresh();
     }

     refresh() {
         this.contents.clear();
         const text = params.formationTitle;
         const width = this.contentsWidth();
         this.drawText(text, 0, 0, width, 'center');
     }
 }

 window.Window_PartyTitle = Window_PartyTitle;

 //=============================================================================
 // Window_PartyMembers
 //=============================================================================

 class Window_PartyMembers extends Window_Selectable {
     initialize(rect) {
         super.initialize(rect);
         this.refresh();
     }

     maxCols() {
         return $gameParty.maxBattleMembers();
     }

     maxItems() {
         return $gameParty.maxBattleMembers();
     }

     itemHeight() {
         return this.innerHeight;
     }

     drawItem(index) {
         const battleMembers = $gameParty.battleMembersWithEmpty();
         const actor = battleMembers[index];
         const rect = this.itemRect(index);

         if (actor) {
             const spriteY = rect.y + rect.height - 8;
             this.drawActorCharacter(actor, rect.x + rect.width / 2, spriteY);

             const nameY = rect.y + 8;
             this.drawText(actor.name(), rect.x, nameY, rect.width, 'center');

             if ($gameParty.isActorLocked(actor.actorId())) {
                 this.drawIcon(params.lockedIcon, rect.x + 2, rect.y + 2);
             } else if ($gameParty.isActorRequired(actor.actorId())) {
                 this.drawIcon(params.requiredIcon, rect.x + 2, rect.y + 2);
             }
         } else {
             this.drawText(params.emptySlotText, rect.x, rect.y + rect.height / 2 - 14, rect.width, 'center');
         }
     }

     currentActor() {
         const battleMembers = $gameParty.battleMembersWithEmpty();
         return battleMembers[this.index()];
     }

     processOk() {
         const actor = this.currentActor();
         if (SceneManager._scene._statusWindow) {
             SceneManager._scene._statusWindow.setActor(actor);
         }
         super.processOk();
     }

     select(index) {
         super.select(index);
         if (SceneManager._scene && SceneManager._scene._statusWindow) {
             SceneManager._scene._statusWindow.setActor(this.currentActor());
         }
         if (SceneManager._scene && SceneManager._scene._commandWindow) {
             SceneManager._scene._commandWindow.refresh();
         }
     }

     cursorDown(wrap) {
         super.cursorDown(wrap);
         if (SceneManager._scene && SceneManager._scene._statusWindow) {
             SceneManager._scene._statusWindow.setActor(this.currentActor());
         }
         if (SceneManager._scene && SceneManager._scene._commandWindow) {
             SceneManager._scene._commandWindow.refresh();
         }
     }

     cursorUp(wrap) {
         super.cursorUp(wrap);
         if (SceneManager._scene && SceneManager._scene._statusWindow) {
             SceneManager._scene._statusWindow.setActor(this.currentActor());
         }
         if (SceneManager._scene && SceneManager._scene._commandWindow) {
             SceneManager._scene._commandWindow.refresh();
         }
     }

     cursorRight(wrap) {
         super.cursorRight(wrap);
         if (SceneManager._scene && SceneManager._scene._statusWindow) {
             SceneManager._scene._statusWindow.setActor(this.currentActor());
         }
         if (SceneManager._scene && SceneManager._scene._commandWindow) {
             SceneManager._scene._commandWindow.refresh();
         }
     }

     cursorLeft(wrap) {
         super.cursorLeft(wrap);
         if (SceneManager._scene && SceneManager._scene._statusWindow) {
             SceneManager._scene._statusWindow.setActor(this.currentActor());
         }
         if (SceneManager._scene && SceneManager._scene._commandWindow) {
             SceneManager._scene._commandWindow.refresh();
         }
     }
 }

 window.Window_PartyMembers = Window_PartyMembers;

 //=============================================================================
 // Window_PartyCommand
 //=============================================================================

 class Window_PartyFormationCommand extends Window_Command {
     maxCols() {
         return 4;
     }

     makeCommandList() {
         if (params.changeCommandText) {
             this.addCommand(params.changeCommandText, 'change');
         }
         if (params.removeCommandText) {
             this.addCommand(params.removeCommandText, 'remove', this.canRemove());
         }
         if (params.revertCommandText) {
             this.addCommand(params.revertCommandText, 'revert');
         }
         if (params.finishCommandText) {
             this.addCommand(params.finishCommandText, 'finish');
         }
     }

     canRemove() {
         const scene = SceneManager._scene;
         if (scene && scene._partyWindow) {
             const actor = scene._partyWindow.currentActor();
             return actor && $gameParty.canRemoveActor(actor.actorId());
         }
         return false;
     }
 }

 window.Window_PartyFormationCommand = Window_PartyFormationCommand;

 //=============================================================================
 // Window_MemberList
 //=============================================================================

 class Window_MemberList extends Window_Selectable {
     initialize(rect) {
         super.initialize(rect);
         this._mode = 'change';
         this._partyIndex = 0;
         this.refresh();
     }

     setMode(mode) {
         this._mode = mode;
     }

     setPartyIndex(index) {
         this._partyIndex = index;
     }

     maxItems() {
         return this.members().length;
     }

     members() {
         return $gameParty.availableMembers();
     }

     drawItem(index) {
         const actor = this.members()[index];
         const rect = this.itemLineRect(index);

         if (actor) {
             const spriteX = rect.x + 24;
             const spriteY = rect.y + 64;
             this.drawActorCharacter(actor, spriteX, spriteY);

             this.drawActorName(actor, rect.x + 56, rect.y + 8, rect.width - 56);

             if ($gameParty.isActorLocked(actor.actorId())) {
                 this.drawIcon(params.lockedIcon, rect.x + 2, rect.y + 2);
             } else if ($gameParty.isActorRequired(actor.actorId())) {
                 this.drawIcon(params.requiredIcon, rect.x + 2, rect.y + 2);
             }
         }
     }

     currentActor() {
         return this.members()[this.index()];
     }

     select(index) {
         super.select(index);
         if (SceneManager._scene && SceneManager._scene._statusWindow) {
             SceneManager._scene._statusWindow.setActor(this.currentActor());
         }
     }

     cursorDown(wrap) {
         super.cursorDown(wrap);
         if (SceneManager._scene && SceneManager._scene._statusWindow) {
             SceneManager._scene._statusWindow.setActor(this.currentActor());
         }
     }

     cursorUp(wrap) {
         super.cursorUp(wrap);
         if (SceneManager._scene && SceneManager._scene._statusWindow) {
             SceneManager._scene._statusWindow.setActor(this.currentActor());
         }
     }
 }

 window.Window_MemberList = Window_MemberList;

 //=============================================================================
 // Window_PartyStatus
 //=============================================================================

 class Window_PartyStatus extends Window_StatusBase {
     initialize(rect) {
         super.initialize(rect);
         this._actor = null;
     }

     setActor(actor) {
         if (this._actor !== actor) {
             this._actor = actor;
             this.refresh();
         }
     }

     refresh() {
         this.contents.clear();

         if (!this._actor) {
             return;
         }

         const lineHeight = this.lineHeight();
         const x = 20;
         const x2 = this.innerWidth / 2 + 30;
         let y = 10;

         this.drawActorFace(this._actor, x, y, ImageManager.faceWidth, ImageManager.faceHeight);

         const gaugeX = x + ImageManager.faceWidth + 20;
         const gaugeWidth = (this.innerWidth / 2) - ImageManager.faceWidth - 40;
         let gaugeY = y;
         this.drawActorHp(this._actor, gaugeX, gaugeY, gaugeWidth);
         gaugeY += lineHeight;
         this.drawActorMp(this._actor, gaugeX, gaugeY, gaugeWidth);
         gaugeY += lineHeight;
         this.drawActorTp(this._actor, gaugeX, gaugeY, gaugeWidth);
         gaugeY += lineHeight;

         let leftY = y + ImageManager.faceHeight + 10;
         const leftColWidth = this.innerWidth / 2 - 40;

         // Draw name and class on same line
         const nameWidth = 180;
         this.drawActorName(this._actor, x, leftY, nameWidth);
         this.drawActorClass(this._actor, x + nameWidth + 10, leftY, leftColWidth - nameWidth - 10);
         leftY += lineHeight;

         if (params.showLevel) {
             this.changeTextColor(ColorManager.systemColor());
             this.drawText(TextManager.levelA, x, leftY, 60);
             this.resetTextColor();
             this.drawText(this._actor.level, x + 60, leftY, 60);
             leftY += lineHeight;
         }

         leftY += 5;

         this.changeTextColor(ColorManager.textColor(6));
         this.drawText('Parameters', x, leftY, leftColWidth);
         this.resetTextColor();
         leftY += lineHeight;

         const statParams = [2, 3, 4, 5, 6, 7];
         const paramColWidth = leftColWidth / 2 - 10;
         for (let i = 0; i < statParams.length; i++) {
             const col = i % 2;
             const row = Math.floor(i / 2);
             const paramX = x + (col * (paramColWidth + 20));
             const paramY = leftY + (row * lineHeight);
             this.drawActorParam(this._actor, statParams[i], paramX, paramY, paramColWidth);
         }

         let rightY = y;
         this.changeTextColor(ColorManager.textColor(6));
         this.drawText('Equipment', x2, rightY, leftColWidth);
         this.resetTextColor();
         rightY += lineHeight;

         const equips = this._actor.equips();
         const equipSlots = this._actor.equipSlots();
         for (let i = 0; i < equipSlots.length; i++) {
             const slotName = $dataSystem.equipTypes[equipSlots[i]];
             this.changeTextColor(ColorManager.systemColor());
             this.drawText(slotName, x2, rightY, 100);
             this.resetTextColor();

             if (equips[i]) {
                 this.drawItemName(equips[i], x2 + 100, rightY, leftColWidth - 100);
             } else {
                 this.drawText('-', x2 + 100, rightY, leftColWidth - 100);
             }
             rightY += lineHeight;
         }
     }

     drawActorParam(actor, paramId, x, y, width) {
         this.changeTextColor(ColorManager.systemColor());
         this.drawText(TextManager.param(paramId), x, y, width / 2);
         this.resetTextColor();
         this.drawText(actor.param(paramId), x + width / 2, y, width / 2, 'right');
     }

     drawActorHp(actor, x, y, width) {
         const color1 = ColorManager.hpGaugeColor1();
         const color2 = ColorManager.hpGaugeColor2();
         this.drawGauge(x, y, width, actor.hpRate(), color1, color2);
         this.changeTextColor(ColorManager.systemColor());
         this.drawText(TextManager.hpA, x, y, 44);
         this.drawCurrentAndMax(actor.hp, actor.mhp, x, y, width,
                                ColorManager.hpColor(actor), ColorManager.normalColor());
     }

     drawActorMp(actor, x, y, width) {
         const color1 = ColorManager.mpGaugeColor1();
         const color2 = ColorManager.mpGaugeColor2();
         this.drawGauge(x, y, width, actor.mpRate(), color1, color2);
         this.changeTextColor(ColorManager.systemColor());
         this.drawText(TextManager.mpA, x, y, 44);
         this.drawCurrentAndMax(actor.mp, actor.mmp, x, y, width,
                                ColorManager.mpColor(actor), ColorManager.normalColor());
     }

     drawActorTp(actor, x, y, width) {
         const color1 = ColorManager.tpGaugeColor1();
         const color2 = ColorManager.tpGaugeColor2();
         this.drawGauge(x, y, width, actor.tpRate(), color1, color2);
         this.changeTextColor(ColorManager.systemColor());
         this.drawText(TextManager.tpA, x, y, 44);
         this.resetTextColor();
         this.drawText(actor.tp, x + width - 64, y, 64, 'right');
     }

     drawCurrentAndMax(current, max, x, y, width, color1, color2) {
         const labelWidth = 44;
         const valueWidth = width - labelWidth;
         const x2 = x + valueWidth - 60;
         const x3 = x2 + 30;
         this.changeTextColor(color1);
         this.drawText(current, x2 - 30, y, 60, 'right');
         this.changeTextColor(color2);
         this.drawText('/', x2 + 30, y, 30, 'center');
         this.drawText(max, x3 + 30, y, 60, 'right');
     }

     drawGauge(x, y, width, rate, color1, color2) {
         const fillW = Math.floor((width - 2) * rate);
         const gaugeY = y + this.lineHeight() - 8;
         this.contents.fillRect(x, gaugeY, width, 6, ColorManager.gaugeBackColor());
         this.contents.gradientFillRect(x + 1, gaugeY + 1, fillW, 4, color1, color2);
     }
 }

 window.Window_PartyStatus = Window_PartyStatus;

})();
