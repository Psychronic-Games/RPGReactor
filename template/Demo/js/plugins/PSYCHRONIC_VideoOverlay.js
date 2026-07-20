/*:
 * @target MZ
 * @plugindesc Allows video overlays on events with rotation, skew, transparency, optional audio, and optional dynamic scanlines using PIXI Video Textures.
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @param bufferDistance
 * @text Buffer Distance
 * @desc The distance in pixels outside the screen within which videos start playing.
 * @type number
 * @min 0
 * @default 200
 *
 * @param debugMode
 * @text Debug Mode
 * @desc Print console logs for debugging. Disable for better performance.
 * @type boolean
 * @default false
 *
 * @command PlayVideoOverlay
 * @text Play Video Overlay
 * @desc Adds a video overlay to a specified event with rotation, skew, transparency, and optional audio/scanlines.
 *
 * @arg eventId
 * @text Event ID
 * @desc The ID of the event to attach the video overlay to.
 * @type number
 * @default 1
 *
 * @arg filename
 * @text Filename
 * @desc The filename of the video in /movies/ folder (e.g. myvideo.mp4).
 * @type string
 * @default myvideo.mp4
 *
 * @arg sizeX
 * @text Video Width
 * @desc Width of the video in pixels.
 * @type number
 * @min 1
 * @default 336
 *
 * @arg sizeY
 * @text Video Height
 * @desc Height of the video in pixels.
 * @type number
 * @min 1
 * @default 192
 *
 * @arg xOffset
 * @text X Offset
 * @desc Horizontal offset from the event's center position.
 * @type number
 * @default 0
 * @min -1000
 * @max 1000
 *
 * @arg yOffset
 * @text Y Offset
 * @desc Vertical offset from the event's center position.
 * @type number
 * @default 0
 * @min -1000
 * @max 1000
 *
 * @arg zIndex
 * @text Z-Index
 * @desc Determines layering (higher values render above lower ones).
 * @type number
 * @default 1
 * @min -1000
 * @max 1000
 *
 * @arg rotation
 * @text Rotation
 * @desc Rotation angle in degrees (0-360).
 * @type number
 * @min 0
 * @max 360
 * @default 0
 *
 * @arg skewX
 * @text Skew X
 * @desc Skew angle along the X-axis in degrees.
 * @type number
 * @min -360
 * @max 360
 * @default 0
 *
 * @arg skewY
 * @text Skew Y
 * @desc Skew angle along the Y-axis in degrees.
 * @type number
 * @min -360
 * @max 360
 * @default 0
 *
 * @arg alpha
 * @text Transparency
 * @desc Transparency of the video overlay (0.0 to 1.0).
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 1.0
 *
 * @arg audio
 * @text Audio
 * @desc Enable audio for the video overlay.
 * @type boolean
 * @default false
 *
 * @arg repeat
 * @text Repeat
 * @desc Whether the video should loop. True by default.
 * @type boolean
 * @default true
 *
 * @arg scanlines
 * @text Scanlines
 * @desc Whether to overlay a retro scanline effect on the video.
 * @type boolean
 * @default false
 *
 * @command StopVideoOverlay
 * @text Stop Video Overlay
 * @desc Removes a video overlay from a specified event.
 *
 * @arg eventId
 * @text Event ID
 * @desc The ID of the event to remove the video overlay from.
 * @type number
 * @default 1
 *
 * @help
 * This plugin enables video overlays on events using PIXI.js. It supports rotation,
 * skew, transparency, optional audio, and an optional dynamically-generated scanline effect.
 *
 * Videos are paused and hidden when off-screen, and reactivated when near the screen,
 * for performance reasons.
 *
 * Key Notes:
 * - The displayed video size is determined by the sprite's width/height, not the actual
 *   resolution of the video file. For best results, keep them proportional.
 * - Audio playback is optional. If enabled, the video is unmuted and routed through the
 *   Web Audio API for in-game mixing.
 * - Smaller video display sizes reduce GPU overhead. For even better performance, provide
 *   lower-resolution video files if needed.
 * - If `scanlines` is true, a small 2x2 dynamic bitmap is created with a dark top row and
 *   transparent bottom row, tiled over the video to create a retro “CRT scanline” look.
 *
 * Example usage with scanlines:
 *   PlayVideoOverlay eventId:1 filename:"myvideo.mp4" sizeX:320 sizeY:240 scanlines:true
 */

(() => {
    const pluginName = "PSYCHRONIC_VideoOverlay";
    const parameters = PluginManager.parameters(pluginName);
    const BUFFER_DISTANCE = Number(parameters['bufferDistance'] || 200);
    const DEBUG_MODE = parameters['debugMode'] === 'true';

    // Maximum number of videos to load at once
    const MAX_CONCURRENT_LOADS = 2;
    let currentLoads = 0;
    const loadQueue = [];

    // Additional buffer for preloading
    const PRELOAD_OFFSET = 100;

    class VideoOverlayManager {
        constructor() {
            this.overlays = {};
        }

        log(...args) {
            if (DEBUG_MODE) console.log(...args);
        }

        // ------------------------------------------------------------
        // Generates a small 2x2 canvas for scanlines:
        // - Top row = semi-transparent black
        // - Bottom row = fully transparent
        // ------------------------------------------------------------
        createScanlineTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 2;
            canvas.height = 2;
            const ctx = canvas.getContext('2d');

            // Fill top row with a semi-transparent black
            ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
            ctx.fillRect(0, 0, 2, 1);

            // Bottom row is left transparent
            // (no need to fill anything)

            // Create a PIXI texture from the canvas
            const texture = PIXI.Texture.from(canvas);
            texture.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
            return texture;
        }

        // ------------------------------------------------------------
        // addOverlay: Creates a placeholder sprite for the video.
        // ------------------------------------------------------------
        addOverlay(params) {
            const eventId = params.eventId;
            this.log(`VideoOverlay: Adding overlay for Event ID ${eventId}`, params);

            // Remove old overlay if one exists for this event
            if (this.overlays[eventId]) {
                this.log(`Overlay for Event ${eventId} already exists. Removing old one.`);
                this.removeOverlay(eventId);
            }

            // Fetch the event
            const event = $gameMap.event(eventId);
            if (!event) {
                console.error(`VideoOverlay: Event ID ${eventId} not found on this map.`);
                return;
            }

            // Create an empty sprite for the video
            const videoSprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
            videoSprite.width = params.sizeX;
            videoSprite.height = params.sizeY;
            videoSprite.anchor.set(0.5, 0.5);
            videoSprite.zIndex = params.zIndex;
            videoSprite.rotation = (params.rotation || 0) * (Math.PI / 180);
            videoSprite.skew.x = (params.skewX || 0) * (Math.PI / 180);
            videoSprite.skew.y = (params.skewY || 0) * (Math.PI / 180);
            videoSprite.alpha = params.alpha;
            videoSprite.visible = false;

            // Attach to the map's character sprite container
            const spritesetMap = SceneManager._scene._spriteset;
            let parentContainer = null;
            if (spritesetMap && spritesetMap._characterSprites) {
                const eventSprite = spritesetMap._characterSprites.find(
                    sprite => sprite._character === event
                );
                if (eventSprite && eventSprite.parent) {
                    parentContainer = eventSprite.parent;
                    parentContainer.addChild(videoSprite);
                } else {
                    console.error("VideoOverlay: Event sprite not found or no parent container.");
                    return;
                }
            } else {
                console.error("VideoOverlay: spritesetMap._characterSprites not found.");
                return;
            }

            // Initialize overlay data
            this.overlays[eventId] = {
                video: null,
                videoTexture: null,
                sprite: videoSprite,
                params: params,
                videoPlaying: false,
                audioContext: null,
                audioSource: null,
                isVisible: false,
                scanlineSprite: null
            };

            // Optionally create the scanline sprite if requested
            if (params.scanlines) {
                // Dynamically create the scanline texture
                const scanlineTexture = this.createScanlineTexture();

                // Create a TilingSprite the same size as the video
                const scanlineSprite = new PIXI.TilingSprite(
                    scanlineTexture,
                    params.sizeX,
                    params.sizeY
                );
                scanlineSprite.anchor.set(0.5, 0.5);
                scanlineSprite.zIndex = params.zIndex + 0.0001; // slightly above the video sprite
                scanlineSprite.alpha = 1.0;                     // we can use alpha here or in the fill style
                scanlineSprite.blendMode = PIXI.BLEND_MODES.MULTIPLY;
                scanlineSprite.visible = false; // starts hidden

                parentContainer.addChild(scanlineSprite);
                this.overlays[eventId].scanlineSprite = scanlineSprite;
            }

            // Store in $gameMap so we can reinitialize on map load
            if (!$gameMap._videoOverlayParams) {
                $gameMap._videoOverlayParams = {};
            }
            params.mapId = $gameMap.mapId();
            $gameMap._videoOverlayParams[eventId] = params;

            this.log(`VideoOverlay: Overlay placeholder added for Event ID ${eventId}.`);
        }

        // ------------------------------------------------------------
        // removeOverlay: Cleans up textures, sprites, etc.
        // ------------------------------------------------------------
        removeOverlay(eventId, removeParams = true) {
            const overlay = this.overlays[eventId];
            if (!overlay) return;

            this.log(`VideoOverlay: Removing overlay for Event ID ${eventId}`);

            // Destroy the scanline sprite if it exists
            if (overlay.scanlineSprite) {
                if (overlay.scanlineSprite.parent) {
                    overlay.scanlineSprite.parent.removeChild(overlay.scanlineSprite);
                }
                // We don't destroy the baseTexture for the scanlines, in case it’s re-used.
                // But if you want to free all memory, you can destroy it completely:
                overlay.scanlineSprite.destroy({ texture: false, baseTexture: false });
                overlay.scanlineSprite = null;
            }

            // Destroy the video element and texture
            if (overlay.video) {
                overlay.video.pause();
                overlay.video.src = "";
                overlay.video.load();  // flush
                if (overlay.video.parentNode) {
                    overlay.video.parentNode.removeChild(overlay.video);
                }
                if (overlay.sprite.texture) {
                    overlay.sprite.texture.destroy(true);
                    overlay.sprite.texture = PIXI.Texture.EMPTY;
                }
                if (overlay.audioContext) {
                    overlay.audioContext.close();
                    overlay.audioContext = null;
                    overlay.audioSource = null;
                }
                overlay.video = null;
                overlay.videoTexture = null;
            }

            // Remove the sprite from the parent container
            if (overlay.sprite.parent) {
                overlay.sprite.parent.removeChild(overlay.sprite);
            }
            overlay.sprite.destroy({ texture: true, baseTexture: true });

            // Delete from manager
            delete this.overlays[eventId];

            // Also remove stored params if needed
            if (removeParams && $gameMap._videoOverlayParams) {
                delete $gameMap._videoOverlayParams[eventId];
            }
        }

        // ------------------------------------------------------------
        // clearAll: Removes all overlays (used on map terminate).
        // ------------------------------------------------------------
        clearAll() {
            this.log("VideoOverlay: Clearing all overlays");
            for (const eventId in this.overlays) {
                this.removeOverlay(eventId, false);
            }
        }

        // ------------------------------------------------------------
        // reinitializeOverlays: Restores overlays when map loads.
        // ------------------------------------------------------------
        reinitializeOverlays() {
            if ($gameMap._videoOverlayParams) {
                for (const eventId in $gameMap._videoOverlayParams) {
                    const params = $gameMap._videoOverlayParams[eventId];
                    // Only restore if it's the same map
                    if (params.mapId === $gameMap.mapId()) {
                        const event = $gameMap.event(Number(eventId));
                        if (event) {
                            this.addOverlay(params);
                        } else {
                            // The event doesn't exist anymore
                            delete $gameMap._videoOverlayParams[eventId];
                        }
                    } else {
                        // Belongs to a different map
                        delete $gameMap._videoOverlayParams[eventId];
                    }
                }
            }
        }

        // ------------------------------------------------------------
        // enqueueVideoLoad: For concurrency-limited loading.
        // ------------------------------------------------------------
        enqueueVideoLoad(loadFunction) {
            return new Promise((resolve, reject) => {
                loadQueue.push({ loadFunction, resolve, reject });
                this.processQueue();
            });
        }

        async processQueue() {
            if (currentLoads >= MAX_CONCURRENT_LOADS || loadQueue.length === 0) {
                return;
            }

            const { loadFunction, resolve, reject } = loadQueue.shift();
            currentLoads++;

            try {
                // Slight delay to avoid big spikes
                await new Promise(res => setTimeout(res, 100));
                const result = await loadFunction();
                resolve(result);
            } catch (error) {
                reject(error);
            } finally {
                currentLoads--;
                this.processQueue();
            }
        }

        // ------------------------------------------------------------
        // update: Called each frame, handles visibility and loading.
        // ------------------------------------------------------------
        update() {
            for (const eventId in this.overlays) {
                const overlay = this.overlays[eventId];
                const sprite = overlay.sprite;

                // Update sprite position
                this.updateOverlayPosition(eventId);

                // Check if within preload range
                const isWithinPreload = this.isOverlayWithinBuffer(sprite, PRELOAD_OFFSET);

                if (isWithinPreload && !overlay.isVisible) {
                    // It's becoming visible
                    overlay.isVisible = true;
                    sprite.visible = true;

                    // If we have a scanline sprite, show that too
                    if (overlay.scanlineSprite) {
                        overlay.scanlineSprite.visible = true;
                    }

                    if (!overlay.video) {
                        this.enqueueVideoLoad(() => this.loadVideoForOverlay(eventId))
                            .catch(e => {
                                console.error(`VideoOverlay: Error loading video for Event ID ${eventId}`, e);
                            });
                    } else {
                        this.resumeVideo(overlay);
                    }
                } else if (!isWithinPreload && overlay.isVisible) {
                    // It's going off-screen
                    overlay.isVisible = false;
                    this.pauseVideo(overlay);
                }
            }
        }

        pauseVideo(overlay) {
            if (overlay.videoPlaying) {
                overlay.video.pause();
                overlay.videoPlaying = false;
                this.log(`VideoOverlay: Video paused for Event ID ${overlay.params.eventId}`);
            }
            overlay.sprite.visible = false;
            if (overlay.scanlineSprite) {
                overlay.scanlineSprite.visible = false;
            }
            if (overlay.videoTexture) {
                overlay.videoTexture.baseTexture.autoUpdate = false;
            }
        }

        resumeVideo(overlay) {
            // If the video has ended (and not looping), do NOT replay it:
            if (overlay.video && overlay.video.ended && !overlay.params.repeat) {
                this.log(`VideoOverlay: Video has ended and is not set to repeat. Not resuming.`);
                return;
            }

            if (!overlay.videoPlaying) {
                if (overlay.video && overlay.video.readyState >= 2) {
                    overlay.video.play().then(() => {
                        overlay.videoPlaying = true;
                        this.log(`VideoOverlay: Video resumed for Event ID ${overlay.params.eventId}`);
                        if (overlay.videoTexture) {
                            overlay.videoTexture.baseTexture.autoUpdate = true;
                        }
                        if (overlay.params.audio) {
                            this.setupAudioContext(overlay);
                        }
                    }).catch(e => {
                        console.error(`VideoOverlay: Failed to resume video: ${overlay.params.filename}`, e);
                    });
                }
            } else {
                // Already playing; just ensure sprite is visible
                overlay.sprite.visible = true;
                if (overlay.scanlineSprite) {
                    overlay.scanlineSprite.visible = true;
                }
                if (overlay.videoTexture) {
                    overlay.videoTexture.baseTexture.autoUpdate = true;
                }
            }
        }

        // ------------------------------------------------------------
        // loadVideoForOverlay: Creates <video>, sets the sprite texture.
        // ------------------------------------------------------------
        async loadVideoForOverlay(eventId) {
            const overlay = this.overlays[eventId];
            if (!overlay) return;

            if (overlay.video) {
                // Already loaded
                this.resumeVideo(overlay);
                return;
            }

            // Create <video> element
            const video = document.createElement('video');
            video.src = `movies/${overlay.params.filename}`;
            video.loop = overlay.params.repeat;  // set loop from plugin param
            video.crossOrigin = "anonymous";
            video.preload = "auto";
            video.playsInline = true;
            video.autoplay = false;
            video.muted = !overlay.params.audio;
            video.volume = overlay.params.audio ? 1.0 : 0.0;

            // Move off-screen
            video.style.position = 'absolute';
            video.style.width = '1px';
            video.style.height = '1px';
            video.style.left = '-10000px';
            document.body.appendChild(video);

            // Create texture from video
            const videoTexture = PIXI.Texture.from(video);
            videoTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            videoTexture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
            videoTexture.baseTexture.autoUpdate = false;

            overlay.video = video;
            overlay.videoTexture = videoTexture;
            overlay.sprite.texture = videoTexture;

            // Handle load errors
            video.onerror = (e) => {
                console.error(`VideoOverlay: Failed to load video: ${overlay.params.filename}`, e);
            };

            // Handle video end if not looping
            video.onended = () => {
                if (!video.loop) {
                    // Pause on the last frame (still visible)
                    overlay.videoPlaying = false;
                    this.log(`VideoOverlay: Video ended (not repeating). Event ID: ${eventId}`);
                }
            };

            return new Promise(resolve => {
                video.oncanplay = async () => {
                    if (overlay.isVisible) {
                        try {
                            await video.play();
                            overlay.videoPlaying = true;
                            this.log(`VideoOverlay: Video started playing for Event ID ${eventId}`);
                            videoTexture.baseTexture.autoUpdate = true;
                            if (overlay.params.audio) {
                                this.setupAudioContext(overlay);
                            }
                        } catch (e) {
                            console.error(`VideoOverlay: Failed to play video: ${overlay.params.filename}`, e);
                        }
                    }
                    resolve();
                };
                video.load();
            });
        }

        // Check if the sprite is near the screen (plus a buffer)
        isOverlayWithinBuffer(sprite, additionalBuffer = 0) {
            const buffer = BUFFER_DISTANCE + additionalBuffer;
            const screenX = sprite.x;
            const screenY = sprite.y;
            const screenWidth = Graphics.width;
            const screenHeight = Graphics.height;

            const withinX = (screenX + buffer) >= 0 && (screenX - buffer) <= screenWidth;
            const withinY = (screenY + buffer) >= 0 && (screenY - buffer) <= screenHeight;
            return withinX && withinY;
        }

        // ------------------------------------------------------------
        // setupAudioContext: For Web Audio if audio=true
        // ------------------------------------------------------------
        setupAudioContext(overlay) {
            if (overlay.audioContext) return;

            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
                console.error("VideoOverlay: Web Audio API not supported.");
                return;
            }

            try {
                overlay.audioContext = new AudioContext();
                if (overlay.audioContext.state === 'suspended') {
                    overlay.audioContext.resume().then(() => {
                        this.log('AudioContext resumed');
                    });
                }

                overlay.audioSource = overlay.audioContext.createMediaElementSource(overlay.video);
                overlay.audioSource.connect(overlay.audioContext.destination);

                this.log(`VideoOverlay: AudioContext set up for Event ID ${overlay.params.eventId}`);
            } catch (e) {
                console.error(`VideoOverlay: Failed to set up AudioContext: ${overlay.params.filename}`, e);
            }
        }

        // ------------------------------------------------------------
        // updateOverlayPosition: Places sprite at event screen coords.
        // ------------------------------------------------------------
        updateOverlayPosition(eventId) {
            const overlay = this.overlays[eventId];
            if (!overlay) return;

            const event = $gameMap.event(Number(eventId));
            if (event) {
                overlay.sprite.x = event.screenX() + overlay.params.xOffset;
                overlay.sprite.y = event.screenY() + overlay.params.yOffset - ($gameMap.tileHeight() / 2);
                overlay.sprite.z = event.screenZ() + overlay.params.zIndex;

                // If we have a scanline sprite, match its transform
                if (overlay.scanlineSprite) {
                    overlay.scanlineSprite.x = overlay.sprite.x;
                    overlay.scanlineSprite.y = overlay.sprite.y;
                    overlay.scanlineSprite.z = overlay.sprite.z + 0.0001;
                    overlay.scanlineSprite.rotation = overlay.sprite.rotation;
                    overlay.scanlineSprite.skew.x = overlay.sprite.skew.x;
                    overlay.scanlineSprite.skew.y = overlay.sprite.skew.y;
                }
            }
        }
    }

    // Instantiate a global manager
    const videoOverlayManager = new VideoOverlayManager();

    // ------------------------------------------------------------
    // Plugin Commands
    // ------------------------------------------------------------
    PluginManager.registerCommand(pluginName, "PlayVideoOverlay", args => {
        const params = {
            eventId: Number(args.eventId),
            filename: String(args.filename),
            sizeX: Number(args.sizeX) || 336,
            sizeY: Number(args.sizeY) || 192,
            xOffset: Number(args.xOffset) || 0,
            yOffset: Number(args.yOffset) || 0,
            zIndex: Number(args.zIndex) || 1,
            rotation: Number(args.rotation) || 0,
            skewX: Number(args.skewX) || 0,
            skewY: Number(args.skewY) || 0,
            alpha: parseFloat(args.alpha) || 1.0,
            audio: (args.audio === "true"),
            repeat: (args.repeat === "true"),
            scanlines: (args.scanlines === "true") // <-- NEW scanlines param
        };

        if (isNaN(params.eventId)) {
            console.error(`VideoOverlay: Invalid eventId: ${args.eventId}`);
            return;
        }

        videoOverlayManager.addOverlay(params);
    });

    PluginManager.registerCommand(pluginName, "StopVideoOverlay", args => {
        const eventId = Number(args.eventId);
        if (isNaN(eventId)) {
            console.error(`VideoOverlay: Invalid eventId: ${args.eventId}`);
            return;
        }

        videoOverlayManager.removeOverlay(eventId);
    });

    // ------------------------------------------------------------
    // Scene_Map: Clear overlays on terminate, re-init on start
    // ------------------------------------------------------------
    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        videoOverlayManager.clearAll();
        _Scene_Map_terminate.call(this);
    };

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);
        videoOverlayManager.reinitializeOverlays();
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        videoOverlayManager.update();
    };
})();
