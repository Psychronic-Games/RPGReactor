'use strict';
// The game's own screenshot viewer (Scene_Custom, over Graphics/Screenshots): its scene.
module.exports = {
    key: 'screenshotViewer', detect: /class Scene_Custom < Scene_Base[\s\S]*Graphics\/Screenshots/, plugin: 'RR_ScreenshotViewer',
    classes: { Scene_Custom: 'Scene_RRScreenshots' }
};
