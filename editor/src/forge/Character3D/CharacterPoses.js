/**
 * RRCharacterPoses - the 3D Character Builder's poses and motions: the
 * shared motion library (runtime/reactor_3d_motions.js, the same one the
 * game plays rigged humanoids with), loaded here from the runtime, and what
 * a saved character carries of it (savedModel).
 *
 *   RRCharacterPoses.*           the library (POSES, clip, gameClips, ...)
 *   RRCharacterPoses.savedModel(result, set)   { clips, sidecar, rigBinary } for Save to Project
 */
(function (root) {
    'use strict';

    /** The runtime folder: beside the editor in a checkout, inside it in a release. */
    function runtimeFolder() {
        const path = require('path'), fs = require('fs');
        const bases = [typeof __dirname === 'string' ? path.join(__dirname, '..', '..', '..', '..') : null, process.cwd(), path.join(process.cwd(), '..')].filter(Boolean);
        for (const base of bases) { const folder = path.join(base, 'runtime'); if (fs.existsSync(path.join(folder, 'reactor_3d_motions.js'))) return folder; }
        return null;
    }
    let Library = root.RRMotionLibrary || null;
    if (!Library && typeof require === 'function') {
        const folder = runtimeFolder();
        if (folder) {
            const path = require('path'), file = path.join(folder, 'reactor_3d_motions.js');
            if (typeof document !== 'undefined' && typeof window !== 'undefined') {
                // On the page itself, so its arrays are the page's own.
                const script = document.createElement('script');
                script.textContent = require('fs').readFileSync(file, 'utf8') + '\n//# sourceURL=' + file;
                document.head.appendChild(script);
                script.remove();
                Library = root.RRMotionLibrary;
            } else Library = require(file);
            if (Library) Library.dataPath = path.join(folder, 'reactor_3d_motions.bin');
        }
    }
    if (!Library) return;

    const need = (name, file) => root[name] || (typeof require === 'function' ? (() => { try { return require(file); } catch (e) { return null; } })() : null);

    /**
     * A humanoid rig for a saved character, as Database › 3D Models' Rig
     * tool binds one to a model with a skeleton of its own: every marker on
     * the bone of its name, in the frame the editor shows the model in (its
     * box centred across and deep, its feet on the floor), the rig's joints
     * mapped onto the file's bones and no vertex weighted. { rig, binary }
     * or null without the rig modules.
     */
    function humanoidRig(bones, parts) {
        const Rigger = need('ModelRigger', '../../database/ModelRigger.js'), Auto = need('ModelAutoRig', '../../database/ModelAutoRig.js');
        if (!Rigger || !Auto) return null;
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (const p of parts || []) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.positions[i + k]); max[k] = Math.max(max[k], p.positions[i + k]); }
        if (!Number.isFinite(min[0])) return null;
        const shift = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2];
        const joints = bones.map(b => ({ name: b.name, parent: b.parent, position: [b.head[0] - shift[0], b.head[1] - shift[1], b.head[2] - shift[2]] }));
        const read = Auto.markersFromSkeleton(joints);
        if (!read.humanoid) return null;
        const size = { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] };
        const markers = Rigger.completeMarkers(read.markers, 'humanoid', size);
        const built = Rigger.buildRigBinary(markers, Rigger.bonesFromMarkers(markers, 'humanoid'), [], 'humanoid');
        return { rig: built.rig, binary: built.binary };
    }

    /**
     * Everything a saved humanoid carries beyond its mesh: its clips
     * (gameClips), and its model.json's rig and animations, so it is
     * rigged in Database › 3D Models and plays its own motions in the game
     * the moment it is saved. { clips, sidecar, rigBinary } or null for a
     * body that is not a humanoid's.
     */
    function savedModel(result, set) {
        if (!result || !result.bones || !result.bones.some(b => b.name === 'LeftArm')) return null;
        const body = (result.parts || []).find(p => p.name === 'Body');
        const clips = api.gameClips(result.bones, body, set);
        const names = new Set(['Idle'].concat(clips.map(c => c.name)));
        const animations = Library.SLOTS.filter(([, , clip]) => names.has(clip)).map(([name, trigger, clip]) => ({ name, type: 'clip', trigger, clip }));
        if (result.recipe && result.recipe.species === 'merfolk' && (result.clips || []).some(c => c.name === 'Tread')) {
            const tread = animations.find(a => a.trigger === 'treading');
            if (tread) tread.clip = 'Tread';
            else animations.push({ name: 'Tread Water', type: 'clip', trigger: 'treading', clip: 'Tread' });
        }
        const rigged = humanoidRig(result.bones, result.parts);
        const sidecar = { animations };
        if (rigged) sidecar.rig = rigged.rig;
        return { clips, sidecar, rigBinary: rigged ? rigged.binary : null };
    }


    const api = Object.assign(Object.create(null), Library, { savedModel, humanoidRig });
    const follow = (bones, clip) => need('RRCharacterSpecies', './CharacterSpecies.js')?.followMotion(bones, clip) || clip;
    api.clip = (bones, ...args) => follow(bones, Library.clip(bones, ...args));
    api.gameClips = (bones, ...args) => Library.gameClips(bones, ...args).map(clip => follow(bones, clip));
    // The library itself keeps its own state (its data); the builder reaches it through this one name.
    for (const key of Object.keys(Library)) if (typeof Library[key] !== 'function') Object.defineProperty(api, key, { get: () => Library[key], set: v => { Library[key] = v; }, enumerable: true });
    root.RRCharacterPoses = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
