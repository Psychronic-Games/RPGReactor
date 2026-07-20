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
            fs.renameSync(tmpPath, filePath);
            fsyncDirectory(fs, path.dirname(filePath), constants);
        } catch (error) {
            if (fd !== null) {
                try { fs.closeSync(fd); } catch (closeError) { /* ignore */ }
            }
            try { fs.unlinkSync(tmpPath); } catch (cleanupError) { /* ignore */ }
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
