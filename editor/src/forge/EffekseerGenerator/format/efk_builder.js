// ─────────────────────────────────────────────────────────────────────────
// efk_builder.js — constructs effect objects (the shape efk_format.js
// parses/writes) from compact node specs with sane defaults.
//
// This is the layer recipes talk to: a recipe describes "a sprite emitter
// with 20 particles, additive blend, PVA motion" and the builder fills in
// the ~60 other fields the binary format requires. Every default below is
// anchored in values observed across the 120 stock MZ effects (see
// efk-format tests), not guessed.
//
// Emits binary version 1500 (Effekseer 1.5 — the newer of the two stock
// versions; the engine's bundled 1.70b runtime plays it natively).
//
// Runs in BOTH Node (tests) and the browser (editor). No Node-only APIs.
// ─────────────────────────────────────────────────────────────────────────

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('./efk_format.js'));
    } else {
        root.RR_EfkBuilder = factory(root.RR_EfkFormat);
    }
})(typeof self !== 'undefined' ? self : this, function (fmt) {
'use strict';

const { NODE_TYPE } = fmt;
const BIN_VERSION = 1500;
const FLT_MAX = 3.4028234663852886e38;

// ── Value shorthands ─────────────────────────────────────────────────────
// Recipes use these to express ranged values tersely. All accept either
// (min, max) or a single value for a fixed amount.

const rf = (min, max = min) => ({ max, min });                   // random_float/int
const rv3 = (min, max = min) => ({                               // random_vector3d
    max: { x: max.x ?? max, y: max.y ?? max, z: max.z ?? max },
    min: { x: min.x ?? min, y: min.y ?? min, z: min.z ?? min },
});
const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const v2 = (x = 0, y = 0) => ({ x, y });
const rgba = (r, g, b, a = 255) => ({ r, g, b, a });
const WHITE = () => rgba(255, 255, 255, 255);

const NO_REF = () => ({ max: -1, min: -1 });

// ── Deep merge (plain objects only; arrays replace wholesale) ────────────
function merge(base, over) {
    if (over === undefined) return base;
    if (Array.isArray(over) || typeof over !== 'object' || over === null ||
        Array.isArray(base) || typeof base !== 'object' || base === null) return over;
    const out = { ...base };
    for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
    return out;
}

// ── Struct defaults (anchored in stock-effect values) ────────────────────

const defaultCommonValues = () => ({
    refEqMaxGeneration: -1,
    refEqLife: NO_REF(),
    refEqGenerationTime: NO_REF(),
    refEqGenerationTimeOffset: NO_REF(),
    maxGeneration: 1,
    translationBindType: 1,        // WhenCreating
    rotationBindType: 1,
    scalingBindType: 1,
    removeWhenLifeIsExtinct: 1,
    removeWhenParentIsRemoved: 0,
    removeWhenChildrenIsExtinct: 0,
    life: rf(60),
    generationTime: rf(1),
    generationTimeOffset: rf(0),
});

const defaultTranslation = () => ({ type: 0, refEq: -1, position: v3() });
const defaultLocalForceField = () => ({ elements: [], locationAbs: { type: 0 } });
const defaultRotation = () => ({ type: 0, refEq: -1, rotation: v3() });
const defaultScaling = () => ({ type: 0, refEq: -1, scale: v3(1, 1, 1) });
const defaultGenerationLocation = () => ({ effectsRotation: 0, type: 0, location: rv3(0) });

const defaultDepthValues = () => ({
    depthOffset: 0,
    isDepthOffsetScaledWithCamera: 0,
    isDepthOffsetScaledWithParticleScale: 0,
    suppressionOfScalingByDepth: 1,
    depthClipping: FLT_MAX,
    zSort: 0,
    drawingPriority: 0,
    softParticle: 0,
});

const defaultRendererCommon = () => ({
    materialType: 0,
    colorTextureIndex: -1,        // -1 = untextured (plain quad)
    normalTextureIndex: -1,
    alphaBlend: 2,                // Add — the RPG-effect staple
    textureFilter: 1,             // linear
    textureWrap: 0,               // repeat (TextureWrapType: Repeat=0, Clamp=1, Mirror=2)
    textureFilter2: 1,
    textureWrap2: 0,
    zTest: 1,
    zWrite: 0,
    fadeInType: 0,
    fadeOutType: 0,
    uv: { type: 0 },
    colorBindType: 0,
    distortionIntensity: 1,
    customData1: { type: 0 },
    customData2: { type: 0 },
});

const defaultSound = () => ({ type: 0 });

// Per-node-type renderer params.
const defaultRendererParams = {
    [NODE_TYPE.NONE]: () => ({}),
    [NODE_TYPE.SPRITE]: () => ({
        renderingOrder: 0,
        billboard: 0,             // full billboard
        allColor: { type: 0, fixed: WHITE() },
        colorType: 0,
        positionType: 1,
        positions: { ll: v2(-0.5, -0.5), lr: v2(0.5, -0.5), ul: v2(-0.5, 0.5), ur: v2(0.5, 0.5) },
    }),
    [NODE_TYPE.RING]: () => ({
        renderingOrder: 0,
        billboard: 2,             // Y-axis (rings usually lie flat / spin)
        shapeType: 0,             // donut
        vertexCount: 32,
        viewingAngle: { type: 0, fixed: 360 },
        outerLocation: { type: 0, location: v2(2, 0) },
        innerLocation: { type: 0, location: v2(1, 0) },
        centerRatio: { type: 0, fixed: 0.5 },
        outerColor: { type: 0, fixed: WHITE() },
        centerColor: { type: 0, fixed: WHITE() },
        innerColor: { type: 0, fixed: WHITE() },
    }),
    [NODE_TYPE.TRACK]: () => ({
        textureUVType: { type: 0 },
        sizeFor: { type: 0, size: 0 },
        sizeMiddle: { type: 0, size: 1 },
        sizeBack: { type: 0, size: 0 },
        splineDivision: 8,
        colorLeft: { type: 0, fixed: WHITE() },
        colorLeftMiddle: { type: 0, fixed: WHITE() },
        colorCenter: { type: 0, fixed: WHITE() },
        colorCenterMiddle: { type: 0, fixed: WHITE() },
        colorRight: { type: 0, fixed: WHITE() },
        colorRightMiddle: { type: 0, fixed: WHITE() },
    }),
    [NODE_TYPE.RIBBON]: () => ({
        textureUVType: { type: 0 },
        viewpointDependent: 0,
        allColor: { type: 0, fixed: WHITE() },
        colorType: 0,
        positionType: 0,
        positions: { l: -0.5, r: 0.5 },
        splineDivision: 1,
    }),
    [NODE_TYPE.MODEL]: () => ({
        magnification: 1,
        modelIndex: 0,
        billboard: 2,             // fixed — full 3D orientation (stock convention)
        culling: 2,               // double-sided
        allColor: { type: 0, fixed: WHITE() },
    }),
};

// ── Node + effect construction ───────────────────────────────────────────

/**
 * Build a full node from a compact spec.
 * @param {number} type NODE_TYPE.*
 * @param {object} [spec] deep-merged field overrides; spec.children is an
 *   array of already-built nodes.
 */
function makeNode(type, spec = {}) {
    if (!(type in defaultRendererParams)) {
        throw new Error(`efk_builder: unsupported node type ${type}`);
    }
    const { children = [], ...over } = spec;
    const base = {
        type,
        typeName: fmt.NODE_TYPE_NAME[type],
        isRendered: 1,
        renderingPriority: 0,   // overwritten by makeEffect (DFS index)
        commonValues: defaultCommonValues(),
        translation: defaultTranslation(),
        localForceField: defaultLocalForceField(),
        rotation: defaultRotation(),
        scaling: defaultScaling(),
        generationLocation: defaultGenerationLocation(),
        depthValues: defaultDepthValues(),
        rendererCommon: defaultRendererCommon(),
        rendererParams: defaultRendererParams[type](),
        sound: defaultSound(),
    };
    const node = merge(base, over);
    node.children = children;
    return node;
}

/**
 * Wrap nodes in a static rotated container (used to bake a whole-effect
 * orientation into the file). Children get bind Always so the container's
 * frame applies rigidly.
 * @param {object[]} nodes
 * @param {{x:number,y:number,z:number}} rotation radians
 */
function wrapInRotatedContainer(nodes, rotation) {
    for (const n of nodes) {
        n.commonValues.translationBindType = 2;   // Always
        n.commonValues.rotationBindType = 2;
    }
    return makeNode(NODE_TYPE.NONE, {
        commonValues: {
            maxGeneration: 1,
            life: rf(9999),
            removeWhenLifeIsExtinct: 1,
            removeWhenChildrenIsExtinct: 1,   // ends exactly when content ends
        },
        rotation: { type: 0, refEq: -1, rotation: { ...rotation } },
        children: nodes,
    });
}

/**
 * Build a complete effect object ready for writeEfkefc().
 * @param {object} spec
 * @param {string[]} [spec.textures] color texture paths (e.g. "Texture/glow.png")
 * @param {string[]} [spec.models] model paths (e.g. "Model/rr_hypercube.efkmodel")
 * @param {{x,y,z}} [spec.orientation] whole-effect rotation in radians —
 *   bakes a rotated container around spec.nodes
 * @param {number} [spec.magnification]
 * @param {object[]} spec.nodes top-level emitter nodes (children of root)
 */
function makeEffect(spec) {
    const textures = spec.textures || [];
    const models = spec.models || [];
    let nodes = spec.nodes;
    const o = spec.orientation;
    if (o && (o.x || o.y || o.z)) {
        nodes = [wrapInRotatedContainer(nodes, o)];
    }
    // Top-level nodes must bind Always to the root transform, or
    // handle.setLocation/setRotation (the preview gizmo, MZ's per-frame
    // target steering) silently no-op on them. Recipes that leave the
    // WhenCreating default (the burst emitters) get promoted here;
    // explicit binds are respected.
    for (const n of nodes) {
        if (n.commonValues.translationBindType === 1) n.commonValues.translationBindType = 2;
        if (n.commonValues.rotationBindType === 1) n.commonValues.rotationBindType = 2;
    }
    // renderingPriority MUST be the node's depth-first index (0..N-1) and
    // renderingNodesCount must be N: the v13+ runtime treats priority as an
    // index into a per-effect rendering list. All 120 stock effects follow
    // this exactly; -1 (the pre-v13 in-memory default) crashes the WASM
    // renderer with "function signature mismatch" at drawHandle.
    let nonRootCount = 0;
    for (const n of nodes) {
        (function assign(x) {
            x.renderingPriority = nonRootCount++;
            x.children.forEach(assign);
        })(n);
    }
    return {
        containerVersion: 0,
        info: {
            infoVersion: 1500,
            colorImages: textures,
            normalImages: [],
            distortionImages: [],
            models,
            sounds: [],
            materials: [],
        },
        header: {
            version: BIN_VERSION,
            colorImages: textures,
            normalImages: [],
            distortionImages: [],
            sounds: [],
            models,
            materials: [],
            dynamicInputs: [],
            dynamicEquations: [],
            renderingNodesCount: nonRootCount,   // == non-root node count (corpus-verified)
            renderingNodesThreshold: 0,
            magnification: spec.magnification ?? 1,
            defaultRandomSeed: -1,
            culling: { shape: 0 },
        },
        root: {
            type: NODE_TYPE.ROOT,
            typeName: 'Root',
            children: nodes,
        },
    };
}

return {
    BIN_VERSION,
    rf, rv3, v3, v2, rgba, WHITE,
    merge,
    makeNode,
    makeEffect,
    wrapInRotatedContainer,
};
});
