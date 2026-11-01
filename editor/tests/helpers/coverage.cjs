'use strict';
/**
 * How much of a sweep to walk. Everywhere, every value is tested, paired instead of multiplied: forty-eight full vehicle
 * builds to check one rule was most of what made the suite slow, and repeated the same code path. The same tests run
 * on a working machine and on CI, so what passes here passes there. RR_TEST_EXHAUSTIVE=1 walks every combination.
 */
const exhaustive = !!process.env.RR_TEST_EXHAUSTIVE;

/** Rows across `lists`: every combination, or as few rows as show every value of every list. Starts with each list's first. */
function cover(...lists) {
    if (exhaustive) return lists.reduce((rows, list) => rows.flatMap(row => list.map(value => [...row, value])), [[]]);
    const count = Math.max(...lists.map(list => list.length));
    return Array.from({ length: count }, (_, i) => lists.map(list => list[i % list.length]));
}

/** Every `every`-th item from `offset`, or all of them. Several tests with different offsets share out one list. */
function sample(list, every, offset = 0) {
    return exhaustive ? [...list] : list.filter((_, i) => i % every === offset % every);
}

module.exports = { exhaustive, cover, sample };
