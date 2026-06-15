//=============================================================================
// pixi_compat.js
//
// Re-exports PIXI v5/v6 APIs that were removed/changed in v7+, so legacy MZ
// plugins (e.g. UltraMode7) and the ES5-style corescript continue to work
// against newer PIXI versions.
//
// Load order: must run AFTER pixi(N).js and BEFORE any plugin or engine
// code that may rely on the legacy APIs.
//=============================================================================

(function() {
    if (typeof PIXI === "undefined") return;

    // -------------------------------------------------------------------------
    // v8 ships a `name` getter/setter on Container.prototype that delegates to
    // `label` (and emits a deprecation warning). MZ corescript later does
    //     Sprite_Name.prototype.name = function() {...}
    // intending to install a method. But JS property assignment walks the
    // prototype chain looking for setters, finds Container.prototype's `name`
    // setter, and INVOKES IT -- writing the function into
    // `Sprite_Name.prototype.label` instead of creating an own data property
    // for `name`. The method is silently lost.
    //
    // At runtime, `instance.name` then hits Container.prototype's getter,
    // returns `this.label` (the string "Sprite" set by v8 Sprite's ctor), and
    // `this.name()` throws "this.name is not a function".
    //
    // Delete the descriptor so prototype assignments behave like v5/v6/v7
    // (plain data property creation, no setter interception). Must run BEFORE
    // any corescript that defines `.name` methods on Sprite descendants.
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // (Removed) Container.prototype.updateTransform no-args wrap.
    // Letting the v8 setter throw on no-args calls preserves a useful side
    // effect: Window.updateTransform's `_updateFilterArea` -- which depends
    // on a worldTransform value v8 hasn't always computed by render time --
    // is skipped via the try/catch in our onRender patch, so window contents
    // aren't clipped to a stale filterArea. If a future use-case needs the
    // no-args call to succeed, reintroduce the wrap and find another way to
    // skip _updateFilterArea on v8.
    // -------------------------------------------------------------------------

    if (PIXI.Container && PIXI.Container.prototype) {
        const nameDesc = Object.getOwnPropertyDescriptor(
            PIXI.Container.prototype, "name"
        );
        if (nameDesc && (nameDesc.get || nameDesc.set)) {
            try {
                delete PIXI.Container.prototype.name;
            } catch (e) {
                // Non-configurable; try to neutralize instead.
                try {
                    Object.defineProperty(
                        PIXI.Container.prototype, "name",
                        { value: undefined, writable: true, configurable: true }
                    );
                } catch (e2) {}
            }
        }
    }

    // -------------------------------------------------------------------------
    // v8 split PIXI.Renderer into PIXI.WebGLRenderer and PIXI.WebGPURenderer
    // and no longer exposes a generic Renderer class. Legacy plugins still
    // reference PIXI.Renderer (for instanceof checks, for registerPlugin, etc.)
    // so we alias it back. Prefer WebGLRenderer when available.
    // -------------------------------------------------------------------------
    if (!PIXI.Renderer) {
        PIXI.Renderer = PIXI.WebGLRenderer || class RendererCompatStub {};
    }

    // -------------------------------------------------------------------------
    // v8 dropped the renderer.batch / renderer.geometry / renderer.state /
    // renderer.shader / renderer.framebuffer / renderer.projection subsystems
    // (replaced by renderTarget/encoder/etc. - v8 still has its own .texture
    // system). Legacy MZ code uses them around custom draws -- e.g.,
    // Sprite_Animation.onBeforeRender does
    //   renderer.batch.flush(); renderer.geometry.reset();
    // and onAfterRender resets several others. Without these, accessing
    // `renderer.batch.flush()` throws and the surrounding _render (e.g.,
    // Effekseer drawing) silently aborts.
    //
    // We can't install these as prototype getters because v8's WebGLRenderer
    // registers its own systems by name at init (e.g., `texture`) and will
    // throw "name already in use" if the property already exists on the
    // prototype. Instead, expose a helper that installs the stubs on the
    // renderer INSTANCE after init. Call it from reactor_core.js after
    // `await app.init(...)`.
    //
    // batch.flush() bridges to v8's renderTarget.finishRenderPass() so pending
    // v8 batched draws are actually flushed before legacy GL calls (Effekseer,
    // UltraMode7, etc.) start manipulating state.
    // -------------------------------------------------------------------------
    window.installLegacyRendererStubs = function(renderer) {
        if (!renderer || renderer.__compatStubsInstalled) return;
        renderer.__compatStubsInstalled = true;
        const noop = function() {};
        const flushImpl = function() {
            try {
                if (renderer.renderTarget &&
                    typeof renderer.renderTarget.finishRenderPass === "function") {
                    renderer.renderTarget.finishRenderPass();
                }
            } catch (e) {}
        };
        // For each legacy subsystem name, the methods listed are what MZ-era
        // plugins (Sprite_Animation, UltraMode7, etc.) call on the renderer.
        // We AUGMENT v8's existing system (if any) by filling in only the
        // missing methods -- never overwrite real v8 systems wholesale, and
        // never overwrite methods v8 already provides.
        const augments = {
            batch: {
                flush: flushImpl,
                setObjectRenderer: noop,
                start: noop,
                stop: noop,
                copyBoundTextures: noop
            },
            geometry: {
                reset: noop,
                bind: noop,
                updateBuffers: noop,
                draw: noop
            },
            texture: {
                reset: noop,
                bind: noop,
                unbind: noop
            },
            state: {
                reset: noop,
                set: noop,
                setBlendMode: noop
            },
            shader: {
                reset: noop,
                bind: noop
            },
            framebuffer: {
                reset: noop,
                bind: noop
            },
            projection: {
                projectionMatrix: (PIXI.Matrix ? new PIXI.Matrix() : {
                    a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0,
                    copyTo: function(m) { return m; }
                })
            }
        };
        for (const [name, methods] of Object.entries(augments)) {
            let sub = renderer[name];
            if (sub === undefined || sub === null) {
                // v8 didn't register one; create a plain stub holder.
                try { renderer[name] = sub = {}; } catch (e) { continue; }
            }
            for (const [methodName, fn] of Object.entries(methods)) {
                if (sub[methodName] === undefined) {
                    try { sub[methodName] = fn; } catch (e) {}
                }
            }
        }
        // v5/6/7 renderers exposed the canvas as renderer.view (.view.width,
        // .view.height). v8 dropped renderer.view in favor of renderer.canvas.
        // Legacy MZ code (Sprite_Animation.setViewport / resetViewport) still
        // reads renderer.view.width/height. Provide an alias so those calls
        // work without modifying every site.
        if (renderer.view === undefined && renderer.canvas) {
            try {
                Object.defineProperty(renderer, "view", {
                    configurable: true,
                    get: function() { return renderer.canvas; }
                });
            } catch (e) {}
        }
    };

    // -------------------------------------------------------------------------
    // v7 removed PIXI.Renderer.registerPlugin; v6/v7 replacement is
    // PIXI.extensions.add({ name, ref, type: ExtensionType.RendererPlugin }).
    // v8 removed the renderer-plugin system entirely. Install a registerPlugin
    // method on PIXI.Renderer that bridges to extensions.add on v6/v7, or
    // no-ops on v8 (so legacy plugins like UltraMode7 don't crash on the call
    // itself -- they just won't actually render until Phase 6).
    // -------------------------------------------------------------------------
    if (PIXI.Renderer && !PIXI.Renderer.registerPlugin) {
        if (
            PIXI.extensions &&
            PIXI.ExtensionType &&
            PIXI.ExtensionType.RendererPlugin
        ) {
            PIXI.Renderer.registerPlugin = function(name, ref) {
                PIXI.extensions.add({
                    name: name,
                    ref: ref,
                    type: PIXI.ExtensionType.RendererPlugin
                });
            };
        } else {
            // v8: render-plugin system removed. No-op so the call site doesn't
            // throw. The plugin's custom rendering won't run; Phase 6 will add
            // a v8-native ObjectRenderer emulation if/when needed.
            PIXI.Renderer.registerPlugin = function() { /* v8 no-op */ };
        }
    }

    // -------------------------------------------------------------------------
    // v7 promoted filter classes from PIXI.filters.X to top-level PIXI.X and
    // installed deprecation getters on PIXI.filters.X. The getters return the
    // correct class but log a warning on every access -- including from
    // third-party MZ plugins we don't control.
    //
    // For each known filter:
    //   1. If PIXI.X (modern) doesn't exist, copy from PIXI.filters.X (v5/v6).
    //   2. If both exist, replace the deprecation getter on PIXI.filters.X
    //      with a plain value descriptor. Subsequent accesses then return the
    //      class directly with no warning fired.
    // -------------------------------------------------------------------------
    if (PIXI.filters) {
        const filterNames = [
            "AlphaFilter", "BlurFilter", "BlurFilterPass",
            "ColorMatrixFilter", "DisplacementFilter",
            "FXAAFilter", "NoiseFilter"
        ];
        for (const name of filterNames) {
            if (!PIXI[name]) {
                // v5/v6 path: only filters namespace has it; copy to top-level.
                if (PIXI.filters[name]) PIXI[name] = PIXI.filters[name];
                continue;
            }
            // v7+ path: replace the deprecation getter with a plain value.
            try {
                Object.defineProperty(PIXI.filters, name, {
                    value: PIXI[name],
                    writable: true,
                    configurable: true,
                    enumerable: true
                });
            } catch (e) {
                // Non-configurable descriptor; cannot silence. Very rare.
            }
        }
    }

    // -------------------------------------------------------------------------
    // v6+ converted PIXI base classes (Container, Sprite, TilingSprite, Filter,
    // Point, Rectangle, ObjectRenderer, ...) from ES5 functions to ES6 classes.
    // ES6 classes cannot be invoked without `new`, which breaks the legacy
    // ES5-style super call `PIXI.X.call(this, ...)`.
    //
    // PIXISuper bridges both styles: it tries the ES5 invocation first, and on
    // the ES6 "Class constructor cannot be invoked without 'new'" TypeError
    // it falls back to Reflect.construct + property copy, preserving the
    // existing prototype chain set up via Object.create(PIXI.X.prototype).
    // -------------------------------------------------------------------------
    window.PIXISuper = function(PixiClass, instance, args) {
        if (typeof PixiClass !== "function") return;
        // v8 auto-upgrade path: if this instance has already been constructed
        // as a real v8 PIXI instance (via MZGlobalUpgrade's Reflect.construct
        // wrap), v8's super already ran. Skip to avoid overwriting state.
        if (instance && instance.__pixiInitialized) return instance;
        args = args || [];
        try {
            return PixiClass.apply(instance, args);
        } catch (e) {
            if (
                e instanceof TypeError &&
                /class constructor/i.test(e.message)
            ) {
                const tmp = Reflect.construct(PixiClass, args);
                for (const key of Reflect.ownKeys(tmp)) {
                    Object.defineProperty(
                        instance,
                        key,
                        Object.getOwnPropertyDescriptor(tmp, key)
                    );
                }
                // v8: many internal sub-objects (ObservablePoints, transforms,
                // bounds, etc.) hold back-references to their owner container.
                // After copying state from tmp, those refs still point at tmp,
                // breaking v8's dirty tracking and rendering.
                //
                // Recursively walk copied state and replace any `tmp` reference
                // with `instance`. Limited depth to avoid runaway recursion.
                const visited = new WeakSet();
                const MAX_DEPTH = 4;
                const replaceRefs = (obj, depth) => {
                    if (!obj || typeof obj !== "object" || visited.has(obj)) return;
                    if (depth > MAX_DEPTH) return;
                    visited.add(obj);
                    for (const k of Reflect.ownKeys(obj)) {
                        try {
                            const v = obj[k];
                            if (v === tmp) {
                                obj[k] = instance;
                            } else if (v && typeof v === "object") {
                                replaceRefs(v, depth + 1);
                            }
                        } catch (err) { /* skip non-readable */ }
                    }
                };
                replaceRefs(instance, 0);
                return instance;
            }
            throw e;
        }
    };

    // -------------------------------------------------------------------------
    // v8 replaced numeric constant enums (SCALE_MODES, WRAP_MODES, DRAW_MODES)
    // with string-valued ones. v8 also dropped BLEND_MODES, TYPES, and the
    // PIXI.utils namespace entirely. We provide back-compat objects only when
    // the running PIXI doesn't already define them (so v5-v7 are untouched).
    //
    // The shimmed constant values use the v8 strings ('linear', 'nearest', etc.)
    // because v8's APIs accept those strings directly. v7-style code that does
    //   baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST
    // then resolves to 'nearest' on v8 (correct) and stays numeric on v5-v7
    // (also correct, because we don't overwrite anything there).
    // -------------------------------------------------------------------------
    // On v8 these ship as Proxies that emit a deprecation warning on every
    // read (and the message text is itself buggy -- v8's SCALE_MODES proxy
    // says "DRAW_MODES.X is deprecated" instead of "SCALE_MODES.X").
    // Replace with plain objects holding the SAME string values. This is not
    // just suppression: when PIXI eventually removes these legacy proxies
    // (v9+), our shim continues providing the constants so corescript and
    // 3rd-party plugins keep working without code changes.
    // On v5/v6 these are numeric enums; we leave them alone since the
    // corescript on those versions still expects numbers.
    const _isV8Pixi = !!PIXI.TextureSource;
    if (_isV8Pixi || !PIXI.SCALE_MODES) {
        PIXI.SCALE_MODES = { NEAREST: "nearest", LINEAR: "linear" };
    }
    if (_isV8Pixi || !PIXI.WRAP_MODES) {
        PIXI.WRAP_MODES = {
            CLAMP: "clamp-to-edge",
            REPEAT: "repeat",
            MIRRORED_REPEAT: "mirror-repeat"
        };
    }
    // v5 had numeric enum (OFF: 0, POW2: 1, ON: 2, ON_MANUAL: 3); v8 collapses
    // to a single boolean `autoGenerateMipmaps` on TextureSource. Map OFF -> false
    // and the rest -> true; the baseTexture proxy translates assignments below.
    if (!PIXI.MIPMAP_MODES) {
        PIXI.MIPMAP_MODES = {
            OFF: false,
            POW2: true,
            ON: true,
            ON_MANUAL: true
        };
    }
    if (_isV8Pixi || !PIXI.DRAW_MODES) {
        PIXI.DRAW_MODES = {
            POINTS: "point-list",
            LINES: "line-list",
            LINE_STRIP: "line-strip",
            TRIANGLES: "triangle-list",
            TRIANGLE_STRIP: "triangle-strip"
        };
    }
    if (!PIXI.BLEND_MODES) {
        PIXI.BLEND_MODES = {
            NORMAL: "normal",
            ADD: "add",
            MULTIPLY: "multiply",
            SCREEN: "screen",
            OVERLAY: "overlay",
            DARKEN: "darken",
            LIGHTEN: "lighten",
            COLOR_DODGE: "color-dodge",
            COLOR_BURN: "color-burn",
            HARD_LIGHT: "hard-light",
            SOFT_LIGHT: "soft-light",
            DIFFERENCE: "difference",
            EXCLUSION: "exclusion",
            HUE: "hue",
            SATURATION: "saturation",
            COLOR: "color",
            LUMINOSITY: "luminosity",
            NONE: "none",
            NORMAL_NPM: "normal-npm",
            ADD_NPM: "add-npm",
            SCREEN_NPM: "screen-npm",
            ERASE: "erase",
            SUBTRACT: "subtract"
        };
    }
    if (!PIXI.TYPES) {
        // WebGL numeric constants (kept numeric — v8 internals don't expose
        // these but legacy code that uses them with raw gl calls still needs
        // the numeric values).
        PIXI.TYPES = {
            BYTE: 5120,
            UNSIGNED_BYTE: 5121,
            SHORT: 5122,
            UNSIGNED_SHORT: 5123,
            INT: 5124,
            UNSIGNED_INT: 5125,
            FLOAT: 5126,
            HALF_FLOAT: 5131
        };
    }

    // -------------------------------------------------------------------------
    // v8 removed the PIXI.utils namespace entirely. The corescript needs at
    // least createIndicesForQuads (Tilemap.Layer index buffer). Add a stub
    // namespace and reimplement the function; only attach when missing so v5-v7
    // keep their original implementations.
    // -------------------------------------------------------------------------
    if (!PIXI.utils) PIXI.utils = {};
    if (!PIXI.utils.createIndicesForQuads) {
        PIXI.utils.createIndicesForQuads = function(size) {
            const totalIndices = size * 6;
            const totalVertices = size * 4;
            const ArrType = totalVertices > 0xffff ? Uint32Array : Uint16Array;
            const indices = new ArrType(totalIndices);
            for (let i = 0, j = 0; i < totalIndices; i += 6, j += 4) {
                indices[i + 0] = j + 0;
                indices[i + 1] = j + 1;
                indices[i + 2] = j + 2;
                indices[i + 3] = j + 0;
                indices[i + 4] = j + 2;
                indices[i + 5] = j + 3;
            }
            return indices;
        };
    }

    // -------------------------------------------------------------------------
    // v8 removed PIXI.ObjectRenderer (the entire renderer-plugin system was
    // replaced with render pipes). Legacy plugins like UltraMode7 and the
    // corescript's own Tilemap.Renderer extend PIXI.ObjectRenderer at module
    // load time via Object.create(PIXI.ObjectRenderer.prototype). Without a
    // stub, the very first reference crashes script load.
    //
    // This is a NO-OP stub: it satisfies the prototype-chain setup and the
    // standard ObjectRenderer interface (start/stop/flush/render/contextChange/
    // destroy). Actual rendering still requires Phase 5 (Tilemap.Renderer v8
    // rewrite) and/or Phase 6 (full ObjectRenderer emulation on v8's render
    // pipes for third-party plugin compat).
    // -------------------------------------------------------------------------
    if (!PIXI.ObjectRenderer) {
        PIXI.ObjectRenderer = class ObjectRendererCompatStub {
            constructor(renderer) {
                this.renderer = renderer || null;
            }
            destroy() { this.renderer = null; }
            contextChange() {}
            start() {}
            stop() {}
            flush() {}
            render(/* object */) {}
        };
    }

    // -------------------------------------------------------------------------
    // v8 changed PIXI.Buffer's constructor signature from positional
    //   new Buffer(data, isStatic, isIndex)         // v5/v6/v7
    // to an options object
    //   new Buffer({ data, size, usage, ... })      // v8
    // and the v8 constructor *destructures* `data` and `size` from the first
    // arg, so legacy callers like UltraMode7's `_createVao`
    //   new PIXI.Buffer(null, true, true)
    // crash with "Cannot destructure property 'data' of 'options' as it is null".
    //
    // Wrap PIXI.Buffer so the legacy positional signature still works on v8.
    // Map the legacy (data, isStatic, isIndex) tuple to v8's BufferUsage flags.
    // -------------------------------------------------------------------------
    if (PIXI.Buffer && !PIXI.Buffer.__compatWrapped && PIXI.BufferUsage) {
        const RealBuffer = PIXI.Buffer;
        const U = PIXI.BufferUsage;
        const looksLikeOptions = (o) =>
            o && typeof o === "object" &&
            !ArrayBuffer.isView(o) &&
            !Array.isArray(o) &&
            ("data" in o || "size" in o || "usage" in o ||
             "shrinkToFit" in o || "label" in o);

        const BufferCompat = function(arg0, arg1, arg2) {
            // Already v8-style options object (or unspecified): forward as-is,
            // defaulting to an empty vertex buffer if no opts at all.
            if (looksLikeOptions(arg0)) {
                return Reflect.construct(
                    RealBuffer, [arg0], new.target || BufferCompat
                );
            }
            if (arg0 === undefined) {
                return Reflect.construct(
                    RealBuffer,
                    [{ data: null, size: 0,
                       usage: (U.VERTEX | U.COPY_DST) }],
                    new.target || BufferCompat
                );
            }
            // Legacy positional: (data, isStatic, isIndex)
            const data = arg0;             // typed array or null
            const isStatic = !!arg1;
            const isIndex = !!arg2;
            const opts = {
                usage:
                    (isIndex ? U.INDEX : U.VERTEX) |
                    U.COPY_DST |
                    (isStatic ? U.STATIC : 0)
            };
            if (data && ArrayBuffer.isView(data)) {
                opts.data = data;
            } else {
                opts.data = null;
                opts.size = 0;
            }
            return Reflect.construct(
                RealBuffer, [opts], new.target || BufferCompat
            );
        };
        BufferCompat.prototype = RealBuffer.prototype;
        for (const k of Reflect.ownKeys(RealBuffer)) {
            if (k === "prototype" || k === "length" || k === "name") continue;
            try {
                Object.defineProperty(
                    BufferCompat, k,
                    Object.getOwnPropertyDescriptor(RealBuffer, k)
                );
            } catch (e) {}
        }
        BufferCompat.__compatWrapped = true;
        BufferCompat.__real = RealBuffer;
        PIXI.Buffer = BufferCompat;
    }

    // -------------------------------------------------------------------------
    // v8 changed PIXI.Geometry's prototype methods:
    //   * addIndex(buffer)                       no longer returns `this`
    //   * addAttribute(name, opts)               2-arg options form;
    //                                            previously took 8 positional
    //                                            args (name, buffer, size,
    //                                            normalized, type, stride,
    //                                            start, instance) and returned
    //                                            `this`.
    //
    // Legacy MZ plugins like UltraMode7 chain calls:
    //     geometry.addIndex(idx).addAttribute("a", buf, 1, false, FLOAT, ...)
    // On v8, addIndex returns undefined, so the addAttribute call throws
    // "Cannot read properties of undefined (reading 'addAttribute')". And even
    // if it didn't, addAttribute would mis-interpret the 3rd arg (size) as
    // its v8 attributeOption.
    //
    // Patch both methods to:
    //   * always return `this` (restore chaining)
    //   * for addAttribute, detect legacy positional signature and convert to
    //     v8's { buffer, format, stride, offset, instance } options object.
    //
    // The size+type -> format mapping is the v8 vertex-format string scheme
    // ("float32", "float32x2", "uint16x4", etc.).
    // -------------------------------------------------------------------------
    if (PIXI.Geometry && PIXI.Geometry.prototype &&
        !PIXI.Geometry.prototype.__compatPatched) {
        const proto = PIXI.Geometry.prototype;
        proto.__compatPatched = true;

        const TYPE_TO_BASE = {
            5126: "float32", // FLOAT
            5131: "float16", // HALF_FLOAT
            5125: "uint32",  // UNSIGNED_INT
            5124: "sint32",  // INT
            5123: "uint16",  // UNSIGNED_SHORT
            5122: "sint16",  // SHORT
            5121: "uint8",   // UNSIGNED_BYTE
            5120: "sint8"    // BYTE
        };
        const NORMALIZED_BASE = {
            5123: "unorm16",
            5122: "snorm16",
            5121: "unorm8",
            5120: "snorm8"
        };
        const sizeTypeToFormat = (size, type, normalized) => {
            const base = (normalized && NORMALIZED_BASE[type]) ||
                         TYPE_TO_BASE[type] || "float32";
            const n = Math.max(1, Math.min(4, size | 0 || 1));
            return n > 1 ? `${base}x${n}` : base;
        };

        const _origAddIndex = proto.addIndex;
        proto.addIndex = function(indexBuffer) {
            _origAddIndex.call(this, indexBuffer);
            return this;
        };

        const _origAddAttribute = proto.addAttribute;
        proto.addAttribute = function(name, arg1, size, normalized,
                                       type, stride, start, instance) {
            // v8-style: (name, attributeOptionsObject). Detect by arg count
            // (legacy callers always pass at least 3 positional args) or by
            // arg1 being an options object rather than a Buffer.
            const arg1IsBufferLike =
                arg1 && ((PIXI.Buffer && arg1 instanceof PIXI.Buffer) ||
                         ArrayBuffer.isView(arg1));
            const isLegacy = arguments.length > 2 || arg1IsBufferLike;
            if (!isLegacy) {
                _origAddAttribute.call(this, name, arg1);
                return this;
            }
            const opts = {
                buffer: arg1,
                format: sizeTypeToFormat(size, type, !!normalized),
                stride: stride,
                offset: start,
                instance: !!instance
            };
            _origAddAttribute.call(this, name, opts);
            return this;
        };
    }

    // -------------------------------------------------------------------------
    // v8 collapsed BaseTexture + Resource into TextureSource. The corescript's
    // Bitmap class wraps PIXI.BaseTexture and exposes it as bitmap.baseTexture
    // (a documented public getter), so a lot of MZ plugins rely on it.
    //
    // BaseTextureCompatShim is a thin wrapper around the appropriate v8
    // TextureSource subclass (ImageSource / CanvasSource / VideoSource). It
    // preserves the v5/v6/v7 surface (scaleMode, mipmap, valid, width, height,
    // update(), destroy(), resize()) while internally driving a v8 source.
    //
    // BaseRenderTexture aliased to the same shim for now -- the corescript's
    // Tilemap.Renderer._createInternalTextures uses it as a 2048x2048 GPU
    // texture, which won't render correctly until Phase 5. The shim keeps
    // construction from crashing so the rest of boot proceeds.
    // -------------------------------------------------------------------------
    if (!PIXI.BaseTexture) {
        // In v5/v6/v7, baseTexture.resource was a CanvasResource/ImageResource
        // wrapper whose .source pointed to the raw HTMLCanvasElement / Image.
        // Legacy MZ plugins (e.g. PSYCHRONIC_RaveLighting) read
        // `texture.baseTexture.resource.source` to get the canvas for ctx.drawImage.
        // Our shim stores the raw resource internally as `_rawResource` and
        // exposes `.resource` as a small wrapper `{ source: rawResource }` to
        // preserve that access pattern.
        PIXI.BaseTexture = class BaseTextureCompatShim {
            constructor(resource, options) {
                options = options || {};
                this._rawResource = resource || null;
                this.resource = resource
                    ? { source: resource, update: () => this.update() }
                    : null;
                this.scaleMode = options.scaleMode || "linear";
                this.mipmap = options.mipmap || false;
                this.valid = false;
                this.width = 1;
                this.height = 1;
                this._textureSource = null;
                if (resource) {
                    this._buildTextureSource();
                } else {
                    // Empty constructor: many call sites (e.g., Sprite._emptyBaseTexture)
                    // create an empty BaseTexture then call setSize() and use it as the
                    // source for an empty Texture. Build a 1x1 canvas-backed source so
                    // we have a valid v8 TextureSource to point at.
                    this._buildEmptySource();
                }
            }
            _buildTextureSource() {
                if (!PIXI.TextureSource) return;
                let SourceClass = PIXI.TextureSource;
                const r = this._rawResource;
                if (typeof HTMLImageElement !== "undefined" &&
                    r instanceof HTMLImageElement) {
                    SourceClass = PIXI.ImageSource || PIXI.TextureSource;
                } else if (typeof HTMLCanvasElement !== "undefined" &&
                           r instanceof HTMLCanvasElement) {
                    SourceClass = PIXI.CanvasSource || PIXI.TextureSource;
                } else if (typeof HTMLVideoElement !== "undefined" &&
                           r instanceof HTMLVideoElement) {
                    SourceClass = PIXI.VideoSource || PIXI.TextureSource;
                }
                try {
                    this._textureSource = new SourceClass({
                        resource: r,
                        scaleMode: this.scaleMode,
                        autoGenerateMipmaps: this.mipmap
                    });
                    this.valid = true;
                    this.width = r.width || r.naturalWidth || 1;
                    this.height = r.height || r.naturalHeight || 1;
                } catch (e) {
                    console.warn(
                        "BaseTexture compat shim: failed to build TextureSource",
                        e
                    );
                }
            }
            _buildEmptySource() {
                if (!PIXI.TextureSource && !PIXI.CanvasSource) return;
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = 1;
                    canvas.height = 1;
                    const SourceClass = PIXI.CanvasSource || PIXI.TextureSource;
                    this._textureSource = new SourceClass({
                        resource: canvas,
                        scaleMode: this.scaleMode
                    });
                    this._rawResource = canvas;
                    this.resource = { source: canvas, update: () => this.update() };
                    this.valid = true;
                } catch (e) {
                    console.warn("BaseTexture empty stub failed:", e);
                }
            }
            get source() { return this._textureSource; }
            update() {
                if (this._textureSource && this._textureSource.update) {
                    this._textureSource.update();
                }
            }
            destroy() {
                if (this._textureSource && this._textureSource.destroy) {
                    try { this._textureSource.destroy(); } catch (e) {}
                    this._textureSource = null;
                }
                this._rawResource = null;
                this.resource = null;
                this.valid = false;
            }
            resize(width, height) {
                this.width = width;
                this.height = height;
                if (this._textureSource && this._textureSource.resize) {
                    this._textureSource.resize(width, height);
                }
            }
            setSize(width, height) {
                // v5/v6/v7 BaseTexture API alias for resize. Some corescript
                // patterns call setSize(1,1) on an empty BaseTexture.
                return this.resize(width, height);
            }
        };
    }
    if (!PIXI.BaseRenderTexture) {
        PIXI.BaseRenderTexture = PIXI.BaseTexture;
    }
    // -------------------------------------------------------------------------
    // v8 Texture constructor signature changed from (baseTexture, frame, ...)
    // to ({source, frame, ...}). PIXICreateTexture bridges legacy call sites
    // in the corescript so the same line works on v5/v6/v7 and v8.
    // -------------------------------------------------------------------------
    window.PIXICreateTexture = function(baseTexture, frame) {
        if (PIXI.TextureSource) {
            const source =
                baseTexture && baseTexture.source
                    ? baseTexture.source
                    : (baseTexture && baseTexture._textureSource
                        ? baseTexture._textureSource
                        : null);
            const opts = { source: source };
            if (frame) opts.frame = frame;
            return new PIXI.Texture(opts);
        }
        // v5/v6/v7: original positional args.
        return new PIXI.Texture(baseTexture, frame);
    };

    // -------------------------------------------------------------------------
    // v8: PIXI.Texture constructor signature changed to a single options object
    // ({source, frame, ...}). Legacy MZ plugins (e.g. PSYCHRONIC_RaveLighting)
    // still call `new PIXI.Texture(baseTexture)` or `new PIXI.Texture(baseTexture, frame)`
    // with positional args. Wrap the v8 Texture so the legacy signature is
    // detected and converted before calling the real constructor.
    //
    // Detection: if the first arg looks like our BaseTextureCompatShim (has a
    // `_textureSource` property or has a `.source` that is a v8 TextureSource),
    // it's the legacy positional call -- rewrite it as ({source, frame}).
    // -------------------------------------------------------------------------
    if (PIXI.Texture && PIXI.TextureSource && !PIXI.Texture.__compatWrapped) {
        const RealTexture = PIXI.Texture;
        const isV8TextureSource = (v) => {
            if (!v || typeof v !== "object") return false;
            // v8 TextureSource and subclasses; presence of `.uploadMethodId` or
            // a `.resource` plus the v8-specific `.style` is a strong signal.
            return (
                v instanceof PIXI.TextureSource ||
                (PIXI.ImageSource && v instanceof PIXI.ImageSource) ||
                (PIXI.CanvasSource && v instanceof PIXI.CanvasSource) ||
                (PIXI.VideoSource && v instanceof PIXI.VideoSource)
            );
        };
        const isLegacyBaseTexture = (v) => {
            if (!v || typeof v !== "object") return false;
            // Our shim sets _textureSource; native v8 doesn't have BaseTexture.
            // Also accept anything whose `.source` is a v8 TextureSource.
            return (
                "_textureSource" in v ||
                isV8TextureSource(v.source)
            );
        };
        const TextureCompatWrapper = function(arg0, frame) {
            // Already an options-style call (or undefined): forward as-is.
            if (
                arg0 == null ||
                isV8TextureSource(arg0) ||
                (typeof arg0 === "object" && ("source" in arg0 || "label" in arg0))
            ) {
                return Reflect.construct(
                    RealTexture, arguments, new.target || TextureCompatWrapper
                );
            }
            // Legacy positional: (baseTexture, frame, ...)
            if (isLegacyBaseTexture(arg0)) {
                const source = arg0.source || arg0._textureSource || null;
                const opts = { source: source };
                if (frame) opts.frame = frame;
                return Reflect.construct(
                    RealTexture, [opts], new.target || TextureCompatWrapper
                );
            }
            // Fallback: forward verbatim and let v8 complain.
            return Reflect.construct(
                RealTexture, arguments, new.target || TextureCompatWrapper
            );
        };
        // Preserve prototype chain so instanceof and methods work.
        TextureCompatWrapper.prototype = RealTexture.prototype;
        // Copy static properties (Texture.WHITE, Texture.EMPTY, Texture.from, ...).
        for (const k of Reflect.ownKeys(RealTexture)) {
            if (k === "prototype" || k === "length" || k === "name") continue;
            try {
                Object.defineProperty(
                    TextureCompatWrapper, k,
                    Object.getOwnPropertyDescriptor(RealTexture, k)
                );
            } catch (e) {}
        }
        TextureCompatWrapper.__compatWrapped = true;
        TextureCompatWrapper.__real = RealTexture;
        PIXI.Texture = TextureCompatWrapper;
    }

    // -------------------------------------------------------------------------
    // v8 removed PIXI.Texture.baseTexture (replaced by Texture.source, with the
    // raw HTMLCanvasElement/HTMLImageElement now at source.resource). Legacy MZ
    // plugins like PSYCHRONIC_RaveLighting still read back the underlying raw
    // resource every frame via `texture.baseTexture.resource.source` so they
    // can ctx.drawImage() it into their own 2D canvas (tone overlay, light
    // holes, etc.). Without this getter, that read throws a TypeError each
    // frame and the plugin's effect silently doesn't render.
    //
    // The returned shim exposes the v5/v6/v7 surface (.resource.source,
    // .source, width/height, scaleMode, mipmap, valid, update()) backed by the
    // v8 TextureSource we already wrap. Memoized per-Texture instance so we
    // don't allocate a new shim per access.
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // v8 removed PIXI.Texture.valid (v5/6/7 boolean: true when baseTexture is
    // loaded and usable). Plugins like PSYCHRONIC_RaveLighting use it as the
    // gate for "did my texture build correctly?" and silently substitute
    // PIXI.Texture.WHITE on falsy. Without this getter, every legitimate v8
    // Texture returns `undefined` for `.valid`, which is falsy -- so the
    // plugin's gorgeous radial-gradient light textures get replaced with a
    // 16x16 white square every frame, making lights effectively invisible.
    //
    // Match v5/6/7 semantics: valid = the texture has a source AND that source
    // isn't destroyed (v8's source has a `.destroyed` flag).
    // -------------------------------------------------------------------------
    if (
        PIXI.Texture &&
        PIXI.TextureSource &&
        PIXI.Texture.prototype &&
        !Object.getOwnPropertyDescriptor(PIXI.Texture.prototype, "valid")
    ) {
        Object.defineProperty(PIXI.Texture.prototype, "valid", {
            configurable: true,
            get: function() {
                const src = this.source;
                if (!src) return false;
                if (src.destroyed) return false;
                return true;
            }
        });
    }

    // v8 SHIPS its own `baseTexture` getter on Texture.prototype that returns
    // `this.source` directly (i.e. the v8 TextureSource) and emits a console
    // deprecation warning. That's WRONG for our legacy callers, which read
    // `texture.baseTexture.resource.source` expecting the raw canvas/image.
    // With v8's getter, `texture.baseTexture` is a TextureSource, so
    // `.resource` is the canvas (correct), but `.resource.source` is
    // `canvas.source` -- undefined for HTMLCanvasElement -- and ctx.drawImage
    // throws "The provided value is not of type HTMLCanvasElement...".
    //
    // We FORCE-OVERRIDE with our shim regardless of any existing descriptor.
    // Configurable: true is required on the original so this defineProperty
    // succeeds; v8 ships it as configurable so this works.
    if (
        PIXI.Texture &&
        PIXI.TextureSource &&
        PIXI.Texture.prototype
    ) {
        try {
            Object.defineProperty(PIXI.Texture.prototype, "baseTexture", {
                configurable: true,
                get: function() {
                    const src = this.source;
                    if (!src) return null;
                    // Re-create the shim every access so we always reflect the
                    // current state of src.resource (a previously-memoized shim
                    // could capture a stale canvas if the source was rebuilt).
                    //
                    // Setters forward assignments back to the v8 TextureSource
                    // so legacy MZ plugins that do
                    //   videoTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST
                    //   videoTexture.baseTexture.autoUpdate = false
                    // actually take effect. Without these setters the writes
                    // land on the disposable proxy and are lost; on v5/v6/v7
                    // those plugin lines did mutate the real BaseTexture.
                    return {
                        source: src,
                        resource: { source: src.resource || src },
                        get scaleMode() { return src.scaleMode; },
                        set scaleMode(v) {
                            try { src.scaleMode = v; } catch (e) {}
                        },
                        get mipmap() { return src.autoGenerateMipmaps; },
                        set mipmap(v) {
                            src.autoGenerateMipmaps = !!v;
                        },
                        get wrapMode() {
                            return src.wrapMode;
                        },
                        set wrapMode(v) {
                            try { src.wrapMode = v; } catch (e) {}
                        },
                        get autoUpdate() {
                            return "autoUpdate" in src ? src.autoUpdate : undefined;
                        },
                        set autoUpdate(v) {
                            if ("autoUpdate" in src) src.autoUpdate = v;
                        },
                        get valid() {
                            return !!(src && !src.destroyed && src.resource);
                        },
                        get width() { return src.width; },
                        get height() { return src.height; },
                        update: function() {
                            if (src && typeof src.update === "function") {
                                src.update();
                            }
                        }
                    };
                }
            });
        } catch (e) {
            console.warn(
                "pixi_compat: failed to install baseTexture compat getter",
                e
            );
        }
    }

    // Static factory methods used by legacy MZ plugins (PSYCHRONIC_RaveLighting,
    // etc.) to create BaseTextures from canvases/images. Just construct via
    // the shim if not already provided by the running PIXI.
    if (PIXI.BaseTexture && !PIXI.BaseTexture.from) {
        PIXI.BaseTexture.from = function(resource, options) {
            return new PIXI.BaseTexture(resource, options);
        };
    }
    if (PIXI.BaseTexture && !PIXI.BaseTexture.fromCanvas) {
        PIXI.BaseTexture.fromCanvas = function(canvas, scaleMode) {
            return new PIXI.BaseTexture(canvas, { scaleMode: scaleMode });
        };
    }
    if (PIXI.BaseTexture && !PIXI.BaseTexture.fromImage) {
        PIXI.BaseTexture.fromImage = function(image, options) {
            return new PIXI.BaseTexture(image, options);
        };
    }

    // -------------------------------------------------------------------------
    // v8: PIXI.Texture.from(htmlVideoElement) auto-detects video via
    // VideoSource.test() and constructs a VideoSource with default options,
    // which include autoPlay:true. Legacy MZ video plugins
    // (PSYCHRONIC_VideoOverlay, PSYCHRONIC_VideoParallaxMZ) drive play() and
    // load() manually -- the auto-load + auto-play in VideoSource races with
    // the plugin's own video.load()/video.play() calls, producing
    // "play() interrupted by load()" errors and a never-playing video.
    //
    // Intercept HTMLVideoElement only and construct VideoSource with
    // autoPlay:false (plugin owns playback) but autoLoad:true (so VideoSource's
    // play/pause/canplay listeners are registered -- _onPlayStart drives the
    // per-frame texture update once the plugin calls play()).
    // -------------------------------------------------------------------------
    if (PIXI.Texture && PIXI.VideoSource && !PIXI.Texture.__videoFromWrapped) {
        const _origTextureFrom = PIXI.Texture.from.bind(PIXI.Texture);
        PIXI.Texture.from = function(source, skipCache) {
            if (typeof HTMLVideoElement !== "undefined" &&
                source instanceof HTMLVideoElement) {
                const videoSource = new PIXI.VideoSource({
                    resource: source,
                    autoLoad: true,
                    autoPlay: false,
                    updateFPS: 0
                });
                // dynamic:true tells Sprite to attach an "update" listener so
                // it re-evaluates bounds when the video source resizes. Without
                // it, sprites bake in scale at construction time (when video
                // is still 1x1) and never react when video metadata arrives.
                const tex = new PIXI.Texture({ source: videoSource, dynamic: true });
                videoSource.on("error", (e) => {
                    console.error("pixi_compat: VideoSource error", e, source.error);
                });
                return tex;
            }
            return _origTextureFrom(source, skipCache);
        };
        PIXI.Texture.__videoFromWrapped = true;
    }

    // -------------------------------------------------------------------------
    // v8 Sprite.set texture re-applies _width/_height ONCE at assignment time,
    // but does NOT re-apply them when the underlying source later resizes (e.g.,
    // VideoSource learning videoWidth/videoHeight from metadata). For legacy
    // plugin patterns like:
    //   const sprite = new Sprite(videoTexture);
    //   sprite.width = Graphics.width;
    // ...the assignment runs while texture.orig is still 1x1, so scale = 816/1.
    // When VideoSource later resizes texture.orig to 1280x720, the texture
    // emits "update" but Sprite only recalculates bounds, leaving the giant
    // scale baked in -> sprite renders 1,000,000+ pixels wide off-screen.
    //
    // Wrap Sprite's texture setter so we also attach a listener that re-runs
    // _setWidth/_setHeight against the new orig whenever orig changes. Only
    // active for dynamic textures (videos, render textures), so static image
    // sprites pay nothing.
    // -------------------------------------------------------------------------
    if (PIXI.Sprite && PIXI.Sprite.prototype &&
        !PIXI.Sprite.prototype.__videoCompatTexturePatched) {
        const origDesc = Object.getOwnPropertyDescriptor(
            PIXI.Sprite.prototype, "texture"
        );
        if (origDesc && typeof origDesc.set === "function") {
            const origSet = origDesc.set;
            const origGet = origDesc.get;
            Object.defineProperty(PIXI.Sprite.prototype, "texture", {
                configurable: true,
                get: origGet,
                set: function(value) {
                    if (this._videoCompatTexHandler &&
                        this._texture && this._texture.dynamic) {
                        this._texture.off(
                            "update", this._videoCompatTexHandler, this
                        );
                    }
                    this._videoCompatTexHandler = null;
                    origSet.call(this, value);
                    if (value && value.dynamic) {
                        const self = this;
                        let lastOrigW = value.orig ? value.orig.width : 0;
                        let lastOrigH = value.orig ? value.orig.height : 0;
                        self._videoCompatTexHandler = function() {
                            const tex = self._texture;
                            if (!tex || !tex.orig) return;
                            const w = tex.orig.width, h = tex.orig.height;
                            if (w === lastOrigW && h === lastOrigH) return;
                            lastOrigW = w; lastOrigH = h;
                            if (self._width &&
                                typeof self._setWidth === "function") {
                                self._setWidth(self._width, w);
                            }
                            if (self._height &&
                                typeof self._setHeight === "function") {
                                self._setHeight(self._height, h);
                            }
                        };
                        value.on("update", self._videoCompatTexHandler, self);
                    }
                }
            });
            PIXI.Sprite.prototype.__videoCompatTexturePatched = true;
            console.log("pixi_compat: installed Sprite texture-resize re-apply " +
                "for dynamic textures (video metadata propagation)");
        }
    }

    // -------------------------------------------------------------------------
    // v8: a destroyed sprite (Sprite.destroy() nulls `_gpuData`) that is still
    // referenced by some parent's `children` array crashes during render at
    // `SpritePipe._getGpuSprite`: `sprite._gpuData[uid]` -> "Cannot read
    // properties of null".
    //
    // The supposed invariant is that destroy() detaches the sprite via
    // Container.destroy -> removeFromParent. Some MZ plugin patterns leak past
    // this:
    //   - Mutating `parent.children.sort(...)` after addChild without going
    //     through Container.addChild (PSYCHRONIC_GifAnimationMZ does this).
    //   - Destroying a sprite during a parent's child-iteration so the splice
    //     and the for-loop counter disagree.
    //   - Holding refs across scene transitions and calling destroy() on a
    //     sprite whose original parent (an older Spriteset's tilemap) is
    //     itself already destroyed.
    //
    // Guard SpritePipe.addRenderable to skip and log once per offending sprite
    // class. This prevents the hard crash and surfaces the offender so we can
    // fix the source later, without modifying plugin files.
    // -------------------------------------------------------------------------
    // Helpers shared by SpritePipe + global-bounds guards below. A destroyed
    // v8 Container has its `effects`, `children`, `_position`, `_gpuData` etc.
    // nulled; anything that touches one crashes. `this.destroyed` is the
    // canonical post-destroy flag -- Container.destroy sets it true at the
    // top of the method, before any of the field nulling.
    //
    // Don't extend the check to `_gpuData == null` or `effects == null` as a
    // proxy for "destroyed" -- plain Container subclasses (Scene_Boot, etc.)
    // don't have `_gpuData` at all, so == null matches both undefined and
    // null and we'd false-positive on freshly-constructed scenes.
    const _isDeadDisplay = (obj) => {
        return !obj || obj.destroyed === true;
    };
    // SpritePipe specifically needs `_gpuData` to be present; check both the
    // canonical flag and the field it actually dereferences.
    const _isDeadSprite = (sprite) => {
        return !sprite || sprite.destroyed === true || sprite._gpuData == null;
    };
    const _warnedDestroyKeys = Object.create(null);
    const _describeDisplay = (obj) => {
        if (!obj) return "(null)";
        const c = obj.constructor;
        if (!c) return "(no-ctor)";
        // Wrapped MZ classes set __origName; PIXI/plain classes use .name.
        return c.__origName || c.name || "(anonymous)";
    };
    const _describeParentChain = (obj) => {
        const chain = [];
        let cur = obj && obj.parent;
        for (let i = 0; i < 6 && cur; i++) {
            chain.push(_describeDisplay(cur));
            cur = cur.parent;
        }
        return chain.length ? chain.join(" < ") : "(no parent)";
    };
    const _warnDestroyedOnce = (obj, fnName) => {
        const ctor = _describeDisplay(obj);
        const key = fnName + ":" + ctor;
        if (_warnedDestroyKeys[key]) return;
        _warnedDestroyKeys[key] = true;
        console.warn("pixi_compat: " + fnName +
            " skipped destroyed/orphan display (class=" + ctor +
            ", parents=" + _describeParentChain(obj) +
            ", destroyed=" + !!obj.destroyed +
            "). Suppressing further warnings for this class. " +
            "Root cause is a destroy() leak in plugin/MZ code.");
    };
    if (PIXI.SpritePipe && PIXI.SpritePipe.prototype &&
        !PIXI.SpritePipe.prototype.__destroyedSpriteGuarded) {
        const origAdd = PIXI.SpritePipe.prototype.addRenderable;
        const origUpdate = PIXI.SpritePipe.prototype.updateRenderable;
        const origValidate = PIXI.SpritePipe.prototype.validateRenderable;
        PIXI.SpritePipe.prototype.addRenderable = function(sprite, instructionSet) {
            if (_isDeadSprite(sprite)) {
                _warnDestroyedOnce(sprite, "SpritePipe.addRenderable");
                return;
            }
            return origAdd.call(this, sprite, instructionSet);
        };
        PIXI.SpritePipe.prototype.updateRenderable = function(sprite) {
            if (_isDeadSprite(sprite)) {
                _warnDestroyedOnce(sprite, "SpritePipe.updateRenderable");
                return;
            }
            return origUpdate.call(this, sprite);
        };
        PIXI.SpritePipe.prototype.validateRenderable = function(sprite) {
            if (_isDeadSprite(sprite)) {
                _warnDestroyedOnce(sprite, "SpritePipe.validateRenderable");
                return true;
            }
            return origValidate.call(this, sprite);
        };
        PIXI.SpritePipe.prototype.__destroyedSpriteGuarded = true;
        console.log("pixi_compat: installed SpritePipe destroyed-sprite guard " +
            "(prevents render crash when destroyed sprite still in scene graph)");
    }
    // FilterSystem._calculateFilterArea -> getFastGlobalBounds ->
    // Container._getGlobalBoundsRecursive crashes on destroyed children too
    // (reads `this.effects.length` at pixi8 ~4977; effects is null after
    // destroy). Same root cause as the SpritePipe guard. Defend by short-
    // circuiting any destroyed display in the recursion.
    if (PIXI.Container && PIXI.Container.prototype &&
        typeof PIXI.Container.prototype._getGlobalBoundsRecursive === "function" &&
        !PIXI.Container.prototype.__destroyedBoundsGuarded) {
        const origBoundsRec = PIXI.Container.prototype._getGlobalBoundsRecursive;
        PIXI.Container.prototype._getGlobalBoundsRecursive = function(
            factorRenderLayers, bounds, currentLayer
        ) {
            if (_isDeadDisplay(this)) {
                _warnDestroyedOnce(this, "Container._getGlobalBoundsRecursive");
                return;
            }
            return origBoundsRec.call(
                this, factorRenderLayers, bounds, currentLayer
            );
        };
        PIXI.Container.prototype.__destroyedBoundsGuarded = true;
    }

    // v8 bug: Sprite.prototype.destroy is NOT idempotent. It calls
    //   super.destroy(options);      // sets this.destroyed = true and returns
    //                                  // early on subsequent calls
    //   if (destroyTexture)
    //     this._texture.destroy(...);  // <-- runs even on 2nd call;
    //                                  //     this._texture was nulled on 1st
    // So a second destroy() throws "Cannot read properties of null (reading
    // 'destroy')".
    //
    // This bites cascading destroys: a Spriteset_Map.destroy walks the
    // tilemap children; if a child sprite was already destroy()'d by a
    // plugin (e.g. PSYCHRONIC_GifAnimationMZ.stopGifAnimation) but
    // somehow remained in the children array, Container.destroy iterates
    // and re-destroys it -> crash.
    //
    // Patch: early-return when `this.destroyed` is already true. Container's
    // early-return makes this safe (super.destroy is a no-op the second
    // time, and our shim skips the code that depends on super doing work).
    if (PIXI.Sprite && PIXI.Sprite.prototype &&
        !PIXI.Sprite.prototype.__destroyIdempotentPatched) {
        const origSpriteDestroy = PIXI.Sprite.prototype.destroy;
        PIXI.Sprite.prototype.destroy = function(options) {
            if (this.destroyed) return;
            return origSpriteDestroy.call(this, options);
        };
        PIXI.Sprite.prototype.__destroyIdempotentPatched = true;
    }

    // v8 race: VideoSource.load() does
    //   const source = this.resource;
    //   ...add listeners...
    //   this.alphaMode = await detectVideoAlphaMode();    // <- async pause
    //   this._load = new Promise((resolve, reject) => {
    //     if (this.isValid) { ... }                       // <- isValid reads
    //   });                                                //    this.resource
    //                                                      //    .videoWidth
    // If the VideoSource is destroyed during the await (very common --
    // Scene_Map.terminate -> VideoOverlayManager.clearAll destroys overlays
    // mid-load), `this.resource` is null when isValid runs and the read of
    // `null.videoWidth` throws an uncaught Promise rejection that the MZ
    // SceneManager surfaces as a fatal error.
    //
    // Make isValid null-safe. Returning false matches the semantic: a source
    // with no resource is not valid.
    if (PIXI.VideoSource && PIXI.VideoSource.prototype &&
        !PIXI.VideoSource.prototype.__isValidNullSafePatched) {
        const desc = Object.getOwnPropertyDescriptor(
            PIXI.VideoSource.prototype, "isValid"
        );
        if (desc && desc.get) {
            const origGet = desc.get;
            Object.defineProperty(PIXI.VideoSource.prototype, "isValid", {
                configurable: true,
                get: function() {
                    if (!this.resource) return false;
                    return origGet.call(this);
                }
            });
            PIXI.VideoSource.prototype.__isValidNullSafePatched = true;
        }
    }

    // -------------------------------------------------------------------------
    // v8: corescript sometimes uses `new Sprite()` as a container (e.g.,
    // Window._clientArea, Window._cursorSprite, Spriteset_Base._baseSprite).
    // In v8, Sprite is a leaf node; child transforms through it don't
    // propagate even though addChild still works with a deprecation warning.
    // We change those call sites to `new PIXI.Container()`, but the existing
    // corescript expects Sprite-style API on them (.move, .setFrame). Add
    // those as compat methods on PIXI.Container.prototype.
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // v8 only: per the v8 migration guide, "leaf nodes no longer allow children"
    // -- Sprite, Mesh, Graphics etc. can no longer be parents. v8's addChild
    // still appends to .children with just a deprecation warn, but the renderer
    // skips iterating them because the render-pipe is "sprite" (leaf), not
    // "container".
    //
    // MZ + many MZ plugins (MOG_BattleCursor's _sprtField1/_sprtField2,
    // BattleCursorSprite, Window child sprites, etc.) treat `new Sprite()` as
    // a container and addChild leaf sprites into it. On v8 those children
    // silently don't render.
    //
    // Migration-guide-compliant fix: when addChild/addChildAt is called on a
    // Sprite, transparently promote it to render as a Container by swapping
    // its renderPipeId. v8 will then iterate its children on render. The
    // Sprite's own texture (if any) is no longer drawn -- but MZ doesn't use
    // texture+children Sprites; everything is either container-only OR leaf.
    // Subclasses (Sprite_Battler, BattleCursorSprite, etc.) inherit this.
    // -------------------------------------------------------------------------
    // After reading v8's actual implementation: Sprite's collectRenderablesSimple
    // (pixi8.js:12259) already iterates `this.children` after drawing its own
    // texture. So children of Sprites DO render in v8 -- the "leaf nodes can't
    // have children" warning is just a deprecation notice, not a behavior
    // change for the current version. An attempt to swap renderPipeId from
    // "sprite" to "container" crashed because v8 has no pipe registered under
    // "container" (Container uses its own simpler collect method, not a pipe).
    //
    // We keep only the allowChildren accessor to suppress the deprecation
    // warning spam. Future v8 versions that actually break this behavior will
    // need a different shim -- likely replacing Sprite's collectRenderablesSimple
    // with Container's iterate-only version (sacrificing the sprite's own
    // texture draw for that instance).
    if (PIXI.Sprite && PIXI.Sprite.prototype && PIXI.TextureSource) {
        try {
            Object.defineProperty(PIXI.Sprite.prototype, "allowChildren", {
                configurable: true,
                get: function() { return true; },
                set: function(_v) { /* swallow ctor's `false` assignment */ }
            });
            console.log("pixi_compat: installed Sprite.allowChildren=true getter (suppresses addChild deprecation; v8 children-of-Sprite already render via Sprite.collectRenderablesSimple)");
        } catch (e) {
            console.warn("pixi_compat: failed to install Sprite.allowChildren shim", e);
        }
    }

    // -------------------------------------------------------------------------
    // v8 only: rescue `_position` from plugin clobbering. v8 stores the
    // ObservablePoint used for `container.position` in `this._position`
    // (pixi8.js line 7129: `this._position = new ObservablePoint(this, 0, 0)`).
    // Some MZ plugins (e.g. MOG_BattleCursor's BattleCursorSprite ctor:
    //   this._position = {};  this._position.x = 0;  this._position.y = 0;
    // ...) use `_position` as their own custom data struct, REPLACING v8's
    // ObservablePoint with a plain object. After that, `sprite.x = N` writes
    // to a plain field and never triggers v8's transform-dirty notification --
    // localTransform stays NaN and the sprite (plus all descendants) never
    // renders. Confirmed empirically: scale.x reassignment (which IS still
    // an ObservablePoint) restored a battle cursor's localTransform.tx/ty
    // from NaN back to (180, 170) in a single frame.
    //
    // Shim: install an accessor on Container.prototype._position that intercepts
    // assignments. Store the original ObservablePoint in __pixiPositionObservable.
    // When a plain object is assigned, copy its x/y into the observable and
    // trigger _onUpdate to mark the transform dirty.
    // -------------------------------------------------------------------------
    if (PIXI.Container && PIXI.Container.prototype && PIXI.ObservablePoint && PIXI.TextureSource) {
        try {
            Object.defineProperty(PIXI.Container.prototype, "_position", {
                configurable: true,
                get: function() {
                    return this.__pixiPositionObservable;
                },
                set: function(value) {
                    if (value && value instanceof PIXI.ObservablePoint) {
                        // v8 ctor's assignment of a fresh ObservablePoint. Stash.
                        this.__pixiPositionObservable = value;
                        return;
                    }
                    // Plain object assignment from a plugin (MOG_BattleCursor pattern).
                    // If we haven't seen the v8 ObservablePoint yet, this means the
                    // plugin's assignment beat v8's ctor -- create one now.
                    if (!this.__pixiPositionObservable) {
                        this.__pixiPositionObservable = new PIXI.ObservablePoint(this, 0, 0);
                    }
                    // Copy x/y from the plain object into the observable. Anything
                    // else (xOffset, yOffset, etc.) gets glued onto the observable
                    // as additional own properties so plugins can keep reading them.
                    const obs = this.__pixiPositionObservable;
                    if (value && typeof value === "object") {
                        for (const k of Object.keys(value)) {
                            if (k === "x" || k === "y") {
                                obs[k] = value[k];  // triggers observer
                            } else {
                                obs[k] = value[k];  // plain own-property, no observer
                            }
                        }
                    }
                    if (obs._onUpdate) {
                        try { obs._onUpdate(); } catch (e) {}
                    }
                }
            });
            console.log("pixi_compat: installed Container._position guard (rescues from plugin clobbering, e.g. MOG_BattleCursor's `this._position = {}` pattern)");
        } catch (e) {
            console.warn("pixi_compat: failed to install Container._position guard", e);
        }
    }

    // -------------------------------------------------------------------------
    // v8 only: rescue Container.updateLocalTransform from plugin-clobbered
    // cos/sin cache fields. v8's updateLocalTransform reads `this._cx, _sx,
    // _cy, _sy` (cached cos/sin of `rotation + skew`) and multiplies by scale
    // to compute the local matrix:
    //     lt.a = this._cx * sx;   lt.b = this._sx * sx;
    //     lt.c = this._cy * sy;   lt.d = this._sy * sy;
    // Defaults are (_cx=1, _sx=0, _cy=0, _sy=1) so an unrotated/unskewed
    // sprite gets the identity matrix [sx, 0, 0, sy].
    //
    // Problem: several MZ plugins ALSO use `_cx, _cy, _sx, _sy` as their own
    // instance data field names. MOG_TreasurePopup's TreasureIcons does
    //     this._cx = popupScreenX;   this._cy = popupScreenY;
    //     this._sx = moveSpeedX;     this._sy = -moveSpeedY;
    // ... which silently overwrites v8's cos/sin cache. The next render reads
    // the popup's screen X (e.g. 1021.52) AS A COSINE, multiplies by scale,
    // and produces a localTransform of [1021.52, 0, 736, -1, x, y] -- a wildly
    // skewed and Y-flipped quad that effectively never lands on-screen.
    //
    // The bug was diagnosed by reading lt.a / lt.c / lt.d directly from the
    // sprite, finding they were impossible given the reported scale/rotation,
    // and tracing them back to the plugin's `this._cx = ...` line.
    //
    // Fix: override updateLocalTransform to compute cos/sin fresh from
    // rotation+skew every call instead of trusting the _cx/_sx/_cy/_sy fields.
    // This costs ~4 Math.cos/sin per dirty container per frame (negligible) and
    // makes the four field names available again for any plugin to use as
    // arbitrary data without breaking PIXI rendering.
    //
    // Same family of bug as the existing `_position = {}` clobber from
    // MOG_BattleCursor that's already shimmed below; this is the cos/sin
    // counterpart.
    // -------------------------------------------------------------------------
    if (PIXI.Container && PIXI.Container.prototype && PIXI.TextureSource) {
        try {
            PIXI.Container.prototype.updateLocalTransform = function() {
                const localTransformChangeId = this._didContainerChangeTick;
                if (this._didLocalTransformChangeId === localTransformChangeId) return;
                this._didLocalTransformChangeId = localTransformChangeId;
                const lt = this.localTransform;
                const scale = this._scale;
                const pivot = this._pivot;
                const origin = this._origin;
                const position = this._position;
                const sx = scale._x;
                const sy = scale._y;
                const px = pivot._x;
                const py = pivot._y;
                const ox = origin ? -origin._x : 0;
                const oy = origin ? -origin._y : 0;
                // Compute fresh from rotation+skew, bypassing the clobber-prone
                // _cx/_sx/_cy/_sy cache. Plugin instance data using those names
                // (MOG_TreasurePopup, etc.) is now harmless to v8 rendering.
                const rotation = this._rotation || 0;
                const skewX = (this.skew && this.skew._x) || 0;
                const skewY = (this.skew && this.skew._y) || 0;
                const cx = Math.cos(rotation + skewY);
                const sxComp = Math.sin(rotation + skewY);
                const cy = -Math.sin(rotation - skewX);
                const syComp = Math.cos(rotation - skewX);
                lt.a = cx * sx;
                lt.b = sxComp * sx;
                lt.c = cy * sy;
                lt.d = syComp * sy;
                lt.tx = position._x - (px * lt.a + py * lt.c) + (ox * lt.a + oy * lt.c) - ox;
                lt.ty = position._y - (px * lt.b + py * lt.d) + (ox * lt.b + oy * lt.d) - oy;
            };
            console.log("pixi_compat: installed Container.updateLocalTransform patch (computes cos/sin fresh from rotation+skew instead of reading clobber-prone _cx/_sx/_cy/_sy cache fields -- rescues MOG_TreasurePopup which uses those names for popup screen coords and movement speed)");
        } catch (e) {
            console.warn("pixi_compat: failed to install Container.updateLocalTransform patch", e);
        }
    }

    if (PIXI.Container && !PIXI.Container.prototype.move) {
        PIXI.Container.prototype.move = function(x, y) {
            this.x = x;
            this.y = y;
        };
    }
    // MZ corescript's Sprite.prototype.update iterates children and calls
    // child.update() on each. The update chain propagates per-frame logic
    // through the scene graph. PIXI.Container does NOT have a .update method
    // natively, so when corescript code uses `new PIXI.Container()` as a
    // container (which we now do for _baseSprite, _clientArea, etc. to fix
    // v8's leaf-node-no-children issue), the update chain dead-ends at those
    // Containers. Shim a Sprite-style update on Container so it iterates and
    // propagates child updates.
    if (PIXI.Container && !PIXI.Container.prototype.update) {
        PIXI.Container.prototype.update = function() {
            for (const child of this.children) {
                if (child.update) {
                    child.update();
                }
            }
        };
    }
    if (PIXI.Container && !PIXI.Container.prototype.setFrame) {
        PIXI.Container.prototype.setFrame = function(x, y, width, height) {
            // Container has no texture frame; just record for any code that
            // reads it back via Sprite.prototype.setFrame's stored properties.
            if (!this._frame) {
                this._frame = { x: 0, y: 0, width: 0, height: 0 };
            }
            this._frame.x = x;
            this._frame.y = y;
            this._frame.width = width;
            this._frame.height = height;
        };
    }
    // Sprite color manipulation API (setHue/setColorTone/setBlendColor/
    // setBrightness) is sometimes called on container-purpose objects. Stub
    // these on Container.prototype so they don't throw; ColorFilter is a
    // no-op on v8 anyway so this doesn't lose meaningful behavior.
    if (PIXI.Container && !PIXI.Container.prototype.setHue) {
        PIXI.Container.prototype.setHue = function(hue) { this._hue = hue; };
    }
    if (PIXI.Container && !PIXI.Container.prototype.setColorTone) {
        PIXI.Container.prototype.setColorTone = function(tone) {
            this._colorTone = tone;
        };
    }
    if (PIXI.Container && !PIXI.Container.prototype.setBlendColor) {
        PIXI.Container.prototype.setBlendColor = function(color) {
            this._blendColor = color;
        };
    }
    if (PIXI.Container && !PIXI.Container.prototype.setBrightness) {
        PIXI.Container.prototype.setBrightness = function(b) {
            this._brightness = b;
        };
    }

    // -------------------------------------------------------------------------
    // v8 advanced blend modes ('multiply', 'screen', 'overlay', etc.) are NOT
    // registered by the vanilla pixi8 bundle -- they live in the
    // `pixi.js/advanced-blend-modes` sub-export. Without registration, code
    // that sets `sprite.blendMode = 'multiply'` (e.g. PSYCHRONIC_RaveLighting's
    // tone overlay) emits a console warn and silently falls back to 'normal',
    // which makes the overlay sprite cover the underlying scene at full alpha
    // instead of multiplying with it (resulting in a fully white screen with
    // light holes cut out, instead of darkened areas with light sources).
    //
    // We register the MZ-common advanced blend modes ourselves via PIXI's
    // BlendModeFilter base + ExtensionType.BlendMode. Same shader formulas as
    // PIXI's official advanced-blend-modes package (Porter-Duff over-composite
    // combined with the multiply / screen / overlay operators).
    // -------------------------------------------------------------------------
    if (
        PIXI.BlendModeFilter &&
        PIXI.extensions &&
        PIXI.ExtensionType &&
        PIXI.ExtensionType.BlendMode
    ) {
        const registerBlendMode = (name, glMain, gpuMain) => {
            const klass = class extends PIXI.BlendModeFilter {
                constructor() {
                    super({
                        gl:  { functions: "", main: glMain  },
                        gpu: { functions: "", main: gpuMain }
                    });
                }
            };
            klass.extension = {
                name: name,
                type: PIXI.ExtensionType.BlendMode
            };
            PIXI.extensions.add(klass);
            // Smoke test: instantiate once now so any shader-template syntax
            // error surfaces at startup, not later inside a render frame
            // (where it can fail silently and the sprite just doesn't draw).
            try {
                const probe = new klass();
                console.log(
                    "pixi_compat: blend mode '" + name + "' instantiates OK",
                    "(resources:", Object.keys(probe.resources || {}).join(",") + ")"
                );
                if (probe.destroy) {
                    try { probe.destroy(); } catch (e) {}
                }
            } catch (e) {
                console.error(
                    "pixi_compat: blend mode '" + name + "' FAILED to instantiate",
                    e
                );
            }
        };
        // Exact formulas from PIXI v8's official advanced-blend-modes module
        // (pixi.js/advanced-blend-modes -> MultiplyBlend/ScreenBlend/OverlayBlend).
        // We replicate them here because the vanilla pixi8.js bundle does not
        // ship advanced blend modes; without registration these blend mode
        // names silently fall through to 'normal'.
        registerBlendMode(
            "multiply",
            "vec3 mResult = back.rgb * front.rgb;\nfinalColor = vec4(back.rgb * (1.0 - front.a) + mResult * front.a, blendedAlpha);",
            "let mResult: vec3<f32> = back.rgb * front.rgb;\nout = vec4<f32>(back.rgb * (1.0 - front.a) + mResult * front.a, blendedAlpha);"
        );
        registerBlendMode(
            "screen",
            "vec3 sResult = back.rgb + front.rgb - back.rgb * front.rgb;\nfinalColor = vec4(back.rgb * (1.0 - front.a) + sResult * front.a, blendedAlpha);",
            "let sResult: vec3<f32> = back.rgb + front.rgb - back.rgb * front.rgb;\nout = vec4<f32>(back.rgb * (1.0 - front.a) + sResult * front.a, blendedAlpha);"
        );
        registerBlendMode(
            "overlay",
            "vec3 oResult = mix(2.0 * back.rgb * front.rgb, 1.0 - 2.0 * (1.0 - back.rgb) * (1.0 - front.rgb), step(0.5, back.rgb));\nfinalColor = vec4(back.rgb * (1.0 - front.a) + oResult * front.a, blendedAlpha);",
            "let oResult: vec3<f32> = mix(2.0 * back.rgb * front.rgb, vec3<f32>(1.0) - 2.0 * (vec3<f32>(1.0) - back.rgb) * (vec3<f32>(1.0) - front.rgb), step(vec3<f32>(0.5), back.rgb));\nout = vec4<f32>(back.rgb * (1.0 - front.a) + oResult * front.a, blendedAlpha);"
        );
        console.log("pixi_compat: registered advanced blend modes (multiply, screen, overlay)");
    } else {
        console.warn(
            "pixi_compat: cannot register advanced blend modes -- missing PIXI APIs:",
            "BlendModeFilter=", !!PIXI.BlendModeFilter,
            "extensions=", !!PIXI.extensions,
            "ExtensionType.BlendMode=", !!(PIXI.ExtensionType && PIXI.ExtensionType.BlendMode)
        );
    }

    // -------------------------------------------------------------------------
    // v8 only: MZGlobalUpgrade auto-wraps every MZ class whose prototype chain
    // contains a PIXI wrapper (Sprite, TilingSprite, Container, ObjectRenderer).
    // Wrapped constructors use Reflect.construct so v8's real class super-chain
    // runs on the actual instance (not an orphan tmp), restoring proper dirty
    // tracking for transforms, animations, and scene-graph updates.
    //
    // PIXISuper detects __pixiInitialized and bails so wrapper-class initialize
    // methods don't try to re-invoke super via the broken copy approach.
    //
    // Must be called AFTER all corescript + plugin scripts have loaded but
    // BEFORE any gameplay class is instantiated (i.e., right before
    // SceneManager.run(Scene_Boot) in Main.onEffekseerLoad).
    // -------------------------------------------------------------------------
    window.MZGlobalUpgrade = function() {
        if (!PIXI.TextureSource) return; // v5/v6/v7 don't need this
        const candidatePixiClasses = [
            PIXI.Sprite,
            PIXI.TilingSprite,
            PIXI.Container,
            PIXI.ObjectRenderer
        ].filter(Boolean);

        const findPixiAncestor = (cls) => {
            if (!cls || !cls.prototype) return null;
            let proto = cls.prototype;
            let depth = 0;
            while (proto && proto !== Object.prototype && depth < 20) {
                for (const pc of candidatePixiClasses) {
                    if (proto === pc.prototype) return pc;
                }
                proto = Object.getPrototypeOf(proto);
                depth++;
            }
            return null;
        };

        const wrapClass = (orig, pixiBase) => {
            const wrapped = function(...args) {
                let v8Inst;
                try {
                    v8Inst = Reflect.construct(
                        pixiBase, [], new.target || wrapped
                    );
                } catch (err) {
                    // Some v8 classes require constructor args; fall back to
                    // running the original ctor with `this` as-is.
                    orig.apply(this, args);
                    return this;
                }
                v8Inst.__pixiInitialized = true;
                // v8 Sprite/Container ctors set things like `this.label = "Sprite"`
                // as own instance properties. If an MZ subclass (e.g.,
                // Sprite_Gauge) defines a prototype method with the same name
                // (Sprite_Gauge.prototype.label = function() {...}), the v8-set
                // own property SHADOWS the MZ method -- so `instance.label()`
                // becomes `"Sprite"()` and throws "is not a function".
                //
                // Walk the v8 instance's own keys; for any whose name is also
                // a function on the MZ subclass's prototype, delete the own
                // property so prototype lookup reaches the MZ method.
                try {
                    for (const k of Object.keys(v8Inst)) {
                        if (typeof orig.prototype[k] === "function") {
                            try { delete v8Inst[k]; } catch (e) {}
                        }
                    }
                } catch (e) {}
                try {
                    orig.apply(v8Inst, args);
                } catch (err) {
                    console.error(
                        "MZGlobalUpgrade: orig ctor threw for",
                        orig.name, err
                    );
                }
                // v8 removed automatic per-frame .render(renderer) /
                // ._render(renderer) dispatch on display objects (replaced by
                // the render-pipe system). Legacy MZ custom-render methods
                // like Sprite_Animation.prototype._render (Effekseer drawing)
                // and Tilemap.Layer.prototype.render therefore never fire.
                // v8 still provides per-frame onRender(renderer) callbacks,
                // so install one that bridges to the legacy methods.
                try {
                    const hasMzUnderRender =
                        typeof orig.prototype._render === "function";
                    const hasMzRender =
                        typeof orig.prototype.render === "function" &&
                        // Don't call inherited PIXI.Container.prototype.render
                        // (the renderer's own walker) -- only MZ-own overrides.
                        orig.prototype.render !==
                            (pixiBase.prototype && pixiBase.prototype.render);
                    if (hasMzUnderRender || hasMzRender) {
                        // Log the first throw per-class so we can diagnose
                        // when MZ legacy renders (Effekseer, UltraMode7) hit
                        // missing v5/6/7 renderer APIs on v8. Silent-catch
                        // would hide the cause of "nothing draws".
                        const className = orig.name || "(anonymous)";
                        v8Inst.onRender = function(renderer) {
                            if (hasMzUnderRender) {
                                try {
                                    this._render(renderer);
                                } catch (e) {
                                    if (!orig.__compatRenderWarned) {
                                        orig.__compatRenderWarned = true;
                                        console.warn(
                                            "pixi_compat: " + className +
                                            "._render(renderer) threw on v8",
                                            "(suppressing further warnings):",
                                            e
                                        );
                                    }
                                }
                            }
                            if (hasMzRender) {
                                try {
                                    this.render(renderer);
                                } catch (e) {
                                    if (!orig.__compatRenderWarned2) {
                                        orig.__compatRenderWarned2 = true;
                                        console.warn(
                                            "pixi_compat: " + className +
                                            ".render(renderer) threw on v8",
                                            "(suppressing further warnings):",
                                            e
                                        );
                                    }
                                }
                            }
                        };
                    }
                } catch (e) {}
                return v8Inst;
            };
            wrapped.prototype = orig.prototype;
            // Tag the wrapper with the original MZ class name so diagnostic
            // shims (e.g. the SpritePipe destroyed-sprite guard) can identify
            // which MZ class an instance came from -- otherwise every wrapped
            // class shows as `wrapped` in stack traces and constructor.name.
            try { wrapped.__origName = orig.name || "(anonymous)"; } catch (e) {}
            // Also preserve the original name as the wrapper's actual .name
            // property. Many MZ plugins gate behavior on
            //   SceneManager._scene.constructor.name === "Scene_Map"
            // or similar -- if every wrapped class reports `"wrapped"` these
            // checks silently fail. Function.name is non-writable-but-configurable
            // by spec, so defineProperty is the right tool here. MOG_TreasurePopup's
            // checkTreasurePopup was the first confirmed casualty (the pickup
            // never reaches the data queue because the scene-name check fails).
            try {
                Object.defineProperty(wrapped, "name", {
                    value: orig.name || "(anonymous)",
                    configurable: true
                });
            } catch (e) {}
            try { wrapped.prototype.constructor = wrapped; } catch (e) {}
            for (const k of Reflect.ownKeys(orig)) {
                if (k === "prototype" || k === "length" || k === "name") {
                    continue;
                }
                try {
                    Object.defineProperty(
                        wrapped, k,
                        Object.getOwnPropertyDescriptor(orig, k)
                    );
                } catch (e) {}
            }
            return wrapped;
        };

        const seen = new WeakSet();
        let wrappedCount = 0;
        for (const name of Object.getOwnPropertyNames(window)) {
            let cls;
            try { cls = window[name]; } catch (e) { continue; }
            if (typeof cls !== "function" || !cls.prototype) continue;
            if (seen.has(cls)) continue;
            seen.add(cls);
            const pixiBase = findPixiAncestor(cls);
            if (!pixiBase) continue;
            try {
                const wrapped = wrapClass(cls, pixiBase);
                window[name] = wrapped;
                wrappedCount++;
            } catch (e) {
                console.warn("MZGlobalUpgrade: failed to wrap", name, e);
            }
        }
        // v8 removed updateTransform as a per-frame hook. Classes that override
        // it (Window, Tilemap, TilingSprite) for per-frame logic (cursor pulse,
        // tile scroll, filter area, etc.) need to use the new onRender callback
        // instead. Patch their prototype.initialize so each instance registers
        // an onRender that dispatches to the existing updateTransform body.
        const classesWithUpdateTransform = [
            "Tilemap", "TilingSprite", "Window"
        ];
        for (const className of classesWithUpdateTransform) {
            const cls = window[className];
            if (!cls || !cls.prototype || !cls.prototype.initialize) continue;
            if (cls.prototype.__onRenderPatched) continue;
            cls.prototype.__onRenderPatched = true;
            const _origInit = cls.prototype.initialize;
            cls.prototype.initialize = function() {
                const ret = _origInit.apply(this, arguments);
                try {
                    this.onRender = function() {
                        try { this.updateTransform(); } catch (e) { /* v8 super may fail */ }
                    };
                } catch (e) {}
                return ret;
            };
        }

        console.log(
            "MZGlobalUpgrade: wrapped " + wrappedCount +
            " classes for v8 compatibility + onRender hooks installed"
        );

        // UltraMode7 v8 compat (installs Tilemap.Layer.render override that
        // routes to the offscreen-canvas WebGL1 renderer). No-op if UM7 isn't
        // loaded in this project.
        if (typeof window.installUltraMode7V8Compat === "function") {
            try { window.installUltraMode7V8Compat(); }
            catch (e) { console.warn("UltraMode7V8 install threw:", e); }
        }
    };
})();

//=============================================================================
// UltraMode7 v8 compatibility module
//=============================================================================
//
// UltraMode7's Tilemap.Layer.prototype.render override calls these v5/v6/v7
// renderer-plugin APIs that are dead stubs on v8:
//   renderer.plugins.um7tilemap, renderer.batch.setObjectRenderer,
//   renderer.shader.bind, renderer.geometry.bind/updateBuffers/draw,
//   renderer.state.set, renderer.texture.bind
// v8 dropped the entire renderer-plugin system.
//
// Compat strategy: monkey-patch UltraMode7's Tilemap.Layer.prototype.render
// from this file (after the plugin loads) so when Mode7 is active, the layer
// is queued for offscreen rendering on a dedicated WebGL1 canvas. Per frame,
// we render all queued layers using UM7's shader + atlas-texture pipeline on
// the offscreen context (raw GL, no PIXI involvement). The offscreen canvas
// is wrapped as a PIXI Sprite and inserted at the bottom of the Tilemap's
// children so characters render on top.
//
// Same architectural pattern as the Effekseer overlay: keep risky raw-GL
// drawing isolated from v8's render pipe by giving it its own context.
//
// Trade-offs vs. an in-pipe v8 Mesh port:
//   + No edits to UltraMode7.js
//   + Avoids the v8 render-pipe interference class of bugs (proven by Effekseer)
//   + UM7's existing shader and vertex layout reused as-is
//   - All UM7 tilemap layers composite as a single 2D plane (no inter-layer Z)
//   - Per-frame texture upload from offscreen canvas to a v8 Sprite
//=============================================================================

(function() {
    if (typeof PIXI === "undefined" || !PIXI.TextureSource) return;

    const ATLAS_SIZE = 2048;
    const HALF_ATLAS = 1024;
    const MAX_TEXTURES = 4; // matches Tilemap.Layer.MAX_GL_TEXTURES

    let initialized = false;
    let initFailed = false;
    let canvas = null;
    let gl = null;
    let program = null;
    const attribLocs = {};
    const uniformLocs = {};
    let atlases = [];          // 4 GL textures, 2048x2048 each
    let atlasLayerTracker = []; // tracks which Tilemap.Layer owns each atlas's contents
    let clearChunk = null;     // Uint8Array(1024*1024*4) for atlas quadrant clears
    let pixiTexture = null;    // PIXI.Texture wrapping our offscreen canvas
    let compositeSprite = null;
    const segmentGLData = new WeakMap(); // Tilemap.Layer -> { segments: [{vbo, ibo, indexCount}] }
    let pendingLayers = [];
    let frameNumber = 0;

    function ensureInit() {
        if (initialized) return true;
        if (initFailed) return false; // don't spam compile errors every frame
        if (typeof UltraMode7 === "undefined") return false;
        if (typeof Tilemap === "undefined" || !Tilemap.Layer) return false;
        if (!window.Graphics || !Graphics._canvas) return false;

        const game = Graphics._canvas;
        canvas = document.createElement("canvas");
        canvas.width = game.width;
        canvas.height = game.height;

        const ctxOpts = { premultipliedAlpha: false, alpha: true, antialias: false };
        gl = canvas.getContext("webgl", ctxOpts) ||
             canvas.getContext("experimental-webgl", ctxOpts);
        if (!gl) {
            console.error("UltraMode7V8: failed to create WebGL1 context on offscreen canvas");
            return false;
        }

        if (!compileShader()) { initFailed = true; return false; }
        // OES_element_index_uint -- WebGL1 only supports UNSIGNED_SHORT indices
        // (max 65535 verts) by default. Mode7 maps with map looping can have
        // 30k+ tiles (= 120k+ verts) so we need the uint-index extension or
        // drawElements wraps the indices at 16-bit boundaries and renders
        // garbage tiles.
        const uintExt = gl.getExtension("OES_element_index_uint");
        if (!uintExt) {
            console.warn("UltraMode7V8: OES_element_index_uint not available; large Mode7 maps (>16384 tiles) will render incorrectly");
        }
        createAtlases();
        clearChunk = new Uint8Array(HALF_ATLAS * HALF_ATLAS * 4);
        initialized = true;
        console.log("UltraMode7V8: initialized (offscreen canvas " +
            canvas.width + "x" + canvas.height + ", WebGL1, shader compiled, " +
            MAX_TEXTURES + " atlases created)");
        return true;
    }

    function compileShader() {
        // WebGL1 fragment shaders require an explicit precision declaration --
        // PIXI v5/v6/v7's Shader.from() auto-prepends this, but our raw
        // gl.compileShader() path doesn't. UM7's shader source is written
        // without one. Prepend mediump to both stages (vertex has a default
        // of highp so it would work either way; keep symmetric for clarity).
        const PRECISION = "precision mediump float;\nprecision mediump int;\n";
        const vsSrc = PRECISION + Tilemap.ULTRA_MODE_7_VERTEX_SHADER;
        const fsSrc = PRECISION + UltraMode7.generateFragmentShader(
            Tilemap.ULTRA_MODE_7_FRAGMENT_SHADER, MAX_TEXTURES);
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsSrc);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error("UltraMode7V8: VS compile error:", gl.getShaderInfoLog(vs));
            return false;
        }
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsSrc);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error("UltraMode7V8: FS compile error:", gl.getShaderInfoLog(fs));
            return false;
        }
        program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("UltraMode7V8: program link error:", gl.getProgramInfoLog(program));
            return false;
        }
        ["aTextureId", "aFrame", "aTextureCoord", "aVertexPosition", "aAnimation"]
            .forEach(n => { attribLocs[n] = gl.getAttribLocation(program, n); });
        ["uMode7ProjectionMatrix", "uMode7ModelviewMatrix", "uFadeBegin", "uFadeRange",
         "animationFrame", "shadowColor", "uFadeColor", "uSamplers", "uSamplerSize"]
            .forEach(n => { uniformLocs[n] = gl.getUniformLocation(program, n); });
        return true;
    }

    function createAtlases() {
        // Atlas filtering MUST be LINEAR for Mode7 perspective ground (matches
        // UM7's default behavior when TILEMAP_PIXELATED=false). With NEAREST,
        // aggressive perspective compression produces visible scanline ribbons
        // at every source-pixel-row boundary. UM7 prevents tile-edge bleed via
        // the fragment shader's clamp(texCoord, vFrame.xy, vFrame.zw) using
        // the eps=0.5 padding baked into the vertex aFrame values.
        atlases = [];
        atlasLayerTracker = [];
        for (let i = 0; i < MAX_TEXTURES; i++) {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS_SIZE, ATLAS_SIZE, 0,
                gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            atlases.push(tex);
            atlasLayerTracker.push(null);
        }
    }

    function uploadAtlasTextures(layer) {
        const images = layer._images;
        if (!images || images.length === 0) return;
        for (let i = 0; i < images.length && i < MAX_TEXTURES * 4; i++) {
            const img = images[i];
            if (!img) continue;
            const atlasIdx = i >> 2;
            const atlas = atlases[atlasIdx];
            const x = HALF_ATLAS * (i % 2);
            const y = HALF_ATLAS * ((i >> 1) % 2);
            gl.bindTexture(gl.TEXTURE_2D, atlas);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, HALF_ATLAS, HALF_ATLAS,
                gl.RGBA, gl.UNSIGNED_BYTE, clearChunk);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
            try {
                gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y,
                    gl.RGBA, gl.UNSIGNED_BYTE, img);
            } catch (e) { /* image may not be DOM-loaded yet; skip this frame */ }
        }
    }

    function getSegmentGLData(layer, segIdx) {
        let data = segmentGLData.get(layer);
        if (!data) {
            data = { segments: [] };
            segmentGLData.set(layer, data);
        }
        if (!data.segments[segIdx]) {
            data.segments[segIdx] = { vbo: gl.createBuffer(), ibo: gl.createBuffer() };
        }
        return data.segments[segIdx];
    }

    // Replicates UltraMode7's _updateVertexBuffer logic but writes into layer._vertexArray
    // (a plain Float32Array) instead of calling PIXI.Buffer.update.
    function buildVertexArray(layer) {
        const elements = layer._elements;
        const numElements = elements.length;
        // ULTRA_MODE_7_VERTEX_STRIDE is 44 (bytes per vertex). Per TILE we need
        // 4 vertices * 11 floats/vertex = 44 floats. UM7's original code uses
        // `numElements * STRIDE` directly because 44 bytes/vertex coincides
        // numerically with 44 floats/tile. Match UM7's allocation exactly.
        const required = numElements * Tilemap.Layer.ULTRA_MODE_7_VERTEX_STRIDE;
        if (!layer._vertexArray || layer._vertexArray.length < required) {
            layer._vertexArray = new Float32Array(required * 2);
        }
        const data = layer._vertexArray;
        const eps = 0.5;
        let idx = 0;
        for (let i = 0; i < numElements; i++) {
            const item = elements[i];
            const setNumber = item[0];
            const tid = setNumber >> 2;
            const sxOffset = HALF_ATLAS * (setNumber & 1);
            const syOffset = HALF_ATLAS * ((setNumber >> 1) & 1);
            const sx = item[1] + sxOffset;
            const sy = item[2] + syOffset;
            const dx = item[3], dy = item[4];
            const w = item[5], h = item[6];
            const ax = item[7], ay = item[8];
            const fl = sx + eps, ft = sy + eps;
            const fr = sx + w - eps, fb = sy + h - eps;
            const corners = [
                [sx, sy, dx, dy],
                [sx + w, sy, dx + w, dy],
                [sx + w, sy + h, dx + w, dy + h],
                [sx, sy + h, dx, dy + h]
            ];
            for (const c of corners) {
                data[idx++] = tid;
                data[idx++] = fl;
                data[idx++] = ft;
                data[idx++] = fr;
                data[idx++] = fb;
                data[idx++] = c[0];
                data[idx++] = c[1];
                data[idx++] = c[2];
                data[idx++] = c[3];
                data[idx++] = ax;
                data[idx++] = ay;
            }
        }
    }

    function renderLayer(layer) {
        if (!layer._allElements || layer._allElements.length === 0) return;
        if (!layer._allElements[0] || layer._allElements[0].length === 0) return;

        gl.useProgram(program);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);

        // Atlas textures: re-upload from layer._images whenever the layer flagged.
        if (layer._needsTexturesUpdate) {
            uploadAtlasTextures(layer);
            layer._needsTexturesUpdate = false;
        }
        for (let i = 0; i < MAX_TEXTURES; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, atlases[i]);
        }
        const samplerIndices = new Int32Array(MAX_TEXTURES);
        const samplerSizes = new Float32Array(MAX_TEXTURES * 2);
        for (let i = 0; i < MAX_TEXTURES; i++) {
            samplerIndices[i] = i;
            samplerSizes[i * 2] = 1 / ATLAS_SIZE;
            samplerSizes[i * 2 + 1] = 1 / ATLAS_SIZE;
        }
        gl.uniform1iv(uniformLocs.uSamplers, samplerIndices);
        gl.uniform2fv(uniformLocs.uSamplerSize, samplerSizes);

        // Per-frame perspective / fade uniforms
        // Wrap in Float32Array -- UM7's Matrix4 uses plain JS Arrays which
        // WebGL1 *should* accept per the spec, but some implementations are
        // strict about typed arrays for matrix uniforms.
        gl.uniformMatrix4fv(uniformLocs.uMode7ProjectionMatrix, false,
            new Float32Array($gameMap.ultraMode7ProjectionMatrix.data));
        gl.uniformMatrix4fv(uniformLocs.uMode7ModelviewMatrix, false,
            new Float32Array($gameMap.ultraMode7ModelviewMatrix.data));
        gl.uniform1f(uniformLocs.uFadeBegin, $gameMap.ultraMode7FadeBegin);
        gl.uniform1f(uniformLocs.uFadeRange,
            $gameMap.ultraMode7FadeEnd - $gameMap.ultraMode7FadeBegin);
        gl.uniform2fv(uniformLocs.animationFrame, new Float32Array([
            [0, 1, 2, 1][layer._animationFrame % 4], layer._animationFrame % 3
        ]));
        gl.uniform4fv(uniformLocs.shadowColor, new Float32Array([0, 0, 0, 0.5]));
        gl.uniform3fv(uniformLocs.uFadeColor,
            new Float32Array($gameMap.ultraMode7FadeColor));

        const stride = Tilemap.Layer.ULTRA_MODE_7_VERTEX_STRIDE;
        for (let segIdx = 0; segIdx < layer._allElements.length; segIdx++) {
            const elements = layer._allElements[segIdx];
            const numElements = elements.length;
            if (numElements === 0) continue;

            // Mirror UM7's "switch _elements/_vertexArray/_indexArray per segment" pattern
            layer._elements = elements;
            layer._vertexArray = layer._allVertexArrays[segIdx] || new Float32Array(0);
            layer._indexArray = layer._allIndexArrays[segIdx] || new Float32Array(0);

            // Index buffer (always recompute if growth needed)
            if (layer._indexArray.length < numElements * 6 * 2) {
                layer._indexArray = PIXI.utils.createIndicesForQuads(numElements * 2);
                layer._allIndexArrays[segIdx] = layer._indexArray;
            }

            // Vertex buffer rebuild if dirty
            if (layer._needsVertexUpdate) {
                buildVertexArray(layer);
                layer._allVertexArrays[segIdx] = layer._vertexArray;
            }

            const seg = getSegmentGLData(layer, segIdx);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, seg.ibo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, layer._indexArray, gl.STATIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, seg.vbo);
            gl.bufferData(gl.ARRAY_BUFFER, layer._vertexArray, gl.STATIC_DRAW);

            gl.enableVertexAttribArray(attribLocs.aTextureId);
            gl.vertexAttribPointer(attribLocs.aTextureId, 1, gl.FLOAT, false, stride, 0);
            gl.enableVertexAttribArray(attribLocs.aFrame);
            gl.vertexAttribPointer(attribLocs.aFrame, 4, gl.FLOAT, false, stride, 1 * 4);
            gl.enableVertexAttribArray(attribLocs.aTextureCoord);
            gl.vertexAttribPointer(attribLocs.aTextureCoord, 2, gl.FLOAT, false, stride, 5 * 4);
            gl.enableVertexAttribArray(attribLocs.aVertexPosition);
            gl.vertexAttribPointer(attribLocs.aVertexPosition, 2, gl.FLOAT, false, stride, 7 * 4);
            gl.enableVertexAttribArray(attribLocs.aAnimation);
            gl.vertexAttribPointer(attribLocs.aAnimation, 2, gl.FLOAT, false, stride, 9 * 4);

            // Index TYPE must match the array we uploaded.
            // PIXI.utils.createIndicesForQuads returns Uint32Array when total
            // vertex count > 65535; otherwise Uint16Array. Match it here or
            // GL reads indices wrong and renders garbage tiles.
            const indexType = (layer._indexArray instanceof Uint32Array)
                ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
            gl.drawElements(gl.TRIANGLES, numElements * 6, indexType, 0);
        }
        layer._needsVertexUpdate = false;
    }

    function findTilemap(node) {
        // Walk up from any Tilemap.Layer (or CombinedLayer) until we find the
        // actual Tilemap container. UM7 + CombinedLayer pattern means
        // layer.parent isn't necessarily the Tilemap itself.
        while (node) {
            if (typeof Tilemap === "function" && node instanceof Tilemap &&
                !(node instanceof Tilemap.Layer) &&
                !(Tilemap.CombinedLayer && node instanceof Tilemap.CombinedLayer)) {
                return node;
            }
            node = node.parent;
        }
        return null;
    }

    function ensureCompositeSprite(layer) {
        if (!canvas) return;
        // Mode7 -> Mode7 scene transition: the previous Spriteset_Map destroys
        // its tilemap with `{children: true}`, which cascades and destroys our
        // composite Sprite (it lives as tilemap.children[0]). The texture
        // wrapping the offscreen canvas is shared and also gets destroyed
        // through the cascade. Re-create both if they're destroyed -- otherwise
        // the destroyed Sprite would re-attach to the new tilemap, render
        // nothing, and trigger the SpritePipe destroyed-sprite guard every
        // frame.
        if (pixiTexture && pixiTexture.destroyed) {
            pixiTexture = null;
        }
        if (!pixiTexture) {
            const SourceClass = PIXI.CanvasSource || PIXI.TextureSource;
            const source = new SourceClass({ resource: canvas, scaleMode: "nearest" });
            pixiTexture = new PIXI.Texture({ source: source });
        }
        if (compositeSprite && compositeSprite.destroyed) {
            compositeSprite = null;
        }
        if (!compositeSprite) {
            compositeSprite = new PIXI.Sprite(pixiTexture);
            // Y-flip: our offscreen WebGL1 renders with bottom-left origin
            // (standard GL). When wrapped as a PIXI Sprite on v8's renderer,
            // the perspective comes out vertically inverted. scale.y=-1 with
            // position.y=canvas.height flips the displayed texture so the
            // Mode7 ground appears in the foreground (bottom) as expected.
            compositeSprite.scale.y = -1;
            compositeSprite.position.y = canvas.height;
        }
        const tilemap = findTilemap(layer);
        if (!tilemap) return;
        if (compositeSprite.parent !== tilemap) {
            if (compositeSprite.parent) {
                compositeSprite.parent.removeChild(compositeSprite);
            }
            tilemap.addChildAt(compositeSprite, 0);
        }
    }

    function flushFrame() {
        if (!initialized || pendingLayers.length === 0) return;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        for (const layer of pendingLayers) {
            try { renderLayer(layer); }
            catch (e) {
                if (!flushFrame.__warned) {
                    flushFrame.__warned = true;
                    console.warn("UltraMode7V8: renderLayer threw:", e);
                }
            }
        }
        pendingLayers.length = 0;
        frameNumber++;
        if (pixiTexture && pixiTexture.source && pixiTexture.source.update) {
            pixiTexture.source.update();
        }
    }

    // Expose internals for diagnostics
    window.__UM7V8 = {
        getCanvas: () => canvas,
        getGL: () => gl,
        getAtlases: () => atlases,
        getPendingLayers: () => pendingLayers,
        getCompositeSprite: () => compositeSprite,
        getPixiTexture: () => pixiTexture,
        isInitialized: () => initialized,
        getFrameNumber: () => frameNumber,
        snapshot: () => canvas ? canvas.toDataURL() : null
    };

    // Public entry point: call from MZGlobalUpgrade or after plugin load.
    window.installUltraMode7V8Compat = function() {
        if (typeof PIXI === "undefined" || !PIXI.TextureSource) return;
        if (typeof Tilemap === "undefined" || !Tilemap.Layer) return;
        if (typeof UltraMode7 === "undefined") return;
        if (Tilemap.Layer.prototype.__um7V8RenderInstalled) return;
        Tilemap.Layer.prototype.__um7V8RenderInstalled = true;

        const origRender = Tilemap.Layer.prototype.render;
        Tilemap.Layer.prototype.render = function(renderer) {
            if (UltraMode7 && UltraMode7.isActive && UltraMode7.isActive()) {
                if (!ensureInit()) return;
                // Pass `this` (the Layer) and let findTilemap walk up to find
                // the actual Tilemap container (skipping CombinedLayer etc).
                ensureCompositeSprite(this);
                if (pendingLayers.indexOf(this) === -1) {
                    pendingLayers.push(this);
                }
                return;
            }
            return origRender.call(this, renderer);
        };

        // Tilemap.Layer isn't on window (it's Tilemap.Layer, a sub-property),
        // so MZGlobalUpgrade's window-scan doesn't wrap it -> v8 never installs
        // an onRender callback on Layer instances -> our render override
        // above never gets called per-frame. Patch initialize so every new
        // Layer instance gets onRender that bridges to its render method.
        if (!Tilemap.Layer.prototype.__layerOnRenderPatched) {
            Tilemap.Layer.prototype.__layerOnRenderPatched = true;
            const origLayerInit = Tilemap.Layer.prototype.initialize;
            Tilemap.Layer.prototype.initialize = function() {
                const ret = origLayerInit.apply(this, arguments);
                try {
                    this.onRender = function(renderer) {
                        try { this.render(renderer); } catch (e) {}
                    };
                } catch (e) {}
                return ret;
            };
            console.log("pixi_compat: patched Tilemap.Layer.initialize to install per-instance onRender (Layer is sub-property of Tilemap; MZGlobalUpgrade window-scan missed it)");
        }

        // Hook into the engine's per-frame tick so we flush AFTER v8 finishes
        // its render pass. compositeSprite's PIXI Sprite shows the offscreen
        // canvas; v8 then displays our texture in its next frame.
        if (window.Graphics && Graphics._onTick && !Graphics._onTick.__um7V8Wrapped) {
            const origOnTick = Graphics._onTick;
            Graphics._onTick = function(deltaTime) {
                const ret = origOnTick.call(this, deltaTime);
                try { flushFrame(); } catch (e) {}
                return ret;
            };
            Graphics._onTick.__um7V8Wrapped = true;
        }

        console.log("pixi_compat: UltraMode7V8 render hook installed (Tilemap.Layer.render override)");
    };
})();

