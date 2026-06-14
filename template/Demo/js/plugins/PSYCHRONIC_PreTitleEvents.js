/*:
 * @target MZ
 * @plugindesc Pre-Title Events: Shows a specific map before the title screen, optionally starting with a black overlay.
 *
 * @author Psychronic
 * @url https://psychronic.itch.io
 * 
 * @param preTitleMapID
 * @text Pre-Title Map ID
 * @type number
 * @desc Which map to show for pre-title processing
 * @default 1
 *
 * @param useAsTitleFlag
 * @text Use As Title
 * @type boolean
 * @desc Replaces the title screen with this map. If true, this map is shown instead of the title screen by default.
 * @default false
 *
 * @param preTitlePlayerX
 * @text Pre-Title Player X
 * @type number
 * @desc The player's starting X coordinate on the pre-title map.
 * @default 25
 *
 * @param preTitlePlayerY
 * @text Pre-Title Player Y
 * @type number
 * @desc The player's starting Y coordinate on the pre-title map.
 * @default 31
 *
 * @param startFadedOut
 * @text Start Faded Out
 * @type boolean
 * @desc If true, start with a black overlay covering the screen. If false, start fully visible (no overlay).
 * @default false
 *
 * @command RemoveOverlay
 * @text Remove Overlay
 * @desc Removes the black overlay, revealing the map underneath.
 *
 */

var Imported = Imported || {};
var PSYCHRONIC = PSYCHRONIC || {};
Imported.PreTitleEvents = 1;
PSYCHRONIC.PreTitleEvents = PSYCHRONIC.PreTitleEvents || {};

(() => {
  const pluginName = "PSYCHRONIC_PreTitleEvents";
  const parameters = PluginManager.parameters(pluginName);
  
  const mapID = Number(parameters['preTitleMapID']) || 1;
  const useAsTitle = (parameters['useAsTitleFlag'] === "true");
  const playerX = Number(parameters['preTitlePlayerX']) || 25;
  const playerY = Number(parameters['preTitlePlayerY']) || 31;
  const startFadedOut = (parameters['startFadedOut'] === "true");

  let shownOnce = false;

  // Plugin command to remove the overlay
  PluginManager.registerCommand(pluginName, "RemoveOverlay", () => {
    if (SceneManager._scene && SceneManager._scene.removePreTitleOverlay) {
      SceneManager._scene.removePreTitleOverlay();
    }
  });

  class Scene_PretitleMap extends Scene_Map {
    constructor() {
      super();
      this.initialize();
    }

    initialize() {
      super.initialize();
      DataManager.setupNewGame();
      $gamePlayer.reserveTransfer(mapID, playerX, playerY);
    }

    create() {
      super.create();
      this.createPreTitleOverlay();
    }

    createPreTitleOverlay() {
      // Only create the overlay if startFadedOut is true.
      if (startFadedOut) {
        this._preTitleOverlay = new Sprite();
        this._preTitleOverlay.bitmap = new Bitmap(Graphics.width, Graphics.height);
        this._preTitleOverlay.bitmap.fillAll('black');
        this._preTitleOverlay.opacity = 255;
        this.addChild(this._preTitleOverlay);
      }
    }

    removePreTitleOverlay() {
      if (this._preTitleOverlay) {
        this.removeChild(this._preTitleOverlay);
        this._preTitleOverlay = null;
      }
    }
  }

  const _SceneManager_goto = SceneManager.goto;
  SceneManager.goto = function(sceneClass) {
    // If going to title and we haven't shown this scene yet (or useAsTitle is true), show the pre-title map scene
    if (sceneClass === Scene_Title && (useAsTitle || !shownOnce)) {
      this._nextScene = new Scene_PretitleMap();
      shownOnce = true;
    } else {
      _SceneManager_goto.call(this, sceneClass);
    }
  };
})();
