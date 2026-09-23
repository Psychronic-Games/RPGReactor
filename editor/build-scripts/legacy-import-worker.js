/**
 * Legacy import worker — runs LegacyImporter.importProject in a
 * worker_threads Worker so the editor stays responsive while a project's
 * pictures and audio are copied. Posts { type: 'log', message, level } lines,
 * { type: 'progress', fraction, status } updates and one
 * { type: 'done', success, summary | error }.
 *
 * workerData: { source, destination, options }
 */
'use strict';
const path = require('node:path');
const { workerData, parentPort } = require('worker_threads');

// NW.js gives a worker thread no TextDecoder global (plain Node does, which is
// why the CLI never saw this). The reader and font modules quietly fall back
// without one and the importer throws, so the menu import failed at once.
if (typeof TextDecoder === 'undefined') globalThis.TextDecoder = require('node:util').TextDecoder;

(async function run() {
    try {
        const I = require(path.join(__dirname, '..', 'src', 'legacy', 'LegacyImporter.js'));
        const media = require(path.join(__dirname, '..', 'src', 'legacy', 'LegacyMedia.js'));
        const { source, destination, options } = workerData;
        const log = (message, level) => parentPort.postMessage({ type: 'log', message: String(message), level: level || 'info' });
        const progress = (fraction, status) => parentPort.postMessage({ type: 'progress', fraction, status: String(status || '') });
        const summary = I.importProject(source, destination, Object.assign({}, options, { log, progress }));
        // Movies the old engine played that Chromium cannot become WebM, after the project is written.
        if (summary && summary.destination && media.pendingMovies(summary.destination).length) {
            summary.movies = await media.convertMovies(summary.destination, { log, progress });
        }
        parentPort.postMessage({ type: 'done', success: true, summary });
    } catch (error) {
        parentPort.postMessage({ type: 'done', success: false, error: error && error.message ? error.message : String(error) });
    }
})();
