const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(repoRoot, '..');

const DOC_DIRS = [
    workspaceRoot,
    path.join(workspaceRoot, 'docs'),
    path.join(repoRoot),
    path.join(repoRoot, 'src', 'forge', 'CharacterGenerator', 'procgen'),
    path.join(repoRoot, 'src', 'forge', 'CharacterGenerator', 'procgen', 'analysis'),
    path.join(repoRoot, 'src', 'forge', 'CharacterGenerator', 'styles', 'psychronic')
];

function markdownFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
        .map(entry => path.join(dir, entry.name));
}

function stripAnchor(link) {
    const hashIndex = link.indexOf('#');
    return hashIndex >= 0 ? link.slice(0, hashIndex) : link;
}

function isExternalOrAnchor(link) {
    return !link ||
        link.startsWith('#') ||
        /^[a-z][a-z0-9+.-]*:/i.test(link) ||
        link.startsWith('//');
}

test('local Markdown links point to files in this checkout', () => {
    const docs = DOC_DIRS.flatMap(markdownFiles);
    const failures = [];
    const linkPattern = /(?<!!)(?:\[[^\]]+\]\(([^)]+)\))/g;

    for (const filePath of docs) {
        const source = fs.readFileSync(filePath, 'utf8');
        let match;
        while ((match = linkPattern.exec(source)) !== null) {
            const rawTarget = match[1].trim().replace(/^<|>$/g, '');
            if (isExternalOrAnchor(rawTarget)) continue;

            const noAnchor = stripAnchor(rawTarget);
            if (isExternalOrAnchor(noAnchor)) continue;

            const decoded = decodeURIComponent(noAnchor);
            const resolved = path.resolve(path.dirname(filePath), decoded);
            if (!fs.existsSync(resolved)) {
                failures.push(`${path.relative(workspaceRoot, filePath)} -> ${rawTarget}`);
            }
        }
    }

    assert.deepEqual(failures, []);
});
