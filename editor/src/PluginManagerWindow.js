/** Plugin settings beside the map and the other persistent editor workspaces. */
(function(root) {
    'use strict';
    const Detached = root.RRDetachedWindow || (typeof require === 'function' ? require('./utils/DetachedWindow.js') : null);
    const api = Detached.create({
        overlayId: 'plugin-manager-modal',
        panelSelector: '.rr-plugin-window',
        headerSelector: '.rr-plugin-header',
        titleSelector: '.rr-plugin-title',
        title: 'Plugin Manager',
        page: 'plugin-manager-panel.html',
        storageKey: 'rr-plugin-manager-window',
        popoutKey: 'rr-plugin-manager-popout',
        minWidth: 800,
        minHeight: 480,
        defaultWidth: 1440,
        defaultHeight: 1000,
        sizeToScreen: true,
        floatingClass: 'rr-plugin-floating',
        poppedClass: 'rr-plugin-popped',
        gripClass: 'rr-plugin-grip',
        dockedEvent: 'rr-plugin-manager-docked',
        isOpen: overlay => overlay.style.display !== 'none' && overlay.style.display !== '',
        closeFromFrame() { root.reactor?.pluginManager?.hide(); }
    });
    root.RRPluginManagerWindow = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
