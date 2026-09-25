const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(repoRoot, '..');

const DOC_DIRS = [
    workspaceRoot,
    path.join(workspaceRoot, 'docs'),
    path.join(workspaceRoot, 'docs', 'devlogs'),
    path.join(workspaceRoot, 'docs', 'posts'),
    path.join(workspaceRoot, 'docs', 'archive'),
    path.join(workspaceRoot, 'docs', 'archive', 'audits'),
    path.join(workspaceRoot, 'docs', 'archive', 'design'),
    path.join(workspaceRoot, 'docs', 'archive', 'handoff'),
    path.join(workspaceRoot, 'docs', 'archive', 'pr-integration'),
    path.join(workspaceRoot, 'docs', 'archive', 'releases'),
    path.join(workspaceRoot, 'docs', 'archive', 'sessions'),
    path.join(workspaceRoot, 'changelog'),
    path.join(repoRoot),
    path.join(repoRoot, 'changelog'),
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

test('each changelog index lists one file per release, the version in development first', () => {
    const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
    for (const dir of [workspaceRoot, repoRoot]) {
        const index = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
        const listed = [...index.matchAll(/^- \[([\d.]+)\]\(changelog\/([\d.]+)\.md\)/gm)];
        const files = fs.readdirSync(path.join(dir, 'changelog')).filter(name => name.endsWith('.md'));
        assert.deepEqual(listed.map(m => m[2] + '.md').sort(), files.sort(), `${dir}: index and files agree`);
        for (const m of listed) assert.equal(m[1], m[2]);
        assert.equal(listed[0][1], version, 'the newest entry is the package version');
        const title = fs.readFileSync(path.join(dir, 'changelog', `${version}.md`), 'utf8').split('\n')[0];
        assert.match(title, new RegExp(`^# RPG Reactor ${version.replace(/\./g, '\\.')} (\\(in development\\)|- \\d{4}-\\d{2}-\\d{2})$`));
    }
});
