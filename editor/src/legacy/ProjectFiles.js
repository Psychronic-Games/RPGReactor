/**
 * ProjectFiles - the image and audio files an imported project's data names,
 * checked against the files it has. Node only; every importer uses it after
 * its assets are written.
 *
 *   forEachReference(dest, visit)   visit(folder, holder, key) for every name in data/*.json;
 *                                   holder[key] may be changed, and the file is rewritten
 *   matchFileCase(dest)             references spelled as their files are on disk
 *   missingReferences(dest)         Map folder → Set of names with no file
 *   missingList(dest)               the same as "folder/name" strings, for the import report
 *   clearMissingSystemFiles(dest)   System.json names with no file cleared
 *   copyAcrossAudio(dest)           a name played as ME (or BGM, SE…) found only in
 *                                   another audio folder is copied to the folder that plays it
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const FOLDERS = ['audio/bgm', 'audio/bgs', 'audio/me', 'audio/se', 'img/characters', 'img/faces', 'img/pictures', 'img/parallaxes', 'img/enemies', 'img/battlebacks1', 'img/battlebacks2', 'img/animations', 'img/titles1', 'img/tilesets', 'img/system'];
const AUDIO_CODES = { 241: 'audio/bgm', 132: 'audio/bgm', 245: 'audio/bgs', 249: 'audio/me', 133: 'audio/me', 250: 'audio/se' };
const IMAGE_KEYS = { characterName: 'img/characters', faceName: 'img/faces', parallaxName: 'img/parallaxes', battlerName: 'img/enemies', battleback1Name: 'img/battlebacks1', battleback2Name: 'img/battlebacks2', animation1Name: 'img/animations', animation2Name: 'img/animations', title1Name: 'img/titles1' };
const AUDIO_KEYS = { bgm: 'audio/bgm', titleBgm: 'audio/bgm', battleBgm: 'audio/bgm', bgs: 'audio/bgs', victoryMe: 'audio/me', gameoverMe: 'audio/me', defeatMe: 'audio/me', se: 'audio/se' };

function forEachReference(dest, visit) {
    const walk = (v) => {
        if (Array.isArray(v)) { for (const x of v) walk(x); return; }
        if (!v || typeof v !== 'object') return;
        if (typeof v.code === 'number' && Array.isArray(v.parameters)) {
            const p = v.parameters;
            if (AUDIO_CODES[v.code] && p[0] && typeof p[0] === 'object') visit(AUDIO_CODES[v.code], p[0], 'name');
            else if (v.code === 231) visit('img/pictures', p, 1);
            else if (v.code === 44 && p[0] && typeof p[0] === 'object') visit('audio/se', p[0], 'name');   // move route Play SE
            else if (v.code === 41) visit('img/characters', p, 0);                                          // move route Change Image
            else if (v.code === 322) { visit('img/characters', p, 1); visit('img/faces', p, 3); }
            else if (v.code === 283) { visit('img/battlebacks1', p, 0); visit('img/battlebacks2', p, 1); }
            else if (v.code === 284) visit('img/parallaxes', p, 0);
            else if (v.code === 101 && typeof p[0] === 'string') visit('img/faces', p, 0);
        }
        for (const [k, x] of Object.entries(v)) {
            if (typeof x === 'string') { if (IMAGE_KEYS[k]) visit(IMAGE_KEYS[k], v, k); }
            else if (x && typeof x === 'object') {
                if (AUDIO_KEYS[k] && typeof x.name === 'string') visit(AUDIO_KEYS[k], x, 'name');
                else if (k === 'sounds' && Array.isArray(x)) for (const snd of x) if (snd) visit('audio/se', snd, 'name');
                walk(x);
            }
        }
    };
    const dataDir = path.join(dest, 'data');
    let changed = 0;
    for (const f of fs.readdirSync(dataDir).filter(n => /\.json$/i.test(n))) {
        const file = path.join(dataDir, f);
        let json;
        try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { continue; }
        const text = JSON.stringify(json);
        walk(json);
        const after = JSON.stringify(json);
        if (after !== text) { fs.writeFileSync(file, after); changed++; }
    }
    return changed;
}

/** folder → Map(lower-case name without extension → name as on disk), subfolders included. */
function fileIndex(dest) {
    const index = new Map();
    for (const folder of FOLDERS) {
        const names = new Map();
        const walk = (abs, rel) => {
            let entries = [];
            try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch (_) { return; }
            for (const e of entries) {
                const r = rel ? rel + '/' + e.name : e.name;
                if (e.isDirectory()) walk(path.join(abs, e.name), r);
                else if (!/\.part\./.test(e.name)) names.set(r.replace(/\.[^./]+$/, '').toLowerCase(), r.replace(/\.[^./]+$/, ''));
            }
        };
        walk(path.join(dest, folder), '');
        index.set(folder, names);
    }
    return index;
}

/**
 * References made to work off Windows: a Windows path separator is a folder
 * (Gegnerpics\\Buddler → Gegnerpics/Buddler), RPG Maker 2000/2003's "no sound"
 * name in any language ("(OFF)", "(Kein Sound)", "(なし)") is none, and a name
 * is spelled as its file is on disk.
 */
function matchFileCase(dest) {
    const index = fileIndex(dest);
    let fixed = 0;
    forEachReference(dest, (folder, holder, key) => {
        let name = holder[key];
        if (typeof name !== 'string' || !name) return;
        if (folder.startsWith('audio/') && /^\(.*\)$/.test(name.trim()) && !index.get(folder).has(name.toLowerCase())) { holder[key] = ''; fixed++; return; }
        if (name.includes('\\')) name = name.replace(/\\/g, '/');
        const exact = index.get(folder).get(name.toLowerCase());
        const next = exact !== undefined ? exact : name;
        if (next !== holder[key]) { holder[key] = next; fixed++; }
    });
    return fixed;
}

/**
 * System.json names that point at nothing (sounds and music a blank template
 * carried, a test battleback the game never shipped) are cleared, so the game
 * plays and shows nothing there instead of stopping at a load error.
 */
function clearMissingSystemFiles(dest) {
    const file = path.join(dest, 'data', 'System.json');
    if (!fs.existsSync(file)) return 0;
    const index = fileIndex(dest);
    const sys = JSON.parse(fs.readFileSync(file, 'utf8'));
    let cleared = 0;
    const check = (folder, holder, key) => { const n = holder && holder[key]; if (typeof n === 'string' && n && !index.get(folder).has(n.toLowerCase())) { holder[key] = ''; cleared++; } };
    for (const snd of sys.sounds || []) check('audio/se', snd, 'name');
    for (const [k, folder] of [['titleBgm', 'audio/bgm'], ['battleBgm', 'audio/bgm'], ['victoryMe', 'audio/me'], ['defeatMe', 'audio/me'], ['gameoverMe', 'audio/me']]) check(folder, sys[k], 'name');
    for (const v of ['boat', 'ship', 'airship']) { if (sys[v]) { check('audio/bgm', sys[v].bgm, 'name'); check('img/characters', sys[v], 'characterName'); } }
    for (const [k, folder] of [['battleback1Name', 'img/battlebacks1'], ['battleback2Name', 'img/battlebacks2'], ['battlerName', 'img/enemies'], ['title1Name', 'img/titles1']]) check(folder, sys, k);
    if (cleared) fs.writeFileSync(file, JSON.stringify(sys));
    return cleared;
}

function missingReferences(dest) {
    const index = fileIndex(dest);
    const missing = new Map(FOLDERS.map(f => [f, new Set()]));
    forEachReference(dest, (folder, holder, key) => {
        const name = holder[key];
        if (typeof name === 'string' && name && !index.get(folder).has(name.toLowerCase())) missing.get(folder).add(name);
    });
    return missing;
}

/** Every name the data gives that has no file, as "folder/name", sorted. */
function missingList(dest) {
    const out = [];
    for (const [folder, names] of missingReferences(dest)) for (const name of names) out.push(`${folder}/${name}`);
    return out.sort();
}

function copyAcrossAudio(dest) {
    const index = fileIndex(dest);
    const AUDIO = ['audio/bgm', 'audio/me', 'audio/se', 'audio/bgs'];
    let copied = 0;
    for (const [folder, names] of missingReferences(dest)) {
        if (!AUDIO.includes(folder)) continue;
        for (const name of names) {
            const from = AUDIO.find(other => other !== folder && index.get(other).has(name.toLowerCase()));
            if (!from) continue;
            const stem = index.get(from).get(name.toLowerCase());
            const dir = path.join(dest, from, path.dirname(stem));
            for (const f of fs.readdirSync(dir)) {
                if (f.replace(/\.[^.]+$/, '') !== path.basename(stem)) continue;
                const target = path.join(dest, folder, path.dirname(stem), f);
                fs.mkdirSync(path.dirname(target), { recursive: true });
                if (!fs.existsSync(target)) { fs.copyFileSync(path.join(dir, f), target); copied++; }
            }
        }
    }
    return copied;
}

module.exports = { forEachReference, fileIndex, matchFileCase, clearMissingSystemFiles, missingList, missingReferences, copyAcrossAudio, FOLDERS };
