'use strict';
// Smooth Cursor (Maker Systems): every list's cursor glides; it has no script calls.

module.exports = {
    key: 'msSmoothCursor', detect: /module SmoothCursor\b[\s\S]{0,400}?DELAY_LEVEL|def ms_smooth_cursor_update\b/, plugin: 'RR_SmoothCursor'
};
