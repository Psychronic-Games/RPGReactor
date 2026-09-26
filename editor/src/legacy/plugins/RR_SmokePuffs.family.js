'use strict';
// DirtTrail: chips behind dashing characters; an event is flagged with smoke_trail.
module.exports = {
    key: 'dirtTrail', detect: /module DirtTrail\b[\s\S]*class DirtEmitter\b/, plugin: 'RR_SmokePuffs',
    assign: { smoke_trail: 'this._rrSmokeTrail = %v' },
    setters: { 'character.smoke_trail': '((c) => c && (c._rrSmokeTrail = %v))($)' },
    members: { 'character.smoke_trail': ['!!$?._rrSmokeTrail', 'bool'] }
};
