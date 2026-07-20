//=============================================================================
// PSYCHRONIC_SpeechBubbleMZ.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc [v1.0.8] Speech Bubble System
 * @author Psychronic
 * @url
 * @help PSYCHRONIC_SpeechBubbleMZ.js
 *
 * @param maxWidth
 * @text Max Width
 * @desc Maximum width of the speech bubble in pixels.
 * @type number
 * @default 250
 * @min 100
 * @max 800
 *
 * @param bubbleStyle
 * @text Bubble Style
 * @desc Name of the image file from /img/system to use for the speech bubble background.
 * @type file
 * @dir img/system
 * @default Window
 *
 * @param tailStyle
 * @text Tail Style
 * @desc Name of the image file from /img/system to use for the speech bubble tail.
 * @type file
 * @dir img/system
 * @default WindowArrow
 *
 * @param normalStyle
 * @text Normal Style
 * @desc Name of the image file from /img/system to use for normal message windows.
 * @type file
 * @dir img/system
 * @default Window
 *
 * @param fadeSpeed
 * @text Fade Speed
 * @desc Speed of fade in/out animation (higher = faster).
 * @type number
 * @default 8
 * @min 1
 * @max 32
 *
 * @param offsetY
 * @text Y Offset
 * @desc Additional Y offset for bubble positioning (negative = higher).
 * @type number
 * @default 0
 * @min -100
 * @max 100
 *
 * @param inputIndicatorImage
 * @text Input Indicator Image
 * @desc Image file from /img/system for input indicator (leave blank to use text).
 * @type file
 * @dir img/system
 * @default
 *
 * @param inputIndicatorText
 * @text Input Indicator Text
 * @desc Text to show as input indicator (used if no image specified).
 * @type string
 * @default ▼
 *
 * @param inputIndicatorSpeed
 * @text Input Indicator Blink Speed
 * @desc How fast the indicator blinks (higher = slower, lower = faster).
 * @type number
 * @default 30
 * @min 10
 * @max 120
 *
 * @command showSpeechBubble
 * @text Show Speech Bubble
 * @desc Display a speech bubble above a character or event.
 *
 * @arg eventId
 * @text Event/Character ID
 * @desc ID of the event (0 for player, -1 for this event).
 * @type number
 * @default 0
 * @min -1
 *
 * @arg message
 * @text Message
 * @desc Text to display in the speech bubble.
 * @type multiline_string
 * @default Hello!
 *
 * @arg duration
 * @text Duration (frames)
 * @desc How long to display the bubble (0 = wait for input).
 * @type number
 * @default 0
 * @min 0
 *
 * @help PSYCHRONIC_SpeechBubbleMZ.js
 * ============================================================================
 * Speech Bubble System v1.0.8
 * ============================================================================
 *
 * This plugin creates speech bubbles above characters and events with
 * customizable styles and positioning.
 *
 * Features:
 * - Customizable bubble and tail graphics
 * - Automatic text wrapping and sizing
 * - Accordion-style collapse animation
 * - Customizable input indicator (image or text)
 * - Adjustable blink speed for input indicator
 * - Auto-dismiss or wait for input
 * - Proper character tracking for events
 * - Battle scene compatibility
 * - Event interpreter pausing (waits for input when duration = 0)
 *
 * Plugin Commands:
 * - Use "Show Speech Bubble" to display a bubble
 * - Event ID: 0 = player, -1 = current event, or specific event ID
 * - Duration: 0 = wait for input (pauses event), >0 = auto-dismiss after frames
 *
 * Input Indicator Options:
 * - Leave "Input Indicator Image" blank to use text
 * - Set "Input Indicator Text" for custom text (default: ▼)
 * - Adjust "Input Indicator Blink Speed" (higher = slower)
 *
 * Script Calls:
 * $speechBubble.show(eventId, message, duration);
 * $speechBubble.hide();
 * $speechBubble.isActive();
 *
 * ============================================================================
 */

(() => {
    'use strict';

    const PLUGIN_NAME = 'PSYCHRONIC_SpeechBubbleMZ';
    const parameters = PluginManager.parameters(PLUGIN_NAME);

    const config = {
        maxWidth: Number(parameters.maxWidth) || 250,
 bubbleStyle: (parameters.bubbleStyle || 'Window').replace(/\.png$/i, ''),
 tailStyle: (parameters.tailStyle || 'WindowArrow').replace(/\.png$/i, ''),
 normalStyle: (parameters.normalStyle || 'Window').replace(/\.png$/i, ''),
 fadeSpeed: Number(parameters.fadeSpeed) || 8,
 offsetY: Number(parameters.offsetY) || 0,
 inputIndicatorImage: (parameters.inputIndicatorImage || '').replace(/\.png$/i, ''),
 inputIndicatorText: parameters.inputIndicatorText || '▼',
 inputIndicatorSpeed: Number(parameters.inputIndicatorSpeed) || 30
    };

    // Global speech bubble manager
    window.$speechBubble = {
        show: function(eventId, message, duration = 0) {
            try {
                if (!SceneManager._scene || !(SceneManager._scene instanceof Scene_Map)) {
                    return;
                }

                if (!SceneManager._scene._speechBubbleWindow) {
                    SceneManager._scene.createSpeechBubbleWindow();
                }

                if (SceneManager._scene._speechBubbleWindow && SceneManager._scene._speechBubbleWindow.showBubble) {
                    SceneManager._scene._speechBubbleWindow.showBubble(eventId, message, duration);

                    if (duration === 0 && $gameMap && $gameMap._interpreter) {
                        $gameMap._interpreter.setWaitMode('speechBubble');
                    }
                }
            } catch (e) {
                // Silent fail
            }
        },
        hide: function() {
            try {
                if (SceneManager._scene && SceneManager._scene._speechBubbleWindow && SceneManager._scene._speechBubbleWindow.hideBubble) {
                    SceneManager._scene._speechBubbleWindow.hideBubble();

                    if ($gameMap && $gameMap._interpreter && $gameMap._interpreter._waitMode === 'speechBubble') {
                        $gameMap._interpreter.setWaitMode('');
                    }
                }
            } catch (e) {
                // Silent fail
            }
        },
        isActive: function() {
            try {
                if (SceneManager._scene && SceneManager._scene._speechBubbleWindow && SceneManager._scene._speechBubbleWindow.isActive) {
                    return SceneManager._scene._speechBubbleWindow.isActive();
                }
                return false;
            } catch (e) {
                return false;
            }
        }
    };

    // Register plugin command
    PluginManager.registerCommand(PLUGIN_NAME, "showSpeechBubble", args => {
        try {
            let eventId = parseInt(args.eventId) || 0;
            const message = String(args.message || 'Hello!');
            const duration = parseInt(args.duration) || 0;

            window.$speechBubble.show(eventId, message, duration);
        } catch (e) {
            // Silent fail
        }
    });

    //-----------------------------------------------------------------------------
    // Window_SpeechBubble
    //-----------------------------------------------------------------------------

    class Window_SpeechBubble extends Window_Base {
        initialize() {
            const rect = new Rectangle(0, 0, 240, 80);
            super.initialize(rect);
            this._eventId = 0;
            this._message = '';
            this._duration = 0;
            this._durationCount = 0;
            this._tailSprite = null;
            this._inputIndicator = null;
            this._active = false;
            this.opacity = 0;
            this.contentsOpacity = 0;
            this.visible = false;
            this._fadeDirection = 0;
            this._inputBlinkCount = 0;
            this._originalWidth = 0;
            this._originalX = 0;
            this._collapseSpeed = 0;
        }

        loadWindowskin() {
            try {
                this.windowskin = ImageManager.loadSystem(config.bubbleStyle);
            } catch (e) {
                this.windowskin = ImageManager.loadSystem('Window');
            }
        }

        showBubble(eventId, message, duration = 0) {
            try {
                if (!$gameMap) return;

                if (this._active) {
                    this.hideBubble();
                }

                if (eventId === -1 && $gameMap._interpreter) {
                    eventId = $gameMap._interpreter.eventId();
                }

                this._eventId = eventId;
                this._message = String(message || '');
                this._duration = duration;
                this._durationCount = 0;
                this._active = true;
                this._inputBlinkCount = 0;
                this._fadeDirection = 0;

                this.loadWindowskin();
                this.setupBubble();
                this.visible = true;
                this.startFadeIn();
            } catch (e) {
                this._active = false;
                this.visible = false;
            }
        }

        hideBubble() {
            if (this._active) {
                this._active = false;
                this.startCollapse();

                if ($gameMap && $gameMap._interpreter && $gameMap._interpreter._waitMode === 'speechBubble') {
                    $gameMap._interpreter.setWaitMode('');
                }
            }
        }

        setupBubble() {
            try {
                const lines = this._message.split('\n');
                let maxLineWidth = 0;
                const lineHeight = this.lineHeight();

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const textWidth = this.textWidth(line);
                    if (textWidth > maxLineWidth) {
                        maxLineWidth = textWidth;
                    }
                }

                const minWidth = 60;
                const actualTextWidth = Math.max(minWidth, maxLineWidth);

                this.width = Math.min(config.maxWidth, actualTextWidth + this.padding * 2);
                this.height = this.fittingHeight(lines.length);

                this._originalWidth = this.width;
                this.positionBubble();
                this._originalX = this.x;

                this.createContents();

                let y = 0;
                for (let i = 0; i < lines.length; i++) {
                    this.drawText(lines[i], 0, y, this.contentsWidth(), 'left');
                    y += lineHeight;
                }

                this.setupTail();

                if (this._duration === 0) {
                    this.setupInputIndicator();
                }
            } catch (e) {
                throw e;
            }
        }

        positionBubble() {
            try {
                const character = this.getCharacterByEventId(this._eventId);
                if (character) {
                    this.x = character.screenX() - this.width / 2;
                    this.y = character.screenY() - this.characterHeight(character) - this.height + config.offsetY;

                    this.x = Math.max(0, Math.min(Graphics.width - this.width, this.x));
                    this.y = Math.max(0, Math.min(Graphics.height - this.height, this.y));
                } else {
                    this.x = Graphics.width / 2 - this.width / 2;
                    this.y = Graphics.height / 2 - this.height / 2;
                }
            } catch (e) {
                this.x = 100;
                this.y = 100;
            }
        }

        setupTail() {
            try {
                if (this._tailSprite && this._tailSprite.parent) {
                    this.removeChild(this._tailSprite);
                }

                const tailBitmap = ImageManager.loadSystem(config.tailStyle);
                this._tailSprite = new Sprite(tailBitmap);
                this._tailSprite.anchor.x = 0.5;
                this._tailSprite.anchor.y = 0;
                this._tailSprite.x = this.width / 2;
                this._tailSprite.y = this.height - 2;
                this.addChild(this._tailSprite);
            } catch (e) {
                // Continue without tail if it fails
            }
        }

        setupInputIndicator() {
            try {
                if (this._inputIndicator && this._inputIndicator.parent) {
                    this.removeChild(this._inputIndicator);
                }

                this._inputIndicator = new Sprite();

                if (config.inputIndicatorImage && config.inputIndicatorImage !== '') {
                    this._inputIndicator.bitmap = ImageManager.loadSystem(config.inputIndicatorImage);
                    this._inputIndicator.anchor.x = 0.5;
                    this._inputIndicator.anchor.y = 0.5;
                } else {
                    const bitmap = new Bitmap(24, 24);
                    bitmap.fontSize = 16;
                    bitmap.textColor = '#ffffff';
                    bitmap.outlineColor = '#000000';
                    bitmap.outlineWidth = 3;
                    bitmap.drawText(config.inputIndicatorText, 0, 0, 24, 24, 'center');
                    this._inputIndicator.bitmap = bitmap;
                    this._inputIndicator.anchor.x = 0.5;
                    this._inputIndicator.anchor.y = 0.5;
                }

                this._inputIndicator.x = this.width / 2;
                this._inputIndicator.y = this.height - 16;
                this._inputIndicator.visible = false;
                this.addChild(this._inputIndicator);
            } catch (e) {
                // Continue without indicator if it fails
            }
        }

        getCharacterByEventId(eventId) {
            try {
                if (!$gameMap) return null;

                if (eventId === 0) {
                    return $gamePlayer || null;
                } else if (eventId > 0) {
                    return $gameMap.event(eventId) || null;
                }
                return null;
            } catch (e) {
                return null;
            }
        }

        characterHeight(character) {
            if (!character) return 48;
            try {
                if (character._characterName) {
                    return 48;
                }
                return 48;
            } catch (e) {
                return 48;
            }
        }

        startFadeIn() {
            this._fadeDirection = 1;
        }

        startCollapse() {
            this._fadeDirection = -1;
            this._collapseSpeed = Math.max(4, this._originalWidth / 15);

            if (this._tailSprite) {
                if (this._tailSprite.parent) {
                    this.removeChild(this._tailSprite);
                }
                this._tailSprite = null;
            }
            if (this._inputIndicator) {
                if (this._inputIndicator.parent) {
                    this.removeChild(this._inputIndicator);
                }
                this._inputIndicator = null;
            }
        }

        updatePosition() {
            if (this._active && this._fadeDirection !== -1 && this.visible) {
                const character = this.getCharacterByEventId(this._eventId);
                if (character) {
                    const newX = character.screenX() - this.width / 2;
                    const newY = character.screenY() - this.characterHeight(character) - this.height + config.offsetY;

                    this.x = Math.max(0, Math.min(Graphics.width - this.width, newX));
                    this.y = Math.max(0, Math.min(Graphics.height - this.height, newY));

                    if (this._fadeDirection === 0) {
                        this._originalX = this.x;
                    }
                }
            }
        }

        update() {
            super.update();
            this.updatePosition();
            this.updateFade();
            this.updateDuration();
            this.updateInput();
            this.updateInputIndicator();
        }

        updateFade() {
            if (this._fadeDirection === 1) {
                this.opacity += config.fadeSpeed;
                this.contentsOpacity += config.fadeSpeed;
                if (this.opacity >= 255) {
                    this.opacity = 255;
                    this.contentsOpacity = 255;
                    this._fadeDirection = 0;
                }
            } else if (this._fadeDirection === -1) {
                this.width -= this._collapseSpeed;
                this.x = this._originalX + (this._originalWidth - this.width) / 2;

                if (this._tailSprite) {
                    if (this._tailSprite.parent) {
                        this.removeChild(this._tailSprite);
                    }
                    this._tailSprite = null;
                }
                if (this._inputIndicator) {
                    if (this._inputIndicator.parent) {
                        this.removeChild(this._inputIndicator);
                    }
                    this._inputIndicator = null;
                }

                if (this.width <= 20) {
                    this.opacity -= config.fadeSpeed * 2;
                    this.contentsOpacity -= config.fadeSpeed * 2;

                    if (this.opacity <= 0) {
                        this.opacity = 0;
                        this.contentsOpacity = 0;
                        this.visible = false;
                        this._fadeDirection = 0;

                        if (this._tailSprite && this._tailSprite.parent) {
                            this.removeChild(this._tailSprite);
                            this._tailSprite = null;
                        }
                        if (this._inputIndicator && this._inputIndicator.parent) {
                            this.removeChild(this._inputIndicator);
                            this._inputIndicator = null;
                        }

                        this.width = this._originalWidth;
                        this.x = this._originalX;
                    }
                }
            }
        }

        updateInputIndicator() {
            if (this._inputIndicator && this._duration === 0 && this.opacity >= 255 && this._fadeDirection === 0) {
                this._inputBlinkCount++;
                const blinkCycle = config.inputIndicatorSpeed * 2;
                if (this._inputBlinkCount >= blinkCycle) {
                    this._inputBlinkCount = 0;
                }
                const shouldShow = this._inputBlinkCount < config.inputIndicatorSpeed;
                this._inputIndicator.visible = shouldShow;
            } else if (this._inputIndicator) {
                this._inputIndicator.visible = false;
            }
        }

        updateDuration() {
            if (this._active && this._duration > 0) {
                this._durationCount++;
                if (this._durationCount >= this._duration) {
                    this.hideBubble();
                }
            }
        }

        updateInput() {
            if (this._active && this._duration === 0 && this.opacity >= 255 && this._fadeDirection === 0) {
                if (Input.isTriggered('ok') || Input.isTriggered('cancel') || TouchInput.isTriggered()) {
                    this.hideBubble();
                }
            }
        }

        isActive() {
            return this._active && this.visible;
        }
    }

    //-----------------------------------------------------------------------------
    // Scene_Map integration
    //-----------------------------------------------------------------------------

    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _Scene_Map_createAllWindows.call(this);
        this.createSpeechBubbleWindow();
    };

    Scene_Map.prototype.createSpeechBubbleWindow = function() {
        try {
            if (this._speechBubbleWindow) {
                if (this._speechBubbleWindow.parent) {
                    this.removeWindow(this._speechBubbleWindow);
                }
                this._speechBubbleWindow = null;
            }

            this._speechBubbleWindow = new Window_SpeechBubble();
            this.addWindow(this._speechBubbleWindow);
        } catch (e) {
            this._speechBubbleWindow = null;
        }
    };

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);

        if (!this._speechBubbleWindow) {
            this.createSpeechBubbleWindow();
        }
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        if (this._speechBubbleWindow && this._speechBubbleWindow.isActive && this._speechBubbleWindow.isActive()) {
            this._speechBubbleWindow.hideBubble();
        }

        _Scene_Map_terminate.call(this);
    };

    //-----------------------------------------------------------------------------
    // Game_Interpreter compatibility for old-style plugin commands
    //-----------------------------------------------------------------------------

    const _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.apply(this, arguments);
        if (command === 'SpeechBubble') {
            try {
                const eventId = parseInt(args[0]) || 0;
                const message = args.slice(1).join(" ");
                $speechBubble.show(eventId, message, 0);
                this.setWaitMode('speechBubble');
            } catch (e) {
                // Silent fail
            }
        }
    };

    const _Game_Interpreter_updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode === 'speechBubble') {
            const waiting = window.$speechBubble && window.$speechBubble.isActive();
            if (!waiting) {
                this._waitMode = '';
            }
            return waiting;
        }
        return _Game_Interpreter_updateWaitMode.call(this);
    };
})();
