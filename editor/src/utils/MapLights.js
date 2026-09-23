/**
 * The lights a map carries, and the ambient darkness they are read against.
 *
 * Placed visually with the Lighting tool, stored in `Map###.r3d.json` as
 * `reactor3d.lights` (an array of authored lights) beside `reactor3d.lighting`
 * (`{ ambient, ambientColour, enabled }`), and read by the runtime's
 * `Reactor3D.readMapLights` / `ambientFor`. This module is the editor's side
 * of that contract: normalization and clamps mirror the runtime's exactly, so
 * what the editor writes is what the game reads.
 *
 * Creating the sidecar here never stamps a `mode` — a 2D map that gains a
 * lamp stays a 2D map; the 3D checkbox is the only thing that flips mode.
 */
(function(root) {
    'use strict';

    const VERSION = 1;
    const TYPES = ['point', 'spot', 'beam'];
    const DEFAULT_CONE_ANGLE = 70;
    const DEFAULT_CONE_LENGTH = 6;
    // A beam is a laser: a constant-width cylinder of light `radius` tiles
    // long and `width` tiles across, aimed like a spot.
    const DEFAULT_BEAM_LENGTH = 8;
    const DEFAULT_BEAM_WIDTH = 0.08;
    const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

    /**
     * The light presets: the Lighting panel's tray and the model effect
     * form's preset list read the same table, so a candle is the same
     * candle everywhere. `labelKey` is the locale key of the chip's name;
     * `height` is a map placement default (a model light rides its anchor
     * instead); a `compound` places several lights at once and is a map
     * preset only.
     */
    const PRESETS = [
        // No plain Point chip: a Lamp is the everyday point light, and Point stays a type in the drop-down.
        { key: 'spot', labelKey: 'lit.spot',
          template: { key: 'spot', type: 'spot', color: '#fff2cc', radius: 6, intensity: 1, height: 3, pitch: -60 } },
        { key: 'candle', labelKey: 'lit.preset.candle',
          template: { key: 'candle', type: 'point', color: '#ffb45e', radius: 2.5, intensity: 1.1, height: 0.6, flicker: 0.6 } },
        { key: 'lamp', labelKey: 'lit.preset.lamp',
          template: { key: 'lamp', type: 'point', color: '#ffd9a0', radius: 4, intensity: 1.2, height: 2 } },
        { key: 'neon', labelKey: 'lit.preset.neon',
          template: { key: 'neon', type: 'point', color: '#ff2d95', radius: 5, intensity: 1.4, height: 2.5, tag: 'neon' } },
        { key: 'alarm', labelKey: 'lit.preset.alarm',
          template: { key: 'alarm', type: 'point', color: '#ff1720', radius: 6, intensity: 1.4, height: 3,
              pulse: { min: 0.3, max: 1, period: 150 }, tag: 'alarm' } },
        { key: 'screen', labelKey: 'lit.preset.screen',
          template: { key: 'screen', type: 'point', color: '#7f9bff', radius: 3, intensity: 1, height: 1, flicker: 0.4 } },
        { key: 'torch', labelKey: 'lit.preset.torch',
          template: { key: 'torch', type: 'spot', color: '#eaf6ff', radius: 7, angle: 30, intensity: 0.9, height: 1.2, pitch: -20, flicker: 0.08 } },
        { key: 'laser', labelKey: 'lit.preset.laser',
          template: { key: 'laser', type: 'beam', color: '#ff2a2a', radius: 8, width: 0.04, intensity: 1.6, height: 1, pitch: 0 } },
        { key: 'streetlamp', labelKey: 'lit.preset.streetlamp',
          template: { key: 'streetlamp', color: '#ffd9a0', type: 'point', compound: [
              { type: 'point', color: '#ffd9a0', radius: 5.5, intensity: 1.2, height: 3 },
              { type: 'point', color: '#fff3d6', radius: 1.2, intensity: 1.6, height: 3.2, flicker: 0.06 }
          ] } },
        { key: 'compound', labelKey: 'lit.preset.compound',
          template: { key: 'compound', type: 'point', color: '#a583ff', compound: [
              { type: 'point', color: '#a583ff', radius: 3, intensity: 0.5, height: 2.5 },
              { type: 'spot', color: '#eaf6ff', radius: 6, intensity: 1, height: 2.5, pitch: -60 }
          ] } },
        { key: 'fluorescent', labelKey: 'lit.preset.fluorescent',
          template: { key: 'fluorescent', type: 'point', color: '#d9f3ff', radius: 7, intensity: 1.15, height: 3, flicker: 0.06 } },
        // High and far-reaching: lights the whole map from above and
        // casts one set of long shadows. A warm ball hangs where it is.
        { key: 'sun', labelKey: 'lit.preset.sun',
          template: { key: 'sun', type: 'point', color: '#fff3d2', radius: 150, intensity: 2, height: 40, shadow: true } }
    ];
    /**
     * What a preset changes about a light that already exists: its kind and
     * look, never where it stands or what it is called. Absent motion is
     * cleared, so a candle turned into a lamp stops flickering. Compound
     * presets are several lights and have no single look; null.
     */
    const LOOK_KEYS = ['type', 'color', 'radius', 'intensity', 'angle', 'width', 'pitch', 'flicker', 'pulse', 'shadow'];
    const presetLook = key => {
        const template = presetTemplate(key);
        if (!template || template.compound) return null;
        const look = { flicker: 0, pulse: null };
        for (const field of LOOK_KEYS) if (template[field] !== undefined) look[field] = template[field];
        return look;
    };
    /** A preset's template as a fresh copy, so a caller can write into it. */
    const presetTemplate = key => {
        const preset = PRESETS.find(entry => entry.key === key);
        return preset ? JSON.parse(JSON.stringify(preset.template)) : null;
    };

    const number = (value, fallback, min, max) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    };

    /** `#rrggbb` (or a number) normalized to a `#rrggbb` string. */
    const colour = value => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return '#' + (value & 0xffffff).toString(16).padStart(6, '0');
        }
        const hex = String(value || '').replace('#', '').trim();
        return /^[0-9a-f]{6}$/i.test(hex) ? '#' + hex.toLowerCase() : '#ffffff';
    };

    const ensure = mapData => {
        if (!mapData) return null;
        let sidecar = mapData.reactor3d;
        if (!sidecar || typeof sidecar !== 'object') {
            sidecar = { version: VERSION };
            mapData.reactor3d = sidecar;
        }
        return sidecar;
    };

    /** One light, every field bounded the way the runtime bounds it. */
    const normalize = (entry, fallbackId) => {
        const raw = entry && typeof entry === 'object' ? entry : {};
        const type = TYPES.indexOf(raw.type) >= 0 ? raw.type : 'point';
        const light = {
            id: raw.id ? String(raw.id) : fallbackId,
            type,
            x: number(raw.x, 0, -10000, 10000),
            y: number(raw.y, 0, -10000, 10000),
            height: number(raw.height, 0, 0, 512),
            yaw: number(raw.yaw, 0, -100000, 100000),
            pitch: number(raw.pitch, 0, -90, 90),
            radius: number(raw.radius, type === 'spot' ? DEFAULT_CONE_LENGTH : type === 'beam' ? DEFAULT_BEAM_LENGTH : 3, 0.1, 200),
            angle: number(raw.angle, DEFAULT_CONE_ANGLE, 1, 179),
            width: number(raw.width, DEFAULT_BEAM_WIDTH, 0.005, 5),
            color: colour(raw.color !== undefined ? raw.color : raw.colour),
            intensity: number(raw.intensity, 1, 0, 4),
            occlude: raw.occlude !== false,
            shadow: raw.shadow !== false,
            on: raw.on !== false,
            tag: raw.tag ? String(raw.tag) : '',
            attach: raw.attach && typeof raw.attach === 'object'
                ? (raw.attach.player ? { player: true }
                    : Number(raw.attach.event) > 0
                        ? { event: Math.floor(Number(raw.attach.event)) } : null)
                : null,
            flicker: number(raw.flicker, 0, 0, 1),
            pulse: raw.pulse && typeof raw.pulse === 'object' ? {
                min: number(raw.pulse.min, 0.6, 0, 10),
                max: number(raw.pulse.max, 1, 0, 10),
                period: number(raw.pulse.period, 90, 2, 100000)
            } : null
        };
        if (raw.compoundId && ID_PATTERN.test(String(raw.compoundId))) {
            light.compoundId = String(raw.compoundId);
            light.compoundName = String(raw.compoundName || '').slice(0, 80);
        }
        if (!light.attach) light.attach = null;
        return light;
    };

    const list = mapData => {
        const sidecar = mapData && mapData.reactor3d;
        return sidecar && Array.isArray(sidecar.lights) ? sidecar.lights : [];
    };

    const get = (mapData, id) => list(mapData).find(light => light && light.id === id) || null;

    const freshId = mapData => {
        const taken = new Set(list(mapData).map(light => light && light.id));
        let n = 1;
        while (taken.has('light' + n)) n++;
        return 'light' + n;
    };

    const add = (mapData, entry) => {
        const sidecar = ensure(mapData);
        if (!sidecar) return null;
        if (!Array.isArray(sidecar.lights)) sidecar.lights = [];
        const light = normalize(entry, freshId(mapData));
        // An id collision keeps the new light, not the confusion.
        if (get(mapData, light.id)) light.id = freshId(mapData);
        sidecar.lights.push(light);
        return light;
    };

    const update = (mapData, id, patch) => {
        const lights = list(mapData);
        const at = lights.findIndex(light => light && light.id === id);
        if (at < 0) return null;
        const light = normalize(Object.assign({}, lights[at], patch, { id }), id);
        lights[at] = light;
        return light;
    };

    /**
     * Give a light a new id — the name event commands address it by. Ids
     * are short, ASCII, and unique on the map; a clash or a bad name leaves
     * the light as it was and returns null.
     */
    const rename = (mapData, id, nextId) => {
        const next = String(nextId || '').trim();
        if (!ID_PATTERN.test(next)) return null;
        const lights = list(mapData);
        const at = lights.findIndex(light => light && light.id === id);
        if (at < 0) return null;
        if (next === id) return lights[at];
        if (lights.some(light => light && light.id === next)) return null;
        lights[at] = normalize(Object.assign({}, lights[at], { id: next }), next);
        return lights[at];
    };

    /** Every tag in use on the map, each once, sorted. */
    const tags = mapData => {
        const found = new Set();
        for (const light of list(mapData)) if (light && light.tag) found.add(String(light.tag));
        return Array.from(found).sort();
    };

    const remove = (mapData, id) => {
        const sidecar = mapData && mapData.reactor3d;
        if (!sidecar || !Array.isArray(sidecar.lights)) return false;
        const at = sidecar.lights.findIndex(light => light && light.id === id);
        if (at < 0) return false;
        sidecar.lights.splice(at, 1);
        // An empty array would keep the sidecar file alive for nothing.
        if (!sidecar.lights.length) delete sidecar.lights;
        return true;
    };

    const duplicate = (mapData, id) => {
        const source = get(mapData, id);
        if (!source) return null;
        const copy = JSON.parse(JSON.stringify(source));
        delete copy.id;
        copy.x = number(copy.x + 1, copy.x, -10000, 10000);
        return add(mapData, copy);
    };

    /** Components stay ordinary runtime lights; this metadata groups editor operations. */
    const members = (mapData, id) => {
        const light = get(mapData, id);
        return !light ? [] : light.compoundId
            ? list(mapData).filter(entry => entry.compoundId === light.compoundId) : [light];
    };

    const fixtures = mapData => {
        const seen = new Set();
        return list(mapData).filter(light => {
            if (!light.compoundId) return true;
            if (seen.has(light.compoundId)) return false;
            seen.add(light.compoundId);
            return true;
        });
    };

    const freshCompoundId = (mapData, prefix = 'compound') => {
        const taken = new Set(list(mapData).flatMap(light => [light.compoundId, light.tag]));
        let n = 1;
        while (taken.has(prefix + n)) n++;
        return prefix + n;
    };

    const freshCompoundName = (mapData, name) => {
        const taken = new Set(fixtures(mapData).map(light => light.compoundName));
        if (!taken.has(name)) return name;
        let n = 2;
        while (taken.has(name + ' ' + n)) n++;
        return name + ' ' + n;
    };

    const createCompound = (mapData, parts, x, y, name, prefix = 'compound') => {
        const compoundId = freshCompoundId(mapData, prefix);
        name = freshCompoundName(mapData, name);
        let first = null;
        for (const part of parts) {
            const light = add(mapData, Object.assign({}, part, {
                x: x + number(part.x, 0, -10000, 10000), y: y + number(part.y, 0, -10000, 10000),
                compoundId, compoundName: name, tag: compoundId
            }));
            if (!first) first = light;
        }
        return first;
    };

    const moveFixture = (mapData, id, patch) => {
        const source = get(mapData, id);
        if (!source) return null;
        const anchor = normalize(source, id);
        const bounded = normalize(Object.assign({}, anchor, patch), id);
        const parts = members(mapData, id).map(light => normalize(light, light.id));
        const offsets = {};
        for (const key of ['x', 'y', 'height']) {
            if (patch[key] === undefined) continue;
            const min = key === 'height' ? 0 : -10000, max = key === 'height' ? 512 : 10000;
            const low = Math.max(...parts.map(light => min - light[key]));
            const high = Math.min(...parts.map(light => max - light[key]));
            offsets[key] = Math.max(low, Math.min(high, bounded[key] - anchor[key]));
        }
        for (const light of parts) {
            const moved = {};
            for (const key of Object.keys(offsets)) moved[key] = light[key] + offsets[key];
            update(mapData, light.id, moved);
        }
        return get(mapData, id);
    };

    const removeFixture = (mapData, id) => {
        const parts = members(mapData, id);
        for (const light of parts) remove(mapData, light.id);
        return parts.length > 0;
    };

    const duplicateFixture = (mapData, id) => {
        const source = get(mapData, id);
        if (!source?.compoundId) return duplicate(mapData, id);
        const compoundId = freshCompoundId(mapData);
        const compoundName = freshCompoundName(mapData, source.compoundName);
        let first = null;
        for (const part of members(mapData, id)) {
            const copy = JSON.parse(JSON.stringify(part));
            delete copy.id;
            copy.x += 1;
            copy.compoundId = compoundId;
            copy.compoundName = compoundName;
            if (copy.tag === source.compoundId) copy.tag = compoundId;
            const light = add(mapData, copy);
            if (!first) first = light;
        }
        return first;
    };

    /** The ambient block with the runtime's own defaults filled in. */
    const ambient = mapData => {
        const sidecar = mapData && mapData.reactor3d;
        const lighting = (sidecar && sidecar.lighting) || {};
        return {
            ambient: lighting.ambient === undefined ? 0.25 : number(lighting.ambient, 0.25, 0, 1),
            ambientColour: colour(lighting.ambientColour === undefined ? '#ffffff' : lighting.ambientColour),
            enabled: lighting.enabled
        };
    };

    const setAmbient = (mapData, values) => {
        const sidecar = ensure(mapData);
        if (!sidecar) return null;
        const lighting = sidecar.lighting && typeof sidecar.lighting === 'object'
            ? sidecar.lighting : (sidecar.lighting = {});
        if (values && values.ambient !== undefined) {
            lighting.ambient = number(values.ambient, 0.25, 0, 1);
        }
        if (values && values.ambientColour !== undefined) {
            lighting.ambientColour = colour(values.ambientColour);
        }
        if (values && values.enabled !== undefined) {
            if (values.enabled === null) delete lighting.enabled;
            else lighting.enabled = !!values.enabled;
        }
        return ambient(mapData);
    };

    /** Whole-state snapshot for the editor's undo history. */
    const snapshot = mapData => {
        const sidecar = mapData && mapData.reactor3d;
        return JSON.stringify({
            lights: (sidecar && sidecar.lights) || [],
            lighting: (sidecar && sidecar.lighting) || null
        });
    };

    const restore = (mapData, saved) => {
        let parsed;
        try {
            parsed = JSON.parse(saved);
        } catch (error) {
            return false;
        }
        const sidecar = ensure(mapData);
        if (!sidecar) return false;
        if (Array.isArray(parsed.lights) && parsed.lights.length) {
            sidecar.lights = parsed.lights.map((entry, i) => normalize(entry, 'light' + (i + 1)));
        } else {
            delete sidecar.lights;
        }
        if (parsed.lighting) sidecar.lighting = parsed.lighting;
        else delete sidecar.lighting;
        return true;
    };

    const api = {
        VERSION,
        TYPES,
        DEFAULT_CONE_ANGLE,
        DEFAULT_CONE_LENGTH,
        DEFAULT_BEAM_LENGTH,
        DEFAULT_BEAM_WIDTH,
        ID_PATTERN,
        PRESETS,
        presetLook,
        presetTemplate,
        normalize,
        list,
        get,
        add,
        update,
        rename,
        tags,
        remove,
        duplicate,
        members, fixtures, createCompound, moveFixture, removeFixture, duplicateFixture,
        ambient,
        setAmbient,
        snapshot,
        restore,
        colour
    };

    root.RRMapLights = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
