'use strict';
// Columns of near the same height on the Database pages (src/utils/DatabaseSections.js: dealColumns and the
// functions under it). The heights below are the cards of the Demo's pages as the editor drew them at the
// Database window's default size on 2026-11-11, before the cards were dealt.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../src/utils/DatabaseSections.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

/** The cards of each column, by name, as the page would show them: its own cards first, then the ones dealt to it. */
function columnsOf(names, home, deal, columns) {
    return Array.from({ length: columns }, (unused, at) => names.filter((name, index) => deal[index] === at)
        .sort((a, b) => (home[names.indexOf(a)] === at ? 0 : 1) - (home[names.indexOf(b)] === at ? 0 : 1)));
}

/** Between any two columns, no card of the taller one that may move is much shorter than what they differ by: columns differ by at most 1.2 such cards and the slack. */
function settled(heights, result, gap, fixed = []) {
    const lead = heights.findIndex(height => height > 0);
    for (let from = 0; from < result.heights.length; from++) {
        for (let to = 0; to < result.heights.length; to++) {
            const apart = result.heights[from] - result.heights[to];
            if (apart <= 0) continue;
            heights.forEach((height, index) => {
                if (result.deal[index] !== from || index === lead || fixed[index] !== undefined || !(height > 0)) return;
                assert.ok((height + gap) * 1.2 + 24 > apart, `card ${index} (${height}) could still move from column ${from} (${result.heights[from]}) to ${to} (${result.heights[to]})`);
            });
        }
    }
}

test('column heights count the cards and the gaps between them, and skip a card that is not shown', () => {
    assert.deepEqual(S.columnHeights([100, 200, 0, 50], [0, 0, 1, 1], 2, 16), [316, 50]);
    assert.deepEqual(S.columnHeights([100], [0], 3, 16), [100, 0, 0]);
});

test('Actors: the last card of the long column goes to the foot of the short one', () => {
    const names = ['general', 'traits', 'combat', 'note', 'images', 'equipment'], home = [0, 0, 0, 0, 1, 1];
    const heights = [316, 171, 461, 158, 383, 356];
    assert.equal(S.columnHeights(heights, home, 2, 16)[0] - S.columnHeights(heights, home, 2, 16)[1], 399, 'as the page listed them');
    const result = S.dealColumns(heights, 2, { gap: 16, home });
    assert.deepEqual(columnsOf(names, home, result.deal, 2), [['general', 'traits', 'combat'], ['images', 'equipment', 'note']]);
    assert.ok(result.spread <= 158, `columns ${result.heights} differ by no more than the smallest card`);
    settled(heights, result, 16);
});

test('Items, Classes, Vehicles and System 1 come out within about the smallest card that could move', () => {
    const pages = {
        items: { heights: [427, 143, 213, 235, 171, 522], home: [0, 0, 1, 1, 1, 1], gap: 16, columns: 2, before: 603 },
        classes: { heights: [229, 287, 405, 305, 384, 348, 143], home: [0, 0, 0, 1, 1, 1, 1], gap: 26, columns: 2, before: 285 },
        vehicles: { heights: [187, 269, 197, 120, 80, 163, 122, 80], home: [0, 0, 0, 0, 1, 1, 1, 1], gap: 10, columns: 2, before: 328 },
        system1: { heights: [104, 417, 241, 199, 429, 674, 259, 121, 477, 227, 752], home: [0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2], gap: 26, columns: 3, before: 1059 }
    };
    for (const [page, { heights, home, gap, columns, before }] of Object.entries(pages)) {
        assert.equal(S.dealColumns(heights, columns, { gap, home, slack: 1e9 }).spread, before, `${page}: as listed (no move is worth an endless slack)`);
        const result = S.dealColumns(heights, columns, { gap, home });
        assert.ok(result.spread < before, `${page}: ${result.spread} from ${before}`);
        settled(heights, result, gap);
        assert.equal(result.deal[0], 0, `${page}: the first card stays where the page starts`);
        assert.equal(result.deal.length, heights.length);
    }
});

test('a page that is even already is left as its code listed it', () => {
    const heights = [379, 406, 143, 180, 830], home = [0, 0, 0, 1, 1];
    assert.deepEqual(S.dealColumns(heights, 2, { gap: 16, home }).deal, home, 'Weapons: 960 beside 1026');
    // Armors: 950 beside 765. Note (143) is the one card that could move, and would leave the other column 133 taller: not worth a move.
    const armors = [369, 406, 143, 155, 197, 381], listed = [0, 0, 0, 1, 1, 1];
    const result = S.dealColumns(armors, 2, { gap: 16, home: listed });
    assert.deepEqual(result.deal, listed);
    assert.equal(result.spread, 185);
    settled(armors, result, 16);
});

test('a third column takes cards from both, and two columns take the cards of a third', () => {
    const heights = [316, 171, 461, 158, 383, 356], home = [0, 0, 0, 0, 1, 1];
    const three = S.dealColumns(heights, 3, { gap: 16, home });
    assert.ok(three.heights.every(height => height > 0), 'no column is left empty');
    settled(heights, three, 16);
    const two = S.dealColumns([300, 300, 300, 300, 300, 300], 2, { gap: 0, home: [0, 0, 1, 1, 2, 2] });
    assert.deepEqual(two.heights, [900, 900]);
    assert.ok(two.deal.every(column => column < 2));
});

test('one column holds everything, and a card that is not shown takes no part', () => {
    assert.deepEqual(S.dealColumns([100, 200, 300], 1, { home: [0, 1, 1] }).deal, [0, 0, 0]);
    const result = S.dealColumns([400, 0, 100, 100, 100, 100], 2, { home: [0, 0, 0, 0, 0, 0] });
    assert.equal(result.deal[1], 0, 'the hidden card stays');
    assert.deepEqual(result.heights, [400, 400]);
});

test('the card in use keeps its column, whatever that costs', () => {
    const heights = [316, 171, 461, 158, 383, 356], home = [0, 0, 0, 0, 1, 1];
    const fixed = [undefined, undefined, undefined, 0, undefined, undefined];
    const result = S.dealColumns(heights, 2, { gap: 16, home, fixed });
    assert.equal(result.deal[3], 0, 'Note is being typed in: it stays in the first column');
    assert.ok(result.spread < 399, 'another card moved in its place');
    settled(heights, result, 16, fixed);
});

test('the deal in use is kept while no card of it could move to even it, and given up when one could', () => {
    const home = [0, 0, 0, 0, 1, 1], keep = [0, 0, 0, 1, 1, 1];
    // Another record: Traits has grown by three rows. The fresh deal would move other cards; the one in use is still close.
    const grown = [316, 261, 461, 158, 383, 356];
    assert.deepEqual(S.dealColumns(grown, 2, { gap: 16, home, keep }).deal, keep);
    // A record with a Traits list so long that the old deal is far off.
    const long = [316, 900, 461, 158, 383, 356];
    const result = S.dealColumns(long, 2, { gap: 16, home, keep });
    assert.notDeepEqual(result.deal, keep);
    settled(long, result, 16);
    // Combat folded while Note is typed in: the columns differ by 374, no single card can close that, and the two
    // cards that could by changing places stay where they are. Drawn anew, the page is dealt afresh.
    const folded = [316, 171, 36, 158, 383, 356], typing = [undefined, undefined, undefined, 1];
    assert.deepEqual(S.dealColumns(folded, 2, { gap: 16, home, keep, fixed: typing }).deal, keep);
    assert.deepEqual(S.dealColumns(folded, 2, { gap: 16, home, fixed: typing }).deal, [0, 1, 0, 1, 1, 0], 'Traits and Equipment changed places');
    // Combat folded with nothing in use: Note goes back up the first column, as the page listed it.
    assert.deepEqual(S.dealColumns(folded, 2, { gap: 16, home, keep }).deal, home);
    // A deal left from a moment when the page was measured wrong: three cards away from home, and a fresh deal is closer with one.
    const stale = [0, 1, 1, 0, 1, 0], heights = [316, 171, 461, 158, 383, 356];
    assert.deepEqual(S.dealColumns(heights, 2, { gap: 16, home, keep: stale }).deal, keep);
    // A deal for another number of cards says nothing.
    assert.deepEqual(S.dealColumns(grown, 2, { gap: 16, home, keep: [0, 1] }).deal, S.dealColumns(grown, 2, { gap: 16, home }).deal);
});

test('Controls: four cards in a line stand in three columns, and in two as the rows had them', () => {
    const heights = [585, 558, 1108, 1124];
    assert.deepEqual(S.flowColumns(heights, 4, 16), [0, 1, 2, 3]);
    assert.deepEqual(S.flowColumns(heights, 3, 16), [0, 0, 1, 2]);
    const four = S.dealColumns(heights, 4, { gap: 16 }), three = S.dealColumns(heights, 3, { gap: 16 }), two = S.dealColumns(heights, 2, { gap: 16 });
    assert.equal(four.spread, 566);
    assert.deepEqual(three.deal, [0, 0, 1, 2]);
    assert.equal(three.spread, 51);
    assert.deepEqual(two.deal, [0, 1, 0, 1], 'Keyboard over Action, Gamepad over Tactical: two cards changed places');
    assert.equal(two.spread, 11);
    const tallest = { 4: Math.max(...four.heights), 3: Math.max(...three.heights), 2: Math.max(...two.heights) };
    assert.equal(S.fewestColumns(tallest), 3, 'three columns are 3% taller than four and even; two are half as tall again');
    assert.equal(S.fewestColumns(tallest, 4), 4, 'the count in use is kept while it stands as short');
    assert.equal(S.fewestColumns({ 3: 700, 2: 980 }), 3, 'a third column that shortens the page is used');
    assert.equal(S.fewestColumns({ 3: 950, 2: 980 }, 3), 3);
    assert.equal(S.fewestColumns({ 3: 950, 2: 980 }), 2, 'one that does not is not');
    assert.equal(S.fewestColumns({}), 1);
});

test('cards in a line are cut where the tallest run is shortest, never leaving a column empty', () => {
    assert.deepEqual(S.flowColumns([100, 100, 100, 100], 2, 0), [0, 0, 1, 1]);
    assert.deepEqual(S.flowColumns([500, 100, 100, 100], 2, 0), [0, 1, 1, 1]);
    assert.deepEqual(S.flowColumns([100, 100], 3, 0), [0, 1]);
    assert.deepEqual(S.flowColumns([100, 0, 100, 100], 3, 0), [0, 0, 1, 2], 'a hidden card stays with the one before it');
    assert.deepEqual(S.flowColumns([], 3, 0), []);
});

test('the shell deals the pages of columns by one mechanism, and the style sheet follows its count', () => {
    for (const set of ['.database-item-columns', '.database-class-columns', '.system1-columns-grid', '.system2-columns-grid', '.rr-controls']) {
        assert.ok(S.COLUMN_SETS.split(', ').includes(set), set);
    }
    assert.ok(S.FLAT_SETS.split(', ').includes('.rr-controls'), 'Controls lists its cards in one line');
    const source = read('src/utils/DatabaseSections.js'), css = read('css/styles.css');
    // Dealt when a page is drawn (and for a set first met later), on a fold, and after a resize or a late picture: not on every size change.
    assert.match(source, /layout\(\);\s*if \(settings\.sync\) drawn = now\(\);\s*balance\(\{ fresh: !settings\.sync \}\);\s*return count;/);
    assert.match(source, /layout\(\);\s*balance\(\{ hold: section, top: before \}\);\s*return true;/);
    assert.match(source, /if \(width !== null && wide !== width\) \{ if \(now\(\) - drawn < 1500\) balance\(\); else balanceSoon\(150\); \}/);
    assert.match(css, /\[data-rr-columns\] \{ grid-template-columns: repeat\(var\(--rr-db-columns, 2\), minmax\(0, 1fr\)\) !important; \}/);
    assert.match(css, /\.rr-db-column-empty \{ display: none !important; \}/);
    assert.match(css, /\.rr-db-column-made \{ display: flex; flex-direction: column; gap: 16px; min-width: 0; \}/);
});
