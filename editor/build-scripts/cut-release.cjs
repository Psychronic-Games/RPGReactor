#!/usr/bin/env node
/**
 * Cut a release: one command, from a working tree to a published GitHub release.
 *
 *   node editor/build-scripts/cut-release.cjs 0.97.0
 *   node editor/build-scripts/cut-release.cjs 0.97.0 --dry-run
 *
 * Doing this by hand meant rolling four documents, remembering the test count,
 * tagging, pushing the tag *and* the branch, and then creating the release
 * separately — because a tag alone does not make one, which is the step that
 * looks like nothing happened. Every one of those is a chance to publish
 * something inconsistent, and the one that gets forgotten is always the last.
 *
 * This does not build or sign binaries. That is `release-candidate.yml` and
 * `release.yml`, which download signed artifacts and push them to itch; run
 * those when a release needs downloads attached. This is the announcement:
 * version surfaces, changelog, tag, and the release notes a visitor reads.
 *
 * The token comes from GITHUB_TOKEN or GH_TOKEN. Without one, everything up to
 * the push still happens and the release step prints the URL to finish by hand,
 * so a missing token costs a click rather than a broken half-release.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const REPO = 'Psychronic-Games/RPGReactor';

const run = (command, args, options = {}) =>
    execFileSync(command, args, { cwd: repoRoot, encoding: 'utf8', ...options }).trim();

const say = message => console.log(message);

function parseArguments(argv) {
    const version = argv.find(argument => !argument.startsWith('-'));
    if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error('usage: cut-release.cjs <x.y.z> '
            + '[--dry-run] [--no-push] [--publish-only] [--print-notes]');
    }
    return {
        version,
        dryRun: argv.includes('--dry-run'),
        push: !argv.includes('--no-push'),
        // Publishing is the one step that needs a token, so it is the one that
        // gets skipped when there isn't one — and then the tag exists and a
        // rerun refuses. This finishes the job without redoing any of it.
        publishOnly: argv.includes('--publish-only'),
        // The changelog section, on stdout and nothing else. This is what CI
        // reads to write the release notes, so the notes and the changelog are
        // the same text rather than two texts that agree for now.
        printNotes: argv.includes('--print-notes')
    };
}

/** Today, as the changelog writes it. */
const today = () => new Date().toISOString().slice(0, 10);

/**
 * The changelog file for a version, which is also the release body.
 *
 * Taken from the file rather than written twice, so the release notes and the
 * changelog cannot disagree about what shipped. Each release has its own file
 * under `changelog/`; its title line is dropped (GitHub shows the tag as the
 * title) and its repository links are pinned to the tag, since a release body
 * has no folder for `../docs/…` to be relative to.
 */
function changelogSection(version) {
    const file = path.join(repoRoot, 'changelog', `${version}.md`);
    if (!fs.existsSync(file)) throw new Error(`changelog/${version}.md does not exist`);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const body = (lines[0].startsWith('# ') ? lines.slice(1) : lines).join('\n').trim();
    return body.replace(/\]\(\.\.\//g, `](https://github.com/${REPO}/blob/v${version}/`);
}

/** Every place the version is written down, rolled together. */
function rollVersionSurfaces(version, testCount) {
    const edits = [];
    const edit = (file, from, to) => {
        const full = path.join(repoRoot, file);
        const before = fs.readFileSync(full, 'utf8');
        const after = before.replace(from, to);
        if (after !== before) {
            fs.writeFileSync(full, after);
            edits.push(file);
        }
    };

    /*
     * The changelog title is what marks a version as shipped — in both
     * changelogs, and in both indexes.
     *
     * Only the root one was rolled once, so the editor changelog kept saying
     * the version was unreleased for a month after 0.96.0 shipped and had a
     * release's worth of entries filed under it. The detailed changelog is the
     * one people read to find out what changed; it is the worse of the two to
     * leave lying.
     */
    for (const dir of ['changelog', 'editor/changelog']) {
        edit(`${dir}/${version}.md`, `# RPG Reactor ${version} (in development)`,
            `# RPG Reactor ${version} - ${today()}`);
    }
    for (const file of ['CHANGELOG.md', 'editor/CHANGELOG.md']) {
        edit(file, `(changelog/${version}.md) (in development)`, `(changelog/${version}.md) - ${today()}`);
    }

    // The README names the newest tag and the verified test count.
    edit('README.md',
        /The (?:current development version is [\d.]+ and is not published yet; the )?latest tagged source release is \[[\d.]+\]\(https:\/\/github\.com\/[^)]+\)\./,
        `The latest tagged source release is [${version}]`
        + `(https://github.com/${REPO}/releases/tag/v${version}).`);
    edit('README.md', /validation completed with \*\*\d+ passing tests/,
        `validation completed with **${testCount} passing tests`);

    // package.json carries the version the editor reports.
    edit('editor/package.json', /"version":\s*"[\d.]+"/, `"version": "${version}"`);
    return edits;
}

/**
 * Create the GitHub release, with the changelog section as its body.
 *
 * The token goes to curl on stdin rather than in an argument. Arguments are
 * readable by every process on the machine for as long as the command runs —
 * `ps` shows them — and a token in a release script is the kind of thing that
 * ends up in a screen recording. Nothing is written to disk either way.
 */
function publish(version, tag, body, token) {
    const payload = JSON.stringify({
        tag_name: tag, name: `RPG Reactor ${version}`, body, draft: false, prerelease: false
    });
    const response = execFileSync('curl', ['-sS', '-X', 'POST', '--config', '-',
        '-H', 'Accept: application/vnd.github+json',
        `https://api.github.com/repos/${REPO}/releases`,
        '-d', payload], {
        cwd: repoRoot, encoding: 'utf8',
        input: `header = "Authorization: Bearer ${token}"\n`
    });
    const parsed = JSON.parse(response);
    if (!parsed.html_url) throw new Error(`GitHub refused the release: ${parsed.message}`);
    say(`\nPublished ${parsed.html_url}`);
    say('Its body is the changelog section for this version, so the release '
        + 'notes and the changelog cannot disagree.');
}

function main() {
    const options = parseArguments(process.argv.slice(2));
    const { version } = options;
    const tag = `v${version}`;

    if (options.printNotes) {
        process.stdout.write(changelogSection(version));
        return;
    }

    say(`Cutting ${tag}${options.dryRun ? ' (dry run)' : ''}\n`);

    // A dirty tree means the release would carry work nobody reviewed.
    // Finishing an already-tagged release: no tests, no edits, no push. The
    // tag is expected to exist here, and its absence is the error.
    if (options.publishOnly) {
        if (!run('git', ['tag', '-l', tag])) throw new Error(`${tag} does not exist`);
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
        if (!token) throw new Error('--publish-only needs GITHUB_TOKEN or GH_TOKEN');
        publish(version, tag, changelogSection(version), token);
        return;
    }

    const dirty = run('git', ['status', '--porcelain']);
    if (dirty) throw new Error(`working tree is not clean:\n${dirty}`);
    if (run('git', ['tag', '-l', tag])) throw new Error(`${tag} already exists`);

    say('Running the editor test suite...');
    const testOutput = execFileSync('node', ['--test'], {
        cwd: path.join(repoRoot, 'editor'), encoding: 'utf8'
    });
    const passed = Number((testOutput.match(/^# pass (\d+)$/m)
        || testOutput.match(/pass (\d+)/) || [])[1] || 0);
    const failed = Number((testOutput.match(/^# fail (\d+)$/m)
        || testOutput.match(/fail (\d+)/) || [])[1] || 0);
    if (failed > 0) throw new Error(`${failed} tests failed; not releasing`);
    say(`  ${passed} passing\n`);

    const edits = rollVersionSurfaces(version, passed);
    say(edits.length ? `Rolled: ${edits.join(', ')}\n` : 'Version surfaces already current\n');

    const body = changelogSection(version);
    say(`Release notes: ${body.split('\n').length} lines from the changelog\n`);

    if (options.dryRun) {
        say('Dry run: nothing committed, tagged, pushed or published.');
        if (edits.length) {
            say('Reverting the version-surface edits so the tree stays clean.');
            run('git', ['checkout', '--', ...edits]);
        }
        return;
    }

    if (edits.length) {
        run('git', ['add', ...edits]);
        run('git', ['commit', '-m', `Release ${version}`]);
        say(`Committed: Release ${version}`);
    }
    run('git', ['tag', '-a', tag, '-m', `RPG Reactor ${version}`]);
    say(`Tagged ${tag}`);

    if (!options.push) {
        say('\n--no-push: stopping before the push. Run:');
        say(`  git push origin main --follow-tags`);
        return;
    }
    /*
     * The push inherits the terminal.
     *
     * An HTTPS remote with no credential helper asks for a username and a
     * password, and that exchange has to reach the person running this. With
     * the output captured the prompt is swallowed and the release looks like it
     * hung — so this one command is handed the terminal rather than read.
     */
    say('Pushing branch and tag (git will ask for your GitHub username and token)...');
    execFileSync('git', ['push', 'origin', 'HEAD', '--follow-tags'],
        { cwd: repoRoot, stdio: 'inherit' });
    say('Pushed branch and tag');

    // A tag is not a release. This is the step whose absence looks exactly
    // like the push having failed.
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
        /*
         * Not an error, and no longer a missing step.
         *
         * Pushing the tag starts `publish-release.yml`, which builds the notes
         * from this same changelog section and creates the release with the
         * token GitHub hands every workflow run. Publishing from here is the
         * shortcut, not the mechanism — which is what stops a release from
         * quietly not existing because nobody had a token to hand.
         */
        say(`\nNo GITHUB_TOKEN set, so the release is being made by CI instead.`);
        say(`Watch it at https://github.com/${REPO}/actions`);
        say(`It will appear at https://github.com/${REPO}/releases/tag/${tag}`);
        return;
    }
    publish(version, tag, body, token);
}

try {
    main();
} catch (error) {
    console.error(`\nnot released: ${error.message}`);
    process.exit(1);
}
