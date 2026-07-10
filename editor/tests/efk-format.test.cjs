// Validates the Effekseer .efkefc parser against the full stock effect
// corpus shipped in template/Demo/effects (120 files, binary versions 15
// and 1500). Every file must parse to the exact end of its BIN_ chunk —
// sequential binary parsing means any layout error surfaces as a failure
// here long before it can corrupt generated files.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const fmt = require(path.join(repoRoot, 'editor', 'src', 'forge', 'EffekseerGenerator', 'format', 'efk_format.js'));

const effectsDir = path.join(repoRoot, 'template', 'Demo', 'effects');
const corpusPresent = fs.existsSync(effectsDir);
const corpusSkip = corpusPresent ? false : 'template/Demo effect corpus is not present';

function getCorpusFiles() {
    return fs.readdirSync(effectsDir).filter((f) => f.endsWith('.efkefc')).sort();
}

test('stock effect corpus is present', { skip: corpusSkip }, () => {
    const files = getCorpusFiles();
    assert.ok(files.length >= 100, `expected the stock MZ corpus, found ${files.length} files`);
});

test('every stock effect parses to the exact end of BIN_', { skip: corpusSkip }, () => {
    const files = getCorpusFiles();
    const failures = [];
    for (const f of files) {
        try {
            const bytes = new Uint8Array(fs.readFileSync(path.join(effectsDir, f)));
            const effect = fmt.parseEfkefc(bytes);
            assert.ok(effect.root, `${f}: no root node`);
        } catch (e) {
            failures.push(`${f}: ${e.message}`);
        }
    }
    assert.deepEqual(failures, [], `${failures.length}/${files.length} failed:\n${failures.slice(0, 10).join('\n')}`);
});

// The strongest guarantee we have: parse → re-emit must reproduce the
// original INFO and BIN_ chunks byte-for-byte for every stock effect.
// (EDIT is intentionally not written — the runtime never reads it.)
test('round-trip: every stock effect re-emits byte-identical INFO and BIN_', { skip: corpusSkip }, () => {
    const files = getCorpusFiles();
    for (const f of files) {
        const orig = new Uint8Array(fs.readFileSync(path.join(effectsDir, f)));
        const container = fmt.parseContainer(orig);
        const origBin = container.chunks.find((c) => c.forcc === 'BIN_').data;
        const origInfo = container.chunks.find((c) => c.forcc === 'INFO').data;
        const effect = fmt.parseEfkefc(orig);
        assert.deepEqual(fmt.writeBinChunk(effect), origBin, `${f}: BIN_ not byte-identical`);
        assert.deepEqual(fmt.writeInfoChunk(effect.info), origInfo, `${f}: INFO not byte-identical`);
    }
});

// INFO and BIN_ list the same resources but not necessarily in the same
// order (the Effekseer editor sorts the two chunks differently), so
// compare as sets.
test('INFO chunk resource lists match BIN_ header lists', { skip: corpusSkip }, () => {
    const files = getCorpusFiles();
    for (const f of files) {
        const bytes = new Uint8Array(fs.readFileSync(path.join(effectsDir, f)));
        const effect = fmt.parseEfkefc(bytes);
        if (!effect.info) continue;
        assert.deepEqual([...effect.info.colorImages].sort(), [...effect.header.colorImages].sort(), `${f}: color image mismatch`);
        assert.deepEqual([...effect.info.sounds].sort(), [...effect.header.sounds].sort(), `${f}: sound mismatch`);
    }
});
