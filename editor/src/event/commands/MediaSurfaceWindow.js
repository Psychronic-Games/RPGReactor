/**
 * The map's Media Surface editor (MediaSurfaceEditor, live on the map) as a window of its own, as the Forge, the
 * Database, the Event Editor and the Audio Player are (utils/DetachedWindow.js): dragged by its header, sized from
 * its corner, pinned, minimized or made to fill its monitor, on any monitor, its place remembered. The first time
 * it stands at the editor's right edge, the map in view beside it (owner, 2026-11-22: it floated with its own drag
 * and a pop-out button).
 */
(function(root) {
    'use strict';
    const Detached = root.RRDetachedWindow || (typeof require === 'function' ? require('../../utils/DetachedWindow.js') : null);
    const api = Detached.create({
        overlayId: 'media-surface-editor-modal',
        panelSelector: '.video-surface-editor',
        headerSelector: '.rr-modal-header',
        titleSelector: '.rr-modal-title',
        title: 'Map Media Surface',
        page: 'media-surface-panel.html',
        storageKey: 'rr-media-surface-window',
        popoutKey: 'rr-media-surface-popout',
        minWidth: 360,
        minHeight: 420,
        floatingClass: 'rr-ms-floating',
        poppedClass: 'rr-ms-popped',
        gripClass: 'rr-ms-grip',
        dockedEvent: 'rr-media-surface-docked',
        // Beside the map, not over its middle: the editor's right edge, as tall as the editor allows.
        defaultRect: view => {
            const width = Math.min(460, Math.round(view.width * 0.4)), height = Math.max(420, Math.round(view.height - 120));
            return { left: (view.left || 0) + view.width - width - 16, top: (view.top || 0) + 80, width, height: Math.min(height, view.height) };
        },
        isOpen: overlay => overlay.style.display !== 'none' && overlay.style.display !== '',
        // Closed by Alt+F4 or the taskbar: as its × does (the edit is cancelled).
        closeFromFrame() { root.MediaSurfaceEditor?.liveEditor?.cancelLive?.(); }
    });
    root.RRMediaSurfaceWindow = api;
    // Its own window destroyed under it (a crash, not its ×): what was being edited is dropped, as its × would.
    if (typeof root.addEventListener === 'function') root.addEventListener('rr-media-surface-docked', () => root.MediaSurfaceEditor?.liveEditor?.cancelLive?.());
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
