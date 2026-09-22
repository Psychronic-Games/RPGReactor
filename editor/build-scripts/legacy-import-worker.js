/**
 * Legacy import worker — runs LegacyImporter.importProject in a
 * worker_threads Worker so the editor stays responsive while a project's
 * pictures and audio are copied. Posts { type: 'log', message } lines and
 * one { type: 'done', success, summary | error }.
 *
 * workerData: { source, destination, options }
 */
'use strict';
const path = require('node:path');
const { workerData, parentPort } = require('worker_threads');

(function run() {
    try {
        const I = require(path.join(__dirname, '..', 'src', 'legacy', 'LegacyImporter.js'));
        const { source, destination, options } = workerData;
        const summary = I.importProject(source, destination, Object.assign({}, options, {
            log: (message) => parentPort.postMessage({ type: 'log', message: String(message) })
        }));
        parentPort.postMessage({ type: 'done', success: true, summary });
    } catch (error) {
        parentPort.postMessage({ type: 'done', success: false, error: error && error.message ? error.message : String(error) });
    }
})();
