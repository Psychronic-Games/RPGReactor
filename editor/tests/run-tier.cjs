#!/usr/bin/env node
/**
 * Runs one tier of the Node suite: `npm run test:fast` while working, `npm run test:heavy` for the exhaustive
 * sweeps. `npm test` stays the whole suite and is what CI and cut-release.cjs run, so nothing here drops coverage.
 *
 * The heavy tier is the list in test-tiers.json: files whose tests build every preset, sweep every body or
 * simulate cloth through every clip. A new test file is fast until it is listed. Refresh the list with
 * `node tests/run-tier.cjs all --measure=<file.json> --heavy-seconds=20`, which writes each file's seconds to
 * <file.json>, and copy the files at or over the line into test-tiers.json.
 *
 * `npm run test:changed` runs what you changed reaches: a test file is skipped when it passed before on exactly this code,
 * fingerprinted through everything it loads (helpers/test-graph.cjs). `npm run test:whole` also runs the tests whose
 * inputs a fingerprint can't see. Every pass is kept as it happens, so an interrupted run picks up where it stopped.
 *
 * Usage: node tests/run-tier.cjs fast|heavy|all|changed [--list] [--concurrency=2] [--measure=<file.json>] [--peaks=<file.jsonl>] [-- node test flags]
 */
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const Graph = require('./helpers/test-graph.cjs');

const here = __dirname, editor = path.dirname(here);

function allTestFiles() {
    return fs.readdirSync(here).filter(name => name.endsWith('.test.cjs')).sort();
}

function heavyList() {
    return JSON.parse(fs.readFileSync(path.join(here, 'test-tiers.json'), 'utf8')).heavy;
}

/** The files of a tier, as paths from editor/. Listing a file that is gone is an error, not a quiet skip. */
function tier(name, files = allTestFiles(), heavy = heavyList()) {
    const known = new Set(files), listed = new Set(heavy);
    for (const file of heavy) if (!known.has(file)) throw new Error('test-tiers.json lists a missing test: ' + file);
    const chosen = name === 'all' ? files : files.filter(file => listed.has(file) === (name === 'heavy'));
    return chosen.map(file => 'tests/' + file);
}

const graphOf = () => { const nodes = Graph.buildGraph(); return { nodes, salt: process.version + fs.readFileSync(path.join(here, 'helpers', 'small-pictures.cjs'), 'utf8') }; };

/** Every test reaching `changed` (paths from the repository root), read from what the files name. */
function reaching(changed) {
    const { nodes, salt } = graphOf(), names = new Set(changed.filter(file => /\.(c|m)?js$/.test(file) && !file.endsWith('.test.cjs')).map(Graph.baseOf));
    const direct = new Set(changed.filter(file => file.endsWith('.test.cjs')).map(file => path.basename(file)));
    return allTestFiles().filter(file => direct.has(file) || Graph.describe(nodes, file, salt).reached.some(name => names.has(name)));
}

/** Where passes are kept: outside the repository and /tmp, per checkout. */
function storeDir() {
    const dir = path.join(os.homedir(), '.cache', 'rpg-reactor-tests', crypto.createHash('sha1').update(editor).digest('hex').slice(0, 12));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/** Passes as { file: fingerprint }, taking in whatever the last run recorded before it ended, however it ended. */
function loadPasses(dir = storeDir()) {
    const store = path.join(dir, 'passed.json'), journal = path.join(dir, 'run.jsonl'), plan = path.join(dir, 'run.json');
    const passes = fs.existsSync(store) ? JSON.parse(fs.readFileSync(store, 'utf8')) : {};
    if (fs.existsSync(journal) && fs.existsSync(plan)) {
        const fingerprints = JSON.parse(fs.readFileSync(plan, 'utf8'));
        for (const line of fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean)) {
            let row; try { row = JSON.parse(line); } catch (_) { continue; }
            if (row.code === 0 && fingerprints[row.file]) passes[row.file] = fingerprints[row.file]; else delete passes[row.file];
        }
        fs.writeFileSync(store, JSON.stringify(passes));
        fs.renameSync(journal, path.join(dir, 'last-run.jsonl')); fs.rmSync(plan);
    }
    return passes;
}

/**
 * The tests a run still owes: everything whose code changed since it last passed. `whole` adds the tests with inputs
 * the fingerprint can't see (they read folders or project data), which `changed` leaves to a whole run.
 */
function owed(whole, files = allTestFiles(), passes = loadPasses(), { nodes, salt } = graphOf()) {
    const facts = files.map(file => Graph.describe(nodes, file, salt));
    return { facts, run: facts.filter(fact => passes[fact.file] !== fact.fingerprint || (whole && fact.open)) };
}

function main(argv) {
    const split = argv.indexOf('--'), own = split < 0 ? argv : argv.slice(0, split), passed = split < 0 ? [] : argv.slice(split + 1);
    const name = own.find(arg => !arg.startsWith('--'));
    if (!['fast', 'heavy', 'all', 'changed', 'whole'].includes(name)) {
        console.error('Usage: node tests/run-tier.cjs fast|heavy|all|changed|whole [--list] [--only=<pattern>] [--limit=<n>] [--concurrency=2] [--measure=<file.json>] [-- node test flags]');
        return 2;
    }
    const option = key => own.find(arg => arg.startsWith('--' + key + '='))?.slice(key.length + 3);
    const dir = storeDir(), plan = name === 'changed' || name === 'whole' ? owed(name === 'whole') : null;
    // --only=<pattern> narrows a run; --limit=<n> takes a slice, so a long list can be worked off in small bites.
    const only = option('only') && new RegExp(option('only')), limit = +option('limit') || Infinity;
    const files = (plan ? plan.run.map(fact => 'tests/' + fact.file) : tier(name)).filter(file => !only || only.test(file)).slice(0, limit);
    if (plan) console.log(`${files.length} of ${plan.facts.length} test files owed; the rest already passed on exactly this code.`);
    if (!files.length) return 0;
    if (own.includes('--list')) { console.log(files.join('\n')); return 0; }
    // Ten workers at most, under a gigabyte each: a whole run takes minutes, and `npm run test:all` runs it at the lowest priority.
    const flags = ['--require=' + path.join(here, 'helpers', 'small-pictures.cjs'), '--test', '--test-concurrency=' + (option('concurrency') || Math.min(10, Math.max(2, os.availableParallelism() >> 1)))];
    const measure = option('measure');
    if (measure) flags.push('--test-reporter=' + path.join(here, 'helpers', 'file-times-reporter.mjs'), '--test-reporter-destination=' + path.resolve(measure), '--test-reporter=spec', '--test-reporter-destination=stdout');
    // Each test process reports as it ends, so what passed is kept even if this run never finishes.
    const facts = plan ? plan.facts : (({ nodes, salt }) => allTestFiles().map(file => Graph.describe(nodes, file, salt)))(graphOf());
    fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(Object.fromEntries(facts.map(fact => [fact.file, fact.fingerprint]))));
    const env = { ...process.env, RR_TEST_PEAKS: path.join(dir, 'run.jsonl') };
    flags.unshift('--require=' + path.join(here, 'helpers', 'peak-probe.cjs'));
    const run = spawnSync(process.execPath, [...flags, ...passed, ...files], { cwd: editor, stdio: 'inherit', env });
    if (run.error) throw run.error;
    loadPasses(dir);
    return run.status === null ? 1 : run.status;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { allTestFiles, heavyList, tier, reaching, owed };
