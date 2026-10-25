#!/usr/bin/env node
/**
 * Import an RPG Maker 2000/2003 project into a new RPG Reactor project.
 *
 *   node editor/build-scripts/import-legacy-project.cjs <source> --report [--json <file>] [--encoding <codepage>]
 *   node editor/build-scripts/import-legacy-project.cjs <source> <destination> [--maps 1,2,3] [--skip-assets] [--force] [--encoding <codepage>] [--language <name>]
 *
 * `--rtp <folder or file>` names RPG Maker 2000/2003's RTP when a game takes files from it and it is not
 * where the installer puts it: a folder, a folder holding one or its installer, or an installer or archive
 * (.exe, .zip, .rar), which is unpacked into the user's RTP folder (RPG2K_RTP_PATH / RPG2K3_RTP_PATH work too).
 * `--download-rtp` fetches RPG Maker's official RTP (unpacked into the user's RTP folder, not
 * installed) when a 2000/2003 game needs one and none is found.
 * `--font <file or folder>` names RM2000.fon / RMG2000.fon when neither the game, the RTP
 * nor the system fonts hold it.
 * `--graphics remaster|original` selects restored or untouched artwork for 2000/2003.
 * Restoration is the default; originals are retained in the new project's legacy folder.
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
const valueFlags = new Set(['--json', '--encoding', '--maps', '--language', '--rtp', '--font', '--graphics']);
const positional = [];
for (let i = 0; i < argv.length; i++) {
    if (valueFlags.has(argv[i])) {
        if (argv[i + 1] && !argv[i + 1].startsWith('--')) i++;
    } else if (!argv[i].startsWith('--')) positional.push(argv[i]);
}
const [source, destination] = positional;
if (!source || (!flag('--report') && !destination)) {
    console.error('usage: import-legacy-project.cjs <source> --report [--json <file>] [--encoding <codepage>]\n       import-legacy-project.cjs <source> <destination> [--maps 1,2,3] [--skip-assets] [--force] [--encoding <codepage>] [--language <name>] [--rtp <folder> | --download-rtp] [--font <RM2000.fon or folder>] [--graphics remaster|original]');
    process.exit(2);
}
const encoding = flag('--encoding') && flag('--encoding') !== true ? flag('--encoding') : undefined;
const graphics = flag('--graphics') || 'remaster';
if (!['remaster', 'original'].includes(graphics)) {
    console.error('--graphics must be remaster or original');
    process.exit(2);
}
(async () => { try {
    if (flag('--report')) {
        const report = I.report(source, { encoding });
        if (flag('--json') && flag('--json') !== true) fs.writeFileSync(flag('--json'), JSON.stringify(report, null, 2));
        if (report.database && report.scripts) console.log(JSON.stringify(report, null, 2));   // an RGSS game's inventory
        else I.printReport(report);
        if (!destination) process.exit(0);
    }
    const maps = flag('--maps') && flag('--maps') !== true ? String(flag('--maps')).split(',').map(Number) : null;
    const language = flag('--language') && flag('--language') !== true ? flag('--language') : undefined;
    let rtpPath = flag('--rtp') && flag('--rtp') !== true ? flag('--rtp') : undefined;
    // --rtp takes an RTP folder, a folder holding one or its installer, or an installer or archive (.exe, .zip, .rar).
    if (rtpPath) {
        const RM = require('../src/legacy/RtpManager.js');
        if (!fs.statSync(rtpPath).isDirectory() || !RM.findRtpFolder(rtpPath, 0)) {
            rtpPath = await RM.rtpFrom(rtpPath);
            console.log(`RTP: ${rtpPath}`);
        }
    }
    // --download-rtp: a 2000/2003 game that needs the RTP and finds none gets RPG Maker's official one, unpacked, not installed.
    if (flag('--download-rtp') && !rtpPath) {
        const probed = I.probe(source);
        if ((probed.kind === '2000' || probed.kind === '2003') && probed.needsRtp && !I.findRtp(probed.engine, { source })) {
            console.log(`Downloading the official ${probed.kind} RTP…`);
            rtpPath = await require('../src/legacy/RtpManager.js').fetchOfficial(probed.engine);
            console.log(`  unpacked into ${rtpPath}`);
        }
    }
    const fontPath = flag('--font') && flag('--font') !== true ? flag('--font') : undefined;
    const summary = await I.importProject(source, destination, { maps, skipAssets: !!flag('--skip-assets'), force: !!flag('--force'), encoding, language, graphics, rtpPath, fontPath, log: (line) => console.log(line) });
    // Movies Chromium cannot play become WebM and MIDI becomes Ogg once the project is written.
    const media = require('../src/legacy/LegacyMedia.js');
    if (summary && summary.destination && media.pendingMedia(summary.destination)) {
        media.convertMedia(summary.destination, { log: (line) => console.log(line) }).catch(error => { console.error(error.message); process.exitCode = 1; });
    }
} catch (error) {
    console.error(error.message);
    process.exit(1);
} })();
