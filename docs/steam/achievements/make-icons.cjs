// Achievement icons for Steamworks (256 x 256 PNG): a gold line glyph on the editor's deep blue, and a grey copy for "not yet".
//   node make-icons.cjs   (needs rsvg-convert and ImageMagick)
const fs = require('fs'), { execFileSync } = require('child_process');
const G = {
    NEW_PROJECT: '<path d="M6 2.5h8l4.5 4.5v14.5h-12.5z"/><path d="M14 2.5V7h4.5"/><path d="M12.2 11v7M8.7 14.5h7"/>',
    FIRST_PLAYTEST: '<path d="M7.5 4.5v15l12-7.5z"/>',
    MAP_3D: '<path d="M12 2.8l8.5 4.6v9.2L12 21.2l-8.5-4.6V7.4z"/><path d="M3.5 7.4L12 12l8.5-4.6M12 12v9.2"/>',
    PROJECT_IMPORT: '<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5v11h13v-11"/><path d="M12 9v8M8.8 13.8L12 17l3.2-3.2"/>',
    FORGE_CHARACTER: '<circle cx="12" cy="7.2" r="3.7"/><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"/>',
    FORGE_PROP: '<path d="M5.5 21.5V2.5"/><path d="M5.5 3.5c3.5-1.8 6 1.8 9.5 0s5-.6 6.5.6v8.8c-1.5-1.2-3-1.8-6.5 0s-6-1.8-9.5 0"/>',
    FORGE_SOUND: '<path d="M10.5 5L6.5 9H3v6h3.5l4 4z"/><path d="M14.5 9c1.6 1.6 1.6 4.4 0 6"/><path d="M17.5 6c3.2 3.2 3.2 8.8 0 12"/>',
    BUILD_GAME: '<path d="M12 2.5c3.3 2.6 4.6 6.4 4 11l-1.8 3.5H9.8L8 13.5c-.6-4.6.7-8.4 4-11z"/><circle cx="12" cy="9" r="1.6"/><path d="M8.3 12.8L5 15.5l.6 3.5 3.6-2M15.7 12.8l3.3 2.7-.6 3.5-3.6-2M10.5 19.5L12 22l1.5-2.5"/>',
    WORKSHOP_SHARE: '<path d="M3.5 12.5L12 16.5l8.5-4M3.5 12.5V18.5L12 22.5l8.5-4v-6M12 16.5v6"/><path d="M12 11.5V2.5M8.6 5.9L12 2.5l3.4 3.4"/>',
    WORKSHOP_ADD: '<path d="M3.5 12.5L12 16.5l8.5-4M3.5 12.5V18.5L12 22.5l8.5-4v-6M12 16.5v6"/><path d="M12 2.5v9M8.6 8.1L12 11.5l3.4-3.4"/>',
    RUNTIME_INSTALL: '<path d="M3.5 7.3L12 2.8l8.5 4.5v9.4L12 21.2l-8.5-4.5z"/><path d="M13.2 6.5l-4 6.2h3.4l-1.4 4.8 4.2-6.3h-3.4z"/>',
    FIRST_EVENT: '<path d="M3.5 4h17v11.5H11l-5 4.5v-4.5H3.5z"/><path d="M12 7v4.2M12 13.2v.1"/>',
    BUILD_PIECE: '<path d="M3 5h18v14H3z"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19"/>',
    SHAPE_TERRAIN: '<path d="M2 20.5l6.5-11 4 6 3-4.5 6.5 9.5z"/><path d="M17 2.5v5.5M14.8 4.7L17 2.5l2.2 2.2"/>',
    PLACE_LIGHT: '<path d="M9.5 18h5M10.5 21.5h3"/><path d="M8.6 15a6.3 6.3 0 1 1 6.8 0c-.7.6-.9 1.4-.9 3h-5c0-1.6-.2-2.4-.9-3z"/>',
    MEDIA_SURFACE: '<path d="M2.5 4h19v12.5h-19z"/><path d="M8 21h8M12 16.5V21"/><path d="M10 7.3v5.9l5-2.95z"/>',
    BLUEPRINT: '<path d="M3.5 3.5h17v17h-17z"/><path d="M3.5 10h7.5v10.5M11 14h9.5M14.5 3.5V10"/>'
};
const svg = glyph => `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<defs><radialGradient id="bg" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#23306e"/><stop offset=".65" stop-color="#0c1440"/><stop offset="1" stop-color="#050a24"/></radialGradient>
<linearGradient id="gold" x1="40" y1="30" x2="216" y2="226" gradientUnits="userSpaceOnUse"><stop stop-color="#fff3a0"/><stop offset=".3" stop-color="#ffd529"/><stop offset=".75" stop-color="#f08a0c"/><stop offset="1" stop-color="#c25a08"/></linearGradient>
<linearGradient id="glyph" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#fff3a0"/><stop offset=".35" stop-color="#ffd529"/><stop offset=".8" stop-color="#f08a0c"/><stop offset="1" stop-color="#d9670a"/></linearGradient></defs>
<rect width="256" height="256" fill="url(#bg)"/>
<rect x="10" y="10" width="236" height="236" rx="34" fill="none" stroke="url(#gold)" stroke-width="5" opacity=".85"/>
<path d="M214 22c1.6 6 4 8.6 9.6 10-5.6 1.4-8 4-9.6 10-1.6-6-4-8.6-9.6-10 5.6-1.4 8-4 9.6-10z" fill="#ffe36b" stroke="#d7318f" stroke-width="2.2" stroke-linejoin="round"/>
<g transform="translate(38 38) scale(7.5)" fill="none" stroke="#010718" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round" opacity=".7">${glyph}</g>
<g transform="translate(38 38) scale(7.5)" fill="none" stroke="url(#glyph)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
</svg>`;
for (const [id, glyph] of Object.entries(G)) {
    // Named as Steamworks' bulk upload links them: <API name>_ACHIEVED.png and _UNACHIEVED.png.
    fs.writeFileSync(id + '.svg', svg(glyph));
    execFileSync('rsvg-convert', ['-w', '256', '-h', '256', id + '.svg', '-o', id + '_ACHIEVED.png']);
    execFileSync('magick', [id + '_ACHIEVED.png', '-colorspace', 'Gray', '-brightness-contrast', '-25x-20', id + '_UNACHIEVED.png']);
    fs.rmSync(id + '.svg');
}
console.log('made', Object.keys(G).length * 2);
