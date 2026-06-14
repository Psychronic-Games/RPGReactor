/*:
 * @target MZ
 * @plugindesc Enables video parallax backgrounds for RPG Maker MZ maps.
 * Use the notetag <videoParallax: filename> in map settings or use the plugin commands Play Parallax and Stop Parallax to control the video.
 *
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @command playParallax
 * @text Play Parallax
 * @desc Plays a video parallax background.
 *
 * @arg filename
 * @type file
 * @dir movies
 * @text Filename
 * @desc The name of the video file (without extension) to play as parallax.
 *
 * @command stopParallax
 * @text Stop Parallax
 * @desc Stops the currently playing video parallax background.
 *
 * @help
 * ===========================================================================
 * Introduction
 * ===========================================================================
 * This plugin allows you to use video files as parallax backgrounds in RPG
 * Maker MZ maps. Videos will render behind the tileset layer, providing a dynamic
 * and immersive background.
 *
 * ===========================================================================
 * Notetags
 * ===========================================================================
 * To specify a video parallax for a map, add the following notetag in the map's
 * Note box:
 *
 * <videoParallax: filename>
 *
 * - Replace 'filename' with the name of your video file (without the .mp4 extension).
 * - Example: <videoParallax: Wormhole-01>
 *
 * To render the video upside down, append ', upsideDown' to the notetag:
 *
 * <videoParallax: filename, upsideDown>
 *
 * ===========================================================================
 * Plugin Commands
 * ===========================================================================
 * You can control the video parallax during gameplay using the following plugin
 * commands within event scripts:
 *
 * 1. **Play Parallax**
 *    - **Command:** Play Parallax
 *    - **Arguments:**
 *      - **Filename:** The name of the video file (without the .mp4 extension) to play.
 *    - **Usage Example:**
 *      - Command: Play Parallax
 *      - Filename: Wormhole-01
 *
 * 2. **Stop Parallax**
 *    - **Command:** Stop Parallax
 *    - **Arguments:** None.
 *    - **Usage Example:**
 *      - Command: Stop Parallax
 *
 * ===========================================================================
 * Requirements
 * ===========================================================================
 * - Place your MP4 video files in the 'movies' folder of your project directory.
 * - Ensure that video files are optimized for performance to prevent lag.
 *
 * ===========================================================================
 * Changelog
 * ===========================================================================
 * Version 1.6:
 * - Fixed memory leak by destroying PIXI textures, canceling requestAnimationFrame, and properly removing references to video elements.
 * - Removed excessive logging to declutter the console.
 *
 * Version 1.5:
 * - Fixed layering issue by adding video parallax at correct index.
 * - Resolved crash on window focus change by retaining video source and removing event listeners.
 *
 * Version 1.4:
 * - Fixed crash when transitioning from a map with a video parallax to one without.
 * - Improved the termination of the video update loop.
 *
 * Version 1.3:
 * - Fixed ReferenceError by initializing the Imported object.
 * - Corrected access to the map's note property from this._map.note to $dataMap.note.
 * - Enhanced layering to ensure video parallax renders behind the tileset.
 *
 * Version 1.2:
 * - Corrected layering by adding video parallax before _parallaxSprite.
 * - Ensured video parallax is added to _baseSprite with proper zIndex.
 * - Updated plugin command registration to match plugin name.
 *
 * Version 1.1:
 * - Adjusted video parallax layering to render below the tileset layer.
 * - Enhanced notetag parsing to support upside-down videos.
 *
 * Version 1.0:
 * - Initial release.
 */

(() => {
    // Initialize the Imported object if it doesn't exist
    var Imported = Imported || {};

    // Ensure the plugin is only loaded once
    if (Imported.PSYCHRONIC_VideoParallaxMZ) return;
    Imported.PSYCHRONIC_VideoParallaxMZ = true;

    // -------------------------
    // Plugin Command Registration
    // -------------------------
    PluginManager.registerCommand('PSYCHRONIC_VideoParallaxMZ', 'playParallax', args => {
        const filename = String(args.filename).trim();
        if (filename) {
            $gameMap.playVideoParallax(filename);
        }
    });

    PluginManager.registerCommand('PSYCHRONIC_VideoParallaxMZ', 'stopParallax', () => {
        $gameMap.stopVideoParallax();
    });

    // -------------------------
    // Game_Map Modifications
    // -------------------------
    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _Game_Map_setup.call(this, mapId);
        this.setupVideoParallax();
    };

    Game_Map.prototype.setupVideoParallax = function() {
        this._videoParallaxFilename = null;
        this._videoParallaxUpsideDown = false;

        // Ensure $dataMap is defined
        if (!$dataMap) {
            return;
        }

        const note = $dataMap.note;
        const regex = /<videoParallax:\s*([^,>]+)(?:,\s*upsideDown)?\s*>/i;
        const match = note.match(regex);
        if (match) {
            this._videoParallaxFilename = match[1].trim();
            this._videoParallaxUpsideDown = /,\s*upsideDown/i.test(note);
        }
    };

    Game_Map.prototype.playVideoParallax = function(filename, upsideDown = false) {
        this._videoParallaxFilename = filename;
        this._videoParallaxUpsideDown = upsideDown;
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene._spriteset.createVideoParallax(filename, upsideDown);
        }
    };

    Game_Map.prototype.stopVideoParallax = function() {
        this._videoParallaxFilename = null;
        this._videoParallaxUpsideDown = false;
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene._spriteset.stopVideoParallax();
        }
    };

    // -------------------------
    // Spriteset_Map Modifications
    // -------------------------
    const _Spriteset_Map_createBaseSprite = Spriteset_Map.prototype.createBaseSprite;
    Spriteset_Map.prototype.createBaseSprite = function() {
        _Spriteset_Map_createBaseSprite.call(this);
        this.createVideoParallaxFromMap();
    };

    Spriteset_Map.prototype.createVideoParallaxFromMap = function() {
        const map = $gameMap;
        if (map._videoParallaxFilename) {
            this.createVideoParallax(map._videoParallaxFilename, map._videoParallaxUpsideDown);
        }
    };

    // Override createTilemap to set its zIndex
    const _Spriteset_Map_createTilemap = Spriteset_Map.prototype.createTilemap;
    Spriteset_Map.prototype.createTilemap = function() {
        _Spriteset_Map_createTilemap.call(this);
        this._tilemap.zIndex = 2; // Set higher than video parallax
    };

    Spriteset_Map.prototype.createVideoParallax = function(filename, upsideDown) {
        if (this._videoParallax) {
            this.stopVideoParallax();
        }

        this._videoParallax = this.createVideoSprite(filename, upsideDown);

        if (this._baseSprite) {
            // Add the video parallax at index 1 to align with the parallax layer
            this._baseSprite.addChildAt(this._videoParallax, 1);

            // Set zIndex to 0 to ensure it's below tilemap
            this._videoParallax.zIndex = 0;

            // Enable sortableChildren if not already enabled
            this._baseSprite.sortableChildren = true;
        }

        // Hide the standard parallaxSprite to prevent it from interfering
        if (this._parallaxSprite) {
            this._parallaxSprite.visible = false;
        }
    };

    Spriteset_Map.prototype.createVideoSprite = function(filename, upsideDown) {
        const basePath = 'movies/' + filename;
        const video = document.createElement('video');
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true; // Ensures videos play inline on mobile devices
        video.preload = 'auto'; // Preload the video

        // If filename already has an extension, use it directly; otherwise try common formats
        const hasExtension = /\.(webm|mp4|ogg)$/i.test(filename);
        if (hasExtension) {
            const source = document.createElement('source');
            source.src = basePath;
            video.appendChild(source);
        } else {
            const extensions = ['.mp4', '.webm'];
            for (const ext of extensions) {
                const source = document.createElement('source');
                source.src = basePath + ext;
                video.appendChild(source);
            }
        }

        const texture = PIXI.Texture.from(video);
        const sprite = new PIXI.Sprite(texture);
        sprite.width = Graphics.width;
        sprite.height = Graphics.height;

        if (upsideDown) {
            sprite.scale.y = -1;
            sprite.anchor.y = 1;
        }

        // Initialize active flag
        sprite._isActive = true;

        // Assign video and texture to sprite for access in methods
        sprite._video = video;
        sprite._texture = texture;

        // Initialize requestAnimationFrame ID
        sprite._updateRAF = null;

        // Continuously update the video texture
        const updateVideoTexture = () => {
            if (!sprite._isActive || !sprite._texture.resource) return; // Stop updating if not active or texture is null
            if (sprite._video.readyState >= 2) {
                sprite._texture.update();
            }
            sprite._updateRAF = requestAnimationFrame(updateVideoTexture);
        };
        sprite._updateRAF = requestAnimationFrame(updateVideoTexture);

        // Define pause and play methods
        sprite._pauseVideo = function() {
            if (!this._video.paused) {
                this._video.pause();
            }
        };

        sprite._playVideo = function() {
            if (this._video.paused) {
                this._video.play().catch(() => {
                    // Handle play error silently
                });
            }
        };

        // Bind the pause and play methods to window events
        sprite._onBlur = sprite._pauseVideo.bind(sprite);
        sprite._onFocus = sprite._playVideo.bind(sprite);
        window.addEventListener('blur', sprite._onBlur);
        window.addEventListener('focus', sprite._onFocus);

        // Method to stop and hide the video
        sprite._stopAndHideVideo = function() {
            // Deactivate the update loop first
            this._isActive = false;

            // Cancel the ongoing requestAnimationFrame
            if (this._updateRAF) {
                cancelAnimationFrame(this._updateRAF);
                this._updateRAF = null;
            }

            // Pause the video if it's playing
            if (!this._video.paused) {
                this._video.pause();
            }

            // Clear video source and load to stop decoding
            this._video.src = "";
            this._video.load();

            // Destroy the PIXI texture to free up resources
            if (this._texture) {
                this._texture.destroy(true);
                this._texture = null;
            }

            // Hide the sprite and remove it from its parent
            this.visible = false;
            if (this.parent) {
                this.parent.removeChild(this);
            }

            // Remove event listeners to prevent memory leaks
            window.removeEventListener('blur', this._onBlur);
            window.removeEventListener('focus', this._onFocus);

            // Remove references to video and texture to allow garbage collection
            this._video = null;
            this._texture = null;
            this._onBlur = null;
            this._onFocus = null;
        };

        return sprite;
    };

    Spriteset_Map.prototype.stopVideoParallax = function() {
        if (this._videoParallax) {
            this._videoParallax._stopAndHideVideo();
            this._videoParallax = null;
        }
    };

    // -------------------------
    // Spriteset_Map.prototype.destroy Override
    // -------------------------
    const _Spriteset_Map_destroy = Spriteset_Map.prototype.destroy;
    Spriteset_Map.prototype.destroy = function(options) {
        this.stopVideoParallax(); // Ensure video parallax is stopped
        _Spriteset_Map_destroy.call(this, options);
    };

    // -------------------------
    // Scene_Map Termination Handling
    // -------------------------
    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        if (this._spriteset && this._spriteset._videoParallax) {
            this._spriteset.stopVideoParallax();
        }
        _Scene_Map_terminate.call(this);
    };
})();
