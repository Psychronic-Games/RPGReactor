/*:
 * @target MZ
 * @plugindesc v2.0 - Plays animated GIFs on specified events with optional zoom and z-index (MZ).
 * @author Psychronic
 * @url https://psychronic.itch.io
 * @command PlayGif
 * @text Play GIF
 * @desc Plays a GIF animation on the specified event.
 *
 * @arg eventId
 * @text Event ID
 * @desc The ID of the event to play the GIF on.
 * @type number
 *
 * @arg gifName
 * @text GIF Name
 * @desc The name of the GIF file (without the .gif extension) to play.
 * @type text
 *
 * @arg loop
 * @text Loop
 * @desc Whether the GIF should loop.
 * @type boolean
 * @default true
 *
 * @arg transparency
 * @text Transparency
 * @desc Transparency of the GIF (0 to 255, where 0 is fully transparent and 255 is fully opaque).
 * @type number
 * @default 255
 * @min 0
 * @max 255
 *
 * @arg zoom
 * @text Zoom
 * @desc Zoom level for the GIF (e.g., 2 for 2x magnification).
 * @type number
 * @default 1
 * @min 0.1
 *
 * @arg zIndex
 * @text Z-Index
 * @desc Z-Index for the GIF (higher values are on top, 0 is behind the player).
 * @type number
 * @default 1
 *
 * @command StopGif
 * @text Stop GIF
 * @desc Stops the GIF animation on the specified event.
 *
 * @arg eventId
 * @text Event ID
 * @desc The ID of the event to stop the GIF on.
 * @type number
 *
 * @help
 * ============================================================================
 * Introduction
 * ============================================================================
 * This plugin allows you to play animated GIFs on specified events in RPG
 * Maker MZ. You can control whether the GIF should loop or not, set the 
 * transparency level, specify a zoom level, and control the z-index.
 * 
 * ============================================================================
 * Plugin Commands (RPG Maker MZ)
 * ============================================================================
 * Use the Plugin Command interface in RPG Maker MZ's event editor to access
 * the following commands:
 *
 * 1. Play GIF
 *    Plays an animated GIF on a specified event.
 *    Parameters:
 *    - Event ID: The ID of the event where the GIF will be displayed.
 *    - GIF Name: The name of the GIF file (without .gif extension).
 *               Files should be placed in: img/animations/
 *    - Loop: true or false, whether the GIF should loop continuously.
 *    - Transparency: 0-255 (0=fully transparent, 255=fully opaque).
 *    - Zoom: Magnification level (e.g., 1=normal, 2=2x size).
 *    - Z-Index: Layer depth (higher=in front, 0=behind player).
 *
 * 2. Stop GIF
 *    Stops the GIF animation on a specified event.
 *    Parameters:
 *    - Event ID: The ID of the event to stop the GIF on.
 *
 * ============================================================================
 * Performance Notes
 * ============================================================================
 * This plugin uses Web Workers to decode GIF frames in a separate thread,
 * ensuring smooth performance even with large, complex GIFs. The main game
 * thread is not blocked during GIF processing
 * 
 * ============================================================================
 * Terms of Use
 * ============================================================================
 * cc0 (Public Domain), can use without credit, although credit is appreciated
 * https://psychronic.itch.io
 */

(() => {
    const pluginName = 'PSYCHRONIC_GifAnimationMZ';

    function createGifWorker() {
        const workerScript = `
            self.onmessage = function(e) {
                const { buffer } = e.data;
                const frames = parseGif(buffer);
                self.postMessage({ frames });
            };

            function parseGif(buffer) {
                const data = new Uint8Array(buffer);
                let position = 0;
                const frames = [];
                let globalColorTable = null;
                let currentDelay = 0;
                let transparentColorIndex = 0;

                function readByte() {
                    return data[position++];
                }

                function readBytes(n) {
                    const bytes = data.slice(position, position + n);
                    position += n;
                    return bytes;
                }

                function lzwDecode(minCodeSize, data) {
                    let pos = 0;

                    const readCode = (size) => {
                        let code = 0;
                        for (let i = 0; i < size; i++) {
                            if (data[pos >> 3] & (1 << (pos & 7))) {
                                code |= 1 << i;
                            }
                            pos++;
                        }
                        return code;
                    };

                    const clearCode = 1 << minCodeSize;
                    const eoiCode = clearCode + 1;
                    let codeSize = minCodeSize + 1;

                    let dictionary = [];
                    const clear = () => {
                        dictionary = [];
                        codeSize = minCodeSize + 1;
                        for (let i = 0; i < clearCode; i++) {
                            dictionary[i] = [i];
                        }
                        dictionary[clearCode] = [];
                        dictionary[eoiCode] = null;
                    };

                    let dataIndex = 0;
                    let output = [];

                    let code, last;

                    while (true) {
                        last = code;
                        code = readCode(codeSize);

                        if (code === clearCode) {
                            clear();
                            continue;
                        }
                        if (code === eoiCode) break;

                        if (code < dictionary.length) {
                            if (last !== clearCode) {
                                dictionary.push(dictionary[last].concat(dictionary[code][0]));
                            }
                        } else {
                            if (code !== dictionary.length) throw new Error('Invalid LZW code.');
                            dictionary.push(dictionary[last].concat(dictionary[last][0]));
                        }

                        output.push(...dictionary[code]);

                        if (dictionary.length === (1 << codeSize) && codeSize < 12) {
                            codeSize++;
                        }
                    }

                    return output;
                }

                function parseImageBlock() {
                    const left = readBytes(2).reduce((acc, byte, i) => acc + (byte << (8 * i)), 0);
                    const top = readBytes(2).reduce((acc, byte, i) => acc + (byte << (8 * i)), 0);
                    const width = readBytes(2).reduce((acc, byte, i) => acc + (byte << (8 * i)), 0);
                    const height = readBytes(2).reduce((acc, byte, i) => acc + (byte << (8 * i)), 0);
                    const packed = readByte();
                    const localColorTableFlag = (packed & 0x80) >> 7;
                    const localColorTableSize = 2 ** ((packed & 0x07) + 1);

                    let localColorTable;
                    if (localColorTableFlag) {
                        localColorTable = readBytes(3 * localColorTableSize);
                    } else {
                        localColorTable = globalColorTable;
                    }

                    const lzwMinCodeSize = readByte();
                    const imageData = [];
                    while (true) {
                        const blockSize = readByte();
                        if (blockSize === 0) break;
                        imageData.push(...readBytes(blockSize));
                    }

                    const decodedPixels = lzwDecode(lzwMinCodeSize, imageData);
                    const frameData = new Uint8ClampedArray(width * height * 4);
                    for (let i = 0, p = 0; i < decodedPixels.length; i++) {
                        const colorIndex = decodedPixels[i];
                        const r = localColorTable[colorIndex * 3];
                        const g = localColorTable[colorIndex * 3 + 1];
                        const b = localColorTable[colorIndex * 3 + 2];
                        const a = colorIndex === transparentColorIndex ? 0 : 255;
                        frameData[p++] = r;
                        frameData[p++] = g;
                        frameData[p++] = b;
                        frameData[p++] = a;
                    }

                    const frame = {
                        left,
                        top,
                        width,
                        height,
                        delay: currentDelay,
                        imageData: new ImageData(frameData, width, height)
                    };

                    frames.push(frame);
                    self.postMessage({ frame }); // Send the frame as it's ready
                    parseBlock();
                }

                function parseGraphicControlExtension() {
                    readByte();
                    const packed = readByte();
                    const disposalMethod = (packed & 0x1C) >> 2;
                    const transparentColorFlag = packed & 0x01;
                    const delay = readBytes(2).reduce((acc, byte, i) => acc + (byte << (8 * i)), 0);
                    transparentColorIndex = readByte();
                    readByte();
                    currentDelay = delay * 10;
                }

                function skipBlock() {
                    while (true) {
                        const blockSize = readByte();
                        if (blockSize === 0) break;
                        position += blockSize;
                    }
                }

                function parseBlock() {
                    while (position < data.length) {
                        const blockId = readByte();
                        if (blockId === 0x2C) {
                            parseImageBlock();
                        } else if (blockId === 0x21) {
                            const label = readByte();
                            if (label === 0xF9) {
                                parseGraphicControlExtension();
                            } else {
                                skipBlock();
                            }
                        } else if (blockId === 0x3B) {
                            break;
                        } else {
                            skipBlock();
                        }
                    }
                }

                function parseHeader() {
                    position += 6;
                    const width = readBytes(2).reduce((acc, byte, i) => acc + (byte << (8 * i)), 0);
                    const height = readBytes(2).reduce((acc, byte, i) => acc + (byte << (8 * i)), 0);
                    const packed = readByte();
                    const globalColorTableFlag = (packed & 0x80) >> 7;
                    const globalColorTableSize = 2 ** ((packed & (0x07)) + 1);

                    readByte();
                    readByte();

                    if (globalColorTableFlag) {
                        globalColorTable = readBytes(3 * globalColorTableSize);
                    }

                    parseBlock();
                }

                parseHeader();
                return frames;
            }
        `;
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        return new Worker(URL.createObjectURL(blob));
    }

    class Sprite_AnimatedGif extends Sprite {
        constructor(gifUrl, loop, transparency, zoom, zIndex) {
            super();
            this.anchor.set(0.5, 0.5); // Center the sprite
            this._gifUrl = gifUrl;
            this._loop = loop;
            this._transparency = transparency;
            this._zoom = zoom;
            this._zIndex = zIndex;
            this._frames = [];
            this._currentFrame = 0;
            this._lastFrameTime = 0;
            this._isPlaying = true;
            this._isFirstFrameLoaded = false;
            this._scaledBitmaps = []; // Store scaled bitmaps
            this._imageBitmaps = []; // Store ImageBitmaps
            this._worker = null; // Store the worker reference
            this._loadGif();
        }

        _loadGif() {
            console.log(`[${pluginName}] Loading GIF: ${this._gifUrl}`);
            fetch(this._gifUrl)
                .then(response => response.arrayBuffer())
                .then(buffer => {
                    this._worker = createGifWorker(); // Store the worker reference
                    this._worker.onmessage = (e) => {
                        if (e.data.error) {
                            console.error(`[${pluginName}] Failed to load GIF: ${this._gifUrl}, Error: ${e.data.error}`);
                        } else if (e.data.frame) {
                            this._frames.push(e.data.frame);
                            this._createScaledBitmap(e.data.frame); // Create scaled bitmap for the frame
                            if (!this._isFirstFrameLoaded) {
                                this.bitmap = new Bitmap(e.data.frame.width * this._zoom, e.data.frame.height * this._zoom);
                                this._lastFrameTime = performance.now();
                                this._updateTexture();
                                this._isFirstFrameLoaded = true;
                            }
                        } else if (e.data.frames) {
                            // All frames have been processed
                            this._terminateWorker();
                        }
                    };
                    this._worker.postMessage({ buffer });
                })
                .catch(err => console.error(`[${pluginName}] Failed to load GIF: ${this._gifUrl}, Error: ${err}`));
        }

        _createScaledBitmap(frame) {
            createImageBitmap(frame.imageData).then(imageBitmap => {
                const canvas = document.createElement('canvas');
                canvas.width = frame.width * this._zoom;
                canvas.height = frame.height * this._zoom;
                const context = canvas.getContext('2d');
                context.drawImage(imageBitmap, 0, 0, frame.width, frame.height, 0, 0, frame.width * this._zoom, frame.height * this._zoom);
                const bitmap = new Bitmap(canvas.width, canvas.height);
                bitmap.context.drawImage(canvas, 0, 0);
                this._scaledBitmaps.push(bitmap);
                this._imageBitmaps.push(imageBitmap);
            });
        }

        _terminateWorker() {
            if (this._worker) {
                this._worker.terminate();
                this._worker = null;
                console.log(`[${pluginName}] Worker terminated for GIF: ${this._gifUrl}`);
            }
        }

        destroy() {
            this.stop();
            this._terminateWorker();
            if (this.bitmap) {
                // Instead of calling destroy, we'll set it to null
                this.bitmap = null;
            }
            super.destroy();
        }

        _updateTexture() {
            if (this._frames.length === 0) return;
            const now = performance.now();
            const frame = this._frames[this._currentFrame];
            const elapsed = now - this._lastFrameTime;

            if (elapsed >= frame.delay) {
                this._lastFrameTime = now;
                this._currentFrame++;
                if (this._currentFrame >= this._frames.length) {
                    this._currentFrame = this._loop ? 0 : this._frames.length - 1;
                }
            }

            if (this.bitmap && this._scaledBitmaps[this._currentFrame]) {
                this.bitmap.clear();
                this.bitmap.blt(this._scaledBitmaps[this._currentFrame], 0, 0, this._scaledBitmaps[this._currentFrame].width, this._scaledBitmaps[this._currentFrame].height, 0, 0);
                this.opacity = this._transparency;
                this.texture.update();
            }

            if (this._isPlaying) {
                requestAnimationFrame(this._updateTexture.bind(this));
            }
        }

        play() {
            this._isPlaying = true;
            this.visible = true;
            console.log(`[${pluginName}] GIF playback started`);
            this._lastFrameTime = performance.now();
            this._updateTexture();
        }

        stop() {
            this._isPlaying = false;
            this.visible = false;
            console.log(`[${pluginName}] GIF playback stopped`);
        }
    }

    Game_Character.prototype.startGifAnimation = function (gifUrl, loop, transparency, zoom, zIndex) {
        this.stopGifAnimation(); // Stop and clean up any existing animation
        console.log(`[${pluginName}] Starting GIF animation on character with URL: ${gifUrl}`);
        this._gifSprite = new Sprite_AnimatedGif(gifUrl, loop, transparency, zoom, zIndex);
        this._gifSprite.x = this.screenX();
        this._gifSprite.y = this.screenY();
        this._gifSprite.z = zIndex;
        console.log(`[${pluginName}] GIF sprite position: (${this._gifSprite.x}, ${this._gifSprite.y})`);
        if (SceneManager._scene._spriteset && SceneManager._scene._spriteset._tilemap) {
            SceneManager._scene._spriteset._tilemap.addChild(this._gifSprite);
            SceneManager._scene._spriteset._tilemap.children.sort((a, b) => a.z - b.z);
            console.log(`[${pluginName}] GIF sprite added to tilemap`);
        } else {
            console.error(`[${pluginName}] Failed to add GIF sprite: tilemap not found`);
        }
    };

    Game_Character.prototype.stopGifAnimation = function () {
        if (this._gifSprite) {
            if (SceneManager._scene._spriteset && SceneManager._scene._spriteset._tilemap) {
                SceneManager._scene._spriteset._tilemap.removeChild(this._gifSprite);
            }
            this._gifSprite.destroy();
            this._gifSprite = null;
            console.log(`[${pluginName}] GIF animation stopped and cleaned up`);
        }
    };

    const _Game_Character_update = Game_Character.prototype.update;
    Game_Character.prototype.update = function() {
        _Game_Character_update.call(this);
        if (this._gifSprite) {
            this._gifSprite.x = this.screenX();
            this._gifSprite.y = this.screenY();
        }
    };

    const _Game_Map_setupEvents = Game_Map.prototype.setupEvents;
    Game_Map.prototype.setupEvents = function() {
        // Stop all GIF animations before setting up new events
        this.events().forEach(event => {
            if (event._gifSprite) {
                event.stopGifAnimation();
            }
        });
        _Game_Map_setupEvents.call(this);
    };

    // Register MZ Plugin Commands
    PluginManager.registerCommand(pluginName, 'PlayGif', args => {
        const eventId = Number(args.eventId);
        const gifName = args.gifName;
        const gifUrl = `img/animations/${gifName}.gif`;
        const loop = args.loop === 'true';
        const transparency = Number(args.transparency);
        const zoom = Number(args.zoom);
        const zIndex = Number(args.zIndex);

        console.log(`[${pluginName}] PlayGif command: eventId=${eventId}, gifUrl=${gifUrl}, loop=${loop}, transparency=${transparency}, zoom=${zoom}, zIndex=${zIndex}`);

        const event = $gameMap.event(eventId);
        if (event) {
            event.startGifAnimation(gifUrl, loop, transparency, zoom, zIndex);
        } else {
            console.error(`[${pluginName}] Event with ID ${eventId} not found`);
        }
    });

    PluginManager.registerCommand(pluginName, 'StopGif', args => {
        const eventId = Number(args.eventId);
        const event = $gameMap.event(eventId);

        if (event) {
            event.stopGifAnimation();
            console.log(`[${pluginName}] GIF animation stopped for eventId=${eventId}`);
        } else {
            console.error(`[${pluginName}] No event found for eventId=${eventId}`);
        }
    });
})();
