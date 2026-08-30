//=============================================================================
// reactor_video_surfaces.js - Native map video surfaces
//=============================================================================

(function(root) {
    "use strict";

    const PLUGIN_NAME = "RPGReactor";
    const STORE_KEY = "_reactorVideoSurfaces";
    const WAIT_MODE = "reactorVideoSurface";
    const MAX_ID = 999999;
    const DEG = Math.PI / 180;
    const DESCRIPTOR_VERSION = 1;

    function own(object, key) {
        return Object.prototype.hasOwnProperty.call(object || {}, key);
    }

    function field(args, names) {
        for (const name of names) {
            if (own(args, name)) return { present: true, value: args[name] };
        }
        return { present: false, value: undefined };
    }

    function parseObject(value) {
        if (value && typeof value === "object") return value;
        if (typeof value !== "string" || !value.trim()) return null;
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function commandArgs(value) {
        const args = parseObject(value) || {};
        const nested = parseObject(args.descriptor) || parseObject(args.data);
        return nested ? Object.assign({}, args, nested) : args;
    }

    function finiteNumber(value, min, max) {
        if (value === "" || value === null || value === undefined) return null;
        const number = Number(value);
        return Number.isFinite(number) && number >= min && number <= max ? number : null;
    }

    function integer(value, min, max) {
        const number = finiteNumber(value, min, max);
        return number !== null && Math.floor(number) === number ? number : null;
    }

    function booleanValue(value) {
        if (typeof value === "boolean") return value;
        if (value === 1 || value === "1") return true;
        if (value === 0 || value === "0") return false;
        if (typeof value !== "string") return null;
        const text = value.trim().toLowerCase();
        if (["true", "yes", "on"].indexOf(text) >= 0) return true;
        if (["false", "no", "off"].indexOf(text) >= 0) return false;
        return null;
    }

    function numberArgument(args, names, fallback, min, max) {
        const found = field(args, names);
        if (!found.present) return { ok: true, present: false, value: fallback };
        const value = finiteNumber(found.value, min, max);
        return { ok: value !== null, present: true, value: value };
    }

    function booleanArgument(args, names, fallback) {
        const found = field(args, names);
        if (!found.present) return { ok: true, present: false, value: fallback };
        const value = booleanValue(found.value);
        return { ok: value !== null, present: true, value: value };
    }

    function scanlineArgument(args) {
        const found = field(args, ["scanlines"]);
        if (!found.present) return { ok: true, present: false, value: 0 };
        const boolean = booleanValue(found.value);
        if (boolean !== null) return { ok: true, present: true, value: boolean ? 1 : 0 };
        const value = finiteNumber(found.value, 0, 1);
        return { ok: value !== null, present: true, value: value };
    }

    function sanitizeMoviePath(value) {
        if (typeof value !== "string") return null;
        let path = value.trim();
        if (!path || path.length > 1000 || /[\0-\x1f\x7f]/.test(path)) return null;
        if (/^[a-z][a-z0-9+.-]*:/i.test(path) || /^[\\/]/.test(path)
            || /^[a-z]:[\\/]/i.test(path) || path.indexOf("\\") >= 0) return null;
        const parts = path.split("/");
        if (!parts.length || parts.some(part => !part || part === "." || part === "..")) return null;
        if (!/\.(?:webm|mp4)$/i.test(parts[parts.length - 1])) return null;
        return parts.join("/");
    }

    function movieUrl(path) {
        return "movies/" + path.split("/").map(encodeURIComponent).join("/");
    }

    function normalizeTarget(value) {
        const text = String(value === undefined ? "map" : value)
            .trim().replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/[ _]+/g, "-");
        if (["fixed", "fixed-map", "map", "map-fixed"].indexOf(text) >= 0) return "map";
        if (["event", "this-event", "player", "screen"].indexOf(text) >= 0) return text;
        return null;
    }

    function normalizeLayer(value) {
        if (typeof value === "string") {
            const named = { below: 0, ground: 1, characters: 3, above: 5, screen: 10 };
            const key = value.trim().toLowerCase();
            if (own(named, key)) return named[key];
        }
        return finiteNumber(value, -10000, 10000);
    }

    function point(value) {
        if (Array.isArray(value) && value.length >= 2) {
            const x = finiteNumber(value[0], -1000000, 1000000);
            const y = finiteNumber(value[1], -1000000, 1000000);
            return x === null || y === null ? null : { x: x, y: y };
        }
        const object = parseObject(value);
        if (!object) return null;
        const x = finiteNumber(object.x, -1000000, 1000000);
        const y = finiteNumber(object.y, -1000000, 1000000);
        return x === null || y === null ? null : { x: x, y: y };
    }

    function parseCorners(args, width, height) {
        const packed = field(args, ["corners", "fourCorners"]);
        if (packed.present) {
            let value = packed.value;
            if (typeof value === "string") {
                try { value = JSON.parse(value); } catch (error) { return null; }
            }
            if (!Array.isArray(value) || value.length !== 4) return null;
            const result = value.map(point);
            return result.every(Boolean) ? result : null;
        }

        const aliases = [
            [["x0", "topLeftX", "corner0X"], ["y0", "topLeftY", "corner0Y"]],
            [["x1", "topRightX", "corner1X"], ["y1", "topRightY", "corner1Y"]],
            [["x2", "bottomRightX", "corner2X"], ["y2", "bottomRightY", "corner2Y"]],
            [["x3", "bottomLeftX", "corner3X"], ["y3", "bottomLeftY", "corner3Y"]]
        ];
        const any = aliases.some(pair => field(args, pair[0]).present || field(args, pair[1]).present);
        if (any) {
            const result = [];
            for (const pair of aliases) {
                const xField = field(args, pair[0]);
                const yField = field(args, pair[1]);
                if (!xField.present || !yField.present) return null;
                const x = finiteNumber(xField.value, -1000000, 1000000);
                const y = finiteNumber(yField.value, -1000000, 1000000);
                if (x === null || y === null) return null;
                result.push({ x: x, y: y });
            }
            return result;
        }
        return [
            { x: -width / 2, y: -height / 2 },
            { x: width / 2, y: -height / 2 },
            { x: width / 2, y: height / 2 },
            { x: -width / 2, y: height / 2 }
        ];
    }

    function hasCornerInput(args) {
        return field(args, ["corners", "fourCorners", "x0", "topLeftX", "corner0X",
            "y0", "topLeftY", "corner0Y", "x1", "topRightX", "corner1X",
            "y1", "topRightY", "corner1Y", "x2", "bottomRightX", "corner2X",
            "y2", "bottomRightY", "corner2Y", "x3", "bottomLeftX", "corner3X",
            "y3", "bottomLeftY", "corner3Y"]).present;
    }

    function normalizeShowArgs(raw, interpreter) {
        const args = commandArgs(raw);
        const idField = field(args, ["id", "surfaceId", "videoId"]);
        const id = idField.present ? integer(idField.value, 1, MAX_ID) : null;
        const fileField = field(args, ["file", "filename", "movie"]);
        const file = fileField.present ? sanitizeMoviePath(fileField.value) : null;
        if (id === null || !file) return null;

        let target = normalizeTarget(field(args, ["target", "bindTo"]).value);
        if (!target) return null;
        const eventField = field(args, ["eventId", "event"]);
        let eventId = eventField.present ? integer(eventField.value, 1, MAX_ID) : 0;
        if (target === "this-event") {
            const current = interpreter && (typeof interpreter.eventId === "function"
                ? interpreter.eventId() : interpreter._eventId);
            eventId = integer(current, 1, MAX_ID);
            target = "event";
        }
        if (target === "event" && (eventId === null || eventId < 1)) return null;
        if (target !== "event") eventId = 0;

        const x = numberArgument(args, ["x", "xOffset"], 0, -1000000, 1000000);
        const y = numberArgument(args, ["y", "yOffset"], 0, -1000000, 1000000);
        const z = numberArgument(args, ["z", "elevation"], 0, -1000000, 1000000);
        const width = numberArgument(args, ["width", "sizeX"], 320, 1, 8192);
        const height = numberArgument(args, ["height", "sizeY"], 180, 1, 8192);
        const rx = numberArgument(args, ["rotationX", "rotateX"], 0, -360000, 360000);
        const ry = numberArgument(args, ["rotationY", "rotateY"], 0, -360000, 360000);
        const rz = numberArgument(args, ["rotationZ", "rotateZ", "rotation"], 0, -360000, 360000);
        const rate = numberArgument(args, ["playbackRate", "rate"], 1, 0.05, 16);
        const scaleX = numberArgument(args, ["scaleX"], 1, -1000, 1000);
        const scaleY = numberArgument(args, ["scaleY"], 1, -1000, 1000);
        const depth = numberArgument(args, ["depth"], 0, -10000, 10000);
        const cull = numberArgument(args,
            ["cullDistance", "cullingDistance", "bufferDistance"], 0, 0, 1000000);
        const currentTime = numberArgument(args, ["currentTime"], 0, 0, Number.MAX_SAFE_INTEGER);
        if (![x, y, z, width, height, rx, ry, rz, rate, scaleX, scaleY, depth, cull,
            currentTime].every(item => item.ok)) return null;

        const normalized = args._reactorVideoDescriptor === DESCRIPTOR_VERSION;
        const opacityField = field(args, ["opacity"]);
        const alphaField = field(args, ["alpha"]);
        let opacity = 1;
        if (opacityField.present) {
            opacity = finiteNumber(opacityField.value, 0, normalized ? 1 : 255);
            if (opacity === null) return null;
            if (!normalized) opacity /= 255;
        } else if (alphaField.present) {
            opacity = finiteNumber(alphaField.value, 0, 1);
            if (opacity === null) return null;
        }
        const volumeField = field(args, ["volume", "audioVolume"]);
        let volume = 1;
        if (volumeField.present) {
            volume = finiteNumber(volumeField.value, 0, normalized ? 1 : 100);
            if (volume === null) return null;
            if (!normalized) volume /= 100;
        }

        const loop = booleanArgument(args, ["loop", "repeat"], true);
        const scanlines = scanlineArgument(args);
        const wait = booleanArgument(args, ["wait"], false);
        const ended = booleanArgument(args, ["ended"], false);
        const waitReleased = booleanArgument(args, ["waitReleased"], false);
        const audio = booleanArgument(args, ["audio", "audible"], false);
        const mutedDefault = audio.present ? !audio.value : true;
        const muted = booleanArgument(args, ["muted"], mutedDefault);
        if (![loop, scanlines, wait, ended, waitReleased, audio, muted].every(item => item.ok)) return null;
        if (wait.value && loop.value) loop.value = false;

        const layerField = field(args, ["layer", "zIndex"]);
        const layer = layerField.present ? normalizeLayer(layerField.value) : 3;
        if (layer === null) return null;
        const corners = parseCorners(args, width.value, height.value);
        if (!corners) return null;
        const customField = booleanArgument(args, ["customCorners"], hasCornerInput(args));
        if (!customField.ok) return null;

        const descriptorInput = args._reactorVideoDescriptor === DESCRIPTOR_VERSION;
        const generationField = field(args, ["generation"]);
        const generation = descriptorInput && generationField.present
            ? integer(generationField.value, 1, Number.MAX_SAFE_INTEGER) : 1;
        if (generation === null) return null;
        const mapIdField = field(args, ["mapId"]);
        const mapId = descriptorInput && mapIdField.present
            ? integer(mapIdField.value, 0, MAX_ID) : 0;
        if (mapId === null) return null;

        // A model effect's anchor: the plane sits on the target's model at
        // a part (or its origin) plus an offset, in the model's own units.
        const anchorRaw = args.anchor && typeof args.anchor === "object" ? args.anchor : null;
        const anchor = anchorRaw ? {
            part: anchorRaw.part ? String(anchorRaw.part) : "",
            offset: [0, 1, 2].map(i => {
                const list = Array.isArray(anchorRaw.offset) ? anchorRaw.offset : [];
                const value = Number(list[i]);
                return Number.isFinite(value) ? value : 0;
            }),
            // The plane's size in the model's units, when it is a model effect.
            size: Array.isArray(anchorRaw.size) && Number(anchorRaw.size[0]) > 0 && Number(anchorRaw.size[1]) > 0
                ? [Number(anchorRaw.size[0]), Number(anchorRaw.size[1])] : null
        } : null;

        return {
            _reactorVideoDescriptor: DESCRIPTOR_VERSION,
            id: id, mapId: mapId, generation: generation, file: file,
            target: target, eventId: eventId || 0,
            anchor: anchor,
            x: x.value, y: y.value, z: z.value,
            width: width.value, height: height.value,
            corners: corners.map(item => ({ x: item.x, y: item.y })),
            customCorners: customField.value,
            rotationX: rx.value, rotationY: ry.value, rotationZ: rz.value,
            scaleX: scaleX.value, scaleY: scaleY.value,
            opacity: opacity, loop: loop.value, muted: muted.value,
            volume: volume, playbackRate: rate.value,
            layer: layer, depth: depth.value, cullDistance: cull.value,
            scanlines: scanlines.value, wait: wait.value,
            ended: ended.value, waitReleased: waitReleased.value,
            currentTime: currentTime.value
        };
    }

    function copyDescriptor(value) {
        return Object.assign({}, value, {
            corners: value.corners.map(item => ({ x: item.x, y: item.y }))
        });
    }

    function normalizeTransformArgs(raw, current, interpreter) {
        if (!current) return null;
        const args = commandArgs(raw);
        const idField = field(args, ["id", "surfaceId", "videoId"]);
        const id = idField.present ? integer(idField.value, 1, MAX_ID) : null;
        if (id === null || id !== current.id) return null;
        const merged = copyDescriptor(current);
        delete merged._reactorVideoDescriptor;
        merged.opacity = current.opacity * 255;
        merged.volume = current.volume * 100;
        const mappings = [
            ["target", ["target", "bindTo"]], ["eventId", ["eventId", "event"]],
            ["x", ["x", "xOffset"]], ["y", ["y", "yOffset"]],
            ["z", ["z", "elevation"]], ["width", ["width", "sizeX"]],
            ["height", ["height", "sizeY"]], ["rotationX", ["rotationX", "rotateX"]],
            ["rotationY", ["rotationY", "rotateY"]],
            ["rotationZ", ["rotationZ", "rotateZ", "rotation"]],
            ["scaleX", ["scaleX"]], ["scaleY", ["scaleY"]],
            ["loop", ["loop", "repeat"]],
            ["muted", ["muted"]], ["volume", ["volume", "audioVolume"]],
            ["playbackRate", ["playbackRate", "rate"]], ["layer", ["layer", "zIndex"]],
            ["depth", ["depth"]],
            ["cullDistance", ["cullDistance", "cullingDistance", "bufferDistance"]],
            ["scanlines", ["scanlines"]]
        ];
        for (const mapping of mappings) {
            const found = field(args, mapping[1]);
            if (found.present) merged[mapping[0]] = found.value;
        }
        const opacity = field(args, ["opacity"]);
        const alpha = field(args, ["alpha"]);
        if (opacity.present) {
            merged.opacity = opacity.value;
            delete merged.alpha;
        } else if (alpha.present) {
            delete merged.opacity;
            merged.alpha = alpha.value;
        }
        const audio = field(args, ["audio", "audible"]);
        if (audio.present && !field(args, ["muted"]).present) {
            const audible = booleanValue(audio.value);
            if (audible === null) return null;
            merged.muted = !audible;
        }

        const sizeChanged = field(args, ["width", "sizeX", "height", "sizeY"]).present;
        if (hasCornerInput(args)) {
            const corners = field(args, ["corners", "fourCorners"]);
            if (corners.present) merged.corners = corners.value;
            else delete merged.corners;
            for (const key of ["x0", "y0", "x1", "y1", "x2", "y2", "x3", "y3",
                "topLeftX", "topLeftY", "topRightX", "topRightY",
                "bottomRightX", "bottomRightY", "bottomLeftX", "bottomLeftY",
                "corner0X", "corner0Y", "corner1X", "corner1Y", "corner2X",
                "corner2Y", "corner3X", "corner3Y"]) {
                if (own(args, key)) merged[key] = args[key];
            }
            merged.customCorners = true;
        } else if (sizeChanged && !current.customCorners) {
            delete merged.corners;
            merged.customCorners = false;
        }
        const normalized = normalizeShowArgs(merged, interpreter);
        if (!normalized) return null;
        normalized.generation = current.generation;
        normalized.mapId = current.mapId;
        normalized.file = current.file;
        normalized.wait = current.wait;
        normalized.ended = current.ended;
        normalized.waitReleased = current.waitReleased;
        return normalized;
    }

    function normalizeStopArgs(raw) {
        const args = commandArgs(raw);
        const found = field(args, ["id", "surfaceId", "videoId"]);
        return found.present ? integer(found.value, 1, MAX_ID) : null;
    }

    function mapIdOf(map) {
        if (!map) return 0;
        const value = typeof map.mapId === "function" ? map.mapId() : map._mapId;
        return integer(value, 0, MAX_ID) || 0;
    }

    function currentMap() {
        return typeof $gameMap !== "undefined" ? $gameMap : null;
    }

    function currentDataMap() {
        return typeof $dataMap !== "undefined" ? $dataMap : null;
    }

    function currentPlayer() {
        return typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
    }

    function currentGraphics() {
        return typeof Graphics !== "undefined" ? Graphics : { width: 816, height: 624 };
    }

    function destroyPixiObject(object) {
        if (!object) return;
        if (object.parent && object.parent.removeChild) object.parent.removeChild(object);
        if (object.destroy) object.destroy({ children: false, texture: false, textureSource: false });
    }

    function destroyPixiMesh(mesh) {
        if (!mesh) return;
        const geometry = mesh.geometry;
        destroyPixiObject(mesh);
        if (geometry && typeof geometry.destroy === "function") geometry.destroy();
    }

    function dispose(object) {
        if (object && typeof object.dispose === "function") object.dispose();
    }

    class VideoSurfaceOwner {
        constructor(manager, descriptor, spriteset) {
            this.manager = manager;
            this.id = descriptor.id;
            this.generation = descriptor.generation;
            this.descriptor = descriptor;
            this.spriteset = spriteset;
            this.cleaned = false;
            this.started = false;
            this.listeners = [];
            try {
                this.createVideo();
                this.attach(spriteset);
            } catch (error) {
                this.cleanup("error");
                throw error;
            }
        }

        current() {
            return !this.cleaned && this.manager.isCurrent(this.id, this.generation);
        }

        listen(target, type, callback, options) {
            target.addEventListener(type, callback, options);
            this.listeners.push({ target: target, type: type, callback: callback, options: options });
        }

        createVideo() {
            if (typeof document === "undefined" || !document.createElement) return;
            const video = document.createElement("video");
            this.video = video;
            video.preload = "auto";
            video.playsInline = true;
            video.setAttribute("playsinline", "");
            video.setAttribute("webkit-playsinline", "");
            video.loop = this.descriptor.loop;
            video.muted = this.descriptor.muted;
            video.defaultMuted = this.descriptor.muted;
            video.playbackRate = this.descriptor.playbackRate;
            video.src = movieUrl(this.descriptor.file);
            this.listen(video, "ended", () => {
                if (this.current()) this.manager.ended(this.id, this.generation);
            });
            this.listen(video, "error", event => {
                if (this.current()) this.manager.failed(this.id, this.generation, event);
            });
            this.listen(video, "abort", event => {
                if (this.current() && !this.cleaned) this.manager.failed(this.id, this.generation, event);
            });
            this.updateAudio();
        }

        attach(spriteset) {
            if (this.cleaned || !this.video || !spriteset || this.backend) return false;
            this.spriteset = spriteset;
            const backend = this.desiredBackend(this.descriptor);
            if (backend === "three") {
                const state = spriteset._reactor3d;
                this.attachThree(state);
            } else if (backend === "pixi") {
                if (typeof PIXI === "undefined") return false;
                this.attachPixi(spriteset);
            } else {
                return false;
            }
            this.attachmentKey = this.attachmentKeyFor(this.descriptor);
            this.startPlayback();
            return true;
        }

        desiredBackend(descriptor) {
            if (descriptor.target === "screen" || !this.mapWants3D()) return "pixi";
            if (this.spriteset && this.spriteset._reactor3d && typeof THREE !== "undefined") {
                return "three";
            }
            if (this.spriteset && this.spriteset._reactor3dFailed) return "pixi";
            return null;
        }

        attachmentKeyFor(descriptor) {
            const backend = this.desiredBackend(descriptor);
            if (backend === "pixi") return "pixi:" + (descriptor.target === "screen" ? "screen" : "map");
            if (backend === "three") return "three:" + (descriptor.layer >= 5 ? "above" : "world");
            return "pending";
        }

        needsRecreate(descriptor) {
            return !!this.backend && this.attachmentKey !== this.attachmentKeyFor(descriptor);
        }

        mapWants3D() {
            if (typeof Reactor3D === "undefined") return false;
            if (Reactor3D.shouldRender3D) return Reactor3D.shouldRender3D(currentDataMap());
            return !!(Reactor3D.isMap3D && Reactor3D.isMap3D(currentDataMap()));
        }

        startPlayback() {
            if (this.started || !this.video) return;
            this.started = true;
            if (this.videoSource && this.videoSource.load) {
                // The element began loading when its src was set. PIXI's
                // load() restarts that load unless the metadata is already
                // in, and the restart fires "abort", which reads as failure.
                // So wait for the element first; PIXI then resolves at once.
                const loadSource = () => {
                    Promise.resolve(this.videoSource.load()).then(() => {
                        if (this.current()) this.restoreAndPlay();
                    }).catch(error => {
                        if (this.current()) this.manager.failed(this.id, this.generation, error);
                    });
                };
                if (this.video.readyState >= 1 && this.video.videoWidth > 0) loadSource();
                else this.listen(this.video, "loadedmetadata", () => {
                    if (this.current()) loadSource();
                }, { once: true });
            } else {
                try { this.video.load(); } catch (error) {
                    this.manager.failed(this.id, this.generation, error);
                    return;
                }
                if (this.video.readyState >= 1) this.restoreAndPlay();
                else this.listen(this.video, "loadedmetadata", () => {
                    if (this.current()) this.restoreAndPlay();
                }, { once: true });
            }
        }

        restoreAndPlay() {
            if (!this.video || this.cleaned) return;
            const time = finiteNumber(this.descriptor.currentTime, 0, Number.MAX_SAFE_INTEGER) || 0;
            if (time > 0) {
                try {
                    const duration = Number(this.video.duration);
                    this.video.currentTime = Number.isFinite(duration) && duration > 0
                        ? Math.min(time, Math.max(0, duration - 0.001)) : time;
                } catch (error) { /* metadata may still be incomplete on a browser edge case */ }
            }
            this.play();
        }

        autoplayBlocked(error) {
            return !!error && (error.name === "NotAllowedError"
                || /notallowed|user gesture|user activation/i.test(String(error.message || error)));
        }

        play() {
            if (!this.video || this.cleaned) return;
            let result;
            try {
                result = this.video.play();
            } catch (error) {
                if (this.current() && this.autoplayBlocked(error)) this.awaitingGesture = true;
                else if (this.current()) this.manager.failed(this.id, this.generation, error);
                return;
            }
            if (result && typeof result.then === "function") {
                result.then(() => {
                    if (this.current()) this.awaitingGesture = false;
                }).catch(error => {
                    if (!this.current()) return;
                    if (this.autoplayBlocked(error)) {
                        this.awaitingGesture = true;
                        return;
                    }
                    this.manager.failed(this.id, this.generation, error);
                });
            }
        }

        retryPlayback() {
            if (!this.awaitingGesture || !this.current()) return;
            this.awaitingGesture = false;
            this.play();
        }

        attachPixi(spriteset) {
            const source = new PIXI.VideoSource({
                resource: this.video, width: 1, height: 1,
                autoLoad: false, autoPlay: false, updateFPS: 0
            });
            const onSourceError = event => {
                if (this.current()) this.manager.failed(this.id, this.generation, event);
            };
            if (source.on) source.on("error", onSourceError);
            this.videoSourceError = onSourceError;
            this.videoSource = source;
            this.pixiTexture = new PIXI.Texture({ source: source, dynamic: true });
            this.pixiContainer = new PIXI.Container();
            this.pixiMesh = new PIXI.PerspectiveMesh({ texture: this.pixiTexture });
            this.pixiContainer.addChild(this.pixiMesh);
            this.backend = "pixi";
            this.syncPixiScanlines();
            const screen = this.descriptor.target === "screen";
            const parent = screen ? (spriteset._baseSprite || spriteset) : spriteset._tilemap;
            if (!parent || !parent.addChild) throw new Error("Video surface has no PIXI map container");
            if (screen && own(parent, "sortableChildren")) parent.sortableChildren = true;
            parent.addChild(this.pixiContainer);
            this.applyDescriptor(this.descriptor, true);
        }

        createPixiScanline() {
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.min(2048, Math.round(this.descriptor.width)));
            canvas.height = Math.max(1, Math.min(2048, Math.round(this.descriptor.height)));
            const context = canvas.getContext("2d");
            context.fillStyle = "rgba(0,0,0," + (this.descriptor.scanlines * 0.5) + ")";
            // One dark line every other pixel, the classic CRT pitch.
            for (let y = 0; y < canvas.height; y += 2) context.fillRect(0, y, canvas.width, 1);
            this.scanlineCanvas = canvas;
            this.scanlineSource = new PIXI.CanvasSource({ resource: canvas });
            this.scanlineTexture = new PIXI.Texture({ source: this.scanlineSource });
            this.scanlineMesh = new PIXI.PerspectiveMesh({ texture: this.scanlineTexture });
            this.scanlineMesh.blendMode = "multiply";
            this.pixiContainer.addChild(this.scanlineMesh);
        }

        destroyPixiScanline() {
            destroyPixiMesh(this.scanlineMesh);
            this.scanlineMesh = null;
            if (this.scanlineTexture && this.scanlineTexture.destroy) this.scanlineTexture.destroy(true);
            this.scanlineTexture = null;
            this.scanlineSource = null;
            this.scanlineCanvas = null;
        }

        syncPixiScanlines() {
            if (this.descriptor.scanlines && !this.scanlineMesh) this.createPixiScanline();
            if (!this.descriptor.scanlines && this.scanlineMesh) this.destroyPixiScanline();
        }

        attachThree(state) {
            const texture = new THREE.VideoTexture(this.video);
            texture.generateMipmaps = false;
            if (THREE.LinearFilter) {
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
            }
            if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
            this.threeTexture = texture;
            this.threeGeometry = this.makeThreeGeometry();
            this.threeMaterial = new THREE.MeshBasicMaterial({
                map: texture, transparent: true, opacity: this.descriptor.opacity,
                side: THREE.DoubleSide, depthTest: true, depthWrite: this.descriptor.opacity >= 1,
                forceSinglePass: true
            });
            this.threeMesh = new THREE.Mesh(this.threeGeometry, this.threeMaterial);
            const group = this.threeGroup(state, this.descriptor);
            if (!group) throw new Error("Video surface has no Reactor3D world group");
            group.add(this.threeMesh);
            this.threeState = state;
            this.backend = "three";
            this.syncThreeScanlines(group);
            this.applyDescriptor(this.descriptor, true);
        }

        threeGroup(state, descriptor) {
            const scene = state && state.scene;
            if (!scene) return null;
            if (descriptor.layer >= 5) {
                const group = scene.aboveBillboardsGroup
                    ? scene.aboveBillboardsGroup()
                    : (scene.aboveGroup && scene.aboveGroup());
                this.ensureUpperPass(state, scene);
                return group;
            }
            return scene.modelsGroup && scene.modelsGroup();
        }

        ensureUpperPass(state, scene) {
            const spriteset = this.spriteset;
            if (!spriteset || spriteset._reactor3dAbove
                || typeof spriteset.createReactor3DSprite !== "function") return;
            const hadOwn = own(scene, "hasAbove");
            const original = scene.hasAbove;
            scene.hasAbove = () => true;
            try {
                spriteset.createReactor3DSprite(state.viewport, scene);
            } finally {
                if (hadOwn) scene.hasAbove = original;
                else delete scene.hasAbove;
            }
        }

        worldSize() {
            const map = currentMap();
            const tw = map && map.tileWidth ? map.tileWidth() : 48;
            const th = map && map.tileHeight ? map.tileHeight() : 48;
            return { width: this.descriptor.width / tw, height: this.descriptor.height / th };
        }

        makeThreeGeometry() {
            const size = this.worldSize();
            return new THREE.PlaneGeometry(size.width, size.height);
        }

        createThreeScanline(group) {
            const canvas = document.createElement("canvas");
            canvas.width = 2;
            canvas.height = 2;
            const context = canvas.getContext("2d");
            context.fillStyle = "rgba(0,0,0," + (this.descriptor.scanlines * 0.5) + ")";
            context.fillRect(0, 0, 2, 1);
            const texture = new THREE.CanvasTexture(canvas);
            if (THREE.RepeatWrapping) {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
            }
            if (texture.repeat && texture.repeat.set) {
                texture.repeat.set(Math.max(1, this.descriptor.width * Math.abs(this.descriptor.scaleX) / 2),
                    Math.max(1, this.descriptor.height * Math.abs(this.descriptor.scaleY) / 2));
            }
            texture.needsUpdate = true;
            const material = new THREE.MeshBasicMaterial({
                map: texture, transparent: true, opacity: 1, side: THREE.DoubleSide,
                depthTest: true, depthWrite: false, polygonOffset: true,
                polygonOffsetFactor: -2, polygonOffsetUnits: -2,
                forceSinglePass: true
            });
            const geometry = this.makeThreeGeometry();
            const mesh = new THREE.Mesh(geometry, material);
            group.add(mesh);
            this.threeScanCanvas = canvas;
            this.threeScanTexture = texture;
            this.threeScanMaterial = material;
            this.threeScanGeometry = geometry;
            this.threeScanMesh = mesh;
        }

        destroyThreeScanline() {
            if (this.threeScanMesh && this.threeScanMesh.parent) {
                this.threeScanMesh.parent.remove(this.threeScanMesh);
            }
            dispose(this.threeScanGeometry);
            dispose(this.threeScanMaterial);
            dispose(this.threeScanTexture);
            this.threeScanMesh = null;
            this.threeScanGeometry = null;
            this.threeScanMaterial = null;
            this.threeScanTexture = null;
            this.threeScanCanvas = null;
        }

        syncThreeScanlines(group) {
            if (this.descriptor.scanlines && !this.threeScanMesh) this.createThreeScanline(group);
            if (!this.descriptor.scanlines && this.threeScanMesh) this.destroyThreeScanline();
        }

        updateAudio() {
            const video = this.video;
            if (!video) return;
            video.loop = this.descriptor.loop;
            video.muted = this.descriptor.muted;
            video.defaultMuted = this.descriptor.muted;
            video.playbackRate = this.descriptor.playbackRate;
            if (!this.descriptor.muted) this.ensureAudioRoute();
            if (this.gainNode && this.gainNode.gain) this.gainNode.gain.value = this.descriptor.volume;
            video.volume = this.audioSourceNode ? 1 : this.descriptor.volume;
        }

        ensureAudioRoute() {
            if (this.audioSourceNode || typeof WebAudio === "undefined") return;
            const context = WebAudio._context;
            const master = WebAudio._masterGainNode;
            if (!context || !master || !context.createMediaElementSource || !context.createGain) return;
            let source = null;
            let gain = null;
            try {
                source = context.createMediaElementSource(this.video);
                gain = context.createGain();
                gain.gain.value = this.descriptor.volume;
                source.connect(gain);
                gain.connect(master);
                this.audioSourceNode = source;
                this.gainNode = gain;
            } catch (error) {
                try { if (source) source.disconnect(); } catch (disconnectError) { /* partial route */ }
                try { if (gain) gain.disconnect(); } catch (disconnectError) { /* partial route */ }
                console.warn("RPGReactor video surface audio could not be routed.", error);
            }
        }

        character() {
            const map = currentMap();
            if (this.descriptor.target === "event") {
                return map && map.event ? map.event(this.descriptor.eventId) : null;
            }
            return this.descriptor.target === "player" ? currentPlayer() : null;
        }

        transformedCorners() {
            const rx = this.descriptor.rotationX * DEG;
            const ry = this.descriptor.rotationY * DEG;
            const rz = this.descriptor.rotationZ * DEG;
            const sx = Math.sin(rx), cx = Math.cos(rx);
            const sy = Math.sin(ry), cy = Math.cos(ry);
            const sz = Math.sin(rz), cz = Math.cos(rz);
            const distance = Math.max(this.descriptor.width, this.descriptor.height, 1) * 4;
            return this.descriptor.corners.map(corner => {
                let x = corner.x * this.descriptor.scaleX;
                let y = corner.y * this.descriptor.scaleY * cx;
                let z = corner.y * this.descriptor.scaleY * sx;
                const nx = x * cy + z * sy;
                z = -x * sy + z * cy;
                x = nx;
                const px = x * cz - y * sz;
                const py = x * sz + y * cz;
                const scale = distance / Math.max(distance * 0.1, distance + z);
                return { x: px * scale, y: py * scale };
            });
        }

        setPixiCorners(mesh, corners) {
            if (!mesh || !mesh.setCorners) return;
            mesh.setCorners(corners[0].x, corners[0].y, corners[1].x, corners[1].y,
                corners[2].x, corners[2].y, corners[3].x, corners[3].y);
        }

        applyDescriptor(descriptor, forceGeometry) {
            if (this.cleaned) return;
            const old = this.descriptor;
            this.descriptor = descriptor;
            this.updateAudio();
            if (this.backend === "pixi") {
                if (this.scanlineMesh && old && (old.scanlines !== descriptor.scanlines
                    || old.width !== descriptor.width || old.height !== descriptor.height)) {
                    this.destroyPixiScanline();
                }
                this.syncPixiScanlines();
                const corners = this.transformedCorners();
                this.setPixiCorners(this.pixiMesh, corners);
                this.setPixiCorners(this.scanlineMesh, corners);
                this.pixiContainer.alpha = descriptor.opacity;
                this.pixiContainer.z = descriptor.layer + descriptor.depth / 10000;
                this.pixiContainer.zIndex = descriptor.layer + descriptor.depth / 10000;
            } else if (this.backend === "three") {
                if (this.threeScanMesh && old && (old.scanlines !== descriptor.scanlines
                    || old.width !== descriptor.width || old.height !== descriptor.height
                    || old.scaleX !== descriptor.scaleX || old.scaleY !== descriptor.scaleY)) {
                    this.destroyThreeScanline();
                }
                const resized = forceGeometry || !old || old.width !== descriptor.width
                    || old.height !== descriptor.height;
                if (resized) {
                    const geometry = this.makeThreeGeometry();
                    dispose(this.threeGeometry);
                    this.threeGeometry = geometry;
                    this.threeMesh.geometry = geometry;
                    if (this.threeScanMesh) {
                        const scanGeometry = this.makeThreeGeometry();
                        dispose(this.threeScanGeometry);
                        this.threeScanGeometry = scanGeometry;
                        this.threeScanMesh.geometry = scanGeometry;
                    }
                }
                this.syncThreeScanlines(this.threeMesh.parent);
                this.threeMaterial.opacity = descriptor.opacity;
                this.threeMaterial.transparent = descriptor.opacity < 1;
                this.threeMaterial.depthWrite = descriptor.opacity >= 1;
                this.threeMaterial.needsUpdate = true;
                this.threeMesh.renderOrder = descriptor.layer * 1000 + descriptor.depth;
                if (this.threeScanMesh) this.threeScanMesh.renderOrder = this.threeMesh.renderOrder + 1;
            }
            this.update();
        }

        updatePixiPosition() {
            const descriptor = this.descriptor;
            const map = currentMap();
            const character = this.character();
            let x;
            let y;
            if (descriptor.target === "screen") {
                x = descriptor.x;
                y = descriptor.y;
            } else if (character) {
                x = (character.screenX ? character.screenX() : 0) + descriptor.x;
                y = (character.screenY ? character.screenY() : 0) + descriptor.y;
            } else if (descriptor.target === "map" && map) {
                const tw = map.tileWidth ? map.tileWidth() : 48;
                const th = map.tileHeight ? map.tileHeight() : 48;
                const adjustedX = map.adjustX ? map.adjustX(descriptor.x) : descriptor.x;
                const adjustedY = map.adjustY ? map.adjustY(descriptor.y) : descriptor.y;
                x = adjustedX * tw + tw / 2;
                y = adjustedY * th + th / 2;
            } else {
                this.pixiContainer.visible = false;
                return;
            }
            // Map, event and player surfaces stand on their anchor, as they
            // do in 3D. Z is 3D elevation only: in 2D the dragged position is
            // the whole placement. Screen surfaces are centered on their
            // pixel position.
            if (descriptor.target !== "screen") {
                y -= descriptor.height * Math.abs(descriptor.scaleY) / 2;
            }
            this.pixiContainer.position.set(x, y);
            const graphics = currentGraphics();
            const margin = descriptor.cullDistance;
            const corners = this.transformedCorners();
            const xs = corners.map(item => item.x + x);
            const ys = corners.map(item => item.y + y);
            this.pixiContainer.visible = margin <= 0 || !(Math.max(...xs) < -margin
                || Math.min(...xs) > graphics.width + margin || Math.max(...ys) < -margin
                || Math.min(...ys) > graphics.height + margin);
        }

        updateThreePosition() {
            const descriptor = this.descriptor;
            const map = currentMap();
            const character = this.character();
            const camera = this.threeState && this.threeState.camera;
            let x = descriptor.x + 0.5;
            let y = descriptor.z;
            let z = descriptor.y + 0.5;
            const holder = descriptor.anchor && character && typeof Reactor3D !== "undefined"
                && Reactor3D.modelHolderFor ? Reactor3D.modelHolderFor(character) : null;
            if (holder && holder.object && Reactor3D.effectAnchorWorld) {
                // On the model: the anchor's world point, turned with the
                // model, sized by the surface's own scale.
                const world = Reactor3D.effectAnchorWorld(holder.object, { anchor: descriptor.anchor }, new THREE.Vector3());
                const meshes = [this.threeMesh, this.threeScanMesh].filter(Boolean);
                const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                    descriptor.rotationX * DEG, descriptor.rotationY * DEG, descriptor.rotationZ * DEG, "YXZ"));
                const modelTurn = holder.object.getWorldQuaternion(new THREE.Quaternion());
                // Sized in the model's units: the plane's own geometry is in
                // tiles, so it is scaled to (units × the model's world scale).
                let sx = descriptor.scaleX, sy = descriptor.scaleY;
                if (descriptor.anchor.size) {
                    const worldScale = holder.object.getWorldScale(new THREE.Vector3());
                    const size = this.worldSize();
                    if (size.width > 0 && size.height > 0) {
                        sx = descriptor.anchor.size[0] * worldScale.x / size.width * descriptor.scaleX;
                        sy = descriptor.anchor.size[1] * worldScale.y / size.height * descriptor.scaleY;
                    }
                }
                for (const mesh of meshes) {
                    mesh.position.copy(world);
                    mesh.quaternion.copy(modelTurn).multiply(turn);
                    mesh.scale.set(sx, sy, 1);
                    mesh.visible = true;
                }
                return;
            }
            if (character) {
                const tw = map && map.tileWidth ? map.tileWidth() : 48;
                const th = map && map.tileHeight ? map.tileHeight() : 48;
                if (typeof Reactor3D !== "undefined" && Reactor3D.standingPlaceFor
                    && Reactor3D.pointOf) {
                    const stand = Reactor3D.standingPlaceFor(character);
                    const at = Reactor3D.pointOf(camera, character._realX + 0.5, stand);
                    x = at.x + descriptor.x / tw;
                    y = at.y + descriptor.z;
                    z = at.z + descriptor.y / th;
                } else {
                    x = character._realX + 0.5 + descriptor.x / tw;
                    y = descriptor.z;
                    z = character._realY + 0.5 + descriptor.y / th;
                }
            } else if (descriptor.target === "map") {
                const elevation = typeof Reactor3D !== "undefined" && Reactor3D.elevationAt
                    ? Reactor3D.elevationAt(currentDataMap(), Math.round(descriptor.x),
                        Math.round(descriptor.y)) : 0;
                y = elevation + descriptor.z;
            } else {
                this.threeMesh.visible = false;
                if (this.threeScanMesh) this.threeScanMesh.visible = false;
                return;
            }
            const size = this.worldSize();
            y += size.height * Math.abs(descriptor.scaleY) / 2;
            // Depth is the 3D forward/back control: tiles toward the camera.
            // The 2D placement (feet row) is the reference and stays put.
            z += descriptor.depth;
            const meshes = [this.threeMesh, this.threeScanMesh].filter(Boolean);
            for (const mesh of meshes) {
                mesh.position.set(x, y, z);
                mesh.rotation.set(descriptor.rotationX * DEG, descriptor.rotationY * DEG,
                    descriptor.rotationZ * DEG);
                mesh.scale.set(descriptor.scaleX, descriptor.scaleY, 1);
            }
            let visible = true;
            if (descriptor.cullDistance > 0 && camera && camera.position) {
                const dx = camera.position.x - x;
                const dy = camera.position.y - y;
                const dz = camera.position.z - z;
                const radius = Math.hypot(size.width * descriptor.scaleX,
                    size.height * descriptor.scaleY) / 2;
                visible = Math.hypot(dx, dy, dz) <= descriptor.cullDistance + radius;
            }
            for (const mesh of meshes) mesh.visible = visible;
        }

        update() {
            if (this.cleaned) return;
            this.captureCurrentTime(this.descriptor);
            if (!this.backend) {
                this.attach(this.spriteset);
                return;
            }
            if (this.backend === "pixi") this.updatePixiPosition();
            if (this.backend === "three") this.updateThreePosition();
        }

        captureCurrentTime(descriptor) {
            const target = descriptor || this.descriptor;
            const time = this.video && Number(this.video.currentTime);
            if (target && Number.isFinite(time) && time >= 0) target.currentTime = time;
        }

        cleanup(reason) {
            if (this.cleaned) return;
            const terminal = reason !== "suspend" && reason !== "recreate";
            this.captureCurrentTime(this.manager.descriptor(this.id) || this.descriptor);
            this.cleaned = true;
            for (const item of this.listeners.splice(0)) {
                item.target.removeEventListener(item.type, item.callback, item.options);
            }
            if (this.videoSource && this.videoSourceError && this.videoSource.off) {
                this.videoSource.off("error", this.videoSourceError);
            }

            this.destroyPixiScanline();
            destroyPixiMesh(this.pixiMesh);
            this.pixiMesh = null;
            destroyPixiObject(this.pixiContainer);
            this.pixiContainer = null;
            if (this.pixiTexture && this.pixiTexture.destroy) this.pixiTexture.destroy(true);
            this.pixiTexture = null;
            this.videoSource = null;

            this.destroyThreeScanline();
            if (this.threeMesh && this.threeMesh.parent) this.threeMesh.parent.remove(this.threeMesh);
            dispose(this.threeGeometry);
            dispose(this.threeMaterial);
            dispose(this.threeTexture);
            this.threeMesh = null;
            this.threeGeometry = null;
            this.threeMaterial = null;
            this.threeTexture = null;

            if (this.audioSourceNode) {
                try { this.audioSourceNode.disconnect(); } catch (error) { /* already disconnected */ }
            }
            if (this.gainNode) {
                try { this.gainNode.disconnect(); } catch (error) { /* already disconnected */ }
            }
            this.audioSourceNode = null;
            this.gainNode = null;

            if (this.video) {
                try { this.video.pause(); } catch (error) { /* media already gone */ }
                try {
                    this.video.removeAttribute("src");
                    this.video.src = "";
                    this.video.load();
                } catch (error) { /* teardown must remain idempotent */ }
            }
            this.video = null;
            if (terminal) this.manager.releaseWaiters(this.id, this.generation, reason || "teardown");
        }
    }

    class VideoSurfaceManager {
        constructor() {
            this._owners = new Map();
            this._waiters = new Map();
            this._spriteset = null;
        }

        store(map, create) {
            if (!map) return null;
            const mapId = mapIdOf(map);
            let store = map[STORE_KEY];
            const valid = store && typeof store === "object" && !Array.isArray(store)
                && store.mapId === mapId && store.surfaces
                && typeof store.surfaces === "object" && !Array.isArray(store.surfaces);
            if (!valid && create) {
                store = { mapId: mapId, serial: 0, surfaces: {} };
                map[STORE_KEY] = store;
            }
            return valid || create ? store : null;
        }

        descriptor(id) {
            const store = this.store(currentMap(), false);
            return store && store.surfaces[String(id)] || null;
        }

        isCurrent(id, generation) {
            const descriptor = this.descriptor(id);
            return !!descriptor && descriptor.generation === generation;
        }

        waitKey(id, generation) {
            return id + ":" + generation;
        }

        armWait(interpreter, descriptor) {
            if (!interpreter || !descriptor || !this.hasActiveMapSpriteset()) return false;
            descriptor.waitReleased = false;
            const key = this.waitKey(descriptor.id, descriptor.generation);
            if (!this._waiters.has(key)) this._waiters.set(key, new Set());
            this._waiters.get(key).add(interpreter);
            interpreter._reactorVideoSurfaceWait = {
                mapId: descriptor.mapId, id: descriptor.id, generation: descriptor.generation
            };
            if (typeof interpreter.setWaitMode === "function") interpreter.setWaitMode(WAIT_MODE);
            else interpreter._waitMode = WAIT_MODE;
            return true;
        }

        hasActiveMapSpriteset() {
            if (typeof SceneManager !== "undefined" && typeof Scene_Map !== "undefined") {
                const scene = SceneManager._scene;
                if (!(scene instanceof Scene_Map)) return false;
                const spriteset = scene._spriteset || this._spriteset;
                if (!spriteset) return false;
                if (typeof Spriteset_Map !== "undefined" && !(spriteset instanceof Spriteset_Map)) {
                    return false;
                }
                if (this._spriteset && this._spriteset !== spriteset) this.teardownRuntime("suspend");
                this._spriteset = spriteset;
                return true;
            }
            return !!this._spriteset;
        }

        retryPendingPlayback() {
            for (const owner of this._owners.values()) owner.retryPlayback();
        }

        releaseWaiters(id, generation) {
            const descriptor = this.descriptor(id);
            if (descriptor && descriptor.generation === generation) descriptor.waitReleased = true;
            const key = this.waitKey(id, generation);
            const waiters = this._waiters.get(key);
            if (waiters) {
                for (const interpreter of waiters) {
                    const token = interpreter._reactorVideoSurfaceWait;
                    if (token && token.id === id && token.generation === generation) {
                        interpreter._reactorVideoSurfaceWait = null;
                        if (interpreter._waitMode === WAIT_MODE) interpreter._waitMode = "";
                    }
                }
            }
            this._waiters.delete(key);
        }

        isWaiting(interpreter) {
            const token = interpreter && interpreter._reactorVideoSurfaceWait;
            if (!token || token.mapId !== mapIdOf(currentMap())) return false;
            const descriptor = this.descriptor(token.id);
            return !!descriptor && descriptor.generation === token.generation && !descriptor.ended
                && !descriptor.waitReleased;
        }

        show(raw, interpreter) {
            const descriptor = normalizeShowArgs(raw, interpreter);
            const map = currentMap();
            if (!descriptor || !map) {
                console.warn("RPGReactor video surface command was ignored because its descriptor or target is invalid.");
                return null;
            }
            const store = this.store(map, true);
            const old = store.surfaces[String(descriptor.id)];
            if (old) this.releaseWaiters(old.id, old.generation, "replacement");
            const owner = this._owners.get(descriptor.id);
            if (owner) owner.cleanup("replacement");
            this._owners.delete(descriptor.id);
            store.serial = Math.max(integer(store.serial, 0, Number.MAX_SAFE_INTEGER) || 0,
                old && old.generation || 0) + 1;
            descriptor.generation = store.serial;
            descriptor.mapId = store.mapId;
            store.surfaces[String(descriptor.id)] = descriptor;
            if (this.hasActiveMapSpriteset()) this.createOwner(descriptor);
            if (!this.isCurrent(descriptor.id, descriptor.generation)) return null;
            if (descriptor.wait && !this.armWait(interpreter, descriptor)) {
                descriptor.wait = false;
                descriptor.waitReleased = true;
                console.warn("RPGReactor video surface wait was not armed without an active map spriteset.");
            }
            return descriptor;
        }

        transform(raw, interpreter) {
            const id = normalizeStopArgs(raw);
            const current = id === null ? null : this.descriptor(id);
            const descriptor = normalizeTransformArgs(raw, current, interpreter);
            if (!descriptor) return null;
            const store = this.store(currentMap(), false);
            store.surfaces[String(id)] = descriptor;
            const owner = this._owners.get(id);
            if (owner && owner.generation === descriptor.generation) {
                try {
                    if (owner.needsRecreate(descriptor)) {
                        owner.captureCurrentTime(descriptor);
                        owner.cleanup("recreate");
                        this._owners.delete(id);
                        this.createOwner(descriptor);
                    } else {
                        owner.applyDescriptor(descriptor, false);
                    }
                } catch (error) {
                    this.failed(id, descriptor.generation, error);
                    return null;
                }
            }
            return descriptor;
        }

        stop(raw) {
            const id = typeof raw === "number" ? integer(raw, 1, MAX_ID) : normalizeStopArgs(raw);
            if (id === null) return false;
            const store = this.store(currentMap(), false);
            const descriptor = store && store.surfaces[String(id)];
            if (!descriptor) return false;
            delete store.surfaces[String(id)];
            this.releaseWaiters(id, descriptor.generation, "stop");
            const owner = this._owners.get(id);
            if (owner) owner.cleanup("stop");
            this._owners.delete(id);
            return true;
        }

        ended(id, generation) {
            if (!this.isCurrent(id, generation)) return;
            const descriptor = this.descriptor(id);
            if (descriptor.loop) return;
            descriptor.ended = true;
            this.releaseWaiters(id, generation, "ended");
        }

        failed(id, generation, error) {
            if (!this.isCurrent(id, generation)) return;
            console.error("RPGReactor video surface " + id + " failed.", error);
            this.stop(id);
        }

        createOwner(descriptor) {
            if (!this._spriteset || descriptor.ended || typeof document === "undefined") return null;
            let owner;
            try {
                owner = new VideoSurfaceOwner(this, descriptor, this._spriteset);
                this._owners.set(descriptor.id, owner);
                return owner;
            } catch (error) {
                if (owner) owner.cleanup("error");
                this.failed(descriptor.id, descriptor.generation, error);
                return null;
            }
        }

        updateSpriteset(spriteset) {
            if (!spriteset) return;
            if (this._spriteset && this._spriteset !== spriteset) this.teardownRuntime("suspend");
            this._spriteset = spriteset;
            const store = this.store(currentMap(), false);
            if (!store) return;
            for (const key of Object.keys(store.surfaces)) {
                const raw = store.surfaces[key];
                const descriptor = normalizeShowArgs(raw, null);
                if (!descriptor || descriptor.mapId !== store.mapId || descriptor.id !== Number(key)) {
                    delete store.surfaces[key];
                    continue;
                }
                store.surfaces[key] = descriptor;
                if (descriptor.ended) continue;
                let owner = this._owners.get(descriptor.id);
                if (!owner || owner.generation !== descriptor.generation) {
                    if (owner) owner.cleanup("replacement");
                    this._owners.delete(descriptor.id);
                    owner = this.createOwner(descriptor);
                }
                if (owner) {
                    owner.spriteset = spriteset;
                    if (owner.needsRecreate(descriptor)) {
                        owner.captureCurrentTime(descriptor);
                        owner.cleanup("recreate");
                        this._owners.delete(descriptor.id);
                        owner = this.createOwner(descriptor);
                    } else {
                        owner.descriptor = descriptor;
                        owner.update();
                    }
                }
            }
            for (const [id, owner] of Array.from(this._owners.entries())) {
                if (!store.surfaces[String(id)]) {
                    owner.cleanup("stop");
                    this._owners.delete(id);
                }
            }
        }

        teardownRuntime(reason) {
            const why = reason || "suspend";
            const terminal = why !== "suspend" && why !== "recreate";
            for (const owner of this._owners.values()) owner.cleanup(why);
            this._owners.clear();
            const store = this.store(currentMap(), false);
            if (terminal && store) {
                for (const descriptor of Object.values(store.surfaces)) {
                    this.releaseWaiters(descriptor.id, descriptor.generation, why);
                }
            }
            if (terminal && this._waiters.size) {
                for (const waiters of this._waiters.values()) {
                    for (const interpreter of waiters) {
                        interpreter._reactorVideoSurfaceWait = null;
                        if (interpreter._waitMode === WAIT_MODE) interpreter._waitMode = "";
                    }
                }
                this._waiters.clear();
            }
            this._spriteset = null;
        }

        removeForMapSetup(map) {
            this.teardownRuntime("transfer");
            const store = this.store(map, false);
            if (store) {
                for (const descriptor of Object.values(store.surfaces)) {
                    this.releaseWaiters(descriptor.id, descriptor.generation, "transfer");
                }
            }
            delete map[STORE_KEY];
        }
    }

    const manager = new VideoSurfaceManager();

    function registerCommands() {
        if (typeof PluginManager === "undefined" || !PluginManager.registerCommand
            || registerCommands.registered) return;
        registerCommands.registered = true;
        PluginManager.registerCommand(PLUGIN_NAME, "ShowVideoSurface", function(args) {
            manager.show(args, this);
        });
        PluginManager.registerCommand(PLUGIN_NAME, "TransformVideoSurface", function(args) {
            manager.transform(args, this);
        });
        PluginManager.registerCommand(PLUGIN_NAME, "StopVideoSurface", function(args) {
            manager.stop(args);
        });
    }

    function installHooks() {
        if (typeof DataManager !== "undefined" && DataManager.createGameObjects
            && !DataManager.createGameObjects.__reactorVideoSurfaces) {
            const baseCreateGameObjects = DataManager.createGameObjects;
            DataManager.createGameObjects = function() {
                manager.teardownRuntime("reset");
                return baseCreateGameObjects.apply(this, arguments);
            };
            DataManager.createGameObjects.__reactorVideoSurfaces = true;
        }

        if (typeof Game_Map !== "undefined" && Game_Map.prototype.setup
            && !Game_Map.prototype.setup.__reactorVideoSurfaces) {
            const baseSetup = Game_Map.prototype.setup;
            Game_Map.prototype.setup = function() {
                manager.removeForMapSetup(this);
                return baseSetup.apply(this, arguments);
            };
            Game_Map.prototype.setup.__reactorVideoSurfaces = true;
        }

        if (typeof Spriteset_Map !== "undefined" && Spriteset_Map.prototype.update
            && !Spriteset_Map.prototype.update.__reactorVideoSurfaces) {
            const baseUpdate = Spriteset_Map.prototype.update;
            Spriteset_Map.prototype.update = function() {
                manager.updateSpriteset(this);
                const result = baseUpdate.apply(this, arguments);
                manager.updateSpriteset(this);
                return result;
            };
            Spriteset_Map.prototype.update.__reactorVideoSurfaces = true;
        }

        if (typeof Spriteset_Map !== "undefined" && Spriteset_Map.prototype.destroy
            && !Spriteset_Map.prototype.destroy.__reactorVideoSurfaces) {
            const baseDestroy = Spriteset_Map.prototype.destroy;
            Spriteset_Map.prototype.destroy = function() {
                if (manager._spriteset === this) manager.teardownRuntime("suspend");
                return baseDestroy.apply(this, arguments);
            };
            Spriteset_Map.prototype.destroy.__reactorVideoSurfaces = true;
        }

        if (typeof Game_Interpreter !== "undefined" && Game_Interpreter.prototype.updateWaitMode
            && !Game_Interpreter.prototype.updateWaitMode.__reactorVideoSurfaces) {
            const baseWait = Game_Interpreter.prototype.updateWaitMode;
            Game_Interpreter.prototype.updateWaitMode = function() {
                if (this._waitMode === WAIT_MODE) {
                    const waiting = manager.isWaiting(this);
                    if (!waiting) {
                        this._waitMode = "";
                        this._reactorVideoSurfaceWait = null;
                    }
                    return waiting;
                }
                return baseWait.apply(this, arguments);
            };
            Game_Interpreter.prototype.updateWaitMode.__reactorVideoSurfaces = true;
        }

        if (typeof document !== "undefined" && document.addEventListener
            && !installHooks.gestureRetryInstalled) {
            installHooks.gestureRetryInstalled = true;
            const retry = event => {
                if (event && event.isTrusted === true) manager.retryPendingPlayback();
            };
            document.addEventListener("pointerdown", retry);
            document.addEventListener("keydown", retry);
            document.addEventListener("touchend", retry);
        }
    }

    const api = {
        PLUGIN_NAME: PLUGIN_NAME,
        STORE_KEY: STORE_KEY,
        WAIT_MODE: WAIT_MODE,
        sanitizeMoviePath: sanitizeMoviePath,
        movieUrl: movieUrl,
        normalizeShowArgs: normalizeShowArgs,
        normalizeTransformArgs: normalizeTransformArgs,
        normalizeStopArgs: normalizeStopArgs,
        VideoSurfaceOwner: VideoSurfaceOwner,
        VideoSurfaceManager: VideoSurfaceManager,
        manager: manager,
        registerCommands: registerCommands,
        installHooks: installHooks
    };

    root.RPGReactorVideoSurfaces = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    registerCommands();
    installHooks();
})(typeof globalThis !== "undefined" ? globalThis : this);
