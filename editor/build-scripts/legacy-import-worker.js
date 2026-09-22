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

(function run() {
    try {
        const I = require(path.join(__dirname, '..', 'src', 'legacy', 'LegacyImporter.js'));
        const { source, destination, options } = workerData;
        const summary = I.importProject(source, destination, Object.assign({}, options, {
            log: (message, level) => parentPort.postMessage({ type: 'log', message: String(message), level: level || 'info' }),
            progress: (fraction, status) => parentPort.postMessage({ type: 'progress', fraction, status: String(status || '') })
        }));
        parentPort.postMessage({ type: 'done', success: true, summary });
    } catch (error) {
        parentPort.postMessage({ type: 'done', success: false, error: error && error.message ? error.message : String(error) });
    }
})();
