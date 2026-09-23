#!/usr/bin/env node
/**
 * Import an RPG Maker 2000/2003 project into a new RPG Reactor project.
 *
 *   node editor/build-scripts/import-legacy-project.cjs <source> --report [--json <file>] [--encoding <codepage>]
 *   node editor/build-scripts/import-legacy-project.cjs <source> <destination> [--maps 1,2,3] [--skip-assets] [--force] [--encoding <codepage>] [--language <name>]
 *
 * `--report` says what the project holds and what an import will do with
 * it, and writes nothing unless `--json` names a file. With a destination
 * a new Reactor project is written there (the editor's File › Import
 * Project… runs the same importer). See docs/IMPORTING-LEGACY-PROJECTS.md.
 */
const fs = require('node:fs');
const path = require('node:path');
const I = require(path.join(__dirname, '..', 'src', 'legacy', 'LegacyImporter.js'));

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] || true) : null; };
const flagValues = new Set(['--json', '--encoding', '--maps', '--language'].map(flag).filter(v => v && v !== true));
const positional = argv.filter(a => !a.startsWith('--') && !flagValues.has(a));
const [source, destination] = positional;
if (!source || (!flag('--report') && !destination)) {
    console.error('usage: import-legacy-project.cjs <source> --report [--json <file>] [--encoding <codepage>]\n       import-legacy-project.cjs <source> <destination> [--maps 1,2,3] [--skip-assets] [--force] [--encoding <codepage>] [--language <name>]');
    process.exit(2);
}
const encoding = flag('--encoding') && flag('--encoding') !== true ? flag('--encoding') : undefined;
try {
    if (flag('--report')) {
        const report = I.report(source, { encoding });
        if (flag('--json') && flag('--json') !== true) fs.writeFileSync(flag('--json'), JSON.stringify(report, null, 2));
        if (report.database && report.scripts) console.log(JSON.stringify(report, null, 2));   // an RGSS game's inventory
        else I.printReport(report);
        if (!destination) process.exit(0);
    }
    const maps = flag('--maps') && flag('--maps') !== true ? String(flag('--maps')).split(',').map(Number) : null;
    const language = flag('--language') && flag('--language') !== true ? flag('--language') : undefined;
    const summary = I.importProject(source, destination, { maps, skipAssets: !!flag('--skip-assets'), force: !!flag('--force'), encoding, language, log: (line) => console.log(line) });
    // Movies Chromium cannot play become WebM and MIDI becomes Ogg once the project is written.
    const media = require('../src/legacy/LegacyMedia.js');
    if (summary && summary.destination && media.pendingMedia(summary.destination)) {
        media.convertMedia(summary.destination, { log: (line) => console.log(line) }).catch(error => { console.error(error.message); process.exitCode = 1; });
    }
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
