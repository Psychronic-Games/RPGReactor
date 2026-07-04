/**
 * RR_EfkLayers — the effect composition vocabulary.
 *
 * Factories for the building blocks professional Effekseer effects are
 * made of, with defaults calibrated from a statistical digest of all 316
 * Complex-template effects (7,870 nodes) and a node-by-node study of the
 * EVFX packs (VoltaicDischarge, AstroInvocation):
 *
 *   • effects are STAGED: top-level "acts" with offset start times
 *   • ~half the layers use NORMAL blend (body/shadow), half ADDITIVE (heat)
 *   • almost everything fades in/out and animates scale (eased from→to)
 *   • moving particles carry spark-dust children; tendrils are invisible
 *     movers dropping Track-ribbon trails
 *
 * KEYFRAME MODEL (v1): every layer takes { start, duration } — the layer
 * exists on the timeline [start, start+duration] — plus eased from→to
 * values (size, alpha via fades) inside that window. This maps 1:1 onto
 * Effekseer's generationTimeOffset / life / easing primitives, so exports
 * are native.
 *
 * All factories return ONE node (with children), Always-bound so the 3D
 * gizmo and MZ target steering work. Colors are {r,g,b} (alpha separate).
 */
(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('./format/efk_format.js'), require('./format/efk_builder.js'));
    } else {
        root.RR_EfkLayers = factory(root.RR_EfkFormat, root.RR_EfkBuilder);
    }
})(typeof self !== 'undefined' ? self : this, function (F, B) {
'use strict';

const { rf, rv3, v3, v2 } = B;
const NT = F.NODE_TYPE;
const BIND = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
const D2R = Math.PI / 180;

const timing = (o) => ({
    generationTimeOffset: rf(o.start || 0),
    life: rf(Math.round((o.duration || 30) * (o.lifeJitter ? 1 - o.lifeJitter : 1)), o.duration || 30),
});
const fades = (o) => ({
    ...(o.fadeIn ? { fadeInType: 1, fadeIn: { frame: o.fadeIn, params: [0, 0, 0] } } : {}),
    ...(o.fadeOut ? { fadeOutType: 1, fadeOut: { frame: o.fadeOut, params: [0, 0, 0] } } : {}),
});
const fixed = (c, a) => ({ type: 0, fixed: { ...c, a } });
const ease = (c1, a1, c2, a2) => ({
    type: 2,
    easing: {
        start: { mode: 0, _reserved: 0, max: { ...c1, a: a1 }, min: { ...c1, a: a1 } },
        end: { mode: 0, _reserved: 0, max: { ...c2, a: a2 }, min: { ...c2, a: a2 } },
        params: [0, 0, 1],
    },
});
const growEase = (from, to) => ({ type: 4, start: rf(from[0] ?? from, from[1] ?? from), end: rf(to[0] ?? to, to[1] ?? to), params: [0, 0, 1] });

const L = {
    BIND, timing, fades, fixed, ease, growEase,

    /** Staged act: children play on the [start, start+duration] window. */
    act(o, children) {
        return B.makeNode(NT.NONE, {
            commonValues: { ...BIND, maxGeneration: 1, ...timing(o) },
            ...(o.spin ? {
                rotation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3(o.tiltX || 0, 0, 0)),
                    velocity: rv3(v3(o.spin.x || 0, o.spin.y || 0, o.spin.z || 0)),
                    acceleration: rv3(0),
                },
            } : (o.tiltX ? { rotation: { type: 0, refEq: -1, rotation: v3(o.tiltX, 0, 0) } } : {})),
            ...(o.scale ? { scaling: { type: 0, refEq: -1, scale: v3(o.scale, o.scale, o.scale) } } : {}),
            children,
        });
    },

    /** Hot pop: eased expanding billboard, quick fade. */
    flash(o) {
        return B.makeNode(NT.SPRITE, {
            commonValues: { ...BIND, maxGeneration: o.count || 1, ...timing(o), ...(o.cadence ? { generationTime: rf(o.cadence) } : {}) },
            scaling: growEase(o.from ?? o.size * 0.4, o.to ?? o.size * 1.2),
            rendererCommon: { colorTextureIndex: o.tex, alphaBlend: o.blend ?? 2, ...fades({ fadeOut: Math.round((o.duration || 12) * 0.6), ...o }) },
            rendererParams: { allColor: fixed(o.color, o.alpha ?? 230) },
        });
    },

    /** Steady or pulsing glow. Pair one normal-blend + one additive. */
    glow(o) {
        return B.makeNode(NT.SPRITE, {
            commonValues: { ...BIND, maxGeneration: 1, ...timing(o) },
            scaling: o.pulseTo ? growEase(o.size, o.pulseTo) : { type: 0, refEq: -1, scale: v3(o.size, o.size, o.size) },
            rendererCommon: { colorTextureIndex: o.tex, alphaBlend: o.blend ?? 2, ...fades(o) },
            rendererParams: { allColor: fixed(o.color, o.alpha ?? 120) },
        });
    },

    /** Expanding shock ring (camera-facing by default). */
    shockRing(o) {
        return B.makeNode(NT.RING, {
            commonValues: { ...BIND, maxGeneration: o.count || 1, ...timing(o), ...(o.cadence ? { generationTime: rf(o.cadence) } : {}) },
            scaling: growEase(o.from ?? o.size * 0.15, o.to ?? o.size),
            ...(o.spinZ ? {
                rotation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(0), velocity: rv3(v3(0, 0, o.spinZ)), acceleration: rv3(0),
                },
            } : {}),
            rendererCommon: {
                colorTextureIndex: o.tex,
                alphaBlend: o.blend ?? 2,
                ...fades({ fadeIn: 3, fadeOut: Math.round((o.duration || 20) * 0.5), ...o }),
                ...(o.uvRepeats ? {
                    uv: {
                        type: 3,
                        position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                        size: { max: { x: o.uvRepeats, y: 1 }, min: { x: o.uvRepeats, y: 1 } },
                        speed: { max: { x: o.uvSpeed || 0.01, y: 0 }, min: { x: o.uvSpeed || 0.01, y: 0 } },
                    },
                } : {}),
            },
            rendererParams: {
                billboard: o.billboard ?? 0,
                vertexCount: 40,
                outerLocation: { type: 0, location: v2(1 + (o.width ?? 0.12), 0) },
                innerLocation: { type: 0, location: v2(1 - (o.width ?? 0.12), 0) },
                outerColor: fixed(o.color, 0),
                centerColor: fixed(o.color, o.alpha ?? 200),
                innerColor: fixed(o.color, 0),
            },
        });
    },

    /** Radial particle burst; each particle carries spark-dust children. */
    burst(o) {
        const spd = o.speed ?? 0.06;
        const kids = o.dust ? [L.dust({ tex: o.dust.tex ?? o.tex, color: o.dust.color ?? o.color, size: o.dust.size ?? 0.3 })] : [];
        return B.makeNode(NT.SPRITE, {
            commonValues: {
                ...BIND,
                maxGeneration: o.count ?? 16,
                ...timing(o),
                generationTime: rf(o.cadence ?? 0.3),
                lifeJitter: undefined,
            },
            generationLocation: o.radius
                ? { type: 1, radius: rf(o.radius * 0.5, o.radius), rotationX: rf(0, 360), rotationY: rf(0, 360) }
                : { type: 0, location: rv3(v3(-0.3, -0.2, -0.3), v3(0.3, 0.3, 0.3)) },
            translation: {
                type: 1,
                refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                location: rv3(0),
                velocity: rv3(v3(-spd, -spd * (o.up ? 0.1 : 1), -spd), v3(spd, spd * (o.up ? 2.2 : 1), spd)),
                acceleration: rv3(v3(0, -(o.gravity ?? 0), 0)),
            },
            scaling: growEase([o.size * 0.6, o.size], 0),
            rendererCommon: { colorTextureIndex: o.tex, alphaBlend: o.blend ?? 2, ...fades(o) },
            rendererParams: { allColor: o.color2 ? ease(o.color, o.alpha ?? 255, o.color2, 0) : fixed(o.color, o.alpha ?? 255) },
            children: kids,
        });
    },

    /** Tiny short-lived glints attached to a parent particle (pro habit). */
    dust(o) {
        return B.makeNode(NT.SPRITE, {
            commonValues: { maxGeneration: o.count ?? 6, life: rf(4, 8), generationTime: rf(2) },
            scaling: growEase([o.size * 0.5, o.size], 0),
            rendererCommon: { colorTextureIndex: o.tex, alphaBlend: 2 },
            rendererParams: { allColor: fixed(o.color, 255) },
        });
    },

    /** Curling energy tendrils: invisible movers dropping Track ribbons. */
    tendrils(o) {
        return B.makeNode(NT.NONE, {
            commonValues: {
                ...BIND,
                maxGeneration: o.count ?? 6,
                ...timing(o),
                generationTime: rf(o.cadence ?? Math.max(1, (o.duration || 60) / (o.count ?? 6))),
            },
            translation: {
                type: 1,
                refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                location: rv3(0),
                velocity: rv3(v3(-(o.speed ?? 0.05), -(o.speed ?? 0.05) * 0.5, -(o.speed ?? 0.05)),
                              v3(o.speed ?? 0.05, o.speed ?? 0.05, o.speed ?? 0.05)),
                acceleration: rv3(0),
            },
            ...(o.curl ? {
                localForceField: {
                    elements: [{ type: 1, seed: o.seed ?? 3, scale: 1.5, strength: o.curl, octave: 1 }],
                    locationAbs: { type: 0 },
                },
            } : {}),
            children: [B.makeNode(NT.TRACK, {
                commonValues: { maxGeneration: 24, life: rf(Math.round((o.tail ?? 25))), generationTime: rf(2) },
                rendererCommon: { colorTextureIndex: o.tex, alphaBlend: o.blend ?? 2 },
                rendererParams: {
                    sizeFor: { type: 0, size: 0 },
                    sizeMiddle: { type: 0, size: o.width ?? 0.14 },
                    sizeBack: { type: 0, size: 0.02 },
                    colorLeft: { type: 0, fixed: { ...o.color, a: 0 } },
                    colorLeftMiddle: { type: 0, fixed: { ...o.color, a: 0 } },
                    colorCenter: { type: 0, fixed: { ...o.color, a: o.alpha ?? 255 } },
                    colorCenterMiddle: { type: 0, fixed: { ...o.color, a: Math.round((o.alpha ?? 255) * 0.7) } },
                    colorRight: { type: 0, fixed: { ...o.color, a: 0 } },
                    colorRightMiddle: { type: 0, fixed: { ...o.color, a: 0 } },
                },
            })],
        });
    },

    /** Murky puffs (normal blend) — smoke, dust, miasma body. */
    puffs(o) {
        return B.makeNode(NT.SPRITE, {
            commonValues: {
                ...BIND,
                maxGeneration: o.count ?? 8,
                ...timing(o),
                generationTime: rf(o.cadence ?? 2),
            },
            generationLocation: { type: 0, location: rv3(v3(-(o.area ?? 0.5), 0, -(o.area ?? 0.5)), v3(o.area ?? 0.5, (o.area ?? 0.5) * 0.4, o.area ?? 0.5)) },
            translation: {
                type: 1,
                refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                location: rv3(0),
                velocity: rv3(v3(-0.008, o.rise ?? 0.015, -0.008), v3(0.008, (o.rise ?? 0.015) * 2, 0.008)),
                acceleration: rv3(0),
            },
            rotation: {
                type: 1,
                refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                rotation: rv3(v3(0, 0, -3.14), v3(0, 0, 3.14)),
                velocity: rv3(v3(0, 0, -0.02), v3(0, 0, 0.02)),
                acceleration: rv3(0),
            },
            scaling: growEase([o.size * 0.5, o.size * 0.8], [o.size * 1.2, o.size * 1.6]),
            rendererCommon: {
                colorTextureIndex: o.tex,
                alphaBlend: 1,
                ...fades({ fadeIn: 10, fadeOut: Math.round((o.duration || 50) * 0.5), ...o }),
            },
            rendererParams: { allColor: fixed(o.color, o.alpha ?? 120) },
        });
    },

    /** Streaming motes (rising embers, falling snow, drifting spores). */
    motes(o) {
        return B.makeNode(NT.SPRITE, {
            commonValues: {
                ...BIND,
                maxGeneration: o.stream ? 99999 : (o.count ?? 12),
                ...timing(o),
                generationTime: rf(o.cadence ?? 3),
            },
            generationLocation: {
                type: 3, division: 16, radius: rf((o.radius ?? 0.6) * 0.3, o.radius ?? 0.6),
                angleStart: rf(0), angleEnd: rf(360), circleType: 0, axisDirection: 1, angleNoize: rf(0),
            },
            translation: {
                type: 1,
                refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                location: rv3(0),
                velocity: rv3(v3(-0.003, o.vy ?? 0.01, -0.003), v3(0.003, (o.vy ?? 0.01) * 2.2, 0.003)),
                acceleration: rv3(0),
            },
            scaling: growEase([o.size * 0.5, o.size], 0),
            rendererCommon: { colorTextureIndex: o.tex, alphaBlend: o.blend ?? 2, ...fades({ fadeIn: 8, ...o }) },
            rendererParams: { allColor: fixed(o.color, o.alpha ?? 235) },
        });
    },
};

return L;
});
