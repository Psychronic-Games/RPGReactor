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

    // Windows will not rename over — or away from — a file while another
    // process holds a handle to it without delete sharing, and a Dropbox or
    // OneDrive client, an antivirus scanner and the search indexer all open a
    // file the instant it appears or changes. Both ends of this rename invite
    // that: the temp file is brand new, and the destination was just modified.
    // MoveFileEx then fails with EPERM/EACCES/EBUSY although the write itself
    // is complete and correct on disk. Those handles are released in
    // milliseconds, so the rename only has to be asked for again.
    const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
    const RENAME_RETRY_BUDGET_MS = 2000;
    const RENAME_RETRY_MAX_DELAY_MS = 64;
    const UNLINK_RETRY_BUDGET_MS = 250;

    function renameWithRetry(fs, tmpPath, filePath) {
        const deadline = Date.now() + RENAME_RETRY_BUDGET_MS;
        let delay = 1;
        let retried = false;
        for (;;) {
            try {
                fs.renameSync(tmpPath, filePath);
                return;
            } catch (error) {
                if (!RENAME_RETRY_CODES.has(error?.code) || Date.now() >= deadline) {
                    // A lock that outlives the budget is a different problem
                    // from a passing scan — say so, because the raw errno
                    // reads like a permissions bug in the editor.
                    if (retried && error?.code && typeof error.message === 'string') {
                        error.message += ' (the file stayed locked by another program for '
                            + `${RENAME_RETRY_BUDGET_MS}ms — a file sync client, antivirus scanner or `
                            + 'open editor is most likely holding it)';
                    }
                    throw error;
                }
                retried = true;
                sleepSync(delay);
                delay = Math.min(delay * 2, RENAME_RETRY_MAX_DELAY_MS);
            }
        }
    }

    function unlinkWithRetry(fs, tmpPath) {
        const deadline = Date.now() + UNLINK_RETRY_BUDGET_MS;
        let delay = 1;
        for (;;) {
            try {
                fs.unlinkSync(tmpPath);
                return;
            } catch (error) {
                if (error?.code === 'ENOENT') return;
                if (!RENAME_RETRY_CODES.has(error?.code) || Date.now() >= deadline) return;
                sleepSync(delay);
                delay = Math.min(delay * 2, RENAME_RETRY_MAX_DELAY_MS);
            }
        }
    }

    // The whole write is synchronous, so the wait has to be too. Chrome
    // forbids Atomics.wait on a renderer's main thread — which is exactly
    // where the editor calls this from — so spinning is the fallback, not
    // the exception.
    function sleepSync(milliseconds) {
        try {
            if (typeof SharedArrayBuffer === 'function' && typeof Atomics === 'object') {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
                return;
            }
        } catch (error) {
            // Not permitted on this thread; fall through to the spin.
        }
        const until = Date.now() + milliseconds;
        while (Date.now() < until) { /* spin */ }
    }

    function writeFileAtomicSync(fs, filePath, data, options) {
        // Browser project storage already replaces a complete IndexedDB record.
        if (typeof fs.writeFileAtomicSync === 'function') return fs.writeFileAtomicSync(filePath, data, options);
        const crypto = require('crypto');
        const path = require('path');
        const constants = fs.constants || {};
        let mode = typeof options === 'object' && options?.mode !== undefined ? options.mode : 0o666;
        try {
            if (fs.lstatSync) mode = fs.lstatSync(filePath).mode & 0o777;
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }

        let tmpPath;
        let fd = null;
        for (let attempt = 0; attempt < 10; attempt++) {
            tmpPath = `${filePath}.tmp-rr-${process.pid}-${crypto.randomBytes(12).toString('hex')}`;
            try {
                const flags = constants.O_WRONLY !== undefined
                    ? constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0)
                    : 'wx';
                fd = fs.openSync(tmpPath, flags, mode);
                break;
            } catch (error) {
                if (error?.code !== 'EEXIST' || attempt === 9) throw error;
            }
        }

        try {
            fs.writeFileSync(fd, data, options);
            if (fs.fsyncSync) fs.fsyncSync(fd);
            fs.closeSync(fd);
            fd = null;
            renameWithRetry(fs, tmpPath, filePath);
            fsyncDirectory(fs, path.dirname(filePath), constants);
        } catch (error) {
            if (fd !== null) {
                try { fs.closeSync(fd); } catch (closeError) { /* ignore */ }
            }
            // The same held handle that can fail the rename can fail this
            // unlink, and an abandoned temp file sits in the user's project
            // folder for a sync client to upload. Give the scan a moment to
            // let go rather than leaving litter behind.
            unlinkWithRetry(fs, tmpPath);
            throw error;
        }
    }

    function fsyncDirectory(fs, directoryPath, constants) {
        if (!fs.fsyncSync || !fs.openSync) return;
        let fd = null;
        try {
            const flags = constants.O_RDONLY !== undefined
                ? constants.O_RDONLY | (constants.O_DIRECTORY || 0) | (constants.O_NOFOLLOW || 0)
                : 'r';
            fd = fs.openSync(directoryPath, flags);
            fs.fsyncSync(fd);
        } catch (error) {
            // Some supported platforms/filesystems do not permit syncing a directory.
        } finally {
            if (fd !== null) {
                try { fs.closeSync(fd); } catch (closeError) { /* ignore */ }
            }
        }
    }

    if (typeof window !== 'undefined') {
        window.RRWriteFileAtomicSync = writeFileAtomicSync;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = writeFileAtomicSync;
    }
})();
