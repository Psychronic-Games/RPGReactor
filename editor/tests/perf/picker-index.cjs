'use strict';
// The pre-optimization ordering is retained as a reference for functional checks and an opt-in
// CPU benchmark. Run: node editor/tests/perf/picker-index.cjs [name-count=5000]
const sectionKey = name => {
    const normalized = String(name || '').normalize('NFC');
    if (!normalized) return '#';
    let first = Array.from(normalized)[0];
    if (typeof Intl !== 'undefined' && Intl.Segmenter) first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(normalized)[Symbol.iterator]().next().value?.segment || first;
    return first && /\p{L}/u.test(first) ? first.toLocaleUpperCase().normalize('NFC') : '#';
};
const compareSectionKeys = (a, b) => a === '#' ? (b === '#' ? 0 : -1) : b === '#' ? 1
    : a.localeCompare(b, undefined, { sensitivity: 'base' }) || a.localeCompare(b, undefined, { sensitivity: 'variant' });
const compareNames = (a, b) => compareSectionKeys(sectionKey(a), sectionKey(b))
    || a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
    || a.localeCompare(b, undefined, { sensitivity: 'variant', numeric: true });
const group = names => {
    const sections = new Map();
    [...new Set(names)].sort(compareNames).forEach(name => {
        const key = sectionKey(name);
        if (!sections.has(key)) sections.set(key, []);
        sections.get(key).push(name);
    });
    return Array.from(sections, ([key, names]) => ({ key, names }));
};
const buildFolderTree = names => {
    const root = { files: [], folders: [], _folders: new Map() };
    for (const fullName of new Set(names.map(String))) {
        const parts = fullName.split('/');
        if (parts.length < 2) { root.files.push(fullName); continue; }
        let node = root, folderPath = '';
        for (const name of parts.slice(0, -1)) {
            folderPath = folderPath ? `${folderPath}/${name}` : name;
            if (!node._folders.has(name)) node._folders.set(name, { name, path: folderPath, files: [], folders: [], total: 0, _folders: new Map() });
            node = node._folders.get(name); node.total++;
        }
        node.files.push(fullName);
    }
    const finish = node => {
        node.files.sort((a, b) => compareNames(a.split('/').pop() || '', b.split('/').pop() || ''));
        node.folders = Array.from(node._folders.values()).sort((a, b) => compareNames(a.name, b.name));
        for (const folder of node.folders) finish(folder);
        delete node._folders;
        return node;
    };
    return finish(root);
};
const fixture = count => Array.from({ length: count }, (_, i) => ['Actors/Éowyn', 'Actors/e\u0301owyn', '敵/勇者', 'Actors/Guard', '🙂Smile', '#effect'][i % 6] + ((i * 617) % count));
module.exports = { sectionKey, compareSectionKeys, compareNames, group, buildFolderTree, fixture };

if (require.main === module) {
    const { performance } = require('node:perf_hooks'), path = require('node:path'), assert = require('node:assert/strict');
    const current = require('../../src/utils/PickerIndex.js'), assets = require('../../src/utils/AssetFiles.js');
    const median = values => values.slice().sort((a, b) => a - b)[values.length >> 1];
    const count = Math.max(1, Number(process.argv[2]) || 5000);
    const demo = assets.list(path.resolve(__dirname, '../../../template/Demo/img'), assets.IMAGE_EXTENSIONS).map(r => r.name);
    const output = [];
    for (const [label, names] of [['Demo images', demo], [count + ' mixed names', fixture(count)]]) {
        // Warm each implementation once, then alternate runs against the same immutable input.
        const expected = buildFolderTree(names);
        assert.deepEqual(current.buildFolderTree(names), expected);
        const before = [], after = [];
        for (let round = 0; round < 5; round++) {
            for (const [work, times] of round % 2 ? [[current.buildFolderTree, after], [buildFolderTree, before]] : [[buildFolderTree, before], [current.buildFolderTree, after]]) {
                const start = performance.now(), result = work(names);
                times.push(performance.now() - start);
                assert.deepEqual(result, expected);
            }
        }
        output.push({ label, count: names.length, beforeMedianMs: median(before), afterMedianMs: median(after), before, after, exactOrder: true });
    }
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}
