// RPG Reactor - atomic file writes for project data.
//
// Every critical project file (project.rpgreactor, MapInfos.json,
// Map###.json, System.json, database JSON, plugin manifests) used to be
// written with a plain truncate-in-place writeFileSync: a crash, kill, or
// full disk mid-write destroyed the previous good file along with the new
// one. Write to a sibling temp file and rename over the destination —
// rename is atomic on the same filesystem, so the destination always holds
// either the old or the new complete contents.
(function() {
    'use strict';

    function writeFileAtomicSync(fs, filePath, data, options) {
        const tmpPath = filePath + '.tmp-rr-' + process.pid;
        fs.writeFileSync(tmpPath, data, options);
        try {
            fs.renameSync(tmpPath, filePath);
        } catch (e) {
            // Clean the temp file up on failure so retries don't collide,
            // then surface the original error to the caller's handler.
            try { fs.unlinkSync(tmpPath); } catch (cleanupError) { /* ignore */ }
            throw e;
        }
    }

    if (typeof window !== 'undefined') {
        window.RRWriteFileAtomicSync = writeFileAtomicSync;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = writeFileAtomicSync;
    }
})();
