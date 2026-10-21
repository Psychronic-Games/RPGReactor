'use strict';
// Thrall's edits to VX's map scripts: Game_Player#change_move, and the game's events drawing into cached
// bitmaps (Cache.character(...).blt(...), Cache.head, Rect.new), as the "Cache Graphics" common event does.
const bitmap = (template) => [template, 'vxBitmap'];

module.exports = {
    key: 'thrallMap', detect: /def change_move\(fix, speed, dir = nil\)/, plugin: 'RR_ThrallMap',
    members: { 'character.change_move': ['$.rrChangeMove?.(%*)', 'any'] },
    route: { change_move: 'this.rrChangeMove?.(%*)' },
    modules: {
        Cache: {
            character: bitmap('ImageManager.loadCharacter(%0)'), face: bitmap('ImageManager.loadFace(%0)'), picture: bitmap('ImageManager.loadPicture(%0)'),
            parallax: bitmap('ImageManager.loadParallax(%0)'), system: bitmap('ImageManager.loadSystem(%0)'), battler: bitmap('ImageManager.loadEnemy(%0)'),
            animation: bitmap('ImageManager.loadAnimation(%0)'), head: bitmap('ImageManager.loadBitmap("img/characters/Heads/", %0)'),
            rooms: bitmap('ImageManager.loadBitmap("img/Rooms/", %0)'), overlay: bitmap('ImageManager.loadBitmap("img/overlays/", %0)'),
            clear: 'ImageManager.rrThrallCacheClear?.()'
        },
        Rect: { new: ['new Rectangle(%*)', 'rect'] }
    },
    objects: {
        vxBitmap: {
            blt: '$.rrVxBlt?.(%*)', clear_rect: '$.rrVxClearRect?.(%*)', clear: '$.rrVxClear?.()',
            width: '$.width', height: '$.height', rect: 'new Rectangle(0, 0, $.width, $.height)'
        },
        rect: { x: '$.x', y: '$.y', width: '$.width', height: '$.height' }
    }
};
