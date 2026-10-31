'use strict';
// Exercise the same offline library as editor/game pages. r187's deprecated
// require('three') shim depends on require(ESM), unavailable on early Node 22.
require('../../../runtime/libs/three.js');
module.exports=globalThis.THREE;
