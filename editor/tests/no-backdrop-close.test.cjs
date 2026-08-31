const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const srcRoot = path.resolve(__dirname, '..', 'src');

/**
 * A click on a dialog's backdrop must never close it: an accidental click
 * beside the event editor cost a whole page of in-progress work. The only
 * dialogs allowed to keep the gesture are the stateless confirm/alert boxes
 * in UIManager, where there is nothing to lose.
 */
test('no dialog closes from a click on its backdrop', () => {
    const offenders = [];
    const allowed = [/finish\('cancel'\)/, /finish\(!cancelLabel\)/, /close\(\);/];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(p); continue; }
            if (!entry.name.endsWith('.js')) continue;
            const source = fs.readFileSync(p, 'utf8');
            const pattern = /if \(e(?:vent)?\.target === (?:this\.)?(?:modal|overlay|modalOverlay)\)[^\n]*/g;
            let match;
            while ((match = pattern.exec(source))) {
                const relative = path.relative(srcRoot, p);
                const isUIManagerConfirm = relative === 'UIManager.js'
                    && allowed.some(ok => ok.test(match[0]));
                // Exiting an in-canvas editing mode by clicking off the
                // surface is a tool gesture, not a dialog dismissal.
                const isCanvasTool = relative.endsWith('VideoSurfaceEditor.js') && /cancelEdit\(\)/.test(match[0]);
                if (!isUIManagerConfirm && !isCanvasTool) offenders.push(`${relative}: ${match[0].trim()}`);
            }
        }
    };
    walk(srcRoot);
    assert.deepEqual(offenders, [], 'backdrop-close crept back in');
});
