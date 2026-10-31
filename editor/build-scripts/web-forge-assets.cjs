'use strict';
const fs = require('node:fs');
const path = require('node:path');

// The editor bundle contains page scripts, not the data fetched at runtime or
// the separate classic worker's imports. These are editor assets, independent
// of the starter project's unused-file analysis and archive packing.
function copyWebForgeAssets(stageRoot, webRoot, runtimeRoot = path.join(stageRoot, 'runtime')) {
    const base = 'src/forge/Character3D';
    for (const entry of fs.readdirSync(path.join(stageRoot, base), { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
        const relative = path.join(base, entry.name);
        fs.mkdirSync(path.dirname(path.join(webRoot, relative)), { recursive: true });
        fs.copyFileSync(path.join(stageRoot, relative), path.join(webRoot, relative));
    }
    fs.cpSync(path.join(stageRoot, base, 'data'), path.join(webRoot, base, 'data'), { recursive: true });
    fs.mkdirSync(path.join(webRoot, 'runtime'), { recursive: true });
    fs.copyFileSync(path.join(runtimeRoot, 'reactor_3d_motions.js'), path.join(webRoot, 'runtime/reactor_3d_motions.js'));
    fs.copyFileSync(path.join(runtimeRoot, 'reactor_3d_motions.bin'), path.join(webRoot, base, 'data/reactor_3d_motions.bin'));
    for (const relative of ['src/utils/QuadricDecimator.js', 'src/forge/Props/PropPaint.js']) {
        fs.mkdirSync(path.dirname(path.join(webRoot, relative)), { recursive: true });
        fs.copyFileSync(path.join(stageRoot, relative), path.join(webRoot, relative));
    }
}
module.exports = { copyWebForgeAssets };
