//=============================================================================
// MOG_TreasurePopup.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc (v1.1) Displays the icon and name of the treasure obtained.
 * @author Moghunter
 * @url https://mogplugins.wordpress.com
 *
 * @param Duration
 * @desc Treasure display duration.
 * @default 15 
 *
 * @param Fade Speed
 * @desc Fade speed.
 * @default 5
 * 
 * @param X - Axis
 * @desc X-Axis position.
 * @default 0
 *
 * @param Y - Axis
 * @desc Y-Axis position.
 * @default -32
 *
 * @param Random Movement
 * @desc Random movement.
 * @default false
 *
 * @param X Speed
 * @desc X-Axis movement speed.
 * @default 0
 *
 * @param Y Speed
 * @desc Y-Axis movement speed.
 * @default 1
 *
 * @param Font Size
 * @desc Font size definition.
 * @default 16 
 *
 * @param Icon Scale
 * @desc Icon zoom from 0.10 to 3.00.
 * @default 0.60
 *
 * @param Treasure Space Y-Axis
 * @desc Space between treasures.
 * @default 20
 *
 * @param Zoom Effect
 * @desc Enable zoom effect.
 * @default false
 *
 * @param Gold Popup
 * @desc Display gold.
 * @default true
 * 
 * @param Gold Icon Index
 * @desc Gold icon index in the icon image.
 * @default 163
 *
 * @command TreasurePopVisible
 * @desc Enable or disable the plugin.
 * @text Enable / Disable
 *
 * @arg enable
 * @desc Enable or disable.
 * @text Active
 * @default true
 * @type boolean
 *
 * @help  
 * =============================================================================
 * +++ MOG - Treasure Popup (v1.1) +++
 * By Moghunter 
 * https://mogplugins.wordpress.com
 * =============================================================================
 * Displays the icon and name of the treasure obtained.
 * 
 * =============================================================================
 * * HISTORY
 * =============================================================================
 * (v1.1) Fix in the sort function related to encoding.       
 *     
 */


//=============================================================================
// ■■■ PLUGIN PARAMETERS ■■■
//=============================================================================
　　var Imported = Imported || {};
　　Imported.MOG_TreasurePopup = true;
　　var Moghunter = Moghunter || {}; 

  　Moghunter.parameters = PluginManager.parameters('MOG_TreasurePopup');
    Moghunter.trpopup_X = Number(Moghunter.parameters['X - Axis'] || 0);
	Moghunter.trpopup_Y = Number(Moghunter.parameters['Y - Axis'] || 0);
	Moghunter.trpopup_GoldVisible = String(Moghunter.parameters['Gold Popup'] || "true");
	Moghunter.trpopup_Random = String(Moghunter.parameters['Random Movement'] || "false");
    Moghunter.trpopup_SX = Number(Moghunter.parameters['X Speed'] || 0);
	Moghunter.trpopup_SY = Number(Moghunter.parameters['Y Speed'] || 1);
	Moghunter.trpopup_IconScale = Number(Moghunter.parameters['Icon Scale'] || 0.60);
	Moghunter.trpopup_ItemSpace = Number(Moghunter.parameters['Treasure Space Y-Axis'] || 20);
	Moghunter.trpopup_waitD = Number(Moghunter.parameters['Duration'] || 15);
	Moghunter.trpopup_Zoom = String(Moghunter.parameters['Zoom Effect'] || "false");
	Moghunter.trpopup_fadeSpeed = Number(Moghunter.parameters['Fade Speed'] || 5);
    Moghunter.trpopup_goldIconIndex = Number(Moghunter.parameters['Gold Icon Index'] || 163);
    Moghunter.trpopup_fontSize = Number(Moghunter.parameters['Font Size'] || 16);	
	
//=============================================================================
// ■■■  PluginManager ■■■ 
//=============================================================================	
PluginManager.registerCommand('MOG_TreasurePopup', "TreasurePopVisible", data => {
    var enable = String(data.enable) == "true" ? true : false;
	$gameSystem._trspupVisible = enable;
});	

//=============================================================================
// ■■■ Game System ■■■
//=============================================================================

//==============================
// ♦ ALIAS ♦  Initialize
//==============================
var _mog_treapopup_Gsys_initialize = Game_System.prototype.initialize;
Game_System.prototype.initialize = function() {
    _mog_treapopup_Gsys_initialize.call(this);
	this._trspupData = [];
	this._trspupSprData = null;
	this._trspupVisible = true;
	this._trspupMapID = 0;
};	

//=============================================================================
// ■■■ Game Interpreter ■■■
//=============================================================================

//==============================
// ♦ ALIAS ♦  Command 125
//==============================
var _mog_treaPopUP_gint_command125 = Game_Interpreter.prototype.command125;
Game_Interpreter.prototype.command125 = function(params) {
	_mog_treaPopUP_gint_command125.call(this,params);
	if ((Moghunter.trpopup_GoldVisible) === "true") { 
         this.checkTreasurePopup(3,params);
	};
	return true;	
};

//==============================
// ♦ ALIAS ♦  Command 126
//==============================
var _mog_treaPopUP_gint_command126 = Game_Interpreter.prototype.command126;
Game_Interpreter.prototype.command126 = function(params) {
    _mog_treaPopUP_gint_command126.call(this,params);
    this.checkTreasurePopup(0,params);
	return true;	
};

//==============================
// ♦ ALIAS ♦  command 127
//==============================
var _mog_treaPopUP_gint_command127 = Game_Interpreter.prototype.command127;
Game_Interpreter.prototype.command127 = function(params) {
	_mog_treaPopUP_gint_command127.call(this,params);
    this.checkTreasurePopup(1,params);
	return true;
};

//==============================
// ♦ ALIAS ♦  command 128
//==============================
var _mog_treaPopUP_gint_command128 = Game_Interpreter.prototype.command128;
Game_Interpreter.prototype.command128 = function(params) {
	_mog_treaPopUP_gint_command128.call(this,params);
    this.checkTreasurePopup(2,params);
	return true;
};

//==============================
// * checkTreasurePopup
//==============================
Game_Interpreter.prototype.checkTreasurePopup = function(type,params) {
	if ($gameSystem._trspupVisible) {
		if (type > 2) {
		   var amount = this.operateValue(params[0], params[1], params[2]);
		} else {
		   var amount = this.operateValue(params[1], params[2], params[3]);
		};
   	    if (amount > 0 && SceneManager._scene.constructor.name === "Scene_Map") {
			for (i = 0; i < $gameMap.events().length; i++){
				var eve = $gameMap.events()[i];
				if (eve && (this._eventId === eve._eventId)) {
					var x = eve.screenX();
					var y = eve.screenY();
					$gameSystem._trspupData.push([this.trPopupType(type,params),amount,x,y]);
				};
			};
	   };
	};
};

//==============================
// * Tr popup Type
//==============================
Game_Interpreter.prototype.trPopupType = function(type,params) {
	if (type === 0) {return $dataItems[params[0]]};
	if (type === 1) {return $dataWeapons[params[0]]};
	if (type === 2) {return $dataArmors[params[0]]};
	return null;
};

//=============================================================================
// ■■■ Scene Map ■■■
//=============================================================================

//==============================
// ♦ ALIAS ♦  Terminate
//==============================
var _mog_treapopup_scMap_terminate = Scene_Map.prototype.terminate;
Scene_Map.prototype.terminate = function() {
    _mog_treapopup_scMap_terminate.call(this);
	if (this._spriteset) {this._spriteset.recordTreasureData()};
};

//=============================================================================
// ■■■ SpriteSet Base ■■■
//=============================================================================

//==============================
// ** create Hud Field
//==============================
Spriteset_Base.prototype.createHudField3 = function() {
	this._hudField3 = new Sprite();
	this._hudField3.z = 100;
	this.addChild(this._hudField3);
};

//==============================
// ** sort MZ
//==============================
Spriteset_Base.prototype.sortMz = function() {
	if (this._hudField1) {
        this._hudField1.children.sort((a, b) => a.z - b.z);
	};	
	if (this._hudField2) {
        this._hudField2.children.sort((a, b) => a.z - b.z);
	};	
	if (this._hudField3) {
        this._hudField3.children.sort((a, b) => a.z - b.z);
	};
};

//==============================
// ♦ ALIAS ♦  create Lower Layer
//==============================
var _mog_trspop_sprtBase_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
Spriteset_Map.prototype.createLowerLayer = function() {
    _mog_trspop_sprtBase_createLowerLayer.call(this);
    this.setTreasureField()
};

//==============================
// * set Treasure Field
//==============================
Spriteset_Map.prototype.setTreasureField = function() {
	if (!this._hudField3) {this.createHudField3()};
	this.createTreasureField();
	if ($gameSystem._trspupSprData && $gameSystem._trspupMapID === $gameMap._mapId) {
		this.loadTreasureIcons()
	} else {
		$gameSystem._trspupData = [];
		$gameSystem._trspupSprData = null;		
	};
	$gameSystem._trspupMapID = $gameMap._mapId;
};

//==============================
// * record Treasure Data
//==============================
Spriteset_Map.prototype.recordTreasureData = function() {
     if (!this._treasureIcons || this._treasureIcons.length === 0) {return};
	 $gameSystem._trspupSprData = [];
	 for (i = 0; i < this._treasureIcons.length; i++){
		 $gameSystem._trspupSprData[i] = {};
		 $gameSystem._trspupSprData[i]._item = this._treasureIcons[i]._item;
		 $gameSystem._trspupSprData[i]._amount = this._treasureIcons[i]._amount;
		 $gameSystem._trspupSprData[i].x = this._treasureIcons[i].x;
		 $gameSystem._trspupSprData[i].y = this._treasureIcons[i].y;
		 $gameSystem._trspupSprData[i].opacity = this._treasureIcons[i].opacity;
		 $gameSystem._trspupSprData[i].scale = this._treasureIcons[i].scale.x;
		 $gameSystem._trspupSprData[i]._sx = this._treasureIcons[i]._sx;
		 $gameSystem._trspupSprData[i]._sy = this._treasureIcons[i]._sy;
		 $gameSystem._trspupSprData[i]._cx = this._treasureIcons[i]._cx;
		 $gameSystem._trspupSprData[i]._cy = this._treasureIcons[i]._cy;
		 $gameSystem._trspupSprData[i]._wait = this._treasureIcons[i]._wait;		 
	 };
};

//==============================
// * create Treasure Field
//==============================
Spriteset_Map.prototype.createTreasureField = function() {
	this._treasureIcons = [];
    this._treasureField = new Sprite();
	this._treasureField.z = 110;
	this._hudField3.addChild(this._treasureField);
	this.sortMz();
};

//==============================
// ♦ ALIAS ♦  update
//==============================
var _mog_treapopup_sprmap_update = Spriteset_Map.prototype.update;
Spriteset_Map.prototype.update = function() {
    _mog_treapopup_sprmap_update.call(this);
	if (this._treasureField) {this.updateTreasureIcons()};
};

//==============================
// * load Treasure Icons
//==============================
Spriteset_Map.prototype.loadTreasureIcons = function() {
	for (i = 0; i < $gameSystem._trspupSprData.length; i++){
         this._treasureIcons.push(new TreasureIcons(null,$gameSystem._trspupSprData[i],i,$gameSystem._trspupSprData.length));
	     this._treasureField.addChild(this._treasureIcons[i]);
	};
	$gameSystem._trspupSprData = null;
};

//==============================
// * refresh Treasure Icons
//==============================
Spriteset_Map.prototype.refreshTreasureIcons = function() {
	for (i = 0; i < $gameSystem._trspupData.length; i++){
        this._treasureIcons.push(new TreasureIcons($gameSystem._trspupData[i],null,i,$gameSystem._trspupData.length));
		this._treasureField.addChild(this._treasureIcons[this._treasureIcons.length - 1])
	};
	$gameSystem._trspupData = [];
};

//==============================
// * need Refresh Treasure Icons
//==============================
Spriteset_Map.prototype.needRefreshTreasureIcons = function() {
	if ($gameSystem._trspupData.length > 0) {return true};
    return false;
};

//==============================
// * create Treasure Icons
//==============================
Spriteset_Map.prototype.updateTreasureIcons = function() {
     if (this.needRefreshTreasureIcons()) {this.refreshTreasureIcons()};
	 for (i = 0; i < this._treasureIcons.length; i++){
		  if (this._treasureIcons[i].opacity === 0 && this._treasureIcons[i]._wait[1] <= 0) {
			  this._treasureField.removeChild(this._treasureField[i]);
			  this._treasureIcons.splice(i, 1);
		  };
	 };
};

//=============================================================================
// ■■■ Treasure Icons ■■■
//=============================================================================
function TreasureIcons() {
    this.initialize.apply(this, arguments);
};

TreasureIcons.prototype = Object.create(Sprite.prototype);
TreasureIcons.prototype.constructor = TreasureIcons;

//==============================
// * Initialize
//==============================
TreasureIcons.prototype.initialize = function(data,dataOld,fx,fmax) {
    Sprite.prototype.initialize.call(this);	
    this._fadeSpeed = Math.min(Math.max(Moghunter.trpopup_fadeSpeed,1),100);
	this._waitR = Math.min(Math.max(Moghunter.trpopup_waitD,1),999);
	this._zoomAn = String(Moghunter.trpopup_Zoom) === "true" ? true : false;
	this._fx = fx;
	this._fmax = fmax * this.waitD();
    this.createName();
	this.createIcon();
    if (dataOld) {
	   this.setupOld(dataOld);
	} else {
	   this.setupNew(data);
    }
	this.refreshIcon();
	this.refreshName();
	this.x = -this.screenX() + this._cx;
	this.y = -this.screenY() + this._cy;	
};

//==============================
// * SetupOld
//==============================
TreasureIcons.prototype.setupOld = function(data) {
	this._item = data._item;
	this._amount = data._amount;
	this.x = data.x;
	this.y = data.y;
	this.scale.x = data.scale;
	this.scale.y = data.scale;
	this.opacity = data.opacity;
	this._sx = data._sx;
	this._sy = data._sy;
	this._cx = data._cx;
	this._cy = data._cy;	
	this._wait = data._wait;
};	

//==============================
// * wait D
//==============================
TreasureIcons.prototype.waitD = function() {
	return this._waitR;
};

//==============================
// * SetupNew
//==============================
TreasureIcons.prototype.setupNew = function(data) {
	this._item = data[0];
	this._amount = data[1];
	var name = this._item ? this._item.name + " x " + this._amount : this._amount;
	var wd = this._measureNameWidthWithCodes(String(name));
	this._cx = data[2] - ((ImageManager.iconWidth + 12 + wd) / 2) + Moghunter.trpopup_X + this.screenX() ;
	this._cy = data[3] - ImageManager.iconHeight + Moghunter.trpopup_Y + this.screenY();
	this._cy -= (this._fx * Moghunter.trpopup_ItemSpace);
	var iw = this._fx * this.waitD();
	var iw2 = this.waitD() + (this._fmax - iw);
	this._wait = [15,iw2];
	this.opacity = 0;
	if (String(Moghunter.trpopup_Random) === "true") {
		var d = Math.randomInt(2);
		var sx = (Math.random() * this.sxi() + this.sxi());
		this._sx = d === 0 ? sx : -sx
		this._sy = -(Math.random() + this.syi());
	} else {
		this._sx = this.sxi()
		this._sy = -this.syi();		
	};
};	

//==============================
// * sxi
//==============================
TreasureIcons.prototype.sxi = function() {
	return Moghunter.trpopup_SX;
};

//==============================
// * syi
//==============================
TreasureIcons.prototype.syi = function() {
	return Moghunter.trpopup_SY;
};

//==============================
// * createIcon
//==============================
TreasureIcons.prototype.createIcon = function() {
	this._iconImg = ImageManager.loadSystem("IconSet");
    this._icon = new Sprite(this._iconImg);
	this._icon.scale.x = Math.min(Math.max(Moghunter.trpopup_IconScale,0.10),3.00);;
	this._icon.scale.y = this._icon.scale.x;
	this._icon.anchor.x = 0.5;
	this._icon.anchor.y = 0.5;
	this._icon.x = ImageManager.iconWidth / 2;
	this._icon.y = ImageManager.iconHeight / 2;
	this.addChild(this._icon);
};

//==============================
// * refresh Icon
//==============================
TreasureIcons.prototype.refreshIcon = function() {
	var w = ImageManager.iconWidth;
	var h = ImageManager.iconHeight;
	var iconindex = this._item ? this._item.iconIndex : Moghunter.trpopup_goldIconIndex;
	var sx = iconindex % 16 * w;
	var sy = Math.floor(iconindex / 16) * h;
    this._icon.setFrame(sx,sy,w,h);	
};

//==============================
// * create Name
//==============================
TreasureIcons.prototype.createName = function() {
	this._name = new Sprite(new Bitmap(150,32));
	this._name.x = ImageManager.iconWidth + 4;
	this._name.bitmap.fontSize = Moghunter.trpopup_fontSize;
	this.addChild(this._name);
};

//==============================
// * refresh Name
//==============================
TreasureIcons.prototype.refreshName = function() {
	this._name.bitmap.clear();
	var name = this._item ? this._item.name + " x " + this._amount : this._amount;
	this._drawNameWithCodes(String(name), 0, 0, 145, 32);
};

//==============================
// * draw Name With Codes
// Inline parser for \i[N] icons and \c[N] color codes. Bitmap.drawText
// doesn't process MZ text codes (Window_Base.drawTextEx does, but using
// a Window here is heavyweight). Original plugin assumed bare drawText
// would render icons -- it never did on a stock MZ runtime; the game
// was originally MV with an external icon-text plugin patching Bitmap.
//==============================
TreasureIcons.prototype._drawNameWithCodes = function(text, x, y, maxWidth, lineHeight) {
	var bitmap = this._name.bitmap;
	var iconBitmap = ImageManager.loadSystem("IconSet");
	var srcIconSize = ImageManager.iconWidth;
	var inlineH = Math.max(bitmap.fontSize, 16);
	var inlineW = inlineH;
	var cursor = x;
	var defaultColor = bitmap.textColor;
	var i = 0;
	while (i < text.length) {
		// \i[N] -> draw icon inline
		if (text.charAt(i) === '\\' && text.charAt(i + 1) === 'i' && text.charAt(i + 2) === '[') {
			var endI = text.indexOf(']', i + 3);
			if (endI > 0) {
				var iconIdx = parseInt(text.substring(i + 3, endI), 10);
				if (!isNaN(iconIdx) && iconBitmap) {
					var sx = (iconIdx % 16) * srcIconSize;
					var sy = Math.floor(iconIdx / 16) * srcIconSize;
					var iy = y + Math.floor((lineHeight - inlineH) / 2);
					bitmap.blt(iconBitmap, sx, sy, srcIconSize, srcIconSize, cursor, iy, inlineW, inlineH);
					cursor += inlineW + 2;
					i = endI + 1;
					continue;
				}
			}
		}
		// \c[N] -> change text color
		if (text.charAt(i) === '\\' && text.charAt(i + 1) === 'c' && text.charAt(i + 2) === '[') {
			var endC = text.indexOf(']', i + 3);
			if (endC > 0) {
				var colorIdx = parseInt(text.substring(i + 3, endC), 10);
				if (!isNaN(colorIdx) && typeof ColorManager !== "undefined") {
					bitmap.textColor = ColorManager.textColor(colorIdx);
					i = endC + 1;
					continue;
				}
			}
		}
		// Find next code start; draw plain text up to it
		var nextCode = text.length;
		for (var j = i; j < text.length - 2; j++) {
			if (text.charAt(j) === '\\' && (text.charAt(j + 1) === 'i' || text.charAt(j + 1) === 'c') && text.charAt(j + 2) === '[') {
				nextCode = j;
				break;
			}
		}
		var plain = text.substring(i, nextCode);
		if (plain) {
			var pw = bitmap.measureTextWidth(plain);
			bitmap.drawText(plain, cursor, y, pw + 4, lineHeight);
			cursor += pw;
		}
		i = nextCode;
		if (nextCode === text.length) break;
	}
	bitmap.textColor = defaultColor;
};

//==============================
// * measure Name Width With Codes
// Like Bitmap.measureTextWidth but accounts for inline icons (~ font size)
// and skips color codes. Used by setupNew to position the popup so the
// rendered text is centered on the source coordinate.
//==============================
TreasureIcons.prototype._measureNameWidthWithCodes = function(text) {
	var bitmap = this._name.bitmap;
	var inlineH = Math.max(bitmap.fontSize, 16);
	var width = 0;
	var i = 0;
	while (i < text.length) {
		if (text.charAt(i) === '\\' && text.charAt(i + 1) === 'i' && text.charAt(i + 2) === '[') {
			var endI = text.indexOf(']', i + 3);
			if (endI > 0 && !isNaN(parseInt(text.substring(i + 3, endI), 10))) {
				width += inlineH + 2;
				i = endI + 1;
				continue;
			}
		}
		if (text.charAt(i) === '\\' && text.charAt(i + 1) === 'c' && text.charAt(i + 2) === '[') {
			var endC = text.indexOf(']', i + 3);
			if (endC > 0 && !isNaN(parseInt(text.substring(i + 3, endC), 10))) {
				i = endC + 1;
				continue;
			}
		}
		var nextCode = text.length;
		for (var j = i; j < text.length - 2; j++) {
			if (text.charAt(j) === '\\' && (text.charAt(j + 1) === 'i' || text.charAt(j + 1) === 'c') && text.charAt(j + 2) === '[') {
				nextCode = j;
				break;
			}
		}
		var plain = text.substring(i, nextCode);
		if (plain) width += bitmap.measureTextWidth(plain);
		i = nextCode;
		if (nextCode === text.length) break;
	}
	return width;
};

//==============================
// * screen Y
//==============================
TreasureIcons.prototype.screenX = function() {
	return $gameMap.displayX() * $gameMap.tileWidth();
};

//==============================
// * screen Y
//==============================
TreasureIcons.prototype.screenY = function() {
	return $gameMap.displayY() * $gameMap.tileHeight();
};

//==============================
// * Update Position
//==============================
TreasureIcons.prototype.updatePosition = function() {
	this.x = -this.screenX() + this._cx;
	this.y = -this.screenY() + this._cy;
};

//==============================
// * Update Movement
//==============================
TreasureIcons.prototype.updateMovement = function() {
	this._cx += this._sx;
	this._cy += this._sy;
};

//==============================
// * Update Other
//==============================
TreasureIcons.prototype.updateOther = function() {
    this.opacity -= this._fadeSpeed; 
	if (this._zoomAn) {
	    this.scale.x += 0.01;
	    this.scale.y = this.scale.x
	};
};

//==============================
// * Update
//==============================
TreasureIcons.prototype.update = function() {
    Sprite.prototype.update.call(this);	 
	if (this._wait[0] > 0) {this._wait[0]--;
		this.opacity += 17; 
		this.updatePosition();
		if (this._wait[1] <= 0) {this.opacity += 255;this._wait[0] = 0};
	    return
	};
	if (this._wait[1] > 0) {
		this._wait[1]--;
		this.updatePosition();
	    return
	};
	this.updateMovement();
    this.updateOther();
	this.updatePosition();
};