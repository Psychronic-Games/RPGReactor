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
    // v7 removed PIXI.Renderer.registerPlugin; new mechanism is
    // PIXI.extensions.add({ name, ref, type: ExtensionType.RendererPlugin }).
    // -------------------------------------------------------------------------
    if (
        PIXI.Renderer &&
        !PIXI.Renderer.registerPlugin &&
        PIXI.extensions &&
        PIXI.ExtensionType
    ) {
        PIXI.Renderer.registerPlugin = function(name, ref) {
            PIXI.extensions.add({
                name: name,
                ref: ref,
                type: PIXI.ExtensionType.RendererPlugin
            });
        };
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
                return instance;
            }
            throw e;
        }
    };
})();
