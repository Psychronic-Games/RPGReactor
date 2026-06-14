//-----------------------------------------------------------------------------
//  Galv's Character Frames MZ
//-----------------------------------------------------------------------------
//  For: RPGMAKER MZ
//  GALV_CharacterFramesMZ.js
//-----------------------------------------------------------------------------
//  2020-08-31 - Version 1.0 - release
//-----------------------------------------------------------------------------
//  Terms can be found at:
//  galvs-scripts.com
//-----------------------------------------------------------------------------

var Imported = Imported || {};
Imported.Galv_CharacterFrames = true;

var Galv = Galv || {};        // Galv's main object
Galv.CF = Galv.CF || {};      // This plugin object
Galv.CF.pluginName = "GALV_CharacterFramesMZ";

//-----------------------------------------------------------------------------
/*:
 * @plugindesc Enables map character sheets to have more frames per character.
 * @url http://galvs-scripts.com
 * @target MZ
 * @author Galv
 *
 * @param fSpeedMod
 * @text Frame Speed Modifier
 * @default f * 0.8
 * @desc Equation SUBRTRACTED from frame speed (when not 3 frames). See help for more info on this.
 *
 * @param fileSymbol
 * @text Filename Symbol
 * @default %
 * @desc The symbol to use in filenames. Example%(6).png. Or if you change to @... Example@(6).png.
 *
 * @help
 *   Galv's Character Frames
 * ----------------------------------------------------------------------------
 * This plugin allows you to make charsets with more than 3 frames per
 * character. It overwrites a few default functions so it may not be compatible
 * with other plugins that change charset motions.
 *
 * To make a charset use more than 3 frames per character, in the filename you
 * need to include %(x) where x is the number of frames per character in it.
 *
 * For example, a characterset with 8 frames per character could be named like:
 * MainHero%(8).png
 *
 * (NOTE: The % symbol can be changed in the plugin settings)
 *
 * If you are also using my 'Diagonal Movement' plugin, put this ABOVE it.
 *
 *
 * Frame Speed Modifier
 * ----------------------------------------------------------------------------
 * This is an equation for you to use to change the speed that the frames play
 * at when you are not using the normal amount of frames (3).
 *
 * The normal equation in RPG Maker default code is:
 * (9 - this.realMoveSpeed()) * 3;
 *
 * The equation in the settings of this plugin allow you to create another
 * equation that is SUBRACTED from the above result. In this equation you can
 * use the variable 'f' for amount of frames the charactersheet uses.
 *
 * Example:
 * f * 0.8        number of frames multipled by 0.5
 * f / 2          number of frames divided by 2
 * f * 0.5 - 1    number of frames multipled by 0.5, minus 1
 *
 */


//-----------------------------------------------------------------------------
//  CODE STUFFS
//-----------------------------------------------------------------------------

Galv.CF.y = PluginManager.parameters(Galv.CF.pluginName)["fSpeedMod"];
Galv.CF.regex = RegExp('\\' + PluginManager.parameters(Galv.CF.pluginName)["fileSymbol"] + '\\((.*)\\)','i');


// GAME_CHARACTERBASE
//-----------------------------------------------------------------------------

Galv.CF.Game_CharacterBase_initMembers = Game_CharacterBase.prototype.initMembers;
Game_CharacterBase.prototype.initMembers = function() {
	this._cframes = 3;
	this._spattern = 1;
	this._patSpd = 0;
	Galv.CF.Game_CharacterBase_initMembers.call(this);
};

// OVERWRITE
Game_CharacterBase.prototype.pattern = function() {
	return this._pattern < this._cframes ? this._pattern : this._spattern;
};

// OVERWRITE
Game_CharacterBase.prototype.updatePattern = function() {
	if (!this.hasStepAnime() && this._stopCount > 0) {
		this.resetPattern();
	} else {
		this._pattern = (this._pattern + 1) % (this._cframes + this._spattern);
	}
};

Galv.CF.Galv_Game_CharacterBase_animationWait = Game_CharacterBase.prototype.animationWait;
Game_CharacterBase.prototype.animationWait = function() {
	return Galv.CF.Galv_Game_CharacterBase_animationWait.call(this) - this._patSpd;
};


// WINDOW_BASE
//-----------------------------------------------------------------------------

Galv.CF.Galv_Window_Base_drawCharacter = Window_Base.prototype.drawCharacter;
Window_Base.prototype.drawCharacter = function(characterName, characterIndex, x, y) {
	const setFrame = characterName.match(Galv.CF.regex);
	if (setFrame) {
		this._cframes = Number(setFrame[1]);
		const f = this._cframes;
		const bitmap = ImageManager.loadCharacter(characterName);
		const big = ImageManager.isBigCharacter(characterName);
		const pw = bitmap.width / (big ? f : f * 4);
		const ph = bitmap.height / (big ? 4 : 8);
		const n = characterIndex;
		const sx = (n % 4 * 3 + 1) * pw;
		const sy = (Math.floor(n / 4) * 4) * ph;
		this.contents.blt(bitmap, sx, sy, pw, ph, x - pw / 2, y - ph);
	} else {
		Galv.CF.Galv_Window_Base_drawCharacter.call(this,characterName,characterIndex,x,y);
	};
};


// SPRITE_CHARACTER
//-----------------------------------------------------------------------------

Galv.CF.Galv_Sprite_Character_setCharacterBitmap = Sprite_Character.prototype.setCharacterBitmap;
Sprite_Character.prototype.setCharacterBitmap = function() {
	const setFrame = this._characterName.match(Galv.CF.regex);
	if (setFrame) {
		this._cframes = Number(setFrame[1]);
		this._character._spattern = 0;
		const f = this._cframes;
		this._character._patSpd = eval(Galv.CF.y);
	} else {
		this._cframes = 3;
		this._character._spattern = 1;
		this._character._patSpd = 0;
	};
	this._character._cframes = this._cframes;
	Galv.CF.Galv_Sprite_Character_setCharacterBitmap.call(this);
};

// OVERWRITE
Sprite_Character.prototype.characterBlockX = function() {
	if (this._isBigCharacter) {
		return 0;
	} else {
		const index = this._character.characterIndex();
		return index % 4 * this._cframes;
	}
};

// OVERWRITE
Sprite_Character.prototype.patternWidth = function() {
	if (this._tileId > 0) {
		return $gameMap.tileWidth();
	} else if (this._isBigCharacter) {
		return this.bitmap.width / this._cframes;
	} else {
		return this.bitmap.width / (this._cframes * 4);
	}
};
