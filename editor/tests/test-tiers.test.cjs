'use strict';
// The fast and heavy tiers split the suite without losing a test, and `npm test` stays the whole suite.
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const { allTestFiles, heavyList, tier, reaching, owed } = require('./run-tier.cjs');
const pkg = require(path.join(__dirname, '..', 'package.json'));

test('every test file is in exactly one tier, and the heavy list holds real files once each', () => {
    const files = allTestFiles(), fast = tier('fast'), heavy = tier('heavy');
    assert.equal(fast.length + heavy.length, files.length);
    assert.deepEqual([...fast, ...heavy].sort(), files.map(file => 'tests/' + file).sort());
    assert.equal(new Set(heavyList()).size, heavyList().length, 'listed once');
    assert.deepEqual(tier('all'), files.map(file => 'tests/' + file));
});

test('a listed file that no longer exists stops the run instead of going untested', () => {
    assert.throws(() => tier('fast', ['a.test.cjs'], ['gone.test.cjs']), /missing test: gone\.test\.cjs/);
});

test('this file stays in the fast tier, and npm test stays the whole suite for CI and releases', () => {
    assert.ok(tier('fast').includes('tests/test-tiers.test.cjs'));
    assert.equal(pkg.scripts.test, 'node --require=./tests/helpers/small-pictures.cjs --test --test-concurrency=8');
    assert.match(pkg.scripts['test:fast'], /run-tier\.cjs fast/);
    assert.match(pkg.scripts['test:heavy'], /run-tier\.cjs heavy/);
});

test('a change reaches the tests of what loads it, and a test edited is its own run', () => {
    // FlightCraft.js is named by VehicleProp.js, not by the catalog test: the catalog test still has to run.
    const picked = reaching(['editor/src/forge/Props/FlightCraft.js']);
    assert.ok(picked.includes('prop-catalog.test.cjs'));
    assert.ok(!picked.includes('docs-budget.test.cjs'), 'and an unrelated test stays out');
    assert.ok(reaching(['editor/tests/docs-budget.test.cjs']).includes('docs-budget.test.cjs'));
});

test('a file that passed on this code is owed nothing, a changed one is, and an open input only a whole run reruns', () => {
    const file = 'docs-budget.test.cjs', Graph = require('./helpers/test-graph.cjs'), built = { nodes: Graph.buildGraph(), salt: 's' };
    const fact = Graph.describe(built.nodes, file, 's');
    assert.equal(owed(false, [file], { [file]: fact.fingerprint }, built).run.length, 0);
    assert.equal(owed(false, [file], { [file]: 'older' }, built).run.length, 1);
    assert.equal(owed(false, [file], {}, built).run.length, 1, 'never passed');
    assert.equal(fact.open, true, 'it reads the docs folder');
    assert.equal(owed(true, [file], { [file]: fact.fingerprint }, built).run.length, 1);
});

test('editing a source file changes the fingerprint of the tests that load it, and only those', () => {
    const Graph = require('./helpers/test-graph.cjs'), nodes = Graph.buildGraph();
    const reached = Graph.describe(nodes, 'prop-catalog.test.cjs', 's'), apart = Graph.describe(nodes, 'docs-budget.test.cjs', 's');
    assert.ok(reached.reached.includes('FlightCraft'), 'through VehicleProp, which the test never names');
    nodes.get('FlightCraft').hash = 'edited';
    assert.notEqual(Graph.describe(nodes, 'prop-catalog.test.cjs', 's').fingerprint, reached.fingerprint);
    assert.equal(Graph.describe(nodes, 'docs-budget.test.cjs', 's').fingerprint, apart.fingerprint);
});

test('a working run still shows every value of every list; a full run walks the whole product', () => {
    const script = "const {cover,sample}=require('./tests/helpers/coverage.cjs');console.log(JSON.stringify([cover([1,2,3,4],['a','b'],[true,false]).length,cover([1,2,3,4],['a','b']).map(r=>r.join('')),sample([1,2,3,4,5,6],3,1)]))";
    const run = env => JSON.parse(require('node:child_process').execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), env: { ...process.env, RR_TEST_EXHAUSTIVE: '', ...env }, encoding: 'utf8' }));
    assert.deepEqual(run({}), [4, ['1a', '2b', '3a', '4b'], [2, 5]]);
    assert.deepEqual(run({ CI: 'true' }), run({}), 'CI runs what a working machine runs');
    const full = run({ RR_TEST_EXHAUSTIVE: '1' });
    assert.equal(full[0], 16, 'every combination on request');
    assert.equal(full[1].length, 8);
    assert.deepEqual(full[2], [1, 2, 3, 4, 5, 6]);
});
