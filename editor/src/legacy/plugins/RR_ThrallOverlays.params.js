'use strict';
// Plugin parameters for RR_ThrallOverlays from the game's copy of Ultimate Overlay Mapping: the HK_UOM
// switches and file names, and the overlay pictures the game ships in Overlays/ (listed with `list` when the
// importer gives one, else found by asking `read` for each kind and map id).

const KINDS = [['groundName', 'GroundMap', 'Ground'], ['parName', 'ParMap', 'Par'], ['par2Name', 'Par2Map', 'Parall'], ['shadowName', 'ShadowMap', 'Shadow'], ['lightName', 'LightMap', 'Light']];
const SWITCHES = [['groundSwitch', 'GroundSwitch'], ['parSwitch', 'ParSwitch'], ['par2Switch', 'Par2Switch'], ['shadowSwitch', 'ShadowSwitch'], ['lightSwitch', 'LightSwitch']];
const MAX_MAP_ID = 999;

function extract({ constants = {}, read = () => null, list = null } = {}) {
    const out = {};
    const k = (name) => constants['HK_UOM::' + name];
    for (const [param, key] of SWITCHES) if (typeof k(key) === 'number') out[param] = String(k(key));
    const names = [];
    for (const [param, key, fallback] of KINDS) {
        const name = typeof k(key) === 'string' ? k(key) : fallback;
        out[param] = name;
        names.push(name);
    }
    let files = [];
    const listed = typeof list === 'function' ? list('Overlays') : null;
    if (Array.isArray(listed) && listed.length) {
        files = listed.map(f => String(f).split(/[\\/]/).pop()).filter(f => /\.png$/i.test(f)).map(f => f.replace(/\.png$/i, ''));
    } else {
        for (const name of names) {
            for (let id = 1; id <= MAX_MAP_ID; id++) {
                let bytes = null;
                try { bytes = read(`Overlays/${name}${id}.png`); } catch (_) { bytes = null; }
                if (bytes && bytes.length) files.push(`${name}${id}`);
            }
        }
    }
    // Only the names the script loads (Ground12, Parall3, …).
    out.files = JSON.stringify(files.filter(f => names.some(n => new RegExp('^' + n + '\\d+$', 'i').test(f))).sort());
    return out;
}

module.exports = { extract };
