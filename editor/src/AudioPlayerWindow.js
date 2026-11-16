/** The Audio Player beside the map and the other editor windows: dragged, sized, pinned and remembered as they are. */
(function(root) {
    'use strict';
    const Detached = root.RRDetachedWindow || (typeof require === 'function' ? require('./utils/DetachedWindow.js') : null);
    const api = Detached.create({
        overlayId: 'audio-player-modal',
        panelSelector: '.rr-audio-window',
        headerSelector: '.modal-header',
        titleSelector: '.modal-header h2',
        title: 'Audio Player',
        page: 'audio-player-panel.html',
        storageKey: 'rr-audio-player-window',
        popoutKey: 'rr-audio-player-popout',
        minWidth: 480,
        minHeight: 520,
        defaultWidth: 900,
        defaultHeight: 820,
        floatingClass: 'rr-audio-floating',
        poppedClass: 'rr-audio-popped',
        gripClass: 'rr-audio-grip',
        dockedEvent: 'rr-audio-player-docked',
        isOpen: overlay => overlay.style.display !== 'none' && overlay.style.display !== '',
        closeFromFrame() { root.reactor?.audioPlayer?.hideAudioPlayer(); }
    });
    root.RRAudioPlayerWindow = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
