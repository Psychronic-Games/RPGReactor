/**
 * Show Balloon Icon's character preview logged a failed image load through an
 * undeclared `imagePath`, so the error handler itself threw a ReferenceError.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('the balloon preview names the image it failed to load with a variable it has', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'event', 'commands', 'ShowBalloonIconEditor.js'), 'utf8');
    assert.doesNotMatch(source, /\bimagePath\b/);
    assert.match(source, /characterImage\.onerror = \(\) => \{\s*console\.error\('Failed to load character image:', characterImage\.src\);/);
});
