'use strict';
// TheoAllen's Window Background: pictures behind the windows it lists. No calls.
module.exports = { key: 'theoWindowBackground', detect: /module Theo\b[\s\S]*WindowList\s*=\s*\{[\s\S]*@back_img\s*=\s*Sprite\.new/, plugin: 'RR_TheoWindowBackground' };
