/**
 * The event editor as a window of its own beside the map (see utils/DetachedWindow.js): it keeps
 * its place between events, and between events its window hides and waits for the next one.
 *
 *   RREventEditorWindow.install(overlay)   once, on the #event-editor-modal overlay
 *   RREventEditorWindow.open(overlay)      as an event opens: its window shows, made the first time
 *   RREventEditorWindow.isOpen()           the editor is showing
 *   RREventEditorWindow.ownsKeys()         open, and the last click or focus landed in it
 */
(function(root) {
    'use strict';
    const Detached = root.RRDetachedWindow || (typeof require === 'function' ? require('../utils/DetachedWindow.js') : null);

    const api = Detached.create({
        overlayId: 'event-editor-modal',
        panelSelector: '.rr-modal',
        headerSelector: '.rr-modal-header',
        titleSelector: '.rr-modal-title',
        title: 'Event Editor',
        page: 'event-editor-panel.html',
        storageKey: 'rr-event-editor-window',
        popoutKey: 'rr-event-editor-popout',
        minWidth: 860,
        minHeight: 480,
        floatingClass: 'rr-event-editor-floating',
        poppedClass: 'rr-event-editor-popped',
        gripClass: 'rr-event-editor-grip',
        dockedEvent: 'rr-event-editor-docked',
        isOpen: overlay => overlay.style.display !== 'none' && overlay.style.display !== '',
        // Closed by Alt+F4 or the taskbar: as Cancel does, asking first about unapplied edits.
        async closeFromFrame() {
            const editor = root.reactor && root.reactor.eventManager && root.reactor.eventManager.eventEditor;
            if (editor && editor.requestClose) await editor.requestClose();
        }
    });

    root.RREventEditorWindow = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
