/**
 * `src/utils/ParamNames.js` as source, for tests that evaluate an editor class
 * in a fresh vm context.
 *
 * Every database surface that shows a parameter name now asks
 * `globalThis.rrParamNames()` for it, so a sandbox that does not load this file
 * fails with "rrParamNames is not a function" the moment a row is rendered. The
 * util reads the open project's `terms.params` through `window.reactor`, which
 * no sandbox has, so it falls back to the English defaults and the assertions
 * that were written against those defaults still hold.
 */
const fs = require('node:fs');
const path = require('node:path');

const PARAM_NAMES_PATH = path.resolve(__dirname, '..', '..', 'src', 'utils', 'ParamNames.js');

/** The util's source, to prepend to whatever a vm context is about to run. */
function paramNamesSource() {
    return fs.readFileSync(PARAM_NAMES_PATH, 'utf8');
}

/** Install the util's globals into an existing vm context object. */
function installParamNames(context) {
    const vm = require('node:vm');
    vm.runInNewContext(paramNamesSource(), context);
    return context;
}

module.exports = { PARAM_NAMES_PATH, paramNamesSource, installParamNames };
