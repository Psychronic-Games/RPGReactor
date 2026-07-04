// ─────────────────────────────────────────────────────────────────────────
// efk_format.js — reader (and eventually writer) for Effekseer .efkefc files.
//
// Ported from the Effekseer C++ runtime loader (see
// INSPIRATION/Effekseer_Source_Code/Dev/Cpp/Effekseer/Effekseer/):
//   • Container:  IO/Effekseer.EfkEfcFactory.cpp   — EFKE magic + FourCC chunks
//   • BIN_ body:  Effekseer.Effect.cpp LoadBody()  — SKFE magic + resources
//   • Node tree:  Effekseer.EffectNode.cpp LoadParameter() + per-type
//                 LoadRendererParameter overrides
//
// Scope:
//   READ  — binary versions 15 (Effekseer 1.4x), 1500 (1.5), 1610 (1.6),
//           1710 (1.7). Version numbering is numeric and jumped 15 → 1500,
//           so gates read like:
//             version >= 14   → true for all supported versions
//             version >= 16   → true for 1500/1610/1710 (careful!)
//             version >= 1600 → true only for 1610/1710
//             version >= 1700 → true only for 1710
//           Version constants (Utils/Effekseer.BinaryVersion.h):
//             1600..1608 = Version16Alpha1..9, 1610 = Version16,
//             1700..1705 = Version17Alpha1..6, 1710 = Version17.
//           For >=1600 files a few size-prefixed blocks whose internals
//           changed (vec3/float easing, axis-easing float) are skipped by
//           their size prefix and stored as { _skipped: byteCount } — good
//           enough for study parsing; everything else is field-exact.
//   WRITE — version 1500 only (the writer is untouched by 1.6/1.7 support
//           and never emits the new structures).
//
// Runs in BOTH Node (tests / CLI validation against the stock effect corpus)
// and the browser (editor preview + generator). No Node-only APIs here.
// All multi-byte values are little-endian. Strings are int32 length in
// char16 units (including NUL terminator) followed by UTF-16LE bytes.
// ─────────────────────────────────────────────────────────────────────────

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) module.exports = factory();
    else root.RR_EfkFormat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const SUPPORTED_BIN_VERSIONS = [15, 1500, 1610, 1710];

// EffectNodeType (Effekseer.Base.Pre.h; value 1 is unused)
const NODE_TYPE = {
    ROOT: -1,
    NONE: 0,
    SPRITE: 2,
    RIBBON: 3,
    RING: 4,
    MODEL: 5,
    TRACK: 6,
};
const NODE_TYPE_NAME = {
    '-1': 'Root', 0: 'None', 2: 'Sprite', 3: 'Ribbon', 4: 'Ring', 5: 'Model', 6: 'Track',
};

class BinReader {
    /** @param {Uint8Array} bytes */
    constructor(bytes) {
        this.bytes = bytes;
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this.off = 0;
    }
    get remaining() { return this.bytes.byteLength - this.off; }
    guard(n) {
        if (this.off + n > this.bytes.byteLength) {
            throw new Error(`efk_format: read past end (want ${n} at ${this.off}, size ${this.bytes.byteLength})`);
        }
    }
    i32()  { this.guard(4); const v = this.view.getInt32(this.off, true);   this.off += 4; return v; }
    u32()  { this.guard(4); const v = this.view.getUint32(this.off, true);  this.off += 4; return v; }
    f32()  { this.guard(4); const v = this.view.getFloat32(this.off, true); this.off += 4; return v; }
    u8()   { this.guard(1); return this.bytes[this.off++]; }
    fourcc() {
        this.guard(4);
        const s = String.fromCharCode(this.bytes[this.off], this.bytes[this.off + 1],
                                      this.bytes[this.off + 2], this.bytes[this.off + 3]);
        this.off += 4;
        return s;
    }
    /** int32 char16-count (incl. NUL) + UTF-16LE payload */
    str16() {
        const len = this.i32();
        if (len <= 0) return '';
        this.guard(len * 2);
        let s = '';
        for (let i = 0; i < len - 1; i++) {
            s += String.fromCharCode(this.view.getUint16(this.off + i * 2, true));
        }
        this.off += len * 2;
        return s;
    }
    skip(n) { this.guard(n); this.off += n; }
    sub(n)  { this.guard(n); const s = this.bytes.subarray(this.off, this.off + n); this.off += n; return s; }
}

// ── Container ────────────────────────────────────────────────────────────

/**
 * Parse the outer .efkefc container.
 * @param {Uint8Array} bytes
 * @returns {{version:number, chunks:Array<{forcc:string, data:Uint8Array}>}}
 */
function parseContainer(bytes) {
    const r = new BinReader(bytes);
    const magic = r.fourcc();
    if (magic !== 'EFKE') throw new Error(`efk_format: bad container magic "${magic}"`);
    const version = r.i32();
    const chunks = [];
    while (r.remaining >= 8) {
        const forcc = r.fourcc();
        const size = r.i32();
        chunks.push({ forcc, data: r.sub(size) });
    }
    return { version, chunks };
}

function findChunk(container, forcc) {
    const c = container.chunks.find((c) => c.forcc === forcc);
    return c ? c.data : null;
}

// ── INFO chunk (resource listing; EfkEfcProperty::Load) ──────────────────

// INFO FileType (editor Define.cs): dependency-table entries for
// infoVersion > 1610.
const INFO_FILE_TYPE = { EFFECT: 0, TEXTURE: 1, SOUND: 2, MODEL: 3, MATERIAL: 4, CURVE: 5, DIRECTORY: 254, OTHER: 255 };

function parseInfo(data) {
    const r = new BinReader(data);
    let infoVersion = 0;
    // A leading int >= 1500 is a version marker preceding the payload.
    if (data.byteLength >= 4 && r.view.getInt32(0, true) >= 1500) infoVersion = r.i32();

    // infoVersion > 1610 (17xx): a single dependency table replaces the
    // per-kind string lists (editor IO/EfkEfc.cs GetInfoData). Entries are
    // { i32 fileType, i32 flag, str16 path }; flag is sRGB(1)/Linear(2)
    // bits for textures. Bucket them back into the classic lists so
    // downstream consumers see one shape.
    if (infoVersion > 1610) {
        const info = {
            colorImages: [], normalImages: [], distortionImages: [],
            models: [], sounds: [], materials: [], curves: [],
            dependencies: [], infoVersion,
        };
        const count = r.i32();
        for (let i = 0; i < count; i++) {
            const dep = { fileType: r.i32(), flag: r.i32(), path: r.str16() };
            info.dependencies.push(dep);
            switch (dep.fileType) {
                case INFO_FILE_TYPE.TEXTURE:
                    // sRGB textures are the classic "color" list; pure-linear
                    // ones were normal/distortion maps (no way to split those
                    // two apart any more — keep them together under normal).
                    if (dep.flag & 1) info.colorImages.push(dep.path);
                    if ((dep.flag & 2) && !(dep.flag & 1)) info.normalImages.push(dep.path);
                    break;
                case INFO_FILE_TYPE.SOUND: info.sounds.push(dep.path); break;
                case INFO_FILE_TYPE.MODEL: info.models.push(dep.path); break;
                case INFO_FILE_TYPE.MATERIAL: info.materials.push(dep.path); break;
                case INFO_FILE_TYPE.CURVE: info.curves.push(dep.path); break;
                default: break;
            }
        }
        return info;
    }

    const readList = () => {
        const n = r.i32();
        const out = [];
        for (let i = 0; i < n; i++) out.push(r.str16());
        return out;
    };
    const info = {
        colorImages: readList(),
        normalImages: readList(),
        distortionImages: readList(),
        models: readList(),
        sounds: readList(),
    };
    info.materials = infoVersion >= 1500 ? readList() : [];
    // 1600..1610 info chunks append a curves list after materials.
    info.curves = infoVersion >= 1600 ? readList() : [];
    info.infoVersion = infoVersion;
    return info;
}

// ── BIN_ chunk (SKFE runtime body; EffectImplemented::LoadBody) ──────────

function parseBinHeader(r) {
    const magic = r.fourcc();
    if (magic !== 'SKFE') throw new Error(`efk_format: bad SKFE magic "${magic}"`);
    const version = r.i32();
    if (!SUPPORTED_BIN_VERSIONS.includes(version)) {
        throw new Error(`efk_format: unsupported binary version ${version}`);
    }

    const readList = () => {
        const n = r.i32();
        const out = [];
        for (let i = 0; i < n; i++) out.push(r.str16());
        return out;
    };

    const h = { version };
    h.colorImages = readList();                    // always
    h.normalImages = readList();                   // v>=9
    h.distortionImages = readList();               // v>=9
    h.sounds = readList();                         // v>=1
    h.models = readList();                         // v>=6
    h.materials = readList();                      // v>=15 (all supported)

    const readCurvesAndProceduralModels = () => {
        h.curves = readList();
        const pmCount = r.i32();
        h.proceduralModels = [];
        for (let i = 0; i < pmCount; i++) h.proceduralModels.push(parseProceduralModel(r, version));
    };

    // v>=1607 (Version16Alpha8): curves + procedural models BEFORE dynamics
    if (version >= 1607) readCurvesAndProceduralModels();

    // v>=14: dynamic inputs + dynamic equations
    const dynamicInputCount = r.i32();
    h.dynamicInputs = [];
    for (let i = 0; i < dynamicInputCount; i++) h.dynamicInputs.push(r.f32());
    const dynamicEquationCount = r.i32();
    h.dynamicEquations = [];
    for (let i = 0; i < dynamicEquationCount; i++) {
        const size = r.i32();
        h.dynamicEquations.push(r.sub(size).slice());   // opaque blob
    }

    // 1600 <= v < 1607: curves + procedural models AFTER dynamics instead
    if (version >= 1600 && version < 1607) readCurvesAndProceduralModels();

    // v>=13
    h.renderingNodesCount = r.i32();
    h.renderingNodesThreshold = r.i32();
    // v>=2
    h.magnification = r.f32();
    // v>=11
    h.defaultRandomSeed = r.i32();
    // v>=9: culling
    h.culling = { shape: r.i32() };
    if (h.culling.shape === 1 /* CullingShape::Sphere */) {
        h.culling.radius = r.f32();
        h.culling.x = r.f32();
        h.culling.y = r.f32();
        h.culling.z = r.f32();
    }
    // v>=1702 (Version17Alpha3): LOD distances
    if (version >= 1702) {
        h.lods = { distance1: r.f32(), distance2: r.f32(), distance3: r.f32() };
    }
    return h;
}

// ProceduralModelParameter::Load (Model/Effekseer.ProceduralModelParameter.h).
// Gates below use Version16Alpha9 = 1608 (true for both 1610 and 1710).
function parseProceduralModel(r, version) {
    const p = { type: r.i32() };
    if (p.type === 0) {           // Mesh
        p.mesh = { angleBegin: r.f32(), angleEnd: r.f32(), divisions: [r.i32(), r.i32()] };
        if (version >= 1608) p.mesh.rotate = r.f32();
    } else if (p.type === 1) {    // Ribbon
        p.ribbon = {
            crossSection: r.i32(),
            rotate: r.f32(),
            vertices: r.i32(),
            ribbonSizes: [r.f32(), r.f32()],
            ribbonAngles: [r.f32(), r.f32()],
            ribbonNoises: [r.f32(), r.f32()],
            count: r.i32(),
        };
    } else {
        throw new Error(`efk_format: unknown procedural model type ${p.type}`);
    }
    p.primitiveType = r.i32();
    switch (p.primitiveType) {
        case 0: p.sphere = { radius: r.f32(), depthMin: r.f32(), depthMax: r.f32() }; break;
        case 1: p.cone = { radius: r.f32(), depth: r.f32() }; break;
        case 2: p.cylinder = { radius1: r.f32(), radius2: r.f32(), depth: r.f32() }; break;
        case 3: p.spline4 = { points: [r.f32(), r.f32(), r.f32(), r.f32(), r.f32(), r.f32(), r.f32(), r.f32()] }; break;
        default: throw new Error(`efk_format: unknown procedural model primitive ${p.primitiveType}`);
    }
    const f2 = () => [r.f32(), r.f32()];
    const f3 = () => [r.f32(), r.f32(), r.f32()];
    p.axisType = r.i32();
    p.tiltNoiseFrequency = f2();
    p.tiltNoiseOffset = f2();
    p.tiltNoisePower = f2();
    p.waveNoiseFrequency = f3();
    p.waveNoiseOffset = f3();
    p.waveNoisePower = f3();
    p.curlNoiseFrequency = f3();
    p.curlNoiseOffset = f3();
    p.curlNoisePower = f3();
    p.colorUpperLeft = color4(r);
    p.colorUpperCenter = color4(r);
    p.colorUpperRight = color4(r);
    p.colorMiddleLeft = color4(r);
    p.colorMiddleCenter = color4(r);
    p.colorMiddleRight = color4(r);
    if (version >= 1608) {
        p.colorLowerLeft = color4(r);
        p.colorLowerCenter = color4(r);
        p.colorLowerRight = color4(r);
        p.colorCenterPosition = f2();
    }
    p.colorCenterArea = f2();
    if (version >= 1608) {
        p.vertexColorNoiseFrequency = f3();
        p.vertexColorNoiseOffset = f3();
        p.vertexColorNoisePower = f3();
        p.uvPosition = f2();
        p.uvSize = f2();
    }
    return p;
}

// ── Node structs ─────────────────────────────────────────────────────────
// Ported from the per-struct Load() functions. For v15/v1500 these layouts
// are byte-identical (all version gates between 15 and 1500 fall the same
// way for every struct here; the constants Version16Alpha1=1600 etc. are
// all above both). TriggerParam / LODs / KillRules / Collisions /
// LocalForceField read NOTHING below 1600-era versions, so they have no
// parse functions at all.

const randFloat = (r) => ({ max: r.f32(), min: r.f32() });
const randInt   = (r) => ({ max: r.i32(), min: r.i32() });
const vec3      = (r) => ({ x: r.f32(), y: r.f32(), z: r.f32() });
const refMinMax = (r) => ({ max: r.i32(), min: r.i32() });

// ParameterCommonValues::Load — int32 size (must be 80) + the 80-byte
// ParameterCommonValues_BackCompatibility_17 block.
function parseCommonValues(r) {
    const size = r.i32();
    if (size !== 80) throw new Error(`efk_format: CommonValues size ${size}, expected 80`);
    return {
        refEqMaxGeneration: r.i32(),
        refEqLife: refMinMax(r),
        refEqGenerationTime: refMinMax(r),
        refEqGenerationTimeOffset: refMinMax(r),
        maxGeneration: r.i32(),
        translationBindType: r.i32(),
        rotationBindType: r.i32(),
        scalingBindType: r.i32(),
        removeWhenLifeIsExtinct: r.i32(),
        removeWhenParentIsRemoved: r.i32(),
        removeWhenChildrenIsExtinct: r.i32(),
        life: randInt(r),
        generationTime: randFloat(r),
        generationTimeOffset: randFloat(r),
    };
}

// ParameterDepthValues::Load — 8 fields, 32 bytes.
function parseDepthValues(r) {
    return {
        depthOffset: r.f32(),
        isDepthOffsetScaledWithCamera: r.i32(),
        isDepthOffsetScaledWithParticleScale: r.i32(),
        suppressionOfScalingByDepth: r.f32(),
        depthClipping: r.f32(),
        zSort: r.i32(),
        drawingPriority: r.i32(),
        softParticle: r.f32(),
    };
}

// KillRulesParameter::Load (Parameter/Effekseer.KillRules.cpp) — v>=1704.
function parseKillRules(r) {
    const k = { type: r.i32(), isScaleAndRotationApplied: r.i32() };
    if (k.type === 1) {          // Box
        k.box = { center: vec3(r), size: vec3(r), isKillInside: r.i32() };
    } else if (k.type === 2) {   // Plane
        k.plane = { planeAxis: vec3(r), planeOffset: r.f32() };
    } else if (k.type === 3) {   // Sphere
        k.sphere = { center: vec3(r), radius: r.f32(), isKillInside: r.i32() };
    } else if (k.type !== 0) {
        throw new Error(`efk_format: unknown kill rules type ${k.type}`);
    }
    return k;
}

// ParameterAlphaCutoff::load (Parameter/Effekseer.AlphaCutoff.h) — v>=1600.
// The type payload is size-prefixed and skipped by size; the edge fields
// after it are not size-prefixed.
function parseAlphaCutoff(r, version) {
    const a = { type: r.i32() };
    const bufferSize = r.i32();
    a._skipped = bufferSize;
    r.skip(bufferSize);
    a.edgeThreshold = r.f32();
    a.edgeColor = color4(r);
    // v>=1606 stores a float; earlier an int32 (cast to float by the runtime)
    a.edgeColorScaling = version >= 1606 ? r.f32() : r.i32();
    return a;
}

// ParameterSound::Load — int32 type; if Use(1), the 44-byte parameter block.
function parseSound(r) {
    const type = r.i32();
    if (type !== 1) return { type };
    return {
        type,
        waveId: r.i32(),
        volume: randFloat(r),
        pitch: randFloat(r),
        panType: r.i32(),
        pan: randFloat(r),
        distance: r.f32(),
        delay: randInt(r),
    };
}

// ── Node tree ────────────────────────────────────────────────────────────
// EffectNodeImplemented::LoadParameter. parseNode throws on anything not
// yet supported so validation against the stock corpus tells us exactly
// what remains.

function parseNode(r, version) {
    const nodeType = r.i32();
    const node = { type: nodeType, typeName: NODE_TYPE_NAME[nodeType] || `Unknown(${nodeType})` };

    if (nodeType !== NODE_TYPE.ROOT) {
        node.isRendered = r.i32();          // v>=10
        node.renderingPriority = r.i32();   // v>=13
        node.commonValues = parseCommonValues(r);
        // SteeringBehavior: v>=1600 AND translation bind type is a FollowParent
        // variant (NotBind_FollowParent=4 / WhenCreating_FollowParent=5)
        if (version >= 1600 &&
            (node.commonValues.translationBindType === 4 || node.commonValues.translationBindType === 5)) {
            node.steeringBehavior = { maxFollowSpeed: randFloat(r), steeringSpeed: randFloat(r) };
        }
        // TriggerParameter: read when 1700 <= v < 1802 (loader gate is <1802,
        // and Trigger.Load itself reads nothing below 1700)
        if (version >= 1700 && version < 1802) {
            const flags = r.u8();
            node.trigger = { flags };
            const triggerValues = () => ({ type: r.u8(), index: r.u8() });
            if (flags & 1) node.trigger.toStartGeneration = triggerValues();
            if (flags & 2) node.trigger.toStopGeneration = triggerValues();
            if (flags & 4) node.trigger.toRemove = triggerValues();
        }
        // LODs: v>=1702
        if (version >= 1702) {
            node.lods = { matchingLODs: r.i32(), lodBehaviour: r.i32() };
        }
        node.translation = parseTranslation(r, version);
        node.localForceField = parseLocalForceField(r, version);
        node.rotation = parseRotation(r, version);
        node.scaling = parseScaling(r, version);
        node.generationLocation = parseGenerationLocation(r, version);
        node.depthValues = parseDepthValues(r);
        // KillRules: v>=1704 (Version17Alpha5); Collisions (v>=1801): no-op
        if (version >= 1704) node.killRules = parseKillRules(r);
        node.rendererCommon = parseRendererCommon(r, version);
        // AlphaCutoff: v>=1600; enable flag itself arrived at v>=1605
        if (version >= 1600) {
            let enabled = true;
            if (version >= 1605) {
                node.alphaCutoffFlag = r.i32();
                enabled = node.alphaCutoffFlag === 1;
            }
            if (enabled) node.alphaCutoff = parseAlphaCutoff(r, version);
        }
        // Falloff: v>=1602
        if (version >= 1602) {
            node.falloffFlag = r.i32();
            if (node.falloffFlag === 1) {
                node.falloff = { colorBlendType: r.i32(), beginColor: color4(r), endColor: color4(r), pow: r.f32() };
            }
        }
        // Soft particle distances: far v>=1603, near/nearOffset v>=1604
        if (version >= 1603) node.softParticleDistanceFar = r.f32();
        if (version >= 1604) {
            node.softParticleDistanceNear = r.f32();
            node.softParticleDistanceNearOffset = r.f32();
        }
        node.rendererParams = parseRendererParameter(r, version, nodeType);
        node.sound = parseSound(r);
        // GpuParticles: v>=1800 only
    }

    const childCount = r.i32();
    node.children = [];
    for (let i = 0; i < childCount; i++) {
        node.children.push(parseNode(r, version));
    }
    return node;
}

// ── Easing / F-curve primitives ──────────────────────────────────────────
// For v15/v1500 every easing block uses the OLD layout (the new
// channel/type/individual fields arrived at 1600/1608, above both).

const randVec3 = (r) => ({ max: vec3(r), min: vec3(r) });   // max BEFORE min

// ParameterEasingSIMDVec3 old format — 76-byte window.
function parseEasingVec3(r) {
    return {
        refEqS: refMinMax(r),
        refEqE: refMinMax(r),
        start: randVec3(r),
        end: randVec3(r),
        params: [r.f32(), r.f32(), r.f32()],
    };
}

// ParameterEasingFloat old format — 28-byte window (== easing_float).
function parseEasingFloat(r) {
    return {
        start: randFloat(r),
        end: randFloat(r),
        params: [r.f32(), r.f32(), r.f32()],
    };
}

// FCurve::Load — 32 bytes + 4×keyCount.
function parseFCurve(r) {
    const c = {
        start: r.i32(),
        end: r.i32(),
        offsetMax: r.f32(),
        offsetMin: r.f32(),
        offset: r.i32(),
        len: r.i32(),
        freq: r.i32(),
    };
    const count = r.i32();
    c.keys = [];
    for (let i = 0; i < count; i++) c.keys.push(r.f32());
    return c;
}

// FCurveVector3D::Load — int32 timeline (v>=15: read) + X/Y/Z curves.
function parseFCurveVec3(r) {
    return { timeline: r.i32(), x: parseFCurve(r), y: parseFCurve(r), z: parseFCurve(r) };
}

// FCurveScalar::Load — int32 Timeline prefix from v1600 on, none below.
function parseFCurveScalar(r, version) {
    if (version >= 1600) return { timeline: r.i32(), curve: parseFCurve(r) };
    return { curve: parseFCurve(r) };
}

// Helper for the size-prefixed blocks: C++ reads int32 size, parses the
// struct from the block start, then advances pos by size (NOT by what it
// parsed). Mirror that exactly so any size/struct disagreement can't
// desync the stream.
function sizedBlock(r, parse) {
    const size = r.i32();
    const start = r.off;
    const value = parse(size);
    r.off = start + size;
    return value;
}

// v>=1600 easing blocks gained optional middle/channel fields; they are
// size-prefixed and the C++ loader advances by size, so skipping the block
// wholesale is stream-exact. Fidelity is not needed for study parsing.
function sizedSkip(r) {
    const size = r.i32();
    r.skip(size);
    return { _skipped: size };
}

// ── Translation (TranslationParameter::Load) ─────────────────────────────
const TRANSLATION_TYPE = { FIXED: 0, PVA: 1, EASING: 2, FCURVE: 3, NURBS: 4, VIEW_OFFSET: 5 };

function parseTranslation(r, version) {
    const type = r.i32();
    switch (type) {
        case 0: return { type, ...sizedBlock(r, () => ({ refEq: r.i32(), position: vec3(r) })) };
        case 1: return { type, ...sizedBlock(r, () => ({
            refEqP: refMinMax(r), refEqV: refMinMax(r), refEqA: refMinMax(r),
            location: randVec3(r), velocity: randVec3(r), acceleration: randVec3(r),
        })) };
        case 2: return version >= 1600
            ? { type, ...sizedSkip(r) }
            : { type, ...sizedBlock(r, () => parseEasingVec3(r)) };
        case 3: {
            // size prefix is read then DISCARDED by the C++ loader; the
            // stream advances by curve content. Keep it for round-trip
            // fidelity and to learn the writer's size convention.
            const sizePrefix = r.i32();
            return { type, _sizePrefix: sizePrefix, fcurve: parseFCurveVec3(r) };
        }
        case 4: return { type, index: r.i32(), scale: r.f32(), moveSpeed: r.f32(), loopType: r.i32() };
        case 5: return { type, distance: randFloat(r) };
        default: throw new Error(`efk_format: unknown translation type ${type}`);
    }
}

// ── LocalForceField (LocalForceFieldParameter::Load) ─────────────────────
// NOT a no-op: v>=1500 reads an element list (Block A); the legacy
// LocationAbs block (Block B) exists only while version <= 1600.
const FORCE_FIELD_TYPE = { NONE: 0, TURBULENCE: 1, FORCE: 2, WIND: 3, VORTEX: 4, DRAG: 7, GRAVITY: 8, ATTRACTIVE: 9 };

// LocalForceFieldElementParameter::Load (ForceField/Effekseer.ForceFields.cpp).
// Read order: i32 type FIRST, then (v>=1600) power + position + rotation,
// then the per-type payload, then (v>=1600) the falloff block.
function parseForceFieldElement(r, version) {
    const type = r.i32();
    const e = { type };
    if (version >= 1600) {
        e.power = r.f32();
        e.position = vec3(r);
        e.rotation = vec3(r);
    }
    switch (type) {
        case 2:  // Force
            e.gravitation = r.i32();
            break;
        case 1:  // Turbulence
            if (version >= 1601) e.turbulenceType = r.i32();
            e.seed = r.i32();
            e.scale = r.f32();
            if (version < 1601) e.strength = r.f32();
            e.octave = r.i32();
            break;
        case 4:  // Vortex
            if (version >= 1601) e.vortexType = r.i32();
            break;
        case 8:  // Gravity
            e.gravity = [r.f32(), r.f32(), r.f32()];
            break;
        case 9:  // AttractiveForce
            e.control = r.f32();
            e.minRange = r.f32();
            e.maxRange = r.f32();
            break;
        case 3: case 7: default:  // Wind / Drag / None
            break;
    }
    if (version >= 1600) {
        e.falloffType = r.i32();
        if (e.falloffType !== 0) {
            e.falloff = { power: r.f32(), maxDistance: r.f32(), minDistance: r.f32() };
            if (e.falloffType === 2) {        // Tube
                e.falloff.radiusPower = r.f32();
                e.falloff.maxRadius = r.f32();
                e.falloff.minRadius = r.f32();
            } else if (e.falloffType === 3) { // Cone
                e.falloff.anglePower = r.f32();
                e.falloff.maxAngle = r.f32();
                e.falloff.minAngle = r.f32();
            }
        }
    }
    return e;
}

function parseLocalForceField(r, version) {
    const out = { elements: [] };
    if (version >= 1500) {                       // Block A — v>=1500
        const count = r.i32();
        for (let i = 0; i < count; i++) out.elements.push(parseForceFieldElement(r, version));
    }
    // Block B — legacy LocationAbs, ONLY while version <= 1600
    if (version <= 1600) {
        const type = r.i32();
        const size = r.i32();
        out.locationAbs = { type };
        if (type === 1) out.locationAbs.gravity = vec3(r);
        else if (type === 2) {
            out.locationAbs.force = r.f32();
            out.locationAbs.control = r.f32();
            out.locationAbs.minRange = r.f32();
            out.locationAbs.maxRange = r.f32();
        } else if (size > 0) r.skip(size);       // None should be size 0
    }
    return out;
}

// ── Rotation (RotationParameter::Load) ───────────────────────────────────
const ROTATION_TYPE = { FIXED: 0, PVA: 1, EASING: 2, AXIS_PVA: 3, AXIS_EASING: 4, FCURVE: 5, ROTATE_TO_VIEWPOINT: 6, VELOCITY: 7 };

function parseRotation(r, version) {
    const type = r.i32();
    switch (type) {
        case 0: return { type, ...sizedBlock(r, () => ({ refEq: r.i32(), rotation: vec3(r) })) };
        case 1: return { type, ...sizedBlock(r, () => ({
            refEqP: refMinMax(r), refEqV: refMinMax(r), refEqA: refMinMax(r),
            rotation: randVec3(r), velocity: randVec3(r), acceleration: randVec3(r),
        })) };
        case 2: return version >= 1600
            ? { type, ...sizedSkip(r) }
            : { type, ...sizedBlock(r, () => parseEasingVec3(r)) };
        case 3: return { type, ...sizedBlock(r, () => ({
            axis: randVec3(r), rotation: randFloat(r), velocity: randFloat(r), acceleration: randFloat(r),
        })) };
        case 4: {
            const sizePrefix = r.i32();   // read then DISCARDED by the loader
            // axis (24B) is always field-exact; the float easing after it is
            // LoadFloatEasing: fixed 28-byte easing_float below 1608, an
            // int32-size-prefixed block from 1608 on.
            const axis = randVec3(r);
            const easing = version >= 1608 ? sizedSkip(r) : parseEasingFloat(r);
            return { type, _sizePrefix: sizePrefix, axis, easing };
        }
        case 5: {
            const sizePrefix = r.i32();   // read then DISCARDED by the loader
            return { type, _sizePrefix: sizePrefix, fcurve: parseFCurveVec3(r) };
        }
        case 6: return { type, size: r.i32() };
        case 7: { const sizePrefix = r.i32(); return { type, _sizePrefix: sizePrefix, axis: r.i32() }; }
        default: throw new Error(`efk_format: unknown rotation type ${type}`);
    }
}

// ── Scaling (ScalingParameter::Load) ─────────────────────────────────────
const SCALING_TYPE = { FIXED: 0, PVA: 1, EASING: 2, SINGLE_PVA: 3, SINGLE_EASING: 4, FCURVE: 5, SINGLE_FCURVE: 6 };

function parseScaling(r, version) {
    const type = r.i32();
    switch (type) {
        case 0: return { type, ...sizedBlock(r, () => ({ refEq: r.i32(), scale: vec3(r) })) };
        case 1: return { type, ...sizedBlock(r, () => ({
            refEqP: refMinMax(r), refEqV: refMinMax(r), refEqA: refMinMax(r),
            position: randVec3(r), velocity: randVec3(r), acceleration: randVec3(r),
        })) };
        case 2: return version >= 1600
            ? { type, ...sizedSkip(r) }
            : { type, ...sizedBlock(r, () => parseEasingVec3(r)) };
        case 3: return { type, ...sizedBlock(r, () => ({
            position: randFloat(r), velocity: randFloat(r), acceleration: randFloat(r),
        })) };
        case 4: return version >= 1600
            ? { type, ...sizedSkip(r) }
            : { type, ...sizedBlock(r, () => parseEasingFloat(r)) };
        case 5: {
            const sizePrefix = r.i32();   // read then DISCARDED by the loader
            return { type, _sizePrefix: sizePrefix, fcurve: parseFCurveVec3(r) };
        }
        case 6: {
            const sizePrefix = r.i32();   // read then DISCARDED by the loader
            return { type, _sizePrefix: sizePrefix, fcurve: parseFCurveScalar(r, version) };
        }
        default: throw new Error(`efk_format: unknown scaling type ${type}`);
    }
}

// ── GenerationLocation (ParameterGenerationLocation::load) ───────────────
const GENERATION_TYPE = { POINT: 0, SPHERE: 1, MODEL: 2, CIRCLE: 3, LINE: 4 };

function parseGenerationLocation(r, version) {
    const effectsRotation = r.i32();
    const type = r.i32();
    const g = { effectsRotation, type };
    switch (type) {
        case 0: g.location = randVec3(r); break;
        case 1:
            g.radius = randFloat(r);
            g.rotationX = randFloat(r);
            g.rotationY = randFloat(r);
            break;
        case 2:
            if (version >= 1602) g.modelReference = r.i32();   // ModelReferenceType
            g.modelIndex = r.i32();
            g.modelType = r.i32();
            break;
        case 3:
            g.division = r.i32();
            g.radius = randFloat(r);
            g.angleStart = randFloat(r);
            g.angleEnd = randFloat(r);
            g.circleType = r.i32();
            g.axisDirection = r.i32();
            g.angleNoize = randFloat(r);
            break;
        case 4:
            g.division = r.i32();
            g.positionStart = randVec3(r);
            g.positionEnd = randVec3(r);
            g.positionNoize = randFloat(r);
            g.lineType = r.i32();
            break;
        default: throw new Error(`efk_format: unknown generation location type ${type}`);
    }
    return g;
}

// ── Color primitives ─────────────────────────────────────────────────────

const color4 = (r) => ({ r: r.u8(), g: r.u8(), b: r.u8(), a: r.u8() });
const vec2 = (r) => ({ x: r.f32(), y: r.f32() });
const randVec2 = (r) => ({ max: vec2(r), min: vec2(r) });
const rectf = (r) => ({ x: r.f32(), y: r.f32(), w: r.f32(), h: r.f32() });

// random_color on disk: u8 mode + u8 reserved + Color max + Color min = 10
// bytes (NOT the 12-byte in-memory struct).
function parseRandomColor(r) {
    return { mode: r.u8(), _reserved: r.u8(), max: color4(r), min: color4(r) };
}

// easing_color = random_color start + random_color end + 3 floats = 32 bytes.
function parseEasingColor(r) {
    return { start: parseRandomColor(r), end: parseRandomColor(r), params: [r.f32(), r.f32(), r.f32()] };
}

// FCurveVector2D — int32 timeline + X/Y curves.
function parseFCurveVec2(r) {
    return { timeline: r.i32(), x: parseFCurve(r), y: parseFCurve(r) };
}

// FCurveVectorColor — int32 timeline + R/G/B/A curves.
function parseFCurveColor(r) {
    return { timeline: r.i32(), r: parseFCurve(r), g: parseFCurve(r), b: parseFCurve(r), a: parseFCurve(r) };
}

// Gradient (LoadGradient, Parameter/Effekseer.Parameters.cpp) — no size
// prefix: i32 colorCount + 20B keys, i32 alphaCount + 8B keys.
function parseGradient(r) {
    const g = { colors: [], alphas: [] };
    const colorCount = r.i32();
    for (let i = 0; i < colorCount; i++) {
        g.colors.push({ position: r.f32(), color: [r.f32(), r.f32(), r.f32()], intensity: r.f32() });
    }
    const alphaCount = r.i32();
    for (let i = 0; i < alphaCount; i++) {
        g.alphas.push({ position: r.f32(), alpha: r.f32() });
    }
    return g;
}

// AllTypeColorParameter — used by every node type's color slots.
const COLOR_TYPE = { FIXED: 0, RANDOM: 1, EASING: 2, FCURVE: 3, GRADIENT: 4 };
function parseAllTypeColor(r, version) {
    const type = r.i32();
    switch (type) {
        case 0: return { type, fixed: color4(r) };
        case 1: return { type, random: parseRandomColor(r) };
        case 2: return { type, easing: parseEasingColor(r) };
        case 3: return { type, fcurve: parseFCurveColor(r) };
        case 4: return { type, gradient: parseGradient(r) };   // 1.6+
        default: throw new Error(`efk_format: unknown AllTypeColor type ${type}`);
    }
}

// ── RendererCommon (ParameterRendererCommon::load) ───────────────────────

const MATERIAL_TYPE = { DEFAULT: 0, BACK_DISTORTION: 6, LIGHTING: 7, FILE: 128 };
const UV_TYPE = { DEFAULT: 0, FIXED: 1, ANIMATION: 2, SCROLL: 3, FCURVE: 4 };

function parseUV(r, version, uvIndex = 0) {
    const type = r.i32();
    switch (type) {
        case 0: return { type };
        case 1: return { type, position: rectf(r) };
        case 2: {
            const uv = {
                type,
                position: rectf(r),
                frameLength: r.i32(),
                frameCountX: r.i32(),
                frameCountY: r.i32(),
                loopType: r.i32(),
                startFrame: randInt(r),
            };
            // v>=1600: UV slot 0's Animation gains a trailing InterpolationType
            if (version >= 1600 && uvIndex === 0) uv.interpolationType = r.i32();
            return uv;
        }
        case 3: return { type, position: randVec2(r), size: randVec2(r), speed: randVec2(r) };
        case 4: return { type, position: parseFCurveVec2(r), size: parseFCurveVec2(r) };
        default: throw new Error(`efk_format: unknown UV type ${type}`);
    }
}

const CUSTOM_DATA_TYPE = { NONE: 0, FIXED_2D: 20, RANDOM_2D: 21, EASING_2D: 22, FCURVE_2D: 23, FIXED_4D: 40, FCURVE_COLOR: 53, DYNAMIC_INPUT: 60 };

function parseCustomData(r, version) {
    const type = r.i32();
    switch (type) {
        case 0: case 60: return { type };
        case 20: return { type, values: vec2(r) };
        case 21: return { type, values: randVec2(r) };
        case 22: return { type, start: randVec2(r), end: randVec2(r), params: [r.f32(), r.f32(), r.f32()] };
        case 23: return { type, fcurve: parseFCurveVec2(r) };
        case 40: return { type, values: [r.f32(), r.f32(), r.f32(), r.f32()] };
        case 53: return { type, fcurve: parseFCurveColor(r) };
        default: throw new Error(`efk_format: unknown CustomData type ${type}`);
    }
}

// FadeIn/FadeOut payload: float frame + 3 easing floats = 16 bytes.
const parseFade = (r) => ({ frame: r.f32(), params: [r.f32(), r.f32(), r.f32()] });

function parseRendererCommon(r, version) {
    const c = {};
    c.materialType = r.i32();
    // v>=1600: Default/Lighting materials carry EmissiveScaling
    if ((c.materialType === MATERIAL_TYPE.DEFAULT || c.materialType === MATERIAL_TYPE.LIGHTING) && version >= 1600) {
        c.emissiveScaling = r.f32();
    }
    if (c.materialType === MATERIAL_TYPE.FILE) {
        c.material = { index: r.i32(), textures: [], uniforms: [] };
        const nTex = r.i32();
        for (let i = 0; i < nTex; i++) c.material.textures.push({ type: r.i32(), index: r.i32() });
        const nUni = r.i32();
        for (let i = 0; i < nUni; i++) c.material.uniforms.push([r.f32(), r.f32(), r.f32(), r.f32()]);
        // v>=1703 (Version17Alpha4): material gradients
        if (version >= 1703) {
            c.material.gradients = [];
            const nGrad = r.i32();
            for (let i = 0; i < nGrad; i++) c.material.gradients.push(parseGradient(r));
        }
    } else {
        c.colorTextureIndex = r.i32();
        c.normalTextureIndex = r.i32();
        // v>=1600: five extra texture slots
        if (version >= 1600) {
            c.alphaTextureIndex = r.i32();
            c.uvDistortionTextureIndex = r.i32();
            c.blendTextureIndex = r.i32();
            c.blendAlphaTextureIndex = r.i32();
            c.blendUVDistortionTextureIndex = r.i32();
        }
    }
    c.alphaBlend = r.i32();
    c.textureFilter = r.i32();
    c.textureWrap = r.i32();
    c.textureFilter2 = r.i32();
    c.textureWrap2 = r.i32();
    // v>=1600: filter/wrap pairs for texture slots 2..6
    if (version >= 1600) {
        c.extraFilterWraps = [];
        for (let i = 0; i < 5; i++) c.extraFilterWraps.push({ filter: r.i32(), wrap: r.i32() });
    }
    c.zTest = r.i32();
    c.zWrite = r.i32();
    c.fadeInType = r.i32();
    if (c.fadeInType !== 0) c.fadeIn = parseFade(r);
    c.fadeOutType = r.i32();
    if (c.fadeOutType !== 0) c.fadeOut = parseFade(r);
    c.uv = parseUV(r, version, 0);
    // v>=1600: UV slots 1..5 + distortion/blend controls interleaved
    if (version >= 1600) {
        c.uvAlpha = parseUV(r, version, 1);
        c.uvUVDistortion = parseUV(r, version, 2);
        c.uvDistortionIntensity = r.f32();
        c.uvBlend = parseUV(r, version, 3);
        c.textureBlendType = r.i32();
        c.uvBlendAlpha = parseUV(r, version, 4);
        c.uvBlendUVDistortion = parseUV(r, version, 5);
        c.blendUVDistortionIntensity = r.f32();
    }
    c.colorBindType = r.i32();
    c.distortionIntensity = r.f32();
    c.customData1 = parseCustomData(r, version);
    c.customData2 = parseCustomData(r, version);
    return c;
}

// ── Per-node-type renderer parameters (LoadRendererParameter) ────────────
// Each starts with a repeated int32 node-type tag that must match the
// envelope's node type.

// Ribbon/Track TextureUVType sub-block.
function parseTextureUVType(r) {
    const type = r.i32();
    if (type === 1) return { type, tileEdgeHead: r.i32(), tileEdgeTail: r.i32(), tileLoopAreaBegin: r.f32(), tileLoopAreaEnd: r.f32() };
    if (type === 2) return { type, tileLength: r.f32() };
    return { type };
}

// Ring float parameter: fixed / random / easing. The easing arm is
// LoadFloatEasing: a fixed 28-byte easing_float below 1608, an
// int32-size-prefixed block from 1608 on. NOTE: the legacy viewingAngle
// compat field is loaded with a HARDCODED version 15 in the C++
// (EffectNodeRing.cpp LoadSingleParameter(pos, viewingAngle, Version15)),
// so callers pass 15 for it regardless of the file version.
function parseRingSingle(r, version) {
    const type = r.i32();
    if (type === 0) return { type, fixed: r.f32() };
    if (type === 1) return { type, random: randFloat(r) };
    if (type === 2) {
        if (version >= 1608) return { type, easing: sizedSkip(r) };
        return { type, easing: parseEasingFloat(r) };
    }
    throw new Error(`efk_format: unknown ring single type ${type}`);
}

// Ring 2D location: fixed / PVA / 44-byte easing_vector2d.
function parseRingLocation(r) {
    const type = r.i32();
    if (type === 0) return { type, location: vec2(r) };
    if (type === 1) return { type, location: randVec2(r), velocity: randVec2(r), acceleration: randVec2(r) };
    if (type === 2) return { type, start: randVec2(r), end: randVec2(r), params: [r.f32(), r.f32(), r.f32()] };
    throw new Error(`efk_format: unknown ring location type ${type}`);
}

// Track size: only Fixed exists at these versions.
function parseTrackSize(r) {
    const type = r.i32();
    if (type !== 0) throw new Error(`efk_format: unknown track size type ${type}`);
    return { type, size: r.f32() };
}

function parseRendererParameter(r, version, nodeType) {
    const tag = r.i32();
    if (tag !== nodeType) {
        throw new Error(`efk_format: renderer tag ${tag} != node type ${nodeType}`);
    }
    switch (nodeType) {
        case NODE_TYPE.NONE:
            return {};
        case NODE_TYPE.SPRITE: {
            const p = { renderingOrder: r.i32(), billboard: r.i32() };
            p.allColor = parseAllTypeColor(r, version);
            p.colorType = r.i32();
            if (p.colorType === 1) p.colors = { ll: color4(r), lr: color4(r), ul: color4(r), ur: color4(r) };
            p.positionType = r.i32();
            p.positions = { ll: vec2(r), lr: vec2(r), ul: vec2(r), ur: vec2(r) };   // read for both Default(0) and Fixed(1)
            return p;
        }
        case NODE_TYPE.RIBBON: {
            const p = { textureUVType: parseTextureUVType(r) };
            if (version >= 1700) p.timeType = r.i32();
            p.viewpointDependent = r.i32();
            p.allColor = parseAllTypeColor(r, version);
            p.colorType = r.i32();
            if (p.colorType === 1) p.colors = { l: color4(r), r: color4(r) };
            p.positionType = r.i32();
            p.positions = { l: r.f32(), r: r.f32() };                               // read for both Default and Fixed
            p.splineDivision = r.i32();
            return p;
        }
        case NODE_TYPE.RING: {
            const p = { renderingOrder: r.i32(), billboard: r.i32() };
            p.shapeType = r.i32();
            if (p.shapeType === 1) {          // Crescent
                p.startingFade = r.f32();
                p.endingFade = r.f32();
                p.startingAngle = parseRingSingle(r, version);
                p.endingAngle = parseRingSingle(r, version);
            }
            p.vertexCount = r.i32();
            p.viewingAngle = parseRingSingle(r, 15);   // legacy compat field, HARDCODED version 15 in C++
            p.outerLocation = parseRingLocation(r);
            p.innerLocation = parseRingLocation(r);
            p.centerRatio = parseRingSingle(r, version);
            p.outerColor = parseAllTypeColor(r, version);
            p.centerColor = parseAllTypeColor(r, version);
            p.innerColor = parseAllTypeColor(r, version);
            return p;
        }
        case NODE_TYPE.TRACK: {
            const p = { textureUVType: parseTextureUVType(r) };
            p.sizeFor = parseTrackSize(r);
            p.sizeMiddle = parseTrackSize(r);
            p.sizeBack = parseTrackSize(r);
            p.splineDivision = r.i32();
            if (version >= 1700) {
                p.smoothingType = r.i32();
                p.timeType = r.i32();
            }
            p.colorLeft = parseAllTypeColor(r, version);
            p.colorLeftMiddle = parseAllTypeColor(r, version);
            p.colorCenter = parseAllTypeColor(r, version);
            p.colorCenterMiddle = parseAllTypeColor(r, version);
            p.colorRight = parseAllTypeColor(r, version);
            p.colorRightMiddle = parseAllTypeColor(r, version);
            return p;
        }
        case NODE_TYPE.MODEL: {
            const p = {};
            // v>=1602 (Version16Alpha3): leading ModelReferenceType mode.
            // File(0) reads f32 magnification + i32 modelIndex; Procedural(1)
            // reads ONLY i32 modelIndex. (External reads nothing below 1802.)
            if (version >= 1602) {
                p.mode = r.i32();
                if (p.mode === 0) {
                    p.magnification = r.f32();
                    p.modelIndex = r.i32();
                } else if (p.mode === 1) {
                    p.modelIndex = r.i32();
                } else if (p.mode !== 2) {
                    throw new Error(`efk_format: unknown model reference mode ${p.mode}`);
                }
            } else {
                p.magnification = r.f32();
                p.modelIndex = r.i32();
            }
            p.billboard = r.i32();
            p.culling = r.i32();
            p.allColor = parseAllTypeColor(r, version);
            // NOTE: a trailing falloff flag existed ONLY for 1600/1601 model
            // nodes (moved to the node level at 1602); versions 1610/1710
            // never hit it, and 15/1500 predate it.
            return p;
        }
        default:
            throw new Error(`efk_format: unsupported node type ${nodeType}`);
    }
}

// ══ WRITER ═══════════════════════════════════════════════════════════════
// Mirror of the parser, emitting binary version 1500. Every write function
// below corresponds 1:1 to a parse function above and consumes the same
// object shape the parser produces — so parse(write(x)) === x by
// construction, and the corpus round-trip test proves it byte-for-byte.

class BinWriter {
    constructor() {
        this.buf = new Uint8Array(1024);
        this.view = new DataView(this.buf.buffer);
        this.off = 0;
    }
    ensure(n) {
        if (this.off + n <= this.buf.byteLength) return;
        let cap = this.buf.byteLength * 2;
        while (cap < this.off + n) cap *= 2;
        const next = new Uint8Array(cap);
        next.set(this.buf);
        this.buf = next;
        this.view = new DataView(next.buffer);
    }
    i32(v) { this.ensure(4); this.view.setInt32(this.off, v, true); this.off += 4; return this; }
    u32(v) { this.ensure(4); this.view.setUint32(this.off, v, true); this.off += 4; return this; }
    f32(v) { this.ensure(4); this.view.setFloat32(this.off, v, true); this.off += 4; return this; }
    u8(v)  { this.ensure(1); this.buf[this.off++] = v & 0xff; return this; }
    fourcc(s) {
        this.ensure(4);
        for (let i = 0; i < 4; i++) this.buf[this.off + i] = s.charCodeAt(i);
        this.off += 4;
        return this;
    }
    bytes(arr) { this.ensure(arr.byteLength); this.buf.set(arr, this.off); this.off += arr.byteLength; return this; }
    /** int32 char16-count (incl. NUL) + UTF-16LE payload + NUL */
    str16(s) {
        this.i32(s.length + 1);
        this.ensure((s.length + 1) * 2);
        for (let i = 0; i < s.length; i++) {
            this.view.setUint16(this.off + i * 2, s.charCodeAt(i), true);
        }
        this.view.setUint16(this.off + s.length * 2, 0, true);
        this.off += (s.length + 1) * 2;
        return this;
    }
    /** Reserve an int32 size slot, run body, backpatch with bytes written. */
    sized(body) {
        const slot = this.off;
        this.i32(0);
        const start = this.off;
        body();
        this.view.setInt32(slot, this.off - start, true);
        return this;
    }
    done() { return this.buf.slice(0, this.off); }
}

const wRandFloat = (w, v) => { w.f32(v.max); w.f32(v.min); };
const wRandInt   = (w, v) => { w.i32(v.max); w.i32(v.min); };
const wVec3      = (w, v) => { w.f32(v.x); w.f32(v.y); w.f32(v.z); };
const wRandVec3  = (w, v) => { wVec3(w, v.max); wVec3(w, v.min); };
const wRefMinMax = (w, v) => { w.i32(v.max); w.i32(v.min); };
const wVec2      = (w, v) => { w.f32(v.x); w.f32(v.y); };
const wRandVec2  = (w, v) => { wVec2(w, v.max); wVec2(w, v.min); };
const wRectf     = (w, v) => { w.f32(v.x); w.f32(v.y); w.f32(v.w); w.f32(v.h); };
const wColor4    = (w, v) => { w.u8(v.r); w.u8(v.g); w.u8(v.b); w.u8(v.a); };

function writeRandomColor(w, v) {
    w.u8(v.mode); w.u8(v._reserved || 0);
    wColor4(w, v.max); wColor4(w, v.min);
}
function writeEasingColor(w, v) {
    writeRandomColor(w, v.start);
    writeRandomColor(w, v.end);
    for (const p of v.params) w.f32(p);
}
function writeEasingVec3(w, v) {
    wRefMinMax(w, v.refEqS);
    wRefMinMax(w, v.refEqE);
    wRandVec3(w, v.start);
    wRandVec3(w, v.end);
    for (const p of v.params) w.f32(p);
}
function writeEasingFloat(w, v) {
    wRandFloat(w, v.start);
    wRandFloat(w, v.end);
    for (const p of v.params) w.f32(p);
}
function writeFCurve(w, c) {
    w.i32(c.start); w.i32(c.end);
    w.f32(c.offsetMax); w.f32(c.offsetMin);
    w.i32(c.offset); w.i32(c.len); w.i32(c.freq);
    w.i32(c.keys.length);
    for (const k of c.keys) w.f32(k);
}
function writeFCurveVec3(w, c) {
    w.i32(c.timeline);
    writeFCurve(w, c.x); writeFCurve(w, c.y); writeFCurve(w, c.z);
}
function writeFCurveVec2(w, c) {
    w.i32(c.timeline);
    writeFCurve(w, c.x); writeFCurve(w, c.y);
}
function writeFCurveColor(w, c) {
    w.i32(c.timeline);
    writeFCurve(w, c.r); writeFCurve(w, c.g); writeFCurve(w, c.b); writeFCurve(w, c.a);
}

function writeCommonValues(w, v) {
    w.sized(() => {
        w.i32(v.refEqMaxGeneration);
        wRefMinMax(w, v.refEqLife);
        wRefMinMax(w, v.refEqGenerationTime);
        wRefMinMax(w, v.refEqGenerationTimeOffset);
        w.i32(v.maxGeneration);
        w.i32(v.translationBindType);
        w.i32(v.rotationBindType);
        w.i32(v.scalingBindType);
        w.i32(v.removeWhenLifeIsExtinct);
        w.i32(v.removeWhenParentIsRemoved);
        w.i32(v.removeWhenChildrenIsExtinct);
        wRandInt(w, v.life);
        wRandFloat(w, v.generationTime);
        wRandFloat(w, v.generationTimeOffset);
    });
}

function writeTranslation(w, t) {
    w.i32(t.type);
    switch (t.type) {
        case 0: w.sized(() => { w.i32(t.refEq); wVec3(w, t.position); }); break;
        case 1: w.sized(() => {
            wRefMinMax(w, t.refEqP); wRefMinMax(w, t.refEqV); wRefMinMax(w, t.refEqA);
            wRandVec3(w, t.location); wRandVec3(w, t.velocity); wRandVec3(w, t.acceleration);
        }); break;
        case 2: w.sized(() => writeEasingVec3(w, t)); break;
        case 3: w.sized(() => writeFCurveVec3(w, t.fcurve)); break;   // prefix == content bytes (corpus-verified)
        case 4: w.i32(t.index); w.f32(t.scale); w.f32(t.moveSpeed); w.i32(t.loopType); break;
        case 5: wRandFloat(w, t.distance); break;
        default: throw new Error(`efk_format: cannot write translation type ${t.type}`);
    }
}

function writeLocalForceField(w, ff, version) {
    if (version >= 1500) {
        w.i32(ff.elements.length);
        for (const e of ff.elements) {
            w.i32(e.type);
            switch (e.type) {
                case 2: w.i32(e.gravitation); break;
                case 1: w.i32(e.seed); w.f32(e.scale); w.f32(e.strength); w.i32(e.octave); break;
                case 8: for (const g of e.gravity) w.f32(g); break;
                case 9: w.f32(e.control); w.f32(e.minRange); w.f32(e.maxRange); break;
                default: break;
            }
        }
    }
    const abs = ff.locationAbs;
    w.i32(abs.type);
    if (abs.type === 1) w.sized(() => wVec3(w, abs.gravity));
    else if (abs.type === 2) w.sized(() => { w.f32(abs.force); w.f32(abs.control); w.f32(abs.minRange); w.f32(abs.maxRange); });
    else w.i32(0);
}

function writeRotation(w, t) {
    w.i32(t.type);
    switch (t.type) {
        case 0: w.sized(() => { w.i32(t.refEq); wVec3(w, t.rotation); }); break;
        case 1: w.sized(() => {
            wRefMinMax(w, t.refEqP); wRefMinMax(w, t.refEqV); wRefMinMax(w, t.refEqA);
            wRandVec3(w, t.rotation); wRandVec3(w, t.velocity); wRandVec3(w, t.acceleration);
        }); break;
        case 2: w.sized(() => writeEasingVec3(w, t)); break;
        case 3: w.sized(() => {
            wRandVec3(w, t.axis); wRandFloat(w, t.rotation); wRandFloat(w, t.velocity); wRandFloat(w, t.acceleration);
        }); break;
        case 4: w.sized(() => { wRandVec3(w, t.axis); writeEasingFloat(w, t.easing); }); break;
        case 5: w.sized(() => writeFCurveVec3(w, t.fcurve)); break;
        case 6: w.i32(t.size); break;
        case 7: w.sized(() => w.i32(t.axis)); break;
        default: throw new Error(`efk_format: cannot write rotation type ${t.type}`);
    }
}

function writeScaling(w, t) {
    w.i32(t.type);
    switch (t.type) {
        case 0: w.sized(() => { w.i32(t.refEq); wVec3(w, t.scale); }); break;
        case 1: w.sized(() => {
            wRefMinMax(w, t.refEqP); wRefMinMax(w, t.refEqV); wRefMinMax(w, t.refEqA);
            wRandVec3(w, t.position); wRandVec3(w, t.velocity); wRandVec3(w, t.acceleration);
        }); break;
        case 2: w.sized(() => writeEasingVec3(w, t)); break;
        case 3: w.sized(() => { wRandFloat(w, t.position); wRandFloat(w, t.velocity); wRandFloat(w, t.acceleration); }); break;
        case 4: w.sized(() => writeEasingFloat(w, t)); break;
        case 5: w.sized(() => writeFCurveVec3(w, t.fcurve)); break;
        case 6: w.sized(() => writeFCurve(w, t.fcurve.curve)); break;
        default: throw new Error(`efk_format: cannot write scaling type ${t.type}`);
    }
}

function writeGenerationLocation(w, g) {
    w.i32(g.effectsRotation);
    w.i32(g.type);
    switch (g.type) {
        case 0: wRandVec3(w, g.location); break;
        case 1: wRandFloat(w, g.radius); wRandFloat(w, g.rotationX); wRandFloat(w, g.rotationY); break;
        case 2: w.i32(g.modelIndex); w.i32(g.modelType); break;
        case 3:
            w.i32(g.division);
            wRandFloat(w, g.radius); wRandFloat(w, g.angleStart); wRandFloat(w, g.angleEnd);
            w.i32(g.circleType); w.i32(g.axisDirection);
            wRandFloat(w, g.angleNoize);
            break;
        case 4:
            w.i32(g.division);
            wRandVec3(w, g.positionStart); wRandVec3(w, g.positionEnd);
            wRandFloat(w, g.positionNoize);
            w.i32(g.lineType);
            break;
        default: throw new Error(`efk_format: cannot write generation location type ${g.type}`);
    }
}

function writeDepthValues(w, d) {
    w.f32(d.depthOffset);
    w.i32(d.isDepthOffsetScaledWithCamera);
    w.i32(d.isDepthOffsetScaledWithParticleScale);
    w.f32(d.suppressionOfScalingByDepth);
    w.f32(d.depthClipping);
    w.i32(d.zSort);
    w.i32(d.drawingPriority);
    w.f32(d.softParticle);
}

function writeAllTypeColor(w, c) {
    w.i32(c.type);
    switch (c.type) {
        case 0: wColor4(w, c.fixed); break;
        case 1: writeRandomColor(w, c.random); break;
        case 2: writeEasingColor(w, c.easing); break;
        case 3: writeFCurveColor(w, c.fcurve); break;
        default: throw new Error(`efk_format: cannot write AllTypeColor type ${c.type}`);
    }
}

function writeUV(w, uv) {
    w.i32(uv.type);
    switch (uv.type) {
        case 0: break;
        case 1: wRectf(w, uv.position); break;
        case 2:
            wRectf(w, uv.position);
            w.i32(uv.frameLength); w.i32(uv.frameCountX); w.i32(uv.frameCountY); w.i32(uv.loopType);
            wRandInt(w, uv.startFrame);
            break;
        case 3: wRandVec2(w, uv.position); wRandVec2(w, uv.size); wRandVec2(w, uv.speed); break;
        case 4: writeFCurveVec2(w, uv.position); writeFCurveVec2(w, uv.size); break;
        default: throw new Error(`efk_format: cannot write UV type ${uv.type}`);
    }
}

function writeCustomData(w, cd) {
    w.i32(cd.type);
    switch (cd.type) {
        case 0: case 60: break;
        case 20: wVec2(w, cd.values); break;
        case 21: wRandVec2(w, cd.values); break;
        case 22: wRandVec2(w, cd.start); wRandVec2(w, cd.end); for (const p of cd.params) w.f32(p); break;
        case 23: writeFCurveVec2(w, cd.fcurve); break;
        case 40: for (const v of cd.values) w.f32(v); break;
        case 53: writeFCurveColor(w, cd.fcurve); break;
        default: throw new Error(`efk_format: cannot write CustomData type ${cd.type}`);
    }
}

function writeRendererCommon(w, c) {
    w.i32(c.materialType);
    if (c.materialType === MATERIAL_TYPE.FILE) {
        w.i32(c.material.index);
        w.i32(c.material.textures.length);
        for (const t of c.material.textures) { w.i32(t.type); w.i32(t.index); }
        w.i32(c.material.uniforms.length);
        for (const u of c.material.uniforms) for (const v of u) w.f32(v);
    } else {
        w.i32(c.colorTextureIndex);
        w.i32(c.normalTextureIndex);
    }
    w.i32(c.alphaBlend);
    w.i32(c.textureFilter);
    w.i32(c.textureWrap);
    w.i32(c.textureFilter2);
    w.i32(c.textureWrap2);
    w.i32(c.zTest);
    w.i32(c.zWrite);
    w.i32(c.fadeInType);
    if (c.fadeInType !== 0) { w.f32(c.fadeIn.frame); for (const p of c.fadeIn.params) w.f32(p); }
    w.i32(c.fadeOutType);
    if (c.fadeOutType !== 0) { w.f32(c.fadeOut.frame); for (const p of c.fadeOut.params) w.f32(p); }
    writeUV(w, c.uv);
    w.i32(c.colorBindType);
    w.f32(c.distortionIntensity);
    writeCustomData(w, c.customData1);
    writeCustomData(w, c.customData2);
}

function writeTextureUVType(w, t) {
    w.i32(t.type);
    if (t.type === 1) { w.i32(t.tileEdgeHead); w.i32(t.tileEdgeTail); w.f32(t.tileLoopAreaBegin); w.f32(t.tileLoopAreaEnd); }
    else if (t.type === 2) w.f32(t.tileLength);
}

function writeRingSingle(w, s) {
    w.i32(s.type);
    if (s.type === 0) w.f32(s.fixed);
    else if (s.type === 1) wRandFloat(w, s.random);
    else if (s.type === 2) writeEasingFloat(w, s.easing);
}

function writeRingLocation(w, l) {
    w.i32(l.type);
    if (l.type === 0) wVec2(w, l.location);
    else if (l.type === 1) { wRandVec2(w, l.location); wRandVec2(w, l.velocity); wRandVec2(w, l.acceleration); }
    else if (l.type === 2) { wRandVec2(w, l.start); wRandVec2(w, l.end); for (const p of l.params) w.f32(p); }
}

function writeRendererParameter(w, nodeType, p) {
    w.i32(nodeType);   // repeated tag
    switch (nodeType) {
        case NODE_TYPE.NONE:
            break;
        case NODE_TYPE.SPRITE:
            w.i32(p.renderingOrder);
            w.i32(p.billboard);
            writeAllTypeColor(w, p.allColor);
            w.i32(p.colorType);
            if (p.colorType === 1) { wColor4(w, p.colors.ll); wColor4(w, p.colors.lr); wColor4(w, p.colors.ul); wColor4(w, p.colors.ur); }
            w.i32(p.positionType);
            wVec2(w, p.positions.ll); wVec2(w, p.positions.lr); wVec2(w, p.positions.ul); wVec2(w, p.positions.ur);
            break;
        case NODE_TYPE.RIBBON:
            writeTextureUVType(w, p.textureUVType);
            w.i32(p.viewpointDependent);
            writeAllTypeColor(w, p.allColor);
            w.i32(p.colorType);
            if (p.colorType === 1) { wColor4(w, p.colors.l); wColor4(w, p.colors.r); }
            w.i32(p.positionType);
            w.f32(p.positions.l); w.f32(p.positions.r);
            w.i32(p.splineDivision);
            break;
        case NODE_TYPE.RING:
            w.i32(p.renderingOrder);
            w.i32(p.billboard);
            w.i32(p.shapeType);
            if (p.shapeType === 1) {
                w.f32(p.startingFade); w.f32(p.endingFade);
                writeRingSingle(w, p.startingAngle);
                writeRingSingle(w, p.endingAngle);
            }
            w.i32(p.vertexCount);
            writeRingSingle(w, p.viewingAngle);
            writeRingLocation(w, p.outerLocation);
            writeRingLocation(w, p.innerLocation);
            writeRingSingle(w, p.centerRatio);
            writeAllTypeColor(w, p.outerColor);
            writeAllTypeColor(w, p.centerColor);
            writeAllTypeColor(w, p.innerColor);
            break;
        case NODE_TYPE.TRACK:
            writeTextureUVType(w, p.textureUVType);
            w.i32(p.sizeFor.type); w.f32(p.sizeFor.size);
            w.i32(p.sizeMiddle.type); w.f32(p.sizeMiddle.size);
            w.i32(p.sizeBack.type); w.f32(p.sizeBack.size);
            w.i32(p.splineDivision);
            writeAllTypeColor(w, p.colorLeft);
            writeAllTypeColor(w, p.colorLeftMiddle);
            writeAllTypeColor(w, p.colorCenter);
            writeAllTypeColor(w, p.colorCenterMiddle);
            writeAllTypeColor(w, p.colorRight);
            writeAllTypeColor(w, p.colorRightMiddle);
            break;
        case NODE_TYPE.MODEL:
            w.f32(p.magnification);
            w.i32(p.modelIndex);
            w.i32(p.billboard);
            w.i32(p.culling);
            writeAllTypeColor(w, p.allColor);
            break;
        default:
            throw new Error(`efk_format: cannot write node type ${nodeType}`);
    }
}

function writeSound(w, s) {
    w.i32(s.type);
    if (s.type !== 1) return;
    w.i32(s.waveId);
    wRandFloat(w, s.volume);
    wRandFloat(w, s.pitch);
    w.i32(s.panType);
    wRandFloat(w, s.pan);
    w.f32(s.distance);
    wRandInt(w, s.delay);
}

function writeNode(w, node, version) {
    w.i32(node.type);
    if (node.type !== NODE_TYPE.ROOT) {
        w.i32(node.isRendered);
        w.i32(node.renderingPriority);
        writeCommonValues(w, node.commonValues);
        writeTranslation(w, node.translation);
        writeLocalForceField(w, node.localForceField, version);
        writeRotation(w, node.rotation);
        writeScaling(w, node.scaling);
        writeGenerationLocation(w, node.generationLocation);
        writeDepthValues(w, node.depthValues);
        writeRendererCommon(w, node.rendererCommon);
        writeRendererParameter(w, node.type, node.rendererParams);
        writeSound(w, node.sound);
    }
    w.i32(node.children.length);
    for (const c of node.children) writeNode(w, c, version);
}

function writeStrList(w, list) {
    w.i32(list.length);
    for (const s of list) w.str16(s);
}

function writeBinChunk(effect) {
    const h = effect.header;
    const w = new BinWriter();
    w.fourcc('SKFE');
    w.i32(h.version);
    writeStrList(w, h.colorImages);
    writeStrList(w, h.normalImages);
    writeStrList(w, h.distortionImages);
    writeStrList(w, h.sounds);
    writeStrList(w, h.models);
    writeStrList(w, h.materials);
    w.i32(h.dynamicInputs.length);
    for (const v of h.dynamicInputs) w.f32(v);
    w.i32(h.dynamicEquations.length);
    for (const blob of h.dynamicEquations) { w.i32(blob.byteLength); w.bytes(blob); }
    w.i32(h.renderingNodesCount);
    w.i32(h.renderingNodesThreshold);
    w.f32(h.magnification);
    w.i32(h.defaultRandomSeed);
    w.i32(h.culling.shape);
    if (h.culling.shape === 1) {
        w.f32(h.culling.radius);
        w.f32(h.culling.x); w.f32(h.culling.y); w.f32(h.culling.z);
    }
    writeNode(w, effect.root, h.version);
    return w.done();
}

function writeInfoChunk(info) {
    const w = new BinWriter();
    if (info.infoVersion >= 1500) w.i32(info.infoVersion);
    writeStrList(w, info.colorImages);
    writeStrList(w, info.normalImages);
    writeStrList(w, info.distortionImages);
    writeStrList(w, info.models);
    writeStrList(w, info.sounds);
    if (info.infoVersion >= 1500) writeStrList(w, info.materials);
    return w.done();
}

/**
 * Serialize an effect (the object shape parseEfkefc produces) into a
 * complete .efkefc file: EFKE container with INFO + BIN_ chunks. The EDIT
 * chunk (Effekseer editor project data) is intentionally not written — the
 * runtime never reads it; files simply won't reopen in the official editor.
 */
function writeEfkefc(effect) {
    const w = new BinWriter();
    w.fourcc('EFKE');
    w.i32(effect.containerVersion || 0);
    const infoData = writeInfoChunk(effect.info);
    w.fourcc('INFO');
    w.i32(infoData.byteLength);
    w.bytes(infoData);
    const binData = writeBinChunk(effect);
    w.fourcc('BIN_');
    w.i32(binData.byteLength);
    w.bytes(binData);
    return w.done();
}

// ── Top level ────────────────────────────────────────────────────────────

/**
 * Parse a complete .efkefc file.
 * @param {Uint8Array} bytes
 */
function parseEfkefc(bytes) {
    const container = parseContainer(bytes);
    const infoData = findChunk(container, 'INFO');
    const binData = findChunk(container, 'BIN_');
    if (!binData) throw new Error('efk_format: no BIN_ chunk');
    const r = new BinReader(binData);
    const header = parseBinHeader(r);
    const root = parseNode(r, header.version);
    if (r.remaining !== 0) {
        throw new Error(`efk_format: ${r.remaining} unparsed bytes after root node`);
    }
    return {
        containerVersion: container.version,
        info: infoData ? parseInfo(infoData) : null,
        header,
        root,
    };
}

return {
    SUPPORTED_BIN_VERSIONS,
    NODE_TYPE,
    NODE_TYPE_NAME,
    TRANSLATION_TYPE,
    ROTATION_TYPE,
    SCALING_TYPE,
    GENERATION_TYPE,
    FORCE_FIELD_TYPE,
    COLOR_TYPE,
    MATERIAL_TYPE,
    UV_TYPE,
    CUSTOM_DATA_TYPE,
    BinReader,
    BinWriter,
    parseContainer,
    parseInfo,
    parseBinHeader,
    parseEfkefc,
    writeEfkefc,
    writeBinChunk,
    writeInfoChunk,
};
});
