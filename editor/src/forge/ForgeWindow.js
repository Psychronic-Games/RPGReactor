/** The Forge beside the map and Database, with the same remembered, resizable window. */
(function(root) {
    'use strict';
    const Detached = root.RRDetachedWindow || (typeof require === 'function' ? require('../utils/DetachedWindow.js') : null);
    const api = Detached.create({
        overlayId: 'forge-workspace',
        panelSelector: '.rr-forge-window',
        headerSelector: '.rr-modal-header',
        titleSelector: '.rr-modal-title',
        title: 'Forge',
        page: 'forge-panel.html',
        storageKey: 'rr-forge-window-2',
        popoutKey: 'rr-forge-popout-2',
        minWidth: 900,
        minHeight: 560,
        defaultWidth: 1920,
        defaultHeight: 1080,
        sizeToScreen: true,
        floatingClass: 'rr-forge-floating',
        poppedClass: 'rr-forge-popped',
        gripClass: 'rr-forge-grip',
        dockedEvent: 'rr-forge-docked',
        isOpen: overlay => overlay.style.display !== 'none' && overlay.style.display !== '',
        closeFromFrame() { return root.reactor?.forgeManager?.requestClose(); }
    });
    root.RRForgeWindow = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
