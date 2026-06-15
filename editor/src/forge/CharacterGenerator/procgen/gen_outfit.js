#!/usr/bin/env node
// CLI front-end for the outfit engine. Loads the body template, runs every
// config in outfit_configs.js through the engine, and writes part .js files.
//
//   node gen_outfit.js                 # uses outfit_configs.js
//   node gen_outfit.js my_configs.js   # uses a custom config module
//
// All the actual generation logic lives in outfit_engine.js (shared with the
// in-editor live preview). This file is just Node I/O.

const fs = require('fs');
const path = require('path');
const engine = require('./outfit_engine.js');

const STYLES_DIR = path.resolve(__dirname, '..', 'styles', 'looseleaf', 'parts');
const BODY_PATH  = path.join(STYLES_DIR, 'body', 'male', 'body-looseleaf-looseleaf-male-body-01.js');
const OUT_DIR    = path.join(STYLES_DIR, 'full outfits');
const CONFIG_PATH = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'outfit_configs.js');

function loadBody() {
    const RR_CHARACTER_REGISTRY = [];
    const win = {};
    (new Function('RR_CHARACTER_REGISTRY', 'window', fs.readFileSync(BODY_PATH, 'utf8')))(RR_CHARACTER_REGISTRY, win);
    return RR_CHARACTER_REGISTRY[0].template;
}

function emitPartJs(partId, config, result) {
    const palLines = Object.entries(result.palette)
        .map(([letter, slot]) => `        ${JSON.stringify(letter)}: { hex: ${JSON.stringify(slot.hex)}, material: ${JSON.stringify(slot.material || '')} }`)
        .join(',\n');
    const dirNames = ['Front', 'Left', 'Right', 'Back'];
    const sheetLines = result.sheet.map((dir, di) =>
        `        // ${dirNames[di]}\n        [\n` +
        dir.map((frame, fi) =>
            `            // Frame ${fi}\n            [\n` +
            frame.map(r => `                ${JSON.stringify(r.padEnd(144, ' '))}`).join(',\n') +
            `\n            ]`
        ).join(',\n') +
        `\n        ]`
    ).join(',\n');
    return `// Procedurally generated outfit "${config.name}".
// Source: outfit_configs.js · engine: outfit_engine.js · spec: analysis/PATTERN_LANGUAGE.md
RR_CHARACTER_REGISTRY.push({
    id: ${JSON.stringify(partId)},
    category: ${JSON.stringify(config.category)},
    name: ${JSON.stringify(config.name)},
    tags: ${JSON.stringify(config.tags)},
    params: [],
    template: {
        palette: {
${palLines}
        },
        sheet: [
${sheetLines}
        ]
    },
    draw(buf, W, H, direction, frame, params) {
        RR_CG_drawTemplatePart(buf, W, H, direction, frame, params, this);
    }
});
`;
}

function main() {
    const configs = require(path.resolve(CONFIG_PATH));
    const body = loadBody();
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const [id, config] of Object.entries(configs)) {
        const partId = `full-outfits-looseleaf-${id}`;
        const result = engine.generateOutfit(config, body);
        const js = emitPartJs(partId, config, result);
        fs.writeFileSync(path.join(OUT_DIR, `${partId}.js`), js, 'utf8');
        console.log('Wrote', partId, '· palette letters:', Object.keys(result.palette).length, '· skin:', result.skin.join(''));
    }
}

main();
