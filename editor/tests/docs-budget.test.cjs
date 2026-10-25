const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { archiveHandoff, fitHandoff, latestRelease, rebaseLinks, splitSections } = require('../build-scripts/archive-handoff.cjs');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(workspaceRoot, file), 'utf8');
const bytes = text => Buffer.byteLength(text, 'utf8');

// The limits and what to do about each are in docs/README.md › Keeping STATUS
// and HANDOFF short. Raise a limit there and here together, or not at all.
const STATUS_LIMIT = 25000;
const HANDOFF_LIMIT = 40000;
const STANDING_LIMIT = 2500;
const ENTRY_LIMIT = 4000;

const RULES = 'see docs/README.md › Keeping STATUS and HANDOFF short';

test('STATUS.md stays within its budget', () => {
    const size = bytes(read('docs/STATUS.md'));
    assert.ok(size <= STATUS_LIMIT,
        `STATUS.md is ${size} bytes (limit ${STATUS_LIMIT}): replace stale bullets, move finished items out of Open work; ${RULES}`);
});

test('HANDOFF.md holds one short standing and the cycle in progress', () => {
    const source = read('docs/HANDOFF.md');
    const { sections } = splitSections(source);
    const standing = sections.filter(s => /^## Where things stand/.test(s.heading));
    assert.equal(standing.length, 1, 'HANDOFF.md has exactly one "## Where things stand" section');
    assert.ok(bytes(standing[0].text) <= STANDING_LIMIT,
        `"Where things stand" is ${bytes(standing[0].text)} bytes (limit ${STANDING_LIMIT}): rewrite it, don't add to it; ${RULES}`);

    const release = latestRelease(workspaceRoot);
    for (const section of sections) {
        if (section === standing[0]) continue;
        assert.ok(section.date, `HANDOFF.md section without a date: ${section.heading}`);
        assert.ok(section.date >= release.date,
            `${section.heading} is older than ${release.version} (${release.date}): run node editor/build-scripts/archive-handoff.cjs`);
        assert.ok(bytes(section.text) <= ENTRY_LIMIT,
            `${section.heading} is ${bytes(section.text)} bytes (limit ${ENTRY_LIMIT}): what changed belongs in the changelog; ${RULES}`);
    }
    assert.ok(bytes(source) <= HANDOFF_LIMIT,
        `HANDOFF.md is ${bytes(source)} bytes (limit ${HANDOFF_LIMIT}): run node editor/build-scripts/archive-handoff.cjs --fit; ${RULES}`);
});

// A note squeezed to fit a limit ("first401", "below1.8GiB", "tests,9 skipped,none")
// is unreadable. Cut content or archive instead; never drop the spaces.
const SQUEEZED = [
    /(?<![\w./\\-])[a-z]{2,}\d[\w.]*/g, // a word glued to a number
    /\w*[a-z][,:;]\d[\d,.]*/g,          // punctuation with no space before a number
    /(?<![\w./\\-])[a-z]{2,},[a-z]{2,}/g // two words joined by a comma
];
const SQUEEZE_ALLOWED = /^(mp[34]|utf8|es\d|md5|sha\d|vp\d|av1|h26\d|x\d)/;

function squeezedProse(text) {
    const found = [];
    text.split('\n').forEach((line, index) => {
        const prose = line
            .replace(/`[^`]*`/g, ' ')
            .replace(/\]\([^)]*\)/g, '] ')
            .replace(/https?:\/\/\S+/g, ' ');
        for (const pattern of SQUEEZED) {
            for (const match of prose.matchAll(pattern)) {
                if (!SQUEEZE_ALLOWED.test(match[0])) found.push(`line ${index + 1}: "${match[0]}"`);
            }
        }
    });
    return found;
}

test('STATUS.md and HANDOFF.md are written in full sentences, not squeezed', () => {
    for (const file of ['docs/STATUS.md', 'docs/HANDOFF.md']) {
        const found = squeezedProse(read(file));
        assert.deepEqual(found, [],
            `${file} has text squeezed to fit its limit; cut content or run archive-handoff.cjs --fit instead: ${found.join(', ')}`);
    }
});

test('the squeeze check catches glued words and passes normal prose', () => {
    assert.equal(squeezedProse('Checks: first401 models, peaks below1.8GiB, 7,755 tests,9 skipped,none failed.').length, 4);
    assert.deepEqual(squeezedProse('Preview 47 at runtime 20261022.1: 7,755 tests, 9 skipped; maps 1/5, cell (87,72), `glued1` and [x](a1b2.md), MP3 and mp3 audio.'), []);
});

test('archive-handoff moves entries through a date and keeps the standing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-handoff-'));
    try {
        fs.mkdirSync(path.join(root, 'docs', 'archive', 'handoff'), { recursive: true });
        fs.mkdirSync(path.join(root, 'editor'));
        fs.writeFileSync(path.join(root, 'editor', 'package.json'), '{"version": "1.0.1"}');
        fs.writeFileSync(path.join(root, 'CHANGELOG.md'),
            '# Changelog\n\n- [1.0.1](changelog/1.0.1.md) (in development)\n- [1.0.0](changelog/1.0.0.md) - 2026-01-10\n');
        fs.writeFileSync(path.join(root, 'docs', 'HANDOFF.md'), [
            '# Handoff\n\nIntro.\n',
            '## Where things stand (2026-01-12)\n\nNow.\n',
            '## 2026-01-11 — After the release\n\nKept.\n',
            '## 1.0.0 cycle\n\nDivider.\n',
            '## 2026-01-09 — Before\n\nMoved.\n',
            '## 2026-01-08 — Earlier\n\nMoved too.\n'
        ].join('\n'));
        fs.writeFileSync(path.join(root, 'docs', 'archive', 'handoff', '1.0.0.md'),
            '# Handoff archive: the 1.0.0 cycle\n\nHeader.\n\n## 2026-01-01 — Already here\n\nOld.\n');

        const result = archiveHandoff({ root });
        assert.equal(result.file, path.join('docs', 'archive', 'handoff', '1.0.0.md'));
        assert.deepEqual(result.moved.map(s => s.heading),
            ['## 1.0.0 cycle', '## 2026-01-09 — Before', '## 2026-01-08 — Earlier']);

        const handoff = fs.readFileSync(path.join(root, 'docs', 'HANDOFF.md'), 'utf8');
        assert.match(handoff, /^# Handoff\n\nIntro\.\n\n## Where things stand/);
        assert.match(handoff, /## 2026-01-11 — After the release\n\nKept\.\n$/);
        assert.doesNotMatch(handoff, /Before|Divider/);

        const archive = fs.readFileSync(path.join(root, result.file), 'utf8');
        const order = ['Header.', '## 1.0.0 cycle', '## 2026-01-09', '## 2026-01-08', '## 2026-01-01']
            .map(text => archive.indexOf(text));
        assert.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), archive);

        assert.deepEqual(archiveHandoff({ root }).written, [], 'a second run moves nothing');

        assert.deepEqual(fitHandoff({ root, target: 1000 }).written, [], 'a handoff that fits is left alone');
        const fit = fitHandoff({ root, target: Buffer.byteLength(handoff) - 1 });
        assert.deepEqual(fit.moved.map(s => s.heading), ['## 2026-01-11 — After the release'],
            '--fit archives the oldest day that brings the handoff under the target');
        assert.match(fs.readFileSync(path.join(root, 'docs', 'HANDOFF.md'), 'utf8'), /## Where things stand/);
        fs.writeFileSync(path.join(root, 'docs', 'HANDOFF.md'), handoff);

        const midCycle = archiveHandoff({ root, through: '2026-01-11' });
        assert.equal(midCycle.file, path.join('docs', 'archive', 'handoff', '1.0.1.md'));
        assert.match(fs.readFileSync(path.join(root, midCycle.file), 'utf8'), /^# Handoff archive: the 1\.0\.1 cycle/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('archived entries keep their links working from the archive folder', () => {
    assert.equal(
        rebaseLinks('[a](PERFORMANCE.md) [b](perf-round2/) [c](../CHANGELOG.md#x) [d](archive/handoff/0.99.0.md) [e](https://x.org/a.md) [f](#here)'),
        '[a](../../PERFORMANCE.md) [b](../../perf-round2/) [c](../../../CHANGELOG.md#x) [d](0.99.0.md) [e](https://x.org/a.md) [f](#here)');
});
